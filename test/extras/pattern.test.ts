import { describe, expect, it } from "vitest";
import { keyPattern } from "../../src/extras/pattern.js";

describe("keyPattern", () => {
  it("escapes the key as stored in the index", () => {
    expect(keyPattern("agent-1.main")).toBe("^agent\\-1\\.main$");
  });
});
