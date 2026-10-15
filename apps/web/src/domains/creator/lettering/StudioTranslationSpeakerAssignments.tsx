/**
 * 대사별 화자·청자 지정 — 인물 카드를 번역 요청과 QA에 연결하는 유일한 입구.
 *
 * 대사 요소(말풍선·텍스트)에는 화자 필드가 없다. 그래서 작가가 명시한 지정만 쓰고, 지정이 없는 대사는 인물
 * 문맥도 인물 규칙도 받지 않는다(추정하지 않는다). 이 표면은 그 지정을 빠르게 하도록 돕는다:
 * "미지정만 보기"로 남은 것만 추리고, 각 행은 키보드로 조작되는 기본 `select` 두 개와 캔버스 보기 버튼이다.
 * 긴 목록은 30줄씩 나눠 그려 DOM 을 가볍게 유지한다.
 */
import { Eye } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CARD_LABEL_CLASS, CARD_SMALL_BUTTON_CLASS, CARD_INPUT_CLASS } from "./studio-translation-card-ui";
import { studioTranslationSpeakerOf } from "./studio-translation-character-card";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import type {
  StudioTranslationEffectiveCard,
  StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioTranslationSpeakerAssignments", ko, en);

const biFormat = (ko: string, en: string, values: Readonly<Record<string, string | number>>): string =>
  formatI18nTemplate(bi(ko, en), values);

const PAGE_SIZE = 30;

export interface StudioTranslationSpeakerAssignmentsProps {
  readonly items: readonly DialogueBatchItem[];
  readonly cards: readonly StudioTranslationEffectiveCard[];
  readonly speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
  readonly onAssign: (
    dialogueId: string,
    assignment: { readonly speakerId: string | null; readonly listenerId: string | null },
  ) => void;
  readonly onPruneOrphans: (liveDialogueIds: ReadonlySet<string>) => void;
  readonly onRevealCue?: (pageId: string, elId: string) => void;
}

export function StudioTranslationSpeakerAssignments({
  items,
  cards,
  speakers,
  onAssign,
  onPruneOrphans,
  onRevealCue,
}: StudioTranslationSpeakerAssignmentsProps) {
  useBilingualI18nRevision();
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  // "미지정만 보기"에서 방금 지정한 행은 필터를 다시 켜기 전까지 남겨 둔다 — 선택하자마자 행이 사라지면 키보드로
  // 고르던 사람의 포커스가 문서 맨 앞으로 날아가고 목록이 한 칸씩 밀린다.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  // "더 보기"로 새로 나타난 첫 행 — 눌린 버튼이 사라져도 포커스가 새 행으로 이어지게 한다.
  const focusAfterRevealRef = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterRevealRef.current;
    if (id === null) return;
    focusAfterRevealRef.current = null;
    document.getElementById(`speaker-${id}-speaker`)?.focus();
  }, [visible]);

  const rows = useMemo(() => {
    const ordinalByPage = new Map<string, number>();
    return items.map((item) => {
      const ordinal = (ordinalByPage.get(item.pageId) ?? 0) + 1;
      ordinalByPage.set(item.pageId, ordinal);
      return { item, ordinal, assignment: studioTranslationSpeakerOf(speakers, item.id) };
    });
  }, [items, speakers]);

  const assignedCount = rows.filter((row) => row.assignment !== null).length;
  const filtered = onlyUnassigned
    ? rows.filter((row) => row.assignment === null || pinned.has(row.item.id))
    : rows;
  const assign: StudioTranslationSpeakerAssignmentsProps["onAssign"] = (dialogueId, assignment) => {
    setPinned((current) => (current.has(dialogueId) ? current : new Set(current).add(dialogueId)));
    onAssign(dialogueId, assignment);
  };
  const shown = filtered.slice(0, visible);
  const liveIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const orphanCount =
    items.length === 0 ? 0 : Object.keys(speakers).filter((id) => !liveIds.has(id)).length;
  const cardIds = new Set(cards.map((card) => card.characterId));

  const personOptions = (selected: string | null, exclude: string | null) => (
    <>
      <option value="">{bi("미지정", "Unassigned")}</option>
      {cards
        .filter((card) => card.characterId !== exclude)
        .map((card) => (
          <option key={card.characterId} value={card.characterId}>
            {card.name}
          </option>
        ))}
      {selected !== null && !cardIds.has(selected) ? (
        <option value={selected}>{bi("알 수 없는 인물", "Unknown character")}</option>
      ) : null}
    </>
  );

  return (
    <section aria-label={bi("대사 화자 지정", "Dialogue speaker assignment")} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.66rem] font-bold text-fg">{bi("대사 화자 지정", "Dialogue speakers")}</h4>
        <span role="status" className="text-[0.62rem] tabular-nums text-fg-2">
          {biFormat("지정 {v0}/{v1}", "Assigned {v0}/{v1}", { v0: assignedCount, v1: rows.length })}
        </span>
      </div>
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        {bi(
          "화자를 지정한 대사에만 인물 카드가 AI 번역 요청과 QA에 적용돼요. 지정하지 않은 대사는 추정하지 않고 그대로 둡니다.",
          "Character cards apply to AI translation requests and QA only for dialogue with an assigned speaker. Unassigned lines are never guessed.",
        )}
      </p>

      {orphanCount > 0 ? (
        <button type="button" className={CARD_SMALL_BUTTON_CLASS} onClick={() => onPruneOrphans(liveIds)}>
          {biFormat(
            "문서에 없는 대사 {v0}개의 지정 정리",
            "Clean up {v0} assignments for deleted lines",
            { v0: orphanCount },
          )}
        </button>
      ) : null}

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2 py-2 text-[0.62rem] leading-relaxed text-fg-3">
          {bi("인물 카드를 하나 이상 만들어야 화자를 지정할 수 있어요.", "Create at least one character card before assigning speakers.")}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2 py-2 text-[0.62rem] leading-relaxed text-fg-3">
          {bi("지정할 말풍선·텍스트가 없어요.", "There are no bubbles or text to assign.")}
        </p>
      ) : (
        <>
          <label className="flex min-h-9 items-center gap-1.5 text-[0.64rem] text-fg-2 pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={onlyUnassigned}
              onChange={(event) => {
                setOnlyUnassigned(event.target.checked);
                setPinned(new Set());
                setVisible(PAGE_SIZE);
              }}
              className="size-4 accent-accent"
            />
            {bi("미지정 대사만 보기", "Show unassigned lines only")}
          </label>
          {assignedCount === rows.length ? (
            <p role="status" className="rounded-lg border border-line bg-panel px-2 py-2 text-[0.62rem] text-fg-2">
              {bi("모든 대사에 화자가 지정돼 있어요.", "Every line has a speaker.")}
            </p>
          ) : null}
          {filtered.length > 0 ? (
            <ul className="space-y-1.5">
              {shown.map(({ item, ordinal, assignment }) => {
                const rowId = `speaker-${item.id}`;
                const rowName = formatI18nTemplate(
                  bi("{v0}페이지 {v1}번째 대사", "Page {v0}, line {v1}"),
                  { v0: item.pageIndex + 1, v1: ordinal },
                );
                return (
                  <li key={item.id} className="border-t border-line/60 pt-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 truncate text-[0.62rem] text-fg-2" title={item.text}>
                        <span className="font-semibold">{rowName}</span> · {item.text}
                      </p>
                      {onRevealCue ? (
                        <button
                          type="button"
                          className={CARD_SMALL_BUTTON_CLASS}
                          aria-label={formatI18nTemplate(bi("{v0} 캔버스에서 보기", "Show {v0} on canvas"), { v0: rowName })}
                          onClick={() => onRevealCue(item.pageId, item.id)}
                        >
                          <Eye size={11} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      <div>
                        <label htmlFor={`${rowId}-speaker`} className={CARD_LABEL_CLASS}>{bi("화자", "Speaker")}</label>
                        <select
                          id={`${rowId}-speaker`}
                          aria-label={formatI18nTemplate(bi("{v0} 화자", "{v0} speaker"), { v0: rowName })}
                          value={assignment?.speakerId ?? ""}
                          className={CARD_INPUT_CLASS}
                          onChange={(event) =>
                            assign(item.id, {
                              speakerId: event.target.value === "" ? null : event.target.value,
                              listenerId: assignment?.listenerId ?? null,
                            })
                          }
                        >
                          {personOptions(assignment?.speakerId ?? null, null)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${rowId}-listener`} className={CARD_LABEL_CLASS}>{bi("청자", "Listener")}</label>
                        <select
                          id={`${rowId}-listener`}
                          aria-label={formatI18nTemplate(bi("{v0} 청자", "{v0} listener"), { v0: rowName })}
                          value={assignment?.listenerId ?? ""}
                          disabled={assignment === null}
                          className={CARD_INPUT_CLASS}
                          onChange={(event) =>
                            assign(item.id, {
                              speakerId: assignment?.speakerId ?? null,
                              listenerId: event.target.value === "" ? null : event.target.value,
                            })
                          }
                        >
                          {personOptions(assignment?.listenerId ?? null, assignment?.speakerId ?? null)}
                        </select>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {filtered.length > visible ? (
            <button
              type="button"
              className={CARD_SMALL_BUTTON_CLASS}
              onClick={() => {
                focusAfterRevealRef.current = filtered[visible]?.item.id ?? null;
                setVisible((count) => count + PAGE_SIZE);
              }}
            >
              {biFormat("{v0}개 더 보기", "Show {v0} more", { v0: Math.min(PAGE_SIZE, filtered.length - visible) })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
