import { describe, expect, it } from "vitest";
import {
  CausalGraphCycleError,
  CausalNodeNotFoundError,
  CausalStrokeDependencyGraph,
  projectPointToBoneLocal,
  reconstructPointFromBoneLocal,
  renderTimeTravelDiffSvg,
  reprojectDownstreamFromHistoricalEdit,
  rotateAndTranslatePoint2D,
  sampleBoneCageControls,
  solveMlsRigidWarpPoint,
  solveMlsRigidWarpPoints,
  summarizeCausalImpactReportKo,
  transformRoughSkeletonBone,
} from "./index";
import type { Point2D, RoughSkeletonBoneNode, SpeechBalloonTailNode } from "./index";

const BASE_MS = Date.parse("2026-11-28T09:00:00.000Z");
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const pt = (x: number, y: number): Point2D => ({ x, y });
const dist = (a: Point2D, b: Point2D): number => Math.hypot(b.x - a.x, b.y - a.y);

function buildSignatureWebtoonScene(): CausalStrokeDependencyGraph {
  const g = new CausalStrokeDependencyGraph();
  g.addNode({ id: "bone-arm-right", kind: "rough-skeleton-bone", label: "오른팔 러프 본", parentIds: [], createdAtMs: BASE_MS, layerOrder: 10, payload: { p0: pt(120, 200), p1: pt(240, 200), jointLabel: "right-shoulder-to-wrist" } });
  g.addNode({ id: "bone-head", kind: "rough-skeleton-bone", label: "화자 머리 본", parentIds: [], createdAtMs: BASE_MS + 1000, layerOrder: 11, payload: { p0: pt(100, 150), p1: pt(100, 70), jointLabel: "neck-to-crown" } });
  g.addNode({ id: "bg-building-ink", kind: "ink-lineart-stroke", label: "배경 건물 윤곽선", parentIds: [], createdAtMs: BASE_MS + 2000, layerOrder: 1, payload: { points: [pt(340, 60), pt(430, 60), pt(430, 270), pt(340, 270)], strokeWidth: 2, strokeColor: "#334155" } });
  g.addNode({ id: "bg-building-fill", kind: "cel-fill-region", label: "배경 건물 채색", parentIds: ["bg-building-ink"], createdAtMs: BASE_MS + 2500, layerOrder: 0, payload: { polygon: [pt(340, 60), pt(430, 60), pt(430, 270), pt(340, 270)], fillColor: "#E2E8F0", opacity: 0.85 } });
  g.addNode({ id: "ink-sleeve", kind: "ink-lineart-stroke", label: "오른팔 소매 선화", parentIds: ["bone-arm-right"], createdAtMs: BASE_MS + 60_000, layerOrder: 30, payload: { points: [pt(120, 184), pt(180, 182), pt(240, 186), pt(240, 214), pt(180, 218), pt(120, 216)], strokeWidth: 2.6, strokeColor: "#0F172A" } });
  g.addNode({ id: "cel-sleeve-fill", kind: "cel-fill-region", label: "오른팔 소매 셀 채색", parentIds: ["ink-sleeve"], createdAtMs: BASE_MS + 120_000, layerOrder: 20, payload: { polygon: [pt(120, 184), pt(240, 186), pt(240, 214), pt(120, 216)], fillColor: "#D8E5DF", opacity: 0.92 } });
  g.addNode({ id: "shadow-sleeve", kind: "shadow-highlight-pass", label: "오른팔 하단 그림자", parentIds: ["cel-sleeve-fill"], createdAtMs: BASE_MS + 180_000, layerOrder: 25, payload: { passMode: "cel-shadow", polygon: [pt(122, 202), pt(238, 202), pt(238, 214), pt(122, 215)], lightDirection: pt(0, -1), tintColor: "#1F4435", opacity: 0.28 } });
  g.addNode({ id: "wash-sleeve", kind: "fluid-wash-effect", label: "소매 수채 번짐", parentIds: ["shadow-sleeve"], createdAtMs: BASE_MS + 240_000, layerOrder: 28, payload: { bleedAnchors: [pt(145, 206), pt(188, 207), pt(224, 205)], bleedRadius: 12, pigmentColor: "#2C6E58", wetness: 0.65 } });
  const mouthInitial = pt(122, 126);
  g.addNode({
    id: "balloon-dialogue",
    kind: "speech-balloon-tail",
    label: "대사 말풍선",
    parentIds: ["bone-head"],
    createdAtMs: BASE_MS + 300_000,
    layerOrder: 40,
    payload: {
      balloonCenter: pt(215, 74),
      balloonRadiusX: 68,
      balloonRadiusY: 28,
      text: "지금 바로 출발하자!",
      balloonTextRotationDeg: 0,
      tailBaseLeft: pt(162, 88),
      tailBaseRight: pt(174, 98),
      tailTip: mouthInitial,
      speakerBoneId: "bone-head",
      mouthLocalAnchor: projectPointToBoneLocal(mouthInitial, pt(100, 150), pt(100, 70)),
      tailGapPx: 6,
    },
  });
  g.commitRevision("초기 6단계 웹툰 원고 완성", { timestampMs: BASE_MS + 360_000 });
  return g;
}

describe("Wave 87: 인과 의존성 그래프(DAG) 불변식 및 부분 그래프 탐색", () => {
  it("6종 인과 노드를 추가하면 부모가 항상 자식보다 앞서는 위상 정렬을 반환한다", () => {
    const order = buildSignatureWebtoonScene().getTopologicalOrder();
    expect(order).toHaveLength(9);
    expect(order.indexOf("bone-arm-right")).toBeLessThan(order.indexOf("ink-sleeve"));
    expect(order.indexOf("ink-sleeve")).toBeLessThan(order.indexOf("cel-sleeve-fill"));
    expect(order.indexOf("cel-sleeve-fill")).toBeLessThan(order.indexOf("shadow-sleeve"));
    expect(order.indexOf("shadow-sleeve")).toBeLessThan(order.indexOf("wash-sleeve"));
    expect(order.indexOf("bone-head")).toBeLessThan(order.indexOf("balloon-dialogue"));
    expect(order.indexOf("bg-building-ink")).toBeLessThan(order.indexOf("bg-building-fill"));
  });

  it("자기 자신으로 향하는 순환 의존성(A -> A)을 CausalGraphCycleError로 차단한다", () => {
    const g = buildSignatureWebtoonScene();
    expect(() => g.addDependency("bone-arm-right", "bone-arm-right")).toThrow(CausalGraphCycleError);
  });

  it("간접 순환 의존성(A -> B -> C -> A)을 감지하고 그래프를 오염시키지 않는다", () => {
    const g = buildSignatureWebtoonScene();
    const beforeHash = g.getStateHash();
    let caught: unknown;
    try {
      g.addDependency("wash-sleeve", "bone-arm-right");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CausalGraphCycleError);
    const cycleErr = caught as CausalGraphCycleError;
    expect(cycleErr.code).toBe("CAUSAL_GRAPH_CYCLE");
    expect(cycleErr.cyclePath[0]).toBe("wash-sleeve");
    expect(cycleErr.cyclePath[cycleErr.cyclePath.length - 1]).toBe("wash-sleeve");
    expect(g.getStateHash()).toBe(beforeHash);
  });

  it("존재하지 않는 부모 노드를 참조하면 CausalNodeNotFoundError를 던진다", () => {
    const g = new CausalStrokeDependencyGraph();
    expect(() =>
      g.addNode({
        id: "orphan-ink",
        kind: "ink-lineart-stroke",
        label: "고아 선화",
        parentIds: ["missing-bone"],
        createdAtMs: BASE_MS,
        layerOrder: 1,
        payload: { points: [pt(0, 0), pt(10, 10)], strokeWidth: 2, strokeColor: "#000000" },
      }),
    ).toThrow(CausalNodeNotFoundError);
  });

  it("getDownstreamAffectedNodeIds는 편집 노드의 하위 체인만 위상 순서로 반환하고 배경을 배제한다", () => {
    const down = buildSignatureWebtoonScene().getDownstreamAffectedNodeIds("bone-arm-right");
    expect(down).toEqual(["ink-sleeve", "cel-sleeve-fill", "shadow-sleeve", "wash-sleeve"]);
    expect(down).not.toContain("bg-building-ink");
    expect(down).not.toContain("bg-building-fill");
    expect(down).not.toContain("balloon-dialogue");
  });

  it("동일 기하와 의존성은 결정적 내용 해시를 생성하며 좌표 변경 시 즉시 달라진다", () => {
    const g1 = buildSignatureWebtoonScene();
    const g2 = buildSignatureWebtoonScene();
    expect(g1.getStateHash()).toBe(g2.getStateHash());
    const bone = g1.requireNode("bone-arm-right") as RoughSkeletonBoneNode;
    expect(transformRoughSkeletonBone(bone, { angleDeg: 10 }).contentHash).not.toBe(bone.contentHash);
  });
});

describe("Wave 87: 2D MLS Rigid & Similarity 변형장 수학적 정확성", () => {
  const controls: readonly Point2D[] = [pt(100, 100), pt(160, 100), pt(220, 100), pt(160, 150)];

  it("MLS-Rigid 항등 보존: 제어점이 그대로면 전역 격자 오차가 1e-6 미만이다", () => {
    let maxErr = 0;
    for (let x = 50; x <= 270; x += 22) {
      for (let y = 50; y <= 210; y += 20) {
        const p = pt(x, y);
        maxErr = Math.max(maxErr, dist(p, solveMlsRigidWarpPoint(p, controls, controls, { mode: "rigid" })));
      }
    }
    expect(maxErr).toBeLessThan(1e-6);
  });

  it("MLS-Similarity 항등 보존: 제어점이 그대로면 전역 격자 오차가 1e-6 미만이다", () => {
    let maxErr = 0;
    for (let x = 60; x <= 260; x += 25) {
      for (let y = 60; y <= 200; y += 25) {
        const p = pt(x, y);
        maxErr = Math.max(maxErr, dist(p, solveMlsRigidWarpPoint(p, controls, controls, { mode: "similarity" })));
      }
    }
    expect(maxErr).toBeLessThan(1e-6);
  });

  it("정확한 제어점 보간: 비선형 변형에서도 모든 제어 핸들에서 |warp(p_i) - q_i| < 1e-3이다", () => {
    const edited = [pt(102, 98), pt(165, 88), pt(230, 112), pt(154, 166)];
    for (const mode of ["rigid", "similarity"] as const) {
      for (let i = 0; i < controls.length; i += 1) {
        const p = controls[i] as Point2D;
        const q = edited[i] as Point2D;
        expect(dist(solveMlsRigidWarpPoint(p, controls, edited, { mode }), q)).toBeLessThan(1e-3);
      }
    }
  });

  it("순수 +10° 회전 + 평행 이동 시 MLS-Rigid가 선분 길이(< 1.5%)와 각도(< 0.5°)를 엄격히 보존한다", () => {
    const edited = controls.map((p) => rotateAndTranslatePoint2D(p, pt(100, 100), 10, pt(35, -22)));
    const seg = [pt(115, 85), pt(210, 120)];
    const warped = solveMlsRigidWarpPoints(seg, controls, edited, { mode: "rigid" });
    const [a0, b0] = seg as [Point2D, Point2D];
    const [a1, b1] = warped as [Point2D, Point2D];
    const lenDrift = Math.abs(dist(a1, b1) - dist(a0, b0)) / dist(a0, b0);
    const rotDeg = (Math.atan2((b0.x - a0.x) * (b1.y - a1.y) - (b0.y - a0.y) * (b1.x - a1.x), (b0.x - a0.x) * (b1.x - a1.x) + (b0.y - a0.y) * (b1.y - a1.y)) * 180) / Math.PI;
    expect(lenDrift).toBeLessThan(0.015);
    expect(Math.abs(rotDeg - 10)).toBeLessThan(0.5);
  });

  it("큰 -45° 회전과 이동에서도 MLS-Rigid는 다각형 변 길이를 강체 수준으로 유지한다", () => {
    const boneOrig = sampleBoneCageControls(pt(80, 120), pt(220, 120), 5);
    const boneEdited = boneOrig.map((p) => rotateAndTranslatePoint2D(p, pt(80, 120), -45, pt(14, 18)));
    const rect = [pt(100, 105), pt(200, 105), pt(200, 135), pt(100, 135)];
    const warped = solveMlsRigidWarpPoints(rect, boneOrig, boneEdited, { mode: "rigid" });
    const lenBefore = dist(rect[0] as Point2D, rect[1] as Point2D);
    const lenAfter = dist(warped[0] as Point2D, warped[1] as Point2D);
    expect(Math.abs(lenAfter - lenBefore) / lenBefore).toBeLessThan(0.001);
  });

  it("균일 1.5배 스케일 입력에서 Similarity는 1.5배 확대하고 Rigid는 국소 선형 팽창을 억제한다", () => {
    const c = pt(150, 100);
    const scaled = controls.map((p) => pt(c.x + (p.x - c.x) * 1.5, c.y + (p.y - c.y) * 1.5));
    const probes = [pt(140, 120), pt(160, 120)];
    const origDist = dist(probes[0] as Point2D, probes[1] as Point2D);
    const sim = solveMlsRigidWarpPoints(probes, controls, scaled, { mode: "similarity" });
    const rigid = solveMlsRigidWarpPoints(probes, controls, scaled, { mode: "rigid" });
    const simRatio = dist(sim[0] as Point2D, sim[1] as Point2D) / origDist;
    const rigidRatio = dist(rigid[0] as Point2D, rigid[1] as Point2D) / origDist;
    expect(Math.abs(simRatio - 1.5)).toBeLessThan(0.01);
    expect(rigidRatio).toBeLessThan(1.25);
    expect(rigidRatio).toBeLessThan(simRatio);
  });

  it("빈 제어점·단일 제어점·중복 제어점 같은 퇴화 입력에서도 NaN이나 Infinity가 발생하지 않는다", () => {
    const probe = pt(55, 77);
    expect(solveMlsRigidWarpPoint(probe, [], [])).toEqual(probe);
    expect(solveMlsRigidWarpPoint(probe, [pt(10, 10)], [pt(25, 30)])).toEqual(pt(70, 97));
    const out = solveMlsRigidWarpPoint(probe, [pt(10, 10), pt(10, 10)], [pt(20, 25), pt(20, 25)]);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
  });
});

describe("Wave 87: 3시간 뒤 팔 들어올리기 & 말풍선 자동 추적 시그니처 시나리오", () => {
  it("3시간 전 오른팔 본을 +10° 회전하면 선화·셀 채색·그림자·수채 번짐이 2% 미만 오차로 강체 추종한다", () => {
    const g = buildSignatureWebtoonScene();
    const out = reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "bone-arm-right",
      label: "3시간 뒤 오른팔 러프 본 +10° 들어올리기",
      timestampMs: BASE_MS + THREE_HOURS_MS,
      mode: "rigid",
      mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }),
    });
    expect(out.report.integrityPassed).toBe(true);
    expect(out.report.recomputedNodeIds).toEqual(["ink-sleeve", "cel-sleeve-fill", "shadow-sleeve", "wash-sleeve"]);
    expect(out.report.maxLengthDriftRatio).toBeLessThan(0.015);
    expect(out.report.maxAreaDriftRatio).toBeLessThan(0.015);
    for (const id of ["ink-sleeve", "cel-sleeve-fill", "shadow-sleeve", "wash-sleeve"]) {
      const audit = out.report.perNodeAudit.find((e) => e.nodeId === id);
      expect(audit?.recomputed).toBe(true);
      expect(audit?.lengthDriftRatio ?? 1).toBeLessThan(0.02);
      expect(Math.abs((audit?.meanRotationDeltaDeg ?? 0) - 10)).toBeLessThan(0.5);
    }
  });

  it("오른팔 수정 시 무관한 배경 건물 노드는 0px 변형되며 recomputed=false로 완전 보전된다", () => {
    const g = buildSignatureWebtoonScene();
    const bgInkHash = g.requireNode("bg-building-ink").contentHash;
    const bgFillHash = g.requireNode("bg-building-fill").contentHash;
    const out = reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "bone-arm-right",
      label: "오른팔 +10° 수정",
      timestampMs: BASE_MS + THREE_HOURS_MS,
      mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }),
    });
    expect(out.report.untouchedNodeCount).toBe(4);
    for (const bgId of ["bg-building-ink", "bg-building-fill"]) {
      const audit = out.report.perNodeAudit.find((e) => e.nodeId === bgId);
      expect(audit?.recomputed).toBe(false);
      expect(audit?.maxDisplacementPx).toBe(0);
    }
    expect(g.requireNode("bg-building-ink").contentHash).toBe(bgInkHash);
    expect(g.requireNode("bg-building-fill").contentHash).toBe(bgFillHash);
  });

  it("화자 머리 본을 이동·회전하면 말풍선 꼬리가 새 입 위치를 추적하고 본문 회전각은 0°로 유지된다", () => {
    const g = buildSignatureWebtoonScene();
    const before = g.requireNode("balloon-dialogue") as SpeechBalloonTailNode;
    const out = reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "bone-head",
      label: "화자 고개 +15° 회전 및 전진",
      timestampMs: BASE_MS + THREE_HOURS_MS + 10_000,
      mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 15, translation: pt(24, -12) }),
    });
    const head = g.requireNode("bone-head") as RoughSkeletonBoneNode;
    const after = g.requireNode("balloon-dialogue") as SpeechBalloonTailNode;
    const expectedMouth = reconstructPointFromBoneLocal(after.payload.mouthLocalAnchor.s, after.payload.mouthLocalAnchor.d, head.payload.p0, head.payload.p1);
    expect(out.report.integrityPassed).toBe(true);
    expect(after.payload.balloonTextRotationDeg).toBe(0);
    expect(after.payload.balloonCenter).toEqual(before.payload.balloonCenter);
    expect(dist(after.payload.tailTip, before.payload.tailTip)).toBeGreaterThan(10);
    expect(dist(after.payload.tailTip, expectedMouth)).toBeCloseTo(6, 1);
  });

  it("이중 본(상완 고정 + 전완 +12° 회전) 연결 시 어깨 쪽은 고정되고 손목 쪽만 회전한다", () => {
    const g = new CausalStrokeDependencyGraph();
    g.addNode({ id: "bone-upper", kind: "rough-skeleton-bone", label: "상완 본", parentIds: [], createdAtMs: BASE_MS, layerOrder: 1, payload: { p0: pt(80, 180), p1: pt(160, 180), jointLabel: "upper" } });
    g.addNode({ id: "bone-forearm", kind: "rough-skeleton-bone", label: "전완 본", parentIds: [], createdAtMs: BASE_MS, layerOrder: 2, payload: { p0: pt(160, 180), p1: pt(250, 180), jointLabel: "forearm" } });
    g.addNode({ id: "ink-full-arm", kind: "ink-lineart-stroke", label: "전체 팔 윤곽선", parentIds: ["bone-upper", "bone-forearm"], createdAtMs: BASE_MS + 1000, layerOrder: 10, payload: { points: [pt(85, 170), pt(160, 170), pt(245, 172)], strokeWidth: 2, strokeColor: "#0F172A" } });
    g.commitRevision("이중 본 초기 상태", { timestampMs: BASE_MS + 2000 });
    const before = g.requireNode("ink-full-arm");
    reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "bone-forearm",
      label: "전완 +12° 굽히기",
      timestampMs: BASE_MS + 30_000,
      mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 12 }),
    });
    const after = g.requireNode("ink-full-arm");
    if (before.kind === "ink-lineart-stroke" && after.kind === "ink-lineart-stroke") {
      expect(dist(before.payload.points[0] as Point2D, after.payload.points[0] as Point2D)).toBeLessThan(2);
      expect(dist(before.payload.points[2] as Point2D, after.payload.points[2] as Point2D)).toBeGreaterThan(15);
    }
  });

  it("중간 선화 노드를 직접 소급 수정해도 상위 본은 유지되고 하위 채색·그림자·수채만 추종한다", () => {
    const g = buildSignatureWebtoonScene();
    const boneHash = g.requireNode("bone-arm-right").contentHash;
    const out = reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "ink-sleeve",
      label: "소매 선화 y-8px 보정",
      timestampMs: BASE_MS + 500_000,
      mutate: (n) => (n.kind === "ink-lineart-stroke" ? { ...n, payload: { ...n.payload, points: n.payload.points.map((p) => pt(p.x, p.y - 8)) } } : n),
    });
    expect(out.report.recomputedNodeIds).toEqual(["cel-sleeve-fill", "shadow-sleeve", "wash-sleeve"]);
    expect(g.requireNode("bone-arm-right").contentHash).toBe(boneHash);
    expect(out.report.perNodeAudit.find((a) => a.nodeId === "cel-sleeve-fill")?.meanDisplacementPx).toBeCloseTo(8, 1);
  });

  it("그래프 내장 editHistoricalNodeAndReproject도 기본 본-로컬 재투영으로 새 불변 리비전을 생성한다", () => {
    const g = buildSignatureWebtoonScene();
    const res = g.editHistoricalNodeAndReproject({
      nodeId: "bone-arm-right",
      label: "내장 본-로컬 편집",
      timestampMs: BASE_MS + 600_000,
      mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 8 }),
    });
    expect(res.sourceRevision).toBe(0);
    expect(res.targetRevision).toBe(1);
    expect(res.affectedNodeIds).toContain("ink-sleeve");
    expect(g.listRevisions()).toHaveLength(2);
  });
});

describe("Wave 87: 비파괴 시간 역행 리비전 스크럽", () => {
  it("rev 0 → rev 3 → rev 1 → rev 3 왕복 스크럽 시 기하와 stateHash가 비트 단위로 일치한다", () => {
    const g = buildSignatureWebtoonScene();
    const rev0Hash = g.getStateHash();
    const r1 = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "rev1: 팔 +10°", timestampMs: BASE_MS + 1_000_000, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }) });
    reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-head", label: "rev2: 머리 이동", timestampMs: BASE_MS + 2_000_000, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: -8, translation: pt(18, 6) }) });
    const r3 = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "rev3: 팔 +5°", timestampMs: BASE_MS + 3_000_000, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 5 }) });
    const rev3Sleeve = JSON.stringify(g.requireNode("ink-sleeve"));

    g.checkoutRevision(0);
    expect(g.getStateHash()).toBe(rev0Hash);
    g.checkoutRevision(3);
    expect(g.getStateHash()).toBe(r3.revision.stateHash);
    expect(JSON.stringify(g.requireNode("ink-sleeve"))).toBe(rev3Sleeve);
    g.checkoutRevision(1);
    expect(g.getStateHash()).toBe(r1.revision.stateHash);
    g.checkoutRevision(3);
    expect(g.getStateHash()).toBe(r3.revision.stateHash);
    expect(JSON.stringify(g.requireNode("ink-sleeve"))).toBe(rev3Sleeve);
  });

  it("과거 리비전 0으로 돌아가도 이후 리비전 이력은 손실되지 않는다", () => {
    const g = buildSignatureWebtoonScene();
    const initialInk = g.requireNode("ink-sleeve");
    reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "팔 +12°", timestampMs: BASE_MS + THREE_HOURS_MS, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 12 }) });
    g.checkoutRevision(0);
    expect(g.requireNode("ink-sleeve")).toEqual(initialInk);
    expect(g.listRevisions()).toHaveLength(2);
    expect(g.getCurrentRevisionNumber()).toBe(0);
  });

  it("특정 과거 sourceRevision에서 분기 편집하면 이전 스냅샷을 유지한 채 새 리비전을 추가한다", () => {
    const g = buildSignatureWebtoonScene();
    reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "시안 A: +10°", timestampMs: BASE_MS + 10_000, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }) });
    const alt = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "시안 B: -15°", sourceRevision: 0, timestampMs: BASE_MS + 20_000, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: -15 }) });
    expect(alt.report.sourceRevision).toBe(0);
    expect(alt.report.targetRevision).toBe(2);
    expect(g.listRevisions()).toHaveLength(3);
  });

  it("유효 범위를 벗어난 리비전 체크아웃 시 RangeError를 던지고 활성 상태를 유지한다", () => {
    const g = buildSignatureWebtoonScene();
    const hash = g.getStateHash();
    expect(() => g.checkoutRevision(99)).toThrow(RangeError);
    expect(() => g.checkoutRevision(-1)).toThrow(RangeError);
    expect(g.getStateHash()).toBe(hash);
  });
});

describe("Wave 87: 전/후 고스트 비교 SVG 및 한국어 인과 영향도 리포트", () => {
  it("renderTimeTravelDiffSvg는 나란히 비교 SVG와 점선 슬레이트 고스트를 NaN 없이 생성한다", () => {
    const g = buildSignatureWebtoonScene();
    const out = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "오른팔 +10°", timestampMs: BASE_MS + THREE_HOURS_MS, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }) });
    const svg = renderTimeTravelDiffSvg({ beforeNodes: Array.from(out.beforeNodes.values()), afterNodes: Array.from(out.afterNodes.values()), report: out.report, layout: "side-by-side" });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).toContain('data-panel="after-ghost-before"');
    expect(svg).toContain("지금 바로 출발하자!");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toContain("undefined");
  });

  it("overlay 레이아웃과 XML 특수문자(<, >, &) 이스케이프를 안전하게 처리한다", () => {
    const g = buildSignatureWebtoonScene();
    const out = reprojectDownstreamFromHistoricalEdit(g, {
      nodeId: "balloon-dialogue",
      label: "특수문자 대사 테스트",
      timestampMs: BASE_MS + 90_000,
      mutate: (n) => (n.kind === "speech-balloon-tail" ? { ...n, payload: { ...n.payload, text: 'A < B & "속도 > 100"' } } : n),
    });
    const svg = renderTimeTravelDiffSvg({ beforeNodes: Array.from(out.beforeNodes.values()), afterNodes: Array.from(out.afterNodes.values()), layout: "overlay" });
    expect(svg).toContain('data-layer="ghost-before"');
    expect(svg).toContain("A &lt; B &amp; &quot;속도 &gt; 100&quot;");
    expect(svg).not.toContain("NaN");
  });

  it("빈 씬에서도 NaN 없이 안전한 SVG를 반환한다", () => {
    const svg = renderTimeTravelDiffSvg({ beforeNodes: [], afterNodes: [] });
    expect(svg).toContain("<svg ");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("summarizeCausalImpactReportKo는 자연스러운 한국어로 재계산·보전·강체 등급을 요약한다", () => {
    const g = buildSignatureWebtoonScene();
    const out = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "3시간 뒤 오른팔 +10°", timestampMs: BASE_MS + THREE_HOURS_MS, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }) });
    const summary = summarizeCausalImpactReportKo(out.report, g);
    expect(summary.revisionTransition).toBe("리비전 #0 → #1");
    expect(summary.distortionGradeKo).toBe("정밀 강체 유지");
    expect(summary.headline).toContain("하위 4개 노드를 자동 재투영");
    expect(summary.headline).toContain("무관한 4개 노드는 그대로 보전");
    expect(summary.lineageLines.some((line) => line.includes("[보전] 배경 건물 윤곽선"))).toBe(true);
    expect(summary.plainTextReport).toContain("MLS 강체(Rigid)");
  });

  it("다중 캐릭터 30노드 씬에서 주연 팔 편집이 나머지 25노드를 전혀 건드리지 않고 완료된다", () => {
    const g = buildSignatureWebtoonScene();
    for (let i = 0; i < 7; i += 1) {
      const bx = 500 + i * 70;
      g.addNode({ id: `extra-bone-${i}`, kind: "rough-skeleton-bone", label: `엑스트라 본 ${i}`, parentIds: [], createdAtMs: BASE_MS + i * 10, layerOrder: 5, payload: { p0: pt(bx, 100), p1: pt(bx + 40, 160), jointLabel: `extra-${i}` } });
      g.addNode({ id: `extra-ink-${i}`, kind: "ink-lineart-stroke", label: `엑스트라 선화 ${i}`, parentIds: [`extra-bone-${i}`], createdAtMs: BASE_MS + i * 10 + 1, layerOrder: 15, payload: { points: [pt(bx - 5, 100), pt(bx + 45, 160)], strokeWidth: 2, strokeColor: "#1E293B" } });
      g.addNode({ id: `extra-fill-${i}`, kind: "cel-fill-region", label: `엑스트라 채색 ${i}`, parentIds: [`extra-ink-${i}`], createdAtMs: BASE_MS + i * 10 + 2, layerOrder: 12, payload: { polygon: [pt(bx - 5, 100), pt(bx + 45, 100), pt(bx + 45, 160)], fillColor: "#CBD5E1", opacity: 0.9 } });
    }
    expect(g.size).toBe(30);
    g.commitRevision("30노드 대규모 씬 스냅샷", { timestampMs: BASE_MS + 5000 });
    const out = reprojectDownstreamFromHistoricalEdit(g, { nodeId: "bone-arm-right", label: "30노드 씬 주연 오른팔 +10°", timestampMs: BASE_MS + THREE_HOURS_MS, mutate: (n) => transformRoughSkeletonBone(n as RoughSkeletonBoneNode, { angleDeg: 10 }) });
    expect(out.report.integrityPassed).toBe(true);
    expect(out.report.recomputedNodeCount).toBe(4);
    expect(out.report.untouchedNodeCount).toBe(25);
    expect(out.report.maxLengthDriftRatio).toBeLessThan(0.015);
  });
});
