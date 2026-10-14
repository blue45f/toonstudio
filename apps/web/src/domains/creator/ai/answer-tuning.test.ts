import { describe, expect, it } from "vitest";

import {
  ANSWER_CREATIVITY_DIRECTIVES,
  ANSWER_DIFFICULTY_DIRECTIVES,
  ANSWER_LENGTH_DIRECTIVES,
  ANSWER_LENGTH_DIRECTIVES_STRUCTURED,
  answerTuningMaxTokens,
  answerTuningTemperature,
  applyAnswerTuningToSystemPrompt,
  buildAnswerTuningDirectives,
  DEFAULT_ANSWER_TUNING,
  isDefaultAnswerTuning,
  normalizeAnswerTuning,
  type AnswerTuning,
} from "./answer-tuning";

const TUNED: AnswerTuning = { difficulty: "easy", length: "short", creativity: "free" };

describe("answer-tuning directives", () => {
  it("maps every tuning axis to its directive in difficulty·length·creativity order", () => {
    expect(buildAnswerTuningDirectives(TUNED)).toEqual([
      ANSWER_DIFFICULTY_DIRECTIVES.easy,
      ANSWER_LENGTH_DIRECTIVES.short,
      ANSWER_CREATIVITY_DIRECTIVES.free,
    ]);
    expect(buildAnswerTuningDirectives(DEFAULT_ANSWER_TUNING)).toEqual([
      ANSWER_DIFFICULTY_DIRECTIVES.standard,
      ANSWER_LENGTH_DIRECTIVES.standard,
      ANSWER_CREATIVITY_DIRECTIVES.balanced,
    ]);
  });

  it("uses schema-safe length directives for structured output", () => {
    const directives = buildAnswerTuningDirectives(TUNED, "structured");
    expect(directives[1]).toBe(ANSWER_LENGTH_DIRECTIVES_STRUCTURED.short);
    expect(directives[1]).toContain("스키마");
    expect(directives[0]).toBe(ANSWER_DIFFICULTY_DIRECTIVES.easy);
    expect(directives[2]).toBe(ANSWER_CREATIVITY_DIRECTIVES.free);
  });

  it("appends directives to the system prompt without rewriting it", () => {
    const result = applyAnswerTuningToSystemPrompt("기본 지시", TUNED);
    expect(result.startsWith("기본 지시\n")).toBe(true);
    expect(result).toContain(ANSWER_DIFFICULTY_DIRECTIVES.easy);
    expect(result).toContain(ANSWER_CREATIVITY_DIRECTIVES.free);
  });
});

describe("answer-tuning generation parameters", () => {
  it("shifts temperature by creativity and clamps to 0..2", () => {
    expect(answerTuningTemperature(0.7, DEFAULT_ANSWER_TUNING)).toBe(0.7);
    expect(answerTuningTemperature(0.7, { ...DEFAULT_ANSWER_TUNING, creativity: "grounded" })).toBe(0.5);
    expect(answerTuningTemperature(0.8, { ...DEFAULT_ANSWER_TUNING, creativity: "free" })).toBe(1);
    expect(answerTuningTemperature(0.1, { ...DEFAULT_ANSWER_TUNING, creativity: "grounded" })).toBe(0);
    expect(answerTuningTemperature(1.95, { ...DEFAULT_ANSWER_TUNING, creativity: "free" })).toBe(2);
  });

  it("scales maxTokens by length with a floor of 100", () => {
    expect(answerTuningMaxTokens(400, DEFAULT_ANSWER_TUNING)).toBe(400);
    expect(answerTuningMaxTokens(400, { ...DEFAULT_ANSWER_TUNING, length: "short" })).toBe(240);
    expect(answerTuningMaxTokens(400, { ...DEFAULT_ANSWER_TUNING, length: "detailed" })).toBe(720);
    expect(answerTuningMaxTokens(120, { ...DEFAULT_ANSWER_TUNING, length: "short" })).toBe(100);
  });
});

describe("answer-tuning value helpers", () => {
  it("detects the default tuning", () => {
    expect(isDefaultAnswerTuning(DEFAULT_ANSWER_TUNING)).toBe(true);
    expect(isDefaultAnswerTuning(TUNED)).toBe(false);
  });

  it("normalizes untrusted input per-field, keeping valid fields", () => {
    expect(normalizeAnswerTuning(null)).toEqual(DEFAULT_ANSWER_TUNING);
    expect(normalizeAnswerTuning("nope")).toEqual(DEFAULT_ANSWER_TUNING);
    expect(normalizeAnswerTuning({ difficulty: "deep", length: "huge", creativity: "free" })).toEqual({
      difficulty: "deep",
      length: "standard",
      creativity: "free",
    });
    expect(normalizeAnswerTuning(TUNED)).toEqual(TUNED);
  });
});
