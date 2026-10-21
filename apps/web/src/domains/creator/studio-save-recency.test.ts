import { describe, expect, it } from "vitest";

import { resolveSavedRecency } from "./studio-save-recency";

const SAVED_AT = 1_700_000_000_000;

describe("resolveSavedRecency", () => {
  it("treats the first minute after a receipt as just-now", () => {
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT)).toEqual({ kind: "just-now" });
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT + 59_999)).toEqual({ kind: "just-now" });
  });

  it("reports whole minutes inside the first hour", () => {
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT + 60_000)).toEqual({
      kind: "minutes-ago",
      minutes: 1,
    });
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT + 59 * 60_000 + 30_000)).toEqual({
      kind: "minutes-ago",
      minutes: 59,
    });
  });

  it("falls back to the clock at one hour and beyond", () => {
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT + 3_600_000)).toEqual({ kind: "clock" });
    expect(resolveSavedRecency(SAVED_AT, SAVED_AT + 24 * 3_600_000)).toEqual({ kind: "clock" });
  });

  it("never fabricates recency without a receipt and tolerates clock skew", () => {
    expect(resolveSavedRecency(0, SAVED_AT)).toEqual({ kind: "clock" });
    expect(resolveSavedRecency(Number.NaN, SAVED_AT)).toEqual({ kind: "clock" });
    // Receipt timestamped slightly in the future (clock skew) still reads as just saved.
    expect(resolveSavedRecency(SAVED_AT + 5_000, SAVED_AT)).toEqual({ kind: "just-now" });
  });
});
