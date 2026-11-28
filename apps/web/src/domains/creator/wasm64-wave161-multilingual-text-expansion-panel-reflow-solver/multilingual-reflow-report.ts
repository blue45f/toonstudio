/**
 * Wave 161 — FIPS 180-4 SHA-256 결정론적 지문, 순수 OKLCH 진단 SVG 및 자연스러운 한글 QA 리포트.
 *
 * - 원시 16진수 색코드나 rgb()/hsl() 없이 순수 `oklch(...)` 색표기만 사용한다.
 * - ES2017 순수 동기 구현(BigInt 리터럴·외부 crypto 의존 없음)으로 브라우저·워커·Node 동일 해시 보장.
 */

import type {
  EpisodeMultilingualMatrixAudit,
  MultilingualEpisodeReflowResult,
  ReflowAuditVerdict,
  WebtoonPanelSpec,
} from "./multilingual-reflow-types";
import { LOCALE_TYPOGRAPHY_PROFILES } from "./script-expansion-estimator";

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

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let codePoint = input.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
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
  return new Uint8Array(bytes);
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 16진수 다이제스트를 계산한다.
 */
export function sha256ReflowHex(input: string): string {
  const msg = encodeUtf8Bytes(input);
  const bitLen = msg.length * 8;
  const paddedLen = Math.ceil((msg.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(msg, 0);
  padded[msg.length] = 0x80;

  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  padded[paddedLen - 8] = (highBits >>> 24) & 0xff;
  padded[paddedLen - 7] = (highBits >>> 16) & 0xff;
  padded[paddedLen - 6] = (highBits >>> 8) & 0xff;
  padded[paddedLen - 5] = highBits & 0xff;
  padded[paddedLen - 4] = (lowBits >>> 24) & 0xff;
  padded[paddedLen - 3] = (lowBits >>> 16) & 0xff;
  padded[paddedLen - 2] = (lowBits >>> 8) & 0xff;
  padded[paddedLen - 1] = lowBits & 0xff;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
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
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

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

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * 6개국어 리플로우 매니페스트의 결정론적 SHA-256 지문을 계산한다.
 * 어떤 언어의 텍스트나 컷 기하 좌표가 바뀌어도 지문이 즉시 변경된다.
 */
export function computeReflowManifestFingerprint(
  matrixAudit: EpisodeMultilingualMatrixAudit,
  panels: readonly WebtoonPanelSpec[],
): string {
  const canonicalPayload = {
    schema: "toonstudio.wave161.multilingual-reflow.v1",
    episodeId: matrixAudit.episodeId,
    panels: panels.map((panel) => ({
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      widthPx: panel.widthPx,
      baselineHeightPx: panel.baselineHeightPx,
      baselineGutterAfterPx: panel.baselineGutterAfterPx,
      protectedZones: panel.protectedZones.map((z) => ({
        zoneId: z.zoneId,
        kind: z.kind,
        rect: z.rect,
      })),
      textBlocks: panel.textBlocks.map((b) => ({
        blockId: b.blockId,
        kind: b.kind,
        baselineRect: b.baselineRect,
        baselineFontPx: b.baselineFontPx,
        baselineText: b.baselineText,
        localizedTexts: matrixAudit.localesAudited.map((loc) => [loc, b.localizedTexts[loc] ?? ""]),
      })),
    })),
    locales: matrixAudit.localesAudited.map((locale) => {
      const res = matrixAudit.resultsByLocale[locale];
      return {
        locale,
        verdict: res?.verdict ?? "FAIL",
        resolvedTotalScrollHeightPx: res?.resolvedTotalScrollHeightPx ?? 0,
        pacingDriftRatio: res?.pacingDriftRatio ?? 0,
        panels: (res?.panels ?? []).map((p) => ({
          panelId: p.panelId,
          resolvedHeightPx: p.resolvedHeightPx,
          yStartPx: p.yStartPx,
          yEndPx: p.yEndPx,
          gutterAfterPx: p.gutterAfterPx,
          blocks: p.blocks.map((b) => ({
            blockId: b.blockId,
            resolvedRect: b.resolvedRect,
            fontPx: b.estimate.resolvedFontPx,
            status: b.estimate.overflowStatus,
            unresolved: b.overflowUnresolved,
          })),
        })),
      };
    }),
  };

  return sha256ReflowHex(JSON.stringify(canonicalPayload));
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

const SVG_PALETTE = {
  canvasBg: "oklch(0.98 0.008 88)",
  headerBg: "oklch(0.25 0.045 162)",
  headerInk: "oklch(0.98 0.008 90)",
  panelFill: "oklch(0.995 0.003 90)",
  panelStroke: "oklch(0.76 0.02 155)",
  extensionTint: "oklch(0.92 0.04 155 / 0.45)",
  gutterFill: "oklch(0.93 0.014 86)",
  gutterAccent: "oklch(0.42 0.09 158)",
  faceFill: "oklch(0.78 0.10 210 / 0.30)",
  faceStroke: "oklch(0.46 0.12 215)",
  balloonBaseFill: "oklch(0.96 0.018 158)",
  balloonBaseStroke: "oklch(0.36 0.065 160)",
  balloonExpandedFill: "oklch(0.94 0.065 82 / 0.80)",
  balloonExpandedStroke: "oklch(0.54 0.14 68)",
  balloonOverflowFill: "oklch(0.89 0.095 26 / 0.72)",
  balloonOverflowStroke: "oklch(0.52 0.19 26)",
  inkPrimary: "oklch(0.22 0.02 155)",
  inkMuted: "oklch(0.48 0.02 155)",
  barTrack: "oklch(0.91 0.01 90)",
  barFill: "oklch(0.44 0.10 158)",
  verdictPass: "oklch(0.48 0.12 154)",
  verdictWarn: "oklch(0.66 0.15 72)",
  verdictFail: "oklch(0.54 0.19 26)",
} as const;

function verdictColorOklch(verdict: ReflowAuditVerdict): string {
  if (verdict === "PASS") return SVG_PALETTE.verdictPass;
  if (verdict === "WARN") return SVG_PALETTE.verdictWarn;
  return SVG_PALETTE.verdictFail;
}

/**
 * 한국어 기준 스트립(좌)과 리플로우된 대상 언어 스트립(우)을 나란히 비교하는 순수 OKLCH 진단 SVG를 생성한다.
 */
export function renderMultilingualReflowAuditSvg(
  titleKo: string,
  targetResult: MultilingualEpisodeReflowResult,
  matrixAudit?: EpisodeMultilingualMatrixAudit,
): string {
  const maxStripWidthPx = targetResult.panels.reduce((acc, p) => Math.max(acc, p.widthPx), 800);
  const maxScrollHeightPx = Math.max(
    1,
    targetResult.baselineTotalScrollHeightPx,
    targetResult.resolvedTotalScrollHeightPx,
  );

  const columnWidth = 280;
  const scale = Math.min(columnWidth / Math.max(1, maxStripWidthPx), 540 / maxScrollHeightPx);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0.25;

  const stripDisplayWidth = Math.round(maxStripWidthPx * safeScale);
  const stripDisplayHeight = Math.max(180, Math.ceil(maxScrollHeightPx * safeScale));
  const headerHeight = 68;
  const columnLabelHeight = 28;
  const footerHeight = matrixAudit ? 124 : 52;
  const gapBetweenColumns = 72;
  const sideMargin = 32;
  const svgWidth = sideMargin * 2 + stripDisplayWidth * 2 + gapBetweenColumns;
  const svgHeight = headerHeight + columnLabelHeight + stripDisplayHeight + footerHeight + 24;

  const leftOriginX = sideMargin;
  const rightOriginX = sideMargin + stripDisplayWidth + gapBetweenColumns;
  const stripOriginY = headerHeight + columnLabelHeight + 8;

  const targetProfile = LOCALE_TYPOGRAPHY_PROFILES[targetResult.targetLocale];
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(svgWidth)} ${fmtNum(svgHeight)}" width="${fmtNum(svgWidth)}" height="${fmtNum(svgHeight)}" role="img" aria-label="${escapeXml(`${titleKo} 다국어 컷 리플로우 진단`)}">`,
  );
  parts.push(
    `<rect x="0" y="0" width="${fmtNum(svgWidth)}" height="${fmtNum(svgHeight)}" fill="${SVG_PALETTE.canvasBg}" />`,
  );
  parts.push(
    `<rect x="0" y="0" width="${fmtNum(svgWidth)}" height="${fmtNum(headerHeight)}" fill="${SVG_PALETTE.headerBg}" />`,
  );
  parts.push(
    `<text x="${fmtNum(sideMargin)}" y="29" fill="${SVG_PALETTE.headerInk}" font-family="sans-serif" font-size="15" font-weight="700">${escapeXml(titleKo)} — ko → ${escapeXml(targetProfile.displayNameKo)} (${escapeXml(targetResult.targetLocale)})</text>`,
  );
  parts.push(
    `<text x="${fmtNum(sideMargin)}" y="51" fill="${SVG_PALETTE.headerInk}" font-family="sans-serif" font-size="11">전체 스크롤 ${fmtNum(targetResult.baselineTotalScrollHeightPx)}px → ${fmtNum(targetResult.resolvedTotalScrollHeightPx)}px (${targetResult.heightGrowthPercent >= 0 ? "+" : ""}${fmtNum(targetResult.heightGrowthPercent)}%) · 얼굴 가림 ${fmtNum(targetResult.totalFaceOcclusionAreaPx)}px² · 겹침 ${fmtNum(targetResult.totalBalloonOverlapAreaPx)}px²</text>`,
  );

  // 우측 상단 판정 배지
  const badgeW = 68;
  const badgeX = svgWidth - sideMargin - badgeW;
  parts.push(
    `<rect x="${fmtNum(badgeX)}" y="19" width="${fmtNum(badgeW)}" height="28" rx="6" fill="${verdictColorOklch(targetResult.verdict)}" />`,
  );
  parts.push(
    `<text x="${fmtNum(badgeX + badgeW / 2)}" y="37" text-anchor="middle" fill="${SVG_PALETTE.headerInk}" font-family="sans-serif" font-size="12" font-weight="700">${escapeXml(targetResult.verdict)}</text>`,
  );

  // 컬럼 제목
  parts.push(
    `<text x="${fmtNum(leftOriginX)}" y="${fmtNum(headerHeight + 21)}" fill="${SVG_PALETTE.inkPrimary}" font-family="sans-serif" font-size="12" font-weight="700">원본 기준 (한국어 · ko)</text>`,
  );
  parts.push(
    `<text x="${fmtNum(rightOriginX)}" y="${fmtNum(headerHeight + 21)}" fill="${SVG_PALETTE.inkPrimary}" font-family="sans-serif" font-size="12" font-weight="700">리플로우 결과 (${escapeXml(targetProfile.displayNameKo)} · ${escapeXml(targetResult.targetLocale)})</text>`,
  );

  // 좌·우 패널 스트립 렌더링
  for (const panel of targetResult.panels) {
    const pw = panel.widthPx * safeScale;
    const baseY = stripOriginY + panel.baselineYStartPx * safeScale;
    const baseH = panel.baselineHeightPx * safeScale;
    const resY = stripOriginY + panel.yStartPx * safeScale;
    const resH = panel.resolvedHeightPx * safeScale;

    // 좌측 기준 컷
    parts.push(
      `<rect x="${fmtNum(leftOriginX)}" y="${fmtNum(baseY)}" width="${fmtNum(pw)}" height="${fmtNum(baseH)}" fill="${SVG_PALETTE.panelFill}" stroke="${SVG_PALETTE.panelStroke}" stroke-width="1.2" />`,
    );
    // 우측 리플로우 컷
    parts.push(
      `<rect x="${fmtNum(rightOriginX)}" y="${fmtNum(resY)}" width="${fmtNum(pw)}" height="${fmtNum(resH)}" fill="${SVG_PALETTE.panelFill}" stroke="${SVG_PALETTE.panelStroke}" stroke-width="1.2" />`,
    );

    if (panel.heightDeltaPx > 0) {
      const extY = resY + baseH;
      const extH = panel.heightDeltaPx * safeScale;
      parts.push(
        `<rect x="${fmtNum(rightOriginX + 1)}" y="${fmtNum(extY)}" width="${fmtNum(Math.max(0, pw - 2))}" height="${fmtNum(extH)}" fill="${SVG_PALETTE.extensionTint}" />`,
      );
    }

    // 보호 영역(얼굴·눈)
    for (const zone of panel.protectedZones) {
      const zx = zone.rect.x * safeScale;
      const zy = zone.rect.y * safeScale;
      const zw = zone.rect.width * safeScale;
      const zh = zone.rect.height * safeScale;
      parts.push(
        `<rect x="${fmtNum(leftOriginX + zx)}" y="${fmtNum(baseY + zy)}" width="${fmtNum(zw)}" height="${fmtNum(zh)}" rx="3" fill="${SVG_PALETTE.faceFill}" stroke="${SVG_PALETTE.faceStroke}" stroke-width="1" stroke-dasharray="3 2" />`,
      );
      parts.push(
        `<rect x="${fmtNum(rightOriginX + zx)}" y="${fmtNum(resY + zy)}" width="${fmtNum(zw)}" height="${fmtNum(zh)}" rx="3" fill="${SVG_PALETTE.faceFill}" stroke="${SVG_PALETTE.faceStroke}" stroke-width="1" stroke-dasharray="3 2" />`,
      );
    }

    // 말풍선·효과음 블록
    for (const block of panel.blocks) {
      const bx = block.baselineRect.x * safeScale;
      const by = block.baselineRect.y * safeScale;
      const bw = block.baselineRect.width * safeScale;
      const bh = block.baselineRect.height * safeScale;
      parts.push(
        `<rect x="${fmtNum(leftOriginX + bx)}" y="${fmtNum(baseY + by)}" width="${fmtNum(bw)}" height="${fmtNum(bh)}" rx="4" fill="${SVG_PALETTE.balloonBaseFill}" stroke="${SVG_PALETTE.balloonBaseStroke}" stroke-width="1" />`,
      );

      const rx = block.resolvedRect.x * safeScale;
      const ry = block.resolvedRect.y * safeScale;
      const rw = block.resolvedRect.width * safeScale;
      const rh = block.resolvedRect.height * safeScale;
      const fill = block.overflowUnresolved
        ? SVG_PALETTE.balloonOverflowFill
        : block.estimate.overflowStatus === "fits"
          ? SVG_PALETTE.balloonBaseFill
          : SVG_PALETTE.balloonExpandedFill;
      const stroke = block.overflowUnresolved
        ? SVG_PALETTE.balloonOverflowStroke
        : block.estimate.overflowStatus === "fits"
          ? SVG_PALETTE.balloonBaseStroke
          : SVG_PALETTE.balloonExpandedStroke;
      parts.push(
        `<rect x="${fmtNum(rightOriginX + rx)}" y="${fmtNum(resY + ry)}" width="${fmtNum(rw)}" height="${fmtNum(rh)}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`,
      );
    }

    // 중앙 거터·컷 변화량 마커
    const midX = leftOriginX + stripDisplayWidth + gapBetweenColumns / 2;
    const deltaSign = panel.heightDeltaPx >= 0 ? "+" : "";
    parts.push(
      `<text x="${fmtNum(midX)}" y="${fmtNum(resY + Math.min(resH / 2 + 4, 18))}" text-anchor="middle" fill="${SVG_PALETTE.inkPrimary}" font-family="sans-serif" font-size="9.5" font-weight="600">${escapeXml(panel.panelId)} (${deltaSign}${fmtNum(panel.heightDeltaPx)}px)</text>`,
    );

    if (panel.gutterAfterPx > 0) {
      const gutterY = resY + resH;
      const gutterH = panel.gutterAfterPx * safeScale;
      parts.push(
        `<rect x="${fmtNum(rightOriginX)}" y="${fmtNum(gutterY)}" width="${fmtNum(pw)}" height="${fmtNum(gutterH)}" fill="${SVG_PALETTE.gutterFill}" />`,
      );
      const gSign = panel.gutterDeltaPx >= 0 ? "+" : "";
      parts.push(
        `<text x="${fmtNum(midX)}" y="${fmtNum(gutterY + Math.max(8, gutterH / 2 + 3))}" text-anchor="middle" fill="${SVG_PALETTE.gutterAccent}" font-family="sans-serif" font-size="8.5">거터 ${fmtNum(panel.gutterAfterPx)}px (${gSign}${fmtNum(panel.gutterDeltaPx)})</text>`,
      );
    }
  }

  // 하단 6개국어 확장 요약 막대
  const footerTop = stripOriginY + stripDisplayHeight + 18;
  if (matrixAudit && matrixAudit.rankedEntries.length > 0) {
    parts.push(
      `<text x="${fmtNum(sideMargin)}" y="${fmtNum(footerTop)}" fill="${SVG_PALETTE.inkPrimary}" font-family="sans-serif" font-size="11" font-weight="700">6개국어 스크롤 길이 변화 비교</text>`,
    );
    const barMaxW = Math.max(120, svgWidth - sideMargin * 2 - 190);
    const maxAbsGrowth = Math.max(
      10,
      ...matrixAudit.rankedEntries.map((e) => Math.abs(e.heightGrowthPercent)),
    );
    matrixAudit.rankedEntries.forEach((entry, idx) => {
      const rowY = footerTop + 14 + idx * 16;
      const ratio = Math.min(1, Math.abs(entry.heightGrowthPercent) / maxAbsGrowth);
      const barW = Math.max(4, Math.round(barMaxW * ratio));
      const sign = entry.heightGrowthPercent >= 0 ? "+" : "";
      parts.push(
        `<text x="${fmtNum(sideMargin)}" y="${fmtNum(rowY + 9)}" fill="${SVG_PALETTE.inkPrimary}" font-family="sans-serif" font-size="10">${escapeXml(entry.displayNameKo)} (${escapeXml(entry.locale)})</text>`,
      );
      parts.push(
        `<rect x="${fmtNum(sideMargin + 126)}" y="${fmtNum(rowY)}" width="${fmtNum(barMaxW)}" height="10" rx="3" fill="${SVG_PALETTE.barTrack}" />`,
      );
      parts.push(
        `<rect x="${fmtNum(sideMargin + 126)}" y="${fmtNum(rowY)}" width="${fmtNum(barW)}" height="10" rx="3" fill="${entry.verdict === "PASS" ? SVG_PALETTE.barFill : verdictColorOklch(entry.verdict)}" />`,
      );
      parts.push(
        `<text x="${fmtNum(sideMargin + 132 + barMaxW)}" y="${fmtNum(rowY + 9)}" fill="${SVG_PALETTE.inkMuted}" font-family="sans-serif" font-size="9.5">${sign}${fmtNum(entry.heightGrowthPercent)}% · ${escapeXml(entry.verdict)}</text>`,
      );
    });
  } else {
    parts.push(
      `<text x="${fmtNum(sideMargin)}" y="${fmtNum(footerTop + 12)}" fill="${SVG_PALETTE.inkMuted}" font-family="sans-serif" font-size="10">호흡 편차 ${fmtNum(targetResult.pacingDriftRatio * 100)}% · 최소 거터 ${fmtNum(targetResult.minResolvedGutterPx)}px</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 현지화 리플로우 QA 요약 보고서를 작성한다.
 */
export function summarizeMultilingualReflowKo(
  titleKo: string,
  matrixAudit: EpisodeMultilingualMatrixAudit,
): string {
  const worstProfile = LOCALE_TYPOGRAPHY_PROFILES[matrixAudit.worstCaseLocale];
  const compactProfile = LOCALE_TYPOGRAPHY_PROFILES[matrixAudit.mostCompactLocale];
  const worstRes = matrixAudit.resultsByLocale[matrixAudit.worstCaseLocale];

  const lines: string[] = [];
  lines.push(
    `[${matrixAudit.overallVerdict}] "${titleKo}" ${matrixAudit.localesAudited.length}개국어 컷 높이·거터 리플로우 검수 결과`,
  );
  lines.push(
    `- 최대 확장 언어: ${worstProfile.displayNameKo}(${worstProfile.locale}) ${matrixAudit.maxHeightGrowthPercent >= 0 ? "+" : ""}${matrixAudit.maxHeightGrowthPercent}% (최소 확장: ${compactProfile.displayNameKo} ${matrixAudit.minHeightGrowthPercent >= 0 ? "+" : ""}${matrixAudit.minHeightGrowthPercent}%)`,
  );

  const occlusionText = matrixAudit.zeroOcclusionAllLocales
    ? "전 언어 얼굴·눈 보호 영역 가림 0건"
    : "일부 언어에서 보호 영역 가림이 남아 있어 즉시 수정이 필요합니다";
  const overlapText = matrixAudit.zeroOverlapAllLocales
    ? "말풍선 겹침 0건"
    : "말풍선 겹침이 남아 있습니다";
  lines.push(`- 작화 보호 판정: ${occlusionText}, ${overlapText}`);

  if (worstRes) {
    lines.push(
      `- 스크롤 호흡 지표(${worstProfile.displayNameKo} 기준): 최소 거터 ${worstRes.minResolvedGutterPx}px, 호흡 편차 ${(worstRes.pacingDriftRatio * 100).toFixed(1)}%`,
    );
  }

  const flaggedEntries = matrixAudit.rankedEntries.filter((entry) => !entry.exportReady);
  if (flaggedEntries.length === 0) {
    lines.push(
      `- 내보내기 판정: 검사한 ${matrixAudit.localesAudited.length}개 언어 모두 가독성 하한과 컷 호흡을 유지해 바로 발행할 수 있습니다.`,
    );
  } else {
    const names = flaggedEntries
      .map((e) => `${e.displayNameKo}(미해소 ${e.overflowUnresolvedCount}건)`)
      .join(", ");
    lines.push(
      `- 조치 필요: ${names}에서 컷 확장 한도를 넘긴 대사가 있습니다. 해당 대사를 줄이거나 컷 분할 후 다시 검수하세요.`,
    );
  }

  return lines.join("\n");
}
