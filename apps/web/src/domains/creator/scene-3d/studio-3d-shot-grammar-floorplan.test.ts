import { describe, expect, it } from "vitest";
import {
  buildOverheadFloorplan,
  computeLineOfActionSideSign,
  createStoryboardCutSnapshotSpec,
  evaluateLineOfAction180Guard,
  parseShotGrammar,
} from "./studio-3d-shot-grammar-floorplan";

describe("studio-3d-shot-grammar-floorplan", () => {
  it("한글 단문 샷 그래머를 LLM 없이 결정론적 샷 IR로 컴파일한다", () => {
    const ir = parseShotGrammar("2인 대치, 로우앵글 OTS, 24mm, 왼쪽 캐릭터 착석, 더치 12");
    expect(ir.framingStyle).toBe("ots");
    expect(ir.cameraElevation).toBe("low");
    expect(ir.focalLengthMm).toBe(24);
    expect(ir.dutchDeg).toBe(12);
    expect(ir.actors).toHaveLength(2);
    expect(ir.actors[0]?.posture).toBe("seated");
    expect(ir.actors[0]?.eyeHeightM).toBeLessThan(ir.actors[1]?.eyeHeightM ?? 2);
    expect(ir.lookAtPairs).toHaveLength(2);
  });

  it("영문 단문 샷 그래머도 동일하게 구도·화각·고도를 해석한다", () => {
    const ir = parseShotGrammar("2-shot, high angle, close-up, 85mm, right actor kneeling");
    expect(ir.framingStyle).toBe("two-shot");
    expect(ir.shotSize).toBe("CU");
    expect(ir.cameraElevation).toBe("high");
    expect(ir.focalLengthMm).toBe(85);
    expect(ir.actors[1]?.posture).toBe("kneeling");
  });

  it("2D 평면도 프러스텀과 180도 가상선 반평면 부호를 정확히 계산한다", () => {
    expect(computeLineOfActionSideSign([-1, 0], [1, 0], [0, 2])).toBe(-1);
    expect(computeLineOfActionSideSign([-1, 0], [1, 0], [0, -2])).toBe(1);
    expect(computeLineOfActionSideSign([-1, 0], [1, 0], [0, 0])).toBe(0);

    const ir = parseShotGrammar("2인 대치, 35mm");
    const floor = buildOverheadFloorplan(ir);
    expect(floor.actors).toHaveLength(2);
    expect(floor.camera.frustumPolygonXZ).toHaveLength(3);
    expect(floor.camera.horizontalFovDeg).toBeGreaterThan(50);
    expect(floor.lineOfActionSegment).not.toBeNull();
  });

  it("직전 컷 대비 가상선 월선을 감지하고 의도적 승인 플래그를 구분한다", () => {
    const cut1Ir = parseShotGrammar("2인 대치, 35mm");
    const cut1Floor = buildOverheadFloorplan(cut1Ir);

    const sameSideCut = buildOverheadFloorplan({
      ...cut1Ir,
      cameraPositionXZ: [0.8, 2.4],
    });
    expect(evaluateLineOfAction180Guard(cut1Floor, sameSideCut).status).toBe("safe");

    const crossedCut = buildOverheadFloorplan({
      ...cut1Ir,
      cameraPositionXZ: [0, -2.9],
    });
    const warned = evaluateLineOfAction180Guard(cut1Floor, crossedCut);
    expect(warned.axisCrossed).toBe(true);
    expect(warned.status).toBe("axis-cross-warning");

    const approved = evaluateLineOfAction180Guard(cut1Floor, crossedCut, {
      intentionalAxisCrossApproved: true,
    });
    expect(approved.status).toBe("intentional-override-approved");
  });

  it("원클릭 2D 스토리보드 러프 스냅샷 명세를 LT 3패스 프리셋과 연결한다", () => {
    const cut1 = parseShotGrammar("2인 대치, 35mm");
    const cut1Floor = buildOverheadFloorplan(cut1);
    const cut2 = parseShotGrammar("2인 대치, 로우앵글 OTS, 24mm");

    const snapshot = createStoryboardCutSnapshotSpec("cut-02", cut2, cut1Floor);
    expect(snapshot.cutId).toBe("cut-02");
    expect(snapshot.ltExtractionPreset.passSet).toEqual([
      "main-line",
      "shadow-mask",
      "depth-map",
    ]);
    expect(snapshot.axisGuard.status).toBe("safe");
    expect(snapshot.captionSummaryKo).toContain("24mm");
  });
});
