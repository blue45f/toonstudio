/**
 * Studio Dialogue Voice Section — 캐릭터 말투 지문 카드 + 이탈 제안 목록.
 *
 * 대사 일괄 편집 패널(StudioDialogueBatchPanel) 안에 접이식 섹션으로 얹히는
 * 검수 표면이다. 맞춤법 검사가 "글자"를 본다면 이 섹션은 "인물"을 본다:
 * 캐릭터별 말투 카드(어미 분포·평균 문장 길이·대표 표현)와, 지문에서 벗어난
 * 대사에 대한 "제안" 목록을 보여 준다.
 *
 * 경계:
 *  · 제안은 제안일 뿐이다 — 이 컴포넌트 어디에도 대사를 고치는 경로는 없다.
 *    할 수 있는 일은 제안을 "무시"하거나 회차를 "예외"로 지정하는 것뿐이고,
 *    그 처분도 전부 콜백으로 호스트(또는 내부 상태)에 위임한다.
 *  · 화자 귀속은 지어내지 않는다. 귀속 맵(attributionByItemId)을 받지 못하면
 *    대사 전부가 "귀속 없음"이 되고, 코어가 귀속률 미달로 지문을 만들지
 *    않으므로 이 섹션은 그 사유를 숫자와 함께 그대로 보여 준다.
 *  · 지문이 없는 캐릭터도 카드로 보여 준다(왜 없는지 포함) — 조용히
 *    사라지면 작가는 기능이 고장 난 줄 안다.
 */
import { useMemo, useState } from "react";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import {
  buildVoiceProfiles,
  dismissVoiceDeviation,
  findVoiceDeviations,
  setEpisodeVoiceException,
  voiceDeviationOptionsFromDispositions,
  voiceLinesFromDialogueItems,
  EMPTY_VOICE_DISPOSITIONS,
  type VoiceAuthorRules,
  type VoiceDeviation,
  type VoiceReviewDispositions,
} from "./studio-dialogue-voice";

import { cx } from "@/shared/lib/cx";

export interface StudioDialogueVoiceCharacter {
  readonly id: string;
  readonly name: string;
}

export type StudioDialogueVoiceSectionProps = {
  /** 패널이 이미 수집한 대사 목록(collectDialogueItems 결과). */
  items: readonly DialogueBatchItem[];
  /** 말투 카드를 만들 캐릭터 목록(스토리 바이블 순서). */
  characters: readonly StudioDialogueVoiceCharacter[];
  /**
   * 대사 id → 화자 캐릭터 id. 없으면 귀속 없음으로 계산된다(지어내지 않음).
   * 호스트가 화자 정보를 가진 표면(콘티 비트·대본 가져오기 등)에서만 채운다.
   */
  attributionByItemId?:
    | ReadonlyMap<string, string | null>
    | Readonly<Record<string, string | null>>
    | null;
  /** 대사 id → 회차 id. 회차 예외 지정의 단위. 없으면 회차 예외를 못 건다. */
  episodeIdByItemId?:
    | ReadonlyMap<string, string | null>
    | Readonly<Record<string, string | null>>
    | null;
  /** 회차 id → 표시 이름(예: "12화"). 없으면 id를 그대로 쓴다. */
  episodeLabelById?: Readonly<Record<string, string>> | null;
  /** 캐릭터별 작가 규칙(금지 표현·고정 대표 표현). */
  authorRulesByCharacterId?: Readonly<Record<string, VoiceAuthorRules>> | null;
  /** 무시·예외 처분 — controlled 로 쓸 때만 넘긴다. 없으면 섹션이 자체 보관. */
  dispositions?: VoiceReviewDispositions;
  onDispositionsChange?: (next: VoiceReviewDispositions) => void;
  /** 제안 행 클릭 → 캔버스에서 해당 대사 선택(패널의 onSelectElement 위임). */
  onSelectElement?: (pageId: string, elId: string) => void;
};

const KIND_LABEL: Record<VoiceDeviation["kind"], string> = {
  "ending-shift": "어미가 평소와 달라요",
  "length-outlier": "문장이 평소보다 길어요",
  "forbidden-phrase": "금지 표현이 있어요",
};

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function StudioDialogueVoiceSection({
  items,
  characters,
  attributionByItemId,
  episodeIdByItemId,
  episodeLabelById,
  authorRulesByCharacterId,
  dispositions: controlledDispositions,
  onDispositionsChange,
  onSelectElement,
}: StudioDialogueVoiceSectionProps) {
  const [internalDispositions, setInternalDispositions] =
    useState<VoiceReviewDispositions>(EMPTY_VOICE_DISPOSITIONS);
  const dispositions = controlledDispositions ?? internalDispositions;
  const applyDispositions = (next: VoiceReviewDispositions) => {
    if (onDispositionsChange) onDispositionsChange(next);
    if (controlledDispositions === undefined) setInternalDispositions(next);
  };

  const lines = useMemo(
    () => voiceLinesFromDialogueItems(items, attributionByItemId, episodeIdByItemId),
    [items, attributionByItemId, episodeIdByItemId],
  );
  const profiles = useMemo(
    () =>
      buildVoiceProfiles({
        lines,
        characterIds: characters.map((character) => character.id),
        authorRulesByCharacterId: authorRulesByCharacterId ?? undefined,
      }),
    [lines, characters, authorRulesByCharacterId],
  );
  const deviationOptions = useMemo(
    () => voiceDeviationOptionsFromDispositions(dispositions),
    [dispositions],
  );
  const deviations = useMemo(() => {
    const out: (VoiceDeviation & { characterName: string })[] = [];
    for (const profile of profiles) {
      if (!profile.fingerprint) continue;
      const characterName =
        characters.find((character) => character.id === profile.characterId)?.name ??
        profile.characterId;
      for (const deviation of findVoiceDeviations({
        fingerprint: profile.fingerprint,
        lines,
        options: deviationOptions,
      })) {
        out.push({ ...deviation, characterName });
      }
    }
    return out;
  }, [profiles, lines, deviationOptions, characters]);

  const nameById = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name])),
    [characters],
  );
  const readyCount = profiles.filter((profile) => profile.fingerprint != null).length;
  const exceptedEpisodeIds = dispositions.exceptedEpisodeIds;

  if (characters.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-2 py-3 text-center text-[0.62rem] leading-relaxed text-fg-4">
        캐릭터 정보가 없어 말투 지문을 만들 수 없어요. 스토리 바이블에 캐릭터를
        등록하면 캐릭터별 말투를 모아요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] leading-relaxed text-fg-4" role="status">
        말투 지문 {readyCount}명 · 확인할 제안 {deviations.length}건. 제안은
        제안일 뿐, 대사를 자동으로 고치지 않아요.
      </p>

      {/* 캐릭터별 말투 카드 — 지문이 없으면 없는 이유를 숫자로 보여 준다. */}
      <div className="space-y-1.5">
        {profiles.map((profile) => {
          const name = nameById.get(profile.characterId) ?? profile.characterId;
          const fingerprint = profile.fingerprint;
          return (
            <article
              key={profile.characterId}
              aria-label={`${name} 말투 지문`}
              className="rounded-xl border border-line bg-card/55 p-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[0.68rem] font-bold text-fg">{name}</h4>
                <span className="shrink-0 text-[0.56rem] tabular-nums text-fg-4">
                  {fingerprint
                    ? `대사 ${fingerprint.sampleLineCount}개 · 화자 확인 ${percent(fingerprint.attributionRatio)}`
                    : `대사 ${profile.eligibility.characterLineCount}개 · 화자 확인 ${percent(profile.eligibility.attributionRatio)}`}
                </span>
              </div>
              {fingerprint ? (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-[0.6rem] leading-relaxed text-fg-3">
                    자주 쓰는 어미{" "}
                    {fingerprint.endingDistribution.slice(0, 3).map((stat, index) => (
                      <span key={stat.ending}>
                        {index > 0 ? " · " : ""}
                        <span className="font-semibold text-fg-2">-{stat.ending}</span>{" "}
                        {percent(stat.ratio)}
                      </span>
                    ))}
                    {" · "}문장 평균 {fingerprint.averageSentenceLength.toFixed(1)}어절
                  </p>
                  {fingerprint.signaturePhrases.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1">
                      <span className="text-[0.56rem] font-medium text-fg-4">대표 표현</span>
                      {fingerprint.signaturePhrases.slice(0, 5).map((entry) => (
                        <span
                          key={entry.phrase}
                          className={cx(
                            "rounded-full border px-1.5 py-px text-[0.56rem]",
                            entry.pinned
                              ? "border-accent/40 bg-accent-soft/40 text-fg"
                              : "border-line bg-panel text-fg-2",
                          )}
                          title={entry.pinned ? "작가가 고정한 표현" : `${entry.lineCount}개 대사에서 등장`}
                        >
                          {entry.phrase}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {fingerprint.authorRules.forbiddenPhrases.length > 0 ? (
                    <p className="text-[0.58rem] leading-relaxed text-fg-3">
                      금지 표현: {fingerprint.authorRules.forbiddenPhrases.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-[0.6rem] leading-relaxed text-fg-3">
                  {profile.eligibility.message}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/* 회차 예외 현황 — 켜진 예외는 언제든 해제할 수 있게 항상 보여 준다. */}
      {exceptedEpisodeIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1" aria-label="말투 예외로 지정한 회차">
          <span className="text-[0.56rem] font-medium text-fg-4">예외 회차</span>
          {exceptedEpisodeIds.map((episodeId) => (
            <button
              key={episodeId}
              type="button"
              onClick={() =>
                applyDispositions(setEpisodeVoiceException(dispositions, episodeId, false))
              }
              aria-label={`${episodeLabelById?.[episodeId] ?? episodeId} 말투 예외 해제`}
              className="min-h-9 rounded-full border border-warn/40 bg-warn/10 px-2 text-[0.58rem] font-semibold text-fg-2 transition-colors hover:bg-warn/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {episodeLabelById?.[episodeId] ?? episodeId} · 예외 해제
            </button>
          ))}
        </div>
      ) : null}

      {/* 이탈 제안 — 무시와 회차 예외만 가능하다. 수정 경로는 없다. */}
      {deviations.length > 0 ? (
        <ul className="space-y-1.5" aria-label="말투 이탈 제안">
          {deviations.slice(0, 20).map((deviation) => (
            <li
              key={deviation.id}
              className="rounded-xl border border-line bg-card/55 p-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded-full border border-warn/35 bg-warn/10 px-1.5 py-px text-[0.54rem] font-semibold text-fg-2">
                  {KIND_LABEL[deviation.kind]}
                </span>
                <span className="min-w-0 truncate text-[0.62rem] font-semibold text-fg-2">
                  {deviation.characterName}
                  {deviation.pageIndex != null ? ` · ${deviation.pageIndex + 1}페이지` : ""}
                </span>
              </div>
              <button
                type="button"
                disabled={!onSelectElement || deviation.pageId == null}
                onClick={() => {
                  if (onSelectElement && deviation.pageId != null) {
                    onSelectElement(deviation.pageId, deviation.lineId);
                  }
                }}
                className="mt-1 block w-full truncate text-left text-[0.62rem] text-fg transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:text-fg"
                title={deviation.excerpt}
              >
                “{deviation.excerpt}”
              </button>
              <p className="mt-0.5 text-[0.58rem] leading-relaxed text-fg-3">
                {deviation.detail}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() =>
                    applyDispositions(dismissVoiceDeviation(dispositions, deviation.id))
                  }
                  className="min-h-9 rounded-lg border border-line bg-panel px-2 text-[0.58rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  이 제안 무시
                </button>
                {deviation.episodeId != null ? (
                  <button
                    type="button"
                    onClick={() =>
                      applyDispositions(
                        setEpisodeVoiceException(dispositions, deviation.episodeId!, true),
                      )
                    }
                    className="min-h-9 rounded-lg border border-line bg-panel px-2 text-[0.58rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {episodeLabelById?.[deviation.episodeId] ?? deviation.episodeId} 전체를
                    예외로
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : readyCount > 0 ? (
        <p className="rounded-lg border border-good/35 bg-good/10 px-2 py-1.5 text-[0.6rem] text-good" role="status">
          지문에서 크게 벗어난 대사가 없어요.
        </p>
      ) : null}
      {deviations.length > 20 ? (
        <p className="text-[0.56rem] text-fg-4">
          제안이 많아 앞의 20건만 보여줘요. 무시하거나 회차를 예외로 지정하면
          다음 제안이 올라와요.
        </p>
      ) : null}
    </div>
  );
}
