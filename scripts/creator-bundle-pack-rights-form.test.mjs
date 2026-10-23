import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import { CATALOG_PACKS, CROWD_PACKS, PENDING_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import {
  checkLedgerCoversDefs,
  evaluateServeDecision,
  findPackRights,
  packRightsKey,
  packRightsProjection,
  SHARED_LIBRARY_FOLDERS,
  validatePackRightsLedger,
  verifyLocalLicenseEvidence,
  WEB_EXTERNAL_REFERENCE_PATTERN,
  WEB_RIGHTS_TEXT_MAX_LENGTH,
  WEB_SENSITIVE_REFERENCE_PATTERN,
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
  ledgerEntry,
  problemsFor,
  qualifyingEvidence,
  resetToHold,
} from "./lib/creator-bundle-pack-rights-test-support.mjs";

// 증빙 값의 형식 검사(경로 정규형·보이지 않는 문자·보관 위치·itch 주소·라이선스 이름·키 충돌)와 폴더 공유 규칙의 부정 테스트.
// 이 검사들은 진위 판정이 아니라 형식·일관성 검사다 — 그럴듯한 문장으로 쓴 거짓 값은 가려내지 못한다(파일 머리의 "한계").
// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 라이브러리 경로: 정규형 상대 경로만 ─────────────────────────────────────────────────── */

const BAD_RELATIVE_PATHS = ["a/../b", "./a", "a/./b", "a//b", "/abs/x", "a\\b", "C:/x", "a/", "", "..", "../x"];

test("라이선스 문서의 libraryPath·member는 라이브러리 안의 정규형 상대 경로여야 한다", () => {
  for (const bad of BAD_RELATIVE_PATHS) {
    const loose = cloneLedger();
    loose.licenseTexts[0].files[0].libraryPath = bad;
    assert.ok(problemsFor(loose).some((problem) => /libraryPath가 라이브러리 안의 상대 경로가 아닙니다/u.test(problem)), `files ${JSON.stringify(bad)}`);
    const archived = cloneLedger();
    const withArchive = archived.licenseTexts.find((text) => Array.isArray(text.archivedFiles));
    withArchive.archivedFiles[0].libraryPath = bad;
    assert.ok(problemsFor(archived).some((problem) => /libraryPath가 라이브러리 안의 상대 경로가 아닙니다/u.test(problem)), `archived ${JSON.stringify(bad)}`);
  }
  for (const bad of BAD_RELATIVE_PATHS.filter((path) => path !== "a/" && path !== "")) {
    const archived = cloneLedger();
    archived.licenseTexts.find((text) => Array.isArray(text.archivedFiles)).archivedFiles[0].member = bad;
    assert.ok(problemsFor(archived).some((problem) => /member가 라이브러리 안의 상대 경로가 아닙니다/u.test(problem)), `member ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(problemsFor(cloneLedger()), [], "커밋된 원장의 경로는 전부 정규형");
});

test("`..` 조각으로 다른 팩의 문서를 내 폴더 문서처럼 꾸민 증빙은 검증도 서빙 판정도 닫는다", () => {
  const ledger = cloneLedger();
  const city = resetToHold(entryOf(ledger, "Cartoon City Massive Pack"));
  const cc0 = ledger.licenseTexts.find((text) => text.class === "rg-poly-cc0");
  const foreign = cc0.files.find((file) => file.libraryPack !== "cartoon-city-massive-pack");
  const [category, ...rest] = foreign.libraryPath.split("/");
  // 두 번째 조각이 city의 폴더라서 libraryPack과의 일관성 규칙은 속지만, `..`로 실제로는 다른 팩의 파일을 가리킨다.
  const disguised = `${category}/cartoon-city-massive-pack/../${rest.slice(1).join("/")}`;
  cc0.files.push({ libraryPath: disguised, libraryPack: "cartoon-city-massive-pack" });
  city.licenseClass = "cc0-explicit";
  flipToAllow(city, { evidence: [qualifyingEvidence("local-license-file", { sha256: cc0.sha256, paths: [disguised] })] });
  assert.ok(problemsFor(ledger).some((problem) => /libraryPath가 라이브러리 안의 상대 경로가 아닙니다/u.test(problem)));
  const decision = evaluateServeDecision(ledger, city, { group: "pack" });
  assert.equal(decision.serve, false, "검증을 거치지 않아도 위장 기록은 증빙으로 쓰이지 않는다");
  assert.equal(decision.reason, "invalid-evidence");
  assert.ok(decision.problems.some((problem) => /기록된 문서가 아닙니다/u.test(problem)), decision.problems.join(" | "));
});

test("위치 기록이 폴더 일치·정규형을 어기면 검증을 거치지 않은 서빙 판정에서도 증빙으로 쓰이지 않는다", () => {
  // 정규형 경로지만 libraryPack 선언이 경로의 팩 폴더와 다르다 — 다른 팩의 문서를 내 폴더 것처럼 선언한 경우.
  const ledger = cloneLedger();
  const city = resetToHold(entryOf(ledger, "Cartoon City Massive Pack"));
  const cc0 = ledger.licenseTexts.find((text) => text.class === "rg-poly-cc0");
  const foreign = cc0.files.find((file) => file.libraryPack !== "cartoon-city-massive-pack");
  const mislabeled = { libraryPath: foreign.libraryPath, libraryPack: "cartoon-city-massive-pack" };
  cc0.files = [mislabeled];
  city.licenseClass = "cc0-explicit";
  flipToAllow(city, { evidence: [qualifyingEvidence("local-license-file", { sha256: cc0.sha256, paths: [mislabeled.libraryPath] })] });
  const decision = evaluateServeDecision(ledger, city, { group: "pack" });
  assert.equal(decision.serve, false);
  assert.ok(decision.problems.some((problem) => /기록된 문서가 아닙니다/u.test(problem)), decision.problems.join(" | "));

  // zip 안 사본의 멤버 이름에 `..`가 있으면 같은 방식으로 닫힌다. 정상 멤버는 같은 구성에서 열린다.
  const zipLedger = (member) => {
    const text = fixtureLicenseText({ files: [{ libraryPath: "01-x/fixture/License.txt", libraryPack: FIXTURE_LIBRARY_PACK }],
      archivedFiles: [{ libraryPath: "01-x/fixture/pack.zip", member, libraryPack: FIXTURE_LIBRARY_PACK }] });
    return fixtureLedger([ledgerEntry({
      title: "Zip Pack", catalogIds: ["cbv1-953-zip"], licenseClass: "cc0-explicit", serve: "allow", libraryPacks: [FIXTURE_LIBRARY_PACK],
      evidence: [qualifyingEvidence("local-license-file", { paths: [`01-x/fixture/pack.zip::${member}`] })],
    })], [text]);
  };
  const pack = { title: "Zip Pack", creator: "RG Poly", catalogIds: ["cbv1-953-zip"] };
  assert.equal(evaluateServeDecision(zipLedger("LICENSE.txt"), pack).serve, true, "기준선");
  const dotted = evaluateServeDecision(zipLedger("../LICENSE.txt"), pack);
  assert.equal(dotted.serve, false);
  assert.ok(dotted.problems.some((problem) => /기록된 문서가 아닙니다/u.test(problem)), dotted.problems.join(" | "));
});

test("verifyLocalLicenseEvidence는 깨진 원장에 던지지 않고, 라이브러리 밖을 가리키는 경로는 읽지 않는다", () => {
  const reads = [];
  const result = verifyLocalLicenseEvidence({
    ledger: {
      licenseTexts: [
        null,
        {
          sha256: "a".repeat(64),
          files: [null, { libraryPath: 1 }, { libraryPath: "../../etc/passwd" }],
          archivedFiles: [null, { libraryPath: "01-x/pack/a.zip", member: "../x" }],
        },
      ],
    },
    libraryRoot: "/library-root",
    readFile: (path) => { reads.push(path); throw new Error("읽으면 안 됩니다"); },
  });
  assert.deepEqual(reads, []);
  assert.equal(result.checked, 6);
  assert.deepEqual(result.mismatches.map((mismatch) => mismatch.reason).sort(),
    ["malformed", "malformed", "malformed", "unsafe-path", "unsafe-path", "unsafe-path"]);
});

/* ── 라이브러리 폴더 공유 ──────────────────────────────────────────────────────────────── */

test("라이브러리 폴더는 문서화된 공유 폴더가 아니면 한 항목만 주장할 수 있다", () => {
  const ledger = cloneLedger();
  entryOf(ledger, "Cartoon City Massive Pack").libraryPacks.push("cute-dungeon-megapack");
  assert.ok(problemsFor(ledger).some((problem) => /libraryPacks의 cute-dungeon-megapack을 packs\[\d+\]도 주장합니다/u.test(problem)));

  const owners = new Map();
  for (const entry of cloneLedger().packs) for (const name of entry.libraryPacks) owners.set(name, (owners.get(name) ?? 0) + 1);
  const shared = [...owners].filter(([, count]) => count > 1).map(([name]) => name).sort();
  assert.deepEqual(shared, [...SHARED_LIBRARY_FOLDERS].sort(), "공유 폴더 목록이 실제 공유와 다릅니다 (오래된 항목이 남았거나 새 공유가 생겼습니다).");
});

test("다른 항목이 주장하는 폴더의 문서를 내 증빙으로 쓰는 allow는 검증을 거치지 않아도 닫힌다", () => {
  const ledger = cloneLedger();
  const dungeon = ledger.licenseTexts.flatMap((text) => text.files.map((file) => ({ text, file })))
    .find(({ file }) => file.libraryPack === "cute-dungeon-megapack");
  const city = resetToHold(entryOf(ledger, "Cartoon City Massive Pack"));
  city.libraryPacks.push("cute-dungeon-megapack");
  city.licenseClass = "cc0-explicit";
  flipToAllow(city, {
    evidence: [qualifyingEvidence("local-license-file", { sha256: dungeon.text.sha256, paths: [dungeon.file.libraryPath] })],
  });
  const decision = evaluateServeDecision(ledger, city, { group: "pack" });
  assert.equal(decision.serve, false);
  assert.ok(decision.problems.some((problem) => /라이브러리 폴더 cute-dungeon-megapack을 다른 항목도 주장합니다/u.test(problem)), decision.problems.join(" | "));
  assert.ok(problemsFor(ledger).some((problem) => /주장합니다/u.test(problem)));
});

/* ── 보이지 않는 문자·비어 보이는 값 ─────────────────────────────────────────────────────── */

const INVISIBLE_ONLY = [
  "\uFE0F", "\uFE00\uFE01", "\u034F", "\u0300", "\uE000", "\u{E0002}", "\u{E0100}", "\u17B4", "\u180B", "\u0378", "\uD800",
  "\u2028", "\u3164", "\u2800", "\u200B",
];

test("변이 선택자·결합 문자·사설 영역·미할당·짝 없는 서로게이트만 있는 값도 비었다고 보고 거부한다", () => {
  for (const licenseName of [...INVISIBLE_ONLY, "CC0\u2028Universal", "CC0\u2029Universal"]) {
    const { ledger, pirate } = allowPirate();
    pirate.grant.licenseName = licenseName;
    assertClosed({ ledger, pirate }, /grant\.licenseName/u, JSON.stringify(licenseName));
    assert.throws(() => packRightsProjection(pirate), TypeError, JSON.stringify(licenseName));
  }
  for (const embedded of ["owner\u2028email/receipt.pdf", "owner\u2029email/receipt.pdf"]) {
    assertClosed(allowPirate({ receipt: { ref: embedded } }), /U\+202[89]/u, JSON.stringify(embedded));
  }
  for (const holdLabel of [...INVISIBLE_ONLY, "준비 중\u2028이다.", "준비 중\u2029이다."]) {
    const ledger = cloneLedger();
    resetToHold(entryOf(ledger, "Pirate Island")).holdLabel = holdLabel;
    assert.ok(problemsFor(ledger).some((problem) => /holdLabel/u.test(problem)), JSON.stringify(holdLabel));
  }
});

test("거부 사유는 소유자가 고칠 수 있게 구체적으로 적는다 (문자 위치·종류)", () => {
  const reason = (overrides, kind = "receipt") => {
    const { ledger } = allowPirate(kind === "receipt" ? { receipt: overrides } : { capture: overrides });
    return problemsFor(ledger).join(" | ");
  };
  assert.match(reason({ ref: "Order\u200B 12345 receipt.pdf" }), /ref\(영수증·약관 보관 위치\).*U\+200B.*복사/u);
  assert.match(reason({ ref: "receipt 3905.pdf\n" }), /U\+000A/u);
  assert.match(reason({ ref: "123456" }), /글자\(설명\)가 하나도 없습니다/u);
  assert.match(reason({ ref: "ab12" }), /너무 짧습니다/u);
  assert.match(reason({ ref: "TBD.pdf" }), /자리표시 낱말\(TBD·TODO 등\)/u);
  assert.match(reason({ ref: "not yet" }), /자리표시 낱말로만/u);
  assert.match(reason({ url: "https://emaceart.itch.io/some-pack\n" }, "capture"), /url이 https itch\.io 팩 페이지 주소가 아닙니다 — .*U\+000A/u);
  assert.match(reason({ url: " https://emaceart.itch.io/some-pack" }, "capture"), /U\+0020.*0번째/u);
  assert.match(reason({ url: "https://emaceart.itch.io:8443/x" }, "capture"), /사용자 정보·포트가 있으면 안 됩니다/u);
  assert.match(reason({ url: "https://user:pw@emaceart.itch.io/x" }, "capture"), /사용자 정보·포트가 있으면 안 됩니다/u);
  assert.match(reason({ url: "https://emaceart.itch.io:443/x" }, "capture"), /주소 표기가 정규형과 다릅니다/u);
  assert.match(reason({ url: "https://www.itch.io/x" }, "capture"), /www은 제작자 페이지 하위 도메인이 아닙니다/u);
});

/* ── 보관 위치(ref) ──────────────────────────────────────────────────────────────────── */

const PLACEHOLDER_REFS = [
  // 확장자만 붙인 자리표시
  "todo.pdf", "TBD.pdf", "placeholder.eml", "dummy.png", "test.pdf", "sample.pdf", "none.pdf", "n/a.pdf", "unknown.pdf",
  // 영문 문장형 자리표시
  "TODO: add receipt", "to be determined", "not available", "will upload later", "not yet", "tbd tbd2",
  // 한글 자리표시 (조사가 붙어도 어간으로 거른다)
  "추후 제출할 예정", "준비중입니다", "해당 사항 없음", "확인중입니다", "제출 확인",
  // 반복·단조로움·값 변환 흔적·예약 도메인
  "abcabc", "aabbcc", "abcdabcd", "1a2b1a2b", "[object Object]", "example.com/receipt.pdf", "https://www.example.org/x",
  // 글자·숫자가 4개 미만인 기호 위주 값
  "ab....!!", "a-b-+-+",
  // 전각·수학 글자는 정규화·코드 포인트 길이로 본다 (전각 TODO는 NFKC로만 자리표시 낱말이 된다)
  "\uFF34\uFF22\uFF24\u3000\uFF34\uFF22\uFF24", "\uFF34\uFF2F\uFF24\uFF2F\u3000\uFF32\uFF25\uFF23\uFF25\uFF29\uFF30\uFF34",
  "\u{1D400}\u{1D401}\u{1D402}\u{1D403}", "a\uFE00b\uFE01c\uFE02d\uFE03",
  // 숫자·기호만 (번호만으로는 보관 위치를 알 수 없다)
  "123456", "12345678", "20261022", "2026-10-22 #3905", "#12345",
];

const REAL_REFS = [
  "owner-receipts/itch-bundle-3905.pdf", "Order #12345 itch.io bundle receipt.pdf", "~/Documents/itch/receipt (bundle 3905).pdf",
  "영수증 파일", "구매 영수증", "영수증_itch_번들.pdf", "mail emace 2026-10-25 답변.eml", "Re: [Receipt] itch.io Creator Bundle",
  "https://drive.example.com/d/abc123", "C:\\Users\\owner\\receipts\\itch 3905.pdf", "receipt 3905.pdf",
];

test("자리표시 보관 위치는 캡처·영수증·서면 확인 모두에서 닫히고, 실제 위치처럼 보이는 값은 받는다", () => {
  for (const ref of PLACEHOLDER_REFS) {
    assertClosed(allowPirate({ capture: { ref } }), /캡처 보관 위치/u, `capture ${JSON.stringify(ref)}`);
    assertClosed(allowPirate({ receipt: { ref } }), /영수증·약관 보관 위치/u, `receipt ${JSON.stringify(ref)}`);
  }
  for (const ref of REAL_REFS) {
    const { ledger, pirate } = allowPirate({ receipt: { ref } });
    assert.deepEqual(problemsFor(ledger), [], ref);
    assert.equal(evaluateServeDecision(ledger, pirate).serve, true, ref);
  }
});

/* ── itch 주소 ───────────────────────────────────────────────────────────────────────── */

test("itch 주소는 팩·번들 페이지만 받고, 서비스 하위 도메인·원문과 정규형이 다른 표기·긴 주소는 거부한다", () => {
  const rejected = [
    "https://www.itch.io/anything", "https://docs.itch.io/x", "https://api.itch.io/x", "https://static.itch.io/x",
    "https://itch.io/b/abc", "https://itch.io/b/login", "https://itch.io/b/", "https://emaceart.itch.io/",
    "https://:@emaceart.itch.io/x", "https://@emaceart.itch.io/x", "https:emaceart.itch.io/x", "https:///emaceart.itch.io/x",
    "https://emaceart.itch.io:443/x", "https://emaceart\u3002itch\u3002io/x", "https://emaceart.\uFF49\uFF54\uFF43\uFF48.\uFF49\uFF4F/x",
    "https://emaceart%2eitch.io/x", "https://-bad.itch.io/x", `https://emaceart.itch.io/${"a".repeat(400)}`,
  ];
  for (const url of rejected) {
    assertClosed(allowPirate({ capture: { url } }), /itch\.io 팩 페이지 주소/u, JSON.stringify(url.slice(0, 80)));
  }
  const accepted = [
    "https://EmaceArt.itch.io/Some-Pack?x=1#y", "https://itch.io/b/3905/creator-bundle-volume-1", "https://emaceart.itch.io/some-pack/",
    "https://rg_poly-2.itch.io/pirate-island",
  ];
  for (const url of accepted) {
    const { ledger, pirate } = allowPirate({ capture: { url } });
    assert.deepEqual(problemsFor(ledger), [], url);
    assert.equal(evaluateServeDecision(ledger, pirate).serve, true, url);
  }
});

/* ── grant.licenseName: 웹 로더가 버리는 이름은 게이트가 먼저 거른다 ─────────────────────────── */

test("웹 로더(safeText)가 조용히 버리는 라이선스 이름은 게이트도 거부한다", () => {
  const rejected = [
    "CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/)", "CC0 1.0 Universal - see www.itch.io/docs",
    "Custom license (password protected download)", "License with api key inside", "see data:text/plain", "file: license.txt",
    "x".repeat(WEB_RIGHTS_TEXT_MAX_LENGTH + 1), "  CC0 1.0 ", "CC0  1.0", "\uFF23\uFF23\uFF10 1.0", "---",
  ];
  for (const licenseName of rejected) {
    const { ledger, pirate } = allowPirate();
    pirate.grant.licenseName = licenseName;
    assertClosed({ ledger, pirate }, /grant\.licenseName/u, JSON.stringify(licenseName.slice(0, 60)));
    assert.throws(() => packRightsProjection(pirate), TypeError, JSON.stringify(licenseName.slice(0, 60)));
  }
  for (const licenseName of ["CC0 1.0 Universal", "Creator Bundle: Volume 1 \u2014 EmaceArt Asset License", "x".repeat(WEB_RIGHTS_TEXT_MAX_LENGTH)]) {
    const { ledger, pirate } = allowPirate();
    pirate.grant.licenseName = licenseName;
    assert.deepEqual(problemsFor(ledger), [], licenseName.slice(0, 40));
    assert.equal(packRightsProjection(pirate).licenseName, licenseName);
  }
});

test("게이트의 라이선스 이름 규칙은 웹 로더 소스의 패턴·상한과 같다", () => {
  const source = readFileSync(resolve(REPO_ROOT, "apps/web/src/domains/creator/bg3d/bg3d-model-library.ts"), "utf8");
  const literal = (name) => {
    const match = new RegExp(`const ${name} =\\s*(/.+/[a-z]*);`, "u").exec(source);
    assert.ok(match, `웹 소스에서 ${name}을 찾지 못했습니다.`);
    return match[1];
  };
  assert.equal(WEB_EXTERNAL_REFERENCE_PATTERN.toString(), literal("EXTERNAL_REFERENCE_PATTERN"));
  assert.equal(WEB_SENSITIVE_REFERENCE_PATTERN.toString(), literal("SENSITIVE_REFERENCE_PATTERN"));
  assert.equal(Number(/const MAX_RIGHTS_TEXT_LENGTH = (\d+);/u.exec(source)?.[1]), WEB_RIGHTS_TEXT_MAX_LENGTH);
});

/* ── 형 변환·키 충돌 ───────────────────────────────────────────────────────────────────── */

test("문서·증빙의 sha256은 형 변환 없이 문자열이어야 한다 — 배열로 감싼 해시는 거부한다", () => {
  const ledger = cloneLedger();
  const hash = ledger.licenseTexts[0].sha256;
  ledger.licenseTexts[0].sha256 = [hash];
  assert.ok(problemsFor(ledger).some((problem) => /licenseTexts\[0\]: sha256이 64자리/u.test(problem)));
  const evidence = cloneLedger();
  const luma = entryOf(evidence, "LumaGrove \u2014 Wonky Woods");
  luma.evidence.find((item) => item.kind === "local-license-file").sha256 = [luma.evidence.find((item) => item.kind === "local-license-file").sha256];
  assert.ok(problemsFor(evidence).some((problem) => /증빙 local-license-file: sha256이 64자리/u.test(problem)));
});

test("잘못된 catalogIds는 서로 같은 키로 뭉쳐도 어떤 팩과도 매칭되지 않고, 이음 문자(+)로 키를 위장할 수 없다", () => {
  assert.notEqual(packRightsKey({ catalogIds: ["A", "B"] }), packRightsKey({ catalogIds: ["A+B"] }));
  assert.equal(packRightsKey({ catalogIds: [1] }), packRightsKey({ catalogIds: [2] }), "잘못된 값은 상수 키로 닫힌다");

  const base = { title: "Key Pack", creator: "RG Poly" };
  for (const [entryIds, defIds] of [[[1], [2]], [["A+B"], ["A", "B"]], [["A", "B"], ["A+B"]], [[""], [""]]]) {
    const ledger = fixtureLedger([ledgerEntry({ title: "Key Pack", catalogIds: ["cbv1-950-key"], serve: "allow" })]);
    ledger.packs[0].catalogIds = entryIds; // 검증을 거치지 않은 원장
    const def = { ...base, catalogIds: defIds };
    assert.equal(findPackRights(ledger, def), null, `${JSON.stringify(entryIds)} / ${JSON.stringify(defIds)}`);
    assert.equal(evaluateServeDecision(ledger, def).reason, "missing-entry");
  }

  const plus = cloneLedger();
  entryOf(plus, "Pirate Island").catalogIds = ["cbv1-035+pirate"];
  assert.ok(problemsFor(plus).some((problem) => /catalogIds는 이음 문자\(\+\)가 없는 문자열 배열/u.test(problem)));
  const defs = { pack: [{ title: "Bad Ids", creator: "RG Poly", catalogIds: [1] }], crowd: CROWD_PACKS, pending: PENDING_PACKS };
  assert.ok(checkLedgerCoversDefs(cloneLedger(), defs).some((problem) => /catalogIds가 올바르지 않습니다: Bad Ids/u.test(problem)));
  assert.ok(CATALOG_PACKS.length > 0);
});

/* ── 테스트 지원 ──────────────────────────────────────────────────────────────────────── */

test("테스트 지원의 기본값으로 만든 원장은 그대로 검증을 통과한다", () => {
  const ledger = fixtureLedger([
    ledgerEntry({
      title: "Clean Local", catalogIds: ["cbv1-951-clean"], licenseClass: "cc0-explicit", serve: "allow",
      libraryPacks: [FIXTURE_LIBRARY_PACK], evidence: [qualifyingEvidence("local-license-file")],
    }),
    ledgerEntry({ title: "Clean Hold", catalogIds: ["cbv1-952-hold"] }),
  ], [fixtureLicenseText()]);
  assert.deepEqual(validatePackRightsLedger(ledger), []);
  assert.equal(evaluateServeDecision(ledger, { title: "Clean Local", creator: "RG Poly", catalogIds: ["cbv1-951-clean"] }).serve, true);
});
