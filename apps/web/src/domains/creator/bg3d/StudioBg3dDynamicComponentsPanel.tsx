import {
  DoorOpen,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Sliders,
  Store,
  Clapperboard,
  MousePointerClick,
  RotateCcw,
} from "lucide-react";
import React, { useMemo, useState } from "react";

import {
  DONTDRAW_360_PANORAMA_DOME_PRESETS,
  DONTDRAW_ASSET_FORMAT_BADGES,
  DONTDRAW_STORE_TAXONOMY,
  DYNAMIC_COMPONENT_PRESETS,
  WEBTOON_ARCHETYPE_SCENE_PACKS,
  WEBTOON_SKP_MARKETPLACE_PLATFORMS,
  applyArchetypeCutDirectionPreset,
  batchSetDynamicComponentsValue,
  createDynamicComponent,
  evaluateDynamicComponentTransform,
  getWebtoonArchetypeScenePack,
  instantiateArchetypeDynamicComponents,
  setDynamicComponentValue,
  stepDynamicComponentOnClick,
  validateDontDrawAssetFormatBundle,
  type DontDrawTopCategoryId,
  type DynamicComponentKind,
  type DynamicComponentState,
  type WebtoonArchetypeCutDirectionPreset,
  type WebtoonArchetypeScenePackId,
  type WebtoonSkpMarketplacePlatformId,
} from "../scene-3d/studio-3d-dynamic-components";

export interface StudioBg3dDynamicComponentsPanelProps {
  readonly onApplyComponentTransform?: (state: DynamicComponentState) => void;
  readonly onApplyBatchComponentTransforms?: (
    states: readonly DynamicComponentState[],
    context: {
      readonly archetypeId: WebtoonArchetypeScenePackId;
      readonly preset?: WebtoonArchetypeCutDirectionPreset;
    },
  ) => void;
}

export function StudioBg3dDynamicComponentsPanel({
  onApplyComponentTransform,
  onApplyBatchComponentTransforms,
}: StudioBg3dDynamicComponentsPanelProps): React.JSX.Element {
  const [selectedKind, setSelectedKind] = useState<DynamicComponentKind>("door-single-swing");
  const [componentState, setComponentState] = useState<DynamicComponentState>(() =>
    createDynamicComponent("comp-1", "door-single-swing", false),
  );

  const [selectedPlatform, setSelectedPlatform] = useState<"all" | WebtoonSkpMarketplacePlatformId>("all");
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<WebtoonArchetypeScenePackId>(
    "fantasy-imperial-palace",
  );
  const [selectedDontDrawCategoryId, setSelectedDontDrawCategoryId] =
    useState<DontDrawTopCategoryId>("bg-modern");
  const [selectedPanoramaId, setSelectedPanoramaId] = useState<string>(
    DONTDRAW_360_PANORAMA_DOME_PRESETS[0]!.id,
  );
  const activeDontDrawCategory = useMemo(
    () =>
      DONTDRAW_STORE_TAXONOMY.find((cat) => cat.id === selectedDontDrawCategoryId) ??
      DONTDRAW_STORE_TAXONOMY[0]!,
    [selectedDontDrawCategoryId],
  );
  const activeBundleValidation = useMemo(
    () => validateDontDrawAssetFormatBundle(["skp", "cs3o", "cs3c", "clip", "laf", "pdf"]),
    [],
  );
  const [archetypeComponents, setArchetypeComponents] = useState<readonly DynamicComponentState[]>(() =>
    instantiateArchetypeDynamicComponents("fantasy-imperial-palace"),
  );
  const [activeCutPresetId, setActiveCutPresetId] = useState<string | null>(null);

  const filteredArchetypePacks = useMemo(() => {
    if (selectedPlatform === "all") return WEBTOON_ARCHETYPE_SCENE_PACKS;
    return WEBTOON_ARCHETYPE_SCENE_PACKS.filter((pack) =>
      pack.platforms.includes(selectedPlatform),
    );
  }, [selectedPlatform]);

  const activeArchetypePack = useMemo(
    () => getWebtoonArchetypeScenePack(selectedArchetypeId),
    [selectedArchetypeId],
  );

  const handleKindSelect = (kind: DynamicComponentKind) => {
    setSelectedKind(kind);
    const next = createDynamicComponent(`comp-${kind}`, kind, false);
    setComponentState(next);
    onApplyComponentTransform?.(next);
  };

  const handleToggle = () => {
    const next = setDynamicComponentValue(componentState, componentState.isOpen ? 0.0 : 1.0);
    setComponentState(next);
    onApplyComponentTransform?.(next);
  };

  const handleSliderChange = (val: number) => {
    const next = setDynamicComponentValue(componentState, val);
    setComponentState(next);
    onApplyComponentTransform?.(next);
  };

  const handleSelectArchetype = (packId: WebtoonArchetypeScenePackId) => {
    setSelectedArchetypeId(packId);
    setActiveCutPresetId(null);
    const nextComponents = instantiateArchetypeDynamicComponents(packId);
    setArchetypeComponents(nextComponents);
    if (nextComponents[0]) {
      setSelectedKind(nextComponents[0].kind);
      setComponentState(nextComponents[0]);
    }
    onApplyBatchComponentTransforms?.(nextComponents, { archetypeId: packId });
  };

  const handleApplyCutDirectionPreset = (preset: WebtoonArchetypeCutDirectionPreset) => {
    setActiveCutPresetId(preset.id);
    const nextStates = applyArchetypeCutDirectionPreset(
      archetypeComponents,
      selectedArchetypeId,
      preset.id,
    );
    setArchetypeComponents(nextStates);
    if (nextStates[0]) {
      setSelectedKind(nextStates[0].kind);
      setComponentState(nextStates[0]);
      onApplyComponentTransform?.(nextStates[0]);
    }
    onApplyBatchComponentTransforms?.(nextStates, {
      archetypeId: selectedArchetypeId,
      preset,
    });
  };

  const handleStepArchetypeComponent = (targetId: string) => {
    setActiveCutPresetId(null);
    let updatedItem: DynamicComponentState | null = null;
    const nextStates = archetypeComponents.map((item) => {
      if (item.id !== targetId) return item;
      const stepped = stepDynamicComponentOnClick(item);
      updatedItem = stepped;
      return stepped;
    });
    setArchetypeComponents(nextStates);
    if (updatedItem) {
      setSelectedKind((updatedItem as DynamicComponentState).kind);
      setComponentState(updatedItem);
      onApplyComponentTransform?.(updatedItem);
    }
    onApplyBatchComponentTransforms?.(nextStates, { archetypeId: selectedArchetypeId });
  };

  const handleBatchSetAll = (targetValue: number) => {
    setActiveCutPresetId(null);
    const nextStates = batchSetDynamicComponentsValue(archetypeComponents, targetValue);
    setArchetypeComponents(nextStates);
    if (nextStates[0]) {
      setComponentState(nextStates[0]);
      onApplyComponentTransform?.(nextStates[0]);
    }
    onApplyBatchComponentTransforms?.(nextStates, { archetypeId: selectedArchetypeId });
  };

  const currentTransform = evaluateDynamicComponentTransform(componentState);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <DoorOpen className="size-4 text-accent" />
          <span>다이나믹 인터랙션 컴포넌트</span>
        </div>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.68rem] text-accent font-semibold">
          {currentTransform.stateLabel}
        </span>
      </div>

      {/* 기성 웹툰 3D 스케치업 소재 마켓 아키타입 섹션 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-fg">
            <Store className="size-3.5 text-accent" />
            <span>기성 웹툰 스케치업(.skp) 배경 아키타입</span>
          </div>
          <span className="text-[0.62rem] text-fg-3">돈드로우 · 에이콘3D · 텀블벅 · 픽셀 호환</span>
        </div>

        {/* 플랫폼 필터 */}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSelectedPlatform("all")}
            className={`rounded px-2 py-0.5 text-[0.65rem] transition-all ${
              selectedPlatform === "all"
                ? "bg-accent font-bold text-on-accent"
                : "border border-line bg-raised text-fg-2 hover:text-fg"
            }`}
          >
            전체 마켓
          </button>
          {WEBTOON_SKP_MARKETPLACE_PLATFORMS.slice(0, 4).map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() => setSelectedPlatform(platform.id)}
              className={`rounded px-2 py-0.5 text-[0.65rem] transition-all ${
                selectedPlatform === platform.id
                  ? "bg-accent font-bold text-on-accent"
                  : "border border-line bg-raised text-fg-2 hover:text-fg"
              }`}
            >
              {platform.label}
            </button>
          ))}
        </div>

        {/* 4대 웹툰 배경 아키타입 카드 */}
        <div className="grid grid-cols-2 gap-1.5">
          {filteredArchetypePacks.map((pack) => {
            const isSelected = selectedArchetypeId === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => handleSelectArchetype(pack.id)}
                className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                    : "border-line bg-raised/50 text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <span className="text-[0.74rem] leading-tight">{pack.title}</span>
                <span className="mt-0.5 line-clamp-1 text-[0.6rem] font-normal text-fg-3">
                  {pack.genre} · 동적요소 {pack.components.length}종
                </span>
              </button>
            );
          })}
        </div>

        {/* 선택된 아키타입의 컷 연출 프리셋 */}
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[0.68rem] font-semibold text-fg-2">
              <Clapperboard className="size-3.5 text-accent" />
              <span>{activeArchetypePack.title} 컷 연출 프리셋</span>
            </div>
            <span className="font-mono text-[0.6rem] text-fg-3">
              권장 FOV {activeArchetypePack.recommendedCameraFovDeg}°
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {activeArchetypePack.cutDirectionPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyCutDirectionPreset(preset)}
                className={`flex flex-col items-start rounded border px-2 py-1.5 text-left transition-all ${
                  activeCutPresetId === preset.id
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-line bg-raised/40 text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <span className="text-[0.7rem]">{preset.label}</span>
                <span className="text-[0.6rem] font-normal text-fg-3">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 아키타입 내 동적 구성 요소 OnClick 실시간 조작 목록 */}
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-semibold text-fg-2">
              장면 내 동적 구성 요소 (SketchUp OnClick)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleBatchSetAll(1.0)}
                className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] text-fg-2 hover:text-fg"
              >
                전체 개방
              </button>
              <button
                type="button"
                onClick={() => handleBatchSetAll(0.0)}
                className="flex items-center gap-0.5 rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] text-fg-2 hover:text-fg"
              >
                <RotateCcw className="size-2.5" />
                <span>전체 닫기</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {archetypeComponents.map((comp) => {
              const evalRes = evaluateDynamicComponentTransform(comp);
              return (
                <div
                  key={comp.id}
                  className="flex items-center justify-between rounded border border-line bg-raised/30 px-2 py-1"
                >
                  <div className="flex flex-col">
                    <span className="text-[0.68rem] font-medium text-fg">{comp.label}</span>
                    <span className="font-mono text-[0.58rem] text-fg-3">
                      {comp.skpOnClickFormula} · {evalRes.stateLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStepArchetypeComponent(comp.id)}
                    aria-label={`${comp.label} OnClick 조작`}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[0.64rem] font-bold transition-all ${
                      comp.isOpen
                        ? "bg-accent text-on-accent"
                        : "border border-line bg-card text-fg-2 hover:text-fg"
                    }`}
                  >
                    <MousePointerClick className="size-3" />
                    <span>OnClick</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 개별 컴포넌트 프리셋 목록 */}
      <div className="grid grid-cols-2 gap-1.5">
        {DYNAMIC_COMPONENT_PRESETS.map((preset) => (
          <button
            key={preset.kind}
            type="button"
            onClick={() => handleKindSelect(preset.kind)}
            className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all ${
              selectedKind === preset.kind
                ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            <span className="text-[0.72rem] leading-tight">{preset.label}</span>
            <span className="mt-0.5 text-[0.62rem] text-fg-3">
              최대 범위: {preset.defaultMaxRange}
              {preset.interactionType === "revolve"
                ? "°"
                : preset.interactionType === "slide"
                  ? "m"
                  : ""}
            </span>
          </button>
        ))}
      </div>

      {/* Direct Quick Toggle & Slider Controls */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-medium text-fg-2">원클릭 열기 / 닫기</span>
          <button
            type="button"
            onClick={handleToggle}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
              componentState.isOpen
                ? "bg-accent text-on-accent shadow-sm"
                : "border border-line bg-raised text-fg-2 hover:text-fg"
            }`}
          >
            {componentState.isOpen ? (
              <>
                <ToggleRight className="size-4" />
                <span>열림 (Open)</span>
              </>
            ) : (
              <>
                <ToggleLeft className="size-4" />
                <span>닫힘 (Closed)</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[0.7rem] text-fg-2">
            <Sliders className="size-3 text-fg-3" />
            <span>개방 각도 / 슬라이드 미세 조절:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={componentState.value}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-accent"
            />
            <span className="w-8 text-right font-mono text-xs font-bold text-fg">
              {Math.round(componentState.value * 100)}%
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onApplyComponentTransform?.(componentState)}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.72rem] font-bold text-on-accent shadow-sm transition-all hover:bg-accent/90"
      >
        <Sparkles className="size-3.5" />
        <span>3D 장면에 인터랙션 상태 적용</span>
      </button>

      {/* 돈드로우(DontDraw) · 에이콘3D · 텀블벅 다중 포맷 번들 & 360도 파노라마 스카이돔 카탈로그 */}
      <div
        data-testid="dontdraw-store-taxonomy-card"
        className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-bold text-fg">
            돈드로우(DontDraw) 3D 배경·소품·360° 파노라마 분류
          </span>
          <span className="font-mono text-[0.58rem] text-accent">
            {activeBundleValidation.recommendedImportRoute}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {DONTDRAW_STORE_TAXONOMY.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedDontDrawCategoryId(cat.id)}
              className={`rounded px-1.5 py-0.5 text-[0.62rem] transition-all ${
                selectedDontDrawCategoryId === cat.id
                  ? "bg-accent font-bold text-on-accent"
                  : "border border-line bg-raised text-fg-2 hover:text-fg"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {activeDontDrawCategory.subCategories.map((sub) => (
            <span
              key={sub.id}
              className="rounded border border-line bg-raised/50 px-1.5 py-0.5 text-[0.6rem] text-fg-2"
            >
              {sub.label} ({sub.recommendedFovDeg}°)
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-line pt-1.5">
          <span className="text-[0.58rem] font-semibold text-fg-3">호환 포맷 배지:</span>
          {DONTDRAW_ASSET_FORMAT_BADGES.map((badge) => (
            <span
              key={badge.id}
              title={badge.label}
              className="rounded bg-raised px-1 py-0.5 font-mono text-[0.56rem] uppercase text-fg-2"
            >
              {badge.id}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line pt-1.5 text-[0.6rem]">
          <span className="font-semibold text-fg-2">360° 파노라마 스카이돔:</span>
          <select
            aria-label="360도 파노라마 스카이돔 선택"
            value={selectedPanoramaId}
            onChange={(e) => setSelectedPanoramaId(e.target.value)}
            className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] text-fg"
          >
            {DONTDRAW_360_PANORAMA_DOME_PRESETS.map((pano) => (
              <option key={pano.id} value={pano.id}>
                {pano.title} ({pano.resolutionPx[0]}×{pano.resolutionPx[1]})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
