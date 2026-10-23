import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { isDeepStrictEqual } from "node:util";
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
  packRightsKey,
  packRightsProjection,
  requiredEvidenceKinds,
  summarizePackRightsLedger,
  validatePackRightsLedger,
} from "./lib/creator-bundle-pack-rights.mjs";
import {
  allowPirate,
  assertClosed,
  cloneLedger,
  entryOf,
  FIXTURE_LIBRARY_PACK,
  fixtureLedger,
  fixtureLicenseText,
  flipToAllow,
  holdAllLedger,
  ledgerEntry,
  PINNED_EVIDENCE_DATE,
  problemsFor,
  qualifyingEvidence,
  resetToHold,
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
  const pirate = flipToAllow(resetToHold(entryOf(ledger, "Pirate Island")));
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
  const characters = resetToHold(entryOf(ledger, "Characters 1"));
  assert.ok(characters.evidence.some((item) => item.kind === "secondary-lookup"), "시드의 2차 조회 기록");
  flipToAllow(characters);
  assert.ok(problemsFor(ledger).some((problem) => /Characters 1/u.test(problem) && /itch-page-capture/u.test(problem)));
});

test("검토 권고 hold 팩은 서면 확인 없이 allow로 바꿀 수 없다", () => {
  for (const title of REVIEW_RECOMMENDED_HOLD_TITLES) {
    const ledger = cloneLedger();
    flipToAllow(resetToHold(entryOf(ledger, title)));
    const problems = problemsFor(ledger);
    assert.ok(problems.some((problem) => problem.includes(title) && /producer-written-confirmation/u.test(problem)), title);
  }
});

test("웹 서비스 서빙을 다루지 않는 제작사 확인은 서면 확인으로 인정하지 않는다", () => {
  const ledger = cloneLedger();
  const restaurant = resetToHold(entryOf(ledger, "Restaurant Megapack"));
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
  delete resetToHold(entryOf(noLabel, "Pirate Island")).holdLabel;
  assert.ok(problemsFor(noLabel).some((problem) => /holdLabel/u.test(problem)));

  const badServe = cloneLedger();
  entryOf(badServe, "Pirate Island").serve = "maybe";
  assert.ok(problemsFor(badServe).some((problem) => /serve는/u.test(problem)));

  const allowWithHoldLabel = cloneLedger();
  flipToAllow(entryOf(allowWithHoldLabel, "Pirate Island"));
  entryOf(allowWithHoldLabel, "Pirate Island").holdLabel = "공개 준비 중이다.";
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

test("itch 캡처 URL은 https itch.io 팩 페이지만 인정하고 닮은 도메인·자격 정보·루트 주소는 거부한다", () => {
  const rejected = [
    "https://zitch.io/a", "https://evilitch.io/x", "https://notitch.io/a", "http://itch.io/x",
    "https://itch.io@evil.com/x", "https://user:pw@itch.io/x", "https://evil.com/itch.io/x",
    "https://itch.io.evil.com/x", "https://creator.itch.io/", "https://itch.io", "ftp://itch.io/x",
    "itch.io/x", "", "   ",
    // 리뷰 2차: 빈 호스트 라벨·포트·팩 페이지가 아닌 주소·공백/개행 패딩·역슬래시·깊은 하위 도메인.
    "https://.itch.io/x", "https://..itch.io/x", "https://itch.io:8443/x", "https://rgpoly.itch.io:444/pack",
    "https://itch.io//", "https://itch.io/login", "https://itch.io/b/", "  https://rgpoly.itch.io/pack  ",
    "https://rgpoly.itch.io/pack\n", "https://rgpoly.itch.io/pa\tck", "https://itch.io\\.evil.com/x",
    "https://a.b.itch.io/pack", "https://rgpoly.itch.io/\u200bpack", "https://rg poly.itch.io/pack",
  ];
  for (const url of rejected) {
    assertClosed(allowPirate({ capture: { url } }), /itch\.io 팩 페이지 주소/u, JSON.stringify(url));
  }
  assertClosed(allowPirate({ capture: { url: undefined } }), /itch\.io 팩 페이지 주소/u, "url 없음");
  const accepted = [
    "https://itch.io/b/3905/creator-bundle-volume-1",
    "https://emaceart.itch.io/cute-pack",
    "https://rg-poly.itch.io/pirate-island?download",
    "https://rgpoly.itch.io./pirate-island", // 끝 점 하나(FQDN 표기)는 허용한다.
  ];
  for (const url of accepted) {
    const { ledger, pirate } = allowPirate({ capture: { url } });
    assert.deepEqual(problemsFor(ledger), [], url);
    assert.equal(evaluateServeDecision(ledger, pirate).serve, true, url);
  }
});

test("증빙 날짜는 달력에 있는 과거·오늘 날짜여야 하고 불가능하거나 미래인 날짜는 거부한다", () => {
  const badDates = [
    "2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31", "2026-1-1", "20261022", "2999-01-01", "9999-12-31",
    "어제", "", 20261022, null, "1000-01-01", "2012-12-31", // itch.io 시작(2013) 이전은 증빙일 수 없다.
  ];
  for (const verifiedAt of badDates) {
    assertClosed(allowPirate({ receipt: { verifiedAt } }), /verifiedAt/u, `verifiedAt ${String(verifiedAt)}`);
  }
  for (const retrievedAt of ["2026-02-30", "2999-12-31", "", undefined]) {
    assertClosed(allowPirate({ capture: { retrievedAt } }), /retrievedAt/u, `retrievedAt ${String(retrievedAt)}`);
  }
  assertClosed(allowPirate({ capture: { verifiedAt: "2999-01-01" } }), /verifiedAt/u, "캡처 verifiedAt 미래");
  // 윤년 2월 29일은 달력에 있고, 하한 당일(2013-01-01)은 허용한다.
  assert.deepEqual(problemsFor(allowPirate({ receipt: { verifiedAt: "2024-02-29" } }).ledger), []);
  assert.deepEqual(problemsFor(allowPirate({ receipt: { verifiedAt: "2013-01-01" } }).ledger), []);
});

test("증빙 날짜 상한은 주입한 현재 시각 기준 UTC+14의 오늘까지다", () => {
  const pinned = { verifiedAt: PINNED_EVIDENCE_DATE, retrievedAt: PINNED_EVIDENCE_DATE };
  const { ledger, pirate } = allowPirate({ capture: pinned, receipt: { verifiedAt: "2026-10-23" } });
  const early = new Date("2026-10-22T09:00:00Z"); // +14h = 2026-10-22 → 10-23은 미래
  const late = new Date("2026-10-22T11:00:00Z"); // +14h = 2026-10-23 → 허용
  // 경계는 정확히 UTC+14다: 09:59:59Z까지는 10-23이 미래이고 10:00:00Z부터 오늘이다 (13시간·15시간 경계는 둘 중 하나가 어긋난다).
  assert.ok(validatePackRightsLedger(ledger, { now: new Date("2026-10-22T09:59:59Z") }).some((problem) => /미래 날짜/u.test(problem)));
  assert.deepEqual(validatePackRightsLedger(ledger, { now: new Date("2026-10-22T10:00:00Z") }), []);
  assert.ok(validatePackRightsLedger(ledger, { now: early }).some((problem) => /미래 날짜/u.test(problem)));
  assert.deepEqual(validatePackRightsLedger(ledger, { now: late }), []);
  assert.equal(evaluateServeDecision(ledger, pirate, { now: early }).serve, false);
  assert.equal(evaluateServeDecision(ledger, pirate, { now: late }).serve, true);
  assert.ok(allowEligibilityProblems(ledger, pirate, { now: early }).length > 0);
  assert.deepEqual(allowEligibilityProblems(ledger, pirate, { now: late }), []);
  assert.deepEqual(missingEvidenceKinds(ledger, pirate, { now: early }), ["purchase-receipt"]);
  assert.deepEqual(missingEvidenceKinds(ledger, pirate, { now: late }), []);
  // 잘못된 now(Invalid Date)는 실제 시계로 조용히 대체하지 않고 던진다 — Date가 아닌 값과 같은 계약이다.
  assert.throws(() => validatePackRightsLedger(ledger, { now: new Date("not a date") }), TypeError);
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
    const restaurant = resetToHold(entryOf(ledger, "Restaurant Megapack"));
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
  const pendingPack = { title: "Pending Pack", catalogIds: ["cbv1-905-pending"] };
  const ledger = fixtureLedger([ledgerEntry({ ...pendingPack, group: "pending", serve: "allow" })]);
  const entry = findPackRights(ledger, pendingPack);
  assert.deepEqual(missingEvidenceKinds(ledger, entry), [], "요구 증빙은 이미 충족");
  assert.ok(problemsFor(ledger).some((problem) => /pending 묶음 팩은 인제스션·CATALOG_PACKS 편입 전/u.test(problem)));
  const decision = evaluateServeDecision(ledger, { ...pendingPack, creator: "RG Poly" });
  assert.equal(decision.serve, false);
  assert.equal(decision.reason, "invalid-evidence");
  // 편입하면서 group을 pack으로 옮기면 같은 증빙으로 열린다.
  entry.group = "pack";
  assert.deepEqual(problemsFor(ledger), []);
  assert.equal(evaluateServeDecision(ledger, { ...pendingPack, creator: "RG Poly" }, { group: "pack" }).serve, true);
  // 알 수 없는 묶음 값은 서빙 대상이 아니다.
  entry.group = "other";
  assert.ok(allowEligibilityProblems(ledger, entry).some((problem) => /서빙 판정 대상이 아닙니다/u.test(problem)));
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
  rejects("hold인데 holdReason 없음", (ledger) => { delete resetToHold(entryOf(ledger, "Pirate Island")).holdReason; }, /holdReason이 필요/u);
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
  for (const entry of holds) {
    assert.doesNotMatch(entry.holdLabel, /제작사|증빙|영수증|서면|충돌|라이선스|저작권|권리|공개한다|공개합니다/u, entry.title);
  }
  assert.doesNotMatch(HOLD_PUBLIC_LABEL, /제작사|증빙|영수증|서면|충돌|라이선스|저작권|권리|공개한다|공개합니다/u);
});

/**
 * theme-packs.json과 원장의 어긋남을 문장 배열로 돌려준다 (빈 배열이면 일치). 권리 블록이 있으면 원장 투영과 같아야 하고,
 * 없으면(원장 이전 스냅샷) 원장이 그 팩을 열지 않았어야 한다.
 */
function driftProblems(ledger, themePacks) {
  const problems = [];
  for (const pack of themePacks.packs) {
    const decision = evaluateServeDecision(ledger, pack, { group: "pack" });
    if (pack.rights === undefined) {
      if (decision.serve) problems.push(`${pack.title}: 원장은 열었는데 theme-packs.json이 재생성되지 않았습니다.`);
    } else if (!decision.serve) {
      problems.push(`${pack.title}: 권리 블록이 있는데 원장이 열지 않았습니다.`);
    } else if (!isDeepStrictEqual(pack.rights, packRightsProjection(decision.entry))) {
      problems.push(`${pack.title}: 권리 블록이 원장 투영과 다릅니다.`);
    }
  }
  for (const pending of themePacks.pendingPacks.filter((entry) => entry.reason === "rights-hold")) {
    if (findPackRights(ledger, pending)?.serve === "allow") {
      problems.push(`${pending.title}: 원장이 연 팩이 rights-hold로 남아 있습니다.`);
    }
  }
  return problems;
}

test("커밋된 theme-packs.json은 원장과 어긋나지 않는다 — 권리 블록이 있으면 원장 투영과 같고, 없으면(원장 이전 스냅샷) 원장이 그 팩을 열지 않았다", () => {
  assert.deepEqual(driftProblems(loadPackRightsLedger(), readJson(THEME_PACKS_PATH)), []);
});

test("어긋남 점검은 시드에 열린 팩이 없어도 실제로 어긋남을 가려낸다 (합성 입력)", () => {
  const themePacks = readJson(THEME_PACKS_PATH);
  const pirateIndex = themePacks.packs.findIndex((pack) => pack.title === "Pirate Island");
  assert.ok(pirateIndex >= 0);
  // 원장은 열었는데 theme-packs에 권리 블록이 없다 → 재생성 필요.
  const { ledger, pirate } = allowPirate();
  assert.deepEqual(driftProblems(ledger, themePacks), ["Pirate Island: 원장은 열었는데 theme-packs.json이 재생성되지 않았습니다."]);
  // 재생성된 것처럼 권리 블록을 맞추면 일치한다.
  const regenerated = structuredClone(themePacks);
  regenerated.packs[pirateIndex].rights = packRightsProjection(pirate);
  assert.deepEqual(driftProblems(ledger, regenerated), []);
  // grant가 바뀐 낡은 블록은 어긋난다.
  const stale = structuredClone(regenerated);
  stale.packs[pirateIndex].rights.commercialUse = false;
  assert.deepEqual(driftProblems(ledger, stale), ["Pirate Island: 권리 블록이 원장 투영과 다릅니다."]);
  // 증빙 없이 allow로 바꾼 원장에 권리 블록이 실려 있으면 서빙 판정이 닫혀 어긋남으로 잡힌다 (게이트가 꺼져 있으면 잡히지 않는다).
  const unproven = holdAllLedger();
  flipToAllow(entryOf(unproven, "Pirate Island"));
  assert.deepEqual(driftProblems(unproven, regenerated), ["Pirate Island: 권리 블록이 있는데 원장이 열지 않았습니다."]);
  // hold로 돌아간 팩의 권리 블록도 마찬가지다.
  assert.deepEqual(driftProblems(holdAllLedger(), regenerated), ["Pirate Island: 권리 블록이 있는데 원장이 열지 않았습니다."]);
});

/* ── 2차 독립 검토 반영: 보이지 않는 문자·분류 타입 혼동·URL·키·정보 표시 ───────────────────── */

test("보이지 않는 문자·자리표시 낱말·글자 없는 보관 위치는 거부하고 실제 위치처럼 보이는 값은 받는다", () => {
  const rejected = [
    "\u200b\u200c\u200b\u200c\u200b\u200c", "\u3164\u2800\u3164\u2800\u3164\u2800", "\u00a0".repeat(8), "\ufeff".repeat(8),
    "TBD TBD", "tbd...", "pending (todo)", "N/A (none)", "추후 제출 예정", "미정 미정 미정", "해당 없음 없음",
    "123456", "http://", "https://", "-_-_-_", "aaaaaa", "ababab", "\tmeaningful-looking\n", "owner\u202email/receipt.pdf",
  ];
  for (const ref of rejected) {
    assertClosed(allowPirate({ receipt: { ref } }), /영수증·약관 보관 위치/u, JSON.stringify(ref));
    assertClosed(allowPirate({ capture: { ref } }), /캡처 보관 위치/u, JSON.stringify(ref));
  }
  const accepted = [
    "owner-receipts/itch-bundle-3905.pdf", "receipts/2026-10-22-itch.pdf", "mail emace 2026-10-25 답변.eml",
    "https://drive.example.com/d/abc123", "영수증_itch_번들.pdf",
  ];
  for (const ref of accepted) {
    const { ledger, pirate } = allowPirate({ receipt: { ref } });
    assert.deepEqual(problemsFor(ledger), [], ref);
    assert.equal(evaluateServeDecision(ledger, pirate).serve, true, ref);
  }
});

test("grant.licenseName·holdLabel은 보이지 않는 문자만 있거나 제어·서식 문자가 든 값을 받지 않는다", () => {
  for (const licenseName of ["\u200b", "\u3164", "   ", "CC0\n1.0", "CC0\t1.0", "CC0\u0000x", "CC0\u007fx", "CC0\u202e1.0"]) {
    const { ledger, pirate } = allowPirate();
    pirate.grant.licenseName = licenseName;
    assertClosed({ ledger, pirate }, /grant\.licenseName/u, JSON.stringify(licenseName));
    assert.throws(() => packRightsProjection(pirate), TypeError, JSON.stringify(licenseName));
  }
  for (const holdLabel of ["\u200b", "준비 중\n", "   ", "\u3164\u3164"]) {
    const ledger = cloneLedger();
    resetToHold(entryOf(ledger, "Pirate Island")).holdLabel = holdLabel;
    assert.ok(problemsFor(ledger).some((problem) => /holdLabel/u.test(problem)), JSON.stringify(holdLabel));
  }
});

test("문자열이 아닌 licenseClass(배열·객체)는 속성 키로 강제 변환돼 다른 분류처럼 통하지 못한다", () => {
  const texts = [fixtureLicenseText({ class: "rg-poly-proprietary" })]; // cc0-explicit와 호환되지 않는 문서
  const build = (licenseClass) => {
    const ledger = fixtureLedger([ledgerEntry({
      title: "Coerce Pack", catalogIds: ["cbv1-906-coerce"], licenseClass: "cc0-explicit", serve: "allow",
      libraryPacks: [FIXTURE_LIBRARY_PACK], evidence: [qualifyingEvidence("local-license-file")],
    })], texts);
    ledger.packs[0].licenseClass = licenseClass;
    return ledger;
  };
  const pack = { title: "Coerce Pack", catalogIds: ["cbv1-906-coerce"], creator: "RG Poly" };
  const baseline = evaluateServeDecision(build("cc0-explicit"), pack);
  assert.equal(baseline.serve, false, "기준선: 비호환 문서는 거부");
  assert.ok(baseline.problems.some((problem) => /문서 분류 rg-poly-proprietary는 팩 분류 cc0-explicit와 맞지 않습니다/u.test(problem)), baseline.problems.join(" | "));
  for (const licenseClass of [["cc0-explicit"], [["cc0-explicit"]], { toString: () => "cc0-explicit" }, 1, null]) {
    const ledger = build(licenseClass);
    assert.equal(requiredEvidenceKinds(licenseClass), null, String(licenseClass));
    assert.equal(evaluateServeDecision(ledger, pack).serve, false, String(licenseClass));
    assert.ok(problemsFor(ledger).some((problem) => /licenseClass/u.test(problem)), String(licenseClass));
  }
});

test("문서의 libraryPack은 libraryPath의 팩 폴더와 같아야 하고, 라이브러리 팩 폴더는 문서화된 3곳만 공유한다", () => {
  const ledger = cloneLedger();
  ledger.licenseTexts[0].files[0].libraryPack = "someone-elses-pack";
  assert.ok(problemsFor(ledger).some((problem) => /libraryPack\(someone-elses-pack\)이 libraryPath의 팩 폴더와 다릅니다/u.test(problem)));
  const archived = cloneLedger();
  const withArchive = archived.licenseTexts.find((text) => Array.isArray(text.archivedFiles));
  withArchive.archivedFiles[0].libraryPack = "someone-elses-pack";
  assert.ok(problemsFor(archived).some((problem) => /팩 폴더와 다릅니다/u.test(problem)));

  // 팩 폴더 이름을 둘 이상의 원장 항목이 주장하는 경우는 mappingNote로 설명된 3곳뿐이다 (귀속 변경은 소유자 확인 사항).
  const owners = new Map();
  for (const entry of loadPackRightsLedger().packs) {
    for (const name of entry.libraryPacks) owners.set(name, [...(owners.get(name) ?? []), entry.title]);
  }
  const shared = [...owners].filter(([, titles]) => titles.length > 1).map(([name]) => name).sort();
  assert.deepEqual(shared, ["graves-kit-with-lods", "low-poly-asia-pack", "pixeldrift-metro-3d-pixel-art-subway-vr"]);
});

test("서빙 판정은 제목·제작사가 문자열로 없으면 닫고, 비정상 catalogIds는 어떤 팩과도 일치시키지 않는다", () => {
  const ledger = fixtureLedger([
    ledgerEntry({ title: "Allowed Pack", catalogIds: ["cbv1-901-allowed"], serve: "allow" }),
    ledgerEntry({ title: "Food Pack", catalogIds: [], serve: "allow" }),
  ]);
  const allowed = { catalogIds: ["cbv1-901-allowed"], title: "Allowed Pack", creator: "RG Poly" };
  assert.equal(evaluateServeDecision(ledger, allowed).serve, true);
  assert.equal(evaluateServeDecision(ledger, { catalogIds: allowed.catalogIds }).reason, "identity-mismatch");
  assert.equal(evaluateServeDecision(ledger, { ...allowed, creator: undefined }).reason, "identity-mismatch");
  assert.equal(evaluateServeDecision(ledger, { ...allowed, title: ["Allowed Pack"] }).reason, "identity-mismatch");
  const food = { title: "Food Pack", creator: "RG Poly" };
  assert.equal(evaluateServeDecision(ledger, food).serve, true);
  for (const catalogIds of ["junk", ["title:Food Pack"], [1], [["cbv1-901-allowed"]], {}, null]) {
    const spoof = { ...food, catalogIds };
    assert.equal(evaluateServeDecision(ledger, spoof).serve, false, JSON.stringify(catalogIds));
    assert.equal(evaluateServeDecision(ledger, spoof).reason, "missing-entry", JSON.stringify(catalogIds));
  }
  // 번호 키와 제목 키는 접두사로 구분돼 충돌하지 않는다.
  assert.notEqual(packRightsKey({ catalogIds: ["title:Food Pack"] }), packRightsKey({ title: "Food Pack" }));
  assert.equal(packRightsKey({ catalogIds: ["b", "a"] }), packRightsKey({ catalogIds: ["a", "b"] }));
});

test("now는 Date로만 주입할 수 있다 — Date가 아닌 값은 조용히 무시하지 않고 던진다", () => {
  const pinned = { verifiedAt: PINNED_EVIDENCE_DATE, retrievedAt: PINNED_EVIDENCE_DATE };
  const { ledger, pirate } = allowPirate({ capture: pinned, receipt: { verifiedAt: "2026-12-31" } });
  const future = new Date("2027-01-01T00:00:00Z");
  assert.equal(evaluateServeDecision(ledger, pirate, { now: future }).serve, true);
  assert.throws(() => evaluateServeDecision(ledger, pirate, { now: future.getTime() }), TypeError);
  assert.throws(() => validatePackRightsLedger(ledger, { now: "2027-01-01" }), TypeError);
  assert.throws(() => allowEligibilityProblems(ledger, pirate, { now: {} }), TypeError);
});

test("증빙 하나의 문제는 한 줄로만 보고하고, 팩 항목이 null이어도 요약은 던지지 않는다", () => {
  const { ledger } = allowPirate({ receipt: { ref: "" } });
  const lines = problemsFor(ledger).filter((problem) => /영수증·약관 보관 위치/u.test(problem));
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.deepEqual(summarizePackRightsLedger({ packs: [null, { group: "pack", serve: "hold" }, "x"] }), {
    total: 1, byGroup: { pack: 1 }, allow: 0, hold: 1,
  });
});

test("검증 CLI는 null 팩 항목에도 스택 트레이스 없이 문제로 보고하고, 열 수 있는 정도를 사실대로 적는다", () => {
  const root = mkdtempSync(join(tmpdir(), "pack-rights-cli-"));
  try {
    const ledger = cloneLedger();
    // 증빙은 다 갖췄지만 grant가 없는 hold, 알 수 없는 분류의 hold, null 항목을 한 원장에 넣는다.
    const pirate = resetToHold(entryOf(ledger, "Pirate Island"));
    pirate.evidence.push(qualifyingEvidence("itch-page-capture"), qualifyingEvidence("purchase-receipt"));
    entryOf(ledger, "Farm Land").licenseClass = "made-up-class";
    ledger.packs.push(null);
    const path = join(root, "ledger.json");
    writeFileSync(path, JSON.stringify(ledger));
    const script = resolve(REPO_ROOT, "scripts/verify-creator-bundle-pack-rights.mjs");
    const result = spawnSync(process.execPath, [script, "--pack-rights", path], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /TypeError|at .*\.mjs/u);
    assert.match(result.stdout, /문제: packs\[\d+\]: 객체가 아닙니다/u);
    assert.match(result.stdout, /Pirate Island \(unstated-rg-poly\).* — 증빙 충족 — 소유자가 grant를 채워 열 수 있음/u);
    assert.match(result.stdout, /Farm Land \(made-up-class\).* — 라이선스 분류를 알 수 없어 열 수 없음/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
