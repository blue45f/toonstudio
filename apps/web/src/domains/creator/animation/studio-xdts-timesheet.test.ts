import { describe, expect, it } from "vitest";

import { createEmptyAnimationTimelineDoc } from "../studio-anim-tracks";

import {
  XDTS_FIELD_IDS,
  XDTS_MAGIC_HEADER,
  XDTS_SYMBOLS,
  animationTimelineDocToXdts,
  batchAssignTrackCels,
  normalizeCelsByTimelineOrder,
  parseXdtsTimesheet,
  serializeXdtsTimesheet,
  xdtsFieldIdToKind,
  xdtsFieldKindToId,
} from "./studio-xdts-timesheet";

import type { StudioAnimFrame } from "../studio-frame-animation";

function makeCel(id: string): StudioAnimFrame {
  return { id, src: `data:image/png;base64,${id}` };
}

const SAMPLE_XDTS = `${XDTS_MAGIC_HEADER}
{
  "header": {
    "cut": "012",
    "scene": "03"
  },
  "timeTables": [
    {
      "duration": 8,
      "fields": [
        {
          "fieldId": 0,
          "tracks": [
            {
              "frames": [
                { "data": [{ "id": 0, "values": ["1"] }], "frame": 0 },
                { "data": [{ "id": 0, "values": ["SYMBOL_TICK_1"] }], "frame": 1 },
                { "data": [{ "id": 0, "values": ["SYMBOL_HYPHEN"] }], "frame": 2 },
                { "data": [{ "id": 0, "values": ["2"] }], "frame": 3 },
                { "data": [{ "id": 0, "values": ["SYMBOL_TICK_2"] }], "frame": 4 },
                { "data": [{ "id": 0, "values": ["SYMBOL_NULL_CELL"] }], "frame": 6 },
                { "data": [{ "id": 0, "values": ["3"] }], "frame": 7 }
              ],
              "trackNo": 0
            }
          ]
        },
        {
          "fieldId": 3,
          "tracks": [
            {
              "frames": [
                { "data": [{ "id": 0, "values": ["안녕!"] }], "frame": 2 }
              ],
              "trackNo": 0
            }
          ]
        },
        {
          "fieldId": 5,
          "tracks": [
            {
              "frames": [
                { "data": [{ "id": 0, "values": ["PAN UP"] }], "frame": 0 }
              ],
              "trackNo": 0
            }
          ]
        }
      ],
      "name": "A파트_컷12",
      "timeTableHeaders": [
        { "fieldId": 0, "names": ["A셀"] },
        { "fieldId": 3, "names": ["대사"] },
        { "fieldId": 5, "names": ["카메라"] }
      ]
    }
  ],
  "version": 5
}
`;

describe("studio-xdts-timesheet — XDTS 파서 및 직렬화기", () => {
  it("표준 XDTS v5 헤더, 필드(cell=0, dialog=3, camera=5), 홀드·빈셀·중할 마크를 정확히 파싱한다", () => {
    const parsed = parseXdtsTimesheet(SAMPLE_XDTS);
    expect(parsed.version).toBe(5);
    expect(parsed.header).toEqual({ cut: "012", scene: "03" });
    expect(parsed.timeTables).toHaveLength(1);

    const tt = parsed.timeTables[0]!;
    expect(tt.name).toBe("A파트_컷12");
    expect(tt.duration).toBe(8);
    expect(tt.fields.map((f) => f.fieldId)).toEqual([
      XDTS_FIELD_IDS.cell,
      XDTS_FIELD_IDS.dialog,
      XDTS_FIELD_IDS.camera,
    ]);
    expect(xdtsFieldIdToKind(0)).toBe("cell");
    expect(xdtsFieldIdToKind(3)).toBe("dialog");
    expect(xdtsFieldIdToKind(5)).toBe("camera");
    expect(xdtsFieldKindToId("cell")).toBe(0);
    expect(xdtsFieldKindToId("dialog")).toBe(3);
    expect(xdtsFieldKindToId("camera")).toBe(5);

    expect(tt.resolvedCellExposures).toEqual([
      {
        trackNo: 0,
        trackName: "A셀",
        celLabel: "1",
        startFrame: 0,
        endFrame: 2,
        durationFrames: 3,
        inbetweenTicks: [{ frame: 1, symbol: XDTS_SYMBOLS.tick1 }],
      },
      {
        trackNo: 0,
        trackName: "A셀",
        celLabel: "2",
        startFrame: 3,
        endFrame: 5,
        durationFrames: 3,
        inbetweenTicks: [{ frame: 4, symbol: XDTS_SYMBOLS.tick2 }],
      },
      {
        trackNo: 0,
        trackName: "A셀",
        celLabel: "3",
        startFrame: 7,
        endFrame: 7,
        durationFrames: 1,
        inbetweenTicks: [],
      },
    ]);
  });

  it("직렬화 후 재파싱 시 손실 없이 왕복(round-trip) 일치한다", () => {
    const first = parseXdtsTimesheet(SAMPLE_XDTS);
    const serialized = serializeXdtsTimesheet(first);
    expect(serialized.startsWith(`${XDTS_MAGIC_HEADER}\n`)).toBe(true);
    expect(serialized).toContain(XDTS_SYMBOLS.nullCell);
    expect(serialized).toContain(XDTS_SYMBOLS.hyphen);
    expect(serialized).toContain(XDTS_SYMBOLS.tick1);
    expect(serialized).toContain(XDTS_SYMBOLS.tick2);

    const second = parseXdtsTimesheet(serialized);
    expect(second).toEqual(first);
  });

  it("잘못된 헤더나 미지원 버전은 명확한 한국어 오류를 던진다", () => {
    expect(() => parseXdtsTimesheet("wrong header\n{\"version\":5,\"timeTables\":[]}")).toThrow("헤더");
    expect(() =>
      parseXdtsTimesheet(`${XDTS_MAGIC_HEADER}\n{"version":4,"timeTables":[{"duration":4,"name":"x"}]}`),
    ).toThrow("버전");
    expect(() => parseXdtsTimesheet(XDTS_MAGIC_HEADER)).toThrow("구분");
  });

  it("AnimationTimelineDoc을 XDTS 문서로 변환하고 홀드 하이픈을 생성한다", () => {
    let doc = createEmptyAnimationTimelineDoc(6, 12);
    doc = batchAssignTrackCels(doc, {
      trackId: "layer-a",
      cels: [makeCel("1"), makeCel("2")],
      startFrame: 0,
      holdFrames: 3,
    });
    const xdts = animationTimelineDocToXdts(doc, {
      name: "테스트 컷",
      header: { cut: "001" },
      trackLabels: { "layer-a": "원화A" },
    });
    const reparsed = parseXdtsTimesheet(serializeXdtsTimesheet(xdts));
    expect(reparsed.timeTables[0]!.resolvedCellExposures).toEqual([
      {
        trackNo: 0,
        trackName: "원화A",
        celLabel: "1",
        startFrame: 0,
        endFrame: 2,
        durationFrames: 3,
        inbetweenTicks: [],
      },
      {
        trackNo: 0,
        trackName: "원화A",
        celLabel: "2",
        startFrame: 3,
        endFrame: 5,
        durationFrames: 3,
        inbetweenTicks: [],
      },
    ]);
  });
});

describe("batchAssignTrackCels & normalizeCelsByTimelineOrder", () => {
  it("등간격 홀드와 loopToEnd 옵션으로 트랙에 셀을 일괄 배치한다", () => {
    const base = createEmptyAnimationTimelineDoc(10, 12);
    const assigned = batchAssignTrackCels(base, {
      trackId: "track-1",
      cels: [makeCel("celA"), makeCel("celB")],
      startFrame: 1,
      endFrame: 8,
      holdFrames: 2,
      loopToEnd: true,
    });
    const track = assigned.tracks["track-1"]!;
    expect(track.map((k) => [k.frameIndex, k.frame.id])).toEqual([
      [1, "celA"],
      [3, "celB"],
      [5, "celA"],
      [7, "celB"],
    ]);
  });

  it("타임라인 등장 순서대로 셀 번호를 정규화하며 반복 참조된 동일 셀의 번호를 보존한다", () => {
    const base = createEmptyAnimationTimelineDoc(12, 12);
    const messy = batchAssignTrackCels(base, {
      trackId: "track-1",
      cels: [makeCel("draft_9"), makeCel("draft_2"), makeCel("draft_9"), makeCel("draft_5")],
      startFrame: 0,
      holdFrames: 2,
    });

    const { doc: normalized, renamedMap } = normalizeCelsByTimelineOrder(messy, "track-1", {
      prefix: "A",
    });
    expect(Object.fromEntries(renamedMap)).toEqual({
      draft_9: "A1",
      draft_2: "A2",
      draft_5: "A3",
    });
    expect(normalized.tracks["track-1"]!.map((k) => k.frame.id)).toEqual(["A1", "A2", "A1", "A3"]);
  });
});
