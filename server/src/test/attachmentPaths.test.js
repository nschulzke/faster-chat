import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { IMAGE_GENERATION } from "@faster-chat/shared";
import { preflightAttachments } from "../lib/fileUtils.js";
import { createMultimodalContent } from "../lib/completion.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GENERATED_DIR = path.join(
  PROJECT_ROOT,
  "server/data/uploads",
  IMAGE_GENERATION.GENERATED_DIR
);

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64"
);

const STORED_FILENAME = "test-generated-attachment_generated.png";

// Mirrors what routes/images.js persists: the bytes live in the `generated`
// subdirectory, and the DB row records that path relative to the project root.
const generatedFile = {
  id: "test-generated-attachment",
  filename: "generated_1.png",
  stored_filename: STORED_FILENAME,
  path: path.join("server/data/uploads", IMAGE_GENERATION.GENERATED_DIR, STORED_FILENAME),
  mime_type: "image/png",
  size: PNG_BYTES.length,
  meta: { type: "generated" },
};

describe("generated image attachments", () => {
  beforeAll(async () => {
    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(path.join(GENERATED_DIR, STORED_FILENAME), PNG_BYTES);
  });

  afterAll(async () => {
    await rm(path.join(GENERATED_DIR, STORED_FILENAME), { force: true });
  });

  test("preflightAttachments reads them from their stored path", async () => {
    const result = await preflightAttachments({
      files: [{ ...generatedFile, meta: { type: "generated" } }],
      modelRecord: { supports_vision: 1 },
      providerName: "openrouter",
    });

    expect(result).toEqual({ ok: true });
  });

  test("createMultimodalContent inlines them as image parts", async () => {
    const filesById = new Map([[generatedFile.id, generatedFile]]);
    const content = await createMultimodalContent(
      { content: "Describe the second image?" },
      [generatedFile.id],
      filesById
    );

    const imagePart = content.find((part) => part.type === "image");
    expect(imagePart).toBeDefined();
    expect(imagePart.image).toBe(`data:image/png;base64,${PNG_BYTES.toString("base64")}`);
  });
});
