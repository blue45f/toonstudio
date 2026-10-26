import { BookOpen, Clapperboard, Cpu, Film, Globe, Music, Palette, Sparkles, Store, Video, Wrench } from "lucide-react";

import type {
  CotransVroidSkyboxWorldLocalizerReport,
  KreaSplineLumiereRealtimeShaderReport,
  LtxBoordsCascadeurRiveAnimaticReport,
  MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport,
  NijiPixaiCivitaiLoraSrefDirectorReport,
  RunwayLumaPikaViggleLive2dSpineMotionReport,
  SketchupBlenderPetalicaMagmaRecraftStudioReport,
  StoryboarderDreamsKritaArtbreederDirectorReport,
  TapasTappytoonRidiPostypeSudowriteNovelcrafterReport,
  TootoonGentoonTooningKrSuiteReport,
  TripoMeshyHeroforgeSunoElevenlabsOsmuReport,
} from "./claude/claude-rea15-webtoon-ecosystem-suite";
import type { Rea15WorkbenchTabId } from "./claude/claude-rea39-extended-engines";

export interface StudioRea39ExtendedTabPanelsProps {
  readonly activeTab: Rea15WorkbenchTabId;
  readonly currentKrSuite: TootoonGentoonTooningKrSuiteReport;
  readonly currentRealtimeShader: KreaSplineLumiereRealtimeShaderReport;
  readonly currentAnimatic: LtxBoordsCascadeurRiveAnimaticReport;
  readonly currentWorldLocalizer: CotransVroidSkyboxWorldLocalizerReport;
  readonly currentDreamsKritaDirector: StoryboarderDreamsKritaArtbreederDirectorReport;
  readonly currentLoraSrefDirector: NijiPixaiCivitaiLoraSrefDirectorReport;
  readonly currentTripoSunoOsmu: TripoMeshyHeroforgeSunoElevenlabsOsmuReport;
  readonly currentRunwayMotion: RunwayLumaPikaViggleLive2dSpineMotionReport;
  readonly currentSketchupStudio: SketchupBlenderPetalicaMagmaRecraftStudioReport;
  readonly currentTapasCodex: TapasTappytoonRidiPostypeSudowriteNovelcrafterReport;
  readonly currentMixamoToonboom: MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport;
}

export function StudioRea39ExtendedTabPanels({
  activeTab,
  currentKrSuite,
  currentRealtimeShader,
  currentAnimatic,
  currentWorldLocalizer,
  currentDreamsKritaDirector,
  currentLoraSrefDirector,
  currentTripoSunoOsmu,
  currentRunwayMotion,
  currentSketchupStudio,
  currentTapasCodex,
  currentMixamoToonboom,
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

      {/* 탭 9: Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저 */}
      {activeTab === "cotrans-vroid-skybox-localizer" ? (
        <div
          data-testid="rea15-panel-cotrans-vroid-skybox-localizer"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Globe className="size-3 text-accent" aria-hidden="true" />
              Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드
            </span>
            <span className="text-accent">
              {currentWorldLocalizer.cotransLetteringAndInpaint.inpaintingModel} ·{" "}
              {currentWorldLocalizer.vroidParametricAvatar.vrmSpecVersion} ·{" "}
              {currentWorldLocalizer.skybox360Environment.equirectangularResolution}
            </span>
          </div>
          <p className="text-fg-2">{currentWorldLocalizer.worldLocalizerSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Cotrans OCR & Inpaint</div>
              <div className="text-fg-2">
                검출 {currentWorldLocalizer.cotransLetteringAndInpaint.ocrDetectorModel} · 마스크 확장{" "}
                {currentWorldLocalizer.cotransLetteringAndInpaint.balloonMaskDilatePx}px
              </div>
              <div className="text-fg-3">
                {currentWorldLocalizer.cotransLetteringAndInpaint.localizedRegions
                  .map((r) => `${r.regionId}: ${r.translatedEnText}`)
                  .join(" | ")}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">VRoid Studio VRM Avatar</div>
              <div className="text-fg-2">
                {currentWorldLocalizer.vroidParametricAvatar.expressionBlendshapePresetKo}
              </div>
              <div className="text-fg-3">
                MToon 림셰이드 {currentWorldLocalizer.vroidParametricAvatar.rimShadeWidthPct}% · 외곽선{" "}
                {currentWorldLocalizer.vroidParametricAvatar.outlineWidthMm}mm · 스프링본 강성{" "}
                {currentWorldLocalizer.vroidParametricAvatar.hairSpringBoneStiffness}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Skybox AI 360° HDRI</div>
              <div className="text-fg-2">
                {currentWorldLocalizer.skybox360Environment.skyboxStylePresetKo}
              </div>
              <div className="text-fg-3">
                깊이 패럴랙스 {currentWorldLocalizer.skybox360Environment.depthMapParallaxStrengthPct}% ·
                수평선 피치 {currentWorldLocalizer.skybox360Environment.horizonPitchOffsetDeg}° · IBL{" "}
                {currentWorldLocalizer.skybox360Environment.ambientIblTintHex}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 10: WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder */}
      {activeTab === "storyboarder-dreams-krita-artbreeder" ? (
        <div
          data-testid="rea15-panel-storyboarder-dreams-krita-artbreeder"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Clapperboard className="size-3 text-accent" aria-hidden="true" />
              Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자
            </span>
            <span className="text-accent">
              렌즈 {currentDreamsKritaDirector.shotGeneratorAndComicFactory.lensMm}mm · 퍼포밍{" "}
              {currentDreamsKritaDirector.procreateDreamsPerformingTrack.performingRecordSamplingHz}Hz ·
              지연 {currentDreamsKritaDirector.kritaLiveDiffusionAndArtbreederGenes.livePaintingLatencyMs}ms
            </span>
          </div>
          <p className="text-fg-2">{currentDreamsKritaDirector.directorExecutiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Shot Generator & Comic Factory</div>
              <div className="text-fg-2">
                {currentDreamsKritaDirector.shotGeneratorAndComicFactory.comicGridTemplateKo}
              </div>
              <div className="text-fg-3">
                카메라 높이 {currentDreamsKritaDirector.shotGeneratorAndComicFactory.cameraHeightCm}cm ·
                선화 정밀도 {currentDreamsKritaDirector.shotGeneratorAndComicFactory.inkLineCleanlinessPct}%
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Procreate Dreams Performing</div>
              <div className="text-fg-2">
                {currentDreamsKritaDirector.procreateDreamsPerformingTrack.liveMotionGestureSummaryKo}
              </div>
              <div className="text-fg-3">
                워프 격자 {currentDreamsKritaDirector.procreateDreamsPerformingTrack.warpMeshGridSubdivisions}분할 ·
                어니언스킨 {currentDreamsKritaDirector.procreateDreamsPerformingTrack.flipbookOnionSkinFrames}프레임
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Krita Diffusion & Artbreeder</div>
              <div className="text-fg-2">
                ControlNet:{" "}
                {currentDreamsKritaDirector.kritaLiveDiffusionAndArtbreederGenes.kritaControlNetStack.join(
                  " + ",
                )}
              </div>
              <div className="text-fg-3">
                {currentDreamsKritaDirector.kritaLiveDiffusionAndArtbreederGenes.artbreederGeneSliders
                  .map((g) => `${g.geneNameKo}(${g.weightNormalized})`)
                  .join(" · ")}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 11: Niji V6 (--sref/--cref) · Civitai/Tensor/SeaArt/PixAI LoRA 스택 · Picrew/WaifuLabs/Charat */}
      {activeTab === "niji-pixai-civitai-lora-sref" ? (
        <div
          data-testid="rea15-panel-niji-pixai-civitai-lora-sref"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3 text-accent" aria-hidden="true" />
              Niji V6 (--sref/--cref) · Civitai/PixAI/SeaArt LoRA 스택 · Picrew/WaifuLabs 캐릭터
            </span>
            <span className="text-accent">
              {currentLoraSrefDirector.nijiJourneyV6Spec.nijiStyleMode} ·{" "}
              {currentLoraSrefDirector.nijiJourneyV6Spec.srefCode} · --cw{" "}
              {currentLoraSrefDirector.nijiJourneyV6Spec.characterWeightCw}
            </span>
          </div>
          <p className="text-fg-2">{currentLoraSrefDirector.loraAndSrefSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Niji V6 Style & Character Lock</div>
              <div className="text-fg-2">
                {currentLoraSrefDirector.nijiJourneyV6Spec.compiledNijiPrompt}
              </div>
              <div className="text-fg-3">
                --sw {currentLoraSrefDirector.nijiJourneyV6Spec.styleWeightSw} · --cw{" "}
                {currentLoraSrefDirector.nijiJourneyV6Spec.characterWeightCw}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Civitai · Tensor · SeaArt · PixAI LoRA</div>
              <div className="text-fg-2">
                {currentLoraSrefDirector.civitaiPixaiTensorLoraStack.loraAdapters
                  .map((l) => `${l.loraNameKo}(${l.weight})`)
                  .join(" + ")}
              </div>
              <div className="text-fg-3">
                {currentLoraSrefDirector.civitaiPixaiTensorLoraStack.baseCheckpointModel} ·{" "}
                {currentLoraSrefDirector.civitaiPixaiTensorLoraStack.controlNetPreprocessor}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Picrew · WaifuLabs · Charat Parts</div>
              <div className="text-fg-2">
                {currentLoraSrefDirector.waifuLabsPicrewCharatModularParts.waifuLabs4StepSeedGridKo}
              </div>
              <div className="text-fg-3">
                색상 락{" "}
                {currentLoraSrefDirector.waifuLabsPicrewCharatModularParts.paletteSwapHexList.join(" / ")}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 12: Tripo3D/Meshy/HeroForge 3D 프롭 · Suno OST · ElevenLabs 더빙 · MANGA Plus 글로벌 OSMU */}
      {activeTab === "tripo-meshy-heroforge-suno-osmu" ? (
        <div
          data-testid="rea15-panel-tripo-meshy-heroforge-suno-osmu"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Music className="size-3 text-accent" aria-hidden="true" />
              Tripo3D/Meshy/HeroForge 3D 프롭 · Suno OST · ElevenLabs 더빙 · MANGA Plus OSMU
            </span>
            <span className="text-accent">
              3D {currentTripoSunoOsmu.tripoMeshyHeroforge3dPropSpec.tripoQuadPolyCount}쿼드 ·{" "}
              {currentTripoSunoOsmu.sunoAndElevenLabsAudioScore.sunoGenreAndBpmTags} ·{" "}
              {currentTripoSunoOsmu.mangaPlusCreatorsGlobalRelease.readingMode}
            </span>
          </div>
          <p className="text-fg-2">{currentTripoSunoOsmu.osmuExecutiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Tripo3D · Meshy · HeroForge</div>
              <div className="text-fg-2">
                {currentTripoSunoOsmu.tripoMeshyHeroforge3dPropSpec.targetPropAndArmorNameKo}
              </div>
              <div className="text-fg-3">
                {currentTripoSunoOsmu.tripoMeshyHeroforge3dPropSpec.meshyTextureStyle} · 외곽선{" "}
                {currentTripoSunoOsmu.tripoMeshyHeroforge3dPropSpec.toonOutlineThicknessMm}mm
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Suno V6 OST & ElevenLabs Dubbing</div>
              <div className="text-fg-2">
                {currentTripoSunoOsmu.sunoAndElevenLabsAudioScore.sunoV6TrackTitleKo}
              </div>
              <div className="text-fg-3">
                스템 {currentTripoSunoOsmu.sunoAndElevenLabsAudioScore.stemSeparationChannels.join("/")} ·{" "}
                {currentTripoSunoOsmu.sunoAndElevenLabsAudioScore.foleySfxPromptKo}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">MANGA Plus Creators Global</div>
              <div className="text-fg-2">
                {currentTripoSunoOsmu.mangaPlusCreatorsGlobalRelease.globalPromoHookKo}
              </div>
              <div className="text-fg-3">
                언어 {currentTripoSunoOsmu.mangaPlusCreatorsGlobalRelease.localizedLanguages.join("/")} ·
                목표 점수 {currentTripoSunoOsmu.mangaPlusCreatorsGlobalRelease.shueishaMonthlyAwardTargetScore}점
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 13: Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰 */}
      {activeTab === "runway-luma-pika-viggle-live2d-spine" ? (
        <div
          data-testid="rea15-panel-runway-luma-pika-viggle-live2d-spine"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Video className="size-3 text-accent" aria-hidden="true" />
              Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰
            </span>
            <span className="text-accent">
              Viggle {currentRunwayMotion.motionBrushAndCameraRig.viggleJst2MotionTransfer.commandMode} ·
              Live2D {currentRunwayMotion.live2dAndSpine2dRig.live2dArtMeshVertexCount}vtx · Pika{" "}
              {currentRunwayMotion.motionBrushAndCameraRig.pikaffectsAndPhysics.effectPreset}
            </span>
          </div>
          <p className="text-fg-2">{currentRunwayMotion.movingToonExecutiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Runway Motion Brush & Luma Keyframe</div>
              <div className="text-fg-2">
                {currentRunwayMotion.motionBrushAndCameraRig.lumaStartEndKeyframeLock.cameraOrbitAndDollyKo}
              </div>
              <div className="text-fg-3">
                {currentRunwayMotion.motionBrushAndCameraRig.runwayMotionBrushVectors
                  .map((v) => `${v.regionNameKo}(X:${v.horizontalX},Y:${v.verticalY})`)
                  .join(" · ")}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Pika 2.2 & Viggle JST-2 Motion</div>
              <div className="text-fg-2">
                {currentRunwayMotion.motionBrushAndCameraRig.viggleJst2MotionTransfer.drivingMotionSourceKo}
              </div>
              <div className="text-fg-3">
                립싱크 {currentRunwayMotion.motionBrushAndCameraRig.pikaffectsAndPhysics.lipSyncPhonemeFps}fps ·
                배경 {currentRunwayMotion.motionBrushAndCameraRig.viggleJst2MotionTransfer.backgroundPlateMode}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Live2D Cubism 5 & Spine 2D Rig</div>
              <div className="text-fg-2">{currentRunwayMotion.live2dAndSpine2dRig.warpDeformerGrid}</div>
              <div className="text-fg-3">
                IK {currentRunwayMotion.live2dAndSpine2dRig.spine2dIkConstraints.join(" / ")} · 댐핑{" "}
                {currentRunwayMotion.live2dAndSpine2dRig.hairAndCapePhysicsDamping}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 14: SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 30인 협업 · Recraft SVG · Cara Glaze */}
      {activeTab === "sketchup-blender-petalica-magma-recraft" ? (
        <div
          data-testid="rea15-panel-sketchup-blender-petalica-magma-recraft"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Wrench className="size-3 text-accent" aria-hidden="true" />
              SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 협업 · Recraft SVG · Cara Glaze
            </span>
            <span className="text-accent">
              Petalica {currentSketchupStudio.petalicaAndOpenArtColorStudio.petalicaModelStyle} ·
              OpenArt 일관성 {currentSketchupStudio.petalicaAndOpenArtColorStudio.openArtDirectorConsistencyScorePct}% ·
              Glaze {currentSketchupStudio.magmaRecraftCaraProduction.caraGlazeProtectionStrength}
            </span>
          </div>
          <p className="text-fg-2">{currentSketchupStudio.hybridStudioExecutiveSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">SketchUp 3D & Blender Grease Pencil</div>
              <div className="text-fg-2">
                {currentSketchupStudio.sketchupAndGreasePencil3d.warehouseDynamicComponentKo}
              </div>
              <div className="text-fg-3">
                {currentSketchupStudio.sketchupAndGreasePencil3d.hiddenLineStyleAndShadowTime}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Petalica · OpenArt · Playground AI</div>
              <div className="text-fg-2">
                {currentSketchupStudio.petalicaAndOpenArtColorStudio.playgroundMixedCanvasStickerSpecKo}
              </div>
              <div className="text-fg-3">
                힌트 스트로크 {currentSketchupStudio.petalicaAndOpenArtColorStudio.colorHintStrokeCount}개 ·
                선 단순화 Lv.{currentSketchupStudio.petalicaAndOpenArtColorStudio.lineSimplifyLevel}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Magma · Recraft V3 SVG · Cara Glaze</div>
              <div className="text-fg-2">
                {currentSketchupStudio.magmaRecraftCaraProduction.recraftCanvaskitSvgEmblemKo}
              </div>
              <div className="text-fg-3">
                {currentSketchupStudio.magmaRecraftCaraProduction.magmaCollaboratorRoles.join(" · ")}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 15: Tapas · Tappytoon · RIDI · Postype 글로벌 연재 · Sudowrite · Novelcrafter · Campfire 코덱스 */}
      {activeTab === "tapas-tappytoon-ridi-postype-sudowrite-novelcrafter" ? (
        <div
          data-testid="rea15-panel-tapas-tappytoon-ridi-postype-sudowrite-novelcrafter"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3 text-accent" aria-hidden="true" />
              Tapas · Tappytoon · 리디 · 포스타입 글로벌 연재 & Sudowrite · Novelcrafter · Campfire 코덱스
            </span>
            <span className="text-accent">
              Tapas WUF {currentTapasCodex.globalPublishingEconomics.tapasWaitUntilFreeHours}h (
              {currentTapasCodex.globalPublishingEconomics.tapasInkPerEpisode} Ink) · 포스타입 ₩
              {currentTapasCodex.globalPublishingEconomics.postypeMembershipMonthlyKrw.toLocaleString()}
            </span>
          </div>
          <p className="text-fg-2">{currentTapasCodex.publishingAndCodexSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Tapas · Tappytoon · RIDI · Postype</div>
              <div className="text-fg-2">
                {currentTapasCodex.globalPublishingEconomics.tappytoonClubPointBundleKo}
              </div>
              <div className="text-fg-3">
                {currentTapasCodex.globalPublishingEconomics.ridiWaitFreeAndNoblesseTierKo}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Sudowrite & Novelcrafter Codex</div>
              <div className="text-fg-2">
                {currentTapasCodex.novelToWebtoonStoryCodex.sudowriteStoryEngineBeatKo}
              </div>
              <div className="text-fg-3">
                {currentTapasCodex.novelToWebtoonStoryCodex.novelcrafterCodexEntries.join(" · ")}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Campfire · Milanote · PureRef</div>
              <div className="text-fg-2">
                {currentTapasCodex.novelToWebtoonStoryCodex.campfireTimelineArcKo}
              </div>
              <div className="text-fg-3">
                {currentTapasCodex.novelToWebtoonStoryCodex.milanoteAndPurerefMoodboardSpecKo}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 16: Mixamo · Marvelous · Substance 3D · Coolors · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle */}
      {activeTab === "mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle" ? (
        <div
          data-testid="rea15-panel-mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle"
          className="flex flex-col gap-1.5 rounded border border-line bg-raised p-2"
        >
          <div className="flex items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1">
              <Palette className="size-3 text-accent" aria-hidden="true" />
              Mixamo · Marvelous · Substance 3D · Coolors · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle
            </span>
            <span className="text-accent">
              WCAG {currentMixamoToonboom.colorHarmonyAndWebtoonTypography.wcagContrastRatio}:1 ·{" "}
              {currentMixamoToonboom.colorHarmonyAndWebtoonTypography.blambotEnglishLetteringFont}
            </span>
          </div>
          <p className="text-fg-2">{currentMixamoToonboom.productionPipelineSummaryKo}</p>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Mixamo · Marvelous · Substance 3D</div>
              <div className="text-fg-2">
                {currentMixamoToonboom.mixamoMarvelousSubstance3dRig.mixamoMocapFbxClipKo}
              </div>
              <div className="text-fg-3">
                {currentMixamoToonboom.mixamoMarvelousSubstance3dRig.marvelousClothPatternWeftWarpKo} ·{" "}
                {currentMixamoToonboom.mixamoMarvelousSubstance3dRig.substanceStylizedToonMaterialKo}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">Coolors · Adobe Color · 눈누 · Blambot</div>
              <div className="text-fg-2">
                팔레트 {currentMixamoToonboom.colorHarmonyAndWebtoonTypography.coolorsAndAdobeColorMoodHexes.join(" / ")}
              </div>
              <div className="text-fg-3">
                {currentMixamoToonboom.colorHarmonyAndWebtoonTypography.noonnuDialogueAndSfxFontsKo.join(" · ")}
              </div>
            </div>
            <div className="rounded border border-line bg-card p-1.5 text-[0.55rem]">
              <div className="font-bold text-fg">ToonBoom · TVPaint · Moho · Eagle</div>
              <div className="text-fg-2">
                {currentMixamoToonboom.toonBoomTvpaintMohoAndEagleHub.toonBoomHarmonyNodeCompositeKo}
              </div>
              <div className="text-fg-3">
                {currentMixamoToonboom.toonBoomTvpaintMohoAndEagleHub.tvpaintCtgColorAndMohoSmartBoneKo} ·{" "}
                {currentMixamoToonboom.toonBoomTvpaintMohoAndEagleHub.eagleSmartFolderColorTags.join(" / ")}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
