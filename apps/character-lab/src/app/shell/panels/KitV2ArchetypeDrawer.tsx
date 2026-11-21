/**
 * 웹툰 캐릭터 키트 v2(`toonstudio-kit-v2`) 5대 아키타입 서랍 컴포넌트.
 *
 * - 기본 접힘 `<details data-testid="kit-v2-archetype-drawer">`로 패널 밀도를 낮게 유지한다.
 * - Starlight OKLCH 의미 토큰(`var(--lab-*)`, `var(--shaper-*)`)과 `min-h-11`(44px) 터치 타깃,
 *   `tabular-nums`, `word-break: keep-all`을 따른다.
 */
import {
  DEFAULT_KIT_V2_CATALOG_SUMMARY,
  KIT_V2_ARCHETYPE_PRESET_LIST,
  KIT_V2_HAND_POSE_LABELS_KO,
  archetypePresetToBodyParams,
} from "../../../contracts";
import { KWEBTOON_ARCHETYPE_LIST } from "../../../presets";

import type {
  BodyParamKey,
  KitV2ArchetypeId,
  KitV2ArchetypePreset,
  ParamValues,
  WebtoonKitV2CatalogSummary,
} from "../../../contracts";
import type { KWebtoonArchetypeId, KWebtoonArchetypePreset } from "../../../presets";

export interface KitV2ArchetypeDrawerProps {
  readonly onApplyArchetypePreset: (preset: KitV2ArchetypePreset) => void;
  readonly onApplyKWebtoonArchetype?: (preset: KWebtoonArchetypePreset) => void;
  readonly currentBody?: ParamValues<BodyParamKey>;
  readonly activeArchetypeId?: KitV2ArchetypeId | null;
  readonly activeKWebtoonId?: KWebtoonArchetypeId | null;
  readonly catalogSummary?: WebtoonKitV2CatalogSummary;
}

const MATCH_EPSILON = 1e-4;

function matchesBodyPreset(preset: KitV2ArchetypePreset, body?: ParamValues<BodyParamKey>): boolean {
  if (!body) return false;
  const target = archetypePresetToBodyParams(preset);
  return (
    Math.abs((body.height ?? 0) - (target.height ?? 0)) < MATCH_EPSILON &&
    Math.abs((body.headSize ?? 0) - (target.headSize ?? 0)) < MATCH_EPSILON &&
    Math.abs((body.shoulderWidth ?? 0) - (target.shoulderWidth ?? 0)) < MATCH_EPSILON &&
    Math.abs((body.legLength ?? 0) - (target.legLength ?? 0)) < MATCH_EPSILON &&
    Math.abs((body.waist ?? 0) - (target.waist ?? 0)) < MATCH_EPSILON
  );
}

export function KitV2ArchetypeDrawer({
  onApplyArchetypePreset,
  onApplyKWebtoonArchetype,
  currentBody,
  activeArchetypeId = null,
  activeKWebtoonId = null,
  catalogSummary = DEFAULT_KIT_V2_CATALOG_SUMMARY,
}: KitV2ArchetypeDrawerProps) {
  const activePreset =
    (activeArchetypeId
      ? KIT_V2_ARCHETYPE_PRESET_LIST.find((preset) => preset.id === activeArchetypeId)
      : undefined) ?? KIT_V2_ARCHETYPE_PRESET_LIST.find((preset) => matchesBodyPreset(preset, currentBody));

  return (
    <details
      className="cl-param-group bg-panel border-line text-fg"
      data-testid="kit-v2-archetype-drawer"
      style={{
        background: "var(--lab-panel-2)",
        border: "1px solid var(--lab-line)",
        color: "var(--lab-fg)",
        wordBreak: "keep-all",
      }}
    >
      <summary
        className="min-h-11 text-fg"
        data-testid="kit-v2-archetype-summary"
        style={{
          minHeight: "44px",
          justifyContent: "space-between",
          fontWeight: 600,
          fontSize: "0.82rem",
          color: "var(--lab-fg)",
          wordBreak: "keep-all",
        }}
      >
        <span>웹툰 키트 v2 아키타입</span>
        <span
          className="text-fg-2 tabular-nums"
          style={{
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "var(--lab-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {activePreset
            ? `${activePreset.labelKo} ${activePreset.headToBodyRatio.toFixed(1)}등신`
            : `${catalogSummary.baseCount}대 체형 · ${catalogSummary.totalGlbCount}종`}
        </span>
      </summary>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          paddingTop: "8px",
          borderTop: "1px solid var(--lab-line)",
        }}
      >
        <p className="cl-param-hint text-fg-2" style={{ margin: 0, color: "var(--lab-muted)", wordBreak: "keep-all" }}>
          원하는 웹툰 체형을 누르면 키·머리 크기·어깨·다리·허리 비율이 한 번에 맞습니다.
        </p>

        <div
          role="group"
          aria-label="웹툰 키트 v2 5대 아키타입"
          data-testid="kit-v2-archetype-cards"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
            gap: "6px",
          }}
        >
          {KIT_V2_ARCHETYPE_PRESET_LIST.map((preset) => {
            const pressed = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className="cl-button min-h-11 bg-card border-line text-fg"
                aria-pressed={pressed}
                data-testid={`kit-v2-archetype-${preset.id}`}
                onClick={() => onApplyArchetypePreset(preset)}
                style={{
                  minHeight: "44px",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  gap: "2px",
                  padding: "8px 10px",
                  textAlign: "left",
                  wordBreak: "keep-all",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>
                  {preset.labelKo} {preset.headToBodyRatio.toFixed(1)}등신
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    opacity: 0.85,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {preset.genreKo} · {preset.heightM.toFixed(2)}m
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            paddingTop: "8px",
            borderTop: "1px solid var(--lab-line)",
          }}
        >
          <p className="cl-param-hint text-fg-2" style={{ margin: 0, color: "var(--lab-muted)", wordBreak: "keep-all" }}>
            한국 웹툰 완성형 아키타입 10종 — 얼굴 조형·레이어드 헤어·장르 의상·2단 셀·유색 선화를 1클릭으로 적용합니다.
          </p>
          <div
            role="group"
            aria-label="한국 웹툰 완성형 아키타입 10종"
            data-testid="kwebtoon-archetype-cards"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
              gap: "6px",
            }}
          >
            {KWEBTOON_ARCHETYPE_LIST.map((preset) => {
              const pressed = activeKWebtoonId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="cl-button min-h-11 bg-card border-line text-fg"
                  aria-pressed={pressed}
                  data-testid={`kwebtoon-archetype-${preset.id}`}
                  onClick={() => onApplyKWebtoonArchetype?.(preset)}
                  style={{
                    minHeight: "44px",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    gap: "2px",
                    padding: "8px 10px",
                    textAlign: "left",
                    wordBreak: "keep-all",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>
                    {preset.shortLabelKo} {preset.proportion.headsTall.toFixed(1)}등신
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      opacity: 0.85,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {preset.genreKo} · {preset.tagsKo[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="bg-raised border-line"
          data-testid="kit-v2-catalog-summary"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid var(--lab-line)",
            background: "var(--lab-panel)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: "4px 8px",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--lab-fg)",
            }}
          >
            <span>키트 v2 에셋 카탈로그</span>
            <span className="text-accent tabular-nums" style={{ color: "var(--lab-accent)" }}>
              베이스 {catalogSummary.baseCount} · 헤어 {catalogSummary.hairCount} · 의상 {catalogSummary.garmentCount} · 손 포즈{" "}
              {catalogSummary.handPoseCount}
            </span>
          </div>

          <div
            data-testid="kit-v2-garment-genres"
            aria-label="6대 장르 의상 카탈로그"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            {catalogSummary.garmentGenres.map((genre) => (
              <span
                key={genre.id}
                className="bg-card border-line text-fg-2 tabular-nums"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--lab-line)",
                  background: "var(--lab-panel-2)",
                  color: "var(--lab-muted)",
                  fontSize: "0.75rem",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {genre.labelKo} {genre.count}종
              </span>
            ))}
          </div>

          <p
            data-testid="kit-v2-hand-poses-summary"
            style={{
              margin: 0,
              fontSize: "0.75rem",
              lineHeight: 1.45,
              color: "var(--lab-muted)",
              wordBreak: "keep-all",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            손 포즈 {catalogSummary.handPoseCount}종:{" "}
            {catalogSummary.handPoseIds.map((poseId) => KIT_V2_HAND_POSE_LABELS_KO[poseId]).join(" · ")}
          </p>
        </div>
      </div>
    </details>
  );
}
