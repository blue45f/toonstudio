import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

const test = process.env.VITEST ? vitestTest : nodeTest;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = join(ROOT, "scripts/verify-creator-bundle-scenes.py");
const PUBLIC = join(ROOT, "apps/web/public/assets/studio/bundle-scenes-v1");
const RECIPES = join(ROOT, "config/creator-bundle-scene-recipes.json");
const SELECTION = join(ROOT, "config/creator-bundle-render-selection.json");
const LEDGER = join(ROOT, "config/creator-bundle-pack-rights.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// -S는 site-packages(Pillow 등)를 로드하지 않는다. 원본 GLB 경로도 전달하지 않는 CI 검사다.
const check = (args = []) => spawnSync("python3", ["-S", CHECKER, ...args], { encoding: "utf8" });
const rejects = (args, message) => {
  const result = check(args);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, message);
};
function withPublicTree(run) {
  const root = mkdtempSync(join(tmpdir(), "bundle-scene-parity-"));
  try {
    for (const path of readdirSync(PUBLIC)) copyFileSync(join(PUBLIC, path), join(root, path));
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("공개 배경은 Pillow·Blender·로컬 원본 없이 현재 원장·선정·레시피·renderer와 일치한다", () => {
  const result = check();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { scenes: 2, files: 5, verified: true, localLibraryRequired: false });
});

test("공개 매니페스트의 권리·sourceModels·recipe fingerprint·본 이미지/미리보기 해시 변조는 닫힌다", () => {
  withPublicTree((root) => {
    const path = join(root, "manifest.json");
    const original = readJson(path);
    for (const change of [
      (asset) => { asset.rights.status = "licensed"; },
      (asset) => { asset.sourceModels[0].sha256 = "0".repeat(64); },
      (asset) => { asset.sourceRecipeSha256 = "0".repeat(64); },
      (asset) => { asset.sha256 = "0".repeat(64); },
      (asset) => { asset.previewSha256 = "0".repeat(64); },
      (asset) => { asset.previewBytes += 1; },
      (asset) => { asset.src = "/assets/unreviewed.webp"; },
      (asset) => { asset.review = null; },
    ]) {
      const catalog = structuredClone(original);
      change(catalog.assets[0]);
      writeFileSync(path, JSON.stringify(catalog));
      rejects(["--catalog", path], /공개/u);
    }
  });
});

test("레시피·선정된 원본 해시·현재 원장만 바뀌고 공개 산출물을 재생성하지 않으면 거부한다", () => {
  const root = mkdtempSync(join(tmpdir(), "bundle-scene-input-drift-"));
  try {
    const recipes = readJson(RECIPES);
    recipes.recipes[0].models[0].position[0] += 1;
    const recipePath = join(root, "recipes.json");
    writeFileSync(recipePath, JSON.stringify(recipes));
    rejects(["--recipes", recipePath], /sourceRecipeSha256/u);
    const selection = readJson(SELECTION);
    selection.assets.find((asset) => asset.id === recipes.recipes[0].models[0].assetId).sourceModelSha256 = "f".repeat(64);
    const selectionPath = join(root, "selection.json");
    writeFileSync(selectionPath, JSON.stringify(selection));
    rejects(["--selection", selectionPath], /sourceRecipeSha256|sourceModels/u);
    const ledger = readJson(LEDGER);
    const park = ledger.packs.find((pack) => pack.id === "cbv1-008-cute-park-pack");
    park.serve = "hold";
    park.holdReason = "evidence-incomplete";
    park.holdLabel = "권리 확인 중인 팩입니다.";
    delete park.grant;
    const ledgerPath = join(root, "ledger.json");
    writeFileSync(ledgerPath, JSON.stringify(ledger));
    rejects(["--pack-rights", ledgerPath], /권리|hold/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("공개 이미지 실물 교체와 레시피 밖의 공개 파일은 거부한다", () => {
  withPublicTree((root) => {
    const manifest = readJson(join(root, "manifest.json"));
    const path = join(root, manifest.assets[0].id + ".webp");
    const original = readFileSync(path);
    const changed = Buffer.from(original);
    changed[changed.length - 1] ^= 1;
    writeFileSync(path, changed);
    rejects(["--catalog", join(root, "manifest.json")], /바이트·해시/u);
    writeFileSync(path, original);
    writeFileSync(join(root, "unapproved.glb"), "not a published image");
    rejects(["--catalog", join(root, "manifest.json")], /없는 파일/u);
  });
});
