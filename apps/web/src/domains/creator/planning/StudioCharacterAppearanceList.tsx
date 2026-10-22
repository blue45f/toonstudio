/**
 * 캐릭터 등장 회차·씬 목록 표면 (REPORT G4 — Plottr 프로필↔씬 연결).
 *
 * 캐릭터 시트에서 선택한 캐릭터가 "몇 화, 어떤 씬에 나왔는지"를 최근 회차부터
 * 펼쳐 보여주고, 항목 클릭 한 번으로 그 회차 작업 화면에 도달하게 한다.
 * 판정: 재등장 캐릭터 선택 시 등장 회차 목록이 뜨고 클릭 한 번에 그 회차
 * 작업 화면에 도달함.
 *
 * 이동 규칙:
 * - 회차 행 자체가 버튼이다 — 누르면 onOpenEpisode(episodeId) 로 회차 룸에
 *   간다. 콜백이 없으면(호스트 미배선) 버튼을 만들지 않고 텍스트로만 둔다.
 * - 씬 행은 onOpenScene(episodeId, sceneId) 가 있으면 콘티의 그 씬으로,
 *   없으면 onOpenEpisode 로 회차 룸에 간다. 둘 다 없으면 텍스트.
 * - 씬 단위 기록이 없는 회차는 씬 목록을 지어내지 않고 "씬 단위 기록은 없고
 *   회차 단위 기록만 있어요"라고 말한다 (코어 sceneDetail: "none").
 *
 * 데이터는 전부 props 다. 이 표면은 캐릭터 1명에 집중한다 — 선택은 호출부
 * (캐릭터 시트 패널)가 이미 갖고 있어, 패널이 고른 캐릭터를 그대로 받는다.
 */
import { useMemo } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type {
  CharacterAppearanceRecord,
  CoverageEpisodeRef,
} from "./studio-character-coverage";
import {
  appearanceEpisodeLine,
  buildCharacterAppearanceLookup,
  type AppearanceSceneRef,
  type CharacterSceneAppearanceRecord,
} from "./studio-character-appearance-lookup";

export interface StudioCharacterAppearanceListProps {
  readonly character: StudioStoryCharacter;
  readonly episodes: readonly CoverageEpisodeRef[];
  /** 커버리지 맵과 공유하는 회차 단위 등장 기록 (전 캐릭터분이어도 된다). */
  readonly appearances: readonly CharacterAppearanceRecord[];
  /** 씬 단위 등장 기록. 없으면 회차 단위 목록만 뜬다. */
  readonly sceneAppearances?: readonly CharacterSceneAppearanceRecord[];
  /** 아는 씬의 제목·순서 메타. */
  readonly scenes?: readonly AppearanceSceneRef[];
  /** 의상 id → 표시 이름. 없으면 id 를 그대로 보여준다. */
  readonly costumeLabels?: Readonly<Record<string, string>>;
  /** 외형 id → 표시 이름. 없으면 id 를 그대로 보여준다. */
  readonly appearanceLabels?: Readonly<Record<string, string>>;
  /** 회차 룸 열기. 없으면 회차 행을 링크로 만들지 않는다. */
  readonly onOpenEpisode?: (episodeId: string) => void;
  /** 콘티의 특정 씬 열기. 없으면 씬 행은 회차 룸으로 간다. */
  readonly onOpenScene?: (episodeId: string, sceneId: string) => void;
}

export function StudioCharacterAppearanceList({
  character,
  episodes,
  appearances,
  sceneAppearances,
  scenes,
  costumeLabels,
  appearanceLabels,
  onOpenEpisode,
  onOpenScene,
}: StudioCharacterAppearanceListProps) {
  const lookup = useMemo(
    () =>
      buildCharacterAppearanceLookup(
        character,
        episodes,
        appearances,
        sceneAppearances ?? [],
        scenes ?? [],
      ),
    [character, episodes, appearances, sceneAppearances, scenes],
  );

  const openScene = (episodeId: string, sceneId: string) => {
    if (onOpenScene) onOpenScene(episodeId, sceneId);
    else onOpenEpisode?.(episodeId);
  };
  const canOpenScene = Boolean(onOpenScene ?? onOpenEpisode);

  return (
    <section aria-label={`${character.name} 등장 회차·씬 목록`}>
      <h3>{character.name} — 등장 회차·씬</h3>
      {lookup.totalEpisodes === 0 ? (
        <p>{r3c04StatusText("studio.r3c04Status.planning.appearance.empty", "아직 등장 기록이 없어요. 회차에서 이 캐릭터를 태그하면 여기에 회차·씬 목록이 쌓여요.")}</p>
      ) : (
        <>
          <p>
            총 {lookup.totalEpisodes}회차
            {lookup.totalScenes > 0 ? ` · 씬 ${lookup.totalScenes}개` : ""}
            {lookup.totalCuts > 0 ? ` · ${lookup.totalCuts}컷` : ""} 등장했어요.
            회차나 씬을 누르면 그 작업 화면으로 바로 가요.
          </p>
          {lookup.ignoredRecordCount > 0 && (
            <p>
              알 수 없는 회차를 가리키는 기록 {lookup.ignoredRecordCount}건은 빼고
              보여줘요.
            </p>
          )}
          <ol>
            {lookup.episodes.map((entry) => (
              <li key={entry.episodeId}>
                {onOpenEpisode ? (
                  <button
                    type="button"
                    onClick={() => onOpenEpisode(entry.episodeId)}
                    aria-label={`${entry.episodeNumber}화 회차 룸 열기`}
                  >
                    {appearanceEpisodeLine(entry, { costumeLabels, appearanceLabels })}
                    {" — 회차 룸 열기"}
                  </button>
                ) : (
                  <span>
                    {appearanceEpisodeLine(entry, { costumeLabels, appearanceLabels })}
                  </span>
                )}
                {entry.sceneDetail === "scenes" ? (
                  <ul aria-label={`${entry.episodeNumber}화 등장 씬`}>
                    {entry.scenes.map((scene) => (
                      <li key={scene.sceneId}>
                        {canOpenScene ? (
                          <button
                            type="button"
                            onClick={() => openScene(entry.episodeId, scene.sceneId)}
                            aria-label={`${entry.episodeNumber}화 ${scene.title ?? "씬"} 콘티 열기`}
                          >
                            {scene.sequence !== null ? `씬 ${scene.sequence}` : "씬"}
                            {scene.title ? ` 「${scene.title}」` : " (제목 기록 없음)"}
                            {scene.costumeId
                              ? ` · 의상 ${costumeLabels?.[scene.costumeId] ?? scene.costumeId}`
                              : ""}
                            {scene.expression ? ` · 표정 ${scene.expression}` : ""}
                            {scene.cutCount > 0 ? ` · ${scene.cutCount}컷` : ""}
                            {" — 콘티 열기"}
                          </button>
                        ) : (
                          <span>
                            {scene.sequence !== null ? `씬 ${scene.sequence}` : "씬"}
                            {scene.title ? ` 「${scene.title}」` : " (제목 기록 없음)"}
                            {scene.costumeId
                              ? ` · 의상 ${costumeLabels?.[scene.costumeId] ?? scene.costumeId}`
                              : ""}
                            {scene.expression ? ` · 표정 ${scene.expression}` : ""}
                            {scene.cutCount > 0 ? ` · ${scene.cutCount}컷` : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>씬 단위 기록은 없고 회차 단위 기록만 있어요.</p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
