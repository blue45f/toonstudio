import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { test as vitestTest } from "vitest";

import { CATALOG_PACKS, CROWD_PACKS, PENDING_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import {
  ALLOW_EVIDENCE_REQUIREMENTS,
  allowEligibilityProblems,
  checkLedgerCoversDefs,
  evaluateServeDecision,
  findPackRights,
  loadPackRightsLedger,
  missingEvidenceKinds,
  readZipMember,
  summarizePackRightsLedger,
  validatePackRightsLedger,
  verifyLocalLicenseEvidence,
} from "./lib/creator-bundle-pack-rights.mjs";
import {
  allowPirate,
  cloneLedger,
  entryOf,
  fixtureLedger,
  fixtureLicenseText,
  flipToAllow,
  ledgerEntry,
  problemsFor,
  qualifyingEvidence,
} from "./lib/creator-bundle-pack-rights-test-support.mjs";

// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(resolve(REPO_ROOT, relative), "utf8"));

const GENERATOR_DEFS = { pack: CATALOG_PACKS, crowd: CROWD_PACKS, pending: PENDING_PACKS };
const THEME_PACKS_PATH = "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
const OFFICIAL_CATALOG_PATH = "apps/web/public/assets/virtual-studio/bundle-v1/manifest.json";

/*
 * 시드 스냅샷 — 소유자가 팩을 열거나 검토 권고를 바꿀 때 이 두 상수와 "시드 스냅샷" 테스트만 함께 바뀐다(소유자 결정).
 * 나머지 테스트는 원장에서 값을 파생해, 팩 하나를 여는 변경이 무관한 테스트를 건드리지 않게 한다.
 */
const EXPECTED_ALLOWED_TITLES = [];
const REVIEW_RECOMMENDED_HOLD_TITLES = ["Medieval Village / Megapack", "Restaurant Megapack", "Small Props Pack"];

/* ── 완전성: 팩 42 · 군중 5 · 보류 14가 전부 원장에 있고 기본값은 hold ────────────────── */

test("커밋된 원장은 스키마·증빙·고유성 검증을 통과한다", () => {
  assert.deepEqual(problemsFor(loadPackRightsLedger()), []);
});

test("생성기 정의의 팩 42·군중 5·보류 14가 빠짐없이, 같은 묶음으로 원장에 있다", () => {
  const ledger = loadPackRightsLedger();
  assert.equal(CATALOG_PACKS.length, 42);
  assert.equal(CROWD_PACKS.length, 5);
  assert.equal(PENDING_PACKS.length, 14);
  assert.deepEqual(checkLedgerCoversDefs(ledger, GENERATOR_DEFS), []);
  const counts = { pack: 0, crowd: 0, pending: 0 };
  for (const entry of ledger.packs) counts[entry.group] += 1;
  assert.deepEqual(counts, { pack: 42, crowd: 5, pending: 14 });
});

test("커밋된 theme-packs.json의 packs·crowdPacks·pendingPacks도 전부 원장에 있다", () => {
  const ledger = loadPackRightsLedger();
  const themePacks = readJson(THEME_PACKS_PATH);
  const groups = [["pack", themePacks.packs], ["crowd", themePacks.crowdPacks], ["pending", themePacks.pendingPacks]];
  assert.deepEqual(groups.map(([, list]) => list.length), [42, 5, 14]);
  for (const [group, list] of groups) {
    for (const entry of list) {
      const rights = findPackRights(ledger, entry);
      assert.ok(rights, `${group} ${entry.title}: 원장에 없습니다.`);
      assert.equal(rights.group, group, `${entry.title}: 묶음이 다릅니다.`);
      assert.equal(rights.title, entry.title);
    }
  }
  // Characters 1/2의 제작사·id는 theme-packs와 원장이 같아야 한다 (2026-10-22 정정).
  const characters = Object.fromEntries(themePacks.crowdPacks.map((pack) => [pack.title, pack]));
  assert.equal(characters["Characters 1"].creator, "RG Poly");
  assert.deepEqual(characters["Characters 1"].catalogIds, ["cbv1-003-cartoon-characters-1"]);
  assert.equal(characters["Characters 2"].creator, "RG Poly");
  assert.deepEqual(characters["Characters 2"].catalogIds, ["cbv1-007-cartoon-characters-2"]);
});

test("기본값은 hold이고, allow는 증빙 자격을 갖춘 팩에만 서빙을 연다", () => {
  const ledger = loadPackRightsLedger();
  assert.equal(ledger.defaultServe, "hold");
  for (const entry of ledger.packs) {
    const decision = evaluateServeDecision(ledger, entry);
    assert.equal(decision.serve, entry.serve === "allow", `${entry.title}: 서빙 판정이 원장과 어긋납니다.`);
  }
  // 원장에 없는 팩은 hold와 같다.
  const unknown = evaluateServeDecision(ledger, { catalogIds: ["cbv1-999-unknown"], title: "Unknown" });
  assert.equal(unknown.serve, false);
  assert.equal(unknown.reason, "missing-entry");

  // 시드에는 열린 팩이 없어도 "allow는 자격을 갖춘 팩에만" 절반을 직접 시험한다: 요구 증빙을 채우면 열리고, 하나 빠지면 닫힌다.
  const { ledger: opened, pirate } = allowPirate();
  for (const entry of opened.packs) {
    assert.equal(evaluateServeDecision(opened, entry).serve, entry.serve === "allow", `${entry.title}: 열린 팩이 있는 원장에서 서빙 판정이 어긋납니다.`);
  }
  assert.equal(evaluateServeDecision(opened, pirate, { group: "pack" }).serve, true);
  pirate.evidence = pirate.evidence.filter((item) => item.kind !== "purchase-receipt");
  assert.equal(evaluateServeDecision(opened, pirate, { group: "pack" }).reason, "invalid-evidence");
});

test("시드 스냅샷: 개방된 팩은 EXPECTED_ALLOWED_TITLES뿐이고 검토 권고 hold 3팩은 그대로다 (바꾸려면 소유자 결정)", () => {
  const ledger = loadPackRightsLedger();
  const titlesWhere = (predicate) => ledger.packs.filter(predicate).map((entry) => entry.title).sort();
  assert.deepEqual(
    titlesWhere((entry) => entry.serve === "allow"),
    [...EXPECTED_ALLOWED_TITLES].sort(),
    "개방된 팩이 달라졌습니다. 팩을 여는 것은 소유자 결정이므로 EXPECTED_ALLOWED_TITLES를 의도적으로 고쳤는지 확인하세요.",
  );
  assert.deepEqual(
    titlesWhere((entry) => entry.reviewRecommendedHold === true),
    [...REVIEW_RECOMMENDED_HOLD_TITLES].sort(),
  );
});

test("시드 스냅샷: Cute Dungeon은 요구 증빙을 이미 갖췄지만 미수신(pending) 묶음이라 편입 전에는 allow가 열지 못한다", () => {
  const ledger = loadPackRightsLedger();
  const dungeon = entryOf(ledger, "Cute Dungeon Megapack");
  assert.equal(dungeon.group, "pending");
  assert.equal(dungeon.holdReason, "pending-ingest");
  assert.deepEqual(missingEvidenceKinds(ledger, dungeon), []);
  // Cute Park는 License.txt 본문이 Dungeon 것을 복사한 파일이라 itch 캡처가 더 필요하다.
  assert.deepEqual(missingEvidenceKinds(ledger, entryOf(ledger, "Cute Park Pack")), ["itch-page-capture"]);
});

test("검토 권고 hold 팩(Restaurant·Medieval·Small Props)은 제작사 서면 확인 없이는 열리지 않는다", () => {
  const ledger = loadPackRightsLedger();
  for (const title of REVIEW_RECOMMENDED_HOLD_TITLES) {
    const entry = entryOf(ledger, title);
    assert.ok(
      entry.serve === "hold" || entry.evidence.some((item) => item.kind === "producer-written-confirmation"),
      `${title}: 서면 확인 없이 allow입니다.`,
    );
    // 증빙을 갖췄다고 가정해도 서면 확인이 요구 목록에 있는 분류다.
    assert.ok(ALLOW_EVIDENCE_REQUIREMENTS[entry.licenseClass].includes("producer-written-confirmation"), title);
  }
});

test("라이선스 문서 79개는 sha256 33종으로 분류돼 있고 모든 증빙 해시가 분류표에 있다", () => {
  const ledger = loadPackRightsLedger();
  assert.equal(ledger.licenseTexts.length, 33);
  const loosePaths = ledger.licenseTexts.flatMap((text) => text.files.map((file) => file.libraryPath));
  assert.equal(loosePaths.length, 79);
  assert.equal(new Set(loosePaths).size, 79);
  assert.equal(ledger.source.licenseFiles.loose, 79);
  const archived = ledger.licenseTexts.flatMap((text) => text.archivedFiles ?? []);
  assert.equal(archived.length, ledger.source.licenseFiles.archived);
  assert.ok(archived.every((file) => /licen[sc]e/iu.test(file.member) && file.libraryPath.endsWith(".zip")));
  const hashes = new Set(ledger.licenseTexts.map((text) => text.sha256));
  for (const entry of ledger.packs) {
    for (const evidence of entry.evidence.filter((item) => item.kind === "local-license-file")) {
      assert.ok(hashes.has(evidence.sha256), `${entry.title}: 분류되지 않은 해시`);
    }
  }
  // 어떤 문서도 웹 서비스 호스팅을 다루지 않는다 — 그래서 EmaceArt 분류는 서면 확인을 요구한다.
  assert.ok(ledger.licenseTexts.every((text) => text.webServiceHostingAddressed === false));
});

test("원장 제작사·카탈로그 번호는 공식 81팩 카탈로그와 일치한다", () => {
  const ledger = loadPackRightsLedger();
  const official = new Map(readJson(OFFICIAL_CATALOG_PATH).catalog.packs.map((pack) => [pack.id, pack]));
  const numberOf = (id) => id.split("-")[1];
  for (const entry of ledger.packs) {
    for (const id of entry.catalogIds) {
      const officialId = entry.officialCatalogIds.find((candidate) => numberOf(candidate) === numberOf(id));
      assert.ok(officialId, `${entry.title}: ${id}에 대응하는 공식 카탈로그 id가 없습니다.`);
    }
    for (const id of entry.officialCatalogIds) {
      const pack = official.get(id);
      assert.ok(pack, `${entry.title}: 공식 카탈로그에 ${id}가 없습니다.`);
      assert.equal(pack.creator, entry.creator, `${entry.title}: 제작사가 공식 카탈로그(${pack.creator})와 다릅니다.`);
    }
  }
});

/* ── 증빙 재검증: 원장이 기록한 해시와 라이브러리 실물을 다시 대조한다 ───────────────────── */

const VERIFY_SCRIPT = resolve(REPO_ROOT, "scripts/verify-creator-bundle-pack-rights.mjs");
const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** 멤버 하나짜리 최소 zip (method 0=저장, 8=deflate). CRC는 읽기 쪽이 보지 않아 0으로 둔다. */
function makeZip(name, content, method = 8) {
  const raw = Buffer.from(content);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const localPart = Buffer.concat([local, nameBytes, data]);
  const centralPart = Buffer.concat([central, nameBytes]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

function withLibrary(run) {
  const root = mkdtempSync(join(tmpdir(), "pack-rights-library-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeLibraryFile(root, relative, content) {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}

test("readZipMember는 저장·deflate 멤버를 꺼내고 없는 멤버·깨진 zip은 null이다", () => {
  const text = "EmacEArt Asset License — fixture\n".repeat(20);
  assert.equal(readZipMember(makeZip("LICENSE.txt", text, 8), "LICENSE.txt")?.toString(), text);
  assert.equal(readZipMember(makeZip("LICENSE.txt", text, 0), "LICENSE.txt")?.toString(), text);
  assert.equal(readZipMember(makeZip("LICENSE.txt", text), "OTHER.txt"), null);
  assert.equal(readZipMember(Buffer.from("not a zip"), "LICENSE.txt"), null);
});

test("로컬 라이선스 문서 재대조는 일치·해시 불일치·누락·zip 멤버를 각각 가려낸다", () => {
  withLibrary((root) => {
    const loose = "RG Poly License fixture";
    const archived = "EmacEArt archived license fixture";
    writeLibraryFile(root, "pack/License.txt", loose);
    writeLibraryFile(root, "pack/Blend Textures.zip", makeZip("LICENSE.txt", archived));
    const ledger = fixtureLedger([], [
      fixtureLicenseText({ sha256: sha256Of(loose), files: [{ libraryPath: "pack/License.txt" }] }),
      fixtureLicenseText({
        sha256: sha256Of(archived),
        files: [{ libraryPath: "pack/License.txt" }],
        archivedFiles: [{ libraryPath: "pack/Blend Textures.zip", member: "LICENSE.txt" }],
      }),
    ]);
    // 두 번째 문서의 loose 파일 항목은 일부러 첫 번째 파일을 가리켜 해시 불일치를 만든다.
    const result = verifyLocalLicenseEvidence({ ledger, libraryRoot: root });
    assert.equal(result.checked, 3);
    assert.deepEqual(result.mismatches.map((item) => item.reason), ["hash-mismatch"]);

    ledger.licenseTexts[1].files = [];
    assert.deepEqual(verifyLocalLicenseEvidence({ ledger, libraryRoot: root }), { checked: 2, mismatches: [] });

    writeLibraryFile(root, "pack/License.txt", "tampered");
    const tampered = verifyLocalLicenseEvidence({ ledger, libraryRoot: root });
    assert.equal(tampered.mismatches[0].reason, "hash-mismatch");
    assert.equal(tampered.mismatches[0].path, "pack/License.txt");

    rmSync(join(root, "pack/Blend Textures.zip"));
    const missing = verifyLocalLicenseEvidence({ ledger, libraryRoot: root });
    assert.ok(missing.mismatches.some((item) => item.reason === "missing" && item.path === "pack/Blend Textures.zip::LICENSE.txt"));
  });
});

test("검증 CLI는 원장이 유효하면 0, 라이브러리 실물이 어긋나면 1로 끝난다", () => {
  const ledger = loadPackRightsLedger();
  const summary = summarizePackRightsLedger(ledger);
  const groups = Object.entries(summary.byGroup).map(([group, count]) => `${group} ${count}`).join(" · ");
  const documentCount = ledger.licenseTexts.reduce(
    (sum, text) => sum + text.files.length + (text.archivedFiles ?? []).length,
    0,
  );
  const ok = spawnSync(process.execPath, [VERIFY_SCRIPT], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(
    ok.stdout.includes(`팩 ${summary.total}개 (${groups}) — allow ${summary.allow} · hold ${summary.hold}`),
    ok.stdout.split("\n").slice(0, 3).join(" | "),
  );
  if (ledger.packs.some((entry) => entry.serve === "hold" && entry.reviewRecommendedHold === true)) {
    assert.match(ok.stdout, /★검토 권고 hold/);
  }
  withLibrary((root) => {
    const missingLibrary = spawnSync(process.execPath, [VERIFY_SCRIPT, "--library-root", root], { encoding: "utf8" });
    assert.equal(missingLibrary.status, 1);
    assert.ok(missingLibrary.stdout.includes(`로컬 라이선스 문서 재대조: ${documentCount}건 중 불일치 ${documentCount}건`));

    const brokenPath = join(root, "ledger.json");
    writeFileSync(brokenPath, JSON.stringify({ ...cloneLedger(), defaultServe: "allow" }));
    const broken = spawnSync(process.execPath, [VERIFY_SCRIPT, "--pack-rights", brokenPath], { encoding: "utf8" });
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /문제: defaultServe는 hold여야 합니다/);
  });
});

test("테스트 지원의 원장 항목 빌더는 allow일 때 요구 증빙을 정확히 채운다", () => {
  const entry = ledgerEntry({ title: "Builder Check", catalogIds: ["cbv1-904-builder"], serve: "allow" });
  assert.deepEqual(entry.evidence.map((item) => item.kind), ["itch-page-capture", "purchase-receipt"]);
  assert.deepEqual(validatePackRightsLedger(fixtureLedger([entry])), []);
});

test("프로토타입 키를 라이선스 분류로 써도 던지지 않고 거부하며 서빙은 닫힌다", () => {
  // 로컬 라이선스 문서 증빙이 있는 팩(LumaGrove)은 분류 조회가 문서 분류 표를 거치므로 프로토타입 키가 가장 위험하다.
  for (const title of ["LumaGrove — Wonky Woods", "Pirate Island"]) {
    for (const licenseClass of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const ledger = cloneLedger();
      const entry = entryOf(ledger, title);
      entry.licenseClass = licenseClass;
      let problems;
      assert.doesNotThrow(() => { problems = problemsFor(ledger); }, `${title}/${licenseClass}`);
      assert.ok(problems.some((problem) => /licenseClass/u.test(problem)), `${title}/${licenseClass}: 알 수 없는 분류가 통과했습니다.`);
      flipToAllow(entry, { evidence: [...entry.evidence, qualifyingEvidence("itch-page-capture"), qualifyingEvidence("purchase-receipt")] });
      assert.doesNotThrow(() => evaluateServeDecision(ledger, entry), `${title}/${licenseClass}`);
      assert.equal(evaluateServeDecision(ledger, entry).serve, false, `${title}/${licenseClass}`);
      assert.ok(allowEligibilityProblems(ledger, entry).length > 0, `${title}/${licenseClass}`);
      assert.deepEqual(missingEvidenceKinds(ledger, entry), [], `${title}/${licenseClass}`);
    }
  }
});

test("검증 CLI는 생성기 정의를 덮지 못하는 원장(팩 누락)도 종료 코드 1로 닫는다", () => {
  withLibrary((root) => {
    const ledger = cloneLedger();
    ledger.packs = ledger.packs.filter((entry) => entry.title !== "Pirate Island");
    const path = join(root, "ledger.json");
    writeFileSync(path, JSON.stringify(ledger));
    const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--pack-rights", path], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /문제: 원장에 없는 pack 팩입니다: Pirate Island/);
  });
});

test("검증 CLI는 pnpm run 형태의 맨 -- 를 건너뛰고 옵션을 읽는다", () => {
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).summary.total, loadPackRightsLedger().packs.length);
});
