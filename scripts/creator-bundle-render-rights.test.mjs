import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import {
  findPackRightsByCatalogId,
  loadPackRightsLedger,
  packRightsProjection,
  validatePackRightsLedger,
} from "./lib/creator-bundle-pack-rights.mjs";
import {
  renderDraftSlot,
  renderLedger,
  renderManifest,
  renderSlot,
  RENDER_OFFICIAL_IDS,
  validRenderLedger,
} from "./lib/creator-bundle-render-rights-test-support.mjs";
import {
  findRenderFileProblems,
  isDraftRenderSlot,
  listRenderPackFiles,
  planRenderManifestRights,
  planRenderSlot,
  RENDER_MANIFEST_FILE,
  renderRightsDeliverable,
  RENDER_PACK_DIR,
  RENDER_RIGHTS_KEYS,
  serializeRenderManifest,
} from "./lib/creator-bundle-render-rights.mjs";

// 렌더 이미지 전달 경로(bundle-renders-v1)와 팩별 권리 원장의 연동 테스트: 원장 번호 조회, 슬롯 판정 표, 스탬프, 파일 점검, CLI.
// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(REPO_ROOT, "scripts/sync-creator-bundle-render-rights.mjs");
const COMMITTED_MANIFEST = resolve(REPO_ROOT, RENDER_PACK_DIR, RENDER_MANIFEST_FILE);

const OFFICIAL = RENDER_OFFICIAL_IDS;
const completeSlot = renderSlot;
const draftSlot = renderDraftSlot;
const validLedger = validRenderLedger;
const manifestOf = renderManifest;
const codes = (planned) => planned.problems.map((problem) => problem.code);
/** 객체 키가 재귀적으로 알파벳순인지 본다 — 커밋된 매니페스트의 직렬화 규칙. */
function assertKeysSorted(value, where = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertKeysSorted(item, `${where}[${index}]`));
  } else if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    assert.deepEqual(keys, [...keys].sort(), `${where}의 키가 정렬돼 있지 않습니다`);
    for (const key of keys) assertKeysSorted(value[key], `${where}.${key}`);
  }
}

/* ── 원장 번호 조회 ─────────────────────────────────────────────────────────────────────── */

test("공식 번호와 생성기 번호가 같은 원장 항목을 가리킨다 (Restaurant Megapack은 두 번호가 다르다)", () => {
  const ledger = loadPackRightsLedger();
  const byGenerator = findPackRightsByCatalogId(ledger, "cbv1-042-restaurant-megapack");
  const byOfficial = findPackRightsByCatalogId(ledger, "cbv1-042-kitchen-restaurant-megapack");
  assert.ok(byGenerator, "생성기 번호로 못 찾았습니다.");
  assert.equal(byOfficial, byGenerator);
  assert.equal(byOfficial.title, "Restaurant Megapack");
});

test("모르는 번호·빈 값·문자열이 아닌 값·프로토타입 키는 못 찾은 것으로 닫힌다", () => {
  const ledger = loadPackRightsLedger();
  for (const input of ["cbv1-999-not-in-ledger", "", undefined, null, 42, ["cbv1-042-restaurant-megapack"], {}, "__proto__", "constructor", "toString"]) {
    assert.equal(findPackRightsByCatalogId(ledger, input), null, JSON.stringify(input));
  }
  assert.equal(findPackRightsByCatalogId(null, "cbv1-042-restaurant-megapack"), null);
  assert.equal(findPackRightsByCatalogId({ packs: "x" }, "cbv1-042-restaurant-megapack"), null);
});

test("번호는 정확히 일치해야 한다 (대소문자·공백·접두 일치로 다른 팩이 걸리지 않는다)", () => {
  const ledger = loadPackRightsLedger();
  for (const input of ["CBV1-042-RESTAURANT-MEGAPACK", " cbv1-042-restaurant-megapack", "cbv1-042-restaurant-megapack ", "cbv1-042-restaurant", "cbv1-042-restaurant-megapack\u0000"]) {
    assert.equal(findPackRightsByCatalogId(ledger, input), null, JSON.stringify(input));
  }
});

test("같은 번호를 두 항목이 주장하는 원장(검증을 거치지 않은 값)에서는 어느 쪽도 고르지 않는다", () => {
  const ledger = renderLedger();
  ledger.packs[1].officialCatalogIds = [OFFICIAL.open];
  assert.equal(findPackRightsByCatalogId(ledger, OFFICIAL.open), null);
  assert.ok(findPackRightsByCatalogId(ledger, OFFICIAL.hold));
});

test("검증기는 공식 번호가 다른 항목의 번호와 겹치면 거부하고, 한 항목 안의 같은 번호는 허용한다", () => {
  assert.deepEqual(validatePackRightsLedger(validLedger()), []);
  const official = validLedger();
  official.packs[1].officialCatalogIds = [OFFICIAL.open];
  assert.ok(validatePackRightsLedger(official).some((problem) => /카탈로그 번호.*겹칩니다/u.test(problem)), "공식 번호끼리 겹침");
  const crossing = validLedger();
  crossing.packs[1].officialCatalogIds = ["gen-open"];
  assert.ok(validatePackRightsLedger(crossing).some((problem) => /카탈로그 번호.*겹칩니다/u.test(problem)), "공식 번호가 다른 항목의 생성기 번호와 겹침");
  const reverse = validLedger();
  reverse.packs[1].catalogIds = [OFFICIAL.open];
  assert.ok(validatePackRightsLedger(reverse).some((problem) => /카탈로그 번호.*겹칩니다/u.test(problem)), "생성기 번호가 다른 항목의 공식 번호와 겹침");
  const sameEntry = validLedger();
  sameEntry.packs[0].officialCatalogIds = ["gen-open"];
  assert.deepEqual(validatePackRightsLedger(sameEntry), [], "한 항목 안에서 생성기 번호 = 공식 번호는 시드에도 있는 정상 형태");
});

test("조회 키가 같은 항목이 둘인 원장(검증기가 거부)에서 번호로 찾은 항목과 서빙 판정이 본 항목이 다르면 닫는다", () => {
  // A는 열려 있고 B는 hold인데 둘의 catalogIds가 같아 packRightsKey가 겹친다. B의 공식 번호로 찾으면 판정은 A(allow)를 볼 수 있다.
  const ledger = renderLedger();
  const open = ledger.packs[0];
  const impostor = structuredClone(ledger.packs[2]);
  impostor.catalogIds = [...open.catalogIds];
  impostor.officialCatalogIds = ["cbv1-999-impostor-official"];
  ledger.packs.push(impostor);
  assert.equal(findPackRightsByCatalogId(ledger, "cbv1-999-impostor-official"), impostor);
  const planned = planRenderSlot(ledger, renderSlot("open", { derivedFromPack: "cbv1-999-impostor-official" }));
  assert.equal(planned.deliverable, false);
  assert.deepEqual(codes(planned).sort(), ["pack-unmapped", "rights-hold"]);
});

test("빈 문자열 번호를 가진 원장 항목(검증기가 거부)도 빈 값 조회로는 찾히지 않는다", () => {
  const ledger = renderLedger();
  ledger.packs[0].officialCatalogIds = [""];
  assert.equal(findPackRightsByCatalogId(ledger, ""), null);
});

test("hold로 되돌렸지만 grant가 남은 항목은 투영이 던지고, 그런 팩의 완성 슬롯은 블록을 받지 못한다", () => {
  const ledger = renderLedger();
  const entry = ledger.packs.find((candidate) => candidate.id === "gen-hold");
  entry.grant = { status: "licensed", licenseName: "Leftover grant", commercialUse: true, attributionRequired: false };
  assert.throws(() => packRightsProjection(entry), /allow가 아닙니다/u);
  const planned = planRenderSlot(ledger, renderSlot("hold"));
  assert.equal(planned.deliverable, false);
  assert.equal(planned.expected, null);
  assert.deepEqual(codes(planned), ["rights-hold"]);
});

test("전달 가능한 권리는 상업 이용이 가능하고 귀속 표기가 필요 없는 투영뿐이다", () => {
  assert.equal(renderRightsDeliverable({ commercialUse: true, attributionRequired: false }), true);
  for (const rights of [
    { commercialUse: false, attributionRequired: false },
    { commercialUse: true, attributionRequired: true },
    { commercialUse: "true", attributionRequired: false },
    { commercialUse: true, attributionRequired: "false" },
    { commercialUse: true },
    { attributionRequired: false },
    {}, null, undefined, "allow", [],
  ]) {
    assert.equal(renderRightsDeliverable(rights), false, JSON.stringify(rights));
  }
});

/* ── 슬롯 판정 표 ────────────────────────────────────────────────────────────────────────── */

const RIGHTS_OPEN = Object.freeze({
  ledgerPackId: "gen-open",
  serve: "allow",
  status: "licensed",
  licenseName: "Creator Bundle: Volume 1 — fixture license",
  commercialUse: true,
  attributionRequired: false,
});

test("열린 팩의 완성 슬롯은 전달 대상이고 원장 투영에 ledgerPackId를 더한 블록을 싣는다", () => {
  const ledger = renderLedger();
  const planned = planRenderSlot(ledger, completeSlot("open"));
  assert.equal(planned.deliverable, true);
  assert.deepEqual(codes(planned), ["rights-missing"]);
  assert.deepEqual(planned.expected, RIGHTS_OPEN);
  assert.deepEqual(planned.expected, { ledgerPackId: planned.entry.id, ...packRightsProjection(planned.entry) });
  assert.deepEqual(Object.keys(planned.expected).sort(), [...RENDER_RIGHTS_KEYS].sort());
  assert.deepEqual(planned.stamped.rights, RIGHTS_OPEN);
  const stamped = planRenderSlot(ledger, planned.stamped);
  assert.deepEqual(stamped.problems, []);
  assert.deepEqual(stamped.stamped, planned.stamped, "스탬프는 멱등이다");
});

test("열린 군중 팩(crowd 묶음)도 전달 대상이다", () => {
  const planned = planRenderSlot(renderLedger(), completeSlot("crowd"));
  assert.equal(planned.deliverable, true);
  assert.equal(planned.expected.ledgerPackId, "gen-crowd");
});

test("hold·증빙 없는 allow·pending 묶음 allow·비상업 grant 팩의 완성 슬롯은 전달되지 않고 오류로 남는다", () => {
  const ledger = renderLedger();
  for (const key of ["hold", "bare", "pending", "noncommercial"]) {
    const planned = planRenderSlot(ledger, completeSlot(key));
    assert.equal(planned.deliverable, false, key);
    assert.deepEqual(codes(planned), ["rights-hold"], key);
    assert.equal(planned.expected, null, key);
    assert.equal(Object.hasOwn(planned.stamped, "rights"), false, `${key}: 닫힌 슬롯에 블록을 싣지 않는다`);
  }
  assert.equal(planRenderSlot(ledger, completeSlot("bare")).decision.reason, "invalid-evidence");
  assert.equal(planRenderSlot(ledger, completeSlot("hold")).decision.reason, "hold");
  // 소유자가 왜 막혔는지 알 수 있어야 한다: 원장 판정 사유와 증빙 문제가 메시지에 실린다.
  const message = (key) => planRenderSlot(ledger, completeSlot(key)).problems.map((problem) => problem.message).join("\n");
  assert.match(message("hold"), /원장 판정 hold/u);
  assert.match(message("bare"), /원장 판정 invalid-evidence \(.*필수 증빙/u);
  assert.match(message("pending"), /원장 판정 invalid-evidence \(.*pending 묶음/u);
  assert.match(message("noncommercial"), /상업 이용 가능·귀속 표기 없음 조건/u);
  assert.match(planRenderSlot(ledger, completeSlot("open", { derivedFromPack: "cbv1-999-unregistered" })).problems.map((problem) => problem.message).join("\n"), /원장에 없는 팩/u);
});

test("닫힌 팩의 낡은 rights 블록을 달고 있는 완성 슬롯은 스탬프로 덮어 주지 않고 오류로 남긴다", () => {
  const planned = planRenderSlot(renderLedger(), completeSlot("hold", { rights: { ...RIGHTS_OPEN, ledgerPackId: "gen-hold" } }));
  assert.deepEqual(codes(planned), ["rights-hold"]);
  assert.equal(planned.deliverable, false);
  assert.ok(Object.hasOwn(planned.stamped, "rights"), "자동으로 지우지 않는다 — 사람이 슬롯을 초안으로 내린다");
});

test("원장에 없는 팩·derivedFromPack 누락·모호한 값은 pack-unmapped이고 hold로 닫힌다 (초안도 오류)", () => {
  const ledger = renderLedger();
  for (const derivedFromPack of ["cbv1-999-unregistered", "", undefined, null, 7, [OFFICIAL.open], { id: OFFICIAL.open }, OFFICIAL.open.toUpperCase(), ` ${OFFICIAL.open}`]) {
    const complete = planRenderSlot(ledger, completeSlot("open", { derivedFromPack }));
    assert.equal(complete.deliverable, false, JSON.stringify(derivedFromPack));
    assert.deepEqual(codes(complete).sort(), ["pack-unmapped", "rights-hold"], JSON.stringify(derivedFromPack));
    const draft = planRenderSlot(ledger, draftSlot("open", { derivedFromPack }));
    assert.deepEqual(codes(draft), ["pack-unmapped"], `${JSON.stringify(derivedFromPack)}: 초안도 오타를 잡는다`);
  }
});

test("초안 슬롯은 hold 팩이어도 정상이고 전달되지 않으며, 낡은 rights 블록은 오류이고 스탬프가 지운다", () => {
  const ledger = renderLedger();
  for (const key of ["open", "hold", "bare"]) {
    const planned = planRenderSlot(ledger, draftSlot(key));
    assert.deepEqual(planned.problems, [], key);
    assert.equal(planned.deliverable, false, key);
    assert.equal(planned.expected, null, key);
  }
  const stale = planRenderSlot(ledger, draftSlot("open", { rights: RIGHTS_OPEN }));
  assert.deepEqual(codes(stale), ["rights-stale"]);
  assert.equal(Object.hasOwn(stale.stamped, "rights"), false);
});

test("rights 블록이 원장 투영과 다르면 rights-drift다 (이름·키·값·팩 id·형식 전부)", () => {
  const ledger = renderLedger();
  const tampers = [
    { ...RIGHTS_OPEN, licenseName: "Edited name" },
    { ...RIGHTS_OPEN, ledgerPackId: "gen-hold" },
    { ...RIGHTS_OPEN, status: "public-domain" },
    { ...RIGHTS_OPEN, commercialUse: "true" },
    { ...RIGHTS_OPEN, attributionRequired: 0 },
    { ...RIGHTS_OPEN, serve: "hold" },
    { ...RIGHTS_OPEN, extra: true },
    { ...RIGHTS_OPEN, inheritedFrom: "x" },
    { serve: "allow" },
    "allow",
    [],
    null,
  ];
  for (const rights of tampers) {
    assert.deepEqual(codes(planRenderSlot(ledger, completeSlot("open", { rights }))), ["rights-drift"], JSON.stringify(rights));
  }
});

test("매니페스트가 자체 선언한 license.provider가 원장 제작사와 다르면 provider-mismatch다", () => {
  const ledger = renderLedger();
  const wrong = completeSlot("open", { license: { ...completeSlot("open").license, provider: "RG Poly" }, rights: RIGHTS_OPEN });
  assert.deepEqual(codes(planRenderSlot(ledger, wrong)), ["provider-mismatch"]);
  assert.deepEqual(codes(planRenderSlot(ledger, draftSlot("hold", { license: undefined }))), ["provider-mismatch"]);
});

test("path·previewPath는 자기 슬롯 폴더 바로 아래 이미지여야 한다 (다른 슬롯의 파일을 가리킬 수 없다)", () => {
  const ledger = renderLedger();
  const rights = RIGHTS_OPEN;
  for (const overrides of [
    { path: "assets/slot-hold-001/prop.webp" },
    { previewPath: "assets/slot-hold-001/thumbnail.webp" },
    { path: "assets/slot-open-001/nested/prop.webp" },
    { path: "assets/slot-open-001/prop.glb" },
    { path: "assets/slot-open-001/prop.png" },
    { path: "assets/slot-open-001/" },
    { path: "previews/slot-open-001/prop.webp" },
    { previewPath: 7 },
  ]) {
    assert.ok(codes(planRenderSlot(ledger, completeSlot("open", { rights, ...overrides }))).includes("slot-path"), JSON.stringify(overrides));
  }
});

test("미리보기(previewPath)는 png·jpg도 받지만 본 이미지(path)는 웹 로더처럼 webp만 받는다", () => {
  const ledger = renderLedger();
  for (const extension of ["webp", "png", "jpg"]) {
    const planned = planRenderSlot(ledger, draftSlot("open", { previewPath: `assets/slot-open-001/thumbnail.${extension}` }));
    assert.deepEqual(planned.problems, [], extension);
  }
  assert.deepEqual(codes(planRenderSlot(ledger, draftSlot("open", { previewPath: "assets/slot-open-001/thumbnail.gif" }))), ["slot-path"]);
});

test("슬롯이 객체가 아니거나 id가 없으면 slot-malformed이고 매니페스트 판정은 중복 id를 잡는다", () => {
  const ledger = renderLedger();
  for (const slot of [null, 7, "x", [], {}, { id: 7 }, { id: "" }, { id: "Slot-Upper-001" }, { id: "슬롯-001" }, { id: "slot_001" }, { id: "a".repeat(201) }]) {
    assert.deepEqual(codes(planRenderSlot(ledger, slot)), ["slot-malformed"], JSON.stringify(slot));
  }
  assert.deepEqual(planRenderSlot(ledger, draftSlot("open", { id: "a".repeat(200), path: `assets/${"a".repeat(200)}/prop.webp`, previewPath: `assets/${"a".repeat(200)}/thumbnail.webp` })).problems, [], "200자까지는 웹 로더와 같이 받는다");
  const planned = planRenderManifestRights(ledger, manifestOf([draftSlot("open"), draftSlot("open")]));
  assert.deepEqual(codes(planned), ["duplicate-slot-id"]);
  assert.deepEqual(codes(planRenderManifestRights(ledger, { assets: "x" })), ["manifest-malformed"]);
  assert.deepEqual(codes(planRenderManifestRights(ledger, null)), ["manifest-malformed"]);
});

test("초안 판정은 curationStatus가 draft로 시작할 때뿐이다 (웹 로더와 같은 규칙)", () => {
  assert.equal(isDraftRenderSlot({ curationStatus: "draft-pending-render" }), true);
  assert.equal(isDraftRenderSlot({ curationStatus: "draft" }), true);
  for (const curationStatus of ["Draft", " draft", "selected-after-visual-triage", "rejected", "", undefined, null, ["draft"], 1]) {
    assert.equal(isDraftRenderSlot({ curationStatus }), false, JSON.stringify(curationStatus));
  }
  assert.equal(isDraftRenderSlot(null), false);
});

/* ── 매니페스트 단위 판정·스탬프 ─────────────────────────────────────────────────────────── */

test("매니페스트 판정은 슬롯별 결과를 모으고, 스탬프는 멱등이며 직렬화 형식을 보존한다", () => {
  const ledger = renderLedger();
  const manifest = manifestOf([completeSlot("open"), draftSlot("hold", { rights: RIGHTS_OPEN }), draftSlot("bare"), completeSlot("crowd")]);
  const first = planRenderManifestRights(ledger, manifest);
  assert.deepEqual(first.summary, { total: 4, draft: 2, delivered: 2, closed: 0 });
  assert.deepEqual(codes(first).sort(), ["rights-missing", "rights-missing", "rights-stale"]);
  const second = planRenderManifestRights(ledger, first.stamped);
  assert.deepEqual(second.problems, []);
  assert.deepEqual(second.stamped, first.stamped);
  assert.deepEqual(first.stamped.assets.map((slot) => Object.hasOwn(slot, "rights")), [true, false, false, true]);
  const raw = serializeRenderManifest(first.stamped);
  assert.equal(serializeRenderManifest(JSON.parse(raw)), raw, "직렬화는 키 정렬 규칙 아래 왕복 동일하다");
  assert.equal(raw.endsWith("\n"), false);
  assertKeysSorted(JSON.parse(raw));
  const stampedKeys = Object.keys(JSON.parse(raw).assets[0]);
  assert.ok(stampedKeys.indexOf("rights") > stampedKeys.indexOf("renderResolution") && stampedKeys.indexOf("rights") < stampedKeys.indexOf("sha256"),
    "스탬프한 rights는 알파벳 위치에 들어간다 (끝에 붙지 않는다)");
});

test("커밋된 렌더 매니페스트는 커밋된 원장과 어긋나지 않는다 — 원장이 열지 않은 팩의 슬롯은 전부 초안이다", () => {
  const ledger = loadPackRightsLedger();
  const manifest = JSON.parse(readFileSync(COMMITTED_MANIFEST, "utf8"));
  const planned = planRenderManifestRights(ledger, manifest);
  assert.deepEqual(planned.problems, []);
  assert.equal(serializeRenderManifest(planned.stamped), readFileSync(COMMITTED_MANIFEST, "utf8"), "스탬프할 변경이 없다");
  assert.equal(planned.slots.length, manifest.assets.length);
  for (const slot of planned.slots) {
    assert.ok(slot.entry, `${slot.slotId}: 원장 항목으로 특정되지 않음`);
    // 시드 사실: 4개 슬롯은 모두 바이트 없는 초안이고 그 팩들은 전부 hold다. 첫 렌더를 올리는 변경(팩을 여는 것은 소유자 결정)이 이 단언을 같은 변경에서 갱신한다.
    assert.equal(slot.draft, true, slot.slotId);
    assert.equal(slot.deliverable, false, slot.slotId);
  }
  assert.deepEqual(planned.slots.map((slot) => slot.entry.id).sort(), [
    "cbv1-021-slavica-medieval-village",
    "cbv1-028-lumagrove-wonky-woods",
    "cbv1-042-restaurant-megapack",
    "cbv1-045-food-packaging",
  ]);
});

test("커밋된 공개 폴더에는 매니페스트 말고 서빙될 파일이 없다", () => {
  const planned = planRenderManifestRights(loadPackRightsLedger(), JSON.parse(readFileSync(COMMITTED_MANIFEST, "utf8")));
  const listing = listRenderPackFiles(resolve(REPO_ROOT, RENDER_PACK_DIR), { mode: "auto" });
  assert.deepEqual(listing.irregular, []);
  assert.deepEqual(findRenderFileProblems(planned.slots, listing.files), []);
  assert.ok(listing.files.includes(RENDER_MANIFEST_FILE));
});

/* ── 파일 점검 ──────────────────────────────────────────────────────────────────────────── */

test("전달 대상 슬롯이 가리키는 파일과 manifest.json만 허용하고 나머지는 고아 파일이다", () => {
  const ledger = renderLedger();
  const stamped = planRenderManifestRights(ledger, manifestOf([completeSlot("open"), completeSlot("hold"), draftSlot("open", { id: "slot-draft-001", path: "assets/slot-draft-001/prop.webp", previewPath: "assets/slot-draft-001/thumbnail.webp" })])).slots;
  const files = [
    RENDER_MANIFEST_FILE,
    "assets/slot-open-001/prop.webp",
    "assets/slot-open-001/thumbnail.webp",
    "assets/slot-hold-001/prop.webp",
    "assets/slot-draft-001/prop.webp",
    "assets/slot-open-001/extra.webp",
    ".gitkeep",
    "README.md",
  ];
  const orphans = findRenderFileProblems(stamped, files).map((problem) => problem.message.split("은(는)")[0]);
  assert.deepEqual(orphans.sort(), [".gitkeep", "README.md", "assets/slot-draft-001/prop.webp", "assets/slot-hold-001/prop.webp", "assets/slot-open-001/extra.webp"]);
  assert.deepEqual(findRenderFileProblems(stamped, [RENDER_MANIFEST_FILE, "assets/slot-open-001/prop.webp", "assets/slot-open-001/thumbnail.webp"]), []);
});

test("fs 나열은 숨김 파일과 하위 폴더를 포함하고 심볼릭 링크는 일반 파일이 아니라고 따로 돌려준다", () => {
  withTemp((root) => {
    mkdirSync(join(root, "assets/a/nested"), { recursive: true });
    writeFileSync(join(root, "manifest.json"), "{}");
    writeFileSync(join(root, ".hidden"), "x");
    writeFileSync(join(root, "assets/a/nested/p.webp"), "x");
    symlinkSync("manifest.json", join(root, "assets/link.webp"));
    const listing = listRenderPackFiles(root, { mode: "fs" });
    assert.deepEqual(listing.files, [".hidden", "assets/a/nested/p.webp", "manifest.json"]);
    assert.deepEqual(listing.irregular, ["assets/link.webp"]);
    assert.equal(listing.source, "fs");
  });
});

/** 격리된 임시 git 저장소(사용자 전역 설정·무시 규칙과 무관). 커밋 없이 인덱스만 쓴다. */
function withGitRepo(run) {
  return withTemp((root) => {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args) => execFileSync("git", ["-c", "core.symlinks=true", ...args], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    const pack = join(root, "pub", "pack");
    mkdirSync(join(pack, "assets/a"), { recursive: true });
    return run({ root, pack, git });
  });
}

test("git 나열은 추적 파일(스파스로 디스크에 없는 것 포함)과 추적 안 된 비무시 파일을 보고, 심볼릭 링크는 일반 파일이 아니라고 따로 돌려준다", () => {
  withGitRepo(({ root, pack, git }) => {
    writeFileSync(join(root, ".gitignore"), "**/__tmp*\n");
    writeFileSync(join(pack, "manifest.json"), "{}");
    writeFileSync(join(pack, "assets/a/prop.webp"), "x");
    writeFileSync(join(pack, "assets/a/sparse-only.webp"), "x");
    symlinkSync("manifest.json", join(pack, "link.webp"));
    git("add", "-A", ".");
    // 스파스 체크아웃을 흉내 낸다: 인덱스에는 있고 디스크에는 없다.
    git("update-index", "--skip-worktree", "pub/pack/assets/a/sparse-only.webp");
    unlinkSync(join(pack, "assets/a/sparse-only.webp"));
    writeFileSync(join(pack, "assets/a/untracked.webp"), "x");
    writeFileSync(join(pack, "__tmp-ignored.png"), "x");

    const viaGit = listRenderPackFiles(pack, { mode: "git" });
    assert.deepEqual(viaGit.files, ["assets/a/prop.webp", "assets/a/sparse-only.webp", "assets/a/untracked.webp", "manifest.json"]);
    assert.deepEqual(viaGit.irregular, ["link.webp"]);
    assert.equal(viaGit.source, "git");

    const viaAuto = listRenderPackFiles(pack, { mode: "auto" });
    assert.deepEqual(viaAuto.files, ["__tmp-ignored.png", "assets/a/prop.webp", "assets/a/sparse-only.webp", "assets/a/untracked.webp", "manifest.json"]);
    assert.deepEqual(viaAuto.irregular, ["link.webp"]);
    assert.equal(viaAuto.source, "git+fs");

    const viaFs = listRenderPackFiles(pack, { mode: "fs" });
    assert.deepEqual(viaFs.files, ["__tmp-ignored.png", "assets/a/prop.webp", "assets/a/untracked.webp", "manifest.json"]);
    assert.deepEqual(viaFs.irregular, ["link.webp"]);
  });
});

test("git 나열은 폴더가 스파스로 디스크에 아예 없어도 인덱스의 경로를 보고, 서브모듈 같은 특수 항목은 일반 파일이 아니다", () => {
  withGitRepo(({ root, pack, git }) => {
    writeFileSync(join(pack, "manifest.json"), "{}");
    writeFileSync(join(pack, "assets/a/prop.webp"), "x");
    git("add", "-A", ".");
    // 서브모듈(gitlink, 160000) 항목을 인덱스에 직접 넣는다.
    git("update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},pub/pack/vendored`);
    git("update-index", "--skip-worktree", "pub/pack/manifest.json", "pub/pack/assets/a/prop.webp");
    rmSync(pack, { recursive: true, force: true });
    const listing = listRenderPackFiles(pack, { mode: "auto" });
    assert.deepEqual(listing.files, ["assets/a/prop.webp", "manifest.json"]);
    assert.deepEqual(listing.irregular, ["vendored"]);
    assert.equal(listing.source, "git+fs");
    assert.throws(() => listRenderPackFiles(pack, { mode: "fs" }), /ENOENT/u);
    assert.ok(root);
  });
});

test("git 작업 트리 안에서 git이 실패하면 디스크 목록으로 조용히 내려가지 않고 던진다", () => {
  withGitRepo(({ root, pack }) => {
    writeFileSync(join(pack, "manifest.json"), "{}");
    writeFileSync(join(root, ".git", "index"), "this is not an index");
    for (const mode of ["git", "auto"]) {
      assert.throws(() => listRenderPackFiles(pack, { mode }), /index|Command failed/iu, mode);
    }
    assert.deepEqual(listRenderPackFiles(pack, { mode: "fs" }).files.includes("manifest.json"), true);
  });
});

test("git 나열은 git 작업 트리 밖이면 던지고, auto는 fs로 내려간다", () => {
  withTemp((root) => {
    writeFileSync(join(root, "manifest.json"), "{}");
    assert.throws(() => listRenderPackFiles(root, { mode: "git" }), /git/u);
    assert.deepEqual(listRenderPackFiles(root, { mode: "auto" }).files, ["manifest.json"]);
    assert.equal(listRenderPackFiles(root, { mode: "auto" }).source, "fs");
  });
});

/* ── CLI ────────────────────────────────────────────────────────────────────────────────── */

function withTemp(run) {
  const root = mkdtempSync(join(tmpdir(), "render-rights-test-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function setup(root, { slots, files = {}, ledger = validLedger() }) {
  const packDir = join(root, "pack");
  mkdirSync(packDir, { recursive: true });
  const ledgerPath = join(root, "ledger.json");
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  writeFileSync(join(packDir, RENDER_MANIFEST_FILE), serializeRenderManifest(manifestOf(slots)));
  for (const [relative, body] of Object.entries(files)) {
    mkdirSync(dirname(join(packDir, relative)), { recursive: true });
    writeFileSync(join(packDir, relative), body);
  }
  return { packDir, ledgerPath, manifestPath: join(packDir, RENDER_MANIFEST_FILE) };
}

const run = (setupResult, ...flags) => spawnSync(process.execPath, [
  SCRIPT, ...flags, "--pack-rights", setupResult.ledgerPath, "--pack-dir", setupResult.packDir, "--files", "fs",
], { encoding: "utf8" });

test("CLI --check는 커밋된 데이터에서 통과하고 아무것도 쓰지 않는다", () => {
  const before = readFileSync(COMMITTED_MANIFEST, "utf8");
  const result = spawnSync(process.execPath, [SCRIPT, "--check", "--files", "fs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /슬롯 4개 — 초안 4 · 전달 0 · 닫힘\(완성인데 미개방\) 0/u);
  assert.equal(readFileSync(COMMITTED_MANIFEST, "utf8"), before);
});

test("CLI --check는 닫힌 팩의 완성 슬롯과 블록 누락을 종료 코드 1로 막는다", () => {
  withTemp((root) => {
    const closed = setup(root, { slots: [completeSlot("hold")] });
    const result = run(closed, "--check");
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /\[rights-hold\] slot-hold-001/u);
    const missing = setup(join(root, "m"), { slots: [completeSlot("open")] });
    const missingResult = run(missing, "--check");
    assert.equal(missingResult.status, 1);
    assert.match(missingResult.stdout, /\[rights-missing\]/u);
  });
});

test("CLI --write는 열린 팩의 완성 슬롯에 블록을 싣고 낡은 블록을 지우며, 형식을 보존하고, 두 번째는 변경이 없다", () => {
  withTemp((root) => {
    const target = setup(root, {
      slots: [completeSlot("open"), draftSlot("hold", { rights: RIGHTS_OPEN }), draftSlot("noncommercial")],
      files: { "assets/slot-open-001/prop.webp": "x", "assets/slot-open-001/thumbnail.webp": "x" },
    });
    assert.equal(run(target, "--check").status, 1);
    const written = run(target, "--write");
    assert.equal(written.status, 0, written.stdout + written.stderr);
    assert.match(written.stdout, /스탬프했습니다/u);
    const raw = readFileSync(target.manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.assets.find((slot) => slot.id === "slot-open-001").rights, RIGHTS_OPEN);
    assert.equal(Object.hasOwn(parsed.assets.find((slot) => slot.id === "slot-hold-001"), "rights"), false);
    assert.equal(serializeRenderManifest(parsed), raw);
    assertKeysSorted(parsed);
    assert.equal(run(target, "--check").status, 0);
    const again = run(target, "--write");
    assert.equal(again.status, 0);
    assert.match(again.stdout, /스탬프할 변경이 없습니다/u);
    assert.equal(readFileSync(target.manifestPath, "utf8"), raw);
  });
});

test("CLI --write는 닫힌 완성 슬롯이 하나라도 있으면 아무것도 쓰지 않고 종료 코드 1이다", () => {
  withTemp((root) => {
    const target = setup(root, { slots: [completeSlot("open"), completeSlot("hold")] });
    const before = readFileSync(target.manifestPath, "utf8");
    const result = run(target, "--write");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[rights-hold\]/u);
    assert.equal(readFileSync(target.manifestPath, "utf8"), before);
  });
});

test("CLI는 닫힌 슬롯·초안의 이미지 파일과 참조 없는 파일, 심볼릭 링크를 막고 --write로도 풀리지 않는다", () => {
  withTemp((root) => {
    const orphan = setup(root, {
      slots: [draftSlot("open")],
      files: { "assets/slot-open-001/prop.webp": "x" },
    });
    const result = run(orphan, "--check");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[orphan-file\]/u);
    assert.equal(run(orphan, "--write").status, 1);
    const stray = setup(join(root, "b"), { slots: [], files: { ".gitkeep": "" } });
    assert.match(run(stray, "--check").stdout, /\[orphan-file\].*\.gitkeep/u);
    const linked = setup(join(root, "c"), { slots: [] });
    symlinkSync(linked.manifestPath, join(linked.packDir, "link.webp"));
    const linkedResult = run(linked, "--check");
    assert.equal(linkedResult.status, 1);
    assert.match(linkedResult.stdout, /\[irregular-file\]/u);
  });
});

test("CLI는 알 수 없는 옵션·잘못된 --files·읽을 수 없는 원장/매니페스트를 종료 코드 2로 닫는다", () => {
  withTemp((root) => {
    const target = setup(root, { slots: [] });
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--files", "ftp"], { encoding: "utf8" }).status, 2);
    writeFileSync(target.ledgerPath, JSON.stringify({ schema: "other" }));
    const badLedger = run(target, "--check");
    assert.equal(badLedger.status, 2);
    assert.match(badLedger.stderr, /권리 원장이 올바르지 않습니다/u);
    rmSync(target.manifestPath);
    writeFileSync(target.ledgerPath, JSON.stringify(validLedger()));
    const noManifest = run(target, "--check");
    assert.equal(noManifest.status, 2);
    assert.match(noManifest.stderr, /렌더 매니페스트를 읽을 수 없습니다/u);
  });
});

test("CLI는 pnpm run 형태의 맨 -- 를 건너뛴다", () => {
  withTemp((root) => {
    const target = setup(root, { slots: [draftSlot("hold")] });
    const result = spawnSync(process.execPath, [SCRIPT, "--", "--pack-rights", target.ledgerPath, "--pack-dir", target.packDir, "--files", "fs"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
