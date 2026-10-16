import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { fetchSearchResponse } from "@/platform/search-client";
import { unifiedWorksMoreHref } from "@/shared/components/unified-search";
import { TitleRow } from "@/shared/components/title-card";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { HonestyBadge } from "@/shared/components/ui/honesty-badge";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

import {
  MEMORY_MAX_SCENE_TOKENS,
  MEMORY_SCENE_MAX_LENGTH,
  MEMORY_TITLE_MAX_LENGTH,
  buildMemorySearchQuery,
  countMemoryLevels,
  memoryCluesProblem,
  rankMemoryMatches,
  sceneTokenInfo,
  summarizeMemoryOutcome,
  type MemoryClues,
  type MemoryCluesProblem,
  type MemoryMatch,
  type MemoryMatchLevel,
  type MemoryMatchReason,
  type MemoryTitleKnowledge,
} from "./memory-finder-model";

import type { Title } from "@/shared/lib/types";

/**
 * 기억으로 작품 찾기 — 제목이 기억나지 않을 때 장면·줄거리로 후보를 찾는다.
 *
 * 이 도구의 약속은 "확인한 것만 확인했다고 말한다"이다. 결과마다 어느 단서가 어디와 맞았는지를 보여 주고,
 * 제목 조각이 제목과 맞은 것만 "확인된 일치", 장면·태그 같은 단서가 겹친 것은 "추정 일치"/"약한 후보"라고 부르며,
 * 아무것도 맞지 않으면 못 찾았다고 말한다. 입력은 이 기능이 따로 저장하지 않는다.
 */

export interface MemoryFinderSectionProps {
  /** 시험용 주입점. 기본은 카탈로그 검색 API 의 첫 쪽(관련도 순)이다. */
  readonly search?: (query: string, signal: AbortSignal) => Promise<readonly Title[]>;
}

async function searchCatalog(query: string, signal: AbortSignal): Promise<readonly Title[]> {
  const params = new URLSearchParams({ q: query, sort: "relevance", page: "1", pageSize: "24" });
  const response = await fetchSearchResponse(params, signal);
  return response.items;
}

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | {
      readonly kind: "done";
      readonly matches: readonly MemoryMatch[];
      readonly asked: MemoryClues;
      /** 낱말이 여덟 개를 넘어 앞의 것만 쓴 경우. */
      readonly truncated: boolean;
    };

const KNOWLEDGE_OPTIONS: readonly { readonly id: MemoryTitleKnowledge; readonly ko: string; readonly en: string }[] = [
  { id: "unknown", ko: "전혀 기억나지 않아요", en: "I can't remember it" },
  { id: "partial", ko: "일부만 기억나요", en: "I remember part of it" },
  { id: "exact", ko: "정확히 기억해요", en: "I remember it exactly" },
];

const LEVELS: readonly MemoryMatchLevel[] = ["confirmed", "probable", "weak"];

const FIELD_CLASS =
  "w-full rounded-xl border border-line-strong bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/30";
const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function MemoryFinderSection({ search = searchCatalog }: MemoryFinderSectionProps) {
  const bt = useBilingual("MemoryFinderSection");
  const ids = useId();
  const sceneRef = useRef<HTMLTextAreaElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 찾는 동안 사용자가 입력을 고치면 결과가 도착해도 초점을 빼앗지 않는다. */
  const editedSinceSubmitRef = useRef(false);

  const [knowledge, setKnowledge] = useState<MemoryTitleKnowledge>("unknown");
  const [titleText, setTitleText] = useState("");
  const [scene, setScene] = useState("");
  const [problem, setProblem] = useState<MemoryCluesProblem | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /** 초점을 옮기지 않았을 때 화면 읽기 프로그램에 결과를 알리는 짧은 문장. */
  const [liveNote, setLiveNote] = useState("");

  useEffect(() => () => abortRef.current?.abort(), []);

  // 결과·오류가 나오면 제목으로 초점을 옮겨 화면 읽기 프로그램이 결과를 바로 읽게 한다.
  // 사용자가 그사이 입력을 고쳤다면 초점은 그대로 두고 결과만 조용히 알린다(run 안에서 liveNote 로).
  useEffect(() => {
    if ((phase.kind === "done" || phase.kind === "error") && !editedSinceSubmitRef.current) {
      resultHeadingRef.current?.focus();
    }
  }, [phase]);

  const currentClues = (): MemoryClues => ({ titleKnowledge: knowledge, titleText, scene });

  const run = async (clues: MemoryClues) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    editedSinceSubmitRef.current = false;
    setLiveNote("");
    setPhase({ kind: "loading" });
    try {
      const items = await search(buildMemorySearchQuery(clues), controller.signal);
      if (controller.signal.aborted) return;
      const matches = rankMemoryMatches(items, clues);
      setPhase({ kind: "done", matches, asked: clues, truncated: sceneTokenInfo(clues.scene).truncated });
      if (editedSinceSubmitRef.current) {
        setLiveNote(
          matches.length === 0
            ? bt("맞는 작품을 찾지 못했어요", "I could not find a matching story")
            : formatI18nTemplate(bt("후보 {count}편을 찾았어요", "Found {count} candidates"), { count: matches.length }),
        );
      }
    } catch {
      // 우리가 중단한 요청만 조용히 넘긴다. 클라이언트 내부 시간 초과 같은 다른 중단은 오류로 보여 줘야 한다.
      if (controller.signal.aborted) return;
      setPhase({ kind: "error" });
      if (editedSinceSubmitRef.current) setLiveNote(bt("검색을 하지 못했어요", "The search did not go through"));
    }
  };

  /** 제출과 "다시 시도"가 같은 길을 지나게 한다 — 오류 뒤 장면을 비우고 다시 눌러도 검증이 먼저 돈다. */
  const start = () => {
    const clues = currentClues();
    const found = memoryCluesProblem(clues);
    setProblem(found);
    if (found) {
      sceneRef.current?.focus();
      return;
    }
    void run(clues);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    start();
  };

  const touched = () => {
    editedSinceSubmitRef.current = true;
  };

  const problemText = (kind: MemoryCluesProblem) =>
    kind === "scene-empty"
      ? bt("기억나는 장면이나 줄거리를 한 줄이라도 적어 주세요.", "Write at least one line about a scene or the plot you remember.")
      : bt(
          "두 글자 이상의 구체적인 낱말이 필요해요. 인물·소품·장소처럼 눈에 남은 말을 넣어 보세요.",
          "I need specific words of two or more characters. Try people, objects or places you remember.",
        );

  const reasonText = (reason: MemoryMatchReason): string => {
    const fill = (ko: string, en: string) => formatI18nTemplate(bt(ko, en), { clue: reason.clue });
    switch (reason.field) {
      case "title":
        return fill("제목에 ‘{clue}’", "Title has “{clue}”");
      case "titleSpaced":
        return fill("제목에서 띄어쓰기를 빼면 ‘{clue}’", "Title has “{clue}” if spaces are ignored");
      case "altTitle":
        return fill("다른 이름에 ‘{clue}’", "Other name has “{clue}”");
      case "author":
        return fill("작가·그림 이름에 ‘{clue}’", "Creator name has “{clue}”");
      case "tag":
        return fill("태그에 ‘{clue}’", "Tag has “{clue}”");
      case "genre":
        return fill("장르에 ‘{clue}’", "Genre has “{clue}”");
      case "synopsis":
        return fill("소개에 ‘{clue}’", "Summary has “{clue}”");
    }
  };

  const badge = (level: MemoryMatchLevel) =>
    level === "confirmed" ? (
      <HonestyBadge level="confirmed" />
    ) : level === "probable" ? (
      <HonestyBadge level="estimated" />
    ) : (
      <HonestyBadge level="estimated" label={bt("약한 후보", "Weak candidate")} />
    );

  const sceneDescribedBy = [`${ids}-scene-hint`, problem ? `${ids}-scene-problem` : null].filter(Boolean).join(" ");

  return (
    <div data-memory-finder="" className="grid gap-5">
      <form onSubmit={submit} noValidate className="grid gap-4" aria-describedby={`${ids}-privacy`}>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-fg">{bt("제목을 얼마나 기억하세요?", "How much of the title do you remember?")}</legend>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
                  knowledge === option.id
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-knowledge`}
                  value={option.id}
                  checked={knowledge === option.id}
                  onChange={() => {
                    touched();
                    setKnowledge(option.id);
                  }}
                  className="sr-only"
                />
                {bt(option.ko, option.en)}
              </label>
            ))}
          </div>
        </fieldset>

        {knowledge !== "unknown" ? (
          <label className="grid gap-1.5 text-sm font-semibold text-fg" htmlFor={`${ids}-title`}>
            {knowledge === "exact" ? bt("기억하는 제목", "The title you remember") : bt("기억나는 제목 조각", "A piece of the title")}
            <input
              id={`${ids}-title`}
              type="text"
              value={titleText}
              maxLength={MEMORY_TITLE_MAX_LENGTH}
              onChange={(event) => {
                touched();
                setTitleText(event.target.value);
              }}
              autoComplete="off"
              className={cn(FIELD_CLASS, "min-h-11 font-normal")}
            />
          </label>
        ) : null}

        <div className="grid gap-1.5">
          <label className="text-sm font-semibold text-fg" htmlFor={`${ids}-scene`}>
            {bt("기억나는 장면이나 줄거리", "A scene or the plot you remember")}{" "}
            <span className="font-normal text-fg-3">{bt("(필수)", "(required)")}</span>
          </label>
          <textarea
            id={`${ids}-scene`}
            ref={sceneRef}
            rows={4}
            value={scene}
            maxLength={MEMORY_SCENE_MAX_LENGTH}
            onChange={(event) => {
              touched();
              setScene(event.target.value);
              if (problem) setProblem(null);
            }}
            aria-required="true"
            aria-invalid={problem ? true : undefined}
            aria-describedby={sceneDescribedBy}
            className={cn(FIELD_CLASS, "min-h-24 resize-y py-2")}
          />
          <p id={`${ids}-scene-hint`} className="text-xs leading-relaxed text-fg-3">
            {bt(
              "두 글자 이상의 구체적인 낱말(인물·소품·장소)을 작품의 제목·태그·소개와 맞춰 봐요. 한 글자 낱말과 ‘장면’·‘이야기’ 같은 흔한 말은 빼고 찾아요.",
              "I match specific words of two or more characters (people, objects, places) against titles, tags and summaries. One-character words and very common words are ignored.",
            )}
          </p>
          {problem ? (
            <p id={`${ids}-scene-problem`} role="alert" className="text-xs font-semibold text-bad">
              {problemText(problem)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={phase.kind === "loading"}
            className={buttonClass({ size: "lg", className: cn("min-h-12 gap-2 rounded-2xl px-6 text-sm font-bold", FOCUS_RING) })}
          >
            <Search size={16} aria-hidden="true" />
            {phase.kind === "loading" ? bt("찾는 중…", "Searching…") : bt("작품 찾기", "Find the story")}
          </button>
          <p id={`${ids}-privacy`} className="min-w-0 flex-1 text-xs leading-relaxed text-fg-3">
            {bt(
              "이 기능은 입력을 따로 저장하지 않아요. 검색에 쓰이는 낱말은 일반 검색과 같은 방식으로 처리돼요.",
              "This feature does not store what you type. The words used for searching are handled like any normal search.",
            )}
          </p>
        </div>
      </form>

      <p role="status" className="sr-only" data-memory-finder-live="">
        {liveNote}
      </p>

      <div>
        {phase.kind === "loading" ? (
          <p role="status" className="text-sm text-fg-2">
            {bt("후보를 찾고 있어요…", "Looking for candidates…")}
          </p>
        ) : null}

        {phase.kind === "error" ? (
          <div className="grid gap-2 rounded-xl border border-bad/35 bg-bad/10 p-3">
            <h3 ref={resultHeadingRef} tabIndex={-1} className={cn("w-fit rounded text-sm font-bold text-fg", FOCUS_RING)}>
              {bt("검색을 하지 못했어요", "The search did not go through")}
            </h3>
            <p className="text-xs leading-relaxed text-fg-2">
              {bt("연결이 불안정하거나 서비스가 잠시 바쁠 수 있어요. 입력한 내용은 그대로 있어요.", "The connection may be unstable or the service busy. What you typed is still here.")}
            </p>
            <button
              type="button"
              onClick={start}
              className={cn("min-h-11 w-fit rounded-lg border border-line bg-card px-4 text-xs font-semibold text-fg hover:bg-raised", FOCUS_RING)}
            >
              {bt("다시 시도", "Try again")}
            </button>
          </div>
        ) : null}

        {phase.kind === "done" ? (
          <Results phase={phase} badge={badge} reasonText={reasonText} headingRef={resultHeadingRef} headingId={`${ids}-results`} bt={bt} />
        ) : null}
      </div>
    </div>
  );
}

function Results({
  phase,
  badge,
  reasonText,
  headingRef,
  headingId,
  bt,
}: {
  readonly phase: Extract<Phase, { kind: "done" }>;
  readonly badge: (level: MemoryMatchLevel) => React.ReactNode;
  readonly reasonText: (reason: MemoryMatchReason) => string;
  readonly headingRef: React.RefObject<HTMLHeadingElement | null>;
  readonly headingId: string;
  readonly bt: (ko: string, en: string) => string;
}) {
  const outcome = summarizeMemoryOutcome(phase.matches);
  const counts = countMemoryLevels(phase.matches);
  const hasUnconfirmed = counts.probable + counts.weak > 0;
  const titleQuery = phase.asked.titleKnowledge === "unknown" ? "" : phase.asked.titleText.trim();
  // 머리말의 편수는 가장 확실한 단계만 센다 — 단계를 섞어 세면 "찾았어요 (12편)"이 부풀려진다.
  const topCount = outcome === "none" ? 0 : counts[outcome];
  const heading =
    outcome === "confirmed"
      ? formatI18nTemplate(bt("제목 조각과 맞는 작품을 찾았어요 ({count}편)", "Found stories matching the title ({count})"), { count: topCount })
      : outcome === "probable"
        ? formatI18nTemplate(bt("확실하진 않지만 단서가 겹치는 후보예요 ({count}편)", "Not certain, but these share your clues ({count})"), { count: topCount })
        : outcome === "weak"
          ? formatI18nTemplate(bt("단서가 하나만 겹치는 약한 후보예요 ({count}편)", "Weak candidates sharing a single clue ({count})"), { count: topCount })
          : bt("맞는 작품을 찾지 못했어요", "I could not find a matching story");
  const guidance =
    outcome === "none"
      ? bt(
          "이 서비스에 없는 작품이거나, 쓰신 낱말이 제목·태그·소개에 없을 수 있어요. 다른 낱말로 다시 적어 보세요.",
          "It may not be in this service, or your words may not appear in its title, tags or summary. Try different words.",
        )
      : outcome === "confirmed"
        ? bt("제목이 맞는지 작품을 열어 직접 확인해 주세요.", "Open the story to check that the title is the one you mean.")
        : bt("맞는지는 작품을 열어 직접 확인해야 해요. 단서를 더 보태면 좋아져요.", "Open the story to check it. Adding more clues helps.");

  const groups = LEVELS.map((level) => ({ level, items: phase.matches.filter((match) => match.level === level) })).filter(
    (group) => group.items.length > 0,
  );
  const groupHeading = (level: MemoryMatchLevel, count: number) =>
    formatI18nTemplate(
      level === "probable"
        ? bt("그 밖에 단서가 겹치는 추정 후보 ({count}편)", "Other candidates sharing your clues ({count})")
        : bt("그 밖에 단서가 하나만 겹치는 약한 후보 ({count}편)", "Other weak candidates sharing a single clue ({count})"),
      { count },
    );

  return (
    <section aria-labelledby={headingId} data-memory-finder-results={outcome} className="grid gap-3">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className={cn("w-fit rounded text-sm font-bold text-fg", FOCUS_RING)}>
        {heading}
      </h3>
      <p className="text-xs leading-relaxed text-fg-2">{guidance}</p>
      {hasUnconfirmed ? (
        <p className="text-xs leading-relaxed text-fg-2">
          {bt(
            "‘추정’과 ‘약한 후보’는 제목이 아니라 장면·태그 같은 단서가 겹쳤다는 뜻이에요. 맞는지는 작품을 열어 직접 확인해야 해요.",
            "“Estimated” and “weak” mean scene or tag clues overlap, not the title. Open the story to check.",
          )}
        </p>
      ) : null}
      {phase.truncated ? (
        <p className="text-xs leading-relaxed text-fg-3">
          {formatI18nTemplate(
            bt("낱말이 많아 앞의 {count}개만 썼어요.", "There were many words, so I used only the first {count}."),
            { count: MEMORY_MAX_SCENE_TOKENS },
          )}
        </p>
      ) : null}

      {groups.length > 0 ? (
        groups.map((group, groupIndex) => (
          <div key={group.level} className="grid gap-3" data-memory-group={group.level}>
            {groupIndex > 0 ? (
              <h4 className="mt-1 text-xs font-bold text-fg-2">{groupHeading(group.level, group.items.length)}</h4>
            ) : null}
            <ul className="grid gap-4">
              {group.items.map((match) => (
                <li key={match.title.id} className="grid gap-2" data-memory-match-level={match.level}>
                  <TitleRow title={match.title} />
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    {badge(match.level)}
                    {match.reasons.map((reason, index) => (
                      <span
                        key={`${reason.field}-${reason.clue}-${index}`}
                        className="inline-flex min-h-7 items-center rounded-full border border-line bg-raised px-2.5 text-[0.7rem] font-medium text-fg-2"
                      >
                        {reasonText(reason)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            href={titleQuery ? unifiedWorksMoreHref(titleQuery) : "/search"}
            className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11" })}
          >
            {bt("제목 조각으로 검색", "Search by a piece of the title")}
          </Link>
          <Link href="/explore" className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11" })}>
            {bt("장르로 둘러보기", "Browse by genre")}
          </Link>
        </div>
      )}

      <p className="text-xs leading-relaxed text-fg-3">
        {bt(
          "소개가 비어 있거나 출처 표기뿐인 작품은 소개로 비교하지 않고 제목·태그·장르로만 비교해요. 그래서 장면 하나만으로는 못 찾는 작품이 많아요.",
          "Stories with an empty summary, or one that only names its source, are compared by title, tags and genre alone — so a single scene often is not enough to find one.",
        )}
      </p>
    </section>
  );
}
