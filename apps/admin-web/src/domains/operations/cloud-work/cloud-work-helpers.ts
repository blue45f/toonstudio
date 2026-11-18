import { CLOUD_WORKBOARD_JSON_LIMIT, boardSchema, duplicateNotes, freshness } from "@toonstudio/contracts/admin-cloud-workboard";

import type { Board, Task } from "@toonstudio/contracts/admin-cloud-workboard";

export const CLOUD_WORK_IMPORT_LIMIT = CLOUD_WORKBOARD_JSON_LIMIT;
export const VIEW_NAMES = { board: "전체 작업", compare: "변경 비교", approvals: "승인 대기", activity: "활동 기록" } as const;
export type WorkView = keyof typeof VIEW_NAMES;
export const RISK_FILTERS = ["모든 신호", "위험 감지", "충돌 감지", "회귀 감지", "CI 실패", "배포 차단", "증빙 미확인·오래됨", "중복 검토"] as const;
export interface WorkFilters { project: string; stage: string; risk: string; query: string }
export const DEFAULT_FILTERS: WorkFilters = { project: "전체 프로젝트", stage: "전체 상태", risk: "모든 신호", query: "" };

export function filterWorkTasks(tasks: Task[], filters: WorkFilters, now: number): Task[] {
  const signals: Record<string, keyof Task["risks"]> = { "충돌 감지": "conflict", "회귀 감지": "regression", "CI 실패": "ciFailure", "배포 차단": "deployBlock" };
  const query = filters.query.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    if (filters.project !== "전체 프로젝트" && task.project !== filters.project) return false;
    if (filters.stage !== "전체 상태" && task.stage !== filters.stage) return false;
    if (filters.risk === "위험 감지" && !Object.values(task.risks).includes("감지")) return false;
    const signal = signals[filters.risk];
    if (signal && task.risks[signal] !== "감지") return false;
    if (filters.risk === "증빙 미확인·오래됨" && freshness(task, now) === "24시간 내 확인") return false;
    if (filters.risk === "중복 검토" && !duplicateNotes(task, tasks).length) return false;
    return !query || [task.id, task.project, task.title, task.owner, task.localBranch, task.remoteBranch, task.localSha,
      task.remoteSha, task.mainSha, task.pr, task.changeKey, task.nextAction].join(" ").toLocaleLowerCase().includes(query);
  });
}

export function mergeWorkImport(current: Board, incoming: Board): Board {
  const byId = new Map(current.tasks.map(task => [task.id, task]));
  incoming.tasks.forEach(task => byId.set(task.id, task));
  const incomingTime = Date.parse(incoming.snapshotAt);
  const currentTime = Date.parse(current.snapshotAt);
  const snapshotAt = Number.isFinite(incomingTime) && (!Number.isFinite(currentTime) || incomingTime > currentTime)
    ? incoming.snapshotAt : current.snapshotAt;
  // 기존 서버 이력은 보존한다. 가져온 이력은 서버 감사 이력으로 승격하지 않는다.
  return boardSchema.parse({ ...current, snapshotAt, tasks: [...byId.values()], audit: current.audit });
}

export function parseWorkImport(source: string): Board {
  if (new TextEncoder().encode(source).byteLength > CLOUD_WORK_IMPORT_LIMIT) throw new Error("JSON 파일은 1.5MB 이하여야 합니다.");
  const result = boardSchema.safeParse(JSON.parse(source));
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
