/**
 * 순수 TypeScript FIPS 180-4 SHA-256 · 결정론적 정규화 JSON · WGSL 정적 검증 ·
 * `.tspack.json` 서명 생성(`createSignedTeamStylePack`) 및 변조 진단(`verifyTeamStylePackIntegrity`).
 */

import {
  PACK_SECTION_KEYS,
  ROYALTY_TOTAL_BPS,
  TSBRUSH_COMPAT_FORMAT_ID,
  TSBRUSH_COMPAT_SCHEMA_VERSION,
  TSPACK_CANONICALIZATION_ID,
  TSPACK_FORMAT_ID,
  TSPACK_HASH_ALGORITHM,
  TSPACK_SCHEMA_VERSION,
  WGSL_UNIFORM_BYTE_LENGTH,
  type CreateTeamStylePackInput,
  type ElementDigestMismatch,
  type PackBrushRecipe,
  type PackRightsBom,
  type PackSectionDigests,
  type PackSectionKey,
  type PackShaderStageMode,
  type PackWgslValidationSummary,
  type SectionIntegrityDiagnostic,
  type SignedPackBrushEntry,
  type SignedTeamStylePack,
  type TeamStylePackIntegrityReport,
  type TeamStylePackManifest,
  type TeamWgslShaderRecipe,
  type TeamWgslShaderRecipeInput,
} from "./types";

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

export const HEX_64_PATTERN = /^[0-9a-f]{64}$/u;

const SECTION_LABELS: Readonly<Record<PackSectionKey, readonly [string, string]>> = Object.freeze({
  metadata: ["팩 메타데이터", "Pack Metadata"],
  styleDna: ["화풍 DNA · 팔레트", "Style DNA & Palette"],
  brushes: ["커스텀 브러시 번들", "Custom Brush Bundle"],
  shaders: ["WGSL 셰이더 레시피", "WGSL Shader Recipes"],
  rightsBom: ["권리 BOM · 라이선스", "Rights BOM & License"],
});

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** 순수 동기식 FIPS 180-4 SHA-256 64자리 소문자 16진수 다이제스트. */
export function computeSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
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
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
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
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
}

/** 키 정렬·`-0` 정규화를 적용하되 부동소수점 비트를 손실 없이 보존하는 정규화 JSON 변환기. */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (isPlainRecord(value)) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const key of keys) {
      const entry = value[key];
      if (entry !== undefined) sorted[key] = canonicalizeJsonValue(entry);
    }
    return sorted;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function hashCanonical(value: unknown): string {
  return computeSha256Hex(serializeCanonicalJson(value));
}

/** WGSL 소스의 `@compute`/`@fragment` 진입점, 바인딩, uniform 구조체, 괄호 균형을 검증한다. */
export function validatePackWgslSource(source: string, stage: PackShaderStageMode): PackWgslValidationSummary {
  const errors: string[] = [];
  if (typeof source !== "string" || source.trim().length === 0) {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(["WGSL source is empty"]),
      stage,
      entryPoint: stage === "compute" ? "main" : "fs_main",
      lineCount: 0,
      bindingCount: 0,
      uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
    });
  }
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0) errors.push("Unmatched closing brace '}'");
    if (parenDepth < 0) errors.push("Unmatched closing paren ')'");
  }
  if (braceDepth !== 0) errors.push(`Unbalanced braces (depth=${braceDepth})`);
  if (parenDepth !== 0) errors.push(`Unbalanced parentheses (depth=${parenDepth})`);
  if (!source.includes("struct NoCodeShaderUniforms")) errors.push("Missing NoCodeShaderUniforms struct");
  if (/\b(?:NaN|Infinity|undefined)\b/u.test(source)) errors.push("Contains non-finite literal");

  const bindings = source.match(/@group\(\d+\)\s*@binding\(\d+\)/gu) ?? [];
  if (bindings.length < 3) errors.push(`Expected >= 3 bindings, got ${bindings.length}`);

  const entryPoint = stage === "compute" ? "main" : "fs_main";
  if (stage === "compute") {
    if (!/@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+/u.test(source)) {
      errors.push("Missing @compute @workgroup_size attribute");
    }
    if (!/fn\s+main\s*\(/u.test(source)) errors.push("Missing compute entry point fn main");
  } else {
    if (!source.includes("@fragment")) errors.push("Missing @fragment attribute");
    if (!/fn\s+fs_main\s*\(/u.test(source)) errors.push("Missing fragment entry point fn fs_main");
    if (!source.includes("@vertex")) errors.push("Missing @vertex companion stage");
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    stage,
    entryPoint,
    lineCount: source.trim().split("\n").length,
    bindingCount: bindings.length,
    uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
  });
}

/** `.tsbrush.json`과 동일한 정규화 스키마로 브러시 개별 SHA-256 핑거프린트를 계산한다. */
export function computePackBrushFingerprintSha256(recipe: PackBrushRecipe): string {
  return hashCanonical({
    format: TSBRUSH_COMPAT_FORMAT_ID,
    schemaVersion: TSBRUSH_COMPAT_SCHEMA_VERSION,
    recipe,
  });
}

export function buildSignedPackBrushEntry(recipe: PackBrushRecipe): SignedPackBrushEntry {
  return Object.freeze({
    format: TSBRUSH_COMPAT_FORMAT_ID,
    schemaVersion: TSBRUSH_COMPAT_SCHEMA_VERSION,
    fingerprintAlgorithm: TSPACK_HASH_ALGORITHM,
    fingerprintSha256: computePackBrushFingerprintSha256(recipe),
    recipe,
  });
}

export function buildSignedWgslShaderRecipe(input: TeamWgslShaderRecipeInput): TeamWgslShaderRecipe {
  const validation = validatePackWgslSource(input.wgslSource, input.stage);
  const wgslSha256 = computeSha256Hex(input.wgslSource);
  return Object.freeze({ ...input, wgslSha256, validation });
}

export function auditRightsBom(rightsBom: PackRightsBom): {
  readonly totalBps: number;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  if (!rightsBom.ownerTeamHandle.trim()) issues.push("소유 팀 핸들이 비어 있습니다.");
  if (rightsBom.royaltySplits.length === 0) issues.push("로열티 분배 기여자가 1명 이상 필요합니다.");

  let totalBps = 0;
  for (const split of rightsBom.royaltySplits) {
    if (!split.handle.trim()) issues.push("기여자 핸들이 비어 있습니다.");
    if (!Number.isInteger(split.shareBps) || split.shareBps < 0 || split.shareBps > ROYALTY_TOTAL_BPS) {
      issues.push(`잘못된 로열티 비율(${split.handle}: ${String(split.shareBps)} bps)`);
    } else {
      totalBps += split.shareBps;
    }
  }
  if (totalBps !== ROYALTY_TOTAL_BPS) {
    issues.push(`로열티 분배 합계가 10,000 bps(100%)가 아닙니다(현재 ${totalBps} bps).`);
  }
  if (
    (rightsBom.licenseTier === "editorial-noncommercial" || rightsBom.licenseTier === "internal-draft-only") &&
    rightsBom.commercialUseAllowed
  ) {
    issues.push("비상업/내부 전용 라이선스 등급에 commercialUseAllowed=true가 설정되었습니다.");
  }
  for (const item of rightsBom.provenance) {
    if (!item.assetId.trim() || !item.licenseSpdx.trim()) {
      issues.push(`출처 항목 메타데이터가 불완전합니다(${item.assetId || "unknown"}).`);
    }
    if (!HEX_64_PATTERN.test(item.originHashSha256)) {
      issues.push(`출처 항목 SHA-256 형식이 잘못되었습니다(${item.assetId}).`);
    }
  }
  return Object.freeze({ totalBps, issues: Object.freeze(issues) });
}

export function computeSectionDigests(pack: {
  readonly metadata: SignedTeamStylePack["metadata"];
  readonly styleDna: SignedTeamStylePack["styleDna"];
  readonly brushes: SignedTeamStylePack["brushes"];
  readonly shaders: SignedTeamStylePack["shaders"];
  readonly rightsBom: SignedTeamStylePack["rightsBom"];
}): PackSectionDigests {
  return Object.freeze({
    metadata: hashCanonical(pack.metadata),
    styleDna: hashCanonical(pack.styleDna),
    brushes: hashCanonical(pack.brushes),
    shaders: hashCanonical(pack.shaders),
    rightsBom: hashCanonical(pack.rightsBom),
  });
}

function computeManifestRootSha256(packId: string, version: string, sectionDigests: PackSectionDigests): string {
  return hashCanonical({
    format: TSPACK_FORMAT_ID,
    schemaVersion: TSPACK_SCHEMA_VERSION,
    packId,
    version,
    sectionDigests,
  });
}

function computePackSealSha256(
  pack: {
    readonly metadata: SignedTeamStylePack["metadata"];
    readonly styleDna: SignedTeamStylePack["styleDna"];
    readonly brushes: SignedTeamStylePack["brushes"];
    readonly shaders: SignedTeamStylePack["shaders"];
    readonly rightsBom: SignedTeamStylePack["rightsBom"];
  },
  sectionDigests: PackSectionDigests,
  manifestRootSha256: string,
): string {
  return hashCanonical({
    format: TSPACK_FORMAT_ID,
    schemaVersion: TSPACK_SCHEMA_VERSION,
    metadata: pack.metadata,
    styleDna: pack.styleDna,
    brushes: pack.brushes,
    shaders: pack.shaders,
    rightsBom: pack.rightsBom,
    sectionDigests,
    manifestRootSha256,
  });
}

/** 팀 화풍 DNA · 브러시 · WGSL 셰이더 · Rights BOM을 콘텐츠 주소 지정 SHA-256으로 서명한다. */
export function createSignedTeamStylePack(input: CreateTeamStylePackInput): SignedTeamStylePack {
  const rightsAudit = auditRightsBom(input.rightsBom);
  if (rightsAudit.issues.length > 0) {
    throw new Error(`Rights BOM validation failed: ${rightsAudit.issues.join("; ")}`);
  }

  const brushes = Object.freeze(input.brushes.map((recipe) => buildSignedPackBrushEntry(recipe)));
  const shaders = Object.freeze(
    input.shaders.map((shaderInput) => {
      const built = buildSignedWgslShaderRecipe(shaderInput);
      if (!built.validation.valid) {
        throw new Error(`Invalid WGSL shader "${built.id}": ${built.validation.errors.join("; ")}`);
      }
      return built;
    }),
  );

  const core = { metadata: input.metadata, styleDna: input.styleDna, brushes, shaders, rightsBom: input.rightsBom };
  const sectionDigests = computeSectionDigests(core);
  const manifestRootSha256 = computeManifestRootSha256(input.metadata.packId, input.metadata.version, sectionDigests);
  const packSealSha256 = computePackSealSha256(core, sectionDigests, manifestRootSha256);

  const manifest: TeamStylePackManifest = Object.freeze({
    algorithm: TSPACK_HASH_ALGORITHM,
    canonicalization: TSPACK_CANONICALIZATION_ID,
    sectionDigests,
    manifestRootSha256,
    packSealSha256,
    signedByHandle: input.signedByHandle,
    signedAtIso: input.signedAtIso ?? input.metadata.updatedAtIso,
  });

  return Object.freeze({
    format: TSPACK_FORMAT_ID,
    schemaVersion: TSPACK_SCHEMA_VERSION,
    metadata: input.metadata,
    styleDna: input.styleDna,
    brushes,
    shaders,
    rightsBom: input.rightsBom,
    manifest,
  });
}

/** `.tspack.json`의 스키마·5개 섹션 SHA-256·개별 브러시/WGSL 다이제스트·권리 BOM·루트 봉인을 정밀 검증한다. */
export function verifyTeamStylePackIntegrity(pack: SignedTeamStylePack): TeamStylePackIntegrityReport {
  const schemaErrors: string[] = [];
  if (pack.format !== TSPACK_FORMAT_ID) schemaErrors.push(`Unsupported format: ${String(pack.format)}`);
  if (pack.schemaVersion !== TSPACK_SCHEMA_VERSION) {
    schemaErrors.push(`Unsupported schemaVersion: ${String(pack.schemaVersion)}`);
  }
  if (pack.manifest.algorithm !== TSPACK_HASH_ALGORITHM) {
    schemaErrors.push(`Unsupported hash algorithm: ${String(pack.manifest.algorithm)}`);
  }
  if (pack.manifest.canonicalization !== TSPACK_CANONICALIZATION_ID) {
    schemaErrors.push(`Unsupported canonicalization: ${String(pack.manifest.canonicalization)}`);
  }
  if (!HEX_64_PATTERN.test(pack.manifest.manifestRootSha256)) {
    schemaErrors.push("manifestRootSha256 is not a 64-hex SHA-256 digest");
  }
  if (!HEX_64_PATTERN.test(pack.manifest.packSealSha256)) {
    schemaErrors.push("packSealSha256 is not a 64-hex SHA-256 digest");
  }

  const actualDigests = computeSectionDigests(pack);
  const mismatchedSections: PackSectionKey[] = [];
  const sectionDiagnostics: SectionIntegrityDiagnostic[] = [];

  for (const section of PACK_SECTION_KEYS) {
    const expectedSha256 = pack.manifest.sectionDigests[section] ?? "";
    const actualSha256 = actualDigests[section];
    const matched = HEX_64_PATTERN.test(expectedSha256) && expectedSha256 === actualSha256;
    const [labelKo, labelEn] = SECTION_LABELS[section];
    if (!matched) mismatchedSections.push(section);
    sectionDiagnostics.push(
      Object.freeze({
        section,
        matched,
        expectedSha256,
        actualSha256,
        detailKo: matched ? `${labelKo} 섹션 SHA-256 일치` : `${labelKo} 섹션 다이제스트 불일치(변조 감지)`,
        detailEn: matched ? `${labelEn} section SHA-256 verified` : `${labelEn} section digest mismatch (tamper detected)`,
      }),
    );
  }

  const brushDigestMismatches: ElementDigestMismatch[] = [];
  for (const entry of pack.brushes) {
    const actualSha = computePackBrushFingerprintSha256(entry.recipe);
    if (entry.fingerprintSha256 !== actualSha) {
      brushDigestMismatches.push(
        Object.freeze({ id: entry.recipe.id, expectedSha256: entry.fingerprintSha256, actualSha256: actualSha }),
      );
    }
  }

  const shaderDigestMismatches: ElementDigestMismatch[] = [];
  const shaderValidationErrors: { readonly shaderId: string; readonly errors: readonly string[] }[] = [];
  for (const shader of pack.shaders) {
    const actualWgslSha = computeSha256Hex(shader.wgslSource);
    if (shader.wgslSha256 !== actualWgslSha) {
      shaderDigestMismatches.push(
        Object.freeze({ id: shader.id, expectedSha256: shader.wgslSha256, actualSha256: actualWgslSha }),
      );
    }
    const revalidated = validatePackWgslSource(shader.wgslSource, shader.stage);
    if (!revalidated.valid) {
      shaderValidationErrors.push(Object.freeze({ shaderId: shader.id, errors: revalidated.errors }));
    }
  }

  const rightsAudit = auditRightsBom(pack.rightsBom);
  const actualManifestRootSha256 = computeManifestRootSha256(pack.metadata.packId, pack.metadata.version, actualDigests);
  const actualPackSealSha256 = computePackSealSha256(pack, actualDigests, actualManifestRootSha256);
  const manifestRootMatched = pack.manifest.manifestRootSha256 === actualManifestRootSha256;
  const packSealMatched = pack.manifest.packSealSha256 === actualPackSealSha256;

  const schemaValid = schemaErrors.length === 0;
  const valid =
    schemaValid &&
    mismatchedSections.length === 0 &&
    manifestRootMatched &&
    packSealMatched &&
    brushDigestMismatches.length === 0 &&
    shaderDigestMismatches.length === 0 &&
    shaderValidationErrors.length === 0 &&
    rightsAudit.issues.length === 0;

  const mismatchedLabelKo = mismatchedSections.map((s) => SECTION_LABELS[s][0]).join(", ");
  const mismatchedLabelEn = mismatchedSections.map((s) => SECTION_LABELS[s][1]).join(", ");

  const summaryKo = valid
    ? `SHA-256 5개 섹션 및 루트 봉인(${actualPackSealSha256.slice(0, 12)}…) 무결성 검증 통과`
    : mismatchedSections.length > 0
      ? `변조 감지 · 불일치 섹션: ${mismatchedLabelKo}`
      : rightsAudit.issues.length > 0
        ? `권리 BOM 검증 실패: ${rightsAudit.issues[0]}`
        : "매니페스트 루트 또는 하위 자산 다이제스트가 일치하지 않습니다.";

  const summaryEn = valid
    ? `SHA-256 verified across all 5 sections & root seal (${actualPackSealSha256.slice(0, 12)}…)`
    : mismatchedSections.length > 0
      ? `Tamper detected · mismatched sections: ${mismatchedLabelEn}`
      : rightsAudit.issues.length > 0
        ? `Rights BOM check failed: ${rightsAudit.issues[0]}`
        : "Manifest root seal or nested asset digest mismatch.";

  return Object.freeze({
    valid,
    schemaValid,
    manifestRootMatched,
    packSealMatched,
    expectedManifestRootSha256: pack.manifest.manifestRootSha256,
    actualManifestRootSha256,
    expectedPackSealSha256: pack.manifest.packSealSha256,
    actualPackSealSha256,
    mismatchedSections: Object.freeze(mismatchedSections),
    sectionDiagnostics: Object.freeze(sectionDiagnostics),
    brushDigestMismatches: Object.freeze(brushDigestMismatches),
    shaderDigestMismatches: Object.freeze(shaderDigestMismatches),
    shaderValidationErrors: Object.freeze(shaderValidationErrors),
    rightsTotalBps: rightsAudit.totalBps,
    rightsIssues: rightsAudit.issues,
    schemaErrors: Object.freeze(schemaErrors),
    summaryKo,
    summaryEn,
  });
}
