import { describe, expect, it } from "vitest";

import {
  addTimeline,
  clipAtFrame,
  createAnimTimeline,
  createTimelineSet,
  deriveTimesheet,
  duplicateTimeline,
  durationsToClips,
  framesToTimelineSet,
  fromAnimationGraph,
  getActiveTimeline,
  moveClip,
  normalizeTimelineSet,
  parseTimelineSet,
  removeTimeline,
  renameTimeline,
  resolveTimelineFrame,
  resolveTimelineSet,
  serializeTimelineSet,
  setActiveTimeline,
  setClipDuration,
  timelineToAnimationGraph,
  timelineToFrames,
  updateTimelineSettings,
  validateTimelineSet,
  type AnimCelClip,
  type AnimTimelineSet,
} from "./studio-anim-timelines";
import type { StudioAnimFrame } from "./studio-frame-animation";

let seq = 0;
function nextId(kind: string): string {
  seq += 1;
  return `${kind}-${seq}`;
}

function baseSet(): AnimTimelineSet {
  return createTimelineSet({ timelineId: "tl-1", name: "메인", fps: 12, lengthFrames: 24 });
}

function clip(id: string, celId: string, startFrame: number, durationFrames: number): AnimCelClip {
  return { id, cel: { kind: "frame", id: celId, label: celId }, startFrame, durationFrames };
}

describe("다중 타임라인 집합", () => {
  it("타임라인 2개를 만들어 이름으로 전환할 수 있다", () => {
    let set = baseSet();
    set = addTimeline(set, createAnimTimeline({ id: "tl-2", name: "대체 연출", fps: 12, lengthFrames: 12 }));
    expect(set.timelines).toHaveLength(2);
    expect(getActiveTimeline(set)?.id).toBe("tl-2"); // 추가 직후가 활성
    set = setActiveTimeline(set, "tl-1");
    expect(getActiveTimeline(set)?.name).toBe("메인");
    expect(setActiveTimeline(set, "없는-id")).toBe(set);
  });

  it("이름이 겹치면 자동으로 번호를 붙이고, rename의 중복은 거부한다", () => {
    let set = baseSet();
    set = addTimeline(set, createAnimTimeline({ id: "tl-2", name: "메인" }));
    expect(set.timelines[1]?.name).toBe("메인 2");
    expect(renameTimeline(set, "tl-2", "메인")).toBe(set);
    expect(renameTimeline(set, "tl-2", "  엔딩  ")?.timelines[1]?.name).toBe("엔딩");
  });

  it("상한(8개)을 넘겨 추가할 수 없고 마지막 1개는 지울 수 없다", () => {
    let set = baseSet();
    for (let i = 2; i <= 8; i += 1) {
      set = addTimeline(set, createAnimTimeline({ id: `tl-${i}`, name: `T${i}` }));
    }
    expect(set.timelines).toHaveLength(8);
    expect(addTimeline(set, createAnimTimeline({ id: "tl-9", name: "T9" }))).toBe(set);
    const single = baseSet();
    expect(removeTimeline(single, "tl-1")).toBe(single);
  });

  it("활성 타임라인을 지우면 이웃이 활성이 된다", () => {
    let set = baseSet();
    set = addTimeline(set, createAnimTimeline({ id: "tl-2", name: "B" }));
    set = setActiveTimeline(set, "tl-2");
    set = removeTimeline(set, "tl-2");
    expect(getActiveTimeline(set)?.id).toBe("tl-1");
  });

  it("복제는 트랙·클립까지 새 id로 깊은 복사하고 원본과 독립이다", () => {
    let set = baseSet();
    const timeline = set.timelines[0]!;
    const withClip: AnimTimelineSet = {
      ...set,
      timelines: [{ ...timeline, tracks: [{ id: "tr-1", name: "레이어 1", clips: [clip("c-1", "f-1", 0, 4)] }] }],
    };
    const copied = duplicateTimeline(withClip, "tl-1", (kind) => nextId(kind));
    const copy = getActiveTimeline(copied)!;
    expect(copy.id).not.toBe("tl-1");
    expect(copy.name).toBe("메인 2");
    expect(copy.tracks[0]?.clips[0]?.cel.id).toBe("f-1");
    expect(copy.tracks[0]?.clips[0]?.id).not.toBe("c-1");
    const moved = moveClip(copy, copy.tracks[0]!.id, copy.tracks[0]!.clips[0]!.id, 10);
    expect(moved.tracks[0]?.clips[0]?.startFrame).toBe(10);
    expect(getActiveTimeline(withClip)?.tracks[0]?.clips[0]?.startFrame).toBe(0);
  });
});

describe("저장 / 재열기", () => {
  it("직렬화 → 파싱 왕복에서 타임라인 2개와 활성이 그대로 돌아온다", () => {
    let set = baseSet();
    set = addTimeline(set, createAnimTimeline({ id: "tl-2", name: "대체 연출" }));
    set = setActiveTimeline(set, "tl-1");
    const reopened = parseTimelineSet(JSON.stringify(serializeTimelineSet(set)));
    expect(reopened).toEqual(set);
  });

  it("깨진 저장값은 null이고 resolveTimelineSet이 레거시 프레임으로 폴백한다", () => {
    expect(parseTimelineSet("{oops")).toBeNull();
    expect(normalizeTimelineSet({ timelines: [] })).toBeNull();
    const frames: StudioAnimFrame[] = [{ id: "f-1", src: "data:f-1" }];
    const resolved = resolveTimelineSet(null, { frames, fps: 12 }, {
      timelineId: () => "tl-new",
      trackId: () => "tr-new",
      makeClipId: (i) => `clip-${i}`,
    });
    expect(resolved.timelines[0]?.tracks[0]?.clips[0]?.cel.id).toBe("f-1");
  });

  it("정규화는 범위 밖 클립을 클램프하고 중복 이름을 푼다", () => {
    const normalized = normalizeTimelineSet({
      activeTimelineId: "a",
      timelines: [
        {
          id: "a", name: "같은 이름", fps: 12, lengthFrames: 10,
          tracks: [{ id: "t", name: "레이어", clips: [{ id: "c", cel: { kind: "frame", id: "f", label: "f" }, startFrame: 8, durationFrames: 99 }] }],
        },
        { id: "b", name: "같은 이름", fps: 12, lengthFrames: 10, tracks: [] },
      ],
    });
    expect(normalized?.timelines[0]?.tracks[0]?.clips[0]?.durationFrames).toBe(2);
    expect(normalized?.timelines[1]?.name).toBe("같은 이름 2");
    expect(validateTimelineSet(normalized!).filter((i) => i.code === "duplicate-name")).toHaveLength(0);
  });
});

describe("레거시 프레임 마이그레이션", () => {
  const frames: StudioAnimFrame[] = [
    { id: "f-1", src: "data:f-1" }, // durationMs 없음 → 12fps 균등 1프레임
    { id: "f-2", src: "data:f-2", durationMs: 250 }, // 12fps → 3프레임
    { id: "f-3", src: "data:f-3", durationMs: 100 }, // 12fps → 1프레임(반올림)
  ];

  it("durationMs 나열이 durationsToClips 규칙으로 연속 클립이 된다", () => {
    const clips = durationsToClips(
      frames.map((f) => ({ cel: { kind: "frame" as const, id: f.id, label: f.id }, durationMs: f.durationMs ?? 1000 / 12 })),
      12,
      (i) => `clip-${i}`,
    );
    expect(clips.map((c) => [c.startFrame, c.durationFrames])).toEqual([[0, 1], [1, 3], [4, 1]]);
  });

  it("framesToTimelineSet → timelineToFrames 왕복에서 순서·노출이 보존된다", () => {
    const set = framesToTimelineSet(frames, {
      timelineId: "tl-1", trackId: "tr-1", fps: 12, makeClipId: (i) => `clip-${i}`,
    });
    const timeline = getActiveTimeline(set)!;
    expect(timeline.lengthFrames).toBe(5);
    const back = timelineToFrames(timeline, new Map(frames.map((f) => [f.id, f.src])));
    expect(back.map((f) => f.id)).toEqual(["f-1", "f-2", "f-3"]);
    expect(back.map((f) => f.durationMs)).toEqual([83, 250, 83]);
    expect(back[1]?.src).toBe("data:f-2");
  });
});

describe("해석 · 편집 · 타임시트", () => {
  it("겹침에서는 시작이 늦은 클립이 이기고 muted 트랙은 빠진다", () => {
    const timeline = createAnimTimeline({
      id: "tl", fps: 12, lengthFrames: 12,
      tracks: [
        { id: "t-1", name: "A", clips: [clip("c-1", "f-1", 0, 6), clip("c-2", "f-2", 3, 6)] },
        { id: "t-2", name: "B", muted: true, clips: [clip("c-3", "f-3", 0, 12)] },
      ],
    });
    expect(clipAtFrame(timeline.tracks[0]!, 4)?.id).toBe("c-2");
    expect(resolveTimelineFrame(timeline, 4).map((r) => r.trackId)).toEqual(["t-1"]);
    expect(resolveTimelineFrame(timeline, 12)).toEqual([]);
  });

  it("길이를 줄여도 클립이 잘리는 지점 아래로는 줄지 않는다", () => {
    let set = baseSet();
    const timeline = set.timelines[0]!;
    set = {
      ...set,
      timelines: [{ ...timeline, tracks: [{ id: "tr-1", name: "레이어 1", clips: [clip("c-1", "f-1", 0, 20)] }] }],
    };
    const shrunk = updateTimelineSettings(set, "tl-1", { lengthFrames: 4 });
    expect(shrunk.timelines[0]?.lengthFrames).toBe(20);
    const moved = moveClip(shrunk.timelines[0]!, "tr-1", "c-1", 999);
    expect(moved.tracks[0]?.clips[0]?.startFrame).toBe(0); // 길이 20 - 노출 20
    expect(setClipDuration(moved, "tr-1", "c-1", 3).tracks[0]?.clips[0]?.durationFrames).toBe(3);
  });

  it("타임시트는 트랙 순서·시작 순으로 행을 편다", () => {
    const timeline = createAnimTimeline({
      id: "tl", fps: 12, lengthFrames: 12,
      tracks: [{ id: "t", name: "A", clips: [clip("c-2", "f-2", 4, 2), clip("c-1", "f-1", 0, 4)] }],
    });
    expect(deriveTimesheet(timeline).map((r) => [r.celLabel, r.startFrame, r.endFrame])).toEqual([
      ["f-1", 0, 4],
      ["f-2", 4, 6],
    ]);
  });
});

describe("IR 정합", () => {
  it("timelineToAnimationGraph의 노출(hold 의미론)이 resolveTimelineFrame과 일치한다", () => {
    const timeline = createAnimTimeline({
      id: "tl", fps: 12, lengthFrames: 8,
      tracks: [{ id: "t-1", name: "A", clips: [clip("c-1", "f-1", 0, 3), clip("c-2", "f-2", 5, 3)] }],
    });
    const graph = timelineToAnimationGraph(timeline);
    expect(graph.durationFrames).toBe(8);
    expect(graph.exposures).toEqual([
      { frame: 0, levelId: "t-1", celId: "f-1" },
      { frame: 3, levelId: "t-1", celId: null },
      { frame: 5, levelId: "t-1", celId: "f-2" },
    ]);
    const roundTripped = fromAnimationGraph(graph, {
      timelineId: "tl", makeClipId: (_level, i) => `rc-${i}`,
    });
    for (let frame = 0; frame < 8; frame += 1) {
      const before = resolveTimelineFrame(timeline, frame)[0]?.clip.cel.id ?? null;
      const after = resolveTimelineFrame(roundTripped, frame)[0]?.clip.cel.id ?? null;
      expect(after).toBe(before);
    }
  });

  it("validateTimelineSet은 겹침·범위 초과를 쉬운 말로 보고한다", () => {
    const timeline = createAnimTimeline({
      id: "tl", fps: 12, lengthFrames: 6,
      tracks: [{ id: "t", name: "A", clips: [clip("c-1", "f-1", 0, 4), clip("c-2", "f-2", 2, 9)] }],
    });
    const issues = validateTimelineSet({ timelines: [timeline], activeTimelineId: "tl" });
    expect(issues.map((i) => i.code)).toContain("clip-overlap");
    expect(issues.map((i) => i.code)).toContain("clip-out-of-bounds");
  });
});
