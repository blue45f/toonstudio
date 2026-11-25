// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as audioEngine from "./audio-cue-director-engine";
import { StudioWebtoonAudioCuePanel } from "./StudioWebtoonAudioCuePanel";
import { buildEpisodeAudioCueSheet, exportAudioCueJson, exportAudioCueWebVtt, AUDIO_CUE_EPISODE_PRESETS, synthesizeKoreanLipSyncTimeline, type AudioCueCutInput, type EpisodeAudioCueSheetInput } from "./audio-cue-director-engine";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function cut(patch: Partial<AudioCueCutInput> = {}): AudioCueCutInput {
  return { id: "cut-one", label: "컷", speaker: "화자", dialogue: "밤", emotionTone: "calm", bgmMood: "mystery-pulse", panelHeightPx: 1000, ...patch };
}
function sheet(): ReturnType<typeof buildEpisodeAudioCueSheet> { return buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: [cut()] }); }
function clipboard(writeText?: (value: string) => Promise<void>): void { Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined }); }

function countInputCharacters(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value && typeof value === "object") return Object.values(value).reduce<number>((total, entry) => total + countInputCharacters(entry), 0);
  return 0;
}
function largeAudioInput(maximumCombination = false): EpisodeAudioCueSheetInput {
  const cuts = Array.from({ length: maximumCombination ? 64 : 16 }, (_, cutIndex) => ({
    id: `cut-${cutIndex}`, label: "컷", speaker: "화자", dialogue: "", emotionTone: "calm" as const,
    bgmMood: "mystery-pulse" as const, panelHeightPx: 1000,
    sfxMarkers: Array.from({ length: !maximumCombination && cutIndex === 0 ? 31 : 32 }, (_, markerIndex) => ({
      id: `marker-${cutIndex}-${markerIndex}`, category: "impact-hit" as const, offsetRatio01: 0.5,
      label: maximumCombination ? "가".repeat(2048) : "",
    })),
  }));
  const input = { episodeTitle: "제목", cuts };
  if (!maximumCombination) {
    let remaining = 1048576 - countInputCharacters(input);
    for (const item of cuts) {
      for (const marker of item.sfxMarkers) {
        const length = Math.min(2048, remaining);
        marker.label = "가".repeat(length);
        remaining -= length;
      }
    }
    expect(remaining).toBe(0);
  }
  return input;
}

describe("오디오 전체 원문 예산", () => {
  it("최대 64컷·32SFX·2048자 조합은 생성 전에 원문 총량으로 거부한다", () => {
    const input = largeAudioInput(true);
    const before = structuredClone(input);
    expect(() => buildEpisodeAudioCueSheet(input)).toThrow(/전체 원문/u);
    expect(input).toEqual(before);
  });
  it("전체 문자 한도까지는 생성·두 내보내기가 가능하고 1자 초과는 거부한다", () => {
    const input = largeAudioInput();
    expect(countInputCharacters(input)).toBe(1048576);
    const result = buildEpisodeAudioCueSheet(input);
    expect(() => exportAudioCueWebVtt(result)).not.toThrow();
    expect(() => exportAudioCueJson(result)).not.toThrow();
    expect(() => buildEpisodeAudioCueSheet({ ...input, episodeTitle: `${input.episodeTitle}!` })).toThrow(/전체 원문/u);
  });
  it("전체 문자 한도를 넘는 SFX 추가는 기존 큐시트와 댓글 초안을 유지한다", () => {
    const input = largeAudioInput();
    const preset = audioEngine.getAudioCueEpisodePreset("noir-rooftop-chase");
    vi.spyOn(audioEngine, "getAudioCueEpisodePreset").mockReturnValue({ ...preset, episodeTitle: input.episodeTitle, cuts: input.cuts });
    render(<StudioWebtoonAudioCuePanel />);
    const preview = screen.getByTestId("audio-cue-export-preview").textContent;
    fireEvent.change(screen.getByTestId("audio-cue-sfx-label-input"), { target: { value: "유지할 초안 👩🏽‍🎨" } });
    fireEvent.click(screen.getByTestId("audio-cue-add-sfx-btn"));
    expect(screen.getByTestId("audio-cue-status-banner").textContent).toMatch(/전체 원문/u);
    const draft = screen.getByTestId("audio-cue-sfx-label-input");
    if (!(draft instanceof HTMLInputElement)) throw new Error("SFX 초안 입력이 없습니다.");
    expect(draft.value).toBe("유지할 초안 👩🏽‍🎨");
    expect(screen.getByTestId("audio-cue-export-preview").textContent).toBe(preview);
  });
});

describe("오디오 큐 입력·내보내기 경계", () => {
  it("기본 WebVTT의 NOTE와 대사 큐를 별도 블록으로 출력한다", () => {
    const source = sheet();
    const blocks = exportAudioCueWebVtt(source).trimEnd().split(/\n\n+/u);
    const dialogueBlocks = blocks.filter((block) => /^\d+\n\d{2}:\d{2}:\d{2}\.\d{3} -->/u.test(block));
    expect(dialogueBlocks).toHaveLength(source.summary.spokenCutCount);
    expect(blocks.filter((block) => block.startsWith("NOTE")).every((block) => !block.includes("-->"))).toBe(true);
  });
  it("공백·개행·Unicode 원문을 변경하지 않고 JSON에 보존한다", () => {
    const dialogue = " \n밤 👩🏽‍🎨 <b>가자</b> & 기다려\n ";
    const input = { episodeTitle: "  제목  ", cuts: [cut({ dialogue, speaker: " 화자 👩🏽‍🎨 " })] };
    const before = structuredClone(input);
    const result = buildEpisodeAudioCueSheet(input);
    const json = JSON.parse(exportAudioCueJson(result));
    expect(result.cuts[0]?.lipSync.text).toBe(dialogue);
    expect(json.cuts[0]?.dialogue).toBe(dialogue);
    expect(json.cuts[0]?.speaker).toBe(input.cuts[0]?.speaker);
    expect(json.metadata.episodeTitle).toBe(input.episodeTitle);
    expect(input).toEqual(before);
    expect(exportAudioCueWebVtt(result)).toContain("&lt;b&gt;가자&lt;/b&gt; &amp; 기다려");
  });
  it.each([NaN, Infinity, 1e308, -1])("외부 타임라인 시작값 %s을 명시 거부한다", (startTimeMs) => {
    expect(() => synthesizeKoreanLipSyncTimeline({ text: "밤", startTimeMs })).toThrow();
  });
  it.each([NaN, Infinity, 1e308])("silent cut의 잘못된 길이 %s을 거부한다", (minCutDurationMs) => {
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: [cut({ dialogue: "", minCutDurationMs })] })).toThrow();
  });
  it("유한 초대형 높이·회차도 계산 전에 거부한다", () => {
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: [cut({ panelHeightPx: 1e308 })] })).toThrow();
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", episodeNumber: 1e308, cuts: [cut()] })).toThrow();
  });
  it("컷·대사·SFX의 자원 상한을 계산 전에 적용한다", () => {
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: Array.from({ length: 65 }, (_, index) => cut({ id: `cut-${index}`, dialogue: "" })) })).toThrow();
    expect(() => synthesizeKoreanLipSyncTimeline({ text: " ".repeat(513) })).toThrow();
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: [cut({ sfxMarkers: Array.from({ length: 33 }, (_, index) => ({ id: `sfx-${index}`, category: "impact-hit", label: "타격", offsetRatio01: 0.5 })) })] })).toThrow();
  });
  it("중복 컷·SFX ID를 거부하고 원본을 유지한다", () => {
    const input = { episodeTitle: "제목", cuts: [cut(), cut()] };
    const before = structuredClone(input);
    expect(() => buildEpisodeAudioCueSheet(input)).toThrow();
    expect(input).toEqual(before);
    const marker = { id: "same", category: "impact-hit" as const, label: "타격", offsetRatio01: 0.5 };
    expect(() => buildEpisodeAudioCueSheet({ episodeTitle: "제목", cuts: [cut({ sfxMarkers: [marker, marker] })] })).toThrow();
  });
  it.each([exportAudioCueWebVtt, exportAudioCueJson])("외부 결과의 NaN·파생 메타데이터 변조를 거부한다", (exporter) => {
    const original = sheet();
    expect(() => exporter({ ...original, totalDurationMs: NaN })).toThrow();
    expect(() => exporter({ ...original, summary: { ...original.summary, cutCount: 99 } })).toThrow();
    expect(() => exporter({ ...original, cuts: original.cuts.map((value) => ({ ...value, startTimeMs: 1e308 })) })).toThrow();
  });
  it("지원하지 않는 emoji의 REST 메타데이터도 서로게이트를 쪼개지 않는다", () => {
    const original = "👩🏽‍🎨";
    const result = synthesizeKoreanLipSyncTimeline({ text: original });
    expect(result.text).toBe(original);
    expect(result.segments[0]?.sourceChar).toBe("👩");
  });
  it("허용된 긴 대사도 유한한 프레임 예제로 계산한다", () => {
    const result = synthesizeKoreanLipSyncTimeline({ text: "밤".repeat(512), fps: 60, syllablesPerSecond: 1.5 });
    expect(result.frames.length).toBeGreaterThan(10000);
    expect(result.frames.length).toBeLessThanOrEqual(30000);
    expect(Number.isFinite(result.frames.at(-1)?.timeMs)).toBe(true);
  });
  it("빈 제목의 기존 표시와 입력 원문을 함께 보존한다", () => {
    const result = buildEpisodeAudioCueSheet({ episodeTitle: "  ", cuts: [] });
    expect(result.episodeTitle).toBe("무제 에피소드");
    expect(JSON.parse(exportAudioCueJson(result)).metadata.originalEpisodeTitle).toBe("  ");
  });

  it("정상 프리셋의 JSON과 VTT 내보내기는 원본을 바꾸지 않는다", () => {
    for (const preset of AUDIO_CUE_EPISODE_PRESETS) {
      const original = buildEpisodeAudioCueSheet(preset);
      const before = structuredClone(original);
      expect(exportAudioCueJson(original)).toContain('"dataSourceKind": "estimate"');
      expect(exportAudioCueWebVtt(original)).toContain("WEBVTT");
      expect(original).toEqual(before);
    }
  });
});

describe("오디오 큐 알림과 실제 클립보드 응답", () => {
  it("수신자 교체만으로 동일 결과를 다시 알리지 않는다", () => {
    const first = vi.fn(); const latest = vi.fn();
    const view = render(<StudioWebtoonAudioCuePanel onCueSheetChange={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    view.rerender(<StudioWebtoonAudioCuePanel onCueSheetChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
  });
  it("클립보드 미지원은 성공으로 표시하지 않고 재시도할 수 있다", async () => {
    clipboard();
    render(<StudioWebtoonAudioCuePanel />);
    fireEvent.click(screen.getByTestId("audio-cue-copy-vtt-btn"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("실패"));
    const write = vi.fn().mockResolvedValue(undefined); clipboard(write);
    fireEvent.click(screen.getByTestId("audio-cue-clipboard-retry"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("복사했습니다"));
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("복사 ACK 대기 중에는 중복 복사·성공 표시를 하지 않는다", async () => {
    let acknowledge: (() => void) | undefined;
    const write = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })); clipboard(write);
    render(<StudioWebtoonAudioCuePanel />);
    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("대기");
    await act(async () => { acknowledge?.(); });
    expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("복사했습니다");
  });
  it("알림 실패는 최신 수신자에게 같은 결과만 재시도하며 재복사하지 않는다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); clipboard(write);
    const first = vi.fn((_value: string) => { throw new Error("recipient rejected"); }); const latest = vi.fn();
    const view = render(<StudioWebtoonAudioCuePanel onCopyJson={first} />);
    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-json-status").textContent).toContain("실패"));
    const payload = first.mock.calls[0]?.[0];
    view.rerender(<StudioWebtoonAudioCuePanel onCopyJson={latest} />);
    fireEvent.click(screen.getByTestId("audio-cue-json-retry"));
    expect(latest).toHaveBeenCalledWith(payload);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("비동기 클립보드 거절 뒤에도 같은 원문으로 복사만 재시도한다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValue(undefined); clipboard(write);
    const callback = vi.fn();
    render(<StudioWebtoonAudioCuePanel onCopyJson={callback} />);
    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("실패"));
    const original = write.mock.calls[0]?.[0];
    fireEvent.click(screen.getByTestId("audio-cue-clipboard-retry"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-clipboard-status").textContent).toContain("복사했습니다"));
    expect(write).toHaveBeenLastCalledWith(original);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("큐시트 비동기 알림 실패는 최신 수신자에게 동일 결과로 재시도한다", async () => {
    const first = vi.fn(async (_value: ReturnType<typeof sheet>) => { throw new Error("receiver denied"); });
    const latest = vi.fn();
    const view = render(<StudioWebtoonAudioCuePanel onCueSheetChange={first} />);
    await waitFor(() => expect(screen.getByTestId("audio-cue-cue-status").textContent).toContain("실패"));
    const original = first.mock.calls[0]?.[0];
    view.rerender(<StudioWebtoonAudioCuePanel onCueSheetChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("audio-cue-cue-retry"));
    expect(latest).toHaveBeenCalledWith(original);
  });
  it("수신자가 제거된 재시도는 전달 완료로 표시하거나 재복사하지 않는다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); clipboard(write);
    const first = vi.fn(async () => { throw new Error("receiver denied"); });
    const view = render(<StudioWebtoonAudioCuePanel onCopyJson={first} />);
    fireEvent.click(screen.getByTestId("audio-cue-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("audio-cue-json-status").textContent).toContain("실패"));
    view.rerender(<StudioWebtoonAudioCuePanel />);
    fireEvent.click(screen.getByTestId("audio-cue-json-retry"));
    expect(screen.getByTestId("audio-cue-json-status").textContent).toContain("수신자 미연결");
    expect(write).toHaveBeenCalledTimes(1);
  });

});
