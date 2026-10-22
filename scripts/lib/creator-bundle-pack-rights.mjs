/**
 * creator-bundle-pack-rights.mjs
 *
 * Creator Bundle(itch.io, EmaceArt · RG Poly) 팩별 권리 원장
 * (`config/creator-bundle-pack-rights.json`)의 스키마 검증·조회·allow 증빙 게이트.
 *
 * 원칙 — fail-closed:
 *   - 서빙 판정은 원장 한 줄(`serve: "hold" | "allow"`)이다. 기본값은 hold다.
 *   - 원장에 없는 팩, 증빙이 모자란 allow, 잘못된 원장은 전부 hold(또는 오류)로 닫힌다.
 *   - allow는 `ALLOW_EVIDENCE_REQUIREMENTS`가 라이선스 분류별로 요구하는 증빙 종류를
 *     전부 갖춘 팩만 가능하다. 2차 조회 기록(`secondary-lookup`)은 어떤 요구도 채우지 못한다.
 *   - 이 모듈은 어떤 팩을 열지 정하지 않는다. 증빙 제출·서면 확인·최종 개방은 소유자 결정이다.
 *
 * 소비자: 생성기(generate-creator-bundle-theme-packs.mjs), 배포 플래너
 * (plan-creator-bundle-deploy.mjs), 검증 CLI(verify-creator-bundle-pack-rights.mjs), 완전성 테스트.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

export const PACK_RIGHTS_SCHEMA = "toonstudio.creator-bundle-pack-rights.v1";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_PACK_RIGHTS_PATH = resolve(REPO_ROOT, "config/creator-bundle-pack-rights.json");

/** 원장 팩이 속한 묶음. 생성기의 CATALOG_PACKS / CROWD_PACKS / PENDING_PACKS와 1:1이다. */
export const PACK_GROUPS = Object.freeze(["pack", "crowd", "pending"]);
export const SERVE_STATES = Object.freeze(["hold", "allow"]);

/**
 * 팩 단위 라이선스 분류. allow에 필요한 증빙이 분류마다 다르다.
 * - cc0-explicit: 팩 안 라이선스 문서가 CC0를 명시한다.
 * - cc0-text-copied: CC0 문구가 있으나 다른 팩 이름이 적힌 복사본이다(귀속 재확인 필요).
 * - cc0-with-standalone-ban: CC0 표기와 "독립 항목으로 내려받게 하는 것 금지"가 함께 있어 자기모순이다.
 * - proprietary-rg-poly: CC0가 아닌 RG Poly 독자 라이선스(공개 게시·재배포 금지)다.
 * - unstated-rg-poly / unstated-emaceart: 번들 안에 라이선스 문구가 없다.
 * - emaceart-local-license: EmaceArt 라이선스 문서가 팩 안에 있다(웹 서비스 호스팅은 어느 변형도 다루지 않는다).
 */
export const LICENSE_CLASSES = Object.freeze([
  "cc0-explicit",
  "cc0-text-copied",
  "cc0-with-standalone-ban",
  "proprietary-rg-poly",
  "unstated-rg-poly",
  "emaceart-local-license",
  "unstated-emaceart",
]);

/** 라이선스 문서(해시) 단위 분류. 팩 분류의 근거가 된다. */
export const LICENSE_TEXT_CLASSES = Object.freeze([
  "rg-poly-cc0",
  "rg-poly-cc0-standalone-ban",
  "rg-poly-proprietary",
  "emaceart-app-shipping-explicit",
  "emaceart-standalone-ban-soft",
  "emaceart-redistribution-prohibited",
  "emaceart-no-redistribution-even-modified",
]);

/** 팩 분류가 로컬 라이선스 문서를 요구할 때 받아들이는 문서 분류. */
const COMPATIBLE_TEXT_CLASSES = Object.freeze({
  "cc0-explicit": ["rg-poly-cc0"],
  "cc0-text-copied": ["rg-poly-cc0"],
  "cc0-with-standalone-ban": ["rg-poly-cc0-standalone-ban"],
  "proprietary-rg-poly": ["rg-poly-proprietary"],
  "emaceart-local-license": [
    "emaceart-app-shipping-explicit",
    "emaceart-standalone-ban-soft",
    "emaceart-redistribution-prohibited",
    "emaceart-no-redistribution-even-modified",
  ],
});

export const EVIDENCE_KINDS = Object.freeze([
  "local-license-file",
  "itch-page-capture",
  "purchase-receipt",
  "producer-written-confirmation",
  "secondary-lookup",
]);

/** 기록은 남기지만 allow 요구를 채우지 못하는 증빙 종류. */
export const NON_QUALIFYING_EVIDENCE_KINDS = Object.freeze(["secondary-lookup"]);

/**
 * 분류별 allow 요구 증빙(전부 필요). 근거: 2026-10-22 3D 에셋 활용 검토 §3 결론 (3).
 * - 웹 서비스 호스팅·하위 사용자는 EmaceArt 어느 변형도 다루지 않으므로 서면 확인이 필요하다.
 * - 이 표를 약화하는 변경은 코드 변경이라 리뷰와 테스트 갱신을 거친다.
 */
export const ALLOW_EVIDENCE_REQUIREMENTS = Object.freeze({
  "cc0-explicit": Object.freeze(["local-license-file"]),
  "cc0-text-copied": Object.freeze(["itch-page-capture"]),
  "cc0-with-standalone-ban": Object.freeze(["producer-written-confirmation"]),
  "proprietary-rg-poly": Object.freeze(["producer-written-confirmation"]),
  "unstated-rg-poly": Object.freeze(["itch-page-capture", "purchase-receipt"]),
  "emaceart-local-license": Object.freeze(["purchase-receipt", "producer-written-confirmation"]),
  "unstated-emaceart": Object.freeze([
    "itch-page-capture",
    "purchase-receipt",
    "producer-written-confirmation",
  ]),
});

/** 제작사 서면 확인이 인정되려면 웹 서비스 안 서빙을 명시적으로 다뤄야 한다. */
export const WEB_SERVICE_COVERAGE = "web-service-hosting";

export const RIGHTS_HOLD_REASON = "rights-hold";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CREATORS = Object.freeze(["EmaceArt", "RG Poly"]);
const GRANT_STATUSES = Object.freeze(["licensed", "public-domain"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value, maximum = 600) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * 팩 식별 키. 카탈로그 번호가 있으면 번호들을 정렬해 잇고, 없으면 제목으로 식별한다
 * (카탈로그 번호가 없는 RG Poly "Food Pack"만 해당).
 */
export function packRightsKey(def) {
  const ids = Array.isArray(def?.catalogIds) ? [...def.catalogIds].sort() : [];
  return ids.length > 0 ? ids.join("+") : `title:${def?.title ?? ""}`;
}

/** 원장 팩 하나의 allow 필수 증빙 종류. 분류가 알려지지 않았으면 null(어떤 증빙으로도 allow 불가). */
export function requiredEvidenceKinds(licenseClass) {
  return Object.hasOwn(ALLOW_EVIDENCE_REQUIREMENTS, licenseClass)
    ? ALLOW_EVIDENCE_REQUIREMENTS[licenseClass]
    : null;
}

function licenseTextByHash(ledger) {
  return new Map((Array.isArray(ledger?.licenseTexts) ? ledger.licenseTexts : [])
    .filter((text) => isRecord(text) && typeof text.sha256 === "string")
    .map((text) => [text.sha256, text]));
}

/** 증빙 한 건이 자기 종류의 필수 필드를 갖췄는지 점검한다. 문제 문장 배열을 돌려준다. */
function evidenceProblems(evidence, entry, textsByHash) {
  if (!isRecord(evidence)) return ["증빙 항목이 객체가 아닙니다."];
  if (!EVIDENCE_KINDS.includes(evidence.kind)) return [`알 수 없는 증빙 종류입니다: ${String(evidence.kind)}`];
  const problems = [];
  const where = `증빙 ${evidence.kind}`;
  if (NON_QUALIFYING_EVIDENCE_KINDS.includes(evidence.kind)) {
    if (!nonEmptyText(evidence.claim)) problems.push(`${where}: claim(주장 요약)이 비어 있습니다.`);
    if (!nonEmptyText(evidence.source)) problems.push(`${where}: source(출처)가 비어 있습니다.`);
    return problems;
  }
  if (!isIsoDate(evidence.verifiedAt)) problems.push(`${where}: verifiedAt(YYYY-MM-DD)이 없거나 형식이 틀립니다.`);
  switch (evidence.kind) {
    case "local-license-file": {
      if (!SHA256_HEX.test(evidence.sha256 ?? "")) {
        problems.push(`${where}: sha256이 64자리 소문자 16진수가 아닙니다.`);
        break;
      }
      const text = textsByHash.get(evidence.sha256);
      if (!text) {
        problems.push(`${where}: licenseTexts에 분류되지 않은 해시입니다 (${evidence.sha256.slice(0, 12)}).`);
        break;
      }
      if (!Array.isArray(evidence.paths) || evidence.paths.length === 0
        || evidence.paths.some((path) => !nonEmptyText(path, 400))) {
        problems.push(`${where}: paths(라이브러리 상대 경로)가 비어 있습니다.`);
      }
      const compatible = COMPATIBLE_TEXT_CLASSES[entry.licenseClass];
      if (compatible && !compatible.includes(text.class)) {
        problems.push(`${where}: 문서 분류 ${text.class}는 팩 분류 ${entry.licenseClass}와 맞지 않습니다.`);
      }
      break;
    }
    case "itch-page-capture":
      if (!/^https:\/\/[a-z0-9.-]*itch\.io\//iu.test(evidence.url ?? "")) {
        problems.push(`${where}: url이 itch.io 팩 페이지 주소가 아닙니다.`);
      }
      if (!isIsoDate(evidence.retrievedAt)) problems.push(`${where}: retrievedAt(조회일)이 없거나 형식이 틀립니다.`);
      if (!nonEmptyText(evidence.ref)) problems.push(`${where}: ref(캡처 보관 위치)가 비어 있습니다.`);
      break;
    case "purchase-receipt":
      if (!nonEmptyText(evidence.ref)) problems.push(`${where}: ref(영수증·약관 보관 위치)가 비어 있습니다.`);
      break;
    case "producer-written-confirmation":
      if (!nonEmptyText(evidence.ref)) problems.push(`${where}: ref(서면 확인 보관 위치)가 비어 있습니다.`);
      if (!Array.isArray(evidence.covers) || !evidence.covers.includes(WEB_SERVICE_COVERAGE)) {
        problems.push(`${where}: covers에 ${WEB_SERVICE_COVERAGE}가 없어 웹 서비스 서빙 확인으로 인정되지 않습니다.`);
      }
      break;
    default:
      break;
  }
  return problems;
}

/**
 * 팩 하나의 allow 자격 점검. 문제 문장 배열(빈 배열이면 자격 충족)을 돌려준다.
 * 검증기와 서빙 판정이 같은 함수를 쓴다 — 원장 검증을 우회해 들어온 allow도 여기서 닫힌다.
 */
export function allowEligibilityProblems(ledger, entry) {
  const required = requiredEvidenceKinds(entry?.licenseClass);
  if (!required) return [`라이선스 분류 ${String(entry?.licenseClass)}에는 allow 요구 증빙이 정의돼 있지 않습니다.`];
  const textsByHash = licenseTextByHash(ledger);
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  const problems = [];
  for (const kind of required) {
    const candidates = evidence.filter((item) => isRecord(item) && item.kind === kind);
    if (candidates.length === 0) {
      problems.push(`필수 증빙 ${kind}가 없습니다.`);
      continue;
    }
    const clean = candidates.some((item) => evidenceProblems(item, entry, textsByHash).length === 0);
    if (!clean) {
      problems.push(...candidates.flatMap((item) => evidenceProblems(item, entry, textsByHash)));
    }
  }
  return problems;
}

/** allow 자격을 아직 못 채운 증빙 종류. hold 사유 표시와 소유자 안내에 쓴다. */
export function missingEvidenceKinds(ledger, entry) {
  const required = requiredEvidenceKinds(entry?.licenseClass) ?? [];
  const textsByHash = licenseTextByHash(ledger);
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  return required.filter((kind) => !evidence.some((item) => isRecord(item)
    && item.kind === kind && evidenceProblems(item, entry, textsByHash).length === 0));
}

/** 공개 서빙 판정이 theme-packs.json에 싣는 팩별 권리 블록 (허용된 팩 전용). */
export function packRightsProjection(entry) {
  return {
    serve: "allow",
    status: entry.grant.status,
    licenseName: entry.grant.licenseName,
    commercialUse: entry.grant.commercialUse,
    attributionRequired: entry.grant.attributionRequired,
  };
}

/** 원장에서 팩을 찾는다. 없으면 null — 호출자는 hold로 다뤄야 한다. */
export function findPackRights(ledger, def) {
  const key = packRightsKey(def);
  const entries = Array.isArray(ledger?.packs) ? ledger.packs : [];
  return entries.find((entry) => isRecord(entry) && packRightsKey(entry) === key) ?? null;
}

/**
 * 서빙 판정. `serve`가 true인 경우는 원장에 있고, allow이며, 증빙 자격까지 충족한 팩뿐이다.
 * reason: allow | hold | missing-entry | invalid-evidence
 */
export function evaluateServeDecision(ledger, def) {
  const entry = findPackRights(ledger, def);
  if (!entry) return { serve: false, reason: "missing-entry", entry: null, problems: [] };
  if (entry.serve !== "allow") return { serve: false, reason: "hold", entry, problems: [] };
  const problems = allowEligibilityProblems(ledger, entry);
  if (problems.length > 0) return { serve: false, reason: "invalid-evidence", entry, problems };
  return { serve: true, reason: "allow", entry, problems: [] };
}

function validateGrant(entry, where) {
  const problems = [];
  const grant = entry.grant;
  if (!isRecord(grant)) return [`${where}: allow 팩에는 grant(status·licenseName·commercialUse·attributionRequired)가 필요합니다.`];
  if (!GRANT_STATUSES.includes(grant.status)) problems.push(`${where}: grant.status는 ${GRANT_STATUSES.join("|")}여야 합니다.`);
  if (!nonEmptyText(grant.licenseName, 200)) problems.push(`${where}: grant.licenseName이 비어 있습니다.`);
  if (typeof grant.commercialUse !== "boolean") problems.push(`${where}: grant.commercialUse는 boolean이어야 합니다.`);
  if (typeof grant.attributionRequired !== "boolean") problems.push(`${where}: grant.attributionRequired는 boolean이어야 합니다.`);
  return problems;
}

function validateEntry(ledger, entry, index, textsByHash) {
  const where = `packs[${index}]${isRecord(entry) && typeof entry.title === "string" ? ` ${entry.title}` : ""}`;
  if (!isRecord(entry)) return [`${where}: 객체가 아닙니다.`];
  const problems = [];
  if (!PACK_GROUPS.includes(entry.group)) problems.push(`${where}: group은 ${PACK_GROUPS.join("|")}여야 합니다.`);
  if (!nonEmptyText(entry.title, 200)) problems.push(`${where}: title이 비어 있습니다.`);
  if (!CREATORS.includes(entry.creator)) problems.push(`${where}: creator는 ${CREATORS.join("|")}여야 합니다.`);
  if (!Array.isArray(entry.catalogIds) || entry.catalogIds.some((id) => !nonEmptyText(id, 200))) {
    problems.push(`${where}: catalogIds는 문자열 배열이어야 합니다.`);
  }
  if (!Array.isArray(entry.officialCatalogIds) || entry.officialCatalogIds.some((id) => !nonEmptyText(id, 200))) {
    problems.push(`${where}: officialCatalogIds는 문자열 배열이어야 합니다.`);
  }
  if (!LICENSE_CLASSES.includes(entry.licenseClass)) {
    problems.push(`${where}: licenseClass가 알려진 분류가 아닙니다 (${String(entry.licenseClass)}).`);
  }
  if (!SERVE_STATES.includes(entry.serve)) {
    problems.push(`${where}: serve는 ${SERVE_STATES.join("|")}여야 합니다 (${String(entry.serve)}).`);
  }
  if (!Array.isArray(entry.evidence)) {
    problems.push(`${where}: evidence는 배열이어야 합니다.`);
    return problems;
  }
  for (const [evidenceIndex, evidence] of entry.evidence.entries()) {
    problems.push(...evidenceProblems(evidence, entry, textsByHash)
      .map((problem) => `${where} evidence[${evidenceIndex}]: ${problem}`));
  }
  // 분류와 로컬 문서의 일관성: unstated-*는 로컬 문서가 없어야 하고, 나머지는 있어야 한다.
  const localFiles = entry.evidence.filter((item) => isRecord(item) && item.kind === "local-license-file");
  if (String(entry.licenseClass).startsWith("unstated-") && localFiles.length > 0) {
    problems.push(`${where}: 로컬 라이선스 문서가 있는데 ${entry.licenseClass}로 분류돼 있습니다.`);
  }
  if (COMPATIBLE_TEXT_CLASSES[entry.licenseClass] && localFiles.length === 0) {
    problems.push(`${where}: ${entry.licenseClass} 분류는 local-license-file 증빙 기록이 있어야 합니다.`);
  }
  if (entry.serve === "allow") {
    problems.push(...allowEligibilityProblems(ledger, entry).map((problem) => `${where}: allow 불가 — ${problem}`));
    problems.push(...validateGrant(entry, where));
    for (const field of ["holdReason", "holdLabel"]) {
      if (entry[field] !== undefined && entry[field] !== null) {
        problems.push(`${where}: allow 팩에는 ${field}가 없어야 합니다.`);
      }
    }
  } else if (entry.serve === "hold") {
    if (!nonEmptyText(entry.holdReason, 80)) problems.push(`${where}: hold 팩에는 holdReason이 필요합니다.`);
    if (!nonEmptyText(entry.holdLabel, 500)) problems.push(`${where}: hold 팩에는 사용자 표기용 holdLabel이 필요합니다.`);
  }
  return problems;
}

/**
 * 원장 전체 검증. 문제 문장 배열(빈 배열이면 통과)을 돌려준다.
 * 구조·고유성·allow 증빙·라이선스 문서 분류 일관성을 본다. 생성기와 대조는 checkLedgerCoversDefs가 한다.
 */
export function validatePackRightsLedger(ledger) {
  if (!isRecord(ledger)) return ["원장이 객체가 아닙니다."];
  const problems = [];
  if (ledger.schema !== PACK_RIGHTS_SCHEMA || ledger.version !== 1) {
    problems.push(`원장 schema/version이 ${PACK_RIGHTS_SCHEMA} v1이 아닙니다.`);
  }
  if (ledger.defaultServe !== "hold") problems.push("defaultServe는 hold여야 합니다 (fail-closed 기본값).");
  if (!Array.isArray(ledger.licenseTexts)) problems.push("licenseTexts가 배열이 아닙니다.");
  if (!Array.isArray(ledger.packs)) {
    problems.push("packs가 배열이 아닙니다.");
    return problems;
  }
  const seenHashes = new Set();
  for (const [index, text] of (Array.isArray(ledger.licenseTexts) ? ledger.licenseTexts : []).entries()) {
    const where = `licenseTexts[${index}]`;
    if (!isRecord(text)) {
      problems.push(`${where}: 객체가 아닙니다.`);
      continue;
    }
    if (!SHA256_HEX.test(text.sha256 ?? "")) problems.push(`${where}: sha256이 64자리 소문자 16진수가 아닙니다.`);
    if (seenHashes.has(text.sha256)) problems.push(`${where}: sha256이 중복됩니다.`);
    seenHashes.add(text.sha256);
    if (!LICENSE_TEXT_CLASSES.includes(text.class)) problems.push(`${where}: class가 알려진 문서 분류가 아닙니다 (${String(text.class)}).`);
    if (!nonEmptyText(text.summary, 400)) problems.push(`${where}: summary가 비어 있습니다.`);
    if (!Array.isArray(text.files) || text.files.length === 0
      || text.files.some((file) => !isRecord(file) || !nonEmptyText(file.libraryPath, 400))) {
      problems.push(`${where}: files(libraryPath)가 비어 있습니다.`);
    }
    // zip 안에 든 사본(예: Blend Textures.zip의 LICENSE.txt)은 archivedFiles에 압축 파일 경로와 멤버 이름으로 적는다.
    if (text.archivedFiles !== undefined
      && (!Array.isArray(text.archivedFiles) || text.archivedFiles.some((file) => !isRecord(file)
        || !nonEmptyText(file.libraryPath, 400) || !nonEmptyText(file.member, 400)))) {
      problems.push(`${where}: archivedFiles는 {libraryPath, member} 배열이어야 합니다.`);
    }
  }
  const textsByHash = licenseTextByHash(ledger);
  const seenKeys = new Map();
  const seenIds = new Set();
  const seenCatalogIds = new Map();
  for (const [index, entry] of ledger.packs.entries()) {
    problems.push(...validateEntry(ledger, entry, index, textsByHash));
    if (!isRecord(entry)) continue;
    if (!nonEmptyText(entry.id, 200)) problems.push(`packs[${index}]: id가 비어 있습니다.`);
    else if (seenIds.has(entry.id)) problems.push(`packs[${index}]: id가 중복됩니다 (${entry.id}).`);
    seenIds.add(entry.id);
    const key = packRightsKey(entry);
    if (seenKeys.has(key)) problems.push(`packs[${index}]: 팩 키가 중복됩니다 (${key}).`);
    seenKeys.set(key, index);
    for (const id of Array.isArray(entry.catalogIds) ? entry.catalogIds : []) {
      if (seenCatalogIds.has(id)) problems.push(`packs[${index}]: catalogId가 다른 항목과 겹칩니다 (${id}).`);
      seenCatalogIds.set(id, index);
    }
  }
  return problems;
}

/**
 * 원장이 생성기 팩 정의를 빠짐없이, 같은 묶음으로 덮는지 대조한다.
 * defs: { pack: [{catalogIds,title,creator}], crowd: [...], pending: [...] }
 */
export function checkLedgerCoversDefs(ledger, defs) {
  const problems = [];
  const entries = Array.isArray(ledger?.packs) ? ledger.packs : [];
  const byKey = new Map(entries.filter(isRecord).map((entry) => [packRightsKey(entry), entry]));
  const matched = new Set();
  for (const group of PACK_GROUPS) {
    const seenInGroup = new Set();
    for (const def of Array.isArray(defs?.[group]) ? defs[group] : []) {
      const key = packRightsKey(def);
      if (seenInGroup.has(key)) problems.push(`생성기 ${group} 묶음에 같은 팩이 두 번 있습니다: ${def.title}`);
      seenInGroup.add(key);
      const entry = byKey.get(key);
      if (!entry) {
        problems.push(`원장에 없는 ${group} 팩입니다: ${def.title} (${key})`);
        continue;
      }
      matched.add(key);
      if (entry.group !== group) problems.push(`원장 묶음이 다릅니다: ${def.title} 원장=${entry.group} 생성기=${group}`);
      if (def.creator !== undefined && entry.creator !== def.creator) {
        problems.push(`제작사가 다릅니다: ${def.title} 원장=${entry.creator} 생성기=${def.creator}`);
      }
      if (def.title !== undefined && entry.title !== def.title) {
        problems.push(`제목이 다릅니다: 원장=${entry.title} 생성기=${def.title}`);
      }
    }
  }
  for (const [key, entry] of byKey) {
    if (!matched.has(key)) problems.push(`생성기에 없는 원장 항목입니다: ${entry.title} (${key})`);
  }
  return problems;
}

/** 원장을 읽고 검증한다. 문제가 하나라도 있으면 던진다 (서빙 경로는 검증 실패 원장을 쓰지 않는다). */
export function loadPackRightsLedger(path = DEFAULT_PACK_RIGHTS_PATH, { readFile = readFileSync } = {}) {
  let ledger;
  try {
    ledger = JSON.parse(readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `권리 원장을 읽을 수 없습니다 (${path}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const problems = validatePackRightsLedger(ledger);
  if (problems.length > 0) {
    throw new Error(`권리 원장이 올바르지 않습니다 (${problems.length}건):\n  - ${problems.slice(0, 20).join("\n  - ")}`);
  }
  return ledger;
}

/** 묶음별·상태별 개수 요약 (로그용). */
export function summarizePackRightsLedger(ledger) {
  const summary = { total: 0, byGroup: {}, allow: 0, hold: 0 };
  for (const entry of Array.isArray(ledger?.packs) ? ledger.packs : []) {
    summary.total += 1;
    summary.byGroup[entry.group] = (summary.byGroup[entry.group] ?? 0) + 1;
    if (entry.serve === "allow") summary.allow += 1;
    else summary.hold += 1;
  }
  return summary;
}

/**
 * zip 안의 멤버 하나를 꺼낸다 (저장·deflate만 지원, 없으면 null). 라이선스 문서가 `Blend Textures.zip`
 * 같은 압축 파일 안에만 있는 팩의 증빙을 외부 도구 없이 다시 대조하려고 둔 최소 구현이다.
 */
export function readZipMember(buffer, memberName) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === memberName) {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/**
 * 원장이 기록한 로컬 라이선스 문서(해시)가 라이브러리 트리의 실물과 일치하는지 다시 대조한다.
 * 반환: { checked, mismatches } — mismatches가 비면 79개 문서와 zip 안 사본이 모두 기록과 같다.
 */
export function verifyLocalLicenseEvidence({ ledger, libraryRoot, readFile = readFileSync }) {
  const mismatches = [];
  let checked = 0;
  const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const text of Array.isArray(ledger?.licenseTexts) ? ledger.licenseTexts : []) {
    for (const file of Array.isArray(text.files) ? text.files : []) {
      checked += 1;
      const path = resolve(libraryRoot, file.libraryPath);
      let actual;
      try {
        actual = sha256Of(readFile(path));
      } catch {
        mismatches.push({ path: file.libraryPath, expected: text.sha256, actual: null, reason: "missing" });
        continue;
      }
      if (actual !== text.sha256) {
        mismatches.push({ path: file.libraryPath, expected: text.sha256, actual, reason: "hash-mismatch" });
      }
    }
    for (const file of Array.isArray(text.archivedFiles) ? text.archivedFiles : []) {
      checked += 1;
      const label = `${file.libraryPath}::${file.member}`;
      let member;
      try {
        member = readZipMember(readFile(resolve(libraryRoot, file.libraryPath)), file.member);
      } catch {
        member = null;
      }
      if (!member) {
        mismatches.push({ path: label, expected: text.sha256, actual: null, reason: "missing" });
        continue;
      }
      const actual = sha256Of(member);
      if (actual !== text.sha256) {
        mismatches.push({ path: label, expected: text.sha256, actual, reason: "hash-mismatch" });
      }
    }
  }
  return { checked, mismatches };
}

