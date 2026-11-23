import { afterEach, describe, expect, it } from "vitest";
import { suggestTitle } from "../../src/extras/title.js";
import { fakeServer, type FakeServer } from "./fake-server.js";

let server: FakeServer | undefined;
afterEach(async () => server?.close());

describe("suggestTitle", () => {
  it("returns the model's suggestion, trimmed", async () => {
    server = await fakeServer(() => ({
      id: "chatcmpl-1", object: "chat.completion", created: 0, model: "m",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "  Weekly sync notes \n" } }],
    }));
    expect(await suggestTitle("we met and talked", "test-key", `${server.url}/v1`)).toBe("Weekly sync notes");
    expect(server.requests[0]?.path).toBe("/v1/chat/completions");
  });
});
