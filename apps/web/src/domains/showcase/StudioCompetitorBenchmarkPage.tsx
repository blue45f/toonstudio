import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Contrast,
  Cpu,
  ExternalLink,
  Layers,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  BENCHMARK_AXES,
  BENCHMARK_DEVICE_CARDS,
  BENCHMARK_PERSONAS,
  BENCHMARK_STATUS_META,
  BENCHMARK_TOOLS,
  getBenchmarkPersona,
  getBenchmarkTool,
  type BenchmarkAxisId,
  type BenchmarkPersonaId,
  type BenchmarkStatus,
  type BilingualText,
} from "./competitor-benchmark-data";
import {
  probeBrowserNextGenWebApis,
  type NextGenWebApiProbeReport,
} from "./nextgen-tech-showcase-data";
import {
  installSpeculationRulesOnce,
  readMotionAndContrastPreferences,
  startSafeViewTransition,
} from "./nextgen-web-platform-enhancer";
import { BENCHMARK_PAGE_COPY } from "./showcase-ui-copy";
import { StudioBrushFilterMatrixSection } from "./StudioBrushFilterMatrixSection";
import { StudioNextGenInnovationsStrip } from "./StudioNextGenInnovationsStrip";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import "./showcase-nextgen-motion.css";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

function renderStatusSymbol(status: BenchmarkStatus): string {
  switch (status) {
    case "current":
      return "●";
    case "partial":
      return "◐";
    case "target":
      return "◎";
    case "native-strength":
      return "★";
    case "limited":
      return "△";
    case "none":
      return "—";
  }
}

export function StudioCompetitorBenchmarkPage() {
  const lang = useI18n((state) => state.lang);
  const locale: "ko" | "en" = lang === "en" ? "en" : "ko";
  const copy = BENCHMARK_PAGE_COPY[locale];

  const [selectedPersona, setSelectedPersona] = useState<BenchmarkPersonaId>("all");
  const [selectedAxisId, setSelectedAxisId] = useState<BenchmarkAxisId>("install-device");
  const [highContrast, setHighContrast] = useState<boolean>(
    () => readMotionAndContrastPreferences().forcedColors,
  );
  const [probe, setProbe] = useState<NextGenWebApiProbeReport>(() => probeBrowserNextGenWebApis());
  const [probeCount, setProbeCount] = useState(1);

  useEffect(() => {
    installSpeculationRulesOnce();
  }, []);

  const activePersona = getBenchmarkPersona(selectedPersona);
  const visibleAxes = activePersona
    ? BENCHMARK_AXES.filter((axis) => activePersona.priorityAxes.includes(axis.id))
    : BENCHMARK_AXES;
  const activeAxis =
    visibleAxes.find((axis) => axis.id === selectedAxisId) ?? visibleAxes[0] ?? BENCHMARK_AXES[0]!;

  const handleSelectPersona = (personaId: BenchmarkPersonaId) => {
    startSafeViewTransition(() => {
      setSelectedPersona(personaId);
      const nextPersona = getBenchmarkPersona(personaId);
      if (nextPersona && nextPersona.priorityAxes.length > 0) {
        setSelectedAxisId(nextPersona.priorityAxes[0]!);
      }
    });
  };

  const handleSelectAxis = (axisId: BenchmarkAxisId) => {
    startSafeViewTransition(() => {
      setSelectedAxisId(axisId);
    });
  };

  const handleRefreshProbe = () => {
    setProbe(probeBrowserNextGenWebApis());
    setProbeCount((count) => count + 1);
  };

  const tierLabel =
    probe.readinessTier === "nextgen-ready"
      ? copy.probeTierNextgen
      : probe.readinessTier === "progressive"
        ? copy.probeTierProgressive
        : copy.probeTierBaseline;

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <div
        data-testid="studio-benchmark-page"
        data-showcase-high-contrast={highContrast ? "true" : "false"}
        className="ts-showcase-root space-y-10 sm:space-y-12"
      >
        {/* 1. 비주얼 엠블럼 히어로 */}
        <header className="ts-showcase-hero rounded-3xl p-6 sm:p-8 lg:p-10">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
                <Scale size={14} aria-hidden="true" />
                <span>{copy.eyebrow}</span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-fg sm:text-4xl">
                {copy.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
                {copy.subtitle}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link href="/studio/new" className={buttonClass({ size: "md", className: "min-h-11" })}>
                  {copy.startStudio}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href="/tech"
                  className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
                >
                  <Cpu size={15} aria-hidden="true" />
                  {copy.openTechLab}
                </Link>
                <button
                  type="button"
                  data-testid="benchmark-high-contrast-toggle"
                  aria-pressed={highContrast}
                  onClick={() => setHighContrast((prev) => !prev)}
                  className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
                >
                  <Contrast size={15} aria-hidden="true" />
                  {highContrast ? copy.highContrastOn : copy.highContrastOff}
                </button>
              </div>
            </div>
            <div className="ts-showcase-emblem-frame mx-auto w-full max-w-[14rem] rounded-3xl p-4">
              <img
                src="/assets/studio/vibrant-sprites/emblem-benchmark.webp"
                alt={copy.emblemAlt}
                width={176}
                height={176}
                loading="eager"
                decoding="async"
                className="h-36 w-36 object-contain sm:h-40 sm:w-40"
              />
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-3 border-t border-line/70 pt-6 lg:grid-cols-4">
            <div className="rounded-2xl bg-card/85 px-4 py-3">
              <dd className="font-display text-2xl font-bold text-fg">{BENCHMARK_TOOLS.length}</dd>
              <dt className="mt-0.5 text-xs text-fg-3">{copy.kpiTools}</dt>
            </div>
            <div className="rounded-2xl bg-card/85 px-4 py-3">
              <dd className="font-display text-2xl font-bold text-fg">{BENCHMARK_AXES.length}</dd>
              <dt className="mt-0.5 text-xs text-fg-3">{copy.kpiAxes}</dt>
            </div>
            <div className="rounded-2xl bg-card/85 px-4 py-3">
              <dd className="font-display text-2xl font-bold text-fg">{BENCHMARK_PERSONAS.length}</dd>
              <dt className="mt-0.5 text-xs text-fg-3">{copy.kpiPersonas}</dt>
            </div>
            <div className="rounded-2xl bg-card/85 px-4 py-3">
              <dd className="font-display text-2xl font-bold text-good">₩0</dd>
              <dt className="mt-0.5 text-xs text-fg-3">{copy.kpiBeta}</dt>
            </div>
          </dl>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-card/75 px-4 py-3 text-xs leading-5 text-fg-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
            <div>
              <strong className="font-semibold text-fg">{copy.honestyTitle} — </strong>
              <span>{copy.honestyBody}</span>
            </div>
          </div>
        </header>

        {/* 2. 라이브 브라우저 하드웨어 & 차세대 API 신호등 */}
        <section
          data-testid="benchmark-live-probe"
          aria-labelledby="benchmark-live-probe-heading"
          className="ts-showcase-reveal rounded-3xl border border-line bg-panel p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-[0.1em] text-cool uppercase">
                <Activity size={14} aria-hidden="true" />
                <span>LIVE BROWSER TELEMETRY · #{probeCount}</span>
              </div>
              <h2 id="benchmark-live-probe-heading" className="mt-1 text-lg font-bold text-fg sm:text-xl">
                {copy.probeTitle}
              </h2>
              <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm">{copy.probeSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="benchmark-probe-summary" role="status" className="ts-status-pill ts-status-cool">
                {tierLabel} ({probe.supportedCount}/{probe.totalCount})
              </span>
              <button
                type="button"
                data-testid="benchmark-probe-refresh"
                onClick={handleRefreshProbe}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {copy.probeRefresh}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {probe.items.map((item) => (
              <div
                key={item.id}
                data-testid={`benchmark-probe-item-${item.id}`}
                className="rounded-2xl border border-line bg-card px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-fg">
                    <span
                      className={cn("ts-probe-dot", item.supported ? "ts-probe-dot-on" : "ts-probe-dot-fallback")}
                      aria-hidden="true"
                    />
                    {item.name}
                  </span>
                  <span className={cn("text-[11px] font-bold", item.supported ? "text-good" : "text-warn")}>
                    {item.supported ? copy.probeSupported : copy.probeFallback}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-fg-3">{item.detail}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-fg-3">
            <strong className="font-semibold text-fg-2">{copy.probeHardwarePrefix}: </strong>
            {copy.probeCores} {probe.hardware.cores ?? "N/A"} · {copy.probeTouch}{" "}
            {probe.hardware.maxTouchPoints} ·{" "}
            {probe.hardware.prefersReducedMotion ? copy.probeMotionReduced : copy.probeMotionNormal}
          </p>
        </section>

        {/* 3. 4대 페르소나 스포트라이트 필터 */}
        <section
          data-testid="benchmark-persona-filters"
          aria-labelledby="benchmark-persona-heading"
          className="ts-showcase-reveal space-y-4"
        >
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent uppercase">
            <Users size={14} aria-hidden="true" />
            <span>PERSONA SPOTLIGHT</span>
          </div>
          <h2 id="benchmark-persona-heading" className="text-xl font-bold text-fg sm:text-2xl">
            {copy.personaHeading}
          </h2>

          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.personaHeading}>
            <button
              type="button"
              data-testid="benchmark-persona-all"
              aria-pressed={selectedPersona === "all"}
              onClick={() => handleSelectPersona("all")}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-xs font-bold transition-colors sm:text-sm",
                selectedPersona === "all"
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {copy.personaAll}
            </button>
            {BENCHMARK_PERSONAS.map((persona) => (
              <button
                key={persona.id}
                type="button"
                data-testid={`benchmark-persona-${persona.id}`}
                aria-pressed={selectedPersona === persona.id}
                onClick={() => handleSelectPersona(persona.id)}
                className={cn(
                  "min-h-11 rounded-full border px-4 py-2 text-xs font-bold transition-colors sm:text-sm",
                  selectedPersona === persona.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {pick(persona.label, locale)}
              </button>
            ))}
          </div>

          {activePersona ? (
            <article
              data-testid={`benchmark-persona-spotlight-${activePersona.id}`}
              className="ts-showcase-stage rounded-3xl border border-accent/50 bg-panel p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-fg">{pick(activePersona.label, locale)}</h3>
                  <p className="mt-1 text-sm text-fg-2">{pick(activePersona.tagline, locale)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-fg-3">{copy.personaRecommended}:</span>
                  {activePersona.recommendedStack.map((toolId) => (
                    <span
                      key={toolId}
                      className={cn("ts-status-pill", toolId === "toonstudio" ? "ts-status-good" : "ts-status-neutral")}
                    >
                      {getBenchmarkTool(toolId).name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-4 border-t border-line/60 pt-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-good">{copy.personaWhy}</p>
                  <p className="mt-1 text-sm leading-6 text-fg-2">{pick(activePersona.whyFit, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-warn">{copy.personaTradeoff}</p>
                  <p className="mt-1 text-sm leading-6 text-fg-2">{pick(activePersona.candidTradeoff, locale)}</p>
                </div>
              </div>
            </article>
          ) : null}
        </section>

        {/* 4. 7대 축 도식 비교 매트릭스 */}
        <section
          data-testid="benchmark-matrix"
          aria-labelledby="benchmark-matrix-heading"
          className="ts-showcase-reveal space-y-4"
        >
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent uppercase">
            <Layers size={14} aria-hidden="true" />
            <span>7-AXIS MATRIX</span>
          </div>
          <h2 id="benchmark-matrix-heading" className="text-xl font-bold text-fg sm:text-2xl">
            {copy.matrixHeading}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-fg-2">{copy.matrixSubtitle}</p>

          <div role="tablist" aria-label={copy.matrixHeading} className="flex flex-wrap gap-2">
            {visibleAxes.map((axis) => {
              const isSelected = axis.id === activeAxis.id;
              return (
                <button
                  key={axis.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`benchmark-axis-tab-${axis.id}`}
                  onClick={() => handleSelectAxis(axis.id)}
                  className={cn(
                    "min-h-11 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
                    isSelected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {axis.order}. {pick(axis.shortLabel, locale)}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            data-testid={`benchmark-axis-panel-${activeAxis.id}`}
            className="ts-showcase-stage rounded-3xl border border-line bg-panel p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 pb-4">
              <div>
                <h3 className="text-lg font-bold text-fg">{pick(activeAxis.title, locale)}</h3>
                <p className="mt-1 text-sm leading-6 text-fg-2">{pick(activeAxis.summary, locale)}</p>
              </div>
              <div className="text-xs text-fg-3">
                <span className="font-semibold text-fg-2">{copy.matrixEvidenceLabel}: </span>
                <span className="font-mono">{activeAxis.evidencePaths.join(" · ")}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {BENCHMARK_TOOLS.map((tool) => {
                const cell = activeAxis.cells[tool.id];
                const meta = BENCHMARK_STATUS_META[cell.status];
                return (
                  <article
                    key={tool.id}
                    data-testid={`benchmark-tool-cell-${tool.id}`}
                    className={cn(
                      "ts-showcase-sprite-card flex flex-col justify-between rounded-2xl p-4",
                      tool.id === "toonstudio" ? "border-accent/70 bg-raised/65" : "bg-card",
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-fg">{tool.name}</h4>
                          <p className="text-[11px] text-fg-3">{pick(tool.category, locale)}</p>
                        </div>
                        <span className={cn("ts-status-pill shrink-0", meta.toneClass)}>
                          <span aria-hidden="true">{renderStatusSymbol(cell.status)}</span>
                          {pick(meta.label, locale)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-fg">{pick(cell.badge, locale)}</p>
                      <p className="mt-1 text-xs leading-5 text-fg-2">{pick(cell.note, locale)}</p>
                    </div>
                    <dl className="mt-3 space-y-1 border-t border-line/60 pt-2.5 text-[11px] text-fg-3">
                      <div>
                        <dt className="inline font-semibold text-fg-2">{copy.toolBilling}: </dt>
                        <dd className="inline">{pick(tool.officialBilling, locale)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-fg-2">{copy.toolInterop}: </dt>
                        <dd className="inline">{pick(tool.interopPath, locale)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. 멀티 디바이스 6종 컬러 스프라이트 생태계 */}
        <section
          data-testid="benchmark-device-ecosystem"
          aria-labelledby="benchmark-device-heading"
          className="ts-showcase-reveal space-y-4"
        >
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-cool uppercase">
            <Sparkles size={14} aria-hidden="true" />
            <span>MULTI-DEVICE SPRITE ECOSYSTEM</span>
          </div>
          <h2 id="benchmark-device-heading" className="text-xl font-bold text-fg sm:text-2xl">
            {copy.deviceHeading}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-fg-2">{copy.deviceSubtitle}</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENCHMARK_DEVICE_CARDS.map((device) => {
              const meta = BENCHMARK_STATUS_META[device.maturity];
              return (
                <article
                  key={device.id}
                  data-testid={`benchmark-device-card-${device.id}`}
                  className="ts-showcase-sprite-card flex items-start gap-4 rounded-3xl p-4"
                >
                  <img
                    src={device.spritePath}
                    alt={pick(device.name, locale)}
                    width={72}
                    height={72}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <h3 className="text-sm font-bold text-fg">{pick(device.name, locale)}</h3>
                      <span className={cn("ts-status-pill", meta.toneClass)}>
                        {pick(meta.label, locale)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-cool">{device.webApi}</p>
                    <p className="mt-1.5 text-xs leading-5 text-fg-2">{pick(device.role, locale)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 6. 브러시·필터 58종 경쟁사 대조 · 실측 성능 · 3D 셰이퍼 돌파 로드맵 */}
        <StudioBrushFilterMatrixSection locale={locale} />

        {/* 7. 차세대 4대 돌파 혁신 아키텍처 */}
        <StudioNextGenInnovationsStrip locale={locale} />

        {/* 7. 관련 허브 이동 */}
        <nav
          aria-label={copy.footerNavAria}
          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-panel p-5"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
            <span>{copy.footerHint}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/tech" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {copy.openTechLab}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/about/compare"
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
            >
              {copy.deepCompareLink}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
            <Link
              href="/compare"
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
            >
              {copy.backToWorkCompare}
            </Link>
          </div>
        </nav>
      </div>
    </Container>
  );
}
