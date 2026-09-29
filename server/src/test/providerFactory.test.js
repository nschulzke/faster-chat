import { describe, expect, test } from "bun:test";
import { streamText } from "ai";
import { createProviderInstance } from "../lib/providerFactory.js";

const GLM_STREAM = [
  {
    id: "gen-test",
    model: "z-ai/glm-5.3",
    provider: "Morph",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: "",
          reasoning: "Checking",
          reasoning_details: [
            { type: "reasoning.text", text: "Checking", format: "unknown", index: 0 },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: "gen-test",
    model: "z-ai/glm-5.3",
    provider: "Morph",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: "",
          reasoning: " the answer.",
          reasoning_details: [
            { type: "reasoning.text", text: " the answer.", format: "unknown", index: 0 },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: "gen-test",
    model: "z-ai/glm-5.3",
    provider: "Morph",
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "OK" },
        finish_reason: null,
      },
    ],
  },
  {
    id: "gen-test",
    model: "z-ai/glm-5.3",
    provider: "Morph",
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "", reasoning: null },
        finish_reason: "stop",
      },
    ],
  },
];

describe("provider factory", () => {
  test("OpenRouter emits GLM reasoning as AI SDK reasoning parts", async () => {
    const fetch = async () => {
      const body = `${GLM_STREAM.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };
    const provider = createProviderInstance("openrouter", {
      apiKey: "test-key",
      baseUrl: "https://openrouter.test/api/v1",
      fetch,
    });

    const result = streamText({
      model: provider.chat("z-ai/glm-5.3"),
      prompt: "Reply with OK.",
    });

    expect(await result.reasoningText).toBe("Checking the answer.");
    expect(await result.text).toBe("OK");
  });
});
