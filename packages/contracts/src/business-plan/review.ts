import { claimReviewed, freshness } from "./evidence";
import { parseDate, safeUrl, substantive } from "./primitives";

import type {
  BusinessPlanAutomaticCheck,
  BusinessPlanManualCheck,
  BusinessPlanMentorRequest,
  BusinessPlanState,
  BusinessPlanStats,
} from "./types";

export function mentorComplete(item: BusinessPlanMentorRequest, documentIds: ReadonlySet<string>): boolean {
  return item.reflected && substantive(item.evidence) && substantive(item.location) && documentIds.has(item.documentId);
}

export function manualComplete(item: BusinessPlanManualCheck): boolean {
  return item.checked && (Boolean(safeUrl(item.evidenceUrl)) || substantive(item.note));
}

/** 기록의 충족 여부만 계산한다. 제출 승인·접수나 외부 사실을 자동 판정하지 않는다. */
export function getChecks(state: Partial<BusinessPlanState> = {}, now: Date = new Date()): BusinessPlanAutomaticCheck[] {
  const tasks = state.tasks ?? [];
  const claims = state.claims ?? [];
  const documents = state.documents ?? [];
  const mentor = state.mentor ?? [];
  const checks = state.checks ?? [];
  const deadlines = state.project?.deadlines ?? [];
  const documentIds = new Set(documents.map((item) => item.id));
  const evidenced = claims.filter((item) => claimReviewed(item, now));
  const fresh = claims.filter((item) => freshness(item, now).level === "good");
  const conflicts = claims.filter((item) => item.factStatus === "출처 상충");
  const working = documents.filter((item) => substantive(item.workingText));
  const snapshots = documents.filter((item) => item.submission && substantive(item.submission.text)
    && substantive(item.submission.label) && parseDate(item.submission.createdAt));
  const matching = documents.filter((item) => item.submission && substantive(item.workingText)
    && item.workingText === item.submission.text);
  const reflected = mentor.filter((item) => mentorComplete(item, documentIds));
  const finalTasks = tasks.filter((item) => item.status === "최종 확인");
  const manual = checks.filter(manualComplete);
  const verifiedDeadlines = deadlines.filter((item) => item.verified && safeUrl(item.sourceUrl) && parseDate(item.at)?.exact);
  return [
    { id: "auto-evidence", title: "주장별 근거 확인", pass: claims.length > 0 && evidenced.length === claims.length,
      detail: `${evidenced.length}/${claims.length}개 주장에 필수 근거와 검증 기록이 있습니다. 전망은 가정·산식을 검토합니다.`, target: "claims" },
    { id: "auto-freshness", title: "근거 최신성", pass: claims.length > 0 && fresh.length === claims.length,
      detail: `${fresh.length}/${claims.length}개 주장이 검토 주기와 날짜 검사를 통과했습니다.`, target: "claims" },
    { id: "auto-conflicts", title: "출처 간 상충 해소", pass: conflicts.length === 0,
      detail: conflicts.length ? `출처가 상충하는 주장 ${conflicts.length}개를 확인해 주세요.` : "출처 상충으로 표시된 주장이 없습니다.", target: "claims" },
    { id: "auto-working", title: "작업용 문서 원문 등록", pass: documents.length > 0 && working.length === documents.length,
      detail: `${working.length}/${documents.length}개 문서에 작업용 원문이 등록되었습니다.`, target: "documents" },
    { id: "auto-submission", title: "제출용 버전 준비", pass: documents.length > 0 && snapshots.length === documents.length,
      detail: `${snapshots.length}/${documents.length}개 문서에 이름과 생성일이 있는 제출용 버전이 있습니다.`, target: "documents" },
    { id: "auto-version-match", title: "작업용·제출용 내용 일치", pass: documents.length > 0 && matching.length === documents.length,
      detail: `${matching.length}/${documents.length}개 문서의 최신 작업 내용이 제출용에 반영되었습니다.`, target: "documents" },
    { id: "auto-mentor", title: "멘토 요청사항 반영 근거", pass: mentor.length > 0 && reflected.length === mentor.length,
      detail: mentor.length ? `${reflected.length}/${mentor.length}개 요청에 반영 표시·근거·문서 위치가 있습니다.` : "멘토 요청 원문과 확인할 항목을 등록해 주세요.", target: "mentor" },
    { id: "auto-tasks", title: "보완 항목 최종 확인", pass: tasks.length > 0 && finalTasks.length === tasks.length,
      detail: `${finalTasks.length}/${tasks.length}개 보완 항목이 최종 확인 상태입니다.`, target: "tasks" },
    { id: "auto-manual", title: "제출 전 수동 점검 기록", pass: checks.length > 0 && manual.length === checks.length,
      detail: `${manual.length}/${checks.length}개 점검에 완료 표시와 근거 링크 또는 확인 메모가 있습니다.`, target: "review" },
    { id: "auto-deadlines", title: "공식 제출 일정 확인", pass: deadlines.length > 0 && verifiedDeadlines.length === deadlines.length,
      detail: `${verifiedDeadlines.length}/${deadlines.length}개 일정에 공식 출처와 확인 표시가 있습니다.`, target: "review" },
  ];
}

export function stats(state: Partial<BusinessPlanState> = {}, now: Date = new Date()): BusinessPlanStats {
  const tasks = state.tasks ?? [];
  const claims = state.claims ?? [];
  const mentor = state.mentor ?? [];
  const documentIds = new Set((state.documents ?? []).map((item) => item.id));
  const verifiedClaims = claims.filter((item) => claimReviewed(item, now)).length;
  return {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((item) => ["보완 완료", "최종 확인"].includes(item.status)).length,
    finalTasks: tasks.filter((item) => item.status === "최종 확인").length,
    unknownClaims: claims.length - verifiedClaims,
    staleClaims: claims.filter((item) => ["warn", "danger"].includes(freshness(item, now).level)).length,
    verifiedClaims,
    mentorDone: mentor.filter((item) => mentorComplete(item, documentIds)).length,
    mentorTotal: mentor.length,
    approvalCount: (state.approvals ?? []).filter((item) => item.status === "승인 대기").length,
    blockers: getChecks(state, now).filter((item) => !item.pass).length,
  };
}
