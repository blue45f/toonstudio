import { Bot, Camera, CheckCircle2, Clapperboard, Compass, Eye, Gauge, Glasses, MessageSquareText, Music, Package, PenTool, Smartphone, UserCheck } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { StudioHubCalmTabNavigator } from "./StudioHubCalmTabNavigator";

const LazyStudioCreatorCalibratorPanel = lazy(() =>
  import("../creator-experience-calibrator/StudioCreatorCalibratorPanel").then((m) => ({
    default: m.StudioCreatorCalibratorPanel,
  })),
);
const LazyStudioSignatureWebtoonLabPanel = lazy(() =>
  import("../webtoon-signature-lab/StudioSignatureWebtoonLabPanel").then((m) => ({
    default: m.StudioSignatureWebtoonLabPanel,
  })),
);
const LazyStudioProductionGoodsPanel = lazy(() =>
  import("../webtoon-production-goods/StudioProductionGoodsPanel").then((m) => ({
    default: m.StudioProductionGoodsPanel,
  })),
);
const LazyStudioRetentionBgmAcademyPanel = lazy(() =>
  import("../webtoon-retention-bgm/StudioRetentionBgmAcademyPanel").then((m) => ({
    default: m.StudioRetentionBgmAcademyPanel,
  })),
);
const LazyStudioStylusDigitizerPanel = lazy(() =>
  import("../stylus-digitizer-pro/StudioStylusDigitizerPanel").then((m) => ({
    default: m.StudioStylusDigitizerPanel,
  })),
);
const LazyStudioSpatialDeviceHubPanel = lazy(() =>
  import("../spatial-device-hub/StudioSpatialDeviceHubPanel").then((m) => ({
    default: m.StudioSpatialDeviceHubPanel,
  })),
);
const LazyStudioAppleGalaxyHardwarePanel = lazy(() =>
  import("../apple-galaxy-hardware/StudioAppleGalaxyHardwarePanel").then((m) => ({
    default: m.StudioAppleGalaxyHardwarePanel,
  })),
);
const LazyStudioLocalCreatorCopilotPanel = lazy(async () => {
  await import("../local-creator-copilot");
  const m = await import("../local-creator-copilot/StudioLocalCreatorCopilotPanel");
  return { default: m.StudioLocalCreatorCopilotPanel };
});
const LazyStudioVrmNaturalRigPanel = lazy(async () => {
  await import("../vrm-natural-rig");
  const m = await import("../vrm-natural-rig/StudioVrmNaturalRigPanel");
  return { default: m.StudioVrmNaturalRigPanel };
});
const LazyStudioWebtoonContinuityGuardPanel = lazy(async () => {
  await import("../webtoon-continuity-guard");
  const m = await import("../webtoon-continuity-guard/StudioWebtoonContinuityGuardPanel");
  return { default: m.StudioWebtoonContinuityGuardPanel };
});
const LazyStudioSketchTo3dStagePanel = lazy(async () => {
  await import("../sketch-to-3d-stage");
  const m = await import("../sketch-to-3d-stage/StudioSketchTo3dStagePanel");
  return { default: m.StudioSketchTo3dStagePanel };
});
const LazyStudioCutRhythmPromoDirectorPanel = lazy(async () => {
  await import("../cut-rhythm-promo-director");
  const m = await import("../cut-rhythm-promo-director/StudioCutRhythmPromoDirectorPanel");
  return { default: m.StudioCutRhythmPromoDirectorPanel };
});
const LazyStudioVoiceToBalloonPanel = lazy(async () => {
  await import("../voice-to-balloon-layout");
  const m = await import("../voice-to-balloon-layout/StudioVoiceToBalloonPanel");
  return { default: m.StudioVoiceToBalloonPanel };
});
const LazyStudioCameraLensBlockingPanel = lazy(async () => {
  await import("../camera-lens-blocking-director");
  const m = await import("../camera-lens-blocking-director/StudioCameraLensBlockingPanel");
  return { default: m.StudioCameraLensBlockingPanel };
});
const LazyStudioSpatialStagePanel = lazy(async () => {
  await import("../virtual-space-spatial");
  const m = await import("../virtual-space-spatial/StudioSpatialStagePanel");
  return { default: m.StudioSpatialStagePanel };
});
const LazyStudioCanvasOrbitalUxPanel = lazy(async () => {
  await import("../canvas-orbital-ux");
  const m = await import("../canvas-orbital-ux/StudioCanvasOrbitalUxPanel");
  return { default: m.StudioCanvasOrbitalUxPanel };
});
const LazyStudioFeatureAtlasPanel = lazy(async () => {
  await import("../studio-feature-atlas");
  const m = await import("../studio-feature-atlas/StudioFeatureAtlasPanel");
  return { default: m.StudioFeatureAtlasPanel };
});
const LazyStudioHandcraftedAtelierPanel = lazy(async () => {
  await import("../handcrafted-atelier-feel");
  const m = await import("../handcrafted-atelier-feel/StudioHandcraftedAtelierPanel");
  return { default: m.StudioHandcraftedAtelierPanel };
});
const LazyStudioOnboardingDioramaPanel = lazy(async () => {
  await import("../onboarding-diorama-craft");
  const m = await import("../onboarding-diorama-craft/StudioOnboardingDioramaPanel");
  return { default: m.StudioOnboardingDioramaPanel };
});

const LazyPerfDoctorPanel = lazy(async () => {
  await import("../studio-perf-doctor");
  const m = await import("../studio-perf-doctor/StudioPerfDoctorPanel");
  return { default: m.StudioPerfDoctorPanel };
});
const LazyErgonomicsPanel = lazy(async () => {
  await import("../ergonomics-shortcut-master");
  const m = await import("../ergonomics-shortcut-master/StudioErgonomicsMasterPanel");
  return { default: m.StudioErgonomicsMasterPanel };
});

const LazyCraftLauncherPanel = lazy(async () => {
  await import("../atelier-craft-launcher");
  const m = await import("../atelier-craft-launcher/StudioAtelierCraftLauncherPanel");
  return { default: m.StudioAtelierCraftLauncherPanel };
});
const LazyAtelierFoleyMixerPanel = lazy(async () => {
  await import("../atelier-foley-mixer");
  const m = await import("../atelier-foley-mixer/StudioAtelierFoleyMixerPanel");
  return { default: m.StudioAtelierFoleyMixerPanel };
});

const LazyStudioFocusPanHapticPanel = lazy(() =>
  import("../focus-pan-haptic-studio").then((module) => ({ default: module.StudioFocusPanHapticPanel })),
);

const LazyStudioAdaptiveCalmGuardPanel = lazy(() =>
  import("../adaptive-calm-stack-guard").then((module) => ({ default: module.StudioAdaptiveCalmGuardPanel })),
);

const LazyStudioStylusNeuralCompensationPanel = lazy(() =>
  import("../stylus-neural-compensation").then((module) => ({ default: module.StudioStylusNeuralCompensationPanel })),
);

const LazyStudioCalmIntentUxPanel = lazy(() =>
  import("../calm-intent-ux-orchestrator").then((module) => ({ default: module.StudioCalmIntentUxPanel })),
);

const LazyStudioOneshotCutDirectorPanel = lazy(() =>
  import("../oneshot-cut-director").then((module) => ({ default: module.StudioOneshotCutDirectorPanel })),
);

const LazyStudioImmersiveFeedbackHudPanel = lazy(() =>
  import("../atelier-tactile-feedback").then((module) => ({ default: module.StudioImmersiveFeedbackHudPanel })),
);
const LazyStudioAtelierVisualSignaturePanel = lazy(() =>
  import("../atelier-visual-signature").then((module) => ({ default: module.StudioAtelierVisualSignaturePanel })),
);
const LazyStudioMobileThumbzonePanel = lazy(() =>
  import("../mobile-thumbzone-studio-ux").then((module) => ({ default: module.StudioMobileThumbzonePanel })),
);
const LazyStudioAtelierBrandRegistryPanel = lazy(() =>
  import("../atelier-brand-registry").then((module) => ({ default: module.StudioAtelierBrandRegistryPanel })),
);

type CreatorLabTabId =
  | "calibrator"
  | "signatureLab"
  | "productionGoods"
  | "retentionBgm"
  | "stylusHardware"
  | "spatialDevices"
  | "appleGalaxyHw"
  | "localCopilot"
  | "vrmNaturalRig"
  | "continuityGuard"
  | "sketchTo3d"
  | "cutRhythmPromo"
  | "voiceBalloon"
  | "cameraLensBlocking"
  | "spatialStage"
  | "canvasOrbitalUx"
  | "featureAtlas"
  | "handcraftedAtelier"
  | "onboardingDiorama"
  | "perfDoctor"
  | "ergonomics"
  | "craftLauncher"
  | "atelierFoley"
  | "focusHaptics"
  | "adaptiveCalm"
  | "stylusCompensation"
  | "calmIntentExample"
  | "oneshotCutDirector"
  | "immersiveFeedbackPreview"
  | "visualSignaturePreview"
  | "mobileThumbzonePreview"
  | "brandRegistryAudit";

const CREATOR_LAB_TABS: readonly {
  readonly id: CreatorLabTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "calibrator", labelKo: "4분할 색역 ΔE·필압·360px 스크롤", labelEn: "4-Way Gamut · Pressure · 360px Scroll" },
  { id: "signatureLab", labelKo: "시선 히트맵·OKLCH 리라이팅·자석", labelEn: "Eye-Flow · OKLCH Relight · Magnetic" },
  { id: "productionGoods", labelKo: "캐릭터 도크·액션FX·워룸·굿즈 칼선", labelEn: "Ref Dock · Action FX · War-Room · Goods" },
  { id: "retentionBgm", labelKo: "1~5화 이탈·BGM 큐·1획 복원·첨삭", labelEn: "Retention · BGM Cue · Crash · Redpen" },
  { id: "stylusHardware", labelKo: "태블릿·디지타이저 7대 하드웨어", labelEn: "Tablet & Digitizer 7-Hardware" },
  { id: "spatialDevices", labelKo: "Mac/iPad·워치·AR 글래스·VR 스카우팅", labelEn: "Mac/iPad · Watch · AR/VR Scouting" },
  { id: "appleGalaxyHw", labelKo: "Apple·Galaxy 특화·3D 충돌·MIDI/페달", labelEn: "Apple · Galaxy · 3D Collision · MIDI" },
  { id: "localCopilot", labelKo: "온디바이스 로컬 습관 비서", labelEn: "On-Device Local Habit Copilot" },
  { id: "vrmNaturalRig", labelKo: "3D 쇄골·시선·소품 자연 리깅", labelEn: "3D Natural Pose & Prop Rig" },
  { id: "continuityGuard", labelKo: "60컷 자동 연속성 감시관", labelEn: "60-Cut Continuity Guard" },
  { id: "sketchTo3d", labelKo: "2D 러프 → 3D 포즈·화각·조명", labelEn: "Sketch-to-3D Stage Solver" },
  { id: "cutRhythmPromo", labelKo: "컷 리듬 → 2.5D 무빙툰·15초 프로모", labelEn: "Cut Rhythm → 2.5D Moving-Toon Promo" },
  { id: "voiceBalloon", labelKo: "음성 운율 → 말풍선 자동 조판", labelEn: "Voice Prosody → Speech Balloons" },
  { id: "cameraLensBlocking", labelKo: "3D 시네마 렌즈·180° 카메라 연출", labelEn: "3D Cinema Lens · 180° Blocking" },
  { id: "spatialStage", labelKo: "가상 스튜디오 3D HRTF·공간 라이트박스", labelEn: "Virtual Studio 3D HRTF · Spatial Desk" },
  { id: "canvasOrbitalUx", labelKo: "휠·명령 구성·기기 UX 예제", labelEn: "Wheel & Command Examples · Device UX" },
  { id: "featureAtlas", labelKo: "기능 안내·실습·계산 예제", labelEn: "Feature Guide · Walkthroughs · Computation Examples" },
  { id: "handcraftedAtelier", labelKo: "지터·관성·작업대 구성 예제", labelEn: "Jitter · Inertia · Workbench Examples" },
  { id: "onboardingDiorama", labelKo: "첫 컷 구성·창작자 설정 추천 예제", labelEn: "First-Cut Layout · Creator Setting Examples" },
  { id: "perfDoctor", labelKo: "성능 수치·설정 제안 예제", labelEn: "Performance Metrics · Setting Examples" },
  { id: "ergonomics", labelKo: "단축키·배치 제안 예제", labelEn: "Shortcut · Layout Examples" },
  { id: "craftLauncher", labelKo: "도구 탐색·작업 준비", labelEn: "Tool Finder · Work Preparation" },
  { id: "atelierFoley", labelKo: "작업실 음향·웹 오디오", labelEn: "Atelier Sound · Web Audio" },
  { id: "focusHaptics", labelKo: "집중·화면 이동·햅틱 예제", labelEn: "Focus · View Movement · Haptic Examples" },
  { id: "adaptiveCalm", labelKo: "작업 도구 배치·기기 예산 예제", labelEn: "Tool Layout · Device Budget Examples" },
  { id: "stylusCompensation", labelKo: "필압 곡선과 획 보정 예제", labelEn: "Pressure Curve and Stroke Compensation Examples" },
  { id: "calmIntentExample", labelKo: "도구 배치와 색상 대비 예제", labelEn: "Tool Layout and Palette Contrast Examples" },
  { id: "oneshotCutDirector", labelKo: "컷 구도와 대사 배치 예제", labelEn: "Panel Framing and Dialogue Layout Examples" },
  { id: "immersiveFeedbackPreview", labelKo: "몰입 화면과 획 피드백 미리보기", labelEn: "Immersive Canvas and Stroke Feedback Preview" },
  { id: "visualSignaturePreview", labelKo: "작업대 색상과 다이얼 미리보기", labelEn: "Workbench Colors and Dial Preview" },
  { id: "mobileThumbzonePreview", labelKo: "한 손 모바일 도구 배치 미리보기", labelEn: "One-Handed Mobile Tool Layout Preview" },
  { id: "brandRegistryAudit", labelKo: "브랜드 이름 검사", labelEn: "Brand Name Audit" },
];

const CREATOR_LAB_PINNED_TABS: readonly CreatorLabTabId[] = [
  "calibrator",
  "signatureLab",
  "stylusHardware",
  "sketchTo3d",
  "voiceBalloon",
  "craftLauncher",
];

function CreatorLabIcon({ id }: { readonly id: CreatorLabTabId }) {
  switch (id) {
    case "immersiveFeedbackPreview":
      return <PenTool size={15} aria-hidden="true" />;
    case "visualSignaturePreview":
      return <Eye size={15} aria-hidden="true" />;
    case "mobileThumbzonePreview":
      return <Smartphone size={15} aria-hidden="true" />;
    case "brandRegistryAudit":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "oneshotCutDirector":
      return <Clapperboard size={15} aria-hidden="true" />;
    case "calmIntentExample":
      return <Compass size={15} aria-hidden="true" />;
    case "stylusCompensation":
      return <PenTool size={15} aria-hidden="true" />;
    case "adaptiveCalm":
      return <Compass size={15} aria-hidden="true" />;
    case "focusHaptics":
      return <Gauge size={15} aria-hidden="true" />;
    case "craftLauncher":
      return <Compass size={15} aria-hidden="true" />;
    case "atelierFoley":
      return <Music size={15} aria-hidden="true" />;
    case "calibrator":
      return <Gauge size={15} aria-hidden="true" />;
    case "signatureLab":
      return <Eye size={15} aria-hidden="true" />;
    case "productionGoods":
      return <Package size={15} aria-hidden="true" />;
    case "retentionBgm":
      return <Music size={15} aria-hidden="true" />;
    case "stylusHardware":
      return <PenTool size={15} aria-hidden="true" />;
    case "spatialDevices":
      return <Glasses size={15} aria-hidden="true" />;
    case "appleGalaxyHw":
      return <Smartphone size={15} aria-hidden="true" />;
    case "localCopilot":
      return <Bot size={15} aria-hidden="true" />;
    case "vrmNaturalRig":
      return <UserCheck size={15} aria-hidden="true" />;
    case "continuityGuard":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "sketchTo3d":
      return <Camera size={15} aria-hidden="true" />;
    case "cutRhythmPromo":
      return <Clapperboard size={15} aria-hidden="true" />;
    case "voiceBalloon":
      return <MessageSquareText size={15} aria-hidden="true" />;
    case "cameraLensBlocking":
      return <Compass size={15} aria-hidden="true" />;
    case "spatialStage":
      return <Music size={15} aria-hidden="true" />;
    case "canvasOrbitalUx":
      return <Compass size={15} aria-hidden="true" />;
    case "featureAtlas":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "handcraftedAtelier":
      return <PenTool size={15} aria-hidden="true" />;
    case "perfDoctor":
      return <Gauge size={15} aria-hidden="true" />;
    case "ergonomics":
      return <UserCheck size={15} aria-hidden="true" />;
    case "onboardingDiorama":
      return <Camera size={15} aria-hidden="true" />;
  }
}

export function CreatorLabHardwareHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<CreatorLabTabId>("calibrator");

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "Creator Calibration, Signature Webtoon Lab, and Hardware Hub" : "창작자 캘리브레이터 · 웹툰 시그니처 랩 · 주변기기 허브"}
      data-testid="creator-lab-hardware-hub"
    >
      <StudioHubCalmTabNavigator
        baseId={baseId}
        ariaLabel={isEn ? "Creator lab modules" : "창작 랩 및 하드웨어 모듈 선택"}
        tabs={CREATOR_LAB_TABS}
        pinnedIds={CREATOR_LAB_PINNED_TABS}
        activeId={active}
        onSelect={setActive}
        renderIcon={(id) => <CreatorLabIcon id={id} />}
        isEn={isEn}
        searchPlaceholderKo="필압, 색역, 태블릿, 3D 포즈, 음향, 단축키 등으로 검색…"
        searchPlaceholderEn="Search pressure, gamut, tablet, 3D pose, audio, shortcuts…"
      />

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-fg-2">
              {isEn ? "Loading creator lab module..." : "창작자 캘리브레이션·하드웨어 랩을 불러오는 중입니다…"}
            </p>
          }
        >
          {active === "calibrator" ? <LazyStudioCreatorCalibratorPanel /> : null}
          {active === "signatureLab" ? <LazyStudioSignatureWebtoonLabPanel /> : null}
          {active === "productionGoods" ? <LazyStudioProductionGoodsPanel /> : null}
          {active === "retentionBgm" ? <LazyStudioRetentionBgmAcademyPanel /> : null}
          {active === "stylusHardware" ? <LazyStudioStylusDigitizerPanel /> : null}
          {active === "spatialDevices" ? <LazyStudioSpatialDeviceHubPanel /> : null}
          {active === "appleGalaxyHw" ? <LazyStudioAppleGalaxyHardwarePanel /> : null}
          {active === "localCopilot" ? <LazyStudioLocalCreatorCopilotPanel /> : null}
          {active === "vrmNaturalRig" ? <LazyStudioVrmNaturalRigPanel /> : null}
          {active === "continuityGuard" ? <LazyStudioWebtoonContinuityGuardPanel /> : null}
          {active === "sketchTo3d" ? <LazyStudioSketchTo3dStagePanel /> : null}
          {active === "cutRhythmPromo" ? <LazyStudioCutRhythmPromoDirectorPanel /> : null}
          {active === "voiceBalloon" ? <LazyStudioVoiceToBalloonPanel /> : null}
          {active === "cameraLensBlocking" ? <LazyStudioCameraLensBlockingPanel /> : null}
          {active === "spatialStage" ? <LazyStudioSpatialStagePanel /> : null}
          {active === "canvasOrbitalUx" ? <LazyStudioCanvasOrbitalUxPanel /> : null}
          {active === "featureAtlas" ? <LazyStudioFeatureAtlasPanel /> : null}
          {active === "handcraftedAtelier" ? <LazyStudioHandcraftedAtelierPanel /> : null}
          {active === "onboardingDiorama" ? <LazyStudioOnboardingDioramaPanel /> : null}
          {active === "perfDoctor" ? <LazyPerfDoctorPanel /> : null}
          {active === "ergonomics" ? <LazyErgonomicsPanel /> : null}
          {active === "craftLauncher" ? <LazyCraftLauncherPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "atelierFoley" ? <LazyAtelierFoleyMixerPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "focusHaptics" ? <LazyStudioFocusPanHapticPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "adaptiveCalm" ? <LazyStudioAdaptiveCalmGuardPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "stylusCompensation" ? <LazyStudioStylusNeuralCompensationPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "calmIntentExample" ? <LazyStudioCalmIntentUxPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "oneshotCutDirector" ? <LazyStudioOneshotCutDirectorPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "immersiveFeedbackPreview" ? <LazyStudioImmersiveFeedbackHudPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "visualSignaturePreview" ? <LazyStudioAtelierVisualSignaturePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "mobileThumbzonePreview" ? <LazyStudioMobileThumbzonePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "brandRegistryAudit" ? <LazyStudioAtelierBrandRegistryPanel locale={isEn ? "en" : "ko"} /> : null}
        </Suspense>
      </div>
    </section>
  );
}
