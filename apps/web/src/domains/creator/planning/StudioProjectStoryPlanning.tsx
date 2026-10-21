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
 *
 * 누적 변경 (planning-boards-host-mount): episodes 표면 아래에 시즌 비트 보드와
 * 캐릭터 커버리지 맵을 실제로 장착한다. 두 보드의 입력은 이 표면이 이미 쥐고
 * 있는 데이터(시즌·회차 플랜·바이블 캐릭터)로만 공급하고, 회차 성과는
 * 애널리틱스 실집계를 resolveEpisodeMetricsLoad 로 접어 오버레이로 함께 넘긴다.
 * 비트 보드·커버리지 맵에서 회차를 고르면 줄거리 편집 대상이 그 회차로 바뀐다
 * (StudioEpisodeStoryPage 의 controlled 선택으로 공유).
 *
 * 누적 변경 (F3 reader-reaction-quote-card): episodes 표면 맨 위에 독자 반응
 * 인용 카드를 장착한다. 같은 실집계 로드를 인용 모델로 접어 이전 회차 반응을
 * 보여 주고, 인용 본문은 다음 회차 플랜의 readerReactionMemo 로 같은
 * handleSavePlan 경로로 저장한다. 실집계가 없으면 카드는 빈 상태 안내만 낸다.
 */
import { useEffect, useMemo, useState } from "react";

import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
} from "../studio-project-diagnostic-source-store";
import type { StudioProjectDiagnosticSource } from "../studio-project-diagnostics";
import type { CreatorAnalyticsResponse } from "../analytics/types";
import type { StudioStoryCharacter } from "../studio-story-bible";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import { ensureStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { useApiResource } from "@/platform/use-api-resource";
import { StudioReaderReactionQuoteCard } from "./StudioReaderReactionQuoteCard";
import {
  buildReaderReactionQuoteCard,
  pickReaderReactionMemoTarget,
} from "./studio-reader-reaction-quote";
import { StudioCharacterCoverageMap } from "./StudioCharacterCoverageMap";
import { StudioCharacterSheetPanel } from "./StudioCharacterSheetPanel";
import { StudioEpisodeStoryPage } from "./StudioEpisodeStoryPage";
import { StudioSeasonBeatBoard } from "./StudioSeasonBeatBoard";
import type { CharacterAppearanceRecord } from "./studio-character-coverage";
import { resolveEpisodeMetricsLoad } from "./studio-episode-metrics-overlay";
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

/** 비트 보드·커버리지 맵의 열·행이 되는 바이블 캐릭터. 소스가 없으면 빈 목록. */
function loadBibleCharacters(projectId: string): readonly StudioStoryCharacter[] {
  return loadStorySource(projectId)?.story.bible.characters ?? [];
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
  const [bibleCharacters, setBibleCharacters] = useState<readonly StudioStoryCharacter[]>(
    () => loadBibleCharacters(projectId),
  );
  // 보드에서 고른 회차 — 줄거리 편집 대상과 공유한다. 아직 고른 적이 없으면
  // 줄거리 표면이 내부 기본값(첫 회차)을 쓴다.
  const [pickedEpisodeId, setPickedEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    setPlanning(loadPlanning(projectId));
    setSettingRefs(seedSettingRefs(projectId));
    setBibleCharacters(loadBibleCharacters(projectId));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = readStudioProjectPlanning(window.localStorage, projectId);
      if (next) setPlanning(next);
    };
    const onSettingsUpdated = () => {
      setSettingRefs(seedSettingRefs(projectId));
      setBibleCharacters(loadBibleCharacters(projectId));
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

  // 회차 성과(실집계) — 애널리틱스와 같은 API를 기본 기간(30일)으로 읽어 두 보드의
  // 오버레이로 넘긴다. 프로젝트↔시리즈 매핑은 아직 없어 seriesId 없이 호출하고
  // (API의 기본 시리즈 동작), 404·목 응답이면 어댑터가 숫자를 만들지 않는
  // 상태로 접는다 (episode-metrics-planning-feedback 명세의 호스트 패턴).
  const metricsResource = useApiResource<CreatorAnalyticsResponse>(
    "/api/creator/analytics?period=30d",
    "회차 성과를 불러오지 못했습니다.",
  );
  const episodeMetrics = resolveEpisodeMetricsLoad(metricsResource);

  // 커버리지 맵의 등장 기록은 회차 플랜의 등장 태그(characterRefs)가 정본이다.
  // 컷·의상·표정 실측이 없는 태그 기록이라 모델 계약대로 cutCount 0
  // ("등장은 했으나 컷 수 미상")과 나머지 null 로만 채운다 — 값을 지어내지 않는다.
  const appearances = useMemo<readonly CharacterAppearanceRecord[]>(
    () =>
      (planning?.plans ?? []).flatMap((plan) =>
        plan.characterRefs.map((characterId) => ({
          episodeId: plan.episodeId,
          characterId,
          costumeId: null,
          appearanceId: null,
          expression: null,
          cutCount: 0,
        })),
      ),
    [planning],
  );

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

  // 독자 반응 인용 카드(F3) — 기획 시작 화면 맨 위에 이전 회차 실집계를
  // 인용하고, 인용 본문은 "다음 회차" 플랜의 기획 메모로 저장한다.
  // 기준 회차(가장 최근 측정 회차)보다 뒤 회차가 없으면 지금 짜는 마지막
  // 회차가 저장 대상이다. 실집계가 없으면 카드는 빈 상태 안내만 낸다.
  const reactionCard = buildReaderReactionQuoteCard(episodeMetrics);
  const reactionTarget = pickReaderReactionMemoTarget(
    planning.plans,
    reactionCard.sourceEpisode?.episodeNumber ?? null,
  );

  return (
    <div>
      <div className="mb-4">
        <StudioReaderReactionQuoteCard
          episodeMetrics={episodeMetrics}
          memoTargetLabel={
            reactionTarget ? `${reactionTarget.episodeNumber}화` : null
          }
          savedMemo={reactionTarget?.readerReactionMemo ?? null}
          onSaveMemo={
            reactionTarget
              ? (memo) =>
                  handleSavePlan({ ...reactionTarget, readerReactionMemo: memo })
              : undefined
          }
        />
      </div>
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
        selectedEpisodeId={pickedEpisodeId ?? undefined}
        onSelectEpisode={setPickedEpisodeId}
      />
      <div className="mt-4">
        <StudioSeasonBeatBoard
          season={planning.season}
          plans={planning.plans}
          characters={bibleCharacters}
          episodeMetrics={episodeMetrics}
          onSelectEpisode={setPickedEpisodeId}
        />
      </div>
      <div className="mt-4">
        <StudioCharacterCoverageMap
          characters={bibleCharacters}
          episodes={planning.plans}
          appearances={appearances}
          episodeMetrics={episodeMetrics}
          onOpenEpisode={setPickedEpisodeId}
        />
      </div>
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
