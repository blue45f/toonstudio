import { PIGMENT_ROLE_IDS, PIGMENT_ROLE_LABELS, VIOLET_SLOP_HUE_MIN, VIOLET_SLOP_HUE_MAX, formatOklch, oklchToLinearSrgb, oklchToSrgb255, type ChromaticBalanceAuditReport, type BuildEditorialPosterSvgOptions, type SrgbChannelValues } from "./editorial-moodboard-engine";
import { assertMoodboardExport, assertPosterText } from "./moodboard-input-contract";

const escapeXml = (raw: string): string =>
  raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** 순수 시맨틱 SVG 매거진 포스터 프리뷰를 생성한다(oklch 및 currentColor 전용). */
export function buildEditorialPosterSvg(audit: ChromaticBalanceAuditReport, options?: BuildEditorialPosterSvgOptions): string {
  assertMoodboardExport(audit);
  const isEn = options?.locale === "en";
  const p = audit.resolvedPigments;
  const [groundCss, surfaceCss, inkCss, domainCss, accentCss, onAccentCss] = [
    formatOklch(p.ground.color), formatOklch(p.surface.color), formatOklch(p.ink.color),
    formatOklch(p.domain.color), formatOklch(p.accent.color), formatOklch(audit.resolvedOnAccent),
  ];
  const headline = assertPosterText(options?.headline ?? (isEn ? audit.preset.posterHeadlineEn : audit.preset.posterHeadlineKo));
  const subtitle = assertPosterText(options?.subtitle ?? (isEn ? audit.preset.posterTaglineEn : audit.preset.posterTaglineKo));
  const issueLabel = assertPosterText(options?.issueLabel ?? `${audit.preset.code} · 85/10/5 ATELIER`);
  const neutralW = Math.max(12, Math.round((364 * audit.ratio.normalized.neutralPct) / 100));
  const domainW = Math.max(6, Math.round((364 * audit.ratio.normalized.domainPct) / 100));
  const accentW = Math.max(6, 364 - neutralW - domainW);
  const violetBadge = audit.isVioletFree ? (isEn ? "VIOLET 0%" : "바이올렛 0%") : (isEn ? `VIOLET ${audit.violetSlopPct}%` : `슬롭 ${audit.violetSlopPct}%`);
  const wcagBadge = `WCAG ${audit.minWcagRatio.toFixed(1)}:1 · Lc ${Math.round(audit.minApcaAbsLc)}`;

  const swatchNodes = PIGMENT_ROLE_IDS.map((role, index) => {
    const x = 28 + index * 74;
    const spec = p[role];
    const label = isEn ? PIGMENT_ROLE_LABELS[role].en : spec.nameKo;
    return [
      `  <g data-pigment-swatch="${role}">`,
      `    <rect x="${x}" y="476" width="68" height="34" rx="5" fill="${formatOklch(spec.color)}" stroke="currentColor" stroke-opacity="0.24" stroke-width="1" />`,
      `    <text x="${x + 4}" y="523" fill="currentColor" font-size="8.5" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(label.slice(0, 10))}</text>`,
      `    <text x="${x + 4}" y="535" fill="currentColor" fill-opacity="0.68" font-size="7.5" font-family="monospace">${escapeXml(`H${Math.round(spec.color.h)}° L${spec.color.l.toFixed(2)}`)}</text>`,
      "  </g>",
    ].join("\n");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560" width="420" height="560" role="img" aria-label="${escapeXml(`${headline} ${audit.preset.nameKo}`)}" data-preset="${audit.preset.id}" data-ratio="${audit.ratio.normalized.neutralPct}/${audit.ratio.normalized.domainPct}/${audit.ratio.normalized.accentPct}" data-violet-free="${String(audit.isVioletFree)}" data-min-wcag="${audit.minWcagRatio.toFixed(2)}" data-min-apca="${audit.minApcaAbsLc}" style="color: ${inkCss};">`,
    `  <rect x="0" y="0" width="420" height="560" rx="14" fill="${groundCss}" />`,
    `  <rect x="14" y="14" width="392" height="532" rx="10" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="1" />`,
    `  <line x1="28" y1="54" x2="392" y2="54" stroke="currentColor" stroke-opacity="0.2" stroke-width="1" />`,
    `  <text x="28" y="40" fill="currentColor" font-size="10" font-weight="700" letter-spacing="1.4" font-family="monospace">${escapeXml(issueLabel)}</text>`,
    `  <rect x="298" y="24" width="94" height="22" rx="11" fill="${accentCss}" />`,
    `  <text x="345" y="38.5" text-anchor="middle" fill="${onAccentCss}" font-size="9" font-weight="700" font-family="system-ui, sans-serif">${escapeXml(violetBadge)}</text>`,
    `  <rect x="28" y="72" width="364" height="236" rx="10" fill="${surfaceCss}" stroke="currentColor" stroke-opacity="0.16" stroke-width="1" />`,
    `  <path d="M28 242 L252 130 L392 184 L392 308 L28 308 Z" fill="${domainCss}" fill-opacity="0.88" />`,
    `  <rect x="46" y="92" width="128" height="96" rx="6" fill="${groundCss}" fill-opacity="0.92" stroke="currentColor" stroke-opacity="0.24" stroke-width="1" />`,
    `  <line x1="60" y1="118" x2="154" y2="118" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.2" />`,
    `  <line x1="60" y1="136" x2="136" y2="136" stroke="currentColor" stroke-opacity="0.22" stroke-width="1" />`,
    `  <text x="60" y="168" fill="${domainCss}" font-size="11" font-weight="700" font-family="monospace">${escapeXml(`${Math.round(audit.ratio.normalized.neutralPct)}·${Math.round(audit.ratio.normalized.domainPct)}·${Math.round(audit.ratio.normalized.accentPct)}`)}</text>`,
    `  <circle cx="324" cy="148" r="36" fill="${accentCss}" />`,
    `  <text x="324" y="145" text-anchor="middle" fill="${onAccentCss}" font-size="11" font-weight="800" font-family="monospace">${Math.round(audit.ratio.normalized.accentPct)}%</text>`,
    `  <text x="324" y="160" text-anchor="middle" fill="${onAccentCss}" font-size="8.5" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(isEn ? "SEAL" : "낙관")}</text>`,
    `  <text x="28" y="356" fill="currentColor" font-size="30" font-weight="800" font-family="system-ui, sans-serif">${escapeXml(headline)}</text>`,
    `  <text x="28" y="382" fill="currentColor" fill-opacity="0.78" font-size="12" font-weight="500" font-family="system-ui, sans-serif">${escapeXml(subtitle)}</text>`,
    `  <rect x="28" y="398" width="156" height="22" rx="4" fill="${surfaceCss}" stroke="currentColor" stroke-opacity="0.2" stroke-width="1" />`,
    `  <text x="38" y="413" fill="currentColor" font-size="9.5" font-weight="700" font-family="monospace">${escapeXml(wcagBadge)}</text>`,
    `  <text x="392" y="413" text-anchor="end" fill="${domainCss}" font-size="9.5" font-weight="700" font-family="system-ui, sans-serif">${escapeXml(isEn ? audit.preset.nameEn : audit.preset.nameKo)}</text>`,
    `  <g data-role="ratio-spectrum-bar">`,
    `    <rect x="28" y="438" width="${neutralW}" height="16" rx="4" fill="${surfaceCss}" stroke="currentColor" stroke-opacity="0.3" stroke-width="1" />`,
    `    <rect x="${28 + neutralW}" y="438" width="${domainW}" height="16" fill="${domainCss}" />`,
    `    <rect x="${28 + neutralW + domainW}" y="438" width="${accentW}" height="16" rx="3" fill="${accentCss}" />`,
    `    <text x="28" y="466" fill="currentColor" fill-opacity="0.72" font-size="8.5" font-family="monospace">${escapeXml(`85/10/5 → ${audit.ratio.normalized.neutralPct}% / ${audit.ratio.normalized.domainPct}% / ${audit.ratio.normalized.accentPct}%`)}</text>`,
    "  </g>",
    ...swatchNodes,
    "</svg>",
  ].join("\n");
}

/** OKLCH 전용 CSS 커스텀 프로퍼티(Variables) 블록을 생성한다. */
export function exportPaletteCssVariables(audit: ChromaticBalanceAuditReport): string {
  assertMoodboardExport(audit);
  const p = audit.resolvedPigments;
  return [
    `/* ToonStudio Editorial Moodboard · ${audit.preset.id} (${audit.preset.code}) */`,
    `/* Violet Slop: ${audit.violetSlopPct}% · Min WCAG: ${audit.minWcagRatio.toFixed(2)}:1 · Min APCA Lc: ${audit.minApcaAbsLc} */`,
    `:root[data-editorial-moodboard="${audit.preset.id}"] {`,
    `  --moodboard-ground: ${formatOklch(p.ground.color)};`,
    `  --moodboard-surface: ${formatOklch(p.surface.color)};`,
    `  --moodboard-ink: ${formatOklch(p.ink.color)};`,
    `  --moodboard-domain: ${formatOklch(p.domain.color)};`,
    `  --moodboard-accent: ${formatOklch(p.accent.color)};`,
    `  --moodboard-on-accent: ${formatOklch(audit.resolvedOnAccent)};`,
    `  --moodboard-ratio-neutral: ${audit.ratio.normalized.neutralPct}%;`,
    `  --moodboard-ratio-domain: ${audit.ratio.normalized.domainPct}%;`,
    `  --moodboard-ratio-accent: ${audit.ratio.normalized.accentPct}%;`,
    "}",
  ].join("\n");
}

/** 5안료 스펙트럼 · 85/10/5 감사 · WCAG/APCA 대비 결과를 OKLCH JSON으로 직렬화한다. */
export function exportPaletteOklchJson(audit: ChromaticBalanceAuditReport): string {
  assertMoodboardExport(audit);
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.editorial-moodboard-palette.v1", dataSourceKind: "calculation-example", physicalDisplayMeasured: false,
      preset: { id: audit.preset.id, code: audit.preset.code, nameKo: audit.preset.nameKo, nameEn: audit.preset.nameEn, polarity: audit.preset.polarity },
      ratio: audit.ratio,
      violetExclusion: { excludedHueRangeDeg: [VIOLET_SLOP_HUE_MIN, VIOLET_SLOP_HUE_MAX], isVioletFree: audit.isVioletFree, violetSlopPct: audit.violetSlopPct, violationCount: audit.violetViolations.length },
      pigments: PIGMENT_ROLE_IDS.map((role) => {
        const spec = audit.resolvedPigments[role];
        return { role, nameKo: spec.nameKo, nameEn: spec.nameEn, oklch: formatOklch(spec.color), channels: spec.color, inSrgbGamut: oklchToLinearSrgb(spec.color).inGamut };
      }),
      onAccent: { oklch: formatOklch(audit.resolvedOnAccent), channels: audit.resolvedOnAccent },
      contrast: {
        minWcagRatio: audit.minWcagRatio, minApcaAbsLc: audit.minApcaAbsLc, allPairsPassWcagAa: audit.allPairsPassWcagAa, allPairsPassApca: audit.allPairsPassApca,
        pairs: audit.contrastPairs.map((pair) => ({ pairId: pair.pairId, wcagRatio: pair.wcagRatio, wcagGrade: pair.wcagGrade, apcaLc: pair.apcaLc, passesWcagAa: pair.passesWcagAa, passesApca: pair.passesApca })),
      },
      overallScore: audit.overallScore,
    },
    null,
    2,
  );
}

/** Clip Studio Paint(CSP) 컬러 세트 스와치 매니페스트(OKLCH + 8비트 채널)를 생성한다. */
export function exportPaletteCspSwatch(audit: ChromaticBalanceAuditReport): string {
  assertMoodboardExport(audit);
  const swatches = [
    ...PIGMENT_ROLE_IDS.map((role, index) => {
      const spec = audit.resolvedPigments[role];
      return { index, role, nameKo: spec.nameKo, nameEn: spec.nameEn, oklch: formatOklch(spec.color), channels255: oklchToSrgb255(spec.color) };
    }),
    { index: PIGMENT_ROLE_IDS.length, role: "on-accent", nameKo: "강조 활자", nameEn: "On Accent Ink", oklch: formatOklch(audit.resolvedOnAccent), channels255: oklchToSrgb255(audit.resolvedOnAccent) },
  ];
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.csp-swatch-set.v1", compatibilityVerified: false, format: "csp-slcc-color-set",
      setName: `${audit.preset.code} ${audit.preset.nameKo}`, setNameEn: `${audit.preset.code} ${audit.preset.nameEn}`,
      violetFree: audit.isVioletFree, ratioSpec: `${audit.ratio.normalized.neutralPct}/${audit.ratio.normalized.domainPct}/${audit.ratio.normalized.accentPct}`,
      swatchCount: swatches.length, swatches,
    },
    null,
    2,
  );
}

/** Clip Studio Paint SLCC 헤더 예제 바이너리(실제 CSP 호환성 미검증) 스와치 바이트 시퀀스를 생성한다(BigInt 미사용). */
export function buildCspSwatchBytes(audit: ChromaticBalanceAuditReport): Uint8Array {
  assertMoodboardExport(audit);
  const swatches: readonly { readonly name: string; readonly rgba: SrgbChannelValues }[] = [
    ...PIGMENT_ROLE_IDS.map((role) => ({ name: `${audit.resolvedPigments[role].nameEn} (${role})`, rgba: oklchToSrgb255(audit.resolvedPigments[role].color) })),
    { name: "On Accent Ink (on-accent)", rgba: oklchToSrgb255(audit.resolvedOnAccent) },
  ];
  const encoder = new TextEncoder();
  const titleBytes = encoder.encode(`ToonStudio ${audit.preset.code}`);
  const encodedNames = swatches.map((item) => encoder.encode(item.name));
  const payloadSize = encodedNames.reduce((acc, bytes) => acc + 6 + bytes.length, 0);
  const buffer = new ArrayBuffer(10 + titleBytes.length + payloadSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  out.set([83, 76, 67, 67], 0);
  view.setUint16(4, 1, false);
  view.setUint16(6, swatches.length, false);
  view.setUint16(8, titleBytes.length, false);
  out.set(titleBytes, 10);

  let offset = 10 + titleBytes.length;
  for (let i = 0; i < swatches.length; i += 1) {
    const entry = swatches[i];
    const nameBytes = encodedNames[i];
    if (!entry || !nameBytes) continue;
    out.set([entry.rgba.r, entry.rgba.g, entry.rgba.b, entry.rgba.a], offset);
    view.setUint16(offset + 4, nameBytes.length, false);
    out.set(nameBytes, offset + 6);
    offset += 6 + nameBytes.length;
  }
  return out;
}
