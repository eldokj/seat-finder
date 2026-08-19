import { describe, it, expect } from "vitest";
import { seatAccessibleLabel, additionalSeatAccessibleLabel, type AccessibleSeatOccupant } from "./seating-workspace-accessibility";

const occupant: AccessibleSeatOccupant = { registerNo: "22BCS1234", fullName: "Aisha Rahman", status: "compliant" };
const violatingOccupant: AccessibleSeatOccupant = { registerNo: "22BCS5678", fullName: "Karthik Nair", status: "violation" };

describe("seatAccessibleLabel", () => {
  it("includes room, seat, register number and full name for an occupied compliant seat", () => {
    const label = seatAccessibleLabel("M101", "A1", "available", occupant);
    expect(label).toContain("M101");
    expect(label).toContain("A1");
    expect(label).toContain("22BCS1234");
    expect(label).toContain("Aisha Rahman");
    expect(label).toMatch(/compliant/i);
  });

  it("does not truncate the register number the way the visible text does", () => {
    const label = seatAccessibleLabel("M101", "A1", "available", occupant);
    // The visible button text is only the last 4 digits ("1234") — the
    // accessible name must carry the FULL register number.
    expect(label).toContain(occupant.registerNo);
  });

  it("flags a rule violation distinctly from a compliant seat", () => {
    const label = seatAccessibleLabel("M101", "A2", "available", violatingOccupant);
    expect(label).toMatch(/violation/i);
    expect(label).not.toMatch(/compliant/i);
  });

  it("describes an empty available seat without an occupant", () => {
    const label = seatAccessibleLabel("M101", "A3", "available", null);
    expect(label).toContain("M101");
    expect(label).toContain("A3");
    expect(label).toMatch(/empty/i);
  });

  it("describes a disabled seat", () => {
    const label = seatAccessibleLabel("M101", "A4", "disabled", null);
    expect(label).toMatch(/disabled/i);
  });

  it("describes a gap as not a seat, regardless of any occupant/label data", () => {
    const label = seatAccessibleLabel("M101", null, "gap", null);
    expect(label).toMatch(/gap/i);
    expect(label).toMatch(/not a seat/i);
  });

  it("still produces a usable label when the seat has no label at all", () => {
    const label = seatAccessibleLabel("M101", null, "available", null);
    expect(label).toContain("M101");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("additionalSeatAccessibleLabel", () => {
  it("includes room, additional seat number, register number and full name when occupied", () => {
    const label = additionalSeatAccessibleLabel("M101", "ADD-1", occupant);
    expect(label).toContain("M101");
    expect(label).toContain("ADD-1");
    expect(label).toContain("22BCS1234");
    expect(label).toContain("Aisha Rahman");
  });

  it("describes an empty additional seat", () => {
    const label = additionalSeatAccessibleLabel("M101", "ADD-2", null);
    expect(label).toMatch(/empty/i);
  });

  it("flags a rule violation on an additional seat", () => {
    const label = additionalSeatAccessibleLabel("M101", "ADD-1", violatingOccupant);
    expect(label).toMatch(/violation/i);
  });
});
