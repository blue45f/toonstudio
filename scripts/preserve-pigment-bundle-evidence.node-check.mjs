import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

import { MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, preservePigmentBundleEvidence, selectPigmentEvidenceFiles } from "./preserve-pigment-bundle-evidence.mjs";

const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const sha = (value) => createHash("sha256").update(value).digest("hex");
const audit = (scope, chunks) => ({ schemaVersion: 1, scope, forbiddenPackages: ["mixbox"], forbiddenModules: [], checkedChunks: chunks.length, checkedModules: 3, internalPigmentChunks: chunks });

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "pigment-code-evidence-")));
  temporary.push(root);
  const source = path.join(root, "dist"), output = path.join(root, "preserved");
  for (const part of [".vite", "legal", "assets"]) await mkdir(path.join(source, part), { recursive: true });
  const manifest = {
    "_brush-studio-v6-material-engine-a.js": { file: "assets/brush-studio-v6-material-engine-a.js", name: "brush-studio-v6-material-engine", imports: ["_shared", "style"], dynamicImports: ["_dynamic"] },
    _shared: { file: "assets/shared.mjs", imports: ["_brush-studio-v6-material-engine-a.js"] },
    _native: { file: "assets/native.js", imports: ["_shared"] },
    style: { file: "assets/style.css" },
    _dynamic: { file: "assets/not-selected.js" },
  };
  const app = audit("app", ["assets/native.js"]), worker = audit("worker", ["assets/worker.js"]);
  const save = async () => {
    await writeFile(path.join(source, ".vite/manifest.json"), JSON.stringify(manifest));
    await writeFile(path.join(source, "legal/pigment-bundle-audit.json"), JSON.stringify(app));
    await writeFile(path.join(source, "legal/pigment-worker-audit-worker.js.json"), JSON.stringify(worker));
  };
  await save();
  for (const file of ["brush-studio-v6-material-engine-a.js", "shared.mjs", "native.js", "worker.js", "not-selected.js", "style.css"]) {
    await writeFile(path.join(source, "assets", file), `/* 합성 증거: ${file} */\n`);
  }
  return { root, source, output, manifest, app, worker, save };
}

test("shared manifest key와 원장 청크의 정적 closure만 복사하며 중복·순환을 합친다", async () => {
  const f = await fixture();
  await writeFile(path.join(f.source, "legal/pigment-worker-audit-second.js.json"), JSON.stringify(f.worker));
  const result = await preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output });
  assert.equal(result.totalFiles, 5);
  assert.deepEqual(result.ledger.files.map((item) => item.file), ["assets/brush-studio-v6-material-engine-a.js", "assets/native.js", "assets/shared.mjs", "assets/worker.js"]);
  assert.equal(result.ledger.files.find((item) => item.file === "assets/worker.js").reasons.length, 2);
  for (const item of result.ledger.files) {
    const original = await readFile(path.join(f.source, item.file)), copied = await readFile(path.join(f.output, item.file));
    assert.deepEqual(copied, original);
    assert.equal(item.sha256, sha(original));
    assert.equal(item.bytes, original.length);
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(f.output, "pigment-code-evidence.json"), "utf8")), result.ledger);
  assert.equal(result.ledger.metadata.length, 4);
  assert.equal(result.totalBytes, result.ledger.codeBytes + (await readFile(path.join(f.output, "pigment-code-evidence.json"))).length);
  assert.deepEqual((await readdir(path.join(f.output, "assets"))).sort(), ["brush-studio-v6-material-engine-a.js", "native.js", "shared.mjs", "worker.js"]);
});

test("dry-run은 전체 선정·크기·해시를 확인하지만 목적지를 만들지 않는다", async () => {
  const f = await fixture(), result = await preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true });
  await assert.rejects(readFile(path.join(f.output, "pigment-code-evidence.json")), { code: "ENOENT" });
  const copied = await preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output });
  assert.deepEqual(result.ledger, copied.ledger);
});

test("여러 stream chunk의 바이트와 해시를 순서대로 보존한다", async () => {
  const f = await fixture();
  const bytes = Buffer.alloc(3 * 65536 + 17);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  await writeFile(path.join(f.source, "assets/native.js"), bytes);
  const result = await preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output });
  const copied = await readFile(path.join(f.output, "assets/native.js"));
  assert.deepEqual(copied, bytes);
  assert.equal(result.ledger.files.find((item) => item.file === "assets/native.js").sha256, sha(bytes));
});

test("CLI는 다른 cwd에서도 명시한 경로로 dry-run하고 코드 내용을 출력하지 않는다", async () => {
  const f = await fixture();
  const script = fileURLToPath(new URL("./preserve-pigment-bundle-evidence.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--source-dir", f.source, "--output-dir", f.output, "--dry-run"], { cwd: f.root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).totalFiles, 5);
  assert.equal(result.stdout.includes("합성 증거"), false);
});

test("원장을 복사기 자체의 라이선스 판정으로 바꾸지 않는다", async () => {
  const f = await fixture();
  f.app.forbiddenModules = ["기존 원장에 기록된 경로"];
  await f.save();
  const result = await preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true });
  assert.deepEqual(result.ledger.metadata.find((item) => item.scope === "app").reportedForbiddenModules, f.app.forbiddenModules);
});

test("존재하는 목적지는 빈 디렉터리여도 덮어쓰지 않는다", async () => {
  const f = await fixture(); await mkdir(f.output);
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output }), /덮어쓰지/u);
  assert.deepEqual(await readdir(f.output), []);
});

test("출처·목적지가 같거나 서로 포함하는 경로를 거부한다", async () => {
  const f = await fixture();
  for (const outputDir of [f.source, path.join(f.source, "evidence"), f.root]) {
    await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir }), /서로 포함/u);
  }
});

test("원장 경계이탈과 JS/MJS가 아닌 원장 청크를 거부한다", async () => {
  const f = await fixture();
  for (const value of ["../escape.js", "/outside.js", "C:\\outside.js", "assets/../escape.js", "assets/native.js?raw", "assets/style.css"]) {
    f.worker.internalPigmentChunks = [value]; await f.save();
    await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true }), /상대 경로|JS\/MJS/u);
  }
});

test("누락·상속된 manifest 정적 import와 알 수 없는 원장 버전을 거부한다", async () => {
  const f = await fixture();
  for (const key of ["missing", "__proto__"]) {
    f.manifest._shared.imports = [key]; await f.save();
    await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true }), /manifest 항목/u);
  }
  f.manifest._shared.imports = [];
  f.app.schemaVersion = 2; await f.save();
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true }), /원장 형식/u);
});

test("출처 코드·메타데이터와 목적지 부모의 symlink를 거부한다", async () => {
  const f = await fixture();
  const native = path.join(f.source, "assets/native.js"); await rm(native);
  await symlink(path.join(f.source, "assets/shared.mjs"), native);
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true }), /심볼릭/u);
  await rm(native); await writeFile(native, "/* 합성 */");
  const metadata = path.join(f.source, ".vite/manifest.json"), saved = await readFile(metadata);
  await rm(metadata); await writeFile(path.join(f.root, "manifest.json"), saved); await symlink(path.join(f.root, "manifest.json"), metadata);
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output, dryRun: true }), /심볼릭/u);
  await rm(metadata); await writeFile(metadata, saved);
  await symlink(f.root, path.join(f.root, "linked-parent"));
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: path.join(f.root, "linked-parent/out"), dryRun: true }), /심볼릭/u);
});

test("20MiB를 넘는 합성 sparse 파일은 복사·목적지 생성 전에 거부한다", async () => {
  const f = await fixture(); await truncate(path.join(f.source, "assets/native.js"), MAX_EVIDENCE_BYTES + 1);
  await assert.rejects(preservePigmentBundleEvidence({ sourceDir: f.source, outputDir: f.output }), /20MiB/u);
  await assert.rejects(readdir(f.output), { code: "ENOENT" });
});

test("원장을 포함한 전체 512파일 한도를 고정해 과잉 선정을 거부한다", () => {
  const manifest = { engine: { name: "brush-studio-v6-material-engine", file: "assets/engine.js" } };
  const chunks = Array.from({ length: MAX_EVIDENCE_FILES }, (_, index) => `assets/chunk-${index}.js`);
  for (const file of chunks) manifest[file] = { file };
  assert.throws(() => selectPigmentEvidenceFiles(manifest, [{ scope: "app", file: "legal/pigment-bundle-audit.json", audit: audit("app", chunks) }]), /512파일/u);
});
