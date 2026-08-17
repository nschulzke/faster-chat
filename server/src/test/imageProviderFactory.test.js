import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { generateImageForProvider } from "../lib/imageProviderFactory.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("generateImageForProvider (openrouter)", () => {
  let originalFetch;
  let sentBody;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    sentBody = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockCompletion(message) {
    globalThis.fetch = async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
  }

  function mockImageResponse() {
    mockCompletion({
      role: "assistant",
      images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG_BASE64}` } }],
    });
  }

  test("handles images[] entries shaped as image_url blocks", async () => {
    mockCompletion({
      role: "assistant",
      content: "",
      images: [
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${PNG_BASE64}` },
        },
      ],
    });

    const result = await generateImageForProvider("openrouter", "key", {
      prompt: "Dog riding a bicycle",
      model: "google/gemini-2.5-flash-image",
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.buffer).toEqual(Buffer.from(PNG_BASE64, "base64"));
  });

  test("handles images[] entries carrying a plain url", async () => {
    mockCompletion({
      role: "assistant",
      images: [{ url: `data:image/webp;base64,${PNG_BASE64}` }],
    });

    const result = await generateImageForProvider("openrouter", "key", {
      prompt: "Dog riding a bicycle",
      model: "google/gemini-2.5-flash-image",
    });

    expect(result.mimeType).toBe("image/webp");
    expect(result.buffer).toEqual(Buffer.from(PNG_BASE64, "base64"));
  });

  test("sends prior conversation turns ahead of the prompt", async () => {
    mockImageResponse();

    await generateImageForProvider("openrouter", "key", {
      prompt: "Same image composition, but cartoon style",
      model: "google/gemini-2.5-flash-image",
      history: [
        { role: "user", content: "[Image Generation] Dog riding a bicycle" },
        { role: "assistant", content: 'Generated image: "Dog riding a bicycle"' },
      ],
      referenceImages: [],
    });

    expect(sentBody.messages.slice(0, 2)).toEqual([
      { role: "user", content: "[Image Generation] Dog riding a bicycle" },
      { role: "assistant", content: 'Generated image: "Dog riding a bicycle"' },
    ]);
    expect(sentBody.messages.at(-1)).toEqual({
      role: "user",
      content: [{ type: "text", text: "Same image composition, but cartoon style" }],
    });
  });

  test("attaches reference images to the final user turn", async () => {
    mockImageResponse();
    const reference = `data:image/png;base64,${PNG_BASE64}`;

    await generateImageForProvider("openrouter", "key", {
      prompt: "Same image composition, but cartoon style",
      model: "google/gemini-2.5-flash-image",
      history: [{ role: "user", content: "[Image Generation] Dog riding a bicycle" }],
      referenceImages: [reference],
    });

    expect(sentBody.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: reference } },
        { type: "text", text: "Same image composition, but cartoon style" },
      ],
    });
  });

  test("omits empty history turns", async () => {
    mockImageResponse();

    await generateImageForProvider("openrouter", "key", {
      prompt: "Dog riding a bicycle",
      model: "google/gemini-2.5-flash-image",
      history: [{ role: "assistant", content: "  " }],
      referenceImages: [],
    });

    expect(sentBody.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Dog riding a bicycle" }] },
    ]);
  });

  test("handles images[] entries with b64_json", async () => {
    mockCompletion({
      role: "assistant",
      images: [{ b64_json: PNG_BASE64, content_type: "image/png" }],
    });

    const result = await generateImageForProvider("openrouter", "key", {
      prompt: "Dog riding a bicycle",
      model: "google/gemini-2.5-flash-image",
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.buffer).toEqual(Buffer.from(PNG_BASE64, "base64"));
  });
});
