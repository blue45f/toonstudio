import { studioDocumentHref } from "../studio-document-workspace";
import {
  readStudioProjectDocuments,
  validIdentity,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-reader";
import { readStudioProjectLibrary } from "../studio-project-library-reader";
import {
  deriveStoryBeatsFromEpisodePlan,
  type StudioStoryBeat,
} from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import { readStudioProjectPlanning } from "./studio-planning-store";

type ReadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function studioEpisodeStoryboardWorkspace(document: StudioProjectDocumentEntry): "storyboard" | "comic" | null {
  return document.allowedWorkspaces.includes("storyboard") ? "storyboard"
    : document.allowedWorkspaces.includes("comic") ? "comic" : null;
}

/** 기존 문서 메타데이터만 읽는다. 원고 생성·교체·저장 형식 변경은 하지 않는다. */
export function readStudioEpisodeDocumentTargets(storage: ReadStorage, projectId: string) {
  const project = readStudioProjectLibrary(storage).projects.find(
    (candidate) => candidate.id === projectId && candidate.status === "active",
  );
  const documents = project ? readStudioProjectDocuments(storage, projectId).documents.filter(
    (document) => document.status === "active"
      && document.allowedWorkspaces.includes("draw")
      && studioEpisodeStoryboardWorkspace(document) !== null,
  ) : [];
  return { documents };
}

export function selectStudioEpisodeDocumentTarget(
  documents: readonly StudioProjectDocumentEntry[],
  selectedDocumentId?: string,
): StudioProjectDocumentEntry | null {
  // 명시 선택이 취소·보관됐을 때 다른 문서로 몰래 바꾸지 않는다.
  if (selectedDocumentId !== undefined) {
    return documents.find((document) => document.id === selectedDocumentId) ?? null;
  }
  return documents.length === 1 ? documents[0] ?? null : null;
}

export function studioEpisodeDocumentHref(
  document: StudioProjectDocumentEntry,
  episodeId: string,
  phase: "storyboard" | "art",
  search = "",
): string | null {
  if (document.status !== "active" || !validIdentity(episodeId)) return null;
  const workspace = phase === "art"
    ? document.allowedWorkspaces.includes("draw") ? "draw" : null
    : studioEpisodeStoryboardWorkspace(document);
  if (!workspace) return null;
  const params = new URLSearchParams(search);
  params.set("episode", episodeId);
  return studioDocumentHref({
    projectId: document.projectId,
    documentId: document.id,
    workspace,
    focus: params.get("focus"),
    language: params.get("language"),
    version: params.get("version"),
    search: params,
  });
}

export function studioEpisodePlanHandoffBeats(plan: EpisodePlanWithSynopsis): readonly StudioStoryBeat[] {
  // 기존 episodeId에는 ':'·한글도 올 수 있어 순수 시딩 모델의 ASCII 접두 계약에 맞춘다.
  const prefix = plan.episodeId.split("").map(
    (character) => character.charCodeAt(0).toString(16).padStart(4, "0"),
  ).join("");
  return deriveStoryBeatsFromEpisodePlan(plan, { idPrefix: `episode-${prefix}` }).beats;
}

function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}

/** 느슨한 기존 기획 파서를 바꾸지 않고, 인계에 소비할 필드와 소속만 더 엄격히 확인한다. */
export function readStudioEpisodeDocumentHandoff(
  storage: ReadStorage,
  projectId: string,
  documentId: string,
  search: string,
) {
  const values = new URLSearchParams(search).getAll("episode");
  const episodeId = values[0];
  if (values.length !== 1 || !validIdentity(episodeId)) return null;
  try {
    const document = readStudioEpisodeDocumentTargets(storage, projectId).documents.find(
      (candidate) => candidate.id === documentId,
    );
    const planning = readStudioProjectPlanning(storage, projectId);
    if (!document || !planning) return null;
    const plans = planning.plans.filter((plan) => plan.episodeId === episodeId);
    const plan = plans[0];
    const readableStatuses = new Set<string>(["draft", "review", "approved", "locked"]);
    if (plans.length !== 1 || !plan || plan.projectId !== projectId
      || plan.seasonId !== planning.season.seasonId
      || !readableStatuses.has(plan.status) || !readableStatuses.has(planning.season.status)
      || typeof plan.openingHook !== "string" || typeof plan.cliffhanger !== "string"
      || !strings(plan.turningPoints) || !strings(plan.characterRefs)
      || (plan.locationRefs !== undefined && !strings(plan.locationRefs))) return null;
    return {
      document,
      plan,
      beats: studioEpisodePlanHandoffBeats(plan),
      artHref: studioEpisodeDocumentHref(document, episodeId, "art", search),
    };
  } catch {
    // 손상·접근 거부는 편집기 전체의 렌더 실패나 임의 다른 회차 인계로 바꾸지 않는다.
    return null;
  }
}
