import { Cpu, Film, Store } from "lucide-react";

import type {
  KreaSplineLumiereRealtimeShaderReport,
  LtxBoordsCascadeurRiveAnimaticReport,
  TootoonGentoonTooningKrSuiteReport,
} from "./claude/claude-rea15-webtoon-ecosystem-suite";
import type { Rea15WorkbenchTabId } from "./StudioRea15PlatformsWorkbenchPanel";

export interface StudioRea39ExtendedTabPanelsProps {
  readonly activeTab: Rea15WorkbenchTabId;
  readonly currentKrSuite: TootoonGentoonTooningKrSuiteReport;
  readonly currentRealtimeShader: KreaSplineLumiereRealtimeShaderReport;
  readonly currentAnimatic: LtxBoordsCascadeurRiveAnimaticReport;
}

export function StudioRea39ExtendedTabPanels({
  activeTab,
  currentKrSuite,
  currentRealtimeShader,
  currentAnimatic,
}: StudioRea39ExtendedTabPanelsProps) {
  return (
    <>
      {/* 탭 6: TooToon 5-Studio · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 디렉터 */}
      {activeTab === "tootoon-gentoon-tooning-kr" ? (
        <div
          data-testid="rea15-panel-tootoon-gentoon-tooning-kr"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Store className="size-3 text-accent" aria-hidden="true" />
              TooToon 5-Studio · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 빌더
            </span>
            <span className="text-accent">
              GenToon {currentKrSuite.gentoonReaderAndCommerce.readingDirection} · Paper{" "}
              {currentKrSuite.gentoonReaderAndCommerce.paperHex}
            </span>
          </div>
          <p className="text-fg-2">{currentKrSuite.suiteSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-5">
            {currentKrSuite.tootoonFiveStudios.map((mod) => (
              <div
                key={mod.moduleId}
                className="rounded border border-line bg-card p-1.5 text-[0.54rem]"
              >
                <div className="font-bold text-accent">{mod.routePath}</div>
                <div className="font-semibold text-fg">{mod.stageTitleKo}</div>
                <div className="text-fg-2">{mod.deliverableSummaryKo}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {currentKrSuite.tooningSixPartCharacterRecipe.map((part) => (
              <div
                key={part.partRoute}
                className="flex items-center justify-between rounded border border-line bg-card px-2 py-1 text-[0.54rem]"
              >
                <div>
                  <div className="font-bold text-fg">
                    {part.partLabelKo} <span className="text-fg-3">({part.partRoute})</span>
                  </div>
                  <div className="text-fg-2">{part.selectedPresetSummaryKo}</div>
                </div>
                <span className="font-bold text-accent">{part.consistencyLockScorePct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 탭 7: Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 */}
      {activeTab === "krea-spline-lumiere-shader" ? (
        <div
          data-testid="rea15-panel-krea-spline-lumiere-shader"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Cpu className="size-3 text-accent" aria-hidden="true" />
              Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere WebGPU 셰이더
            </span>
            <span className="text-accent">
              Krea {currentRealtimeShader.kreaRealtimeDirector.activeRoute} · Denoise{" "}
              {currentRealtimeShader.kreaRealtimeDirector.i2iDenoiseStrength}
            </span>
          </div>
          <p className="text-fg-2">{currentRealtimeShader.realtimePipelineSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Krea Realtime Director</div>
              <div className="text-fg-2">
                {currentRealtimeShader.kreaRealtimeDirector.directorCoachingKo}
              </div>
              <div className="text-fg-3">
                도형 블로킹 {currentRealtimeShader.kreaRealtimeDirector.blockingPrimitiveCount}개 ·
                업스케일 {currentRealtimeShader.kreaRealtimeDirector.enhanceUpscaleFactor}x
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">
                Spline 3D & Hana ({currentRealtimeShader.spline3dAndHanaBridge.activeRoute})
              </div>
              <div className="text-fg-2">
                {currentRealtimeShader.spline3dAndHanaBridge.styleTransferPresetKo}
              </div>
              <div className="text-fg-3">
                궤도 {currentRealtimeShader.spline3dAndHanaBridge.cameraOrbitAzimuthDeg}° /{" "}
                {currentRealtimeShader.spline3dAndHanaBridge.cameraOrbitElevationDeg}° ·{" "}
                {currentRealtimeShader.spline3dAndHanaBridge.interactiveStateTriggerKo}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Lumiere · Graphite · PixiEditor</div>
              <div className="text-fg-2">
                Kuwahara {currentRealtimeShader.lumiereAndNodeGraphShaders.kuwaharaPaintRadiusPx}px ·
                Halation {currentRealtimeShader.lumiereAndNodeGraphShaders.filmHalationIntensityPct}% ·
                Glare {currentRealtimeShader.lumiereAndNodeGraphShaders.anamorphicGlareStreakPct}%
              </div>
              <div className="text-fg-3">
                Graphite 노드{" "}
                {currentRealtimeShader.lumiereAndNodeGraphShaders.graphiteProceduralNodeCount}개 ·
                PixiEditor 루프{" "}
                {currentRealtimeShader.lumiereAndNodeGraphShaders.pixiEditorFrameLoopCount}프레임
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 8: LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 */}
      {activeTab === "ltx-boords-cascadeur-rive" ? (
        <div
          data-testid="rea15-panel-ltx-boords-cascadeur-rive"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Film className="size-3 text-accent" aria-hidden="true" />
              LTX · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신
            </span>
            <span className="text-accent">
              AutoPosing {currentAnimatic.cascadeurPhysicsRig.autoPosingConfidencePct}% · 무게중심{" "}
              {currentAnimatic.cascadeurPhysicsRig.centerOfMassHeightCm}cm · 토크{" "}
              {currentAnimatic.cascadeurPhysicsRig.angularMomentumTorqueNm}N·m
            </span>
          </div>
          <p className="text-fg-2">{currentAnimatic.animaticExecutiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {currentAnimatic.ltxAndBoordsAnimaticShots.map((shot) => (
              <div
                key={shot.shotNumber}
                className="rounded border border-line bg-card px-2 py-1 text-[0.54rem]"
              >
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>
                    샷 #{shot.shotNumber} · {shot.cameraMove}
                  </span>
                  <span className="text-accent">{shot.durationMs}ms</span>
                </div>
                <div className="text-fg-2">{shot.voiceoverBeatKo}</div>
                <div className="text-fg-3">{shot.visualTransitionKo}</div>
              </div>
            ))}
          </div>

          <div className="rounded border border-line bg-card px-2 py-1 text-[0.54rem] text-fg-2">
            <strong>
              Rive & Jitter 상태머신 ({currentAnimatic.riveAndJitterStateMachine.stateMachineName},
              스크롤 트리거 {currentAnimatic.riveAndJitterStateMachine.scrollTriggerThresholdPct}%):
            </strong>{" "}
            {currentAnimatic.riveAndJitterStateMachine.states
              .map((s) => `${s.stateName}(${s.loopFps}fps: ${s.meshDeformationSummaryKo})`)
              .join(" → ")}
          </div>
        </div>
      ) : null}
    </>
  );
}
