import { describe, expect, it } from "vitest";
import {
  commitCadLiveBooleanSession,
  flushDebouncedOcctDispatch,
  handleCadDirectGestureKey,
  selectTangentEdgeChain,
  startCadDirectGestureSession,
  startCadLiveBooleanSession,
  updateCadDirectGesturePointer,
  updateCadLiveBooleanCutterTransform,
  type CadSolidOperandSummary,
  type CadTopologyMesh,
} from "./studio-hybrid-cad-direct-gestures";

function makeOctagonLoopMesh(): CadTopologyMesh {
  const vertices = [];
  const edges = [];
  const count = 8;
  const radius = 0.5;
  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    vertices.push({
      id: `v${i}`,
      x: Math.cos(theta) * radius,
      y: 0,
      z: Math.sin(theta) * radius,
    });
  }
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    edges.push({
      id: `e${i}`,
      v0: `v${i}`,
      v1: `v${next}`,
      adjacentFaceNormals: [
        [0, 1, 0],
        [0, 0, 1],
      ] as const,
    });
  }
  // 90도 수직 분기 엣지 추가 (탄젠트 루프에서 제외되어야 함)
  vertices.push({ id: "v_top", x: radius, y: 0.6, z: 0 });
  edges.push({
    id: "e_vertical",
    v0: "v0",
    v1: "v_top",
    adjacentFaceNormals: [
      [1, 0, 0],
      [0, 0, 1],
    ] as const,
  });
  return { vertices, edges };
}

function makeSolid(
  id: string,
  overrides: Partial<CadSolidOperandSummary> = {},
): CadSolidOperandSummary {
  return {
    id,
    label: id,
    isManifold: true,
    volumeM3: 1.0,
    triangleCount: 12,
    boundsMin: [-0.5, 0, -0.5],
    boundsMax: [0.5, 1, 0.5],
    ...overrides,
  };
}

describe("studio-hybrid-cad-direct-gestures", () => {
  it("Alt+클릭 탄젠트 연속 엣지 루프를 닫힌 루프로 추적하며 90도 분기 엣지는 제외한다", () => {
    const mesh = makeOctagonLoopMesh();
    // 8각형 외각은 45도이므로 50도 허용치에서 닫힌 루프 선택, 90도 수직 엣지는 제외
    const chain = selectTangentEdgeChain(mesh, "e0", { angleToleranceDeg: 50 });
    expect(chain.isClosedLoop).toBe(true);
    expect(chain.orderedEdgeIds).toHaveLength(8);
    expect(chain.orderedEdgeIds).not.toContain("e_vertical");
    expect(chain.totalLengthM).toBeGreaterThan(2.5);
  });

  it("B/C 드래그 세션 중 종료 없이 C 전환·V 가변 반경·숫자 입력·디바운스 병합을 처리한다", () => {
    const mesh = makeOctagonLoopMesh();
    let session = startCadDirectGestureSession(mesh, ["e0", "e1"], "B", 100, 1000, {
      debounceMs: 50,
    });
    expect(session.mode).toBe("fillet");
    expect(session.previewStrips).toHaveLength(2);

    // 빠른 연속 포인터 이동 -> 디바운스 이전에는 방출하지 않고 latest-wins 병합
    session = updateCadDirectGesturePointer(session, mesh, 140, 1010);
    session = updateCadDirectGesturePointer(session, mesh, 180, 1020);
    const earlyFlush = flushDebouncedOcctDispatch(session, 1040);
    expect(earlyFlush.readyDispatch).toBeNull();

    // 모달 키 체이닝: C로 챔퍼 전환, V로 가변 반경, 숫자 패드 입력 0.025
    session = handleCadDirectGestureKey(session, mesh, "C", 1045);
    expect(session.status).toBe("dragging");
    expect(session.mode).toBe("chamfer");

    session = handleCadDirectGestureKey(session, mesh, "V", 1050);
    expect(session.variableRadius).toBe(true);

    for (const ch of ["0", ".", "0", "2", "5"]) {
      session = handleCadDirectGestureKey(session, mesh, ch, 1055);
    }
    expect(session.numericInputActive).toBe(true);
    expect(session.endRadiusM).toBeCloseTo(0.025, 4);

    // Backspace로 끝자리 제거 -> 0.02
    session = handleCadDirectGestureKey(session, mesh, "Backspace", 1060);
    expect(session.endRadiusM).toBeCloseTo(0.02, 4);

    // 디바운스 경과 후 최신 1건만 워커 디스패치 방출
    const debounced = flushDebouncedOcctDispatch(session, 1120);
    expect(debounced.readyDispatch).not.toBeNull();
    expect(debounced.readyDispatch?.mode).toBe("chamfer");
    expect(debounced.readyDispatch?.endRadiusM).toBeCloseTo(0.02, 4);

    // Enter 확정
    const committed = handleCadDirectGestureKey(debounced.nextSession, mesh, "Enter", 1130);
    expect(committed.status).toBe("committed");
    const finalFlush = flushDebouncedOcctDispatch(committed, 1130);
    expect(finalFlush.readyDispatch?.revision).toBe(committed.revision);
  });

  it("Escape 키로 드래그 세션을 즉시 취소하고 프리뷰와 대기 큐를 비운다", () => {
    const mesh = makeOctagonLoopMesh();
    const session = startCadDirectGestureSession(mesh, ["e0"], "C", 0, 100);
    const cancelled = handleCadDirectGestureKey(session, mesh, "Escape", 120);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.pendingDispatch).toBeNull();
    expect(cancelled.previewStrips).toHaveLength(0);
  });

  it("Q/W/E 라이브 커터 불리언 세션에서 매니폴드 및 경계 상자 교차를 검증한다", () => {
    const target = makeSolid("wall");
    const cutter = makeSolid("window-cut");

    let sub = startCadLiveBooleanSession("W", target, cutter);
    expect(sub.op).toBe("subtract");
    expect(sub.cutterWireframeGhost).toBe(true);
    expect(sub.validation.valid).toBe(true);

    // 커터를 멀리 이동시키면 차집합 교차 실패
    sub = updateCadLiveBooleanCutterTransform(sub, target, cutter, {
      positionM: [10, 0, 0],
    });
    expect(sub.validation.valid).toBe(false);
    expect(sub.validation.code).toBe("NO_AABB_OVERLAP");
    expect(commitCadLiveBooleanSession(sub).ok).toBe(false);

    // 다시 교차 위치로 이동 후 확정
    sub = updateCadLiveBooleanCutterTransform(sub, target, cutter, {
      positionM: [0.1, 0, 0],
    });
    const commitRes = commitCadLiveBooleanSession(sub);
    expect(commitRes.ok).toBe(true);
    if (commitRes.ok) {
      expect(commitRes.session.cutterWireframeGhost).toBe(false);
      expect(commitRes.occtCommand.op).toBe("subtract");
    }

    // 비-매니폴드 커터 거부
    const broken = startCadLiveBooleanSession(
      "Q",
      target,
      makeSolid("broken-mesh", { isManifold: false }),
    );
    expect(broken.validation.valid).toBe(false);
    expect(broken.validation.code).toBe("NON_MANIFOLD_CUTTER");
  });
});
