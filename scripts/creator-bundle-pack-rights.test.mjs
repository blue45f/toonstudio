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
  LICENSE_CLASSES,
  loadPackRightsLedger,
  missingEvidenceKinds,
  packRightsProjection,
  readZipMember,
  validatePackRightsLedger,
  verifyLocalLicenseEvidence,
} from "./lib/creator-bundle-pack-rights.mjs";
import { fixtureLedger, fixtureLicenseText, ledgerEntry, qualifyingEvidence } from "./lib/creator-bundle-pack-rights-test-support.mjs";

// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(resolve(REPO_ROOT, relative), "utf8"));

const GENERATOR_DEFS = { pack: CATALOG_PACKS, crowd: CROWD_PACKS, pending: PENDING_PACKS };
const THEME_PACKS_PATH = "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
const OFFICIAL_CATALOG_PATH = "apps/web/public/assets/virtual-studio/bundle-v1/manifest.json";

const cloneLedger = () => structuredClone(loadPackRightsLedger());

function entryOf(ledger, title) {
  const entry = ledger.packs.find((candidate) => candidate.title === title);
  assert.ok(entry, `원장에 ${title}가 없습니다.`);
  return entry;
}

/** 팩을 allow로 바꾼다. evidence를 넘기면 그 증빙으로 교체하고, 아니면 기존 증빙을 그대로 둔다. */
function flipToAllow(entry, { evidence } = {}) {
  entry.serve = "allow";
  delete entry.holdReason;
  delete entry.holdLabel;
  entry.grant = {
    status: "licensed",
    licenseName: "Creator Bundle: Volume 1 — test grant",
    commercialUse: true,
    attributionRequired: false,
  };
  if (evidence) entry.evidence = evidence;
  return entry;
}

function problemsFor(ledger) {
  return validatePackRightsLedger(ledger);
}

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
});

test("권고 hold 3팩(Restaurant·Medieval·Small Props)은 제작사 서면 확인 없이는 열리지 않는다", () => {
  const ledger = loadPackRightsLedger();
  for (const title of ["Restaurant Megapack", "Medieval Village / Megapack", "Small Props Pack"]) {
    const entry = entryOf(ledger, title);
    assert.equal(entry.ownerRecommendedHold, true, title);
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

/* ── 게이트: 증빙 없는 allow는 테스트가 실제로 실패한다 (negative) ───────────────────────── */

test("증빙 없이 allow로 바꾸면 검증이 실패하고 서빙 판정도 닫힌다", () => {
  const ledger = cloneLedger();
  const pirate = flipToAllow(entryOf(ledger, "Pirate Island"));
  const problems = problemsFor(ledger);
  assert.ok(problems.length > 0, "증빙 없는 allow가 통과했습니다 — 게이트가 뚫렸습니다.");
  assert.ok(problems.some((problem) => /Pirate Island/u.test(problem) && /itch-page-capture/u.test(problem)));
  assert.ok(problems.some((problem) => /Pirate Island/u.test(problem) && /purchase-receipt/u.test(problem)));
  // 원장 검증을 우회해 들어온 allow여도 서빙 판정이 한 번 더 닫는다.
  const decision = evaluateServeDecision(ledger, pirate);
  assert.equal(decision.serve, false);
  assert.equal(decision.reason, "invalid-evidence");
  assert.deepEqual(missingEvidenceKinds(ledger, pirate), ["itch-page-capture", "purchase-receipt"]);
});

test("2차 조회 기록만 있는 팩은 allow가 될 수 없다", () => {
  const ledger = cloneLedger();
  const characters = entryOf(ledger, "Characters 1");
  assert.ok(characters.evidence.some((item) => item.kind === "secondary-lookup"), "시드의 2차 조회 기록");
  flipToAllow(characters);
  assert.ok(problemsFor(ledger).some((problem) => /Characters 1/u.test(problem) && /itch-page-capture/u.test(problem)));
});

test("권고 hold 3팩은 서면 확인 없이 allow로 바꿀 수 없다", () => {
  for (const title of ["Restaurant Megapack", "Medieval Village / Megapack", "Small Props Pack"]) {
    const ledger = cloneLedger();
    flipToAllow(entryOf(ledger, title));
    const problems = problemsFor(ledger);
    assert.ok(problems.some((problem) => problem.includes(title) && /producer-written-confirmation/u.test(problem)), title);
  }
});

test("웹 서비스 서빙을 다루지 않는 제작사 확인은 서면 확인으로 인정하지 않는다", () => {
  const ledger = cloneLedger();
  const restaurant = entryOf(ledger, "Restaurant Megapack");
  flipToAllow(restaurant, {
    evidence: [
      ...restaurant.evidence,
      qualifyingEvidence("producer-written-confirmation", { covers: ["personal-use"] }),
    ],
  });
  assert.ok(problemsFor(ledger).some((problem) => /web-service-hosting/u.test(problem)));
  // covers에 웹 서비스 호스팅이 들어가면 같은 팩이 열린다.
  restaurant.evidence = [...restaurant.evidence.slice(0, -1), qualifyingEvidence("producer-written-confirmation")];
  assert.deepEqual(problemsFor(ledger), []);
  assert.equal(evaluateServeDecision(ledger, restaurant).serve, true);
});

test("itch 캡처는 itch.io 주소와 조회일이 있어야 하고 영수증은 보관 위치가 있어야 한다", () => {
  const cases = [
    qualifyingEvidence("itch-page-capture", { url: "https://example.com/pack" }),
    qualifyingEvidence("itch-page-capture", { retrievedAt: undefined }),
    qualifyingEvidence("itch-page-capture", { verifiedAt: "어제" }),
    qualifyingEvidence("purchase-receipt", { ref: "" }),
  ];
  for (const bad of cases) {
    const ledger = cloneLedger();
    const pirate = entryOf(ledger, "Pirate Island");
    const good = (kind) => qualifyingEvidence(kind);
    const evidence = bad.kind === "itch-page-capture"
      ? [bad, good("purchase-receipt")]
      : [good("itch-page-capture"), bad];
    flipToAllow(pirate, { evidence });
    assert.ok(problemsFor(ledger).length > 0, `${JSON.stringify(bad)}가 통과했습니다.`);
  }
});

test("문서 분류가 팩 분류와 맞지 않는 로컬 라이선스 증빙은 인정하지 않는다", () => {
  const ledger = cloneLedger();
  const dungeon = entryOf(ledger, "Cute Dungeon Megapack");
  const emaceHash = ledger.licenseTexts.find((text) => text.class === "emaceart-standalone-ban-soft").sha256;
  flipToAllow(dungeon, {
    evidence: [qualifyingEvidence("local-license-file", { sha256: emaceHash, paths: ["x/License.txt"] })],
  });
  assert.ok(problemsFor(ledger).some((problem) => /문서 분류/u.test(problem)));
});

test("원장에 로컬 문서가 있는 팩이 unstated 분류이거나 그 반대면 검증이 실패한다", () => {
  const ledger = cloneLedger();
  entryOf(ledger, "LumaGrove — Wonky Woods").licenseClass = "unstated-emaceart";
  assert.ok(problemsFor(ledger).some((problem) => /로컬 라이선스 문서가 있는데/u.test(problem)));
  const reverse = cloneLedger();
  entryOf(reverse, "Pirate Island").licenseClass = "emaceart-local-license";
  assert.ok(problemsFor(reverse).some((problem) => /local-license-file 증빙 기록이 있어야/u.test(problem)));
});

test("요구 증빙을 모두 갖추면 열리고, 공개 투영에는 권리 요약만 실린다", () => {
  const ledger = cloneLedger();
  const dungeon = flipToAllow(entryOf(ledger, "Cute Dungeon Megapack"));
  dungeon.grant.status = "public-domain";
  dungeon.grant.licenseName = "CC0 1.0 (RG Poly)";
  const pirate = flipToAllow(entryOf(ledger, "Pirate Island"), {
    evidence: [
      ...entryOf(ledger, "Pirate Island").evidence,
      qualifyingEvidence("itch-page-capture"),
      qualifyingEvidence("purchase-receipt"),
    ],
  });
  assert.deepEqual(problemsFor(ledger), []);
  assert.equal(evaluateServeDecision(ledger, dungeon).serve, true);
  assert.equal(evaluateServeDecision(ledger, pirate).serve, true);
  assert.deepEqual(packRightsProjection(dungeon), {
    serve: "allow",
    status: "public-domain",
    licenseName: "CC0 1.0 (RG Poly)",
    commercialUse: true,
    attributionRequired: false,
  });
  assert.deepEqual(allowEligibilityProblems(ledger, dungeon), []);
});

test("Cute Dungeon은 요구 증빙을 이미 갖췄지만 시드에서는 소유자가 열기 전까지 hold다", () => {
  const ledger = loadPackRightsLedger();
  const dungeon = entryOf(ledger, "Cute Dungeon Megapack");
  assert.equal(dungeon.serve, "hold");
  assert.equal(dungeon.holdReason, "awaiting-owner-open");
  assert.deepEqual(missingEvidenceKinds(ledger, dungeon), []);
  // Cute Park는 License.txt 본문이 Dungeon 것을 복사한 파일이라 itch 캡처가 더 필요하다.
  assert.deepEqual(missingEvidenceKinds(ledger, entryOf(ledger, "Cute Park Pack")), ["itch-page-capture"]);
});

test("구조 위반(기본값 allow·알 수 없는 분류·중복·holdLabel 누락)은 전부 거부한다", () => {
  const defaultAllow = cloneLedger();
  defaultAllow.defaultServe = "allow";
  assert.ok(problemsFor(defaultAllow).some((problem) => /defaultServe/u.test(problem)));

  const unknownClass = cloneLedger();
  entryOf(unknownClass, "Pirate Island").licenseClass = "made-up-class";
  assert.ok(problemsFor(unknownClass).some((problem) => /licenseClass/u.test(problem)));
  flipToAllow(entryOf(unknownClass, "Pirate Island"));
  assert.equal(evaluateServeDecision(unknownClass, entryOf(unknownClass, "Pirate Island")).serve, false);

  const duplicate = cloneLedger();
  duplicate.packs.push(structuredClone(entryOf(duplicate, "Pirate Island")));
  assert.ok(problemsFor(duplicate).some((problem) => /중복/u.test(problem)));

  const noLabel = cloneLedger();
  delete entryOf(noLabel, "Pirate Island").holdLabel;
  assert.ok(problemsFor(noLabel).some((problem) => /holdLabel/u.test(problem)));

  const badServe = cloneLedger();
  entryOf(badServe, "Pirate Island").serve = "maybe";
  assert.ok(problemsFor(badServe).some((problem) => /serve는/u.test(problem)));

  const allowWithHoldLabel = cloneLedger();
  flipToAllow(entryOf(allowWithHoldLabel, "Cute Dungeon Megapack"));
  entryOf(allowWithHoldLabel, "Cute Dungeon Megapack").holdLabel = "공개 준비 중이다.";
  assert.ok(problemsFor(allowWithHoldLabel).some((problem) => /holdLabel가 없어야/u.test(problem)));
});

test("생성기 정의와 원장이 어긋나면 완전성 검사가 실패한다", () => {
  const missing = cloneLedger();
  missing.packs = missing.packs.filter((entry) => entry.title !== "Pirate Island");
  assert.ok(checkLedgerCoversDefs(missing, GENERATOR_DEFS).some((problem) => /원장에 없는 pack 팩.*Pirate Island/u.test(problem)));

  const extra = cloneLedger();
  extra.packs.push({ ...structuredClone(entryOf(extra, "Pirate Island")), id: "extra", catalogIds: ["cbv1-998-extra"], title: "Extra" });
  assert.ok(checkLedgerCoversDefs(extra, GENERATOR_DEFS).some((problem) => /생성기에 없는 원장 항목.*Extra/u.test(problem)));

  const wrongGroup = cloneLedger();
  entryOf(wrongGroup, "Pirate Island").group = "pending";
  assert.ok(checkLedgerCoversDefs(wrongGroup, GENERATOR_DEFS).some((problem) => /묶음이 다릅니다.*Pirate Island/u.test(problem)));

  const wrongCreator = cloneLedger();
  entryOf(wrongCreator, "Characters 1").creator = "EmaceArt";
  assert.ok(checkLedgerCoversDefs(wrongCreator, GENERATOR_DEFS).some((problem) => /제작사가 다릅니다.*Characters 1/u.test(problem)));
});

test("allow 요구 표는 모든 라이선스 분류를 덮고 서면 확인 없이 열 수 있는 EmaceArt 분류가 없다", () => {
  assert.deepEqual(Object.keys(ALLOW_EVIDENCE_REQUIREMENTS).sort(), [...LICENSE_CLASSES].sort());
  for (const [licenseClass, kinds] of Object.entries(ALLOW_EVIDENCE_REQUIREMENTS)) {
    assert.ok(kinds.length > 0, licenseClass);
    assert.ok(!kinds.includes("secondary-lookup"), licenseClass);
    if (licenseClass.includes("emaceart")) {
      assert.ok(kinds.includes("producer-written-confirmation"), licenseClass);
      assert.ok(kinds.includes("purchase-receipt"), licenseClass);
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
  const ok = spawnSync(process.execPath, [VERIFY_SCRIPT], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /팩 61개 \(pack 42 · crowd 5 · pending 14\) — allow 0 · hold 61/);
  assert.match(ok.stdout, /★권고 hold/);
  withLibrary((root) => {
    const missingLibrary = spawnSync(process.execPath, [VERIFY_SCRIPT, "--library-root", root], { encoding: "utf8" });
    assert.equal(missingLibrary.status, 1);
    assert.match(missingLibrary.stdout, /로컬 라이선스 문서 재대조: 96건 중 불일치 96건/);

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

