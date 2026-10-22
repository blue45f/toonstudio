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
 *   필수 필드·URL 호스트·달력상 유효하고 미래가 아닌 날짜·자리표시 아닌 보관 위치까지만 거른다
 *   (값 단위 점검은 creator-bundle-pack-rights-form.mjs).
 *   실물과 대조할 수 있는 증빙은 `local-license-file`뿐이며, 그것도 검증 CLI가 `--library-root`를 받았을 때만
 *   `verifyLocalLicenseEvidence`(creator-bundle-pack-rights-library.mjs)가 각 경로 파일의 sha256을 원장 기록과 다시
 *   맞춰 본다(문서 분류의 옳고 그름은 보지 않는다). 서빙 판정과 `validatePackRightsLedger`는 파일을 읽지 않는다.
 *   그래서 allow 전환은 항상 소유자가 직접 하는 원장 편집이고, 이 게이트는 실수·누락을 막는 안전장치다.
 *
 * 소비자: 생성기(generate-creator-bundle-theme-packs.mjs), 배포 플래너
 * (plan-creator-bundle-deploy.mjs), 검증 CLI(verify-creator-bundle-pack-rights.mjs), 완전성 테스트.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dateProblem,
  isRecord,
  isSha256,
  itchUrlProblem,
  latestEvidenceDate,
  licenseNameProblem,
  nonEmptyText,
  refProblem,
  relativePathProblem,
} from "./creator-bundle-pack-rights-form.mjs";

export {
  WEB_EXTERNAL_REFERENCE_PATTERN,
  WEB_RIGHTS_TEXT_MAX_LENGTH,
  WEB_SENSITIVE_REFERENCE_PATTERN,
} from "./creator-bundle-pack-rights-form.mjs";
export { readZipMember, verifyLocalLicenseEvidence } from "./creator-bundle-pack-rights-library.mjs";

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
 * 패널의 "준비 중인 팩" 목록에 원장 hold 때문에 pendingPacks(rights-hold)로 가는 팩(pack·crowd 묶음)마다 그대로
 * 보이는 문구. 사유(제작사 확인·증빙·충돌)와 공개 약속을 드러내지 않도록 모든 hold 팩이 같은 중립 문장을 쓰고,
 * 사유는 holdReason(내부 필드)에만 둔다. pending 묶음 14개의 화면 문구는 생성기의 PENDING_PACKS가 정하며
 * (회수 상태 등 권리와 무관한 사유) 그 팩들의 holdLabel은 화면에 쓰이지 않는다.
 */
export const HOLD_PUBLIC_LABEL = "준비 중이며 공개 시점은 정해지지 않았다.";

const CREATORS = Object.freeze(["EmaceArt", "RG Poly"]);
const GRANT_STATUSES = Object.freeze(["licensed", "public-domain"]);
/**
 * 라이브러리 팩 폴더(`libraryPacks`·`licenseTexts[].files[].libraryPack`)를 둘 이상의 원장 항목이 함께 주장해도
 * 되는 곳. 항목마다 로컬 라이선스 증빙을 "자기 팩의 폴더"로 묶는 규칙이라, 폴더 공유는 다른 팩의 문서를 내 증빙으로
 * 쓰는 통로가 된다 — 그래서 문서화된 곳(각 항목의 mappingNote)만 허용하고 새 공유는 이 목록을 고치는 코드 변경으로만 연다.
 */
export const SHARED_LIBRARY_FOLDERS = Object.freeze([
  "graves-kit-with-lods",
  "low-poly-asia-pack",
  "pixeldrift-metro-3d-pixel-art-subway-vr",
]);

const INVALID_PACK_KEY = "\u0000invalid-catalog-ids";

/**
 * 팩 식별 키. 카탈로그 번호가 있으면 번호들을 정렬해 잇고, 없으면 제목으로 식별한다
 * (카탈로그 번호가 없는 RG Poly "Food Pack"만 해당). 두 종류는 접두사(`ids:`·`title:`)로 구분한다.
 * 문자열 배열이 아니거나 번호가 비었거나 이음 문자(+)를 품은 catalogIds는 상수 키 하나로 닫는다 — 서로 다른 잘못된
 * 값끼리는 키가 같으므로, 이 키는 findPackRights·checkLedgerCoversDefs가 매칭에서 제외한다(`["A","B"]`와 `["A+B"]` 충돌 방지).
 */
export function packRightsKey(def) {
  const raw = def?.catalogIds;
  if (raw !== undefined
    && !(Array.isArray(raw) && raw.every((id) => typeof id === "string" && id !== "" && !id.includes("+")))) {
    return INVALID_PACK_KEY;
  }
  const ids = Array.isArray(raw) ? [...raw].sort() : [];
  return ids.length > 0 ? `ids:${ids.join("+")}` : `title:${typeof def?.title === "string" ? def.title : ""}`;
}

/** 로컬 라이선스 문서를 기대하는 팩 분류의 허용 문서 분류. 그 외(unstated-*·알 수 없는 값)는 undefined. */
function expectedTextClasses(licenseClass) {
  return typeof licenseClass === "string" && Object.hasOwn(COMPATIBLE_TEXT_CLASSES, licenseClass)
    ? COMPATIBLE_TEXT_CLASSES[licenseClass]
    : undefined;
}

/** 원장 팩 하나의 allow 필수 증빙 종류. 분류가 알려지지 않았으면 null(어떤 증빙으로도 allow 불가). */
export function requiredEvidenceKinds(licenseClass) {
  // 문자열이 아닌 값(배열 등)은 속성 키로 강제 변환돼 다른 분류처럼 보일 수 있으므로 먼저 거른다.
  return typeof licenseClass === "string" && Object.hasOwn(ALLOW_EVIDENCE_REQUIREMENTS, licenseClass)
    ? ALLOW_EVIDENCE_REQUIREMENTS[licenseClass]
    : null;
}

function licenseTextByHash(ledger) {
  return new Map((Array.isArray(ledger?.licenseTexts) ? ledger.licenseTexts : [])
    .filter((text) => isRecord(text) && typeof text.sha256 === "string")
    .map((text) => [text.sha256, text]));
}

/** 라이브러리 팩 폴더 이름 → 그 폴더를 libraryPacks에 적은 원장 항목 수. */
function libraryFolderClaims(ledger) {
  const claims = new Map();
  for (const entry of Array.isArray(ledger?.packs) ? ledger.packs : []) {
    if (!isRecord(entry)) continue;
    const names = new Set((Array.isArray(entry.libraryPacks) ? entry.libraryPacks : []).filter((name) => typeof name === "string"));
    for (const name of names) claims.set(name, (claims.get(name) ?? 0) + 1);
  }
  return claims;
}

/** 증빙 점검이 공유하는 맥락: 문서 해시 표, 날짜 상한, 라이브러리 폴더 주장 수. */
function evidenceContext(ledger, now) {
  return { textsByHash: licenseTextByHash(ledger), today: latestEvidenceDate(now), folderClaims: libraryFolderClaims(ledger) };
}

/**
 * 라이선스 문서 한 종류가 기록한 실물 위치 → 라이브러리 팩 이름. zip 안 사본은 `경로::멤버`로 적는다.
 * 경로가 정규형 상대 경로이고 libraryPack이 경로의 팩 폴더(`<분류>/<팩>/…`의 두 번째 조각)와 같은 기록만 담는다 —
 * 원장 검증(validatePackRightsLedger)을 거치지 않고 들어온 서빙 판정도 `a/../b` 같은 위장 기록을 증빙으로 쓰지 못한다.
 */
function licenseFileLocations(text) {
  const locations = new Map();
  const wellFormed = (file) => isRecord(file) && typeof file.libraryPack === "string"
    && relativePathProblem(file.libraryPath) === null && file.libraryPath.split("/")[1] === file.libraryPack;
  for (const file of Array.isArray(text.files) ? text.files : []) {
    if (wellFormed(file)) locations.set(file.libraryPath, file.libraryPack);
  }
  for (const file of Array.isArray(text.archivedFiles) ? text.archivedFiles : []) {
    if (wellFormed(file) && relativePathProblem(file.member) === null) {
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
  const addRefProblem = (label) => {
    const issue = refProblem(evidence.ref);
    if (issue) problems.push(`${where}: ref(${label})가 올바르지 않습니다 — ${issue}.`);
  };
  if (NON_QUALIFYING_EVIDENCE_KINDS.includes(evidence.kind)) {
    if (!nonEmptyText(evidence.claim)) problems.push(`${where}: claim(주장 요약)이 비어 있습니다.`);
    if (!nonEmptyText(evidence.source)) problems.push(`${where}: source(출처)가 비어 있습니다.`);
    return problems;
  }
  addDateProblem("verifiedAt");
  switch (evidence.kind) {
    case "local-license-file": {
      if (!isSha256(evidence.sha256)) {
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
        const ownFolders = evidence.paths.filter((path) => locations.has(path) && ownPacks.includes(locations.get(path)))
          .map((path) => locations.get(path));
        // 폴더를 다른 항목도 주장하면(문서화된 공유 폴더 제외) 그 폴더의 문서는 이 팩만의 증빙이 아니다.
        const exclusive = ownFolders.filter((name) => (context.folderClaims.get(name) ?? 0) <= 1
          || SHARED_LIBRARY_FOLDERS.includes(name));
        if (ownFolders.length === 0) {
          problems.push(`${where}: paths 중 이 팩(libraryPacks)의 라이브러리 폴더에 있는 문서가 없습니다.`);
        } else if (exclusive.length === 0) {
          problems.push(`${where}: 라이브러리 폴더 ${ownFolders[0]}을 다른 항목도 주장합니다 — 문서화된 공유 폴더(SHARED_LIBRARY_FOLDERS)가 아니면 이 팩만의 증빙으로 쓸 수 없습니다.`);
        }
      }
      const compatible = expectedTextClasses(entry.licenseClass);
      if (compatible && !compatible.includes(text.class)) {
        problems.push(`${where}: 문서 분류 ${text.class}는 팩 분류 ${entry.licenseClass}와 맞지 않습니다.`);
      }
      break;
    }
    case "itch-page-capture": {
      const urlIssue = itchUrlProblem(evidence.url);
      if (urlIssue) problems.push(`${where}: url이 https itch.io 팩 페이지 주소가 아닙니다 — ${urlIssue}.`);
      addDateProblem("retrievedAt");
      addRefProblem("캡처 보관 위치");
      break;
    }
    case "purchase-receipt":
      addRefProblem("영수증·약관 보관 위치");
      break;
    case "producer-written-confirmation":
      addRefProblem("서면 확인 보관 위치");
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
  const nameIssue = licenseNameProblem(grant.licenseName);
  if (nameIssue) problems.push(`grant.licenseName이 올바르지 않습니다 — ${nameIssue}.`);
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
  if (key === INVALID_PACK_KEY) return null;
  const entries = Array.isArray(ledger?.packs) ? ledger.packs : [];
  return entries.find((entry) => isRecord(entry) && packRightsKey(entry) === key) ?? null;
}

/**
 * 서빙 판정. `serve`가 true인 경우는 원장에 있고, allow이며, 증빙·grant·묶음 자격까지 충족한 팩뿐이다.
 * - `group`을 주면 원장 항목이 그 묶음이어야 한다 (배치 가능 팩만 다루는 플래너는 "pack"을 준다).
 * - def의 title·creator는 문자열로 있어야 하고 원장 항목과 같아야 한다 (카탈로그 번호 없는 팩의 제목 위장 방지).
 * reason: allow | hold | missing-entry | group-mismatch | identity-mismatch | invalid-evidence
 */
export function evaluateServeDecision(ledger, def, { group, now } = {}) {
  const entry = findPackRights(ledger, def);
  if (!entry) return { serve: false, reason: "missing-entry", entry: null, problems: [] };
  if (entry.serve !== "allow") return { serve: false, reason: "hold", entry, problems: [] };
  if (group !== undefined && entry.group !== group) {
    return { serve: false, reason: "group-mismatch", entry, problems: [`원장 묶음 ${String(entry.group)} ≠ 기대 묶음 ${group}`] };
  }
  const mismatched = ["title", "creator"].filter((field) => typeof def?.[field] !== "string" || def[field] !== entry[field]);
  if (mismatched.length > 0) {
    return { serve: false, reason: "identity-mismatch", entry, problems: mismatched.map((field) => `${field}가 원장과 다르거나 없습니다.`) };
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
  if (!Array.isArray(entry.catalogIds) || entry.catalogIds.some((id) => !nonEmptyText(id, 200) || id.includes("+"))) {
    problems.push(`${where}: catalogIds는 이음 문자(+)가 없는 문자열 배열이어야 합니다.`);
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
  const evidenceMessages = new Set();
  for (const [evidenceIndex, evidence] of entry.evidence.entries()) {
    const found = evidenceProblems(evidence, entry, context);
    for (const problem of found) evidenceMessages.add(problem);
    problems.push(...found.map((problem) => `${where} evidence[${evidenceIndex}]: ${problem}`));
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
    // 증빙 항목 자체의 문제는 위에서 이미 항목별로 적었으므로 allow 점검에서는 중복을 뺀다.
    problems.push(...allowEligibilityProblems(ledger, entry, { now: context.now })
      .filter((problem) => !evidenceMessages.has(problem))
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
    if (!isSha256(text.sha256)) problems.push(`${where}: sha256이 64자리 소문자 16진수가 아닙니다.`);
    if (seenHashes.has(text.sha256)) problems.push(`${where}: sha256이 중복됩니다.`);
    seenHashes.add(text.sha256);
    if (!LICENSE_TEXT_CLASSES.includes(text.class)) problems.push(`${where}: class가 알려진 문서 분류가 아닙니다 (${String(text.class)}).`);
    if (!nonEmptyText(text.summary, 400)) problems.push(`${where}: summary가 비어 있습니다.`);
    if (!Array.isArray(text.files) || text.files.length === 0
      || text.files.some((file) => !isRecord(file) || typeof file.libraryPath !== "string"
        || !nonEmptyText(file.libraryPack, 200))) {
      problems.push(`${where}: files({libraryPath, libraryPack})가 비어 있습니다.`);
    }
    // zip 안에 든 사본(예: Blend Textures.zip의 LICENSE.txt)은 archivedFiles에 압축 파일 경로와 멤버 이름으로 적는다.
    if (text.archivedFiles !== undefined
      && (!Array.isArray(text.archivedFiles) || text.archivedFiles.some((file) => !isRecord(file)
        || typeof file.libraryPath !== "string" || typeof file.member !== "string"
        || !nonEmptyText(file.libraryPack, 200)))) {
      problems.push(`${where}: archivedFiles는 {libraryPath, member, libraryPack} 배열이어야 합니다.`);
    }
    for (const file of [...(Array.isArray(text.files) ? text.files : []), ...(Array.isArray(text.archivedFiles) ? text.archivedFiles : [])]) {
      if (!isRecord(file)) continue;
      // 경로는 라이브러리 루트 아래의 정규형 상대 경로여야 한다 — `a/../b`가 아래 폴더 일관성 규칙과 검증 CLI의 읽기 범위를 속인다.
      for (const [field, value, maximum] of [["libraryPath", file.libraryPath, 400], ["member", file.member, 400]]) {
        const issue = value === undefined ? null : relativePathProblem(value, maximum);
        if (issue) problems.push(`${where}: ${field}가 라이브러리 안의 상대 경로가 아닙니다 — ${issue} (${String(value).slice(0, 80)}).`);
      }
      // libraryPack은 libraryPath의 팩 폴더(`<분류>/<팩>/…`의 두 번째 조각)와 같아야 한다 — 증빙을 다른 팩에 묶는 자기 선언을 막는다.
      if (typeof file.libraryPath === "string" && typeof file.libraryPack === "string"
        && file.libraryPath.split("/")[1] !== file.libraryPack) {
        problems.push(`${where}: libraryPack(${file.libraryPack})이 libraryPath의 팩 폴더와 다릅니다 (${file.libraryPath}).`);
      }
    }
  }
  const context = { ...evidenceContext(ledger, now), now };
  const seenKeys = new Map();
  const seenIds = new Set();
  const seenCatalogIds = new Map();
  const libraryOwners = new Map();
  for (const [index, entry] of ledger.packs.entries()) {
    problems.push(...validateEntry(ledger, entry, index, context));
    if (!isRecord(entry)) continue;
    if (!nonEmptyText(entry.id, 200)) problems.push(`packs[${index}]: id가 비어 있습니다.`);
    else if (seenIds.has(entry.id)) problems.push(`packs[${index}]: id가 중복됩니다 (${entry.id}).`);
    seenIds.add(entry.id);
    const key = packRightsKey(entry);
    // 잘못된 catalogIds는 항목 검증이 이미 보고했고, 상수 키라 서로 겹쳐 보이므로 중복 검사에서 뺀다.
    if (key !== INVALID_PACK_KEY) {
      if (seenKeys.has(key)) problems.push(`packs[${index}]: 팩 키가 중복됩니다 (${key}).`);
      seenKeys.set(key, index);
    }
    for (const id of Array.isArray(entry.catalogIds) ? entry.catalogIds : []) {
      if (seenCatalogIds.has(id)) problems.push(`packs[${index}]: catalogId가 다른 항목과 겹칩니다 (${id}).`);
      seenCatalogIds.set(id, index);
    }
    // 라이브러리 폴더를 두 항목이 함께 주장하면 한 팩의 문서가 다른 팩의 증빙이 될 수 있다 — 문서화된 공유 폴더만 허용한다.
    for (const name of Array.isArray(entry.libraryPacks) ? entry.libraryPacks : []) {
      if (typeof name !== "string") continue;
      const first = libraryOwners.get(name);
      if (first === undefined) libraryOwners.set(name, index);
      else if (first !== index && !SHARED_LIBRARY_FOLDERS.includes(name)) {
        problems.push(`packs[${index}]: libraryPacks의 ${name}을 packs[${first}]도 주장합니다 — 폴더 공유는 SHARED_LIBRARY_FOLDERS에 근거와 함께 올린 곳만 허용합니다.`);
      }
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
      if (key === INVALID_PACK_KEY) {
        problems.push(`생성기 ${group} 묶음의 catalogIds가 올바르지 않습니다: ${String(def?.title)}`);
        continue;
      }
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
    if (!isRecord(entry)) continue;
    summary.total += 1;
    summary.byGroup[entry.group] = (summary.byGroup[entry.group] ?? 0) + 1;
    if (entry.serve === "allow") summary.allow += 1;
    else summary.hold += 1;
  }
  return summary;
}
