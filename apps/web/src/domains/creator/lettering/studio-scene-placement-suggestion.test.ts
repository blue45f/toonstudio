import { describe, it, expect } from "vitest";

import { computeBubbleAnchorTail } from "./studio-bubble-anchor";
import {
  applyScenePlacementPatches,
  buildScenePlacementPatch,
  suggestScenePlacement,
  suggestScenePlacements,
  type ScenePlacementScene,
} from "./studio-scene-placement-suggestion";

// 기준 씬: 패널 800×600, 캐릭터 1명(중앙, x300 y200 w200 h300).
// 얼굴 영역 = 상단 32% → y 200..296, 얼굴점 명시 = (400, 215).
const baseScene: ScenePlacementScene = {
  panel: { x: 0, y: 0, w: 800, h: 600 },
  figures: [
    {
      id: "hero",
      bounds: { x: 300, y: 200, w: 200, h: 300 },
      facePoint: { x: 400, y: 215 },
    },
  ],
};

const balloonReq = {
  kind: "balloon" as const,
  id: "b1",
  width: 220,
  height: 110,
  speakerId: "hero",
};

describe("suggestScenePlacement — 말풍선", () => {
  it("화자 위쪽의 비어 있는 자리를 1순위로 제안하고 꼬리를 단다", () => {
    const s = suggestScenePlacement(balloonReq, baseScene);
    expect(s.best).not.toBeNull();
    expect(s.best!.fitsPanel).toBe(true);
    expect(s.best!.overlapsFigure).toBe(false);
    expect(s.best!.reasons).toContain("above-speaker");
    expect(s.best!.tail).toBeDefined();
    // 화자가 아래에 있으니 꼬리는 bottom 방향이어야 한다.
    expect(s.best!.tail!.tailDirection).toBe("bottom");
  });

  it("꼬리는 앵커 코어(computeBubbleAnchorTail) 직접 계산과 완전히 같다", () => {
    const s = suggestScenePlacement(balloonReq, baseScene);
    const best = s.best!;
    const direct = computeBubbleAnchorTail(
      { x: best.x, y: best.y, width: 220, height: 110, rotation: 0, tail: "left" },
      { x: 400, y: 215 },
    );
    expect(best.tail).toEqual(direct);
  });

  it("결정적이다 — 같은 입력은 같은 제안", () => {
    const a = suggestScenePlacement(balloonReq, baseScene);
    const b = suggestScenePlacement(balloonReq, baseScene);
    expect(a).toEqual(b);
  });

  it("후보 점수는 내림차순이고 limit을 지킨다", () => {
    const s = suggestScenePlacement(balloonReq, baseScene, { limit: 2 });
    expect(s.candidates).toHaveLength(2);
    expect(s.candidates[0]!.score).toBeGreaterThanOrEqual(s.candidates[1]!.score);
  });

  it("패널보다 큰 말풍선은 후보를 지어내지 않고 정직하게 실패한다", () => {
    const s = suggestScenePlacement({ ...balloonReq, width: 900, height: 700 }, baseScene);
    expect(s.best).toBeNull();
    expect(s.candidates).toHaveLength(0);
    expect(s.warnings.join(" ")).toContain("후보가 없어요");
  });

  it("없는 화자 id는 경고하고 여백 기준으로만 제안한다(꼬리 없음)", () => {
    const s = suggestScenePlacement({ ...balloonReq, speakerId: "ghost" }, baseScene);
    expect(s.warnings.join(" ")).toContain("찾지 못해");
    expect(s.best).not.toBeNull();
    expect(s.best!.tail).toBeUndefined();
  });

  it("확정 배치된 영역(occupied)과 겹치는 후보는 감점된다", () => {
    // 화자 위 슬롯(290,74,220,110)을 이미 확정 영역으로 막는다.
    const scene: ScenePlacementScene = {
      ...baseScene,
      occupied: [{ x: 280, y: 60, w: 240, h: 130 }],
    };
    const s = suggestScenePlacement(balloonReq, scene);
    expect(s.best).not.toBeNull();
    const bestRect = { x: s.best!.x, y: s.best!.y, w: 220, h: 110 };
    const occ = { x: 280, y: 60, w: 240, h: 130 };
    const overlaps =
      bestRect.x < occ.x + occ.w &&
      bestRect.x + bestRect.w > occ.x &&
      bestRect.y < occ.y + occ.h &&
      bestRect.y + bestRect.h > occ.y;
    expect(overlaps).toBe(false);
  });
});

describe("suggestScenePlacement — 감정 매처 정합", () => {
  it("외침 대사는 rage-shout 판정과 spiky 추천 형상을 함께 반환한다", () => {
    const s = suggestScenePlacement(
      { ...balloonReq, text: "당장 꺼져!! 다시는 오지 마!" },
      baseScene,
    );
    expect(s.emotion).toBeDefined();
    expect(s.emotion!.detectedEmotion).toBe("rage-shout");
    expect(s.emotion!.recommendedBubbleShape).toBe("shout-spiky");
    expect(s.emotion!.consistent).toBe(true);
  });

  it("호스트 지정 감정이 매처 판정과 다르면 consistent=false + 경고", () => {
    const s = suggestScenePlacement(
      { ...balloonReq, text: "당장 꺼져!!", emotion: "whisper-secret" },
      baseScene,
    );
    expect(s.emotion!.consistent).toBe(false);
    expect(s.warnings.join(" ")).toContain("whisper-secret");
  });

  it("대사가 없으면 감정 검사를 건너뛴다", () => {
    const s = suggestScenePlacement(balloonReq, baseScene);
    expect(s.emotion).toBeUndefined();
  });
});

describe("suggestScenePlacement — 효과음", () => {
  it("impact 효과음은 발생 대상 가까이를 제안한다", () => {
    const s = suggestScenePlacement(
      { kind: "sfx", id: "s1", width: 200, height: 80, category: "impact", anchorFigureId: "hero" },
      baseScene,
    );
    expect(s.best).not.toBeNull();
    expect(s.best!.reasons).toContain("near-action");
    expect(s.best!.tail).toBeUndefined();
  });

  it("ambient 효과음은 패널 가장자리를 선호한다", () => {
    const s = suggestScenePlacement(
      { kind: "sfx", id: "s2", width: 200, height: 80, category: "ambient", anchorFigureId: "hero" },
      baseScene,
    );
    expect(s.best).not.toBeNull();
    expect(s.best!.reasons).toContain("panel-edge");
  });

  it("효과음 1순위는 캐릭터를 가리지 않는 자리다(빈 슬롯이 있을 때)", () => {
    const s = suggestScenePlacement(
      { kind: "sfx", id: "s3", width: 200, height: 80, category: "impact" },
      baseScene,
    );
    expect(s.best!.overlapsFigure).toBe(false);
  });
});

describe("suggestScenePlacements — 일괄 제안", () => {
  it("앞 제안의 1순위를 차지 영역으로 누적해 두 말풍선이 겹치지 않는다", () => {
    const reqs = [
      balloonReq,
      { ...balloonReq, id: "b2" },
    ];
    const [first, second] = suggestScenePlacements(reqs, baseScene);
    expect(first!.best).not.toBeNull();
    expect(second!.best).not.toBeNull();
    const a = { x: first!.best!.x, y: first!.best!.y, w: 220, h: 110 };
    const b = { x: second!.best!.x, y: second!.best!.y, w: 220, h: 110 };
    const overlaps =
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    expect(overlaps).toBe(false);
  });
});

describe("미리보기 패치와 적용/취소", () => {
  it("buildScenePlacementPatch는 1순위 후보와 꼬리를 패치로 만든다", () => {
    const s = suggestScenePlacement(balloonReq, baseScene);
    const patch = buildScenePlacementPatch(s);
    expect(patch).not.toBeNull();
    expect(patch!.id).toBe("b1");
    expect(patch!.x).toBe(s.best!.x);
    expect(patch!.y).toBe(s.best!.y);
    expect(patch!.tail).toEqual(s.best!.tail);
    expect(buildScenePlacementPatch(s, 99)).toBeNull();
  });

  it("applyScenePlacementPatches는 대상만 옮기고 꼬리 필드를 복사한다(불변)", () => {
    const s = suggestScenePlacement(balloonReq, baseScene);
    const patch = buildScenePlacementPatch(s)!;
    const other: {
      id: string;
      x: number;
      y: number;
      tailDirection?: string;
      tailXRatio?: number;
      tailHeight?: number;
    } = { id: "other", x: 5, y: 5 };
    const elements = [{ ...other, id: "b1", x: 0, y: 0 }, other];
    const applied = applyScenePlacementPatches(elements, [patch]);
    expect(applied[0]!.x).toBe(patch.x);
    expect(applied[0]!.y).toBe(patch.y);
    expect(applied[0]!.tailDirection).toBe(patch.tail!.tailDirection);
    expect(applied[0]!.tailXRatio).toBe(patch.tail!.tailXRatio);
    expect(applied[0]!.tailHeight).toBe(patch.tail!.tailHeight);
    // 원본 불변 + 무관한 요소는 참조 유지(취소는 패치를 버리면 그만이다).
    expect(elements[0]!.x).toBe(0);
    expect(applied[1]).toBe(other);
  });
});
