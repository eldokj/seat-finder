import { describe, it, expect } from "vitest";
import {
  generateGrid,
  mergeGrid,
  cellStateFromDb,
  cellToDbShape,
  cellToPlaceholderShape,
  computeCapacityBreakdown,
  validateGrid,
  computeSeatsToDelete,
  cellAccessibleLabel,
  type SeatCell,
} from "./room-layout";

describe("generateGrid", () => {
  it("builds rows x columns cells, all available", () => {
    const cells = generateGrid(5, 9, "row_wise");
    expect(cells).toHaveLength(45);
    expect(cells.every((c) => c.state === "available")).toBe(true);
  });

  it("row_wise numbers left-to-right, top-to-bottom", () => {
    const cells = generateGrid(2, 3, "row_wise");
    const labels = cells.map((c) => c.seat_label);
    expect(labels).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("column_wise numbers top-to-bottom within a column first", () => {
    const cells = generateGrid(2, 3, "column_wise");
    const labels = cells.map((c) => c.seat_label);
    // row1: col1=1, col2=3, col3=5 ; row2: col1=2, col2=4, col3=6
    expect(labels).toEqual(["1", "3", "5", "2", "4", "6"]);
  });

  it("serpentine_row alternates direction per row", () => {
    const cells = generateGrid(2, 3, "serpentine_row");
    const labels = cells.map((c) => c.seat_label);
    // row1 (even, r=0): 1,2,3 ; row2 (odd, r=1): reversed -> 6,5,4
    expect(labels).toEqual(["1", "2", "3", "6", "5", "4"]);
  });

  it("serpentine_column alternates direction per column", () => {
    const cells = generateGrid(3, 2, "serpentine_column");
    const labels = cells.map((c) => c.seat_label);
    // col1 (even, c=0): rows 1,2,3 -> 1,2,3 ; col2 (odd, c=1): reversed -> 6,5,4
    // grid iterates row-major, so per row: [row1col1, row1col2], [row2col1, row2col2], [row3col1, row3col2]
    expect(labels).toEqual(["1", "6", "2", "5", "3", "4"]);
  });

  it("custom falls back to row_wise sequential numbering as a starting point", () => {
    const cells = generateGrid(2, 2, "custom");
    expect(cells.map((c) => c.seat_label)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("mergeGrid", () => {
  it("carries over available/disabled/gap state for cells that still exist", () => {
    const existing = generateGrid(2, 2, "row_wise");
    existing[0].state = "disabled";
    existing[3].state = "gap";

    const merged = mergeGrid(existing, 2, 2, "row_wise");
    expect(merged[0].state).toBe("disabled");
    expect(merged[3].state).toBe("gap");
    expect(merged[1].state).toBe("available");
  });

  it("new cells from growth default to available with a fresh label", () => {
    const existing = generateGrid(2, 2, "row_wise");
    const merged = mergeGrid(existing, 3, 2, "row_wise");
    expect(merged).toHaveLength(6);
    const newRow = merged.filter((c) => c.row_number === 3);
    expect(newRow.every((c) => c.state === "available")).toBe(true);
  });

  it("relabels existing cells for a non-custom pattern", () => {
    const existing = generateGrid(2, 2, "row_wise");
    existing[0].seat_label = "hand-typed";
    const merged = mergeGrid(existing, 2, 2, "column_wise");
    // column_wise relabels row1col1 to "1" regardless of the old hand-typed label
    expect(merged[0].seat_label).toBe("1");
  });

  it("keeps hand-typed labels for existing cells under 'custom'", () => {
    const existing = generateGrid(2, 2, "custom");
    existing[0].seat_label = "hand-typed";
    const merged = mergeGrid(existing, 2, 2, "custom");
    expect(merged[0].seat_label).toBe("hand-typed");
  });
});

describe("cellStateFromDb / cellToDbShape", () => {
  it("round-trips available and disabled seats", () => {
    expect(cellStateFromDb("seat", "available")).toBe("available");
    expect(cellStateFromDb("seat", "disabled")).toBe("disabled");
    expect(cellStateFromDb("gap", "available")).toBe("gap");
  });

  it("nulls out the label for a gap cell", () => {
    const shape = cellToDbShape({ row_number: 1, column_number: 1, seat_label: "1", state: "gap" });
    expect(shape.position_type).toBe("gap");
    expect(shape.seat_label).toBeNull();
  });

  it("keeps the label and marks status for a seat cell", () => {
    const shape = cellToDbShape({ row_number: 1, column_number: 1, seat_label: "A1", state: "disabled" });
    expect(shape.position_type).toBe("seat");
    expect(shape.status).toBe("disabled");
    expect(shape.seat_label).toBe("A1");
  });
});

describe("cellToPlaceholderShape", () => {
  it("always produces a labelless gap, regardless of the cell's real state", () => {
    for (const state of ["available", "disabled", "gap"] as const) {
      const shape = cellToPlaceholderShape({ row_number: 2, column_number: 3, seat_label: "9", state } as SeatCell);
      expect(shape).toEqual({
        row_number: 2,
        column_number: 3,
        section: null,
        seat_label: null,
        position_type: "gap",
        status: "available",
      });
    }
  });
});

describe("computeCapacityBreakdown", () => {
  it("matches the 8x9 worked example from the design doc", () => {
    const cells: { state: "available" | "disabled" | "gap" }[] = [
      ...Array(67).fill({ state: "available" }),
      ...Array(3).fill({ state: "disabled" }),
      ...Array(2).fill({ state: "gap" }),
    ];
    const breakdown = computeCapacityBreakdown(cells, 5);
    expect(breakdown.physicalPositions).toBe(72);
    expect(breakdown.gaps).toBe(2);
    expect(breakdown.disabled).toBe(3);
    expect(breakdown.availableGridSeats).toBe(67);
    expect(breakdown.additionalSeats).toBe(5);
    expect(breakdown.finalUsableCapacity).toBe(72);
  });

  it("physical positions always equals gaps + disabled + available", () => {
    const cells: { state: "available" | "disabled" | "gap" }[] = [
      { state: "available" },
      { state: "available" },
      { state: "disabled" },
      { state: "gap" },
    ];
    const breakdown = computeCapacityBreakdown(cells, 0);
    expect(breakdown.physicalPositions).toBe(breakdown.gaps + breakdown.disabled + breakdown.availableGridSeats);
  });
});

describe("validateGrid", () => {
  const base = () => generateGrid(2, 2, "row_wise");

  it("passes for a well-formed grid", () => {
    expect(validateGrid(base(), 2, 2)).toEqual([]);
  });

  it("flags a cell count mismatch", () => {
    const cells = base().slice(0, 3);
    expect(validateGrid(cells, 2, 2).some((e) => e.includes("Expected 4 cells"))).toBe(true);
  });

  it("flags a cell outside the declared bounds", () => {
    const cells = base();
    cells[0] = { ...cells[0], row_number: 99 };
    expect(validateGrid(cells, 2, 2).some((e) => e.includes("outside"))).toBe(true);
  });

  it("flags duplicate seat labels", () => {
    const cells = base();
    cells[1].seat_label = cells[0].seat_label;
    expect(validateGrid(cells, 2, 2).some((e) => e.includes("used 2 times"))).toBe(true);
  });

  it("flags a blank label on a seat cell", () => {
    const cells = base();
    cells[0].seat_label = "   ";
    expect(validateGrid(cells, 2, 2).some((e) => e.includes("needs a label"))).toBe(true);
  });

  it("does not require a label on a gap cell", () => {
    const cells = base();
    cells[0].state = "gap";
    expect(validateGrid(cells, 2, 2)).toEqual([]);
  });
});

describe("computeSeatsToDelete", () => {
  it("returns ids of existing rows no longer present in the desired grid", () => {
    const existing = [
      { id: "a", row_number: 1, column_number: 1 },
      { id: "b", row_number: 1, column_number: 2 },
      { id: "c", row_number: 2, column_number: 1 },
    ];
    const desired: Pick<SeatCell, "row_number" | "column_number">[] = [
      { row_number: 1, column_number: 1 },
      { row_number: 2, column_number: 1 },
    ];
    expect(computeSeatsToDelete(existing, desired)).toEqual(["b"]);
  });

  it("returns an empty list when the grid only grows", () => {
    const existing = [{ id: "a", row_number: 1, column_number: 1 }];
    const desired: Pick<SeatCell, "row_number" | "column_number">[] = [
      { row_number: 1, column_number: 1 },
      { row_number: 1, column_number: 2 },
    ];
    expect(computeSeatsToDelete(existing, desired)).toEqual([]);
  });
});

describe("cellAccessibleLabel", () => {
  it("includes row, column, seat label and state for an available seat", () => {
    const label = cellAccessibleLabel({ row_number: 2, column_number: 3, seat_label: "B3", state: "available" });
    expect(label).toMatch(/row 2/i);
    expect(label).toMatch(/column 3/i);
    expect(label).toContain("B3");
    expect(label).toMatch(/available/i);
  });

  it("flags a disabled seat distinctly", () => {
    const label = cellAccessibleLabel({ row_number: 1, column_number: 1, seat_label: "A1", state: "disabled" });
    expect(label).toMatch(/disabled/i);
    expect(label).not.toMatch(/available/i);
  });

  it("still produces a non-empty, informative label for a gap (which has no visible text at all)", () => {
    const label = cellAccessibleLabel({ row_number: 1, column_number: 2, seat_label: "", state: "gap" });
    expect(label.length).toBeGreaterThan(0);
    expect(label).toMatch(/gap/i);
    expect(label).toMatch(/not a seat/i);
  });
});
