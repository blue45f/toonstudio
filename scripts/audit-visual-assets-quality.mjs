#!/usr/bin/env node
/**
 * 3D·2D 파일의 헤더·선언 메타데이터·파일 크기·정적 참조를 읽는 휴리스틱 감사 도구.
 * 렌더·위상·권리·동적 참조를 검증하지 않으며 에셋 수정·삭제·실제 용량 회수를 수행하지 않는다.
 * 사용법: node scripts/audit-visual-assets-quality.mjs [--json] [--dry-run] [--out <경로>] [--root <디렉터리>]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_REL = "docs/architecture/asset-visual-quality-audit-2026-11-26.md";
const AUDIT_DATE = "2026-11-26";
const AUDIT_SCOPE = Object.freeze({
  analysis: "header-json-metadata-heuristics", referenceCheck: "static-literal-and-manifest-scan",
  rendered: false, topologyValidated: false, rightsValidated: false, runtimeReferencesValidated: false,
  assetFilesModified: false, assetFilesDeleted: 0, reclaimedBytes: 0,
  savingsBasis: "candidate-source-bytes-and-unverified-compression-ratios",
});
const EXT_3D = new Set([".glb", ".gltf", ".vrm"]);
const EXT_2D = new Set([".webp", ".png", ".jpg", ".jpeg", ".svg"]);
const TEXT_SRC_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".json", ".css", ".html"]);
const PUBLIC_ROOTS = [{ app: "web", relDir: "apps/web/public" }];
const SRC_ROOTS = ["apps/web/src"];
const EXTRA_REF_FILES = ["apps/web/index.html", "apps/web/public/manifest.webmanifest"];

export const THRESHOLDS = Object.freeze({
  heavy3dBytes: 5 * 1024 * 1024, lowCraft3dBytes: 10 * 1024, lowPolyTriangles: 100,
  largePngBytes: 300 * 1024, heavy2dBytes: 2 * 1024 * 1024,
  simpleSvgMinDim: 480, simpleSvgMaxShapes: 90, simpleSvgMaxBytes: 16 * 1024,
});

const OFF_STYLE_3D_RE = /(?:^|\/)(?:kenney-[^/]+|cryptovoxels\.vrm)/i;
const OFF_STYLE_2D_RE = /(?:^|\/)(?:kenney-[^/]+|characters-lpc-v1\/)/i;
const ICON_PATH_RE = /(?:favicon|icon|apple-touch|pinned-tab|badge|emblem|motif|logo|cursor|emoji)/i;
const TEST_FILE_RE = /(?:\.(?:test|spec)\.[^.]+$|(?:^|\/)(?:__tests__|__fixtures__|testing)\/)/;
const MANIFEST_JSON_RE = /(?:manifest|catalog|catalogue|kit|index|registry|world)[^/]*\.json$/i;
const OFF_STYLE_VRM_STEMS = new Set((
  "astronaut avocado badbot baosamurai bloody bluepixie botbunny chillpalm chillpenguin clown coolalien "
  + "coolbanana coolpirate coolpizza coolramen cooltaco cooltiger coolturtle cosmicbot cosmicdweller crowley "
  + "cryptovoxels cutesaurus cyberpal devil dinokid dracula eggplant eyewizard froggy goodknight icecream "
  + "kiba ladyfawn ladykoi lalobot lilram meganthefox moongirl mummy mushroomfairy nightmare piratebot "
  + "polybot polydancer pumpkin pyresorcerer rabbit seed_san sharkperson skull sportmecha stitchwitch "
  + "strawberryprincess teddy unicornperson weirdcat witch wizzir wolfman yetidude zombie"
).split(" "));

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const toPosix = (p) => p.split(path.sep).join("/");
const fmtMB = (b) => `${(b / 1048576).toFixed(2)} MB`;
const fmtSize = (b) => (b >= 1048576 ? fmtMB(b) : `${(b / 1024).toFixed(1)} KB`);
const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => cmp(a.name, b.name))) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, predicate, out);
    else if (ent.isFile() && predicate(full, ent.name)) out.push(full);
  }
  return out;
}

export function parsePngDimensions(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return buf.toString("ascii", 12, 16) === "IHDR" ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), detectedFormat: "png" } : null;
}

export function parseJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 4 < buf.length;) {
    while (i < buf.length && buf[i] === 0xff) i += 1;
    if (i >= buf.length) break;
    const m = buf[i++];
    if (m === 0xd9 || m === 0xda) break;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) continue;
    if (i + 2 > buf.length) break;
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) break;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && i + 7 < buf.length) {
      return { width: buf.readUInt16BE(i + 5), height: buf.readUInt16BE(i + 3), detectedFormat: "jpg" };
    }
    i += len;
  }
  return null;
}

export function parseWebpDimensions(buf) {
  if (buf.length < 24 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const tag = buf.toString("ascii", 12, 16);
  if (tag === "VP8X" && buf.length >= 30) {
    return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)), detectedFormat: "webp" };
  }
  if (tag === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, detectedFormat: "webp" };
  }
  if (tag === "VP8 " && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, detectedFormat: "webp" };
  }
  return null;
}

export const parseImageDimensions = (buf) => parsePngDimensions(buf) ?? parseWebpDimensions(buf) ?? parseJpegDimensions(buf);

export function parseSvgMetrics(text, fileName = "") {
  const bytes = Buffer.byteLength(text, "utf8");
  const vb = text.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  const wAttr = Number(text.match(/<svg\b[^>]*\bwidth\s*=\s*["']([\d.]+)/i)?.[1] ?? 0);
  const hAttr = Number(text.match(/<svg\b[^>]*\bheight\s*=\s*["']([\d.]+)/i)?.[1] ?? 0);
  const width = vb?.length === 4 && Number.isFinite(vb[2]) ? Math.round(vb[2]) : Math.round(wAttr);
  const height = vb?.length === 4 && Number.isFinite(vb[3]) ? Math.round(vb[3]) : Math.round(hAttr);
  const pathCount = (text.match(/<path\b/gi) ?? []).length;
  const rectCount = (text.match(/<rect\b/gi) ?? []).length;
  const shapeCount = (text.match(/<(?:path|rect|circle|ellipse|polygon|polyline|line)\b/gi) ?? []).length;
  const hasRasterImage = /<image\b/i.test(text);
  const maxDim = Math.max(width, height);
  const isIcon = (maxDim > 0 && maxDim <= 128) || ICON_PATH_RE.test(fileName);
  const isWireframeScene = !isIcon && !hasRasterImage && (
    (maxDim >= THRESHOLDS.simpleSvgMinDim && shapeCount < THRESHOLDS.simpleSvgMaxShapes && bytes < THRESHOLDS.simpleSvgMaxBytes)
    || shapeCount <= 4
  );
  return { width, height, pathCount, rectCount, shapeCount, hasRasterImage, isWireframeScene };
}

function composeNodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0], [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1,
  ];
}

function mulMat4(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    const o = c * 4;
    for (let r = 0; r < 4; r += 1) out[o + r] = a[r] * b[o] + a[4 + r] * b[o + 1] + a[8 + r] * b[o + 2] + a[12 + r] * b[o + 3];
  }
  return out;
}

function expandAabb(aabb, min, max, m) {
  for (let i = 0; i < 8; i += 1) {
    const x = i & 1 ? max[0] : min[0], y = i & 2 ? max[1] : min[1], z = i & 4 ? max[2] : min[2];
    const tx = m[0] * x + m[4] * y + m[8] * z + m[12], ty = m[1] * x + m[5] * y + m[9] * z + m[13], tz = m[2] * x + m[6] * y + m[10] * z + m[14];
    aabb.min[0] = Math.min(aabb.min[0], tx); aabb.min[1] = Math.min(aabb.min[1], ty); aabb.min[2] = Math.min(aabb.min[2], tz);
    aabb.max[0] = Math.max(aabb.max[0], tx); aabb.max[1] = Math.max(aabb.max[1], ty); aabb.max[2] = Math.max(aabb.max[2], tz);
    aabb.valid = true;
  }
}

export function parse3dAssetBuffer(buf, ext = ".glb") {
  let json = null, binChunk = null;
  if (ext === ".gltf") json = JSON.parse(buf.toString("utf8"));
  else {
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return { parseError: "유효한 GLB/VRM 매직 헤더(glTF)가 아닙니다." };
    for (let o = 12; o + 8 <= buf.length;) {
      const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), s = o + 8, e = Math.min(buf.length, s + len);
      if (type === 0x4e4f534a && !json) json = JSON.parse(buf.toString("utf8", s, e));
      else if (type === 0x004e4942 && !binChunk) binChunk = buf.subarray(s, e);
      o = s + len;
    }
  }
  if (!json || typeof json !== "object") return { parseError: "GLB/glTF JSON 청크를 파싱하지 못했습니다." };
  const accessors = json.accessors ?? [], meshes = json.meshes ?? [], nodes = json.nodes ?? [], images = json.images ?? [], bvs = json.bufferViews ?? [];
  let vertices = 0, triangles = 0;
  const meshBounds = meshes.map((mesh) => {
    const local = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], valid: false };
    for (const prim of mesh.primitives ?? []) {
      const pos = accessors[prim.attributes?.POSITION], vCount = Number(pos?.count ?? 0), mode = prim.mode ?? 4;
      vertices += vCount;
      const idx = prim.indices !== undefined ? Number(accessors[prim.indices]?.count ?? 0) : vCount;
      if (mode === 4) triangles += Math.floor(idx / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, idx - 2);
      if (Array.isArray(pos?.min) && Array.isArray(pos?.max) && pos.min.length >= 3 && pos.max.length >= 3) {
        for (let k = 0; k < 3; k += 1) { local.min[k] = Math.min(local.min[k], pos.min[k]); local.max[k] = Math.max(local.max[k], pos.max[k]); }
        local.valid = true;
      }
    }
    return local;
  });
  const world = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], valid: false };
  const idMat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const visit = (idx, pMat, d) => {
    if (d > 64 || !nodes[idx]) return;
    const mat = mulMat4(pMat, composeNodeMatrix(nodes[idx])), mb = nodes[idx].mesh !== undefined ? meshBounds[nodes[idx].mesh] : null;
    if (mb?.valid) expandAabb(world, mb.min, mb.max, mat);
    for (const child of nodes[idx].children ?? []) visit(child, mat, d + 1);
  };
  const sceneNodes = json.scenes?.[json.scene ?? 0]?.nodes;
  if (Array.isArray(sceneNodes) && sceneNodes.length > 0) for (const r of sceneNodes) visit(r, idMat, 0);
  else for (const mb of meshBounds) if (mb.valid) expandAabb(world, mb.min, mb.max, idMat);
  let maxTextureWidth = 0, maxTextureHeight = 0;
  for (const img of images) {
    let imgBuf = null;
    if (img.bufferView !== undefined && binChunk && bvs[img.bufferView]) {
      const bv = bvs[img.bufferView], s = bv.byteOffset ?? 0;
      imgBuf = binChunk.subarray(s, Math.min(binChunk.length, s + (bv.byteLength ?? 0)));
    } else if (typeof img.uri === "string" && img.uri.startsWith("data:")) {
      const b64 = img.uri.indexOf("base64,");
      if (b64 !== -1) imgBuf = Buffer.from(img.uri.slice(b64 + 7), "base64");
    }
    const dim = imgBuf ? parseImageDimensions(imgBuf) : null;
    if (dim) { maxTextureWidth = Math.max(maxTextureWidth, dim.width); maxTextureHeight = Math.max(maxTextureHeight, dim.height); }
  }
  const bbox = world.valid
    ? { width: +(world.max[0] - world.min[0]).toFixed(3), height: +(world.max[1] - world.min[1]).toFixed(3), depth: +(world.max[2] - world.min[2]).toFixed(3) }
    : null;
  return {
    parseError: null, vertices, triangles, nodes: nodes.length, materials: (json.materials ?? []).length,
    textures: Math.max((json.textures ?? []).length, images.length),
    maxTextureWidth, maxTextureHeight, maxTextureDim: Math.max(maxTextureWidth, maxTextureHeight),
    bbox, minY: world.valid ? +world.min[1].toFixed(4) : null,
    vrmVersion: json.extensions?.VRMC_vrm ? "1.0" : json.extensions?.VRM ? "0.x" : null,
    hasDraco: Boolean(json.extensionsUsed?.includes("KHR_draco_mesh_compression")),
  };
}

export function buildReferenceIndex(repoRoot) {
  const directPaths = new Set(), testPaths = new Set(), tokenPool = new Set(), runtimeTemplates = [];
  const manifestRefPaths = new Set(), activeManifestRefPaths = new Set();
  const srcFiles = [
    ...SRC_ROOTS.flatMap((rel) => walkFiles(path.join(repoRoot, rel), (_, n) => TEXT_SRC_EXT.has(path.extname(n).toLowerCase()))),
    ...EXTRA_REF_FILES.map((rel) => path.join(repoRoot, rel)).filter((p) => fs.existsSync(p)),
  ];
  const quotedPathRe = /["'`](?:(?:\.\.\/)+public\/|apps\/(?:web|character-lab)\/public\/)?(\/?(?:assets|vrm|models|brand|studio-assets|creator-essentials|images|showcase|draw-app|offline-draw|spatial-reader|apple-touch|favicon|icon-|og-web|safari-pinned|screenshot-)[^"'`?#\s$]*\.[a-z0-9]{2,5})/gi;
  const tplRe = /`(\/(?:assets|vrm|models|brand|studio-assets|creator-essentials|images|showcase)\/[^`]*?\$\{[^`]+)`/g;
  const tokenRe = /["']([A-Za-z0-9/][A-Za-z0-9_./-]{1,120})["']/g;
  for (const filePath of srcFiles) {
    const isTest = TEST_FILE_RE.test(toPosix(path.relative(repoRoot, filePath)));
    const content = fs.readFileSync(filePath, "utf8");
    const target = isTest ? testPaths : directPaths;
    for (const m of content.matchAll(quotedPathRe)) target.add(m[1].startsWith("/") ? m[1] : `/${m[1]}`);
    if (isTest) continue;
    const fileTokens = new Set();
    for (const m of content.matchAll(tokenRe)) { tokenPool.add(m[1]); fileTokens.add(m[1]); }
    for (const m of content.matchAll(tplRe)) {
      const raw = m[1];
      if (/\$\{(?:string|number|boolean|[A-Z][a-z][A-Za-z0-9]*)\}/.test(raw)) continue;
      const s = raw.indexOf("${"), e = raw.lastIndexOf("}");
      if (s >= 0 && e > s) runtimeTemplates.push({ prefix: raw.slice(0, s), suffix: raw.slice(e + 1), fileTokens });
    }
  }
  for (const { relDir } of PUBLIC_ROOTS) {
    const pubRoot = path.join(repoRoot, relDir);
    for (const mPath of walkFiles(pubRoot, (_, n) => MANIFEST_JSON_RE.test(n))) {
      const relFromPub = toPosix(path.relative(pubRoot, mPath)), mWebPath = `/${relFromPub}`, mDir = path.posix.dirname(mWebPath);
      const isActive = directPaths.has(mWebPath) || tokenPool.has(relFromPub) || tokenPool.has(mWebPath) || tokenPool.has(mDir);
      for (const m of fs.readFileSync(mPath, "utf8").matchAll(/["']([^"'\n]+\.(?:glb|gltf|vrm|webp|png|jpe?g|svg))["']/gi)) {
        const raw = m[1].replace(/^\.\//, "");
        const resolved = raw.startsWith("/") ? raw : path.posix.normalize(`${mDir}/${raw}`);
        manifestRefPaths.add(resolved);
        if (isActive) activeManifestRefPaths.add(resolved);
      }
    }
  }
  return { directPaths, testPaths, tokenPool, runtimeTemplates, manifestRefPaths, activeManifestRefPaths };
}

export function resolveAssetReference(webPath, refIndex) {
  const isReferencedInManifest = refIndex.manifestRefPaths.has(webPath);
  const isInActiveManifest = refIndex.activeManifestRefPaths.has(webPath);
  if (refIndex.directPaths.has(webPath)) return { isReferencedInCode: true, isReferencedInManifest, refSource: "code-direct" };
  const stem = path.posix.basename(webPath, path.posix.extname(webPath));
  const stemBase = stem.replace(/-(?:320|480|640|960|1024)$/u, "");
  const parentName = path.posix.basename(path.posix.dirname(webPath));
  for (const tpl of refIndex.runtimeTemplates) {
    if (!webPath.startsWith(tpl.prefix)) continue;
    const isFileSuffix = tpl.suffix.includes(".");
    if (isFileSuffix && !webPath.endsWith(tpl.suffix)) continue;
    if (!isFileSuffix && tpl.suffix && !webPath.includes(`${tpl.suffix}/`)) continue;
    const middle = isFileSuffix ? webPath.slice(tpl.prefix.length, webPath.length - tpl.suffix.length) : webPath.slice(tpl.prefix.length);
    if (!middle) continue;
    const segs = middle.split("/").filter(Boolean);
    const hit = tpl.fileTokens.has(middle) || refIndex.tokenPool.has(middle) || tpl.fileTokens.has(stem)
      || tpl.fileTokens.has(stemBase) || tpl.fileTokens.has(parentName) || segs.some((s) => s.length >= 3 && tpl.fileTokens.has(s))
      || (tpl.prefix.includes("/quaternius-modular-v1/") && segs[0]?.startsWith("quaternius-modular-"))
      || (tpl.prefix.includes("/style-packs-v5/") && webPath.includes("/objects/"))
      || (tpl.prefix.includes("/experience-v8/") && !webPath.includes("/previews/"))
      || tpl.prefix.includes("/promo-shorts/posters/");
    if (hit) return { isReferencedInCode: true, isReferencedInManifest, refSource: "code-template" };
  }
  if (isInActiveManifest) return { isReferencedInCode: false, isReferencedInManifest: true, refSource: "manifest-active" };
  if (isReferencedInManifest) return { isReferencedInCode: false, isReferencedInManifest: true, refSource: "manifest-inactive" };
  if (refIndex.testPaths.has(webPath)) return { isReferencedInCode: false, isReferencedInManifest: false, refSource: "test-only" };
  return { isReferencedInCode: false, isReferencedInManifest: false, refSource: "orphan" };
}

export function classify3dAsset(item) {
  const reasons = [], stem = path.posix.basename(item.webPath, item.ext).toLowerCase();
  if (OFF_STYLE_3D_RE.test(item.webPath) || (item.ext === ".vrm" && OFF_STYLE_VRM_STEMS.has(stem))) {
    reasons.push(item.ext === ".vrm" ? "경로명 패턴상 밈/마스코트/복셀 검토 후보" : "경로명 패턴상 블록/장난감 팩 검토 후보(Kenney)");
    if (!item.isReferencedInCode) reasons.push("코드 직접 미참조");
    return { grade: "QUARANTINE_OFF_STYLE", reasons };
  }
  if (item.parseError) return { grade: "UPGRADE_LOW_CRAFT", reasons: [item.parseError] };
  const isTiny = item.bytes < THRESHOLDS.lowCraft3dBytes, isBare = item.textures === 0 && item.triangles < THRESHOLDS.lowPolyTriangles;
  if (isTiny || isBare) {
    if (isTiny) reasons.push(`초소형 더미/플레이스홀더(${fmtSize(item.bytes)})`);
    if (isBare) reasons.push(`텍스처 0 · 극저폴리(${item.triangles} tris)`);
    return { grade: "UPGRADE_LOW_CRAFT", reasons };
  }
  if (item.bytes > THRESHOLDS.heavy3dBytes || item.isExactDup || item.isShadowDup) {
    if (item.bytes > THRESHOLDS.heavy3dBytes) reasons.push(`과대 용량(${fmtMB(item.bytes)} > 5 MB)`);
    if (item.isExactDup) reasons.push("SHA-256 동일 중복");
    if (item.isShadowDup) reasons.push(`구버전/리비전 중복(${item.shadowOf})`);
    return { grade: "OPTIMIZE_HEAVY_OR_DUP", reasons };
  }
  if (!item.isReferencedInCode && item.refSource !== "manifest-active") {
    return { grade: "QUARANTINE_OFF_STYLE", reasons: [item.refSource === "manifest-inactive" ? "비활성 매니페스트 미참조 3D" : "미참조 고아 3D 에셋"] };
  }
  if (item.minY !== null && Math.abs(item.minY) > 0.1) reasons.push(`바닥 접지 편차(minY=${item.minY}m)`);
  if (item.maxTextureDim > 2048) reasons.push(`고해상도 텍스처(${item.maxTextureDim}px)`);
  return { grade: "HERO_KEEP", reasons: reasons.length ? reasons : ["파일 크기·선언 메타데이터 기준 유지 후보(렌더·위상 미검증)"] };
}

export function classify2dAsset(item) {
  const reasons = [];
  if (OFF_STYLE_2D_RE.test(item.webPath)) {
    return { grade: "QUARANTINE_OFF_STYLE", reasons: [item.webPath.includes("characters-lpc-v1") ? "16비트 RPG 픽셀 스프라이트(웹툰 톤 불일치)" : "Kenney 블록 팩 부속 2D 에셋"] };
  }
  if (item.parseError) return { grade: "UPGRADE_LOW_CRAFT", reasons: [item.parseError] };
  if (item.ext === ".svg" && item.svg?.isWireframeScene) {
    return { grade: "UPGRADE_LOW_CRAFT", reasons: [`극단순 와이어프레임/도형 SVG(${item.width}x${item.height}, 도형 ${item.svg.shapeCount}개)`] };
  }
  const maxDim = Math.max(item.width ?? 0, item.height ?? 0);
  if (item.ext !== ".svg" && !ICON_PATH_RE.test(item.webPath) && maxDim > 0 && maxDim < 64) {
    return { grade: "UPGRADE_LOW_CRAFT", reasons: [`극저해상도 래스터(${item.width}x${item.height})`] };
  }
  const isLargePng = item.ext === ".png" && item.bytes > THRESHOLDS.largePngBytes, isHeavy2d = item.bytes > THRESHOLDS.heavy2dBytes;
  if (isLargePng || isHeavy2d || item.isExactDup || item.formatMismatch) {
    if (isLargePng) reasons.push(`대용량 PNG(${fmtSize(item.bytes)} > 300 KB → WebP)`);
    if (isHeavy2d) reasons.push(`과대 2D 파일(${fmtMB(item.bytes)} > 2 MB)`);
    if (item.isExactDup) reasons.push("SHA-256 동일 중복");
    if (item.formatMismatch) reasons.push(`확장자 불일치(${item.ext} 내부 ${item.detectedFormat})`);
    return { grade: "OPTIMIZE_HEAVY_OR_DUP", reasons };
  }
  if (!item.isReferencedInCode && item.refSource !== "manifest-active") {
    return { grade: "QUARANTINE_OFF_STYLE", reasons: [item.refSource === "manifest-inactive" ? "비활성 매니페스트 미참조 2D" : "미참조 고아 2D 에셋"] };
  }
  return { grade: "HERO_KEEP", reasons: ["헤더 치수·포맷 기준 유지 후보(픽셀 디코드·톤 미검증)"] };
}

function annotateDuplicatesAndShadows(items3d, items2d) {
  const markExact = (items) => {
    const bySha = new Map(), groups = [];
    for (const x of items) (bySha.get(x.sha256) ?? bySha.set(x.sha256, []).get(x.sha256)).push(x);
    for (const [sha, list] of bySha.entries()) {
      if (list.length < 2) continue;
      list.sort((a, b) => Number(b.isReferencedInCode) - Number(a.isReferencedInCode) || cmp(a.repoPath, b.repoPath));
      list.forEach((e, i) => { e.isExactDup = i > 0; e.dupPrimary = list[0].repoPath; });
      groups.push({ sha, count: list.length, bytesEach: list[0].bytes, wastedBytes: list[0].bytes * (list.length - 1), files: list.map((x) => x.repoPath) });
    }
    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  };
  const exact3dGroups = markExact(items3d), exact2dGroups = markExact(items2d);
  const webSet = new Set(items3d.map((x) => x.webPath)), shadow3d = [];
  for (const item of items3d) {
    const v2 = item.webPath.includes("/expansion-v1/") ? item.webPath.replace("/expansion-v1/", "/expansion-v2/") : null;
    if (v2 && webSet.has(v2)) { item.isShadowDup = true; item.shadowOf = v2; shadow3d.push(item); }
    else if (/\/revisions\/[0-9a-f]{16,}\//i.test(item.webPath)) { item.isShadowDup = true; item.shadowOf = "public 내부 구 리비전 스냅샷"; shadow3d.push(item); }
  }
  return { exact3dGroups, exact2dGroups, shadow3d };
}

export function runVisualAssetAudit(repoRoot = DEFAULT_ROOT) {
  const refIndex = buildReferenceIndex(repoRoot), items3d = [], items2d = [];
  for (const { app, relDir } of PUBLIC_ROOTS) {
    const pubRoot = path.join(repoRoot, relDir);
    for (const fullPath of walkFiles(pubRoot, (_, n) => EXT_3D.has(path.extname(n).toLowerCase()) || EXT_2D.has(path.extname(n).toLowerCase()))) {
      const ext = path.extname(fullPath).toLowerCase(), repoPath = toPosix(path.relative(repoRoot, fullPath)), webPath = `/${toPosix(path.relative(pubRoot, fullPath))}`;
      const buf = fs.readFileSync(fullPath);
      const base = { app, repoPath, webPath, ext, bytes: buf.length, sha256: sha256Hex(buf), ...resolveAssetReference(webPath, refIndex), isExactDup: false };
      if (EXT_3D.has(ext)) {
        let parsed;
        try { parsed = parse3dAssetBuffer(buf, ext); } catch (err) { parsed = { parseError: `파싱 오류: ${err.message}` }; }
        items3d.push({ kind: ext === ".vrm" ? "vrm" : "glb", ...base, ...parsed, isShadowDup: false, shadowOf: null });
      } else {
        let width = 0, height = 0, detectedFormat = ext.slice(1), parseError = null, svg = null;
        if (buf.length === 0) parseError = "0바이트 빈 파일";
        else if (ext === ".svg") { svg = parseSvgMetrics(buf.toString("utf8"), path.basename(fullPath)); ({ width, height } = svg); }
        else { const dim = parseImageDimensions(buf); if (dim) ({ width, height, detectedFormat } = dim); else parseError = "이미지 헤더 치수 파싱 실패"; }
        items2d.push({ kind: "2d", ...base, width, height, detectedFormat, formatMismatch: ext !== ".svg" && !parseError && detectedFormat !== (ext === ".jpeg" ? "jpg" : ext.slice(1)), svg, parseError });
      }
    }
  }
  const dups = annotateDuplicatesAndShadows(items3d, items2d);
  for (const x of items3d) Object.assign(x, classify3dAsset(x));
  for (const x of items2d) Object.assign(x, classify2dAsset(x));
  const summarize = (list) => {
    const grades = { HERO_KEEP: 0, OPTIMIZE_HEAVY_OR_DUP: 0, UPGRADE_LOW_CRAFT: 0, QUARANTINE_OFF_STYLE: 0 };
    const gradeBytes = { HERO_KEEP: 0, OPTIMIZE_HEAVY_OR_DUP: 0, UPGRADE_LOW_CRAFT: 0, QUARANTINE_OFF_STYLE: 0 };
    let totalBytes = 0, codeRef = 0, manifestActive = 0, manifestInactive = 0, orphan = 0;
    for (const x of list) {
      totalBytes += x.bytes; grades[x.grade] += 1; gradeBytes[x.grade] += x.bytes;
      if (x.isReferencedInCode) codeRef += 1;
      else if (x.refSource === "manifest-active") manifestActive += 1;
      else if (x.refSource === "manifest-inactive") manifestInactive += 1;
      else orphan += 1;
    }
    return { count: list.length, totalBytes, grades, gradeBytes, codeRef, manifestActive, manifestInactive, orphan };
  };
  const all = [...items3d, ...items2d];
  const sv = { quarantineBytes: 0, dedupeBytes: 0, heavy3dSrcBytes: 0, heavy3dCount: 0, largePngSrcBytes: 0, largePngCount: 0, heavy2dSrcBytes: 0, heavy2dCount: 0 };
  for (const x of all) {
    if (x.grade === "QUARANTINE_OFF_STYLE") sv.quarantineBytes += x.bytes;
    else if (x.isExactDup || x.isShadowDup) sv.dedupeBytes += x.bytes;
    else if (x.kind !== "2d" && x.bytes > THRESHOLDS.heavy3dBytes) { sv.heavy3dSrcBytes += x.bytes; sv.heavy3dCount += 1; }
    else if (x.kind === "2d" && x.ext === ".png" && x.bytes > THRESHOLDS.largePngBytes) { sv.largePngSrcBytes += x.bytes; sv.largePngCount += 1; }
    else if (x.kind === "2d" && x.bytes > THRESHOLDS.heavy2dBytes) { sv.heavy2dSrcBytes += x.bytes; sv.heavy2dCount += 1; }
  }
  const estSavingsBytes = sv.quarantineBytes + sv.dedupeBytes + Math.round(sv.heavy3dSrcBytes * 0.65) + Math.round(sv.largePngSrcBytes * 0.72) + Math.round(sv.heavy2dSrcBytes * 0.5);
  return {
    auditDate: AUDIT_DATE, scope: AUDIT_SCOPE, dups, items3d, items2d,
    summary: {
      vrm: summarize(items3d.filter((x) => x.kind === "vrm")), glb: summarize(items3d.filter((x) => x.kind === "glb")),
      all3d: summarize(items3d), all2d: summarize(items2d), totalFiles: all.length, totalBytes: all.reduce((s, x) => s + x.bytes, 0),
      exactDupGroups: dups.exact3dGroups.length + dups.exact2dGroups.length,
      exactDupWasteBytes: [...dups.exact3dGroups, ...dups.exact2dGroups].reduce((s, g) => s + g.wastedBytes, 0),
      shadow3dCount: dups.shadow3d.length, shadowWasteBytes: dups.shadow3d.reduce((s, x) => s + x.bytes, 0), ...sv, estSavingsBytes,
    },
  };
}

function packKey(repoPath) {
  const p = repoPath.replace(/^apps\/(?:web|character-lab)\/public\//, "").split("/");
  if (p[0] === "assets" && p[1] === "studio" && p[2] === "cc0-20260906" && p[3] === "assets") {
    return p[4]?.startsWith("kenney-") ? `cc0/${p[4]}` : p[4]?.startsWith("polyhaven-") ? "cc0/polyhaven-*" : `cc0/${p[4] ?? ""}`;
  }
  return p.slice(0, Math.min(3, p.length - 1)).join("/") || "(public-root)";
}

export function renderAuditMarkdown(audit) {
  const { summary: S, items3d, items2d, dups } = audit, all = [...items3d, ...items2d], n = (v) => v.toLocaleString("en-US");
  const grades = ["HERO_KEEP", "OPTIMIZE_HEAVY_OR_DUP", "UPGRADE_LOW_CRAFT", "QUARANTINE_OFF_STYLE"];
  const gradeKo = { HERO_KEEP: "유지 (HERO_KEEP)", OPTIMIZE_HEAVY_OR_DUP: "최적화·중복 (OPTIMIZE_HEAVY_OR_DUP)", UPGRADE_LOW_CRAFT: "고품질 교체 (UPGRADE_LOW_CRAFT)", QUARANTINE_OFF_STYLE: "제거·격리 (QUARANTINE_OFF_STYLE)" };
  const totalRow = {
    count: S.totalFiles, totalBytes: S.totalBytes, grades: Object.fromEntries(grades.map((g) => [g, S.all3d.grades[g] + S.all2d.grades[g]])),
    codeRef: S.all3d.codeRef + S.all2d.codeRef, manifestActive: S.all3d.manifestActive + S.all2d.manifestActive,
    manifestInactive: S.all3d.manifestInactive + S.all2d.manifestInactive, orphan: S.all3d.orphan + S.all2d.orphan,
  };
  const byB = (a, b) => b.bytes - a.bytes || cmp(a.repoPath, b.repoPath);
  const topQ = [
    ...items3d.filter((x) => x.grade === "QUARANTINE_OFF_STYLE" && x.kind === "vrm").sort(byB).slice(0, 8),
    ...items3d.filter((x) => x.grade === "QUARANTINE_OFF_STYLE" && x.kind === "glb").sort(byB).slice(0, 6),
    ...items2d.filter((x) => x.grade === "QUARANTINE_OFF_STYLE").sort(byB).slice(0, 6),
  ];
  const topUp = [
    ...items3d.filter((x) => x.grade === "UPGRADE_LOW_CRAFT").sort((a, b) => Number(b.isReferencedInCode) - Number(a.isReferencedInCode) || a.bytes - b.bytes || cmp(a.repoPath, b.repoPath)).slice(0, 12),
    ...items2d.filter((x) => x.grade === "UPGRADE_LOW_CRAFT").sort((a, b) => Number(b.isReferencedInCode) - Number(a.isReferencedInCode) || Number(b.repoPath.includes("/brand/")) - Number(a.repoPath.includes("/brand/")) || byB(a, b)).slice(0, 8),
  ];
  const topOpt = [
    ...items3d.filter((x) => x.grade === "OPTIMIZE_HEAVY_OR_DUP").sort(byB).slice(0, 14),
    ...items2d.filter((x) => x.grade === "OPTIMIZE_HEAVY_OR_DUP").sort(byB).slice(0, 6),
  ];
  const byPack = new Map();
  for (const x of all) {
    if (x.isReferencedInCode) continue;
    const key = packKey(x.repoPath), e = byPack.get(key) ?? byPack.set(key, { key, aN: 0, aB: 0, bN: 0, bB: 0, cN: 0, cB: 0, off: 0 }).get(key);
    if (x.refSource === "manifest-active") { e.cN += 1; e.cB += x.bytes; }
    else if (x.refSource === "manifest-inactive") { e.bN += 1; e.bB += x.bytes; }
    else { e.aN += 1; e.aB += x.bytes; }
    if (OFF_STYLE_3D_RE.test(x.webPath) || OFF_STYLE_2D_RE.test(x.webPath)) e.off += 1;
  }
  const packRows = [...byPack.values()].sort((a, b) => (b.aB + b.bB) - (a.aB + a.bB) || (b.cB - a.cB) || cmp(a.key, b.key)).slice(0, 28);
  return [
    "# 3D·2D 에셋 헤더·메타데이터 휴리스틱 및 파일 크기 후보 보고서", "",
    `- **감사 기준일**: ${audit.auditDate} | **감사 도구**: \`scripts/audit-visual-assets-quality.mjs\` (바이너리 헤더·glTF/VRM JSON·이미지 치수 선언값·파일 크기 스캔)`,
    "- **대상 범위**는 `apps/web/public/`의 에셋입니다. `apps/web/src/` 경로 문자열, HTML 진입점, 공개 매니페스트와 대조합니다.",
    "- **상태(current)**: 헤더·메타데이터 휴리스틱과 파일 크기 후보를 계산하는 정적 스캔입니다.",
    "- **검증 범위**: 렌더링·위상·권리 검증을 수행하지 않습니다. 이미지 픽셀 디코드, 3D 재가져오기, 기기 실행도 검사하지 않습니다.",
    "- **참조 한계**: 코드 문자열과 일부 매니페스트만 대조합니다. 동적 경로·외부 소비자·실제 런타임 로드 여부는 미확인입니다.",
    "- **실행 범위**: 에셋 파일은 수정·삭제하지 않으며 실제 회수 용량은 0바이트입니다. CLI는 기본 모드에서 보고서 파일만 기록합니다.",
    "- **용량 해석**: 후보 원본 파일 크기는 회수 실적이나 안전 삭제 승인과 다릅니다. 65%·72%·50% 압축률은 결과물을 만들지 않은 미검증 가정입니다.", "",
    "## 1. 전사 에셋 요약 (파일 수·크기 합계와 휴리스틱 분류)", "",
    "| 구분 | 파일 수 | 총 용량 | HERO_KEEP | OPTIMIZE | UPGRADE | QUARANTINE | 코드 참조 | 활성 매니페스트 | 비활성 매니페스트 | 정적 미참조 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...[["3D 캐릭터 (VRM)", S.vrm], ["3D 배경·소품·파츠 (GLB)", S.glb], ["2D 이미지·아이콘·SVG", S.all2d], ["**전사 합계**", totalRow]]
      .map(([lb, s]) => `| ${lb} | ${n(s.count)} | ${fmtMB(s.totalBytes)} | ${n(s.grades.HERO_KEEP)} | ${n(s.grades.OPTIMIZE_HEAVY_OR_DUP)} | ${n(s.grades.UPGRADE_LOW_CRAFT)} | ${n(s.grades.QUARANTINE_OFF_STYLE)} | ${n(s.codeRef)} | ${n(s.manifestActive)} | ${n(s.manifestInactive)} | ${n(s.orphan)} |`), "",
    "### 상호 배타 후보 파일 크기와 미검증 압축 가정 (버킷 간 중복 집계 없음)",
    `- **1) 제거·격리 대상(\`QUARANTINE_OFF_STYLE\`) 후보 원본 파일 크기 합계**: **${fmtMB(S.quarantineBytes)}** (블록형 Kenney·밈 VRM·LPC 픽셀·비활성/고아 에셋)`,
    `- **2) 중복·구리비전(격리 제외분, SHA-256 ${S.exactDupGroups}그룹 + 3D 구리비전 ${S.shadow3dCount}건) 후보 원본 파일 크기 합계**: **${fmtMB(S.dedupeBytes)}** (전체 SHA-256 낭비 ${fmtMB(S.exactDupWasteBytes)}, 3D 구리비전 ${fmtMB(S.shadowWasteBytes)})`,
    `- **3) 과대 3D(>5 MB, ${S.heavy3dCount}개 = ${fmtMB(S.heavy3dSrcBytes)}) Draco+1K/2K 압축 (65% 추정)**: **~${fmtMB(S.heavy3dSrcBytes * 0.65)}**`,
    `- **4) 대용량 PNG(>300 KB, ${S.largePngCount}개 = ${fmtMB(S.largePngSrcBytes)}) WebP 전환 (72% 추정)**: **~${fmtMB(S.largePngSrcBytes * 0.72)}**`,
    `- **5) 과대 2D 비PNG(>2 MB, ${S.heavy2dCount}개 = ${fmtMB(S.heavy2dSrcBytes)}) 리사이즈·WebP (50% 추정)**: **~${fmtMB(S.heavy2dSrcBytes * 0.5)}**`,
    `- **가정상 절감 시나리오**: **~${fmtMB(S.estSavingsBytes)}** (전사 ${fmtMB(S.totalBytes)} 대비 **${((S.estSavingsBytes / Math.max(1, S.totalBytes)) * 100).toFixed(1)}%**)`, "",
    "## 2. 휴리스틱 등급별 파일 크기 분포", "",
    "| 등급 | 3D 수량 (용량) | 2D 수량 (용량) | 합계 수량 (용량) |", "|---|---:|---:|---:|",
    ...grades.map((g) => `| ${gradeKo[g]} | ${n(S.all3d.grades[g])} (${fmtMB(S.all3d.gradeBytes[g])}) | ${n(S.all2d.grades[g])} (${fmtMB(S.all2d.gradeBytes[g])}) | ${n(S.all3d.grades[g] + S.all2d.grades[g])} (${fmtMB(S.all3d.gradeBytes[g] + S.all2d.gradeBytes[g])}) |`), "",
    "## 3. Top 20 즉시 제거·격리 대상 (`QUARANTINE_OFF_STYLE` — VRM 8 · GLB 6 · 2D 6)", "",
    "| 순위 | 경로 | 종류 | 용량 | 참조 상태 | 판정 사유 |", "|---:|---|---|---:|---|---|",
    ...topQ.map((x, i) => `| ${i + 1} | \`${x.repoPath}\` | ${x.kind.toUpperCase()} | ${fmtSize(x.bytes)} | ${x.refSource} | ${x.reasons.join("; ")} |`), "",
    "## 4. Top 20 즉시 교체(고품질 리메이크) 대상 (`UPGRADE_LOW_CRAFT` — 3D 12 · 2D 8)", "",
    "| 순위 | 경로 | 종류 | 용량 | 형상/해상도 선언 메타데이터 | 참조 상태 | 판정 사유 |", "|---:|---|---|---:|---|---|---|",
    ...topUp.map((x, i) => `| ${i + 1} | \`${x.repoPath}\` | ${x.kind.toUpperCase()} | ${fmtSize(x.bytes)} | ${x.kind === "2d" ? `${x.width}x${x.height}${x.svg ? ` (path ${x.svg.pathCount}/rect ${x.svg.rectCount}/도형 ${x.svg.shapeCount})` : ""}` : `${x.vertices ?? 0}v / ${x.triangles ?? 0}t / tex ${x.textures ?? 0}`} | ${x.refSource} | ${x.reasons.join("; ")} |`), "",
    "## 5. Top 20 용량 최적화·중복 제거 대상 (`OPTIMIZE_HEAVY_OR_DUP` — 3D 14 · 2D 6)", "",
    "| 순위 | 경로 | 종류 | 용량 | 메시/텍스처 선언 메타데이터 | 참조 상태 | 최적화 조치 |", "|---:|---|---|---:|---|---|---|",
    ...topOpt.map((x, i) => `| ${i + 1} | \`${x.repoPath}\` | ${x.kind.toUpperCase()} | ${fmtSize(x.bytes)} | ${x.kind === "2d" ? `${x.width}x${x.height} (${x.detectedFormat})` : `${n(x.triangles ?? 0)}t · tex ${x.textures ?? 0}(max ${x.maxTextureDim ?? 0}px) · minY ${x.minY ?? "-"}m`} | ${x.refSource} | ${x.reasons.join("; ")} |`), "",
    "### SHA-256 완전 중복 상위 그룹 (실측)", "",
    "| 순위 | 중복 수 | 낭비 용량 | 기준 파일 | 중복 파일 예시 |", "|---:|---:|---:|---|---|",
    ...[...dups.exact3dGroups, ...dups.exact2dGroups].slice(0, 12).map((g, i) => `| ${i + 1} | ${g.count} | ${fmtSize(g.wastedBytes)} | \`${g.files[0]}\` | \`${g.files.slice(1, 3).join("`, `")}\` |`), "",
    "## 6. 정적 미참조 에셋의 삭제 전 재검토 목록 (디렉터리·팩 집계)", "",
    "- **Tier A (정적 미참조 검토 후보)**: 코드·매니페스트 모두 미참조(`orphan`). **Tier B**: 죽은 매니페스트(`manifest-inactive`, `src/` 미로드). **Tier C**: 활성 매니페스트(`manifest-active`, 동시 수정 필수).", "",
    "| 디렉터리/팩 | Tier A 정적 미참조 | Tier B 비활성 매니페스트 | Tier C 활성 매니페스트 | 권고 조치 |", "|---|---:|---:|---:|---|",
    ...packRows.map((p) => `| \`${p.key}\` | ${p.aN} (${fmtMB(p.aB)}) | ${p.bN} (${fmtMB(p.bB)}) | ${p.cN} (${fmtMB(p.cB)}) | ${p.off > 0 ? "경로 패턴 후보·렌더 후 판정" : p.cN === 0 ? "동적·외부 참조 확인 후 개별 검토" : "활성 매니페스트 검수 후 정리"} |`), "",
    "## 7. 후속 검증 계획 (미실행)", "",
    "1. **참조 재검토**: Tier A·B와 중복 후보의 동적 URL·외부 소비자·매니페스트 로드 여부를 확인합니다. SHA-256 동일 파일도 경로별 참조가 다를 수 있어 삭제 가능성을 보증하지 않습니다.",
    "2. **시각·권리 검토**: 경로 패턴으로 분류한 팩과 VRM은 실제 렌더·픽셀·라이선스·Rights BOM을 확인한 뒤 유지·교체·격리 여부를 결정합니다.",
    "3. **실제 출력 검증**: 단순 도형·소용량 메타데이터 후보는 의도된 아이콘·프록시일 수도 있습니다. 사용 화면과 3D 재가져오기·위상 검증으로 교체 필요성을 판단합니다.",
    "4. **압축 후보 비교**: 원본을 보존한 별도 결과물에서 용량·시각 차이·런타임 호환성을 비교합니다. 압축률과 실제 회수 용량은 그 결과가 나온 뒤 기록합니다.", "",
  ].join("\n");
}

function parseCliArgs(argv) {
  const opts = { json: false, dryRun: false, root: DEFAULT_ROOT, out: DEFAULT_REPORT_REL };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--root" && argv[i + 1]) opts.root = path.resolve(argv[++i]);
    else if (arg === "--out" && argv[i + 1]) opts.out = argv[++i];
    else throw new Error(`알 수 없는 인자입니다: ${arg}\n복구: node scripts/audit-visual-assets-quality.mjs [--json] [--dry-run] [--out <경로>]`);
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const audit = runVisualAssetAudit(opts.root);
    const md = renderAuditMarkdown(audit);
    if (!opts.dryRun && !opts.json) {
      const outPath = path.resolve(opts.root, opts.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, md, "utf8");
    }
    if (opts.json) process.stdout.write(`${JSON.stringify({ auditDate: audit.auditDate, scope: audit.scope, summary: audit.summary }, null, 2)}\n`);
    else {
      const { summary: S } = audit;
      process.stdout.write([
        `전사 3D/2D 헤더·메타데이터 휴리스틱 스캔 완료 (${S.totalFiles.toLocaleString("en-US")}개, ${fmtMB(S.totalBytes)})`,
        "  범위: 헤더·선언 메타데이터·정적 참조이며 렌더·위상·권리는 미검증입니다.",
        "  에셋 수정·삭제 없음, 실제 회수 용량 0바이트. 아래 용량은 후보 원본 크기와 미검증 압축 가정입니다.",
        `  3D VRM: ${S.vrm.count}개 (${fmtMB(S.vrm.totalBytes)}) | GLB: ${S.glb.count}개 (${fmtMB(S.glb.totalBytes)}) | 2D: ${S.all2d.count}개 (${fmtMB(S.all2d.totalBytes)})`,
        `  격리 검토 후보(QUARANTINE): ${S.all3d.grades.QUARANTINE_OFF_STYLE + S.all2d.grades.QUARANTINE_OFF_STYLE}개 (${fmtMB(S.quarantineBytes)})`,
        `  품질 검토 후보(UPGRADE): ${S.all3d.grades.UPGRADE_LOW_CRAFT + S.all2d.grades.UPGRADE_LOW_CRAFT}개 | 최적화·중복(OPTIMIZE): ${S.all3d.grades.OPTIMIZE_HEAVY_OR_DUP + S.all2d.grades.OPTIMIZE_HEAVY_OR_DUP}개`,
        `  가정상 절감 시나리오(중복 집계 0건): ~${fmtMB(S.estSavingsBytes)}`,
        opts.dryRun ? "  [dry-run] 리포트 파일을 쓰지 않았습니다." : `  리포트 생성: ${opts.out}`,
      ].join("\n") + "\n");
    }
  } catch (err) {
    process.stderr.write(`시각 에셋 감사 실패: ${err.message}\n`);
    process.exitCode = 1;
  }
}
