import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import { CATALOG_PACKS, CROWD_PACKS, PENDING_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import {
  ALLOW_EVIDENCE_REQUIREMENTS,
  allowEligibilityProblems,
  checkLedgerCoversDefs,
  evaluateServeDecision,
  findPackRights,
  HOLD_PUBLIC_LABEL,
  LICENSE_CLASSES,
  loadPackRightsLedger,
  missingEvidenceKinds,
  packRightsProjection,
  validatePackRightsLedger,
} from "./lib/creator-bundle-pack-rights.mjs";
import {
  cloneLedger,
  entryOf,
  fixtureLedger,
  flipToAllow,
  ledgerEntry,
  problemsFor,
  qualifyingEvidence,
} from "./lib/creator-bundle-pack-rights-test-support.mjs";

// allow 게이트(증빙·grant·묶음·신원)의 부정 테스트 모음. 시드·완전성·증빙 재검증은 creator-bundle-pack-rights.test.mjs에 있다.
// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(resolve(REPO_ROOT, relative), "utf8"));

const GENERATOR_DEFS = { pack: CATALOG_PACKS, crowd: CROWD_PACKS, pending: PENDING_PACKS };
const THEME_PACKS_PATH = "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
const REVIEW_RECOMMENDED_HOLD_TITLES = ["Medieval Village / Megapack", "Restaurant Megapack", "Small Props Pack"];

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

test("검토 권고 hold 팩은 서면 확인 없이 allow로 바꿀 수 없다", () => {
  for (const title of REVIEW_RECOMMENDED_HOLD_TITLES) {
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
  dungeon.group = "pack"; // 편입(CATALOG_PACKS)을 가정한다 — pending 묶음은 allow할 수 없다 (아래 별도 테스트).
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

test("Cute Dungeon은 요구 증빙을 이미 갖췄지만 미수신(pending) 묶음이라 편입 전에는 allow가 열지 못한다", () => {
  const ledger = loadPackRightsLedger();
  const dungeon = entryOf(ledger, "Cute Dungeon Megapack");
  assert.equal(dungeon.group, "pending");
  assert.equal(dungeon.holdReason, "pending-ingest");
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

/* ── 증빙·grant·묶음 게이트 강화 (적대 리뷰 반영) ─────────────────────────────────────────── */

/** Pirate Island(캡처+영수증 필요)를 정상 증빙 두 건으로 allow로 바꾼다. 증빙마다 필드를 덮어쓸 수 있다. */
function allowPirate({ capture, receipt } = {}) {
  const ledger = cloneLedger();
  const pirate = entryOf(ledger, "Pirate Island");
  flipToAllow(pirate, {
    evidence: [
      ...pirate.evidence,
      qualifyingEvidence("itch-page-capture", capture),
      qualifyingEvidence("purchase-receipt", receipt),
    ],
  });
  return { ledger, pirate };
}

/** 검증기가 거부하고, 검증을 거치지 않은 서빙 판정도 같은 입력을 닫는지 함께 본다. */
function assertClosed({ ledger, pirate }, pattern, label) {
  assert.ok(problemsFor(ledger).some((problem) => pattern.test(problem)), `${label}: 검증기가 거부하지 않았습니다.`);
  const decision = evaluateServeDecision(ledger, pirate);
  assert.equal(decision.serve, false, `${label}: 서빙 판정이 열렸습니다.`);
  assert.equal(decision.reason, "invalid-evidence", label);
}

test("itch 캡처 URL은 https itch.io 팩 페이지만 인정하고 닮은 도메인·자격 정보·루트 주소는 거부한다", () => {
  const rejected = [
    "https://zitch.io/a", "https://evilitch.io/x", "https://notitch.io/a", "http://itch.io/x",
    "https://itch.io@evil.com/x", "https://user:pw@itch.io/x", "https://evil.com/itch.io/x",
    "https://itch.io.evil.com/x", "https://creator.itch.io/", "https://itch.io", "ftp://itch.io/x",
    "itch.io/x", "", "   ",
  ];
  for (const url of rejected) {
    assertClosed(allowPirate({ capture: { url } }), /itch\.io 팩 페이지 주소/u, JSON.stringify(url));
  }
  assertClosed(allowPirate({ capture: { url: undefined } }), /itch\.io 팩 페이지 주소/u, "url 없음");
  const accepted = [
    "https://itch.io/b/3905/creator-bundle-volume-1",
    "https://emaceart.itch.io/cute-pack",
    "https://rg-poly.itch.io/pirate-island?download",
  ];
  for (const url of accepted) {
    const { ledger, pirate } = allowPirate({ capture: { url } });
    assert.deepEqual(problemsFor(ledger), [], url);
    assert.equal(evaluateServeDecision(ledger, pirate).serve, true, url);
  }
});

test("증빙 날짜는 달력에 있는 과거·오늘 날짜여야 하고 불가능하거나 미래인 날짜는 거부한다", () => {
  const badDates = ["2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31", "2026-1-1", "20261022", "2999-01-01", "9999-12-31", "어제", "", 20261022, null];
  for (const verifiedAt of badDates) {
    assertClosed(allowPirate({ receipt: { verifiedAt } }), /verifiedAt/u, `verifiedAt ${String(verifiedAt)}`);
  }
  for (const retrievedAt of ["2026-02-30", "2999-12-31", "", undefined]) {
    assertClosed(allowPirate({ capture: { retrievedAt } }), /retrievedAt/u, `retrievedAt ${String(retrievedAt)}`);
  }
  assertClosed(allowPirate({ capture: { verifiedAt: "2999-01-01" } }), /verifiedAt/u, "캡처 verifiedAt 미래");
  // 윤년 2월 29일은 달력에 있다.
  const leap = allowPirate({ receipt: { verifiedAt: "2024-02-29" } });
  assert.deepEqual(problemsFor(leap.ledger), []);
});

test("증빙 날짜 상한은 주입한 현재 시각 기준 UTC+14의 오늘까지다", () => {
  const { ledger, pirate } = allowPirate({ receipt: { verifiedAt: "2026-10-23" } });
  const early = new Date("2026-10-22T09:00:00Z"); // +14h = 2026-10-22 → 10-23은 미래
  const late = new Date("2026-10-22T11:00:00Z"); // +14h = 2026-10-23 → 허용
  assert.ok(validatePackRightsLedger(ledger, { now: early }).some((problem) => /미래 날짜/u.test(problem)));
  assert.deepEqual(validatePackRightsLedger(ledger, { now: late }), []);
  assert.equal(evaluateServeDecision(ledger, pirate, { now: early }).serve, false);
  assert.equal(evaluateServeDecision(ledger, pirate, { now: late }).serve, true);
  assert.ok(allowEligibilityProblems(ledger, pirate, { now: early }).length > 0);
  assert.deepEqual(allowEligibilityProblems(ledger, pirate, { now: late }), []);
  assert.deepEqual(missingEvidenceKinds(ledger, pirate, { now: early }), ["purchase-receipt"]);
  assert.deepEqual(missingEvidenceKinds(ledger, pirate, { now: late }), []);
  // 잘못된 now는 실제 현재 시각으로 대체돼 던지지 않는다.
  assert.doesNotThrow(() => validatePackRightsLedger(ledger, { now: new Date("not a date") }));
});

test("증빙 보관 위치(ref)는 비었거나 자리표시면 거부한다 — 캡처·영수증·서면 확인 모두", () => {
  const placeholders = [
    "", "   ", "x", "y", "xxxxxx", "------", "TBD", "todo", "N/A", "none", "null", "undefined", "test",
    "placeholder", "abc", undefined, null, 123,
  ];
  for (const ref of placeholders) {
    assertClosed(allowPirate({ capture: { ref } }), /캡처 보관 위치/u, `capture ${String(ref)}`);
    assertClosed(allowPirate({ receipt: { ref } }), /영수증·약관 보관 위치/u, `receipt ${String(ref)}`);
    const ledger = cloneLedger();
    const restaurant = entryOf(ledger, "Restaurant Megapack");
    flipToAllow(restaurant, {
      evidence: [...restaurant.evidence, qualifyingEvidence("producer-written-confirmation", { ref })],
    });
    assert.ok(problemsFor(ledger).some((problem) => /서면 확인 보관 위치/u.test(problem)), `confirmation ${String(ref)}`);
    assert.equal(evaluateServeDecision(ledger, restaurant).serve, false, `confirmation ${String(ref)}`);
  }
});

test("로컬 라이선스 증빙은 해시로 기록된 자기 팩 문서여야 한다 — 임의 경로·다른 팩 문서는 거부한다", () => {
  const title = "LumaGrove — Wonky Woods";
  const localEvidence = (ledger) => entryOf(ledger, title).evidence.filter((item) => item.kind === "local-license-file");
  assert.deepEqual(problemsFor(cloneLedger()), [], "기록된 증빙 그대로면 통과");

  const arbitrary = cloneLedger();
  localEvidence(arbitrary)[0].paths = ["totally/unrelated/path.txt"];
  assert.ok(problemsFor(arbitrary).some((problem) => /기록된 문서가 아닙니다/u.test(problem)));

  // 같은 해시로 기록됐지만 다른 팩의 라이브러리 폴더에 있는 문서(CC0 문구 복사본 시나리오).
  const foreign = cloneLedger();
  const zipEvidence = localEvidence(foreign).find((item) => item.sha256.startsWith("d1bd757f"));
  assert.ok(zipEvidence, "LumaGrove의 zip 사본 증빙");
  const luma = entryOf(foreign, title);
  const text = foreign.licenseTexts.find((candidate) => candidate.sha256 === zipEvidence.sha256);
  const other = text.archivedFiles.find((file) => !luma.libraryPacks.includes(file.libraryPack));
  zipEvidence.paths = [`${other.libraryPath}::${other.member}`];
  assert.ok(problemsFor(foreign).some((problem) => /이 팩\(libraryPacks\)의 라이브러리 폴더에 있는 문서가 없습니다/u.test(problem)));

  // 다른 해시로 기록된 경로를 이 해시의 증빙으로 내세우는 경우.
  const swapped = cloneLedger();
  const [first, second] = localEvidence(swapped);
  first.paths = [...second.paths];
  assert.ok(problemsFor(swapped).some((problem) => /기록된 문서가 아닙니다/u.test(problem)));

  // libraryPacks가 비면 어떤 로컬 문서도 이 팩의 것으로 인정되지 않는다.
  const noPacks = cloneLedger();
  entryOf(noPacks, title).libraryPacks = [];
  assert.ok(problemsFor(noPacks).some((problem) => /이 팩\(libraryPacks\)의 라이브러리 폴더에 있는 문서가 없습니다/u.test(problem)));
  const badPacks = cloneLedger();
  entryOf(badPacks, title).libraryPacks = "lumagrove";
  assert.ok(problemsFor(badPacks).some((problem) => /libraryPacks는 문자열 배열/u.test(problem)));
});

test("pending 묶음 팩은 증빙을 다 갖춰도 allow할 수 없다 (편입 전이라 allow가 아무것도 열지 못한다)", () => {
  const ledger = cloneLedger();
  const dungeon = entryOf(ledger, "Cute Dungeon Megapack");
  assert.equal(dungeon.group, "pending");
  assert.deepEqual(missingEvidenceKinds(ledger, dungeon), [], "요구 증빙은 이미 충족");
  flipToAllow(dungeon);
  assert.ok(problemsFor(ledger).some((problem) => /pending 묶음 팩은 인제스션·CATALOG_PACKS 편입 전/u.test(problem)));
  const decision = evaluateServeDecision(ledger, dungeon);
  assert.equal(decision.serve, false);
  assert.equal(decision.reason, "invalid-evidence");
  // 편입하면서 group을 pack으로 옮기면 같은 증빙으로 열린다.
  dungeon.group = "pack";
  assert.deepEqual(problemsFor(ledger), []);
  assert.equal(evaluateServeDecision(ledger, dungeon, { group: "pack" }).serve, true);
  // 알 수 없는 묶음 값은 서빙 대상이 아니다.
  dungeon.group = "other";
  assert.ok(allowEligibilityProblems(ledger, dungeon).some((problem) => /서빙 판정 대상이 아닙니다/u.test(problem)));
});

test("서빙 판정은 기대 묶음과 제목·제작사가 원장과 같을 때만 연다", () => {
  const ledger = fixtureLedger([
    ledgerEntry({ title: "Allowed Pack", catalogIds: ["cbv1-901-allowed"], serve: "allow" }),
    ledgerEntry({ title: "Crowd Pack", catalogIds: ["cbv1-902-crowd"], group: "crowd", serve: "allow" }),
    ledgerEntry({ title: "Food Pack", catalogIds: [], serve: "allow" }),
  ]);
  assert.deepEqual(validatePackRightsLedger(ledger), []);
  const allowed = { catalogIds: ["cbv1-901-allowed"], title: "Allowed Pack", creator: "RG Poly" };
  assert.equal(evaluateServeDecision(ledger, allowed).serve, true);
  assert.equal(evaluateServeDecision(ledger, allowed, { group: "pack" }).serve, true);
  assert.equal(evaluateServeDecision(ledger, allowed, { group: "crowd" }).reason, "group-mismatch");
  const crowd = { catalogIds: ["cbv1-902-crowd"], title: "Crowd Pack", creator: "RG Poly" };
  assert.equal(evaluateServeDecision(ledger, crowd, { group: "crowd" }).serve, true);
  assert.equal(evaluateServeDecision(ledger, crowd, { group: "pack" }).reason, "group-mismatch");
  assert.equal(evaluateServeDecision(ledger, { ...allowed, title: "Another Title" }).reason, "identity-mismatch");
  assert.equal(evaluateServeDecision(ledger, { ...allowed, creator: "EmaceArt" }).reason, "identity-mismatch");
  // 카탈로그 번호가 없는 팩은 제목이 곧 키라 제작사가 다른 같은 제목 위장이 가능하다 — 제작사 대조로 닫는다.
  assert.equal(evaluateServeDecision(ledger, { title: "Food Pack", creator: "RG Poly" }).serve, true);
  assert.equal(evaluateServeDecision(ledger, { title: "Food Pack", creator: "EmaceArt" }).reason, "identity-mismatch");
  // hold 팩은 묶음·신원이 맞아도 hold다 (사유는 hold가 우선한다).
  const held = fixtureLedger([ledgerEntry({ title: "Held", catalogIds: ["cbv1-903-held"], serve: "hold" })]);
  assert.equal(evaluateServeDecision(held, { catalogIds: ["cbv1-903-held"], title: "Held" }, { group: "crowd" }).reason, "hold");
});

test("grant는 필드마다 검증하고 검증을 우회한 서빙 판정·공개 투영도 같은 입력을 닫는다", () => {
  const mutations = [
    ["grant 없음", (entry) => { delete entry.grant; }, /grant\(status/u],
    ["grant가 객체가 아님", (entry) => { entry.grant = "licensed"; }, /grant\(status/u],
    ["status가 허용 값이 아님", (entry) => { entry.grant.status = "owned"; }, /grant\.status/u],
    ["status가 unknown", (entry) => { entry.grant.status = "unknown"; }, /grant\.status/u],
    ["licenseName이 빔", (entry) => { entry.grant.licenseName = ""; }, /grant\.licenseName/u],
    ["licenseName이 공백", (entry) => { entry.grant.licenseName = "   "; }, /grant\.licenseName/u],
    ["licenseName이 너무 김", (entry) => { entry.grant.licenseName = "x".repeat(201); }, /grant\.licenseName/u],
    ["commercialUse가 문자열", (entry) => { entry.grant.commercialUse = "yes"; }, /grant\.commercialUse/u],
    ["commercialUse 없음", (entry) => { delete entry.grant.commercialUse; }, /grant\.commercialUse/u],
    ["attributionRequired가 문자열", (entry) => { entry.grant.attributionRequired = "no"; }, /grant\.attributionRequired는 boolean/u],
    ["attributionRequired 없음", (entry) => { delete entry.grant.attributionRequired; }, /grant\.attributionRequired는 boolean/u],
    ["attributionRequired=true는 아직 지원하지 않음", (entry) => { entry.grant.attributionRequired = true; }, /attributionRequired=true는 지원하지 않습니다/u],
  ];
  for (const [label, mutate, pattern] of mutations) {
    const { ledger, pirate } = allowPirate();
    mutate(pirate);
    assertClosed({ ledger, pirate }, pattern, label);
    assert.throws(() => packRightsProjection(pirate), TypeError, `${label}: 공개 투영이 검증 안 된 값을 실었습니다.`);
  }
});

test("공개 투영은 grant 값을 기본값으로 바꾸지 않고 그대로 싣는다", () => {
  const { ledger, pirate } = allowPirate();
  pirate.grant = { status: "public-domain", licenseName: "CC0 1.0 — 제한 확인용", commercialUse: false, attributionRequired: false };
  assert.deepEqual(problemsFor(ledger), []);
  assert.deepEqual(packRightsProjection(pirate), {
    serve: "allow",
    status: "public-domain",
    licenseName: "CC0 1.0 — 제한 확인용",
    commercialUse: false,
    attributionRequired: false,
  });
  pirate.grant.status = "licensed";
  pirate.grant.commercialUse = true;
  assert.equal(packRightsProjection(pirate).commercialUse, true);
  assert.equal(packRightsProjection(pirate).status, "licensed");
});

test("검증을 거치지 않고 서빙 판정에 들어온 allow도 증빙 필드·grant가 모자라면 닫힌다", () => {
  const { ledger, pirate } = allowPirate();
  assert.equal(evaluateServeDecision(ledger, pirate).serve, true, "기준선");
  const malformed = [
    ["영수증 ref 빈 문자열", (entry) => { entry.evidence.at(-1).ref = ""; }],
    ["캡처 URL 닮은 도메인", (entry) => { entry.evidence.at(-2).url = "https://zitch.io/a"; }],
    ["영수증 날짜 미래", (entry) => { entry.evidence.at(-1).verifiedAt = "2999-01-01"; }],
    ["grant 삭제", (entry) => { delete entry.grant; }],
  ];
  for (const [label, mutate] of malformed) {
    const bypass = structuredClone(ledger);
    const entry = entryOf(bypass, "Pirate Island");
    mutate(entry);
    const decision = evaluateServeDecision(bypass, entry);
    assert.equal(decision.serve, false, label);
    assert.equal(decision.reason, "invalid-evidence", label);
    assert.ok(decision.problems.length > 0, label);
  }
});

test("중복은 종류별로 따로 거부한다: id · 팩 키 · catalogId", () => {
  const onlyId = cloneLedger();
  const pirate = entryOf(onlyId, "Pirate Island");
  onlyId.packs.push({ ...structuredClone(pirate), title: "Other Title", catalogIds: ["cbv1-997-other"], officialCatalogIds: [] });
  const idProblems = problemsFor(onlyId);
  assert.ok(idProblems.some((problem) => /id가 중복됩니다/u.test(problem)));
  assert.ok(!idProblems.some((problem) => /팩 키가 중복됩니다|catalogId가 다른 항목과 겹칩니다/u.test(problem)));

  // 카탈로그 번호가 없는 팩(제목이 키)을 id만 바꿔 복제하면 팩 키만 중복된다.
  const onlyKey = cloneLedger();
  const food = onlyKey.packs.find((entry) => entry.catalogIds.length === 0);
  assert.ok(food, "카탈로그 번호가 없는 팩이 시드에 있어야 합니다.");
  onlyKey.packs.push({ ...structuredClone(food), id: "different-id" });
  const keyProblems = problemsFor(onlyKey);
  assert.ok(keyProblems.some((problem) => /팩 키가 중복됩니다/u.test(problem)));
  assert.ok(!keyProblems.some((problem) => /id가 중복됩니다|catalogId가 다른 항목과 겹칩니다/u.test(problem)));

  // 키(번호 조합)는 다르지만 번호 하나가 겹치는 경우.
  const onlyCatalogId = cloneLedger();
  const base = entryOf(onlyCatalogId, "Pirate Island");
  onlyCatalogId.packs.push({
    ...structuredClone(base), id: "overlap-id", title: "Overlap", catalogIds: [...base.catalogIds, "cbv1-996-extra"],
  });
  const overlapProblems = problemsFor(onlyCatalogId);
  assert.ok(overlapProblems.some((problem) => /catalogId가 다른 항목과 겹칩니다/u.test(problem)));
  assert.ok(!overlapProblems.some((problem) => /id가 중복됩니다|팩 키가 중복됩니다/u.test(problem)));
});

test("나머지 구조 검증 분기도 각각 거부한다 (증빙 종류·제작사·문서 분류표·빈 목록·비객체)", () => {
  const rejects = (label, mutate, pattern) => {
    const ledger = cloneLedger();
    mutate(ledger);
    assert.ok(problemsFor(ledger).some((problem) => pattern.test(problem)), label);
  };
  rejects("알 수 없는 증빙 종류", (ledger) => { entryOf(ledger, "Pirate Island").evidence.push({ kind: "carrier-pigeon" }); }, /알 수 없는 증빙 종류/u);
  rejects("객체가 아닌 증빙", (ledger) => { entryOf(ledger, "Pirate Island").evidence.push("oops"); }, /증빙 항목이 객체가 아닙니다/u);
  rejects("evidence가 배열이 아님", (ledger) => { entryOf(ledger, "Pirate Island").evidence = {}; }, /evidence는 배열/u);
  rejects("제작사가 열거값이 아님", (ledger) => { entryOf(ledger, "Pirate Island").creator = "Nobody"; }, /creator는/u);
  rejects("묶음이 열거값이 아님", (ledger) => { entryOf(ledger, "Pirate Island").group = "weird"; }, /group은/u);
  rejects("title이 빔", (ledger) => { entryOf(ledger, "Pirate Island").title = ""; }, /title이 비어/u);
  rejects("catalogIds가 배열이 아님", (ledger) => { entryOf(ledger, "Pirate Island").catalogIds = "x"; }, /catalogIds는/u);
  rejects("officialCatalogIds가 배열이 아님", (ledger) => { entryOf(ledger, "Pirate Island").officialCatalogIds = null; }, /officialCatalogIds는/u);
  rejects("hold인데 holdReason 없음", (ledger) => { delete entryOf(ledger, "Pirate Island").holdReason; }, /holdReason이 필요/u);
  rejects("객체가 아닌 팩 항목", (ledger) => { ledger.packs.push(null); }, /객체가 아닙니다/u);
  rejects("schema가 다름", (ledger) => { ledger.schema = "other"; }, /schema\/version/u);
  rejects("version이 다름", (ledger) => { ledger.version = 2; }, /schema\/version/u);
  rejects("문서 sha256 중복", (ledger) => { ledger.licenseTexts.push(structuredClone(ledger.licenseTexts[0])); }, /sha256이 중복됩니다/u);
  rejects("문서 sha256 형식", (ledger) => { ledger.licenseTexts[0].sha256 = "NOT-A-HASH"; }, /sha256이 64자리/u);
  rejects("문서 분류가 열거값이 아님", (ledger) => { ledger.licenseTexts[0].class = "weird"; }, /class가 알려진 문서 분류가 아닙니다/u);
  rejects("문서 summary 빔", (ledger) => { ledger.licenseTexts[0].summary = ""; }, /summary가 비어/u);
  rejects("문서 files 빔", (ledger) => { ledger.licenseTexts[0].files = []; }, /files\(/u);
  rejects("문서 files에 libraryPack 없음", (ledger) => { delete ledger.licenseTexts[0].files[0].libraryPack; }, /files\(/u);
  rejects("archivedFiles 형식", (ledger) => {
    const withArchive = ledger.licenseTexts.find((text) => Array.isArray(text.archivedFiles));
    withArchive.archivedFiles = [{ libraryPath: "x.zip" }];
  }, /archivedFiles는/u);
  rejects("local-license-file paths 빔", (ledger) => {
    entryOf(ledger, "LumaGrove — Wonky Woods").evidence.find((item) => item.kind === "local-license-file").paths = [];
  }, /paths\(라이브러리 상대 경로\)가 비어/u);
  rejects("local-license-file 해시 형식", (ledger) => {
    entryOf(ledger, "LumaGrove — Wonky Woods").evidence.find((item) => item.kind === "local-license-file").sha256 = "zz";
  }, /sha256이 64자리/u);
  rejects("local-license-file 미분류 해시", (ledger) => {
    entryOf(ledger, "LumaGrove — Wonky Woods").evidence.find((item) => item.kind === "local-license-file").sha256 = "f".repeat(64);
  }, /분류되지 않은 해시/u);
  rejects("2차 조회에 claim 없음", (ledger) => { delete entryOf(ledger, "Characters 1").evidence.find((item) => item.kind === "secondary-lookup").claim; }, /claim\(주장 요약\)/u);
  rejects("2차 조회에 source 없음", (ledger) => { delete entryOf(ledger, "Characters 1").evidence.find((item) => item.kind === "secondary-lookup").source; }, /source\(출처\)/u);
  assert.deepEqual(validatePackRightsLedger(null), ["원장이 객체가 아닙니다."]);
  assert.ok(validatePackRightsLedger({ ...cloneLedger(), packs: "x" }).some((problem) => /packs가 배열이 아닙니다/u.test(problem)));
  assert.ok(validatePackRightsLedger({ ...cloneLedger(), licenseTexts: "x" }).some((problem) => /licenseTexts가 배열이 아닙니다/u.test(problem)));
});

test("완전성 검사는 제목 불일치와 생성기 묶음 안 중복도 가려낸다", () => {
  const retitled = cloneLedger();
  entryOf(retitled, "Pirate Island").title = "Pirate Isle";
  assert.ok(checkLedgerCoversDefs(retitled, GENERATOR_DEFS).some((problem) => /제목이 다릅니다.*Pirate Island/u.test(problem)));
  const duplicated = { ...GENERATOR_DEFS, pack: [...CATALOG_PACKS, CATALOG_PACKS[0]] };
  assert.ok(checkLedgerCoversDefs(cloneLedger(), duplicated).some((problem) => /같은 팩이 두 번 있습니다/u.test(problem)));
});

test("hold 팩의 사용자 노출 문구(holdLabel)는 사유·권리 용어와 공개 약속을 드러내지 않는다", () => {
  const ledger = loadPackRightsLedger();
  const holds = ledger.packs.filter((entry) => entry.serve === "hold");
  assert.ok(holds.length > 0 || ledger.packs.every((entry) => entry.serve === "allow"));
  for (const entry of holds) {
    assert.doesNotMatch(entry.holdLabel, /제작사|증빙|영수증|서면|충돌|라이선스|저작권|권리|공개한다|공개합니다/u, entry.title);
  }
  assert.doesNotMatch(HOLD_PUBLIC_LABEL, /제작사|증빙|영수증|서면|충돌|라이선스|저작권|권리|공개한다|공개합니다/u);
});

test("커밋된 theme-packs.json은 원장과 어긋나지 않는다 — 권리 블록이 있으면 원장 투영과 같고, 없으면(원장 이전 스냅샷) 원장이 그 팩을 열지 않았다", () => {
  const ledger = loadPackRightsLedger();
  const themePacks = readJson(THEME_PACKS_PATH);
  for (const pack of themePacks.packs) {
    const decision = evaluateServeDecision(ledger, pack, { group: "pack" });
    if (pack.rights === undefined) {
      assert.equal(decision.serve, false, `${pack.title}: 원장은 열었는데 theme-packs.json이 재생성되지 않았습니다.`);
    } else {
      assert.equal(decision.serve, true, `${pack.title}: 권리 블록이 있는데 원장이 열지 않았습니다.`);
      assert.deepEqual(pack.rights, packRightsProjection(decision.entry), `${pack.title}: 권리 블록이 원장 투영과 다릅니다.`);
    }
  }
  for (const pending of themePacks.pendingPacks.filter((entry) => entry.reason === "rights-hold")) {
    assert.notEqual(findPackRights(ledger, pending)?.serve, "allow", `${pending.title}: 원장이 연 팩이 rights-hold로 남아 있습니다.`);
  }
});
