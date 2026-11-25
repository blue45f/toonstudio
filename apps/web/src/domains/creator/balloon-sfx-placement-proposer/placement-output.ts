import { DEFAULT_CUT_WIDTH, DEFAULT_CUT_HEIGHT, PROPOSER_SCHEMA_VERSION, clampSafeMargin, type CutPresetId, type ProtectedZone, type BalloonSfxRecommendationBundle, type PlacementSessionState, type RectBox, type BalloonStyle, type SfxAccentStyle, type BalloonSfxLayoutProposal } from "./balloon-sfx-placement-engine";
import { assertPlacementExport, assertPlacementJson } from "./placement-input-contract";

function escapeXml(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function isFaceCritical(zone: ProtectedZone): boolean { return zone.kind === "face" || zone.kind === "eyes"; }

export function exportLayoutProposalJson(payload: {
  readonly presetId: CutPresetId; readonly safeMargin: number; readonly protectedZones: readonly ProtectedZone[];
  readonly bundle: BalloonSfxRecommendationBundle; readonly session: PlacementSessionState;
}): string {
  assertPlacementJson(payload);
  return JSON.stringify({
    dataSourceKind: "coordinate-example", imageAnalyzed: false, artworkChanged: false, persisted: false,
    sourceDialogues: payload.bundle.sourceDialogues ?? [],
    schema: PROPOSER_SCHEMA_VERSION,
    presetId: payload.presetId,
    canvas: { width: payload.bundle.canvasWidth, height: payload.bundle.canvasHeight, safeMargin: payload.safeMargin },
    negativeSpaceSummary: { cols: payload.bundle.grid.cols, rows: payload.bundle.grid.rows, averageScore: payload.bundle.grid.averageScore, openCellRatio: payload.bundle.grid.openCellRatio },
    protectedZones: payload.protectedZones,
    session: { status: payload.session.status, appliedProposalId: payload.session.appliedProposalId, previewingProposalId: payload.session.previewingProposalId, canRevert: payload.session.canRevert, revision: payload.session.revision, current: payload.session.current, baseline: payload.session.baseline },
    topProposals: payload.bundle.proposals,
  }, null, 2);
}

/** 말풍선 외곽선 SVG path 문자열을 스타일별로 생성한다. */
export function buildBalloonOutlinePath(box: RectBox, style: BalloonStyle): string {
  assertPlacementExport({ box, style });
  const { x, y, width, height } = box;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  if (style === "shout-burst") {
    const pts: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const mul = i % 2 === 0 ? 1.04 : 0.86;
      pts.push(`${Math.round(cx + Math.cos(a) * rx * mul)} ${Math.round(cy + Math.sin(a) * ry * mul)}`);
    }
    return `M ${pts.join(" L ")} Z`;
  }
  if (style === "tension-jagged") {
    return `M ${Math.round(x + 10)} ${Math.round(y)} L ${Math.round(x + width - 4)} ${Math.round(y + 5)} L ${Math.round(x + width)} ${Math.round(y + height - 10)} L ${Math.round(x + 6)} ${Math.round(y + height)} Z`;
  }
  if (style === "thought-cloud") {
    const segs: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a0 = (i / 10) * Math.PI * 2;
      const aMid = ((i + 0.5) / 10) * Math.PI * 2;
      const a1 = ((i + 1) / 10) * Math.PI * 2;
      segs.push(
        `${i === 0 ? `M ${Math.round(cx + Math.cos(a0) * rx * 0.92)} ${Math.round(cy + Math.sin(a0) * ry * 0.9)} ` : ""}Q ${Math.round(cx + Math.cos(aMid) * rx * 1.07)} ${Math.round(cy + Math.sin(aMid) * ry * 1.08)} ${Math.round(cx + Math.cos(a1) * rx * 0.92)} ${Math.round(cy + Math.sin(a1) * ry * 0.9)}`,
      );
    }
    return `${segs.join(" ")} Z`;
  }
  const r = Math.round(Math.min(rx, ry, 34));
  return `M ${Math.round(x + r)} ${Math.round(y)} H ${Math.round(x + width - r)} Q ${Math.round(x + width)} ${Math.round(y)} ${Math.round(x + width)} ${Math.round(y + r)} V ${Math.round(y + height - r)} Q ${Math.round(x + width)} ${Math.round(y + height)} ${Math.round(x + width - r)} ${Math.round(y + height)} H ${Math.round(x + r)} Q ${Math.round(x)} ${Math.round(y + height)} ${Math.round(x)} ${Math.round(y + height - r)} V ${Math.round(y + r)} Q ${Math.round(x)} ${Math.round(y)} ${Math.round(x + r)} ${Math.round(y)} Z`;
}

/** 제안 배치안을 oklch/currentColor 전용 독립 800×1200 SVG 문자열로 내보낸다. */
export function exportLayoutProposalSvg(input: {
  readonly canvasWidth?: number; readonly canvasHeight?: number; readonly safeMargin: number;
  readonly protectedZones: readonly ProtectedZone[]; readonly proposal: BalloonSfxLayoutProposal | null; readonly showProtectedZones?: boolean;
}): string {
  assertPlacementExport(input);
  const w = input.canvasWidth ?? DEFAULT_CUT_WIDTH;
  const h = input.canvasHeight ?? DEFAULT_CUT_HEIGHT;
  const m = clampSafeMargin(input.safeMargin);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `  <rect x="0" y="0" width="${w}" height="${h}" fill="oklch(0.97 0.008 82)" stroke="oklch(0.32 0.015 55)" stroke-width="4" />`,
    `  <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="oklch(0.55 0.09 224 / 0.45)" stroke-dasharray="10 8" stroke-width="2" />`,
  ];

  if (input.showProtectedZones ?? true) {
    for (const zone of input.protectedZones) {
      const stroke = isFaceCritical(zone) ? "oklch(0.58 0.17 28)" : "oklch(0.64 0.13 72)";
      const fill = isFaceCritical(zone) ? "oklch(0.58 0.17 28 / 0.08)" : "oklch(0.64 0.13 72 / 0.08)";
      lines.push(
        `  <rect x="${zone.box.x}" y="${zone.box.y}" width="${zone.box.width}" height="${zone.box.height}" rx="10" fill="${fill}" stroke="${stroke}" stroke-dasharray="8 6" stroke-width="2.2" />`,
        `  <text x="${zone.box.x + 8}" y="${zone.box.y + 20}" fill="${stroke}" font-size="14" font-weight="600">${escapeXml(zone.labelKo)}</text>`,
      );
    }
  }

  if (input.proposal) {
    const sfxColorMap: Readonly<Record<SfxAccentStyle, string>> = {
      impact: "oklch(0.54 0.19 26)", pulse: "oklch(0.58 0.17 16)", whisper: "oklch(0.46 0.11 224)", tension: "oklch(0.28 0.03 55)",
    };
    for (const b of input.proposal.balloons) {
      const dash = b.style === "whisper-dashed" ? ' stroke-dasharray="8 6"' : "";
      if (b.tailStyle === "thought-dots") {
        lines.push(
          `  <circle cx="${Math.round((b.tailOriginX * 2 + b.tailTipX) / 3)}" cy="${Math.round((b.tailOriginY * 2 + b.tailTipY) / 3)}" r="8" fill="oklch(0.99 0.004 82)" stroke="oklch(0.24 0.015 55)" stroke-width="2.4" />`,
          `  <circle cx="${Math.round((b.tailOriginX + b.tailTipX * 2) / 3)}" cy="${Math.round((b.tailOriginY + b.tailTipY * 2) / 3)}" r="5" fill="oklch(0.99 0.004 82)" stroke="oklch(0.24 0.015 55)" stroke-width="2.2" />`,
        );
      } else {
        lines.push(`  <polygon points="${b.tailBaseLeftX},${b.tailBaseLeftY} ${b.tailTipX},${b.tailTipY} ${b.tailBaseRightX},${b.tailBaseRightY}" fill="oklch(0.99 0.004 82)" stroke="oklch(0.24 0.015 55)" stroke-width="2.5" stroke-linejoin="round" />`);
      }
      lines.push(
        `  <path d="${buildBalloonOutlinePath(b.box, b.style)}" fill="oklch(0.99 0.004 82)" stroke="oklch(0.24 0.015 55)" stroke-width="2.8"${dash} />`,
        `  <circle cx="${b.box.x + 18}" cy="${b.box.y + 18}" r="14" fill="oklch(0.54 0.14 246)" />`,
        `  <text x="${b.box.x + 18}" y="${b.box.y + 23}" text-anchor="middle" fill="oklch(0.98 0.005 82)" font-size="14" font-weight="700">${b.order}</text>`,
        `  <text x="${Math.round(b.box.x + b.box.width / 2)}" y="${Math.round(b.box.y + b.box.height / 2 + 5)}" text-anchor="middle" fill="oklch(0.22 0.015 55)" font-size="18" font-weight="600">${escapeXml(b.text)}</text>`,
      );
    }
    const sfx = input.proposal.sfx;
    lines.push(
      `  <g transform="translate(${sfx.centerX}, ${sfx.centerY}) rotate(${sfx.rotationDeg})">`,
      `    <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${sfxColorMap[sfx.accentStyle]}" stroke="oklch(0.98 0.005 82)" stroke-width="6" paint-order="stroke" font-size="${sfx.fontSize}" font-weight="900">${escapeXml(sfx.text)}</text>`,
      "  </g>",
    );
  }
  lines.push("</svg>");
  return lines.join("\n");
}
