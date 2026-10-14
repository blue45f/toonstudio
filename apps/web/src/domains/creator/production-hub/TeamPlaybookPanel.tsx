import { Archive, ArchiveRestore, BookOpenText, Plus } from "lucide-react";
import { useState } from "react";

import { PRODUCTION_PROCESS_LABELS } from "./production-labels";
import { ProductionPill, ProductionSectionCard } from "./production-ui";
import type { PlaybookRuleCard } from "./team-playbook-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface PlaybookCardDraft {
  readonly title: string;
  readonly body: string;
  readonly processKeys: readonly string[];
}

function CardRow({
  card,
  onSetArchived,
}: {
  readonly card: PlaybookRuleCard;
  readonly onSetArchived?: (cardId: string, archived: boolean) => void;
}) {
  const bt = useBilingual("TeamPlaybookPanel");
  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-panel p-3",
        card.archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold leading-5 text-fg">
              {bt(card.title.ko, card.title.en)}
            </p>
            {card.source === "pin-pattern" ? (
              <ProductionPill tone="accent">
                {bt(
                  `검수 핀 승격${card.occurrences !== null ? ` · ${card.occurrences}회 반복` : ""}`,
                  `From review pins${card.occurrences !== null ? ` · ${card.occurrences}x` : ""}`,
                )}
              </ProductionPill>
            ) : (
              <ProductionPill>{bt("직접 등록", "Manual")}</ProductionPill>
            )}
            {card.processKeys.length === 0 ? (
              <ProductionPill>{bt("전 공정 공통", "All processes")}</ProductionPill>
            ) : (
              card.processKeys.map((key) => {
                const label = PRODUCTION_PROCESS_LABELS[key];
                return (
                  <ProductionPill key={key}>
                    {label ? bt(label.ko, label.en) : key}
                  </ProductionPill>
                );
              })
            )}
            {card.archived ? (
              <ProductionPill tone="warning">{bt("보관됨", "Archived")}</ProductionPill>
            ) : null}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-fg-2">
            {bt(card.body.ko, card.body.en)}
          </p>
          {card.evidenceThreadIds.length > 0 ? (
            <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
              {bt(
                `근거 검수 핀 ${card.evidenceThreadIds.length}건 연결됨`,
                `${card.evidenceThreadIds.length} evidence pin(s) linked`,
              )}
            </p>
          ) : null}
        </div>
        {onSetArchived ? (
          <button
            type="button"
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-9 shrink-0 gap-1",
            })}
            onClick={() => onSetArchived(card.id, !card.archived)}
          >
            {card.archived ? (
              <ArchiveRestore className="size-3.5" aria-hidden="true" />
            ) : (
              <Archive className="size-3.5" aria-hidden="true" />
            )}
            {card.archived ? bt("복원", "Restore") : bt("보관", "Archive")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 팀 플레이북 (REPORT T-2) — 프로젝트 표면.
 *
 * 프로젝트 단위 규칙 카드를 쌓는 공간. 카드는 직접 등록하거나
 * 검수 핀 패턴 리포트(R-2)의 승격으로 들어오고, 관련 공정 화면에서는
 * PlaybookProcessReference가 이 카드들을 참조로 띄운다.
 * 이 컴포넌트는 표시와 콜백 전달만 하고, 저장·승격은 호스트(모델
 * 저장소)의 몫이다.
 */
export function TeamPlaybookPanel({
  cards,
  processOptions,
  onCreate,
  onSetArchived,
  className,
}: {
  readonly cards: readonly PlaybookRuleCard[];
  /** 등록 폼의 공정 선택지 (canonical 키). 라벨은 PRODUCTION_PROCESS_LABELS. */
  readonly processOptions: readonly string[];
  readonly onCreate?: (draft: PlaybookCardDraft) => void;
  readonly onSetArchived?: (cardId: string, archived: boolean) => void;
  readonly className?: string;
}) {
  const bt = useBilingual("TeamPlaybookPanel");
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<readonly string[]>([]);

  const visibleCards = showArchived
    ? cards
    : cards.filter((card) => !card.archived);
  const archivedCount = cards.filter((card) => card.archived).length;
  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const toggleProcess = (key: string) => {
    setSelectedProcesses((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  };

  return (
    <ProductionSectionCard
      className={cn(className)}
      title={bt("팀 플레이북", "Team playbook")}
      description={bt(
        "이 작품에서 지키기로 한 규칙을 카드로 쌓아 두는 곳이에요. 카드를 등록하면 관련 공정 화면에서 참조로 조용히 뜨고, 반복되는 검수 지적은 핀 패턴 리포트에서 여기로 승격할 수 있어요.",
        "Project rules as cards. Cards surface quietly as references on the processes they apply to, and recurring review notes can be promoted here from the pin pattern report.",
      )}
    >
      {visibleCards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-panel p-4 text-xs leading-5 text-fg-3">
          {bt(
            "아직 규칙 카드가 없어요. 아래에서 첫 규칙을 등록하거나, 검수 핀 패턴 리포트에서 반복 지적을 승격해 보세요.",
            "No rule cards yet. Add the first rule below, or promote a recurring note from the review pin pattern report.",
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleCards.map((card) => (
            <CardRow key={card.id} card={card} onSetArchived={onSetArchived} />
          ))}
        </ul>
      )}

      {archivedCount > 0 ? (
        <button
          type="button"
          className="mt-3 text-xs font-semibold text-fg-2 underline-offset-2 hover:underline"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived
            ? bt("보관된 카드 숨기기", "Hide archived cards")
            : bt(`보관된 카드 ${archivedCount}장 보기`, `Show ${archivedCount} archived card(s)`)}
        </button>
      ) : null}

      {onCreate ? (
        <form
          className="mt-4 space-y-3 rounded-xl border border-line bg-panel p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onCreate({
              title: title.trim(),
              body: body.trim(),
              processKeys: selectedProcesses,
            });
            setTitle("");
            setBody("");
            setSelectedProcesses([]);
          }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <BookOpenText className="size-3.5" aria-hidden="true" />
            {bt("새 규칙 카드", "New rule card")}
          </p>
          <label className="block">
            <span className="text-[0.6875rem] font-semibold text-fg-2">
              {bt("제목", "Title")}
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={bt(
                "예: 배경 톤은 2종까지만",
                "e.g. Backgrounds use at most two tone sets",
              )}
              className="mt-1 min-h-9 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>
          <label className="block">
            <span className="text-[0.6875rem] font-semibold text-fg-2">
              {bt("내용", "Rule")}
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder={bt(
                "지켜야 할 규칙과 이유를 적어 주세요.",
                "Write the rule and why it matters.",
              )}
              className="mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-xs leading-5 text-fg"
            />
          </label>
          <fieldset>
            <legend className="text-[0.6875rem] font-semibold text-fg-2">
              {bt("관련 공정 (선택 안 하면 전 공정 공통)", "Processes (none = all processes)")}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {processOptions.map((key) => {
                const label = PRODUCTION_PROCESS_LABELS[key];
                const selected = selectedProcesses.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleProcess(key)}
                    className={buttonClass({
                      variant: selected ? "solid" : "outline",
                      size: "sm",
                      className: "min-h-8",
                    })}
                  >
                    {label ? bt(label.ko, label.en) : key}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={!canSubmit}
            className={buttonClass({
              variant: "solid",
              size: "sm",
              className: "min-h-9 gap-1",
            })}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {bt("규칙 카드 등록", "Add rule card")}
          </button>
        </form>
      ) : null}
    </ProductionSectionCard>
  );
}
