import { describe, expect, it } from "vitest";
import { remindOn } from "../../src/extras/dates.js";

describe("remindOn", () => {
  it("adds days across a month end", () => {
    expect(remindOn("2026-01-30", 3)).toBe("2026-02-02");
  });
});
