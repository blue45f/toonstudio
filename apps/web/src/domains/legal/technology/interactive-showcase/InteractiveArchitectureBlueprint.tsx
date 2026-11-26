import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Cloud,
  Cpu,
  Database,
  FileCode2,
  Gauge,
  Layers,
  PackageCheck,
  PenTool,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import "./interactive-showcase.css";
import {
  ARCHITECTURE_BLUEPRINT_LAYERS,
  type ArchitectureLayerId,
  type ArchitectureTone,
} from "./interactive-showcase-data";
import { pickShowcaseText, showcaseBi } from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const LAYER_ICONS: Readonly<Record<ArchitectureLayerId, LucideIcon>> = {
  "canvas-ui": PenTool,
  "webgpu-vello-3d": Layers,
  "rust-wasm64-simd": Cpu,
  "sqlite-opfs-crdt": Database,
  "edge-onpod-api": Cloud,
};

function toneActiveClasses(tone: ArchitectureTone): string {
  switch (tone) {
    case "accent":
      return "border-accent bg-accent-soft text-fg";
    case "cool":
      return "border-cool bg-info-soft text-fg";
    case "good":
      return "border-good bg-good-soft text-fg";
    case "warn":
      return "border-warn bg-warning-soft text-fg";
  }
}

function toneBadgeClasses(tone: ArchitectureTone): string {
  switch (tone) {
    case "accent":
      return "border-accent/40 bg-accent-soft text-accent";
    case "cool":
      return "border-cool/40 bg-info-soft text-cool";
    case "good":
      return "border-good/40 bg-good-soft text-good";
    case "warn":
      return "border-warn/40 bg-warning-soft text-warn";
  }
}

export interface InteractiveArchitectureBlueprintProps {
  readonly className?: string;
}

export function InteractiveArchitectureBlueprint({
  className,
}: InteractiveArchitectureBlueprintProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedId, setSelectedId] = useState<ArchitectureLayerId>("rust-wasm64-simd");

  const activeLayer =
    ARCHITECTURE_BLUEPRINT_LAYERS.find((layer) => layer.id === selectedId) ??
    ARCHITECTURE_BLUEPRINT_LAYERS[0]!;

  const headingId = `${baseId}-blueprint-heading`;
  const detailPanelId = `${baseId}-blueprint-detail`;

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const total = ARCHITECTURE_BLUEPRINT_LAYERS.length;
    let nextIndex = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % total;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + total) % total;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = total - 1;
    }

    if (nextIndex >= 0) {
      event.preventDefault();
      const nextLayer = ARCHITECTURE_BLUEPRINT_LAYERS[nextIndex];
      if (nextLayer) {
        setSelectedId(nextLayer.id);
        nodeRefs.current[nextIndex]?.focus();
      }
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      data-showcase-widget="architecture-blueprint"
      className={cx(
        "rounded-3xl border border-line/80 bg-panel/75 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            {showcaseBi("5계층 시스템 아키텍처 청사진", "5-Layer System Architecture Blueprint")}
          </p>
          <h3
            id={headingId}
            className="mt-1.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {showcaseBi(
              "계층 노드를 눌러 확인하는 로컬 권위·번들 경계·실측 지연",
              "Click Any Layer Node to Inspect Local Authority, Bundle Impact & Latency",
            )}
          </h3>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold tabular-nums text-fg-2">
          <Boxes size={14} className="text-accent" aria-hidden="true" />
          {showcaseBi("5개 계층 · 초기 번들 0B 정적 격리", "5 Layers · 0B Eager Isolation")}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
        {/* 좌측: 5개 클릭 가능 계층 노드 스택 */}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={showcaseBi("시스템 아키텍처 5계층 선택", "Select 5 architecture layers")}
          className="grid gap-1.5"
        >
          {ARCHITECTURE_BLUEPRINT_LAYERS.map((layer, index) => {
            const Icon = LAYER_ICONS[layer.id];
            const selected = layer.id === activeLayer.id;
            const isLast = index === ARCHITECTURE_BLUEPRINT_LAYERS.length - 1;

            return (
              <div key={layer.id} className="grid gap-1.5">
                <button
                  ref={(el) => {
                    nodeRefs.current[index] = el;
                  }}
                  id={`${baseId}-node-${layer.id}`}
                  type="button"
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  aria-selected={selected}
                  aria-controls={detailPanelId}
                  data-blueprint-node={layer.id}
                  onClick={() => setSelectedId(layer.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, index)}
                  className={cx(
                    "tech-showcase-node flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selected
                      ? toneActiveClasses(layer.tone)
                      : "border-line bg-card/75 text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={cx(
                        "grid size-9 shrink-0 place-items-center rounded-xl border font-display text-xs font-black tabular-nums",
                        toneBadgeClasses(layer.tone),
                      )}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-fg-3">
                        {pickShowcaseText(layer.shortBadge)}
                      </span>
                      <span className="mt-0.5 block text-sm font-black break-keep text-fg">
                        {pickShowcaseText(layer.title)}
                      </span>
                    </span>
                  </span>

                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className={cx(
                      "shrink-0 transition-transform motion-reduce:transition-none",
                      selected ? "translate-x-0.5 text-accent" : "text-fg-3",
                    )}
                  />
                </button>

                {!isLast ? (
                  <div
                    aria-hidden="true"
                    className="flex items-center gap-2 pl-7 text-[0.68rem] font-bold text-fg-3"
                  >
                    <ArrowDown size={12} className="shrink-0 text-accent" />
                    <span className="truncate">{pickShowcaseText(layer.dataFlowLabel)}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 우측: 선택된 계층의 소유 모듈 · 오프라인 권위 · 번들 영향 · 지연 실측 인스펙터 */}
        <div
          id={detailPanelId}
          role="tabpanel"
          aria-labelledby={`${baseId}-node-${activeLayer.id}`}
          data-active-blueprint-layer={activeLayer.id}
          className="grid content-start gap-4 rounded-3xl border border-line bg-card/80 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-3.5">
            <div>
              <span
                className={cx(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-display text-[0.66rem] font-black uppercase tracking-[0.12em]",
                  toneBadgeClasses(activeLayer.tone),
                )}
              >
                {pickShowcaseText(activeLayer.shortBadge)}
              </span>
              <h4 className="mt-2 text-lg font-black break-keep text-fg">
                {pickShowcaseText(activeLayer.title)}
              </h4>
            </div>
            <span className="rounded-xl border border-good/35 bg-good-soft px-3 py-1 font-mono text-xs font-black tabular-nums text-good">
              0B eager
            </span>
          </div>

          <p className="text-sm leading-7 break-keep text-fg-2">
            {pickShowcaseText(activeLayer.summary)}
          </p>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line/80 bg-panel/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-xs font-black text-fg">
                <WifiOff size={14} className="shrink-0 text-good" aria-hidden="true" />
                {showcaseBi("오프라인 권위 보장", "Offline Authority")}
              </dt>
              <dd className="mt-1.5 text-xs leading-6 break-keep text-fg-2">
                {pickShowcaseText(activeLayer.offlineGuarantee)}
              </dd>
            </div>

            <div className="rounded-2xl border border-line/80 bg-panel/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-xs font-black text-fg">
                <PackageCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />
                {showcaseBi("초기 번들 영향", "Initial Bundle Impact")}
              </dt>
              <dd className="mt-1.5 text-xs leading-6 break-keep text-fg-2">
                {pickShowcaseText(activeLayer.bundleImpact)}
              </dd>
            </div>

            <div className="rounded-2xl border border-line/80 bg-panel/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-xs font-black text-fg">
                <Gauge size={14} className="shrink-0 text-cool" aria-hidden="true" />
                {showcaseBi("실측 지연·처리량", "Measured Latency")}
              </dt>
              <dd className="mt-1.5 text-xs leading-6 tabular-nums break-keep text-fg-2">
                {pickShowcaseText(activeLayer.measuredLatency)}
              </dd>
            </div>
          </dl>

          <div className="grid gap-2 rounded-2xl border border-line/80 bg-panel/75 p-4">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <FileCode2 size={14} className="shrink-0 text-accent" aria-hidden="true" />
              {showcaseBi(
                "이 계층이 소유하는 대표 모듈 (저장소 실재 경로)",
                "Owned Repository Modules (Verified Paths)",
              )}
            </p>
            <ul
              aria-label={showcaseBi("소유 모듈 경로", "Owned module paths")}
              className="grid gap-1.5"
            >
              {activeLayer.ownedModules.map((modulePath) => (
                <li key={modulePath}>
                  <code className="block break-all rounded-lg border border-line/70 bg-card px-2.5 py-1.5 font-mono text-[0.7rem] text-fg-2">
                    {modulePath}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
