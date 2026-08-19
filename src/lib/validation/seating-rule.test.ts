import { describe, it, expect } from "vitest";
import {
  seatingRuleSetInputSchema,
  buildSeatingRuleRows,
  seatingRuleRowsToInput,
  parseSeatingRuleSetFormData,
  type SeatingRuleSetInput,
} from "./seating-rule";

const VALID_INPUT: SeatingRuleSetInput = {
  allocation_pattern: "row_wise",
  row_jump: { enabled: true, gap: 2, group_by: ["programme"] },
  column_jump: { enabled: false },
  avoid_same_programme_adjacent: true,
  avoid_same_department_adjacent: false,
  avoid_same_course_adjacent: true,
};

describe("seatingRuleSetInputSchema", () => {
  it("accepts a fully valid input", () => {
    expect(seatingRuleSetInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("rejects an enabled jump rule with no gap", () => {
    const result = seatingRuleSetInputSchema.safeParse({
      ...VALID_INPUT,
      row_jump: { enabled: true, group_by: ["programme"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an enabled jump rule with no group_by", () => {
    const result = seatingRuleSetInputSchema.safeParse({
      ...VALID_INPUT,
      row_jump: { enabled: true, gap: 2, group_by: [] },
    });
    expect(result.success).toBe(false);
  });

  it("allows a disabled jump rule with no gap/group_by", () => {
    const result = seatingRuleSetInputSchema.safeParse({
      ...VALID_INPUT,
      row_jump: { enabled: false },
    });
    expect(result.success).toBe(true);
  });
});

describe("parseSeatingRuleSetFormData", () => {
  it("extracts nested jump-rule shape and repeated group_by fields from FormData", () => {
    const fd = new FormData();
    fd.set("allocation_pattern", "serpentine_row");
    fd.set("row_jump_enabled", "on");
    fd.set("row_jump_gap", "3");
    fd.append("row_jump_group_by", "programme");
    fd.append("row_jump_group_by", "course");
    fd.set("avoid_same_course_adjacent", "on");

    const parsed = parseSeatingRuleSetFormData(fd) as Record<string, unknown>;
    expect(parsed.allocation_pattern).toBe("serpentine_row");
    expect((parsed.row_jump as Record<string, unknown>).enabled).toBe(true);
    expect((parsed.row_jump as Record<string, unknown>).gap).toBe("3");
    expect((parsed.row_jump as Record<string, unknown>).group_by).toEqual(["programme", "course"]);
    expect((parsed.column_jump as Record<string, unknown>).enabled).toBe(false);
    expect(parsed.avoid_same_course_adjacent).toBe(true);
    expect(parsed.avoid_same_programme_adjacent).toBe(false);

    const validated = seatingRuleSetInputSchema.safeParse(parsed);
    expect(validated.success).toBe(true);
  });
});

describe("buildSeatingRuleRows", () => {
  it("always emits exactly 6 rows, one per rule_type", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "global", null);
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.rule_type)).size).toBe(6);
  });

  it("allocation_pattern is always active regardless of other toggles", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "global", null);
    const pattern = rows.find((r) => r.rule_type === "allocation_pattern")!;
    expect(pattern.is_active).toBe(true);
    expect(pattern.parameters).toEqual({ pattern: "row_wise" });
  });

  it("carries gap/group_by into parameters only when enabled", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "daily_examination_event", "event-1");
    const rowJump = rows.find((r) => r.rule_type === "row_jump")!;
    expect(rowJump.is_active).toBe(true);
    expect(rowJump.parameters).toEqual({ gap: 2, group_by: ["programme"] });
    expect(rowJump.daily_examination_event_id).toBe("event-1");

    const columnJump = rows.find((r) => r.rule_type === "column_jump")!;
    expect(columnJump.is_active).toBe(false);
    expect(columnJump.parameters).toEqual({});
  });

  it("separation rules carry no parameters, just is_active", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "global", null);
    const programme = rows.find((r) => r.rule_type === "avoid_same_programme_adjacent")!;
    expect(programme.is_active).toBe(true);
    expect(programme.parameters).toEqual({});
    const department = rows.find((r) => r.rule_type === "avoid_same_department_adjacent")!;
    expect(department.is_active).toBe(false);
  });
});

describe("seatingRuleRowsToInput", () => {
  it("round-trips buildSeatingRuleRows output back to the same input shape", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "global", null);
    const roundTripped = seatingRuleRowsToInput(rows);
    expect(roundTripped).toEqual(VALID_INPUT);
  });

  it("defaults to row_wise / all-disabled when no rows exist yet", () => {
    const input = seatingRuleRowsToInput([]);
    expect(input.allocation_pattern).toBe("row_wise");
    expect(input.row_jump.enabled).toBe(false);
    expect(input.avoid_same_programme_adjacent).toBe(false);
  });
});

describe("Seating Rules JSON export/import round trip (Import/Export architecture)", () => {
  it("JSON.stringify -> JSON.parse -> schema validation reproduces the exact same input", () => {
    // Mirrors exactly what /api/admin/seating-rules/export and the import
    // preview/confirm actions do — no DB involved, pure serialization.
    const exported = JSON.stringify(VALID_INPUT, null, 2);
    const reImported = JSON.parse(exported);
    const parsed = seatingRuleSetInputSchema.safeParse(reImported);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(VALID_INPUT);
  });

  it("round-trips through buildSeatingRuleRows + JSON serialization together (export reads from DB rows, import writes back to DB rows)", () => {
    const rows = buildSeatingRuleRows(VALID_INPUT, "global", null);
    const loadedForExport = seatingRuleRowsToInput(rows);
    const exported = JSON.parse(JSON.stringify(loadedForExport));
    const parsed = seatingRuleSetInputSchema.safeParse(exported);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const rowsFromImport = buildSeatingRuleRows(parsed.data, "global", null);
      expect(rowsFromImport).toEqual(rows);
    }
  });

  it("rejects a JSON file with an unrelated shape (e.g. an export from a different screen)", () => {
    const wrongShape = { registerNumber: "22BCS034", studentName: "Someone" };
    const parsed = seatingRuleSetInputSchema.safeParse(wrongShape);
    expect(parsed.success).toBe(false);
  });

  it("rejects a JSON file with a structurally-close but invalid shape (enabled jump rule missing gap)", () => {
    const invalid = { ...VALID_INPUT, row_jump: { enabled: true, group_by: ["programme"] } };
    const parsed = seatingRuleSetInputSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});
