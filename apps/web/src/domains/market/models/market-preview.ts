import { studioMarketplaceCc0EntrySourceMatches } from "@/domains/creator/public/marketplace-asset-access";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

/**
 * 저장 시점 버전 차이로 entries가 배열이 아닌 레코드가 와도 프리뷰 추출이
 * 던지지 않게 한다 — 프리뷰는 장식 레이어라 본문 렌더를 깨면 안 된다.
 */
function recordEntries(
  record: CreatorMarketplaceResourceRecord,
): CreatorMarketplaceResourceRecord["entries"] {
  return Array.isArray(record.entries) ? record.entries : [];
}

export interface BrushPreviewData {
  readonly name: string;
  readonly size?: number;
  readonly opacity?: number;
  readonly flow?: number;
  readonly spacing?: number;
  readonly family?: string;
  readonly blendMode?: string;
  readonly hardness?: number;
  readonly color?: string;
  readonly tip?: string;
}

export interface FilterPreviewData {
  readonly name: string;
  readonly engine: string;
  readonly values: Record<string, number | string | boolean>;
}

export interface PalettePreviewData {
  readonly name: string;
  readonly colors: readonly string[];
}

export interface TemplatePreviewData {
  readonly name: string;
  readonly templateId: string;
}

export interface RecipePreviewData {
  readonly name: string;
  readonly recipeId: string;
  readonly parameters?: Record<string, unknown>;
  readonly runtimeRef?: string;
}

/**
 * 팔레트 리소스의 portable JSON definition에서 실제 색상 배열을 꺼낸다.
 * 계약상 colors는 중복 없는 소문자 #rrggbb 1~64개이지만, 저장 시점 버전 차이에
 * 대비해 여기서 한 번 더 방어적으로 검증한다. 팔레트가 아니면 null.
 */
export function palettePreviewColors(
  record: CreatorMarketplaceResourceRecord
): readonly string[] | null {
  return palettePreviewData(record)?.[0]?.colors ?? null;
}

/**
 * A palette pack can carry several independently named color sets. Keep each valid entry so the
 * detail page can let artists inspect the whole pack instead of silently previewing only entry 1.
 */
export function palettePreviewData(
  record: CreatorMarketplaceResourceRecord
): readonly PalettePreviewData[] | null {
  if (record.kind !== "palette") return null;
  const items: PalettePreviewData[] = [];
  for (const entry of recordEntries(record)) {
    if (entry.delivery.mode !== "portable-json") continue;
    const definition = entry.delivery.payload.definition as { colors?: unknown };
    const colors = definition?.colors;
    if (
      Array.isArray(colors)
      && colors.length > 0
      && colors.every((color) => typeof color === "string" && HEX_COLOR_PATTERN.test(color))
    ) {
      items.push({ name: entry.name, colors });
    }
  }
  return items.length > 0 ? items : null;
}

export function brushPreviewData(
  record: CreatorMarketplaceResourceRecord
): readonly BrushPreviewData[] | null {
  if (record.kind !== "brush") return null;
  const items: BrushPreviewData[] = [];
  for (const entry of recordEntries(record)) {
    if (entry.delivery.mode !== "portable-json") continue;
    const definition = entry.delivery.payload.definition as { snapshot?: Record<string, unknown> };
    const snapshot = definition?.snapshot;
    if (snapshot && typeof snapshot === "object") {
      items.push({
        name: entry.name,
        size: typeof snapshot.size === "number" ? snapshot.size : undefined,
        opacity: typeof snapshot.opacity === "number" ? snapshot.opacity : undefined,
        flow: typeof snapshot.flow === "number" ? snapshot.flow : undefined,
        spacing: typeof snapshot.spacing === "number" ? snapshot.spacing : undefined,
        family: typeof snapshot.family === "string" ? snapshot.family : undefined,
        blendMode: typeof snapshot.blendMode === "string" ? snapshot.blendMode : undefined,
        hardness: typeof snapshot.hardness === "number" ? snapshot.hardness : undefined,
        color: typeof snapshot.color === "string" && HEX_COLOR_PATTERN.test(snapshot.color) ? snapshot.color : undefined,
        tip: typeof snapshot.tip === "string" ? snapshot.tip : undefined,
      });
    }
  }
  return items.length > 0 ? items : null;
}

/**
 * 필터 프리뷰 값에서 브라우저 CSS filter 문자열을 만든다. MarketFilterPreview가
 * 상세 화면에서 쓰는 근사 규칙과 같은 기준이며, 장면 합성 미리보기처럼 임의의
 * 이미지에 필터를 적용하는 표면이 공유한다. 지원하지 않는 값만 있으면 기본
 * 보정값을 돌려줘 빈 효과를 실제 효과처럼 보이게 하지 않는다.
 */
export function marketFilterCss(
  values: Record<string, number | string | boolean>,
): string {
  const filters: string[] = [];
  if (typeof values.brightness === "number") filters.push(`brightness(${values.brightness})`);
  if (typeof values.contrast === "number") filters.push(`contrast(${values.contrast})`);
  if (typeof values.saturate === "number") filters.push(`saturate(${values.saturate})`);
  else if (typeof values.saturation === "number") filters.push(`saturate(${1 + values.saturation / 100})`);
  if (typeof values.hue === "number") filters.push(`hue-rotate(${values.hue}deg)`);
  else if (typeof values.hueRotate === "number") filters.push(`hue-rotate(${values.hueRotate}deg)`);
  if (typeof values.blur === "number" && values.blur > 0) filters.push(`blur(${Math.min(8, values.blur)}px)`);
  if (typeof values.sepia === "number") filters.push(`sepia(${values.sepia})`);
  if (typeof values.grayscale === "number") filters.push(`grayscale(${values.grayscale})`);
  if (typeof values.invert === "number") filters.push(`invert(${values.invert})`);
  return filters.length > 0 ? filters.join(" ") : "contrast(1.15) saturate(1.2)";
}

export function filterPreviewData(
  record: CreatorMarketplaceResourceRecord
): readonly FilterPreviewData[] | null {
  if (record.kind !== "filter") return null;
  const items: FilterPreviewData[] = [];
  for (const entry of recordEntries(record)) {
    if (entry.delivery.mode !== "portable-json") continue;
    const definition = entry.delivery.payload.definition as {
      engine?: unknown;
      values?: Record<string, unknown>;
    };
    if (typeof definition?.engine === "string" && definition.values && typeof definition.values === "object") {
      const cleanValues: Record<string, number | string | boolean> = {};
      for (const [k, v] of Object.entries(definition.values)) {
        if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
          cleanValues[k] = v;
        }
      }
      items.push({
        name: entry.name,
        engine: definition.engine,
        values: cleanValues,
      });
    }
  }
  return items.length > 0 ? items : null;
}

export function templatePreviewData(
  record: CreatorMarketplaceResourceRecord
): readonly TemplatePreviewData[] | null {
  if (record.kind !== "template") return null;
  const items: TemplatePreviewData[] = [];
  for (const entry of recordEntries(record)) {
    if (entry.delivery.mode === "portable-json") {
      const definition = entry.delivery.payload.definition as { templateId?: unknown };
      if (typeof definition?.templateId === "string") {
        items.push({ name: entry.name, templateId: definition.templateId });
      }
    } else if (entry.delivery.mode === "builtin-ref") {
      items.push({ name: entry.name, templateId: entry.delivery.runtimeRef });
    }
  }
  return items.length > 0 ? items : null;
}

const MARKET_SCENE_REFERENCE_IMAGES: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly image: string;
}> = [
  // 순서가 의미를 가진다: 더 구체적인 장면(병원·옥상)을 넓은 패턴(복도·학교)보다 먼저 본다.
  { pattern: /hospital|nurse|emergency/u, image: "hospital_emergency_nurse_station.png" },
  { pattern: /subway/u, image: "seoul_subway_platform.png" },
  { pattern: /rooftop/u, image: "korean_school_rooftop.png" },
  { pattern: /classroom|school/u, image: "classroom_art_studio.png" },
  { pattern: /convenience|store-night/u, image: "korean_convenience_store_night.png" },
  { pattern: /cafe|coffee/u, image: "stylized_cafe_interior.png" },
  { pattern: /apartment/u, image: "compact_apartment_interior.png" },
  { pattern: /scifi|sci-fi|command/u, image: "scifi_command_corridor.png" },
  { pattern: /ruin/u, image: "fantasy_ruin_courtyard.png" },
  { pattern: /cyber|neon|alley/u, image: "urban_neon_alley.png" },
  { pattern: /hanok|joseon|market/u, image: "hanok_market_courtyard.png" },
  { pattern: /rofan|tea|fantasy/u, image: "fantasy_alchemist_workshop_library.png" },
];

/**
 * 3D 장면 레시피 id에서 실제 환경 썸네일(assets/3d refined-v6)을 찾는다.
 * bg3d 환경 카탈로그 12종과 1:1로 맞춘 표이며, 닿는 썸네일이 없으면 null —
 * 없는 장면을 비슷한 사진으로 대신 보여 주지 않는다.
 */
export function marketSceneReferenceImage(recipeId: string): string | null {
  for (const { pattern, image } of MARKET_SCENE_REFERENCE_IMAGES) {
    if (pattern.test(recipeId)) {
      return `/assets/3d/environments/refined-v6/thumbnails/${image}`;
    }
  }
  return null;
}

export function recipePreviewData(
  record: CreatorMarketplaceResourceRecord
): readonly RecipePreviewData[] | null {
  if (record.kind !== "asset" && record.kind !== "3d-preset" && record.kind !== "3d-asset") return null;
  const items: RecipePreviewData[] = [];
  for (const entry of recordEntries(record)) {
    if (!studioMarketplaceCc0EntrySourceMatches(record, entry)) continue;
    if (entry.delivery.mode === "procedural-recipe") {
      const definition = entry.delivery.payload.definition as {
        recipeId?: unknown;
        parameters?: Record<string, unknown>;
      };
      if (typeof definition?.recipeId === "string") {
        items.push({
          name: entry.name,
          recipeId: definition.recipeId,
          parameters: definition.parameters,
        });
      }
    } else if (entry.delivery.mode === "builtin-ref") {
      items.push({
        name: entry.name,
        recipeId: entry.delivery.runtimeRef,
        runtimeRef: entry.delivery.runtimeRef,
      });
    }
  }
  return items.length > 0 ? items : null;
}
