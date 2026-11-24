import { CLOUD_WORKBOARD_JSON_LIMIT, boardSchema, currentRisk, duplicateNotes, effectiveStage, freshness, sourceAuditSchema } from "@toonstudio/contracts/admin-cloud-workboard";

import type { Board, Task } from "@toonstudio/contracts/admin-cloud-workboard";

export const CLOUD_WORK_IMPORT_LIMIT = CLOUD_WORKBOARD_JSON_LIMIT;
export const VIEW_NAMES = { board: "전체 작업", compare: "변경 비교", verification: "검증 단계", approvals: "승인 대기", activity: "활동 기록" } as const;
export type WorkView = keyof typeof VIEW_NAMES;
export const RISK_FILTERS = ["모든 신호", "위험 감지", "충돌 감지", "회귀 감지", "CI 실패", "배포 차단", "증빙 미확인·오래됨", "중복 검토"] as const;
export interface WorkFilters { project: string; stage: string; risk: string; query: string }
export const DEFAULT_FILTERS: WorkFilters = { project: "전체 프로젝트", stage: "전체 상태", risk: "모든 신호", query: "" };

export function filterWorkTasks(tasks: Task[], filters: WorkFilters, now: number): Task[] {
  const signals: Record<string, keyof Task["risks"]> = { "충돌 감지": "conflict", "회귀 감지": "regression", "CI 실패": "ciFailure", "배포 차단": "deployBlock" };
  const query = filters.query.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    if (filters.project !== "전체 프로젝트" && task.project !== filters.project) return false;
    if (filters.stage !== "전체 상태" && effectiveStage(task, now) !== filters.stage) return false;
    if (filters.risk === "위험 감지" && !Object.keys(task.risks).some(key => currentRisk(task, key as keyof Task["risks"], now) === "감지")) return false;
    const signal = signals[filters.risk];
    if (signal && currentRisk(task, signal, now) !== "감지") return false;
    if (filters.risk === "증빙 미확인·오래됨" && freshness(task, now) === "24시간 내 확인") return false;
    if (filters.risk === "중복 검토" && !duplicateNotes(task, tasks).length) return false;
    return !query || [task.id, task.project, task.title, task.owner, task.localBranch, task.remoteBranch, task.localSha,
      task.remoteSha, task.mainSha, task.mergeSha, task.baseBranch, task.pr, task.changeKey, task.nextAction].join(" ").toLocaleLowerCase().includes(query);
  });
}

export function mergeWorkImport(current: Board, incoming: Board): Board {
  const byId = new Map(current.tasks.map(task => [task.id, task]));
  incoming.tasks.forEach(task => byId.set(task.id, task));
  const incomingTime = Date.parse(incoming.snapshotAt);
  const currentTime = Date.parse(current.snapshotAt);
  const snapshotAt = Number.isFinite(incomingTime) && (!Number.isFinite(currentTime) || incomingTime > currentTime)
    ? incoming.snapshotAt : current.snapshotAt;
  // 원본 이력을 별도로 보존하며 서버 감사 이력으로 승격하지 않는다.
  const sourceHistory = mergeSourceHistory(current.sourceHistory ?? [], incoming.sourceHistory ?? [], incoming.audit);
  return boardSchema.parse({ ...current, snapshotAt, tasks: [...byId.values()], audit: current.audit, sourceHistory });
}

function mergeSourceHistory(...groups: NonNullable<Board["sourceHistory"]>[]): NonNullable<Board["sourceHistory"]> {
  const unique = new Map(groups.flat().map(entry => [JSON.stringify(entry), entry]));
  if (unique.size > 200) throw new Error("원본 이력이 200개를 초과합니다. 현재 기록과 가져올 JSON을 보존한 뒤 이전 범위를 나누어 검토해 주세요.");
  return [...unique.values()];
}

export function parseWorkImport(source: string): Board {
  if (new TextEncoder().encode(source).byteLength > CLOUD_WORK_IMPORT_LIMIT) throw new Error("JSON 파일은 1.5MB 이하여야 합니다.");
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("작업 보드 JSON 형식을 확인해 주세요.");
  const historySchema = sourceAuditSchema.array().max(200);
  const history = historySchema.safeParse(Reflect.get(value, "audit"));
  const preserved = historySchema.safeParse(Reflect.get(value, "sourceHistory") ?? []);
  if (!history.success || !preserved.success) throw new Error("가져온 원본 이력의 형식을 확인해 주세요.");
  const result = boardSchema.safeParse({ ...value, audit: [], sourceHistory: mergeSourceHistory(preserved.data, history.data) });
  if (!result.success) throw new Error(result.error.issues[0]?.message || "작업 보드 JSON 형식을 확인해 주세요.");
  return result.data;
}

export function downloadWorkJson(data: Board, draft = false): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cloud-workboard${draft ? "-draft" : ""}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const shortSha = (value: string) => value ? value.slice(0, 7) : "미확인";
export const prLabel = (value: string) => value ? `#${value.split("/").at(-1)}` : "PR 미확인";
