/**
 * Wave 157 — 삼분할/황금비 자동 리프레이밍 크롭 솔버 및
 * 광학 압축·DoF·프레이밍 통합 촬영 디렉터 오케스트레이터.
 *
 * - 5대 결함 감지기 코어(`shot-framing-auditor-core`)를 함께 재수출한다.
 * - 모든 리프레이밍 결과는 `auditPanelShotFraming` 재감사로 품질 향상을 입증한다.
 */

import {
  computeDepthOfFieldBounds,
  computeFocalBackgroundCompression,
} from "./optical-lens-dof-and-compression";
import {
  GOLDEN_RATIO_MAJOR,
  GOLDEN_RATIO_MINOR,
  RULE_OF_THIRDS_MAJOR,
  RULE_OF_THIRDS_MINOR,
  auditPanelShotFraming,
  clampFramingValue,
  findNearestSafeCutZone,
  flattenJointLandmarks,
  normalizeCropRect,
  roundFramingValue,
} from "./shot-framing-auditor-core";
import {
  computeDirectorPlanManifestSha256Hex,
  sha256ShotFramingUtf8Hex,
} from "./shot-framing-sha256";
import type {
  GazeDirection,
  NormalizedCropRect,
  NormalizedPoint2D,
  SafeCutZoneKind,
  ShotDirectorPlanInput,
  ShotDirectorPlanResult,
  ShotFramingAuditResult,
  ShotFramingPanelInput,
  ShotReframeOutcome,
  ShotReframeSolverOptions,
  SubjectBodyLandmarks,
} from "./shot-framing-types";

export {
  DEFAULT_JOINT_EXCLUSION_MARGIN_NORM,
  DEFAULT_MAX_HEADROOM_RATIO,
  DEFAULT_MAX_POWER_POINT_DISTANCE_NORM,
  DEFAULT_MIN_HEADROOM_RATIO,
  GOLDEN_RATIO_MAJOR,
  GOLDEN_RATIO_MINOR,
  GOLDEN_RATIO_PHI,
  RULE_OF_THIRDS_MAJOR,
  RULE_OF_THIRDS_MINOR,
  auditPanelShotFraming,
  createStandingSubjectLandmarks,
  flattenJointLandmarks,
  listCompositionPowerPoints,
  normalizeCropRect,
  resolveSafeCutZones,
} from "./shot-framing-auditor-core";

function getPreferredAnchors(
  gazeDirection: GazeDirection,
  preferredGrid: "rule-of-thirds" | "golden-ratio",
): readonly NormalizedPoint2D[] {
  const minor = preferredGrid === "golden-ratio" ? GOLDEN_RATIO_MINOR : RULE_OF_THIRDS_MINOR;
  const major = preferredGrid === "golden-ratio" ? GOLDEN_RATIO_MAJOR : RULE_OF_THIRDS_MAJOR;

  if (gazeDirection === "right") {
    return [{ x: minor, y: minor }];
  }
  if (gazeDirection === "left") {
    return [{ x: major, y: minor }];
  }
  return [
    { x: minor, y: minor },
    { x: major, y: minor },
  ];
}

function evaluateCandidateObjective(params: {
  readonly audit: ShotFramingAuditResult;
  readonly candidate: NormalizedCropRect;
  readonly originalCrop: NormalizedCropRect;
  readonly preferredAnchors: readonly NormalizedPoint2D[];
  readonly subject: SubjectBodyLandmarks;
}): number {
  const { audit, candidate, originalCrop, preferredAnchors, subject } = params;
  const nonBlockerCount = audit.defects.length - audit.blockerCount;

  let obj = 0;
  obj -= audit.blockerCount * 10000;
  obj -= nonBlockerCount * 2000;
  obj += audit.framingScore * 20;
  obj += audit.powerPointAlignmentScore * 5;

  let bestAnchorDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < preferredAnchors.length; i += 1) {
    const anchor = preferredAnchors[i];
    if (!anchor) continue;
    const dx = audit.eyeLocal.x - anchor.x;
    const dy = audit.eyeLocal.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestAnchorDist) bestAnchorDist = dist;
  }
  obj += Math.max(0, 1 - bestAnchorDist / 0.35) * 160;

  if (
    (subject.gazeDirection === "left" || subject.gazeDirection === "right") &&
    audit.leadRoomDelta > 0.08
  ) {
    obj += Math.min(80, audit.leadRoomDelta * 180);
  }

  const bottomY = candidate.y + candidate.height;
  const footY = subject.footY ?? 0.98;
  if (bottomY >= footY) {
    obj += 35;
  } else {
    const safeRec = findNearestSafeCutZone(bottomY, audit.resolvedSafeCutZones);
    const safeDist = Math.abs(bottomY - safeRec.y);
    if (safeDist <= 0.05) {
      obj += (1 - safeDist / 0.05) * 50;
    }
  }

  const area = candidate.width * candidate.height;
  obj += area * 40;

  const origAspect = originalCrop.width / Math.max(0.05, originalCrop.height);
  const candAspect = candidate.width / Math.max(0.05, candidate.height);
  const aspectDelta = Math.abs(Math.log(candAspect / origAspect));
  obj -= aspectDelta * 35;

  return obj;
}

function buildCropKey(crop: NormalizedCropRect): string {
  return `${roundFramingValue(crop.x, 4)}:${roundFramingValue(crop.y, 4)}:${roundFramingValue(crop.width, 4)}:${roundFramingValue(crop.height, 4)}`;
}

function generateVerticalCandidateWindows(params: {
  readonly panel: ShotFramingPanelInput;
  readonly originalCrop: NormalizedCropRect;
  readonly safeZones: Readonly<Record<SafeCutZoneKind, number>>;
  readonly anchorY: number;
  readonly minCropH: number;
}): readonly { readonly y: number; readonly height: number }[] {
  const { panel, originalCrop, safeZones, anchorY, minCropH } = params;
  const eyeY = panel.subject.eyeCenter.y;
  const crownY = panel.subject.crownY;

  const bottomCandidates: number[] = [
    1.0,
    originalCrop.y + originalCrop.height,
    safeZones.chest,
    safeZones.waist,
    safeZones["mid-thigh"],
    safeZones["mid-shin"],
  ];
  if (panel.subject.footY !== undefined) {
    bottomCandidates.push(clampFramingValue(panel.subject.footY + 0.03, minCropH, 1));
  }

  const joints = flattenJointLandmarks(panel.subject.joints);
  const jointYs: number[] = [];
  for (let i = 0; i < joints.length; i += 1) {
    const j = joints[i];
    if (j) jointYs.push(j.point.y);
  }
  jointYs.sort((a, b) => a - b);
  for (let i = 0; i + 1 < jointYs.length; i += 1) {
    const yA = jointYs[i];
    const yB = jointYs[i + 1];
    if (yA !== undefined && yB !== undefined && yB - yA > 0.06) {
      bottomCandidates.push((yA + yB) * 0.5);
    }
  }

  const out: { readonly y: number; readonly height: number }[] = [
    { y: originalCrop.y, height: originalCrop.height },
  ];
  const headroomTargets = [0.08, 0.14, 0.2, 0.26];

  for (let b = 0; b < bottomCandidates.length; b += 1) {
    const rawBottom = bottomCandidates[b];
    if (rawBottom === undefined) continue;
    const bottom = clampFramingValue(rawBottom, minCropH, 1);

    const idealTopEye = (eyeY - anchorY * bottom) / Math.max(0.05, 1 - anchorY);
    const topCandidates: number[] = [0, originalCrop.y, idealTopEye];
    for (let h = 0; h < headroomTargets.length; h += 1) {
      const hr = headroomTargets[h];
      if (hr === undefined) continue;
      topCandidates.push((crownY - hr * bottom) / Math.max(0.05, 1 - hr));
    }

    for (let t = 0; t < topCandidates.length; t += 1) {
      const rawTop = topCandidates[t];
      if (rawTop === undefined) continue;
      const top = clampFramingValue(rawTop, 0, Math.max(0, bottom - minCropH));
      const height = bottom - top;
      if (height >= minCropH - 1e-6 && top + height <= 1 + 1e-6) {
        out.push({ y: roundFramingValue(top, 5), height: roundFramingValue(height, 5) });
      }
    }
  }
  return out;
}

/**
 * 원본 마스터 프레임 `[0, 1] x [0, 1]` 내부에서 크롭 윈도우 `(x, y, width, height)`를
 * 결정론적으로 최적화해 관절 절단 0건·적정 헤드룸·시선 리드룸 확보·삼분할/황금비 교점 정렬을 달성한다.
 */
export function solveOptimalShotReframe(
  panel: ShotFramingPanelInput,
  options: ShotReframeSolverOptions = {},
): ShotReframeOutcome {
  const originalCrop = normalizeCropRect(panel.crop);
  const beforeAudit = auditPanelShotFraming(panel, options);

  const preferredGrid: "rule-of-thirds" | "golden-ratio" =
    options.preferredGrid ??
    (panel.compositionGrid === "golden-ratio" ? "golden-ratio" : "rule-of-thirds");
  const preserveAspectRatio = options.preserveAspectRatio === true;
  const minCropW = clampFramingValue(options.minCropWidth ?? 0.28, 0.15, 0.95);
  const minCropH = clampFramingValue(options.minCropHeight ?? 0.28, 0.15, 0.95);
  const origAspect = originalCrop.width / Math.max(0.05, originalCrop.height);

  const anchors = getPreferredAnchors(panel.subject.gazeDirection, preferredGrid);
  const safeZones = beforeAudit.resolvedSafeCutZones;
  const eyeX = panel.subject.eyeCenter.x;

  const candidateMap = new Map<string, NormalizedCropRect>();
  const registerCandidate = (x: number, y: number, w: number, h: number): void => {
    const cw = clampFramingValue(w, minCropW, 1);
    const ch = clampFramingValue(h, minCropH, 1);
    const cx = clampFramingValue(x, 0, Math.max(0, 1 - cw));
    const cy = clampFramingValue(y, 0, Math.max(0, 1 - ch));
    const rect: NormalizedCropRect = {
      x: roundFramingValue(cx, 5),
      y: roundFramingValue(cy, 5),
      width: roundFramingValue(cw, 5),
      height: roundFramingValue(ch, 5),
    };
    const key = buildCropKey(rect);
    if (!candidateMap.has(key)) candidateMap.set(key, rect);
  };

  registerCandidate(originalCrop.x, originalCrop.y, originalCrop.width, originalCrop.height);

  const baseWidthSamples: number[] = [originalCrop.width, 1.0, minCropW, 0.45, 0.6, 0.75, 0.9];
  for (let a = 0; a < anchors.length; a += 1) {
    const anchor = anchors[a];
    if (!anchor) continue;

    const verticalWindows = generateVerticalCandidateWindows({
      panel,
      originalCrop,
      safeZones,
      anchorY: anchor.y,
      minCropH,
    });
    const maxWidthFromLeft = eyeX / Math.max(0.05, anchor.x);
    const maxWidthFromRight = (1 - eyeX) / Math.max(0.05, 1 - anchor.x);
    const anchorWidths = [...baseWidthSamples, maxWidthFromLeft, maxWidthFromRight];

    for (let v = 0; v < verticalWindows.length; v += 1) {
      const vw = verticalWindows[v];
      if (!vw) continue;

      if (preserveAspectRatio) {
        let cw = vw.height * origAspect;
        let ch = vw.height;
        if (cw > 1) {
          cw = 1;
          ch = cw / origAspect;
        }
        if (cw >= minCropW && ch >= minCropH && ch <= 1) {
          const idealX = clampFramingValue(eyeX - anchor.x * cw, 0, Math.max(0, 1 - cw));
          registerCandidate(idealX, vw.y, cw, ch);
          registerCandidate(clampFramingValue(idealX - 0.05, 0, 1 - cw), vw.y, cw, ch);
          registerCandidate(clampFramingValue(idealX + 0.05, 0, 1 - cw), vw.y, cw, ch);
        }
      } else {
        const widthsToTry = [...anchorWidths, vw.height * origAspect];
        for (let wi = 0; wi < widthsToTry.length; wi += 1) {
          const rawW = widthsToTry[wi];
          if (rawW === undefined || !Number.isFinite(rawW)) continue;
          const cw = clampFramingValue(rawW, minCropW, 1);
          const idealX = clampFramingValue(eyeX - anchor.x * cw, 0, Math.max(0, 1 - cw));
          registerCandidate(idealX, vw.y, cw, vw.height);
        }
      }
    }
  }

  let bestCrop = originalCrop;
  let bestAudit = beforeAudit;
  let bestObj = evaluateCandidateObjective({
    audit: beforeAudit,
    candidate: originalCrop,
    originalCrop,
    preferredAnchors: anchors,
    subject: panel.subject,
  });
  let evaluatedCount = 1;

  const evaluateAndMaybeAccept = (cand: NormalizedCropRect): void => {
    const audit = auditPanelShotFraming({ ...panel, crop: cand }, options);
    evaluatedCount += 1;
    const obj = evaluateCandidateObjective({
      audit,
      candidate: cand,
      originalCrop,
      preferredAnchors: anchors,
      subject: panel.subject,
    });
    if (obj > bestObj + 1e-9) {
      bestObj = obj;
      bestCrop = cand;
      bestAudit = audit;
    }
  };

  candidateMap.forEach((cand) => {
    if (buildCropKey(cand) !== buildCropKey(originalCrop)) {
      evaluateAndMaybeAccept(cand);
    }
  });

  const refineSteps = [0.025, 0.008];
  const offsets = [-1, 0, 1];
  for (let s = 0; s < refineSteps.length; s += 1) {
    const step = refineSteps[s] ?? 0.01;
    const base = bestCrop;
    for (let dxIdx = 0; dxIdx < offsets.length; dxIdx += 1) {
      for (let dyIdx = 0; dyIdx < offsets.length; dyIdx += 1) {
        for (let dhIdx = 0; dhIdx < offsets.length; dhIdx += 1) {
          const dx = (offsets[dxIdx] ?? 0) * step;
          const dy = (offsets[dyIdx] ?? 0) * step;
          const dh = (offsets[dhIdx] ?? 0) * step;
          if (dx === 0 && dy === 0 && dh === 0) continue;

          const ch = clampFramingValue(base.height + dh, minCropH, 1);
          const cw = preserveAspectRatio
            ? clampFramingValue(ch * origAspect, minCropW, 1)
            : clampFramingValue(base.width + (offsets[dhIdx] ?? 0) * step * 0.5, minCropW, 1);
          const finalH = preserveAspectRatio ? clampFramingValue(cw / origAspect, minCropH, 1) : ch;
          const cx = clampFramingValue(base.x + dx, 0, Math.max(0, 1 - cw));
          const cy = clampFramingValue(base.y + dy, 0, Math.max(0, 1 - finalH));
          const cand: NormalizedCropRect = {
            x: roundFramingValue(cx, 5),
            y: roundFramingValue(cy, 5),
            width: roundFramingValue(cw, 5),
            height: roundFramingValue(finalH, 5),
          };
          const key = buildCropKey(cand);
          if (!candidateMap.has(key)) {
            candidateMap.set(key, cand);
            evaluateAndMaybeAccept(cand);
          }
        }
      }
    }
  }

  const scoreDelta = roundFramingValue(bestAudit.framingScore - beforeAudit.framingScore, 2);
  const jointCropsEliminated = Math.max(
    0,
    beforeAudit.jointCropViolations.length - bestAudit.jointCropViolations.length,
  );
  const improved =
    bestAudit.blockerCount < beforeAudit.blockerCount ||
    bestAudit.defects.length < beforeAudit.defects.length ||
    scoreDelta > 0;

  const rationaleKo: string[] = [];
  if (jointCropsEliminated > 0) {
    rationaleKo.push(
      `관절 정면 절단 블로커 ${jointCropsEliminated}건을 안전 절단 구간으로 이동해 모두 해소했습니다.`,
    );
  }
  if (
    beforeAudit.defects.some((d) => d.code === "insufficient-lead-room") &&
    !bestAudit.defects.some((d) => d.code === "insufficient-lead-room")
  ) {
    rationaleKo.push(
      `시선 앞쪽 리드룸을 ${roundFramingValue(beforeAudit.leadRoomRatio * 100, 1)}%에서 ${roundFramingValue(bestAudit.leadRoomRatio * 100, 1)}%로 넓혀 시선 막힘을 풀었습니다.`,
    );
  }
  if (
    beforeAudit.defects.some(
      (d) => d.code === "cramped-headroom" || d.code === "excessive-dead-headroom",
    ) &&
    !bestAudit.defects.some(
      (d) => d.code === "cramped-headroom" || d.code === "excessive-dead-headroom",
    )
  ) {
    rationaleKo.push(
      `머리 위 여백(헤드룸)을 ${roundFramingValue(beforeAudit.headroomRatio * 100, 1)}%에서 적정 범위(${roundFramingValue(bestAudit.headroomRatio * 100, 1)}%)로 조정했습니다.`,
    );
  }
  if (bestAudit.powerPointAlignmentScore > beforeAudit.powerPointAlignmentScore + 1) {
    const gridLabelKo = preferredGrid === "golden-ratio" ? "황금비(1/φ)" : "삼분할(1/3)";
    rationaleKo.push(
      `${gridLabelKo} 교점 정렬 점수를 ${beforeAudit.powerPointAlignmentScore}점에서 ${bestAudit.powerPointAlignmentScore}점으로 끌어올렸습니다.`,
    );
  }
  if (rationaleKo.length === 0) {
    rationaleKo.push("기존 컷 구도가 이미 안정적이어서 원본 크롭을 유지하거나 미세 보정했습니다.");
  }

  const reframeManifestSha256Hex = sha256ShotFramingUtf8Hex(
    JSON.stringify({
      afterSha256: bestAudit.framingManifestSha256Hex,
      beforeSha256: beforeAudit.framingManifestSha256Hex,
      panelId: panel.panelId.trim(),
      preferredGrid,
      reframedCrop: bestCrop,
      schemaVersion: "wave157-reframe-v1",
    }),
  );

  return {
    panelId: panel.panelId,
    preferredGrid,
    originalCrop,
    reframedCrop: bestCrop,
    beforeAudit,
    afterAudit: bestAudit,
    scoreDelta,
    jointCropsEliminated,
    improved,
    candidateCountEvaluated: evaluatedCount,
    rationaleKo,
    reframeManifestSha256Hex,
  };
}

/**
 * 35mm 광학 배경 압축·박렌즈 피사계 심도(DoF) 계산과
 * 관절 절단 방지 자동 리프레이밍을 한 번에 실행하는 통합 촬영 디렉터 진입점.
 */
export function directPanelShotFraming(input: ShotDirectorPlanInput): ShotDirectorPlanResult {
  const compression = computeFocalBackgroundCompression({
    focalLengthMm: input.focalLengthMm,
    subjectHeightM: input.subjectHeightM,
    subjectFrameFillRatio: input.subjectFrameFillRatio,
    backgroundDistanceM: input.backgroundDistanceM,
    referenceFocalLengthMm: input.referenceFocalLengthMm,
  });

  const dof = computeDepthOfFieldBounds({
    focalLengthMm: input.focalLengthMm,
    fNumber: input.fNumber,
    focusDistanceM: compression.subjectDistanceM,
    cocMm: input.cocMm,
    sampleBackgroundDistanceM: compression.cameraToBackgroundM,
  });

  const reframe = solveOptimalShotReframe(input.panel, {
    ...input.auditOptions,
    ...input.reframeOptions,
  });

  const directorManifestSha256Hex = computeDirectorPlanManifestSha256Hex({
    compression,
    dof,
    beforeSha256: reframe.beforeAudit.framingManifestSha256Hex,
    afterSha256: reframe.afterAudit.framingManifestSha256Hex,
    reframedCrop: reframe.reframedCrop,
  });

  return {
    compression,
    dof,
    reframe,
    directorManifestSha256Hex,
  };
}
