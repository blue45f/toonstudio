import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Contrast,
  Copy,
  Cpu,
  Film,
  Gauge,
  Layers,
  Plug,
  Presentation,
  RefreshCw,
  Scale,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { BilingualText } from "./competitor-benchmark-data";
import {
  AI_HARNESS_PILLARS,
  REMOTION_CODE_RECIPES,
  REMOTION_PIPELINE_STEPS,
  TECH_ARCHITECTURE_CARDS,
  probeBrowserNextGenWebApis,
  type NextGenWebApiProbeReport,
  type TechTabId,
} from "./nextgen-tech-showcase-data";
import {
  installSpeculationRulesOnce,
  readMotionAndContrastPreferences,
  startSafeViewTransition,
  type SpeculationRulesInstallResult,
  type ViewTransitionResult,
} from "./nextgen-web-platform-enhancer";
import { TECH_SHOWCASE_PAGE_COPY } from "./showcase-ui-copy";
import {
  TechLlmMcpApiPanel,
  TechResearchPapersAndUxPanel,
} from "./TechLlmMcpAndResearchTabs";
import { TechPresentationDeckSection } from "./TechPresentationDeckSection";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import "./showcase-nextgen-motion.css";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

const LAYER_FLOW = [
  {
    code: "L1 · GPU / WASM",
    ko: "WebGPU KM7 브러시 · Vello/Hokusai WASM · Web Audio Foley",
    en: "WebGPU KM7 brush · Vello/Hokusai WASM · Web Audio Foley",
  },
  {
    code: "L2 · LOCAL DB & CRDT",
    ko: "SQLite WASM + OPFS 로컬 정본 · Yjs CRDT + WebRTC P2P",
    en: "SQLite WASM + OPFS local authority · Yjs CRDT + WebRTC P2P",
  },
  {
    code: "L3 · VIDEO & RIGHTS",
    ko: "Remotion React 컴포지션 · Rights BOM 라이선스 검증 · 출고 팩",
    en: "Remotion React compositions · Rights BOM validator · Export pack",
  },
  {
    code: "L4 · EDGE HYBRID",
    ko: "Cloudflare 정적/실시간 엣지 + 서울 onpod API 하이브리드",
    en: "Cloudflare static/realtime edge + Seoul onpod API hybrid",
  },
] as const;

const VALID_TECH_TABS: readonly TechTabId[] = [
  "presentation",
  "architecture",
  "remotion",
  "ai-skills",
  "chrome-apis",
  "llm-mcp-api",
  "papers-rd",
];

function resolveInitialTab(rawTab: string | null): TechTabId {
  if (rawTab && (VALID_TECH_TABS as readonly string[]).includes(rawTab)) {
    return rawTab as TechTabId;
  }
  return "architecture";
}

export function ToonStudioTechShowcasePage() {
  const lang = useI18n((state) => state.lang);
  const locale: "ko" | "en" = lang === "en" ? "en" : "ko";
  const copy = TECH_SHOWCASE_PAGE_COPY[locale];
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TechTabId>(
    () => resolveInitialTab(searchParams.get("tab")),
  );
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(REMOTION_CODE_RECIPES[0]!.id);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [highContrast, setHighContrast] = useState<boolean>(
    () => readMotionAndContrastPreferences().forcedColors,
  );
  const [probe, setProbe] = useState<NextGenWebApiProbeReport>(() => probeBrowserNextGenWebApis());
  const [speculationStatus, setSpeculationStatus] =
    useState<SpeculationRulesInstallResult["status"]>("unsupported");
  const [lastTransition, setLastTransition] = useState<ViewTransitionResult | null>(null);
  const [transitionPulse, setTransitionPulse] = useState(0);

  useEffect(() => {
    const result = installSpeculationRulesOnce();
    setSpeculationStatus(result.status);
  }, []);

  const activeRecipe =
    REMOTION_CODE_RECIPES.find((recipe) => recipe.id === selectedRecipeId) ?? REMOTION_CODE_RECIPES[0]!;

  const handleTabChange = (nextTab: TechTabId) => {
    const result = startSafeViewTransition(() => {
      setActiveTab(nextTab);
    });
    setLastTransition(result);
  };

  const handleTestViewTransition = () => {
    const result = startSafeViewTransition(() => {
      setTransitionPulse((prev) => prev + 1);
    });
    setLastTransition(result);
  };

  const handleCopyRecipe = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeRecipe.code);
        setCopyFeedback(copy.copiedCode);
      } else {
        setCopyFeedback(copy.copyUnsupported);
      }
    } catch {
      setCopyFeedback(copy.copyUnsupported);
    }
  };

  const tabs: readonly { id: TechTabId; label: string; icon: typeof Layers }[] = [
    { id: "presentation", label: copy.tabPresentation, icon: Presentation },
    { id: "architecture", label: copy.tabArchitecture, icon: Layers },
    { id: "remotion", label: copy.tabRemotion, icon: Film },
    { id: "ai-skills", label: copy.tabAiSkills, icon: Bot },
    { id: "chrome-apis", label: copy.tabChromeApis, icon: Gauge },
    { id: "llm-mcp-api", label: copy.tabLlmMcpApi, icon: Plug },
    { id: "papers-rd", label: copy.tabPapersRd, icon: BookOpen },
  ];

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <div
        data-testid="tech-showcase-page"
        data-showcase-high-contrast={highContrast ? "true" : "false"}
        className="ts-showcase-root space-y-8 sm:space-y-10"
      >
        {/* 1. 기술 쇼케이스 히어로 */}
        <header className="ts-showcase-hero rounded-3xl p-6 sm:p-8 lg:p-10">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
                <Cpu size={14} aria-hidden="true" />
                <span>{copy.eyebrow}</span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-fg sm:text-4xl">
                {copy.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
                {copy.subtitle}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  data-testid="tech-hero-open-deck"
                  onClick={() => handleTabChange("presentation")}
                  className={buttonClass({ size: "md", className: "min-h-11 motion-reduce:transition-none" })}
                >
                  <Presentation size={15} aria-hidden="true" />
                  {copy.ctaPresentationDeck}
                </button>
                <Link
                  href="/compare/studio"
                  className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
                >
                  <Scale size={15} aria-hidden="true" />
                  {copy.ctaCompare}
                </Link>
                <Link
                  href="/product-tour"
                  className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
                >
                  <Film size={15} aria-hidden="true" />
                  {copy.ctaTour}
                </Link>
                <button
                  type="button"
                  data-testid="tech-high-contrast-toggle"
                  aria-pressed={highContrast}
                  onClick={() => setHighContrast((prev) => !prev)}
                  className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
                >
                  <Contrast size={15} aria-hidden="true" />
                  {highContrast ? copy.highContrastOn : copy.highContrastOff}
                </button>
              </div>
            </div>

            <div className="ts-showcase-emblem-frame mx-auto flex w-full max-w-[15rem] flex-col items-center gap-3 rounded-3xl p-4">
              <img
                src="/assets/studio/vibrant-sprites/emblem-tech-lab.webp"
                alt={copy.emblemAlt}
                width={160}
                height={160}
                loading="eager"
                decoding="async"
                className="h-32 w-32 object-contain sm:h-36 sm:w-36"
              />
              <div className="flex items-center gap-3">
                <img
                  src="/assets/studio/vibrant-sprites/tech-webgpu.webp"
                  alt={copy.webgpuAlt}
                  width={44}
                  height={44}
                  decoding="async"
                  className="h-11 w-11 object-contain"
                />
                <img
                  src="/assets/studio/vibrant-sprites/tech-remotion.webp"
                  alt={copy.remotionAlt}
                  width={44}
                  height={44}
                  decoding="async"
                  className="h-11 w-11 object-contain"
                />
              </div>
            </div>
          </div>
        </header>

        {/* 2. 인터랙티브 4탭 내비게이션 */}
        <div role="tablist" aria-label={copy.tabsAria} className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`tech-tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-bold transition-colors sm:text-sm",
                  selected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 3. 탭 패널 콘텐츠 */}
        <div className="ts-showcase-stage">
          {activeTab === "presentation" ? (
            <TechPresentationDeckSection locale={locale} />
          ) : null}

          {activeTab === "architecture" ? (
            <section
              role="tabpanel"
              data-testid="tech-panel-architecture"
              aria-labelledby="tech-arch-heading"
              className="space-y-6"
            >
              <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
                <p className="font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
                  SYSTEM TOPOLOGY
                </p>
                <h2 id="tech-arch-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
                  {copy.archHeading}
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">{copy.archSubtitle}</p>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {LAYER_FLOW.map((layer) => (
                    <div key={layer.code} className="rounded-2xl border border-line bg-card p-4">
                      <p className="font-display text-xs font-bold tracking-[0.08em] text-accent">
                        {layer.code}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-fg-2 sm:text-sm">
                        {locale === "ko" ? layer.ko : layer.en}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {TECH_ARCHITECTURE_CARDS.map((card) => (
                  <article
                    key={card.id}
                    data-testid={`tech-arch-card-${card.id}`}
                    className="ts-showcase-sprite-card ts-showcase-reveal flex flex-col justify-between rounded-3xl p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-[11px] font-bold tracking-[0.12em] text-cool uppercase">
                            {card.indexLabel}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-fg sm:text-lg">
                            {pick(card.title, locale)}
                          </h3>
                        </div>
                        <span
                          className={cn(
                            "ts-status-pill shrink-0",
                            card.status === "current" ? "ts-status-good" : "ts-status-warn",
                          )}
                        >
                          {card.status === "current" ? copy.archStatusCurrent : copy.archStatusExpanding}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-start gap-3">
                        {card.spritePath ? (
                          <img
                            src={card.spritePath}
                            alt={pick(card.title, locale)}
                            width={56}
                            height={56}
                            loading="lazy"
                            decoding="async"
                            className="h-14 w-14 shrink-0 object-contain"
                          />
                        ) : null}
                        <div>
                          <p className="text-xs font-semibold text-fg sm:text-sm">
                            {pick(card.subtitle, locale)}
                          </p>
                          <p className="mt-1.5 text-xs leading-6 text-fg-2 sm:text-sm">
                            {pick(card.whyInteresting, locale)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-line/60 pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {card.stackTags.map((tag) => (
                          <span key={tag} className="ts-status-pill ts-status-neutral">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="font-mono text-[11px] text-fg-3">{card.repoPaths.join(" · ")}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "remotion" ? (
            <section
              role="tabpanel"
              data-testid="tech-panel-remotion"
              aria-labelledby="tech-remotion-heading"
              className="space-y-6"
            >
              <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src="/assets/studio/vibrant-sprites/tech-remotion.webp"
                    alt={copy.remotionAlt}
                    width={72}
                    height={72}
                    className="h-16 w-16 shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 id="tech-remotion-heading" className="text-xl font-bold text-fg sm:text-2xl">
                      {copy.remotionHeading}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-fg-2">{copy.remotionSubtitle}</p>
                  </div>
                </div>

                <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {REMOTION_PIPELINE_STEPS.map((item) => (
                    <li key={item.step} className="rounded-2xl border border-line bg-card p-4">
                      <p className="font-display text-xs font-bold tracking-[0.1em] text-accent">
                        {item.step}
                      </p>
                      <h3 className="mt-1 text-sm font-bold text-fg">{pick(item.title, locale)}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-fg-2">{pick(item.detail, locale)}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2" role="group" aria-label={copy.tabRemotion}>
                    {REMOTION_CODE_RECIPES.map((recipe) => (
                      <button
                        key={recipe.id}
                        type="button"
                        data-testid={`remotion-recipe-${recipe.id}`}
                        aria-pressed={activeRecipe.id === recipe.id}
                        onClick={() => {
                          setSelectedRecipeId(recipe.id);
                          setCopyFeedback(null);
                        }}
                        className={cn(
                          "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                          activeRecipe.id === recipe.id
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:text-fg",
                        )}
                      >
                        <Code2 size={13} className="mr-1.5 inline" aria-hidden="true" />
                        {pick(recipe.title, locale)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-testid="remotion-copy-button"
                    onClick={() => {
                      void handleCopyRecipe();
                    }}
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                  >
                    {copyFeedback === copy.copiedCode ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    {copyFeedback ?? copy.copyCode}
                  </button>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-fg">{pick(activeRecipe.subtitle, locale)}</p>
                  <p className="mt-0.5 font-mono text-xs text-fg-3">ref: {activeRecipe.sourceRef}</p>
                  <pre
                    data-testid="remotion-recipe-code"
                    className="mt-3 overflow-x-auto rounded-2xl border border-line bg-canvas p-4 font-mono text-xs leading-6 text-fg"
                  >
                    <code>{activeRecipe.code}</code>
                  </pre>
                </div>

                <p className="mt-4 text-xs leading-5 text-fg-3">{copy.remotionLicenseNote}</p>
              </div>
            </section>
          ) : null}

          {activeTab === "ai-skills" ? (
            <section
              role="tabpanel"
              data-testid="tech-panel-ai-skills"
              aria-labelledby="tech-ai-heading"
              className="space-y-6"
            >
              <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
                <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent uppercase">
                  <Cpu size={14} aria-hidden="true" />
                  <span>AI AGENT HARNESS & SWARM RATCHETS</span>
                </div>
                <h2 id="tech-ai-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
                  {copy.aiHeading}
                </h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">{copy.aiSubtitle}</p>

                <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {AI_HARNESS_PILLARS.map((pillar) => (
                    <article
                      key={pillar.id}
                      data-testid={`ai-pillar-${pillar.id}`}
                      className="rounded-2xl border border-line bg-card p-4"
                    >
                      <h3 className="text-sm font-bold text-fg">{pick(pillar.title, locale)}</h3>
                      <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-raised px-2.5 py-1.5 font-mono text-[11px] text-cool">
                        <Terminal size={12} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{pillar.command}</span>
                      </p>
                      <p className="mt-2 text-xs leading-5 text-fg-2">{pick(pillar.detail, locale)}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "chrome-apis" ? (
            <section
              role="tabpanel"
              data-testid="tech-panel-chrome-apis"
              aria-labelledby="tech-probe-heading"
              className="space-y-6"
            >
              <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="tech-probe-heading" className="text-xl font-bold text-fg sm:text-2xl">
                      {copy.probeHeading}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">{copy.probeSubtitle}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="tech-view-transition-demo"
                      onClick={handleTestViewTransition}
                      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                    >
                      <Layers size={14} aria-hidden="true" />
                      {copy.probeTestTransition}
                    </button>
                    <button
                      type="button"
                      data-testid="tech-probe-refresh"
                      onClick={() => setProbe(probeBrowserNextGenWebApis())}
                      className={buttonClass({ size: "sm", className: "min-h-11" })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      {copy.probeRefresh}
                    </button>
                  </div>
                </div>

                <div
                  data-testid="tech-probe-runtime-banner"
                  role="status"
                  className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-xs text-fg-2"
                >
                  <span className="ts-status-pill ts-status-cool">
                    {probe.supportedCount} / {probe.totalCount} APIs
                  </span>
                  <span>
                    <strong className="font-semibold text-fg">{copy.probeSpeculationLabel}: </strong>
                    <code className="font-mono text-cool">{speculationStatus}</code>
                  </span>
                  <span>
                    <strong className="font-semibold text-fg">{copy.probeTransitionLabel}: </strong>
                    <code className="font-mono text-accent">
                      {lastTransition ? `${lastTransition.reason} (#${transitionPulse})` : "idle"}
                    </code>
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {probe.items.map((api) => (
                    <article
                      key={api.id}
                      data-testid={`tech-chrome-api-${api.id}`}
                      className="rounded-2xl border border-line bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-fg">{api.name}</h3>
                          <p className="font-mono text-[11px] text-fg-3">
                            {api.chromeSince} · {api.detail}
                          </p>
                        </div>
                        <span
                          className={cn("ts-status-pill shrink-0", api.supported ? "ts-status-good" : "ts-status-warn")}
                        >
                          <span
                            className={cn("ts-probe-dot", api.supported ? "ts-probe-dot-on" : "ts-probe-dot-fallback")}
                            aria-hidden="true"
                          />
                          {api.supported ? copy.probeSupported : copy.probeFallback}
                        </span>
                      </div>
                      <dl className="mt-3 space-y-1.5 border-t border-line/60 pt-2.5 text-xs leading-5">
                        <div>
                          <dt className="font-semibold text-fg-2">{copy.probeUseLabel}</dt>
                          <dd className="text-fg-2">{pick(api.useInToonStudio, locale)}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-fg-3">{copy.probeFallbackLabel}</dt>
                          <dd className="text-fg-3">{pick(api.fallbackStrategy, locale)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "llm-mcp-api" ? <TechLlmMcpApiPanel locale={locale} /> : null}
          {activeTab === "papers-rd" ? <TechResearchPapersAndUxPanel locale={locale} /> : null}
        </div>

        {/* 4. 하단 크로스 링크 */}
        <nav
          aria-label={copy.footerNavAria}
          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-panel p-5"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
            <span>{copy.footerHint}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/compare/studio" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {copy.ctaCompare}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/studio/new"
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
            >
              {copy.ctaStudio}
            </Link>
          </div>
        </nav>
      </div>
    </Container>
  );
}
