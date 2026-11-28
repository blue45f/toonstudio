/**
 * Wave 147 — 순수 OKLCH 21-관절 손 해부학·파지 검수 SVG 렌더러 및 한국어 작화 가이드 브리프.
 *
 * - 원시 16진수/RGB/HSL 색상 배제, 100% `oklch(...)` 컬러 토큰만 사용
 * - 좌측: 2D 투영 손바닥·20개 캡슐·21관절 마커·파지 소품 윤곽·관통 경고 마커
 * - 우측: 순수 단색 5손가락 실루엣 분리도 검수 뷰 + 겹침/ROM/관통/SHA-256 상태 배지
 * - XML/XSS 특수문자 완전 이스케이프 + 번역투 없는 자연스러운 한국어 해부학 QA 요약
 */

import {
  DEFAULT_HAND_CAMERA_SPEC,
  auditHandSilhouetteClarity,
  computeHandPoseManifestSha256,
  projectPoint3DToCamera2D,
  type GraspPropPenetrationAudit,
  type HandCameraProjectionSpec,
  type HandSelfPenetrationAudit,
  type HandSilhouetteClarityAudit,
  type ProjectedHandJoint2D,
} from "./grasp-contact-and-silhouette-solver";
import {
  type Hand21JointPose,
  type HandAnatomicalRomAudit,
  type HandFingerId,
  type HandJointId,
} from "./hand-21joint-kinematics";
import {
  addVec3,
  normalizeVec3,
  rotateVec3EulerDeg,
  roundFixed,
  scaleVec3,
  vec3,
  type GraspPropPrimitive,
  type Vec2,
  type Vec3,
} from "./hand-pose-math-and-sha256";

export type HandAuditSvgTheme = "light" | "dark";

export interface HandAuditSvgOptions {
  readonly theme?: HandAuditSvgTheme;
  readonly title?: string;
  readonly camera?: HandCameraProjectionSpec;
  readonly prop?: GraspPropPrimitive;
  readonly romAudit?: HandAnatomicalRomAudit;
  readonly propAudit?: GraspPropPenetrationAudit;
  readonly selfAudit?: HandSelfPenetrationAudit;
  readonly silhouetteAudit?: HandSilhouetteClarityAudit;
}

export type HandAuditVerdict = "pass" | "warn" | "fail";

export interface HandPoseAuditReportKo {
  readonly verdict: HandAuditVerdict;
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly actionableDirectivesKo: readonly string[];
  readonly handPoseSha256Hex: string;
}

interface HandOklchPalette {
  readonly canvasBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly gridLine: string;
  readonly headerInk: string;
  readonly mutedInk: string;
  readonly palmFill: string;
  readonly palmStroke: string;
  readonly capsuleFill: string;
  readonly capsuleStroke: string;
  readonly capsuleErrorFill: string;
  readonly capsuleErrorStroke: string;
  readonly boneStroke: string;
  readonly jointFill: string;
  readonly jointStroke: string;
  readonly tipFill: string;
  readonly tipStroke: string;
  readonly propFill: string;
  readonly propStroke: string;
  readonly silhouetteInk: string;
  readonly overlapWarnStroke: string;
  readonly badgePassBg: string;
  readonly badgePassInk: string;
  readonly badgeWarnBg: string;
  readonly badgeWarnInk: string;
  readonly badgeFailBg: string;
  readonly badgeFailInk: string;
}

const LIGHT_PALETTE: HandOklchPalette = {
  canvasBg: "oklch(0.974 0.008 92)",
  panelBg: "oklch(0.996 0.003 95)",
  panelBorder: "oklch(0.32 0.02 250)",
  gridLine: "oklch(0.86 0.012 92)",
  headerInk: "oklch(0.22 0.02 255)",
  mutedInk: "oklch(0.45 0.02 255)",
  palmFill: "oklch(0.925 0.022 86 / 0.78)",
  palmStroke: "oklch(0.36 0.03 250)",
  capsuleFill: "oklch(0.91 0.024 85 / 0.84)",
  capsuleStroke: "oklch(0.35 0.035 250)",
  capsuleErrorFill: "oklch(0.82 0.14 25 / 0.68)",
  capsuleErrorStroke: "oklch(0.52 0.21 25)",
  boneStroke: "oklch(0.28 0.05 245)",
  jointFill: "oklch(0.99 0.004 95)",
  jointStroke: "oklch(0.25 0.04 250)",
  tipFill: "oklch(0.42 0.12 160)",
  tipStroke: "oklch(0.99 0.004 95)",
  propFill: "oklch(0.76 0.08 230 / 0.32)",
  propStroke: "oklch(0.42 0.12 230)",
  silhouetteInk: "oklch(0.18 0.015 255)",
  overlapWarnStroke: "oklch(0.56 0.21 28)",
  badgePassBg: "oklch(0.935 0.026 158)",
  badgePassInk: "oklch(0.26 0.08 158)",
  badgeWarnBg: "oklch(0.945 0.045 80)",
  badgeWarnInk: "oklch(0.34 0.11 65)",
  badgeFailBg: "oklch(0.935 0.052 25)",
  badgeFailInk: "oklch(0.38 0.16 25)",
};

const DARK_PALETTE: HandOklchPalette = {
  canvasBg: "oklch(0.165 0.012 165)",
  panelBg: "oklch(0.215 0.014 165)",
  panelBorder: "oklch(0.72 0.04 162)",
  gridLine: "oklch(0.31 0.015 165)",
  headerInk: "oklch(0.95 0.008 95)",
  mutedInk: "oklch(0.74 0.016 165)",
  palmFill: "oklch(0.32 0.024 165 / 0.78)",
  palmStroke: "oklch(0.75 0.045 162)",
  capsuleFill: "oklch(0.34 0.026 165 / 0.85)",
  capsuleStroke: "oklch(0.76 0.045 162)",
  capsuleErrorFill: "oklch(0.46 0.16 25 / 0.72)",
  capsuleErrorStroke: "oklch(0.76 0.19 25)",
  boneStroke: "oklch(0.86 0.05 162)",
  jointFill: "oklch(0.22 0.015 165)",
  jointStroke: "oklch(0.9 0.04 162)",
  tipFill: "oklch(0.76 0.13 158)",
  tipStroke: "oklch(0.18 0.012 165)",
  propFill: "oklch(0.56 0.11 230 / 0.34)",
  propStroke: "oklch(0.78 0.12 230)",
  silhouetteInk: "oklch(0.94 0.008 95)",
  overlapWarnStroke: "oklch(0.76 0.19 28)",
  badgePassBg: "oklch(0.3 0.055 158)",
  badgePassInk: "oklch(0.92 0.04 158)",
  badgeWarnBg: "oklch(0.34 0.075 72)",
  badgeWarnInk: "oklch(0.93 0.05 80)",
  badgeFailBg: "oklch(0.34 0.1 25)",
  badgeFailInk: "oklch(0.94 0.05 25)",
};

const FINGER_LABEL_KO: Readonly<Record<HandFingerId, string>> = {
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  pinky: "소지",
};

const FINGERTIP_JOINT_SET = new Set<HandJointId>([
  "thumb_tip",
  "index_tip",
  "middle_tip",
  "ring_tip",
  "pinky_tip",
]);

/** XML/SVG 텍스트 노드의 XSS 특수문자를 안전하게 이스케이프한다. */
export function escapeSvgXmlText(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      continue;
    }
    const ch = input[i];
    if (ch === "&") {
      out += "&amp;";
    } else if (ch === "<") {
      out += "&lt;";
    } else if (ch === ">") {
      out += "&gt;";
    } else if (ch === "\"") {
      out += "&quot;";
    } else if (ch === "'") {
      out += "&#39;";
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  return out;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? String(roundFixed(value, 2)) : "0";
}

interface ViewportMapper {
  readonly mapPoint: (pt: Vec2) => Vec2;
  readonly scaleFactor: number;
}

function createPanelMapper(
  projected: readonly ProjectedHandJoint2D[],
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): ViewportMapper {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < projected.length; i += 1) {
    const p = projected[i];
    if (p === undefined) {
      continue;
    }
    const pad = Math.max(p.radiusPx, 10);
    if (p.screen.x - pad < minX) {
      minX = p.screen.x - pad;
    }
    if (p.screen.x + pad > maxX) {
      maxX = p.screen.x + pad;
    }
    if (p.screen.y - pad < minY) {
      minY = p.screen.y - pad;
    }
    if (p.screen.y + pad > maxY) {
      maxY = p.screen.y + pad;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return {
      mapPoint: (pt: Vec2): Vec2 => ({ x: panelX + panelW * 0.5, y: panelY + panelH * 0.5 + pt.y * 0 }),
      scaleFactor: 1,
    };
  }

  const spanX = Math.max(40, maxX - minX);
  const spanY = Math.max(40, maxY - minY);
  const usableW = panelW - 44;
  const usableH = panelH - 44;
  const scaleFactor = Math.min(usableW / spanX, usableH / spanY);
  const midX = (minX + maxX) * 0.5;
  const midY = (minY + maxY) * 0.5;
  const targetMidX = panelX + panelW * 0.5;
  const targetMidY = panelY + panelH * 0.5;

  return {
    scaleFactor,
    mapPoint: (pt: Vec2): Vec2 => ({
      x: targetMidX + (pt.x - midX) * scaleFactor,
      y: targetMidY + (pt.y - midY) * scaleFactor,
    }),
  };
}

function renderProjectedPropSvg(
  prop: GraspPropPrimitive,
  camera: HandCameraProjectionSpec,
  mapper: ViewportMapper,
  palette: HandOklchPalette,
): string {
  const rot = prop.rotationDeg ?? vec3(0, 0, 0);
  if (prop.kind === "sphere") {
    const c = projectPoint3DToCamera2D(prop.centerMm, camera);
    const pt = mapper.mapPoint(c.screen);
    const r = ((prop.radiusMm * camera.focalLengthPx) / c.depthMm) * mapper.scaleFactor;
    return `<circle cx="${fmt(pt.x)}" cy="${fmt(pt.y)}" r="${fmt(Math.max(4, r))}" fill="${palette.propFill}" stroke="${palette.propStroke}" stroke-width="2" stroke-dasharray="6 4"/>`;
  }

  if (prop.kind === "cylinder") {
    const axisLocal = normalizeVec3(prop.axis ?? vec3(1, 0, 0), vec3(1, 0, 0));
    const axisWorld = rotateVec3EulerDeg(axisLocal, rot);
    const half = prop.lengthMm * 0.5;
    const pA = projectPoint3DToCamera2D(addVec3(prop.centerMm, scaleVec3(axisWorld, -half)), camera);
    const pB = projectPoint3DToCamera2D(addVec3(prop.centerMm, scaleVec3(axisWorld, half)), camera);
    const a2 = mapper.mapPoint(pA.screen);
    const b2 = mapper.mapPoint(pB.screen);
    const avgDepth = (pA.depthMm + pB.depthMm) * 0.5;
    const widthPx = ((prop.radiusMm * 2 * camera.focalLengthPx) / avgDepth) * mapper.scaleFactor;
    return `<g data-prop-kind="cylinder"><line x1="${fmt(a2.x)}" y1="${fmt(a2.y)}" x2="${fmt(b2.x)}" y2="${fmt(b2.y)}" stroke="${palette.propFill}" stroke-width="${fmt(Math.max(8, widthPx))}" stroke-linecap="round"/><line x1="${fmt(a2.x)}" y1="${fmt(a2.y)}" x2="${fmt(b2.x)}" y2="${fmt(b2.y)}" stroke="${palette.propStroke}" stroke-width="2" stroke-dasharray="6 4"/></g>`;
  }

  const hx = prop.sizeMm.x * 0.5;
  const hy = prop.sizeMm.y * 0.5;
  const cornersLocal: readonly Vec3[] = [
    vec3(-hx, -hy, 0),
    vec3(hx, -hy, 0),
    vec3(hx, hy, 0),
    vec3(-hx, hy, 0),
  ];
  const polyPts: string[] = [];
  for (let i = 0; i < cornersLocal.length; i += 1) {
    const corner = cornersLocal[i];
    if (corner === undefined) {
      continue;
    }
    const world = addVec3(prop.centerMm, rotateVec3EulerDeg(corner, rot));
    const proj = projectPoint3DToCamera2D(world, camera);
    const m = mapper.mapPoint(proj.screen);
    polyPts.push(`${fmt(m.x)},${fmt(m.y)}`);
  }
  return `<polygon points="${polyPts.join(" ")}" fill="${palette.propFill}" stroke="${palette.propStroke}" stroke-width="2" stroke-dasharray="6 4"/>`;
}

/**
 * 21-관절 손 뼈대, 20개 캡슐, 파지 소품 윤곽, 순수 단색 실루엣 및 관통/ROM 상태 배지를
 * 순수 `oklch(...)` SVG 문서로 출력한다.
 */
export function renderHand21JointAuditSvg(
  pose: Hand21JointPose,
  options?: HandAuditSvgOptions,
): string {
  const theme = options?.theme ?? "light";
  const palette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const camera = options?.camera ?? DEFAULT_HAND_CAMERA_SPEC;
  const silhouette =
    options?.silhouetteAudit ??
    auditHandSilhouetteClarity(pose, camera, { autoRefine: false, prop: options?.prop });
  const projected = silhouette.projectedJoints;
  const byId = new Map<HandJointId, ProjectedHandJoint2D>();
  for (let i = 0; i < projected.length; i += 1) {
    const p = projected[i];
    if (p !== undefined) {
      byId.set(p.id, p);
    }
  }

  const leftMapper = createPanelMapper(projected, 28, 76, 442, 396);
  const rightMapper = createPanelMapper(projected, 490, 76, 442, 396);

  const penetratingCapsules = new Set<string>();
  if (options?.propAudit !== undefined) {
    for (let i = 0; i < options.propAudit.capsuleSamples.length; i += 1) {
      const s = options.propAudit.capsuleSamples[i];
      if (s !== undefined && s.isPenetrating) {
        penetratingCapsules.add(s.capsuleId);
      }
    }
  }
  if (options?.selfAudit !== undefined) {
    for (let i = 0; i < options.selfAudit.pairs.length; i += 1) {
      const pair = options.selfAudit.pairs[i];
      if (pair !== undefined) {
        penetratingCapsules.add(pair.capsuleAId);
        penetratingCapsules.add(pair.capsuleBId);
      }
    }
  }

  const palmOrder: readonly HandJointId[] = [
    "wrist",
    "thumb_cmc",
    "index_mcp",
    "middle_mcp",
    "ring_mcp",
    "pinky_mcp",
  ];

  const buildPalmPoints = (mapper: ViewportMapper): string => {
    const pts: string[] = [];
    for (let i = 0; i < palmOrder.length; i += 1) {
      const id = palmOrder[i];
      const node = id !== undefined ? byId.get(id) : undefined;
      if (node !== undefined) {
        const m = mapper.mapPoint(node.screen);
        pts.push(`${fmt(m.x)},${fmt(m.y)}`);
      }
    }
    return pts.join(" ");
  };

  const leftCapsulesSvg: string[] = [];
  const rightSilhouetteSvg: string[] = [];
  for (let i = 0; i < pose.capsules.length; i += 1) {
    const cap = pose.capsules[i];
    if (cap === undefined) {
      continue;
    }
    const startNode = byId.get(cap.fromJointId);
    const endNode = byId.get(cap.toJointId);
    if (startNode === undefined || endNode === undefined) {
      continue;
    }
    const isHit = penetratingCapsules.has(cap.id);
    const avgRadiusPx = ((startNode.radiusPx + endNode.radiusPx) * 0.5) * leftMapper.scaleFactor;
    const strokeW = Math.max(4, avgRadiusPx * 1.9);

    const aL = leftMapper.mapPoint(startNode.screen);
    const bL = leftMapper.mapPoint(endNode.screen);
    leftCapsulesSvg.push(
      `<line x1="${fmt(aL.x)}" y1="${fmt(aL.y)}" x2="${fmt(bL.x)}" y2="${fmt(bL.y)}" stroke="${isHit ? palette.capsuleErrorFill : palette.capsuleFill}" stroke-width="${fmt(strokeW)}" stroke-linecap="round"/>` +
        `<line x1="${fmt(aL.x)}" y1="${fmt(aL.y)}" x2="${fmt(bL.x)}" y2="${fmt(bL.y)}" stroke="${isHit ? palette.capsuleErrorStroke : palette.boneStroke}" stroke-width="${isHit ? "2.4" : "1.5"}" stroke-linecap="round"/>`,
    );

    const aR = rightMapper.mapPoint(startNode.screen);
    const bR = rightMapper.mapPoint(endNode.screen);
    const silW = Math.max(4, ((startNode.radiusPx + endNode.radiusPx) * 0.5) * rightMapper.scaleFactor * 1.95);
    rightSilhouetteSvg.push(
      `<line x1="${fmt(aR.x)}" y1="${fmt(aR.y)}" x2="${fmt(bR.x)}" y2="${fmt(bR.y)}" stroke="${palette.silhouetteInk}" stroke-width="${fmt(silW)}" stroke-linecap="round"/>`,
    );
  }

  const jointsSvg: string[] = [];
  for (let i = 0; i < projected.length; i += 1) {
    const node = projected[i];
    if (node === undefined) {
      continue;
    }
    const pt = leftMapper.mapPoint(node.screen);
    const isTip = FINGERTIP_JOINT_SET.has(node.id);
    const isWrist = node.id === "wrist";
    const r = isWrist ? 6 : isTip ? 5 : 3.5;
    jointsSvg.push(
      `<circle cx="${fmt(pt.x)}" cy="${fmt(pt.y)}" r="${fmt(r)}" fill="${isTip ? palette.tipFill : palette.jointFill}" stroke="${isTip ? palette.tipStroke : palette.jointStroke}" stroke-width="1.5"/>`,
    );
  }

  const overlapSvg: string[] = [];
  for (let i = 0; i < silhouette.overlappingTipPairs.length; i += 1) {
    const pair = silhouette.overlappingTipPairs[i];
    if (pair === undefined) {
      continue;
    }
    const idA: HandJointId = `${pair.fingerA}_tip`;
    const idB: HandJointId = `${pair.fingerB}_tip`;
    const nA = byId.get(idA);
    const nB = byId.get(idB);
    if (nA !== undefined && nB !== undefined) {
      const mA = rightMapper.mapPoint(nA.screen);
      const mB = rightMapper.mapPoint(nB.screen);
      overlapSvg.push(
        `<line x1="${fmt(mA.x)}" y1="${fmt(mA.y)}" x2="${fmt(mB.x)}" y2="${fmt(mB.y)}" stroke="${palette.overlapWarnStroke}" stroke-width="2.2" stroke-dasharray="4 3"/>` +
          `<circle cx="${fmt((mA.x + mB.x) * 0.5)}" cy="${fmt((mA.y + mB.y) * 0.5)}" r="10" fill="none" stroke="${palette.overlapWarnStroke}" stroke-width="2"/>`,
      );
    }
  }

  const propSvg =
    options?.prop !== undefined
      ? renderProjectedPropSvg(options.prop, camera, leftMapper, palette)
      : "";

  const romCount = options?.romAudit?.violationCount ?? 0;
  const propPenCount = options?.propAudit?.penetrationCount ?? 0;
  const maxPenMm = options?.propAudit?.maxPenetrationMm ?? 0;
  const selfPenCount = options?.selfAudit?.selfPenetrationCount ?? 0;
  const shaShort = computeHandPoseManifestSha256(pose, options?.prop).slice(0, 12);

  const hasFail = romCount > 0 || propPenCount > 0 || selfPenCount > 0;
  const hasWarn = !hasFail && silhouette.hasAmbiguousOverlap;
  const statusBg = hasFail
    ? palette.badgeFailBg
    : hasWarn
      ? palette.badgeWarnBg
      : palette.badgePassBg;
  const statusInk = hasFail
    ? palette.badgeFailInk
    : hasWarn
      ? palette.badgeWarnInk
      : palette.badgePassInk;
  const statusText = hasFail
    ? `수정 필요 · ROM ${romCount}건 · 관통 ${propPenCount + selfPenCount}건`
    : hasWarn
      ? `실루엣 주의 · 끝 겹침 ${silhouette.overlappingTipPairs.length}쌍`
      : `검수 통과 · 21관절 · 관통 0건 (${fmt(maxPenMm)}mm)`;

  const safeTitle = escapeSvgXmlText(
    options?.title ??
      `Wave 147 21-관절 손 해부학·파지 검수 (${pose.handedness === "right" ? "오른손" : "왼손"} · ${pose.presetId})`,
  );
  const safePropLabel = options?.prop
    ? escapeSvgXmlText(`소품: ${options.prop.labelKo}`)
    : "소품 없음";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540" role="img" aria-label="${safeTitle}">`,
    `  <rect x="0" y="0" width="960" height="540" fill="${palette.canvasBg}"/>`,
    `  <text x="28" y="38" font-family="sans-serif" font-size="18" font-weight="700" fill="${palette.headerInk}">${safeTitle}</text>`,
    `  <rect x="616" y="16" width="316" height="30" rx="8" fill="${statusBg}"/>`,
    `  <text x="774" y="36" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="${statusInk}">${escapeSvgXmlText(statusText)}</text>`,
    `  <rect x="28" y="60" width="442" height="428" rx="12" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.2"/>`,
    `  <text x="44" y="84" font-family="sans-serif" font-size="13" font-weight="700" fill="${palette.headerInk}">21-관절 뼈대 · 20캡슐 · 파지 검수</text>`,
    `  <text x="454" y="84" text-anchor="end" font-family="sans-serif" font-size="11" fill="${palette.mutedInk}">${safePropLabel}</text>`,
    `  <g data-layer="left-anatomy">`,
    `    <polygon points="${buildPalmPoints(leftMapper)}" fill="${palette.palmFill}" stroke="${palette.palmStroke}" stroke-width="1.2"/>`,
    propSvg ? `    ${propSvg}` : "",
    `    ${leftCapsulesSvg.join("\n    ")}`,
    `    ${jointsSvg.join("\n    ")}`,
    `  </g>`,
    `  <rect x="490" y="60" width="442" height="428" rx="12" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.2"/>`,
    `  <text x="506" y="84" font-family="sans-serif" font-size="13" font-weight="700" fill="${palette.headerInk}">5손가락 단색 실루엣 분리도</text>`,
    `  <text x="916" y="84" text-anchor="end" font-family="sans-serif" font-size="11" fill="${palette.mutedInk}">점수 ${fmt(silhouette.silhouetteClarityScore)}/100</text>`,
    `  <g data-layer="right-silhouette">`,
    `    <polygon points="${buildPalmPoints(rightMapper)}" fill="${palette.silhouetteInk}"/>`,
    `    ${rightSilhouetteSvg.join("\n    ")}`,
    overlapSvg.length > 0 ? `    ${overlapSvg.join("\n    ")}` : "",
    `  </g>`,
    `  <text x="28" y="518" font-family="monospace" font-size="11" fill="${palette.mutedInk}">${escapeSvgXmlText(`SHA-256 ${shaShort} · 관절 21개 · 캡슐 20개 · ROM 위반 ${romCount}건 · 소품 관통 ${propPenCount}건 · 자체 관통 ${selfPenCount}건`)}</text>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 스튜디오 해부학·파지·실루엣 QA 요약 브리프를 생성한다.
 */
export function summarizeHandPoseAuditKo(params: {
  readonly pose: Hand21JointPose;
  readonly romAudit: HandAnatomicalRomAudit;
  readonly prop?: GraspPropPrimitive;
  readonly propAudit?: GraspPropPenetrationAudit;
  readonly selfAudit?: HandSelfPenetrationAudit;
  readonly silhouetteAudit?: HandSilhouetteClarityAudit;
}): HandPoseAuditReportKo {
  const { pose, romAudit, prop, propAudit, selfAudit, silhouetteAudit } = params;
  const handPoseSha256Hex = computeHandPoseManifestSha256(pose, prop);

  const romFail = !romAudit.passed;
  const propFail = (propAudit?.penetrationCount ?? 0) > 0;
  const selfFail = (selfAudit?.selfPenetrationCount ?? 0) > 0;
  const silhouetteWarn = silhouetteAudit?.hasAmbiguousOverlap ?? false;

  let verdict: HandAuditVerdict = "pass";
  let verdictLabelKo = "작화 투입 가능";
  if (romFail || propFail || selfFail) {
    verdict = "fail";
    verdictLabelKo = "해부학·관통 수정 필요";
  } else if (silhouetteWarn) {
    verdict = "warn";
    verdictLabelKo = "실루엣 보정 권장";
  }

  const sideKo = pose.handedness === "right" ? "오른손" : "왼손";
  const headlineKo =
    verdict === "pass"
      ? `${sideKo} 21관절 해부학·파지 검수를 모두 통과했습니다.`
      : verdict === "warn"
        ? `${sideKo} 뼈대와 파지는 정상이나 손가락 끝 실루엣이 일부 겹칩니다.`
        : `${sideKo} 포즈에서 관절 가동범위 이탈 또는 파지 관통이 확인되어 보정이 필요합니다.`;

  const bullets: string[] = [];
  const directives: string[] = [];

  if (romAudit.passed) {
    bullets.push("21관절 가동범위(ROM) 정상: 역꺾임이나 과굴곡 관절이 없습니다.");
  } else {
    bullets.push(
      `관절 가동범위(ROM) 위반 ${romAudit.violationCount}건(역꺾임 ${romAudit.hyperextensionCount}건, 과굴곡 ${romAudit.overflexionCount}건, 최대 초과 ${fmt(romAudit.maxExcessDeg)}°).`,
    );
    const topViolations = romAudit.violations.slice(0, 3);
    for (let i = 0; i < topViolations.length; i += 1) {
      const v = topViolations[i];
      if (v !== undefined) {
        directives.push(
          `${v.messageKo} 허용 범위(${v.minDeg}°~${v.maxDeg}°) 안쪽(${v.clampedDeg}°)으로 되돌려 주세요.`,
        );
      }
    }
  }

  if (prop !== undefined && propAudit !== undefined) {
    if (propAudit.penetrationCount === 0) {
      bullets.push(
        `${prop.labelKo} 파지 관통 0건(최대 관통 ${fmt(propAudit.maxPenetrationMm)}mm, 접촉 캡슐 ${propAudit.contactCount}개).`,
      );
    } else {
      const hitFingersKo = propAudit.collidingFingers.map((f) => FINGER_LABEL_KO[f]).join("·");
      bullets.push(
        `${prop.labelKo} 파지 관통 ${propAudit.penetrationCount}건(최대 깊이 ${fmt(propAudit.maxPenetrationMm)}mm, 충돌 손가락: ${hitFingersKo}).`,
      );
      directives.push(
        `${hitFingersKo} 관절 굴곡을 바깥쪽으로 풀어 ${prop.labelKo} 표면 관통을 0건으로 정리하세요.`,
      );
    }
  }

  if (selfAudit !== undefined) {
    if (selfAudit.selfPenetrationCount === 0) {
      bullets.push("손가락 간 자체 관통 0건으로 지골 간격이 깔끔하게 유지됩니다.");
    } else {
      bullets.push(
        `손가락 간 자체 관통 ${selfAudit.selfPenetrationCount}건(최대 ${fmt(selfAudit.maxSelfPenetrationMm)}mm).`,
      );
      directives.push("인접 손가락 외전각을 살짝 벌려 지골 겹침을 해제하세요.");
    }
  }

  if (silhouetteAudit !== undefined) {
    if (!silhouetteAudit.hasAmbiguousOverlap) {
      bullets.push(
        `5손가락 실루엣 분리도 ${fmt(silhouetteAudit.silhouetteClarityScore)}점(끝 겹침 0쌍, 최소 간격 ${fmt(silhouetteAudit.minTipDistancePx)}px).`,
      );
    } else {
      bullets.push(
        `5손가락 실루엣 분리도 ${fmt(silhouetteAudit.silhouetteClarityScore)}점(끝 겹침 ${silhouetteAudit.overlappingTipPairs.length}쌍).`,
      );
      if (silhouetteAudit.refinement.applied) {
        const ref = silhouetteAudit.refinement;
        directives.push(
          `손목 회전을 ${ref.wristDeltaDeg.pronationDeg}°/${ref.wristDeltaDeg.radialUlnarDeg}° 조정하고 손가락 간격을 ${ref.abductionBoostDeg}° 벌리면 분리도가 ${fmt(ref.afterScore)}점(겹침 ${ref.afterOverlapCount}쌍)으로 올라갑니다.`,
        );
      } else {
        directives.push("카메라 각도나 손목 비틀기를 소폭 틀어 다섯 손가락 끝 윤곽을 분리하세요.");
      }
    }
  }

  if (directives.length === 0) {
    directives.push("현재 21관절 가이드 위에 바로 선화를 올려도 해부학 오류나 소품 관통이 없습니다.");
  }

  const summaryParagraphKo = `${headlineKo} ${bullets.join(" ")} 지문 ${handPoseSha256Hex.slice(0, 12)} 기준으로 동일 포즈를 재현할 수 있습니다.`;

  return {
    verdict,
    verdictLabelKo,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo: bullets,
    actionableDirectivesKo: directives,
    handPoseSha256Hex,
  };
}
