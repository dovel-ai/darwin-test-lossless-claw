import { describe, expect, it } from "vitest";
import { lastDoubled } from "../../src/extras/stream.js";

describe("lastDoubled", () => {
  it("resolves to the last value, doubled", async () => {
    expect(await lastDoubled([1, 2, 3])).toBe(6);
  });
});
