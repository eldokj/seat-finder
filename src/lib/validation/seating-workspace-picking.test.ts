import { describe, it, expect } from "vitest";
import { isValidPickTarget } from "./seating-workspace-picking";

describe("isValidPickTarget — move", () => {
  it("accepts an empty available seat", () => {
    expect(isValidPickTarget("move", "sa-1", { cellState: "available", occupantSeatAllocationId: null })).toBe(true);
  });

  it("rejects an occupied seat", () => {
    expect(isValidPickTarget("move", "sa-1", { cellState: "available", occupantSeatAllocationId: "sa-2" })).toBe(false);
  });

  it("rejects a disabled seat", () => {
    expect(isValidPickTarget("move", "sa-1", { cellState: "disabled", occupantSeatAllocationId: null })).toBe(false);
  });

  it("rejects a gap", () => {
    expect(isValidPickTarget("move", "sa-1", { cellState: "gap", occupantSeatAllocationId: null })).toBe(false);
  });
});

describe("isValidPickTarget — swap", () => {
  it("accepts a seat occupied by a different student", () => {
    expect(isValidPickTarget("swap", "sa-1", { cellState: "available", occupantSeatAllocationId: "sa-2" })).toBe(true);
  });

  it("rejects an empty seat", () => {
    expect(isValidPickTarget("swap", "sa-1", { cellState: "available", occupantSeatAllocationId: null })).toBe(false);
  });

  it("rejects the source seat itself (no-op swap)", () => {
    expect(isValidPickTarget("swap", "sa-1", { cellState: "available", occupantSeatAllocationId: "sa-1" })).toBe(false);
  });
});
