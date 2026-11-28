/**
 * Wave 132 — AI 무단 학습 거부(TDM / C2PA Do-Not-Train) 정책 매니페스트
 * 및 WebGPU WGSL 8×8 DCT 중주파 워터마크 커널 생성·검증기.
 */

import { canonicalizeJsonForHash, sha256Hex } from "./forensic-crypto-sha256";
import {
  ForensicWatermarkError,
  MID_BAND_DCT_PAIRS,
  type AntiScrapeRightsManifest,
  type AntiScrapeRightsSpec,
  type ForensicWatermarkWgslArtifact,
  type ForensicWatermarkWgslValidationResult,
  type ForensicWgslBindingSpec,
} from "./forensic-watermark-types";

export {
  bytesToHexLower,
  canonicalizeJsonForHash,
  encodeUtf8Pure,
  sha256Bytes,
  sha256Hex,
} from "./forensic-crypto-sha256";

function escapeXmlPacketText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function assertNonEmptyField(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ForensicWatermarkError(
      "INVALID_MANIFEST_INPUT",
      `${fieldName} 필드는 비워 둘 수 없습니다.`,
    );
  }
  return trimmed;
}

/**
 * W3C TDM Reservation (`tdm-reservation: 1`) 및 C2PA 2.x Do-Not-Train (`c2pa.training-mining: notAllowed`)
 * 선언과 HTTP·PNG·WebP 메타데이터, FIPS 180-4 SHA-256 봉인 해시를 결정론적으로 생성한다.
 */
export function compileAntiScrapeRightsManifest(
  spec: AntiScrapeRightsSpec,
): AntiScrapeRightsManifest {
  const workTitle = assertNonEmptyField(spec.workTitle, "workTitle");
  const creatorId = assertNonEmptyField(spec.creatorId, "creatorId");
  const episodeId = assertNonEmptyField(spec.episodeId, "episodeId");
  const recipientId = assertNonEmptyField(spec.recipientId, "recipientId");
  const rightsHolder = assertNonEmptyField(spec.rightsHolder, "rightsHolder");
  const issuedDate = assertNonEmptyField(spec.issuedDate, "issuedDate");
  const payloadHex = assertNonEmptyField(spec.watermarkPayloadHex, "watermarkPayloadHex").toLowerCase();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)) {
    throw new ForensicWatermarkError(
      "INVALID_MANIFEST_INPUT",
      `issuedDate는 YYYY-MM-DD 형식이어야 합니다 (입력: ${issuedDate}).`,
    );
  }
  if (!/^[0-9a-f]{4,16}$/.test(payloadHex)) {
    throw new ForensicWatermarkError(
      "INVALID_MANIFEST_INPUT",
      `watermarkPayloadHex는 4~16자리 16진수여야 합니다 (입력: ${payloadHex}).`,
    );
  }
  if (spec.policyUrl !== undefined) {
    const trimmedUrl = spec.policyUrl.trim();
    if (!/^https:\/\/[^\s<>"]+$/.test(trimmedUrl)) {
      throw new ForensicWatermarkError(
        "INVALID_MANIFEST_INPUT",
        "policyUrl은 공백이나 제어 문자 없는 https:// 주소여야 합니다.",
      );
    }
  }

  const sortedTags: Record<string, string> = {};
  if (spec.additionalTags) {
    const tagKeys = Object.keys(spec.additionalTags).sort();
    for (let i = 0; i < tagKeys.length; i += 1) {
      const k = tagKeys[i];
      sortedTags[k] = String(spec.additionalTags[k]);
    }
  }

  const originalAssetSha256Hex = spec.originalPixels
    ? sha256Hex(spec.originalPixels)
    : sha256Hex(`original:${creatorId}|${episodeId}|${workTitle}`);

  const watermarkedAssetSha256Hex = spec.watermarkedPixels
    ? sha256Hex(spec.watermarkedPixels)
    : sha256Hex(`watermarked:${creatorId}|${episodeId}|${recipientId}|${payloadHex}`);

  const c2paEntries: Readonly<Record<string, { readonly use: "notAllowed" }>> = {
    "c2pa.ai_generative_training": { use: "notAllowed" },
    "c2pa.ai_inference": { use: "notAllowed" },
    "c2pa.ai_training": { use: "notAllowed" },
    "c2pa.data_mining": { use: "notAllowed" },
  };

  const c2paTrainingMining = {
    label: "c2pa.training-mining" as const,
    summaryPolicy: "notAllowed" as const,
    entries: c2paEntries,
  };

  const coreManifestBody = {
    schemaVersion: "toonstudio.anti-scrape.v1",
    tdmReservation: 1,
    c2paTrainingMining,
    workTitle,
    creatorId,
    episodeId,
    recipientId,
    rightsHolder,
    issuedDate,
    watermarkPayloadHex: payloadHex,
    policyUrl: spec.policyUrl ? spec.policyUrl.trim() : null,
    originalAssetSha256Hex,
    watermarkedAssetSha256Hex,
    additionalTags: sortedTags,
  };

  const canonicalManifestJson = canonicalizeJsonForHash(coreManifestBody);
  const manifestSha256Hex = sha256Hex(canonicalManifestJson);

  const policyAttr = spec.policyUrl
    ? ` tdm:policy="${escapeXmlPacketText(spec.policyUrl.trim())}"`
    : "";

  const xmpPacket = [
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">`,
    `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"`,
    `           xmlns:tdm="http://www.w3.org/ns/tdmrep#"`,
    `           xmlns:c2pa="https://c2pa.org/specifications/ns/1.0/"`,
    `           xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"`,
    `           xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    `    <rdf:Description rdf:about=""`,
    `      tdm:reservation="1"${policyAttr}`,
    `      c2pa:training-mining="notAllowed"`,
    `      plus:DataMining="http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED"`,
    `      dc:title="${escapeXmlPacketText(workTitle)}"`,
    `      dc:rights="${escapeXmlPacketText(rightsHolder)}">`,
    `      <c2pa:manifestSha256>${manifestSha256Hex}</c2pa:manifestSha256>`,
    `      <c2pa:watermarkPayloadHex>${payloadHex}</c2pa:watermarkPayloadHex>`,
    `    </rdf:Description>`,
    `  </rdf:RDF>`,
    `</x:xmpmeta>`,
    `<?xpacket end="r"?>`,
  ].join("\n");

  const httpHeaders: Record<string, string> = {
    "TDM-Reservation": "1",
    "C2PA-Training-Mining": "notAllowed",
    "X-Robots-Tag": "noai, noimageai",
    "X-ToonStudio-Watermark-Payload": payloadHex,
    "X-ToonStudio-Manifest-SHA256": manifestSha256Hex,
  };
  if (spec.policyUrl) {
    httpHeaders["TDM-Policy"] = spec.policyUrl.trim();
  }

  const pngMetadataChunks: readonly {
    readonly chunkType: "tEXt" | "iTXt";
    readonly keyword: string;
    readonly value: string;
  }[] = [
    { chunkType: "tEXt", keyword: "tdm-reservation", value: "1" },
    { chunkType: "tEXt", keyword: "c2pa.training-mining", value: "notAllowed" },
    { chunkType: "tEXt", keyword: "ToonStudio-Forensic-Payload", value: payloadHex },
    { chunkType: "tEXt", keyword: "ToonStudio-Manifest-SHA256", value: manifestSha256Hex },
    { chunkType: "iTXt", keyword: "XML:com.adobe.xmp", value: xmpPacket },
  ];

  return {
    schemaVersion: "toonstudio.anti-scrape.v1",
    tdmReservation: 1,
    c2paTrainingMining,
    httpHeaders,
    pngMetadataChunks,
    webpMetadata: {
      chunkFourCC: "XMP ",
      xmpPacket,
      directives: {
        tdmReservation: 1,
        c2paTrainingMining: "notAllowed",
        robotsAi: "noai, noimageai",
      },
    },
    originalAssetSha256Hex,
    watermarkedAssetSha256Hex,
    canonicalManifestJson,
    manifestSha256Hex,
  };
}

/**
 * 16바이트 정렬 64B 유니폼과 워크그룹 공유 메모리 8×8 DCT-II/IDCT-II 중주파
 * 워터마크 삽입·블라인드 검출 컴퓨트 셰이더(WGSL)를 생성한다.
 */
export function buildForensicWatermarkWgsl(): ForensicWatermarkWgslArtifact {
  const bindings: readonly ForensicWgslBindingSpec[] = [
    { group: 0, binding: 0, name: "u_watermark", addressSpace: "uniform", strideBytes: 64 },
    { group: 0, binding: 1, name: "src_luma", addressSpace: "storage-read", strideBytes: 16 },
    { group: 0, binding: 2, name: "dst_luma", addressSpace: "storage-read-write", strideBytes: 16 },
    { group: 0, binding: 3, name: "vote_accum", addressSpace: "storage-read-write", strideBytes: 16 },
  ];

  const p0 = MID_BAND_DCT_PAIRS[0];
  const p1 = MID_BAND_DCT_PAIRS[1];
  const p2 = MID_BAND_DCT_PAIRS[2];
  const p3 = MID_BAND_DCT_PAIRS[3];

  const wgsl = `// Wave 132 — 8x8 DCT-II Mid-Band Forensic Watermark Embed & Blind Detect Compute WGSL
struct ForensicWatermarkUniforms {
  tile_dims_and_blocks: vec4<u32>,
  strength_and_margins: vec4<f32>,
  pair23_and_scale: vec4<f32>,
  key_seed_and_codeword: vec4<u32>,
};

@group(0) @binding(0)
var<uniform> u_watermark: ForensicWatermarkUniforms;

@group(0) @binding(1)
var<storage, read> src_luma: array<vec4<f32>>;

@group(0) @binding(2)
var<storage, read_write> dst_luma: array<vec4<f32>>;

@group(0) @binding(3)
var<storage, read_write> vote_accum: array<vec4<f32>>;

var<workgroup> wg_spatial: array<f32, 64>;
var<workgroup> wg_temp: array<f32, 64>;
var<workgroup> wg_dct: array<f32, 64>;

const PI_OVER_16: f32 = 0.19634954084936207;
const INV_SQRT_8: f32 = 0.3535533905932738;
const INV_TWO: f32 = 0.5;

fn dct_basis(k: u32, n: u32) -> f32 {
  let alpha = select(INV_TWO, INV_SQRT_8, k == 0u);
  return alpha * cos(PI_OVER_16 * f32(2u * n + 1u) * f32(k));
}

fn key_slot_sign(slot_idx: u32, seed_lo: u32, seed_hi: u32) -> f32 {
  var h = (slot_idx * 747796405u) ^ (seed_lo * 2891336453u) ^ (seed_hi + 277803737u);
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return select(-1.0, 1.0, (h & 1u) == 1u);
}

fn read_luma_pixel(px: u32, py: u32, width: u32) -> f32 {
  let linear = py * width + px;
  let packed = src_luma[linear >> 2u];
  let lane = linear & 3u;
  if (lane == 0u) { return packed.x; }
  if (lane == 1u) { return packed.y; }
  if (lane == 2u) { return packed.z; }
  return packed.w;
}

fn apply_pair_margin(idx_a: u32, idx_b: u32, polarity: f32, margin: f32, max_delta: f32) {
  let c1 = wg_dct[idx_a];
  let c2 = wg_dct[idx_b];
  let signed_diff = polarity * (c1 - c2);
  if (signed_diff < margin && signed_diff >= -(margin * 1.5)) {
    let shift = min(max_delta, (margin - signed_diff) * 0.5);
    wg_dct[idx_a] = c1 + polarity * shift;
    wg_dct[idx_b] = c2 - polarity * shift;
  }
}

fn run_forward_dct_8x8(lx: u32, ly: u32) {
  let local_idx = ly * 8u + lx;
  var row_sum = 0.0;
  for (var x: u32 = 0u; x < 8u; x = x + 1u) {
    row_sum = row_sum + wg_spatial[ly * 8u + x] * dct_basis(lx, x);
  }
  wg_temp[local_idx] = row_sum;
  workgroupBarrier();

  var col_sum = 0.0;
  for (var y: u32 = 0u; y < 8u; y = y + 1u) {
    col_sum = col_sum + wg_temp[y * 8u + lx] * dct_basis(ly, y);
  }
  wg_dct[local_idx] = col_sum;
  workgroupBarrier();
}

@compute @workgroup_size(8, 8, 1)
fn cs_dct8x8_embed_watermark(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let width = u_watermark.tile_dims_and_blocks.x;
  let blocks_x = u_watermark.tile_dims_and_blocks.z;
  let blocks_y = u_watermark.tile_dims_and_blocks.w;
  if (wid.x >= blocks_x || wid.y >= blocks_y) { return; }

  let lx = lid.x;
  let ly = lid.y;
  let local_idx = ly * 8u + lx;
  let px = wid.x * 8u + lx;
  let py = wid.y * 8u + ly;

  wg_spatial[local_idx] = read_luma_pixel(px, py, width);
  workgroupBarrier();
  run_forward_dct_8x8(lx, ly);

  if (local_idx == 0u) {
    let mx = wid.x & 3u;
    let my = wid.y & 3u;
    let antipodal_x = mx & 1u;
    let antipodal_y = select(my, (my + 2u) & 3u, mx >= 2u);
    let slot_base = (my * 4u + mx) * 4u;
    let bit_base = (antipodal_y * 2u + antipodal_x) * 4u;
    let codeword = u_watermark.key_seed_and_codeword.z;
    let seed_lo = u_watermark.key_seed_and_codeword.x;
    let seed_hi = u_watermark.key_seed_and_codeword.y;
    let strength = u_watermark.strength_and_margins.x;
    let max_d = u_watermark.strength_and_margins.w * strength;

    let b0 = select(-1.0, 1.0, ((codeword >> ((bit_base + 0u) & 31u)) & 1u) == 1u);
    let b1 = select(-1.0, 1.0, ((codeword >> ((bit_base + 1u) & 31u)) & 1u) == 1u);
    let b2 = select(-1.0, 1.0, ((codeword >> ((bit_base + 2u) & 31u)) & 1u) == 1u);
    let b3 = select(-1.0, 1.0, ((codeword >> ((bit_base + 3u) & 31u)) & 1u) == 1u);

    apply_pair_margin(${p0.first.v * 8 + p0.first.u}u, ${p0.second.v * 8 + p0.second.u}u, key_slot_sign(slot_base + 0u, seed_lo, seed_hi) * b0, u_watermark.strength_and_margins.y * strength, max_d);
    apply_pair_margin(${p1.first.v * 8 + p1.first.u}u, ${p1.second.v * 8 + p1.second.u}u, key_slot_sign(slot_base + 1u, seed_lo, seed_hi) * b1, u_watermark.strength_and_margins.z * strength, max_d);
    apply_pair_margin(${p2.first.v * 8 + p2.first.u}u, ${p2.second.v * 8 + p2.second.u}u, key_slot_sign(slot_base + 2u, seed_lo, seed_hi) * b2, u_watermark.pair23_and_scale.x * strength, max_d);
    apply_pair_margin(${p3.first.v * 8 + p3.first.u}u, ${p3.second.v * 8 + p3.second.u}u, key_slot_sign(slot_base + 3u, seed_lo, seed_hi) * b3, u_watermark.pair23_and_scale.y * strength, max_d);
  }
  workgroupBarrier();

  var idct_row = 0.0;
  for (var u: u32 = 0u; u < 8u; u = u + 1u) {
    idct_row = idct_row + wg_dct[ly * 8u + u] * dct_basis(u, lx);
  }
  wg_temp[local_idx] = idct_row;
  workgroupBarrier();

  var idct_col = 0.0;
  for (var v: u32 = 0u; v < 8u; v = v + 1u) {
    idct_col = idct_col + wg_temp[v * 8u + lx] * dct_basis(v, ly);
  }
  wg_spatial[local_idx] = round(clamp(idct_col, 0.0, 255.0));
  workgroupBarrier();

  if ((lx & 3u) == 0u) {
    let base = (py * width + px) >> 2u;
    dst_luma[base] = clamp(
      vec4<f32>(wg_spatial[local_idx], wg_spatial[local_idx + 1u], wg_spatial[local_idx + 2u], wg_spatial[local_idx + 3u]),
      vec4<f32>(0.0),
      vec4<f32>(255.0),
    );
  }
}

@compute @workgroup_size(8, 8, 1)
fn cs_dct8x8_detect_watermark(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let width = u_watermark.tile_dims_and_blocks.x;
  let blocks_x = u_watermark.tile_dims_and_blocks.z;
  let blocks_y = u_watermark.tile_dims_and_blocks.w;
  if (wid.x >= blocks_x || wid.y >= blocks_y) { return; }

  let lx = lid.x;
  let ly = lid.y;
  let local_idx = ly * 8u + lx;
  wg_spatial[local_idx] = read_luma_pixel(wid.x * 8u + lx, wid.y * 8u + ly, width);
  workgroupBarrier();
  run_forward_dct_8x8(lx, ly);

  if (local_idx == 0u) {
    let block_linear = wid.y * blocks_x + wid.x;
    let slot_base = ((wid.y & 3u) * 4u + (wid.x & 3u)) * 4u;
    let seed_lo = u_watermark.key_seed_and_codeword.x;
    let seed_hi = u_watermark.key_seed_and_codeword.y;
    let soft_scale = max(u_watermark.pair23_and_scale.z, 1.0);

    let v0 = tanh(key_slot_sign(slot_base + 0u, seed_lo, seed_hi) * (wg_dct[${p0.first.v * 8 + p0.first.u}u] - wg_dct[${p0.second.v * 8 + p0.second.u}u]) / soft_scale);
    let v1 = tanh(key_slot_sign(slot_base + 1u, seed_lo, seed_hi) * (wg_dct[${p1.first.v * 8 + p1.first.u}u] - wg_dct[${p1.second.v * 8 + p1.second.u}u]) / soft_scale);
    let v2 = tanh(key_slot_sign(slot_base + 2u, seed_lo, seed_hi) * (wg_dct[${p2.first.v * 8 + p2.first.u}u] - wg_dct[${p2.second.v * 8 + p2.second.u}u]) / soft_scale);
    let v3 = tanh(key_slot_sign(slot_base + 3u, seed_lo, seed_hi) * (wg_dct[${p3.first.v * 8 + p3.first.u}u] - wg_dct[${p3.second.v * 8 + p3.second.u}u]) / soft_scale);
    vote_accum[block_linear] = vec4<f32>(v0, v1, v2, v3);
  }
}
`;

  return {
    wgsl,
    uniformBufferByteLength: 64,
    voteBufferStrideBytes: 16,
    workgroupSize: [8, 8, 1],
    bindings,
    entryPoints: ["cs_dct8x8_embed_watermark", "cs_dct8x8_detect_watermark"],
  };
}

/**
 * Wave 132 8×8 DCT 포렌식 워터마크 WGSL 셰이더의 구조, 바인딩, 16바이트 정렬,
 * 괄호 균형, 비유한 토큰 및 금지 GLSL 키워드 혼입 여부를 검증한다.
 */
export function validateForensicWatermarkWgsl(
  input: ForensicWatermarkWgslArtifact | string,
): ForensicWatermarkWgslValidationResult {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];

  if (!wgsl || wgsl.trim().length === 0) {
    return { valid: false, errors: ["WGSL source is empty."], lineCount: 0, bindingCount: 0 };
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < wgsl.length; i += 1) {
    const ch = wgsl[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      errors.push("Unbalanced delimiter encountered in WGSL source.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`Unbalanced curly braces (depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`Unbalanced parentheses (depth=${parenDepth}).`);
  if (bracketDepth !== 0) errors.push(`Unbalanced square brackets (depth=${bracketDepth}).`);

  const bindingMatches = wgsl.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? [];
  for (let b = 0; b < 4; b += 1) {
    if (!new RegExp(`@group\\(0\\)\\s*@binding\\(${b}\\)`).test(wgsl)) {
      errors.push(`Missing required @group(0) @binding(${b}) declaration.`);
    }
  }

  if (!/@compute\s+@workgroup_size\(8,\s*8,\s*1\)/.test(wgsl)) {
    errors.push("Missing @compute @workgroup_size(8, 8, 1) declaration for 8x8 DCT blocks.");
  }
  if (!/\bworkgroupBarrier\s*\(\s*\)/.test(wgsl)) {
    errors.push("Missing workgroupBarrier() synchronization for shared 8x8 DCT tile.");
  }
  if (!/\bcos\s*\(/.test(wgsl)) errors.push("Missing cos() DCT-II basis evaluation.");
  if (!/\btanh\s*\(/.test(wgsl)) errors.push("Missing tanh() bounded soft-vote correlation operator.");
  if (!/\bfn\s+cs_dct8x8_embed_watermark\s*\(/.test(wgsl)) {
    errors.push("Missing cs_dct8x8_embed_watermark entry point.");
  }
  if (!/\bfn\s+cs_dct8x8_detect_watermark\s*\(/.test(wgsl)) {
    errors.push("Missing cs_dct8x8_detect_watermark entry point.");
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL contains non-finite or undefined token.");
  }
  if (
    /\b(?:gl_FragColor|gl_Position|gl_GlobalInvocationID|dFdx|dFdy|texture2D|sampler2D|varying|attribute|shared\s+float|uniform\s+float)\b/.test(
      wgsl,
    ) ||
    /\blayout\s*\(/.test(wgsl)
  ) {
    errors.push("WGSL contains forbidden GLSL keyword or syntax.");
  }

  if (typeof input !== "string") {
    if (
      !Number.isInteger(input.uniformBufferByteLength) ||
      input.uniformBufferByteLength !== 64 ||
      input.uniformBufferByteLength % 16 !== 0
    ) {
      errors.push("uniformBufferByteLength must be 16-byte aligned and exactly 64 bytes.");
    }
    if (
      !Number.isInteger(input.voteBufferStrideBytes) ||
      input.voteBufferStrideBytes < 16 ||
      input.voteBufferStrideBytes % 16 !== 0
    ) {
      errors.push("voteBufferStrideBytes must be a positive multiple of 16 bytes.");
    }
    for (let i = 0; i < input.bindings.length; i += 1) {
      const spec = input.bindings[i];
      if (!Number.isInteger(spec.strideBytes) || spec.strideBytes < 16 || spec.strideBytes % 16 !== 0) {
        errors.push(`Binding '${spec.name}' strideBytes (${spec.strideBytes}) is not 16-byte aligned.`);
      }
    }
    for (let i = 0; i < input.entryPoints.length; i += 1) {
      const ep = input.entryPoints[i];
      if (!new RegExp(`fn\\s+${ep}\\s*\\(`).test(wgsl)) {
        errors.push(`Declared entry point '${ep}' not found in WGSL source.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: wgsl.split("\n").length,
    bindingCount: bindingMatches.length,
  };
}
