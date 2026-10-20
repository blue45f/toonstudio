#!/usr/bin/env node
/**
 * ingest-creator-bundle.mjs
 *
 * itch.io Creator Bundle: Volume 1 (EmaceArt · RG Poly) 인제스션 스크립트.
 *
 * 입력: 사용자가 다운로드한 번들 원본 루트 경로 (--source).
 *   원본은 팩별 폴더로 구성돼 있다고 가정한다 (최상위 폴더 1개 = 팩 1개).
 * 출력: --out 아래에 내부 ID 폴더 단위로 GLB를 모으고 manifest.json 과
 *   ingest-report.json 을 생성한다.
 *
 * 원칙 (사용자 확정 — 서비스 안에서만 사용·이용되는 구조):
 *   - 원본 파일명을 쓰지 않고 내부 ID(cbv1 계열)를 부여한다.
 *   - 느슨한 소스 파일(텍스처 PNG, 프로젝트 파일, .blend 원본 등)은
 *     결과물에 복사하지 않는다. GLB에 임베드된 것만 나간다.
 *   - manifest 에는 rights · inServiceOnly:true · downloadable:false 를
 *     항상 기록한다.
 *
 * 포맷 처리:
 *   - .glb 우선. .gltf 는 같은 폴더의 .bin/텍스처를 임베드할 수 없어
 *     단일 파일로 복사하지 않고 보고만 한다 (Blender 변환 후보).
 *   - .fbx / .blend 는 Blender CLI 가 있을 때만 GLB 로 변환한다
 *     (--blender <경로> 또는 PATH 의 blender). 없으면 건너뜀으로 보고.
 *   - .unitypackage / Godot 프로젝트 / 셰이더 등 비모델 파일은 제외 보고.
 *
 * 사용법:
 *   node scripts/ingest-creator-bundle.mjs --source <번들원본루트> --out <출력루트> [--dry-run] [--blender <경로>]
 *
 * 매니페스트 v2 모드 (--manifest-v2, 설계 §4·§5-1):
 *   node scripts/ingest-creator-bundle.mjs --source <번들원본루트> --manifest-v2 --out-v2 <v2출력루트> [--out <출력루트>] [--dry-run]
 *   원본 포맷(glb/gltf/fbx/obj/dae/blend)을 1급 에셋으로 등록하고
 *   manifest-v2.json + ingest-report-v2.json 을 --out-v2 아래에 생성한다.
 *   --manifest-v2 가 없으면 기존 v1 동작만 수행한다 (v1 산출 불변).
 *   v2 모드에서 --out 을 함께 주면 v1 동작도 같이 수행한다.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const sourceRoot = argValue("--source");
const outRoot = argValue("--out");
const dryRun = args.includes("--dry-run");
const blenderArg = argValue("--blender");
const manifestV2 = args.includes("--manifest-v2");
const outV2Root = argValue("--out-v2");

if (!sourceRoot || (!manifestV2 && !outRoot) || (manifestV2 && !outV2Root)) {
  console.error("usage: node scripts/ingest-creator-bundle.mjs --source <bundle-root> --out <out-root> [--dry-run] [--blender <path>]");
  console.error("   or: node scripts/ingest-creator-bundle.mjs --source <bundle-root> --manifest-v2 --out-v2 <out-v2-root> [--out <out-root>] [--dry-run]");
  process.exit(2);
}
if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
  console.error(`source not a directory: ${sourceRoot}`);
  process.exit(2);
}

function findBlender() {
  if (blenderArg) return existsSync(blenderArg) ? blenderArg : null;
  const probe = spawnSync("blender", ["--version"], { encoding: "utf8" });
  return probe.status === 0 ? "blender" : null;
}
const blender = findBlender();

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "pack";
}
function sha256Of(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const CONVERT_PY = [
  "import bpy, sys",
  "argv = sys.argv[sys.argv.index('--') + 1:]",
  "src, dst = argv[0], argv[1]",
  "bpy.ops.wm.read_factory_settings(use_empty=True)",
  "if src.lower().endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=src)",
  "elif src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)",
  "else: raise SystemExit('unsupported: ' + src)",
  "bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')",
].join("\n");

function convertToGlb(src, dst) {
  const scriptPath = join(outRoot, ".ingest-convert.py");
  if (!dryRun) writeFileSync(scriptPath, CONVERT_PY);
  const r = spawnSync(blender, ["-b", "--python", scriptPath, "--", src, dst], { encoding: "utf8" });
  return r.status === 0 && existsSync(dst);
}

const MODEL_EXTS = new Set([".glb"]);
const CONVERT_EXTS = new Set([".fbx", ".blend"]);
const SKIP_REPORT_EXTS = new Set([".gltf", ".unitypackage", ".png", ".jpg", ".jpeg", ".psd", ".shader", ".gdshader", ".tscn", ".tres", ".godot", ".zip"]);

const packDirs = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const looseFiles = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name);

const report = {
  tool: "scripts/ingest-creator-bundle.mjs",
  sourceRoot,
  outRoot,
  dryRun,
  blender: blender ?? null,
  startedAt: new Date().toISOString(),
  packs: [],
  totals: { packs: 0, glbCopied: 0, converted: 0, skippedConvertNoBlender: 0, skippedOther: 0, bytesIn: 0, bytesOut: 0, duplicates: 0 },
  looseFilesAtRoot: looseFiles,
  notes: [],
};
if (!blender) report.notes.push("Blender CLI를 찾지 못해 FBX/blend 변환을 전부 건너뜁니다. --blender <경로> 로 지정하면 변환합니다.");
if (looseFiles.length) report.notes.push("번들 루트 직속 파일은 팩 폴더가 아니라 팩으로 취급하지 않았습니다 (looseFilesAtRoot 참조).");

// --- v1 동작 (기존 그대로). --out 이 있을 때만 수행한다. ---
if (outRoot) {
const manifestFiles = [];
const seenHashes = new Map();

packDirs.forEach((dirName, idx) => {
  const packId = `cbv1-ingest-${String(idx + 1).padStart(3, "0")}-${slugify(dirName)}`;
  const packPath = join(sourceRoot, dirName);
  const files = walk(packPath);
  const pack = { packId, sourceFolder: dirName, glb: [], converted: [], skipped: [] };
  let modelSeq = 0;
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const size = statSync(file).size;
    report.totals.bytesIn += size;
    const rel = relative(sourceRoot, file);
    if (MODEL_EXTS.has(ext)) {
      const hash = sha256Of(file);
      if (seenHashes.has(hash)) {
        report.totals.duplicates += 1;
        pack.skipped.push({ file: rel, reason: `duplicate of ${seenHashes.get(hash)}` });
        continue;
      }
      modelSeq += 1;
      const outName = `${packId}-m${String(modelSeq).padStart(3, "0")}.glb`;
      const outPath = join(outRoot, packId, outName);
      if (!dryRun) {
        mkdirSync(join(outRoot, packId), { recursive: true });
        copyFileSync(file, outPath);
      }
      seenHashes.set(hash, `${packId}/${outName}`);
      pack.glb.push(outName);
      manifestFiles.push({ file: `${packId}/${outName}`, packId, bytes: size, sha256: hash, origin: "glb" });
      report.totals.glbCopied += 1;
      report.totals.bytesOut += size;
    } else if (CONVERT_EXTS.has(ext)) {
      if (!blender) {
        report.totals.skippedConvertNoBlender += 1;
        pack.skipped.push({ file: rel, reason: "no blender CLI — conversion skipped" });
        continue;
      }
      modelSeq += 1;
      const outName = `${packId}-m${String(modelSeq).padStart(3, "0")}.glb`;
      const outPath = join(outRoot, packId, outName);
      if (!dryRun) mkdirSync(join(outRoot, packId), { recursive: true });
      const ok = dryRun ? true : convertToGlb(file, outPath);
      if (ok) {
        const outSize = dryRun ? 0 : statSync(outPath).size;
        pack.converted.push({ from: rel, to: outName });
        manifestFiles.push({ file: `${packId}/${outName}`, packId, bytes: outSize, sha256: dryRun ? null : sha256Of(outPath), origin: ext.slice(1) });
        report.totals.converted += 1;
        report.totals.bytesOut += outSize;
      } else {
        pack.skipped.push({ file: rel, reason: "blender conversion failed" });
      }
    } else {
      report.totals.skippedOther += 1;
      if (SKIP_REPORT_EXTS.has(ext) || pack.skipped.length < 200) {
        pack.skipped.push({ file: rel, reason: `non-model source file (${ext || "no ext"}) — not copied` });
      }
    }
  }
  report.packs.push(pack);
  report.totals.packs += 1;
});

const manifest = {
  version: 1,
  kind: "toonstudio.virtual-studio.bundle-v1-ingest",
  generatedAt: new Date().toISOString(),
  source: {
    store: "itch.io",
    bundle: "Creator Bundle: Volume 1",
    url: "https://itch.io/b/3905/creator-bundle-volume-1",
    creators: ["EmaceArt", "RG Poly"],
  },
  rights: {
    holder: "EmaceArt / RG Poly (itch.io Creator Bundle: Volume 1 구매 라이선스)",
    inServiceOnly: true,
    downloadable: false,
    statement:
      "서비스 안에서만 사용·이용되는 구조 전용. 모델 파일 다운로드·내보내기를 제공하지 않으며, 장면은 참조 단위로 저장하고 렌더된 이미지만 외부로 나간다.",
  },
  inServiceOnly: true,
  downloadable: false,
  totals: {
    packs: report.totals.packs,
    files: manifestFiles.length,
    bytes: report.totals.bytesOut,
  },
  files: manifestFiles,
};

if (!dryRun) {
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(outRoot, "ingest-report.json"), JSON.stringify(report, null, 2) + "\n");
}

console.log(`packs: ${report.totals.packs}`);
console.log(`glb copied: ${report.totals.glbCopied}, converted: ${report.totals.converted}, duplicates skipped: ${report.totals.duplicates}`);
console.log(`skipped (no blender): ${report.totals.skippedConvertNoBlender}, skipped (non-model): ${report.totals.skippedOther}`);
console.log(`bytes in: ${report.totals.bytesIn}, bytes out: ${report.totals.bytesOut}`);
console.log(`blender: ${blender ?? "not found"}`);
console.log(dryRun ? "dry-run: nothing written" : `written: ${join(outRoot, "manifest.json")}, ${join(outRoot, "ingest-report.json")}`);
} // end if (outRoot) — v1 동작 끝

// ---------------------------------------------------------------------------
// 매니페스트 v2 (--manifest-v2)
// 설계 정본: docs/studio/asset-multiformat-native-support-design-20261020.md §4 (스키마), §5-1 (구현 범위)
//
// - 팩(최상위 폴더)별로 모델 파일(.glb/.gltf/.fbx/.obj/.dae/.blend)을 열거해 1급 에셋으로 등록한다.
// - 파일 배치: <out-v2>/<packId>/native/<입력(--source) 기준 상대 경로> — 입력 폴더 구조 유지.
//   하드링크(linkSync) 우선, 실패 시 복사. 여러 에셋이 공유하는 의존 파일은 한 번만 실물 배치된다.
// - 의존 수집은 참조 기반이다:
//     gltf: JSON의 buffers[].uri · images[].uri (data: URI 제외)를 모델 파일 기준 상대 경로로 해석.
//     obj : mtllib 참조 + MTL 파일 안의 map_* 계열 텍스처 참조를 파싱.
//     fbx/dae/blend: 외부 텍스처 선언을 신뢰할 수 없어 의존 수집을 하지 않고 주 파일 단일 에셋으로 등록한다.
// - 중복 판정은 모델 단위: 주 파일 sha256 + 의존 파일 sha256(정렬) 결합 해시. 중복이면 첫 에셋만 남긴다.
// - role: blend 만 "source-only", 나머지는 "runtime".
// - convertedGlb: work3/results/*.tsv 의 변환 출처 매핑(OK 행)이 1순위, 없으면 converted/ 트리에
//   동일 상대 경로의 .glb 가 있을 때만 채운다. 둘 다 아니면 null (추측으로 채우지 않는다).
//   채운 경우 실물 GLB를 <out-v2>/<packId>/converted/<converted 기준 상대 경로> 에 하드링크로
//   배치해, 매니페스트 상대 경로가 실존 파일을 가리키도록 한다.
// ---------------------------------------------------------------------------
const V2_MODEL_EXTS = new Map([
  [".glb", "glb"],
  [".gltf", "gltf"],
  [".fbx", "fbx"],
  [".obj", "obj"],
  [".dae", "dae"],
  [".blend", "blend"],
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

// 파일 정보(크기·sha256) 캐시 — 의존 파일이 여러 에셋에서 공유되므로 절대 경로 단위로 재사용한다.
const v2FileInfoCache = new Map();
function fileInfo(absPath) {
  let info = v2FileInfoCache.get(absPath);
  if (!info) {
    info = { bytes: statSync(absPath).size, sha256: sha256Of(absPath) };
    v2FileInfoCache.set(absPath, info);
  }
  return info;
}

// 하드링크 우선 배치. 대상이 이미 있으면(공유 의존 파일 등) 건너뛴다.
function placeFile(srcAbs, destAbs) {
  if (existsSync(destAbs)) return "exists";
  mkdirSync(dirname(destAbs), { recursive: true });
  try {
    linkSync(srcAbs, destAbs);
    return "link";
  } catch {
    copyFileSync(srcAbs, destAbs);
    return "copy";
  }
}

function decodeUriSafe(uri) {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}
function hasUriScheme(uri) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith("//");
}
// 모델 파일 기준 상대 URI를 절대 경로로 해석한다 (쿼리/프래그먼트 제거, 백슬래시 표기 허용).
function resolveDepAbs(modelAbs, rawUri) {
  const clean = decodeUriSafe(rawUri.split("#")[0].split("?")[0]).replace(/\\/g, "/");
  return resolve(dirname(modelAbs), clean);
}
// 누락 의존 표기: 입력 루트 안이면 입력 기준 상대 경로(posix), 밖이면 원본 URI 그대로.
function missingLabel(sourceRootAbs, abs, rawUri) {
  const rel = relative(sourceRootAbs, abs);
  return rel.startsWith("..") ? rawUri : toPosix(rel);
}

function collectGltfDeps(gltfAbs, sourceRootAbs, addDep, addMissing) {
  let json;
  try {
    json = JSON.parse(readFileSync(gltfAbs, "utf8"));
  } catch (e) {
    return { parseError: String((e && e.message) || e) };
  }
  const visit = (uri, kind) => {
    if (typeof uri !== "string" || uri === "") return;
    if (uri.startsWith("data:")) return; // 임베드 — 의존 파일 없음
    if (hasUriScheme(uri)) {
      addMissing(uri); // 외부 URL 참조는 수집할 수 없다 — 누락으로 정직하게 기록
      return;
    }
    const abs = resolveDepAbs(gltfAbs, uri);
    if (existsSync(abs) && statSync(abs).isFile()) addDep(abs, kind);
    else addMissing(missingLabel(sourceRootAbs, abs, uri));
  };
  for (const b of Array.isArray(json.buffers) ? json.buffers : []) visit(b && b.uri, "buffer");
  for (const im of Array.isArray(json.images) ? json.images : []) visit(im && im.uri, "texture");
  return {};
}

function collectObjDeps(objAbs, sourceRootAbs, addDep, addMissing) {
  const text = readFileSync(objAbs, "utf8");
  const mtlAbsList = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*mtllib\s+(.+)$/);
    if (!m) continue;
    for (const name of m[1].trim().split(/\s+/)) {
      if (!name) continue;
      const abs = resolve(dirname(objAbs), name);
      if (existsSync(abs) && statSync(abs).isFile()) {
        addDep(abs, "material");
        mtlAbsList.push(abs);
      } else addMissing(missingLabel(sourceRootAbs, abs, name));
    }
  }
  for (const mtlAbs of mtlAbsList) {
    const mtlText = readFileSync(mtlAbs, "utf8");
    for (const line of mtlText.split(/\r?\n/)) {
      // map_Ka/map_Kd/map_Ks/map_Ke/map_Ns/map_d/map_Bump/bump/disp/decal/refl …
      // 옵션(-s/-o/-bm 등)이 파일명 앞에 올 수 있어 마지막 토큰을 텍스처 경로로 본다.
      const m = line.match(/^\s*(map_\w+|bump|disp|decal|refl)\b\s*(.+)$/i);
      if (!m) continue;
      const tokens = m[2].trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      const texName = tokens[tokens.length - 1];
      const abs = resolve(dirname(mtlAbs), texName);
      if (existsSync(abs) && statSync(abs).isFile()) addDep(abs, "texture");
      else addMissing(missingLabel(sourceRootAbs, abs, texName));
    }
  }
}

// 변환 출처 매핑 로드: <source 부모>/work3/results/*.tsv 의 OK 행 (src 절대 경로 → dst 절대 경로).
// converted 루트는 <source 부모>/converted 로 둔다 (combined/converted 가 형제 트리인 현행 구조).
function loadConvertedMap(sourceRootAbs) {
  const base = dirname(sourceRootAbs);
  const resultsDir = join(base, "work3", "results");
  const map = new Map();
  if (existsSync(resultsDir)) {
    for (const name of readdirSync(resultsDir).sort()) {
      if (!name.endsWith(".tsv")) continue;
      for (const line of readFileSync(join(resultsDir, name), "utf8").split(/\r?\n/)) {
        if (!line) continue;
        const f = line.split("\t");
        if (f[0] === "OK" && f.length >= 3) map.set(f[1], f[2]);
      }
    }
  }
  return { map, convertedRoot: join(base, "converted"), tsvEntries: map.size };
}

function runManifestV2() {
  const sourceRootAbs = resolve(sourceRoot);
  const outV2Abs = resolve(outV2Root);
  const startedAt = new Date().toISOString();
  const { map: convertedMap, convertedRoot, tsvEntries } = loadConvertedMap(sourceRootAbs);
  const notes = [
    "fbx/dae/blend: 외부 텍스처 선언을 신뢰할 수 없어 의존 수집을 하지 않고 주 파일 단일 에셋으로 등록한다.",
    "파일 배치: <out-v2>/<packId>/native/<입력 기준 상대 경로> 로 입력 폴더 구조를 유지하고, 하드링크 우선(실패 시 복사)으로 배치한다. 공유 의존 파일은 한 번만 실물 배치된다.",
    "convertedGlb: work3/results/*.tsv OK 매핑이 1순위, 없으면 converted/ 트리의 동일 상대 경로 .glb 존재로만 판정한다. 채운 경우 실물을 <out-v2>/<packId>/converted/ 아래에 하드링크한다.",
    "에셋 id는 v1 규칙(cbv1-ingest-NNN-<slug>-mNNN)을 따르고, 파일 경로는 native/ 구조 보존 방식을 쓴다 (id와 파일 경로를 분리한 판단 — NOTES.md 참조).",
    "complete 판정: missingDependencies가 비어 있고 (gltf) JSON 파싱에 성공한 경우만 complete로 센다.",
  ];
  const byFormatInit = () => ({ assets: 0, files: 0, complete: 0 });
  const totals = {
    packs: 0,
    assets: 0,
    files: 0,
    bytes: 0,
    byFormat: { glb: byFormatInit(), gltf: byFormatInit(), fbx: byFormatInit(), obj: byFormatInit(), dae: byFormatInit(), blend: byFormatInit() },
    runtimeUsable: 0,
  };
  const assets = [];
  const duplicates = [];
  const parseFailures = [];
  const seenModels = new Map(); // 모델 결합 해시 -> 첫 에셋 id
  let convertedLinked = 0;
  let placedLinks = 0;
  let placedCopies = 0;
  const packSummaries = [];
  const place = (srcAbs, destAbs) => {
    if (dryRun) return;
    const r = placeFile(srcAbs, destAbs);
    if (r === "link") placedLinks += 1;
    else if (r === "copy") placedCopies += 1;
  };

  const v2PackDirs = readdirSync(sourceRootAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  v2PackDirs.forEach((dirName, idx) => {
    const packId = `cbv1-ingest-${String(idx + 1).padStart(3, "0")}-${slugify(dirName)}`;
    const packAbs = join(sourceRootAbs, dirName);
    const files = walk(packAbs).sort();
    let seq = 0;
    const summary = { packId, sourceFolder: dirName, assets: 0, duplicates: 0, byFormat: {} };
    for (const fileAbs of files) {
      const format = V2_MODEL_EXTS.get(extname(fileAbs).toLowerCase());
      if (!format) continue;
      const sourceRel = toPosix(relative(sourceRootAbs, fileAbs));

      // 의존 수집 (참조 기반)
      const deps = new Map(); // abs -> kind
      const missing = [];
      const missingSet = new Set();
      const addDep = (abs, kind) => {
        if (abs !== fileAbs && !deps.has(abs)) deps.set(abs, kind);
      };
      const addMissing = (p) => {
        if (!missingSet.has(p)) {
          missingSet.add(p);
          missing.push(p);
        }
      };
      let parseFailed = false;
      if (format === "gltf") {
        const r = collectGltfDeps(fileAbs, sourceRootAbs, addDep, addMissing);
        if (r.parseError) {
          parseFailed = true;
          parseFailures.push({ sourcePath: sourceRel, error: r.parseError });
        }
      } else if (format === "obj") {
        collectObjDeps(fileAbs, sourceRootAbs, addDep, addMissing);
      }
      // glb/fbx/dae/blend: 의존 수집 없음 (단일 파일 에셋)

      // 모델 단위 중복 판정: 주 파일 sha256 + 의존 파일 sha256 정렬 결합 해시
      const primaryInfo = fileInfo(fileAbs);
      const depList = [...deps.entries()].map(([abs, kind]) => ({ abs, kind, ...fileInfo(abs) }));
      const hashInput = [primaryInfo.sha256, ...depList.map((d) => d.sha256).sort()].join("\n");
      const modelHash = createHash("sha256").update(hashInput).digest("hex");
      if (seenModels.has(modelHash)) {
        duplicates.push({ sourcePath: sourceRel, format, duplicateOf: seenModels.get(modelHash), modelHash });
        summary.duplicates += 1;
        continue;
      }
      seq += 1;
      const id = `${packId}-m${String(seq).padStart(3, "0")}`;
      seenModels.set(modelHash, id);
      const role = format === "blend" ? "source-only" : "runtime";
      const complete = missing.length === 0 && !parseFailed;

      // files[] 구성 + 실물 배치
      const primaryDestRel = `${packId}/native/${sourceRel}`;
      place(fileAbs, join(outV2Abs, primaryDestRel));
      const fileRecs = [{ path: primaryDestRel, kind: "primary", bytes: primaryInfo.bytes, sha256: primaryInfo.sha256 }];
      const depRecs = depList
        .map((d) => {
          const rel = toPosix(relative(sourceRootAbs, d.abs));
          const destRel = `${packId}/native/${rel}`;
          place(d.abs, join(outV2Abs, destRel));
          return { path: destRel, kind: d.kind, bytes: d.bytes, sha256: d.sha256 };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      fileRecs.push(...depRecs);

      // convertedGlb (glb 자체는 변환본 개념이 없어 항상 null)
      let convertedGlb = null;
      if (format !== "glb") {
        let convAbs = convertedMap.get(fileAbs) ?? null;
        if (convAbs && !(existsSync(convAbs) && statSync(convAbs).isFile())) convAbs = null;
        if (!convAbs) {
          const candAbs = join(convertedRoot, sourceRel.replace(/\.[^/.]+$/, ".glb"));
          if (existsSync(candAbs) && statSync(candAbs).isFile()) convAbs = candAbs;
        }
        if (convAbs) {
          const convRel = toPosix(relative(convertedRoot, convAbs));
          convertedGlb = `${packId}/converted/${convRel}`;
          place(convAbs, join(outV2Abs, convertedGlb));
          convertedLinked += 1;
        }
      }

      assets.push({
        id,
        packId,
        format,
        role,
        primary: primaryDestRel,
        sourcePath: sourceRel,
        files: fileRecs,
        missingDependencies: missing,
        convertedGlb,
      });
      const bytesSum = fileRecs.reduce((s, f) => s + f.bytes, 0);
      totals.assets += 1;
      totals.files += fileRecs.length;
      totals.bytes += bytesSum;
      const bf = totals.byFormat[format];
      bf.assets += 1;
      bf.files += fileRecs.length;
      if (complete) bf.complete += 1;
      if (role === "runtime" && complete) totals.runtimeUsable += 1;
      summary.assets += 1;
      summary.byFormat[format] = (summary.byFormat[format] ?? 0) + 1;
    }
    totals.packs += 1;
    packSummaries.push(summary);
  });

  const manifestV2 = {
    version: 2,
    kind: "toonstudio.asset-bundle.v2",
    generatedAt: new Date().toISOString(),
    source: {
      store: "itch.io",
      bundle: "Creator Bundle: Volume 1",
      url: "https://itch.io/b/3905/creator-bundle-volume-1",
      creators: ["EmaceArt", "RG Poly"],
    },
    rights: {
      holder: "EmaceArt / RG Poly (itch.io Creator Bundle: Volume 1 구매 라이선스)",
      inServiceOnly: true,
      downloadable: false,
      statement:
        "서비스 안에서만 사용·이용되는 구조 전용. 모델 파일 다운로드·내보내기를 제공하지 않으며, 장면은 참조 단위로 저장하고 렌더된 이미지만 외부로 나간다.",
    },
    inServiceOnly: true,
    downloadable: false,
    basePath: "",
    totals,
    assets,
  };
  const reportV2 = {
    tool: "scripts/ingest-creator-bundle.mjs",
    mode: "manifest-v2",
    sourceRoot: sourceRootAbs,
    outV2Root: outV2Abs,
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    totals,
    duplicatesRemoved: duplicates.length,
    duplicates,
    convertedGlbLinked: convertedLinked,
    convertedMapEntries: tsvEntries,
    gltfParseFailures: parseFailures,
    placement: { hardlinks: placedLinks, copies: placedCopies },
    packs: packSummaries,
    notes,
  };

  if (!dryRun) {
    mkdirSync(outV2Abs, { recursive: true });
    writeFileSync(join(outV2Abs, "manifest-v2.json"), JSON.stringify(manifestV2, null, 2) + "\n");
    writeFileSync(join(outV2Abs, "ingest-report-v2.json"), JSON.stringify(reportV2, null, 2) + "\n");
  }
  console.log(`[v2] packs: ${totals.packs}, assets: ${totals.assets}, files: ${totals.files}, bytes: ${totals.bytes}`);
  console.log(`[v2] byFormat: ${Object.entries(totals.byFormat).map(([k, v]) => `${k}=${v.assets}(complete ${v.complete})`).join(", ")}`);
  console.log(`[v2] runtimeUsable: ${totals.runtimeUsable}, duplicates removed: ${duplicates.length}, convertedGlb linked: ${convertedLinked}`);
  console.log(`[v2] placement: hardlinks ${placedLinks}, copies ${placedCopies}`);
  console.log(dryRun ? "[v2] dry-run: nothing written" : `[v2] written: ${join(outV2Abs, "manifest-v2.json")}, ${join(outV2Abs, "ingest-report-v2.json")}`);
}

if (manifestV2) runManifestV2();
