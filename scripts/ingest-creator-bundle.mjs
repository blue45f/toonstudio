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
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const sourceRoot = argValue("--source");
const outRoot = argValue("--out");
const dryRun = args.includes("--dry-run");
const blenderArg = argValue("--blender");

if (!sourceRoot || !outRoot) {
  console.error("usage: node scripts/ingest-creator-bundle.mjs --source <bundle-root> --out <out-root> [--dry-run] [--blender <path>]");
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
