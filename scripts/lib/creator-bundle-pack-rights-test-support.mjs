/**
 * 권리 원장 테스트 지원: 원장 픽스처 빌더와 최소 GLB 생성기.
 * creator-bundle-pack-rights.test.mjs, generate-creator-bundle-theme-packs.test.mjs,
 * plan-creator-bundle-deploy.test.mjs가 같은 픽스처 규칙을 쓰도록 한곳에 둔다.
 */
import { PACK_RIGHTS_SCHEMA, requiredEvidenceKinds } from "./creator-bundle-pack-rights.mjs";

const VERIFIED_AT = "2026-10-22";

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
    files: [{ libraryPath: "fixture/License.txt", libraryPack: "fixture" }],
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
    entry.holdLabel = "라이선스 증빙 확인이 끝나면 공개한다.";
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
