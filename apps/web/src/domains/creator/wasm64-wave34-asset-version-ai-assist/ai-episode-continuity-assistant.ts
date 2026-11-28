/**
 * Wasm64 Wave 34: 회차 연속성 로컬 진단 및 비침습 패치 제안 AI 어시스턴트 코어
 * (`ai-episode-continuity-assistant`).
 *
 * 1. 캐릭터 파츠별 고유색 이탈: 장면 조명(노출·주변광 색조) 보정 후 Oklab 및 CIEDE2000(`ΔE00`) 색차를 평가해
 *    석양·야간 조명은 오탐하지 않고 실제 오채색만 검출한다.
 * 2. 인접 컷 간 주광원(Key Light) 방향 급변: 씬 전환 및 대화 180° 리버스쇼트(`cameraReverseShot180`) 반전 기하학을
 *    반영해 오탐을 억제하고 동일 공간 내 비논리적 광원 점프만 경고한다.
 * 3. 말풍선 꼬리 오연결 및 읽기 순서 역전: 화자 얼굴·바운딩 이탈과 웹툰(`ltr-top-down`, 좌상→우하) /
 *    출판 만화(`rtl-manga-top-down`, 우상→좌하) 시선 흐름 역전을 검출한다.
 *
 * 원본 문서를 절대 직접 덮어쓰지 않으며(`sourceMutated === false`), 비침습 패치 제안과 복제본 미리보기만 생성한다.
 */

import { canonicalizeStructure, computeFnv1a64Hex } from "./creator-asset-version-dag";
import {
  formatOklchCss,
  oklabToLinearSrgb,
  oklabToOklch,
  type CanvasPoint2D,
  type OklabColor,
} from "./workspace-asset-transcode-pipeline";

export const DEFAULT_COLOR_DELTA_E00_TOLERANCE = 4.5 as const;
export const DEFAULT_MAX_KEY_LIGHT_JUMP_DEG = 95 as const;
export const DEFAULT_MAX_TAIL_BODY_GAP_PX = 64 as const;
export const DEFAULT_MAX_TAIL_FACE_DISTANCE_PX = 110 as const;

export interface CieLabD65Color {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface ContinuityRect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ReadingFlowDirection = "ltr-top-down" | "rtl-manga-top-down";

export type CutSceneTransitionKind =
  | "continuous"
  | "location-change"
  | "time-skip"
  | "flashback"
  | "dramatic-backlight";

export interface CharacterPartReference {
  readonly partId: string;
  readonly partLabelKo: string;
  readonly referenceOklab: OklabColor;
  readonly maxDeltaE00?: number;
}

export interface CharacterReferenceSheet {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly parts: Readonly<Record<string, CharacterPartReference>>;
}

export interface CutLightingContext {
  readonly keyLightAzimuthDeg: number;
  readonly keyLightElevationDeg?: number;
  readonly exposureShiftL?: number;
  readonly ambientShiftA?: number;
  readonly ambientShiftB?: number;
  readonly lightingInfluence?: number;
}

export interface CutCharacterNode {
  readonly characterId: string;
  readonly characterNameKo?: string;
  readonly bounds: ContinuityRect2D;
  readonly faceAnchor: CanvasPoint2D;
  readonly observedPartOklab: Readonly<Record<string, OklabColor>>;
}

export interface CutSpeechBalloonNode {
  readonly balloonId: string;
  readonly readingOrder: number;
  readonly bounds: ContinuityRect2D;
  readonly intendedSpeakerId?: string | null;
  readonly isNarration?: boolean;
  readonly tailTip?: CanvasPoint2D | null;
}

export interface EpisodeContinuityCut {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly transitionKind?: CutSceneTransitionKind;
  readonly cameraReverseShot180?: boolean;
  readonly lighting: CutLightingContext;
  readonly characters: readonly CutCharacterNode[];
  readonly balloons: readonly CutSpeechBalloonNode[];
}

export interface EpisodeContinuityDocument {
  readonly episodeId: string;
  readonly readingDirection: ReadingFlowDirection;
  readonly characterSheets: readonly CharacterReferenceSheet[];
  readonly cuts: readonly EpisodeContinuityCut[];
}

export type ContinuityFindingKind =
  | "character-part-color-drift"
  | "abrupt-key-light-flip"
  | "balloon-tail-speaker-mismatch"
  | "balloon-reading-order-inversion";

export type ContinuitySeverity = "warning" | "error";

export type ContinuityPatchPayload =
  | {
      readonly kind: "replace-part-color";
      readonly cutId: string;
      readonly characterId: string;
      readonly partId: string;
      readonly beforeOklab: OklabColor;
      readonly proposedOklab: OklabColor;
      readonly proposedCssOklch: string;
    }
  | {
      readonly kind: "align-key-light-azimuth";
      readonly cutId: string;
      readonly beforeAzimuthDeg: number;
      readonly proposedAzimuthDeg: number;
    }
  | {
      readonly kind: "snap-balloon-tail";
      readonly cutId: string;
      readonly balloonId: string;
      readonly targetSpeakerId: string;
      readonly beforeTailTip: CanvasPoint2D;
      readonly proposedTailTip: CanvasPoint2D;
    }
  | {
      readonly kind: "reorder-cut-balloons";
      readonly cutId: string;
      readonly beforeOrderByBalloonId: Readonly<Record<string, number>>;
      readonly proposedOrderByBalloonId: Readonly<Record<string, number>>;
    };

export interface NonDestructivePatchProposal {
  readonly proposalId: string;
  readonly cutId: string;
  readonly findingKind: ContinuityFindingKind;
  readonly targetPath: string;
  readonly requiresCreatorApproval: true;
  readonly confidence: number;
  readonly rationaleKo: string;
  readonly payload: ContinuityPatchPayload;
}

export interface ContinuityFinding {
  readonly findingId: string;
  readonly kind: ContinuityFindingKind;
  readonly severity: ContinuitySeverity;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly messageKo: string;
  readonly proposalId: string;
}

export interface ContinuityAuditOptions {
  readonly defaultColorDeltaE00Tolerance?: number;
  readonly maxKeyLightJumpDeg?: number;
  readonly maxTailBodyGapPx?: number;
  readonly maxTailFaceDistancePx?: number;
  readonly rowBandTolerancePx?: number;
  readonly horizontalDeadzonePx?: number;
}

export interface ContinuityAuditReport {
  readonly episodeId: string;
  readonly scannedCutCount: number;
  readonly findings: readonly ContinuityFinding[];
  readonly patchProposals: readonly NonDestructivePatchProposal[];
  readonly inputDigestBefore: string;
  readonly inputDigestAfter: string;
  readonly sourceMutated: boolean;
  readonly summaryKo: string;
}

export interface ContinuityPatchPreviewResult {
  readonly previewDocument: EpisodeContinuityDocument;
  readonly appliedProposalIds: readonly string[];
  readonly originalDocumentDigest: string;
  readonly previewDocumentDigest: string;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const LAB_DELTA = 6 / 29;
const LAB_DELTA_CUBED = LAB_DELTA * LAB_DELTA * LAB_DELTA;
const LAB_SLOPE = 1 / (3 * LAB_DELTA * LAB_DELTA);
const POW25_7 = 25 ** 7;

function clamp01(value: number): number {
  return !Number.isFinite(value) || value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** 방위각을 `[0, 360)` 구간으로 정규화한다. */
export function normalizeAzimuthDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const wrapped = ((angleDeg % 360) + 360) % 360;
  return wrapped === 0 ? 0 : wrapped;
}

/** 두 방위각 사이의 최단 원형 각도 차이(`[0, 180]`)를 계산한다. */
export function shortestAzimuthDeltaDeg(aDeg: number, bDeg: number): number {
  const diff = Math.abs(normalizeAzimuthDeg(aDeg) - normalizeAzimuthDeg(bDeg));
  return diff > 180 ? 360 - diff : diff;
}

/** 두 Oklab 색상 사이의 유클리드 지각 거리를 반환한다. */
export function computeOklabDistance(a: OklabColor, b: OklabColor): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function cieLabF(t: number): number {
  return t > LAB_DELTA_CUBED ? Math.cbrt(t) : LAB_SLOPE * t + 4 / 29;
}

/** Oklab 색상을 D65 기준 CIE 1976 L*a*b* 좌표로 변환한다. */
export function oklabToCieLabD65(color: OklabColor): CieLabD65Color {
  const lin = oklabToLinearSrgb(color);
  const fx = cieLabF((0.4124564 * lin.r + 0.3575761 * lin.g + 0.1804375 * lin.b) / 0.95047);
  const fy = cieLabF(0.2126729 * lin.r + 0.7151522 * lin.g + 0.072175 * lin.b);
  const fz = cieLabF((0.0193339 * lin.r + 0.119192 * lin.g + 0.9503041 * lin.b) / 1.08883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma, Wu, Dalal (2005) 표준 공식으로 두 Oklab 색상 간 CIEDE2000(`ΔE00`) 색차를 계산한다. */
export function computeCiede2000FromOklab(c1: OklabColor, c2: OklabColor): number {
  const lab1 = oklabToCieLabD65(c1);
  const lab2 = oklabToCieLabD65(c2);
  const cabMean7 = (0.5 * (Math.hypot(lab1.a, lab1.b) + Math.hypot(lab2.a, lab2.b))) ** 7;
  const gFactor = 0.5 * (1 - Math.sqrt(cabMean7 / (cabMean7 + POW25_7)));

  const a1P = (1 + gFactor) * lab1.a;
  const a2P = (1 + gFactor) * lab2.a;
  const c1P = Math.hypot(a1P, lab1.b);
  const c2P = Math.hypot(a2P, lab2.b);
  const h1P = c1P < 1e-9 ? 0 : normalizeAzimuthDeg(Math.atan2(lab1.b, a1P) * RAD_TO_DEG);
  const h2P = c2P < 1e-9 ? 0 : normalizeAzimuthDeg(Math.atan2(lab2.b, a2P) * RAD_TO_DEG);

  let dHAngle = 0;
  if (c1P * c2P >= 1e-9) {
    const raw = h2P - h1P;
    dHAngle = Math.abs(raw) <= 180 ? raw : raw > 180 ? raw - 360 : raw + 360;
  }
  const deltaLP = lab2.l - lab1.l;
  const deltaCP = c2P - c1P;
  const deltaHP = 2 * Math.sqrt(c1P * c2P) * Math.sin(0.5 * dHAngle * DEG_TO_RAD);

  const lBarP = 0.5 * (lab1.l + lab2.l);
  const cBarP = 0.5 * (c1P + c2P);
  let hBarP = h1P + h2P;
  if (c1P * c2P >= 1e-9) {
    hBarP =
      Math.abs(h1P - h2P) <= 180
        ? 0.5 * (h1P + h2P)
        : h1P + h2P < 360
          ? 0.5 * (h1P + h2P + 360)
          : 0.5 * (h1P + h2P - 360);
  }

  const tFactor =
    1 -
    0.17 * Math.cos((hBarP - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hBarP * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * hBarP - 63) * DEG_TO_RAD);
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW25_7));
  const lOffSq = (lBarP - 50) ** 2;
  const sL = 1 + (0.015 * lOffSq) / Math.sqrt(20 + lOffSq);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * tFactor;
  const rT = -Math.sin(2 * dTheta * DEG_TO_RAD) * rC;

  const tL = deltaLP / sL;
  const tC = deltaCP / sC;
  const tH = deltaHP / sH;
  return Math.sqrt(Math.max(0, tL * tL + tC * tC + tH * tH + rT * tC * tH));
}

function computeExpectedSceneLitOklab(ref: OklabColor, lighting: CutLightingContext): OklabColor {
  const inf = clamp01(lighting.lightingInfluence ?? 1);
  return {
    l: clamp01(ref.l + (lighting.exposureShiftL ?? 0) * inf),
    a: ref.a + (lighting.ambientShiftA ?? 0) * inf,
    b: ref.b + (lighting.ambientShiftB ?? 0) * inf,
  };
}

function pointToRectDistance(p: CanvasPoint2D, r: ContinuityRect2D): number {
  return Math.hypot(
    Math.max(r.x - p.x, 0, p.x - (r.x + r.width)),
    Math.max(r.y - p.y, 0, p.y - (r.y + r.height)),
  );
}

function rectCenter(r: ContinuityRect2D): CanvasPoint2D {
  return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.5 };
}

function computeErgonomicTailProposal(bounds: ContinuityRect2D, face: CanvasPoint2D): CanvasPoint2D {
  const c = rectCenter(bounds);
  const dist = Math.hypot(c.x - face.x, c.y - face.y);
  if (dist < 1e-6) return { x: face.x, y: face.y };
  const margin = Math.min(18, dist * 0.25);
  return {
    x: Number((face.x + ((c.x - face.x) / dist) * margin).toFixed(2)),
    y: Number((face.y + ((c.y - face.y) / dist) * margin).toFixed(2)),
  };
}

function stepAzimuthToward(fromDeg: number, targetDeg: number, maxAllowedDeltaDeg: number): number {
  const from = normalizeAzimuthDeg(fromDeg);
  const target = normalizeAzimuthDeg(targetDeg);
  let diff = target - from;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  if (Math.abs(diff) <= maxAllowedDeltaDeg) return target;
  return Number(normalizeAzimuthDeg(target - Math.sign(diff) * (maxAllowedDeltaDeg * 0.65)).toFixed(2));
}

function sortBalloonsByNaturalReadingFlow(
  balloons: readonly CutSpeechBalloonNode[],
  direction: ReadingFlowDirection,
  rowTolPx: number,
): readonly CutSpeechBalloonNode[] {
  return [...balloons].sort((a, b) => {
    const ca = rectCenter(a.bounds);
    const cb = rectCenter(b.bounds);
    if (Math.abs(ca.y - cb.y) > rowTolPx) return ca.y - cb.y;
    return direction === "ltr-top-down" ? ca.x - cb.x : cb.x - ca.x;
  });
}

/** 회차 전체 컷의 색·조명·말풍선 연속성을 로컬에서 진단하고 비침습 패치 제안을 생성한다. */
export function auditEpisodeContinuity(
  document: EpisodeContinuityDocument,
  options: ContinuityAuditOptions = {},
): ContinuityAuditReport {
  const inputDigestBefore = computeFnv1a64Hex(canonicalizeStructure(document));
  const defaultColorTol = options.defaultColorDeltaE00Tolerance ?? DEFAULT_COLOR_DELTA_E00_TOLERANCE;
  const maxKeyJump = options.maxKeyLightJumpDeg ?? DEFAULT_MAX_KEY_LIGHT_JUMP_DEG;
  const maxTailBodyGap = options.maxTailBodyGapPx ?? DEFAULT_MAX_TAIL_BODY_GAP_PX;
  const maxTailFaceDist = options.maxTailFaceDistancePx ?? DEFAULT_MAX_TAIL_FACE_DISTANCE_PX;
  const horizontalDeadzone = options.horizontalDeadzonePx ?? 24;
  const sheetByCharId = new Map(document.characterSheets.map((s) => [s.characterId, s]));

  const findings: ContinuityFinding[] = [];
  const patchProposals: NonDestructivePatchProposal[] = [];
  let seq = 0;

  for (let cutIdx = 0; cutIdx < document.cuts.length; cutIdx += 1) {
    const cut = document.cuts[cutIdx];
    if (!cut) continue;

    // 1. 캐릭터 파츠별 고유색 이탈 검사 (장면 조명 보정 반영)
    for (let charIdx = 0; charIdx < cut.characters.length; charIdx += 1) {
      const charNode = cut.characters[charIdx];
      const sheet = charNode ? sheetByCharId.get(charNode.characterId) : undefined;
      if (!charNode || !sheet) continue;

      for (const [partId, observedColor] of Object.entries(charNode.observedPartOklab)) {
        const partRef = sheet.parts[partId];
        if (!partRef) continue;
        const expectedLit = computeExpectedSceneLitOklab(partRef.referenceOklab, cut.lighting);
        const deltaE00 = computeCiede2000FromOklab(observedColor, expectedLit);
        const tolerance = partRef.maxDeltaE00 ?? defaultColorTol;

        if (deltaE00 > tolerance) {
          seq += 1;
          const proposalId = `prop-color-${cut.cutId}-${charNode.characterId}-${partId}-${seq}`;
          patchProposals.push({
            proposalId,
            cutId: cut.cutId,
            findingKind: "character-part-color-drift",
            targetPath: `cuts[${cutIdx}].characters[${charIdx}].observedPartOklab.${partId}`,
            requiresCreatorApproval: true,
            confidence: Number(Math.min(0.99, 0.7 + (deltaE00 - tolerance) * 0.03).toFixed(2)),
            rationaleKo: `컷 #${cut.cutNumber} '${sheet.characterNameKo}'의 '${partRef.partLabelKo}' 색상이 조명 보정 기준 ΔE00 ${deltaE00.toFixed(2)} 이탈했습니다.`,
            payload: {
              kind: "replace-part-color",
              cutId: cut.cutId,
              characterId: charNode.characterId,
              partId,
              beforeOklab: { ...observedColor },
              proposedOklab: expectedLit,
              proposedCssOklch: formatOklchCss(oklabToOklch(expectedLit)),
            },
          });
          findings.push({
            findingId: `find-color-${seq}`,
            kind: "character-part-color-drift",
            severity: deltaE00 > tolerance * 1.8 ? "error" : "warning",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            metricValue: Number(deltaE00.toFixed(3)),
            thresholdValue: tolerance,
            messageKo: `컷 #${cut.cutNumber} '${sheet.characterNameKo}' ${partRef.partLabelKo} 고유색 이탈 (ΔE00 ${deltaE00.toFixed(1)})`,
            proposalId,
          });
        }
      }
    }

    // 2. 인접 컷 간 주광원(Key Light) 방향 급변 검사
    if (cutIdx > 0) {
      const prevCut = document.cuts[cutIdx - 1];
      if (prevCut && prevCut.sceneId === cut.sceneId && (cut.transitionKind ?? "continuous") === "continuous") {
        const expectedAz = cut.cameraReverseShot180
          ? normalizeAzimuthDeg(180 - prevCut.lighting.keyLightAzimuthDeg)
          : normalizeAzimuthDeg(prevCut.lighting.keyLightAzimuthDeg);
        const currAz = normalizeAzimuthDeg(cut.lighting.keyLightAzimuthDeg);
        const jump = shortestAzimuthDeltaDeg(expectedAz, currAz);

        if (jump > maxKeyJump) {
          seq += 1;
          const proposalId = `prop-light-${cut.cutId}-${seq}`;
          patchProposals.push({
            proposalId,
            cutId: cut.cutId,
            findingKind: "abrupt-key-light-flip",
            targetPath: `cuts[${cutIdx}].lighting.keyLightAzimuthDeg`,
            requiresCreatorApproval: true,
            confidence: 0.88,
            rationaleKo: `동일 씬('${cut.sceneId}') 내 직전 컷 대비 주광원 방위각이 ${jump.toFixed(1)}° 급변했습니다.`,
            payload: {
              kind: "align-key-light-azimuth",
              cutId: cut.cutId,
              beforeAzimuthDeg: currAz,
              proposedAzimuthDeg: stepAzimuthToward(currAz, expectedAz, maxKeyJump * 0.5),
            },
          });
          findings.push({
            findingId: `find-light-${seq}`,
            kind: "abrupt-key-light-flip",
            severity: jump >= 135 ? "error" : "warning",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            metricValue: Number(jump.toFixed(2)),
            thresholdValue: maxKeyJump,
            messageKo: `컷 #${prevCut.cutNumber}→#${cut.cutNumber} 주광원 방향 급변 (${jump.toFixed(1)}°)`,
            proposalId,
          });
        }
      }
    }

    // 3-A. 말풍선 꼬리 끝점 오연결 검사
    for (let balIdx = 0; balIdx < cut.balloons.length; balIdx += 1) {
      const balloon = cut.balloons[balIdx];
      if (!balloon || balloon.isNarration || !balloon.tailTip || cut.characters.length === 0) continue;
      const tip = balloon.tailTip;

      let nearestChar: CutCharacterNode | undefined;
      let nearestFaceDist = Number.POSITIVE_INFINITY;
      let nearestBodyDist = Number.POSITIVE_INFINITY;
      for (const ch of cut.characters) {
        const fDist = Math.hypot(tip.x - ch.faceAnchor.x, tip.y - ch.faceAnchor.y);
        if (fDist < nearestFaceDist) {
          nearestFaceDist = fDist;
          nearestBodyDist = pointToRectDistance(tip, ch.bounds);
          nearestChar = ch;
        }
      }

      const intended = balloon.intendedSpeakerId
        ? cut.characters.find((c) => c.characterId === balloon.intendedSpeakerId)
        : undefined;

      if (intended) {
        const iFaceDist = Math.hypot(tip.x - intended.faceAnchor.x, tip.y - intended.faceAnchor.y);
        const iBodyDist = pointToRectDistance(tip, intended.bounds);
        const wrongTarget =
          nearestChar !== undefined &&
          nearestChar.characterId !== intended.characterId &&
          nearestFaceDist + 24 < iFaceDist &&
          nearestBodyDist < iBodyDist;
        const detached = iBodyDist > maxTailBodyGap && iFaceDist > maxTailFaceDist;

        if (wrongTarget || detached) {
          seq += 1;
          const proposalId = `prop-tail-${cut.cutId}-${balloon.balloonId}-${seq}`;
          const label = sheetByCharId.get(intended.characterId)?.characterNameKo ?? intended.characterNameKo ?? intended.characterId;
          patchProposals.push({
            proposalId,
            cutId: cut.cutId,
            findingKind: "balloon-tail-speaker-mismatch",
            targetPath: `cuts[${cutIdx}].balloons[${balIdx}].tailTip`,
            requiresCreatorApproval: true,
            confidence: wrongTarget ? 0.94 : 0.86,
            rationaleKo: `말풍선 '${balloon.balloonId}' 꼬리가 발화자 '${label}' 얼굴 앵커에서 벗어났습니다.`,
            payload: {
              kind: "snap-balloon-tail",
              cutId: cut.cutId,
              balloonId: balloon.balloonId,
              targetSpeakerId: intended.characterId,
              beforeTailTip: { ...tip },
              proposedTailTip: computeErgonomicTailProposal(balloon.bounds, intended.faceAnchor),
            },
          });
          findings.push({
            findingId: `find-tail-${seq}`,
            kind: "balloon-tail-speaker-mismatch",
            severity: wrongTarget ? "error" : "warning",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            metricValue: Number(iFaceDist.toFixed(1)),
            thresholdValue: maxTailFaceDist,
            messageKo: `컷 #${cut.cutNumber} 말풍선('${balloon.balloonId}') 꼬리-화자('${label}') 오연결`,
            proposalId,
          });
        }
      } else if (!balloon.intendedSpeakerId && nearestChar && nearestBodyDist > maxTailBodyGap && nearestFaceDist > maxTailFaceDist) {
        seq += 1;
        const proposalId = `prop-tail-${cut.cutId}-${balloon.balloonId}-${seq}`;
        patchProposals.push({
          proposalId,
          cutId: cut.cutId,
          findingKind: "balloon-tail-speaker-mismatch",
          targetPath: `cuts[${cutIdx}].balloons[${balIdx}].tailTip`,
          requiresCreatorApproval: true,
          confidence: 0.81,
          rationaleKo: `말풍선 '${balloon.balloonId}' 꼬리가 모든 등장 캐릭터 바운딩에서 분리되었습니다.`,
          payload: {
            kind: "snap-balloon-tail",
            cutId: cut.cutId,
            balloonId: balloon.balloonId,
            targetSpeakerId: nearestChar.characterId,
            beforeTailTip: { ...tip },
            proposedTailTip: computeErgonomicTailProposal(balloon.bounds, nearestChar.faceAnchor),
          },
        });
        findings.push({
          findingId: `find-tail-${seq}`,
          kind: "balloon-tail-speaker-mismatch",
          severity: "warning",
          cutId: cut.cutId,
          cutNumber: cut.cutNumber,
          metricValue: Number(nearestFaceDist.toFixed(1)),
          thresholdValue: maxTailFaceDist,
          messageKo: `컷 #${cut.cutNumber} 말풍선('${balloon.balloonId}') 꼬리 앵커 허공 이탈`,
          proposalId,
        });
      }
    }

    // 3-B. 말풍선 읽기 순서 역전 검사 (좌상→우하 vs 우상→좌하)
    if (cut.balloons.length >= 2) {
      const ordered = [...cut.balloons].sort((a, b) => a.readingOrder - b.readingOrder);
      let invPx = 0;
      let invDesc = "";

      for (let i = 1; i < ordered.length; i += 1) {
        const prevB = ordered[i - 1]!;
        const currB = ordered[i]!;
        const pC = rectCenter(prevB.bounds);
        const cC = rectCenter(currB.bounds);
        const rowTol = options.rowBandTolerancePx ?? Math.max(28, 0.45 * Math.min(prevB.bounds.height, currB.bounds.height));

        if (cC.y < pC.y - rowTol && pC.y - cC.y > invPx) {
          invPx = pC.y - cC.y;
          invDesc = `'${prevB.balloonId}' → '${currB.balloonId}' 상하 역전`;
        } else if (Math.abs(cC.y - pC.y) <= rowTol) {
          if (document.readingDirection === "ltr-top-down" && cC.x < pC.x - horizontalDeadzone && pC.x - cC.x > invPx) {
            invPx = pC.x - cC.x;
            invDesc = `'${prevB.balloonId}' → '${currB.balloonId}' 좌상→우하 역전`;
          } else if (document.readingDirection === "rtl-manga-top-down" && cC.x > pC.x + horizontalDeadzone && cC.x - pC.x > invPx) {
            invPx = cC.x - pC.x;
            invDesc = `'${prevB.balloonId}' → '${currB.balloonId}' 우상→좌하 역전`;
          }
        }
      }

      if (invPx > 0) {
        seq += 1;
        const proposalId = `prop-order-${cut.cutId}-${seq}`;
        const naturallySorted = sortBalloonsByNaturalReadingFlow(
          cut.balloons,
          document.readingDirection,
          options.rowBandTolerancePx ?? 36,
        );
        const beforeOrderByBalloonId = Object.fromEntries(cut.balloons.map((b) => [b.balloonId, b.readingOrder]));
        const proposedOrderByBalloonId = Object.fromEntries(naturallySorted.map((b, idx) => [b.balloonId, idx + 1]));

        patchProposals.push({
          proposalId,
          cutId: cut.cutId,
          findingKind: "balloon-reading-order-inversion",
          targetPath: `cuts[${cutIdx}].balloons[*].readingOrder`,
          requiresCreatorApproval: true,
          confidence: 0.91,
          rationaleKo: `컷 #${cut.cutNumber} 말풍선 순번이 시선 흐름과 어긋납니다(${invDesc}).`,
          payload: { kind: "reorder-cut-balloons", cutId: cut.cutId, beforeOrderByBalloonId, proposedOrderByBalloonId },
        });
        findings.push({
          findingId: `find-order-${seq}`,
          kind: "balloon-reading-order-inversion",
          severity: "warning",
          cutId: cut.cutId,
          cutNumber: cut.cutNumber,
          metricValue: Number(invPx.toFixed(1)),
          thresholdValue: horizontalDeadzone,
          messageKo: `컷 #${cut.cutNumber} 말풍선 읽기 순서 역전 (${invDesc})`,
          proposalId,
        });
      }
    }
  }

  const inputDigestAfter = computeFnv1a64Hex(canonicalizeStructure(document));
  return {
    episodeId: document.episodeId,
    scannedCutCount: document.cuts.length,
    findings,
    patchProposals,
    inputDigestBefore,
    inputDigestAfter,
    sourceMutated: inputDigestBefore !== inputDigestAfter,
    summaryKo:
      findings.length === 0
        ? `회차 '${document.episodeId}' (${document.cuts.length}컷) 연속성 이상 없음`
        : `회차 '${document.episodeId}' (${document.cuts.length}컷) 비침습 패치 제안 ${patchProposals.length}건 생성`,
  };
}

function cloneContinuityDocument(doc: EpisodeContinuityDocument): EpisodeContinuityDocument {
  return {
    episodeId: doc.episodeId,
    readingDirection: doc.readingDirection,
    characterSheets: doc.characterSheets.map((s) => ({
      ...s,
      parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, { ...v, referenceOklab: { ...v.referenceOklab } }])),
    })),
    cuts: doc.cuts.map((cut) => ({
      ...cut,
      lighting: { ...cut.lighting },
      characters: cut.characters.map((ch) => ({
        ...ch,
        bounds: { ...ch.bounds },
        faceAnchor: { ...ch.faceAnchor },
        observedPartOklab: Object.fromEntries(Object.entries(ch.observedPartOklab).map(([k, v]) => [k, { ...v }])),
      })),
      balloons: cut.balloons.map((b) => ({ ...b, bounds: { ...b.bounds }, tailTip: b.tailTip ? { ...b.tailTip } : b.tailTip })),
    })),
  };
}

/** 원본 문서를 전혀 수정하지 않고, 선택된 비침습 패치 제안만 깊은 복제본에 적용해 반환한다. */
export function applyContinuityProposalsPreview(
  document: EpisodeContinuityDocument,
  proposals: readonly NonDestructivePatchProposal[],
  selectedProposalIds?: readonly string[],
): ContinuityPatchPreviewResult {
  const originalDocumentDigest = computeFnv1a64Hex(canonicalizeStructure(document));
  const selectedSet = selectedProposalIds ? new Set(selectedProposalIds) : null;
  const active = proposals.filter((p) => !selectedSet || selectedSet.has(p.proposalId));
  const cloned = cloneContinuityDocument(document);
  const appliedIds: string[] = [];

  const cuts = cloned.cuts.map((cut) => {
    let lighting = cut.lighting;
    let characters = cut.characters;
    let balloons = cut.balloons;

    for (const prop of active) {
      if (prop.cutId !== cut.cutId) continue;
      const { payload } = prop;
      if (payload.kind === "replace-part-color") {
        characters = characters.map((ch) =>
          ch.characterId === payload.characterId
            ? { ...ch, observedPartOklab: { ...ch.observedPartOklab, [payload.partId]: { ...payload.proposedOklab } } }
            : ch,
        );
      } else if (payload.kind === "align-key-light-azimuth") {
        lighting = { ...lighting, keyLightAzimuthDeg: payload.proposedAzimuthDeg };
      } else if (payload.kind === "snap-balloon-tail") {
        balloons = balloons.map((b) => (b.balloonId === payload.balloonId ? { ...b, tailTip: { ...payload.proposedTailTip } } : b));
      } else if (payload.kind === "reorder-cut-balloons") {
        balloons = balloons.map((b) => {
          const nextOrder = payload.proposedOrderByBalloonId[b.balloonId];
          return nextOrder !== undefined ? { ...b, readingOrder: nextOrder } : b;
        });
      }
      appliedIds.push(prop.proposalId);
    }
    return { ...cut, lighting, characters, balloons };
  });

  const previewDocument: EpisodeContinuityDocument = { ...cloned, cuts };
  return {
    previewDocument,
    appliedProposalIds: appliedIds,
    originalDocumentDigest,
    previewDocumentDigest: computeFnv1a64Hex(canonicalizeStructure(previewDocument)),
  };
}
