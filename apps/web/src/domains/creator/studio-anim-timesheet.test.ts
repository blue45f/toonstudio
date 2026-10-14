import { describe, expect, it } from "vitest";

import {
  deriveStudioAnimTimesheet,
  formatTimesheetFrameRange,
  renderStudioAnimTimesheetPrintHtml,
  renderStudioAnimTimesheetSvg,
  renderStudioAnimTimesheetText,
} from "./studio-anim-timesheet";
import { resolveTrackFrameAt, type AnimationTimelineDoc } from "./studio-anim-tracks";

function cel(id: string): { id: string; src: string } {
  return { id, src: `data:image/png;base64,${id}` };
}

// 12fps · 12프레임. 트랙 A: 셀 3장(0, 4, 9) → 구간 0–3 / 4–8 / 9–11.
// 트랙 B: 첫 키프레임이 2 → 앞 0–1은 빈칸, 구간 2–11. 클립 "도입부" 3–8(활성).
const doc: AnimationTimelineDoc = {
  fps: 12,
  frameCount: 12,
  tracks: {
    "track-a": [
      { frameIndex: 0, frame: cel("cel-a1") },
      { frameIndex: 4, frame: cel("cel-a2"), ease: "ease-in" },
      { frameIndex: 9, frame: cel("cel-a3") },
    ],
    "track-b": [{ frameIndex: 2, frame: cel("cel-b1") }],
  },
  clips: [{ id: "clip-1", name: "도입부", startFrame: 3, endFrame: 8 }],
  activeClipId: "clip-1",
};

const labels = [
  { id: "track-a", label: "캐릭터" },
  { id: "track-b", label: "배경" },
];

describe("deriveStudioAnimTimesheet", () => {
  it("키프레임 배치를 held-until-next 구간으로 정확히 도출한다", () => {
    const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels });

    expect(sheet.fps).toBe(12);
    expect(sheet.frameCount).toBe(12);
    expect(sheet.totalSeconds).toBe(1);
    expect(sheet.scope).toBe("all");
    expect(sheet.totalSegments).toBe(4);

    const [a, b] = sheet.tracks;
    expect(a!.label).toBe("캐릭터");
    expect(a!.segments.map((s) => [s.startFrame, s.endFrame, s.durationFrames])).toEqual([
      [0, 3, 4],
      [4, 8, 5],
      [9, 11, 3],
    ]);
    expect(a!.segments.map((s) => s.celIndex)).toEqual([1, 2, 3]);
    expect(a!.segments.map((s) => s.celId)).toEqual(["cel-a1", "cel-a2", "cel-a3"]);
    expect(a!.exposedFrames).toBe(12);

    // 트랙 B는 첫 키프레임 앞(0–1)이 빈칸이라 구간이 2부터 시작한다.
    expect(b!.segments).toHaveLength(1);
    expect(b!.segments[0]).toMatchObject({ startFrame: 2, endFrame: 11, durationFrames: 10 });
    expect(b!.exposedFrames).toBe(10);
  });

  it("도출 구간이 resolveTrackFrameAt의 프레임별 해석과 한 프레임도 어긋나지 않는다", () => {
    const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels });
    for (const row of sheet.tracks) {
      const track = doc.tracks[row.trackId]!;
      for (let frame = 0; frame < doc.frameCount; frame += 1) {
        const resolved = resolveTrackFrameAt(track, frame);
        const segment = row.segments.find((s) => frame >= s.startFrame && frame <= s.endFrame);
        if (resolved === null) {
          expect(segment, `${row.trackId} frame ${frame}`).toBeUndefined();
        } else {
          expect(segment?.celId, `${row.trackId} frame ${frame}`).toBe(resolved.id);
        }
      }
    }
  });

  it("초 단위와 이징, 겹치는 클립 이름을 구간에 함께 도출한다", () => {
    const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels });
    const second = sheet.tracks[0]!.segments[1]!;

    expect(second.startSeconds).toBeCloseTo(4 / 12, 3);
    expect(second.durationSeconds).toBeCloseTo(5 / 12, 3);
    expect(second.ease).toBe("ease-in");
    expect(second.clipNames).toEqual(["도입부"]);
    // 클립과 겹치지 않는 마지막 구간은 빈 목록.
    expect(sheet.tracks[0]!.segments[2]!.clipNames).toEqual([]);
  });

  it("클립 구간 행을 길이·활성 표시와 함께 도출한다", () => {
    const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels });
    expect(sheet.clips).toHaveLength(1);
    expect(sheet.clips[0]).toMatchObject({
      clipId: "clip-1",
      name: "도입부",
      startFrame: 3,
      endFrame: 8,
      durationFrames: 6,
      isActive: true,
    });
  });

  it("active-clip scope는 활성 클립 구간으로 구간을 자르고 셀 번호는 전체 기준으로 유지한다", () => {
    const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels, scope: "active-clip" });

    expect(sheet.scope).toBe("active-clip");
    expect(sheet.activeClipName).toBe("도입부");
    expect([sheet.windowStartFrame, sheet.windowEndFrame]).toEqual([3, 8]);
    expect(sheet.tracks[0]!.segments.map((s) => [s.celIndex, s.startFrame, s.endFrame])).toEqual([
      [1, 3, 3],
      [2, 4, 8],
    ]);
    expect(sheet.tracks[1]!.segments.map((s) => [s.startFrame, s.endFrame])).toEqual([[3, 8]]);
  });

  it("활성 클립이 없으면 active-clip scope도 전체 범위로 폴백한다", () => {
    const sheet = deriveStudioAnimTimesheet(
      { fps: 12, frameCount: 12, tracks: doc.tracks },
      { scope: "active-clip" },
    );
    expect(sheet.scope).toBe("all");
    expect(sheet.activeClipName).toBeNull();
    expect([sheet.windowStartFrame, sheet.windowEndFrame]).toEqual([0, 11]);
  });

  it("키프레임 없는 트랙·빈 문서도 빈 표로 안전하게 도출한다", () => {
    const sheet = deriveStudioAnimTimesheet(
      { fps: 24, frameCount: 24, tracks: {} },
      { tracks: [{ id: "ghost", label: "빈 레이어" }] },
    );
    expect(sheet.totalSegments).toBe(0);
    expect(sheet.tracks[0]).toMatchObject({ label: "빈 레이어", exposedFrames: 0 });
    expect(sheet.tracks[0]!.segments).toEqual([]);
  });
});

describe("timesheet renderers", () => {
  const sheet = deriveStudioAnimTimesheet(doc, { tracks: labels });

  it("텍스트 표에 트랙·구간·클립 행이 정확한 프레임 표기로 들어간다", () => {
    const text = renderStudioAnimTimesheetText(sheet);
    expect(text).toContain("타임시트(노출표)");
    expect(text).toContain("[트랙] 캐릭터");
    expect(text).toContain("셀 2 | 5–9f | 5프레임");
    expect(text).toContain("[클립 구간]");
    expect(text).toContain("도입부 | 4–9f | 6프레임");
    expect(text).toContain("활성");
  });

  it("인쇄 HTML 표에 같은 구간이 들어가고 라벨 특수문자를 이스케이프한다", () => {
    const html = renderStudioAnimTimesheetPrintHtml(
      deriveStudioAnimTimesheet(doc, { tracks: [{ id: "track-a", label: "<b>캐릭터</b>" }] }),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("5–9f");
    expect(html).toContain("&lt;b&gt;캐릭터&lt;/b&gt;");
    expect(html).not.toContain("<b>캐릭터</b>");
    expect(html).toContain("@page");
  });

  it("SVG 이미지에 셀 블록과 클립 밴드가 프레임 위치대로 그려진다", () => {
    const svg = renderStudioAnimTimesheetSvg(sheet);
    expect(svg).toContain("<svg");
    expect(svg).toContain("도입부");
    expect(svg).toContain("캐릭터");
    // 셀 2 구간(4–8프레임, 5칸 × 20px = 100px 폭 블록)이 존재한다.
    expect(svg).toContain('width="100"');
  });

  it("formatTimesheetFrameRange는 1-based로 표기한다", () => {
    expect(formatTimesheetFrameRange(0, 5)).toBe("1–6f");
  });
});
