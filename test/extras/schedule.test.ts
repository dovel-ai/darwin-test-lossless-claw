import { describe, expect, it } from "vitest";
import { dueLabel } from "../../src/extras/schedule.js";

describe("dueLabel", () => {
  it("adds days and formats the date", () => {
    expect(dueLabel(new Date(2026, 0, 30), 3)).toBe("2026-02-02");
  });
});
