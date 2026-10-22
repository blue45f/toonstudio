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
 * 한계 — 증빙 검사는 형식·일관성 검사다:
 *   영수증·itch 캡처·제작사 서면 확인의 실물은 레포 밖에 있어 코드가 진위를 판정할 수 없다. 이 모듈은
 *   필수 필드·URL 호스트·달력상 유효하고 미래가 아닌 날짜·자리표시 아닌 보관 위치까지만 거른다.
 *   실물과 대조되는 증빙은 `local-license-file`(sha256, `verifyLocalLicenseEvidence`)뿐이다.
 *   그래서 allow 전환은 항상 소유자가 직접 하는 원장 편집이고, 이 게이트는 실수·누락을 막는 안전장치다.
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
/**
 * 서빙 판정이 실제로 일어나는 묶음. pending은 미수신·보류라 생성기가 serve와 무관하게 pendingPacks로만
 * 내보내므로 allow가 아무것도 열지 못한다 — 편입(CATALOG_PACKS)하면서 group을 pack으로 옮긴 뒤에야 판정 대상이다.
 */
export const SERVABLE_GROUPS = Object.freeze(["pack", "crowd"]);
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

/**
 * 패널의 "준비 중인 팩" 목록에 hold 팩마다 그대로 보이는 문구. 사유(제작사 확인·증빙·충돌)와 공개 약속을
 * 드러내지 않도록 모든 hold 팩이 같은 중립 문장을 쓴다. 사유는 holdReason(내부 필드)에만 둔다.
 */
export const HOLD_PUBLIC_LABEL = "준비 중이며 공개 시점은 정해지지 않았다.";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const CREATORS = Object.freeze(["EmaceArt", "RG Poly"]);
const GRANT_STATUSES = Object.freeze(["licensed", "public-domain"]);
/** 보관 위치(ref)로 인정하지 않는 자리표시 단어. */
const PLACEHOLDER_REFS = Object.freeze(new Set([
  "tbd", "todo", "fixme", "n/a", "na", "none", "null", "undefined", "unknown", "pending",
  "test", "dummy", "sample", "example", "placeholder",
]));
const MIN_REF_LENGTH = 6;
/** 가장 앞선 시간대(UTC+14)의 오늘까지는 허용한다 — 어느 나라에서 적었든 정상 날짜가 미래로 오판되지 않게. */
const EVIDENCE_DATE_SLACK_MS = 14 * 60 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value, maximum = 600) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

/** 달력에 실제로 있는 YYYY-MM-DD인지. 2026-02-31처럼 형식만 맞는 날짜는 거부한다. */
function isCalendarDate(value) {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** 증빙 날짜가 넘을 수 없는 상한(YYYY-MM-DD). `now`는 테스트 주입용이다. */
function latestEvidenceDate(now) {
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return new Date(base.getTime() + EVIDENCE_DATE_SLACK_MS).toISOString().slice(0, 10);
}

/** 날짜 필드 점검. 문제가 없으면 null. */
function dateProblem(where, field, value, today) {
  if (!isCalendarDate(value)) return `${where}: ${field}(YYYY-MM-DD)이 없거나 달력에 없는 날짜입니다.`;
  if (value > today) return `${where}: ${field}가 미래 날짜입니다 (${value}).`;
  return null;
}

/** 보관 위치(ref)로 쓸 수 있는 문자열인지. 너무 짧은 값·한 글자 반복·자리표시 단어는 거부한다. */
function isMeaningfulRef(value) {
  if (!nonEmptyText(value, 400)) return false;
  const text = value.trim();
  if (text.length < MIN_REF_LENGTH || new Set(text).size === 1) return false;
  return !PLACEHOLDER_REFS.has(text.toLowerCase());
}

/** https itch.io(또는 하위 도메인)의 팩 페이지 주소인지. zitch.io·itch.io@evil.com 같은 닮은꼴을 거부한다. */
function isItchPackUrl(value) {
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.username === "" && url.password === ""
    && (url.hostname === "itch.io" || url.hostname.endsWith(".itch.io"))
    && url.pathname.length > 1;
}

/**
 * 팩 식별 키. 카탈로그 번호가 있으면 번호들을 정렬해 잇고, 없으면 제목으로 식별한다
 * (카탈로그 번호가 없는 RG Poly "Food Pack"만 해당).
 */
export function packRightsKey(def) {
  const ids = Array.isArray(def?.catalogIds) ? [...def.catalogIds].sort() : [];
  return ids.length > 0 ? ids.join("+") : `title:${def?.title ?? ""}`;
}

/** 로컬 라이선스 문서를 기대하는 팩 분류의 허용 문서 분류. 그 외(unstated-*·알 수 없는 값)는 undefined. */
function expectedTextClasses(licenseClass) {
  return typeof licenseClass === "string" && Object.hasOwn(COMPATIBLE_TEXT_CLASSES, licenseClass)
    ? COMPATIBLE_TEXT_CLASSES[licenseClass]
    : undefined;
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

/** 증빙 점검이 공유하는 맥락: 문서 해시 표와 날짜 상한. */
function evidenceContext(ledger, now) {
  return { textsByHash: licenseTextByHash(ledger), today: latestEvidenceDate(now) };
}

/** 라이선스 문서 한 종류가 기록한 실물 위치 → 라이브러리 팩 이름. zip 안 사본은 `경로::멤버`로 적는다. */
function licenseFileLocations(text) {
  const locations = new Map();
  for (const file of Array.isArray(text.files) ? text.files : []) {
    if (isRecord(file) && typeof file.libraryPath === "string") locations.set(file.libraryPath, file.libraryPack);
  }
  for (const file of Array.isArray(text.archivedFiles) ? text.archivedFiles : []) {
    if (isRecord(file) && typeof file.libraryPath === "string" && typeof file.member === "string") {
      locations.set(`${file.libraryPath}::${file.member}`, file.libraryPack);
    }
  }
  return locations;
}

/** 증빙 한 건이 자기 종류의 필수 필드를 갖췄는지 점검한다. 문제 문장 배열을 돌려준다. */
function evidenceProblems(evidence, entry, context) {
  if (!isRecord(evidence)) return ["증빙 항목이 객체가 아닙니다."];
  if (!EVIDENCE_KINDS.includes(evidence.kind)) return [`알 수 없는 증빙 종류입니다: ${String(evidence.kind)}`];
  const problems = [];
  const where = `증빙 ${evidence.kind}`;
  const addDateProblem = (field) => {
    const problem = dateProblem(where, field, evidence[field], context.today);
    if (problem) problems.push(problem);
  };
  if (NON_QUALIFYING_EVIDENCE_KINDS.includes(evidence.kind)) {
    if (!nonEmptyText(evidence.claim)) problems.push(`${where}: claim(주장 요약)이 비어 있습니다.`);
    if (!nonEmptyText(evidence.source)) problems.push(`${where}: source(출처)가 비어 있습니다.`);
    return problems;
  }
  addDateProblem("verifiedAt");
  switch (evidence.kind) {
    case "local-license-file": {
      if (!SHA256_HEX.test(evidence.sha256 ?? "")) {
        problems.push(`${where}: sha256이 64자리 소문자 16진수가 아닙니다.`);
        break;
      }
      const text = context.textsByHash.get(evidence.sha256);
      if (!text) {
        problems.push(`${where}: licenseTexts에 분류되지 않은 해시입니다 (${evidence.sha256.slice(0, 12)}).`);
        break;
      }
      if (!Array.isArray(evidence.paths) || evidence.paths.length === 0
        || evidence.paths.some((path) => !nonEmptyText(path, 400))) {
        problems.push(`${where}: paths(라이브러리 상대 경로)가 비어 있습니다.`);
      } else {
        // 증빙은 자기 팩의 문서여야 한다: 경로가 그 해시로 기록된 실물이고, 적어도 하나는 이 팩의 라이브러리 폴더에 있다.
        const locations = licenseFileLocations(text);
        const unrecorded = evidence.paths.filter((path) => !locations.has(path));
        if (unrecorded.length > 0) {
          problems.push(`${where}: paths가 해시 ${evidence.sha256.slice(0, 12)}로 기록된 문서가 아닙니다 (${unrecorded[0]}).`);
        }
        const ownPacks = Array.isArray(entry.libraryPacks) ? entry.libraryPacks : [];
        if (!evidence.paths.some((path) => locations.has(path) && ownPacks.includes(locations.get(path)))) {
          problems.push(`${where}: paths 중 이 팩(libraryPacks)의 라이브러리 폴더에 있는 문서가 없습니다.`);
        }
      }
      const compatible = expectedTextClasses(entry.licenseClass);
      if (compatible && !compatible.includes(text.class)) {
        problems.push(`${where}: 문서 분류 ${text.class}는 팩 분류 ${entry.licenseClass}와 맞지 않습니다.`);
      }
      break;
    }
    case "itch-page-capture":
      if (!isItchPackUrl(evidence.url)) {
        problems.push(`${where}: url이 https itch.io 팩 페이지 주소가 아닙니다.`);
      }
      addDateProblem("retrievedAt");
      if (!isMeaningfulRef(evidence.ref)) problems.push(`${where}: ref(캡처 보관 위치)가 비었거나 자리표시입니다.`);
      break;
    case "purchase-receipt":
      if (!isMeaningfulRef(evidence.ref)) problems.push(`${where}: ref(영수증·약관 보관 위치)가 비었거나 자리표시입니다.`);
      break;
    case "producer-written-confirmation":
      if (!isMeaningfulRef(evidence.ref)) problems.push(`${where}: ref(서면 확인 보관 위치)가 비었거나 자리표시입니다.`);
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
 * grant 블록 점검(문제 문장 배열). attributionRequired=true는 원장 스키마에 attribution 문구 필드가 없어
 * 로더가 권리를 unknown으로 닫아 버리므로, 필드가 생기기 전까지는 받지 않는다.
 */
function grantProblems(entry) {
  const grant = entry?.grant;
  if (!isRecord(grant)) return ["allow 팩에는 grant(status·licenseName·commercialUse·attributionRequired)가 필요합니다."];
  const problems = [];
  if (!GRANT_STATUSES.includes(grant.status)) problems.push(`grant.status는 ${GRANT_STATUSES.join("|")}여야 합니다.`);
  if (!nonEmptyText(grant.licenseName, 200)) problems.push("grant.licenseName이 비어 있습니다.");
  if (typeof grant.commercialUse !== "boolean") problems.push("grant.commercialUse는 boolean이어야 합니다.");
  if (typeof grant.attributionRequired !== "boolean") {
    problems.push("grant.attributionRequired는 boolean이어야 합니다.");
  } else if (grant.attributionRequired) {
    problems.push("grant.attributionRequired=true는 지원하지 않습니다 (스키마에 attribution 문구 필드가 없어 로더가 권리를 unknown으로 닫습니다).");
  }
  return problems;
}

/**
 * 팩 하나의 allow 자격 점검. 문제 문장 배열(빈 배열이면 자격 충족)을 돌려준다.
 * 묶음(서빙 대상인가)·grant·분류별 필수 증빙을 모두 본다. 검증기와 서빙 판정이 같은 함수를 쓰므로
 * 원장 검증을 거치지 않고 들어온 allow도 증빙·grant·묶음이 모자라면 여기서 닫힌다.
 * (진위 판정은 아니다 — 파일 머리의 "한계" 참고.) `now`는 날짜 상한 계산용 테스트 주입값이다.
 */
export function allowEligibilityProblems(ledger, entry, { now } = {}) {
  if (!isRecord(entry)) return ["원장 항목이 객체가 아닙니다."];
  const problems = [];
  if (entry.group === "pending") {
    problems.push("pending 묶음 팩은 인제스션·CATALOG_PACKS 편입 전이라 allow가 아무것도 열지 못합니다 (편입하면서 group을 pack으로 옮긴 뒤 판정합니다).");
  } else if (!SERVABLE_GROUPS.includes(entry.group)) {
    problems.push(`group ${String(entry.group)}은 서빙 판정 대상이 아닙니다.`);
  }
  problems.push(...grantProblems(entry));
  const required = requiredEvidenceKinds(entry.licenseClass);
  if (!required) {
    problems.push(`라이선스 분류 ${String(entry.licenseClass)}에는 allow 요구 증빙이 정의돼 있지 않습니다.`);
    return problems;
  }
  const context = evidenceContext(ledger, now);
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  for (const kind of required) {
    const candidates = evidence.filter((item) => isRecord(item) && item.kind === kind);
    if (candidates.length === 0) {
      problems.push(`필수 증빙 ${kind}가 없습니다.`);
      continue;
    }
    const results = candidates.map((item) => evidenceProblems(item, entry, context));
    if (!results.some((result) => result.length === 0)) problems.push(...results.flat());
  }
  return problems;
}

/** allow 자격을 아직 못 채운 증빙 종류. hold 사유 표시와 소유자 안내에 쓴다. */
export function missingEvidenceKinds(ledger, entry, { now } = {}) {
  const required = requiredEvidenceKinds(entry?.licenseClass) ?? [];
  const context = evidenceContext(ledger, now);
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  return required.filter((kind) => !evidence.some((item) => isRecord(item)
    && item.kind === kind && evidenceProblems(item, entry, context).length === 0));
}

/**
 * 공개 서빙 판정이 theme-packs.json에 싣는 팩별 권리 블록 (허용된 팩 전용).
 * grant가 올바르지 않으면 던진다 — 검증 안 된 값을 공개 JSON에 싣지 않는다.
 */
export function packRightsProjection(entry) {
  const problems = grantProblems(entry);
  if (problems.length > 0) {
    throw new TypeError(`권리 블록을 만들 수 없습니다 (${String(entry?.title)}): ${problems.join(" / ")}`);
  }
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
 * 서빙 판정. `serve`가 true인 경우는 원장에 있고, allow이며, 증빙·grant·묶음 자격까지 충족한 팩뿐이다.
 * - `group`을 주면 원장 항목이 그 묶음이어야 한다 (배치 가능 팩만 다루는 플래너는 "pack"을 준다).
 * - def에 title·creator가 있으면 원장 항목과 같아야 한다 (카탈로그 번호 없는 팩의 제목 위장 방지).
 * reason: allow | hold | missing-entry | group-mismatch | identity-mismatch | invalid-evidence
 */
export function evaluateServeDecision(ledger, def, { group, now } = {}) {
  const entry = findPackRights(ledger, def);
  if (!entry) return { serve: false, reason: "missing-entry", entry: null, problems: [] };
  if (entry.serve !== "allow") return { serve: false, reason: "hold", entry, problems: [] };
  if (group !== undefined && entry.group !== group) {
    return { serve: false, reason: "group-mismatch", entry, problems: [`원장 묶음 ${String(entry.group)} ≠ 기대 묶음 ${group}`] };
  }
  const mismatched = ["title", "creator"].filter((field) => def?.[field] !== undefined && def[field] !== entry[field]);
  if (mismatched.length > 0) {
    return { serve: false, reason: "identity-mismatch", entry, problems: mismatched.map((field) => `${field}가 원장과 다릅니다.`) };
  }
  const problems = allowEligibilityProblems(ledger, entry, { now });
  if (problems.length > 0) return { serve: false, reason: "invalid-evidence", entry, problems };
  return { serve: true, reason: "allow", entry, problems: [] };
}

function validateEntry(ledger, entry, index, context) {
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
  if (!Array.isArray(entry.libraryPacks) || entry.libraryPacks.some((name) => !nonEmptyText(name, 200))) {
    problems.push(`${where}: libraryPacks는 문자열 배열이어야 합니다 (로컬 라이선스 증빙을 이 팩에 묶는 기준).`);
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
    problems.push(...evidenceProblems(evidence, entry, context)
      .map((problem) => `${where} evidence[${evidenceIndex}]: ${problem}`));
  }
  // 분류와 로컬 문서의 일관성: unstated-*는 로컬 문서가 없어야 하고, 나머지는 있어야 한다.
  const localFiles = entry.evidence.filter((item) => isRecord(item) && item.kind === "local-license-file");
  if (String(entry.licenseClass).startsWith("unstated-") && localFiles.length > 0) {
    problems.push(`${where}: 로컬 라이선스 문서가 있는데 ${entry.licenseClass}로 분류돼 있습니다.`);
  }
  if (expectedTextClasses(entry.licenseClass) && localFiles.length === 0) {
    problems.push(`${where}: ${entry.licenseClass} 분류는 local-license-file 증빙 기록이 있어야 합니다.`);
  }
  if (entry.serve === "allow") {
    problems.push(...allowEligibilityProblems(ledger, entry, { now: context.now })
      .map((problem) => `${where}: allow 불가 — ${problem}`));
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
 * `now`는 증빙 날짜 상한(미래 날짜 거부) 계산용 테스트 주입값이다.
 */
export function validatePackRightsLedger(ledger, { now } = {}) {
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
      || text.files.some((file) => !isRecord(file) || !nonEmptyText(file.libraryPath, 400)
        || !nonEmptyText(file.libraryPack, 200))) {
      problems.push(`${where}: files({libraryPath, libraryPack})가 비어 있습니다.`);
    }
    // zip 안에 든 사본(예: Blend Textures.zip의 LICENSE.txt)은 archivedFiles에 압축 파일 경로와 멤버 이름으로 적는다.
    if (text.archivedFiles !== undefined
      && (!Array.isArray(text.archivedFiles) || text.archivedFiles.some((file) => !isRecord(file)
        || !nonEmptyText(file.libraryPath, 400) || !nonEmptyText(file.member, 400)
        || !nonEmptyText(file.libraryPack, 200)))) {
      problems.push(`${where}: archivedFiles는 {libraryPath, member, libraryPack} 배열이어야 합니다.`);
    }
  }
  const context = { ...evidenceContext(ledger, now), now };
  const seenKeys = new Map();
  const seenIds = new Set();
  const seenCatalogIds = new Map();
  for (const [index, entry] of ledger.packs.entries()) {
    problems.push(...validateEntry(ledger, entry, index, context));
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

