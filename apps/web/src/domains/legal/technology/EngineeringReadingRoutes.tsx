import { ArrowRight, Clock3, Users } from "lucide-react";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { ENGINEERING_READING_FLOW_DIAGRAM } from "./engineering-reading-flow-diagram";
import {
  ENGINEERING_DECK_BRIEF_MINUTES,
  ENGINEERING_READING_ROUTES,
  ENGINEERING_START_PAGES,
  readingRouteTime,
  readingStepHref,
  type ReadingRoute,
  type ReadingRouteStep,
} from "./engineering-reading-routes";
import { findEngineeringPage } from "./engineering-tech-pages";

import Link from "@/shared/navigation/router-link";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringReadingRoutes", ko, en);

/** 분 수를 "약 N분" / "약 H시간 M분" 으로 쓴다. */
function approximateTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return formatI18nTemplate(String(bi("약 {value0}분", "about {value0} min")), { value0: minutes });
  if (rest === 0) return formatI18nTemplate(String(bi("약 {value0}시간", "about {value0} h")), { value0: hours });
  return formatI18nTemplate(String(bi("약 {value0}시간 {value1}분", "about {value0} h {value1} min")), { value0: hours, value1: rest });
}

/** 페이지 한 장의 시간 표기. 읽는 페이지는 읽기 시간, 발표 페이지는 발표 시간이다. 시간이 정해지지 않은 페이지는 빈 문자열이다. */
function pageTimeText(readingMinutes: number | undefined, talkMinutes: number | undefined): string {
  if (readingMinutes) return formatI18nTemplate(String(bi("읽기 약 {value0}분", "About {value0} min read")), { value0: readingMinutes });
  if (talkMinutes) return formatI18nTemplate(String(bi("발표 {value0}분", "{value0}-minute talk")), { value0: talkMinutes });
  return "";
}

function stepTimeText(step: ReadingRouteStep): string {
  if (step.deckTrack === "brief") {
    return formatI18nTemplate(String(bi("발표 약 {value0}분", "About {value0}-minute talk")), { value0: ENGINEERING_DECK_BRIEF_MINUTES });
  }
  const page = findEngineeringPage(step.pageId);
  return pageTimeText(page.readingMinutes, page.talkMinutes);
}

function stepLabelText(step: ReadingRouteStep): string {
  const label = step.label ?? findEngineeringPage(step.pageId).label;
  return bi(label.ko, label.en);
}

/* ── 여기서 시작 ──────────────────────────────────────────── */

/** 첫 화면의 두 문: 구조(아키텍처 해설)와 재료(라이브러리 해설). */
export function EngineeringHubStart({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();

  return (
    <section className={className} aria-labelledby="engineering-start-title">
      <p className="eyebrow text-accent">START HERE</p>
      <h2 id="engineering-start-title" className="mt-2 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
        {bi("처음이라면 여기서 시작: 구조와 재료", "New here? Start with the structure and the materials")}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "도식과 쉬운 말로 푼 두 해설입니다. 구조를 보면 나머지 자료가 놓일 자리가 보이고, 재료를 보면 고른 이유가 이어집니다.",
          "Two guides in diagrams and plain words. The structure shows where the rest fits; the materials explain why each piece was chosen.",
        )}
      </p>
      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        {ENGINEERING_START_PAGES.map((entry) => {
          const page = findEngineeringPage(entry.pageId);
          const Icon = page.icon;
          const time = pageTimeText(page.readingMinutes, page.talkMinutes);
          return (
            <li key={entry.pageId} className="flex">
              <Link
                href={page.href}
                className="group flex w-full flex-col gap-3 rounded-3xl border border-accent/45 bg-accent-soft/30 p-5 transition-colors hover:border-accent hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-card/70 px-3 py-1 text-xs font-black text-accent">
                    <Icon size={14} aria-hidden="true" />
                    {bi(entry.role.ko, entry.role.en)}
                  </span>
                  {time ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-3">
                      <Clock3 size={13} aria-hidden="true" />
                      {time}
                    </span>
                  ) : null}
                </span>
                <span className="grid gap-2">
                  <span className="text-xl font-black tracking-tight text-fg group-hover:text-accent sm:text-2xl">{bi(entry.title.ko, entry.title.en)}</span>
                  {page.question ? <span className="text-sm font-bold leading-6 text-fg">{bi(page.question.ko, page.question.en)}</span> : null}
                  <span className="text-sm leading-6 text-fg-2">{bi(entry.hook.ko, entry.hook.en)}</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 border-t border-line/60 pt-3 text-sm font-bold text-accent">
                  {bi("읽기 시작", "Start reading")}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── 읽는 길 ──────────────────────────────────────────────── */

const ROUTE_MARKS = ["A", "B", "C"] as const;

function RouteStepRow({ step }: { readonly step: ReadingRouteStep }) {
  const page = findEngineeringPage(step.pageId);
  const Icon = page.icon;
  const time = step.optional ? "" : stepTimeText(step);
  return (
    <li>
      <Link
        href={readingStepHref(step)}
        className="group flex items-start gap-3 rounded-2xl border border-line/60 bg-panel/50 p-3 transition-colors hover:border-accent/45 hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3 group-hover:text-accent">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-fg group-hover:text-accent">
            {stepLabelText(step)}
            {step.optional ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-bold text-fg-3">{bi("필요할 때", "As needed")}</span>
            ) : null}
            {time ? <span className="text-xs font-bold text-fg-3">{time}</span> : null}
          </span>
          <span className="text-xs leading-5 text-fg-3">{bi(step.note.ko, step.note.en)}</span>
        </span>
      </Link>
    </li>
  );
}

function RouteCard({ route, index }: { readonly route: ReadingRoute; readonly index: number }) {
  const time = readingRouteTime(route);
  const first = route.steps.find((step) => !step.optional) ?? route.steps[0];
  const titleId = `reading-route-${route.id}`;
  return (
    <li className="flex">
      <article aria-labelledby={titleId} className="flex w-full flex-col gap-4 rounded-3xl border border-line/70 bg-card/65 p-5 sm:p-6">
        <header className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft font-display text-sm font-black text-accent" aria-hidden="true">
              {ROUTE_MARKS[index] ?? index + 1}
            </span>
            {time.complete ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-black text-fg-2">
                <Clock3 size={13} aria-hidden="true" />
                {approximateTime(time.minutes)}
              </span>
            ) : null}
          </div>
          <h3 id={titleId} className="text-xl font-black tracking-tight text-fg">
            {bi(route.title.ko, route.title.en)}
          </h3>
          <p className="inline-flex items-center gap-2 text-xs font-bold text-accent">
            <Users size={14} aria-hidden="true" />
            {bi(route.audience.ko, route.audience.en)}
          </p>
          <p className="text-sm leading-6 text-fg-2">{bi(route.goal.ko, route.goal.en)}</p>
        </header>
        <ol className="grid gap-2">
          {route.steps.map((step) => (
            <RouteStepRow key={`${step.pageId}-${step.deckTrack ?? "page"}`} step={step} />
          ))}
        </ol>
        {first ? (
          <Link
            href={readingStepHref(first)}
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {formatI18nTemplate(String(bi("{value0}에서 시작", "Start with {value0}")), { value0: stepLabelText(first) })}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </article>
    </li>
  );
}

/** 목적·시간별 읽는 길 세 가지. 시간은 레지스트리의 읽기·발표 시간에서 더한 값이다. */
export function EngineeringReadingRoutes({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();

  return (
    <section className={className} aria-labelledby="engineering-routes-title">
      <p className="eyebrow text-accent">READING ROUTES · THREE WAYS IN</p>
      <h2 id="engineering-routes-title" className="mt-2 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
        {bi("시간과 목적에 맞는 길을 고르세요", "Pick the route that fits your time and goal")}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "같은 자료를 세 가지 깊이로 읽습니다. 길마다 거치는 페이지와 걸리는 시간을 적었고, 시간은 각 페이지의 읽기·발표 시간을 더한 값입니다.",
          "The same material at three depths. Each route lists the pages it passes through and how long it takes, summed from each page's reading or talk time.",
        )}
      </p>
      <ol className="mt-5 grid gap-4 lg:grid-cols-3">
        {ENGINEERING_READING_ROUTES.map((route, index) => (
          <RouteCard key={route.id} route={route} index={index} />
        ))}
      </ol>
    </section>
  );
}

/* ── 한 장 흐름 도식 ──────────────────────────────────────── */

/** 읽는 순서 전체와 찾아보기 도구를 한 장에 그린 도식. 단계 번호는 아래 발표 동선 카드와 같다. */
export function EngineeringReadingFlow({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();

  return (
    <section className={className} aria-labelledby="engineering-flow-title">
      <p className="eyebrow text-accent">THE WHOLE ROUTE ON ONE PAGE</p>
      <h2 id="engineering-flow-title" className="mt-2 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
        {bi("한눈에 보는 읽는 순서", "The reading order at a glance")}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "큰 그림에서 시작해 1~4단계로 발표의 근거를 쌓고, 5단계에서 발표합니다. 점선으로 이어진 찾아보기 도구는 낯선 말이나 질문이 나올 때 꺼내 씁니다. 각 단계는 아래 카드에서 바로 열 수 있습니다.",
          "Begin with the big picture, build the evidence in steps 1 to 4 and give the talk in step 5. The look-up tools joined by dashed lines come out when an unfamiliar term or a question appears. Each step opens from the cards below.",
        )}
      </p>
      <div className="mt-5 rounded-[2rem] border border-line/70 bg-panel/65 p-4 shadow-sm sm:p-6">
        <EngineeringDiagramFrame diagram={ENGINEERING_READING_FLOW_DIAGRAM} />
      </div>
    </section>
  );
}
