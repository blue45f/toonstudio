/**
 * Wave 165: FIPS 180-4 순수 ES2017 SHA-256 지문, 순수 OKLCH 진단 SVG 및 채색 디렉터 한글 QA 리포트.
 *
 * - 외부 crypto 모듈이나 BigInt 리터럴 없이 브라우저/Node 동일 해시를 산출한다.
 * - SVG에는 원시 hex/rgb/hsl 표기를 일절 사용하지 않고 순수 `oklch(...)` 색표기만 사용한다.
 * - 번역투를 배제한 실무 중심 한국어로 채색 전달 가능 여부를 요약한다.
 */

import {
  SEMANTIC_DEPTH_LAYER_INFO,
  SEMANTIC_DEPTH_LAYER_ORDER,
  getLayerForClassId,
  type AntiBleedAuditComparison,
  type AntiBleedMaskSolution,
  type GapSealedBarrierResult,
  type LineartRasterInput,
  type LineartRegionExtractionResult,
  type SemanticDepthMaskAssignment,
  type SemanticMaskAuditStatus,
  type SemanticSeedHint,
} from "./semantic-mask-types";

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

const SHA256_INIT: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      } else {
        bytes.push(0xef, 0xbf, 0xbd);
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

/** 순수 ES2017 동기 FIPS 180-4 SHA-256 16진수 다이제스트(64자 소문자). */
export function sha256MaskHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const msgLen = raw.length;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(raw, 0);
  padded[msgLen] = 0x80;

  const bitLen = msgLen * 8;
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

  let h0 = SHA256_INIT[0];
  let h1 = SHA256_INIT[1];
  let h2 = SHA256_INIT[2];
  let h3 = SHA256_INIT[3];
  let h4 = SHA256_INIT[4];
  let h5 = SHA256_INIT[5];
  let h6 = SHA256_INIT[6];
  let h7 = SHA256_INIT[7];

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const p = offset + i * 4;
      w[i] =
        ((padded[p] << 24) |
          (padded[p + 1] << 16) |
          (padded[p + 2] << 8) |
          padded[p + 3]) >>>
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
  let hex = "";
  for (let i = 0; i < words.length; i += 1) {
    hex += (words[i] >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/** 라인아트 래스터·시드·최종 깊이 마스크·감사 지표를 결정론적으로 직렬화해 SHA-256 지문을 생성한다. */
export function computeSemanticMaskFingerprint(
  raster: LineartRasterInput,
  seeds: readonly SemanticSeedHint[],
  assignment: SemanticDepthMaskAssignment,
  solution: AntiBleedMaskSolution,
  audit: AntiBleedAuditComparison,
): string {
  const sortedSeeds = [...seeds].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    if (a.layerClass !== b.layerClass) return a.layerClass.localeCompare(b.layerClass);
    return a.labelKo.localeCompare(b.labelKo);
  });

  const headerParts: string[] = [
    "wave165-semantic-mask-v1",
    `dims:${String(raster.width)}x${String(raster.height)}`,
    `status:${audit.status}`,
    `halo:${String(audit.naiveMetrics.whiteHaloPixelCount)}->${String(audit.solvedMetrics.whiteHaloPixelCount)}`,
    `bleed:${String(audit.solvedMetrics.crossLayerBleedCount)}`,
    `leak:${String(assignment.leakedRegionCount)}`,
  ];

  for (let i = 0; i < sortedSeeds.length; i += 1) {
    const s = sortedSeeds[i];
    headerParts.push(`seed:${String(s.x)},${String(s.y)},${s.layerClass},${s.labelKo}`);
  }

  const headerBytes = encodeUtf8Bytes(headerParts.join("|"));
  const payload = new Uint8Array(
    headerBytes.length +
      1 +
      raster.inkAlpha.length +
      assignment.coreLayerMap.length +
      solution.resolvedLayerMap.length,
  );
  let cursor = 0;
  payload.set(headerBytes, cursor);
  cursor += headerBytes.length;
  payload[cursor] = 0x1f;
  cursor += 1;
  payload.set(raster.inkAlpha, cursor);
  cursor += raster.inkAlpha.length;
  payload.set(assignment.coreLayerMap, cursor);
  cursor += assignment.coreLayerMap.length;
  payload.set(solution.resolvedLayerMap, cursor);

  return sha256MaskHex(payload);
}

/** XML 특수문자 이스케이프(`#` 문자 없는 이름 기반 엔티티만 사용해 원시 hex 오탐 방지). */
export function escapeSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeCoord(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const factor = Math.pow(10, digits);
  return String(Math.round(value * factor) / factor);
}

function getStatusBadgeColors(status: SemanticMaskAuditStatus): {
  readonly bg: string;
  readonly fg: string;
} {
  if (status === "PASS") {
    return { bg: "oklch(0.42 0.09 156)", fg: "oklch(0.98 0.01 90)" };
  }
  if (status === "WARN") {
    return { bg: "oklch(0.68 0.14 75)", fg: "oklch(0.22 0.03 60)" };
  }
  return { bg: "oklch(0.55 0.18 26)", fg: "oklch(0.98 0.01 90)" };
}

/**
 * 순수 `oklch(...)` 색표기 진단 SVG를 생성한다.
 * - 좌측: 깊이 정렬 시맨틱 클리핑 맵 런-길이 벡터 프리뷰 + 선화 잉크 오버레이
 * - 우상단: 안티앨리어싱 흰 테두리(White Halo) 제거 전후 비교 미터 및 무침범/무누수 지표
 * - 우하단: 6단계 깊이 레이어 면적 비율 막대
 */
export function renderSemanticMaskAuditSvg(params: {
  readonly titleKo: string;
  readonly raster: LineartRasterInput;
  readonly barrier: GapSealedBarrierResult;
  readonly solvedSolution: AntiBleedMaskSolution;
  readonly audit: AntiBleedAuditComparison;
}): string {
  const { titleKo, raster, barrier, solvedSolution, audit } = params;
  const svgW = 760;
  const svgH = 420;

  const badge = getStatusBadgeColors(audit.status);
  const safeTitle = escapeSvgXml(titleKo);

  // 좌측 프리뷰 박스(288x288)
  const previewX = 24;
  const previewY = 74;
  const previewSize = 288;
  const cellW = previewSize / Math.max(1, raster.width);
  const cellH = previewSize / Math.max(1, raster.height);

  const previewRects: string[] = [];
  const resolved = solvedSolution.resolvedLayerMap;
  const ink = raster.inkAlpha;

  // 행별 런-길이 인코딩으로 시맨틱 마스크 맵 렌더링
  for (let y = 0; y < raster.height; y += 1) {
    const rowStart = y * raster.width;
    let x = 0;
    while (x < raster.width) {
      const classId = resolved[rowStart + x];
      let runEnd = x + 1;
      while (runEnd < raster.width && resolved[rowStart + runEnd] === classId) {
        runEnd += 1;
      }
      if (classId > 0) {
        const cls = getLayerForClassId(classId);
        if (cls) {
          const fill = SEMANTIC_DEPTH_LAYER_INFO[cls].oklchFill;
          previewRects.push(
            `<rect x="${safeCoord(previewX + x * cellW)}" y="${safeCoord(previewY + y * cellH)}" width="${safeCoord((runEnd - x) * cellW + 0.08)}" height="${safeCoord(cellH + 0.08)}" fill="${fill}" />`,
          );
        }
      }
      x = runEnd;
    }

    // 선화 잉크 오버레이(반투명·불투명 2단계 양자화 런-길이)
    let ix = 0;
    while (ix < raster.width) {
      const alpha = ink[rowStart + ix];
      const bucket = alpha >= 160 ? 2 : alpha >= 48 ? 1 : 0;
      let runEnd = ix + 1;
      while (runEnd < raster.width) {
        const nextAlpha = ink[rowStart + runEnd];
        const nextBucket = nextAlpha >= 160 ? 2 : nextAlpha >= 48 ? 1 : 0;
        if (nextBucket !== bucket) {
          break;
        }
        runEnd += 1;
      }
      if (bucket > 0) {
        const inkFill =
          bucket === 2 ? "oklch(0.18 0.015 250 / 0.92)" : "oklch(0.24 0.015 250 / 0.42)";
        previewRects.push(
          `<rect x="${safeCoord(previewX + ix * cellW)}" y="${safeCoord(previewY + y * cellH)}" width="${safeCoord((runEnd - ix) * cellW + 0.05)}" height="${safeCoord(cellH + 0.05)}" fill="${inkFill}" />`,
        );
      }
      ix = runEnd;
    }
  }

  // 우상단: 흰 테두리 제거 전후 미터
  const rightX = 336;
  const meterY = 74;
  const cardW = 400;
  const naiveHalo = audit.naiveMetrics.whiteHaloPixelCount;
  const solvedHalo = audit.solvedMetrics.whiteHaloPixelCount;
  const maxHalo = Math.max(1, naiveHalo, solvedHalo);
  const barMaxW = 240;
  const naiveBarW = (naiveHalo / maxHalo) * barMaxW;
  const solvedBarW = (solvedHalo / maxHalo) * barMaxW;
  const reductionPct = Math.round(audit.haloReductionRatio * 1000) / 10;

  // 우하단: 레이어별 커버리지 막대
  const layersCardY = 212;
  const layerRows: string[] = [];
  for (let i = 0; i < SEMANTIC_DEPTH_LAYER_ORDER.length; i += 1) {
    const cls = SEMANTIC_DEPTH_LAYER_ORDER[i];
    const info = SEMANTIC_DEPTH_LAYER_INFO[cls];
    const ratio = audit.solvedMetrics.perLayerCoverage[cls] ?? 0;
    const pct = Math.round(ratio * 1000) / 10;
    const rowY = layersCardY + 34 + i * 24;
    const widthPx = Math.max(0, Math.min(1, ratio)) * 185;
    layerRows.push(
      [
        `<rect x="${String(rightX + 16)}" y="${String(rowY - 10)}" width="12" height="12" rx="3" fill="${info.oklchFill}" stroke="${info.oklchStroke}" stroke-width="1" />`,
        `<text x="${String(rightX + 36)}" y="${String(rowY)}" font-size="11" fill="oklch(0.25 0.02 150)">${escapeSvgXml(`D${String(info.depthRank)} ${info.labelKo}`)}</text>`,
        `<rect x="${String(rightX + 148)}" y="${String(rowY - 9)}" width="185" height="10" rx="5" fill="oklch(0.93 0.01 90)" />`,
        `<rect x="${String(rightX + 148)}" y="${String(rowY - 9)}" width="${safeCoord(widthPx)}" height="10" rx="5" fill="${info.oklchFill}" />`,
        `<text x="${String(rightX + 384)}" y="${String(rowY)}" text-anchor="end" font-size="11" fill="oklch(0.32 0.02 150)">${safeCoord(pct, 1)}%</text>`,
      ].join(""),
    );
  }

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(svgW)} ${String(svgH)}" width="${String(svgW)}" height="${String(svgH)}" role="img" aria-label="${safeTitle}">`,
    `<rect x="0" y="0" width="${String(svgW)}" height="${String(svgH)}" rx="16" fill="oklch(0.98 0.008 90)" stroke="oklch(0.86 0.016 150)" stroke-width="1.5" />`,
    `<text x="24" y="34" font-size="16" font-weight="700" fill="oklch(0.22 0.03 155)">${safeTitle}</text>`,
    `<text x="24" y="54" font-size="11" fill="oklch(0.46 0.02 150)">${escapeSvgXml(`Wave 165 시맨틱 깊이 마스크 · 틈 봉합 ${String(barrier.closedGapCount)}곳 · 브리지 ${String(barrier.bridgePixelCount)}px`)}</text>`,
    `<rect x="${String(svgW - 104)}" y="18" width="80" height="28" rx="14" fill="${badge.bg}" />`,
    `<text x="${String(svgW - 64)}" y="36" text-anchor="middle" font-size="12" font-weight="700" fill="${badge.fg}">${audit.status}</text>`,
    `<rect x="${String(previewX - 2)}" y="${String(previewY - 2)}" width="${String(previewSize + 4)}" height="${String(previewSize + 4)}" rx="10" fill="oklch(0.99 0.004 90)" stroke="oklch(0.82 0.018 150)" stroke-width="1.5" />`,
    ...previewRects,
    `<text x="${String(previewX)}" y="${String(previewY + previewSize + 24)}" font-size="11" fill="oklch(0.42 0.02 150)">${escapeSvgXml(`해상도 ${String(raster.width)}x${String(raster.height)} · 커버리지 ${safeCoord(audit.solvedMetrics.coverageRatio * 100, 1)}%`)}</text>`,
    `<rect x="${String(rightX)}" y="${String(meterY)}" width="${String(cardW)}" height="122" rx="12" fill="oklch(0.995 0.003 90)" stroke="oklch(0.88 0.014 150)" stroke-width="1" />`,
    `<text x="${String(rightX + 16)}" y="${String(meterY + 24)}" font-size="13" font-weight="700" fill="oklch(0.24 0.03 155)">${escapeSvgXml(`흰 테두리(Halo) 제거율 ${safeCoord(reductionPct, 1)}%`)}</text>`,
    `<text x="${String(rightX + 16)}" y="${String(meterY + 50)}" font-size="11" fill="oklch(0.42 0.02 150)">적용 전</text>`,
    `<rect x="${String(rightX + 74)}" y="${String(meterY + 40)}" width="${String(barMaxW)}" height="12" rx="6" fill="oklch(0.93 0.01 90)" />`,
    `<rect x="${String(rightX + 74)}" y="${String(meterY + 40)}" width="${safeCoord(naiveBarW)}" height="12" rx="6" fill="oklch(0.65 0.16 32)" />`,
    `<text x="${String(rightX + 384)}" y="${String(meterY + 50)}" text-anchor="end" font-size="11" fill="oklch(0.32 0.03 32)">${String(naiveHalo)}px</text>`,
    `<text x="${String(rightX + 16)}" y="${String(meterY + 76)}" font-size="11" fill="oklch(0.42 0.02 150)">적용 후</text>`,
    `<rect x="${String(rightX + 74)}" y="${String(meterY + 66)}" width="${String(barMaxW)}" height="12" rx="6" fill="oklch(0.93 0.01 90)" />`,
    `<rect x="${String(rightX + 74)}" y="${String(meterY + 66)}" width="${safeCoord(solvedBarW)}" height="12" rx="6" fill="oklch(0.52 0.12 156)" />`,
    `<text x="${String(rightX + 384)}" y="${String(meterY + 76)}" text-anchor="end" font-size="11" fill="oklch(0.34 0.08 156)">${String(solvedHalo)}px</text>`,
    `<text x="${String(rightX + 16)}" y="${String(meterY + 104)}" font-size="11" fill="oklch(0.34 0.02 150)">${escapeSvgXml(`교차 레이어 번짐 ${String(audit.solvedMetrics.crossLayerBleedCount)}px · 영역 누수 ${String(audit.solvedMetrics.leakedRegionCount)}건`)}</text>`,
    `<rect x="${String(rightX)}" y="${String(layersCardY)}" width="${String(cardW)}" height="184" rx="12" fill="oklch(0.995 0.003 90)" stroke="oklch(0.88 0.014 150)" stroke-width="1" />`,
    `<text x="${String(rightX + 16)}" y="${String(layersCardY + 20)}" font-size="12" font-weight="700" fill="oklch(0.24 0.03 155)">깊이 순 시맨틱 클리핑 레이어 면적</text>`,
    ...layerRows,
    "</svg>",
  ];

  return lines.join("\n");
}

/** 채색 디렉터 관점의 자연스러운 한국어 QA 요약 문장을 생성한다(번역투 금지). */
export function summarizeSemanticMaskAuditKo(params: {
  readonly titleKo: string;
  readonly barrier: GapSealedBarrierResult;
  readonly extraction: LineartRegionExtractionResult;
  readonly assignment: SemanticDepthMaskAssignment;
  readonly audit: AntiBleedAuditComparison;
}): string {
  const { titleKo, barrier, extraction, assignment, audit } = params;
  const reductionPct = Math.round(audit.haloReductionRatio * 1000) / 10;
  const coveragePct = Math.round(audit.solvedMetrics.coverageRatio * 1000) / 10;

  let verdictLine = "밑색 채색 팀에 바로 넘겨도 되는 깨끗한 상태입니다.";
  if (audit.status === "WARN") {
    verdictLine =
      "선화 경계에 미세한 흰 테두리가 남아 있어 초크 반경을 1px 높여 다시 확인하세요.";
  } else if (audit.status === "FAIL") {
    if (audit.solvedMetrics.leakedRegionCount > 0) {
      verdictLine =
        "열린 선화 틈으로 영역이 배경 쪽으로 새었으니 펜선 마감을 보강한 뒤 다시 분할하세요.";
    } else if (audit.solvedMetrics.crossLayerBleedCount > 0) {
      verdictLine =
        "인접 레이어 사이 경계 침범이 확인되어 선화 두께와 시드 위치를 점검해야 합니다.";
    } else {
      verdictLine =
        "반투명 선화 경계에 흰 테두리가 많이 남아 있어 안티-블리드 임계치를 조정하세요.";
    }
  }

  return [
    `[${audit.status}] ${titleKo} — 라인아트 시맨틱 깊이 마스크 검수`,
    `- 선화 틈 봉합: 열린 틈 ${String(barrier.closedGapCount)}곳을 얇은 브리지 ${String(barrier.bridgePixelCount)}px로 닫고 ${String(extraction.regionCount)}개 영역으로 나누었습니다(미시드 닫힌 소영역 ${String(assignment.resolvedMicroRegionCount)}개 자동 귀속).`,
    `- 흰 테두리 해소: 기준선 ${String(audit.naiveMetrics.whiteHaloPixelCount)}px에서 ${String(audit.solvedMetrics.whiteHaloPixelCount)}px로 ${String(reductionPct)}% 줄였습니다(전체 커버리지 ${String(coveragePct)}%).`,
    `- 경계 무결성: 교차 레이어 번짐 ${String(audit.solvedMetrics.crossLayerBleedCount)}px, 영역 누수 ${String(audit.solvedMetrics.leakedRegionCount)}건.`,
    `- 전달 판정: ${verdictLine}`,
  ].join("\n");
}
