/**
 * Wave 163: FIPS 180-4 SHA-256 결정론 지문, 순수 OKLCH 진단 SVG, 자연스러운 한국어 QA 요약.
 *
 * - 외부 런타임 의존성 없는 순수 ES2017 동기식 SHA-256 (`sha256CelHex`)
 * - 100% `oklch(...)` 팔레트 진단 SVG (원시 색상 표현 전면 배제 + XML 이스케이프)
 * - 아트 디렉터 관점의 자연스러운 한국어 QA 요약
 */

import { clamp01, clampValue, normalizeVec3, wrapHueDeg } from './cel-band-and-specular-kernel';
import {
  CEL_MATERIAL_PRESETS,
  type CelCutConsistencyAudit,
  type CelHarmonizationChange,
  type CelRampConfig,
  type CelWgslValidationResult,
  type OklchColor,
  type PaintedHighlightAnnotation,
  type StylizedMultiLightRig,
} from './cel-shading-types';

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * FIPS 180-4 표준 SHA-256 동기식 16진수 다이제스트 (순수 ES2017).
 */
export function sha256CelHex(input: string): string {
  const bytes = encodeUtf8Bytes(input);
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0x00);
  }

  bytes.push(
    (bitLenHi >>> 24) & 0xff,
    (bitLenHi >>> 16) & 0xff,
    (bitLenHi >>> 8) & 0xff,
    bitLenHi & 0xff,
    (bitLenLo >>> 24) & 0xff,
    (bitLenLo >>> 16) & 0xff,
    (bitLenLo >>> 8) & 0xff,
    bitLenLo & 0xff,
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        ((bytes[idx] << 24) |
          (bytes[idx + 1] << 16) |
          (bytes[idx + 2] << 8) |
          bytes[idx + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  return words.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function fmtNum(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const normalized = Object.is(safe, -0) || Math.abs(safe) < 1e-9 ? 0 : safe;
  return normalized.toFixed(6);
}

export function computeCelLightingFingerprint(
  rig: StylizedMultiLightRig,
  ramp: CelRampConfig,
  annotations: readonly PaintedHighlightAnnotation[],
  wgslSource: string,
): string {
  const canonicalLights = [rig.key, rig.fill, rig.rim, rig.bounce].map((light) => {
    const dir = normalizeVec3(light.direction);
    return {
      id: light.id,
      role: light.role,
      dir: [fmtNum(dir.x), fmtNum(dir.y), fmtNum(dir.z)],
      intensity: fmtNum(light.intensity),
      color: [fmtNum(light.color.l), fmtNum(light.color.c), fmtNum(wrapHueDeg(light.color.h))],
    };
  });

  const viewDir = normalizeVec3(rig.viewDirection);
  const sortedAnnotations = [...annotations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => {
      const normal = normalizeVec3(item.surfaceNormal);
      const hiDir = normalizeVec3(item.paintedHighlightDirection);
      return {
        id: item.id,
        materialId: item.materialId,
        normal: [fmtNum(normal.x), fmtNum(normal.y), fmtNum(normal.z)],
        highlightDir: [fmtNum(hiDir.x), fmtNum(hiDir.y), fmtNum(hiDir.z)],
        base: [fmtNum(item.baseColor.l), fmtNum(item.baseColor.c), fmtNum(wrapHueDeg(item.baseColor.h))],
        shadow: [
          fmtNum(item.paintedShadowColor.l),
          fmtNum(item.paintedShadowColor.c),
          fmtNum(wrapHueDeg(item.paintedShadowColor.h)),
        ],
        metallic: item.metallicOverride === undefined ? null : fmtNum(item.metallicOverride),
        feather:
          item.bandFeatherWidthOverride === undefined
            ? null
            : fmtNum(item.bandFeatherWidthOverride),
      };
    });

  const payload = JSON.stringify({
    wave: 'wave163',
    rigId: rig.id,
    viewDir: [fmtNum(viewDir.x), fmtNum(viewDir.y), fmtNum(viewDir.z)],
    lights: canonicalLights,
    ramp: {
      bandCount: ramp.bandCount,
      terminatorThreshold: fmtNum(ramp.terminatorThreshold),
      midBandThreshold: fmtNum(ramp.midBandThreshold),
      bandFeatherWidth: fmtNum(ramp.bandFeatherWidth),
      shadowHueShiftDeg: fmtNum(ramp.shadowHueShiftDeg),
      shadowChromaPreserveRatio: fmtNum(ramp.shadowChromaPreserveRatio),
    },
    annotations: sortedAnnotations,
    wgslHash: sha256CelHex(wgslSource),
  });

  return sha256CelHex(payload);
}

export function escapeSvgXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatOklchCss(color: OklchColor, alpha?: number): string {
  const l = clamp01(color.l).toFixed(3);
  const c = clampValue(color.c, 0, 0.37).toFixed(3);
  const h = wrapHueDeg(color.h).toFixed(1);
  if (alpha !== undefined) {
    return `oklch(${l} ${c} ${h} / ${clamp01(alpha).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export interface RenderCelAuditSvgParams {
  readonly titleKo: string;
  readonly rig: StylizedMultiLightRig;
  readonly ramp: CelRampConfig;
  readonly beforeAudit: CelCutConsistencyAudit;
  readonly afterAudit: CelCutConsistencyAudit;
  readonly manifestFingerprint: string;
}

/**
 * 순수 `oklch(...)` 팔레트로 2/3-밴드 셀 램프 스와치, 키·림 광원 방향 나침반,
 * 재질 스페큘러 카드 및 보정 전후 결함 통계를 진단 SVG로 렌더링한다.
 */
export function renderCelShadingAuditSvg(params: RenderCelAuditSvgParams): string {
  const { titleKo, rig, ramp, beforeAudit, afterAudit, manifestFingerprint } = params;
  const safeTitle = escapeSvgXml(titleKo);
  const safeCutId = escapeSvgXml(afterAudit.cutId);
  const shortDigest = escapeSvgXml(manifestFingerprint.slice(0, 12));

  const bgCanvas = 'oklch(0.975 0.008 90)';
  const panelSurface = 'oklch(0.952 0.010 88)';
  const cardSurface = 'oklch(0.996 0.003 90)';
  const borderLine = 'oklch(0.84 0.016 145)';
  const inkPrimary = 'oklch(0.24 0.025 160)';
  const inkMuted = 'oklch(0.46 0.022 150)';
  const statusColor =
    afterAudit.status === 'PASS'
      ? 'oklch(0.42 0.11 152)'
      : afterAudit.status === 'WARN'
        ? 'oklch(0.58 0.14 75)'
        : 'oklch(0.52 0.16 26)';
  const statusBg =
    afterAudit.status === 'PASS'
      ? 'oklch(0.92 0.04 152)'
      : afterAudit.status === 'WARN'
        ? 'oklch(0.94 0.05 75)'
        : 'oklch(0.93 0.05 26)';

  const primaryEval = afterAudit.evaluations[0];
  const shadowFill = primaryEval
    ? formatOklchCss(primaryEval.shading.shadowColor)
    : 'oklch(0.52 0.08 265)';
  const midFill = primaryEval
    ? formatOklchCss(primaryEval.shading.midColor)
    : 'oklch(0.68 0.08 62)';
  const litFill = primaryEval
    ? formatOklchCss(primaryEval.shading.litColor)
    : 'oklch(0.85 0.07 52)';

  const compassCx = 760;
  const compassCy = 185;
  const compassRadius = 66;
  const keyNorm = normalizeVec3(rig.key.direction);
  const rimNorm = normalizeVec3(rig.rim.direction);
  const fillNorm = normalizeVec3(rig.fill.direction);
  const keyX = (compassCx + keyNorm.x * (compassRadius - 12)).toFixed(1);
  const keyY = (compassCy - keyNorm.y * (compassRadius - 12)).toFixed(1);
  const rimX = (compassCx + rimNorm.x * (compassRadius - 12)).toFixed(1);
  const rimY = (compassCy - rimNorm.y * (compassRadius - 12)).toFixed(1);
  const fillX = (compassCx + fillNorm.x * (compassRadius - 16)).toFixed(1);
  const fillY = (compassCy - fillNorm.y * (compassRadius - 16)).toFixed(1);

  const cards = afterAudit.evaluations.slice(0, 6).map((entry, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = 28 + col * 292;
    const y = 286 + row * 102;
    const preset = CEL_MATERIAL_PRESETS[entry.materialId];
    const objLabel = escapeSvgXml(entry.objectName);
    const matLabel = escapeSvgXml(preset.labelKo);
    const diffSwatch = formatOklchCss(entry.shading.diffuseColor);
    const shadowSwatch = formatOklchCss(entry.shading.shadowColor);
    const specSwatch = formatOklchCss(entry.shading.specularColor);
    const rimSwatch = formatOklchCss(entry.shading.rimColor);
    const metaText = escapeSvgXml(
      `금속성 ${entry.effectiveMetallic.toFixed(1)} · 편차 ${entry.specularDeviationDeg.toFixed(1)}도 · 페더 ${entry.effectiveFeatherWidth.toFixed(3)}`,
    );

    return [
      `<g transform="translate(${x}, ${y})">`,
      `  <rect x="0" y="0" width="276" height="88" rx="12" fill="${cardSurface}" stroke="${borderLine}" stroke-width="1" />`,
      `  <text x="14" y="24" font-size="13" font-weight="600" fill="${inkPrimary}">${objLabel}</text>`,
      `  <text x="14" y="42" font-size="11" fill="${inkMuted}">${matLabel}</text>`,
      `  <rect x="14" y="52" width="38" height="22" rx="6" fill="${shadowSwatch}" stroke="${borderLine}" stroke-width="0.8" />`,
      `  <rect x="58" y="52" width="38" height="22" rx="6" fill="${diffSwatch}" stroke="${borderLine}" stroke-width="0.8" />`,
      `  <rect x="102" y="52" width="38" height="22" rx="6" fill="${specSwatch}" stroke="${borderLine}" stroke-width="0.8" />`,
      `  <rect x="146" y="52" width="38" height="22" rx="6" fill="${rimSwatch}" stroke="${borderLine}" stroke-width="0.8" />`,
      `  <text x="194" y="67" font-size="10" fill="${inkMuted}">S·D·H·R</text>`,
      `  <text x="14" y="83" font-size="9.5" fill="${inkMuted}">${metaText}</text>`,
      '</g>',
    ].join('\n');
  });

  const bandSwatches =
    ramp.bandCount === 2
      ? [
          `<rect x="44" y="138" width="276" height="62" rx="8" fill="${shadowFill}" stroke="${borderLine}" stroke-width="1" />`,
          `<rect x="328" y="138" width="276" height="62" rx="8" fill="${litFill}" stroke="${borderLine}" stroke-width="1" />`,
          `<text x="56" y="218" font-size="11" fill="${inkMuted}">그림자 밴드 (Hue ${ramp.shadowHueShiftDeg > 0 ? '+' : ''}${ramp.shadowHueShiftDeg.toFixed(0)}도)</text>`,
          `<text x="340" y="218" font-size="11" fill="${inkMuted}">명부 밴드 (경계 ${ramp.terminatorThreshold.toFixed(2)} · 페더 ${ramp.bandFeatherWidth.toFixed(3)})</text>`,
        ].join('\n')
      : [
          `<rect x="44" y="138" width="182" height="62" rx="8" fill="${shadowFill}" stroke="${borderLine}" stroke-width="1" />`,
          `<rect x="234" y="138" width="182" height="62" rx="8" fill="${midFill}" stroke="${borderLine}" stroke-width="1" />`,
          `<rect x="424" y="138" width="182" height="62" rx="8" fill="${litFill}" stroke="${borderLine}" stroke-width="1" />`,
          `<text x="52" y="218" font-size="11" fill="${inkMuted}">그림자 (Hue ${ramp.shadowHueShiftDeg > 0 ? '+' : ''}${ramp.shadowHueShiftDeg.toFixed(0)}도)</text>`,
          `<text x="242" y="218" font-size="11" fill="${inkMuted}">중간톤 (${ramp.midBandThreshold.toFixed(2)})</text>`,
          `<text x="432" y="218" font-size="11" fill="${inkMuted}">명부 (${ramp.terminatorThreshold.toFixed(2)} · 페더 ${ramp.bandFeatherWidth.toFixed(3)})</text>`,
        ].join('\n');

  const summaryLine = escapeSvgXml(
    `보정 전 결함 ${beforeAudit.violations.length}건 → 보정 후 ${afterAudit.violations.length}건 · 일치 점수 ${afterAudit.consistencyScore}/100 · SHA ${shortDigest}`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 510" role="img" aria-label="${safeTitle}">`,
    `  <rect x="0" y="0" width="920" height="510" rx="18" fill="${bgCanvas}" />`,
    `  <rect x="20" y="18" width="880" height="66" rx="14" fill="${cardSurface}" stroke="${borderLine}" stroke-width="1" />`,
    `  <text x="38" y="45" font-size="17" font-weight="700" fill="${inkPrimary}">${safeTitle}</text>`,
    `  <text x="38" y="68" font-size="11.5" fill="${inkMuted}">${safeCutId} · ${summaryLine}</text>`,
    `  <rect x="786" y="34" width="94" height="32" rx="16" fill="${statusBg}" stroke="${statusColor}" stroke-width="1.2" />`,
    `  <text x="833" y="55" text-anchor="middle" font-size="13" font-weight="700" fill="${statusColor}">${afterAudit.status}</text>`,
    `  <rect x="28" y="100" width="596" height="164" rx="14" fill="${panelSurface}" stroke="${borderLine}" stroke-width="1" />`,
    `  <text x="44" y="124" font-size="13" font-weight="600" fill="${inkPrimary}">${ramp.bandCount}-밴드 OKLCH 셀 셰이딩 램프</text>`,
    bandSwatches,
    `  <rect x="640" y="100" width="252" height="164" rx="14" fill="${panelSurface}" stroke="${borderLine}" stroke-width="1" />`,
    `  <text x="656" y="124" font-size="13" font-weight="600" fill="${inkPrimary}">키·림·필 광원 배치도</text>`,
    `  <circle cx="${compassCx}" cy="${compassCy}" r="${compassRadius}" fill="${cardSurface}" stroke="${borderLine}" stroke-width="1.2" />`,
    `  <line x1="${compassCx - compassRadius}" y1="${compassCy}" x2="${compassCx + compassRadius}" y2="${compassCy}" stroke="${borderLine}" stroke-width="0.8" />`,
    `  <line x1="${compassCx}" y1="${compassCy - compassRadius}" x2="${compassCx}" y2="${compassCy + compassRadius}" stroke="${borderLine}" stroke-width="0.8" />`,
    `  <line x1="${compassCx}" y1="${compassCy}" x2="${keyX}" y2="${keyY}" stroke="oklch(0.62 0.16 70)" stroke-width="2.4" />`,
    `  <circle cx="${keyX}" cy="${keyY}" r="6" fill="oklch(0.70 0.16 70)" />`,
    `  <line x1="${compassCx}" y1="${compassCy}" x2="${rimX}" y2="${rimY}" stroke="oklch(0.56 0.14 235)" stroke-width="2.2" />`,
    `  <circle cx="${rimX}" cy="${rimY}" r="5.5" fill="oklch(0.62 0.14 235)" />`,
    `  <line x1="${compassCx}" y1="${compassCy}" x2="${fillX}" y2="${fillY}" stroke="oklch(0.56 0.10 155)" stroke-width="1.6" />`,
    `  <circle cx="${fillX}" cy="${fillY}" r="4" fill="oklch(0.60 0.10 155)" />`,
    `  <text x="656" y="254" font-size="10.5" fill="${inkMuted}">Key(금) · Rim(청) · Fill(녹)</text>`,
    ...cards,
    '</svg>',
  ].join('\n');
}

/**
 * 아트 디렉터용 자연스러운 한국어 QA 요약 보고문을 생성한다.
 */
export function summarizeCelShadingAuditKo(
  beforeAudit: CelCutConsistencyAudit,
  afterAudit: CelCutConsistencyAudit,
  changes: readonly CelHarmonizationChange[],
  wgslValidation: CelWgslValidationResult,
): string {
  const statusTag = afterAudit.status;
  const header =
    statusTag === 'PASS'
      ? `[PASS] 컷 ${afterAudit.cutId} 조명·셀 셰이딩 일관성 점검 통과 (점수 ${afterAudit.consistencyScore}/100)`
      : statusTag === 'WARN'
        ? `[WARN] 컷 ${afterAudit.cutId} 경고 ${afterAudit.violations.length}건 확인 필요 (점수 ${afterAudit.consistencyScore}/100)`
        : `[FAIL] 컷 ${afterAudit.cutId} 결함 ${afterAudit.violations.length}건 미해결 (점수 ${afterAudit.consistencyScore}/100)`;

  const lines: string[] = [
    header,
    `- 점검 대상: 오브젝트 ${afterAudit.evaluatedCount}종, 보정 전 결함 ${beforeAudit.violations.length}건 → 보정 후 ${afterAudit.violations.length}건`,
    `- 스페큘러 광원 정렬: 최대 편차 ${beforeAudit.maxSpecularDeviationDeg.toFixed(1)}도 → ${afterAudit.maxSpecularDeviationDeg.toFixed(1)}도`,
    `- 자동 보정 내역: 총 ${changes.length}건 적용 (주광원 방향은 원안 유지)`,
    `- WGSL 셰이더 계약: ${wgslValidation.valid ? `정상 (${wgslValidation.uniformByteSize}B 16-byte 정렬 · fwidth 활성)` : `실패 (${wgslValidation.errors.join('; ')})`}`,
  ];

  if (afterAudit.violations.length > 0) {
    lines.push(
      `- 남은 수정 항목: ${afterAudit.violations.map((v) => `${v.objectName}(${v.kind})`).join(', ')}`,
    );
  }

  return lines.join('\n');
}
