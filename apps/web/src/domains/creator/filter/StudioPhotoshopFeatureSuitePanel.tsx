/**
 * Adobe Photoshop Web (v2026.21.0.0) 통합 기능 스위트 패널
 *
 * REA 역공학으로 내재화한 5대 서브시스템을 스튜디오 작업공간에 노출한다:
 * 1. 웹 필터 & 슈퍼 프리셋 (24개 카테고리, 고급 프로시저럴 6종 게이팅, 슈퍼 프리셋 필터)
 * 2. 퀵 액션(13종 비파괴 액션 + 가역적 히스토리 복원) & 조정 프리셋 V2(30종)
 * 3. 레이어 스타일(10종 lfx2/lrFX, 글로벌 라이트 각도 동기화) & 썸네일 클리핑(doc/layer) & 래스터화 가드
 * 4. 얼굴 인식 유동화(Face-Aware Liquify) & 하모나이즈(Harmonize) & 오브젝트 세부 선택(Select Details)
 * 5. BatchPlay 액션 디스크립터 & 25종 블렌드 모드(8BIM 코드 매핑) & NGE 씬 임포터
 */

import { type ReactElement, useMemo, useState } from "react";
import {
  applyPhotoshopGlobalLightAngle,
  computePhotoshopLayerThumbnailViewport,
  doesPhotoshopLayerNeedRasterization,
  photoshopLayerEffectsToStudioPatch,
  type PhotoshopLayerEffectsStack,
  type PhotoshopLayerThumbnailClipMode,
  type PhotoshopLayerThumbnailSize,
  type PhotoshopRuntimeLayerKind,
} from "../layer/studio-photoshop-layer-styles";
import {
  importPhotoshopNgeScene,
  PHOTOSHOP_BLEND_MODE_TO_8BIM,
  PHOTOSHOP_BLEND_MODES,
  type PhotoshopBlendMode,
} from "./studio-photoshop-action-descriptor";
import {
  applyPhotoshopFaceAwareLiquifyToRgba,
  applyPhotoshopHarmonizeLayer,
  buildPhotoshopSelectDetailsMask,
  PHOTOSHOP_BODY_PARSER_DETAIL_PARTS,
  type PhotoshopBodyParserDetailPart,
} from "./studio-photoshop-liquify-harmonize";
import {
  applyPhotoshopAdjustmentPresetV2ToRgba,
  evaluatePhotoshopQuickActionEnablement,
  executePhotoshopQuickAction,
  PHOTOSHOP_ADJUSTMENT_PRESETS_V2,
  PHOTOSHOP_QUICK_ACTION_CATEGORIES,
  type PhotoshopQuickActionId,
  type PhotoshopQuickActionSessionState,
  revertPhotoshopQuickAction,
} from "./studio-photoshop-quick-actions";
import {
  applyPhotoshopWebFilterPresetToRgba,
  getPhotoshopWebFilterPresetsByCategory,
  PHOTOSHOP_WEB_FILTER_CATEGORIES,
  PHOTOSHOP_WEB_FILTER_CATEGORY_LABELS,
  type PhotoshopWebFilterCategory,
} from "./studio-photoshop-web-filter-presets";

type PhotoshopSuiteTabId =
  | "web-filters"
  | "quick-actions"
  | "layer-styles"
  | "liquify-harmonize"
  | "batchplay-formats";

const SUITE_TABS: ReadonlyArray<{
  readonly id: PhotoshopSuiteTabId;
  readonly label: string;
}> = [
  { id: "web-filters", label: "웹 필터 & 슈퍼프리셋" },
  { id: "quick-actions", label: "퀵 액션 & 조정 V2" },
  { id: "layer-styles", label: "레이어 스타일 & 클리핑" },
  { id: "liquify-harmonize", label: "유동화 & 하모나이즈" },
  { id: "batchplay-formats", label: "액션 디스크립터 & 25 블렌드" },
];

const SAMPLE_RGBA = new Uint8ClampedArray([
  180, 120, 90, 255, 110, 160, 210, 255, 220, 190, 130, 255, 70, 110, 150, 255,
]);

const SAMPLE_BG_RGBA = new Uint8ClampedArray([
  230, 175, 95, 255, 225, 170, 90, 255, 215, 165, 85, 255, 220, 168, 88, 255,
]);

export interface StudioPhotoshopFeatureSuitePanelProps {
  readonly onApplyFilterPreset?: (presetName: string, category: PhotoshopWebFilterCategory) => void;
  readonly onExecuteQuickAction?: (actionId: PhotoshopQuickActionId) => void;
}

export function StudioPhotoshopFeatureSuitePanel({
  onApplyFilterPreset,
  onExecuteQuickAction,
}: StudioPhotoshopFeatureSuitePanelProps = {}): ReactElement {
  const [activeTab, setActiveTab] = useState<PhotoshopSuiteTabId>("web-filters");

  // 1. Web Filters state
  const [selectedCategory, setSelectedCategory] =
    useState<PhotoshopWebFilterCategory>("glitch");
  const [superPresetsOnly, setSuperPresetsOnly] = useState(false);
  const [includeAdvancedProcedural, setIncludeAdvancedProcedural] = useState(true);
  const [selectedPresetName, setSelectedPresetName] = useState("shortShift");

  const visiblePresets = useMemo(
    () =>
      getPhotoshopWebFilterPresetsByCategory(selectedCategory, {
        includeAdvancedProcedural,
        superPresetsOnly,
      }),
    [selectedCategory, includeAdvancedProcedural, superPresetsOnly],
  );

  const activePreset =
    visiblePresets.find((p) => p.name === selectedPresetName) ?? visiblePresets[0];

  const filterPreviewRgba = useMemo(() => {
    if (!activePreset) return SAMPLE_RGBA;
    return applyPhotoshopWebFilterPresetToRgba(SAMPLE_RGBA, 2, 2, activePreset);
  }, [activePreset]);

  // 2. Quick Actions & Adjustment Presets V2 state
  const [quickSession, setQuickSession] = useState<PhotoshopQuickActionSessionState>({
    historyEntryId: "hist-initial",
    selectedLayerId: "layer-hero",
    layers: [
      {
        id: "layer-hero",
        name: "주인공 컷 레이어",
        kind: "pixel",
        visible: true,
        opacity: 100,
        hasUserMask: true,
        maskApplied: false,
      },
    ],
  });
  const [selectedAdjustmentPresetId, setSelectedAdjustmentPresetId] = useState(
    "cinematic_cine_neutral",
  );

  const adjustmentPreviewRgba = useMemo(
    () => applyPhotoshopAdjustmentPresetV2ToRgba(SAMPLE_RGBA, selectedAdjustmentPresetId),
    [selectedAdjustmentPresetId],
  );

  // 3. Layer Styles & Thumbnail Clipping state
  const [globalLightAngle, setGlobalLightAngle] = useState(120);
  const [thumbnailClipMode, setThumbnailClipMode] =
    useState<PhotoshopLayerThumbnailClipMode>("layer");
  const [thumbnailSize, setThumbnailSize] = useState<PhotoshopLayerThumbnailSize>("M");
  const [inspectionLayerKind, setInspectionLayerKind] =
    useState<PhotoshopRuntimeLayerKind>("smart_object");

  const syncedEffectsStack = useMemo<PhotoshopLayerEffectsStack>(() => {
    const base: PhotoshopLayerEffectsStack = {
      dropShadow: {
        enabled: true,
        blendMode: "multiply",
        color: { r: 15, g: 23, b: 42 },
        opacity: 0.65,
        angle: 120,
        useGlobalLight: true,
        distancePx: 8,
        sizePx: 14,
      },
      bevelEmboss: {
        enabled: true,
        style: "inner bevel",
        direction: "up",
        sizePx: 6,
        strength: 2,
        angle: 120,
        useGlobalLight: true,
        highlightBlendMode: "screen",
        highlightColor: { r: 255, g: 255, b: 255 },
        highlightOpacity: 0.75,
        shadowBlendMode: "multiply",
        shadowColor: { r: 0, g: 0, b: 0 },
        shadowOpacity: 0.5,
      },
    };
    return applyPhotoshopGlobalLightAngle(base, globalLightAngle);
  }, [globalLightAngle]);

  const studioPatch = useMemo(
    () => photoshopLayerEffectsToStudioPatch(syncedEffectsStack),
    [syncedEffectsStack],
  );

  const thumbnailViewport = useMemo(
    () =>
      computePhotoshopLayerThumbnailViewport({
        documentBounds: { x: 0, y: 0, width: 1600, height: 2400 },
        layerBounds: { x: 180, y: 320, width: 480, height: 640 },
        clipMode: thumbnailClipMode,
        thumbnailSize,
      }),
    [thumbnailClipMode, thumbnailSize],
  );

  // 4. Face-Aware Liquify & Harmonize state
  const [eyeSize, setEyeSize] = useState(25);
  const [mouthSmile, setMouthSmile] = useState(35);
  const [jawline, setJawline] = useState(-20);
  const [harmonizeOnNewLayer, setHarmonizeOnNewLayer] = useState(true);
  const [selectedDetailPart, setSelectedDetailPart] =
    useState<PhotoshopBodyParserDetailPart>("hair");

  const liquifyPreview = useMemo(
    () =>
      applyPhotoshopFaceAwareLiquifyToRgba(SAMPLE_RGBA, 2, 2, {
        eyeSize,
        mouthSmile,
        jawline,
      }),
    [eyeSize, mouthSmile, jawline],
  );

  const harmonizeResult = useMemo(
    () =>
      applyPhotoshopHarmonizeLayer(SAMPLE_RGBA, SAMPLE_BG_RGBA, {
        genHarmonizeOnNewLayerEnabled: harmonizeOnNewLayer,
        sourceLayerName: "주인공 컷",
      }),
    [harmonizeOnNewLayer],
  );

  const detailMaskCount = useMemo(() => {
    const mask = buildPhotoshopSelectDetailsMask(8, 8, [selectedDetailPart]);
    return mask.filter((v) => v > 0).length;
  }, [selectedDetailPart]);

  // 5. BatchPlay & Blend Mode state
  const [selectedBlendMode, setSelectedBlendMode] =
    useState<PhotoshopBlendMode>("vividlight");
  const ngeImportSummary = useMemo(
    () =>
      importPhotoshopNgeScene([
        {
          name: "NGE 주인공 레이어",
          blendMode: selectedBlendMode,
          hasSelectionMask: true,
          filters: [
            { type: "vibrance", params: { vibrance: 30, saturation: 10 } },
          ],
        },
      ]),
    [selectedBlendMode],
  );

  return (
    <section
      aria-label="포토샵 내재화 기능 스위트"
      className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4 text-fg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h2 className="text-base font-semibold text-fg">
            Adobe Photoshop 내재화 스튜디오 스위트
          </h2>
          <p className="text-xs text-fg-2">
            프로시저럴 웹 필터 24종 · 비파괴 퀵 액션 13종 · 조정 프리셋 V2 · 10종 레이어 스타일 · 얼굴 인식 유동화 · BatchPlay 액션 엔진
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="포토샵 기능 도메인 탭"
        className="flex flex-wrap gap-1.5"
      >
        {SUITE_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 ${
                isSelected
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "web-filters" ? (
        <div
          role="tabpanel"
          aria-label="웹 필터 & 슈퍼프리셋 패널"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>필터 카테고리</span>
              <select
                aria-label="포토샵 웹 필터 카테고리"
                value={selectedCategory}
                onChange={(e) => {
                  const nextCat = e.target.value as PhotoshopWebFilterCategory;
                  setSelectedCategory(nextCat);
                  const first = getPhotoshopWebFilterPresetsByCategory(nextCat)[0];
                  if (first) setSelectedPresetName(first.name);
                }}
                className="min-h-11 rounded border border-line bg-card px-2.5 text-xs text-fg"
              >
                {PHOTOSHOP_WEB_FILTER_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {PHOTOSHOP_WEB_FILTER_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={superPresetsOnly}
                onChange={(e) => setSuperPresetsOnly(e.target.checked)}
              />
              <span>슈퍼 프리셋만 보기</span>
            </label>

            <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={includeAdvancedProcedural}
                onChange={(e) => setIncludeAdvancedProcedural(e.target.checked)}
              />
              <span>고급 프로시저럴 6종 활성화</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {visiblePresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setSelectedPresetName(preset.name);
                  onApplyFilterPreset?.(preset.name, preset.category);
                }}
                className={`min-h-11 rounded-md border px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 ${
                  activePreset?.name === preset.name
                    ? "border-accent bg-accent/15 text-fg"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                {preset.uiName}
              </button>
            ))}
          </div>

          <div className="text-xs text-fg-2" data-testid="web-filter-preview-summary">
            선택 프리셋: <strong>{activePreset?.uiName ?? "없음"}</strong> · 샘플 RGBA[0..2]:{" "}
            {`${filterPreviewRgba[0]}, ${filterPreviewRgba[1]}, ${filterPreviewRgba[2]}`}
          </div>
        </div>
      ) : null}

      {activeTab === "quick-actions" ? (
        <div
          role="tabpanel"
          aria-label="퀵 액션 & 조정 V2 패널"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        >
          <div className="flex flex-wrap gap-2">
            {PHOTOSHOP_QUICK_ACTION_CATEGORIES.flatMap((c) => c.actions).map((action) => {
              const enablement = evaluatePhotoshopQuickActionEnablement(
                {
                  hasMultipleLayersSelected: false,
                  viewOnly: false,
                  noLayerSelected: false,
                  isImageLayerSelected: true,
                  isSmartObjectLayerSelected: false,
                  isAdjustmentLayerSelected: false,
                  isGroupLayerSelected: false,
                  isLayerClipped: false,
                  isLayerVisible: true,
                  layerHasContent: true,
                },
                action,
              );
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={enablement.disabled}
                  onClick={() => {
                    const res = executePhotoshopQuickAction(quickSession, action.id);
                    setQuickSession(res.state);
                    onExecuteQuickAction?.(action.id);
                  }}
                  className="min-h-11 rounded-md border border-line bg-card px-3 py-1.5 text-xs text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2"
                >
                  {action.title}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setQuickSession((prev) => revertPhotoshopQuickAction(prev))}
              className="min-h-11 rounded-md border border-line bg-card px-3 py-1.5 text-xs text-fg-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2"
            >
              마지막 퀵 액션 되돌리기
            </button>
          </div>

          <div className="text-xs text-fg-2" data-testid="quick-action-session-summary">
            레이어 수: {quickSession.layers.length} · 활성 히스토리: {quickSession.historyEntryId}
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-2">
            <span>조정 프리셋 V2</span>
            <select
              aria-label="조정 프리셋 V2 선택"
              value={selectedAdjustmentPresetId}
              onChange={(e) => setSelectedAdjustmentPresetId(e.target.value)}
              className="min-h-11 rounded border border-line bg-card px-2.5 text-xs text-fg"
            >
              {PHOTOSHOP_ADJUSTMENT_PRESETS_V2.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <span>
              출력 RGB: {adjustmentPreviewRgba[0]}, {adjustmentPreviewRgba[1]},{" "}
              {adjustmentPreviewRgba[2]}
            </span>
          </label>
        </div>
      ) : null}

      {activeTab === "layer-styles" ? (
        <div
          role="tabpanel"
          aria-label="레이어 스타일 & 클리핑 패널"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>글로벌 라이트 각도 (°)</span>
              <input
                aria-label="글로벌 라이트 각도"
                type="number"
                value={globalLightAngle}
                onChange={(e) => setGlobalLightAngle(Number(e.target.value) || 0)}
                className="min-h-11 w-24 rounded border border-line bg-card px-2 text-xs text-fg"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>썸네일 클리핑</span>
              <select
                aria-label="썸네일 클리핑 모드"
                value={thumbnailClipMode}
                onChange={(e) =>
                  setThumbnailClipMode(e.target.value as PhotoshopLayerThumbnailClipMode)
                }
                className="min-h-11 rounded border border-line bg-card px-2 text-xs text-fg"
              >
                <option value="layer">레이어 경계에 클리핑 (layer)</option>
                <option value="doc">문서 전체 경계에 클리핑 (doc)</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>썸네일 크기</span>
              <select
                aria-label="썸네일 크기"
                value={thumbnailSize}
                onChange={(e) =>
                  setThumbnailSize(e.target.value as PhotoshopLayerThumbnailSize)
                }
                className="min-h-11 rounded border border-line bg-card px-2 text-xs text-fg"
              >
                <option value="M">중간 (M · 40px)</option>
                <option value="L">크게 (L · 64px)</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>대상 레이어 종류</span>
              <select
                aria-label="대상 레이어 종류"
                value={inspectionLayerKind}
                onChange={(e) =>
                  setInspectionLayerKind(e.target.value as PhotoshopRuntimeLayerKind)
                }
                className="min-h-11 rounded border border-line bg-card px-2 text-xs text-fg"
              >
                <option value="smart_object">스마트 오브젝트 (smart_object)</option>
                <option value="text">텍스트 (text)</option>
                <option value="vector">벡터 (vector)</option>
                <option value="pixel">픽셀 (pixel)</option>
              </select>
            </label>
          </div>

          <div className="text-xs text-fg-2" data-testid="layer-style-summary">
            Konva 오프셋: ({studioPatch.shadowOffsetX}, {studioPatch.shadowOffsetY}) · 이벤트:{" "}
            {thumbnailViewport.preferenceEventName} ({thumbnailViewport.thumbnailPixelSide}px) ·{" "}
            래스터화 필요:{" "}
            {doesPhotoshopLayerNeedRasterization(inspectionLayerKind) ? "예" : "아니오"}
          </div>
        </div>
      ) : null}

      {activeTab === "liquify-harmonize" ? (
        <div
          role="tabpanel"
          aria-label="유동화 & 하모나이즈 패널"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>눈 크기</span>
              <input
                aria-label="얼굴 인식 눈 크기"
                type="number"
                value={eyeSize}
                onChange={(e) => setEyeSize(Number(e.target.value) || 0)}
                className="min-h-11 w-20 rounded border border-line bg-card px-2 text-xs text-fg"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>입 미소</span>
              <input
                aria-label="얼굴 인식 입 미소"
                type="number"
                value={mouthSmile}
                onChange={(e) => setMouthSmile(Number(e.target.value) || 0)}
                className="min-h-11 w-20 rounded border border-line bg-card px-2 text-xs text-fg"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>턱선</span>
              <input
                aria-label="얼굴 인식 턱선"
                type="number"
                value={jawline}
                onChange={(e) => setJawline(Number(e.target.value) || 0)}
                className="min-h-11 w-20 rounded border border-line bg-card px-2 text-xs text-fg"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={harmonizeOnNewLayer}
                onChange={(e) => setHarmonizeOnNewLayer(e.target.checked)}
              />
              <span>새 레이어에 하모나이즈 생성 (genHarmonizeOnNewLayer)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <span>세부 선택 부위</span>
              <select
                aria-label="Select Details 부위"
                value={selectedDetailPart}
                onChange={(e) =>
                  setSelectedDetailPart(e.target.value as PhotoshopBodyParserDetailPart)
                }
                className="min-h-11 rounded border border-line bg-card px-2 text-xs text-fg"
              >
                {PHOTOSHOP_BODY_PARSER_DETAIL_PARTS.map((part) => (
                  <option key={part} value={part}>
                    {part}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-xs text-fg-2" data-testid="liquify-harmonize-summary">
            유동화 샘플 R: {liquifyPreview[0]} · 하모나이즈 출력 레이어:{" "}
            {harmonizeResult.outputLayerName} · 세부 마스크 활성 픽셀: {detailMaskCount}
          </div>
        </div>
      ) : null}

      {activeTab === "batchplay-formats" ? (
        <div
          role="tabpanel"
          aria-label="액션 디스크립터 & 25 블렌드 패널"
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        >
          <label className="flex items-center gap-2 text-xs text-fg-2">
            <span>포토샵 25종 블렌드 모드</span>
            <select
              aria-label="포토샵 25종 블렌드 모드"
              value={selectedBlendMode}
              onChange={(e) =>
                setSelectedBlendMode(e.target.value as PhotoshopBlendMode)
              }
              className="min-h-11 rounded border border-line bg-card px-2.5 text-xs text-fg"
            >
              {PHOTOSHOP_BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode} (8BIM: &apos;{PHOTOSHOP_BLEND_MODE_TO_8BIM[mode]}&apos;)
                </option>
              ))}
            </select>
          </label>

          <div className="text-xs text-fg-2" data-testid="batchplay-summary">
            8BIM 코드: &apos;{PHOTOSHOP_BLEND_MODE_TO_8BIM[selectedBlendMode]}&apos; · NGE 생성 디스크립터 수:{" "}
            {ngeImportSummary.descriptors.length} · 생성 레이어 수:{" "}
            {ngeImportSummary.documentState.layers.length}
          </div>
        </div>
      ) : null}
    </section>
  );
}
