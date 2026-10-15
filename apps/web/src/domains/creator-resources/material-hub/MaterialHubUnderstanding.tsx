import { AlertTriangle, Check, Pencil, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "../navigation";
import { hubLensSlots, normalizeHubQuery, providerShortName } from "./material-hub-model";
import { HUB_CHIP_OFF, HUB_CHIP_ON, HUB_CHIP_STATIC, HUB_CHIP_SUGGESTED, HUB_PRIMARY_BUTTON } from "./material-hub-styles";

import type { HubLensView, HubOverrides } from "./material-hub-model";
import type { MaterialIntentPlan, MaterialLensId } from "@toonstudio/core/material-intent-plan";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface MaterialHubUnderstandingProps {
  readonly plan: MaterialIntentPlan;
  readonly overrides: HubOverrides;
  readonly views: readonly HubLensView[];
  /** 제출(찾기)을 한 적이 있는지 */
  readonly searched: boolean;
  /** 지금 이해가 마지막으로 찾은 것과 달라졌는지 */
  readonly dirty: boolean;
  readonly onToggleCue: (id: string) => void;
  readonly onToggleLens: (id: MaterialLensId) => void;
  /** value 가 null 이면 고친 검색어를 되돌린다. */
  readonly onEditQuery: (id: MaterialLensId, value: string | null) => void;
  readonly onApply: () => void;
}

function LensQueryRow({ view, overrides, onEditQuery }: {
  readonly view: HubLensView;
  readonly overrides: HubOverrides;
  readonly onEditQuery: MaterialHubUnderstandingProps["onEditQuery"];
}) {
  const bt = useBilingual("MaterialHubUnderstanding");
  const inputId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const { lens } = view;
  const edited = normalizeHubQuery(overrides.queries[lens.id] ?? "");
  const { slots, unavailable } = hubLensSlots(lens, overrides);
  const shown = edited || lens.providerQuery;
  const label = bt(lens.label, lens.labelEn);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  const finish = () => {
    setEditing(false);
    window.setTimeout(() => editRef.current?.focus(), 0);
  };
  const differing = slots.filter((slot) => slot.query !== shown);

  return (
    <li className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm"><strong className="font-semibold text-fg">{label}</strong>
          {lens.requires === "city" && !edited
            ? <span className="ml-2 text-fg-2">{bt("도시를 고르면 예보를 볼 수 있어요", "Pick a city to see the forecast")}</span>
            : shown
              ? <span className="ml-2 text-fg-2">{bt("보내는 검색어", "Sent as")} <q className="font-semibold text-fg">{shown}</q>{edited ? <span className="ml-1 text-xs text-fg-3">{bt("(직접 고침)", "(edited)")}</span> : null}</span>
              : <span className="ml-2 text-fg-2">{bt("보낼 검색어를 만들지 못했어요", "No query could be built")}</span>}
        </p>
        {!editing && lens.requires !== "city" ? (
          <button ref={editRef} type="button" className={`${RESOURCE_BUTTON} gap-1.5`} aria-label={bt(`${label} 검색어 고치기`, `Edit the ${label} query`)} onClick={() => { setValue(shown); setEditing(true); }}>
            <Pencil size={14} aria-hidden="true" />{bt("고치기", "Edit")}
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-fg-3">{bt(lens.reason, lens.reasonEn)}</p>
      {editing ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const next = normalizeHubQuery(value);
            if (next.length < 2) return;
            onEditQuery(lens.id, next === lens.providerQuery ? null : next);
            finish();
          }}
        >
          <label htmlFor={inputId} className="flex-1 text-sm text-fg-2">
            {bt("제공처에 보낼 검색어", "Query to send")}
            <input
              id={inputId}
              ref={inputRef}
              className={`${RESOURCE_INPUT} mt-1`}
              type="text"
              value={value}
              minLength={2}
              maxLength={80}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); finish(); }
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={RESOURCE_BUTTON}>{bt("적용", "Apply")}</button>
            <button type="button" className={RESOURCE_BUTTON} onClick={finish}>{bt("취소", "Cancel")}</button>
            {edited ? <button type="button" className={RESOURCE_BUTTON} onClick={() => { onEditQuery(lens.id, null); finish(); }}>{bt("자동 해석으로 되돌리기", "Back to automatic")}</button> : null}
          </div>
        </form>
      ) : null}
      {differing.length > 0 || unavailable.length > 0 ? (
        <details className="text-xs leading-6 text-fg-2">
          <summary className="cursor-pointer py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("제공처별 검색어", "Query per provider")}</summary>
          <ul className="space-y-1 pl-4">
            {slots.map((slot) => <li key={slot.key}>{providerShortName(slot.provider)} · <q>{slot.query}</q></li>)}
            {unavailable.map((provider) => <li key={provider} className="text-fg-3">{providerShortName(provider)} · {bt("이번 문장으로는 보낼 검색어를 만들 수 없어요", "No query can be built from this sentence")}</li>)}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/**
 * "이렇게 이해했어요" — 계획기가 읽은 종류(렌즈)·단서·미지원 낱말을 칩으로 보여 주고, 켜기/끄기/편집으로
 * 사용자가 바로잡게 한다. 여기서의 조정은 다음 검색에 쓸 "이해"를 바꿀 뿐 어떤 제공처도 부르지 않는다.
 */
export function MaterialHubUnderstanding({ plan, overrides, views, searched, dirty, onToggleCue, onToggleLens, onEditQuery, onApply }: MaterialHubUnderstandingProps) {
  const bt = useBilingual("MaterialHubUnderstanding");
  const titleId = useId();
  const cues = plan.cues.filter((cue) => !cue.neutral);
  const moods = plan.cues.filter((cue) => cue.neutral);
  const free = [...plan.unresolved, ...plan.passthrough];
  const activeViews = views.filter((view) => view.on && view.lens.providers.length > 0);

  return (
    <section aria-labelledby={titleId} className="space-y-4 border-t border-line pt-4">
      <header className="space-y-1">
        <h3 id={titleId} className="text-base font-bold">{bt("이렇게 이해했어요", "Here is how I read it")}</h3>
        <p className="text-sm leading-6 text-fg-2">
          {!searched
            ? bt("규칙 기반으로 읽은 결과예요. 칩을 켜고 끄거나 고쳐서 바로잡을 수 있고, 찾기를 누르기 전에는 어떤 제공처도 부르지 않아요.", "This is a rule-based reading. Toggle or edit the chips to correct it — no provider is called until you press Find.")
            : dirty
              ? bt("이해를 바꿨어요. 아직 이전 이해로 찾은 결과를 보고 있어요.", "You changed the reading. The results below still use the previous one.")
              : bt("이 이해로 찾았어요.", "These results use this reading.")}
        </p>
      </header>

      {plan.truncated ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-fg-2">
          <AlertTriangle size={16} aria-hidden="true" className="mt-1 shrink-0 text-warn" />
          <span>{bt("80자까지만 읽었어요. 뒤쪽 내용은 이해에 반영하지 않았어요.", "Only the first 80 characters were read; the rest is not part of this reading.")}</span>
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-fg-2">{bt("찾는 종류 — 켜 둔 종류만 찾아요", "What to look for — only the ones turned on")}</p>
        <div role="group" aria-label={bt("찾는 종류", "Kinds of material")} className="flex flex-wrap gap-2">
          {views.map((view) => {
            const label = bt(view.lens.label, view.lens.labelEn);
            return (
              <button
                key={view.lens.id}
                type="button"
                aria-pressed={view.on}
                className={view.on ? HUB_CHIP_ON : view.suggested ? HUB_CHIP_SUGGESTED : HUB_CHIP_OFF}
                onClick={() => onToggleLens(view.lens.id)}
              >
                {view.on ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                <span>{label}</span>
                {view.suggested && !view.on ? <>{" "}<span className="text-xs text-fg-3">{bt("제안", "suggested")}</span></> : null}
              </button>
            );
          })}
          {views.length === 0 ? <span className="text-sm text-fg-2">{bt("고를 수 있는 종류를 찾지 못했어요.", "No kind of material could be chosen.")}</span> : null}
        </div>
      </div>

      {cues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-2">{bt("읽은 단서 — 사전으로 영어 검색어에 연결했어요", "Cues I read — mapped to English with the built-in vocabulary")}</p>
          <div role="group" aria-label={bt("읽은 단서", "Cues I read")} className="flex flex-wrap gap-2">
            {cues.map((cue) => (
              <button key={cue.id} type="button" aria-pressed={!cue.excluded} className={cue.excluded ? HUB_CHIP_OFF : HUB_CHIP_ON} onClick={() => onToggleCue(cue.id)}>
                {cue.excluded ? <Plus size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                <span>{cue.surface}</span>{" "}
                <span className="text-xs text-fg-3">→ {cue.term}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {moods.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
          <span className="font-semibold">{bt("분위기 참고(검색어에는 쓰지 않아요)", "Mood notes (not used in queries)")}</span>
          {moods.map((cue) => <span key={cue.id} className={HUB_CHIP_STATIC}>{cue.surface}</span>)}
        </p>
      ) : null}

      {free.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-2">{bt("사전에 없는 낱말 — 지우지 않고 원문 그대로 보내요", "Words outside the vocabulary — sent as typed, never dropped")}</p>
          <div role="group" aria-label={bt("사전에 없는 낱말", "Words outside the vocabulary")} className="flex flex-wrap gap-2">
            {free.map((word) => {
              const id = `free:${word}`;
              const off = overrides.excluded.includes(id);
              return (
                <button key={id} type="button" aria-pressed={!off} className={off ? HUB_CHIP_OFF : HUB_CHIP_ON} onClick={() => onToggleCue(id)}>
                  {off ? <Plus size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  <span>{word}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-fg-3">{bt("영어 제공처에서 결과가 비면 이 낱말을 끄거나 영어로 고쳐 보세요.", "If an English-index provider returns nothing, turn the word off or retype it in English.")}</p>
        </div>
      ) : null}

      {plan.conflicts.length > 0 ? (
        <ul className="space-y-1" aria-label={bt("서로 어긋나는 단서", "Conflicting cues")}>
          {plan.conflicts.map((conflict) => (
            <li key={`${conflict.axis}:${conflict.cueIds.join("+")}`} className="flex items-start gap-2 text-sm leading-6 text-fg">
              <AlertTriangle size={16} aria-hidden="true" className="mt-1 shrink-0 text-warn" />
              <span>{bt(conflict.message, conflict.messageEn)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {activeViews.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-2">{bt("제공처에 보낼 검색어", "Queries that will be sent")}</p>
          <ul className="space-y-3">
            {activeViews.map((view) => <LensQueryRow key={view.lens.id} view={view} overrides={overrides} onEditQuery={onEditQuery} />)}
          </ul>
        </div>
      ) : null}

      {searched && dirty ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button type="button" className={HUB_PRIMARY_BUTTON} onClick={onApply}>{bt("바꾼 대로 다시 찾기", "Search again with these changes")}</button>
          <p className="text-xs text-fg-2">{bt("이미 받은 검색어의 결과는 다시 부르지 않아요.", "Results already fetched for the same query are not requested again.")}</p>
        </div>
      ) : null}
    </section>
  );
}
