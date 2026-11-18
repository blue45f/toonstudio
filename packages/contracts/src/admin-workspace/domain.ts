import { assessWorkspaceEvidenceSet } from "./evidence";
import { WORKSPACE_APPROVAL_TYPES } from "./types";
import { parseAdminWorkspace, workspaceDate, workspaceEvidenceIssues, workspaceDataEqual as workspaceEqual, WORKSPACE_EXECUTION_CATEGORIES } from "./validation";

import type {
  AdminWorkspace, WorkspaceBasis, WorkspaceDocument, WorkspaceFreshness, WorkspaceGate,
  WorkspaceModule, WorkspaceRecord, WorkspaceResult, WorkspaceSnapshot, WorkspaceMentorItem,
} from "./types";

export function createWorkspaceRecord(id: string, module: WorkspaceModule, recordType: WorkspaceRecord["recordType"]): WorkspaceRecord {
  return {
    id, module, recordType, taskId: "", project: "ToonStudio", title: "새 작업", category: "", status: "초안", factStatus: "미확인",
    owner: "", assignment: "", nextAction: "", notes: "", text: "", kind: "일반", value: null, unit: "", period: "", scope: "",
    sourceTitle: "", sourceUrl: "", sourceDate: "", quote: "", secondSourceTitle: "", secondSourceUrl: "", verifiedAt: "", reviewer: "",
    verificationNote: "", formula: "", assumptions: "", freshnessDays: module === "business" ? 30 : 7,
    localSha: "", remoteSha: "", mainSha: "", deployedSha: "", approvalOnly: false, approvalReason: "", origin: null,
  };
}
export function createAdminWorkspace(): AdminWorkspace {
  const tasks = [
    ["문제 인식", "고객·문제", "문제 정의와 실제 제작 사례 정리"],
    ["고객 설득 근거", "고객·문제", "인터뷰·관찰·수요 증거와 주장 연결"],
    ["웹툰 제작 공정별 기존 도구 비교", "제작 공정", "제품·버전·조건별 공식 근거 대조"],
    ["도구 간 연결이 끊기는 지점과 실제 병목", "제작 공정", "도구 전환·정보 손실·재작업 사례 확인"],
    ["스케치업·블렌더 통합 제공 계획", "제작 공정", "현재 제공 기능과 향후 계획 구분"],
    ["매출·벤치마크 재검증", "시장·매출", "매출 정의·통화·기간·비교 조건 재확인"],
    ["마케팅·통계 사실관계 보완", "시장·매출", "조사 범위·표본·기간·원문 대조"],
    ["시장·매출 지표 교차검증", "시장·매출", "독립 원출처의 지표 정의·단위·범위 대조"],
    ["캡처 최신화", "제출 준비", "촬영일·대상 버전·원본 링크 확인"],
    ["제출 양식 재포맷", "제출 준비", "공식 양식·분량·필수 항목 확인"],
    ["멘토 피드백 반영 여부", "제출 준비", "요청 원문·반영 위치·증거 확인"],
  ].map(([title, category, assignment], index): WorkspaceRecord => ({
    ...createWorkspaceRecord(`task-${String(index + 1).padStart(2, "0")}`, "business", "task"), title, category, assignment,
    nextAction: "원문 근거와 담당자를 연결하고 사실 확인 범위를 기록하세요.",
  }));
  const claimDefinitions: [string, WorkspaceRecord["kind"], string][] = [
    ["문제·병목에 관한 주장 확인", "일반", "task-01"], ["고객 수요·설득 근거 확인", "일반", "task-02"],
    ["공정별 기존 도구 비교 확인", "비교", "task-03"], ["도구 전환의 실제 병목 확인", "일반", "task-04"],
    ["통합 제공 범위·계획 표현 확인", "일반", "task-05"], ["매출·벤치마크 수치 확인", "숫자", "task-06"],
    ["마케팅·통계 수치 확인", "숫자", "task-07"], ["시장 규모·지표 교차검증", "시장 규모", "task-08"],
    ["매출 전망·가정·산식 확인", "매출 전망", "task-08"],
  ];
  return {
    kind: "toonstudio-admin-workspace", schemaVersion: 1,
    records: [...tasks, ...claimDefinitions.map(([title, kind, taskId], index) => ({ ...createWorkspaceRecord(`claim-${String(index + 1).padStart(2, "0")}`, "business", "claim"), title, kind, taskId }))],
    documents: ["사업계획서", "공정별 도구 비교표", "매출·시장 지표 근거", "멘토 반영표"].map((title, index) => ({ id: `doc-${index + 1}`, title, purpose: "submission", working: { label: "작업본 v0.1", url: "", content: "", updatedAt: "" }, submission: null, history: [] })),
    mentor: ["문제 인식을 실제 제작 사례로 구체화", "고객 설득 근거와 원문 연결", "공정별 기존 도구를 같은 기준으로 비교", "도구 간 연결 단절과 실제 병목 표시", "스케치업·블렌더 통합 제공 계획 구분", "매출·통계 검증과 제출 문서 반영 확인"].map((text, index) => ({ id: `mentor-${index + 1}`, text, taskId: `task-${String(index < 5 ? index + 1 : 11).padStart(2, "0")}`, status: "미반영", source: "", location: "", evidence: "", notes: "사용자 요청으로 만든 점검 항목이며 멘토 원문 연결이 필요합니다." })),
    checklist: ["공식 제출 양식·필수 항목·분량", "제출 마감·시간대·공식 안내", "숫자·기간·단위·통화의 문서 간 일치", "비교표의 제품·버전·검증 조건", "캡처 원본·촬영일·대상 버전", "첨부파일·파일명·페이지 누락", "개인정보·링크 접근성·오탈자", "제출 후보와 최신 작업본의 일치"].map((label, index) => ({ id: `check-${index + 1}`, label, done: false, source: "", notes: "", verifiedAt: "" })),
    approvals: WORKSPACE_APPROVAL_TYPES.map((type, index) => ({ id: `approval-${index + 1}`, type, title: `${type} 승인 대기`, description: "대상·이유·영향을 기록합니다. 이 보드는 외부 작업을 실행하지 않습니다.", status: "승인 대기", notes: "" })),
    imports: [], settings: { freshnessDays: 30, deadline: "", deadlineSource: "" },
  };
}
export { workspaceDataEqual as workspaceEqual } from "./validation";
export function workspaceFreshness(record: WorkspaceRecord, now = new Date()): WorkspaceFreshness {
  const checked = workspaceDate(record.verifiedAt);
  if (!record.verifiedAt) return { label: "검증일 미입력", tone: "neutral", ageDays: null };
  if (checked === null || !Number.isFinite(now.getTime())) return { label: "검증일 오류", tone: "bad", ageDays: null };
  const ageDays = Math.floor((now.getTime() - checked) / 86_400_000);
  if (ageDays < 0) return { label: "미래 검증일", tone: "bad", ageDays };
  if (record.factStatus !== "확인") return { label: "현재 사실 미확인", tone: "neutral", ageDays };
  if (workspaceEvidenceIssues(record, now).length) return { label: "검증 근거 불완전", tone: "bad", ageDays };
  if (record.evidence?.length) {
    if (!record.evidenceTarget) return { label: "실행·배포 대조 대상 미입력", tone: "warn", ageDays };
    const assessment = assessWorkspaceEvidenceSet(record.evidence, record.evidenceTarget, now);
    if (!assessment.current) return { label: "실행·배포 증거 재확인 필요", tone: assessment.status === "failed" ? "bad" : "warn", ageDays };
  }
  return now.getTime() - checked > record.freshnessDays * 86_400_000 ? { label: `${record.freshnessDays}일 경과 · 재확인 필요`, tone: "warn", ageDays }
    : { label: "현재 근거 확인", tone: "good", ageDays };
}
const MATERIAL_FIELDS: (keyof WorkspaceRecord)[] = ["title", "text", "kind", "value", "unit", "period", "scope", "category", "assignment", "sourceTitle", "sourceUrl", "sourceDate", "quote", "secondSourceTitle", "secondSourceUrl", "formula", "assumptions", "verificationNote", "localSha", "remoteSha", "mainSha", "deployedSha", "evidence", "evidenceTarget", "changeIdentity"];
const IMMUTABLE_FIELDS: (keyof WorkspaceRecord)[] = ["id", "module", "recordType", "origin", "approvalOnly", "approvalReason"];
function materialChanged(previous: WorkspaceRecord, next: WorkspaceRecord): boolean { return MATERIAL_FIELDS.some(key => !workspaceEqual(previous[key], next[key])); }
function error<T>(errors: string[]): WorkspaceResult<T> { return { ok: false, value: null, errors }; }
export function validateWorkspaceTransition(previous: AdminWorkspace | null, next: AdminWorkspace, now = new Date()): string[] {
  const errors: string[] = [];
  const beforeRecords = new Map(previous?.records.map(record => [record.id, record]));
  for (const record of next.records) {
    const before = beforeRecords.get(record.id);
    if (!before) {
      if (record.factStatus === "확인" || record.status === "최종 확인") errors.push(`${record.title}: 새 기록과 가져온 기록은 미확인으로 등록한 뒤 근거를 재검증하세요.`);
      continue;
    }
    for (const key of IMMUTABLE_FIELDS) {
      const initial = key === "origin" && before.origin === null && record.origin !== null
        && createAdminWorkspace().records.some(item => workspaceEqual(item, before));
      if (!initial && !workspaceEqual(before[key], record[key])) errors.push(`${record.title}: 원문 연결과 승인 제한은 변경할 수 없습니다.`);
    }
    if (before.changeIdentity?.source && !workspaceEqual(before.changeIdentity.source, record.changeIdentity?.source)) errors.push(`${record.title}: 보존한 원본 보드·항목 참조는 변경할 수 없습니다.`);
    if ((before.factStatus === "확인" || before.status === "최종 확인") && materialChanged(before, record)
      && (record.factStatus !== "미확인" || record.verifiedAt !== "" || record.status === "최종 확인")) errors.push(`${record.title}: 주장·근거가 바뀌면 현재 검증을 해제해야 합니다.`);
    if (record.status === "최종 확인" && before.status !== "최종 확인" && workspaceFreshness(record, now).tone !== "good") errors.push(`${record.title}: 최신 검증 근거가 있어야 최종 확인할 수 있습니다.`);
  }
  if (previous) {
    for (const record of previous.records) if (!next.records.some(item => item.id === record.id)) errors.push(`${record.title}: 기록을 삭제할 수 없습니다. 제외 사유를 기록하세요.`);
    for (const imported of previous.imports) if (!next.imports.some(item => workspaceEqual(item, imported))) errors.push("기존 가져오기 원문과 이력은 보존해야 합니다.");
    for (const approval of previous.approvals) {
      const after = next.approvals.find(item => item.id === approval.id);
      if (!after || after.type !== approval.type || after.status !== "승인 대기") errors.push("기존 외부 작업 승인 제한을 해제하거나 삭제할 수 없습니다.");
    }
    for (const mentor of previous.mentor) {
      const after = next.mentor.find(item => item.id === mentor.id);
      if (!after) { errors.push("기존 멘토 요청을 삭제할 수 없습니다."); continue; }
      const material: (keyof WorkspaceMentorItem)[] = ["text", "taskId", "source", "location", "evidence"];
      if (mentor.status === "반영 완료" && material.some(key => mentor[key] !== after[key]) && after.status === "반영 완료") errors.push(`${mentor.text}: 요청·반영 근거가 바뀌면 반영 완료를 해제해야 합니다.`);
    }
    for (const check of previous.checklist) {
      const after = next.checklist.find(item => item.id === check.id);
      if (!after) { errors.push("기존 제출 점검을 삭제할 수 없습니다."); continue; }
      if (check.done && (check.label !== after.label || check.source !== after.source) && (after.done || after.verifiedAt !== "")) errors.push(`${check.label}: 점검 기준·근거가 바뀌면 완료와 검증일을 해제해야 합니다.`);
    }
    for (const document of previous.documents) {
      const after = next.documents.find(item => item.id === document.id);
      if (!after) { errors.push(`${document.title}: 문서 기록을 삭제할 수 없습니다.`); continue; }
      const candidates = [...after.history, ...(after.submission ? [after.submission] : [])];
      for (const snapshot of [...document.history, ...(document.submission ? [document.submission] : [])]) {
        if (!candidates.some(item => workspaceEqual(snapshot, item))) errors.push(`${document.title}: 고정한 제출본·변경 이력은 수정하거나 제거할 수 없습니다.`);
      }
    }
  }
  return [...new Set(errors)].slice(0, 100);
}
export function updateWorkspaceRecord(state: AdminWorkspace, patch: Partial<WorkspaceRecord> & { id: string }, now = new Date()): WorkspaceResult<AdminWorkspace> {
  const previous = state.records.find(record => record.id === patch.id);
  if (!previous) return error(["수정할 작업을 찾을 수 없습니다."]);
  const next: WorkspaceRecord = { ...previous, ...patch };
  if ((previous.factStatus === "확인" || previous.status === "최종 확인") && materialChanged(previous, next)) {
    next.factStatus = "미확인"; next.verifiedAt = "";
    if (next.status === "최종 확인") next.status = next.approvalOnly ? "승인 대기" : "검토 필요";
  }
  if (next.approvalOnly || WORKSPACE_EXECUTION_CATEGORIES.has(next.category)) next.status = "승인 대기";
  const result = parseAdminWorkspace({ ...state, records: state.records.map(record => record.id === next.id ? next : record) }, now);
  if (!result.ok) return result;
  const errors = validateWorkspaceTransition(state, result.value, now);
  return errors.length ? error(errors) : result;
}
function currentBasis(state: AdminWorkspace, document: WorkspaceDocument): WorkspaceBasis {
  return { document: { id: document.id, title: document.title, purpose: document.purpose }, records: state.records.filter(record => record.module === "business"), mentor: state.mentor, checklist: state.checklist, settings: state.settings };
}
export function workspaceSubmissionChanges(document: WorkspaceDocument, state: AdminWorkspace): string[] {
  if (!document.submission) return ["제출 후보가 없습니다."];
  const changes: string[] = [];
  if (document.working.label !== document.submission.label || document.working.content !== document.submission.content || document.working.url !== document.submission.url) changes.push("작업본 버전·내용·링크가 고정 후 변경되었습니다.");
  if (!document.submission.basis) changes.push("제출본의 근거·멘토·최종 점검 고정 기록이 없습니다.");
  else if (!workspaceEqual(document.submission.basis, currentBasis(state, document))) changes.push("주장·검증 근거·멘토 반영·최종 점검이 고정 후 변경되었습니다.");
  return changes;
}
export function freezeWorkspaceDocument(state: AdminWorkspace, documentId: string, snapshotId: string, now = new Date()): WorkspaceResult<AdminWorkspace> {
  const document = state.documents.find(item => item.id === documentId);
  if (!document) return error(["문서를 찾을 수 없습니다."]);
  if (!document.working.content.trim() && !document.working.url.trim()) return error(["내용이나 원문 링크가 있는 작업본만 고정할 수 있습니다."]);
  const snapshot: WorkspaceSnapshot = { ...document.working, id: snapshotId, frozenAt: now.toISOString(), status: "승인 대기", basis: structuredClone(currentBasis(state, document)) };
  const result = parseAdminWorkspace({ ...state, documents: state.documents.map(item => item.id === documentId ? { ...item, submission: snapshot, history: [...item.history, ...(item.submission ? [item.submission] : [])] } : item) }, now);
  if (!result.ok) return result;
  const errors = validateWorkspaceTransition(state, result.value, now); return errors.length ? error(errors) : result;
}
export function workspacePreflight(state: AdminWorkspace, now = new Date()): WorkspaceGate[] {
  const business = state.records.filter(record => record.module === "business");
  const claims = business.filter(record => record.recordType === "claim" && record.factStatus !== "제외");
  const tasks = business.filter(record => record.recordType === "task" && !record.approvalOnly);
  const documents = state.documents.filter(document => document.purpose === "submission");
  const gate = (id: string, title: string, count: number, detail: string, severity: "warn" | "bad" = "bad"): WorkspaceGate => ({ id, title, count, detail, tone: count ? severity : "good" });
  return [
    gate("coverage", "필수 작업·검증 목록", [tasks, claims, documents, state.mentor, state.checklist, state.approvals].filter(collection => !collection.length).length, "빈 필수 목록이나 모두 제외된 주장은 준비 완료로 처리하지 않습니다."),
    gate("unverified", "주장 사실 확인", claims.filter(record => record.factStatus !== "확인").length, "출처·범위·검증 기록이 확인되지 않은 수치는 미확인입니다."),
    gate("evidence", "주장 근거 완결성", claims.filter(record => record.factStatus === "확인" && workspaceEvidenceIssues(record, now).length).length, "수치·시장 규모·전망·비교 조건과 독립 출처를 확인합니다."),
    gate("freshness", "검증 최신성", claims.filter(record => record.factStatus === "확인" && workspaceFreshness(record, now).tone !== "good").length, "설정한 재확인 기한을 지난 주장은 재검증이 필요합니다."),
    gate("tasks", "작업 최종 확인", tasks.filter(record => record.status !== "최종 확인" || workspaceFreshness(record, now).tone !== "good").length, "사업계획의 항목별 최종 상태와 현재 근거를 확인합니다."),
    gate("documents", "제출 후보·작업본 일치", documents.filter(document => workspaceSubmissionChanges(document, state).length || (!document.working.content.trim() && !document.working.url.trim())).length, "원문과 제출 후보가 있어야 하며 고정 후 달라진 근거를 반영해야 합니다."),
    gate("mentor", "멘토 요청 반영", state.mentor.filter(item => item.status !== "반영 완료" || !item.source.trim() || !item.location.trim() || !item.evidence.trim()).length, "요청 원문·반영 위치·증거를 함께 기록합니다."),
    gate("checklist", "최종 누락·오류 점검", state.checklist.filter(item => !item.done || !item.source.trim() || workspaceDate(item.verifiedAt) === null || (workspaceDate(item.verifiedAt) ?? Infinity) > now.getTime()).length, "완료 표시와 확인 근거·검증일이 모두 필요합니다."),
    gate("deadline", "공식 마감 안내", state.settings.deadline && state.settings.deadlineSource.trim() ? 0 : 1, "공식 안내에서 마감일과 시간대를 확인하세요."),
    gate("operations", "운영 기록 재검증", state.records.filter(record => record.module !== "business" && !record.approvalOnly && record.factStatus !== "제외" && workspaceFreshness(record, now).tone !== "good").length, "가져온 운영 자료의 과거 상태를 현재 확인으로 승격하지 않습니다.", "warn"),
    gate("approvals", "외부 작업 승인 대기", state.approvals.length + state.records.filter(record => record.approvalOnly).length, "코드 수정·제출·계정 변경·배포는 기록만 관리하며 실행하지 않습니다.", "warn"),
  ];
}
