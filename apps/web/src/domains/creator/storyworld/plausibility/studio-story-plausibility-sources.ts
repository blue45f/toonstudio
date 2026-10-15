/**
 * 개연성 리포트에 합칠 외부 출처를 읽는다.
 *
 * 작품 id가 있으면 같은 기기에 저장된 복선 장부와 세계관 설정, 기획 저장소(회차 순서)를 읽어 이미 있는
 * 탐지기(복선 경과 판정, 설정 검증)를 그대로 돌린다. 원고 사본이 있으면 장면 원문마다 고유명사 사전으로
 * 이름 표기를 검사한다. 읽을 수 없는 출처는 "연결 안 됨"으로 남기고, 없는 것을 있는 것처럼 채우지 않는다.
 *
 * 긴 원고가 화면을 멈추지 않도록 이름 검사는 장면 묶음마다 제어권을 돌려주고, 취소 신호를 확인한다.
 * 약속·회수 장부는 편집기의 제작 바이블 안에 있어 이 허브에서는 아직 읽지 않는다(리포트의 출처 표에 그대로 적는다).
 * 회차 시간 태그는 저장하는 곳이 아직 없어 마찬가지로 연결하지 않는다.
 */
import { deriveForeshadowDigest, readStudioForeshadowLedger } from "../../planning/studio-foreshadow-ledger";
import { currentPlanningEpisodeId } from "../../planning/studio-planning-current-episode";
import { readStudioProjectPlanning } from "../../planning/studio-planning-store";
import {
  checkLoreNames,
  type LoreNameDictionary,
  type LoreNameDictionaryEntry,
} from "../../planning/studio-lore-name-check";
import { validateWorldLore } from "../../planning/studio-world-lore";
import { readStudioWorldLore } from "../../planning/studio-world-lore-store";
import { readStudioProjectDiagnosticSource, type StudioProjectDiagnosticSourceStorage } from "../../studio-project-diagnostic-source-store";
import type { StoryworldProject } from "../studio-storyworld-causality";
import type { PlausibilityNameCheckBatch } from "./studio-story-plausibility-adapters-planning";
import type { PlausibilityExtraSources } from "./studio-story-plausibility-report";

/** 장면 몇 개마다 제어권을 돌려줄지. */
export const PLAUSIBILITY_NAME_CHECK_CHUNK = 12;
/** 한 장면에서 이름 검사에 쓰는 원문 길이 상한. 이보다 긴 장면은 앞부분만 검사하고 알린다. */
export const PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS = 60_000;

export interface PlausibilitySourceInput {
  readonly project: StoryworldProject;
  /** 작품 id. 없으면(로컬 초안) 기획 저장소 출처는 읽지 않는다. */
  readonly workId: string | null;
  readonly storage: StudioProjectDiagnosticSourceStorage | null;
  /** 장면 원문 사본: 사본 id → 원문. 없으면 이름 표기 검사를 건너뛴다. */
  readonly manuscripts?: ReadonlyMap<string, string>;
  readonly signal?: AbortSignal;
  readonly yieldToHost?: () => Promise<void>;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface PlausibilitySourceResult {
  readonly extras: PlausibilityExtraSources;
  /** 읽는 중 알아 둘 점(작가의 말). 리포트에 담지 않고 화면에만 보인다. */
  readonly notices: readonly string[];
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("점검을 취소했어요.", "AbortError");
}

/** 스토리월드 인물·장소와 세계관 설정 항목으로 고유명사 사전을 만든다. */
export function buildPlausibilityNameDictionary(
  project: StoryworldProject,
  loreEntries: readonly { readonly id: string; readonly name: string; readonly aliases: readonly string[] }[] = [],
): LoreNameDictionary {
  const entries: LoreNameDictionaryEntry[] = [];
  for (const character of project.characters) {
    entries.push({
      sourceKind: "character",
      sourceId: character.id,
      loreKind: null,
      canonical: character.name,
      aliases: character.aliases ?? [],
    });
  }
  const locations = [...new Set(project.scenes.map((scene) => scene.locationId?.trim() ?? "").filter((name) => name.length > 0))].sort();
  for (const name of locations) {
    entries.push({ sourceKind: "location", sourceId: `location:${name}`, loreKind: null, canonical: name, aliases: [] });
  }
  for (const entry of loreEntries) {
    entries.push({ sourceKind: "lore", sourceId: entry.id, loreKind: null, canonical: entry.name, aliases: entry.aliases });
  }
  return Object.freeze(entries);
}

export async function loadPlausibilityNameChecks(input: {
  readonly project: StoryworldProject;
  readonly manuscripts: ReadonlyMap<string, string>;
  readonly dictionary: LoreNameDictionary;
  readonly signal?: AbortSignal;
  readonly yieldToHost?: () => Promise<void>;
  readonly onProgress?: (done: number, total: number) => void;
}): Promise<{ readonly batches: readonly PlausibilityNameCheckBatch[]; readonly truncatedScenes: number; readonly missingCopyScenes: number }> {
  const yieldToHost = input.yieldToHost ?? defaultYield;
  const scenes = input.project.scenes.filter((scene) => scene.disabled !== true && scene.source !== undefined);
  const batches: PlausibilityNameCheckBatch[] = [];
  let truncatedScenes = 0;
  let missingCopyScenes = 0;
  let done = 0;
  for (const scene of scenes) {
    throwIfAborted(input.signal);
    const source = scene.source;
    const text = source?.copy !== undefined ? input.manuscripts.get(source.copy) : undefined;
    if (!source || text === undefined || source.start === undefined || source.end === undefined || source.end > text.length || source.start >= source.end) {
      missingCopyScenes += 1;
    } else {
      const limit = Math.min(source.end, source.start + PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS);
      if (limit < source.end) truncatedScenes += 1;
      const sceneText = text.slice(source.start, limit);
      const found = checkLoreNames(sceneText, input.dictionary, { disabledCodes: ["unregistered-name"] });
      if (found.length > 0) batches.push({ sceneId: scene.id, text: sceneText, findings: found });
    }
    done += 1;
    input.onProgress?.(done, scenes.length);
    if (done % PLAUSIBILITY_NAME_CHECK_CHUNK === 0) await yieldToHost();
  }
  return { batches, truncatedScenes, missingCopyScenes };
}

export async function loadPlausibilityExtras(input: PlausibilitySourceInput): Promise<PlausibilitySourceResult> {
  const notices: string[] = [];
  let foreshadow: PlausibilityExtraSources["foreshadow"];
  let lore: PlausibilityExtraSources["lore"];
  let loreDictionaryEntries: readonly { readonly id: string; readonly name: string; readonly aliases: readonly string[] }[] = [];

  const workId = input.workId?.trim() ?? "";
  if (workId && input.storage) {
    try {
      const ledger = readStudioForeshadowLedger(input.storage, workId);
      const planning = readStudioProjectPlanning(input.storage, workId);
      if (ledger) {
        const episodes = (planning?.plans ?? []).map((plan) => ({
          episodeId: plan.episodeId,
          episodeNumber: plan.episodeNumber,
          title: plan.title,
        }));
        const currentEpisodeId = planning ? currentPlanningEpisodeId(planning) : null;
        const digest = currentEpisodeId && planning
          ? deriveForeshadowDigest({ seeds: ledger.seeds, episodeOrder: planning.season.episodeOrder, currentEpisodeId })
          : null;
        foreshadow = { overdue: digest?.overdue ?? [], dueSoon: digest?.dueSoon ?? [], episodes, totalCount: ledger.seeds.length };
        if (!digest && ledger.seeds.length > 0) {
          notices.push("복선 장부에 복선이 있지만 기획의 회차 순서를 알 수 없어서 회수 기한을 따지지 못했어요.");
        }
      }
    } catch {
      notices.push("복선 장부를 읽지 못해서 이번 점검에서는 건너뛰었어요.");
    }
    try {
      const state = readStudioWorldLore(input.storage, workId);
      if (state) {
        const bible = readStudioProjectDiagnosticSource(input.storage, workId)?.story.bible ?? null;
        // 인물 목록(bible)을 모르면 검증기가 인물 연결과 인물 이름 충돌은 판정하지 않는다. 모르는 것을 오류로 만들지 않는다.
        const issues = validateWorldLore(bible, state);
        lore = {
          issues,
          entryCount: state.entries.length,
          entryNames: Object.fromEntries(state.entries.map((entry) => [entry.id, entry.name])),
        };
        loreDictionaryEntries = state.entries.map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases }));
      }
    } catch {
      notices.push("세계관 설정을 읽지 못해서 이번 점검에서는 건너뛰었어요.");
    }
  }
  throwIfAborted(input.signal);

  let nameChecks: PlausibilityExtraSources["nameChecks"];
  if (input.manuscripts && input.manuscripts.size > 0) {
    const dictionary = buildPlausibilityNameDictionary(input.project, loreDictionaryEntries);
    const result = await loadPlausibilityNameChecks({
      project: input.project,
      manuscripts: input.manuscripts,
      dictionary,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.yieldToHost ? { yieldToHost: input.yieldToHost } : {}),
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
    nameChecks = result.batches;
    if (result.missingCopyScenes > 0) {
      notices.push(`장면 ${result.missingCopyScenes}개는 원고 사본을 찾을 수 없어서 이름 표기를 검사하지 못했어요.`);
    }
    if (result.truncatedScenes > 0) {
      notices.push(`장면 ${result.truncatedScenes}개는 너무 길어서 앞부분 ${PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS.toLocaleString("ko-KR")}자만 검사했어요.`);
    }
  }

  return {
    extras: {
      ...(foreshadow ? { foreshadow } : {}),
      ...(lore ? { lore } : {}),
      ...(nameChecks ? { nameChecks } : {}),
    },
    notices,
  };
}
