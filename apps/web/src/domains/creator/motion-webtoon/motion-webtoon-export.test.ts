import { describe, expect, it } from "vitest";

import {
  coverFitSize,
  motionExportFileName,
  motionExportMimeType,
  planMotionExportFrames,
  resolveMotionExportPlan,
  type MotionExportCapabilities,
} from "./motion-webtoon-export";
import {
  defaultCutBgmCue,
  defaultCutDirection,
  type MotionCut,
  type MotionEpisode,
} from "./motion-webtoon-model";

const BOTH: MotionExportCapabilities = { avc: true, vp: true };
const NONE: MotionExportCapabilities = { avc: false, vp: false };

describe("resolveMotionExportPlan — 포맷 선택", () => {
  it("GIF 요청은 역량과 무관하게 항상 GIF다", () => {
    for (const caps of [BOTH, NONE]) {
      const plan = resolveMotionExportPlan("gif", caps);
      expect(plan.format).toBe("gif");
      expect(plan.pipeline).toBe("gif");
      expect(plan.fellBack).toBe(false);
    }
  });

  it("MP4 요청: avc가 있으면 MP4, 없으면 WebM, 그것도 없으면 GIF로 폴백한다", () => {
    expect(resolveMotionExportPlan("mp4", BOTH)).toMatchObject({ format: "mp4", pipeline: "webcodecs-avc", fellBack: false });
    expect(resolveMotionExportPlan("mp4", { avc: false, vp: true })).toMatchObject({ format: "webm", pipeline: "webcodecs-vp", fellBack: true });
    expect(resolveMotionExportPlan("mp4", NONE)).toMatchObject({ format: "gif", pipeline: "gif", fellBack: true });
  });

  it("WebM 요청: vp가 있으면 WebM, 없으면 MP4, 그것도 없으면 GIF로 폴백한다", () => {
    expect(resolveMotionExportPlan("webm", BOTH)).toMatchObject({ format: "webm", pipeline: "webcodecs-vp", fellBack: false });
    expect(resolveMotionExportPlan("webm", { avc: true, vp: false })).toMatchObject({ format: "mp4", pipeline: "webcodecs-avc", fellBack: true });
    expect(resolveMotionExportPlan("webm", NONE)).toMatchObject({ format: "gif", pipeline: "gif", fellBack: true });
  });

  it("모든 계획에는 한/영 사유가 있다", () => {
    for (const caps of [BOTH, NONE, { avc: true, vp: false }, { avc: false, vp: true }]) {
      for (const format of ["gif", "mp4", "webm"] as const) {
        const plan = resolveMotionExportPlan(format, caps);
        expect(plan.reasonKo.length).toBeGreaterThan(0);
        expect(plan.reasonEn.length).toBeGreaterThan(0);
        expect(plan.requested).toBe(format);
      }
    }
  });
});

describe("파일명·MIME", () => {
  it("motionExportFileName은 `<제목>-motion.<확장자>` 규칙이다", () => {
    expect(motionExportFileName("나의 회차", "mp4")).toBe("나의 회차-motion.mp4");
    expect(motionExportFileName("", "gif")).toBe("toonstudio-motion.gif");
    expect(motionExportMimeType("webm")).toBe("video/webm");
    expect(motionExportMimeType("mp4")).toBe("video/mp4");
    expect(motionExportMimeType("gif")).toBe("image/gif");
  });
});

function cut(id: string, durationSeconds: number): MotionCut {
  return {
    id,
    imageUrl: `https://example.test/${id}.png`,
    altKo: id,
    altEn: id,
    direction: { ...defaultCutDirection(), durationSeconds },
    transitionIn: "cut",
    bgm: defaultCutBgmCue(),
    dialogues: [],
  };
}

function episode(cuts: MotionCut[]): MotionEpisode {
  return { id: "ep-1", titleKo: "회차", titleEn: "Episode", characters: [], cuts };
}

describe("planMotionExportFrames — 프레임 계획", () => {
  it("총 길이는 컷 길이 합과 같고 프레임 수는 fps × 길이이다", () => {
    const plan = planMotionExportFrames(episode([cut("a", 2), cut("b", 4)]), 10);
    expect(plan.durationSeconds).toBe(6);
    expect(plan.frames).toHaveLength(60);
    expect(plan.fps).toBe(10);
  });

  it("컷 경계에서 cutIndex가 바뀌고 로컬 시각이 0부터 다시 시작한다", () => {
    const plan = planMotionExportFrames(episode([cut("a", 2), cut("b", 4)]), 10);
    const boundary = plan.frames[20]!;
    expect(boundary.atSeconds).toBeCloseTo(2, 10);
    expect(boundary.cutIndex).toBe(1);
    expect(boundary.cutLocalSeconds).toBeCloseTo(0, 10);
    const before = plan.frames[19]!;
    expect(before.cutIndex).toBe(0);
    expect(before.cutLocalSeconds).toBeCloseTo(1.9, 10);
  });

  it("마지막 프레임은 마지막 컷 안에 머문다", () => {
    const plan = planMotionExportFrames(episode([cut("a", 2), cut("b", 4)]), 10);
    const last = plan.frames[plan.frames.length - 1]!;
    expect(last.cutIndex).toBe(1);
    expect(last.cutLocalSeconds).toBeLessThan(4);
    expect(last.cutLocalSeconds).toBeGreaterThan(3.8);
  });

  it("컷 길이는 모델 클램프(2~30초)를 따른다", () => {
    const plan = planMotionExportFrames(episode([cut("a", 100)]), 10);
    expect(plan.durationSeconds).toBe(30);
  });
});

describe("coverFitSize", () => {
  it("가로로 긴 이미지는 높이에 맞춰 확대된다", () => {
    const fitted = coverFitSize(1000, 500, 720, 960);
    expect(fitted.height).toBe(960);
    expect(fitted.width).toBe(1920);
  });

  it("세로로 긴 이미지는 너비에 맞춰 확대된다", () => {
    const fitted = coverFitSize(500, 1000, 720, 960);
    expect(fitted.width).toBe(720);
    expect(fitted.height).toBe(1440);
  });

  it("잘못된 이미지 크기는 프레임 크기로 떨어진다", () => {
    expect(coverFitSize(0, 0, 720, 960)).toEqual({ width: 720, height: 960 });
  });
});
