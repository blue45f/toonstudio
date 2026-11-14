/**
 * 3D 셰이퍼(Shaper) 원클릭 조형·헤어 옴브레·웹툰 셀셰이딩·2-아키타입 모프 블렌더 섹션 (`shaper-quick-sculpt-sections.tsx`).
 *
 * - 등신비 원클릭 프리셋 5종 (`proportion/set` + `param/set` 단일 coalesceKey → 1 Undo 단계)
 * - 안면 조형 아키타입 칩 6종 (`FACE_PARAM_KEYS` 15축 일괄 `param/set` 단일 coalesceKey → 1 Undo 단계)
 * - 헤어 투톤 옴브레 & 엔젤링 하이라이트 5종 (`hair-color/set` + `channel/set` + `look/set` 단일 coalesceKey → 1 Undo 단계)
 * - 웹툰 셀셰이딩 / SDF 그림자 / 외곽선 프리셋 4종 (`shading/set` 원자 명령 → 1 Undo 단계)
 * - 2-캐릭터 아키타입 실시간 모프 블렌더 (`blendWebtoonUniverseRecipes`, range 슬라이더는 `[-1, 1]` 불변식을 지켜 0%..100%에 대응)
 */
import { useState } from "react";

import {
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  PARAM_MAX,
  PARAM_MIN,
  clampParam,
} from "../../../contracts";
import {
  SHAPER_FACE_SCULPT_PRESETS,
  SHAPER_HAIR_OMBRE_PRESETS,
  SHAPER_HEAD_RATIO_PRESETS,
  SHAPER_TOON_SHADER_PRESETS,
  WEBTOON_UNIVERSE_SHAPER_PRESETS,
  blendWebtoonUniverseRecipes,
  buildShaperToonShadingProfile,
} from "../../../presets";
import { useCatalog, useDispatch, useLabState } from "../lab-store-context";

import type {
  ShaperFaceSculptPreset,
  ShaperHairOmbrePreset,
  ShaperHeadRatioPreset,
  ShaperToonShaderPreset,
  WebtoonUniverseShaperId,
} from "../../../presets";

const BLEND_QUICK_STEPS: readonly { readonly pct: number; readonly slider: number }[] = [
  { pct: 0, slider: -1 },
  { pct: 25, slider: -0.5 },
  { pct: 50, slider: 0 },
  { pct: 75, slider: 0.5 },
  { pct: 100, slider: 1 },
];

function sliderToAlpha(sliderVal: number): number {
  const clamped = Math.max(-1, Math.min(1, sliderVal));
  return Number(((clamped + 1) / 2).toFixed(4));
}

function pctToSlider(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Number(((clamped / 50) - 1).toFixed(4));
}

export function ShaperQuickSculptSections() {
  const { recipe } = useLabState();
  const catalog = useCatalog();
  const dispatch = useDispatch();

  const [presetA, setPresetA] = useState<WebtoonUniverseShaperId>("romance-fantasy-noble");
  const [presetB, setPresetB] = useState<WebtoonUniverseShaperId>("cyberpunk-runner");
  const [blendSlider, setBlendSlider] = useState<number>(0);

  const applyHeadRatioPreset = (preset: ShaperHeadRatioPreset): void => {
    const coalesceKey = `shaper:head-ratio:${preset.id}`;
    dispatch({
      type: "proportion/set",
      proportion: preset.proportion,
      coalesceKey,
    });
    for (const key of BODY_PARAM_KEYS) {
      const target = preset.body[key] ?? 0;
      dispatch({
        type: "param/set",
        group: "body",
        key,
        value: clampParam(target),
        coalesceKey,
      });
    }
  };

  const isHeadRatioActive = (preset: ShaperHeadRatioPreset): boolean =>
    recipe.style.proportion !== null &&
    Math.abs(recipe.style.proportion.headsTall - preset.proportion.headsTall) < 0.05;

  const applyFaceSculptPreset = (preset: ShaperFaceSculptPreset): void => {
    const coalesceKey = `shaper:face-sculpt:${preset.id}`;
    for (const key of FACE_PARAM_KEYS) {
      dispatch({
        type: "param/set",
        group: "face",
        key,
        value: clampParam(preset.face[key]),
        coalesceKey,
      });
    }
  };

  const isFaceSculptActive = (preset: ShaperFaceSculptPreset): boolean =>
    FACE_PARAM_KEYS.every((key) => Math.abs((recipe.face[key] ?? 0) - preset.face[key]) < 1e-4);

  const applyHairOmbrePreset = (preset: ShaperHairOmbrePreset): void => {
    const coalesceKey = `shaper:hair-ombre:${preset.id}`;
    dispatch({
      type: "hair-color/set",
      patch: preset.hairColor,
      coalesceKey,
    });
    dispatch({
      type: "channel/set",
      key: "hair-tip",
      value: preset.hairTipHex,
      coalesceKey,
    });
    dispatch({
      type: "channel/set",
      key: "hair-accent",
      value: preset.hairAccentHex,
      coalesceKey,
    });
    dispatch({
      type: "look/set",
      patch: { specular: preset.specular },
      coalesceKey,
    });
  };

  const isHairOmbreActive = (preset: ShaperHairOmbrePreset): boolean =>
    Math.abs(recipe.hairColor.tipMix - preset.hairColor.tipMix) < 0.02 &&
    recipe.hairColor.accent === preset.hairColor.accent &&
    recipe.shading.look.specular.hairBand === preset.specular.hairBand &&
    Math.abs(recipe.shading.look.specular.strength - preset.specular.strength) < 0.03;

  const applyToonShaderPreset = (preset: ShaperToonShaderPreset): void => {
    dispatch({
      type: "shading/set",
      profile: buildShaperToonShadingProfile(recipe.shading, preset),
    });
  };

  const isToonShaderActive = (preset: ShaperToonShaderPreset): boolean => {
    if (recipe.shading.mode !== "toon") return false;
    if (recipe.shading.toon.rampSteps !== preset.toon.rampSteps) return false;
    if (recipe.shading.toon.rim !== preset.toon.rim) return false;
    const targetWidth = preset.lookPatch.line?.widthMm;
    if (targetWidth !== undefined && Math.abs(recipe.shading.look.line.widthMm - targetWidth) > 0.05) {
      return false;
    }
    return true;
  };

  const commitBlend = (fromId: WebtoonUniverseShaperId, toId: WebtoonUniverseShaperId, sliderVal: number): void => {
    const alpha = sliderToAlpha(sliderVal);
    const blended = blendWebtoonUniverseRecipes(fromId, toId, alpha, recipe, undefined, { catalog });
    if (blended.ok) {
      dispatch({ type: "recipe/load", recipe: blended.recipe });
    }
  };

  const blendPct = Math.round(sliderToAlpha(blendSlider) * 100);

  return (
    <div className="cl-shaper-quick-sculpt" data-testid="shaper-quick-sculpt-sections">
      <div
        className="cl-param-group"
        role="group"
        aria-label="웹툰 등신비 원클릭 프리셋"
        data-testid="shaper-head-ratio-presets"
      >
        <h3 className="cl-param-subtitle">웹툰 등신비 원클릭 프리셋 (4.5~8.5등신)</h3>
        <div className="cl-param-presets">
          {SHAPER_HEAD_RATIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cl-button cl-button-small cl-shaper-chip"
              aria-pressed={isHeadRatioActive(preset)}
              data-testid={`shaper-head-ratio-${preset.id}`}
              onClick={() => applyHeadRatioPreset(preset)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div
        className="cl-param-group"
        role="group"
        aria-label="웹툰 안면 조형 아키타입 칩"
        data-testid="shaper-face-sculpt-presets"
      >
        <h3 className="cl-param-subtitle">웹툰 안면 조형 아키타입 (얼굴 15축 1-Undo 스컬프팅)</h3>
        <div className="cl-param-presets">
          {SHAPER_FACE_SCULPT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cl-button cl-button-small cl-shaper-chip"
              aria-pressed={isFaceSculptActive(preset)}
              title={preset.summaryKo}
              data-testid={`shaper-face-sculpt-${preset.id}`}
              onClick={() => applyFaceSculptPreset(preset)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div
        className="cl-param-group"
        role="group"
        aria-label="헤어 투톤 옴브레 및 엔젤링 프리셋"
        data-testid="shaper-hair-ombre-presets"
      >
        <h3 className="cl-param-subtitle">헤어 투톤 옴브레 &amp; 엔젤링 하이라이트</h3>
        <div className="cl-param-presets">
          {SHAPER_HAIR_OMBRE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cl-button cl-button-small cl-shaper-chip"
              aria-pressed={isHairOmbreActive(preset)}
              data-testid={`shaper-hair-ombre-${preset.id}`}
              onClick={() => applyHairOmbrePreset(preset)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div
        className="cl-param-group"
        role="group"
        aria-label="웹툰 셀셰이딩 및 외곽선 퀵 프리셋"
        data-testid="shaper-toon-shader-presets"
      >
        <h3 className="cl-param-subtitle">웹툰 셀셰이딩 · SDF 얼굴 그림자 · 외곽선 프리셋</h3>
        <div className="cl-param-presets">
          {SHAPER_TOON_SHADER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cl-button cl-button-small cl-shaper-chip"
              aria-pressed={isToonShaderActive(preset)}
              data-testid={`shaper-toon-shader-${preset.id}`}
              onClick={() => applyToonShaderPreset(preset)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div
        className="cl-param-group cl-shaper-blender-card"
        role="group"
        aria-label="2-캐릭터 아키타입 모프 블렌더"
        data-testid="shaper-archetype-blender"
      >
        <h3 className="cl-param-subtitle">2-캐릭터 아키타입 실시간 모프 블렌더 ({blendPct}%)</h3>
        <div className="cl-param-customize-row">
          <label htmlFor="cl-shaper-blend-a">아키타입 A</label>
          <select
            id="cl-shaper-blend-a"
            aria-label="블렌드 기준 아키타입 A"
            data-testid="shaper-blend-select-a"
            value={presetA}
            onChange={(event) => {
              const nextA = event.target.value as WebtoonUniverseShaperId;
              setPresetA(nextA);
              commitBlend(nextA, presetB, blendSlider);
            }}
          >
            {WEBTOON_UNIVERSE_SHAPER_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelKo} ({item.genreKo})
              </option>
            ))}
          </select>
          <label htmlFor="cl-shaper-blend-b">아키타입 B</label>
          <select
            id="cl-shaper-blend-b"
            aria-label="블렌드 대상 아키타입 B"
            data-testid="shaper-blend-select-b"
            value={presetB}
            onChange={(event) => {
              const nextB = event.target.value as WebtoonUniverseShaperId;
              setPresetB(nextB);
              commitBlend(presetA, nextB, blendSlider);
            }}
          >
            {WEBTOON_UNIVERSE_SHAPER_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelKo} ({item.genreKo})
              </option>
            ))}
          </select>
        </div>

        <div className="cl-param-row">
          <label htmlFor="cl-shaper-blend-range">아키타입 블렌딩 비율</label>
          <span className="cl-param-pole cl-param-pole--negative" aria-hidden="true">
            A 100%
          </span>
          <input
            id="cl-shaper-blend-range"
            type="range"
            min={PARAM_MIN}
            max={PARAM_MAX}
            step={0.02}
            value={blendSlider}
            aria-valuetext={`${blendPct}% 블렌딩`}
            data-testid="shaper-blend-slider"
            onChange={(event) => {
              const next = clampParam(Number(event.target.value));
              setBlendSlider(next);
              commitBlend(presetA, presetB, next);
            }}
          />
          <span className="cl-param-pole cl-param-pole--positive" aria-hidden="true">
            B 100%
          </span>
          <input
            type="number"
            className="cl-param-number"
            aria-label="아키타입 블렌딩 퍼센트 숫자"
            data-testid="shaper-blend-percent-input"
            min={0}
            max={100}
            step={1}
            value={blendPct}
            onChange={(event) => {
              const raw = Number(event.target.value);
              if (event.target.value.trim() === "" || !Number.isFinite(raw)) return;
              const next = pctToSlider(raw);
              setBlendSlider(next);
              commitBlend(presetA, presetB, next);
            }}
          />
          <button
            type="button"
            className="cl-button cl-button-small"
            data-testid="shaper-blend-apply-btn"
            onClick={() => commitBlend(presetA, presetB, blendSlider)}
          >
            블렌딩 적용
          </button>
        </div>

        <div className="cl-param-presets">
          {BLEND_QUICK_STEPS.map((step) => (
            <button
              key={step.pct}
              type="button"
              className="cl-button cl-button-small"
              aria-pressed={blendPct === step.pct}
              data-testid={`shaper-blend-step-${step.pct}`}
              onClick={() => {
                setBlendSlider(step.slider);
                commitBlend(presetA, presetB, step.slider);
              }}
            >
              {step.pct}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
