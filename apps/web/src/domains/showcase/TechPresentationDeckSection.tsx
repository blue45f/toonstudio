import {
  ArrowUpRight, BookOpen, Bot, ChevronLeft, ChevronRight, Compass, Cpu, FileText, Layers,
  Presentation, Search, ShieldCheck, X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { BilingualText } from "./competitor-benchmark-data";
import { startSafeViewTransition } from "./nextgen-web-platform-enhancer";
import { TECH_DECK_UI_COPY } from "./showcase-ui-copy";
import {
  TECH_AI_SHOWCASE_MODULES, TECH_GLOSSARY_CATEGORIES, TECH_PLAIN_GLOSSARY, TECH_PRESENTATION_SLIDES,
  filterGlossaryEntries, type TechAiExecutionMode, type TechDiagramNode, type TechDiagramTone,
  type TechGlossaryCategory,
} from "./tech-presentation-deck-data";
import { TechWebRtcAndRareApiShowcase } from "./TechWebRtcAndRareApiShowcase";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { fitSvgPillWidth, wrapSvgText } from "@/shared/lib/svg-text-wrap";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export interface TechPresentationDeckSectionProps {
  readonly locale: "ko" | "en";
  readonly initialSlideIndex?: number;
}

const pick = (text: BilingualText, locale: "ko" | "en"): string => (locale === "ko" ? text.ko : text.en);

function toneCssVar(tone: TechDiagramTone): string {
  switch (tone) {
    case "accent": return "var(--color-accent)";
    case "cool": return "var(--color-cool)";
    case "good": return "var(--color-good)";
    case "warn": return "var(--color-warn)";
  }
}

function executionModeLabel(
  mode: TechAiExecutionMode,
  copy: (typeof TECH_DECK_UI_COPY)["ko"] | (typeof TECH_DECK_UI_COPY)["en"],
): string {
  if (mode === "on-device") return copy.aiModeOnDevice;
  if (mode === "zero-bill-api") return copy.aiModeZeroBill;
  return copy.aiModeHybrid;
}

function SlideFlowArchitectureSvg(props: {
  readonly title: string;
  readonly nodes: readonly TechDiagramNode[];
  readonly locale: "ko" | "en";
}) {
  const { title, nodes, locale } = props;
  const count = Math.max(1, nodes.length);
  const gap = 26;
  const padX = 16;
  const totalWidth = 920;
  const boxWidth = Math.floor((totalWidth - padX * 2 - gap * (count - 1)) / count);
  const titleLines = wrapSvgText(title, {
    maxWidth: totalWidth - 44,
    fontSize: 12,
    maxLines: 2,
    bold: true,
  });
  const boxY = titleLines.length > 1 ? 56 : 42;
  const boxHeight = 132;
  const totalHeight = boxY + boxHeight + 18;

  return (
    <svg
      data-testid="tech-deck-diagram-svg"
      role="img"
      aria-label={title}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className="block h-auto w-full max-w-full rounded-2xl border border-line bg-canvas p-2 text-fg"
    >
      <title>{title}</title>
      <rect
        x={4}
        y={4}
        width={totalWidth - 8}
        height={totalHeight - 8}
        rx={14}
        fill="var(--color-panel)"
        stroke="var(--color-line)"
        strokeWidth={1}
      />
      <text
        x={20}
        y={titleLines.length > 1 ? 20 : 24}
        dominantBaseline="middle"
        fill="var(--color-fg-2)"
        fontSize={12}
        fontWeight={700}
      >
        {titleLines.map((line, lineIdx) => (
          <tspan key={`deck-title-${lineIdx}`} x={20} dy={lineIdx === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
      {nodes.map((node, index) => {
        const x = padX + index * (boxWidth + gap);
        const accent = toneCssVar(node.tone);
        const arrowX1 = x + boxWidth + 4;
        const arrowX2 = x + boxWidth + gap - 4;
        const arrowY = boxY + boxHeight / 2;
        const stagePillW = fitSvgPillWidth(node.stage, 10, 10, 56, boxWidth - 24, true);
        const labelLines = wrapSvgText(pick(node.label, locale), {
          maxWidth: boxWidth - 24,
          fontSize: 12.5,
          maxLines: 2,
          bold: true,
        });
        const metricLines = wrapSvgText(pick(node.metric, locale), {
          maxWidth: boxWidth - 24,
          fontSize: 11,
          maxLines: 2,
          bold: false,
        });
        const labelStartY = boxY + 50;
        const metricStartY = labelLines.length > 1 ? boxY + 86 : boxY + 78;

        return (
          <g key={`${node.stage}-${index}`}>
            <rect
              x={x}
              y={boxY}
              width={boxWidth}
              height={boxHeight}
              rx={12}
              fill="var(--color-card)"
              stroke={accent}
              strokeWidth={1.75}
            />
            <rect
              x={x + 12}
              y={boxY + 12}
              width={stagePillW}
              height={20}
              rx={10}
              fill="var(--color-raised)"
              stroke={accent}
              strokeWidth={1}
            />
            <text
              x={x + 12 + stagePillW / 2}
              y={boxY + 22}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={accent}
              fontSize={10}
              fontWeight={700}
            >
              {node.stage}
            </text>
            <text
              x={x + 12}
              y={labelStartY}
              dominantBaseline="middle"
              fill="var(--color-fg)"
              fontSize={12.5}
              fontWeight={700}
            >
              {labelLines.map((line, lineIdx) => (
                <tspan key={`${node.stage}-lbl-${lineIdx}`} x={x + 12} dy={lineIdx === 0 ? 0 : 16}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={x + 12}
              y={metricStartY}
              dominantBaseline="middle"
              fill="var(--color-fg-2)"
              fontSize={11}
            >
              {metricLines.map((line, lineIdx) => (
                <tspan key={`${node.stage}-met-${lineIdx}`} x={x + 12} dy={lineIdx === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
            <line
              x1={x + 12}
              y1={boxY + boxHeight - 12}
              x2={x + boxWidth - 12}
              y2={boxY + boxHeight - 12}
              stroke={accent}
              strokeOpacity={0.35}
              strokeWidth={2}
            />
            {index < count - 1 ? (
              <g>
                <line
                  x1={arrowX1}
                  y1={arrowY}
                  x2={arrowX2 - 5}
                  y2={arrowY}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeWidth={2}
                />
                <polygon
                  points={`${arrowX2},${arrowY} ${arrowX2 - 8},${arrowY - 5} ${arrowX2 - 8},${arrowY + 5}`}
                  fill="currentColor"
                  fillOpacity={0.7}
                />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function TechPresentationDeckSection(props: TechPresentationDeckSectionProps) {
  const { locale, initialSlideIndex } = props;
  const copy = TECH_DECK_UI_COPY[locale];
  const searchInputId = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const safeInitialIndex =
    typeof initialSlideIndex === "number" && Number.isInteger(initialSlideIndex)
    && initialSlideIndex >= 0 && initialSlideIndex < TECH_PRESENTATION_SLIDES.length
      ? initialSlideIndex
      : 0;

  const [slideIndex, setSlideIndex] = useState<number>(safeInitialIndex);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState<boolean>(false);
  const [glossaryCategory, setGlossaryCategory] = useState<"all" | TechGlossaryCategory>("all");
  const [glossaryQuery, setGlossaryQuery] = useState<string>("");

  const totalSlides = TECH_PRESENTATION_SLIDES.length;
  const activeSlide = TECH_PRESENTATION_SLIDES[slideIndex] ?? TECH_PRESENTATION_SLIDES[0]!;

  const goToSlide = (nextIndex: number, scrollToStage = false) => {
    const clamped = Math.max(0, Math.min(totalSlides - 1, nextIndex));
    startSafeViewTransition(() => setSlideIndex(clamped));
    if (scrollToStage && typeof stageRef.current?.scrollIntoView === "function") {
      stageRef.current.scrollIntoView({ block: "nearest" });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      if (event.key === "ArrowRight") setSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
      else if (event.key === "ArrowLeft") setSlideIndex((prev) => Math.max(0, prev - 1));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalSlides]);

  const filteredGlossary = useMemo(
    () => filterGlossaryEntries(TECH_PLAIN_GLOSSARY, glossaryCategory, glossaryQuery),
    [glossaryCategory, glossaryQuery],
  );
  const slideLabel = `${String(activeSlide.slideNumber).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;

  return (
    <section
      role="tabpanel"
      data-testid="tech-panel-presentation"
      aria-labelledby="tech-presentation-heading"
      className="space-y-8 [word-break:keep-all]"
    >
      {/* 1. 발표 덱 제어 헤더 & 전용 포털 원클릭 링크 */}
      <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Presentation size={14} aria-hidden="true" />
              <span>{copy.eyebrow}</span>
            </p>
            <h2 id="tech-presentation-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">{copy.heading}</h2>
            <p className="mt-1.5 text-sm leading-6 text-fg-2">{copy.subtitle}</p>
          </div>
          <nav aria-label={copy.eyebrow} className="flex flex-wrap gap-2">
            <Link href="/about/technology/deck" data-testid="tech-deck-link-full-deck" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
              {copy.linkDeck}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/about/technology/architecture" data-testid="tech-deck-link-architecture" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
              {copy.linkArch}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/about/technology/glossary" data-testid="tech-deck-link-glossary" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
              {copy.linkGlossary}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </nav>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="tech-deck-prev"
              disabled={slideIndex === 0}
              onClick={() => goToSlide(slideIndex - 1)}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 motion-reduce:transition-none" })}
            >
              <ChevronLeft size={15} aria-hidden="true" />
              {copy.prevSlide}
            </button>
            <span data-testid="tech-deck-counter" aria-live="polite" className="rounded-xl border border-line bg-raised px-3.5 py-2 font-mono text-xs font-bold text-fg tabular-nums sm:text-sm">
              {slideLabel}
            </span>
            <button
              type="button"
              data-testid="tech-deck-next"
              disabled={slideIndex === totalSlides - 1}
              onClick={() => goToSlide(slideIndex + 1)}
              className={buttonClass({ size: "sm", className: "min-h-11 motion-reduce:transition-none" })}
            >
              {copy.nextSlide}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <span className="hidden text-xs text-fg-3 sm:inline">{copy.keyHint}</span>
          </div>

          <button
            type="button"
            data-testid="tech-deck-notes-toggle"
            aria-pressed={showSpeakerNotes}
            onClick={() => setShowSpeakerNotes((prev) => !prev)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors motion-reduce:transition-none sm:text-sm",
              showSpeakerNotes ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            <FileText size={14} aria-hidden="true" />
            {showSpeakerNotes ? copy.notesHide : copy.notesShow}
          </button>
        </div>
      </div>

      {/* 2. 활성 슬라이드 발표 스테이지 */}
      <article
        ref={stageRef}
        data-testid="tech-deck-active-slide"
        data-slide-id={activeSlide.id}
        data-slide-number={activeSlide.slideNumber}
        className="space-y-5 rounded-3xl border border-line bg-panel p-5 sm:p-6 lg:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ts-status-pill ts-status-accent tabular-nums">SLIDE {String(activeSlide.slideNumber).padStart(2, "0")}</span>
            <span className="ts-status-pill ts-status-cool">{pick(activeSlide.sectionTag, locale)}</span>
            <span className="ts-status-pill ts-status-neutral font-mono">{activeSlide.brandSystem}</span>
          </div>
          <span className={cn("ts-status-pill shrink-0", activeSlide.status === "current" ? "ts-status-good" : "ts-status-warn")}>
            {activeSlide.status === "current" ? copy.statusCurrent : copy.statusExpanding}
          </span>
        </div>

        <div>
          <h3 className="text-lg font-bold tracking-[-0.02em] text-fg sm:text-2xl">{pick(activeSlide.title, locale)}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-fg-2 sm:text-base">{pick(activeSlide.summary, locale)}</p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-line bg-card p-4 text-center">
            <img src={activeSlide.spritePath} alt={pick(activeSlide.spriteAlt, locale)} width={88} height={88} loading="eager" decoding="async" className="h-20 w-20 object-contain sm:h-24 sm:w-24" />
            <p className="font-mono text-[11px] font-bold text-cool">{activeSlide.brandSystem}</p>
          </div>
          <div className="min-w-0">
            <SlideFlowArchitectureSvg title={pick(activeSlide.diagramTitle, locale)} nodes={activeSlide.diagramNodes} locale={locale} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div data-testid="tech-deck-why-chosen" className="rounded-2xl border border-line bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-accent"><Compass size={14} aria-hidden="true" /><span>{copy.whyChosen}</span></p>
            <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">{pick(activeSlide.whyChosen, locale)}</p>
          </div>
          <div data-testid="tech-deck-where-used" className="rounded-2xl border border-line bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-good"><Layers size={14} aria-hidden="true" /><span>{copy.whereUsed}</span></p>
            <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">{pick(activeSlide.whereUsed, locale)}</p>
          </div>
          <div data-testid="tech-deck-reuse-playbook" className="rounded-2xl border border-line bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-cool"><Cpu size={14} aria-hidden="true" /><span>{copy.reusePlaybook}</span></p>
            <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">{pick(activeSlide.reusePlaybook, locale)}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div data-testid="tech-deck-plain-background" className="rounded-2xl border border-line bg-raised p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-fg"><BookOpen size={14} className="text-accent" aria-hidden="true" /><span>{copy.plainBg}</span></p>
            <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">{pick(activeSlide.plainBackground, locale)}</p>
          </div>
          <div data-testid="tech-deck-tradeoff" className="rounded-2xl border border-line bg-raised p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-fg"><ShieldCheck size={14} className="text-warn" aria-hidden="true" /><span>{copy.tradeoff}</span></p>
            <p className="mt-2 text-xs leading-6 text-fg-2 sm:text-sm">{pick(activeSlide.tradeoff, locale)}</p>
          </div>
        </div>

        {showSpeakerNotes ? (
          <aside data-testid="tech-deck-speaker-notes" className="rounded-2xl border border-accent bg-accent-soft p-4">
            <p className="text-xs font-bold text-accent">{copy.notesHeading}</p>
            <p className="mt-1.5 text-sm leading-6 text-fg">{pick(activeSlide.speakerNotes, locale)}</p>
          </aside>
        ) : null}

        <div className="border-t border-line/70 pt-3">
          <p className="text-[11px] font-bold tracking-[0.06em] text-fg-3 uppercase">{copy.evidenceLabel}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {activeSlide.repoPaths.map((repoPath) => (
              <li key={repoPath} className="rounded-lg border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-fg-2">{repoPath}</li>
            ))}
          </ul>
        </div>
      </article>

      {/* 3. 전체 18장 목차 점프 보드 */}
      <details open data-testid="tech-deck-toc" className="rounded-3xl border border-line bg-panel p-5">
        <summary className="cursor-pointer list-none text-sm font-bold text-fg sm:text-base">{copy.tocSummary}</summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TECH_PRESENTATION_SLIDES.map((slide, idx) => {
            const active = idx === slideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                data-testid={`tech-deck-toc-${slide.slideNumber}`}
                aria-current={active ? "step" : undefined}
                onClick={() => goToSlide(idx, true)}
                className={cn(
                  "flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <span className="font-mono text-[11px] font-bold tabular-nums opacity-85">
                  {String(slide.slideNumber).padStart(2, "0")} · {slide.brandSystem.split("·")[0]?.trim()}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs font-bold">{pick(slide.title, locale)}</span>
              </button>
            );
          })}
        </div>
      </details>

      {/* 4. WebRTC 24파일 프로토콜 · 8대 권위 매트릭스 & 실측 희귀 웹 API 18종 카탈로그 */}
      <TechWebRtcAndRareApiShowcase locale={locale} onJumpToSlide={(idx) => goToSlide(idx, true)} />

      {/* 5. AI 보조·어시스턴트 8대 핵심 엔진 그리드 */}
      <div data-testid="tech-ai-showcase-grid" className="space-y-4 rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div>
          <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
            <Bot size={14} aria-hidden="true" />
            <span>{copy.aiEyebrow}</span>
          </p>
          <h3 className="mt-1 text-lg font-bold text-fg sm:text-2xl">{copy.aiHeading}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">{copy.aiSubtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {TECH_AI_SHOWCASE_MODULES.map((mod) => (
            <article key={mod.id} data-testid={`tech-ai-module-${mod.id}`} className="flex flex-col justify-between rounded-2xl border border-line bg-card p-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ts-status-pill ts-status-accent font-mono tabular-nums">{mod.code}</span>
                    <span className="ts-status-pill ts-status-neutral font-mono">{mod.brandTag}</span>
                  </div>
                  <span
                    className={cn(
                      "ts-status-pill shrink-0",
                      mod.executionMode === "on-device" ? "ts-status-good" : mod.executionMode === "zero-bill-api" ? "ts-status-cool" : "ts-status-warn",
                    )}
                  >
                    {executionModeLabel(mod.executionMode, copy)}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-fg sm:text-base">{pick(mod.title, locale)}</h4>
                <dl className="space-y-1.5 text-xs leading-5">
                  <div><dt className="font-bold text-fg">{copy.aiSolves}</dt><dd className="text-fg-2">{pick(mod.whatItSolves, locale)}</dd></div>
                  <div><dt className="font-bold text-fg">{copy.aiHow}</dt><dd className="text-fg-2">{pick(mod.howItWorks, locale)}</dd></div>
                  <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
                    <div className="rounded-xl bg-raised p-2.5"><dt className="font-bold text-cool">{copy.aiWhere}</dt><dd className="mt-0.5 text-fg-2">{pick(mod.whereUsed, locale)}</dd></div>
                    <div className="rounded-xl bg-raised p-2.5"><dt className="font-bold text-good">{copy.aiReuse}</dt><dd className="mt-0.5 text-fg-2">{pick(mod.reuseCase, locale)}</dd></div>
                  </div>
                </dl>
              </div>
              <p className="mt-3 border-t border-line/60 pt-2.5 font-mono text-[11px] text-fg-3">{mod.repoPaths.join(" · ")}</p>
            </article>
          ))}
        </div>
      </div>

      {/* 6. 비전문가용 쉬운 기술 용어집 28선 (실시간 검색 + 카테고리 필터 + 슬라이드 점프) */}
      <div data-testid="tech-plain-glossary" className="space-y-4 rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <BookOpen size={14} aria-hidden="true" />
              <span>{copy.glossaryEyebrow}</span>
            </p>
            <h3 className="mt-1 text-lg font-bold text-fg sm:text-2xl">{copy.glossaryHeading}</h3>
            <p className="mt-1 text-sm leading-6 text-fg-2">{copy.glossarySubtitle}</p>
          </div>
          <span data-testid="tech-glossary-count" aria-live="polite" className="ts-status-pill ts-status-cool tabular-nums">
            {filteredGlossary.length} / {TECH_PLAIN_GLOSSARY.length} {copy.resultUnit}
          </span>
        </div>

        <div className="relative min-w-[16rem] max-w-2xl">
          <label htmlFor={searchInputId} className="sr-only">{copy.searchLabel}</label>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
          <input
            id={searchInputId}
            type="search"
            data-testid="tech-glossary-search"
            value={glossaryQuery}
            onChange={(event) => setGlossaryQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 w-full rounded-xl border border-line bg-card py-2 pr-10 pl-10 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
          />
          {glossaryQuery.length > 0 ? (
            <button
              type="button"
              data-testid="tech-glossary-clear"
              aria-label={copy.clearSearch}
              onClick={() => setGlossaryQuery("")}
              className="absolute top-1/2 right-1 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-fg-2 hover:text-fg"
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div role="group" aria-label={copy.glossaryHeading} className="flex flex-wrap gap-2">
          {TECH_GLOSSARY_CATEGORIES.map((category) => {
            const active = glossaryCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                data-testid={`tech-glossary-cat-${category.id}`}
                aria-pressed={active}
                onClick={() => setGlossaryCategory(category.id)}
                className={cn(
                  "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors motion-reduce:transition-none",
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {pick(category.label, locale)}
              </button>
            );
          })}
        </div>

        {filteredGlossary.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-5">
            <p className="text-sm font-semibold text-fg-2">{copy.emptyTitle}</p>
            <button
              type="button"
              data-testid="tech-glossary-reset"
              onClick={() => { setGlossaryCategory("all"); setGlossaryQuery(""); }}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
            >
              {copy.emptyReset}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredGlossary.map((entry) => (
              <article key={entry.id} data-testid={`tech-glossary-item-${entry.id}`} className="flex flex-col justify-between rounded-2xl border border-line bg-card p-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-fg sm:text-base">{pick(entry.term, locale)}</h4>
                  <p className="rounded-xl bg-raised px-3 py-2 text-xs leading-5 text-fg">
                    <strong className="mr-1.5 text-accent">{copy.analogyLabel}:</strong>
                    {pick(entry.oneLineAnalogy, locale)}
                  </p>
                  <p className="text-xs leading-5 text-fg-2">
                    <strong className="mr-1.5 text-fg">{copy.meaningLabel}:</strong>
                    {pick(entry.technicalMeaning, locale)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/60 pt-2.5">
                  {entry.usedInSlideNumbers.map((num) => (
                    <button
                      key={num}
                      type="button"
                      data-testid={`tech-glossary-jump-${entry.id}-${num}`}
                      onClick={() => goToSlide(num - 1, true)}
                      className="min-h-11 rounded-lg border border-line bg-raised px-2.5 py-1 font-mono text-xs font-bold text-cool tabular-nums transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
                    >
                      {copy.jumpSlidePrefix} {String(num).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
