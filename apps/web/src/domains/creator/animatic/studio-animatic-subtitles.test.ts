import { describe, expect, it } from "vitest";

import {
  createStudioAnimaticFromPages,
  type StudioAnimaticDocument,
  type StudioAnimaticPageLike,
} from "../studio-animatic-timeline";
import { resolveStudioAnimaticError } from "../status-i18n/studio-producer-error-i18n";
import {
  applyStudioAnimaticSubtitleTiming,
  buildStudioAnimaticSubtitleFile,
  buildStudioAnimaticSubtitleTrack,
  exportStudioAnimaticSubtitlesToSrt,
  exportStudioAnimaticSubtitlesToVtt,
  formatStudioAnimaticSubtitleTimestamp,
  parseStudioAnimaticSubtitles,
  retimeStudioAnimaticSubtitleCue,
  shiftStudioAnimaticSubtitleTrack,
} from "./studio-animatic-subtitles";

const PAGES: StudioAnimaticPageLike[] = [
  {
    id: "page-1",
    name: "오프닝",
    canvasH: 1_200,
    elements: [
      { id: "frame-top", type: "frame", x: 20, y: 20, width: 680, height: 500 },
      { id: "sfx-top", type: "text", x: 100, y: 120, width: 180, height: 80, text: "쾅!", name: "효과음" },
      { id: "frame-bottom", type: "frame", x: 20, y: 600, width: 680, height: 500 },
      { id: "bubble-bottom", type: "bubble", x: 100, y: 700, width: 200, height: 100, text: "두 번째 대사", speaker: "유나" },
    ],
  },
  {
    id: "page-2",
    name: "엔딩",
    canvasH: 900,
    elements: [{ id: "bubble-page", type: "bubble", text: "마지막 대사", speaker: "민수" }],
  },
];

function createDocument(): StudioAnimaticDocument {
  const created = createStudioAnimaticFromPages(PAGES, { workScope: "episode-01" });
  if (!created.ok) throw new Error(resolveStudioAnimaticError(created.error));
  return created.document;
}

describe("animatic subtitle track build", () => {
  it("converts episode dialogue cues to absolute-time subtitle cues inside their cuts", () => {
    const track = buildStudioAnimaticSubtitleTrack(createDocument());
    expect(track.ok).toBe(true);
    if (!track.ok) return;
    // 효과음은 기본 제외, 대사 2개만. 컷 시작 2400·5200 + cue offset 1400.
    expect(track.cues).toHaveLength(2);
    expect(track.cues[0]).toMatchObject({
      text: "두 번째 대사",
      speaker: "유나",
      startMs: 3_800,
      endMs: 5_000,
      segmentIndex: 1,
    });
    expect(track.cues[1]).toMatchObject({ text: "마지막 대사", speaker: "민수", startMs: 6_600, endMs: 7_800 });
    for (const cue of track.cues) expect(cue.endMs).toBeGreaterThan(cue.startMs);
  });

  it("includes sfx cues only when requested", () => {
    const track = buildStudioAnimaticSubtitleTrack(createDocument(), { includeSfx: true });
    expect(track.ok).toBe(true);
    if (!track.ok) return;
    expect(track.cues.map((cue) => cue.kind)).toEqual(["sfx", "dialogue", "dialogue"]);
    expect(track.cues[0]).toMatchObject({ text: "쾅!", startMs: 1_200 });
  });

  it("returns an empty track for an episode without dialogue", () => {
    const created = createStudioAnimaticFromPages([{ id: "p1", name: "무대사" }], { workScope: "ep-02" });
    if (!created.ok) throw new Error(resolveStudioAnimaticError(created.error));
    const track = buildStudioAnimaticSubtitleTrack(created.document);
    expect(track.ok).toBe(true);
    if (!track.ok) return;
    expect(track.cues).toEqual([]);
    expect(exportStudioAnimaticSubtitlesToSrt(track.cues)).toBe("");
    expect(exportStudioAnimaticSubtitlesToVtt(track.cues)).toBe("WEBVTT\n");
  });
});

describe("animatic subtitle export formats", () => {
  it("formats timestamps with comma for SRT and dot for WebVTT", () => {
    expect(formatStudioAnimaticSubtitleTimestamp(3_800, "srt")).toBe("00:00:03,800");
    expect(formatStudioAnimaticSubtitleTimestamp(3_800, "vtt")).toBe("00:00:03.800");
    expect(formatStudioAnimaticSubtitleTimestamp(3_661_007, "srt")).toBe("01:01:01,007");
  });

  it("exports numbered SRT blocks with speaker prefixes", () => {
    const file = buildStudioAnimaticSubtitleFile(createDocument(), "srt");
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    expect(file.content).toBe(
      "1\n00:00:03,800 --> 00:00:05,000\n유나: 두 번째 대사\n\n2\n00:00:06,600 --> 00:00:07,800\n민수: 마지막 대사\n"
    );
    expect(file.bytes).toBe(new TextEncoder().encode(file.content).byteLength);
  });

  it("exports WebVTT with a header and voice spans", () => {
    const file = buildStudioAnimaticSubtitleFile(createDocument(), "vtt");
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    expect(file.content).toBe(
      "WEBVTT\n\n1\n00:00:03.800 --> 00:00:05.000\n<v 유나>두 번째 대사</v>\n\n2\n00:00:06.600 --> 00:00:07.800\n<v 민수>마지막 대사</v>\n"
    );
  });
});

describe("animatic subtitle timing edits", () => {
  it("reflects retimed cues in the exported file", () => {
    const track = buildStudioAnimaticSubtitleTrack(createDocument());
    if (!track.ok) throw new Error("track");
    const target = track.cues[0]!;
    const edited = retimeStudioAnimaticSubtitleCue(track.cues, target.id, { startMs: 3_000, endMs: 4_500 });
    const file = buildStudioAnimaticSubtitleFile(createDocument(), "srt");
    expect(file.ok).toBe(true);
    const srt = exportStudioAnimaticSubtitlesToSrt(edited);
    expect(srt).toContain("00:00:03,000 --> 00:00:04,500");
    expect(srt).not.toContain("00:00:03,800 --> 00:00:05,000");
  });

  it("clamps overlaps and minimum duration when retiming into the next cue", () => {
    const track = buildStudioAnimaticSubtitleTrack(createDocument());
    if (!track.ok) throw new Error("track");
    const edited = retimeStudioAnimaticSubtitleCue(track.cues, track.cues[0]!.id, { endMs: 99_000 });
    expect(edited[0]!.endMs).toBeLessThanOrEqual(edited[1]!.startMs);
    const shrunk = retimeStudioAnimaticSubtitleCue(track.cues, track.cues[0]!.id, { endMs: 3_801 });
    expect(shrunk[0]!.endMs - shrunk[0]!.startMs).toBeGreaterThanOrEqual(400);
  });

  it("shifts the whole track and writes start times back into document cues", () => {
    const document = createDocument();
    const track = buildStudioAnimaticSubtitleTrack(document);
    if (!track.ok) throw new Error("track");
    const shifted = shiftStudioAnimaticSubtitleTrack(track.cues, 200);
    expect(shifted[0]!.startMs).toBe(4_000);
    const applied = applyStudioAnimaticSubtitleTiming(document, shifted);
    const segment = applied.segments[1]!;
    expect(segment.cues[0]!.offsetMs).toBe(1_600);
    // 문서 cue에는 끝 시각 필드가 없으므로 시작만 반영되고 나머지는 그대로다.
    expect(segment.cues[0]!.text).toBe("두 번째 대사");
  });
});

describe("animatic subtitle import round-trip", () => {
  it("parses its own SRT export back to the same timings, text and speakers", () => {
    const file = buildStudioAnimaticSubtitleFile(createDocument(), "srt");
    if (!file.ok) throw new Error("file");
    const parsed = parseStudioAnimaticSubtitles(file.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.format).toBe("srt");
    expect(parsed.cues).toEqual([
      { startMs: 3_800, endMs: 5_000, text: "두 번째 대사", speaker: "유나" },
      { startMs: 6_600, endMs: 7_800, text: "마지막 대사", speaker: "민수" },
    ]);
  });

  it("parses its own WebVTT export including voice speakers", () => {
    const file = buildStudioAnimaticSubtitleFile(createDocument(), "vtt");
    if (!file.ok) throw new Error("file");
    const parsed = parseStudioAnimaticSubtitles(file.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.format).toBe("vtt");
    expect(parsed.cues[0]).toEqual({ startMs: 3_800, endMs: 5_000, text: "두 번째 대사", speaker: "유나" });
  });

  it("rejects content without readable cues", () => {
    const parsed = parseStudioAnimaticSubtitles("자막이 아닌 메모\n그냥 텍스트");
    expect(parsed.ok).toBe(false);
  });
});
