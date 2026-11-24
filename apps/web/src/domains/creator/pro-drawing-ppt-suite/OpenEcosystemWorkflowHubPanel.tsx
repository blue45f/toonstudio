import { BookOpen, Gauge, Globe, Link2, PackageCheck, Palette, Radio, Shield, ShieldCheck, Wand2, Workflow } from "lucide-react";
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
const LazyStudioStorySimulpubPanel = lazy(async () => {
  const m = await import("../story-simulpub-provenance");
  return { default: m.StudioStorySimulpubPanel };
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
  | "storySimulpub"
  | "aiLatentConti";

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
  { id: "webcodecsOpfs", labelKo: "코덱 지원 점검·희소 타일·OPFS 버전", labelEn: "Codec Support Probe · Sparse Tile · OPFS VCS" },
  { id: "aiLatentConti", labelKo: "색 변환 예제·대본 분석·브러시 추천", labelEn: "Color Example · Script Parser · Brush Suggestions" },
  { id: "storySimulpub", labelKo: "인과·리플로우·무결성 예제", labelEn: "Causality · Reflow · Integrity Examples" },
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
    case "storySimulpub":
      return <BookOpen size={15} aria-hidden="true" />;
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
          {active === "storySimulpub" ? <LazyStudioStorySimulpubPanel /> : null}
        </Suspense>
      </div>
    </section>
  );
}
