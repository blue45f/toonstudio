import { Brush, Camera, Hand, Layers, Move, ShieldCheck, Sun, Sunrise, UserSquare2, Volume2, Wand2, Watch, Zap } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

const LazyPuppetWarpStudioPanel = lazy(() =>
  import("../csp-puppet-warp/PuppetWarpStudioPanel").then((m) => ({
    default: m.PuppetWarpStudioPanel,
  })),
);
const LazyModel3dSurfacePaintPanel = lazy(() =>
  import("../model3d-surface-paint/Model3dSurfacePaintPanel").then((m) => ({
    default: m.Model3dSurfacePaintPanel,
  })),
);
const LazyModel3dHandCustomizerPanel = lazy(() =>
  import("../model3d-hand-customizer/Model3dHandCustomizerPanel").then((m) => ({
    default: m.Model3dHandCustomizerPanel,
  })),
);
const LazyCspWatermarkVelocityPanel = lazy(() =>
  import("../csp-watermark-velocity/CspWatermarkVelocityPanel").then((m) => ({
    default: m.CspWatermarkVelocityPanel,
  })),
);
const LazyProCommercialPanel = lazy(async () => {
  await import("../pro-commercial-suite");
  const m = await import("../pro-commercial-suite/StudioProCommercialPanel");
  return { default: m.StudioProCommercialPanel };
});
const LazyCharlabCspSurpassPanel = lazy(async () => {
  await import("../charlab-csp-surpass");
  const m = await import("../charlab-csp-surpass/StudioCharlabCspSurpassPanel");
  return { default: m.StudioCharlabCspSurpassPanel };
});
const LazyP3ColorLightingPanel = lazy(async () => {
  await import("../p3-color-dynamic-lighting");
  const m = await import("../p3-color-dynamic-lighting/StudioP3ColorLightingPanel");
  return { default: m.StudioP3ColorLightingPanel };
});
const LazyNeuralUpscaleTexturesPanel = lazy(async () => {
  await import("../neural-upscale-textures");
  const m = await import("../neural-upscale-textures/StudioNeuralUpscaleTexturesPanel");
  return { default: m.StudioNeuralUpscaleTexturesPanel };
});
const LazyCinematographyDirectorPanel = lazy(async () => {
  await import("../webtoon-cinematography-director");
  const m = await import("../webtoon-cinematography-director/StudioCinematographyDirectorPanel");
  return { default: m.StudioCinematographyDirectorPanel };
});
const LazyStudio3dLightingRigPanel = lazy(async () => {
  await import("../studio-3d-lighting-rig");
  const m = await import("../studio-3d-lighting-rig/Studio3dLightingRigPanel");
  return { default: m.Studio3dLightingRigPanel };
});
const LazyStudioActionFxLabPanel = lazy(async () => {
  await import("../action-fx-procedural-lab");
  const m = await import("../action-fx-procedural-lab/StudioActionFxLabPanel");
  return { default: m.StudioActionFxLabPanel };
});
const LazyStudioAtelierFoleyMixerPanel = lazy(async () => {
  await import("../atelier-foley-mixer");
  const m = await import("../atelier-foley-mixer/StudioAtelierFoleyMixerPanel");
  return { default: m.StudioAtelierFoleyMixerPanel };
});
const LazyStudioCharacterSheetBiblePanel = lazy(async () => {
  await import("../character-sheet-bible-studio");
  const m = await import("../character-sheet-bible-studio/StudioCharacterSheetBiblePanel");
  return { default: m.StudioCharacterSheetBiblePanel };
});

type Csp3dTabId =
  | "puppet"
  | "surface3d"
  | "hand3d"
  | "watermark"
  | "commercialPro"
  | "charlabCsp"
  | "p3ColorLight"
  | "neuralUpscale"
  | "cinematographyDir"
  | "lightingRig3d"
  | "actionFxLab"
  | "foleyMixer"
  | "charSheetBible";

const CSP3D_TABS: readonly {
  readonly id: Csp3dTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "puppet", labelKo: "2D 퍼펫 변형 (MLS 강체)", labelEn: "2D Puppet Warp (MLS)" },
  { id: "surface3d", labelKo: "3D 표면 직접 페인팅·4층 UV", labelEn: "3D Surface Paint · 4-Layer UV" },
  { id: "hand3d", labelKo: "15관절 3D 손·가중치·STL·LOD", labelEn: "15-Joint 3D Hand · Weights · STL · LOD" },
  { id: "watermark", labelKo: "비가시 워터마크·속도곡선·경계블러", labelEn: "Anti-AI Watermark · Velocity · Safe Blur" },
  { id: "commercialPro", labelKo: "상업 연재 8대 엔진 (3층 리라이트·컷돌파·굿즈·매크로)", labelEn: "Pro Commercial 8-Suite (Relight · Breakout · Goods · Macro)" },
  { id: "charlabCsp", labelKo: "캐릭터 라이브 링크·벡터 지우개·QuickShape·수채화·워치", labelEn: "Char Live Link · Vector Eraser · QuickShape · Watch" },
  { id: "p3ColorLight", labelKo: "Display-P3 광색역·CMYK·실시간 다중 동적 조명", labelEn: "Display-P3 Gamut · CMYK · Dynamic Lighting" },
  { id: "neuralUpscale", labelKo: "2×/4× 엣지 업스케일러·6종 절차 PBR 텍스처", labelEn: "2x/4x Edge Upscaler · 6 Seamless PBR Textures" },
  { id: "cinematographyDir", labelKo: "3D 시네마토그래피·180도 법칙·세로 시선 유도", labelEn: "3D Cinematography · 180° Rule · Eye-Flow" },
  { id: "lightingRig3d", labelKo: "서울 물리 하늘·3점 조명 릭·그림자 캐처", labelEn: "Seoul Physical Sky · 3-Point Rig · Shadow Catcher" },
  { id: "actionFxLab", labelKo: "웹툰 6종 액션·마법진·로맨스 벡터 FX 랩", labelEn: "6-Preset Action & Romance Vector FX Lab" },
  { id: "foleyMixer", labelKo: "화실 물리 사운드(Foley)·-24 LUFS 공간 음향 믹서", labelEn: "Atelier Physical Foley · -24 LUFS Acoustic Mixer" },
  { id: "charSheetBible", labelKo: "캐릭터 설정집·표정 9궁도·의상 5슬롯 조판", labelEn: "Character Sheet Bible · 9-Expression · 5-Outfit" },
];

const STUDIO_CRAFT_VISUAL_CARDS: readonly {
  readonly id: string;
  readonly src: string;
  readonly titleKo: string;
  readonly titleEn: string;
}[] = [
  { id: "relight", src: "/assets/atelier/studio-craft/studio-relight-triptych.webp", titleKo: "비파괴 3층 리라이트", titleEn: "3-Layer Relight" },
  { id: "breakout", src: "/assets/atelier/studio-craft/studio-panel-breakout.webp", titleKo: "컷 밖 돌파 마스킹", titleEn: "Out-of-Panel Breakout" },
  { id: "goods", src: "/assets/atelier/studio-craft/studio-goods-standee.webp", titleKo: "굿즈·아크릴 칼선", titleEn: "Goods Die-Cut" },
  { id: "scroll", src: "/assets/atelier/studio-craft/studio-storyboard-scroll.webp", titleKo: "9:16 스크롤 콘티", titleEn: "9:16 Scroll Storyboard" },
  { id: "height", src: "/assets/atelier/studio-craft/craft-height-turntable.webp", titleKo: "cm 키 비율 자동 맞춤", titleEn: "Metric Height Scale" },
  { id: "watercolor", src: "/assets/atelier/studio-craft/craft-gravity-watercolor.webp", titleKo: "기울기 중력 수채화", titleEn: "Tilt Gravity Watercolor" },
  { id: "watch", src: "/assets/atelier/studio-craft/craft-smartwatch-dial.webp", titleKo: "스마트워치 크라운 다이얼", titleEn: "SmartWatch Dial" },
  { id: "lt", src: "/assets/atelier/studio-craft/craft-lt-courtyard-tone.webp", titleKo: "3D LT 선화·스크린톤", titleEn: "3D LT Line & Screentone" },
];

function Csp3dIcon({ id }: { readonly id: Csp3dTabId }) {
  switch (id) {
    case "puppet":
      return <Move size={15} aria-hidden="true" />;
    case "surface3d":
      return <Brush size={15} aria-hidden="true" />;
    case "hand3d":
      return <Hand size={15} aria-hidden="true" />;
    case "watermark":
      return <ShieldCheck size={15} aria-hidden="true" />;
    case "commercialPro":
      return <Layers size={15} aria-hidden="true" />;
    case "charlabCsp":
      return <Watch size={15} aria-hidden="true" />;
    case "p3ColorLight":
      return <Sun size={15} aria-hidden="true" />;
    case "neuralUpscale":
      return <Wand2 size={15} aria-hidden="true" />;
    case "cinematographyDir":
      return <Camera size={15} aria-hidden="true" />;
    case "lightingRig3d":
      return <Sunrise size={15} aria-hidden="true" />;
    case "actionFxLab":
      return <Zap size={15} aria-hidden="true" />;
    case "foleyMixer":
      return <Volume2 size={15} aria-hidden="true" />;
    case "charSheetBible":
      return <UserSquare2 size={15} aria-hidden="true" />;
  }
}

export function Csp3dUpgradeHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<Csp3dTabId>("puppet");

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "CSP 4.0-5.0 and High-Craft 3D Customizer Hub" : "클립스튜디오 4.0~5.0 내재화 및 고품질 3D 커스텀 허브"}
      data-testid="csp-3d-upgrade-hub-panel"
    >
      <div role="tablist" aria-label={isEn ? "CSP 4-5 and 3D customizer engines" : "CSP 4~5 및 3D 커스텀 엔진 선택"} className="flex flex-wrap gap-2">
        {CSP3D_TABS.map((tab) => {
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
              <Csp3dIcon id={tab.id} />
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-fg-2">
              {isEn ? "Loading 3D & CSP Pro studio engine..." : "3D 커스텀·CSP 프로 엔진을 불러오는 중입니다…"}
            </p>
          }
        >
          {active === "puppet" ? <LazyPuppetWarpStudioPanel /> : null}
          {active === "surface3d" ? <LazyModel3dSurfacePaintPanel /> : null}
          {active === "hand3d" ? <LazyModel3dHandCustomizerPanel /> : null}
          {active === "watermark" ? <LazyCspWatermarkVelocityPanel /> : null}
          {active === "commercialPro" ? <LazyProCommercialPanel /> : null}
          {active === "charlabCsp" ? <LazyCharlabCspSurpassPanel /> : null}
          {active === "p3ColorLight" ? <LazyP3ColorLightingPanel /> : null}
          {active === "neuralUpscale" ? <LazyNeuralUpscaleTexturesPanel /> : null}
          {active === "cinematographyDir" ? <LazyCinematographyDirectorPanel /> : null}
          {active === "lightingRig3d" ? <LazyStudio3dLightingRigPanel /> : null}
          {active === "actionFxLab" ? <LazyStudioActionFxLabPanel /> : null}
          {active === "foleyMixer" ? <LazyStudioAtelierFoleyMixerPanel /> : null}
          {active === "charSheetBible" ? <LazyStudioCharacterSheetBiblePanel /> : null}
        </Suspense>
      </div>

      <details className="rounded-xl border border-line bg-panel p-2.5">
        <summary className="cursor-pointer select-none text-xs font-semibold text-fg [word-break:keep-all]">
          {isEn
            ? `Atelier Craft & Commercial Studio Visual Gallery (${STUDIO_CRAFT_VISUAL_CARDS.length})`
            : `상업 연재·크래프트 아틀리에 비주얼 카드 (${STUDIO_CRAFT_VISUAL_CARDS.length}종)`}
        </summary>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STUDIO_CRAFT_VISUAL_CARDS.map((card) => (
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
