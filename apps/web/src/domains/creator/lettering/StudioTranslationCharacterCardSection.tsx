/**
 * 번역 패널의 "인물 카드" 구역 — 호칭·존대·말투·금지어/고정어를 인물 단위로 적고, 대사별 화자를 지정한다.
 *
 * 구성: 접이식 구역 헤더(요약 포함) → 오류/빈 상태 → 인물 선택 → 카드 편집(`StudioTranslationCardEditor`)
 * → 인물 직접 추가 → 대사 화자 지정(`StudioTranslationSpeakerAssignments`). 상태·저장은 컨트롤러
 * (`useStudioTranslationCards`)가 소유하고 이 구역은 그리기만 한다.
 *
 * 비동기 화면의 상태 규약: 저장소는 동기라 로딩은 없지만, 읽기/쓰기 실패는 `error` + 다시 시도로, 인물이
 * 없는 경우는 빈 상태로, 시트를 못 읽은 경우는 안내로 드러낸다. 값이 비어 있으면 "미입력" 글자 표지가 붙는다.
 */
import { ChevronDown, ChevronRight, UserPlus, Users } from "lucide-react";
import { useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { StudioSurfaceState } from "../StudioSurfaceState";

import { StudioTranslationCardEditor } from "./StudioTranslationCardEditor";
import { StudioTranslationSpeakerAssignments } from "./StudioTranslationSpeakerAssignments";
import {
  CARD_INPUT_CLASS,
  CARD_LABEL_CLASS,
  CARD_SMALL_BUTTON_CLASS,
  createManualCardId,
} from "./studio-translation-card-ui";
import { STUDIO_TRANSLATION_CARD_LIMITS } from "./studio-translation-character-card";
import {
  addManualStudioTranslationCard,
  patchStudioTranslationCard,
  pruneStudioTranslationSpeakers,
  removeStudioTranslationCard,
  setStudioTranslationSpeaker,
  summarizeStudioTranslationSpeakers,
} from "./studio-translation-character-card-edit";

import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import type { StudioTranslationCardContextStats } from "./studio-translation-card-context";
import type { StudioTranslationCardsController } from "./use-studio-translation-cards";
import type { StudioTranslationCardPatch } from "./studio-translation-character-card-edit";
import type { StudioTranslationEffectiveCard } from "./studio-translation-character-card";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioTranslationCharacterCardSection", ko, en);

export interface StudioTranslationCardContextNoteProps {
  /** 지금 보이는 인물 카드 수. 0이면 아무것도 그리지 않는다(카드를 쓰지 않는 사용자의 화면은 예전과 같다). */
  readonly cardCount: number;
  readonly stats: StudioTranslationCardContextStats;
}

/**
 * "번역 생성" 버튼 위의 한 줄 — 인물 카드가 이번 요청에 실제로 쓰이는지 말한다. 카드를 적어 놓고 화자를 지정하지
 * 않으면 요청에는 카드가 한 글자도 실리지 않는데, 그 사실이 조용히 지나가지 않게 한다.
 */
export function StudioTranslationCardContextNote({ cardCount, stats }: StudioTranslationCardContextNoteProps) {
  useBilingualI18nRevision();
  if (cardCount === 0) return null;
  const message =
    stats.withContext > 0
      ? formatI18nTemplate(
          bi("인물 카드 문맥이 붙는 대사 {v0}/{v1}개", "Character-card context on {v0} of {v1} lines"),
          { v0: stats.withContext, v1: stats.total },
        )
      : stats.attributed === 0
        ? bi(
            "화자를 지정한 대사가 없어 인물 카드는 이번 번역 요청에 쓰이지 않아요.",
            "No line has a speaker assigned, so character cards are not used in this request.",
          )
        : bi(
            "지정한 화자의 인물 카드를 찾지 못해 이번 번역 요청에 쓰이지 않아요.",
            "The assigned speakers' cards were not found, so they are not used in this request.",
          );
  return <p className="text-center text-[0.62rem] leading-relaxed text-fg-3">{message}</p>;
}

export interface StudioTranslationCharacterCardSectionProps {
  readonly controller: StudioTranslationCardsController;
  /** 패널이 이미 수집한 대사 목록(collectDialogueItems 결과). */
  readonly items: readonly DialogueBatchItem[];
  readonly targetLocale: string;
  /** 대사 행에서 캔버스로 이동. 없으면 이동 버튼을 그리지 않는다. */
  readonly onRevealCue?: (pageId: string, elId: string) => void;
  /** 처음부터 펼쳐 둘지. 기본은 접힘 — 번역 패널의 첫 화면을 길게 만들지 않는다. */
  readonly defaultOpen?: boolean;
}

export function StudioTranslationCharacterCardSection({
  controller,
  items,
  targetLocale,
  onRevealCue,
  defaultOpen = false,
}: StudioTranslationCharacterCardSectionProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // 카드를 지우면 눌린 삭제 버튼과 편집 표면이 함께 사라진다 — 포커스를 문서 맨 앞으로 잃지 않게 직접 추가 입력으로 옮긴다.
  const newNameInputRef = useRef<HTMLInputElement>(null);

  const { cards, set, error, sheetStatus } = controller;
  const selected = cards.find((card) => card.characterId === selectedId) ?? cards[0] ?? null;
  const speakerSummary = summarizeStudioTranslationSpeakers(
    set,
    items.map((item) => item.id),
  );
  // 저장하는 카드 수에는 상한이 있다. 상한에 닿으면 새 카드(직접 추가 · 시트 인물의 첫 편집)는 저장되지 않으므로,
  // 조용히 무시하지 않고 버튼을 막고 이유를 말한다.
  const atCardLimit = set.cards.length >= STUDIO_TRANSLATION_CARD_LIMITS.cards;
  const selectedIsStored = selected !== null && set.cards.some((card) => card.characterId === selected.characterId);
  const editLockedByLimit = selected !== null && !selectedIsStored && atCardLimit;
  const limitMessage = formatI18nTemplate(
    bi(
      "인물 카드는 최대 {v0}장까지 저장할 수 있어요. 쓰지 않는 카드를 지우면 다시 추가할 수 있어요.",
      "Up to {v0} character cards can be stored. Delete a card you no longer use to add another.",
    ),
    { v0: STUDIO_TRANSLATION_CARD_LIMITS.cards },
  );

  const patchCard = (card: StudioTranslationEffectiveCard, patch: StudioTranslationCardPatch) => {
    // 시트 카드는 이름을 보관용 스냅샷으로 함께 저장한다 — 시트에서 인물이 사라져도 카드를 알아볼 수 있게.
    controller.update((current) =>
      patchStudioTranslationCard(
        current,
        card.characterId,
        card.origin === "manual" ? patch : { name: card.name, ...patch },
        card.origin === "manual" ? "manual" : "story-bible",
      ),
    );
  };

  const addManual = () => {
    const name = newName.trim();
    if (name === "" || atCardLimit) return;
    const id = createManualCardId();
    controller.update((current) => addManualStudioTranslationCard(current, { id, name }));
    setSelectedId(id);
    setNewName("");
  };

  const summaryText = formatI18nTemplate(
    bi("인물 카드 · {v0}명 · 화자 지정 {v1}/{v2}", "Character cards · {v0} · speakers {v1}/{v2}"),
    { v0: cards.length, v1: speakerSummary.assigned, v2: speakerSummary.total },
  );

  return (
    <section className="rounded-lg border border-line bg-panel/60" aria-label={bi("번역 인물 카드", "Translation character cards")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${baseId}-body`}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[0.68rem] font-semibold text-fg",
          "transition-colors hover:bg-raised",
          STUDIO_FOCUS_RING,
          STUDIO_TOUCH_TARGET,
        )}
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <Users size={13} className="text-accent" aria-hidden />
        <span className="min-w-0 flex-1">{summaryText}</span>
        {error ? (
          <span className="rounded-full border border-bad/35 bg-bad/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-bad">
            {bi("저장 문제", "Storage problem")}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={`${baseId}-body`} className="space-y-3 border-t border-line/60 px-2 py-2.5">
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            {bi(
              "스토리 바이블의 캐릭터 시트에서 이름·말투를 읽어 오고(수정하지 않아요), 번역에만 필요한 호칭·존대·금지어/고정어는 여기에 따로 저장해요. 시트에 없는 값은 비워 두고 ‘미입력’으로 표시해요.",
              "Names and speech styles are read from the story bible's character sheets (never modified). Address terms, speech levels and banned/fixed terms are stored here, only for translation. Anything missing from the sheet stays blank and is marked 'Not set'.",
            )}
          </p>

          {error ? (
            <StudioSurfaceState
              state="error"
              compact
              title={
                error === "load"
                  ? bi("인물 카드를 불러오지 못했어요", "Could not load character cards")
                  : error === "unreadable"
                    ? bi("저장된 번역 문서를 읽을 수 없어요", "The stored translation document cannot be read")
                    : bi("인물 카드를 저장하지 못했어요", "Could not save character cards")
              }
              description={
                error === "load"
                  ? bi("브라우저 저장 공간을 읽을 수 없어요. 다시 시도해 보세요.", "Browser storage could not be read. Try again.")
                  : error === "unreadable"
                    ? bi(
                        "문서가 손상돼 있어 인물 카드를 쓰면 번역 단위를 잃을 수 있어요. 그래서 저장하지 않았고, 편집한 내용은 이 화면에만 남아 있어요. 번역 패널에서 문서를 다시 만든 뒤 이어서 적어 주세요.",
                        "The document is damaged, so saving cards could overwrite your translation units. Nothing was saved; your edits stay on this screen only. Rebuild the document in the translation panel, then continue here.",
                      )
                    : bi("편집한 내용은 이 화면에 남아 있지만 이 기기에 저장되지 않았어요. 저장 공간을 확인한 뒤 다시 시도하세요.", "Your edits are still on screen but were not stored on this device. Check storage and try again.")
              }
              // 손상된 문서는 다시 시도해도 같은 결과라 버튼을 두지 않는다.
              {...(error === "unreadable"
                ? {}
                : {
                    action: (
                      <button type="button" onClick={controller.retry} className={CARD_SMALL_BUTTON_CLASS}>
                        {bi("다시 시도", "Try again")}
                      </button>
                    ),
                  })}
            />
          ) : null}

          {sheetStatus === "error" ? (
            <p role="note" className="rounded-lg border border-warn/35 bg-warn/10 px-2 py-1.5 text-[0.62rem] leading-relaxed text-warn">
              {bi("스토리 바이블을 읽지 못해 시트 값 없이 보여 드려요.", "The story bible could not be read, so sheet values are not shown.")}
            </p>
          ) : null}

          {cards.length === 0 ? (
            <StudioSurfaceState
              state="empty"
              compact
              announce="none"
              icon={<Users size={18} aria-hidden />}
              title={bi("인물 카드가 아직 없어요", "No character cards yet")}
              description={
                sheetStatus === "none"
                  ? bi("이 문서에는 연결된 스토리 바이블이 없어요. 아래에서 인물을 직접 추가해 호칭과 말투를 적을 수 있어요.", "No story bible is linked to this document. Add characters below to record address terms and speech.")
                  : bi("스토리 바이블에 캐릭터를 만들면 여기서 이어서 적을 수 있어요. 지금은 아래에서 직접 추가할 수도 있어요.", "Create characters in the story bible to continue here, or add one below.")
              }
            />
          ) : (
            <div className="space-y-2">
              <div>
                <label htmlFor={`${baseId}-character`} className={CARD_LABEL_CLASS}>
                  {bi("인물", "Character")}
                </label>
                <select
                  id={`${baseId}-character`}
                  value={selected?.characterId ?? ""}
                  className={CARD_INPUT_CLASS}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {cards.map((card) => {
                    // 고정어·금지어는 없어도 되는 선택 목록("없음")이라 미입력으로 세지 않는다.
                    const missingCount = [card.filled.speechNote, card.filled.register, card.filled.addressTerms].filter(
                      (filled) => !filled
                    ).length;
                    return (
                      <option key={card.characterId} value={card.characterId}>
                        {card.name}
                        {missingCount > 0
                          ? ` · ${formatI18nTemplate(bi("미입력 {v0}", "{v0} not set"), { v0: missingCount })}`
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              {selected ? (
                <StudioTranslationCardEditor
                  key={selected.characterId}
                  card={selected}
                  peers={cards.filter((card) => card.characterId !== selected.characterId)}
                  targetLocale={targetLocale}
                  onPatch={(patch) => patchCard(selected, patch)}
                  {...(editLockedByLimit ? { lockedReason: limitMessage } : {})}
                  {...(selected.origin === "story-bible"
                    ? {}
                    : {
                        onRemove: () => {
                          newNameInputRef.current?.focus();
                          controller.update((current) => removeStudioTranslationCard(current, selected.characterId));
                          setSelectedId(null);
                        },
                      })}
                />
              ) : null}
            </div>
          )}

          <form
            className="flex items-end gap-1.5 border-t border-line/60 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              addManual();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor={`${baseId}-new`} className={CARD_LABEL_CLASS}>
                {bi("인물 직접 추가", "Add a character manually")}
              </label>
              <input
                id={`${baseId}-new`}
                ref={newNameInputRef}
                type="text"
                value={newName}
                maxLength={40}
                placeholder={bi("이름", "Name")}
                className={CARD_INPUT_CLASS}
                aria-describedby={atCardLimit ? `${baseId}-limit` : undefined}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className={CARD_SMALL_BUTTON_CLASS}
              disabled={newName.trim() === "" || atCardLimit}
              aria-label={bi("인물 추가", "Add character")}
            >
              <UserPlus size={11} aria-hidden />
              {bi("추가", "Add")}
            </button>
          </form>
          {atCardLimit ? (
            <p id={`${baseId}-limit`} role="note" className="text-[0.62rem] leading-relaxed text-warn">
              {limitMessage}
            </p>
          ) : null}

          <StudioTranslationSpeakerAssignments
            items={items}
            cards={cards}
            speakers={set.speakers}
            onAssign={(dialogueId, assignment) =>
              controller.update((current) => setStudioTranslationSpeaker(current, dialogueId, assignment))
            }
            onPruneOrphans={(liveIds) =>
              controller.update((current) => pruneStudioTranslationSpeakers(current, liveIds))
            }
            {...(onRevealCue ? { onRevealCue } : {})}
          />
        </div>
      ) : null}
    </section>
  );
}
