/** 기존 Node/Vitest gate 파일에서 등록해 양쪽 정식 실행 경로에 포함하는 소유자 확인 회귀다. */
import assert from "node:assert/strict";

import {
  ALLOW_EVIDENCE_REQUIREMENTS,
  evaluateServeDecision,
  missingEvidenceKinds,
  OWNER_COMMERCIAL_USE_CONFIRMED_AT,
  OWNER_COMMERCIAL_USE_DECISION_REF,
  OWNER_COMMERCIAL_USE_EVIDENCE_KIND,
  OWNER_COMMERCIAL_USE_LICENSE_NAME,
  OWNER_COMMERCIAL_USE_SCOPE,
  packRightsProjection,
  validatePackRightsLedger,
} from "./creator-bundle-pack-rights.mjs";
import { FIXTURE_LIBRARY_PACK, fixtureLedger, fixtureLicenseText, ledgerEntry, qualifyingEvidence } from "./creator-bundle-pack-rights-test-support.mjs";

const NOW = new Date("2026-10-29T12:00:00Z");
const PURCHASE_REF = "local-private:itch-purchase-library-observation-20261028";
function ownerFixture() {
  const entry = ledgerEntry({ title: "소유자 확인 프로젝트 fixture", catalogIds: ["cbv1-910-owner-project"],
    creator: "EmaceArt", libraryPacks: [FIXTURE_LIBRARY_PACK], licenseClass: "emaceart-local-license", serve: "allow",
    grant: { status: "licensed", licenseName: OWNER_COMMERCIAL_USE_LICENSE_NAME, commercialUse: true, attributionRequired: false },
    evidence: [qualifyingEvidence("local-license-file", { verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT }),
      qualifyingEvidence("purchase-receipt", { ref: PURCHASE_REF, verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT })],
  });
  const owner = { kind: OWNER_COMMERCIAL_USE_EVIDENCE_KIND, packId: entry.id, scope: OWNER_COMMERCIAL_USE_SCOPE,
    purchaseRef: PURCHASE_REF, decisionRef: OWNER_COMMERCIAL_USE_DECISION_REF,
    confirmedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT, verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT };
  entry.evidence.push(owner);
  const text = fixtureLicenseText({ class: "emaceart-app-shipping-explicit" });
  return { entry, owner, ledger: fixtureLedger([entry], [text]) };
}
function assertOwnerClosed({ ledger, entry }, pattern) {
  const problems = validatePackRightsLedger(ledger, { now: NOW });
  assert.ok(problems.length > 0, "소유자 확인의 잘못된 증빙을 원장이 허용했습니다.");
  if (pattern) assert.ok(problems.some((problem) => pattern.test(problem)), problems.join("\n"));
  assert.equal(evaluateServeDecision(ledger, entry, { now: NOW }).serve, false);
}

export function registerOwnerCommercialUseTests(test) {
  test("소유자 프로젝트 확인은 기존 producer 요구표를 바꾸지 않는 별도 licensed 경로다", () => {
    const { ledger, entry, owner } = ownerFixture();
    const originalTexts = JSON.stringify(ledger.licenseTexts), originalClass = entry.licenseClass;
    assert.deepEqual(ALLOW_EVIDENCE_REQUIREMENTS[entry.licenseClass], ["purchase-receipt", "producer-written-confirmation"]);
    assert.ok(!entry.evidence.some((item) => item.kind === "producer-written-confirmation"));
    assert.deepEqual(validatePackRightsLedger(ledger, { now: NOW }), []);
    assert.equal(evaluateServeDecision(ledger, entry, { group: "pack", now: NOW }).serve, true);
    assert.deepEqual(missingEvidenceKinds(ledger, entry, { now: NOW }), []);
    assert.deepEqual(packRightsProjection(entry), { serve: "allow", status: "licensed", licenseName: OWNER_COMMERCIAL_USE_LICENSE_NAME,
      commercialUse: true, attributionRequired: false });
    assert.equal(owner.scope, "toonstudio-in-service-commercial-project-use");
    assert.equal(entry.licenseClass, originalClass); assert.equal(JSON.stringify(ledger.licenseTexts), originalTexts);
  });

  test("소유자 확인은 정확한 팩·범위·결정 문서·날짜를 모두 결합해야 한다", () => {
    const mutations = [
      (owner) => { owner.packId = "cbv1-911-different-pack"; },
      (owner) => { delete owner.packId; },
      (owner) => { owner.scope = "unrestricted-asset-resale"; },
      (owner) => { owner.decisionRef = "docs/studio/other-owner-decision.md"; },
      (owner) => { owner.confirmedAt = "2026-10-28"; },
      (owner) => { owner.verifiedAt = "2026-10-28"; },
      (owner) => { owner.verifiedAt = "2999-10-29"; },
      (owner) => { owner.verifiedAt = "2026-02-31"; },
      (owner) => { delete owner.confirmedAt; },
    ];
    for (const mutate of mutations) {
      const fixture = ownerFixture(); mutate(fixture.owner); assertOwnerClosed(fixture);
    }
    const early = ownerFixture();
    assert.ok(validatePackRightsLedger(early.ledger, { now: new Date("2026-10-27T00:00:00Z") }).length > 0);
    assert.equal(evaluateServeDecision(early.ledger, early.entry, { now: new Date("2026-10-27T00:00:00Z") }).serve, false);
  });

  test("구매 ref는 같은 팩의 유효 purchase-receipt와 결합해야 하고 다른 팩 영수증은 대신하지 못한다", () => {
    const absent = ownerFixture(); absent.entry.evidence = absent.entry.evidence.filter((item) => item.kind !== "purchase-receipt");
    absent.ledger.packs.push(ledgerEntry({ title: "다른 구매 팩", catalogIds: ["cbv1-911-other"],
      evidence: [qualifyingEvidence("purchase-receipt", { ref: PURCHASE_REF, verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT })] }));
    assertOwnerClosed(absent, /같은 팩/u);
    for (const purchaseRef of ["", "TBD.pdf", "local-private:different-purchase-observation"]) {
      const fixture = ownerFixture(); fixture.owner.purchaseRef = purchaseRef; assertOwnerClosed(fixture, /purchaseRef/u);
    }
    const badDate = ownerFixture();
    badDate.entry.evidence.find((item) => item.kind === "purchase-receipt").verifiedAt = "2999-01-01";
    assertOwnerClosed(badDate, /purchase-receipt/u);
  });

  test("과거 secondary 주장·구매 사실만으로 새 소유자 경로를 만들거나 producer 확인으로 위장하지 않는다", () => {
    for (const kind of ["secondary-lookup", "producer-written-confirmation"]) {
      const fixture = ownerFixture();
      fixture.owner.kind = kind;
      fixture.owner.claim = "상업적 프로젝트 사용 가능"; fixture.owner.source = "기존 구매 자료 대조";
      assertOwnerClosed(fixture);
    }
    const purchaseOnly = ownerFixture();
    purchaseOnly.entry.evidence = purchaseOnly.entry.evidence.filter((item) => item.kind !== OWNER_COMMERCIAL_USE_EVIDENCE_KIND);
    assertOwnerClosed(purchaseOnly, /producer-written-confirmation/u);
  });

  test("소유자 확인을 CC0·비상업·원본 다운로드·재배포 허가로 승격하면 서빙과 projection 모두 거부한다", () => {
    const mutations = [
      (grant) => { grant.status = "public-domain"; },
      (grant) => { grant.licenseName = "CC0-1.0"; },
      (grant) => { grant.licenseName = "제작사 서면 허가"; },
      (grant) => { grant.commercialUse = false; },
      (grant) => { grant.downloadable = true; },
      (grant) => { grant.redistributionAllowed = true; },
      (grant) => { grant.inServiceOnly = false; },
    ];
    for (const mutate of mutations) {
      const fixture = ownerFixture(); mutate(fixture.entry.grant); assertOwnerClosed(fixture, /소유자 상업 이용 확인/u);
      assert.throws(() => packRightsProjection(fixture.entry), TypeError);
    }
  });

  test("기록되지 않은 팩·알 수 없는 분류·pending·명시 hold는 소유자 문구가 있어도 열리지 않는다", () => {
    const unknown = ownerFixture(); unknown.entry.licenseClass = "unrecorded-license"; assertOwnerClosed(unknown, /분류/u);
    const pending = ownerFixture(); pending.entry.group = "pending"; assertOwnerClosed(pending, /pending/u);
    const group = ownerFixture(); group.entry.group = "utility"; assertOwnerClosed(group, /group/u);
    const missing = ownerFixture();
    const def = { ...missing.entry, catalogIds: ["cbv1-999-unrecorded"] };
    assert.equal(evaluateServeDecision(missing.ledger, def, { now: NOW }).reason, "missing-entry");
    missing.entry.serve = "hold";
    assert.equal(evaluateServeDecision(missing.ledger, missing.entry, { now: NOW }).reason, "hold");
    const technical = ownerFixture();
    technical.entry.group = "pending"; technical.entry.serve = "hold";
    technical.entry.holdReason = "technical-ingestion-pending"; technical.entry.holdLabel = "원본 형식의 기술 편입 대기";
    delete technical.entry.grant;
    assert.deepEqual(validatePackRightsLedger(technical.ledger, { now: NOW }), []);
    assert.deepEqual(missingEvidenceKinds(technical.ledger, technical.entry, { now: NOW }), []);
    assert.equal(evaluateServeDecision(technical.ledger, technical.entry, { now: NOW }).reason, "hold");
  });

  test("기존 CC0 실물 증빙 경로는 public-domain과 원래 projection을 그대로 보존한다", () => {
    const entry = ledgerEntry({ title: "기존 CC0 fixture", catalogIds: ["cbv1-912-cc0"], libraryPacks: [FIXTURE_LIBRARY_PACK],
      licenseClass: "cc0-explicit", serve: "allow", grant: { status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false },
      evidence: [qualifyingEvidence("local-license-file", { verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT })] });
    const ledger = fixtureLedger([entry], [fixtureLicenseText()]);
    assert.deepEqual(validatePackRightsLedger(ledger, { now: NOW }), []);
    assert.equal(evaluateServeDecision(ledger, entry, { now: NOW }).serve, true);
    assert.deepEqual(packRightsProjection(entry), { serve: "allow", status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false });
    assert.deepEqual(ALLOW_EVIDENCE_REQUIREMENTS["cc0-explicit"], ["local-license-file"]);
  });

  test("원문의 필수 attribution은 소유자 경로에서도 보존하고 false 기본 projection은 바꾸지 않는다", () => {
    const { ledger, entry } = ownerFixture();
    assert.equal(Object.hasOwn(packRightsProjection(entry), "attribution"), false);
    entry.grant.attributionRequired = true; entry.grant.attribution = "합성 fixture 제작자 · 원문 출처 표기";
    assert.deepEqual(validatePackRightsLedger(ledger, { now: NOW }), []);
    assert.equal(evaluateServeDecision(ledger, entry, { now: NOW }).serve, true);
    assert.equal(packRightsProjection(entry).attributionRequired, true);
    assert.equal(packRightsProjection(entry).attribution, entry.grant.attribution);
    entry.grant.attributionRequired = false;
    assert.equal(packRightsProjection(entry).attribution, entry.grant.attribution);
  });

  test("필수 출처 문구가 없거나 웹 계약이 버리는 문구면 소유자 경로와 projection을 닫는다", () => {
    for (const attribution of [undefined, null, "", "   ", "x".repeat(161), "출처\n줄바꿈", "\u200b", "출처  두칸", "https://creator.itch.io/pack", "access token fixture"]) {
      const fixture = ownerFixture(); fixture.entry.grant.attributionRequired = true; fixture.entry.grant.attribution = attribution;
      assertOwnerClosed(fixture, /grant\.attribution/u);
      assert.throws(() => packRightsProjection(fixture.entry), TypeError);
    }
  });

  test("기존 제작사 증빙 경로도 출처 문구가 있으면 필수 credit을 지우지 않고 지원한다", () => {
    const { ledger, entry } = ownerFixture();
    entry.evidence = entry.evidence.filter((item) => item.kind !== OWNER_COMMERCIAL_USE_EVIDENCE_KIND);
    entry.evidence.push(qualifyingEvidence("producer-written-confirmation", { verifiedAt: OWNER_COMMERCIAL_USE_CONFIRMED_AT }));
    entry.grant.licenseName = "원문 라이선스 · 합성 검증 fixture";
    entry.grant.attributionRequired = true; entry.grant.attribution = "합성 fixture 원작자";
    assert.deepEqual(validatePackRightsLedger(ledger, { now: NOW }), []);
    assert.equal(evaluateServeDecision(ledger, entry, { now: NOW }).serve, true);
    assert.equal(packRightsProjection(entry).attribution, "합성 fixture 원작자");
  });
}
