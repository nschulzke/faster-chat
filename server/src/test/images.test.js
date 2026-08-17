import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";

let generateImageForProviderImpl = async () => ({
  buffer: Buffer.from("image"),
  mimeType: "image/png",
});

const generateCalls = [];

const actualImageProviderFactory = { ...(await import("../lib/imageProviderFactory.js")) };

mock.module("../lib/imageProviderFactory.js", () => ({
  generateImageForProvider: (...args) => {
    generateCalls.push(args);
    return generateImageForProviderImpl(...args);
  },
}));

const { createTestApp, resetDatabase, seedAdminUser, makeRequest } = await import("./helpers.js");
const { dbUtils } = await import("../lib/db.js");
const { mkdir, writeFile, rm } = await import("fs/promises");
const path = (await import("path")).default;
const { fileURLToPath } = await import("url");
const { IMAGE_GENERATION } = await import("@faster-chat/shared");

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64"
);

const originalReplicateApiKey = process.env.REPLICATE_API_KEY;
const writtenFiles = [];

describe("image routes", () => {
  let app, adminCookie, adminUserId;

  beforeEach(async () => {
    resetDatabase();
    process.env.REPLICATE_API_KEY = "test-replicate-key";
    generateImageForProviderImpl = async () => ({
      buffer: Buffer.from("image"),
      mimeType: "image/png",
    });
    generateCalls.length = 0;

    app = createTestApp();
    const admin = await seedAdminUser(app);
    adminCookie = admin.cookie;
    adminUserId = admin.user.id;
  });

  afterAll(async () => {
    mock.module("../lib/imageProviderFactory.js", () => actualImageProviderFactory);
    await Promise.all(writtenFiles.map((file) => rm(file, { force: true })));

    if (originalReplicateApiKey === undefined) {
      delete process.env.REPLICATE_API_KEY;
    } else {
      process.env.REPLICATE_API_KEY = originalReplicateApiKey;
    }
  });

  test("POST /api/images/generate maps invalid provider tokens to 401", async () => {
    generateImageForProviderImpl = async () => {
      throw new Error("Invalid API token: test secret should not leak");
    };

    const res = await makeRequest(app, "POST", "/api/images/generate", {
      body: { prompt: "draw a cube" },
      cookie: adminCookie,
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid API key" });
  });

  test("POST /api/images/generate maps provider rate limits to 429", async () => {
    generateImageForProviderImpl = async () => {
      throw new Error("provider rate limit reached");
    };

    const res = await makeRequest(app, "POST", "/api/images/generate", {
      body: { prompt: "draw a cube" },
      cookie: adminCookie,
    });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Rate limit exceeded. Please try again later.",
    });
  });

  test("POST /api/images/generate forwards the chat's turns and images", async () => {
    const chatRes = await makeRequest(app, "POST", "/api/chats", {
      body: { title: "Image chat" },
      cookie: adminCookie,
    });
    const chatId = (await chatRes.json()).id;

    await makeRequest(app, "POST", `/api/chats/${chatId}/messages`, {
      body: { role: "user", content: "[Image Generation] Dog riding a bicycle" },
      cookie: adminCookie,
    });

    const fileId = crypto.randomUUID();
    const storedFilename = `${fileId}_generated.png`;
    const generatedDir = path.join(
      PROJECT_ROOT,
      "server/data/uploads",
      IMAGE_GENERATION.GENERATED_DIR
    );
    await mkdir(generatedDir, { recursive: true });
    await writeFile(path.join(generatedDir, storedFilename), PNG_BYTES);
    writtenFiles.push(path.join(generatedDir, storedFilename));
    dbUtils.createFile(
      fileId,
      adminUserId,
      "generated.png",
      storedFilename,
      path.join("server/data/uploads", IMAGE_GENERATION.GENERATED_DIR, storedFilename),
      "image/png",
      PNG_BYTES.length,
      null,
      { type: "generated" }
    );

    await makeRequest(app, "POST", `/api/chats/${chatId}/messages`, {
      body: {
        role: "assistant",
        content: 'Generated image: "Dog riding a bicycle"',
        fileIds: [fileId],
      },
      cookie: adminCookie,
    });

    const pendingRes = await makeRequest(app, "POST", `/api/chats/${chatId}/messages`, {
      body: {
        role: "user",
        content: "[Image Generation] Same image composition, but cartoon style",
      },
      cookie: adminCookie,
    });
    const pendingMessageId = (await pendingRes.json()).id;

    const res = await makeRequest(app, "POST", "/api/images/generate", {
      body: {
        prompt: "Same image composition, but cartoon style",
        chatId,
        excludeMessageId: pendingMessageId,
      },
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
    const options = generateCalls.at(-1)[2];
    expect(options.history).toEqual([
      { role: "user", content: "[Image Generation] Dog riding a bicycle" },
      { role: "assistant", content: 'Generated image: "Dog riding a bicycle"' },
    ]);
    expect(options.referenceImages).toEqual([
      `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
    ]);
  });

  test("POST /api/images/generate leaves unrelated provider errors generic", async () => {
    generateImageForProviderImpl = async () => {
      throw new Error("sensitive internal provider trace");
    };

    const originalConsoleError = console.error;
    console.error = () => {};
    let res;
    try {
      res = await makeRequest(app, "POST", "/api/images/generate", {
        body: { prompt: "draw a cube" },
        cookie: adminCookie,
      });
    } finally {
      console.error = originalConsoleError;
    }

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("sensitive internal provider trace");
  });
});
