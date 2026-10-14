import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionTask } from "@toonstudio/core/production";

/**
 * 프로젝트 헤더 렌즈의 공정 단위.
 *
 * 기존 역할 렌즈(story/art/producer)가 "누구의 관점인가"를 고른다면, 공정 렌즈는
 * "어느 공정을 내 담당으로 볼 것인가"를 고른다. 값은 제작 보드가 실제로 쓰는
 * department/process 키와 맞췄다 — production-management-overview의
 * MANAGEMENT_PHASES가 phase로 묶는 processKey 별칭을 공정 단위로 편 것이다.
 *  - storyboard(콘티): thumbnail · storyboard · conte
 *  - line-art(선화): line-art
 *  - color(채색): color
 *  - background(배경): background
 *  - lettering(식자): lettering · typesetting
 */
export type ProductionProcessLens = "all" | "storyboard" | "line-art" | "color" | "background" | "lettering";

export const PROCESS_LENS_VALUES: readonly ProductionProcessLens[] = [
  "all",
  "storyboard",
  "line-art",
  "color",
  "background",
  "lettering",
];

export const PROCESS_LENS_PROCESS_KEYS: Readonly<Record<Exclude<ProductionProcessLens, "all">, readonly string[]>> = Object.freeze({
  storyboard: ["thumbnail", "storyboard", "conte"],
  "line-art": ["line-art"],
  color: ["color"],
  background: ["background"],
  lettering: ["lettering", "typesetting"],
});

export function parseProcessLens(value: string | null | undefined): ProductionProcessLens | null {
  if (!value) return null;
  return PROCESS_LENS_VALUES.find((entry) => entry === value) ?? null;
}

export function processLensStorageKey(projectId: string): string {
  return `toonstudio.production.process-lens.${projectId}`;
}

function readStoredProcessLens(projectId: string): ProductionProcessLens {
  if (!projectId || typeof window === "undefined") return "all";
  try {
    return parseProcessLens(window.localStorage.getItem(processLensStorageKey(projectId))) ?? "all";
  } catch {
    // 저장소를 읽지 못해도 기본 관점(전체 공정)으로 계속 사용할 수 있다.
    return "all";
  }
}

function writeStoredProcessLens(projectId: string, lens: ProductionProcessLens): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(processLensStorageKey(projectId), lens);
  } catch {
    // 저장 실패는 선택 자체를 막지 않는다 — 이번 세션에서는 상태로 유지된다.
  }
}

export interface ProcessLensTaskSummary {
  readonly total: number;
  readonly active: number;
  readonly review: number;
  readonly blocked: number;
}

const CLOSED_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

const REVIEW_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
]);

/** 선택한 공정에 속한 작업만 골라 헤더 요약용 개수를 센다. aggregate를 바꾸지 않는 순수 파생이다. */
export function summarizeProcessLensTasks(
  tasks: readonly ProductionTask[],
  lens: ProductionProcessLens,
): ProcessLensTaskSummary {
  const processKeys = lens === "all" ? null : new Set(PROCESS_LENS_PROCESS_KEYS[lens]);
  let total = 0;
  let active = 0;
  let review = 0;
  let blocked = 0;
  for (const task of tasks) {
    if (processKeys && !processKeys.has(task.processKey)) continue;
    total += 1;
    if (task.status === "blocked") blocked += 1;
    else if (REVIEW_TASK_STATUSES.has(task.status)) review += 1;
    else if (!CLOSED_TASK_STATUSES.has(task.status)) active += 1;
  }
  return { total, active, review, blocked };
}

/**
 * 프로젝트별 "내 담당 공정" 필터. 역할 렌즈(usePreferredRoleLens)와 같은 자리에서 쓰이며,
 * 선택은 프로젝트 단위로 브라우저에 저장돼 다음 방문에도 그대로 복원된다.
 * 프로젝트가 바뀌면 그 프로젝트에 저장된 공정을 다시 읽는다.
 */
export function usePreferredProcessLens(
  projectId: string,
): readonly [ProductionProcessLens, (next: ProductionProcessLens) => void] {
  const [processLens, setProcessLens] = useState<ProductionProcessLens>(() => readStoredProcessLens(projectId));
  const loadedProjectId = useRef(projectId);

  useEffect(() => {
    if (loadedProjectId.current === projectId) return;
    loadedProjectId.current = projectId;
    setProcessLens(readStoredProcessLens(projectId));
  }, [projectId]);

  const changeProcessLens = useCallback(
    (next: ProductionProcessLens) => {
      setProcessLens(next);
      writeStoredProcessLens(projectId, next);
    },
    [projectId],
  );

  return [processLens, changeProcessLens];
}
