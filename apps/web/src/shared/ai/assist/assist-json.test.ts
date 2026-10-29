import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeSchemaIssues, extractJsonCandidate } from "./assist-json";

describe("extractJsonCandidate", () => {
  it("답 전체가 JSON이면 그대로 읽는다", () => {
    expect(extractJsonCandidate(" {\"score\": 82} ")).toEqual({ score: 82 });
  });

  it("코드 펜스로 감싼 JSON을 꺼낸다", () => {
    expect(extractJsonCandidate("```json\n{\"verdict\": \"좋아요\"}\n```")).toEqual({ verdict: "좋아요" });
  });

  it("앞뒤에 설명이 붙어 와도 첫 번째로 완결된 객체를 꺼낸다", () => {
    const text = "검토 결과는 다음과 같아요.\n{\"verdict\": \"좋아요\", \"notes\": [\"컷 {1} 여백\"]}\n더 필요하면 말해 주세요.";
    expect(extractJsonCandidate(text)).toEqual({ verdict: "좋아요", notes: ["컷 {1} 여백"] });
  });

  it("문자열 안의 괄호와 이스케이프는 짝 맞추기에서 세지 않는다", () => {
    const text = "답: {\"line\": \"그가 말했다 \\\"}\\\"\", \"n\": 1} 끝";
    expect(extractJsonCandidate(text)).toEqual({ line: "그가 말했다 \"}\"", n: 1 });
  });

  it("설명 속 중괄호 뒤에 오는 진짜 객체를 찾는다", () => {
    expect(extractJsonCandidate("형식 {예시} 대신 실제 답: {\"a\": 1}")).toEqual({ a: 1 });
  });

  it("짝이 없는 중괄호를 지나 뒤에 오는 진짜 객체를 찾는다", () => {
    expect(extractJsonCandidate("예시 { 는 무시하고, 답: {\"a\": 1}")).toEqual({ a: 1 });
  });

  it("바깥 객체 문법이 틀리면 그 안의 중첩 객체를 답으로 고르지 않는다", () => {
    expect(extractJsonCandidate("{\"result\": {\"score\": 1}, 깨진 부분}")).toBeUndefined();
    // 깨진 블록 뒤에 따로 온 완결된 객체는 찾는다.
    expect(extractJsonCandidate("{\"a\": {\"b\": 1}, oops} 다시: {\"a\": {\"b\": 2}}")).toEqual({ a: { b: 2 } });
  });

  it("중괄호가 아주 많은 설명에서도 탐색 시도 수에 상한이 있다", () => {
    expect(extractJsonCandidate("{".repeat(5_000))).toBeUndefined();
  });

  it("JSON을 찾지 못하면 undefined", () => {
    expect(extractJsonCandidate("")).toBeUndefined();
    expect(extractJsonCandidate("지금은 답하기 어려워요.")).toBeUndefined();
    expect(extractJsonCandidate("{\"verdict\": \"좋")).toBeUndefined();
  });
});

function issuesOf(result: z.ZodSafeParseResult<unknown>, limit?: number): readonly string[] {
  if (result.success) throw new Error("검증 실패를 기대했어요.");
  return describeSchemaIssues(result.error, limit);
}

describe("describeSchemaIssues", () => {
  const Schema = z.object({ verdict: z.string(), score: z.number().int().max(100), tags: z.array(z.string()) });

  it("문제마다 경로와 이유를 한 줄로 적는다", () => {
    const lines = issuesOf(Schema.safeParse({ verdict: 3, score: 140, tags: ["a", 2] }));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^verdict: /u);
    expect(lines.some((line) => line.startsWith("score: "))).toBe(true);
    expect(lines.some((line) => line.startsWith("tags.1: "))).toBe(true);
  });

  it("최상위 문제와 너무 많은 문제를 줄여 적는다", () => {
    expect(issuesOf(z.object({ a: z.string() }).safeParse("문자열"))[0]).toMatch(/^\(최상위\): /u);
    const lines = issuesOf(z.array(z.number()).safeParse(["a", "b", "c", "d"]), 2);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("그 밖에 2건");
  });
});
