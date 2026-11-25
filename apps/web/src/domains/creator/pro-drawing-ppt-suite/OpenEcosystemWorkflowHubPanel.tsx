import { Activity, BookOpen, Calculator, Cpu, Database, Gauge, Glasses, Globe, Layers, Link2, PackageCheck, Palette, PenTool, Presentation, Radio, Scale, Shield, ShieldCheck, Wand2, Workflow } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { StudioHubCalmTabNavigator } from "./StudioHubCalmTabNavigator";

const LazyStudioOpenEcosystemPanel = lazy(() =>
  import("../open-ecosystem-bridge/StudioOpenEcosystemPanel").then((m) => ({
    default: m.StudioOpenEcosystemPanel,
  })),
);
const LazyStudioOpenStandardsPublishPanel = lazy(() =>
  import("../open-standards-publish/StudioOpenStandardsPublishPanel").then((m) => ({
    default: m.StudioOpenStandardsPublishPanel,
  })),
);
const LazyStudioDynamicWorkflowPanel = lazy(() =>
  import("../dynamic-workflow-ecosystem/StudioDynamicWorkflowPanel").then((m) => ({
    default: m.StudioDynamicWorkflowPanel,
  })),
);
const LazyStudioGlobalReflowDnaPanel = lazy(() =>
  import("../global-reflow-dna/StudioGlobalReflowDnaPanel").then((m) => ({
    default: m.StudioGlobalReflowDnaPanel,
  })),
);
const LazyStudioFleetShieldPanel = lazy(() =>
  import("../studio-fleet-shield/StudioFleetShieldPanel").then((m) => ({
    default: m.StudioFleetShieldPanel,
  })),
);
const LazyStudioCollabKmSafeZonePanel = lazy(async () => {
  await import("../collab-km-delta-sync");
  const m = await import("../collab-km-delta-sync/StudioCollabKmSafeZonePanel");
  return { default: m.StudioCollabKmSafeZonePanel };
});
const LazyStudioRightsWatermarkGatePanel = lazy(async () => {
  await import("../rights-settlement-watermark");
  const m = await import("../rights-settlement-watermark/StudioRightsWatermarkGatePanel");
  return { default: m.StudioRightsWatermarkGatePanel };
});
const LazyStudioStreamingExportBudgeterPanel = lazy(async () => {
  await import("../streaming-export-budgeter");
  const m = await import("../streaming-export-budgeter/StudioStreamingExportBudgeterPanel");
  return { default: m.StudioStreamingExportBudgeterPanel };
});
const LazyStudioAutoStyleDnaPipelinePanel = lazy(async () => {
  await import("../auto-style-dna-pipeline");
  const m = await import("../auto-style-dna-pipeline/StudioAutoStyleDnaPipelinePanel");
  return { default: m.StudioAutoStyleDnaPipelinePanel };
});
const LazyStudioStyleShaderPackExchangePanel = lazy(async () => {
  await import("../style-shader-pack-exchange");
  const m = await import("../style-shader-pack-exchange/StudioStyleShaderPackExchangePanel");
  return { default: m.StudioStyleShaderPackExchangePanel };
});
const LazyStudioEpisodeColorScriptPanel = lazy(async () => {
  await import("../episode-color-script-harmonizer");
  const m = await import("../episode-color-script-harmonizer/StudioEpisodeColorScriptPanel");
  return { default: m.StudioEpisodeColorScriptPanel };
});
const LazyStudioWebcodecsOpfsPanel = lazy(async () => {
  await import("../webcodecs-opfs-engine");
  const m = await import("../webcodecs-opfs-engine/StudioWebcodecsOpfsPanel");
  return { default: m.StudioWebcodecsOpfsPanel };
});
const LazyStudioAiLatentStoryboardPanel = lazy(async () => {
  await import("../ai-latent-storyboard");
  const m = await import("../ai-latent-storyboard/StudioAiLatentStoryboardPanel");
  return { default: m.StudioAiLatentStoryboardPanel };
});

const LazyStudioCreatorMonetizationPanel = lazy(async () => {
  await import("../creator-monetization-planner");
  const m = await import("../creator-monetization-planner/StudioCreatorMonetizationPanel");
  return { default: m.StudioCreatorMonetizationPanel };
});
const LazyStudioOfflineResiliencePanel = lazy(async () => {
  await import("../offline-crdt-resilience");
  const m = await import("../offline-crdt-resilience/StudioOfflineResiliencePanel");
  return { default: m.StudioOfflineResiliencePanel };
});

const LazyAssistantHandoffPanel = lazy(async () => {
  await import("../assistant-handoff-qa-kit");
  const m = await import("../assistant-handoff-qa-kit/StudioAssistantHandoffKitPanel");
  return { default: m.StudioAssistantHandoffKitPanel };
});

const LazyStudioGlobalIpPitchPanel = lazy(async () => {
  await import("../global-ip-pitch-studio");
  const m = await import("../global-ip-pitch-studio/StudioGlobalIpPitchPanel");
  return { default: m.StudioGlobalIpPitchPanel };
});
const LazyStudioProDigitizerCalibratorPanel = lazy(async () => {
  await import("../pro-digitizer-hid-engine");
  const m = await import("../pro-digitizer-hid-engine/StudioProDigitizerCalibratorPanel");
  return { default: m.StudioProDigitizerCalibratorPanel };
});
const LazyStudioSpatialWearablePanel = lazy(async () => {
  await import("../spatial-wearable-studio");
  const m = await import("../spatial-wearable-studio/StudioSpatialWearablePanel");
  return { default: m.StudioSpatialWearablePanel };
});

const LazyStudioHeterogeneousSiliconPanel = lazy(() =>
  import("../heterogeneous-npu-runtime").then((module) => ({ default: module.StudioHeterogeneousSiliconPanel })),
);

const LazyStudioRustExpansionArchitectPanel = lazy(() =>
  import("../rust-full-expansion-planner").then((module) => ({ default: module.StudioRustExpansionArchitectPanel })),
);

const LazyStudioMulticoreVelloSchedulerPanel = lazy(() =>
  import("../multicore-gpu-vello-scheduler").then((module) => ({ default: module.StudioMulticoreVelloSchedulerPanel })),
);

const LazyStudioRustHotspotPorterPanel = lazy(() =>
  import("../rust-hotspot-parity-porter").then((module) => ({ default: module.StudioRustHotspotPorterPanel })),
);

const LazyStudioWebNnNpuThermalPanel = lazy(() =>
  import("../webnn-npu-thermal-compiler").then((module) => ({ default: module.StudioWebNnNpuThermalPanel })),
);

const LazyStudioToonSiliconPanel = lazy(() =>
  import("../toon-silicon-runtime").then((module) => ({ default: module.StudioToonSiliconPanel })),
);

type EcosystemTabId =
  | "siliconPlan"
  | "workflowDag"
  | "openBridge"
  | "standardsPublish"
  | "reflowDna"
  | "fleetShield"
  | "collabKmSafeZone"
  | "rightsWatermark"
  | "streamingBudget"
  | "autoStyleDna"
  | "styleShaderPack"
  | "episodeColorScript"
  | "webcodecsOpfs"
  | "aiLatentConti"
  | "monetizationPlan"
  | "offlineResilience"
  | "assistantHandoff"
  | "globalIpPitch"
  | "proDigitizerHid"
  | "spatialWearable"
  | "heterogeneousNpu"
  | "rustFullExpansion"
  | "multicoreVello"
  | "rustHotspotPorter"
  | "npuThermal";

const CINEMA_ERGO_VISUAL_CARDS: readonly {
  readonly id: string;
  readonly src: string;
  readonly titleKo: string;
  readonly titleEn: string;
}[] = [
  { id: "balloonInk", src: "/assets/atelier/cinema-ergo/cinema-balloon-ink.webp", titleKo: "광학 말풍선·SFX 잉킹", titleEn: "Optical Balloon & SFX Inking" },
  { id: "lensGolden", src: "/assets/atelier/cinema-ergo/cinema-lens-golden.webp", titleKo: "3D 시네마 렌즈·황금나선", titleEn: "Cinema Lenses & Golden Spiral" },
  { id: "colorScript", src: "/assets/atelier/cinema-ergo/cinema-color-script.webp", titleKo: "4막 감정 컬러 스크립트", titleEn: "4-Act Color Script" },
  { id: "pigmentSwatches", src: "/assets/atelier/cinema-ergo/cinema-pigment-swatches.webp", titleKo: "색상 변환 스와치 예시", titleEn: "Color Transform Swatches" },
  { id: "ambidextrousDesk", src: "/assets/atelier/cinema-ergo/ergo-ambidextrous-desk.webp", titleKo: "왼손·양손 인체공학 데스크", titleEn: "Ambidextrous Studio Desk" },
  { id: "localVault", src: "/assets/atelier/cinema-ergo/ergo-local-vault.webp", titleKo: "저랭크 학습 자료 보관함 예시", titleEn: "Low-Rank Learning Folio" },
  { id: "chronometer120hz", src: "/assets/atelier/cinema-ergo/ergo-120hz-chronometer.webp", titleKo: "프레임 시간계 예시", titleEn: "Frame Timing Illustration" },
  { id: "materialFolio", src: "/assets/atelier/cinema-ergo/ergo-material-folio.webp", titleKo: "한지·린넨·대리석 절차 재질", titleEn: "Seamless Material Folio" },
];

const ECOSYSTEM_TABS: readonly {
  readonly id: EcosystemTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "workflowDag", labelKo: "다이나믹 워크플로우 DAG·OTIO·정산", labelEn: "Dynamic Workflow DAG · OTIO · ERP" },
  { id: "openBridge", labelKo: "개방형 도구 브리지(외부 작화·이슈·메신저)·SDK", labelEn: "Open Tool Bridge (External Drawing · Issue · Chat) · SDK" },
  { id: "standardsPublish", labelKo: "C2PA·TMS 번역·7대 플랫폼 출고", labelEn: "C2PA · TMS · 7-Platform Publish" },
  { id: "reflowDna", labelKo: "세로↔단행본 리플로우·스타일 DNA", labelEn: "Scroll↔Print Reflow · Style DNA" },
  { id: "fleetShield", labelKo: "스펙트럼 실드·2nd-Screen·Fleet 레이더", labelEn: "Spectral Shield · 2nd-Screen · Fleet" },
  { id: "collabKmSafeZone", labelKo: "광학 혼색 델타·오프라인 메시", labelEn: "KM Delta Sync · Offline Safe-Zone" },
  { id: "rightsWatermark", labelKo: "C2PA 정산·적응형 AI 워터마크", labelEn: "C2PA Royalty · Adaptive Watermark" },
  { id: "streamingBudget", labelKo: "60fps 동적 스트리밍 출고 예산", labelEn: "60fps Streaming Export Budgeter" },
  { id: "autoStyleDna", labelKo: "자동 화풍 DNA·대본3D·심의", labelEn: "Auto Style DNA · Script-to-3D · Rating" },
  { id: "styleShaderPack", labelKo: "팀 화풍·WGSL 팩 서명 교환 (.tspack)", labelEn: "Team Style & WGSL Pack (.tspack)" },
  { id: "episodeColorScript", labelKo: "60컷 OKLCH 컬러스크립트 조화", labelEn: "60-Cut OKLCH Color Script" },
  { id: "webcodecsOpfs", labelKo: "코덱 지원 점검·희소 타일·OPFS 버전", labelEn: "Codec Support Probe · Sparse Tile · OPFS VCS" },
  { id: "aiLatentConti", labelKo: "색 변환 예제·대본 분석·브러시 추천", labelEn: "Color Example · Script Parser · Brush Suggestions" },
  { id: "monetizationPlan", labelKo: "유료전환·굿즈·정산 가정 계산", labelEn: "Funnel · Goods · Settlement Estimates" },
  { id: "offlineResilience", labelKo: "오프라인 병합·복구·잠금 예제", labelEn: "Offline Merge · Recovery · Lease Examples" },
  { id: "assistantHandoff", labelKo: "레이어 검수·인수인계 예제", labelEn: "Layer Review · Handoff Examples" },
  { id: "globalIpPitch", labelKo: "IP 피칭·수익 가정 예제", labelEn: "IP Pitch · Revenue Assumption Examples" },
  { id: "proDigitizerHid", labelKo: "펜 입력·보정 계산 예제", labelEn: "Pen Input · Calibration Examples" },
  { id: "spatialWearable", labelKo: "기기 배치·시간 예측 예제", labelEn: "Device Layout · Timing Estimate Examples" },
  { id: "heterogeneousNpu", labelKo: "기기별 NPU·GPU 배치 계획", labelEn: "Device NPU and GPU Planning" },
  { id: "siliconPlan", labelKo: "칩셋별 연산 배치 계획", labelEn: "Compute Planning by Chipset" },
  { id: "rustFullExpansion", labelKo: "Rust WASM 전환 계획", labelEn: "Rust WASM Expansion Planning" },
  { id: "multicoreVello", labelKo: "멀티코어·스펙트럼 컴퓨트 GPU 스케줄 예제", labelEn: "Multicore and SpectrumCompute GPU Scheduling Examples" },
  { id: "rustHotspotPorter", labelKo: "Rust WASM 이식·검증 예제", labelEn: "Rust WASM Porting and Parity Exercise" },
  { id: "npuThermal", labelKo: "NPU 그래프와 열 제어 예제", labelEn: "NPU Graph and Thermal Control Examples" },
];

const ECOSYSTEM_PINNED_TABS: readonly EcosystemTabId[] = [
  "workflowDag",
  "openBridge",
  "standardsPublish",
  "reflowDna",
  "collabKmSafeZone",
  "episodeColorScript",
];

function EcosystemIcon({ id }: { readonly id: EcosystemTabId }) {
  switch (id) {
    case "npuThermal":
      return <Cpu size={15} aria-hidden="true" />;
    case "siliconPlan":
      return <Cpu size={15} aria-hidden="true" />;
    case "heterogeneousNpu":
      return <Cpu size={15} aria-hidden="true" />;
    case "rustFullExpansion":
      return <Layers size={15} aria-hidden="true" />;
    case "multicoreVello":
      return <Activity size={15} aria-hidden="true" />;
    case "rustHotspotPorter":
      return <Scale size={15} aria-hidden="true" />;
    case "globalIpPitch":
      return <Presentation size={15} aria-hidden="true" />;
    case "proDigitizerHid":
      return <PenTool size={15} aria-hidden="true" />;
    case "spatialWearable":
      return <Glasses size={15} aria-hidden="true" />;
    case "assistantHandoff":
      return <PackageCheck size={15} aria-hidden="true" />;
    case "monetizationPlan":
      return <Calculator size={15} aria-hidden="true" />;
    case "offlineResilience":
      return <Database size={15} aria-hidden="true" />;
    case "workflowDag":
      return <Workflow size={15} aria-hidden="true" />;
    case "openBridge":
      return <Link2 size={15} aria-hidden="true" />;
    case "standardsPublish":
      return <Globe size={15} aria-hidden="true" />;
    case "reflowDna":
      return <BookOpen size={15} aria-hidden="true" />;
    case "fleetShield":
      return <Shield size={15} aria-hidden="true" />;
    case "collabKmSafeZone":
      return <Radio size={15} aria-hidden="true" />;
    case "rightsWatermark":
      return <ShieldCheck size={15} aria-hidden="true" />;
    case "streamingBudget":
      return <Gauge size={15} aria-hidden="true" />;
    case "autoStyleDna":
      return <Wand2 size={15} aria-hidden="true" />;
    case "styleShaderPack":
      return <PackageCheck size={15} aria-hidden="true" />;
    case "episodeColorScript":
      return <Palette size={15} aria-hidden="true" />;
    case "webcodecsOpfs":
      return <Workflow size={15} aria-hidden="true" />;
    case "aiLatentConti":
      return <Wand2 size={15} aria-hidden="true" />;
  }
}

export function OpenEcosystemWorkflowHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<EcosystemTabId>("workflowDag");

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "Open BYOT Ecosystem and Dynamic Workflow Hub" : "개방형 BYOT 생태계 및 다이나믹 워크플로우 허브"}
      data-testid="open-ecosystem-workflow-hub"
    >
      <StudioHubCalmTabNavigator
        baseId={baseId}
        ariaLabel={isEn ? "Ecosystem workflow modules" : "생태계 워크플로우 선택"}
        tabs={ECOSYSTEM_TABS}
        pinnedIds={ECOSYSTEM_PINNED_TABS}
        activeId={active}
        onSelect={setActive}
        renderIcon={(id) => <EcosystemIcon id={id} />}
        isEn={isEn}
        searchPlaceholderKo="출고, 리플로우, 협업, 컬러스크립트, 정산, 스펙트럼 컴퓨트 등으로 검색…"
        searchPlaceholderEn="Search publish, reflow, collab, color script, settlement, SpectrumCompute…"
      />

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-fg-2">
              {isEn ? "Loading open ecosystem workflow..." : "개방형 생태계·다이나믹 워크플로우 모듈을 불러오는 중입니다…"}
            </p>
          }
        >
          {active === "workflowDag" ? <LazyStudioDynamicWorkflowPanel /> : null}
          {active === "openBridge" ? <LazyStudioOpenEcosystemPanel /> : null}
          {active === "standardsPublish" ? <LazyStudioOpenStandardsPublishPanel /> : null}
          {active === "reflowDna" ? <LazyStudioGlobalReflowDnaPanel /> : null}
          {active === "fleetShield" ? <LazyStudioFleetShieldPanel /> : null}
          {active === "collabKmSafeZone" ? <LazyStudioCollabKmSafeZonePanel /> : null}
          {active === "rightsWatermark" ? <LazyStudioRightsWatermarkGatePanel /> : null}
          {active === "streamingBudget" ? <LazyStudioStreamingExportBudgeterPanel /> : null}
          {active === "autoStyleDna" ? <LazyStudioAutoStyleDnaPipelinePanel /> : null}
          {active === "styleShaderPack" ? <LazyStudioStyleShaderPackExchangePanel /> : null}
          {active === "episodeColorScript" ? <LazyStudioEpisodeColorScriptPanel /> : null}
          {active === "webcodecsOpfs" ? <LazyStudioWebcodecsOpfsPanel /> : null}
          {active === "aiLatentConti" ? <LazyStudioAiLatentStoryboardPanel /> : null}
          {active === "monetizationPlan" ? <LazyStudioCreatorMonetizationPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "offlineResilience" ? <LazyStudioOfflineResiliencePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "assistantHandoff" ? <LazyAssistantHandoffPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "globalIpPitch" ? <LazyStudioGlobalIpPitchPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "proDigitizerHid" ? <LazyStudioProDigitizerCalibratorPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "spatialWearable" ? <LazyStudioSpatialWearablePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "heterogeneousNpu" ? <LazyStudioHeterogeneousSiliconPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "siliconPlan" ? <LazyStudioToonSiliconPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "rustFullExpansion" ? <LazyStudioRustExpansionArchitectPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "multicoreVello" ? <LazyStudioMulticoreVelloSchedulerPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "rustHotspotPorter" ? <LazyStudioRustHotspotPorterPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "npuThermal" ? <LazyStudioWebNnNpuThermalPanel locale={isEn ? "en" : "ko"} /> : null}
        </Suspense>
      </div>
      <details className="rounded-xl border border-line bg-panel p-2.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center select-none text-xs font-semibold text-fg [word-break:keep-all]">
          {isEn
            ? `Cinematography, Ergonomics & Precision Atelier Cards (${CINEMA_ERGO_VISUAL_CARDS.length})`
            : `시네마토그래피·인체공학·정밀 아틀리에 비주얼 카드 (${CINEMA_ERGO_VISUAL_CARDS.length}종)`}
        </summary>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CINEMA_ERGO_VISUAL_CARDS.map((card) => (
            <figure
              key={card.id}
              className="overflow-hidden rounded-lg border border-line bg-card"
            >
              <img
                src={card.src}
                alt={isEn ? card.titleEn : card.titleKo}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover outline-1 -outline-offset-1 outline-line"
              />
              <figcaption className="px-2 py-1.5 text-[11px] font-medium text-fg-2 [word-break:keep-all]">
                {isEn ? card.titleEn : card.titleKo}
              </figcaption>
            </figure>
          ))}
        </div>
      </details>
    </section>
  );
}
