// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_THUMBNAIL_CANDIDATE_A, DEFAULT_THUMBNAIL_CANDIDATE_B, analyzeEpisodeHookAndDensity,
  applySplitSuggestionToCuts, compareThumbnailCandidates, evaluateThumbnailOnPlatform, getEpisodeHookPreset,
  suggestBalloonTextSplit,
} from "./episode-pacing-thumbnail-engine";
import { uniqueEpisodeId } from "./episode-dialogue-contract";
import { StudioEpisodePacingThumbnailPanel } from "./StudioEpisodePacingThumbnailPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("회차 분할 원문·식별자·수치 경계", () => {
  it("분할 후 공백·개행·emoji grapheme을 그대로 이어 붙일 수 있다", () => {
    const original = `  ${"가".repeat(35)}🧑🏽‍🎨\r\n\t${"나".repeat(60)}  `;
    const chunks = suggestBalloonTextSplit(original);
    expect(chunks.join("")).toBe(original);
    expect(chunks.some((chunk) => chunk.includes("🧑🏽‍🎨"))).toBe(true);
    const boundaries = new Set(Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(original), (segment) => segment.index));
    let offset = 0;
    for (const chunk of chunks) { expect(boundaries.has(offset)).toBe(true); offset += chunk.length; }
  });
  it.each([NaN, Infinity, -Infinity])("분할 상한 %s를 명시적으로 거부한다", (maxChars) => {
    expect(() => suggestBalloonTextSplit("원문".repeat(100), maxChars)).toThrow(/유한|finite/);
  });
  it("오래된 제안은 수정된 최신 원문을 덮지 않는다", () => {
    const cuts = getEpisodeHookPreset("overloaded-opening").cuts;
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions[0];
    if (!suggestion) throw new Error("필수 분할 제안 없음");
    const edited = cuts.map((cut, i) => i === 0 ? { ...cut, balloons: cut.balloons.map((b) => ({ ...b, text: "최신 원문 🧑🏽‍🎨\n  보존" })) } : cut);
    expect(applySplitSuggestionToCuts(edited, suggestion)).toEqual(edited);
    expect(cuts[0]?.balloons[0]?.text).toBe(suggestion.originalText);
  });
  it("다른 cutId의 같은 배열 위치에는 제안을 적용하지 않는다", () => {
    const cuts = getEpisodeHookPreset("overloaded-opening").cuts;
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions[0];
    if (!suggestion) throw new Error("필수 분할 제안 없음");
    const reordered = [...cuts].reverse();
    expect(applySplitSuggestionToCuts(reordered, suggestion)).toEqual(reordered);
  });
  it("기존 -split ID와 겹쳐도 새 컷 ID를 고유하게 만들고 원본을 보존한다", () => {
    const preset = getEpisodeHookPreset("overloaded-opening");
    const first = preset.cuts[0]; if (!first) throw new Error("필수 컷 없음");
    const cuts = [...preset.cuts, { ...first, id: `${first.id}-split`, balloons: [] }];
    const before = structuredClone(cuts);
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions.find((s) => s.reason === "cut-over-4-balloons");
    if (!suggestion) throw new Error("필수 과밀 제안 없음");
    const target = cuts[suggestion.cutIndex]; if (!target) throw new Error("대상 컷 없음");
    const withCollision = [...cuts, { ...target, id: `${target.id}-split`, balloons: [] }];
    const result = applySplitSuggestionToCuts(withCollision, suggestion);
    expect(new Set(result.map((cut) => cut.id)).size).toBe(result.length);
    expect(cuts).toEqual(before);
  });
  it("중복 컷·말풍선 ID와 128컷 초과 입력을 계산 전에 거부한다", () => {
    const cut = getEpisodeHookPreset("overloaded-opening").cuts[0]; if (!cut) throw new Error("필수 컷 없음");
    expect(() => analyzeEpisodeHookAndDensity({ cuts: [cut, cut] })).toThrow(/ID/);
    const balloon = cut.balloons[0]; if (!balloon) throw new Error("필수 말풍선 없음");
    expect(() => analyzeEpisodeHookAndDensity({ cuts: [{ ...cut, balloons: [balloon, balloon] }] })).toThrow(/ID/);
    expect(() => analyzeEpisodeHookAndDensity({ cuts: Array.from({ length: 129 }, (_, i) => ({ ...cut, id: `c${i}` })) })).toThrow(/128|상한/);
  });
  it.each([NaN, Infinity, 1e308])("외부 썸네일 너비 %s를 허위 안전 점수로 출력하지 않는다", (sourceWidthPx) => {
    expect(() => evaluateThumbnailOnPlatform({ ...DEFAULT_THUMBNAIL_CANDIDATE_A, sourceWidthPx }, "naver-list-202x120")).toThrow(/유한|finite|범위/);
  });
  it("NaN 글꼴 크기와 중복 배지 입력을 거부한다", () => {
    expect(() => evaluateThumbnailOnPlatform({ ...DEFAULT_THUMBNAIL_CANDIDATE_A, sourceTitleFontPx: NaN }, "naver-list-202x120")).toThrow(/유한|finite/);
    expect(() => compareThumbnailCandidates({ candidateA: DEFAULT_THUMBNAIL_CANDIDATE_A, candidateB: DEFAULT_THUMBNAIL_CANDIDATE_B, activeBadges: ["UP", "UP"] })).toThrow(/중복|고유/);
  });
  it("합친 원문이 같아도 emoji 중간을 자른 외부 제안은 적용하지 않는다", () => {
    const cut = getEpisodeHookPreset("overloaded-opening").cuts[0]; if (!cut) throw new Error("필수 컷 없음");
    const balloon = cut.balloons[0]; if (!balloon) throw new Error("필수 말풍선 없음");
    const original = "가".repeat(45) + "🧑🏽‍🎨";
    const cuts = [{ ...cut, balloons: [{ ...balloon, text: original }] }];
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions[0]; if (!suggestion) throw new Error("필수 제안 없음");
    const malformed = { ...suggestion, suggestedChunks: [original.slice(0, 46), original.slice(46)] };
    expect(applySplitSuggestionToCuts(cuts, malformed)).toEqual(cuts);
  });
  it("구분자를 포함한 서로 다른 ID 조합도 고유한 제안 ID를 만든다", () => {
    const cut = getEpisodeHookPreset("overloaded-opening").cuts[0]; if (!cut) throw new Error("필수 컷 없음");
    const balloon = cut.balloons[0]; if (!balloon) throw new Error("필수 말풍선 없음");
    const result = analyzeEpisodeHookAndDensity({ cuts: [{ ...cut, id: "a-b", balloons: [{ ...balloon, id: "c" }] }, { ...cut, id: "a", balloons: [{ ...balloon, id: "b-c" }] }] });
    expect(new Set(result.splitSuggestions.map((suggestion) => suggestion.id)).size).toBe(result.splitSuggestions.length);
  });
});

describe("회차 결과 알림과 클립보드 응답", () => {
  it("수신자 교체만으로 동일 분석을 재통지하지 않는다", () => {
    const initial = vi.fn(); const latest = vi.fn();
    const { rerender } = render(<StudioEpisodePacingThumbnailPanel onPacingAnalysisChange={initial} />);
    expect(initial).toHaveBeenCalledTimes(1);
    rerender(<StudioEpisodePacingThumbnailPanel onPacingAnalysisChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pacing-add-cut-btn"));
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("클립보드 실패를 성공으로 표시하지 않고 같은 텍스트만 재시도한다", async () => {
    let rejectCopy: (reason: Error) => void = () => { throw new Error("복사 요청 없음"); };
    const copy = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    const onCopyReport = vi.fn();
    render(<StudioEpisodePacingThumbnailPanel onCopyReport={onCopyReport} />);
    fireEvent.click(screen.getByTestId("lab-copy-report-btn"));
    expect(screen.getByTestId("pacing-copy-status").textContent).toContain("기다리");
    await act(async () => { rejectCopy(new Error("denied")); });
    expect(screen.getByTestId("pacing-copy-status").getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByTestId("pacing-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("pacing-copy-status").textContent).toContain("복사 완료"));
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(onCopyReport).toHaveBeenCalledTimes(1);
  });
});


describe("후속 분할 ID와 과밀 제안의 최신 원문", () => {
  it.each(["😀".repeat(128), "👨‍👩‍👧‍👦".repeat(23)])("유효한 긴 이모지 ID의 분석→분할은 UTF-16 상한과 원문을 보존한다", (id) => {
    const sample = getEpisodeHookPreset("overloaded-opening").cuts[0];
    const first = sample?.balloons[0];
    if (!sample || !first) throw new Error("필수 예제 없음");
    const cuts = [{ ...sample, id, balloons: [{ ...first, id, text: "가".repeat(80) }] }];
    const before = structuredClone(cuts);
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions[0];
    if (!suggestion) throw new Error("필수 제안 없음");
    const result = applySplitSuggestionToCuts(cuts, suggestion);
    expect(result.flatMap((cut) => cut.balloons.map((balloon) => balloon.text)).join("")).toBe("가".repeat(80));
    const ids = result.flatMap((cut) => [cut.id, ...cut.balloons.map((balloon) => balloon.id)]);
    expect(ids.every((value) => value.length <= 256)).toBe(true);
    expect(cuts).toEqual(before);
  });
  it.each(["😀".repeat(128), "👨‍👩‍👧‍👦".repeat(23)])("긴 컷 ID의 과밀 분할도 새 컷 ID 상한을 지킨다", (id) => {
    const sample = getEpisodeHookPreset("overloaded-opening").cuts[0];
    const first = sample?.balloons[0];
    if (!sample || !first) throw new Error("필수 예제 없음");
    const cuts = [{ ...sample, id, balloons: Array.from({ length: 4 }, (_, i) => ({ ...first, id: `b${i}`, text: `대사 ${i}` })) }];
    const before = structuredClone(cuts);
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions.find((item) => item.reason === "cut-over-4-balloons");
    if (!suggestion) throw new Error("필수 과밀 제안 없음");
    const result = applySplitSuggestionToCuts(cuts, suggestion);
    expect(result).toHaveLength(2);
    expect(result.every((cut) => cut.id.length <= 256)).toBe(true);
    expect(result.flatMap((cut) => cut.balloons)).toEqual(cuts[0]?.balloons);
    expect(cuts).toEqual(before);
  });
  it("ID stem은 가족 이모지를 중간에서 자르지 않고 충돌 접미사 예산을 남긴다", () => {
    const prefix = "a".repeat(195);
    const base = prefix + "👨‍👩‍👧‍👦".repeat(5);
    expect(base.length).toBeLessThanOrEqual(256);
    expect(uniqueEpisodeId(base, new Set([prefix, `${prefix}-2`]))).toBe(`${prefix}-3`);
  });
  it.each(["count", "id", "text", "speaker", "kind", "order"] as const)("과밀 제안 뒤 %s가 달라지면 기존 배열을 그대로 유지한다", (field) => {
    const sample = getEpisodeHookPreset("overloaded-opening").cuts[0];
    const first = sample?.balloons[0];
    if (!sample || !first) throw new Error("필수 예제 없음");
    const balloons = Array.from({ length: 4 }, (_, i) => ({ ...first, id: `b-${i}`, speaker: `화자 ${i}`, text: `짧은 대사 ${i}` }));
    const cuts = [{ ...sample, balloons }];
    const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions.find((item) => item.reason === "cut-over-4-balloons");
    if (!suggestion) throw new Error("필수 과밀 제안 없음");
    const editedBalloons = field === "count" ? balloons.slice(0, 2) : field === "order" ? [...balloons].reverse() : balloons.map((balloon, i) => i !== 0 ? balloon : {
      ...balloon, id: field === "id" ? "new-balloon-id" : balloon.id, text: field === "text" ? "최신 대사 🧑🏽‍🎨" : balloon.text,
      speaker: field === "speaker" ? "새 화자" : balloon.speaker, kind: field === "kind" ? "thought" as const : balloon.kind,
    });
    const edited = [{ ...sample, balloons: editedBalloons }];
    const before = structuredClone(edited);
    expect(applySplitSuggestionToCuts(edited, suggestion)).toBe(edited);
    expect(edited).toEqual(before);
    const normal = applySplitSuggestionToCuts(cuts, suggestion);
    expect(normal).toHaveLength(2);
    expect(normal.flatMap((cut) => cut.balloons)).toEqual(balloons);
  });
});


it.each(["ko", "en"] as const)("4096 UTF-16 %s 컷 설명의 정상 감사→분할은 원문을 보존한다", (locale) => {
  const sample = getEpisodeHookPreset("overloaded-opening").cuts[0];
  const first = sample?.balloons[0];
  if (!sample || !first) throw new Error("필수 예제 없음");
  const cut = { ...sample, labelKo: locale === "ko" ? "가".repeat(4096) : sample.labelKo,
    labelEn: locale === "en" ? "e".repeat(4096) : sample.labelEn,
    balloons: Array.from({ length: 4 }, (_, i) => ({ ...first, id: `b${i}`, text: `대사 ${i}` })) };
  const cuts = [cut];
  const before = structuredClone(cuts);
  const suggestion = analyzeEpisodeHookAndDensity({ cuts }).splitSuggestions.find((item) => item.reason === "cut-over-4-balloons");
  if (!suggestion) throw new Error("필수 과밀 제안 없음");
  const result = applySplitSuggestionToCuts(cuts, suggestion);
  expect(result).toHaveLength(2);
  expect(result[1]?.labelKo).toBe(locale === "ko" ? cut.labelKo : `${cut.labelKo} (분할 컷)`);
  expect(result[1]?.labelEn).toBe(locale === "en" ? cut.labelEn : `${cut.labelEn} (Split Cut)`);
  expect(result[0]?.labelKo).toBe(cut.labelKo);
  expect(result[0]?.labelEn).toBe(cut.labelEn);
  expect(result.flatMap((item) => item.balloons)).toEqual(cut.balloons);
  expect(cuts).toEqual(before);
});
