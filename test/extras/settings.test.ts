import { describe, expect, it } from "vitest";
import { contactProblems } from "../../src/extras/settings.js";

describe("contactProblems", () => {
  it("accepts a valid contact", () => {
    expect(contactProblems({ email: "a@example.com", name: "Ada" })).toEqual([]);
  });
  it("names each invalid field", () => {
    expect(contactProblems({ email: "nope", name: "" }).map((problem) => problem.split(":")[0])).toEqual(["email", "name"]);
  });
});
