/**
 * ParamPanel v3 커스터마이즈 섹션:
 * - 화풍 팩 8종 (`style/apply`)
 * - 화풍 비례 목표 6축 (`proportion/set`, 숫자 입력으로 `getAllByRole("slider")` [-1,1] 불변식 보존)
 * - 파츠 형태 슬라이더 (`part-param/set`, 범위 [-1, 1])
 * - 헤어 색 흐름 (`hair-color/set`)
 * - 파생 색 채널 (`channel/set`) 및 표면 재질·무늬 (`surface/set`)
 * - 미지원 커스터마이즈 사유 (`plan.unsupportedCustom`)
 */
import { useState } from "react";

import {
  CHANNEL_LABELS_KO,
  DERIVED_CHANNEL_KEYS,
  HAIR_ACCENT_MODES,
  MATERIAL_PRESET_IDS,
  PARAM_MAX,
  PARAM_MIN,
  PATTERN_KINDS,
  PATTERN_LABELS_KO,
  PROPORTION_KEYS,
  PROPORTION_RANGES,
  STYLE_APPLY_SCOPE_LABELS_KO,
  clampParam,
  clampProportion,
  resolveChannelColor,
} from "../../../contracts";
import { DEFAULT_PROPORTION_SPEC } from "../../../domains/humanoid/proportions";
import { ART_STYLE_PACKS } from "../../../presets";
import { useApplyPlan, useDispatch, useLabState } from "../lab-store-context";

import type {
  ArtStylePack,
  ChannelKey,
  DerivedChannelKey,
  HairAccentMode,
  MaterialPresetId,
  PartScope,
  PatternKind,
  Proportion,
  ProportionKey,
  StyleApplyScope,
  StyleFigure,
} from "../../../contracts";

const PROPORTION_LABELS_KO: Readonly<Record<ProportionKey, string>> = {
  headsTall: "목표 두신(등신)",
  legRatio: "다리 길이 비",
  armRatio: "팔 길이 비",
  shoulderHeads: "어깨 너비(두신 배)",
  headWidthRatio: "머리 가로비",
  handScale: "손 크기 배율",
};

const PART_SHAPE_CONTROLS: ReadonlyArray<{
  readonly scope: PartScope;
  readonly shape: string;
  readonly labelKo: string;
}> = [
  { scope: "hair", shape: "bangs", labelKo: "앞머리 길이(bangs)" },
  { scope: "hair", shape: "volume", labelKo: "헤어 볼륨(volume)" },
  { scope: "top", shape: "fit", labelKo: "상의 핏(fit)" },
  { scope: "bottom", shape: "flare", labelKo: "하의 플레어(flare)" },
];

const HAIR_ACCENT_LABELS_KO: Readonly<Record<HairAccentMode, string>> = {
  none: "없음",
  streak: "브릿지 줄기(streak)",
  inner: "안쪽 시크릿 투톤(inner)",
};

export function ParamCustomizeSections() {
  const { recipe } = useLabState();
  const dispatch = useDispatch();
  const plan = useApplyPlan();

  const [figure, setFigure] = useState<StyleFigure>("feminine");
  const [scope, setScope] = useState<StyleApplyScope>({
    look: true,
    proportion: true,
    face: false,
    palette: false,
  });
  const [selectedDerivedChannel, setSelectedDerivedChannel] = useState<DerivedChannelKey>("lip");
  const [selectedSurfaceChannel, setSelectedSurfaceChannel] = useState<ChannelKey>("top");

  const currentProportion: Proportion = recipe.style.proportion ?? DEFAULT_PROPORTION_SPEC;

  const handleApplyStylePack = (pack: ArtStylePack): void => {
    const effectiveScope: StyleApplyScope =
      !scope.look && !scope.proportion && !scope.palette
        ? { ...scope, look: true }
        : { ...scope, face: false };
    dispatch({
      type: "style/apply",
      pack,
      figure,
      scope: effectiveScope,
    });
  };

  const handleProportionNumber = (key: ProportionKey, raw: string): void => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    const clamped = clampProportion(key, parsed);
    dispatch({
      type: "proportion/set",
      proportion: {
        ...currentProportion,
        [key]: clamped,
      },
      coalesceKey: `proportion:${key}`,
    });
  };

  const derivedEffectiveHex = resolveChannelColor(recipe.colors, selectedDerivedChannel);
  const derivedExplicit = recipe.colors[selectedDerivedChannel] !== undefined;
  const activeSurface = recipe.surfaces[selectedSurfaceChannel] ?? null;
  const unsupportedCustom = plan?.unsupportedCustom ?? [];

  return (
    <div className="cl-param-customize" data-testid="param-customize-sections">
      <div className="cl-param-group" role="group" aria-label="화풍 팩 적용">
        <h3 className="cl-param-subtitle">화풍 팩 (T1 8종 · copy-on-apply)</h3>
        <div className="cl-param-customize-row">
          <label htmlFor="cl-style-figure-select">비례 체형 기준</label>
          <select
            id="cl-style-figure-select"
            aria-label="화풍 비례 체형 기준"
            data-testid="style-figure-select"
            value={figure}
            onChange={(event) => setFigure(event.target.value as StyleFigure)}
          >
            <option value="feminine">여성형 비례 (feminine)</option>
            <option value="masculine">남성형 비례 (masculine)</option>
          </select>
          {(["look", "proportion", "palette"] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                data-testid={`style-scope-${key}`}
                checked={scope[key]}
                onChange={(event) => setScope((prev) => ({ ...prev, [key]: event.target.checked }))}
              />
              {STYLE_APPLY_SCOPE_LABELS_KO[key]} 포함
            </label>
          ))}
        </div>
        <div className="cl-param-presets">
          {ART_STYLE_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="cl-button cl-button-small"
              aria-pressed={recipe.style.packId === pack.id}
              data-testid={`style-pack-apply-${pack.id}`}
              onClick={() => handleApplyStylePack(pack)}
            >
              화풍 팩: {pack.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-param-group" role="group" aria-label="화풍 비례 목표">
        <h3 className="cl-param-subtitle">화풍 비례 6축 목표</h3>
        <div className="cl-param-customize-grid">
          {PROPORTION_KEYS.map((key) => {
            const range = PROPORTION_RANGES[key];
            const val = currentProportion[key];
            return (
              <div key={key} className="cl-param-row" data-proportion={key}>
                <label htmlFor={`cl-proportion-${key}`}>{PROPORTION_LABELS_KO[key]}</label>
                <input
                  id={`cl-proportion-${key}`}
                  type="number"
                  className="cl-param-number"
                  aria-label={`${PROPORTION_LABELS_KO[key]} 목표값`}
                  data-testid={`proportion-input-${key}`}
                  min={range.min}
                  max={range.max}
                  step={0.05}
                  value={Number(val.toFixed(2))}
                  onChange={(event) => handleProportionNumber(key, event.target.value)}
                />
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="cl-button cl-button-small"
          data-testid="proportion-reset-btn"
          disabled={recipe.style.proportion === null}
          onClick={() => dispatch({ type: "proportion/set", proportion: null })}
        >
          화풍 비례 초기화
        </button>
      </div>

      <div className="cl-param-group" role="group" aria-label="파츠 형태 세부 조절">
        <h3 className="cl-param-subtitle">파츠 형태 조절 (앞머리·볼륨·상의 핏·하의 플레어)</h3>
        {PART_SHAPE_CONTROLS.map((ctrl) => {
          const currentVal = recipe.partParams[ctrl.scope]?.[ctrl.shape] ?? 0;
          return (
            <div key={`${ctrl.scope}:${ctrl.shape}`} className="cl-param-row" data-part-shape={`${ctrl.scope}/${ctrl.shape}`}>
              <label htmlFor={`cl-part-shape-${ctrl.scope}-${ctrl.shape}`}>{ctrl.labelKo}</label>
              <input
                id={`cl-part-shape-${ctrl.scope}-${ctrl.shape}`}
                type="range"
                min={PARAM_MIN}
                max={PARAM_MAX}
                step={0.05}
                value={currentVal}
                aria-label={ctrl.labelKo}
                data-testid={`part-param-slider-${ctrl.scope}-${ctrl.shape}`}
                onChange={(event) =>
                  dispatch({
                    type: "part-param/set",
                    scope: ctrl.scope,
                    shape: ctrl.shape,
                    value: clampParam(Number(event.target.value)),
                    coalesceKey: `part-param:${ctrl.scope}:${ctrl.shape}`,
                  })
                }
              />
              <button
                type="button"
                className="cl-param-reset"
                disabled={currentVal === 0}
                onClick={() => dispatch({ type: "part-param/set", scope: ctrl.scope, shape: ctrl.shape, value: 0 })}
              >
                형태 초기화
              </button>
            </div>
          );
        })}
      </div>

      <div className="cl-param-group" role="group" aria-label="헤어 색 흐름과 파생 채널">
        <h3 className="cl-param-subtitle">헤어 색 흐름 · 파생 색 채널 · 표면 무늬</h3>
        <div className="cl-param-customize-row">
          <label htmlFor="cl-hair-tip-mix">헤어 끝 색 비율(tipMix)</label>
          <input
            id="cl-hair-tip-mix"
            type="number"
            className="cl-param-number"
            aria-label="헤어 끝 색 비율 숫자"
            data-testid="hair-color-tip-mix"
            min={0}
            max={1}
            step={0.05}
            value={Number(recipe.hairColor.tipMix.toFixed(2))}
            onChange={(event) => {
              const num = Number(event.target.value);
              if (Number.isFinite(num)) {
                dispatch({
                  type: "hair-color/set",
                  patch: { tipMix: Math.min(1, Math.max(0, num)) },
                  coalesceKey: "hair-color:tipMix",
                });
              }
            }}
          />
          <label htmlFor="cl-hair-accent-mode">헤어 포인트</label>
          <select
            id="cl-hair-accent-mode"
            aria-label="헤어 포인트 위치"
            data-testid="hair-color-accent-select"
            value={recipe.hairColor.accent}
            onChange={(event) =>
              dispatch({
                type: "hair-color/set",
                patch: { accent: event.target.value as HairAccentMode },
              })
            }
          >
            {HAIR_ACCENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {HAIR_ACCENT_LABELS_KO[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className="cl-param-customize-row">
          <label htmlFor="cl-derived-channel-select">파생 색 채널</label>
          <select
            id="cl-derived-channel-select"
            aria-label="파생 색 채널 선택"
            data-testid="derived-channel-select"
            value={selectedDerivedChannel}
            onChange={(event) => setSelectedDerivedChannel(event.target.value as DerivedChannelKey)}
          >
            {DERIVED_CHANNEL_KEYS.map((key) => (
              <option key={key} value={key}>
                {CHANNEL_LABELS_KO[key]} ({key})
              </option>
            ))}
          </select>
          <input
            type="color"
            aria-label="파생 채널 색 지정"
            data-testid="derived-channel-color-input"
            value={derivedEffectiveHex}
            onChange={(event) =>
              dispatch({
                type: "channel/set",
                key: selectedDerivedChannel,
                value: event.target.value.toLowerCase(),
                coalesceKey: `channel:${selectedDerivedChannel}`,
              })
            }
          />
          <button
            type="button"
            className="cl-button cl-button-small"
            data-testid="derived-channel-inherit-btn"
            disabled={!derivedExplicit}
            onClick={() => dispatch({ type: "channel/set", key: selectedDerivedChannel, value: null })}
          >
            상속으로 되돌리기
          </button>
        </div>

        <div className="cl-param-customize-row">
          <label htmlFor="cl-surface-channel-select">표면 대상 채널</label>
          <select
            id="cl-surface-channel-select"
            aria-label="표면 대상 채널 선택"
            data-testid="surface-channel-select"
            value={selectedSurfaceChannel}
            onChange={(event) => setSelectedSurfaceChannel(event.target.value as ChannelKey)}
          >
            {(["top", "bottom", "inner", "outer", "legwear", "shoes", "accessory"] as const).map((key) => (
              <option key={key} value={key}>
                {CHANNEL_LABELS_KO[key]}
              </option>
            ))}
          </select>
          <label htmlFor="cl-surface-material-select">재질</label>
          <select
            id="cl-surface-material-select"
            aria-label="표면 재질 프리셋"
            data-testid="surface-material-select"
            value={activeSurface?.material ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                dispatch({ type: "surface/set", channel: selectedSurfaceChannel, surface: null });
                return;
              }
              dispatch({
                type: "surface/set",
                channel: selectedSurfaceChannel,
                surface: {
                  material: raw as MaterialPresetId,
                  pattern: activeSurface?.pattern ?? null,
                },
              });
            }}
          >
            <option value="">기본 재질</option>
            {MATERIAL_PRESET_IDS.map((matId) => (
              <option key={matId} value={matId}>
                {matId}
              </option>
            ))}
          </select>
          <label htmlFor="cl-surface-pattern-select">무늬</label>
          <select
            id="cl-surface-pattern-select"
            aria-label="표면 무늬 종류"
            data-testid="surface-pattern-select"
            value={activeSurface?.pattern?.kind ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              const material: MaterialPresetId = activeSurface?.material ?? "cloth-cotton";
              if (raw === "") {
                dispatch({
                  type: "surface/set",
                  channel: selectedSurfaceChannel,
                  surface: activeSurface ? { material, pattern: null } : null,
                });
                return;
              }
              const inkChannel: ChannelKey = selectedSurfaceChannel === "accessory" ? "top" : "accessory";
              dispatch({
                type: "surface/set",
                channel: selectedSurfaceChannel,
                surface: {
                  material,
                  pattern: {
                    kind: raw as PatternKind,
                    scaleCm: 3,
                    angleDeg: 0,
                    ratio: 0.5,
                    inkChannel,
                  },
                },
              });
            }}
          >
            <option value="">무늬 없음</option>
            {PATTERN_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PATTERN_LABELS_KO[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {unsupportedCustom.length > 0 ? (
        <div className="cl-param-unsupported-custom" role="note" aria-label="미지원 커스터마이즈 사유" data-testid="param-unsupported-custom">
          {unsupportedCustom.map((item) => (
            <p key={`${item.kind}:${item.key}`} className="cl-param-reason">
              커스터마이즈 미적용 ({item.kind} · {item.key}): {item.reasonKo}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
