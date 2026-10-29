import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";
import { auditItchPurchasedLibrary, normalizeItchProjectUrl } from "./audit-itch-purchased-library.mjs";

const test = process.env.VITEST ? vitestTest : nodeTest;
const CLI = join(dirname(fileURLToPath(import.meta.url)), "audit-itch-purchased-library.mjs");
const product = (title, slug, extra = {}) => ({ title, url: `https://example-artist.itch.io/${slug}`, ...extra });

function fixture(run) {
  const temp = mkdtempSync(join(tmpdir(), "itch-library-audit-"));
  const root = join(temp, "library");
  mkdirSync(join(root, "_catalog"), { recursive: true });
  const packs = [];
  function addPack(slug, files, extra = {}) {
    const path = `01-city/${slug}`;
    let bytes = 0;
    for (const [name, data] of Object.entries(files)) {
      const dest = join(root, path, name);
      mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, data); bytes += Buffer.byteLength(data);
    }
    packs.push({ slug, title: slug.replaceAll("-", " "), path, files: Object.keys(files).length, bytes, ...extra });
  }
  function save() { writeFileSync(join(root, "_catalog/packs.json"), JSON.stringify({ packs })); }
  try { return run({ root, temp, packs, addPack, save }); }
  finally { rmSync(temp, { recursive: true, force: true }); }
}

test("공용 상품과 명시 매핑을 실물에 연결하고 형식·라이선스·양쪽 미연결을 구분한다", () => fixture(({ root, addPack, save }) => {
  addPack("cute-park", { "tree.glb": "model", "License.txt": "CC0" }, { catalogId: "cbv1-008", models: { glb: 1 } });
  addPack("local-extra", { "room.fbx": "fbx" }); save();
  const report = auditItchPurchasedLibrary({ libraryRoot: root, purchases: {
    capturedOn: "2026-10-28", purchases: [product("공원 명칭 변경", "cute-park-pack", { catalogId: "cbv1-008" }), product("Only Online", "only-online")],
  } });
  assert.deepEqual(report.totals, { packs: 2, files: 3, bytes: 11, formats: { txt: 1, glb: 1, fbx: 1 }, purchases: 2, matched: 1, received: 1, purchaseOnly: 1, localOnly: 1 });
  assert.deepEqual(report.problems, []);
  assert.equal(report.matched[0].localSlug, "cute-park");
  assert.equal(report.purchaseOnly[0].reason, "local-match-unconfirmed");
  assert.equal(report.localOnly[0].slug, "local-extra");
  assert.deepEqual(report.packs[0].licenseFiles, ["01-city/cute-park/License.txt"]);
  assert.equal(report.duplicateFiles.checked, false);
  const grouped = auditItchPurchasedLibrary({ libraryRoot: root, purchases: [
    product("Park Full", "park-full", { localSlug: "cute-park" }), product("Park Free", "park-free", { localSlug: "cute-park" }),
    product("Pack Family", "pack-family", { localSlugs: ["cute-park", "local-extra"] }),
  ] });
  assert.equal(grouped.totals.matched, 3);
  assert.equal(grouped.totals.localOnly, 0);
  assert.deepEqual(grouped.matched[2].localSlugs, ["cute-park", "local-extra"]);
  assert.deepEqual(grouped.problems, []);
}));

test("누락·색인 수치 불일치·색인 밖 폴더를 문제로 기록한다", () => fixture(({ root, packs, addPack, save }) => {
  addPack("present", { "tree.glb": "model" }, { models: { fbx: 1 } });
  packs[0].files = 9;
  packs.push({ slug: "missing", title: "Missing", path: "01-city/missing", files: 1, bytes: 4 });
  mkdirSync(join(root, "01-city/unindexed"), { recursive: true }); save();
  const report = auditItchPurchasedLibrary({ libraryRoot: root, purchases: [product("Missing", "missing")] });
  const codes = report.problems.map((problem) => problem.code);
  for (const code of ["pack-missing", "catalog-files-mismatch", "catalog-bytes-mismatch", "catalog-model-format-mismatch", "uncatalogued-pack"]) assert.ok(codes.includes(code), code);
  assert.equal(report.matched[0].received, false);
}));

test("정규화는 공용 상품 URL만 허용하고 비공개·다운로드·인증 주소를 거부한다", () => {
  assert.equal(normalizeItchProjectUrl("https://Example-Artist.itch.io/cute-park/"), "https://example-artist.itch.io/cute-park");
  const credentialUrl = new URL("https://example-artist.itch.io/cute-park");
  credentialUrl.username = "fixture-user";
  credentialUrl.password = "fixture-password";
  for (const url of [
    "http://example-artist.itch.io/cute-park", "https://itch.io/my-purchases", "https://itch.io/download/opaque",
    "https://example-artist.itch.io/cute-park/download/opaque", "https://example-artist.itch.io/private",
    "https://example-artist.itch.io/cute-park?key=opaque", "https://example-artist.itch.io/cute-park#opaque",
    credentialUrl.href, "https://example-artist.itch.io:8443/cute-park",
    "https://example-artist.itch.io.evil.test/cute-park", "not-a-url",
  ]) assert.throws(() => normalizeItchProjectUrl(url));
});

test("경로 탈출·중복 색인·심볼릭 링크를 읽기 전에 차단한다", () => fixture(({ root, temp, packs, addPack, save }) => {
  addPack("park", { "tree.glb": "model" }); save();
  packs[0].path = "../outside"; save();
  assert.throws(() => auditItchPurchasedLibrary({ libraryRoot: root, purchases: [product("Park", "park")] }), /상대 경로/u);
  packs[0].path = "01-city/park"; packs.push({ ...packs[0] }); save();
  assert.throws(() => auditItchPurchasedLibrary({ libraryRoot: root, purchases: [product("Park", "park")] }), /중복/u);
  packs.pop(); save();
  const outside = join(temp, "outside"); mkdirSync(outside); writeFileSync(join(outside, "private.glb"), "outside");
  symlinkSync(outside, join(root, "01-city/park/link"));
  const report = auditItchPurchasedLibrary({ libraryRoot: root, purchases: [product("Park", "park")] });
  assert.ok(report.problems.some((problem) => problem.code === "symlink-rejected"));
  assert.equal(report.totals.files, 1);
  const linkedRoot = join(temp, "linked-library"); symlinkSync(root, linkedRoot);
  assert.throws(() => auditItchPurchasedLibrary({ libraryRoot: linkedRoot, purchases: [product("Park", "park")] }), /실제 디렉터리/u);
}));

test("선택한 해시 감사는 크기가 같은 다른 파일을 중복으로 오인하지 않는다", () => fixture(({ root, addPack, save }) => {
  addPack("park", { "a.glb": "same", "b.glb": "same", "c.glb": "diff" }); save();
  const report = auditItchPurchasedLibrary({ libraryRoot: root, purchases: [product("Park", "park")], hashDuplicates: true });
  assert.equal(report.duplicateFiles.groups, 1);
  assert.equal(report.duplicateFiles.extraCopies, 1);
  assert.equal(report.duplicateFiles.redundantBytes, 4);
  assert.deepEqual(report.duplicateFiles.entries[0].paths, ["01-city/park/a.glb", "01-city/park/b.glb"]);
}));

test("CLI dry-run은 쓰지 않고 실제 실행은 보고서만 쓰며 실패 종료 코드를 구분한다", () => fixture(({ root, temp, packs, addPack, save }) => {
  addPack("park", { "a.glb": "same" }); save();
  const purchasesPath = join(temp, "purchases.json");
  const out = join(temp, "audit.json"); writeFileSync(purchasesPath, JSON.stringify([product("Park", "park")]));
  const args = [CLI, "--library-root", root, "--purchases", purchasesPath, "--out", out];
  let result = spawnSync(process.execPath, [...args, "--dry-run"], { encoding: "utf8", cwd: temp });
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(out), false);
  result = spawnSync(process.execPath, args, { encoding: "utf8", cwd: temp });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(readFileSync(out, "utf8")).totals.received, 1);
  const linkedOutput = join(temp, "output-alias"); symlinkSync(root, linkedOutput);
  result = spawnSync(process.execPath, [CLI, "--library-root", root, "--purchases", purchasesPath, "--out", join(linkedOutput, "report.json")], { encoding: "utf8" });
  assert.equal(result.status, 2); assert.equal(existsSync(join(root, "report.json")), false);
  packs[0].bytes = 99; save(); result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 1);
  writeFileSync(purchasesPath, JSON.stringify([product("Park", "park", { url: "https://example-artist.itch.io/park?key=opaque-private-value" })]));
  result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 2); assert.doesNotMatch(result.stdout + result.stderr, /opaque-private-value/u);
  result = spawnSync(process.execPath, [CLI, "--library-root"], { encoding: "utf8" });
  assert.equal(result.status, 2);
}));
