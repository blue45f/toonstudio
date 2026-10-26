/**
 * StudioArtCraftMultimodalAndDesktopPanel.tsx
 *
 * `ArtCraft.app` v0.41.0 (`ai.artcraft.app`, Learning Machines LLC `DJ6XS33FX8`) 멀티모달 AI 월드·3D·영상 라우터와
 * macOS 네이티브 데스크톱 `.app` 14종 심화 크레이트 엔진을 실시간 조작·검증하는 인터랙티브 패널.
 */

import { type KeyboardEvent, useId, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  evaluateDesignCraftMojikumiAndClut,
  evaluateFigCraftCollabAndCodeConnect,
  evaluateFilmAndEffectCraftBroadcastPipeline,
  evaluateLauncherNativeDaemonState,
  evaluateLightCraftCatalogAndGainMap,
  evaluateOfficeSuiteDesktopDeepFeatures,
  evaluatePdfCraftDocumentScannerAndFormCalc,
  evaluatePhotoCraftDesktopDeepPipeline,
  solveCadCraftLevenbergMarquardtAndDynBlock,
  type BroadcastVideoCodec,
} from "./artcraft-desktop-native-deep-engines";
import {
  ARTCRAFT_MULTIMODAL_STUDIO_041_SPEC,
  type ArtCraftAppCatalogEntry,
} from "./artcraft-launcher-security-catalog";
import {
  planCameraAngleImageEdit,
  planHunyuan3dMeshGeneration,
  planPromoVideoOmniRouter,
  planWorldLabsGaussianSplatPipeline,
  summarizeSqliteTaskQueueAndAutoDownload,
  type ArtCraftRouterSplatModel,
  type ArtCraftRouterVideoModel,
  type CommonVideoGenerationMode,
  type Hunyuan3dV3PolygonType,
} from "./artcraft-multimodal-world-studio-engine";

type MultimodalSubTab = "splat-world" | "hunyuan-3d" | "camera-angles" | "promo-video-router" | "desktop-deep";

const SUB_TABS: readonly {
  readonly id: MultimodalSubTab;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "splat-world", labelKo: "WorldLabs 3D 가우시안 스플랫 (.spz)", labelEn: "WorldLabs 3D Gaussian Splat (.spz)" },
  { id: "hunyuan-3d", labelKo: "Hunyuan3D v3 오브젝트 (.glb)", labelEn: "Hunyuan3D v3 Mesh (.glb)" },
  { id: "camera-angles", labelKo: "Flux 2 / Qwen 카메라 앵글 회전", labelEn: "Flux 2 / Qwen Camera Angle Edit" },
  { id: "promo-video-router", labelKo: "PV·트레일러 Omni 비디오 & SwitchX 리라이팅", labelEn: "PV Omni Video & SwitchX Relighting" },
  { id: "desktop-deep", labelKo: "macOS 데스크톱 .app 심화 크레이트 엔진", labelEn: "macOS Desktop .app Deep Engines" },
];

export function StudioArtCraftMultimodalAndDesktopPanel({
  activeApp,
}: {
  readonly activeApp: ArtCraftAppCatalogEntry;
}) {
  const bt = useBilingual("StudioArtCraftMultimodalAndDesktopPanel");
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [subTab, setSubTab] = useState<MultimodalSubTab>("splat-world");

  // 1. WorldLabs Marble 0.1 Splat 상태
  const [splatModel, setSplatModel] = useState<ArtCraftRouterSplatModel>("worldlabs_marble_0p1_plus");
  const [splatPrompt, setSplatPrompt] = useState("황혼이 내려앉은 고딕 시계탑 광장과 네온 간판 골목");

  // 2. Hunyuan3D v3 상태
  const [polygonType, setPolygonType] = useState<Hunyuan3dV3PolygonType>("quad");
  const [meshQuality, setMeshQuality] = useState<"draft" | "standard" | "high">("high");

  // 3. Camera Angle 상태
  const [yawDeg, setYawDeg] = useState(35);
  const [pitchDeg, setPitchDeg] = useState(-20);

  // 4. Promo Video Omni Router 상태
  const [videoModel, setVideoModel] = useState<ArtCraftRouterVideoModel>("veo_3p1");
  const [videoMode, setVideoMode] = useState<CommonVideoGenerationMode>("first-last-frame-to-video");
  const [videoDuration] = useState(8);
  const [switchxPreset, setSwitchxPreset] = useState<"cyberpunk-neon" | "golden-hour-sunset" | "moonlit-noir" | "studio-rim">("cyberpunk-neon");

  // 5. Desktop Deep Engine 상태
  const [broadcastCodec, setBroadcastCodec] = useState<BroadcastVideoCodec>("apv-422-10bit");
  const [lmStretchMm, setLmStretchMm] = useState(300);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % SUB_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + SUB_TABS.length) % SUB_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SUB_TABS.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const targetTab = SUB_TABS[nextIndex]!;
      setSubTab(targetTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const queueDigest = summarizeSqliteTaskQueueAndAutoDownload(
    [
      {
        taskId: "task-splat-01",
        provider: "worldlabs",
        modelType: splatModel,
        status: "completed",
        createdAtIso: "2026-10-26T15:00:00Z",
        resultUrls: ["https://cdn.artcraft.ai/splats/clocktower.spz"],
      },
      {
        taskId: "task-video-02",
        provider: "fal",
        modelType: videoModel,
        status: "pending",
        createdAtIso: "2026-10-26T15:02:00Z",
        resultUrls: [],
      },
    ],
    new Set(),
  );

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-artcraft-multimodal-desktop-panel"
      className="rounded-xl border border-line bg-panel/90 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/60 pb-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
              ArtCraft.app v{ARTCRAFT_MULTIMODAL_STUDIO_041_SPEC.version} ({ARTCRAFT_MULTIMODAL_STUDIO_041_SPEC.bundleId})
            </span>
            <span className="rounded bg-card px-2 py-0.5 font-mono text-[11px] text-fg-2">
              Team ID: {ARTCRAFT_MULTIMODAL_STUDIO_041_SPEC.teamIdentifier} · {ARTCRAFT_MULTIMODAL_STUDIO_041_SPEC.demangledSymbolCount.toLocaleString()} Rust Symbols
            </span>
          </div>
          <h3 id={headingId} className="mt-1 text-sm font-bold text-fg">
            {bt(
              "ArtCraft v0.41.0 멀티모달 AI 월드(3D Splat·메시·영상·앵글) & macOS 데스크톱 .app 심화 엔진",
              "ArtCraft v0.41.0 Multimodal AI World/3D/Video Router & macOS Desktop .app Deep Engines",
            )}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/showcase/promo"
            className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-fg hover:border-accent"
          >
            {bt("예고편·PV 제작 스튜디오 →", "Promo Trailer Studio →")}
          </Link>
          <Link
            href="/cuts/studio"
            className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-fg hover:border-accent"
          >
            {bt("숏폼 컷 스튜디오 연동 →", "Open Cuts Studio →")}
          </Link>
          <Link
            href="/promo-library"
            className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-fg hover:border-accent"
          >
            {bt("영상 홍보 허브 →", "Promo Video Hub →")}
          </Link>
        </div>
      </div>

      {/* 접근성 표준 준수 탭 리스트 (ArrowLeft/ArrowRight/Home/End 키보드 탐색 지원) */}
      <div
        role="tablist"
        aria-label={bt("ArtCraft v0.41.0 및 데스크톱 심화 엔진 탭", "ArtCraft v0.41.0 & Desktop Deep Engine Tabs")}
        className="flex flex-wrap gap-1.5"
      >
        {SUB_TABS.map((tab, idx) => {
          const active = subTab === tab.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              data-testid={`artcraft-multimodal-tab-${tab.id}`}
              onClick={() => setSubTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-accent text-canvas"
                  : "border border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              {bt(tab.labelKo, tab.labelEn)}
            </button>
          );
        })}
      </div>

      {/* 탭 패널 */}
      <div
        id={`${baseId}-panel-${subTab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${subTab}`}
        className="rounded-lg border border-line/60 bg-card p-3 text-xs"
      >
        {subTab === "splat-world" ? (
          (() => {
            const plan = planWorldLabsGaussianSplatPipeline({
              model: splatModel,
              sourcePrompt: splatPrompt,
              hasInputReferenceImage: true,
              enableRecaption2: true,
            });
            const selectId = `${baseId}-splat-model`;
            const promptId = `${baseId}-splat-prompt`;
            return (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="panel-splat-world">
                <div className="space-y-2">
                  <div>
                    <label htmlFor={selectId} className="block font-medium text-fg">
                      {bt("WorldLabs 가우시안 스플랫 모델", "WorldLabs Gaussian Splat Model")}
                    </label>
                    <select
                      id={selectId}
                      value={splatModel}
                      onChange={(e) => setSplatModel(e.target.value as ArtCraftRouterSplatModel)}
                      className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="worldlabs_marble_0p1_plus">Marble 0.1 Plus (2.4M Gaussians · 18.4MB .spz)</option>
                      <option value="worldlabs_marble_0p1_mini">Marble 0.1 Mini (850K Gaussians · 6.8MB .spz)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={promptId} className="block font-medium text-fg">
                      {bt("웹툰 3D 배경 월드 프롬프트 (Recaption2 확장)", "3D Background World Prompt (Recaption2)")}
                    </label>
                    <input
                      id={promptId}
                      type="text"
                      value={splatPrompt}
                      onChange={(e) => setSplatPrompt(e.target.value)}
                      className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                    />
                  </div>
                </div>
                <div className="rounded bg-panel p-2.5 font-mono space-y-1">
                  <div>RunGraph: {plan.imageInputObjectId} → {plan.panoObjectId} → {plan.worldObjectId}</div>
                  <div>Gaussians: {plan.estimatedGaussianCount.toLocaleString()} pts ({plan.spzCompressedMegabytes} MB .spz)</div>
                  <div className="truncate text-fg-2">{plan.recaptionedWorldPrompt}</div>
                  <div className="text-[11px] text-fg-3">
                    AutoDownload: {queueDigest.suggestedDownloadFilenames[0] ?? "none"}
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}

        {subTab === "hunyuan-3d" ? (
          (() => {
            const mesh = planHunyuan3dMeshGeneration({
              model: "hunyuan3d_v3_multi_function_object_gen",
              generateType: "multi-view-to-3d",
              polygonType,
              quality: meshQuality,
            });
            const polyId = `${baseId}-mesh-poly`;
            const qualId = `${baseId}-mesh-qual`;
            return (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="panel-hunyuan-3d">
                <div className="flex flex-wrap gap-2">
                  <div>
                    <label htmlFor={polyId} className="block font-medium text-fg">
                      {bt("폴리곤 토폴로지", "Polygon Topology")}
                    </label>
                    <select
                      id={polyId}
                      value={polygonType}
                      onChange={(e) => setPolygonType(e.target.value as Hunyuan3dV3PolygonType)}
                      className="mt-1 rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="quad">Quad (사각 메시 · 웹툰 펜선 추출 최적)</option>
                      <option value="triangle">Triangle (삼각 메시 · 실시간 엔진용)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={qualId} className="block font-medium text-fg">
                      {bt("메시 밀도 등급", "Mesh Quality")}
                    </label>
                    <select
                      id={qualId}
                      value={meshQuality}
                      onChange={(e) => setMeshQuality(e.target.value as "draft" | "standard" | "high")}
                      className="mt-1 rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="high">High (120,000 faces)</option>
                      <option value="standard">Standard (50,000 faces)</option>
                      <option value="draft">Draft (18,000 faces)</option>
                    </select>
                  </div>
                </div>
                <div className="rounded bg-panel p-2.5 font-mono space-y-1">
                  <div>GLB Asset: {mesh.outputGlbFilename}</div>
                  <div>Vertices: {mesh.vertexCount.toLocaleString()} · Faces: {mesh.faceCount.toLocaleString()}</div>
                  <div>PBR Maps: {mesh.pbrTextureMaps.join(", ")}</div>
                </div>
              </div>
            );
          })()
        ) : null}

        {subTab === "camera-angles" ? (
          (() => {
            const anglePlan = planCameraAngleImageEdit({
              model: "flux_2_lora_angles",
              referenceImageCount: 1,
              yawDeg,
              pitchDeg,
              numOutputs: 4,
            });
            const yawId = `${baseId}-angle-yaw`;
            const pitchId = `${baseId}-angle-pitch`;
            return (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="panel-camera-angles">
                <div className="space-y-2">
                  <div>
                    <label htmlFor={yawId} className="block font-medium text-fg">
                      Yaw (수평 회전): {yawDeg}°
                    </label>
                    <input
                      id={yawId}
                      type="range"
                      min={-180}
                      max={180}
                      step={5}
                      value={yawDeg}
                      onChange={(e) => setYawDeg(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor={pitchId} className="block font-medium text-fg">
                      Pitch (부감/앙각): {pitchDeg}°
                    </label>
                    <input
                      id={pitchId}
                      type="range"
                      min={-80}
                      max={80}
                      step={5}
                      value={pitchDeg}
                      onChange={(e) => setPitchDeg(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="rounded bg-panel p-2.5 font-mono space-y-1">
                  <div>Orbit: {anglePlan.cameraOrbitDescriptor}</div>
                  <div>Guard (require_at_least_one_image_input): {anglePlan.valid ? "PASSED" : "BLOCKED"}</div>
                  <div>Batch Outputs: {anglePlan.numOutputs} turnaround sheets</div>
                </div>
              </div>
            );
          })()
        ) : null}

        {subTab === "promo-video-router" ? (
          (() => {
            const pvPlan = planPromoVideoOmniRouter({
              videoModel,
              mode: videoMode,
              aspectRatio: "16:9",
              durationSeconds: videoDuration,
              resolution: "1080p",
              referenceImageCount: 2,
              hasAudioReference: true,
              switchxLightingPreset: switchxPreset,
            });
            const modelSelectId = `${baseId}-pv-model`;
            const modeSelectId = `${baseId}-pv-mode`;
            const presetSelectId = `${baseId}-pv-switchx`;
            return (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="panel-promo-video-router">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor={modelSelectId} className="block font-medium text-fg">
                      {bt("비디오 생성 모델", "Video Model")}
                    </label>
                    <select
                      id={modelSelectId}
                      value={videoModel}
                      onChange={(e) => setVideoModel(e.target.value as ArtCraftRouterVideoModel)}
                      className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="veo_3p1">Google Veo 3.1 (First-Last-Frame / Extend)</option>
                      <option value="sora_2_pro">OpenAI Sora 2 Pro (Sentinel-2 Auto-Renew)</option>
                      <option value="kling_3p0_pro">Kling 3.0 Pro (ShotType Cinema)</option>
                      <option value="vidu_q3">Vidu Q3 (Reference-to-Video Mix)</option>
                      <option value="seedance_2p5_u">BytePlus Seedance 2.5 Ultra</option>
                      <option value="beeble_switchx_edit_video">Beeble SwitchX (PBR Video Relighting)</option>
                      <option value="grok_imagine_video_1p5">Grok Imagine Video 1.5</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={modeSelectId} className="block font-medium text-fg">
                      {bt("생성 모드", "Generation Mode")}
                    </label>
                    <select
                      id={modeSelectId}
                      value={videoMode}
                      onChange={(e) => setVideoMode(e.target.value as CommonVideoGenerationMode)}
                      className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="first-last-frame-to-video">시작·끝 원화 키프레임 보간</option>
                      <option value="reference-to-video-mix">다중 캐릭터 시트 레퍼런스 믹스</option>
                      <option value="extend-video">기존 PV 샷 길이 확장 (Extend)</option>
                      <option value="switchx-relight-video">Beeble SwitchX 조명 리라이팅</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={presetSelectId} className="block font-medium text-fg">
                      {bt("Beeble SwitchX 리라이팅 조명 프리셋", "Beeble SwitchX Relighting Preset")}
                    </label>
                    <select
                      id={presetSelectId}
                      value={switchxPreset}
                      onChange={(e) =>
                        setSwitchxPreset(
                          e.target.value as
                            | "cyberpunk-neon"
                            | "golden-hour-sunset"
                            | "moonlit-noir"
                            | "studio-rim",
                        )
                      }
                      className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                    >
                      <option value="cyberpunk-neon">Cyberpunk Neon (사이버펑크 네온 림라이트)</option>
                      <option value="golden-hour-sunset">Golden Hour Sunset (황혼 역광)</option>
                      <option value="moonlit-noir">Moonlit Noir (창백한 달빛 느와르)</option>
                      <option value="studio-rim">Studio Rim (3점 스튜디오 조명)</option>
                    </select>
                  </div>
                </div>
                <div className="rounded bg-panel p-2.5 font-mono space-y-1">
                  <div>
                    Provider: <strong className="text-fg">{pvPlan.selectedProvider}</strong> · Est. Credits:{" "}
                    {pvPlan.estimatedCredits}
                  </div>
                  {pvPlan.pipelineSteps.map((step) => (
                    <div key={step} className="truncate text-[11px] text-fg-2">
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : null}

        {subTab === "desktop-deep" ? (
          (() => {
            const launcherDaemon = evaluateLauncherNativeDaemonState({
              consecutiveFailures: 2,
              hasSingleInstanceLock: true,
              uiLocale: "ko",
            });
            const pcraftDeep = evaluatePhotoCraftDesktopDeepPipeline({
              widthPx: 1600,
              heightPx: 4000,
              motionBlurLengthPx: 36,
              motionBlurAngleDeg: 25,
              trimapUnknownBandPx: 12,
              importAffinityStream: true,
            });
            const broadcastDsp = evaluateFilmAndEffectCraftBroadcastPipeline({
              codec: broadcastCodec,
              widthPx: 3840,
              heightPx: 2160,
              fps: 24,
              durationSeconds: 30,
              enableSpectralDenoise: true,
              enableDeclick: true,
              pitchShiftSemitones: 0,
              timeStretchRatio: 1.0,
            });
            const figCollab = evaluateFigCraftCollabAndCodeConnect({
              componentName: "WebtoonEpisodeCard",
              activePeers: 8,
              guestRole: "editor",
              cursorUpdatesPerSec: 60,
            });
            const mojikumi = evaluateDesignCraftMojikumiAndClut({
              mainText: "「각성」(제1장) — 붉은 달이 뜬다!",
              warichuInlineNote: "구시대의 봉인문서",
              cmykSample: [0.1, 0.72, 0.65, 0.08],
            });
            const gainMap = evaluateLightCraftCatalogAndGainMap({
              photoCount: 120,
              burstStackSize: 4,
              hdrTargetPeakNits: 1000,
              softProofProfile: "display-p3",
            });
            const pdfScan = evaluatePdfCraftDocumentScannerAndFormCalc({
              quadCornersClockwise: [
                [20, 30],
                [820, 34],
                [818, 1160],
                [22, 1158],
              ],
              illuminationUnevenness: 0.45,
              lineItemValues: [1200000, 350000, 150000],
              taxRate: 0.1,
            });
            const cadLm = solveCadCraftLevenbergMarquardtAndDynBlock({
              bx: 120,
              targetDistOrigin: 100,
              targetDistB: 100,
              blockVisibilityState: "door-open-90",
              stretchDeltaMm: lmStretchMm,
              arrayRepeatCount: 3,
            });
            const officeDeep = evaluateOfficeSuiteDesktopDeepFeatures({
              historicalEpisodeViews: [42000, 48500, 53000, 61000],
              targetBreakEvenRevenueKrw: 3500000,
              revenuePerViewKrw: 50,
              slideElementCount: 4,
            });
            const codecSelectId = `${baseId}-desktop-codec`;
            const stretchInputId = `${baseId}-desktop-stretch`;

            return (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="panel-desktop-deep">
                <div className="space-y-2">
                  <div className="rounded bg-panel p-2 font-mono text-[11px] space-y-0.5">
                    <div className="font-bold text-fg">
                      Selected Desktop .app: {activeApp.name} ({activeApp.bundleId})
                    </div>
                    <div>
                      Universal Mach-O SHA-256:{" "}
                      {activeApp.desktopAppBinarySha256
                        ? `${activeApp.desktopAppBinarySha256.slice(0, 24)}…`
                        : "Web/Spec Only"}
                    </div>
                    <div>
                      REA Rust Evidence:{" "}
                      {activeApp.reaDesktopRustEvidenceId
                        ? `${activeApp.reaDesktopRustEvidenceId.slice(0, 24)}…`
                        : activeApp.reaViewEvidenceId.slice(0, 24)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={codecSelectId} className="block font-medium text-fg">
                        Film/EffectCraft 코덱
                      </label>
                      <select
                        id={codecSelectId}
                        value={broadcastCodec}
                        onChange={(e) => setBroadcastCodec(e.target.value as BroadcastVideoCodec)}
                        className="mt-1 w-full rounded border border-line bg-panel px-2 py-1"
                      >
                        <option value="apv-422-10bit">APV 422 10-bit</option>
                        <option value="av1-10bit">AV1 10-bit</option>
                        <option value="prores-422-hq">ProRes 422 HQ</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={stretchInputId} className="block font-medium text-fg">
                        CAD 동적 블록 신축: +{lmStretchMm}mm
                      </label>
                      <input
                        id={stretchInputId}
                        type="range"
                        min={0}
                        max={600}
                        step={50}
                        value={lmStretchMm}
                        onChange={(e) => setLmStretchMm(Number(e.target.value))}
                        className="mt-2 w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded bg-panel p-2.5 font-mono text-[11px] space-y-1">
                  <div>
                    [Launcher v0.5.1] Backoff={launcherDaemon.nextPollDelaySeconds}s · Font={launcherDaemon.selectedCjkFontFamily}
                  </div>
                  <div>
                    [PhotoCraft FFT/CNN] FFT Speedup={pcraftDeep.fftSpeedupVsDirectSpatial}x · Faces={pcraftDeep.cnnDetectedFaceLandmarks}pts
                  </div>
                  <div>
                    [Film/EffectCraft DSP] {broadcastDsp.codec} ({broadcastDsp.estimatedBitrateMbps}Mbps) · {broadcastDsp.activeAudioDspStages.length} DSP stages
                  </div>
                  <div>
                    [Design/Light/Pdf] Warichu=({mojikumi.warichuTopLine}/{mojikumi.warichuBottomLine}) · GainMap=+{gainMap.gainMapHeadroomStops}EV · FormCalc=₩{pdfScan.formCalcGrossTotal.toLocaleString()}
                  </div>
                  <div>
                    [CAD LM / Fig / Grid] LM=({cadLm.solvedX},{cadLm.solvedY}) Block={cadLm.evaluatedBlockWidthMm}mm · Collab={figCollab.throttledBroadcastHz}Hz · Forecast={officeDeep.nextEpisodeForecastViews.toLocaleString()} views
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}
      </div>
    </section>
  );
}
