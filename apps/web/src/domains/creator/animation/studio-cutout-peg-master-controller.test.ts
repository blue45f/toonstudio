import { describe, expect, it } from "vitest";

import {
  evaluateCutoutRig,
  evaluateMasterControllerPad,
  IDENTITY_PEG_TRANSFORM,
  resolveDrawingSubstitutionAtFrame,
  solvePegTwoBoneIk2D,
  validatePegHierarchy,
  type CutoutRigDocument,
  type MasterControllerPad,
} from "./studio-cutout-peg-master-controller";

function buildCutoutFixture(): CutoutRigDocument {
  return {
    id: "hero-cutout",
    pegs: [
      {
        id: "peg-root",
        name: "루트",
        parentId: null,
        pivotX: 0,
        pivotY: 0,
        transform: { ...IDENTITY_PEG_TRANSFORM, tx: 100, ty: 100 },
        zOffset: 0,
      },
      {
        id: "peg-upper-arm",
        name: "상완",
        parentId: "peg-root",
        pivotX: 0,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 1,
        boneLengthPx: 100,
        angleLimit: { minDeg: -160, maxDeg: 160 },
      },
      {
        id: "peg-lower-arm",
        name: "전완",
        parentId: "peg-upper-arm",
        pivotX: 100,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 1,
        boneLengthPx: 80,
        angleLimit: { minDeg: -150, maxDeg: 150 },
      },
      {
        id: "peg-hand-open-thumb",
        name: "편 손 엄지",
        parentId: "peg-lower-arm",
        pivotX: 180,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 2,
        vitruvianSubRigId: "sub-hand-open",
      },
      {
        id: "peg-hand-fist-knuckle",
        name: "주먹 너클",
        parentId: "peg-lower-arm",
        pivotX: 180,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 2,
        vitruvianSubRigId: "sub-hand-fist",
      },
    ],
    banks: [
      {
        id: "bank-hand",
        name: "손 치환 뱅크",
        defaultSubstitutionId: "hand-open",
        entries: [
          {
            id: "hand-open",
            label: "편 손",
            artworkRef: "cel/hand_open",
            vitruvianSubRigId: "sub-hand-open",
          },
          {
            id: "hand-fist",
            label: "주먹",
            artworkRef: "cel/hand_fist",
            vitruvianSubRigId: "sub-hand-fist",
          },
        ],
      },
    ],
    layers: [
      {
        id: "layer-hand-open",
        name: "편 손 레이어",
        pegId: "peg-hand-open-thumb",
        substitutionBankId: "bank-hand",
        activeSubstitutionId: "hand-open",
        baseZOrder: 10,
        visible: true,
      },
      {
        id: "layer-hand-fist",
        name: "주먹 레이어",
        pegId: "peg-hand-fist-knuckle",
        substitutionBankId: "bank-hand",
        activeSubstitutionId: "hand-open",
        baseZOrder: 10,
        visible: true,
      },
    ],
    vitruvianGroups: [
      {
        id: "vg-right-hand",
        name: "오른손 Vitruvian 그룹",
        subRigIds: ["sub-hand-open", "sub-hand-fist"],
        activeSubRigId: "sub-hand-open",
      },
    ],
  };
}

describe("studio-cutout-peg-master-controller", () => {
  it("2D 2-Bone 해석적 IK가 부모 페그 이동 아래에서 목표 월드 좌표에 정확히 도달한다", () => {
    const doc = buildCutoutFixture();
    expect(validatePegHierarchy(doc.pegs)).toHaveLength(0);

    const targetX = 220;
    const targetY = 190;
    const sol = solvePegTwoBoneIk2D(doc, {
      upperPegId: "peg-upper-arm",
      lowerPegId: "peg-lower-arm",
      targetWorldX: targetX,
      targetWorldY: targetY,
      bendDirection: 1,
    });
    expect(sol).not.toBeNull();
    expect(sol?.reachedTarget).toBe(true);
    expect(sol?.endEffectorWorld.x).toBeCloseTo(targetX, 1);
    expect(sol?.endEffectorWorld.y).toBeCloseTo(targetY, 1);

    // 산출된 각도를 실제 컷아웃 리그 평가에 적용했을 때 전완 끝점이 목표와 일치해야 한다.
    const evalRig = evaluateCutoutRig(doc, {
      pegOverrides: {
        "peg-upper-arm": { rotationDeg: sol?.upperRotationDeg ?? 0 },
        "peg-lower-arm": { rotationDeg: sol?.lowerRotationDeg ?? 0 },
      },
    });
    const lowerTip = evalRig.pegs.get("peg-lower-arm")?.worldTip;
    expect(lowerTip?.x).toBeCloseTo(targetX, 1);
    expect(lowerTip?.y).toBeCloseTo(targetY, 1);
  });

  it("Vitruvian 드로잉 치환 스와퍼가 아트워크와 전용 서브 페그 활성 상태를 동시에 전환한다", () => {
    const doc = buildCutoutFixture();
    const initial = evaluateCutoutRig(doc);
    expect(initial.pegs.get("peg-hand-open-thumb")?.active).toBe(true);
    expect(initial.pegs.get("peg-hand-fist-knuckle")?.active).toBe(false);

    // 타임라인 키프레임 조회로 프레임 12의 치환 결정
    const bank = doc.banks[0];
    expect(bank).toBeDefined();
    const resolvedAt12 = bank
      ? resolveDrawingSubstitutionAtFrame(
          bank,
          [
            { frame: 0, substitutionId: "hand-open" },
            { frame: 10, substitutionId: "hand-fist" },
          ],
          12,
        )
      : null;
    expect(resolvedAt12?.id).toBe("hand-fist");

    const swapped = evaluateCutoutRig(doc, {
      substitutionOverrides: { "layer-hand-open": "hand-fist" },
    });
    expect(swapped.activeVitruvianSubRigs.has("sub-hand-fist")).toBe(true);
    expect(swapped.pegs.get("peg-hand-fist-knuckle")?.active).toBe(true);
    expect(swapped.pegs.get("peg-hand-open-thumb")?.active).toBe(false);
  });

  it("마스터 컨트롤러 2D 포즈 패드가 이중선형 보간·최단 원호 각도 블렌딩·히스테리시스 치환을 수행한다", () => {
    const pad: MasterControllerPad = {
      id: "mc-head-turn",
      name: "고개 2D 포즈 패드",
      mode: "bilinear-grid",
      substitutionHysteresis: 0.1,
      poses: [
        {
          id: "left-up",
          label: "좌상",
          u: -1,
          v: -1,
          pegOverrides: { "peg-head": { tx: -20, ty: -10, rotationDeg: 170 } },
          substitutionVotes: { "layer-head": "head_left" },
        },
        {
          id: "right-up",
          label: "우상",
          u: 1,
          v: -1,
          pegOverrides: { "peg-head": { tx: 20, ty: -10, rotationDeg: -170 } },
          substitutionVotes: { "layer-head": "head_right" },
        },
        {
          id: "left-down",
          label: "좌하",
          u: -1,
          v: 1,
          pegOverrides: { "peg-head": { tx: -20, ty: 10, rotationDeg: 170 } },
          substitutionVotes: { "layer-head": "head_left" },
        },
        {
          id: "right-down",
          label: "우하",
          u: 1,
          v: 1,
          pegOverrides: { "peg-head": { tx: 20, ty: 10, rotationDeg: -170 } },
          substitutionVotes: { "layer-head": "head_right" },
        },
      ],
    };

    const center = evaluateMasterControllerPad(pad, 0, 0);
    expect(center.pegTransforms["peg-head"]?.tx).toBeCloseTo(0, 4);
    expect(center.pegTransforms["peg-head"]?.ty).toBeCloseTo(0, 4);
    // 170도와 -170도의 최단 원호 중간은 0도가 아니라 ±180도여야 한다.
    expect(Math.abs(center.pegTransforms["peg-head"]?.rotationDeg ?? 0)).toBeCloseTo(180, 1);

    // 경계선 직후(u=0.04)는 이전 치환(head_left)을 히스테리시스로 유지해 깜빡임을 방지한다.
    const nearEdge = evaluateMasterControllerPad(pad, 0.04, 0, { "layer-head": "head_left" });
    expect(nearEdge.substitutionIds["layer-head"]).toBe("head_left");

    // 임계 이상 이동(u=0.3)하면 확실히 head_right로 전환된다.
    const pastEdge = evaluateMasterControllerPad(pad, 0.3, 0, { "layer-head": "head_left" });
    expect(pastEdge.substitutionIds["layer-head"]).toBe("head_right");
  });

  it("순환 참조 페그 계층을 오류로 보고한다", () => {
    const errors = validatePegHierarchy([
      {
        id: "p1",
        name: "P1",
        parentId: "p2",
        pivotX: 0,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 0,
      },
      {
        id: "p2",
        name: "P2",
        parentId: "p1",
        pivotX: 0,
        pivotY: 0,
        transform: IDENTITY_PEG_TRANSFORM,
        zOffset: 0,
      },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
