/** 기존 Vite 원장이 지목한 코드 바이트만 보존한다. 라이선스·fingerprint 판정은 하지 않는다. */
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 512;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const RECORD_FILE = "pigment-code-evidence.json";
const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const codeFile = (value) => /\.(?:js|mjs)$/u.test(value);

function relativeFile(value) {
  if (typeof value !== "string" || !value || path.posix.isAbsolute(value)
    || /^[a-z]:/iu.test(value) || /[\\\0?#]/u.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`보존 파일의 상대 경로가 안전하지 않습니다: ${String(value)}`);
  }
  return value;
}

function validateAudit(audit, scope) {
  if (!record(audit) || audit.schemaVersion !== 1 || audit.scope !== scope
    || !Array.isArray(audit.internalPigmentChunks) || !audit.internalPigmentChunks.every((file) => typeof file === "string")
    || !Array.isArray(audit.forbiddenModules) || !audit.forbiddenModules.every((id) => typeof id === "string")) {
    throw new Error(`기존 안료 원장 형식을 확인하지 못했습니다: ${scope}`);
  }
}

/** manifest key는 소스 식별자일 수 있다. 파일 경로로 해석하지 않고 imports 참조에만 쓴다. */
export function selectPigmentEvidenceFiles(manifest, audits) {
  if (!record(manifest) || !Array.isArray(audits) || !audits.some((item) => item.scope === "app")) {
    throw new Error("app manifest와 기존 app 안료 원장이 필요합니다.");
  }
  const byFile = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    if (!record(entry) || typeof entry.file !== "string") throw new Error(`manifest 항목이 올바르지 않습니다: ${key}`);
    relativeFile(entry.file);
    if (entry.imports !== undefined && (!Array.isArray(entry.imports) || !entry.imports.every((item) => typeof item === "string"))) {
      throw new Error(`manifest 정적 import가 올바르지 않습니다: ${key}`);
    }
    byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), key]);
  }
  const selected = new Map(), roots = new Set();
  const add = (file, reason) => {
    relativeFile(file);
    if (!codeFile(file)) throw new Error(`원장이 지목한 파일이 JS/MJS가 아닙니다: ${file}`);
    if (!selected.has(file)) selected.set(file, new Set());
    selected.get(file).add(reason);
    // 원장 JSON 한 개까지 포함한 전체 파일 수다.
    if (selected.size + 1 > MAX_EVIDENCE_FILES) throw new Error("안료 코드 증거가 512파일 한도를 넘습니다.");
  };
  for (const item of audits) {
    if (item.scope !== "app" && item.scope !== "worker") throw new Error("안료 원장의 scope가 올바르지 않습니다.");
    validateAudit(item.audit, item.scope);
    relativeFile(item.file);
    for (const file of item.audit.internalPigmentChunks) {
      add(file, `${item.scope}-audit:${item.file}`);
      if (item.scope === "app") {
        if (!byFile.has(file)) throw new Error(`app 원장의 청크가 manifest에 없습니다: ${file}`);
        for (const key of byFile.get(file)) roots.add(key);
      }
    }
  }
  const material = Object.entries(manifest).filter(([key, entry]) => entry.name === "brush-studio-v6-material-engine"
    || /(?:^|\/)brush-studio-v6-material-engine\.[cm]?[jt]s$/u.test(key)
    || /^_brush-studio-v6-material-engine-[^/]+\.(?:js|mjs)$/u.test(key)
    || /(?:^|\/)brush-studio-v6-material-engine-[^/]+\.(?:js|mjs)$/u.test(entry.file));
  if (!material.length) throw new Error("manifest에서 material-engine entry를 찾지 못했습니다.");
  for (const [key, entry] of material) {
    add(entry.file, `material-engine:${key}`);
    roots.add(key);
  }
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!Object.hasOwn(manifest, key) || !record(entry)) throw new Error(`정적 import의 manifest 항목이 없습니다: ${key}`);
    visited.add(key);
    if (codeFile(entry.file)) add(entry.file, `app-static-closure:${key}`);
    for (const imported of entry.imports ?? []) {
      const dependency = manifest[imported];
      if (!Object.hasOwn(manifest, imported) || !record(dependency)) throw new Error(`정적 import의 manifest 항목이 없습니다: ${imported}`);
      if (codeFile(dependency.file)) add(dependency.file, `app-static-import:${key}`);
      visit(imported);
    }
  };
  for (const root of [...roots].sort(compare)) visit(root);
  return [...selected].sort(([a], [b]) => compare(a, b)).map(([file, reasons]) => ({ file, reasons: [...reasons].sort(compare) }));
}

async function noSymlinks(absolute, allowMissing = false) {
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try { stat = await lstat(current); }
    catch (error) { if (allowMissing && error.code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`심볼릭 링크 경로는 보존에 사용할 수 없습니다: ${current}`);
  }
}

async function checkedFile(source, file) {
  const absolute = path.join(source, ...relativeFile(file).split("/"));
  await noSymlinks(absolute);
  const stat = await lstat(absolute);
  if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw new Error(`일반 파일이 아닙니다: ${file}`);
  return { absolute, stat };
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function openChecked(file) {
  const handle = await open(file.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await noSymlinks(file.absolute);
    if (!sameIdentity(file.stat, await handle.stat())) throw new Error("계획 이후 출처 파일이 바뀌었습니다.");
    return handle;
  } catch (error) { await handle.close(); throw error; }
}

async function readMetadata(source, file) {
  const checked = await checkedFile(source, file);
  if (checked.stat.size > MAX_METADATA_BYTES) throw new Error(`원장 파일이 8MiB 한도를 넘습니다: ${file}`);
  const handle = await openChecked(checked);
  try {
    const bytes = await handle.readFile();
    if (!sameIdentity(checked.stat, await handle.stat())) throw new Error(`읽는 동안 원장이 바뀌었습니다: ${file}`);
    return { value: JSON.parse(bytes.toString("utf8")), file, bytes: bytes.length, sha256: hash(bytes) };
  } finally { await handle.close(); }
}

/** JS는 텍스트로 해석하지 않는다. 동일 파일 descriptor의 바이트를 해시·복사만 한다. */
async function transferBytes(checked, destination) {
  const source = await openChecked(checked);
  let target;
  try {
    if (destination) {
      await noSymlinks(path.dirname(destination));
      target = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    }
    const digest = createHash("sha256");
    let size = 0;
    for await (const chunk of source.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > checked.stat.size) throw new Error("읽는 동안 코드 파일의 크기가 바뀌었습니다.");
      digest.update(chunk);
      if (target) await target.writeFile(chunk);
    }
    if (size !== checked.stat.size || !sameIdentity(checked.stat, await source.stat())) throw new Error("읽는 동안 코드 파일이 바뀌었습니다.");
    return { bytes: size, sha256: digest.digest("hex") };
  } finally { if (target) await target.close(); await source.close(); }
}

export async function preservePigmentBundleEvidence(options = {}) {
  const source = path.resolve(options.sourceDir ?? path.join(REPO_ROOT, "dist"));
  const output = path.resolve(options.outputDir ?? path.join(REPO_ROOT, "artifacts/core/pigment-code"));
  if (source === output || output.startsWith(`${source}${path.sep}`) || source.startsWith(`${output}${path.sep}`)) {
    throw new Error("출처와 목적지는 같거나 서로 포함할 수 없습니다.");
  }
  await noSymlinks(source);
  if (!(await lstat(source)).isDirectory()) throw new Error("출처 dist가 디렉터리가 아닙니다.");
  await noSymlinks(output, true);
  try { await lstat(output); throw new Error("기존 목적지는 덮어쓰지 않습니다. 새 목적지를 지정하세요."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  // CI가 미리 준비한 artifacts/core 같은 부모만 사용한다. 부모 디렉터리를 임의 생성하지 않는다.
  await noSymlinks(path.dirname(output));
  if (!(await lstat(path.dirname(output))).isDirectory()) throw new Error("목적지 부모 디렉터리가 필요합니다.");
  if (await realpath(source) !== source || await realpath(path.dirname(output)) !== path.dirname(output)) {
    throw new Error("출처와 목적지 부모는 실제 경로여야 합니다.");
  }
  const manifest = await readMetadata(source, ".vite/manifest.json");
  await noSymlinks(path.join(source, "legal"));
  const names = (await readdir(path.join(source, "legal"))).filter((name) => name === "pigment-bundle-audit.json"
    || /^pigment-worker-audit-.+\.json$/u.test(name)).sort(compare);
  if (names.length > MAX_EVIDENCE_FILES) throw new Error("안료 원장 수가 보존 한도를 넘습니다.");
  const audits = [];
  for (const name of names) {
    const metadata = await readMetadata(source, `legal/${name}`);
    audits.push({ ...metadata, scope: name === "pigment-bundle-audit.json" ? "app" : "worker", audit: metadata.value });
  }
  const selection = selectPigmentEvidenceFiles(manifest.value, audits);
  let codeBytes = 0;
  const sources = [];
  for (const item of selection) {
    const checked = await checkedFile(source, item.file);
    codeBytes += checked.stat.size;
    if (codeBytes > MAX_EVIDENCE_BYTES) throw new Error("안료 코드 증거가 20MiB 한도를 넘습니다.");
    sources.push({ ...item, checked });
  }
  const files = [];
  for (const item of sources) files.push({ file: item.file, reasons: item.reasons, ...await transferBytes(item.checked) });
  const ledger = {
    schemaVersion: 1, kind: "pigment-bundle-code-evidence", sourceDirectory: source, outputDirectory: output,
    limits: { maximumBytes: MAX_EVIDENCE_BYTES, maximumFiles: MAX_EVIDENCE_FILES },
    coverage: "원장의 app/worker internalPigmentChunks, material-engine entry와 app 정적 import closure의 JS/MJS만 보존. 동적 import·worker 전체 import closure·전체 번들 검증이 아님.",
    licenseAssessment: "기존 Vite 원장을 참조하며 이 복사기는 라이선스 또는 fingerprint를 판정하지 않음.",
    metadata: [{ file: manifest.file, bytes: manifest.bytes, sha256: manifest.sha256 }, ...audits.map((item) => ({
      file: item.file, bytes: item.bytes, sha256: item.sha256, scope: item.scope,
      reportedForbiddenModules: item.audit.forbiddenModules, checkedChunks: item.audit.checkedChunks, checkedModules: item.audit.checkedModules,
    }))], codeBytes, codeFiles: files.length, files,
  };
  const ledgerText = `${JSON.stringify(ledger, null, 2)}\n`;
  if (codeBytes + Buffer.byteLength(ledgerText) > MAX_EVIDENCE_BYTES) throw new Error("원장을 포함한 코드 증거가 20MiB 한도를 넘습니다.");
  if (options.dryRun) return { dryRun: true, outputDirectory: output, totalFiles: files.length + 1, totalBytes: codeBytes + Buffer.byteLength(ledgerText), ledger };
  await mkdir(output, { mode: 0o700 });
  try {
    for (const item of sources) {
      const target = path.join(output, ...item.file.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      const copied = await transferBytes(item.checked, target);
      const planned = files.find((file) => file.file === item.file);
      if (copied.bytes !== planned.bytes || copied.sha256 !== planned.sha256) throw new Error(`복사 바이트가 계획과 다릅니다: ${item.file}`);
    }
    const handle = await open(path.join(output, RECORD_FILE), "wx", 0o600);
    try { await handle.writeFile(ledgerText); } finally { await handle.close(); }
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
  return { dryRun: false, outputDirectory: output, totalFiles: files.length + 1, totalBytes: codeBytes + Buffer.byteLength(ledgerText), ledger };
}

async function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--source-dir" || arg === "--output-dir") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${arg}에 경로를 지정하세요.`);
      options[arg === "--source-dir" ? "sourceDir" : "outputDir"] = args[++index];
    } else if (arg === "--help") {
      console.log("사용법: node scripts/preserve-pigment-bundle-evidence.mjs [--source-dir dist] [--output-dir artifacts/core/pigment-code] [--dry-run]");
      return;
    } else throw new Error(`알 수 없는 인자입니다: ${arg}`);
  }
  const result = await preservePigmentBundleEvidence(options);
  console.log(JSON.stringify({ dryRun: result.dryRun, outputDirectory: result.outputDirectory, totalFiles: result.totalFiles, totalBytes: result.totalBytes, files: result.ledger.files }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(`안료 코드 증거 보존 실패: ${error.message}`); process.exitCode = 1; });
}
