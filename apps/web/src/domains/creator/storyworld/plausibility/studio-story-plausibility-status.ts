/**
 * 장면별 질문 답 상태와 점검 가능 범위(커버리지) 계산.
 *
 * "점검 불가(미입력)"의 기준을 한곳에 둔다. 답하지 않았거나 건너뛴 칸, "모름"으로 답한 칸은
 * 점검할 수 있는 칸으로 세지 않는다. 구조 필드에 이미 데이터가 있으면 질문에 답한 것으로 본다
 * (예: 선행 장면이나 전제가 있으면 "원인" 질문은 답한 것).
 */
import type {
  StoryworldProject,
  StoryworldQuestionId,
  StoryworldScene,
} from "../studio-storyworld-causality";
import type { PlausibilityCoverage, PlausibilityCoverageItem } from "./studio-story-plausibility-types";

export const PLAUSIBILITY_QUESTION_IDS: readonly StoryworldQuestionId[] = Object.freeze([
  "roles",
  "motive",
  "cause",
  "information",
  "coincidence",
  "consequence",
]);

export type PlausibilityQuestionStatus = "answered" | "not-applicable" | "unknown" | "skipped" | "unanswered";

function hasItems(list: readonly unknown[] | undefined): boolean {
  return list !== undefined && list.length > 0;
}

function deriveFromData(scene: StoryworldScene, question: StoryworldQuestionId): boolean {
  const plausibility = scene.plausibility;
  switch (question) {
    case "roles":
      return plausibility?.roles !== undefined;
    case "motive":
      return (plausibility?.motives ?? []).some((motive) => motive.basis !== "unknown");
    case "cause":
      return hasItems(scene.dependsOnSceneIds) || hasItems(scene.preconditions);
    case "information":
      return hasItems(scene.knowledgeUses) || hasItems(scene.reveals);
    case "coincidence":
      return plausibility?.coincidence !== undefined && plausibility.coincidence.clue !== "unknown";
    case "consequence":
      return hasItems(scene.effects) || hasItems(scene.reveals) || hasItems(scene.emotionalBeats);
  }
}

/** 데이터가 있으면 answered, 없으면 작가가 기록한 상태, 그것도 없으면 unanswered. */
export function plausibilityQuestionStatus(
  scene: StoryworldScene,
  question: StoryworldQuestionId,
): PlausibilityQuestionStatus {
  if (deriveFromData(scene, question)) return "answered";
  return scene.plausibility?.answers?.[question] ?? "unanswered";
}

/** 점검에 쓸 수 있는 상태인가. 모름·건너뜀·미답은 점검 불가다. */
export function isCheckableStatus(status: PlausibilityQuestionStatus): boolean {
  return status === "answered" || status === "not-applicable";
}

const BASIC_ITEMS = [
  { id: "participants", label: "등장인물" },
  { id: "place", label: "장소" },
  { id: "time", label: "시간" },
] as const;

export const PLAUSIBILITY_QUESTION_LABELS: Readonly<Record<StoryworldQuestionId, string>> = Object.freeze({
  roles: "장면 성격",
  motive: "동기",
  cause: "원인",
  information: "정보",
  coincidence: "우연·단서",
  consequence: "결과",
});

function basicCovered(scene: StoryworldScene, id: (typeof BASIC_ITEMS)[number]["id"]): boolean {
  if (id === "participants") return hasItems(scene.participantIds);
  if (id === "place") return typeof scene.locationId === "string" && scene.locationId.trim().length > 0;
  return typeof scene.timeIndex === "number" && Number.isFinite(scene.timeIndex);
}

export interface PlausibilitySceneCoverage {
  readonly sceneId: string;
  /** 점검할 수 있는 칸의 id 목록. */
  readonly covered: readonly string[];
  /** 아직 점검할 수 없는 칸의 id 목록(미입력·모름·건너뜀). */
  readonly missing: readonly string[];
}

export function plausibilitySceneCoverage(scene: StoryworldScene): PlausibilitySceneCoverage {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const item of BASIC_ITEMS) (basicCovered(scene, item.id) ? covered : missing).push(item.id);
  for (const question of PLAUSIBILITY_QUESTION_IDS) {
    (isCheckableStatus(plausibilityQuestionStatus(scene, question)) ? covered : missing).push(question);
  }
  return { sceneId: scene.id, covered, missing };
}

/**
 * 점검 가능 범위. 사용 중인 장면 × 9칸(등장인물·장소·시간 + 질문 6개) 중
 * 입력이 있는 칸의 비율이다. 장면이 없으면 0이다.
 */
export function computePlausibilityCoverage(
  project: StoryworldProject,
  scopeSceneIds?: ReadonlySet<string> | null,
): PlausibilityCoverage {
  const scenes = project.scenes.filter((scene) => scene.disabled !== true && (scopeSceneIds ? scopeSceneIds.has(scene.id) : true));
  const labels: { id: string; label: string }[] = [
    ...BASIC_ITEMS.map((item) => ({ id: item.id, label: item.label })),
    ...PLAUSIBILITY_QUESTION_IDS.map((id) => ({ id, label: PLAUSIBILITY_QUESTION_LABELS[id] })),
  ];
  const counts = new Map<string, number>(labels.map((item) => [item.id, 0]));
  for (const scene of scenes) {
    for (const id of plausibilitySceneCoverage(scene).covered) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const items: PlausibilityCoverageItem[] = labels.map((item) => ({
    id: item.id,
    label: item.label,
    covered: counts.get(item.id) ?? 0,
    total: scenes.length,
  }));
  const coveredCells = items.reduce((sum, item) => sum + item.covered, 0);
  const totalCells = scenes.length * labels.length;
  return {
    sceneCount: scenes.length,
    coveredCells,
    totalCells,
    percent: totalCells === 0 ? 0 : Math.round((coveredCells / totalCells) * 100),
    items,
  };
}
