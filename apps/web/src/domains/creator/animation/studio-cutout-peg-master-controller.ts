/**
 * Toon Boom Harmony / Moho 14 클린룸 2D 컷아웃 페그(Peg) 계층 ·
 * Vitruvian 드로잉 치환 스와퍼 · 온캔버스 마스터 컨트롤러 2D 포즈 패드.
 *
 * 구성:
 * 1. `PegHierarchyGraph`: 시각 아트워크와 분리된 2D 페그 변환 트리(`pivot, tx, ty, rotDeg, sx, sy, skewX`) 및 순환 검증
 * 2. 2D 2-Bone 해석적 IK(`solvePegTwoBoneIk2D`): 부모 역행렬 변환 + 코사인 법칙 + 관절 각도 제한
 * 3. `DrawingSubstitutionBank` & Moho Vitruvian 서브 페그 그룹: 드로잉 치환 시 전용 서브 본/페그 자동 스위칭
 * 4. `MasterControllerPad`: 4~9개 기준 포즈 키에 대한 이중선형 격자 / RBF 가중 보간 + 히스테리시스 치환 스와프
 */

import {
  applyMatrix2DToPoint,
  invertMatrix2D,
  multiplyMatrix2D,
  type AffineMatrix2D,
} from "./studio-light-table";

export interface PegTransformValues {
  readonly tx: number;
  readonly ty: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewXDeg: number;
}

export const IDENTITY_PEG_TRANSFORM: PegTransformValues = Object.freeze({
  tx: 0,
  ty: 0,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  skewXDeg: 0,
});

export interface PegAngleLimit {
  readonly minDeg: number;
  readonly maxDeg: number;
}

export interface PegNode {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly transform: PegTransformValues;
  readonly zOffset: number;
  /** 2D 2-Bone IK용 본 길이(px, 선택). */
  readonly boneLengthPx?: number;
  readonly angleLimit?: PegAngleLimit;
  /** Vitruvian 서브 리그 소속 ID(미지정 시 상시 활성). */
  readonly vitruvianSubRigId?: string;
}

export interface DrawingSubstitutionEntry {
  readonly id: string;
  readonly label: string;
  readonly artworkRef: string;
  readonly offsetX?: number;
  readonly offsetY?: number;
  /** 이 드로잉이 선택될 때 함께 활성화할 Vitruvian 서브 리그 ID. */
  readonly vitruvianSubRigId?: string;
}

export interface DrawingSubstitutionBank {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly DrawingSubstitutionEntry[];
  readonly defaultSubstitutionId: string;
}

export interface SubstitutionKeyframe {
  readonly frame: number;
  readonly substitutionId: string;
}

export interface CutoutDrawingLayer {
  readonly id: string;
  readonly name: string;
  readonly pegId: string;
  readonly substitutionBankId: string;
  readonly activeSubstitutionId: string;
  readonly baseZOrder: number;
  readonly visible: boolean;
}

export interface VitruvianRigGroup {
  readonly id: string;
  readonly name: string;
  /** 이 Vitruvian 그룹에 속한 서브 리그 ID 집합(한 번에 하나만 활성). */
  readonly subRigIds: readonly string[];
  readonly activeSubRigId: string;
}

export interface CutoutRigDocument {
  readonly id: string;
  readonly pegs: readonly PegNode[];
  readonly banks: readonly DrawingSubstitutionBank[];
  readonly layers: readonly CutoutDrawingLayer[];
  readonly vitruvianGroups: readonly VitruvianRigGroup[];
}

export interface EvaluatedPegNode {
  readonly id: string;
  readonly active: boolean;
  readonly localMatrix: AffineMatrix2D;
  readonly worldMatrix: AffineMatrix2D;
  readonly worldPivot: { readonly x: number; readonly y: number };
  readonly worldTip: { readonly x: number; readonly y: number } | null;
  readonly accumulatedZOrder: number;
}

export interface EvaluatedCutoutLayer {
  readonly layerId: string;
  readonly name: string;
  readonly pegId: string;
  readonly visible: boolean;
  readonly worldMatrix: AffineMatrix2D;
  readonly zOrder: number;
  readonly substitutionId: string;
  readonly artworkRef: string;
  readonly activeVitruvianSubRigId: string | null;
}

export interface EvaluatedCutoutRig {
  readonly pegs: ReadonlyMap<string, EvaluatedPegNode>;
  readonly layers: readonly EvaluatedCutoutLayer[];
  readonly activeVitruvianSubRigs: ReadonlySet<string>;
}

export interface TwoBoneIkSolution {
  readonly upperPegId: string;
  readonly lowerPegId: string;
  readonly upperRotationDeg: number;
  readonly lowerRotationDeg: number;
  readonly reachedTarget: boolean;
  readonly endEffectorWorld: { readonly x: number; readonly y: number };
}

export interface MasterControllerPoseKey {
  readonly id: string;
  readonly label: string;
  /** 온캔버스 2D 포즈 패드 정규화 좌표 `u ∈ [-1, 1]`, `v ∈ [-1, 1]`. */
  readonly u: number;
  readonly v: number;
  readonly pegOverrides: Readonly<Record<string, Partial<PegTransformValues>>>;
  /** 레이어 ID → 이 포즈에서 선호하는 드로잉 치환 ID. */
  readonly substitutionVotes?: Readonly<Record<string, string>>;
}

export type MasterControllerMode = "bilinear-grid" | "rbf";

export interface MasterControllerPad {
  readonly id: string;
  readonly name: string;
  readonly mode: MasterControllerMode;
  readonly poses: readonly MasterControllerPoseKey[];
  /** 드로잉 치환 경계 깜빡임 방지 히스테리시스 마진(기본 0.08). */
  readonly substitutionHysteresis?: number;
}

export interface EvaluatedMasterControllerPose {
  readonly u: number;
  readonly v: number;
  readonly poseWeights: readonly { readonly poseId: string; readonly weight: number }[];
  readonly pegTransforms: Readonly<Record<string, PegTransformValues>>;
  readonly substitutionIds: Readonly<Record<string, string>>;
}

const IDENTITY_MATRIX: AffineMatrix2D = [1, 0, 0, 1, 0, 0];

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampAngle(deg: number, limit?: PegAngleLimit): number {
  if (!limit) return deg;
  return clamp(deg, limit.minDeg, limit.maxDeg);
}

/** 페그 로컬 변환(피벗 중심 스케일·스큐·회전 + 평행이동)을 2x3 아핀 행렬로 구성한다. */
export function buildPegLocalMatrix(
  pivotX: number,
  pivotY: number,
  t: PegTransformValues,
  limit?: PegAngleLimit,
): AffineMatrix2D {
  const rotRad = (clampAngle(t.rotationDeg, limit) * Math.PI) / 180;
  const skewRad = (clamp(t.skewXDeg, -80, 80) * Math.PI) / 180;
  const tanSkew = Math.tan(skewRad);
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const toLocal: AffineMatrix2D = [1, 0, 0, 1, -pivotX, -pivotY];
  const scaleMat: AffineMatrix2D = [t.scaleX, 0, 0, t.scaleY, 0, 0];
  const skewMat: AffineMatrix2D = [1, 0, tanSkew, 1, 0, 0];
  const rotMat: AffineMatrix2D = [cos, sin, -sin, cos, 0, 0];
  const backTranslate: AffineMatrix2D = [1, 0, 0, 1, pivotX + t.tx, pivotY + t.ty];

  return multiplyMatrix2D(
    backTranslate,
    multiplyMatrix2D(rotMat, multiplyMatrix2D(skewMat, multiplyMatrix2D(scaleMat, toLocal))),
  );
}

/** 페그 계층의 순환 참조·중복 ID·누락 부모를 검증한다. */
export function validatePegHierarchy(pegs: readonly PegNode[]): readonly string[] {
  const byId = new Map<string, PegNode>();
  const errors: string[] = [];
  for (const peg of pegs) {
    if (byId.has(peg.id)) errors.push(`중복된 페그 ID: ${peg.id}`);
    byId.set(peg.id, peg);
  }
  for (const peg of pegs) {
    const seen = new Set<string>([peg.id]);
    let cur = peg.parentId;
    while (cur !== null) {
      if (seen.has(cur)) {
        errors.push(`페그 계층 순환 참조 감지: ${peg.id} -> ${cur}`);
        break;
      }
      const parent = byId.get(cur);
      if (!parent) {
        errors.push(`존재하지 않는 부모 페그 참조: ${peg.id} -> ${cur}`);
        break;
      }
      seen.add(cur);
      cur = parent.parentId;
    }
  }
  return errors;
}

/** 타임라인 프레임에 대한 Held-Until-Next 드로잉 치환 ID를 조회한다. */
export function resolveDrawingSubstitutionAtFrame(
  bank: DrawingSubstitutionBank,
  keyframes: readonly SubstitutionKeyframe[],
  frame: number,
): DrawingSubstitutionEntry | null {
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  let activeId = bank.defaultSubstitutionId;
  for (const kf of sorted) {
    if (kf.frame <= frame) {
      activeId = kf.substitutionId;
    } else {
      break;
    }
  }
  return (
    bank.entries.find((e) => e.id === activeId) ??
    bank.entries.find((e) => e.id === bank.defaultSubstitutionId) ??
    bank.entries[0] ??
    null
  );
}

/**
 * 컷아웃 페그 계층·Vitruvian 서브 리그·드로잉 치환 레이어를 일괄 평가한다.
 * 드로잉 치환이 Vitruvian 서브 리그 ID를 가리키면 해당 그룹의 활성 서브 리그를 자동 교체한다.
 */
export function evaluateCutoutRig(
  doc: CutoutRigDocument,
  options: {
    readonly pegOverrides?: Readonly<Record<string, Partial<PegTransformValues>>>;
    readonly substitutionOverrides?: Readonly<Record<string, string>>;
  } = {},
): EvaluatedCutoutRig {
  const bankById = new Map<string, DrawingSubstitutionBank>(doc.banks.map((b) => [b.id, b]));
  const pegById = new Map<string, PegNode>(doc.pegs.map((p) => [p.id, p]));

  // Vitruvian 그룹별 활성 서브 리그 결정 (레이어 드로잉 치환이 우선 오버라이드)
  const subRigToGroup = new Map<string, string>();
  const activeByGroup = new Map<string, string>();
  for (const group of doc.vitruvianGroups) {
    activeByGroup.set(group.id, group.activeSubRigId);
    for (const subId of group.subRigIds) {
      subRigToGroup.set(subId, group.id);
    }
  }

  const resolvedLayerSubs = new Map<
    string,
    { readonly entry: DrawingSubstitutionEntry; readonly subId: string }
  >();
  // 1단계: 기본 레이어 치환 해석, 2단계: 명시적 substitutionOverrides 우선 적용(공유 뱅크 충돌 방지)
  for (const layer of doc.layers) {
    const bank = bankById.get(layer.substitutionBankId);
    const wantedId = options.substitutionOverrides?.[layer.id] ?? layer.activeSubstitutionId;
    const entry =
      bank?.entries.find((e) => e.id === wantedId) ??
      bank?.entries.find((e) => e.id === bank.defaultSubstitutionId) ??
      bank?.entries[0];
    if (entry) {
      resolvedLayerSubs.set(layer.id, { entry, subId: entry.id });
      if (entry.vitruvianSubRigId && options.substitutionOverrides?.[layer.id] === undefined) {
        const groupId = subRigToGroup.get(entry.vitruvianSubRigId);
        if (groupId) activeByGroup.set(groupId, entry.vitruvianSubRigId);
      }
    }
  }
  for (const layer of doc.layers) {
    if (options.substitutionOverrides?.[layer.id] === undefined) continue;
    const resolved = resolvedLayerSubs.get(layer.id);
    if (resolved?.entry.vitruvianSubRigId) {
      const groupId = subRigToGroup.get(resolved.entry.vitruvianSubRigId);
      if (groupId) activeByGroup.set(groupId, resolved.entry.vitruvianSubRigId);
    }
  }

  const activeVitruvianSubRigs = new Set<string>(activeByGroup.values());
  const evaluatedPegs = new Map<string, EvaluatedPegNode>();

  const evalPeg = (pegId: string, stack: Set<string>): EvaluatedPegNode | null => {
    const cached = evaluatedPegs.get(pegId);
    if (cached) return cached;
    const peg = pegById.get(pegId);
    if (!peg || stack.has(pegId)) return null;
    stack.add(pegId);

    const parentEval = peg.parentId ? evalPeg(peg.parentId, stack) : null;
    const override = options.pegOverrides?.[peg.id];
    const mergedTransform: PegTransformValues = override
      ? { ...peg.transform, ...override }
      : peg.transform;

    const localMatrix = buildPegLocalMatrix(
      peg.pivotX,
      peg.pivotY,
      mergedTransform,
      peg.angleLimit,
    );
    const worldMatrix = parentEval
      ? multiplyMatrix2D(parentEval.worldMatrix, localMatrix)
      : localMatrix;
    const worldPivot = applyMatrix2DToPoint(worldMatrix, peg.pivotX, peg.pivotY);
    const worldTip =
      peg.boneLengthPx !== undefined && peg.boneLengthPx > 0
        ? applyMatrix2DToPoint(worldMatrix, peg.pivotX + peg.boneLengthPx, peg.pivotY)
        : null;

    const groupId = peg.vitruvianSubRigId ? subRigToGroup.get(peg.vitruvianSubRigId) : undefined;
    const ownActive =
      groupId === undefined || activeByGroup.get(groupId) === peg.vitruvianSubRigId;
    const active = ownActive && (parentEval ? parentEval.active : true);
    const accumulatedZOrder = (parentEval?.accumulatedZOrder ?? 0) + peg.zOffset;

    const result: EvaluatedPegNode = {
      id: peg.id,
      active,
      localMatrix,
      worldMatrix,
      worldPivot,
      worldTip,
      accumulatedZOrder,
    };
    evaluatedPegs.set(pegId, result);
    stack.delete(pegId);
    return result;
  };

  for (const peg of doc.pegs) {
    evalPeg(peg.id, new Set<string>());
  }

  const layers: EvaluatedCutoutLayer[] = doc.layers
    .map((layer) => {
      const pegEval = evaluatedPegs.get(layer.pegId);
      const sub = resolvedLayerSubs.get(layer.id);
      const offX = sub?.entry.offsetX ?? 0;
      const offY = sub?.entry.offsetY ?? 0;
      const offsetMat: AffineMatrix2D = [1, 0, 0, 1, offX, offY];
      const baseWorld = pegEval?.worldMatrix ?? IDENTITY_MATRIX;
      const worldMatrix = multiplyMatrix2D(baseWorld, offsetMat);
      return {
        layerId: layer.id,
        name: layer.name,
        pegId: layer.pegId,
        visible: layer.visible && (pegEval ? pegEval.active : true),
        worldMatrix,
        zOrder: layer.baseZOrder + (pegEval?.accumulatedZOrder ?? 0),
        substitutionId: sub?.subId ?? layer.activeSubstitutionId,
        artworkRef: sub?.entry.artworkRef ?? "",
        activeVitruvianSubRigId: sub?.entry.vitruvianSubRigId ?? null,
      };
    })
    .sort((a, b) => a.zOrder - b.zOrder);

  return { pegs: evaluatedPegs, layers, activeVitruvianSubRigs };
}

/**
 * 2D 2-Bone 해석적 IK 솔버:
 * 상위 페그(`upperPegId`, 길이 L1)와 하위 페그(`lowerPegId`, 길이 L2)의 로컬 회전각을
 * 코사인 법칙으로 해석 계산하고 관절 각도 제한을 적용한다.
 */
export function solvePegTwoBoneIk2D(
  doc: CutoutRigDocument,
  options: {
    readonly upperPegId: string;
    readonly lowerPegId: string;
    readonly targetWorldX: number;
    readonly targetWorldY: number;
    readonly bendDirection?: 1 | -1;
    readonly pegOverrides?: Readonly<Record<string, Partial<PegTransformValues>>>;
  },
): TwoBoneIkSolution | null {
  const upperPeg = doc.pegs.find((p) => p.id === options.upperPegId);
  const lowerPeg = doc.pegs.find((p) => p.id === options.lowerPegId);
  if (!upperPeg || !lowerPeg) return null;

  const baseEval = evaluateCutoutRig(doc, { pegOverrides: options.pegOverrides });
  const parentWorld = upperPeg.parentId
    ? (baseEval.pegs.get(upperPeg.parentId)?.worldMatrix ?? IDENTITY_MATRIX)
    : IDENTITY_MATRIX;
  const invParent = invertMatrix2D(parentWorld) ?? IDENTITY_MATRIX;

  const l1 = Math.max(
    1e-3,
    upperPeg.boneLengthPx ??
      Math.hypot(lowerPeg.pivotX - upperPeg.pivotX, lowerPeg.pivotY - upperPeg.pivotY),
  );
  const l2 = Math.max(1e-3, lowerPeg.boneLengthPx ?? l1);

  const rootLocalX = upperPeg.pivotX + (options.pegOverrides?.[upperPeg.id]?.tx ?? upperPeg.transform.tx);
  const rootLocalY = upperPeg.pivotY + (options.pegOverrides?.[upperPeg.id]?.ty ?? upperPeg.transform.ty);
  const targetLocal = applyMatrix2DToPoint(invParent, options.targetWorldX, options.targetWorldY);

  const dx = targetLocal.x - rootLocalX;
  const dy = targetLocal.y - rootLocalY;
  const rawDist = Math.hypot(dx, dy);
  const minReach = Math.abs(l1 - l2) + 1e-3;
  const maxReach = l1 + l2 - 1e-3;
  const dist = clamp(rawDist, minReach, maxReach);
  const reachedTarget = rawDist >= minReach && rawDist <= l1 + l2 + 1e-2;

  const bend = options.bendDirection ?? 1;
  const baseAngle = Math.atan2(dy, dx);
  const cosShoulder = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const shoulderOffset = Math.acos(cosShoulder);
  const cosElbow = clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1);
  const elbowInterior = Math.acos(cosElbow);

  const rawUpperRad = baseAngle - bend * shoulderOffset;
  const rawLowerRad = bend * (Math.PI - elbowInterior);

  const upperRotationDeg = clampAngle((rawUpperRad * 180) / Math.PI, upperPeg.angleLimit);
  const lowerRotationDeg = clampAngle((rawLowerRad * 180) / Math.PI, lowerPeg.angleLimit);

  const finalUpperRad = (upperRotationDeg * Math.PI) / 180;
  const finalTotalRad = finalUpperRad + (lowerRotationDeg * Math.PI) / 180;
  const endLocalX = rootLocalX + l1 * Math.cos(finalUpperRad) + l2 * Math.cos(finalTotalRad);
  const endLocalY = rootLocalY + l1 * Math.sin(finalUpperRad) + l2 * Math.sin(finalTotalRad);
  const endEffectorWorld = applyMatrix2DToPoint(parentWorld, endLocalX, endLocalY);

  return {
    upperPegId: upperPeg.id,
    lowerPegId: lowerPeg.id,
    upperRotationDeg,
    lowerRotationDeg,
    reachedTarget,
    endEffectorWorld,
  };
}

function computePoseWeights(
  pad: MasterControllerPad,
  u: number,
  v: number,
): readonly { readonly pose: MasterControllerPoseKey; readonly weight: number }[] {
  if (pad.poses.length === 0) return [];
  if (pad.poses.length === 1) {
    const only = pad.poses[0];
    return only ? [{ pose: only, weight: 1 }] : [];
  }

  // 정확히 기준 포즈 위에 놓였으면 해당 포즈 가중치 1.0 보장
  for (const pose of pad.poses) {
    if (Math.hypot(u - pose.u, v - pose.v) <= 1e-6) {
      return pad.poses.map((p) => ({ pose: p, weight: p.id === pose.id ? 1 : 0 }));
    }
  }

  if (pad.mode === "bilinear-grid") {
    const xs = Array.from(new Set(pad.poses.map((p) => p.u))).sort((a, b) => a - b);
    const ys = Array.from(new Set(pad.poses.map((p) => p.v))).sort((a, b) => a - b);
    const poseMap = new Map<string, MasterControllerPoseKey>();
    for (const p of pad.poses) {
      poseMap.set(`${p.u}:${p.v}`, p);
    }

    if (xs.length >= 2 && ys.length >= 2) {
      const findSpan = (axis: readonly number[], val: number): [number, number, number] => {
        const first = axis[0] ?? 0;
        const last = axis[axis.length - 1] ?? 0;
        if (val <= first) return [0, 0, 0];
        if (val >= last) return [axis.length - 1, axis.length - 1, 0];
        for (let i = 0; i < axis.length - 1; i += 1) {
          const a = axis[i] ?? 0;
          const b = axis[i + 1] ?? a;
          if (val >= a && val <= b) {
            return [i, i + 1, b - a > 1e-6 ? (val - a) / (b - a) : 0];
          }
        }
        return [axis.length - 1, axis.length - 1, 0];
      };

      const [ix0, ix1, tx] = findSpan(xs, u);
      const [iy0, iy1, ty] = findSpan(ys, v);
      const p00 = poseMap.get(`${xs[ix0]}:${ys[iy0]}`);
      const p10 = poseMap.get(`${xs[ix1]}:${ys[iy0]}`);
      const p01 = poseMap.get(`${xs[ix0]}:${ys[iy1]}`);
      const p11 = poseMap.get(`${xs[ix1]}:${ys[iy1]}`);

      if (p00 && p10 && p01 && p11) {
        const acc = new Map<string, number>();
        const addW = (id: string, w: number) => acc.set(id, (acc.get(id) ?? 0) + w);
        addW(p00.id, (1 - tx) * (1 - ty));
        addW(p10.id, tx * (1 - ty));
        addW(p01.id, (1 - tx) * ty);
        addW(p11.id, tx * ty);
        return pad.poses.map((p) => ({ pose: p, weight: acc.get(p.id) ?? 0 }));
      }
    }
  }

  // 산재 포즈용 정규화 가우시안-역거리 하이브리드 RBF 가중치(Σ w_i = 1)
  const rawWeights = pad.poses.map((pose) => {
    const d2 = (u - pose.u) * (u - pose.u) + (v - pose.v) * (v - pose.v);
    return 1 / (d2 + 1e-5) * Math.exp(-d2 * 1.5);
  });
  const total = rawWeights.reduce((sum, w) => sum + w, 0);
  return pad.poses.map((pose, i) => ({
    pose,
    weight: total > 0 ? (rawWeights[i] ?? 0) / total : 0,
  }));
}

/**
 * 온캔버스 마스터 컨트롤러 2D 포즈 패드 `(u, v) ∈ [-1, 1]²`를 평가해
 * 모든 대상 페그의 보간 변환(최단 원호 각도 보간 포함)과 드로잉 치환 투표를 동시에 산출한다.
 */
export function evaluateMasterControllerPad(
  pad: MasterControllerPad,
  uRaw: number,
  vRaw: number,
  previousSubstitutions: Readonly<Record<string, string>> = {},
): EvaluatedMasterControllerPose {
  const u = clamp(uRaw, -1, 1);
  const v = clamp(vRaw, -1, 1);
  const weighted = computePoseWeights(pad, u, v);

  const pegIds = new Set<string>();
  const layerIds = new Set<string>();
  for (const pose of pad.poses) {
    for (const pid of Object.keys(pose.pegOverrides)) pegIds.add(pid);
    if (pose.substitutionVotes) {
      for (const lid of Object.keys(pose.substitutionVotes)) layerIds.add(lid);
    }
  }

  const pegTransforms: Record<string, PegTransformValues> = {};
  for (const pegId of pegIds) {
    let tx = 0;
    let ty = 0;
    let scaleX = 0;
    let scaleY = 0;
    let skewXDeg = 0;
    let sinSum = 0;
    let cosSum = 0;
    let totalW = 0;

    for (const { pose, weight } of weighted) {
      if (weight <= 1e-7) continue;
      const ov = pose.pegOverrides[pegId];
      const t: PegTransformValues = ov ? { ...IDENTITY_PEG_TRANSFORM, ...ov } : IDENTITY_PEG_TRANSFORM;
      tx += t.tx * weight;
      ty += t.ty * weight;
      scaleX += t.scaleX * weight;
      scaleY += t.scaleY * weight;
      skewXDeg += t.skewXDeg * weight;
      const rad = (t.rotationDeg * Math.PI) / 180;
      sinSum += Math.sin(rad) * weight;
      cosSum += Math.cos(rad) * weight;
      totalW += weight;
    }

    const rotationDeg =
      Math.hypot(sinSum, cosSum) > 1e-6 ? (Math.atan2(sinSum, cosSum) * 180) / Math.PI : 0;
    pegTransforms[pegId] =
      totalW > 1e-6
        ? { tx, ty, rotationDeg, scaleX, scaleY, skewXDeg }
        : IDENTITY_PEG_TRANSFORM;
  }

  const hysteresis = clamp(pad.substitutionHysteresis ?? 0.08, 0, 0.45);
  const substitutionIds: Record<string, string> = {};
  for (const layerId of layerIds) {
    const voteScores = new Map<string, number>();
    for (const { pose, weight } of weighted) {
      const subId = pose.substitutionVotes?.[layerId];
      if (!subId || weight <= 1e-7) continue;
      voteScores.set(subId, (voteScores.get(subId) ?? 0) + weight);
    }
    let bestSubId = "";
    let bestScore = -1;
    for (const [subId, score] of voteScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestSubId = subId;
      }
    }
    const prevSubId = previousSubstitutions[layerId];
    const prevScore = prevSubId ? (voteScores.get(prevSubId) ?? 0) : -1;
    if (prevSubId && prevScore > 0 && bestSubId !== prevSubId && bestScore - prevScore < hysteresis) {
      substitutionIds[layerId] = prevSubId;
    } else if (bestSubId) {
      substitutionIds[layerId] = bestSubId;
    }
  }

  return {
    u,
    v,
    poseWeights: weighted.map(({ pose, weight }) => ({ poseId: pose.id, weight })),
    pegTransforms,
    substitutionIds,
  };
}
