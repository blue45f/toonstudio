import {
  CheckCircle2,
  CloudSun,
  Film,
  Layers,
  ScanSearch,
  Smile,
  Store,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ANATOMY_TARGET_LABELS,
  ATMOSPHERE_OKLCH_CATALOG,
  CAMERA_SHOT_LABELS,
  FLAW_CATEGORY_LABELS,
  OUTFIT_SET_CATALOG,
  SCENE_GENRE_ERA_LABELS,
  SCENE_ZONE_LABELS,
  applyBatchRedressAndRelight,
  createSampleSixtyCutManuscript,
  fillEmptyScenePropsAndSigns,
  generateBridgeCutProposal,
  runAnatomyAndFoldRescue,
  scanManuscriptFlawsAndAutoFix,
  syncExpressionFromDialogueEdit,
  type AnatomyRescueTarget,
  type AtmospherePresetId,
  type BatchCutStyleState,
  type CameraShotType,
  type CutEmotion,
  type InkStylePreset,
  type ManuscriptFlawCategory,
  type OutfitSetId,
  type ReadingPacingMode,
  type SceneGenreEra,
  type ScenePropDensity,
  type SceneZoneId,
} from "./chore-rescue-ai-engine";

type RescueWorkbenchTabId = "anatomy" | "bridge" | "redress" | "expression" | "props" | "flaws";

const SAMPLE_BATCH_CUTS: readonly BatchCutStyleState[] = [
  { cutId: "cut-01", cutNumber: 1, characterIds: ["서윤"], currentOutfit: "summer-uniform", currentAtmosphere: "day" },
  { cutId: "cut-02", cutNumber: 2, characterIds: ["서윤", "도현"], currentOutfit: "summer-uniform", currentAtmosphere: "day" },
  { cutId: "cut-03", cutNumber: 3, characterIds: ["서윤"], currentOutfit: "summer-uniform", currentAtmosphere: "day", manualLocked: true },
  { cutId: "cut-04", cutNumber: 4, characterIds: ["도현"], currentOutfit: "summer-uniform", currentAtmosphere: "day" },
];

const RESCUE_TABS: readonly { readonly id: RescueWorkbenchTabId; readonly labelKo: string }[] = [
  { id: "anatomy", labelKo: "1. 손·프릴·무기·차" },
  { id: "bridge", labelKo: "2. 연결 컷 제안" },
  { id: "redress", labelKo: "3. 의상·날씨 일괄" },
  { id: "expression", labelKo: "4. 대사→표정 싱크" },
  { id: "props", labelKo: "5. 소품·한글 간판" },
  { id: "flaws", labelKo: "6. 60컷 옥에 티" },
];

const FLAW_CATEGORY_ORDER: readonly ManuscriptFlawCategory[] = [
  "missing-accessory",
  "mirrored-text",
  "unfilled-white-gap",
  "mismatched-balloon-tail",
  "abnormal-finger-count",
];

/**
 * 6대 작가 노가다 박멸 AI 보정 도구 인터랙티브 워크벤치.
 */
export function StudioChoreRescueWorkbench() {
  const [activeToolTab, setActiveToolTab] = useState<RescueWorkbenchTabId>("anatomy");

  // 1) 손·프릴·무기·차 1초 부분 보정
  const [anatomyTarget, setAnatomyTarget] = useState<AnatomyRescueTarget>("hands");
  const [strokeWidthPx, setStrokeWidthPx] = useState<number>(2.2);
  const [inkStyle, setInkStyle] = useState<InkStylePreset>("g-pen");
  const [anatomyResult, setAnatomyResult] = useState(() =>
    runAnatomyAndFoldRescue({
      cutId: "cut-18",
      maskRegion: { x: 160, y: 210, width: 260, height: 240 },
      targetType: "hands",
      styleLock: { strokeWidthPx: 2.2, taperRatio: 0.72, inkStyle: "g-pen", preserveOriginalUnderlay: true },
    }),
  );

  // 2) 연결 컷(브리지 컷) 제안
  const [prevCamera, setPrevCamera] = useState<CameraShotType>("establishing");
  const [nextCamera, setNextCamera] = useState<CameraShotType>("extreme-closeup");
  const [prevEmotion, setPrevEmotion] = useState<CutEmotion>("calm");
  const [nextEmotion, setNextEmotion] = useState<CutEmotion>("shocked");
  const [bridgePacing, setBridgePacing] = useState<ReadingPacingMode>("dramatic-pause");
  const [bridgeResult, setBridgeResult] = useState(() =>
    generateBridgeCutProposal({
      prevCut: {
        cutNumber: 24,
        cameraAngle: "establishing",
        emotion: "calm",
        actionSummary: "빗소리 들리는 창밖을 조용히 응시",
        gazeDirection: "left",
        beatDurationSec: 2.0,
      },
      nextCut: {
        cutNumber: 25,
        cameraAngle: "extreme-closeup",
        emotion: "shocked",
        actionSummary: "등 뒤에서 들린 이름에 급히 시선 반전",
        gazeDirection: "right",
        beatDurationSec: 1.1,
      },
      readingPacing: "dramatic-pause",
    }),
  );

  // 3) 일괄 의상 교체 · 날씨/시간대 전환
  const [targetOutfit, setTargetOutfit] = useState<OutfitSetId>("winter-coat");
  const [targetAtmosphere, setTargetAtmosphere] = useState<AtmospherePresetId>("rainy-night");
  const [preserveLockedCuts, setPreserveLockedCuts] = useState<boolean>(true);
  const [redressResult, setRedressResult] = useState(() =>
    applyBatchRedressAndRelight({
      cuts: SAMPLE_BATCH_CUTS,
      targetOutfit: "winter-coat",
      targetAtmosphere: "rainy-night",
      preserveManualLockedCuts: true,
    }),
  );

  // 4) 대사 수정 연동 표정 1초 자동 싱크
  const [editedDialogue, setEditedDialogue] = useState<string>("설마 거짓말이지?! 어떻게 나한테 말도 없이 떠날 수 있어!");
  const [expressionResult, setExpressionResult] = useState(() =>
    syncExpressionFromDialogueEdit({
      cutId: "cut-31",
      characterName: "서윤",
      previousDialogue: "알았어, 내일 다시 얘기하자.",
      editedDialogue: "설마 거짓말이지?! 어떻게 나한테 말도 없이 떠날 수 있어!",
    }),
  );

  // 5) 휑한 3D 배경 소품 · 한글 간판 자동 채우기
  const [sceneZone, setSceneZone] = useState<SceneZoneId>("street-signboard");
  const [genreEra, setGenreEra] = useState<SceneGenreEra>("seoul-modern");
  const [propDensity, setPropDensity] = useState<ScenePropDensity>("standard");
  const [sceneFillResult, setSceneFillResult] = useState(() =>
    fillEmptyScenePropsAndSigns({
      sceneZone: "street-signboard",
      genreEra: "seoul-modern",
      density: "standard",
      cameraPerspectivePoints: 2,
    }),
  );

  // 6) 마감 직전 60컷 옥에 티 · 작화 붕괴 자동 헌터
  const sixtyCutSample = useMemo(() => createSampleSixtyCutManuscript(), []);
  const [flawScanResult, setFlawScanResult] = useState(() =>
    scanManuscriptFlawsAndAutoFix({ cuts: sixtyCutSample, autoFixMode: "preview-only" }),
  );

  return (
    <section className="role-rescue-section" aria-label="6대 작가 노가다 박멸 AI 보정 워크벤치">
      <div>
        <h4 className="text-xs font-black text-fg">2. 6대 작가 노가다 박멸 AI 보정 도구</h4>
        <p className="mt-0.5 text-xs text-fg-2">
          손·프릴·무기·차 1초 보정부터 60컷 옥에 티 헌터까지, 원클릭으로 분리 레이어를 생성합니다.
        </p>
      </div>

      <div className="role-rescue-tool-tablist" role="tablist" aria-label="6대 노가다 박멸 AI 보정 도구 탭">
        {RESCUE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`rescue-tab-${tab.id}`}
            aria-selected={activeToolTab === tab.id}
            aria-controls={`rescue-panel-${tab.id}`}
            className="role-rescue-tab"
            data-testid={`rescue-tab-${tab.id}`}
            onClick={() => setActiveToolTab(tab.id)}
          >
            {tab.labelKo}
          </button>
        ))}
      </div>

      {activeToolTab === "anatomy" ? (
        <div role="tabpanel" id="rescue-panel-anatomy" aria-labelledby="rescue-tab-anatomy" className="role-rescue-two-col">
          <div className="role-rescue-card">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <Layers className="size-4 text-accent" aria-hidden="true" />
              손·프릴·무기·자동차 1초 부분 보정
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ANATOMY_TARGET_LABELS) as AnatomyRescueTarget[]).map((target) => (
                <button
                  key={target}
                  type="button"
                  className="role-rescue-btn"
                  aria-pressed={anatomyTarget === target}
                  data-variant={anatomyTarget === target ? "primary" : undefined}
                  onClick={() => setAnatomyTarget(target)}
                >
                  {ANATOMY_TARGET_LABELS[target]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                작가 선폭 락 (px)
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.2}
                  value={strokeWidthPx}
                  onChange={(event) => setStrokeWidthPx(Number(event.target.value))}
                  className="role-rescue-input role-rescue-num"
                />
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                펜선 화풍 락
                <select
                  value={inkStyle}
                  onChange={(event) => setInkStyle(event.target.value as InkStylePreset)}
                  className="role-rescue-select"
                >
                  <option value="g-pen">G펜 (강약 뚜렷)</option>
                  <option value="clean-digital">클린 디지털</option>
                  <option value="pencil-rough">연필 질감</option>
                  <option value="brush-ink">먹선 붓터치</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="role-rescue-btn"
              data-variant="primary"
              data-testid="run-anatomy-rescue-btn"
              onClick={() =>
                setAnatomyResult(
                  runAnatomyAndFoldRescue({
                    cutId: "cut-18",
                    maskRegion: { x: 160, y: 210, width: 260, height: 240 },
                    targetType: anatomyTarget,
                    styleLock: { strokeWidthPx, taperRatio: 0.72, inkStyle, preserveOriginalUnderlay: true },
                  }),
                )
              }
            >
              <Wand2 className="size-4" aria-hidden="true" />
              1초 부분 보정 실행
            </button>
          </div>

          <div className="role-rescue-card" data-testid="anatomy-rescue-result">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="role-rescue-pill role-rescue-num" data-tone="good">
                {anatomyResult.estimatedTimeMs}ms 완료
              </span>
              <span className="role-rescue-pill role-rescue-num">
                선폭 {anatomyResult.outputStrokeWidthPx}px · 제어점 {anatomyResult.vectorControlPoints.length}개
              </span>
            </div>
            <p className="text-xs font-semibold text-fg">{anatomyResult.summaryKo}</p>
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-bold text-fg-2">수동 편집용 분리 레이어 ({anatomyResult.separatedLayers.length}장)</p>
              {anatomyResult.separatedLayers.map((layer) => (
                <div key={layer.layerId} className="flex items-center justify-between rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs">
                  <span className="font-semibold text-fg">{layer.nameKo}</span>
                  <span className="text-[0.6875rem] text-fg-2">{layer.locked ? "원본 잠금" : "수동 편집 가능"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeToolTab === "bridge" ? (
        <div role="tabpanel" id="rescue-panel-bridge" aria-labelledby="rescue-tab-bridge" className="role-rescue-two-col">
          <div className="role-rescue-card">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <Film className="size-4 text-accent" aria-hidden="true" />
              컷 사이 연결 컷(브리지 컷) 자동 제안
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                앞 컷 구도
                <select value={prevCamera} onChange={(event) => setPrevCamera(event.target.value as CameraShotType)} className="role-rescue-select">
                  {(Object.keys(CAMERA_SHOT_LABELS) as CameraShotType[]).map((shot) => (
                    <option key={shot} value={shot}>{CAMERA_SHOT_LABELS[shot]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                뒤 컷 구도
                <select value={nextCamera} onChange={(event) => setNextCamera(event.target.value as CameraShotType)} className="role-rescue-select">
                  {(Object.keys(CAMERA_SHOT_LABELS) as CameraShotType[]).map((shot) => (
                    <option key={shot} value={shot}>{CAMERA_SHOT_LABELS[shot]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                앞 감정
                <select value={prevEmotion} onChange={(event) => setPrevEmotion(event.target.value as CutEmotion)} className="role-rescue-select">
                  <option value="calm">차분함</option>
                  <option value="joy">기쁨</option>
                  <option value="sad">슬픔</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                뒤 감정
                <select value={nextEmotion} onChange={(event) => setNextEmotion(event.target.value as CutEmotion)} className="role-rescue-select">
                  <option value="shocked">충격</option>
                  <option value="angry">분노</option>
                  <option value="shy">당황</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                호흡 템포
                <select value={bridgePacing} onChange={(event) => setBridgePacing(event.target.value as ReadingPacingMode)} className="role-rescue-select">
                  <option value="fast-action">액션 쾌속</option>
                  <option value="balanced">표준 호흡</option>
                  <option value="dramatic-pause">여운·긴장</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="role-rescue-btn"
              data-variant="primary"
              data-testid="run-bridge-proposal-btn"
              onClick={() =>
                setBridgeResult(
                  generateBridgeCutProposal({
                    prevCut: {
                      cutNumber: 24,
                      cameraAngle: prevCamera,
                      emotion: prevEmotion,
                      actionSummary: "창밖을 바라보며 말없이 멈춤",
                      gazeDirection: "left",
                      beatDurationSec: 2.0,
                    },
                    nextCut: {
                      cutNumber: 25,
                      cameraAngle: nextCamera,
                      emotion: nextEmotion,
                      actionSummary: "갑작스러운 부름에 시선 반전",
                      gazeDirection: "right",
                      beatDurationSec: 1.1,
                    },
                    readingPacing: bridgePacing,
                  }),
                )
              }
            >
              연결 컷 1~2장 자동 제안
            </button>
          </div>

          <div className="role-rescue-card" data-testid="bridge-proposal-result">
            <div className="flex flex-wrap gap-1.5">
              <span className="role-rescue-pill role-rescue-num" data-tone="cool">
                구도 낙차 {bridgeResult.deltaAnalysis.cameraJumpScore} · 감정 낙차 {bridgeResult.deltaAnalysis.emotionShiftScore}
              </span>
              <span className="role-rescue-pill role-rescue-num" data-tone="good">
                제안 {bridgeResult.proposals.length}장
              </span>
            </div>
            <p className="text-xs font-semibold text-fg">{bridgeResult.summaryKo}</p>
            {bridgeResult.proposals.map((card) => (
              <div key={card.bridgeId} className="rounded-lg border border-line bg-card p-2.5 text-xs">
                <p className="font-bold text-fg">
                  컷 {card.suggestedCutLabel} · {card.cameraLabelKo} (여백 {card.breathGapPx}px)
                </p>
                <p className="mt-0.5 text-fg-2">{card.gazeFlowKo}</p>
                <p className="mt-0.5 text-fg-2">{card.actionDirectionKo}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeToolTab === "redress" ? (
        <div role="tabpanel" id="rescue-panel-redress" aria-labelledby="rescue-tab-redress" className="role-rescue-two-col">
          <div className="role-rescue-card">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <CloudSun className="size-4 text-accent" aria-hidden="true" />
              복수 컷 의상 교체 · 날씨/시간대 일괄 전환
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                의상 세트
                <select value={targetOutfit} onChange={(event) => setTargetOutfit(event.target.value as OutfitSetId)} className="role-rescue-select">
                  {(Object.keys(OUTFIT_SET_CATALOG) as OutfitSetId[]).map((id) => (
                    <option key={id} value={id}>{OUTFIT_SET_CATALOG[id].labelKo}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                시간·날씨 광원
                <select value={targetAtmosphere} onChange={(event) => setTargetAtmosphere(event.target.value as AtmospherePresetId)} className="role-rescue-select">
                  {(Object.keys(ATMOSPHERE_OKLCH_CATALOG) as AtmospherePresetId[]).map((id) => (
                    <option key={id} value={id}>{ATMOSPHERE_OKLCH_CATALOG[id].labelKo}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-fg">
              <input type="checkbox" checked={preserveLockedCuts} onChange={(event) => setPreserveLockedCuts(event.target.checked)} />
              수동 잠금된 컷(3컷) 보호 유지
            </label>
            <button
              type="button"
              className="role-rescue-btn"
              data-variant="primary"
              data-testid="run-batch-redress-btn"
              onClick={() =>
                setRedressResult(
                  applyBatchRedressAndRelight({
                    cuts: SAMPLE_BATCH_CUTS,
                    targetOutfit,
                    targetAtmosphere,
                    preserveManualLockedCuts: preserveLockedCuts,
                  }),
                )
              }
            >
              선택 4컷 일괄 의상·날씨 적용
            </button>
          </div>

          <div className="role-rescue-card" data-testid="batch-redress-result">
            <div className="role-rescue-swatch" data-atmosphere={redressResult.atmosphereSpec.id}>
              <span className="text-xs font-black text-fg">{redressResult.atmosphereSpec.labelKo}</span>
              <span className="role-rescue-pill role-rescue-num">
                ΔL {redressResult.atmosphereSpec.lightnessDelta} · ΔH {redressResult.atmosphereSpec.hueShiftDeg}°
              </span>
            </div>
            <p className="text-xs font-semibold text-fg">{redressResult.summaryKo}</p>
            <p className="text-xs text-fg-2">
              광원: {redressResult.atmosphereSpec.keyLightOklch} · 그림자: {redressResult.atmosphereSpec.shadowTintOklch}
            </p>
            <p className="text-xs text-fg-2">의상 구성: {redressResult.outfitSpec.garmentLayersKo.join(" · ")}</p>
          </div>
        </div>
      ) : null}

      {activeToolTab === "expression" ? (
        <div role="tabpanel" id="rescue-panel-expression" aria-labelledby="rescue-tab-expression" className="role-rescue-two-col">
          <div className="role-rescue-card">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <Smile className="size-4 text-accent" aria-hidden="true" />
              대사 수정 연동 표정 1초 자동 싱크
            </p>
            <label className="grid gap-1 text-xs font-bold text-fg-2">
              수정된 대사 입력
              <input
                type="text"
                value={editedDialogue}
                onChange={(event) => setEditedDialogue(event.target.value)}
                className="role-rescue-input"
                data-testid="dialogue-sync-input"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="role-rescue-btn" onClick={() => setEditedDialogue("당장 꺼져! 다시는 내 앞에 나타나지 마!!")}>
                분노 샘플
              </button>
              <button type="button" className="role-rescue-btn" onClick={() => setEditedDialogue("부끄럽게 자꾸 쳐다보지 마, 바보야...")}>
                당황 샘플
              </button>
              <button type="button" className="role-rescue-btn" onClick={() => setEditedDialogue("정말 고마워, 네 덕분에 해냈어!")}>
                기쁨 샘플
              </button>
            </div>
            <button
              type="button"
              className="role-rescue-btn"
              data-variant="primary"
              data-testid="run-expression-sync-btn"
              onClick={() =>
                setExpressionResult(
                  syncExpressionFromDialogueEdit({
                    cutId: "cut-31",
                    characterName: "서윤",
                    previousDialogue: "알았어, 내일 다시 얘기하자.",
                    editedDialogue,
                  }),
                )
              }
            >
              4개 표정 레이어 1초 동기화
            </button>
          </div>

          <div className="role-rescue-card" data-testid="expression-sync-result">
            <div className="flex flex-wrap gap-1.5">
              <span className="role-rescue-pill" data-tone="good">
                얼굴 재작화 없음 · {expressionResult.modifiedLayerKeys.length}개 레이어만 동기화
              </span>
              <span className="role-rescue-pill role-rescue-num" data-tone="cool">
                감정: {expressionResult.emotionLabelKo} ({Math.round(expressionResult.confidenceScore * 100)}%)
              </span>
            </div>
            <p className="text-xs font-semibold text-fg">{expressionResult.summaryKo}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-line bg-card p-2">
                <dt className="font-bold text-fg">눈썹 (eyebrows)</dt>
                <dd className="role-rescue-num text-fg-2">각도 {expressionResult.layers.eyebrows.archAngleDeg}° · 미간 {expressionResult.layers.eyebrows.furrowIntensity}</dd>
              </div>
              <div className="rounded-lg border border-line bg-card p-2">
                <dt className="font-bold text-fg">눈 (eyes)</dt>
                <dd className="role-rescue-num text-fg-2">개방 {expressionResult.layers.eyes.opennessRatio} · {expressionResult.layers.eyes.highlightStyle}</dd>
              </div>
              <div className="rounded-lg border border-line bg-card p-2">
                <dt className="font-bold text-fg">입 (mouth)</dt>
                <dd className="role-rescue-num text-fg-2">{expressionResult.layers.mouth.shape} · 개방 {expressionResult.layers.mouth.openRatio}</dd>
              </div>
              <div className="rounded-lg border border-line bg-card p-2">
                <dt className="font-bold text-fg">홍조 (blush)</dt>
                <dd className="role-rescue-num text-fg-2">{expressionResult.layers.blush.style} · 불투명도 {expressionResult.layers.blush.opacity}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {activeToolTab === "props" ? (
        <div role="tabpanel" id="rescue-panel-props" aria-labelledby="rescue-tab-props" className="role-rescue-two-col">
          <div className="role-rescue-card">
            <p className="flex items-center gap-1.5 text-xs font-black text-fg">
              <Store className="size-4 text-accent" aria-hidden="true" />
              휑한 3D 배경 소품 · 한글 간판 자동 채우기
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                빈 공간 영역
                <select value={sceneZone} onChange={(event) => setSceneZone(event.target.value as SceneZoneId)} className="role-rescue-select">
                  {(Object.keys(SCENE_ZONE_LABELS) as SceneZoneId[]).map((zone) => (
                    <option key={zone} value={zone}>{SCENE_ZONE_LABELS[zone]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                시대·장르
                <select value={genreEra} onChange={(event) => setGenreEra(event.target.value as SceneGenreEra)} className="role-rescue-select">
                  {(Object.keys(SCENE_GENRE_ERA_LABELS) as SceneGenreEra[]).map((era) => (
                    <option key={era} value={era}>{SCENE_GENRE_ERA_LABELS[era]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-fg-2">
                배치 밀도
                <select value={propDensity} onChange={(event) => setPropDensity(event.target.value as ScenePropDensity)} className="role-rescue-select">
                  <option value="minimal">여백 위주</option>
                  <option value="standard">표준 배치</option>
                  <option value="rich">밀도 풍부</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="role-rescue-btn"
              data-variant="primary"
              data-testid="run-scene-fill-btn"
              onClick={() =>
                setSceneFillResult(
                  fillEmptyScenePropsAndSigns({
                    sceneZone,
                    genreEra,
                    density: propDensity,
                    cameraPerspectivePoints: 2,
                  }),
                )
              }
            >
              소품·한글 간판 자동 채우기
            </button>
          </div>

          <div className="role-rescue-card" data-testid="scene-fill-result">
            <div className="flex flex-wrap gap-1.5">
              <span className="role-rescue-pill" data-tone="good">한글 간판 오타 0건 · 좌우반전 0건</span>
              <span className="role-rescue-pill role-rescue-num">소품 {sceneFillResult.props.length}종</span>
            </div>
            <p className="text-xs font-semibold text-fg">{sceneFillResult.summaryKo}</p>
            <div className="flex flex-wrap gap-1.5">
              {sceneFillResult.props.map((prop) => (
                <span key={prop.propId} className="role-rescue-pill" data-tone="cool">
                  {prop.nameKo} ({prop.depthLayer})
                </span>
              ))}
            </div>
            <ul className="space-y-1 text-xs">
              {sceneFillResult.hangulSigns.map((sign) => (
                <li key={sign.signId} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-fg">
                  <span className="font-bold">「{sign.textKo}」</span> — {sign.placementKo} ({sign.fontToneKo})
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {activeToolTab === "flaws" ? (
        <div role="tabpanel" id="rescue-panel-flaws" aria-labelledby="rescue-tab-flaws" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-fg">
                <ScanSearch className="size-4 text-accent" aria-hidden="true" />
                60컷 원고 마감 직전 옥에 티 헌터
              </span>
              <span
                className="role-rescue-pill role-rescue-num"
                data-tone={flawScanResult.remainingFlawCount === 0 ? "good" : "warn"}
                data-testid="flaw-readiness-badge"
              >
                연재 준비도 {flawScanResult.releaseReadinessScore}점 · 남은 결함 {flawScanResult.remainingFlawCount}건
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="role-rescue-btn"
                data-testid="scan-flaws-preview-btn"
                onClick={() => setFlawScanResult(scanManuscriptFlawsAndAutoFix({ cuts: sixtyCutSample, autoFixMode: "preview-only" }))}
              >
                60컷 재스캔
              </button>
              <button
                type="button"
                className="role-rescue-btn"
                data-variant="primary"
                data-tone="good"
                data-testid="autofix-all-flaws-btn"
                onClick={() => setFlawScanResult(scanManuscriptFlawsAndAutoFix({ cuts: sixtyCutSample, autoFixMode: "apply-all" }))}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                1클릭 일괄 수정 ({flawScanResult.totalFlawsFound}건)
              </button>
            </div>
          </div>

          <p className="text-xs font-semibold text-fg" data-testid="flaw-scan-summary">
            {flawScanResult.summaryKo}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {FLAW_CATEGORY_ORDER.map((category) => (
              <span key={category} className="role-rescue-pill role-rescue-num" data-tone={flawScanResult.countsByCategory[category] > 0 ? "warn" : "good"}>
                {FLAW_CATEGORY_LABELS[category]}: {flawScanResult.countsByCategory[category]}건
              </span>
            ))}
          </div>

          <div
            className="role-rescue-table-wrap"
            role="region"
            aria-label="60컷 옥에 티 탐지 및 수정 내역 표"
          >
            <table className="role-rescue-table">
              <thead>
                <tr>
                  <th>컷</th>
                  <th>유형</th>
                  <th>탐지 내용</th>
                  <th>1클릭 수정 내역</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {flawScanResult.findings.map((finding) => (
                  <tr key={finding.findingId}>
                    <td className="role-rescue-num font-bold">{finding.cutNumber}컷</td>
                    <td>{finding.categoryLabelKo}</td>
                    <td>{finding.descriptionKo}</td>
                    <td>{finding.autoFixActionKo}</td>
                    <td>
                      <span className="role-rescue-pill" data-tone={finding.fixed ? "good" : finding.severity === "critical" ? "bad" : "warn"}>
                        {finding.fixed ? "수정 완료" : "수정 필요"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
