/**
 * Wave 159: 순수 ES2017 동기 FIPS 180-4 SHA-256 포즈 지문, 순수 OKLCH 감사 SVG 렌더러,
 * 그리고 한국어 스튜디오 QA 요약 리포트 생성기.
 *
 * 디자인 시스템 토큰 규칙 준수: 모든 SVG 색상은 `oklch(...)`만 사용한다.
 */

import type {
  ArapDistortionAudit,
  ArapMesh2d,
  ArapPinHandle,
  BoneChainPoseSolution,
  CagePolygon2d,
  SafeArapSolveResult,
  Vec2,
} from "./arap-deform-types";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function encodeUtf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
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
      out.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      out.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      out.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 64자리 소문자 16진수 다이제스트를 계산한다.
 */
export function sha256ArapHex(message: string): string {
  const bytes = encodeUtf8Bytes(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const hiBits = Math.floor(bitLen / 0x100000000);
  const loBits = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hiBits, false);
  view.setUint32(paddedLen - 4, loBits, false);

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
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
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
      const bigS1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + bigS1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const bigS0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (bigS0 + maj) >>> 0;

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
    hex += words[i].toString(16).padStart(8, "0");
  }
  return hex;
}

function quantizeCoord(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.000000";
  }
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return normalized.toFixed(6);
}

/**
 * 변형된 캐릭터 포즈 메쉬·핸들·왜곡 지표를 정규 직렬화해 결정론적 SHA-256 포즈 지문을 생성한다.
 */
export function computeArapPoseFingerprint(
  mesh: ArapMesh2d,
  deformedPositions: readonly Vec2[],
  handles: readonly ArapPinHandle[],
  audit: ArapDistortionAudit,
): string {
  const parts: string[] = [
    `wave159:v1`,
    `mesh:${mesh.id}:${mesh.vertices.length}:${mesh.triangles.length}`,
    `audit:${audit.status}:${audit.invertedTriangleCount}:${quantizeCoord(audit.minStretchRatio)}:${quantizeCoord(audit.maxStretchRatio)}`,
  ];

  for (let i = 0; i < deformedPositions.length; i += 1) {
    parts.push(`v${i}:${quantizeCoord(deformedPositions[i].x)},${quantizeCoord(deformedPositions[i].y)}`);
  }

  for (let h = 0; h < handles.length; h += 1) {
    const hd = handles[h];
    parts.push(
      `h${h}:${hd.id}:${hd.vertexIndex}:${quantizeCoord(hd.target.x)},${quantizeCoord(hd.target.y)}:${quantizeCoord(hd.weight)}`,
    );
  }

  return sha256ArapHex(parts.join("|"));
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return normalized.toFixed(digits);
}

function distortionFillOklch(score: number, inverted: boolean): string {
  if (inverted) {
    return "oklch(0.62 0.21 24 / 0.68)";
  }
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  if (clamped < 0.22) {
    return "oklch(0.84 0.06 160 / 0.34)";
  }
  if (clamped < 0.55) {
    return "oklch(0.85 0.13 84 / 0.44)";
  }
  return "oklch(0.70 0.18 32 / 0.54)";
}

export interface RenderArapPoseAuditSvgParams {
  readonly titleKo: string;
  readonly mesh: ArapMesh2d;
  readonly deformedPositions: readonly Vec2[];
  readonly handles: readonly ArapPinHandle[];
  readonly audit: ArapDistortionAudit;
  readonly cageRest?: CagePolygon2d;
  readonly cageDeformed?: CagePolygon2d;
  readonly width?: number;
  readonly height?: number;
}

/**
 * 순수 `oklch(...)` 팔레트만으로 기준 와이어프레임, 변형 와이어프레임, 삼각형 왜곡 히트맵,
 * 핀 핸들 변위 화살표, 케이지 윤곽을 시각화한 감사 SVG 문자열을 생성한다.
 */
export function renderArapPoseAuditSvg(params: RenderArapPoseAuditSvgParams): string {
  const width = Number.isFinite(params.width) && (params.width ?? 0) > 100 ? (params.width as number) : 440;
  const height = Number.isFinite(params.height) && (params.height ?? 0) > 100 ? (params.height as number) : 420;
  const safeTitle = escapeXml(params.titleKo);
  const invertedSet = new Set<number>(params.audit.invertedTriangleIndices);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(width, 0)} ${fmtNum(height, 0)}" width="${fmtNum(width, 0)}" height="${fmtNum(height, 0)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <defs>`,
    `    <marker id="arap-handle-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="oklch(0.48 0.16 250)" />`,
    `    </marker>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${fmtNum(width, 0)}" height="${fmtNum(height, 0)}" rx="14" fill="oklch(0.98 0.008 92)" stroke="oklch(0.38 0.04 162 / 0.18)" stroke-width="1.5" />`,
    `  <text x="20" y="28" font-family="sans-serif" font-size="13" font-weight="600" fill="oklch(0.24 0.03 162)">${safeTitle}</text>`,
    `  <text x="20" y="45" font-family="sans-serif" font-size="10.5" fill="oklch(0.48 0.02 95)">상태 ${escapeXml(params.audit.status)} · 뒤집힘 ${params.audit.invertedTriangleCount}개 · 신축 ${fmtNum(params.audit.minStretchRatio)}~${fmtNum(params.audit.maxStretchRatio)}x</text>`,
  ];

  // 1. 선택적 케이지 윤곽(기준 점선 + 변형 실선)
  if (params.cageRest && params.cageRest.vertices.length >= 3) {
    const restPts = params.cageRest.vertices
      .map((p) => `${fmtNum(p.x)},${fmtNum(p.y)}`)
      .join(" ");
    lines.push(
      `  <polygon points="${restPts}" fill="none" stroke="oklch(0.62 0.08 295 / 0.40)" stroke-width="1.2" stroke-dasharray="5 4" />`,
    );
  }
  if (params.cageDeformed && params.cageDeformed.vertices.length >= 3) {
    const defPts = params.cageDeformed.vertices
      .map((p) => `${fmtNum(p.x)},${fmtNum(p.y)}`)
      .join(" ");
    lines.push(
      `  <polygon points="${defPts}" fill="none" stroke="oklch(0.52 0.13 295 / 0.72)" stroke-width="1.4" />`,
    );
  }

  // 2. 기준(Rest) 와이어프레임 고스트 레이어
  lines.push(`  <g id="rest-wireframe" fill="none" stroke="oklch(0.58 0.02 95 / 0.36)" stroke-width="0.9" stroke-dasharray="3 3">`);
  for (let t = 0; t < params.mesh.triangles.length; t += 1) {
    const [a, b, c] = params.mesh.triangles[t];
    const va = params.mesh.vertices[a];
    const vb = params.mesh.vertices[b];
    const vc = params.mesh.vertices[c];
    lines.push(
      `    <polygon points="${fmtNum(va.x)},${fmtNum(va.y)} ${fmtNum(vb.x)},${fmtNum(vb.y)} ${fmtNum(vc.x)},${fmtNum(vc.y)}" />`,
    );
  }
  lines.push(`  </g>`);

  // 3. 변형(Deformed) 메쉬 + OKLCH 왜곡 히트맵 레이어
  lines.push(`  <g id="deformed-wireframe" stroke="oklch(0.32 0.055 162)" stroke-width="1.15" stroke-linejoin="round">`);
  for (let t = 0; t < params.mesh.triangles.length; t += 1) {
    const [a, b, c] = params.mesh.triangles[t];
    const da = params.deformedPositions[a];
    const db = params.deformedPositions[b];
    const dc = params.deformedPositions[c];
    const score = params.audit.triangleStretchScores[t] ?? 0;
    const fill = distortionFillOklch(score, invertedSet.has(t));
    lines.push(
      `    <polygon points="${fmtNum(da.x)},${fmtNum(da.y)} ${fmtNum(db.x)},${fmtNum(db.y)} ${fmtNum(dc.x)},${fmtNum(dc.y)}" fill="${fill}" />`,
    );
  }
  lines.push(`  </g>`);

  // 4. 핀 핸들 변위 화살표 및 마커 레이어
  lines.push(`  <g id="pin-handles">`);
  for (let h = 0; h < params.handles.length; h += 1) {
    const handle = params.handles[h];
    if (handle.vertexIndex < 0 || handle.vertexIndex >= params.mesh.vertices.length) {
      continue;
    }
    const rest = params.mesh.vertices[handle.vertexIndex];
    const target = handle.target;
    const moveDist = Math.hypot(target.x - rest.x, target.y - rest.y);
    const markerColor = handle.locked ? "oklch(0.36 0.08 162)" : "oklch(0.48 0.16 250)";

    if (moveDist > 1.5) {
      lines.push(
        `    <line x1="${fmtNum(rest.x)}" y1="${fmtNum(rest.y)}" x2="${fmtNum(target.x)}" y2="${fmtNum(target.y)}" stroke="oklch(0.48 0.16 250)" stroke-width="1.8" marker-end="url(#arap-handle-arrow)" />`,
      );
    }
    lines.push(
      `    <circle cx="${fmtNum(target.x)}" cy="${fmtNum(target.y)}" r="4.2" fill="${markerColor}" stroke="oklch(0.99 0.004 92)" stroke-width="1.4"><title>${escapeXml(handle.labelKo)}</title></circle>`,
    );
  }
  lines.push(`  </g>`);

  // 5. 하단 범례
  const legendY = height - 20;
  lines.push(
    `  <g id="legend" font-family="sans-serif" font-size="10" fill="oklch(0.42 0.02 95)">`,
    `    <rect x="20" y="${fmtNum(legendY - 9, 0)}" width="10" height="10" rx="2" fill="oklch(0.84 0.06 160 / 0.55)" />`,
    `    <text x="35" y="${fmtNum(legendY, 0)}">안정 변형</text>`,
    `    <rect x="96" y="${fmtNum(legendY - 9, 0)}" width="10" height="10" rx="2" fill="oklch(0.85 0.13 84 / 0.65)" />`,
    `    <text x="111" y="${fmtNum(legendY, 0)}">신축 주의</text>`,
    `    <rect x="172" y="${fmtNum(legendY - 9, 0)}" width="10" height="10" rx="2" fill="oklch(0.62 0.21 24 / 0.72)" />`,
    `    <text x="187" y="${fmtNum(legendY, 0)}">접힘/과신축</text>`,
    `  </g>`,
    `</svg>`,
  );

  return lines.join("\n");
}

export interface SummarizeArapPoseAuditParams {
  readonly arapResult: SafeArapSolveResult;
  readonly boneSolution?: BoneChainPoseSolution | null;
  readonly wgslValid?: boolean;
}

/**
 * 스튜디오 작가와 QA 담당자가 바로 판단할 수 있는 자연스러운 한국어 품질 요약을 생성한다.
 */
export function summarizeArapPoseAuditKo(params: SummarizeArapPoseAuditParams): string {
  const { arapResult, boneSolution, wgslValid } = params;
  const audit = arapResult.audit;
  const status = wgslValid === false ? "FAIL" : audit.status;
  const iterCount = arapResult.iterations.length;
  const stretchRange = `${fmtNum(audit.minStretchRatio)}~${fmtNum(audit.maxStretchRatio)}배`;

  const sentences: string[] = [];

  if (status === "PASS") {
    sentences.push(
      `[PASS] 캐릭터 포즈 보정이 안정적으로 끝났습니다. 뒤집힌 삼각형이 없고(0개), 선분 신축 비율이 ${stretchRange} 범위로 고르게 유지됐습니다(반복 ${iterCount}회, 최종 에너지 ${fmtNum(arapResult.finalEnergy, 4)}).`,
    );
  } else if (status === "WARN") {
    sentences.push(
      `[WARN] 메쉬 접힘은 없지만 일부 관절 부근 신축이 큽니다(선분 신축 ${stretchRange}, 면적비 ${fmtNum(audit.minAreaRatio)}~${fmtNum(audit.maxAreaRatio)}배). 핸들 이동 폭을 줄이거나 보조 고정 핀을 추가해 주세요.`,
    );
  } else {
    const reasonParts: string[] = [];
    if (audit.invertedTriangleCount > 0) {
      reasonParts.push(`뒤집힌 삼각형 ${audit.invertedTriangleCount}개`);
    }
    if (audit.maxStretchRatio > 1.75 || audit.minStretchRatio < 0.45) {
      reasonParts.push(`선분 신축 ${stretchRange}`);
    }
    if (wgslValid === false) {
      reasonParts.push("WGSL 셰이더 계약 오류");
    }
    sentences.push(
      `[FAIL] 포즈 워프 품질 기준을 벗어났습니다(${reasonParts.join(", ")}). 안전 감쇠를 적용하거나 핀 배치를 다시 조정해야 합니다.`,
    );
  }

  if (arapResult.dampingTriggered) {
    const pct = fmtNum(arapResult.appliedDisplacementScale * 100, 1);
    sentences.push(
      `원본 핸들 변위에서 뒤집힘 ${arapResult.rawInvertedTriangleCount}개가 발견돼 안전 감쇠가 작동했고, 이동량을 ${pct}%로 낮춰 메쉬 접힘을 해소했습니다.`,
    );
  }

  if (boneSolution && boneSolution.clampedCount > 0) {
    sentences.push(
      `해부학 관절 한계를 넘긴 본 ${boneSolution.clampedCount}개를 허용 각도 안으로 제한했습니다.`,
    );
  }

  return sentences.join(" ");
}
