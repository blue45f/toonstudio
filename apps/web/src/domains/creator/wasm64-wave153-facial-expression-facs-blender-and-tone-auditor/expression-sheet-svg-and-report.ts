/**
 * Wave 153 — 순수 OKLCH 캐릭터 표정 시트(Expression Sheet) SVG 렌더러
 * 및 한국어 스튜디오 표정 연출 QA 브리프 생성기.
 *
 * - 모든 색상은 순수 `oklch(...)`만 사용한다(원시 hex, rgb, hsl 금지).
 * - 모든 외부 텍스트에 엄격한 XML/XSS 이스케이프를 적용한다.
 * - 번역투 없는 실무 한국어로 표정 연출 점검 요약을 작성한다.
 */

import {
  FACS_ACTION_UNIT_IDS,
  FACS_AU_METADATA,
  WEBTOON_EMOTION_PRESETS,
  type FacsActionUnitId,
} from "./facs-expression-types-and-presets";
import type {
  AuditedPanelExpressionReport,
  DialogueBubbleStyle,
  EpisodeExpressionAuditResult,
} from "./expression-dialogue-tone-auditor";

export interface FacialExpressionSheetSvgOptions {
  readonly columns?: number;
  readonly tileWidthPx?: number;
  readonly tileHeightPx?: number;
  readonly showTopAuBars?: number;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.012 155)",
  faceCanvasBg: "oklch(0.968 0.008 88)",
  skinFill: "oklch(0.938 0.026 70)",
  skinStroke: "oklch(0.32 0.032 62)",
  inkPrimary: "oklch(0.21 0.024 160)",
  inkMuted: "oklch(0.45 0.022 160)",
  inkInverse: "oklch(0.985 0.004 90)",
  borderSoft: "oklch(0.84 0.012 90)",
  borderStrong: "oklch(0.32 0.04 160)",
  eyeSclera: "oklch(0.995 0.002 90)",
  eyePupil: "oklch(0.2 0.03 250)",
  mouthCavity: "oklch(0.42 0.12 22)",
  mouthLipStroke: "oklch(0.36 0.06 28)",
  blushFill: "oklch(0.76 0.14 18 / 0.52)",
  sweatFill: "oklch(0.78 0.09 230 / 0.85)",
  sweatStroke: "oklch(0.48 0.12 235)",
  angerVeinStroke: "oklch(0.54 0.21 25)",
  tearFill: "oklch(0.82 0.08 228 / 0.82)",
  shadowOverEyesFill: "oklch(0.24 0.03 255 / 0.42)",
  sparkleFill: "oklch(0.98 0.04 95)",
  barTrack: "oklch(0.92 0.008 90)",
  barFillOk: "oklch(0.44 0.11 155)",
  barFillWarn: "oklch(0.6 0.15 74)",
  barFillBlocker: "oklch(0.52 0.2 26)",
  badgePassBg: "oklch(0.41 0.11 155)",
  badgeWarnBg: "oklch(0.57 0.15 74)",
  badgeBlockerBg: "oklch(0.51 0.21 26)",
  badgeIronyBg: "oklch(0.45 0.1 250)",
  bubbleBg: "oklch(0.975 0.006 90)",
} as const;

const BUBBLE_STYLE_LABELS_KO: Readonly<Record<DialogueBubbleStyle, string>> = {
  "shout-jagged": "외침 말풍선",
  "whisper-dashed": "속삭임 말풍선",
  "oval-normal": "일반 말풍선",
  "thought-cloud": "속마음 말풍선",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * SVG 텍스트와 속성에 들어가는 XML/HTML 특수문자를 안전하게 이스케이프한다.
 */
export function escapeExpressionXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function mapFaceX(ox: number, size: number, nx: number): number {
  return ox + nx * size;
}

function mapFaceY(oy: number, size: number, ny: number): number {
  return oy + ny * size;
}

function renderFaceIllustrationSvg(
  panel: AuditedPanelExpressionReport,
  ox: number,
  oy: number,
  size: number,
): string {
  const lm = panel.landmarks;
  const fx = panel.fx;
  const parts: string[] = [];

  parts.push(
    `<rect x="${fmt(ox)}" y="${fmt(oy)}" width="${fmt(size)}" height="${fmt(size)}" rx="12" fill="${OKLCH_PALETTE.faceCanvasBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
  );

  // 얼굴 외곽 타원
  const cx = mapFaceX(ox, size, 0.5);
  const cy = mapFaceY(oy, size, 0.51);
  parts.push(
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(size * 0.36)}" ry="${fmt(size * 0.42)}" fill="${OKLCH_PALETTE.skinFill}" stroke="${OKLCH_PALETTE.skinStroke}" stroke-width="2"/>`,
  );

  // 눈 위 그늘 (shadowOverEyes)
  if (fx.shadowOverEyes > 0.05) {
    const shadeH = size * (0.14 + 0.14 * fx.shadowOverEyes);
    parts.push(
      `<rect data-fx="shadow-over-eyes" x="${fmt(ox + size * 0.16)}" y="${fmt(oy + size * 0.27)}" width="${fmt(size * 0.68)}" height="${fmt(shadeH)}" rx="10" fill="${OKLCH_PALETTE.shadowOverEyesFill}" opacity="${fmt(Math.min(0.95, 0.3 + fx.shadowOverEyes * 0.65))}"/>`,
    );
  }

  // 홍조 마커 (blushIntensity)
  if (fx.blushIntensity > 0.05) {
    const blushOp = Math.min(0.95, 0.25 + fx.blushIntensity * 0.7);
    parts.push(
      `<ellipse data-fx="blush-left" cx="${fmt(mapFaceX(ox, size, 0.31))}" cy="${fmt(mapFaceY(oy, size, 0.56))}" rx="${fmt(size * 0.075)}" ry="${fmt(size * 0.036)}" fill="${OKLCH_PALETTE.blushFill}" opacity="${fmt(blushOp)}"/>`,
    );
    parts.push(
      `<ellipse data-fx="blush-right" cx="${fmt(mapFaceX(ox, size, 0.69))}" cy="${fmt(mapFaceY(oy, size, 0.56))}" rx="${fmt(size * 0.075)}" ry="${fmt(size * 0.036)}" fill="${OKLCH_PALETTE.blushFill}" opacity="${fmt(blushOp)}"/>`,
    );
  }

  // 좌·우 눈썹 3점 곡선
  const renderBrow = (
    pts: readonly [{ readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }],
  ): string => {
    const x0 = fmt(mapFaceX(ox, size, pts[0].x));
    const y0 = fmt(mapFaceY(oy, size, pts[0].y));
    const x1 = fmt(mapFaceX(ox, size, pts[1].x));
    const y1 = fmt(mapFaceY(oy, size, pts[1].y));
    const x2 = fmt(mapFaceX(ox, size, pts[2].x));
    const y2 = fmt(mapFaceY(oy, size, pts[2].y));
    return `<path d="M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2}" fill="none" stroke="${OKLCH_PALETTE.inkPrimary}" stroke-width="3" stroke-linecap="round"/>`;
  };
  parts.push(renderBrow(lm.leftBrow));
  parts.push(renderBrow(lm.rightBrow));

  // 좌·우 눈 + 동공 + 눈물 + 반짝임
  const renderEye = (eye: typeof lm.leftEye, side: "left" | "right"): string => {
    const u0x = fmt(mapFaceX(ox, size, eye.upperLid[0].x));
    const u0y = fmt(mapFaceY(oy, size, eye.upperLid[0].y));
    const u1x = fmt(mapFaceX(ox, size, eye.upperLid[1].x));
    const u1y = fmt(mapFaceY(oy, size, eye.upperLid[1].y));
    const u2x = fmt(mapFaceX(ox, size, eye.upperLid[2].x));
    const u2y = fmt(mapFaceY(oy, size, eye.upperLid[2].y));
    const l1x = fmt(mapFaceX(ox, size, eye.lowerLid[1].x));
    const l1y = fmt(mapFaceY(oy, size, eye.lowerLid[1].y));
    const eyeParts: string[] = [];

    if (eye.openHeight <= 0.012) {
      eyeParts.push(
        `<path d="M ${u0x} ${u0y} Q ${u1x} ${u1y} ${u2x} ${u2y}" fill="none" stroke="${OKLCH_PALETTE.inkPrimary}" stroke-width="2.4" stroke-linecap="round"/>`,
      );
    } else {
      eyeParts.push(
        `<path d="M ${u0x} ${u0y} Q ${u1x} ${u1y} ${u2x} ${u2y} Q ${l1x} ${l1y} ${u0x} ${u0y} Z" fill="${OKLCH_PALETTE.eyeSclera}" stroke="${OKLCH_PALETTE.inkPrimary}" stroke-width="1.8"/>`,
      );
      const px = mapFaceX(ox, size, eye.center.x);
      const py = mapFaceY(oy, size, eye.center.y);
      const pr = Math.min(eye.pupilRadius * size, eye.openHeight * size * 0.44);
      eyeParts.push(
        `<circle cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(Math.max(1.5, pr))}" fill="${OKLCH_PALETTE.eyePupil}"/>`,
      );
      if (fx.sparkleEyes) {
        eyeParts.push(
          `<circle data-fx="sparkle-${side}" cx="${fmt(px - pr * 0.35)}" cy="${fmt(py - pr * 0.35)}" r="${fmt(Math.max(1.2, pr * 0.38))}" fill="${OKLCH_PALETTE.sparkleFill}"/>`,
        );
      }
    }

    if (fx.tearPool > 0.1) {
      const tx = mapFaceX(ox, size, eye.center.x + (side === "left" ? -0.025 : 0.025));
      const ty = mapFaceY(oy, size, eye.lowerLid[1].y + 0.028);
      const tr = size * (0.018 + 0.016 * fx.tearPool);
      eyeParts.push(
        `<circle data-fx="tear-${side}" cx="${fmt(tx)}" cy="${fmt(ty)}" r="${fmt(tr)}" fill="${OKLCH_PALETTE.tearFill}"/>`,
      );
    }

    return eyeParts.join("");
  };

  parts.push(renderEye(lm.leftEye, "left"));
  parts.push(renderEye(lm.rightEye, "right"));

  // 코 + 콧등 주름
  const nx = mapFaceX(ox, size, lm.noseTip.x);
  const ny = mapFaceY(oy, size, lm.noseTip.y);
  parts.push(
    `<path d="M ${fmt(nx - 3)} ${fmt(ny - 5)} L ${fmt(nx)} ${fmt(ny)} L ${fmt(nx + 3)} ${fmt(ny - 2)}" fill="none" stroke="${OKLCH_PALETTE.skinStroke}" stroke-width="1.5" stroke-linecap="round"/>`,
  );
  if (lm.noseWrinkleStrength > 0.25) {
    parts.push(
      `<line x1="${fmt(nx - 7)}" y1="${fmt(ny - 12)}" x2="${fmt(nx + 7)}" y2="${fmt(ny - 12)}" stroke="${OKLCH_PALETTE.skinStroke}" stroke-width="1.3"/>`,
    );
  }

  // 입술 6점 외곽 폴리곤
  const mouthPts: string[] = [];
  for (let i = 0; i < lm.mouthOuter.length; i += 1) {
    const pt = lm.mouthOuter[i];
    if (pt === undefined) continue;
    mouthPts.push(`${fmt(mapFaceX(ox, size, pt.x))},${fmt(mapFaceY(oy, size, pt.y))}`);
  }
  const mouthFill =
    lm.mouthInnerOpeningHeight >= 0.016 ? OKLCH_PALETTE.mouthCavity : "none";
  parts.push(
    `<polygon points="${mouthPts.join(" ")}" fill="${mouthFill}" stroke="${OKLCH_PALETTE.mouthLipStroke}" stroke-width="2" stroke-linejoin="round"/>`,
  );

  // 식은땀 마커 (sweatDrop)
  if (fx.sweatDrop) {
    const sx = mapFaceX(ox, size, 0.8);
    const sy = mapFaceY(oy, size, 0.27);
    parts.push(
      `<path data-fx="sweat-drop" d="M ${fmt(sx)} ${fmt(sy - 9)} C ${fmt(sx + 6)} ${fmt(sy)} ${fmt(sx + 5)} ${fmt(sy + 8)} ${fmt(sx)} ${fmt(sy + 8)} C ${fmt(sx - 5)} ${fmt(sy + 8)} ${fmt(sx - 6)} ${fmt(sy)} ${fmt(sx)} ${fmt(sy - 9)} Z" fill="${OKLCH_PALETTE.sweatFill}" stroke="${OKLCH_PALETTE.sweatStroke}" stroke-width="1.3"/>`,
    );
  }

  // 분노 힘줄 마커 (angerVein)
  if (fx.angerVein) {
    const vx = mapFaceX(ox, size, 0.74);
    const vy = mapFaceY(oy, size, 0.2);
    parts.push(
      `<path data-fx="anger-vein" d="M ${fmt(vx - 6)} ${fmt(vy - 6)} L ${fmt(vx - 2)} ${fmt(vy - 2)} L ${fmt(vx - 6)} ${fmt(vy + 2)} M ${fmt(vx + 6)} ${fmt(vy - 6)} L ${fmt(vx + 2)} ${fmt(vy - 2)} L ${fmt(vx + 6)} ${fmt(vy + 2)}" fill="none" stroke="${OKLCH_PALETTE.angerVeinStroke}" stroke-width="2" stroke-linecap="round"/>`,
    );
  }

  return parts.join("\n");
}

function getTopActiveAus(
  panel: AuditedPanelExpressionReport,
  limit: number,
): ReadonlyArray<{ readonly id: FacsActionUnitId; readonly value: number }> {
  const entries: Array<{ readonly id: FacsActionUnitId; readonly value: number }> = [];
  for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
    const id = FACS_ACTION_UNIT_IDS[i];
    if (id === undefined) continue;
    const value = panel.au[id];
    if (value > 0.01) {
      entries.push({ id, value });
    }
  }
  entries.sort((a, b) => (b.value !== a.value ? b.value - a.value : a.id.localeCompare(b.id)));
  return entries.slice(0, limit);
}

function resolveStatusBadge(panel: AuditedPanelExpressionReport): {
  readonly labelKo: string;
  readonly fill: string;
} {
  let hasBlocker = false;
  let hasWarning = false;
  for (let i = 0; i < panel.defects.length; i += 1) {
    const d = panel.defects[i];
    if (d === undefined) continue;
    if (d.severity === "blocker") hasBlocker = true;
    else hasWarning = true;
  }
  if (hasBlocker) {
    return { labelKo: "수정 필요", fill: OKLCH_PALETTE.badgeBlockerBg };
  }
  if (hasWarning) {
    return { labelKo: "주의", fill: OKLCH_PALETTE.badgeWarnBg };
  }
  if (panel.intentionalIronyApplied) {
    return { labelKo: "의도적 반어", fill: OKLCH_PALETTE.badgeIronyBg };
  }
  return { labelKo: "톤 일치", fill: OKLCH_PALETTE.badgePassBg };
}

/**
 * 감사 결과와 2D 랜드마크를 기반으로 순수 OKLCH 캐릭터 표정 시트 SVG를 생성한다.
 */
export function renderFacialExpressionSheetSvg(
  audit: EpisodeExpressionAuditResult,
  options?: FacialExpressionSheetSvgOptions,
): string {
  const columns = Math.max(1, Math.min(4, Math.floor(options?.columns ?? 2)));
  const tileW = Math.max(280, Math.floor(options?.tileWidthPx ?? 380));
  const tileH = Math.max(220, Math.floor(options?.tileHeightPx ?? 248));
  const maxBars = Math.max(1, Math.min(6, Math.floor(options?.showTopAuBars ?? 5)));

  const pad = 20;
  const gap = 16;
  const headerH = 74;
  const count = audit.panelReports.length;
  const rows = Math.max(1, Math.ceil(count / columns));
  const width = pad * 2 + columns * tileW + (columns - 1) * gap;
  const height = headerH + pad * 2 + rows * tileH + (rows - 1) * gap;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" role="img" aria-label="${escapeExpressionXml(audit.episodeTitleKo)}">`,
  );
  lines.push(
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="${OKLCH_PALETTE.paperBg}"/>`,
  );

  // 상단 요약 헤더
  lines.push(
    `<rect x="${fmt(pad)}" y="${fmt(pad)}" width="${fmt(width - pad * 2)}" height="${fmt(headerH - 12)}" rx="14" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
  );
  lines.push(
    `<text x="${fmt(pad + 18)}" y="${fmt(pad + 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeExpressionXml(audit.episodeTitleKo)}</text>`,
  );
  const metaLine = `총 ${count}컷 · 일치 점수 ${audit.overallAlignmentScore}점 · 차단 ${audit.blockerCount}건 · 주의 ${audit.warningCount}건 · SHA-256 ${audit.expressionSheetSha256Hex.slice(0, 12)}`;
  lines.push(
    `<text x="${fmt(pad + 18)}" y="${fmt(pad + 47)}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkMuted}">${escapeExpressionXml(metaLine)}</text>`,
  );

  // 각 컷 표정 타일 렌더링
  for (let i = 0; i < count; i += 1) {
    const panel = audit.panelReports[i];
    if (panel === undefined) continue;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const tx = pad + col * (tileW + gap);
    const ty = headerH + pad + row * (tileH + gap);

    const badge = resolveStatusBadge(panel);
    const intentLabel = WEBTOON_EMOTION_PRESETS[panel.dialogueEmotionIntent].labelKo;
    const bubbleLabel = BUBBLE_STYLE_LABELS_KO[panel.bubbleStyle];

    lines.push(
      `<g data-panel-id="${escapeExpressionXml(panel.panelId)}">`,
    );
    lines.push(
      `<rect x="${fmt(tx)}" y="${fmt(ty)}" width="${fmt(tileW)}" height="${fmt(tileH)}" rx="14" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2"/>`,
    );

    // 타일 제목 및 상태 배지
    const headerTitle = `#${panel.panelIndex} ${truncateText(panel.characterNameKo, 16)}`;
    lines.push(
      `<text x="${fmt(tx + 14)}" y="${fmt(ty + 24)}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeExpressionXml(headerTitle)}</text>`,
    );
    lines.push(
      `<rect x="${fmt(tx + tileW - 88)}" y="${fmt(ty + 10)}" width="74" height="20" rx="10" fill="${badge.fill}"/>`,
    );
    lines.push(
      `<text x="${fmt(tx + tileW - 51)}" y="${fmt(ty + 24)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.inkInverse}">${escapeExpressionXml(badge.labelKo)}</text>`,
    );

    // 좌측 2D 랜드마크 얼굴 일러스트
    const faceSize = 136;
    lines.push(renderFaceIllustrationSvg(panel, tx + 14, ty + 36, faceSize));

    // 우측 상위 활성 FACS AU 막대 그래프
    const barX = tx + faceSize + 28;
    const barMaxW = tileW - faceSize - 44;
    const topAus = getTopActiveAus(panel, maxBars);
    lines.push(
      `<text x="${fmt(barX)}" y="${fmt(ty + 48)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.inkMuted}">${escapeExpressionXml(`의도: ${intentLabel} · ${bubbleLabel}`)}</text>`,
    );

    if (topAus.length === 0) {
      lines.push(
        `<text x="${fmt(barX)}" y="${fmt(ty + 74)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">활성 AU 없음 (중립 무표정)</text>`,
      );
    } else {
      for (let b = 0; b < topAus.length; b += 1) {
        const entry = topAus[b];
        if (entry === undefined) continue;
        const meta = FACS_AU_METADATA[entry.id];
        const by = ty + 60 + b * 22;
        const barFill =
          panel.defects.some((d) => d.severity === "blocker")
            ? OKLCH_PALETTE.barFillBlocker
            : panel.defects.length > 0
              ? OKLCH_PALETTE.barFillWarn
              : OKLCH_PALETTE.barFillOk;

        lines.push(
          `<text x="${fmt(barX)}" y="${fmt(by + 9)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_PALETTE.inkPrimary}">${escapeExpressionXml(`${meta.code} ${truncateText(meta.labelKo, 9)}`)}</text>`,
        );
        lines.push(
          `<text x="${fmt(barX + barMaxW)}" y="${fmt(by + 9)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">${fmt(entry.value)}</text>`,
        );
        lines.push(
          `<rect x="${fmt(barX)}" y="${fmt(by + 12)}" width="${fmt(barMaxW)}" height="5" rx="2.5" fill="${OKLCH_PALETTE.barTrack}"/>`,
        );
        lines.push(
          `<rect x="${fmt(barX)}" y="${fmt(by + 12)}" width="${fmt(Math.max(2, barMaxW * entry.value))}" height="5" rx="2.5" fill="${barFill}"/>`,
        );
      }
    }

    // 하단 대사 말풍선 요약 바
    const quoteY = ty + faceSize + 48;
    lines.push(
      `<rect x="${fmt(tx + 14)}" y="${fmt(quoteY)}" width="${fmt(tileW - 28)}" height="46" rx="10" fill="${OKLCH_PALETTE.bubbleBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1"/>`,
    );
    lines.push(
      `<text x="${fmt(tx + 24)}" y="${fmt(quoteY + 19)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">${escapeExpressionXml(`“${truncateText(panel.dialogueText, 34)}”`)}</text>`,
    );
    const subNote =
      panel.defects.length > 0
        ? truncateText(panel.defects[0]?.messageKo ?? "", 40)
        : `일치 ${panel.alignmentScore}점 · ${panel.smileAnalysis.summaryKo}`;
    lines.push(
      `<text x="${fmt(tx + 24)}" y="${fmt(quoteY + 36)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">${escapeExpressionXml(truncateText(subNote, 42))}</text>`,
    );

    lines.push("</g>");
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 번역투 없는 실무 한국어로 에피소드 표정·대사 일관성 감사 브리프를 생성한다.
 */
export function summarizeExpressionAuditKo(audit: EpisodeExpressionAuditResult): string {
  const out: string[] = [];
  out.push(`□ ${audit.episodeTitleKo} — 표정 연출 QA 요약`);
  out.push(
    `ㅇ 전체 판정: ${audit.passed ? "통과 (결함 0건)" : `수정 필요 (차단 ${audit.blockerCount}건, 주의 ${audit.warningCount}건)`}`,
  );
  out.push(
    `ㅇ 점검 규모: 총 ${audit.panelReports.length}컷 · 평균 일치 점수 ${audit.overallAlignmentScore}점 · 의도적 반어 허용 ${audit.intentionalIronyExemptionCount}컷`,
  );
  out.push(`ㅇ 매니페스트 지문(SHA-256): ${audit.expressionSheetSha256Hex.slice(0, 16)}`);

  if (audit.defects.length === 0) {
    out.push("- 대사 감정과 캐릭터 FACS 표정이 모든 컷에서 자연스럽게 맞물렸습니다.");
    return out.join("\n");
  }

  out.push("ㅇ 적발 결함 및 수정 지침");
  for (let i = 0; i < audit.defects.length; i += 1) {
    const defect = audit.defects[i];
    if (defect === undefined) continue;
    const tag = defect.severity === "blocker" ? "[차단]" : "[주의]";
    out.push(`- ${tag} 컷 ${defect.panelId} (${defect.characterId}): ${defect.messageKo}`);
  }

  return out.join("\n");
}
