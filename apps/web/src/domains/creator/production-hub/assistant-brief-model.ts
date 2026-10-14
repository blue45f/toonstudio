import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type {
  ProductionProjectAggregate,
  ProductionTask,
  ProductionTaskBriefBlock,
  StoryToArtHandoffPackage,
} from "@toonstudio/core/production";

import { PRODUCTION_PROCESS_LABELS, type BilingualLabel } from "./production-labels";
import { productionEpisodeRoomPath, productionSurfacePath } from "./production-project-surfaces";

/**
 * 어시 작업 브리프 자동 조립 (REPORT A-3) — 순수 모델.
 *
 * 컷 범위와 공정을 고르면 인계 패키지(StoryToArtHandoffPackage)를 정본으로
 * ① 스타일 규칙(시리즈 마스터 styleRules + 인계 지시) ② 금지 사항(마스터
 * forbiddenElements + DO_NOT_USE 지시) ③ 팔레트(호출자가 넘긴 실제 팔레트만)
 * ④ 참조 컷(컷 플랜으로 실재가 확인되는 것만) ⑤ 완료 기준(공정 프로필 → 작업 순)
 * 을 조립하고, 같은 공정·범위의 실제 작업(ProductionTask)에 연결한다.
 * 연결된 작업에는 assistantBriefBlocks를 briefBlocks로 붙일 수 있어 받는 쪽의
 * 작업 큐(개인 작업함·공정 보드)가 브리프를 그대로 싣는다.
 *
 * 정직성 규칙:
 * - 팔레트는 aggregate에 정본이 없어 호출자 입력만 쓴다. 없으면 지어내지 않고
 *   palette=null + missing "palette"로 드러낸다.
 * - 참조 컷은 컷 플랜에 없는 id를 만들지 않는다. 해석되지 않은 id는
 *   missing "unknown-reference-cut:<id>"로 보고한다.
 * - 스타일 규칙·완료 기준·큐 작업이 없으면 각각 missing으로 드러내고
 *   ready=false가 된다. 빈 브리프를 "준비 완료"로 보여 주지 않는다.
 */

export interface AssistantBriefPaletteSwatch {
  readonly name: string;
  readonly hex: string;
}

export interface AssistantBriefPalette {
  readonly name: string;
  readonly swatches: readonly AssistantBriefPaletteSwatch[];
}

export interface AssistantBriefSelection {
  readonly processKey: string;
  /** 명시 컷 선택. 주면 fromOrder/toOrder보다 우선한다. 값은 CutPlan.cutId. */
  readonly cutIds?: readonly string[];
  /** 컷 순서 범위(양끝 포함, CutPlan.order 기준). 둘 다 없으면 회차 전체 컷. */
  readonly fromOrder?: number | null;
  readonly toOrder?: number | null;
  /** 실제로 연결된 작품 팔레트. 없으면 브리프에 팔레트 없음이 명시된다. */
  readonly palette?: AssistantBriefPalette | null;
  /** 참조 컷으로 지정할 CutPlan.cutId 목록. 없으면 인계 패키지의 참조 ref와 대조해 찾는다. */
  readonly referenceCutIds?: readonly string[];
}

export interface AssistantBriefReferenceCut {
  readonly cutId: string;
  readonly order: number;
  readonly label: string;
  readonly href: string;
}

export type AssistantBriefAggregate = Pick<
  ProductionProjectAggregate,
  "projectId" | "title" | "handoffs" | "seriesMasters" | "cutPlans" | "tasks" | "workflowProfile"
>;

export interface AssistantBrief {
  readonly id: string;
  readonly handoffId: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly episodeId: string;
  readonly processKey: string;
  readonly processLabel: BilingualLabel;
  /** 선택된 컷 범위: 컷 id 목록과 사람이 읽는 범위 표기. */
  readonly cutIds: readonly string[];
  readonly cutRangeLabel: BilingualLabel;
  readonly styleRules: readonly string[];
  readonly forbidden: readonly string[];
  readonly palette: AssistantBriefPalette | null;
  readonly referenceCuts: readonly AssistantBriefReferenceCut[];
  /** 인계 지시 중 선택 범위·회차·프로젝트에 걸리는 것(사용 금지 제외 — forbidden으로 분리). */
  readonly instructions: readonly { readonly id: string; readonly priority: string; readonly text: string }[];
  readonly completionCriteria: readonly string[];
  readonly dueAt: string | null;
  /** 받는 쪽 작업 큐 연결: 같은 공정·범위의 미완료 실제 작업. */
  readonly queueTaskIds: readonly string[];
  readonly queueTaskTitles: readonly string[];
  readonly assigneeAssignmentIds: readonly string[];
  readonly queueHref: string;
  /** 조립되지 못한 항목 코드. 비어 있을 때만 ready. */
  readonly missing: readonly string[];
  readonly ready: boolean;
}

const CLOSED_TASK_STATUSES: ReadonlySet<string> = new Set(["done", "cancelled", "out-of-scope"]);

/** 인계 패키지의 참조 ref 묶음 — 참조 컷 기본 후보를 찾을 때 쓴다. */
function handoffReferenceRefs(handoff: StoryToArtHandoffPackage): readonly string[] {
  return [
    ...handoff.continuityReferenceRefs,
    ...handoff.visualRequirementRefs,
    ...handoff.locationReferenceRefs,
    ...handoff.costumeReferenceRefs,
  ];
}

function scopeTouchesEpisode(task: ProductionTask, episodeId: string, cutIds: ReadonlySet<string>): boolean {
  if (task.scope.id === episodeId) return true;
  if (task.scope.kind === "cut" && cutIds.has(task.scope.id)) return true;
  return task.scope.ancestors.some(
    (ancestor) => ancestor.id === episodeId || (ancestor.kind === "cut" && cutIds.has(ancestor.id)),
  );
}

export function buildAssistantBrief(
  aggregate: AssistantBriefAggregate,
  handoffId: string,
  selection: AssistantBriefSelection,
): AssistantBrief | null {
  const handoff = aggregate.handoffs.find((entry) => entry.id === handoffId);
  if (!handoff) return null;
  const episodeId = handoff.episodeId;
  const processKey = canonicalProductionProcessKey(selection.processKey);
  const missing: string[] = [];

  // ── 컷 범위 ──────────────────────────────────────────────
  const episodeCuts = aggregate.cutPlans
    .filter((cut) => cut.episodeId === episodeId)
    .slice()
    .sort((left, right) => left.order - right.order);
  let selectedCuts = episodeCuts;
  if (selection.cutIds && selection.cutIds.length > 0) {
    const wanted = new Set(selection.cutIds);
    selectedCuts = episodeCuts.filter((cut) => wanted.has(cut.cutId));
    for (const cutId of selection.cutIds) {
      if (!episodeCuts.some((cut) => cut.cutId === cutId)) missing.push(`unknown-cut:${cutId}`);
    }
  } else if (selection.fromOrder != null || selection.toOrder != null) {
    const from = Math.min(selection.fromOrder ?? Number.NEGATIVE_INFINITY, selection.toOrder ?? Number.POSITIVE_INFINITY);
    const to = Math.max(selection.fromOrder ?? Number.NEGATIVE_INFINITY, selection.toOrder ?? Number.POSITIVE_INFINITY);
    selectedCuts = episodeCuts.filter((cut) => cut.order >= from && cut.order <= to);
  }
  if (selectedCuts.length === 0) missing.push("cut-range");
  const cutIds = selectedCuts.map((cut) => cut.cutId);
  const cutIdSet = new Set(cutIds);
  const cutRangeLabel: BilingualLabel =
    selectedCuts.length === 0
      ? { ko: "선택된 컷 없음", en: "No cuts selected" }
      : selectedCuts.length === episodeCuts.length && episodeCuts.length > 0
        ? { ko: `전체 ${selectedCuts.length}컷`, en: `All ${selectedCuts.length} cuts` }
        : {
            ko: `${selectedCuts[0].order}–${selectedCuts[selectedCuts.length - 1].order}컷 (${selectedCuts.length}개)`,
            en: `Cuts ${selectedCuts[0].order}–${selectedCuts[selectedCuts.length - 1].order} (${selectedCuts.length})`,
          };

  // ── 스타일 규칙·금지 사항 ────────────────────────────────
  const master = aggregate.seriesMasters
    .filter((entry) => entry.projectId === aggregate.projectId && entry.status !== "archived" && entry.status !== "superseded")
    .slice()
    .sort((left, right) => right.revision - left.revision)[0];
  const scopedInstructions = handoff.instructions.filter(
    (entry) =>
      entry.scope.id === episodeId ||
      entry.scope.kind === "project" ||
      (entry.scope.kind === "cut" && cutIdSet.has(entry.scope.id)) ||
      entry.scope.ancestors.some((ancestor) => ancestor.id === episodeId),
  );
  const forbidden = Object.freeze([
    ...new Set([
      ...(master?.forbiddenElements ?? []),
      ...scopedInstructions.filter((entry) => entry.priority === "DO_NOT_USE").map((entry) => entry.text),
    ]),
  ]);
  const styleRules = Object.freeze([
    ...new Set([
      ...(master?.styleRules ?? []),
      ...scopedInstructions
        .filter((entry) => entry.priority === "MUST_PRESERVE" || entry.priority === "INTENT")
        .map((entry) => entry.text),
    ]),
  ]);
  if (styleRules.length === 0) missing.push("style-rules");
  const instructions = Object.freeze(
    scopedInstructions
      .filter((entry) => entry.priority !== "DO_NOT_USE")
      .map((entry) => ({ id: entry.id, priority: entry.priority, text: entry.text })),
  );

  // ── 팔레트 (호출자 입력만 — 없으면 없음으로 명시) ────────
  const palette =
    selection.palette && selection.palette.swatches.length > 0 ? selection.palette : null;
  if (!palette) missing.push("palette");

  // ── 참조 컷 (컷 플랜 실재 확인) ──────────────────────────
  const referenceIds =
    selection.referenceCutIds && selection.referenceCutIds.length > 0
      ? selection.referenceCutIds
      : handoffReferenceRefs(handoff);
  const referenceCuts: AssistantBriefReferenceCut[] = [];
  for (const refId of referenceIds) {
    const cut = episodeCuts.find((entry) => entry.cutId === refId || entry.id === refId);
    if (cut) {
      if (!referenceCuts.some((entry) => entry.cutId === cut.cutId)) {
        referenceCuts.push({
          cutId: cut.cutId,
          order: cut.order,
          label: `${cut.order}컷 · ${cut.framing}`,
          href: productionEpisodeRoomPath(aggregate.projectId, episodeId),
        });
      }
    } else if (selection.referenceCutIds && selection.referenceCutIds.length > 0) {
      missing.push(`unknown-reference-cut:${refId}`);
    }
  }
  if (referenceCuts.length === 0) missing.push("reference-cuts");

  // ── 받는 쪽 작업 큐 연결 ─────────────────────────────────
  const queueTasks = aggregate.tasks.filter(
    (task) =>
      task.projectId === aggregate.projectId &&
      canonicalProductionProcessKey(task.processKey) === processKey &&
      !CLOSED_TASK_STATUSES.has(task.status) &&
      scopeTouchesEpisode(task, episodeId, cutIdSet),
  );
  if (queueTasks.length === 0) missing.push("queue-task");
  const step = aggregate.workflowProfile?.steps.find(
    (candidate) => canonicalProductionProcessKey(candidate.key) === processKey,
  );
  const processLabel: BilingualLabel = step
    ? { ko: step.name, en: step.name }
    : (PRODUCTION_PROCESS_LABELS[processKey] ?? { ko: processKey, en: processKey });

  // ── 완료 기준 (공정 프로필 우선, 없으면 큐 작업 기준) ────
  const completionCriteria = Object.freeze([
    ...new Set([
      ...(step?.completionCriteria ?? []),
      ...queueTasks.flatMap((task) => task.completionCriteria),
    ]),
  ]);
  if (completionCriteria.length === 0) missing.push("completion-criteria");

  const id = `assistant-brief:${handoff.id}:${processKey}:${cutIds[0] ?? "none"}-${cutIds[cutIds.length - 1] ?? "none"}`;
  return Object.freeze({
    id,
    handoffId: handoff.id,
    projectId: aggregate.projectId,
    projectTitle: aggregate.title,
    episodeId,
    processKey,
    processLabel: Object.freeze(processLabel),
    cutIds: Object.freeze(cutIds),
    cutRangeLabel: Object.freeze(cutRangeLabel),
    styleRules,
    forbidden,
    palette,
    referenceCuts: Object.freeze(referenceCuts),
    instructions,
    completionCriteria,
    dueAt: handoff.dueAt,
    queueTaskIds: Object.freeze(queueTasks.map((task) => task.id)),
    queueTaskTitles: Object.freeze(queueTasks.map((task) => task.title)),
    assigneeAssignmentIds: Object.freeze([...new Set(queueTasks.flatMap((task) => task.assignmentIds))]),
    queueHref: productionSurfacePath(aggregate.projectId, "production"),
    missing: Object.freeze(missing),
    ready: missing.length === 0,
  });
}

/** 브리프를 작업 briefBlocks로 변환 — 받는 쪽 작업 큐 카드가 그대로 싣는 형태. */
export function assistantBriefBlocks(brief: AssistantBrief): ProductionTaskBriefBlock[] {
  const prefix = `assistant-brief:${brief.id}:`;
  const blocks: ProductionTaskBriefBlock[] = [
    {
      id: `${prefix}heading`,
      kind: "heading",
      text: `어시 브리프 · ${brief.processLabel.ko} · ${brief.cutRangeLabel.ko}`,
    },
  ];
  for (const [index, rule] of brief.styleRules.entries()) {
    blocks.push({ id: `${prefix}style-${index}`, kind: "paragraph", text: `스타일 규칙: ${rule}` });
  }
  for (const [index, item] of brief.forbidden.entries()) {
    blocks.push({ id: `${prefix}forbidden-${index}`, kind: "paragraph", text: `사용 금지: ${item}` });
  }
  if (brief.palette) {
    blocks.push({
      id: `${prefix}palette`,
      kind: "paragraph",
      text: `팔레트(${brief.palette.name}): ${brief.palette.swatches.map((swatch) => `${swatch.name} ${swatch.hex}`).join(", ")}`,
    });
  }
  for (const [index, cut] of brief.referenceCuts.entries()) {
    blocks.push({ id: `${prefix}ref-${index}`, kind: "paragraph", text: `참조 컷: ${cut.label}` });
  }
  for (const [index, criterion] of brief.completionCriteria.entries()) {
    blocks.push({ id: `${prefix}criteria-${index}`, kind: "checklist", text: criterion, checked: false });
  }
  return blocks;
}

/**
 * 큐 작업에 브리프를 붙인다(멱등). 이미 붙은 같은 브리프 블록은 교체하고,
 * 큐에 없는 작업은 참조 그대로 돌려준다 — upsert-task-batch 입력으로 쓴다.
 */
export function attachAssistantBriefToTasks(
  tasks: readonly ProductionTask[],
  brief: AssistantBrief,
): ProductionTask[] {
  const queueIds = new Set(brief.queueTaskIds);
  const prefix = `assistant-brief:${brief.id}:`;
  const fresh = assistantBriefBlocks(brief);
  return tasks.map((task) => {
    if (!queueIds.has(task.id)) return task;
    const kept = (task.briefBlocks ?? []).filter((block) => !block.id.startsWith(prefix));
    return { ...task, briefBlocks: [...fresh, ...kept] };
  });
}

/** 인계 패키지와 함께 전달할 평문 브리프. locale 기본 ko. */
export function buildAssistantBriefText(brief: AssistantBrief, locale: "ko" | "en" = "ko"): string {
  const pick = (label: BilingualLabel) => (locale === "ko" ? label.ko : label.en);
  const lines: string[] = [];
  lines.push(
    locale === "ko"
      ? `[어시 작업 브리프] ${brief.projectTitle} · ${pick(brief.processLabel)} · ${pick(brief.cutRangeLabel)}`
      : `[Assistant brief] ${brief.projectTitle} · ${pick(brief.processLabel)} · ${pick(brief.cutRangeLabel)}`,
  );
  if (brief.dueAt) lines.push(`${locale === "ko" ? "마감" : "Due"}: ${brief.dueAt}`);
  lines.push(locale === "ko" ? "■ 스타일 규칙" : "■ Style rules");
  if (brief.styleRules.length === 0) lines.push(locale === "ko" ? "(등록된 스타일 규칙 없음)" : "(No style rules registered)");
  for (const rule of brief.styleRules) lines.push(`- ${rule}`);
  if (brief.forbidden.length > 0) {
    lines.push(locale === "ko" ? "■ 사용 금지" : "■ Do not use");
    for (const item of brief.forbidden) lines.push(`- ${item}`);
  }
  lines.push(locale === "ko" ? "■ 팔레트" : "■ Palette");
  if (brief.palette) {
    lines.push(`${brief.palette.name}: ${brief.palette.swatches.map((swatch) => `${swatch.name} ${swatch.hex}`).join(", ")}`);
  } else {
    lines.push(locale === "ko" ? "(연결된 팔레트 없음 — 작업 전에 팔레트를 확인하세요)" : "(No palette linked — confirm the palette before starting)");
  }
  lines.push(locale === "ko" ? "■ 참조 컷" : "■ Reference cuts");
  if (brief.referenceCuts.length === 0) lines.push(locale === "ko" ? "(연결된 참조 컷 없음)" : "(No reference cuts linked)");
  for (const cut of brief.referenceCuts) lines.push(`- ${cut.label} (${cut.href})`);
  if (brief.completionCriteria.length > 0) {
    lines.push(locale === "ko" ? "■ 완료 기준" : "■ Done when");
    for (const criterion of brief.completionCriteria) lines.push(`- ${criterion}`);
  }
  lines.push(`${locale === "ko" ? "작업 큐" : "Work queue"}: ${brief.queueHref} (${brief.queueTaskIds.length})`);
  if (brief.missing.length > 0) {
    lines.push(`${locale === "ko" ? "아직 비어 있는 항목" : "Still missing"}: ${brief.missing.join(", ")}`);
  }
  return lines.join("\n");
}
