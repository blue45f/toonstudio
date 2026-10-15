import { ChevronDown, Sparkles, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MATERIAL_INTENT_MAX_LENGTH } from "@toonstudio/core/material-intent-plan";

import { MARKET_LICENSES, marketKindMeta } from "../models/market-kind";
import {
  MARKET_SENTENCE_KIND_LABEL_EN,
  marketSentenceFacets,
  marketSentenceUrlPatch,
  readMarketSentence,
} from "../models/market-sentence";

import type { FormEvent, KeyboardEvent } from "react";
import type { MarketSentenceFacet } from "../models/market-sentence";
import type { MaterialMarketParams } from "@toonstudio/core/material-intent-plan";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export interface MarketSentenceSearchProps {
  /**
   * 읽은 조건을 URL 필터(q·kind·license·tag)에 반영한다.
   * 호출은 사용자가 "이 조건으로 찾기"를 눌렀을 때뿐이고, 입력·칩 조정만으로는 부르지 않는다.
   */
  readonly onApply: (patch: Readonly<Record<string, string | null>>) => void;
}

const NO_REMOVED: ReadonlySet<MarketSentenceFacet> = new Set();

const CHIP_CLASS = cn(
  "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-semibold text-accent",
  "hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
);
const TEXT_BUTTON_CLASS = cn(
  "inline-flex min-h-11 items-center rounded-xl px-2 text-xs font-semibold text-accent underline underline-offset-2",
  "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
);

interface ChipText {
  /** 칩에 보이는 글 */
  readonly text: string;
  /** 조건 이름과 값(스크린리더 안내문에 쓴다) */
  readonly spoken: string;
}

/**
 * 문장으로 마켓 찾기 — 마켓 검색 위의 보조 입력.
 *
 * 입력하는 동안에는 순수 계획기만 돌려 "이렇게 이해했어요" 칩을 보여 주고, URL 은 바꾸지 않는다.
 * 사용자가 칩을 빼고 "이 조건으로 찾기"(Enter)를 누르면 그때 기존 URL 필터를 바꾼다. 새 API 호출은 없다.
 */
export function MarketSentenceSearch({ onApply }: MarketSentenceSearchProps) {
  const t = useBilingual("MarketSentenceSearch");
  const panelId = useId();
  const titleId = useId();
  const inputId = useId();
  const helpId = useId();
  const previewId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [removed, setRemoved] = useState<ReadonlySet<MarketSentenceFacet>>(NO_REMOVED);
  const [nothingReadable, setNothingReadable] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const chipRefs = useRef(new Map<MarketSentenceFacet, HTMLButtonElement>());
  const pendingFocus = useRef<MarketSentenceFacet | "input" | null>(null);

  // 입력 중 미리보기: 순수 함수만 돌린다. 어떤 네트워크 요청도, URL 변경도 만들지 않는다.
  const reading = useMemo(() => readMarketSentence(draft), [draft]);
  const facets = useMemo(() => marketSentenceFacets(reading.filters, removed), [reading.filters, removed]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 칩을 빼면 그 칩이 사라지므로, 키보드 초점을 이웃 칩(없으면 입력창)으로 옮긴다.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "input") inputRef.current?.focus();
    else chipRefs.current.get(target)?.focus();
  }, [removed]);

  const describe = (facet: MarketSentenceFacet, filters: MaterialMarketParams): ChipText => {
    if (facet === "kind" && filters.kind) {
      const label = t(marketKindMeta(filters.kind).label, MARKET_SENTENCE_KIND_LABEL_EN[filters.kind]);
      return { text: `${t("종류", "Type")} · ${label}`, spoken: `${t("종류", "Type")} ${label}` };
    }
    if (facet === "license" && filters.license) {
      const label = MARKET_LICENSES.find((meta) => meta.license === filters.license)?.label ?? filters.license;
      return { text: `${t("라이선스", "License")} · ${label}`, spoken: `${t("라이선스", "License")} ${label}` };
    }
    if (facet === "tag" && filters.tag) {
      return { text: `#${filters.tag}`, spoken: `${t("태그", "Tag")} ${filters.tag}` };
    }
    const keyword = filters.q ?? "";
    return { text: `${t("검색어", "Keyword")} “${keyword}”`, spoken: `${t("검색어", "Keyword")} “${keyword}”` };
  };

  const changeDraft = (value: string) => {
    setDraft(value);
    // 문장이 바뀌면 이전 문장에 맞춰 뺀 조건은 버리고 새로 읽는다.
    setRemoved(NO_REMOVED);
    setNothingReadable(false);
  };

  const removeFacet = (facet: MarketSentenceFacet) => {
    const index = facets.indexOf(facet);
    pendingFocus.current = facets[index + 1] ?? facets[index - 1] ?? "input";
    setRemoved(new Set([...removed, facet]));
    setAnnouncement(t(
      `${describe(facet, reading.filters).spoken} 조건을 뺐어요. 남은 조건 ${facets.length - 1}개`,
      `Removed ${describe(facet, reading.filters).spoken}. ${facets.length - 1} conditions left`,
    ));
  };

  const restoreRemoved = () => {
    pendingFocus.current = "input";
    setRemoved(NO_REMOVED);
    setAnnouncement(t("뺀 조건을 다시 넣었어요.", "Put the removed conditions back."));
  };

  // 안내는 열려 있는 동안의 조작에만 쓴다. 열고 닫을 때 지난 안내가 다시 읽히지 않도록 비운다.
  const toggle = () => {
    setAnnouncement("");
    setOpen((current) => !current);
  };

  const close = () => {
    setAnnouncement("");
    setOpen(false);
    toggleRef.current?.focus();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (facets.length === 0) {
      setNothingReadable(true);
      setAnnouncement(t("읽을 수 있는 조건이 없어요.", "No conditions could be read."));
      return;
    }
    setNothingReadable(false);
    onApply(marketSentenceUrlPatch(reading.filters, removed));
    const spoken = facets.map((facet) => describe(facet, reading.filters).spoken).join(", ");
    setAnnouncement(t(`조건 ${facets.length}개를 적용했어요: ${spoken}`, `Applied ${facets.length} conditions: ${spoken}`));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중의 Enter 는 글자 확정이지 제출이 아니고, Escape 는 조합 취소이지 패널 닫기가 아니다.
    if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      close();
    }
  };

  const sentence = draft.trim();

  return (
    <div className="mt-3 max-w-2xl">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        {t("문장으로 찾기", "Find by sentence")}
        <ChevronDown className={cn("size-4 motion-safe:transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      <div id={panelId} hidden={!open}>
        {open ? (
          <section aria-labelledby={titleId} className="mt-2 rounded-2xl border border-line bg-card/60 p-3 sm:p-4">
            <h2 id={titleId} className="text-sm font-bold text-fg">{t("문장으로 조건 만들기", "Build filters from a sentence")}</h2>
            <p id={helpId} className="mt-1 text-xs leading-5 text-fg-3">
              {t(
                "찾는 자료를 말하듯 적으면 종류·라이선스·태그·검색어로 바꿔 줘요. 이 마켓 안에서만 찾고, 찾기를 누르기 전에는 결과가 바뀌지 않아요.",
                "Describe what you need and it becomes a type, license, tag and keyword. It only searches this market, and results do not change until you apply.",
              )}
            </p>
            <form
              role="search"
              aria-label={t("문장으로 마켓 찾기", "Find in the market by sentence")}
              onSubmit={onSubmit}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <label htmlFor={inputId} className="sr-only">{t("찾는 자료를 문장으로 적기", "Describe what you need")}</label>
              <input
                id={inputId}
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={MATERIAL_INTENT_MAX_LENGTH}
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`${helpId} ${previewId}`}
                placeholder={t("예: 저작권 걱정 없는 학교 배경", "e.g. a school background with no copyright worries")}
                onChange={(event) => changeDraft(event.target.value)}
                onKeyDown={onKeyDown}
                className="h-12 w-full min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <button type="submit" className={buttonClass({ variant: "solid", size: "md", className: "shrink-0 max-sm:w-full" })}>
                {t("이 조건으로 찾기", "Apply")}
              </button>
            </form>

            <div id={previewId} className="mt-3">
              <p className="text-xs font-semibold text-fg-2">{t("이렇게 이해했어요", "How I read it")}</p>
              {facets.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("읽은 마켓 조건", "Market conditions read from the sentence")}>
                  {facets.map((facet) => {
                    const chip = describe(facet, reading.filters);
                    return (
                      <li key={facet} className="min-w-0 max-w-full">
                        <button
                          type="button"
                          ref={(node) => {
                            if (node) chipRefs.current.set(facet, node);
                            else chipRefs.current.delete(facet);
                          }}
                          aria-label={t(`${chip.spoken} 조건 빼기`, `Remove ${chip.spoken}`)}
                          onClick={() => removeFacet(facet)}
                          className={CHIP_CLASS}
                        >
                          <span className="truncate">{chip.text}</span>
                          <X className="size-3 shrink-0" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  {sentence
                    ? t("아직 읽어 낸 조건이 없어요. 종류(템플릿·브러시·팔레트)나 장소·사물 이름을 넣어 보세요.", "No conditions yet. Try a type (template, brush, palette) or a place or object name.")
                    : t("문장을 입력하면 읽은 조건이 칩으로 보여요.", "Type a sentence and the conditions I read appear here as chips.")}
                </p>
              )}
              {removed.size > 0 ? (
                <button type="button" onClick={restoreRemoved} className={cn(TEXT_BUTTON_CLASS, "mt-1")}>
                  {t("뺀 조건 다시 넣기", "Put removed conditions back")}
                </button>
              ) : null}
              {reading.conflicts.length > 0 ? (
                <ul className="mt-2 space-y-1" aria-label={t("서로 어긋나는 단서", "Conflicting cues")}>
                  {reading.conflicts.map((conflict) => (
                    <li key={`${conflict.axis}-${conflict.cueIds.join(",")}`} className="text-xs leading-5 text-warn">
                      {t(conflict.message, conflict.messageEn)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {reading.truncated ? (
                <p className="mt-2 text-xs leading-5 text-fg-3">
                  {t(`문장은 ${MATERIAL_INTENT_MAX_LENGTH}자까지만 읽어요.`, `Only the first ${MATERIAL_INTENT_MAX_LENGTH} characters are read.`)}
                </p>
              ) : null}
              {nothingReadable ? (
                <p role="alert" className="mt-2 text-xs leading-5 text-bad">
                  {t("읽을 수 있는 조건이 없어서 적용하지 않았어요. 종류나 장소·사물 이름을 넣어 보세요.", "Nothing could be read, so nothing was applied. Try a type or a place or object name.")}
                </p>
              ) : null}
            </div>

            {sentence ? (
              <p className="mt-2 text-xs leading-5 text-fg-3">
                {t("3D·사진·미술 같은 공식 제공처 자료는 ", "For official-provider 3D, photo and art references, ")}
                <Link href={`/research?mq=${encodeURIComponent(sentence)}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
                  {t("소재·자료 허브에서 같은 문장으로 찾기 →", "search the same sentence in the material hub →")}
                </Link>
              </p>
            ) : null}
            <p role="status" className="sr-only">{announcement}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
