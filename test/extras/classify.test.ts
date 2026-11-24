import { afterEach, describe, expect, it } from "vitest";
import { classify } from "../../src/extras/classify.js";
import { fakeServer, type FakeServer } from "./fake-server.js";

let server: FakeServer | undefined;
afterEach(async () => server?.close());

describe("classify", () => {
  it("returns the model's one-word answer", async () => {
    server = await fakeServer(() => ({ content: [{ type: "text", text: " Question" }], stop_reason: "end_turn" }));
    expect(await classify("is it done?", "test-key", server.url)).toBe("question");
  });
});
