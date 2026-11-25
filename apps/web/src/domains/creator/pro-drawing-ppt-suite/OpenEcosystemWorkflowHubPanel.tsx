import { Activity, BarChart3, BookOpen, Calculator, ClipboardCheck, Compass, Cpu, Database, Focus, Gauge, Glasses, Globe, Link2, PackageCheck, Palette, PenTool, Presentation, Radio, Shield, ShieldCheck, SlidersHorizontal, Wand2, Workflow } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

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
const LazyStudioFederatedLoraStreamPanel = lazy(async () => {
  await import("../federated-style-lora");
  const m = await import("../federated-style-lora/StudioFederatedLoraStreamPanel");
  return { default: m.StudioFederatedLoraStreamPanel };
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
const LazyStudioPerfDoctorPanel = lazy(async () => {
  await import("../studio-perf-doctor");
  const m = await import("../studio-perf-doctor/StudioPerfDoctorPanel");
  return { default: m.StudioPerfDoctorPanel };
});
const LazyStudioAtelierCraftLauncherPanel = lazy(async () => {
  await import("../atelier-craft-launcher");
  const m = await import("../atelier-craft-launcher/StudioAtelierCraftLauncherPanel");
  return { default: m.StudioAtelierCraftLauncherPanel };
});
const LazyStudioAssistantHandoffKitPanel = lazy(async () => {
  await import("../assistant-handoff-qa-kit");
  const m = await import("../assistant-handoff-qa-kit/StudioAssistantHandoffKitPanel");
  return { default: m.StudioAssistantHandoffKitPanel };
});
const LazyStudioEpisodePacingThumbnailPanel = lazy(async () => {
  await import("../episode-pacing-thumbnail-lab");
  const m = await import("../episode-pacing-thumbnail-lab/StudioEpisodePacingThumbnailPanel");
  return { default: m.StudioEpisodePacingThumbnailPanel };
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
const LazyStudioFocusPanHapticPanel = lazy(async () => {
  await import("../focus-pan-haptic-studio");
  const m = await import("../focus-pan-haptic-studio/StudioFocusPanHapticPanel");
  return { default: m.StudioFocusPanHapticPanel };
});
const LazyStudioAdaptiveCalmGuardPanel = lazy(async () => {
  await import("../adaptive-calm-stack-guard");
  const m = await import("../adaptive-calm-stack-guard/StudioAdaptiveCalmGuardPanel");
  return { default: m.StudioAdaptiveCalmGuardPanel };
});

type EcosystemTabId =
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
  | "federatedLora"
  | "monetizationPlan"
  | "offlineResilience"
  | "perfDoctor"
  | "craftLauncher"
  | "assistHandoff"
  | "pacingThumbLab"
  | "globalIpPitch"
  | "proDigitizerHid"
  | "spatialWearable"
  | "focusPanHaptic"
  | "adaptiveCalmGuard";

const CINEMA_ERGO_VISUAL_CARDS: readonly {
  readonly id: string;
  readonly src: string;
  readonly titleKo: string;
  readonly titleEn: string;
}[] = [
  { id: "balloonInk", src: "/assets/atelier/cinema-ergo/cinema-balloon-ink.webp", titleKo: "광학 말풍선·SFX 잉킹", titleEn: "Optical Balloon & SFX Inking" },
  { id: "lensGolden", src: "/assets/atelier/cinema-ergo/cinema-lens-golden.webp", titleKo: "3D 시네마 렌즈·황금나선", titleEn: "Cinema Lenses & Golden Spiral" },
  { id: "colorScript", src: "/assets/atelier/cinema-ergo/cinema-color-script.webp", titleKo: "4막 감정 컬러 스크립트", titleEn: "4-Act Color Script" },
  { id: "pigmentSwatches", src: "/assets/atelier/cinema-ergo/cinema-pigment-swatches.webp", titleKo: "LMS 색각안전 안료 스와치", titleEn: "LMS Accessible Swatches" },
  { id: "ambidextrousDesk", src: "/assets/atelier/cinema-ergo/ergo-ambidextrous-desk.webp", titleKo: "왼손·양손 인체공학 데스크", titleEn: "Ambidextrous Studio Desk" },
  { id: "localVault", src: "/assets/atelier/cinema-ergo/ergo-local-vault.webp", titleKo: "온디바이스 로컬 LoRA 금고", titleEn: "Local Privacy LoRA Vault" },
  { id: "chronometer120hz", src: "/assets/atelier/cinema-ergo/ergo-120hz-chronometer.webp", titleKo: "120Hz 정밀 프레임 닥터", titleEn: "120Hz Precision Profiler" },
  { id: "materialFolio", src: "/assets/atelier/cinema-ergo/ergo-material-folio.webp", titleKo: "한지·린넨·대리석 절차 재질", titleEn: "Seamless Material Folio" },
];

const ECOSYSTEM_TABS: readonly {
  readonly id: EcosystemTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "workflowDag", labelKo: "다이나믹 워크플로우 DAG·OTIO·정산", labelEn: "Dynamic Workflow DAG · OTIO · ERP" },
  { id: "openBridge", labelKo: "BYOT(CSP/Jira/Slack)·플러그인 SDK", labelEn: "BYOT (CSP/Jira/Slack) · SDK" },
  { id: "standardsPublish", labelKo: "C2PA·TMS 번역·7대 플랫폼 출고", labelEn: "C2PA · TMS · 7-Platform Publish" },
  { id: "reflowDna", labelKo: "세로↔단행본 리플로우·스타일 DNA", labelEn: "Scroll↔Print Reflow · Style DNA" },
  { id: "fleetShield", labelKo: "스펙트럼 실드·2nd-Screen·Fleet 레이더", labelEn: "Spectral Shield · 2nd-Screen · Fleet" },
  { id: "collabKmSafeZone", labelKo: "광학 혼색 델타·오프라인 메시", labelEn: "KM Delta Sync · Offline Safe-Zone" },
  { id: "rightsWatermark", labelKo: "C2PA 정산·적응형 AI 워터마크", labelEn: "C2PA Royalty · Adaptive Watermark" },
  { id: "streamingBudget", labelKo: "60fps 동적 스트리밍 출고 예산", labelEn: "60fps Streaming Export Budgeter" },
  { id: "autoStyleDna", labelKo: "자동 화풍 DNA·대본3D·심의", labelEn: "Auto Style DNA · Script-to-3D · Rating" },
  { id: "styleShaderPack", labelKo: "팀 화풍·WGSL 팩 서명 교환 (.tspack)", labelEn: "Team Style & WGSL Pack (.tspack)" },
  { id: "episodeColorScript", labelKo: "60컷 OKLCH 컬러스크립트 조화", labelEn: "60-Cut OKLCH Color Script" },
  { id: "webcodecsOpfs", labelKo: "WebCodecs 4K·희소 타일·OPFS 버전", labelEn: "WebCodecs 4K · Sparse Tile · OPFS VCS" },
  { id: "aiLatentConti", labelKo: "화풍 DNA 일치화·대본 자동 콘티·브러시", labelEn: "Style DNA · Script-to-Conti · Smart Brush" },
  { id: "federatedLora", labelKo: "온디바이스 LoRA 연합학습·시맨틱 LOD", labelEn: "On-Device Federated LoRA · Semantic LOD" },
  { id: "monetizationPlan", labelKo: "유료전환·굿즈 BEP·3.3% 정산·번아웃", labelEn: "Paywall Funnel · Goods BEP · Burnout" },
  { id: "offlineResilience", labelKo: "오프라인 CRDT·OPFS 패리티·멀티탭 잠금", labelEn: "Offline CRDT · OPFS Parity · Tab Lease" },
  { id: "perfDoctor", labelKo: "120Hz 프레임타임·VRAM·OPFS 닥터", labelEn: "120Hz Frame Profiler · VRAM · OPFS Doctor" },
  { id: "craftLauncher", labelKo: "8대 아틀리에 프로 도구 퀵 런처", labelEn: "8-Station Atelier Craft Launcher" },
  { id: "assistHandoff", labelKo: "어시스턴트 분업 인수인계·레이어 검수·정산 추정", labelEn: "Assistant Handoff · Layer QA · Payout Estimate" },
  { id: "pacingThumbLab", labelKo: "초반 3컷 대사 벽·썸네일 A/B 규칙 점검", labelEn: "Opening Hook · Dialogue Wall · Thumbnail A/B" },
  { id: "globalIpPitch", labelKo: "글로벌 IP·OTT·출판 12장 피칭 바이블", labelEn: "Global IP · OTT · 12-Slide Pitch Bible" },
  { id: "proDigitizerHid", labelKo: "와콤·애플펜슬 프로·S펜·HID 캘리브레이터", labelEn: "Pro Digitizer · Stylus · USB HID Calibrator" },
  { id: "spatialWearable", labelKo: "비전 프로·스마트 글래스·워치 멀티기기 작업실", labelEn: "Vision Pro · Smart Glasses · Watch Deck" },
  { id: "focusPanHaptic", labelKo: "작업 리듬 코치·확대 포커스 패닝·펜촉 햅틱", labelEn: "Work Rhythm · Focus Auto-Pan · Nib Haptics" },
  { id: "adaptiveCalmGuard", labelKo: "문맥 UI 단순화·스마트 스태킹·기기 메모리 가드", labelEn: "Adaptive Calm UI · Smart Stack · Memory Guard" },
];

function EcosystemIcon({ id }: { readonly id: EcosystemTabId }) {
  switch (id) {
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
    case "federatedLora":
      return <Cpu size={15} aria-hidden="true" />;
    case "monetizationPlan":
      return <Calculator size={15} aria-hidden="true" />;
    case "offlineResilience":
      return <Database size={15} aria-hidden="true" />;
    case "perfDoctor":
      return <Activity size={15} aria-hidden="true" />;
    case "craftLauncher":
      return <Compass size={15} aria-hidden="true" />;
    case "assistHandoff":
      return <ClipboardCheck size={15} aria-hidden="true" />;
    case "pacingThumbLab":
      return <BarChart3 size={15} aria-hidden="true" />;
    case "globalIpPitch":
      return <Presentation size={15} aria-hidden="true" />;
    case "proDigitizerHid":
      return <PenTool size={15} aria-hidden="true" />;
    case "spatialWearable":
      return <Glasses size={15} aria-hidden="true" />;
    case "focusPanHaptic":
      return <Focus size={15} aria-hidden="true" />;
    case "adaptiveCalmGuard":
      return <SlidersHorizontal size={15} aria-hidden="true" />;
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
      <div role="tablist" aria-label={isEn ? "Ecosystem workflow modules" : "생태계 워크플로우 선택"} className="flex flex-wrap gap-2">
        {ECOSYSTEM_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none ${
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
              }`}
            >
              <EcosystemIcon id={tab.id} />
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

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
          {active === "federatedLora" ? <LazyStudioFederatedLoraStreamPanel /> : null}
          {active === "monetizationPlan" ? <LazyStudioCreatorMonetizationPanel /> : null}
          {active === "offlineResilience" ? <LazyStudioOfflineResiliencePanel /> : null}
          {active === "perfDoctor" ? <LazyStudioPerfDoctorPanel /> : null}
          {active === "craftLauncher" ? <LazyStudioAtelierCraftLauncherPanel /> : null}
          {active === "assistHandoff" ? <LazyStudioAssistantHandoffKitPanel /> : null}
          {active === "pacingThumbLab" ? <LazyStudioEpisodePacingThumbnailPanel /> : null}
          {active === "globalIpPitch" ? <LazyStudioGlobalIpPitchPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "proDigitizerHid" ? <LazyStudioProDigitizerCalibratorPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "spatialWearable" ? <LazyStudioSpatialWearablePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "focusPanHaptic" ? <LazyStudioFocusPanHapticPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "adaptiveCalmGuard" ? <LazyStudioAdaptiveCalmGuardPanel locale={isEn ? "en" : "ko"} /> : null}
        </Suspense>
      </div>

      <details className="rounded-xl border border-line bg-panel p-2.5">
        <summary className="cursor-pointer select-none text-xs font-semibold text-fg [word-break:keep-all]">
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
