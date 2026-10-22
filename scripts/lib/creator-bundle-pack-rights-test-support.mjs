/**
 * 권리 원장 테스트 지원: 원장 픽스처 빌더와 최소 GLB 생성기.
 * creator-bundle-pack-rights.test.mjs, generate-creator-bundle-theme-packs.test.mjs,
 * plan-creator-bundle-deploy.test.mjs가 같은 픽스처 규칙을 쓰도록 한곳에 둔다.
 */
import assert from "node:assert/strict";

import {
  HOLD_PUBLIC_LABEL,
  loadPackRightsLedger,
  PACK_RIGHTS_SCHEMA,
  requiredEvidenceKinds,
  validatePackRightsLedger,
} from "./creator-bundle-pack-rights.mjs";

// 증빙 날짜는 미래일 수 없으므로 고정 날짜 대신 실행 시점의 오늘(UTC)을 쓴다 — 테스트가 시계에 묶이지 않게.
const VERIFIED_AT = new Date().toISOString().slice(0, 10);

/** 로컬 라이선스 증빙 픽스처(fixtureLicenseText)가 기록한 라이브러리 팩 이름. ledgerEntry의 기본 libraryPacks와 같다. */
export const FIXTURE_LIBRARY_PACK = "fixture";

/** 분류별 allow 요구를 정확히 채우는 증빙 한 건을 만든다. */
export function qualifyingEvidence(kind, overrides = {}) {
  switch (kind) {
    case "local-license-file":
      return {
        kind,
        sha256: "a".repeat(64),
        paths: ["fixture/License.txt"],
        verifiedAt: VERIFIED_AT,
        ...overrides,
      };
    case "itch-page-capture":
      return {
        kind,
        url: "https://fixture-creator.itch.io/fixture-pack",
        retrievedAt: VERIFIED_AT,
        ref: "owner-captures/fixture-pack.png",
        verifiedAt: VERIFIED_AT,
        ...overrides,
      };
    case "purchase-receipt":
      return { kind, ref: "owner-receipts/itch-bundle-3905.pdf", verifiedAt: VERIFIED_AT, ...overrides };
    case "producer-written-confirmation":
      return {
        kind,
        ref: "owner-mail/fixture-confirmation.eml",
        covers: ["web-service-hosting"],
        verifiedAt: VERIFIED_AT,
        ...overrides,
      };
    default:
      throw new Error(`테스트 증빙을 만들 수 없는 종류입니다: ${kind}`);
  }
}

/** 라이선스 문서 분류 픽스처(해시 aaaa…). */
export function fixtureLicenseText(overrides = {}) {
  return {
    sha256: "a".repeat(64),
    class: "rg-poly-cc0",
    heading: "fixture license",
    summary: "테스트용 라이선스 문서 분류",
    appShippingExplicit: false,
    modifiedCovered: false,
    webServiceHostingAddressed: false,
    files: [{ libraryPath: "fixture/License.txt", libraryPack: FIXTURE_LIBRARY_PACK }],
    ...overrides,
  };
}

/**
 * 원장 항목 한 개. serve: "hold"(기본) 또는 "allow".
 * allow이면 분류의 요구 증빙을 전부 채우고 grant를 붙인다 (requireAll=false로 일부만 채우는 부정 테스트도 가능).
 */
export function ledgerEntry({
  title,
  catalogIds = [],
  creator = "RG Poly",
  libraryPacks = [FIXTURE_LIBRARY_PACK],
  group = "pack",
  licenseClass = "unstated-rg-poly",
  serve = "hold",
  evidence,
  grant,
  holdReason = "evidence-incomplete",
} = {}) {
  const entry = {
    id: catalogIds.length > 0 ? catalogIds.join("+") : `fixture-${title}`,
    group,
    title,
    creator,
    catalogIds,
    officialCatalogIds: [],
    libraryPacks,
    licenseClass,
    serve,
    evidence: evidence
      ?? (serve === "allow"
        ? (requiredEvidenceKinds(licenseClass) ?? []).map((kind) => qualifyingEvidence(kind))
        : []),
  };
  if (serve === "allow") {
    entry.grant = grant ?? {
      status: "licensed",
      licenseName: "Creator Bundle: Volume 1 — fixture license",
      commercialUse: true,
      attributionRequired: false,
    };
  } else {
    entry.holdReason = holdReason;
    entry.holdLabel = HOLD_PUBLIC_LABEL;
  }
  return entry;
}

export function fixtureLedger(entries, licenseTexts = []) {
  return {
    schema: PACK_RIGHTS_SCHEMA,
    version: 1,
    defaultServe: "hold",
    licenseTexts,
    packs: entries,
  };
}

/** 최소 GLB: 헤더 + JSON 청크(+ 패딩) + BIN 청크 헤더만으로 판정에 충분하다. */
export function makeGlb(json) {
  const jsonText = JSON.stringify(json);
  const padded = jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4);
  const total = 12 + 8 + padded.length + 8;
  const buffer = Buffer.alloc(total);
  buffer.writeUInt32LE(0x46546c67, 0); // glTF
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(total, 8);
  buffer.writeUInt32LE(padded.length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16); // JSON
  buffer.write(padded, 20, "utf8");
  buffer.writeUInt32LE(0, 20 + padded.length);
  buffer.writeUInt32LE(0x004e4942, 24 + padded.length); // BIN\0
  return buffer;
}

/** 외부 uri 없이 자기완결인 GLB. label이 달라지면 바이트(해시)도 달라진다. */
export function selfContainedGlb(label = "base") {
  return makeGlb({
    asset: { version: "2.0", generator: `fixture-${label}` },
    buffers: [{ byteLength: 0 }],
    images: [{ bufferView: 0, mimeType: "image/png" }],
  });
}

/* ── 커밋된 원장을 복사해 다루는 테스트 도우미 ─────────────────────────────────────────────── */

export const cloneLedger = () => structuredClone(loadPackRightsLedger());

export function entryOf(ledger, title) {
  const entry = ledger.packs.find((candidate) => candidate.title === title);
  assert.ok(entry, `원장에 ${title}가 없습니다.`);
  return entry;
}

/** 팩을 allow로 바꾼다. evidence를 넘기면 그 증빙으로 교체하고, 아니면 기존 증빙을 그대로 둔다. */
export function flipToAllow(entry, { evidence } = {}) {
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

export const problemsFor = (ledger) => validatePackRightsLedger(ledger);

/** 소유자가 allow 요구를 채우는 증빙 종류. 이 종류들은 소유자가 원장에 넣는 값이라 테스트 기준선에서 비운다. */
const OWNER_PROVIDED_EVIDENCE_KINDS = Object.freeze(["itch-page-capture", "purchase-receipt", "producer-written-confirmation"]);

/**
 * 커밋된 원장에서 꺼낸 팩 항목을 "아직 열리지 않은 시드 상태"로 되돌린다: hold로 두고 grant와 소유자 제공 증빙을
 * 지우며, 라이브러리 실물 증빙(local-license-file)과 2차 조회 기록은 그대로 둔다. 소유자가 나중에 그 팩에 증빙을
 * 넣거나 열더라도 이 항목을 기준선으로 쓰는 부정 테스트가 시드 상태에 묶이지 않게 한다.
 */
export function resetToHold(entry) {
  entry.serve = "hold";
  entry.holdReason ??= "evidence-incomplete";
  entry.holdLabel ??= HOLD_PUBLIC_LABEL;
  delete entry.grant;
  entry.evidence = entry.evidence.filter((item) => !OWNER_PROVIDED_EVIDENCE_KINDS.includes(item.kind));
  return entry;
}
