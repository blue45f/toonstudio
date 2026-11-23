/**
 * 글로벌 마스터 무료 기본 브러시 60종 통합 카탈로그 · 지문 검증 · 검색/필터 엔진.
 *
 * 기존 Core+Pro(246종) + MyPaint CC0(196종) = 442종에
 * 본 글로벌 마스터 컬렉션 60종을 더해 총 502종 선택 가능 무료 브러시를 구성한다.
 */
import {
  GLOBAL_MASTER_BRUSH_CATEGORY_IDS,
  type GlobalMasterBrushCategory,
  type GlobalMasterBrushCounts,
  type GlobalMasterBrushLocale,
  type GlobalMasterBrushPreset,
  type GlobalMasterCategoryMeta,
  type GlobalMasterCompetitorSource,
} from "./global-master-brush-types";
import { GLOBAL_MASTER_PRESETS_PART_1 } from "./presets-part-1-ink-deco-nature";
import { GLOBAL_MASTER_PRESETS_PART_2 } from "./presets-part-2-oriental-wc-oil";
import { GLOBAL_MASTER_PRESETS_PART_3 } from "./presets-part-3-marker-pastel-fx";
import { GLOBAL_MASTER_PRESETS_PART_4 } from "./presets-part-4-tone-surface-blend";

export const GLOBAL_MASTER_BRUSH_COUNTS: GlobalMasterBrushCounts = Object.freeze({
  coreAndPro: 246,
  mypaintCc0: 196,
  globalMaster: 60,
  totalFreeSelectable: 502,
});

export const GLOBAL_MASTER_COMPETITOR_SOURCES: readonly GlobalMasterCompetitorSource[] =
  Object.freeze([
    "CSP",
    "Procreate",
    "Photoshop",
    "Rebelle",
    "ibisPaint",
    "PaintTool SAI",
    "Krita",
  ]);

export const GLOBAL_MASTER_BRUSH_CATEGORIES: readonly GlobalMasterCategoryMeta[] = Object.freeze([
  {
    id: "webtoon-ink",
    labelKo: "웹툰·만화 잉크",
    labelEn: "Webtoon Ink",
    summaryKo: "G펜·마루펜·거친 먹펜 등 선화 강약에 집중한 잉킹 5종",
    summaryEn: "Five crisp dip, mapping, rough sumi, and cartoon liner nibs",
    count: 5,
  },
  {
    id: "rofan-deco",
    labelKo: "로판·장식 데코",
    labelEn: "Rofan Deco",
    summaryKo: "프릴 리본·앤틱 레이스·보석 체인·진주·금사 자수 5종",
    summaryEn: "Five ornate frills, antique lace, gem chains, pearls, and gold embroidery",
    count: 5,
  },
  {
    id: "nature-foliage",
    labelKo: "자연·식물",
    labelEn: "Nature & Foliage",
    summaryKo: "수채 구름·벚꽃 산란·활엽수·풀잎·장미 배경 5종",
    summaryEn: "Five clouds, drifting sakura petals, foliage canopy, grass, and roses",
    count: 5,
  },
  {
    id: "oriental-calligraphy",
    labelKo: "동양 수묵·서예",
    labelEn: "Oriental Sumi",
    summaryKo: "갈필 먹붓·한지 번짐·한글 세필·서예 평붓·먹물 비산 5종",
    summaryEn: "Five dry sumi, hanji wash bleed, fine Hangul script, flat hake, and splatter",
    count: 5,
  },
  {
    id: "granulating-watercolor",
    labelKo: "과립 수채화",
    labelEn: "Granulating Watercolor",
    summaryKo: "과립 분리·웨트 엣지 백런·투명 워시·소금 결정·습식 블리드 5종",
    summaryEn: "Five mineral granulation, backrun bloom, flat glaze, salt crystal, and wet bleed",
    count: 5,
  },
  {
    id: "impasto-oil",
    labelKo: "임파스토·유화",
    labelEn: "Impasto Oil",
    summaryKo: "팔레트 나이프·돈모 필버트·립 임파스토·웻 혼색·금박 포일 5종",
    summaryEn: "Five palette knife, hog filbert, ribbed impasto, KM7 wet oil, and gold foil",
    count: 5,
  },
  {
    id: "alcohol-marker",
    labelKo: "알코올 마커",
    labelEn: "Alcohol Marker",
    summaryKo: "코픽 브러시·치즐 평마커·0번 블렌더·건조 보드마커·형광펜 5종",
    summaryEn: "Five Copic-style brush, chisel tip, solvent blender, dry felt, and highlighter",
    count: 5,
  },
  {
    id: "graphite-pastel",
    labelKo: "연필·목탄·파스텔",
    labelEn: "Graphite & Pastel",
    summaryKo: "6B 흑연 연필·각목탄·소프트 파스텔·오일 파스텔·색연필 5종",
    summaryEn: "Five 6B graphite, square charcoal, chalk pastel, oil crayon, and colored pencil",
    count: 5,
  },
  {
    id: "light-fx-glitter",
    labelKo: "광원·글리터·마법",
    labelEn: "Light FX & Glitter",
    summaryKo: "네온 림라이트·별빛 보케·아나모픽 플레어·성운·마법진 룬 5종",
    summaryEn: "Five neon rim glow, sparkle bokeh, anamorphic flare, nebula dust, and rune sigils",
    count: 5,
  },
  {
    id: "manga-tone-speed",
    labelKo: "만화 톤·효과선",
    labelEn: "Manga Tone & Speed",
    summaryKo: "집중선·크로스해칭·도트 망점·모래 노이즈·속도선 액션 5종",
    summaryEn: "Five radial focus lines, crosshatching, halftone dots, sand noise, and speed strokes",
    count: 5,
  },
  {
    id: "hair-fabric-surface",
    labelKo: "헤어·원단·표면",
    labelEn: "Hair & Surface",
    summaryKo: "윤기 머리카락·땋은 머리·벽돌 줄눈·니트 직물·동물 털 5종",
    summaryEn: "Five glossy hair strands, braided plait, brick mortar, knit weave, and fur tufts",
    count: 5,
  },
  {
    id: "blender-eraser-pro",
    labelKo: "블렌더·지우개 프로",
    labelEn: "Blenders & Erasers",
    summaryKo: "수채 물붓·유화 스머지·떡지우개·극세 하이라이트 지우개·크로마 5종",
    summaryEn: "Five wet watercolor blender, oil smudge, kneaded putty, fine eraser, and chroma bleed",
    count: 5,
  },
]);

export const GLOBAL_MASTER_BRUSH_CATALOG: readonly GlobalMasterBrushPreset[] = Object.freeze([
  ...GLOBAL_MASTER_PRESETS_PART_1,
  ...GLOBAL_MASTER_PRESETS_PART_2,
  ...GLOBAL_MASTER_PRESETS_PART_3,
  ...GLOBAL_MASTER_PRESETS_PART_4,
]);

const PRESET_BY_ID: ReadonlyMap<string, GlobalMasterBrushPreset> = new Map(
  GLOBAL_MASTER_BRUSH_CATALOG.map((preset) => [preset.id, preset]),
);

const CATEGORY_BY_ID: ReadonlyMap<GlobalMasterBrushCategory, GlobalMasterCategoryMeta> = new Map(
  GLOBAL_MASTER_BRUSH_CATEGORIES.map((meta) => [meta.id, meta]),
);

export function getGlobalMasterBrushById(id: string): GlobalMasterBrushPreset | undefined {
  return PRESET_BY_ID.get(id);
}

export function getGlobalMasterCategoryMeta(
  category: GlobalMasterBrushCategory,
): GlobalMasterCategoryMeta {
  const found = CATEGORY_BY_ID.get(category);
  if (found) return found;
  return GLOBAL_MASTER_BRUSH_CATEGORIES[0]!;
}

/**
 * 프리셋의 순수 물리·스탬프·듀얼팁·입자·KM7 파라미터만으로 고유 지문을 계산한다.
 * id나 이름에 의존하지 않으므로 60종 전체의 물리 파라미터 중복 0건을 기계적으로 검증할 수 있다.
 */
export function computeGlobalMasterBrushFingerprint(preset: GlobalMasterBrushPreset): string {
  const physicalSignature = {
    tip: preset.tipProfile,
    dual: preset.dualTipProfile,
    grain: preset.grainTexture,
    scatter: preset.scattering,
    rotJitter: preset.rotationJitter,
    colorJitter: preset.colorJitter,
    wetness: preset.wetness,
    impasto: preset.impastoHeight,
    km7: preset.km7PigmentMix,
    taperStart: preset.taperStart,
    taperEnd: preset.taperEnd,
    pressure: preset.pressureCurve,
    spacing: preset.spacing,
    sizePx: preset.defaultSizePx,
    opacity: preset.defaultOpacity,
    blend: preset.blendBehavior,
  };
  return JSON.stringify(physicalSignature);
}

export interface GlobalMasterBrushFilterOptions {
  readonly category?: GlobalMasterBrushCategory | "all";
  readonly query?: string;
  readonly competitor?: GlobalMasterCompetitorSource | "all";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

export function filterGlobalMasterBrushes(
  options: GlobalMasterBrushFilterOptions = {},
): readonly GlobalMasterBrushPreset[] {
  const category = options.category ?? "all";
  const competitor = options.competitor ?? "all";
  const normalizedQuery = normalizeSearchText(options.query ?? "");
  const tokens = normalizedQuery.length > 0 ? normalizedQuery.split(" ") : [];

  return GLOBAL_MASTER_BRUSH_CATALOG.filter((preset) => {
    if (category !== "all" && preset.category !== category) {
      return false;
    }
    if (competitor !== "all" && !preset.competitorSources.includes(competitor)) {
      return false;
    }
    if (tokens.length === 0) {
      return true;
    }
    const categoryMeta = CATEGORY_BY_ID.get(preset.category);
    const haystack = [
      preset.id,
      preset.nameKo,
      preset.nameEn,
      preset.category,
      categoryMeta?.labelKo ?? "",
      categoryMeta?.labelEn ?? "",
      preset.signatureFeelKo,
      preset.signatureFeelEn,
      ...preset.competitorEquivalents,
      ...preset.competitorSources,
      ...preset.searchKeywords,
    ]
      .join(" ")
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

export function formatGlobalMasterCountBadge(locale: GlobalMasterBrushLocale): string {
  const { coreAndPro, mypaintCc0, globalMaster, totalFreeSelectable } =
    GLOBAL_MASTER_BRUSH_COUNTS;
  if (locale === "en") {
    return `Core+Pro ${coreAndPro} + MyPaint CC0 ${mypaintCc0} + Global Master ${globalMaster} = ${totalFreeSelectable} Free Selectable Brushes`;
  }
  return `Core+Pro ${coreAndPro} + MyPaint CC0 ${mypaintCc0} + 글로벌 마스터 ${globalMaster} = 총 ${totalFreeSelectable}종 선택 가능 무료 브러시`;
}

export { GLOBAL_MASTER_BRUSH_CATEGORY_IDS };
