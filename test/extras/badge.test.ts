import { describe, expect, it } from "vitest";
import { badge } from "../../src/extras/badge.js";

describe("badge", () => {
  it("renders a span", () => {
    expect(badge("ok")).toBe('<span class="badge">ok</span>');
  });
});
