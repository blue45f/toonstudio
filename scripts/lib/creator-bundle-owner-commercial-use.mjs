/**
 * 2026-10-29 소유자 결정에 따른 ToonStudio 프로젝트 이용 확인의 형식·범위 계약.
 * 구매자의 서비스 사용 결정이며 제작자의 추가 라이선스 허여·CC0·원본 팩 재판매 허가가 아니다.
 * 문서/구매 확인의 진위를 판정하거나 원본 라이선스 조건을 변경하지 않는다.
 */
import { dateProblem, isRecord, nonEmptyText, refProblem } from "./creator-bundle-pack-rights-form.mjs";

export const OWNER_COMMERCIAL_USE_EVIDENCE_KIND = "owner-commercial-use-confirmation";
export const OWNER_COMMERCIAL_USE_SCOPE = "toonstudio-in-service-commercial-project-use";
export const OWNER_COMMERCIAL_USE_DECISION_REF = "docs/studio/itch-purchased-commercial-use-owner-decision-20261029.md";
export const OWNER_COMMERCIAL_USE_CONFIRMED_AT = "2026-10-29";
export const OWNER_COMMERCIAL_USE_LICENSE_NAME = "구매 번들 ToonStudio 상업적 프로젝트 사용 (소유자 확인)";

/** 구매 확인은 같은 팩에 이미 연결된 유효 purchase-receipt여야 한다. producer 증빙으로 바꾸지 않는다. */
export function ownerCommercialUseEvidenceProblems(evidence, entry, { today, purchaseEvidenceValid }) {
  const where = `증빙 ${OWNER_COMMERCIAL_USE_EVIDENCE_KIND}`;
  const problems = [];
  for (const field of ["verifiedAt", "confirmedAt"]) {
    const problem = dateProblem(where, field, evidence[field], today);
    if (problem) problems.push(problem);
  }
  if (evidence.confirmedAt !== OWNER_COMMERCIAL_USE_CONFIRMED_AT) {
    problems.push(`${where}: confirmedAt은 소유자 결정일 ${OWNER_COMMERCIAL_USE_CONFIRMED_AT}이어야 합니다.`);
  }
  if (typeof evidence.verifiedAt === "string" && evidence.verifiedAt < OWNER_COMMERCIAL_USE_CONFIRMED_AT) {
    problems.push(`${where}: verifiedAt은 소유자 결정일보다 앞설 수 없습니다.`);
  }
  if (!nonEmptyText(entry.id, 200) || evidence.packId !== entry.id) {
    problems.push(`${where}: packId는 현재 원장 팩 id와 정확히 같아야 합니다.`);
  }
  if (evidence.scope !== OWNER_COMMERCIAL_USE_SCOPE) {
    problems.push(`${where}: scope는 ${OWNER_COMMERCIAL_USE_SCOPE}이어야 합니다.`);
  }
  if (evidence.decisionRef !== OWNER_COMMERCIAL_USE_DECISION_REF) {
    problems.push(`${where}: decisionRef는 이번 소유자 결정 문서 ${OWNER_COMMERCIAL_USE_DECISION_REF}이어야 합니다.`);
  }
  const purchaseIssue = refProblem(evidence.purchaseRef);
  if (purchaseIssue) problems.push(`${where}: purchaseRef가 올바르지 않습니다 — ${purchaseIssue}.`);
  const purchase = Array.isArray(entry.evidence) ? entry.evidence.filter((item) => isRecord(item)
    && item.kind === "purchase-receipt" && item.ref === evidence.purchaseRef) : [];
  if (!purchase.some(purchaseEvidenceValid)) {
    problems.push(`${where}: purchaseRef와 일치하는 유효 purchase-receipt가 같은 팩에 있어야 합니다.`);
  }
  return problems;
}

/** 공개 분류는 licensed만 쓴다. 소유자 확인을 public-domain/CC0나 제작사 허가로 표시하지 않는다. */
export function ownerCommercialUseGrantProblems(entry) {
  if (!Array.isArray(entry?.evidence) || !entry.evidence.some((item) => isRecord(item) && item.kind === OWNER_COMMERCIAL_USE_EVIDENCE_KIND)) return [];
  const problems = [];
  if (entry.grant?.status !== "licensed") problems.push("소유자 상업 이용 확인의 grant.status는 licensed여야 합니다 (CC0/public-domain 승격 불가).");
  if (entry.grant?.commercialUse !== true) problems.push("소유자 상업 이용 확인의 grant.commercialUse는 true여야 합니다.");
  if (entry.grant?.licenseName !== OWNER_COMMERCIAL_USE_LICENSE_NAME) {
    problems.push(`소유자 상업 이용 확인의 grant.licenseName은 ${OWNER_COMMERCIAL_USE_LICENSE_NAME}이어야 합니다.`);
  }
  if (entry.grant?.downloadable === true || entry.grant?.redistributionAllowed === true || entry.grant?.inServiceOnly === false) {
    problems.push("소유자 상업 이용 확인은 서비스 밖 원본 다운로드·재배포 허가로 확장할 수 없습니다.");
  }
  return problems;
}
