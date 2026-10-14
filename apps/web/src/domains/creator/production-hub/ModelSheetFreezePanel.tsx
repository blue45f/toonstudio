/**
 * 모델 시트 동결 패널 — 캐릭터별 기준본 동결 상태와 변경 영향을 보여 준다.
 *
 * We-toon 연구의 모델 시트(합의된 표정·포즈 기준본)를 제품 표면으로 옮긴
 * 부품이다. 표시와 콜백만 맡는다: 동결·변경 등록·영향 확인은 호스트가
 * model-sheet-freeze-model의 순수 연산으로 처리해 결과를 다시 내려 준다.
 *
 * - 동결되지 않은 캐릭터는 경고로만 말한다. 여기서 선화를 막지 않는다
 *   (차단은 호스트의 엄격 모드 몫이고, 판정값은 모델이 분리해 준다).
 * - 동결 후 변경이 있으면 영향 회차와 미확인 회차를 그대로 보여 준다.
 *   숫자를 지어내지 않는다 — 사용 정보(usage)는 호스트가 실측해 넘긴다.
 * - 캐릭터가 없으면 빈 상태로 안내한다.
 */
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  frozenModelSheetRevision,
  modelSheetCompleteness,
  type CharacterModelSheet,
  type ModelSheetImpact,
} from "./model-sheet-freeze-model";

export interface ModelSheetPanelCharacter {
  readonly characterId: string;
  readonly characterName: string;
}

export interface ModelSheetFreezePanelProps {
  readonly characters: readonly ModelSheetPanelCharacter[];
  readonly sheets: readonly CharacterModelSheet[];
  /** 캐릭터별 영향 분석. 없으면 변경 경고는 계산하지 않는다(지어내지 않음). */
  readonly impacts?: ReadonlyMap<string, ModelSheetImpact>;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly onFreeze?: (characterId: string) => void;
  readonly onAcknowledgeImpact?: (characterId: string, episodeId: string) => void;
}

function CharacterRow({
  character,
  sheet,
  impact,
  onFreeze,
  onAcknowledgeImpact,
}: {
  readonly character: ModelSheetPanelCharacter;
  readonly sheet: CharacterModelSheet | undefined;
  readonly impact: ModelSheetImpact | undefined;
  readonly onFreeze?: (characterId: string) => void;
  readonly onAcknowledgeImpact?: (characterId: string, episodeId: string) => void;
}) {
  const bt = useBilingual("ModelSheetFreezePanel");
  const frozenRevision = sheet ? frozenModelSheetRevision(sheet) : null;
  const completeness = modelSheetCompleteness(frozenRevision);
  const frozen = sheet?.status === "frozen";
  const unacknowledged = impact?.unacknowledgedEpisodeIds ?? [];
  const latestChange = impact?.latestChange ?? null;

  return (
    <li className="rounded-2xl border border-line bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{character.characterName}</p>
        {frozen ? (
          <span className="rounded-full border border-line bg-accent-soft px-2 py-0.5 text-[0.7rem] font-bold text-fg">
            {bt(`동결됨 · 기준본 ${sheet.frozenRevision}판`, `Frozen · revision ${sheet.frozenRevision}`)}
          </span>
        ) : (
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
            {bt("동결 전 (초안)", "Not frozen (draft)")}
          </span>
        )}
        {frozen && sheet.frozenByName ? (
          <span className="ml-auto text-xs text-fg-3">
            {bt(`${sheet.frozenByName} 님이 동결`, `Frozen by ${sheet.frozenByName}`)}
          </span>
        ) : null}
      </div>

      {frozen ? (
        <p className="mt-1.5 text-xs leading-5 text-fg-3">
          {completeness.complete
            ? bt("표정·포즈 기준본이 모두 갖춰져 있어요.", "Expression and pose references are both in place.")
            : bt(
                `빠진 기준본: ${completeness.missingLabels.map((label) => label.ko).join(", ")}`,
                `Missing: ${completeness.missingLabels.map((label) => label.en).join(", ")}`,
              )}
        </p>
      ) : (
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            "아직 합의된 기준본이 동결되지 않았어요. 선화를 시작하면 이 캐릭터의 수정이 어려워지니, 표정·포즈 기준본을 먼저 합의해 동결하세요.",
            "No agreed reference is frozen yet. Fixes get hard once line art starts — agree the expression/pose sheet and freeze it first.",
          )}
        </p>
      )}

      {latestChange ? (
        <div className="mt-2 rounded-xl border border-line bg-panel p-3">
          <p className="text-xs font-bold text-fg-2">
            {bt(
              `기준본 변경 ${latestChange.fromRevision}판 → ${latestChange.toRevision}판 · ${latestChange.changedByName}`,
              `Reference changed r${latestChange.fromRevision} → r${latestChange.toRevision} · ${latestChange.changedByName}`,
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg">{latestChange.reason}</p>
          {impact && impact.affectedEpisodes.length > 0 ? (
            <p className="mt-1.5 text-xs leading-5 text-fg-3">
              {bt(
                `옛 기준본으로 그린 회차 ${impact.affectedEpisodes.length}개 (컷 ${impact.affectedCutCount}개)`,
                `${impact.affectedEpisodes.length} episode(s) drawn against the old reference (${impact.affectedCutCount} cuts)`,
              )}
            </p>
          ) : null}
          {unacknowledged.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {impact?.affectedEpisodes
                .filter((episode) => unacknowledged.includes(episode.episodeId))
                .map((episode) => (
                  <li key={episode.episodeId} className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                    <span>{episode.episodeLabel}</span>
                    <span className="text-xs text-fg-3">{bt(`컷 ${episode.cutCount}개`, `${episode.cutCount} cuts`)}</span>
                    {onAcknowledgeImpact ? (
                      <button
                        type="button"
                        className={buttonClass({ size: "sm", className: "ml-auto min-h-11" })}
                        onClick={() => onAcknowledgeImpact(character.characterId, episode.episodeId)}
                      >
                        {bt("영향 확인", "Acknowledge")}
                      </button>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : impact && impact.affectedEpisodes.length > 0 ? (
            <p className="mt-1.5 text-xs font-bold text-fg-2">{bt("영향 회차를 모두 확인했어요.", "All affected episodes acknowledged.")}</p>
          ) : null}
        </div>
      ) : null}

      {!frozen && onFreeze && sheet && sheet.revisions.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className={buttonClass({ size: "sm", className: "min-h-11" })}
            onClick={() => onFreeze(character.characterId)}
          >
            {bt("이 기준본으로 동결", "Freeze this reference")}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ModelSheetFreezePanel(props: ModelSheetFreezePanelProps) {
  const bt = useBilingual("ModelSheetFreezePanel");
  const { characters, sheets, impacts, loading, error, onRetry, onFreeze, onAcknowledgeImpact } = props;

  if (loading) {
    return (
      <section aria-label={bt("모델 시트", "Model sheets")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-panel" />
        <div className="mt-3 space-y-2">
          <div className="h-16 animate-pulse rounded-xl bg-panel" />
          <div className="h-16 animate-pulse rounded-xl bg-panel" />
        </div>
        <p className="mt-3 text-xs text-fg-3">{bt("모델 시트를 불러오고 있어요.", "Loading model sheets.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("모델 시트", "Model sheets")} className={cn("rounded-2xl border border-line bg-card p-4")}>
        <p className="text-sm font-bold text-fg">{bt("모델 시트를 불러오지 못했어요.", "Couldn't load model sheets.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  if (characters.length === 0) {
    return (
      <section aria-label={bt("모델 시트", "Model sheets")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-black text-fg">{bt("모델 시트", "Model sheets")}</p>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            "아직 캐릭터가 없어요. 캐릭터를 등록하면 합의한 표정·포즈 기준본을 여기에 동결해, 모든 회차의 일관성 기준으로 쓸 수 있어요.",
            "No characters yet. Once characters exist, freeze their agreed expression/pose sheet here as the consistency reference for every episode.",
          )}
        </p>
      </section>
    );
  }

  const sheetById = new Map(sheets.map((sheet) => [sheet.characterId, sheet]));
  const frozenCount = characters.filter((character) => sheetById.get(character.characterId)?.status === "frozen").length;

  return (
    <section aria-label={bt("모델 시트", "Model sheets")} className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt("모델 시트", "Model sheets")}</p>
        <span className="text-xs text-fg-3">
          {bt(`동결 ${frozenCount}/${characters.length}명`, `${frozenCount}/${characters.length} frozen`)}
        </span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {characters.map((character) => (
          <CharacterRow
            key={character.characterId}
            character={character}
            sheet={sheetById.get(character.characterId)}
            impact={impacts?.get(character.characterId)}
            onFreeze={onFreeze}
            onAcknowledgeImpact={onAcknowledgeImpact}
          />
        ))}
      </ul>
    </section>
  );
}
