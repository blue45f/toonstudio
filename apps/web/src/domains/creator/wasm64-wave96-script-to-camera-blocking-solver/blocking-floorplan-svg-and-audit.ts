/**
 * Wave 96 — 인쇄 대응 고대비 톱다운 감독용 블록킹 평면도 SVG 및 한국어 촬영 시트 요약기.
 */

import type {
  BeatEmotionTag,
  ComicShotScale,
  SceneTimeOfDay,
  VerticalCameraAngleBias,
} from "./korean-script-beat-parser";
import type {
  CameraBlockingAuditResult,
  CameraBlockingPlan,
  CameraBlockingShot,
  Vec2XZ,
} from "./camera-180-rule-and-lighting-solver";

export interface BlockingFloorplanSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly paddingPx?: number;
  readonly showLightingArrows?: boolean;
  readonly showCameraFrustums?: boolean;
  readonly selectedShotIndex?: number;
  readonly titleKo?: string;
}

const PRINT_SAFE_PALETTE = {
  paperBg: "oklch(0.985 0.008 90)",
  plotBg: "oklch(0.996 0.003 90)",
  gridStroke: "oklch(0.89 0.01 90)",
  borderStroke: "oklch(0.32 0.04 162)",
  textPrimary: "oklch(0.2 0.03 162)",
  textMuted: "oklch(0.45 0.03 162)",
  safeHalfPlaneFill: "oklch(0.56 0.09 162 / 0.12)",
  axisStroke: "oklch(0.5 0.18 28)",
  actorFill: "oklch(0.28 0.07 162)",
  actorStroke: "oklch(0.985 0.006 90)",
  actorRingStroke: "oklch(0.48 0.06 162 / 0.55)",
  cameraFill: "oklch(0.42 0.12 246)",
  cameraResetFill: "oklch(0.55 0.18 42)",
  cameraWedgeFill: "oklch(0.56 0.12 246 / 0.17)",
  cameraResetWedgeFill: "oklch(0.62 0.18 42 / 0.2)",
  cameraTextFill: "oklch(0.99 0.004 90)",
  keyLightStroke: "oklch(0.62 0.17 72)",
  fillLightStroke: "oklch(0.52 0.12 232)",
  rimLightStroke: "oklch(0.52 0.17 328)",
} as const;

const TIME_OF_DAY_LABELS_KO: Readonly<Record<SceneTimeOfDay, string>> = {
  daylight: "주간 자연광",
  sunset: "석양 골든아워",
  "night-neon": "야간 네온",
  "interior-warm": "따뜻한 실내",
};

const EMOTION_LABELS_KO: Readonly<Record<BeatEmotionTag, string>> = {
  "calm-dialogue": "차분한 대화",
  tension: "팽팽한 긴장",
  "shock-reveal": "충격·반전",
  "action-impact": "액션 임팩트",
  "intimate-warmth": "친밀한 온기",
  "melancholy-isolation": "쓸쓸한 고립",
};

const SHOT_SCALE_LABELS_KO: Readonly<Record<ComicShotScale, string>> = {
  "extreme-wide": "익스트림 와이드",
  wide: "와이드",
  "medium-full": "미디엄 풀",
  "over-the-shoulder": "오버 더 숄더",
  "medium-closeup": "미디엄 클로즈업",
  closeup: "클로즈업",
  "extreme-closeup": "익스트림 클로즈업",
};

const PITCH_BIAS_LABELS_KO: Readonly<Record<VerticalCameraAngleBias, string>> = {
  "low-angle": "로우 앵글",
  "eye-level": "아이 레벨",
  "high-angle": "하이 앵글",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clipPolygonToHalfPlane(
  polygon: readonly Vec2XZ[],
  origin: Vec2XZ,
  inwardNormal: Vec2XZ,
): readonly Vec2XZ[] {
  const signed = (pt: Vec2XZ): number =>
    (pt.x - origin.x) * inwardNormal.x + (pt.z - origin.z) * inwardNormal.z;

  const output: Vec2XZ[] = [];
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const curr = polygon[i];
    const prev = polygon[(i + count - 1) % count];
    if (!curr || !prev) continue;
    const currDist = signed(curr);
    const prevDist = signed(prev);
    const currInside = currDist >= 0;
    const prevInside = prevDist >= 0;

    if (currInside !== prevInside) {
      const denom = prevDist - currDist;
      const t = Math.abs(denom) > 1e-9 ? prevDist / denom : 0;
      output.push({ x: prev.x + (curr.x - prev.x) * t, z: prev.z + (curr.z - prev.z) * t });
    }
    if (currInside) output.push(curr);
  }
  return output;
}

function renderArrowLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  headSize: number,
  dashed = false,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-4) return "";
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const leftX = x2 - ux * headSize + px * (headSize * 0.52);
  const leftY = y2 - uy * headSize + py * (headSize * 0.52);
  const rightX = x2 - ux * headSize - px * (headSize * 0.52);
  const rightY = y2 - uy * headSize - py * (headSize * 0.52);
  const dashAttr = dashed ? ' stroke-dasharray="5 3"' : "";
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"${dashAttr} /><polygon points="${fmt(x2)},${fmt(y2)} ${fmt(leftX)},${fmt(leftY)} ${fmt(rightX)},${fmt(rightY)}" fill="${stroke}" />`;
}

export function renderBlockingFloorplanSvg(
  plan: CameraBlockingPlan,
  options: BlockingFloorplanSvgOptions = {},
): string {
  const widthPx = Math.max(480, Math.round(options.widthPx ?? 880));
  const heightPx = Math.max(360, Math.round(options.heightPx ?? 620));
  const pad = Math.max(44, Math.round(options.paddingPx ?? 58));
  const plotLeft = pad;
  const plotTop = 62;
  const plotWidth = widthPx - pad * 2;
  const plotHeight = heightPx - plotTop - 62;

  let minX = plan.axis.axisOrigin.x - 2.2;
  let maxX = plan.axis.axisOrigin.x + 2.2;
  let minZ = plan.axis.axisOrigin.z - 2.2;
  let maxZ = plan.axis.axisOrigin.z + 2.2;

  const includeXZ = (x: number, z: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };

  for (let i = 0; i < plan.actors.length; i += 1) {
    const actor = plan.actors[i];
    if (actor) {
      includeXZ(actor.position.x - 1.2, actor.position.z - 1.2);
      includeXZ(actor.position.x + 1.2, actor.position.z + 1.2);
    }
  }
  for (let i = 0; i < plan.shots.length; i += 1) {
    const shot = plan.shots[i];
    if (shot) {
      includeXZ(shot.camera.position.x, shot.camera.position.z);
      includeXZ(shot.camera.target.x, shot.camera.target.z);
    }
  }

  minX -= 1.4;
  maxX += 1.4;
  minZ -= 1.4;
  maxZ += 1.4;

  const worldSpanX = Math.max(4, maxX - minX);
  const worldSpanZ = Math.max(4, maxZ - minZ);
  const pxPerMeter = Math.min(plotWidth / worldSpanX, plotHeight / worldSpanZ);
  const centerWorldX = (minX + maxX) / 2;
  const centerWorldZ = (minZ + maxZ) / 2;
  const toSvgX = (wx: number): number => plotLeft + plotWidth / 2 + (wx - centerWorldX) * pxPerMeter;
  const toSvgY = (wz: number): number => plotTop + plotHeight / 2 + (wz - centerWorldZ) * pxPerMeter;

  const visMinX = centerWorldX - plotWidth / (2 * pxPerMeter);
  const visMaxX = centerWorldX + plotWidth / (2 * pxPerMeter);
  const visMinZ = centerWorldZ - plotHeight / (2 * pxPerMeter);
  const visMaxZ = centerWorldZ + plotHeight / (2 * pxPerMeter);

  const inwardNormal: Vec2XZ = {
    x: plan.axis.axisNormalXZ.x * plan.axis.lockedSideSign,
    z: plan.axis.axisNormalXZ.z * plan.axis.lockedSideSign,
  };
  const safePolyPoints = clipPolygonToHalfPlane(
    [
      { x: visMinX, z: visMinZ },
      { x: visMaxX, z: visMinZ },
      { x: visMaxX, z: visMaxZ },
      { x: visMinX, z: visMaxZ },
    ],
    plan.axis.axisOrigin,
    inwardNormal,
  )
    .map((pt) => `${fmt(toSvgX(pt.x))},${fmt(toSvgY(pt.z))}`)
    .join(" ");

  const gridParts: string[] = [];
  for (let gx = Math.ceil(visMinX); gx <= Math.floor(visMaxX); gx += 1) {
    const sx = toSvgX(gx);
    gridParts.push(
      `<line x1="${fmt(sx)}" y1="${fmt(plotTop)}" x2="${fmt(sx)}" y2="${fmt(plotTop + plotHeight)}" stroke="${PRINT_SAFE_PALETTE.gridStroke}" stroke-width="1" />`,
    );
  }
  for (let gz = Math.ceil(visMinZ); gz <= Math.floor(visMaxZ); gz += 1) {
    const sy = toSvgY(gz);
    gridParts.push(
      `<line x1="${fmt(plotLeft)}" y1="${fmt(sy)}" x2="${fmt(plotLeft + plotWidth)}" y2="${fmt(sy)}" stroke="${PRINT_SAFE_PALETTE.gridStroke}" stroke-width="1" />`,
    );
  }

  const axisExt = Math.hypot(worldSpanX, worldSpanZ) + 4;
  const ax1 = plan.axis.axisOrigin.x - plan.axis.axisDirectionXZ.x * axisExt;
  const az1 = plan.axis.axisOrigin.z - plan.axis.axisDirectionXZ.z * axisExt;
  const ax2 = plan.axis.axisOrigin.x + plan.axis.axisDirectionXZ.x * axisExt;
  const az2 = plan.axis.axisOrigin.z + plan.axis.axisDirectionXZ.z * axisExt;

  const halfPlaneLabelX = toSvgX(plan.axis.axisOrigin.x + inwardNormal.x * Math.min(2.1, worldSpanZ * 0.28));
  const halfPlaneLabelY = toSvgY(plan.axis.axisOrigin.z + inwardNormal.z * Math.min(2.1, worldSpanZ * 0.28));

  const showFrustums = options.showCameraFrustums !== false;
  const cameraParts: string[] = [];
  for (let i = 0; i < plan.shots.length; i += 1) {
    const shot = plan.shots[i];
    if (!shot) continue;
    const cx = toSvgX(shot.camera.position.x);
    const cy = toSvgY(shot.camera.position.z);
    const aimDx = shot.camera.target.x - shot.camera.position.x;
    const aimDz = shot.camera.target.z - shot.camera.position.z;
    const aimAngle = Math.hypot(aimDx, aimDz) > 1e-5 ? Math.atan2(aimDz, aimDx) : -Math.PI / 2;
    const halfFovRad = ((shot.camera.horizontalFovDeg * Math.PI) / 180) / 2;
    const wedgePx = Math.max(26, Math.min(82, pxPerMeter * 1.15));
    const badgeFill = shot.intentionalAxisReset ? PRINT_SAFE_PALETTE.cameraResetFill : PRINT_SAFE_PALETTE.cameraFill;
    const wedgeFill = shot.intentionalAxisReset ? PRINT_SAFE_PALETTE.cameraResetWedgeFill : PRINT_SAFE_PALETTE.cameraWedgeFill;

    if (showFrustums) {
      const lx = cx + Math.cos(aimAngle - halfFovRad) * wedgePx;
      const ly = cy + Math.sin(aimAngle - halfFovRad) * wedgePx;
      const rx = cx + Math.cos(aimAngle + halfFovRad) * wedgePx;
      const ry = cy + Math.sin(aimAngle + halfFovRad) * wedgePx;
      cameraParts.push(
        `<polygon points="${fmt(cx)},${fmt(cy)} ${fmt(lx)},${fmt(ly)} ${fmt(rx)},${fmt(ry)}" fill="${wedgeFill}" stroke="${badgeFill}" stroke-width="1.2" />`,
      );
    }
    cameraParts.push(
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="12" fill="${badgeFill}" stroke="${PRINT_SAFE_PALETTE.actorStroke}" stroke-width="1.8" />`,
      `<text x="${fmt(cx)}" y="${fmt(cy + 4)}" text-anchor="middle" font-size="10" font-weight="700" fill="${PRINT_SAFE_PALETTE.cameraTextFill}">${escapeXml(shot.shotCode)}</text>`,
      `<text x="${fmt(cx)}" y="${fmt(cy + 23)}" text-anchor="middle" font-size="9" fill="${PRINT_SAFE_PALETTE.textMuted}">${fmt(shot.camera.focalLengthMm)}mm</text>`,
    );
  }

  const actorParts: string[] = [];
  for (let i = 0; i < plan.actors.length; i += 1) {
    const actor = plan.actors[i];
    if (!actor) continue;
    const ax = toSvgX(actor.position.x);
    const ay = toSvgY(actor.position.z);
    const radiusPx = Math.max(12, actor.personalRadiusMeters * pxPerMeter);
    const arrowLen = Math.max(22, pxPerMeter * 0.55);
    actorParts.push(
      `<circle cx="${fmt(ax)}" cy="${fmt(ay)}" r="${fmt(radiusPx)}" fill="none" stroke="${PRINT_SAFE_PALETTE.actorRingStroke}" stroke-width="1.2" stroke-dasharray="4 3" />`,
      renderArrowLine(ax, ay, ax + actor.facingDirectionXZ.x * arrowLen, ay + actor.facingDirectionXZ.z * arrowLen, PRINT_SAFE_PALETTE.actorFill, 2.2, 7),
      `<circle cx="${fmt(ax)}" cy="${fmt(ay)}" r="11" fill="${PRINT_SAFE_PALETTE.actorFill}" stroke="${PRINT_SAFE_PALETTE.actorStroke}" stroke-width="2" />`,
      `<text x="${fmt(ax)}" y="${fmt(ay - 17)}" text-anchor="middle" font-size="12" font-weight="700" fill="${PRINT_SAFE_PALETTE.textPrimary}">${escapeXml(actor.displayNameKo)}</text>`,
    );
  }

  const lightingParts: string[] = [];
  const selectedIdx = Math.max(0, Math.min(plan.shots.length - 1, options.selectedShotIndex ?? 0));
  const selectedShot: CameraBlockingShot | undefined = plan.shots[selectedIdx];
  if (options.showLightingArrows !== false && selectedShot) {
    const subject = plan.actors.find((a) => a.actorId === selectedShot.subjectActorId) ?? plan.actors[0];
    if (subject) {
      const lights = [
        { spec: selectedShot.lighting.keyLight, label: `Key ${selectedShot.lighting.keyLight.colorTemperatureK}K`, stroke: PRINT_SAFE_PALETTE.keyLightStroke, dashed: false },
        { spec: selectedShot.lighting.fillLight, label: `Fill ${selectedShot.lighting.fillLight.colorTemperatureK}K`, stroke: PRINT_SAFE_PALETTE.fillLightStroke, dashed: true },
        { spec: selectedShot.lighting.rimLight, label: `Rim ${selectedShot.lighting.rimLight.colorTemperatureK}K`, stroke: PRINT_SAFE_PALETTE.rimLightStroke, dashed: false },
      ];
      for (let l = 0; l < lights.length; l += 1) {
        const entry = lights[l];
        if (!entry) continue;
        const hLen = Math.hypot(entry.spec.direction.x, entry.spec.direction.z);
        const hx = hLen > 1e-5 ? entry.spec.direction.x / hLen : 0;
        const hz = hLen > 1e-5 ? entry.spec.direction.z / hLen : 1;
        const sx = toSvgX(subject.position.x + hx * 1.45);
        const sy = toSvgY(subject.position.z + hz * 1.45);
        const ex = toSvgX(subject.position.x + hx * 0.52);
        const ey = toSvgY(subject.position.z + hz * 0.52);
        lightingParts.push(
          renderArrowLine(sx, sy, ex, ey, entry.stroke, 2.1, 7, entry.dashed),
          `<text x="${fmt(sx)}" y="${fmt(sy - 6)}" text-anchor="middle" font-size="10" font-weight="600" fill="${entry.stroke}">${escapeXml(entry.label)}</text>`,
        );
      }
    }
  }

  const titleText = escapeXml(options.titleKo ?? `${plan.sceneTitle} — 3D 카메라·조명 블록킹 평면도`);
  const moodLabel = escapeXml(TIME_OF_DAY_LABELS_KO[plan.sceneTimeOfDay]);
  const scaleBarPx = Math.max(24, Math.min(120, pxPerMeter));
  const legendY = heightPx - 18;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" role="img" aria-label="${titleText}">`,
    `<defs><clipPath id="floorplan-plot-clip"><rect x="${fmt(plotLeft)}" y="${fmt(plotTop)}" width="${fmt(plotWidth)}" height="${fmt(plotHeight)}" rx="8" /></clipPath></defs>`,
    `<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="${PRINT_SAFE_PALETTE.paperBg}" />`,
    `<text x="${fmt(plotLeft)}" y="30" font-size="16" font-weight="700" fill="${PRINT_SAFE_PALETTE.textPrimary}">${titleText}</text>`,
    `<text x="${fmt(widthPx - pad)}" y="30" text-anchor="end" font-size="12" fill="${PRINT_SAFE_PALETTE.textMuted}">${moodLabel} · 컷 ${plan.shots.length}개 · 180° 잠금 (${plan.axis.lockedSideSign > 0 ? "+측" : "-측"})</text>`,
    `<rect x="${fmt(plotLeft)}" y="${fmt(plotTop)}" width="${fmt(plotWidth)}" height="${fmt(plotHeight)}" rx="8" fill="${PRINT_SAFE_PALETTE.plotBg}" stroke="${PRINT_SAFE_PALETTE.borderStroke}" stroke-width="1.5" />`,
    `<g clip-path="url(#floorplan-plot-clip)">`,
    `<g id="metric-grid">${gridParts.join("")}</g>`,
    safePolyPoints.length > 0 ? `<polygon id="safe-180-halfplane" points="${safePolyPoints}" fill="${PRINT_SAFE_PALETTE.safeHalfPlaneFill}" />` : "",
    `<text x="${fmt(halfPlaneLabelX)}" y="${fmt(halfPlaneLabelY)}" text-anchor="middle" font-size="11" font-weight="600" fill="${PRINT_SAFE_PALETTE.textMuted}">180° 허용 카메라 반평면</text>`,
    `<line id="line-of-action-180" x1="${fmt(toSvgX(ax1))}" y1="${fmt(toSvgY(az1))}" x2="${fmt(toSvgX(ax2))}" y2="${fmt(toSvgY(az2))}" stroke="${PRINT_SAFE_PALETTE.axisStroke}" stroke-width="2" stroke-dasharray="8 5" />`,
    `<text x="${fmt(toSvgX(plan.axis.axisOrigin.x))}" y="${fmt(toSvgY(plan.axis.axisOrigin.z) - 8)}" text-anchor="middle" font-size="10" font-weight="700" fill="${PRINT_SAFE_PALETTE.axisStroke}">180° 시선 축</text>`,
    `<g id="camera-frustums">${cameraParts.join("")}</g>`,
    `<g id="lighting-rig">${lightingParts.join("")}</g>`,
    `<g id="actor-markers">${actorParts.join("")}</g>`,
    `</g>`,
    `<g id="floorplan-legend">`,
    `<line x1="${fmt(plotLeft)}" y1="${fmt(legendY - 4)}" x2="${fmt(plotLeft + scaleBarPx)}" y2="${fmt(legendY - 4)}" stroke="${PRINT_SAFE_PALETTE.textPrimary}" stroke-width="2" />`,
    `<text x="${fmt(plotLeft + scaleBarPx + 8)}" y="${fmt(legendY)}" font-size="11" fill="${PRINT_SAFE_PALETTE.textMuted}">1m 축척 · Key/Fill/Rim(${selectedShot ? escapeXml(selectedShot.shotCode) : "-"}) · +X 우측 / +Z 전면</text>`,
    `<text x="${fmt(widthPx - pad)}" y="${fmt(legendY)}" text-anchor="end" font-size="11" fill="${PRINT_SAFE_PALETTE.textMuted}">파란 원: 기본 컷 · 주황 원: 의도적 축 전환</text>`,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

export function summarizeCameraBlockingSheetKo(
  plan: CameraBlockingPlan,
  audit: CameraBlockingAuditResult,
): string {
  const actorNames = plan.actors.map((a) => a.displayNameKo).join(", ");
  const moodKo = TIME_OF_DAY_LABELS_KO[plan.sceneTimeOfDay];
  const sideLabel = plan.axis.lockedSideSign > 0 ? "+1 반평면" : "-1 반평면";

  const lines: string[] = [
    `# 카메라·조명 블록킹 시트 — ${plan.sceneTitle}`,
    "",
    `- 장면 무드: ${moodKo} (${plan.sceneTimeOfDay})`,
    `- 배치 인물: ${actorNames || "미지정"}`,
    `- 180° 시선 축: 기준 인물 ${plan.axis.primaryActorAId}${plan.axis.primaryActorBId ? ` ↔ ${plan.axis.primaryActorBId}` : " 단독"}, 잠금 반평면 ${sideLabel}`,
    "",
    "## 연속성 감사 결과",
    `- 판정: ${audit.summaryStatusKo}`,
    `- 동일 인물 최소 컷 각도 분리: ${audit.minAngularSeparationDegOnSameSubject !== null ? `${audit.minAngularSeparationDegOnSameSubject}°` : "해당 없음"}`,
    `- 카메라-인물 최소 여유 거리: ${audit.minCameraActorDistanceMeters}m (안전 기준 0.35m)`,
    `- 최대 더치 롤 기울기: ${audit.maxAbsRollDeg}° (가독 한계 25°)`,
  ];

  if (audit.violations.length > 0) {
    lines.push("", "### 수정이 필요한 경고");
    for (let i = 0; i < audit.violations.length; i += 1) {
      const violation = audit.violations[i];
      if (violation) lines.push(`- [${violation.code}] ${violation.messageKo}`);
    }
  }

  lines.push(
    "",
    "## 컷별 카메라·조명 계획",
    "| 컷 | 화자 | 정서 | 샷 스케일 | 렌즈 / 화각 | 수직 앵글 | 더치 롤 | 화면 좌→우 | 명암비 (Key:Fill) | 색온도 (Key/Fill/Rim) | 비고 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  let minContrast = Number.POSITIVE_INFINITY;
  let maxContrast = 0;
  for (let i = 0; i < plan.shots.length; i += 1) {
    const shot = plan.shots[i];
    if (!shot) continue;
    const ratio = shot.lighting.keyToFillRatio;
    if (ratio < minContrast) minContrast = ratio;
    if (ratio > maxContrast) maxContrast = ratio;

    const note = shot.intentionalAxisReset
      ? "의도적 축 전환"
      : shot.angularSeparationFromPreviousDeg !== null
        ? `동일 인물 ${shot.angularSeparationFromPreviousDeg}° 이동`
        : "축 유지";
    const kelvins = `${shot.lighting.keyLight.colorTemperatureK}K / ${shot.lighting.fillLight.colorTemperatureK}K / ${shot.lighting.rimLight.colorTemperatureK}K`;
    lines.push(
      `| ${shot.shotCode} | ${shot.subjectActorId} | ${EMOTION_LABELS_KO[shot.beat.emotionTag]} | ${SHOT_SCALE_LABELS_KO[shot.camera.shotScale]} | ${shot.camera.focalLengthMm}mm / ${shot.camera.horizontalFovDeg}° | ${PITCH_BIAS_LABELS_KO[shot.camera.verticalPitchBias]} (${shot.camera.pitchDeg}°) | ${shot.camera.rollDeg}° | ${shot.screenOrderLeftToRight.join(" → ")} | ${ratio}:1 | ${kelvins} | ${note} |`,
    );
  }

  lines.push("", "## 조명 대비 메모");
  if (plan.shots.length > 0 && Number.isFinite(minContrast)) {
    const guidance =
      maxContrast >= 5.0
        ? "강한 명암 대비 구간이 포함돼 있어 키 라이트 그림자 경계를 선명하게 유지하고 림 라이트로 인물 실루엣을 배경에서 띄우는 편이 좋습니다."
        : "전반적으로 부드러운 명암비를 유지하므로 필 라이트 반사광을 살려 인물 표정이 묻히지 않게 정리합니다.";
    lines.push(`- 장면 명암비 범위: ${minContrast}:1 ~ ${maxContrast}:1 (${moodKo} 기준). ${guidance}`);
  } else {
    lines.push("- 생성된 컷이 없어 조명 계획을 비워 두었습니다.");
  }

  return lines.join("\n");
}
