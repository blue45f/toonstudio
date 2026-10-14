/**
 * 프로젝트 story 뷰에 기획 표면을 실제로 장착하는 연결 컴포넌트.
 *
 * - view=episodes → StudioEpisodeStoryPage (회차 시놉시스)
 *   데이터: studio-planning-store (프로젝트별 SeasonPlan·EpisodePlan 영속).
 * - view=characters → StudioCharacterSheetPanel (서술형 캐릭터 시트)
 *   데이터: 프로젝트 워크스페이스 상태의 story 슬라이스(bible·narrative).
 *   저장은 기존 updateStudioProjectStory 어댑터를 그대로 타서 진단·준비도
 *   파이프라인(StudioProjectDiagnosticsBridge)과 같은 저장본을 공유한다.
 *
 * 표면 컴포넌트들은 props 경계를 유지하고, 이 파일이 로드·저장·새로고침만 맡는다.
 *
 * 누적 변경 (story-seed-builder): episodes 표면 상단에 스토리 씨앗 빌더를 장착한다.
 * 빌더의 적용 패치는 첫 회차 플랜에 같은 handleSavePlan 경로로 저장되고,
 * 세계관 바이블의 캐릭터·장소는 설정 인용으로 공급된다. 선행 의존:
 * planning-page-project-story-view-connection 초안(이 파일의 원본)이 먼저 상륙.
 *
 * 누적 변경 (seed-builder-settings-full-connection): 설정 인용 공급을 전체로 넓힌다.
 * 세계관 허브(studio-world-lore-store)의 항목 전 종류와 캐릭터 시트
 * (story.narrative.profiles의 특징)가 studio-story-seed-settings 어댑터로
 * 합쳐져 빌더에 공급되고, 허브·진단 소스 갱신 이벤트에도 다시 읽는다.
 * 적용 시에는 패치의 referencedSettingIds와 이름으로 푼 seedSettingRefs를
 * 회차 플랜에 함께 저장해 단계 인계 카드가 출처를 표시할 수 있게 한다.
 */
import { useEffect, useState } from "react";

import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
} from "../studio-project-diagnostic-source-store";
import type { StudioProjectDiagnosticSource } from "../studio-project-diagnostics";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import { ensureStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { StudioCharacterSheetPanel } from "./StudioCharacterSheetPanel";
import { StudioEpisodeStoryPage } from "./StudioEpisodeStoryPage";
import {
  upsertStoryCharacterProfile,
  upsertStoryCharacterRelation,
  type StudioStoryCharacterProfile,
  type StudioStoryCharacterRelation,
} from "./studio-character-profile";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import { StudioStorySeedBuilder } from "./StudioStorySeedBuilder";
import type {
  StorySeedDraft,
  StorySeedPlanPatch,
  StorySeedSettingRef,
} from "./studio-story-seed";
import {
  buildStorySeedSettingRefs,
  resolveStorySeedReferencedSettings,
} from "./studio-story-seed-settings";
import {
  STUDIO_WORLD_LORE_UPDATED_EVENT,
  ensureStudioWorldLore,
} from "./studio-world-lore-store";
import {
  STUDIO_PLANNING_UPDATED_EVENT,
  ensureStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
  type StudioProjectPlanningState,
} from "./studio-planning-store";

export type StudioProjectStoryPlanningView = "episodes" | "characters" | "world" | "timeline";

export function StudioProjectStoryPlanning({
  projectId,
  view,
}: {
  readonly projectId: string;
  readonly view: StudioProjectStoryPlanningView;
}) {
  return view === "episodes"
    ? <EpisodeSynopsisSurface projectId={projectId} />
    : <CharacterSheetSurface projectId={projectId} />;
}

function loadPlanning(projectId: string): StudioProjectPlanningState | null {
  if (typeof window === "undefined") return null;
  try {
    return ensureStudioProjectPlanning(window.localStorage, projectId);
  } catch {
    return null;
  }
}

/**
 * 씨앗 빌더 설정 인용의 전체 공급 — 진단 소스(바이블+캐릭터 시트)와
 * 세계관 허브 항목을 어댑터로 합친다 (소스가 없으면 빈 목록으로 안전 동작).
 */
function seedSettingRefs(projectId: string): readonly StorySeedSettingRef[] {
  if (typeof window === "undefined") return [];
  const source = loadStorySource(projectId);
  let lore = null;
  try {
    lore = ensureStudioWorldLore(window.localStorage, projectId);
  } catch {
    // 저장소 읽기 실패 시 초기값 null(빈 세계관)을 그대로 쓴다.
  }
  return buildStorySeedSettingRefs({
    bible: source?.story.bible ?? null,
    profiles: source?.story.narrative.profiles ?? [],
    lore,
  });
}

function EpisodeSynopsisSurface({ projectId }: { readonly projectId: string }) {
  const [planning, setPlanning] = useState<StudioProjectPlanningState | null>(
    () => loadPlanning(projectId),
  );
  const [settingRefs, setSettingRefs] = useState<readonly StorySeedSettingRef[]>(
    () => seedSettingRefs(projectId),
  );

  useEffect(() => {
    setPlanning(loadPlanning(projectId));
    setSettingRefs(seedSettingRefs(projectId));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = readStudioProjectPlanning(window.localStorage, projectId);
      if (next) setPlanning(next);
    };
    const onSettingsUpdated = () => {
      setSettingRefs(seedSettingRefs(projectId));
    };
    window.addEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
    // 세계관 허브 항목·캐릭터 시트가 바뀌면 인용 목록도 그 자리에서 갱신한다.
    window.addEventListener(STUDIO_WORLD_LORE_UPDATED_EVENT, onSettingsUpdated);
    window.addEventListener(
      STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
      onSettingsUpdated,
    );
    return () => {
      window.removeEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
      window.removeEventListener(STUDIO_WORLD_LORE_UPDATED_EVENT, onSettingsUpdated);
      window.removeEventListener(
        STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
        onSettingsUpdated,
      );
    };
  }, [projectId]);

  if (!planning) return null;

  const handleSavePlan = (plan: EpisodePlanWithSynopsis) => {
    try {
      setPlanning(saveStudioEpisodePlan(window.localStorage, projectId, plan, window));
    } catch {
      // 저장 실패 시 편집 표면의 입력은 그대로 남는다. 다음 저장에서 다시 시도할 수 있다.
    }
  };

  // 씨앗 빌더는 첫 회차 기획을 대상으로 한다 — 막 시작하는 프로젝트의 빈 페이지를
  // 없애는 것이 목적이라, 이미 줄거리가 있는 회차는 빌더 쪽에서 덮어쓰기 확인을 거친다.
  const targetPlan = planning.plans[0];
  const targetHasContent = Boolean(
    targetPlan &&
      (targetPlan.logline.trim() ||
        targetPlan.goal?.trim() ||
        targetPlan.synopsis?.trim()),
  );
  const handleApplySeed = (patch: StorySeedPlanPatch, draft: StorySeedDraft) => {
    if (!targetPlan) return;
    // 인용한 설정을 이름으로 풀어 플랜에 함께 저장한다 — 인계 카드는 나중에
    // 허브·바이블을 다시 조회하지 않고 이 출처만으로 표시할 수 있다.
    const seedSettingRefs = resolveStorySeedReferencedSettings(
      settingRefs,
      draft.referencedSettingIds,
    ).map((ref) => ({ id: ref.id, kind: ref.kind, name: ref.name }));
    handleSavePlan({ ...targetPlan, ...patch, seedSettingRefs });
  };

  return (
    <div>
      {targetPlan && (
        <div className="mb-4">
          <StudioStorySeedBuilder
            settingRefs={settingRefs}
            targetHasContent={targetHasContent}
            onApplySeed={handleApplySeed}
          />
        </div>
      )}
      <StudioEpisodeStoryPage
        season={planning.season}
        plans={planning.plans}
        onSavePlan={handleSavePlan}
      />
    </div>
  );
}

function loadStorySource(projectId: string): StudioProjectDiagnosticSource | null {
  if (typeof window === "undefined") return null;
  try {
    return ensureStudioProjectWorkspaceState(window.localStorage, projectId);
  } catch {
    return null;
  }
}

function CharacterSheetSurface({ projectId }: { readonly projectId: string }) {
  const [source, setSource] = useState<StudioProjectDiagnosticSource | null>(
    () => loadStorySource(projectId),
  );

  useEffect(() => {
    setSource(loadStorySource(projectId));
    const onSourceUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = parseStudioProjectDiagnosticSource(event.detail, projectId);
      if (next) setSource(next);
    };
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onSourceUpdated);
    return () => window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onSourceUpdated);
  }, [projectId]);

  if (!source) return null;

  const saveNarrative = (
    narrative: StudioProjectDiagnosticSource["story"]["narrative"],
  ) => {
    try {
      const next = updateStudioProjectStory(
        window.localStorage,
        projectId,
        {
          bible: source.story.bible,
          states: source.story.states,
          transitions: source.story.transitions,
          narrative,
        },
        { target: window },
      );
      setSource(next);
    } catch {
      // 저장 실패 시 시트 입력은 그대로 남는다. 다음 저장에서 다시 시도할 수 있다.
    }
  };

  const handleSaveProfile = (profile: StudioStoryCharacterProfile) => {
    saveNarrative(upsertStoryCharacterProfile(source.story.narrative, profile));
  };
  const handleSaveRelation = (relation: StudioStoryCharacterRelation) => {
    saveNarrative(upsertStoryCharacterRelation(source.story.narrative, relation));
  };

  return (
    <div>
      <StudioCharacterSheetPanel
        bible={source.story.bible}
        narrative={source.story.narrative}
        onSaveProfile={handleSaveProfile}
        onSaveRelation={handleSaveRelation}
      />
      {source.story.bible.characters.length === 0 && (
        <p>
          아직 등록된 캐릭터가 없어요. 원고나 스토리월드에서 캐릭터가 생기면,
          여기서 성격·말투·관계를 시트로 적을 수 있어요.
        </p>
      )}
    </div>
  );
}
