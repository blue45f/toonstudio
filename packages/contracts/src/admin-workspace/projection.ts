import type { AdminWorkspaceScope } from "./access-types";
import type { AdminWorkspace, WorkspaceRecord } from "./types";

/** 운영 기록에는 비공개 문서·원문·제출 일정의 기본값을 섞지 않는다. */
export function createOperationsWorkspace(): AdminWorkspace {
  return {
    kind: "toonstudio-admin-workspace", schemaVersion: 1,
    records: [], documents: [], mentor: [], checklist: [], approvals: [], imports: [],
    settings: { freshnessDays: 30, deadline: "", deadlineSource: "" },
  };
}

function scopedRecords(state: AdminWorkspace, scope: AdminWorkspaceScope): WorkspaceRecord[] {
  const records = state.records.filter(record => (record.module === "business") === (scope === "business"));
  const taskIds = new Set(records.filter(record => record.recordType === "task").map(record => record.id));
  return records.map(record => ({
    ...record,
    // 운영 항목에 붙은 가져오기 원문에도 사업 자료가 섞일 수 있다.
    origin: scope === "operations" ? null : record.origin,
    taskId: taskIds.has(record.taskId) ? record.taskId : "",
  }));
}

/** 숨긴 항목의 ID·원문·개수·일정도 포함하지 않는 저장/내보내기 경계다. */
export function projectWorkspaceScope(state: AdminWorkspace, scope: AdminWorkspaceScope): AdminWorkspace {
  const records = scopedRecords(state, scope);
  if (scope === "operations") return { ...createOperationsWorkspace(), records };
  const taskIds = new Set(records.filter(record => record.recordType === "task").map(record => record.id));
  return {
    ...state, records,
    mentor: state.mentor.map(item => ({ ...item, taskId: taskIds.has(item.taskId) ? item.taskId : "" })),
  };
}

/** 기존 비공개 원문이 있으면 마지막 편집자를 새 owner로 자동 간주하지 않는다. */
export function hasPrivateWorkspaceData(state: AdminWorkspace | null): boolean {
  return state !== null && (state.records.some(record => record.module === "business" || record.origin !== null)
    || state.documents.length > 0 || state.mentor.length > 0 || state.checklist.length > 0
    || state.approvals.length > 0 || state.imports.length > 0
    || state.settings.freshnessDays !== 30 || state.settings.deadline !== "" || state.settings.deadlineSource !== "");
}
