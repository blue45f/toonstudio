import {
  Download,
  Film,
  Layers,
  MessageSquare,
  Palette,
  Scissors,
  Shirt,
  Sliders,
  Smile,
  Sparkles,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  SHAPER_ARCHETYPE_CATALOG,
  SHAPER_CEL_SHADING_PRESETS,
  SHAPER_GENRE_FILTERS,
  SHAPER_HAIR_SILHOUETTES,
  SHAPER_OUTFIT_SETS,
  buildShaperCharacterMannequinPrimitives,
  createDefaultShaperCustomizerState,
  findShaperArchetypeSpec,
  type CharacterArchetype,
  type ShaperCelShadingPresetId,
  type ShaperGenreFilterId,
  type ShaperHairSilhouetteId,
  type ShaperOutfitSetId,
  type ShaperWebtoonCustomizerState,
} from "../scene-3d/studio-3d-shaper-toon-maker";
import type { CreatorPlusEmotionPreset, EmoteSfxKind } from "../scene-3d/studio-3d-emotion-fx";
import type { CutAspectRatio } from "../scene-3d/studio-3d-storyboard-cut-strip";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { Studio3dCharacterStudioInspectorPanel } from "./Studio3dCharacterStudioInspectorPanel";
import { StudioBg3dKitbashCharacterModelerPanel } from "./StudioBg3dKitbashCharacterModelerPanel";

export interface StudioBg3dShaperCharacterStudioPanelProps {
  readonly onExportPsd?: () => void;
  readonly onStatusChange?: (summaryKo: string) => void;
  readonly onInsertScenePrimitives?: (primitives: readonly BgPrimitive[], labelKo: string) => void;
  readonly disabled?: boolean;
}

export function StudioBg3dShaperCharacterStudioPanel({
  onExportPsd,
  onStatusChange,
  onInsertScenePrimitives,
  disabled = false,
}: StudioBg3dShaperCharacterStudioPanelProps) {
  const [activeTab, setActiveTab] = useState<"shaper" | "tooning" | "storyboard">("shaper");

  // Shaper Genre Filter & Full Webtoon Customizer State
  const [genreFilter, setGenreFilter] = useState<ShaperGenreFilterId>("all");
  const [customizer, setCustomizer] = useState<ShaperWebtoonCustomizerState>(() =>
    createDefaultShaperCustomizerState("shonen-hero-8head"),
  );
  const [isSurfaceInking, setIsSurfaceInking] = useState(false);

  // Tooning Emotion & SFX State
  const [selectedEmotion, setSelectedEmotion] = useState<CreatorPlusEmotionPreset>("joy-radiant");
  const [bubbleText, setBubbleText] = useState("너… 정말 그럴 생각이야?");
  const [selectedEmote, setSelectedEmote] = useState<EmoteSfxKind>("sweat-drop");

  // Storyboard Cut Strip State
  const [cuts, setCuts] = useState<
    Array<{ id: string; cutNumber: number; title: string; aspectRatio: CutAspectRatio }>
  >([
    { id: "cut-1", cutNumber: 1, title: "1화 도입 롱샷", aspectRatio: "21:9-wide-action" },
    { id: "cut-2", cutNumber: 2, title: "주인공 등장", aspectRatio: "1:1-square-medium" },
    { id: "cut-3", cutNumber: 3, title: "감정 클로즈업", aspectRatio: "9:16-vertical-climax" },
  ]);

  const filteredArchetypes = useMemo(
    () =>
      genreFilter === "all"
        ? SHAPER_ARCHETYPE_CATALOG
        : SHAPER_ARCHETYPE_CATALOG.filter((item) => item.genre === genreFilter),
    [genreFilter],
  );

  const liveSceneBuild = useMemo(
    () => buildShaperCharacterMannequinPrimitives(customizer),
    [customizer],
  );

  const handleSelectArchetype = (id: CharacterArchetype) => {
    const spec = findShaperArchetypeSpec(id);
    setCustomizer((prev) => ({
      ...prev,
      archetype: id,
      headRatio: spec.defaultHeadRatio,
      shoulderBalance: spec.defaultShoulderBalance,
      jawVLine: spec.defaultJawVLine,
      eyeSizeTilt: spec.defaultEyeSizeTilt,
      hairSilhouetteId: spec.defaultHairSilhouetteId,
      outfitSetId: spec.defaultOutfitSetId,
    }));
  };

  const handleSelectCelPreset = (presetId: ShaperCelShadingPresetId) => {
    const preset = SHAPER_CEL_SHADING_PRESETS.find((item) => item.id === presetId);
    setCustomizer((prev) => ({
      ...prev,
      celShadingPresetId: presetId,
      outlineThicknessMm: preset?.defaultOutlineMm ?? prev.outlineThicknessMm,
    }));
  };

  const handlePlaceCharacterInScene = () => {
    onInsertScenePrimitives?.(liveSceneBuild.primitives, liveSceneBuild.labelKo);
    onStatusChange?.(liveSceneBuild.summaryKo);
  };

  const handleAddCut = () => {
    const nextIdx = cuts.length + 1;
    setCuts((prev) => [
      ...prev,
      {
        id: `cut-${nextIdx}`,
        cutNumber: nextIdx,
        title: `새 컷 ${nextIdx}`,
        aspectRatio: "1:1-square-medium",
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      {/* Luminous Atelier Shaper Header */}
      <div className="flex items-center gap-2.5 rounded-xl border border-accent/25 bg-gradient-to-r from-card via-raised/70 to-card p-2.5 shadow-sm">
        <img
          src="/brand/luminous-atelier-20261114/icon-studio-3d-pose.webp"
          alt=""
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.72rem] font-bold tracking-tight text-fg">
              3D 캐릭터랩 &amp; 셰이퍼 스튜디오
            </span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.6rem] font-semibold text-accent">
              11 아키타입
            </span>
          </div>
          <p className="mt-0.5 text-[0.64rem] leading-snug text-fg-3">
            4~9등신 연속 비례 · V라인·눈매 조형 · 헤어 6종 · 웹툰 코디 6종 · SDF 셀셰이딩
          </p>
        </div>
      </div>

      {/* 3 Master Modes */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-card p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveTab("shaper")}
          className={`flex min-h-11 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "shaper"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <User className="h-3.5 w-3.5 text-accent" />
          <span>셰이퍼 캐릭터</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveTab("tooning")}
          className={`flex min-h-11 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "tooning"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <Smile className="h-3.5 w-3.5 text-accent" />
          <span>투닝 표정 &amp; SFX</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveTab("storyboard")}
          className={`flex min-h-11 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "storyboard"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <Film className="h-3.5 w-3.5 text-accent" />
          <span>세로 연출 &amp; PSD</span>
        </button>
      </div>

      {/* Tab 1: Shaper Character & Styling Maker */}
      {activeTab === "shaper" && (
        <div className="flex flex-col gap-3">
          {/* Genre Filter Chips */}
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              웹툰 장르 필터
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="웹툰 장르 필터">
              {SHAPER_GENRE_FILTERS.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={genreFilter === genre.id}
                  data-testid={`shaper-genre-chip-${genre.id}`}
                  onClick={() => setGenreFilter(genre.id)}
                  className={`min-h-11 rounded-lg border px-2 py-1.5 text-center text-[0.68rem] font-semibold transition-all ${
                    genreFilter === genre.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  }`}
                >
                  {genre.labelKo}
                </button>
              ))}
            </div>
          </div>

          {/* Archetype Grid */}
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              웹툰 체형 프로포션 (아키타입 · {filteredArchetypes.length}종)
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredArchetypes.map((archetype) => (
                <button
                  key={archetype.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={customizer.archetype === archetype.id}
                  data-testid={`shaper-archetype-${archetype.id}`}
                  onClick={() => handleSelectArchetype(archetype.id)}
                  className={`flex min-h-11 items-center rounded-lg border p-2 text-left text-[0.68rem] font-semibold transition-all ${
                    customizer.archetype === archetype.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  {archetype.labelKo}
                </button>
              ))}
            </div>
          </div>

          {/* Continuous Webtoon Customizer Sliders */}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/70 p-2.5">
            <div className="flex items-center gap-1.5 text-[0.7rem] font-bold text-fg">
              <Sliders className="h-3.5 w-3.5 text-accent" />
              <span>연속 체형·안면·투톤 정밀 슬라이더</span>
            </div>

            <label className="flex flex-col gap-1 text-[0.66rem] text-fg-2">
              <div className="flex justify-between">
                <span>등신비 (4.0~9.0등신)</span>
                <strong className="text-fg">{customizer.headRatio.toFixed(1)}등신</strong>
              </div>
              <input
                type="range"
                aria-label="등신비 슬라이더"
                data-testid="shaper-slider-head-ratio"
                min={4.0}
                max={9.0}
                step={0.1}
                disabled={disabled}
                value={customizer.headRatio}
                onChange={(e) =>
                  setCustomizer((prev) => ({ ...prev, headRatio: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-[0.66rem] text-fg-2">
              <div className="flex justify-between">
                <span>어깨·체형 밸런스</span>
                <strong className="text-fg">{customizer.shoulderBalance.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                aria-label="어깨·체형 밸런스 슬라이더"
                data-testid="shaper-slider-shoulder-balance"
                min={-1}
                max={1}
                step={0.05}
                disabled={disabled}
                value={customizer.shoulderBalance}
                onChange={(e) =>
                  setCustomizer((prev) => ({ ...prev, shoulderBalance: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-[0.66rem] text-fg-2">
              <div className="flex justify-between">
                <span>V라인 턱선</span>
                <strong className="text-fg">{customizer.jawVLine.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                aria-label="V라인 턱선 슬라이더"
                data-testid="shaper-slider-jaw-vline"
                min={-1}
                max={1}
                step={0.05}
                disabled={disabled}
                value={customizer.jawVLine}
                onChange={(e) =>
                  setCustomizer((prev) => ({ ...prev, jawVLine: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-[0.66rem] text-fg-2">
              <div className="flex justify-between">
                <span>눈 크기·눈매 각도</span>
                <strong className="text-fg">{customizer.eyeSizeTilt.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                aria-label="눈 크기·눈매 각도 슬라이더"
                data-testid="shaper-slider-eye-tilt"
                min={-1}
                max={1}
                step={0.05}
                disabled={disabled}
                value={customizer.eyeSizeTilt}
                onChange={(e) =>
                  setCustomizer((prev) => ({ ...prev, eyeSizeTilt: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-[0.66rem] text-fg-2">
              <div className="flex justify-between">
                <span>헤어 볼륨·투톤 그라데이션</span>
                <strong className="text-fg">{Math.round(customizer.hairVolumeOmbre * 100)}%</strong>
              </div>
              <input
                type="range"
                aria-label="헤어 볼륨·투톤 그라데이션 슬라이더"
                data-testid="shaper-slider-hair-ombre"
                min={0}
                max={1}
                step={0.05}
                disabled={disabled}
                value={customizer.hairVolumeOmbre}
                onChange={(e) =>
                  setCustomizer((prev) => ({ ...prev, hairVolumeOmbre: Number(e.target.value) }))
                }
                className="w-full accent-accent"
              />
            </label>
          </div>

          {/* Hair Silhouette Selector */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
              <Scissors className="h-3.5 w-3.5 text-accent" />
              <span>헤어 실루엣 선택 (6종)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="헤어 실루엣 선택">
              {SHAPER_HAIR_SILHOUETTES.map((hair) => (
                <button
                  key={hair.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={customizer.hairSilhouetteId === hair.id}
                  data-testid={`shaper-hair-${hair.id as ShaperHairSilhouetteId}`}
                  onClick={() =>
                    setCustomizer((prev) => ({ ...prev, hairSilhouetteId: hair.id }))
                  }
                  className={`flex min-h-11 items-center rounded-lg border px-2.5 py-1.5 text-left text-[0.67rem] font-semibold transition-all ${
                    customizer.hairSilhouetteId === hair.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  {hair.labelKo}
                </button>
              ))}
            </div>
          </div>

          {/* Webtoon Outfit Sets */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
              <Shirt className="h-3.5 w-3.5 text-accent" />
              <span>웹툰 의상 코디 세트 (6종)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="웹툰 의상 코디 세트">
              {SHAPER_OUTFIT_SETS.map((outfit) => (
                <button
                  key={outfit.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={customizer.outfitSetId === outfit.id}
                  data-testid={`shaper-outfit-${outfit.id as ShaperOutfitSetId}`}
                  onClick={() => setCustomizer((prev) => ({ ...prev, outfitSetId: outfit.id }))}
                  className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[0.67rem] font-semibold transition-all ${
                    customizer.outfitSetId === outfit.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: outfit.primaryHex }}
                  />
                  <span>{outfit.labelKo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Webtoon Cel-Shading & Outline Presets */}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/70 p-2.5">
            <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
              <Palette className="h-3.5 w-3.5 text-accent" />
              <span>웹툰 셀셰이딩 &amp; 외곽선 프리셋</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="웹툰 셀셰이딩 프리셋">
              {SHAPER_CEL_SHADING_PRESETS.map((cel) => (
                <button
                  key={cel.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={customizer.celShadingPresetId === cel.id}
                  data-testid={`shaper-cel-${cel.id}`}
                  onClick={() => handleSelectCelPreset(cel.id)}
                  className={`flex min-h-11 items-center rounded-lg border px-2 py-1.5 text-left text-[0.66rem] font-semibold transition-all ${
                    customizer.celShadingPresetId === cel.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  {cel.labelKo}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[0.65rem] text-fg-2">
              <div className="flex justify-between">
                <span>펜선 외곽선 두께</span>
                <strong className="text-fg">{customizer.outlineThicknessMm.toFixed(1)} mm</strong>
              </div>
              <input
                type="range"
                aria-label="펜선 외곽선 두께 슬라이더"
                data-testid="shaper-slider-outline-mm"
                min={0.5}
                max={8.0}
                step={0.1}
                disabled={disabled}
                value={customizer.outlineThicknessMm}
                onChange={(e) =>
                  setCustomizer((prev) => ({
                    ...prev,
                    outlineThicknessMm: Number(e.target.value),
                  }))
                }
                className="w-full accent-accent"
              />
            </label>
          </div>

          {/* Live Summary & 3D Scene Placement Action */}
          <div className="flex flex-col gap-2 rounded-xl border border-accent/35 bg-accent/10 p-2.5">
            <p
              className="text-[0.66rem] leading-relaxed text-fg-2"
              data-testid="shaper-live-character-summary"
            >
              {liveSceneBuild.summaryKo}
            </p>
            <button
              type="button"
              disabled={disabled}
              data-testid="shaper-place-scene-btn"
              onClick={handlePlaceCharacterInScene}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[0.72rem] font-bold text-bg shadow-sm transition-all hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>현재 캐릭터 설정 요약 &amp; 3D 씬 배치</span>
            </button>
          </div>

          {/* 3D Surface Direct Inking */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card/60 p-2.5 text-[0.68rem]">
            <div className="flex flex-col">
              <span className="font-bold text-fg">3D 표면 직접 잉킹 (3D Inking)</span>
              <span className="text-[0.62rem] text-fg-3">
                3D 캐릭터 표면에 그린 선이 포즈 변형 시에도 자연스럽게 따라 움직임
              </span>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsSurfaceInking(!isSurfaceInking)}
              className={`min-h-11 shrink-0 rounded-md border px-3 py-1.5 font-bold transition-all ${
                isSurfaceInking
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-card text-fg hover:bg-raised"
              }`}
            >
              {isSurfaceInking ? "잉킹 활성" : "잉킹 대기"}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Tooning Emotion & World-Space 3D SFX */}
      {activeTab === "tooning" && (
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              16종 표정 블렌드셰이프 프리셋
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                { id: "joy-radiant", label: "환한 미소" },
                { id: "smirk-villain", label: "썩소 / 능글" },
                { id: "cry-grief", label: "오열 / 눈물" },
                { id: "rage-furious", label: "분노 / 핏발" },
                { id: "blush-embarrassed", label: "수줍음 / 홍조" },
                { id: "shock-aghast", label: "경악 / 충격" },
                { id: "despair-shadow", label: "절망 / 동공풀림" },
                { id: "determination-heroic", label: "비장한 결의" },
              ].map((emotion) => (
                <button
                  key={emotion.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedEmotion(emotion.id as CreatorPlusEmotionPreset)}
                  className={`min-h-11 rounded-lg border p-1.5 text-center text-[0.68rem] font-semibold transition-all ${
                    selectedEmotion === emotion.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  {emotion.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card/60 p-2.5">
            <span className="text-[0.68rem] font-semibold text-fg-2">
              3D 월드 공간 말풍선 &amp; 대사 (Mouth Tracking)
            </span>
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-accent" />
              <input
                type="text"
                value={bubbleText}
                disabled={disabled}
                onChange={(e) => setBubbleText(e.target.value)}
                placeholder="말풍선 대사 입력..."
                className="min-h-11 w-full rounded-md border border-line bg-field px-2.5 py-1 text-[0.7rem] text-fg focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              3D 감정 이모트 스티커 파티클
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "sweat-drop", label: "땀방울 (당황)" },
                { id: "anger-cross", label: "빠직 마크 (분노)" },
                { id: "sparkle-star", label: "반짝이 (호기심)" },
                { id: "question-exclamation", label: "물음표 (!?)" },
                { id: "dark-aura", label: "암흑 오라" },
                { id: "gloom-lines", label: "세로 침울선" },
              ].map((emote) => (
                <button
                  key={emote.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedEmote(emote.id as EmoteSfxKind)}
                  className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border p-1.5 text-[0.65rem] font-semibold transition-all ${
                    selectedEmote === emote.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span>{emote.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Storyboard Vertical Strip & PSD Multi-Pass Export */}
      {activeTab === "storyboard" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold text-fg-2">
              세로 스크롤 웹툰 컷 리스트 ({cuts.length}컷)
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddCut}
              className="min-h-11 rounded-md border border-line bg-card px-3 py-1.5 text-[0.65rem] font-bold text-fg hover:bg-raised"
            >
              + 컷 추가
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {cuts.map((cut) => (
              <div
                key={cut.id}
                className="flex items-center justify-between rounded-lg border border-line bg-card/60 p-2 text-[0.68rem]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 font-bold text-accent">
                    {cut.cutNumber}
                  </span>
                  <span className="font-semibold text-fg">{cut.title}</span>
                </div>
                <span className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] text-fg-3">
                  {cut.aspectRatio}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-1 flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
            <div className="flex items-center gap-1.5 text-[0.68rem] font-bold text-fg">
              <Layers className="h-3.5 w-3.5 text-accent" />
              <span>8종 분리 레이어 PSD 마스터 내보내기</span>
            </div>
            <p className="text-[0.62rem] text-fg-3">
              선화(Line), 밑색(Flat), 1·2차 툰 음영(Shadow), 역광(Rim), 감정 SFX, 말풍선, 배경이 각각 독립 분리된 PSD로 즉시 출력됩니다.
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={onExportPsd}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[0.7rem] font-bold text-bg shadow-sm transition-all hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" />
              <span>클립스튜디오/포토샵용 PSD 내보내기</span>
            </button>
          </div>
        </div>
      )}

      {/* 파라메트릭 3D 캐릭터 아나토미·복식·포즈 블록아웃 & 배경 킷배시 모델러 */}
      <StudioBg3dKitbashCharacterModelerPanel
        defaultMode="character"
        disabled={disabled}
        onStatusChange={onStatusChange}
        onInsertScenePrimitives={onInsertScenePrimitives}
      />

      {/* Tooning 3D Studio (TD) Complete 5-Tab Inspector, 23 Camera Presets & 3D Asset Store */}
      <Studio3dCharacterStudioInspectorPanel disabled={disabled} />
    </div>
  );
}
