import { describe, expect, it } from "vitest";
import { snapshotId } from "../../src/extras/ids.js";

describe("snapshotId", () => {
  it("is snap_ and 12 url-safe characters", () => {
    expect(snapshotId()).toMatch(/^snap_[A-Za-z0-9_-]{12}$/);
  });
});
