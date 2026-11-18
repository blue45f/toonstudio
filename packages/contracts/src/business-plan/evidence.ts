import { dayNumber, isFuture, isLater, parseDate, plain, safeUrl, sourceIdentity, substantive, text, todayKst } from "./primitives";
import { FACT_STATUS } from "./types";

import type {
  BusinessPlanClaim,
  BusinessPlanEffectiveFactStatus,
  BusinessPlanFreshness,
  BusinessPlanValidationResult,
} from "./types";

export function freshness(claim: Partial<BusinessPlanClaim> = {}, now: Date = new Date()): BusinessPlanFreshness {
  if (!Number.isFinite(now.getTime())) return { level: "unknown", label: "날짜 확인 필요", detail: "현재 날짜를 계산할 수 없습니다." };
  if (!text(claim.verifiedAt)) return { level: "unknown", label: "검증일 없음", detail: "원문을 확인한 날짜를 기록해 주세요." };
  const verified = parseDate(claim.verifiedAt);
  if (!verified) return { level: "danger", label: "검증일 오류", detail: "유효한 날짜 또는 시간대가 있는 ISO 날짜를 입력해 주세요." };
  if (isFuture(verified, now)) return { level: "danger", label: "미래 검증일", detail: "현재보다 미래인 날짜로 확인 완료를 기록할 수 없습니다." };
  const published = text(claim.publishedAt) ? parseDate(claim.publishedAt) : null;
  if (text(claim.publishedAt) && !published) return { level: "danger", label: "발행일 오류", detail: "원문 발행일 형식을 다시 확인해 주세요." };
  if (published && isLater(published, verified)) {
    return { level: "danger", label: "발행 후 재확인 필요", detail: "등록된 원문의 발행일이 검증일보다 늦습니다." };
  }
  const updated = parseDate(claim.updatedAt);
  if (updated && isLater(updated, verified)) {
    return { level: "warn", label: "검증 후 변경", detail: "내용이 검증 이후 수정되었습니다. 변경 내용을 다시 확인해 주세요." };
  }
  const reviewDays = claim.reviewDays ?? 30;
  if (!Number.isInteger(reviewDays) || reviewDays < 1 || reviewDays > 365) {
    return { level: "warn", label: "검토 주기 확인", detail: "검토 주기는 1~365일로 설정해 주세요." };
  }
  const age = dayNumber(todayKst(now)) - verified.dayCount;
  if (age >= reviewDays) return { level: "warn", label: "재확인 필요", detail: `검증 후 ${age}일 경과 · 관리 기준 ${reviewDays}일` };
  return { level: "good", label: "최신성 기준 충족", detail: `검증 후 ${age}일 경과 · 관리 기준 ${reviewDays}일` };
}

export function claimIssues(claim: Partial<BusinessPlanClaim> = {}, now: Date = new Date()): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(now.getTime())) issues.push("검증 기준 시각이 올바르지 않습니다.");
  if (!substantive(claim.text) && !substantive(claim.title)) issues.push("검증할 주장 원문이 없습니다.");
  if (!safeUrl(claim.sourceUrl)) issues.push("유효한 원문 출처 링크가 필요합니다.");
  const required = [
    ["sourceTitle", "원문 제목"], ["publisher", "발행 주체"], ["sourceLocation", "원문 페이지·표·문단 위치"],
    ["originalExcerpt", "원문 확인 내용"], ["reviewer", "검증 담당자"],
  ] as const;
  for (const [field, label] of required) if (!substantive(claim[field])) issues.push(`${label}을 기록해 주세요.`);
  const verified = parseDate(claim.verifiedAt);
  if (!verified) issues.push("유효한 검증일이 필요합니다.");
  else if (isFuture(verified, now)) issues.push("검증일이 현재보다 미래입니다.");
  if (text(claim.publishedAt)) {
    const published = parseDate(claim.publishedAt);
    if (!published) issues.push("원문 발행일이 유효하지 않습니다.");
    else if (isFuture(published, now)) issues.push("원문 발행일이 현재보다 미래입니다.");
    else if (verified && isLater(published, verified)) issues.push("원문 발행 이후의 검증일로 다시 확인해 주세요.");
  }
  if (claim.kind && ["수치", "시장 규모", "매출 전망"].includes(claim.kind)) {
    const numericalFields = [["value", "확인한 수치"], ["unit", "단위"], ["period", "기준 기간"], ["scope", "지표 범위·정의"]] as const;
    for (const [field, label] of numericalFields) {
      if (!substantive(claim[field])) issues.push(`${label}가 필요합니다.`);
    }
  }
  if (claim.kind === "비교표" && !substantive(claim.scope)) issues.push("비교 기준·대상·범위를 기록해 주세요.");
  if (claim.kind === "시장 규모" || claim.kind === "매출 전망") {
    if (!safeUrl(claim.crossSourceUrl)) issues.push("교차검증할 별도 출처 링크가 필요합니다.");
    else if (sourceIdentity(claim.crossSourceUrl) === sourceIdentity(claim.sourceUrl)) issues.push("교차검증 출처가 원문과 같습니다. 별도 근거를 연결해 주세요.");
    if (!substantive(claim.crossSourceTitle)) issues.push("교차검증 출처 제목을 기록해 주세요.");
    if (!substantive(claim.crossNotes)) issues.push("교차검증의 범위·기간·단위 일치 여부와 독립성을 기록해 주세요.");
  }
  if (claim.kind === "매출 전망") {
    if (!substantive(claim.assumptions)) issues.push("매출 전망의 가정이 필요합니다.");
    if (!substantive(claim.formula)) issues.push("매출 전망의 산식이 필요합니다.");
  }
  const reviewDays = claim.reviewDays ?? 30;
  if (!Number.isInteger(reviewDays) || reviewDays < 1 || reviewDays > 365) issues.push("검토 주기는 1~365일이어야 합니다.");
  return issues;
}

export function effectiveFact(claim: Partial<BusinessPlanClaim> = {}, now: Date = new Date()): BusinessPlanEffectiveFactStatus {
  if (claim.factStatus !== "근거 확인") {
    return claim.factStatus && FACT_STATUS.includes(claim.factStatus) ? claim.factStatus : "미확인";
  }
  if (claimIssues(claim, now).length) return "근거 부족";
  return claim.kind === "매출 전망" ? "가정·산식 검토" : "근거 확인";
}

export function validateClaim(claim: unknown, now: Date = new Date()): BusinessPlanValidationResult {
  if (!plain(claim)) return { ok: false, errors: ["주장 데이터 형식이 올바르지 않습니다."] };
  if (!FACT_STATUS.some((status) => status === claim.factStatus)) return { ok: false, errors: ["사실 확인 상태를 선택해 주세요."] };
  // 이 함수는 근거 요건 검사다. 전체 필드의 타입·참조는 validateImport가 검사한다.
  const errors = claim.factStatus === "근거 확인" ? claimIssues(claim, now) : [];
  return { ok: errors.length === 0, errors };
}

export function claimReviewed(claim: BusinessPlanClaim, now: Date): boolean {
  return ["근거 확인", "가정·산식 검토"].includes(effectiveFact(claim, now));
}
