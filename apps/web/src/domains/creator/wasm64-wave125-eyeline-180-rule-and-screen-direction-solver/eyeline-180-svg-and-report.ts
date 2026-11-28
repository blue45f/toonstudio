/**
 * Wave 125 — 인쇄 안전 순수 OKLCH 탑다운 180도 액션 축 다이어그램 SVG 및
 * 한국어 웹툰 연출 감독 QA 브리프 생성기.
 */

import {
  CAMERA_SHOT_KIND_LABELS_KO,
  GEOMETRY_EPSILON,
  MOTION_DIRECTION_LABELS_KO,
  SCREEN_FACING_LABELS_KO,
  VIOLATION_KIND_LABELS_KO,
  type DialogueActionSceneSpec,
  type Eyeline180AuditResult,
  type StageCharacterSpec,
  type Vec2XZ,
} from "./eyeline-180-rule-types";

export interface EyelineStageDiagramSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly titleKo?: string;
}

const OKLCH_STAGE_PALETTE = {
  paperBg: "oklch(0.985 0.008 90)",
  stageBg: "oklch(0.996 0.003 90)",
  cardBg: "oklch(0.968 0.007 90)",
  gridLine: "oklch(0.9 0.009 90)",
  borderStrong: "oklch(0.28 0.04 162)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.2 0.03 162)",
  textMuted: "oklch(0.46 0.025 162)",
  textInverse: "oklch(0.985 0.004 90)",
  safeHalfPlaneFill: "oklch(0.62 0.095 158 / 0.14)",
  safeHalfPlaneStroke: "oklch(0.44 0.11 158 / 0.4)",
  axisLine: "oklch(0.3 0.05 162)",
  axisAnchorSegment: "oklch(0.36 0.09 162)",
  charAnchorFill: "oklch(0.28 0.075 162)",
  charSecondaryFill: "oklch(0.42 0.095 245)",
  camSafeFill: "oklch(0.44 0.12 158)",
  camSafeCone: "oklch(0.56 0.1 158 / 0.18)",
  camBridgeFill: "oklch(0.55 0.14 78)",
  camBridgeCone: "oklch(0.64 0.12 78 / 0.2)",
  camViolationFill: "oklch(0.52 0.21 26)",
  camViolationCone: "oklch(0.58 0.2 26 / 0.22)",
  crossingAlertLine: "oklch(0.52 0.22 25)",
  sequencePath: "oklch(0.52 0.045 225 / 0.55)",
  badgeSafeFill: "oklch(0.56 0.1 158 / 0.14)",
  badgeSafeStroke: "oklch(0.42 0.12 158)",
  badgeAlertFill: "oklch(0.58 0.19 26 / 0.15)",
  badgeAlertStroke: "oklch(0.5 0.2 26)",
} as const;

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

function safeCoord(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

interface StageBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function computeStageWorldBounds(scene: DialogueActionSceneSpec): StageBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const include = (pt: Vec2XZ): void => {
    const x = safeCoord(pt.x);
    const z = safeCoord(pt.z);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };

  for (let i = 0; i < scene.characters.length; i += 1) {
    const ch = scene.characters[i];
    if (ch) include(ch.positionXZ);
  }
  for (let i = 0; i < scene.cuts.length; i += 1) {
    const cut = scene.cuts[i];
    if (cut) include(cut.cameraXZ);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  }

  const rawSpanX = Math.max(2, maxX - minX);
  const rawSpanZ = Math.max(2, maxZ - minZ);
  const padX = Math.max(1.2, rawSpanX * 0.25);
  const padZ = Math.max(1.2, rawSpanZ * 0.25);

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minZ: minZ - padZ,
    maxZ: maxZ + padZ,
  };
}

/**
 * 탑다운 스테이지 사각형 영역을 액션 축 AB의 안전 반평면(sideSign: +1 또는 -1)으로
 * Sutherland–Hodgman 반평면 클리핑해 닫힌 다각형 꼭짓점을 반환한다.
 */
function clipRectToSafeHalfPlane(
  bounds: StageBounds,
  axisA: Vec2XZ,
  axisB: Vec2XZ,
  sideSign: -1 | 1,
): Vec2XZ[] {
  const ax = safeCoord(axisA.x);
  const az = safeCoord(axisA.z);
  const dx = safeCoord(axisB.x) - ax;
  const dz = safeCoord(axisB.z) - az;

  const evalSide = (p: Vec2XZ): number => {
    const cross = dx * (p.z - az) - dz * (p.x - ax);
    return sideSign * cross;
  };

  const rect: Vec2XZ[] = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ];

  const output: Vec2XZ[] = [];
  for (let i = 0; i < rect.length; i += 1) {
    const curr = rect[i];
    const prev = rect[(i + rect.length - 1) % rect.length];
    if (!curr || !prev) continue;
    const currVal = evalSide(curr);
    const prevVal = evalSide(prev);
    const currIn = currVal >= 0;
    const prevIn = prevVal >= 0;

    if (currIn !== prevIn) {
      const denom = prevVal - currVal;
      if (Math.abs(denom) > GEOMETRY_EPSILON) {
        const t = prevVal / denom;
        output.push({
          x: prev.x + t * (curr.x - prev.x),
          z: prev.z + t * (curr.z - prev.z),
        });
      }
    }
    if (currIn) {
      output.push(curr);
    }
  }
  return output;
}

/**
 * 웹툰 3D 스테이지의 180도 액션 축, 안전 반평면, 캐릭터 배치, 각 컷 카메라 위치·시야 콘·순번,
 * 축 침범 경고선을 인쇄 대응 순수 OKLCH 탑다운 SVG로 렌더링한다.
 */
export function renderEyeline180StageDiagramSvg(
  scene: DialogueActionSceneSpec,
  audit: Eyeline180AuditResult,
  options: EyelineStageDiagramSvgOptions = {},
): string {
  const widthPx = Math.max(560, Math.round(safeCoord(options.widthPx ?? 820)));
  const heightPx = Math.max(460, Math.round(safeCoord(options.heightPx ?? 600)));
  const padX = 24;
  const headerH = 78;
  const footerH = 74;
  const plotX = padX;
  const plotY = headerH + 10;
  const plotW = widthPx - padX * 2;
  const plotH = Math.max(240, heightPx - headerH - footerH - 20);

  const bounds = computeStageWorldBounds(scene);
  const worldSpanX = Math.max(GEOMETRY_EPSILON, bounds.maxX - bounds.minX);
  const worldSpanZ = Math.max(GEOMETRY_EPSILON, bounds.maxZ - bounds.minZ);
  const scale = Math.min(plotW / worldSpanX, plotH / worldSpanZ);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterZ = (bounds.minZ + bounds.maxZ) / 2;
  const svgCenterX = plotX + plotW / 2;
  const svgCenterZ = plotY + plotH / 2;

  const mapX = (wx: number): number => svgCenterX + (safeCoord(wx) - worldCenterX) * scale;
  const mapZ = (wz: number): number => svgCenterZ + (safeCoord(wz) - worldCenterZ) * scale;

  const characterMap = new Map<string, StageCharacterSpec>();
  for (let i = 0; i < scene.characters.length; i += 1) {
    const ch = scene.characters[i];
    if (ch) characterMap.set(ch.characterId, ch);
  }

  const titleText = escapeXml(
    options.titleKo?.trim() || `${scene.titleKo} — 180° 액션 축·시선 블로킹 평면도`,
  );
  const statusText =
    audit.totalViolationCount === 0
      ? "180°·시선 통과"
      : `위반 ${audit.totalViolationCount}건 감지`;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" width="${fmt(widthPx)}" height="${fmt(heightPx)}" role="img" aria-label="${titleText}">`,
  );
  lines.push("  <defs>");
  lines.push('    <clipPath id="wave125-stage-clip">');
  lines.push(
    `      <rect x="${fmt(plotX)}" y="${fmt(plotY)}" width="${fmt(plotW)}" height="${fmt(plotH)}" rx="10" />`,
  );
  lines.push("    </clipPath>");
  lines.push("  </defs>");

  // 배경 카드 및 헤더
  lines.push(
    `  <rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(heightPx)}" rx="12" fill="${OKLCH_STAGE_PALETTE.paperBg}" stroke="${OKLCH_STAGE_PALETTE.borderSoft}" stroke-width="1.5" />`,
  );
  lines.push(
    `  <text x="${fmt(padX)}" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_STAGE_PALETTE.textPrimary}">${titleText}</text>`,
  );
  lines.push(
    `  <text x="${fmt(padX)}" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${OKLCH_STAGE_PALETTE.textMuted}">${escapeXml(`씬 ${scene.sceneId} · 캐릭터 ${scene.characters.length}명 · 총 ${scene.cuts.length}컷 · 정합 점수 ${audit.continuityScore}/100 · 지문 ${audit.fingerprintSha256.slice(0, 12)}`)}</text>`,
  );

  const badgeW = 152;
  const badgeX = widthPx - padX - badgeW;
  lines.push(
    `  <rect x="${fmt(badgeX)}" y="22" width="${fmt(badgeW)}" height="28" rx="8" fill="${audit.totalViolationCount === 0 ? OKLCH_STAGE_PALETTE.badgeSafeFill : OKLCH_STAGE_PALETTE.badgeAlertFill}" stroke="${audit.totalViolationCount === 0 ? OKLCH_STAGE_PALETTE.badgeSafeStroke : OKLCH_STAGE_PALETTE.badgeAlertStroke}" stroke-width="1.2" />`,
  );
  lines.push(
    `  <text x="${fmt(badgeX + badgeW / 2)}" y="40" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${audit.totalViolationCount === 0 ? OKLCH_STAGE_PALETTE.badgeSafeStroke : OKLCH_STAGE_PALETTE.badgeAlertStroke}">${escapeXml(statusText)}</text>`,
  );

  // 탑다운 무대 배경
  lines.push(
    `  <rect x="${fmt(plotX)}" y="${fmt(plotY)}" width="${fmt(plotW)}" height="${fmt(plotH)}" rx="10" fill="${OKLCH_STAGE_PALETTE.stageBg}" stroke="${OKLCH_STAGE_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );

  lines.push('  <g clip-path="url(#wave125-stage-clip)">');

  // 1m 격자선
  const gridStepM = Math.max(1, Math.pow(2, Math.floor(Math.log2(Math.max(worldSpanX, worldSpanZ) / 6))));
  const firstGridX = Math.floor(bounds.minX / gridStepM) * gridStepM;
  for (let gx = firstGridX; gx <= bounds.maxX + gridStepM; gx += gridStepM) {
    const sx = mapX(gx);
    lines.push(
      `    <line x1="${fmt(sx)}" y1="${fmt(plotY)}" x2="${fmt(sx)}" y2="${fmt(plotY + plotH)}" stroke="${OKLCH_STAGE_PALETTE.gridLine}" stroke-width="1" />`,
    );
  }
  const firstGridZ = Math.floor(bounds.minZ / gridStepM) * gridStepM;
  for (let gz = firstGridZ; gz <= bounds.maxZ + gridStepM; gz += gridStepM) {
    const sz = mapZ(gz);
    lines.push(
      `    <line x1="${fmt(plotX)}" y1="${fmt(sz)}" x2="${fmt(plotX + plotW)}" y2="${fmt(sz)}" stroke="${OKLCH_STAGE_PALETTE.gridLine}" stroke-width="1" />`,
    );
  }

  // 안전 180도 반평면 영역 & 180도 액션 축 점선
  const { anchorAXZ, anchorBXZ, isAxisValid, initialSafeHalfPlaneSign } = audit.axisSummary;
  if (isAxisValid && anchorAXZ && anchorBXZ) {
    const displaySafeSign: -1 | 1 = initialSafeHalfPlaneSign === -1 ? -1 : 1;
    const expandedBounds: StageBounds = {
      minX: worldCenterX - plotW / (2 * scale) - 1,
      maxX: worldCenterX + plotW / (2 * scale) + 1,
      minZ: worldCenterZ - plotH / (2 * scale) - 1,
      maxZ: worldCenterZ + plotH / (2 * scale) + 1,
    };
    const safePoly = clipRectToSafeHalfPlane(expandedBounds, anchorAXZ, anchorBXZ, displaySafeSign);
    if (safePoly.length >= 3) {
      const pts = safePoly.map((p) => `${fmt(mapX(p.x))},${fmt(mapZ(p.z))}`).join(" ");
      lines.push(
        `    <polygon points="${pts}" fill="${OKLCH_STAGE_PALETTE.safeHalfPlaneFill}" stroke="${OKLCH_STAGE_PALETTE.safeHalfPlaneStroke}" stroke-width="1" />`,
      );
    }

    const dx = anchorBXZ.x - anchorAXZ.x;
    const dz = anchorBXZ.z - anchorAXZ.z;
    const len = Math.max(GEOMETRY_EPSILON, Math.hypot(dx, dz));
    const ux = dx / len;
    const uz = dz / len;
    const extendM = Math.max(worldSpanX, worldSpanZ) * 2.5;
    const p1x = mapX(anchorAXZ.x - ux * extendM);
    const p1z = mapZ(anchorAXZ.z - uz * extendM);
    const p2x = mapX(anchorBXZ.x + ux * extendM);
    const p2z = mapZ(anchorBXZ.z + uz * extendM);

    lines.push(
      `    <line x1="${fmt(p1x)}" y1="${fmt(p1z)}" x2="${fmt(p2x)}" y2="${fmt(p2z)}" stroke="${OKLCH_STAGE_PALETTE.axisLine}" stroke-width="1.6" stroke-dasharray="7 5" />`,
    );
    lines.push(
      `    <line x1="${fmt(mapX(anchorAXZ.x))}" y1="${fmt(mapZ(anchorAXZ.z))}" x2="${fmt(mapX(anchorBXZ.x))}" y2="${fmt(mapZ(anchorBXZ.z))}" stroke="${OKLCH_STAGE_PALETTE.axisAnchorSegment}" stroke-width="2.6" />`,
    );

    const midX = mapX((anchorAXZ.x + anchorBXZ.x) / 2);
    const midZ = mapZ((anchorAXZ.z + anchorBXZ.z) / 2);
    lines.push(
      `    <text x="${fmt(midX)}" y="${fmt(midZ - 8)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_STAGE_PALETTE.axisLine}">180° 액션 축</text>`,
    );
  }

  // 카메라 시퀀스 경로 및 축 위반 경고선
  for (let i = 1; i < scene.cuts.length; i += 1) {
    const prevCut = scene.cuts[i - 1];
    const currCut = scene.cuts[i];
    const currAnalysis = audit.cutAnalyses[i];
    if (!prevCut || !currCut || !currAnalysis) continue;

    const x1 = mapX(prevCut.cameraXZ.x);
    const z1 = mapZ(prevCut.cameraXZ.z);
    const x2 = mapX(currCut.cameraXZ.x);
    const z2 = mapZ(currCut.cameraXZ.z);

    if (currAnalysis.crossedAxisIllegally) {
      lines.push(
        `    <line x1="${fmt(x1)}" y1="${fmt(z1)}" x2="${fmt(x2)}" y2="${fmt(z2)}" stroke="${OKLCH_STAGE_PALETTE.crossingAlertLine}" stroke-width="2.4" stroke-dasharray="5 3" />`,
      );
      const alertMx = (x1 + x2) / 2;
      const alertMz = (z1 + z2) / 2;
      lines.push(
        `    <circle cx="${fmt(alertMx)}" cy="${fmt(alertMz)}" r="7" fill="${OKLCH_STAGE_PALETTE.crossingAlertLine}" />`,
      );
      lines.push(
        `    <text x="${fmt(alertMx)}" y="${fmt(alertMz + 3.5)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="${OKLCH_STAGE_PALETTE.textInverse}">!</text>`,
      );
    } else {
      lines.push(
        `    <line x1="${fmt(x1)}" y1="${fmt(z1)}" x2="${fmt(x2)}" y2="${fmt(z2)}" stroke="${OKLCH_STAGE_PALETTE.sequencePath}" stroke-width="1.4" />`,
      );
    }
  }

  // 각 컷 카메라 시야 콘 및 마커
  const coneLengthPx = Math.max(30, Math.min(68, plotH * 0.16));
  for (let i = 0; i < scene.cuts.length; i += 1) {
    const cut = scene.cuts[i];
    const analysis = audit.cutAnalyses[i];
    if (!cut || !analysis) continue;

    const cx = mapX(cut.cameraXZ.x);
    const cz = mapZ(cut.cameraXZ.z);
    const subject = characterMap.get(cut.subjectCharacterId);
    const aimWorld: Vec2XZ =
      subject?.positionXZ ??
      (anchorAXZ && anchorBXZ
        ? { x: (anchorAXZ.x + anchorBXZ.x) / 2, z: (anchorAXZ.z + anchorBXZ.z) / 2 }
        : { x: cut.cameraXZ.x, z: cut.cameraXZ.z - 1 });
    const ax = mapX(aimWorld.x);
    const az = mapZ(aimWorld.z);
    const aimDx = ax - cx;
    const aimDz = az - cz;
    const aimAngle =
      Math.hypot(aimDx, aimDz) > GEOMETRY_EPSILON ? Math.atan2(aimDz, aimDx) : -Math.PI / 2;
    const halfFovRad = (Math.max(15, Math.min(90, safeCoord(cut.fovDeg ?? 42))) * Math.PI) / 360;

    const hasViolation = analysis.violationIds.length > 0;
    const coneFill = hasViolation
      ? OKLCH_STAGE_PALETTE.camViolationCone
      : analysis.isBridgeShot
        ? OKLCH_STAGE_PALETTE.camBridgeCone
        : OKLCH_STAGE_PALETTE.camSafeCone;
    const camFill = hasViolation
      ? OKLCH_STAGE_PALETTE.camViolationFill
      : analysis.isBridgeShot
        ? OKLCH_STAGE_PALETTE.camBridgeFill
        : OKLCH_STAGE_PALETTE.camSafeFill;

    const leftX = cx + Math.cos(aimAngle - halfFovRad) * coneLengthPx;
    const leftZ = cz + Math.sin(aimAngle - halfFovRad) * coneLengthPx;
    const rightX = cx + Math.cos(aimAngle + halfFovRad) * coneLengthPx;
    const rightZ = cz + Math.sin(aimAngle + halfFovRad) * coneLengthPx;

    lines.push(
      `    <polygon points="${fmt(cx)},${fmt(cz)} ${fmt(leftX)},${fmt(leftZ)} ${fmt(rightX)},${fmt(rightZ)}" fill="${coneFill}" />`,
    );
    lines.push(
      `    <circle cx="${fmt(cx)}" cy="${fmt(cz)}" r="11" fill="${camFill}" stroke="${OKLCH_STAGE_PALETTE.stageBg}" stroke-width="2" />`,
    );
    lines.push(
      `    <text x="${fmt(cx)}" y="${fmt(cz + 3.8)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="700" fill="${OKLCH_STAGE_PALETTE.textInverse}">${i + 1}</text>`,
    );
    lines.push(
      `    <text x="${fmt(cx)}" y="${fmt(cz + 23)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" fill="${hasViolation ? OKLCH_STAGE_PALETTE.camViolationFill : OKLCH_STAGE_PALETTE.textMuted}">${escapeXml(cut.cutId)}</text>`,
    );
  }

  // 캐릭터 마커
  const [anchorAId, anchorBId] = scene.axisAnchorPair;
  for (let i = 0; i < scene.characters.length; i += 1) {
    const ch = scene.characters[i];
    if (!ch) continue;
    const px = mapX(ch.positionXZ.x);
    const pz = mapZ(ch.positionXZ.z);
    const isAnchor = ch.characterId === anchorAId || ch.characterId === anchorBId;
    const fill = isAnchor
      ? OKLCH_STAGE_PALETTE.charAnchorFill
      : OKLCH_STAGE_PALETTE.charSecondaryFill;

    lines.push(
      `    <circle cx="${fmt(px)}" cy="${fmt(pz)}" r="12" fill="${fill}" stroke="${OKLCH_STAGE_PALETTE.stageBg}" stroke-width="2.2" />`,
    );
    lines.push(
      `    <text x="${fmt(px)}" y="${fmt(pz - 17)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="${OKLCH_STAGE_PALETTE.textPrimary}">${escapeXml(`${ch.labelKo} (${fmt(ch.eyeHeightM)}m)`)}</text>`,
    );
  }

  if (scene.cuts.length === 0) {
    lines.push(
      `    <text x="${fmt(svgCenterX)}" y="${fmt(svgCenterZ + 32)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${OKLCH_STAGE_PALETTE.textMuted}">배치된 카메라 컷이 없습니다</text>`,
    );
  }

  lines.push("  </g>");

  // 하단 범례 및 요약 바
  const legendY = plotY + plotH + 22;
  lines.push(
    `  <rect x="${fmt(padX)}" y="${fmt(legendY - 12)}" width="${fmt(plotW)}" height="52" rx="8" fill="${OKLCH_STAGE_PALETTE.cardBg}" stroke="${OKLCH_STAGE_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  const legendItems: readonly { readonly label: string; readonly color: string; readonly xOffset: number }[] = [
    { label: "안전 카메라", color: OKLCH_STAGE_PALETTE.camSafeFill, xOffset: 16 },
    { label: "합법 브리지(중립·부감·돌리)", color: OKLCH_STAGE_PALETTE.camBridgeFill, xOffset: 120 },
    { label: "축 침범·시선 위반", color: OKLCH_STAGE_PALETTE.camViolationFill, xOffset: 300 },
    { label: "주연 캐릭터", color: OKLCH_STAGE_PALETTE.charAnchorFill, xOffset: 438 },
  ];

  for (let i = 0; i < legendItems.length; i += 1) {
    const item = legendItems[i];
    if (!item) continue;
    const lx = padX + item.xOffset;
    lines.push(
      `  <circle cx="${fmt(lx)}" cy="${fmt(legendY + 4)}" r="5" fill="${item.color}" />`,
    );
    lines.push(
      `  <text x="${fmt(lx + 11)}" y="${fmt(legendY + 8)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_STAGE_PALETTE.textPrimary}">${escapeXml(item.label)}</text>`,
    );
  }

  const footerSummary = escapeXml(
    `차단 위반 ${audit.blockerCount}건 · 경고 ${audit.warningCount}건 · 합법 축 전환 ${audit.legalAxisTransitions.length}건 · 합법 방향 전환 ${audit.legalScreenDirectionTransitions.length}건`,
  );
  lines.push(
    `  <text x="${fmt(padX + 12)}" y="${fmt(legendY + 29)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_STAGE_PALETTE.textMuted}">${footerSummary}</text>`,
  );

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 180도 액션 축·시선 매치·추격 방향 감사 결과를 자연스러운 한국어 웹툰 연출 감독 QA 브리프로 요약한다.
 */
export function summarizeEyeline180AuditKo(
  scene: DialogueActionSceneSpec,
  audit: Eyeline180AuditResult,
): string {
  const lines: string[] = [];
  const axisLabel = `${audit.axisSummary.anchorALabelKo} ↔ ${audit.axisSummary.anchorBLabelKo}`;
  const axisMetric = audit.axisSummary.isAxisValid
    ? `거리 ${fmt(audit.axisSummary.axisLengthM)}m`
    : "축 미확정(동일 좌표 또는 인물 누락)";

  lines.push(`[180° 액션 축 · 시선 매치 연출 점검] ${scene.titleKo} (${scene.sceneId})`);
  lines.push(
    `- 스테이지 제원: 주연 축 ${axisLabel} (${axisMetric}), 총 ${scene.cuts.length}컷, 연출 정합 점수 ${audit.continuityScore}/100`,
  );
  lines.push(`- 블로킹 지문(SHA-256): ${audit.fingerprintSha256.slice(0, 16)}`);

  const axisViolations = audit.violations.filter((v) => v.kind === "axis-180-crossing");
  const horizontalViolations = audit.violations.filter((v) => v.kind === "eyeline-horizontal-clash");
  const pitchViolations = audit.violations.filter((v) => v.kind === "eyeline-pitch-mismatch");
  const motionViolations = audit.violations.filter((v) => v.kind === "screen-direction-reversal");

  if (axisViolations.length === 0) {
    const bridgeNote =
      audit.legalAxisTransitions.length > 0
        ? ` (브리지 경유 합법 전환 ${audit.legalAxisTransitions.length}건 승인)`
        : "";
    lines.push(`- 180도 액션 축: 통과 — 축 침범 0건${bridgeNote}`);
  } else {
    const ids = axisViolations.map((v) => v.cutId).join(", ");
    lines.push(`- 180도 액션 축: 차단 위반 ${axisViolations.length}건 (${ids})`);
  }

  if (horizontalViolations.length === 0) {
    lines.push("- 좌우 시선 대칭: 통과 — 역방향 시선 충돌 0건");
  } else {
    const details = horizontalViolations
      .map((v) => {
        const exp = v.expectedScreenFacing ? SCREEN_FACING_LABELS_KO[v.expectedScreenFacing] : "기준 방향";
        const act = v.actualScreenFacing ? SCREEN_FACING_LABELS_KO[v.actualScreenFacing] : "미지정";
        return `${v.cutId}(기대 ${exp} / 작화 ${act})`;
      })
      .join(", ");
    lines.push(`- 좌우 시선 대칭: 차단 위반 ${horizontalViolations.length}건 — ${details}`);
  }

  if (pitchViolations.length === 0) {
    lines.push(`- 시선 고도(피치): 통과 — 허용 오차 ±${fmt(audit.pitchToleranceDeg)}° 이내`);
  } else {
    const details = pitchViolations
      .map(
        (v) =>
          `${v.cutId}(기대 ${fmt(v.expectedPitchDeg ?? 0)}° / 작화 ${fmt(v.actualPitchDeg ?? 0)}°)`,
      )
      .join(", ");
    lines.push(`- 시선 고도(피치): 경고 ${pitchViolations.length}건 — ${details}`);
  }

  if (motionViolations.length === 0) {
    const chaseBridgeNote =
      audit.legalScreenDirectionTransitions.length > 0
        ? ` (브리지 경유 방향 전환 ${audit.legalScreenDirectionTransitions.length}건 승인)`
        : "";
    lines.push(`- 추격·이동 방향: 통과 — 스크린 방향 반전 0건${chaseBridgeNote}`);
  } else {
    const details = motionViolations
      .map((v) => {
        const exp = v.expectedMotionDirection
          ? MOTION_DIRECTION_LABELS_KO[v.expectedMotionDirection]
          : "기준 방향";
        const act = v.actualMotionDirection
          ? MOTION_DIRECTION_LABELS_KO[v.actualMotionDirection]
          : "미지정";
        return `${v.cutId}(기준 ${exp} / 작화 ${act})`;
      })
      .join(", ");
    lines.push(`- 추격·이동 방향: 차단 위반 ${motionViolations.length}건 — ${details}`);
  }

  if (audit.legalAxisTransitions.length > 0) {
    lines.push("- 승인된 합법 축 전환:");
    for (let i = 0; i < audit.legalAxisTransitions.length; i += 1) {
      const tr = audit.legalAxisTransitions[i];
      if (!tr) continue;
      lines.push(
        `  · ${tr.fromCutId} → [${tr.bridgeCutId}: ${CAMERA_SHOT_KIND_LABELS_KO[tr.bridgeShotKind]}] → ${tr.toCutId}`,
      );
    }
  }

  if (audit.violations.length > 0) {
    lines.push("- 적발 내역:");
    for (let i = 0; i < audit.violations.length; i += 1) {
      const v = audit.violations[i];
      if (!v) continue;
      lines.push(`  · [${VIOLATION_KIND_LABELS_KO[v.kind]}] ${v.summaryKo}`);
    }
  }

  lines.push("- 연출 감독 수정 권고:");
  for (let i = 0; i < audit.remediationHintsKo.length; i += 1) {
    const hint = audit.remediationHintsKo[i];
    if (hint) {
      lines.push(`  · ${hint}`);
    }
  }

  return lines.join("\n");
}
