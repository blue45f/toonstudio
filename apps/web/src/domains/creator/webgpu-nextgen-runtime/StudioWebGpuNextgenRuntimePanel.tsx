/**
 * 차세대 웹 플랫폼 런타임 콘솔 (`StudioWebGpuNextgenRuntimePanel`).
 *
 * - Props 없이 단독 렌더 가능하며 Calm Atelier 시맨틱 토큰만 사용한다.
 * - 원시 색상 리터럴, 전속성 전환, 장식 반짝임 아이콘, 브라우저 스토리지를 일절 사용하지 않는다.
 * - 3개 탭:
 *   1) Zero-Copy 링버퍼 벤치마크
 *   2) 적응형 3D LOD 거버너 시뮬레이터
 *   3) P2P CRDT·카나리 롤백 오라클
 */

import { Cpu, Layers, Network, ShieldCheck } from "lucide-react";
import { useCallback, useId, useState, type KeyboardEvent, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { AdaptiveLodSimulatorTab } from "./AdaptiveLodSimulatorTab";
import { P2pCanaryOracleTab } from "./P2pCanaryOracleTab";
import { RingBufferBenchmarkTab } from "./RingBufferBenchmarkTab";
import { isCrossOriginIsolatedRuntime } from "./zero-copy-tile-ring";

export type WebGpuNextgenRuntimeTabId = "ring" | "lod" | "p2p-canary";

export interface StudioWebGpuNextgenRuntimePanelProps {
  readonly locale?: "ko" | "en";
  readonly initialTab?: WebGpuNextgenRuntimeTabId;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const TAB_ACTIVE = "border-accent bg-accent text-on-accent";
const TAB_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const TABS: readonly {
  readonly id: WebGpuNextgenRuntimeTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  {
    id: "ring",
    labelKo: "Zero-Copy 링버퍼 벤치마크",
    labelEn: "Zero-Copy RingBuffer Benchmark",
  },
  {
    id: "lod",
    labelKo: "적응형 3D LOD 거버너 시뮬레이터",
    labelEn: "Adaptive 3D LOD Governor",
  },
  {
    id: "p2p-canary",
    labelKo: "P2P CRDT·카나리 롤백 오라클",
    labelEn: "P2P CRDT & Canary Rollback Oracle",
  },
];

function TabIcon({ id }: { readonly id: WebGpuNextgenRuntimeTabId }): ReactElement {
  if (id === "ring") return <Cpu className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === "lod") return <Layers className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Network className="h-3.5 w-3.5" aria-hidden="true" />;
}

/** Zero-Copy 링버퍼 · 적응형 3D LOD · P2P CRDT · 카나리 롤백 오라클 단독 패널. */
export function StudioWebGpuNextgenRuntimePanel({
  locale,
  initialTab = "ring",
  className,
}: StudioWebGpuNextgenRuntimePanelProps = {}): ReactElement {
  const uid = useId();
  const activeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (activeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<WebGpuNextgenRuntimeTabId>(initialTab);
  const crossOriginIsolated = isCrossOriginIsolatedRuntime();

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + delta + TABS.length) % TABS.length;
      const nextTab = TABS[nextIndex];
      if (nextTab) {
        setActiveTab(nextTab.id);
      }
    },
    [],
  );

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={`flex flex-col gap-4 rounded-xl border border-line bg-card p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      {/* 헤더 및 COOP/COEP 런타임 상태 요약 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 id={`${uid}-title`} className="text-base font-bold text-fg">
              {pick("차세대 WebGPU · P2P · LOD 런타임 콘솔", "Next-Gen WebGPU · P2P · LOD Runtime Console")}
            </h3>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "Zero-Copy 선형 타일 버스 · 스크린 오차 3D LOD 예산 제어 · P2P 인과 CRDT · SLO 자동 롤백 오라클을 실시간으로 검증합니다.",
              "Verify zero-copy linear tile ring buffers, screen-space 3D LOD budgeting, causal P2P CRDT sync, and SLO auto-rollback.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold tabular-nums ${
              crossOriginIsolated
                ? "border-good/40 bg-good/15 text-good"
                : "border-line bg-raised text-fg-2"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {crossOriginIsolated
                ? pick("COOP/COEP 격리 · SharedArrayBuffer 활성", "COOP/COEP Isolated · SharedArrayBuffer")
                : pick("표준 선형 메모리 · ArrayBuffer 모드", "Linear ArrayBuffer Mode")}
            </span>
          </span>
        </div>
      </header>

      {/* 3개 탭 내비게이션 */}
      <div
        role="tablist"
        aria-label={pick("차세대 런타임 기능 탭", "Next-gen runtime tabs")}
        className="flex flex-wrap gap-2"
      >
        {TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`${TAB_BASE} ${selected ? TAB_ACTIVE : TAB_IDLE}`}
            >
              <TabIcon id={tab.id} />
              <span>{pick(tab.labelKo, tab.labelEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 활성 탭 패널 본문 */}
      <div
        id={`${uid}-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === "ring" ? <RingBufferBenchmarkTab isKo={isKo} /> : null}
        {activeTab === "lod" ? <AdaptiveLodSimulatorTab isKo={isKo} /> : null}
        {activeTab === "p2p-canary" ? <P2pCanaryOracleTab isKo={isKo} /> : null}
      </div>
    </section>
  );
}
