import { describe, it, expect } from "vitest";
import { normalizeRegisterNumber, isValidRegisterNumberInput, MAX_REGISTER_NUMBER_LENGTH } from "./register-number";

describe("normalizeRegisterNumber", () => {
  it("uppercases", () => {
    expect(normalizeRegisterNumber("25bcs034")).toBe("25BCS034");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeRegisterNumber("  25BCS034  ")).toBe("25BCS034");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeRegisterNumber("25 BCS 034")).toBe("25BCS034");
  });
});

describe("isValidRegisterNumberInput", () => {
  it("accepts a normal register number", () => {
    expect(isValidRegisterNumberInput("25BCS034")).toBe(true);
  });
  it("rejects empty input", () => {
    expect(isValidRegisterNumberInput("")).toBe(false);
  });
  it("rejects whitespace-only input", () => {
    expect(isValidRegisterNumberInput("   ")).toBe(false);
  });
  it("accepts input exactly at the max length", () => {
    expect(isValidRegisterNumberInput("A".repeat(MAX_REGISTER_NUMBER_LENGTH))).toBe(true);
  });
  it("rejects input one character over the max length", () => {
    expect(isValidRegisterNumberInput("A".repeat(MAX_REGISTER_NUMBER_LENGTH + 1))).toBe(false);
  });
  it("rejects an abusive oversized payload", () => {
    expect(isValidRegisterNumberInput("A".repeat(10_000))).toBe(false);
  });
});
