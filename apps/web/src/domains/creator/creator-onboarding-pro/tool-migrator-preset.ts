/**
 * 신규 작가 30초 정착 위자드 핵심 엔진:
 * 1) Clip Studio Paint · Procreate · Photoshop · Krita 원클릭 단축키 프로필 매퍼
 * 2) `.abr` · `.sut` · `.kpp` · `.brush`/`.brushset` 파일명 및 바이너리 헤더 메타데이터 기반
 *    ToonStudio 7밴드 분광 정본 브러시 자동 추천 엔진
 *
 * 설계 불변식: 100% 브라우저 로컬 ₩0 결정적 계산, `any` 0건, 브라우저 키-값 저장소 직접 호출 0건.
 */

import type { BrushQualityFamilyId } from "../drawing/brush-quality-soak-guard";
import type { BrushFrictionMediumId, PaperToothPresetId } from "../imaging-pro/brush-texture-max";
import { STUDIO_SHORTCUT_ACTIONS, type StudioShortcutActionId } from "../studio-app-settings";
import type { TextureMaxGranulationPresetId, TextureMaxInspectorPresetId } from "./brush-texture-max-inspector-bridge";

export type MigratorSourceToolId = "clip-studio" | "procreate" | "photoshop" | "krita";
export type ImportedBrushFileFormat = "abr" | "sut" | "kpp" | "procreate-brush" | "unknown";

export const STUDIO_QUICK_MIGRATE_SHORTCUT_EVENT = "toonspectrum:studio-shortcut-preset-change" as const;
export const STUDIO_QUICK_MIGRATE_APPLIED_EVENT = "toonstudio:quick-migrate-applied" as const;

export interface ToolShortcutHighlight {
  readonly actionId: StudioShortcutActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly keys: string;
  readonly originHintKo: string;
  readonly originHintEn: string;
}

export interface ToolMigratorProfile {
  readonly id: MigratorSourceToolId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly badgeText: string;
  readonly taglineKo: string;
  readonly taglineEn: string;
  readonly compatibleShortcutPresetId: "clip-studio" | "procreate-web" | "photoshop" | "toonstudio-default";
  readonly shortcutOverrides: Readonly<Partial<Record<StudioShortcutActionId, string>>>;
  readonly highlights: readonly ToolShortcutHighlight[];
  readonly gestureHintsKo: readonly string[];
  readonly gestureHintsEn: readonly string[];
  readonly nativeBrushExtensions: readonly string[];
  readonly defaultCanonicalBrushId: SpectralCanonicalBrushId;
  readonly defaultTexturePresetId: TextureMaxInspectorPresetId;
  readonly defaultPaperPresetId: PaperToothPresetId;
}

export interface MigratedShortcutDiffEntry {
  readonly actionId: StudioShortcutActionId;
  readonly labelKo: string;
  readonly previousKeys: string;
  readonly nextKeys: string;
}

export interface MigratedShortcutPlan {
  readonly toolId: MigratorSourceToolId;
  readonly compatibleShortcutPresetId: ToolMigratorProfile["compatibleShortcutPresetId"];
  readonly shortcuts: Readonly<Record<StudioShortcutActionId, string>>;
  readonly changedEntries: readonly MigratedShortcutDiffEntry[];
  readonly conflictChords: readonly string[];
}

export type SpectralCanonicalBrushId =
  | "km7-gpen-ink"
  | "km7-graphite-2b"
  | "km7-charcoal-laid"
  | "km7-watercolor-granulation"
  | "km7-oil-impasto-30deg"
  | "km7-sumi-dry-rake"
  | "km7-wax-crayon"
  | "km7-soft-pastel"
  | "km7-alcohol-marker"
  | "km7-soft-airbrush"
  | "km7-splatter-spray"
  | "km7-chalk-stick";

export interface SpectralCanonicalBrushSpec {
  readonly id: SpectralCanonicalBrushId;
  readonly familyId: BrushQualityFamilyId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly paperPresetId: PaperToothPresetId;
  readonly frictionMediumId: BrushFrictionMediumId;
  readonly granulationPresetId: TextureMaxGranulationPresetId | null;
  readonly texturePresetId: TextureMaxInspectorPresetId;
  readonly spectralNoteKo: string;
  readonly spectralNoteEn: string;
  readonly keywords: readonly string[];
}

export interface ImportedBrushFileInput {
  readonly fileName: string;
  readonly byteLength?: number;
  readonly headerBytes?: Uint8Array;
  readonly sourceToolHint?: MigratorSourceToolId;
}

export interface BrushHeaderMetadataInspection {
  readonly detectedFormat: ImportedBrushFileFormat;
  readonly headerVerified: boolean;
  readonly inspectionMode: "header-and-filename" | "filename-only";
  readonly formatVersionLabel: string;
  readonly sectionKeys: readonly string[];
  readonly extractedTokens: readonly string[];
  readonly warningKo: string | null;
  readonly warningEn: string | null;
}

export interface SpectralBrushRecommendation {
  readonly fileName: string;
  readonly detectedFormat: ImportedBrushFileFormat;
  readonly headerInspection: BrushHeaderMetadataInspection;
  readonly primary: SpectralCanonicalBrushSpec;
  readonly alternatives: readonly SpectralCanonicalBrushSpec[];
  readonly confidence01: number;
  readonly matchedSignals: readonly string[];
  readonly reasonKo: string;
  readonly reasonEn: string;
}

const DEFAULT_SHORTCUT_MAP: Readonly<Record<StudioShortcutActionId, string>> = Object.freeze(
  STUDIO_SHORTCUT_ACTIONS.reduce((acc, item) => {
    acc[item.id] = item.defaultKeys;
    return acc;
  }, {} as Record<StudioShortcutActionId, string>),
);

const ACTION_LABEL_KO: Readonly<Record<StudioShortcutActionId, string>> = Object.freeze(
  STUDIO_SHORTCUT_ACTIONS.reduce((acc, item) => {
    acc[item.id] = item.label;
    return acc;
  }, {} as Record<StudioShortcutActionId, string>),
);

const hl = (
  actionId: StudioShortcutActionId,
  labelKo: string,
  labelEn: string,
  keys: string,
  originHintKo: string,
  originHintEn: string,
): ToolShortcutHighlight => Object.freeze({ actionId, labelKo, labelEn, keys, originHintKo, originHintEn });

export const TOOL_MIGRATOR_PROFILES: Readonly<Record<MigratorSourceToolId, ToolMigratorProfile>> = Object.freeze({
  "clip-studio": Object.freeze({
    id: "clip-studio", nameKo: "클립스튜디오 페인트", nameEn: "Clip Studio Paint", badgeText: "CSP",
    taglineKo: "펜 P · 투명색 C · 반전 H 그대로 웹툰 선화를 이어갑니다.",
    taglineEn: "Keep P pen, C transparent ink, and H flip for webtoon inking.",
    compatibleShortcutPresetId: "clip-studio",
    shortcutOverrides: Object.freeze({
      "tool-pen": "P", "tool-pixel": "B", "tool-eraser": "E", "tool-blend": "J",
      "tool-liquify": "Shift+J", "toggle-transparent-color": "C", "tool-crop": "Shift+C",
      "flip-canvas": "H", redo: "Mod+Y",
    }),
    highlights: Object.freeze([
      hl("tool-pen", "펜 / 선화", "Pen / Inking", "P", "CSP 펜 도구", "CSP Pen tool"),
      hl("toggle-transparent-color", "투명색 전환", "Transparent Ink", "C", "CSP 투명색 지우기", "CSP Transparent toggle"),
      hl("tool-pixel", "브러시 / 연필", "Brush / Pencil", "B", "CSP 브러시 군", "CSP Brush group"),
      hl("flip-canvas", "좌우 반전 보기", "Flip View", "H", "CSP 캔버스 반전", "CSP Flip Horizontal"),
    ]),
    gestureHintsKo: Object.freeze(["C 키로 현재 브러시 질감 그대로 지우기(투명색)", ".sut 브러시를 올리면 7밴드 분광 정본 브러시로 자동 대응"]),
    gestureHintsEn: Object.freeze(["Press C to erase with active brush texture", "Drop .sut files to map to 7-band spectral canonical brushes"]),
    nativeBrushExtensions: Object.freeze([".sut", ".abr"]),
    defaultCanonicalBrushId: "km7-gpen-ink", defaultTexturePresetId: "webtoon-ink-clean", defaultPaperPresetId: "hot-press",
  }),
  procreate: Object.freeze({
    id: "procreate", nameKo: "프로크리에이트", nameEn: "Procreate", badgeText: "PRC",
    taglineKo: "Space 퀵 메뉴와 B·E·H 조합으로 아이패드 감각을 살립니다.",
    taglineEn: "Space quick HUD with B, E, and H tuned for tactile sketching.",
    compatibleShortcutPresetId: "procreate-web",
    shortcutOverrides: Object.freeze({
      "tool-pen": "B", "tool-eraser": "E", "tool-blend": "S", "tool-hand": "Alt+Space",
      "quick-hud": "Space", "flip-canvas": "H", "fit-view": "Mod+0", "actual-size-view": "Mod+1",
    }),
    highlights: Object.freeze([
      hl("tool-pen", "브러시", "Brush", "B", "Procreate Paint", "Procreate Paint"),
      hl("tool-blend", "스머지 / 블렌드", "Smudge / Blend", "S", "Procreate Smudge", "Procreate Smudge"),
      hl("quick-hud", "퀵 메뉴 HUD", "QuickMenu HUD", "Space", "Procreate QuickMenu", "Procreate QuickMenu"),
      hl("flip-canvas", "좌우 반전", "Flip Horizontal", "H", "Procreate 빠른 반전", "Procreate Quick Flip"),
    ]),
    gestureHintsKo: Object.freeze(["두 손가락 탭 실행취소 · 세 손가락 탭 다시실행 지원", "틸트 음영이 살아있는 황목·레이드지 프리셋 기본 연결"]),
    gestureHintsEn: Object.freeze(["Two-finger tap undo and three-finger tap redo supported", "Tilt shading paired with cold-press and laid paper presets"]),
    nativeBrushExtensions: Object.freeze([".brush", ".brushset", ".abr"]),
    defaultCanonicalBrushId: "km7-watercolor-granulation", defaultTexturePresetId: "watercolor-granulation", defaultPaperPresetId: "rough-watercolor",
  }),
  photoshop: Object.freeze({
    id: "photoshop", nameKo: "포토샵", nameEn: "Photoshop", badgeText: "PS",
    taglineKo: "B 브러시 · E 지우개 · G 채우기 · [ ] 크기 조절을 그대로 씁니다.",
    taglineEn: "Familiar B brush, E eraser, G fill, and [ ] size controls.",
    compatibleShortcutPresetId: "photoshop",
    shortcutOverrides: Object.freeze({
      "tool-pen": "B", "tool-eraser": "E", "tool-select": "V", "tool-marquee": "M",
      "tool-lasso": "L", "tool-fill": "G", "tool-crop": "C", redo: "Mod+Shift+Z",
      "flip-canvas": "Shift+H", "flip-selection-h": "Alt+Shift+H", "quick-hud": "Shift+Space",
    }),
    highlights: Object.freeze([
      hl("tool-pen", "브러시", "Brush", "B", "PS Brush Tool", "PS Brush Tool"),
      hl("tool-fill", "채우기", "Fill", "G", "PS Paint Bucket", "PS Paint Bucket"),
      hl("tool-crop", "자르기", "Crop", "C", "PS Crop Tool", "PS Crop Tool"),
      hl("redo", "다시실행", "Redo", "Mod+Shift+Z", "PS Step Forward", "PS Step Forward"),
    ]),
    gestureHintsKo: Object.freeze([".abr (v1/v2/v6 8BIM) 브러시 팩을 올려 분광 유화·에어브러시로 매핑", "Shift+H 좌우 반전 보기 · X 전경/배경색 교체 유지"]),
    gestureHintsEn: Object.freeze(["Drop .abr (v1/v2/v6 8BIM) packs to map to spectral oil & airbrush", "Keeps Shift+H view flip and X foreground/background swap"]),
    nativeBrushExtensions: Object.freeze([".abr"]),
    defaultCanonicalBrushId: "km7-oil-impasto-30deg", defaultTexturePresetId: "oil-impasto-30deg", defaultPaperPresetId: "cold-press",
  }),
  krita: Object.freeze({
    id: "krita", nameKo: "크리타", nameEn: "Krita", badgeText: "KRT",
    taglineKo: "F 채우기 · P 스포이드 · M 좌우 반전 · Tab 캔버스 집중을 유지합니다.",
    taglineEn: "Preserves F fill, P color sampler, M mirror view, and Tab HUD.",
    compatibleShortcutPresetId: "toonstudio-default",
    shortcutOverrides: Object.freeze({
      "tool-pen": "B", "tool-pixel": "Shift+B", "tool-eraser": "E", "tool-fill": "F",
      "tool-eyedropper": "P", "flip-canvas": "M", "tool-marquee": "Mod+R",
      "quick-hud": "Tab", "toggle-chrome": "Shift+Tab",
    }),
    highlights: Object.freeze([
      hl("tool-fill", "채우기", "Fill", "F", "Krita Fill Tool", "Krita Fill Tool"),
      hl("tool-eyedropper", "색 가져오기", "Color Sampler", "P", "Krita Color Sampler", "Krita Color Sampler"),
      hl("flip-canvas", "좌우 미러 보기", "Mirror View", "M", "Krita Mirror View", "Krita Mirror View"),
      hl("quick-hud", "팝업 팔레트 HUD", "Popup Palette HUD", "Tab", "Krita Canvas-Only / HUD", "Krita Canvas-Only / HUD"),
    ]),
    gestureHintsKo: Object.freeze([".kpp(PNG preset XML) 헤더에서 paintopid를 직접 판독해 분광 브러시 추천", "Krita 강모·수채 과립화 워크플로우를 WebGPU 7밴드로 1:1 연결"]),
    gestureHintsEn: Object.freeze(["Reads paintopid directly from .kpp PNG preset headers", "Maps Krita bristle and granulation brushes to WebGPU 7-band physics"]),
    nativeBrushExtensions: Object.freeze([".kpp", ".abr"]),
    defaultCanonicalBrushId: "km7-oil-impasto-30deg", defaultTexturePresetId: "oil-impasto-30deg", defaultPaperPresetId: "cold-press",
  }),
});

function makeBrushSpec(spec: SpectralCanonicalBrushSpec): SpectralCanonicalBrushSpec {
  return Object.freeze({ ...spec, keywords: Object.freeze([...spec.keywords]) });
}

export const TOONSTUDIO_SPECTRAL_CANONICAL_BRUSHES: Readonly<
  Record<SpectralCanonicalBrushId, SpectralCanonicalBrushSpec>
> = Object.freeze({
  "km7-gpen-ink": makeBrushSpec({
    id: "km7-gpen-ink", familyId: "g-pen", nameKo: "정본 G펜 · 웹툰 선화", nameEn: "Canonical G-Pen · Webtoon Ink",
    summaryKo: "고밀도 선화 코어와 빠른 끝단 테이퍼로 깔끔한 만화 펜선을 그립니다.",
    summaryEn: "Dense ink core with crisp exit taper for clean comic line art.",
    paperPresetId: "hot-press", frictionMediumId: "graphite-pencil", granulationPresetId: null, texturePresetId: "webtoon-ink-clean",
    spectralNoteKo: "7밴드 흑색 반사 하한 안정화로 선 겹침 시 탁해짐 0%",
    spectralNoteEn: "Stabilized 7-band black floor prevents muddy line overlaps",
    keywords: ["g-pen", "gpen", "지펜", "선화", "잉크", "ink", "pen", "maru", "둥근펜", "펜", "lineart", "line", "comic", "manga", "inking", "mapping", "turnip", "kabura", "카부라", "technical", "monoline", "fineliner"],
  }),
  "km7-graphite-2b": makeBrushSpec({
    id: "km7-graphite-2b", familyId: "pencil", nameKo: "흑연 2B 연필 · 틸트 음영", nameEn: "2B Graphite Pencil · Tilt Shading",
    summaryKo: "펜을 눕히면 종이 산봉우리만 스치고 세우면 또렷한 스케치 선이 나옵니다.",
    summaryEn: "Catches paper tooth ridges when tilted and sharpens upright.",
    paperPresetId: "charcoal-laid", frictionMediumId: "graphite-pencil", granulationPresetId: null, texturePresetId: "charcoal-laid-sketch",
    spectralNoteKo: "세목·레이드지 3-주파수 높이장 + 틸트 비선형 접촉 연동",
    spectralNoteEn: "Paired with 3-frequency paper heightfield and tilt contact transfer",
    keywords: ["pencil", "연필", "2b", "hb", "4b", "6b", "graphite", "흑연", "sketch", "스케치", "croquis", "크로키", "mechanical", "샤프", "derwent", "콘티"],
  }),
  "km7-charcoal-laid": makeBrushSpec({
    id: "km7-charcoal-laid", familyId: "charcoal", nameKo: "건식 목탄 · 레이드지 질감", nameEn: "Dry Charcoal · Laid Paper",
    summaryKo: "거친 레이드지 리브 결을 타고 진한 명암과 입자 긁힘을 만듭니다.",
    summaryEn: "Rich tonal contrast catching parallel ribs on charcoal laid paper.",
    paperPresetId: "charcoal-laid", frictionMediumId: "charcoal-pastel", granulationPresetId: "deep-forest", texturePresetId: "charcoal-laid-sketch",
    spectralNoteKo: "저속 강필압에서 종이 결 방향으로 이방성 입자 산란 강화",
    spectralNoteEn: "Anisotropic particle scatter follows paper grain under slow heavy strokes",
    keywords: ["charcoal", "목탄", "콘테", "conte", "vine", "willow", "compressed", "fusain", "목탄지", "데생", "dessin"],
  }),
  "km7-watercolor-granulation": makeBrushSpec({
    id: "km7-watercolor-granulation", familyId: "watercolor", nameKo: "7밴드 수채 과립화 워시", nameEn: "7-Band Watercolor Granulation",
    summaryKo: "Kubelka-Munk 감산 혼색으로 탁함 없이 맑은 번짐과 웻엣지·이원 과립화를 냅니다.",
    summaryEn: "Kubelka-Munk subtractive mixing with luminous wet edges and dual granulation.",
    paperPresetId: "rough-watercolor", frictionMediumId: "watercolor-brush", granulationPresetId: "mineral-dusk", texturePresetId: "watercolor-granulation",
    spectralNoteKo: "7파장 K/S 감산 혼색(청+황→청량한 녹색) + 골짜기 광물 안료 침강",
    spectralNoteEn: "7-band K/S subtractive mix (blue+yellow→vivid green) with valley settling",
    keywords: ["watercolor", "수채", "수채화", "water", "wash", "wet", "aquarelle", "워시", "번짐", "투명수채", "granulation", "과립", "bleed", "inkwash", "wet-mix", "transparent"],
  }),
  "km7-oil-impasto-30deg": makeBrushSpec({
    id: "km7-oil-impasto-30deg", familyId: "oil", nameKo: "유화 임파스토 · 30° 측면광", nameEn: "Oil Impasto · 30° Raking Light",
    summaryKo: "16채널 붓모 픽업과 높이장 30° 측면 자연광으로 꾸덕한 유화 붓자국을 살립니다.",
    summaryEn: "16-strand dirty bristle pickup with 30° raking light impasto relief.",
    paperPresetId: "cold-press", frictionMediumId: "oil-palette-knife", granulationPresetId: "deep-forest", texturePresetId: "oil-impasto-30deg",
    spectralNoteKo: "16가닥 붓모 교차 혼색 + 30° Sobel/GGX 부조 + 마른 밑칠 요철 계승",
    spectralNoteEn: "16-strand cross-stroke pickup, 30° Sobel/GGX relief, and dry underlayer inherit",
    keywords: ["oil", "유화", "impasto", "임파스토", "thick", "꾸덕", "gouache", "과슈", "acrylic", "아크릴", "bristle", "강모", "flat", "평붓", "palette-knife", "knife", "나이프", "painterly", "colorsmudge", "mix", "mixer", "유채"],
  }),
  "km7-sumi-dry-rake": makeBrushSpec({
    id: "km7-sumi-dry-rake", familyId: "sumi-dry-rake", nameKo: "갈필 먹붓 · 닥섬유 한지", nameEn: "Sumi Dry-Rake · Hanji",
    summaryKo: "속도가 빨라지면 붓모가 14가닥으로 갈라지며 동양화 갈필 여백을 만듭니다.",
    summaryEn: "Velocity-driven 14-strand bristle split over mulberry hanji fiber ridges.",
    paperPresetId: "hanji", frictionMediumId: "watercolor-brush", granulationPresetId: "deep-forest", texturePresetId: "sumi-hanji-dry-rake",
    spectralNoteKo: "전통 한지 이방성 닥섬유 리지 + 속도·고갈 연동 갈필 분열",
    spectralNoteEn: "Anisotropic mulberry hanji ridges with speed/depletion dry split",
    keywords: ["sumi", "먹붓", "갈필", "dry", "rake", "붓펜", "서예", "calligraphy", "fude", "동양화", "수묵", "hanji", "한지", "india-ink", "먹", "붓"],
  }),
  "km7-wax-crayon": makeBrushSpec({
    id: "km7-wax-crayon", familyId: "crayon", nameKo: "왁스 크레용 · 오일파스텔", nameEn: "Wax Crayon · Oil Pastel",
    summaryKo: "약한 필압에서는 종이 결이 비치고 강하게 누르면 왁스 부스러기와 함께 채워집니다.",
    summaryEn: "Dry paper skip at low pressure transitioning to rich waxy coverage and crumbs.",
    paperPresetId: "rough-watercolor", frictionMediumId: "charcoal-pastel", granulationPresetId: null, texturePresetId: "charcoal-laid-sketch",
    spectralNoteKo: "다층 왁스-종이 요철 접촉 + 가장자리 왁스 부스러기 산란",
    spectralNoteEn: "Multi-layer wax-paper tooth adhesion with rim crumb scatter",
    keywords: ["crayon", "크레용", "크레파스", "oil-pastel", "오일파스텔", "wax", "왁스", "colored-pencil", "색연필"],
  }),
  "km7-soft-pastel": makeBrushSpec({
    id: "km7-soft-pastel", familyId: "pastel", nameKo: "소프트 파스텔 · 분말 질감", nameEn: "Soft Pastel · Powder Grain",
    summaryKo: "부드럽게 퍼지는 분말 입자와 종이 결이 어우러진 일러스트 채색용 브러시입니다.",
    summaryEn: "Velvety powder grain blending smoothly into textured tooth.",
    paperPresetId: "cold-press", frictionMediumId: "charcoal-pastel", granulationPresetId: "mineral-dusk", texturePresetId: "charcoal-laid-sketch",
    spectralNoteKo: "7밴드 분광 소프트 혼색 + 황목지 미세 입자 정착",
    spectralNoteEn: "7-band spectral soft blend seated onto cold-press tooth",
    keywords: ["pastel", "파스텔", "soft-pastel", "powder", "분말", "velvet"],
  }),
  "km7-alcohol-marker": makeBrushSpec({
    id: "km7-alcohol-marker", familyId: "marker", nameKo: "알코올 마커 · 치즐 팁", nameEn: "Alcohol Marker · Chisel Tip",
    summaryKo: "치즐 팁 방향성과 반투명 겹침 농도로 선명한 채색 레이어링을 지원합니다.",
    summaryEn: "Directional chisel tip with translucent alcohol layering density.",
    paperPresetId: "hot-press", frictionMediumId: "graphite-pencil", granulationPresetId: null, texturePresetId: "webtoon-ink-clean",
    spectralNoteKo: "세목지 위 반투명 7밴드 광학 글레이징 겹침",
    spectralNoteEn: "Translucent 7-band optical glazing over smooth hot-press paper",
    keywords: ["marker", "마커", "copic", "코픽", "chisel", "highlighter", "형광펜", "felt", "사인펜", "alcohol"],
  }),
  "km7-soft-airbrush": makeBrushSpec({
    id: "km7-soft-airbrush", familyId: "airbrush", nameKo: "소프트 에어브러시 · 그라데이션", nameEn: "Soft Airbrush · Gradient",
    summaryKo: "미세한 멀티옥타브 미스트 감쇠로 밴딩 없는 부드러운 피부·광원 그라데이션을 만듭니다.",
    summaryEn: "Multi-octave mist falloff for banding-free skin and atmospheric gradients.",
    paperPresetId: "hot-press", frictionMediumId: "watercolor-brush", granulationPresetId: null, texturePresetId: "webtoon-ink-clean",
    spectralNoteKo: "부드러운 방사형 감쇠 + 7밴드 색 전이로 회색 띠 현상 최소화",
    spectralNoteEn: "Smooth radial falloff with 7-band color transition avoiding gray banding",
    keywords: ["airbrush", "에어브러시", "soft", "소프트", "glow", "글로우", "gradient", "블러", "blur", "shadow", "shade", "mist", "smooth", "round-soft"],
  }),
  "km7-splatter-spray": makeBrushSpec({
    id: "km7-splatter-spray", familyId: "spray", nameKo: "스프레이 · 스플래터 효과", nameEn: "Spray · Splatter FX",
    summaryKo: "균일 면적 디스크 산란으로 별빛·물방울·스크린톤 입자 연출을 즉시 그립니다.",
    summaryEn: "Equal-area disk scatter for droplets, stars, and tone splatter effects.",
    paperPresetId: "cold-press", frictionMediumId: "charcoal-pastel", granulationPresetId: null, texturePresetId: "watercolor-granulation",
    spectralNoteKo: "√U 균일 면적 입자 분포 + 필압 연동 밀도 제어",
    spectralNoteEn: "Equal-area √U particle distribution with pressure density scaling",
    keywords: ["spray", "스프레이", "splatter", "스플래터", "speckle", "particle", "입자", "dust", "sparkle", "반짝", "tone", "톤", "noise", "spraybrush", "splash"],
  }),
  "km7-chalk-stick": makeBrushSpec({
    id: "km7-chalk-stick", familyId: "chalk", nameKo: "분필 초크 · 질감 드로잉", nameEn: "Chalk Stick · Textured Draw",
    summaryKo: "건조한 분필 끝단의 거친 가장자리와 종이 요철 걸림을 선명하게 표현합니다.",
    summaryEn: "Dry chalk edge roughness with pronounced paper tooth grip.",
    paperPresetId: "charcoal-laid", frictionMediumId: "charcoal-pastel", granulationPresetId: null, texturePresetId: "charcoal-laid-sketch",
    spectralNoteKo: "레이드지 결 접촉 + 고주파 건조 분필 텍스처",
    spectralNoteEn: "Laid paper ridge contact with high-frequency dry chalk texture",
    keywords: ["chalk", "초크", "분필", "blackboard", "칠판", "dry-chalk"],
  }),
});

export function listToolMigratorProfiles(): readonly ToolMigratorProfile[] {
  return Object.freeze([
    TOOL_MIGRATOR_PROFILES["clip-studio"],
    TOOL_MIGRATOR_PROFILES.procreate,
    TOOL_MIGRATOR_PROFILES.photoshop,
    TOOL_MIGRATOR_PROFILES.krita,
  ]);
}

export function getToolMigratorProfile(toolId: MigratorSourceToolId): ToolMigratorProfile {
  return TOOL_MIGRATOR_PROFILES[toolId];
}

export function buildMigratedShortcutPlan(
  toolId: MigratorSourceToolId,
  baseShortcuts: Readonly<Record<StudioShortcutActionId, string>> = DEFAULT_SHORTCUT_MAP,
): MigratedShortcutPlan {
  const profile = TOOL_MIGRATOR_PROFILES[toolId];
  const merged: Record<StudioShortcutActionId, string> = { ...baseShortcuts, ...profile.shortcutOverrides };

  const changedEntries: MigratedShortcutDiffEntry[] = [];
  for (const item of STUDIO_SHORTCUT_ACTIONS) {
    if (baseShortcuts[item.id] !== merged[item.id]) {
      changedEntries.push(Object.freeze({
        actionId: item.id,
        labelKo: ACTION_LABEL_KO[item.id],
        previousKeys: baseShortcuts[item.id],
        nextKeys: merged[item.id],
      }));
    }
  }

  const chordUsage = new Map<string, number>();
  for (const keys of Object.values(merged)) {
    const norm = keys.trim().toLowerCase();
    if (norm) chordUsage.set(norm, (chordUsage.get(norm) ?? 0) + 1);
  }
  const conflictChords = [...chordUsage.entries()].filter(([, count]) => count > 1).map(([chord]) => chord);

  return Object.freeze({
    toolId,
    compatibleShortcutPresetId: profile.compatibleShortcutPresetId,
    shortcuts: Object.freeze(merged),
    changedEntries: Object.freeze(changedEntries),
    conflictChords: Object.freeze(conflictChords),
  });
}

/** 호스트 스튜디오가 구독하는 `CustomEvent`로 단축키 프로필을 전파한다(브라우저 키-값 저장소 미사용). */
export function dispatchMigratedShortcutProfile(plan: MigratedShortcutPlan): boolean {
  if (typeof globalThis === "undefined" || typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent !== "function") {
    return false;
  }
  try {
    globalThis.dispatchEvent(
      new CustomEvent(STUDIO_QUICK_MIGRATE_SHORTCUT_EVENT, {
        detail: { presetId: plan.compatibleShortcutPresetId, sourceToolId: plan.toolId, shortcuts: plan.shortcuts },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

const SQLITE_MAGIC = "SQLite format 3\0";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const ABR_SUPPORTED_VERSIONS = new Set([1, 2, 6, 7, 9, 10]);

function detectFormatByFileName(fileName: string): ImportedBrushFileFormat {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".abr")) return "abr";
  if (lower.endsWith(".sut")) return "sut";
  if (lower.endsWith(".kpp")) return "kpp";
  if (lower.endsWith(".brush") || lower.endsWith(".brushset")) return "procreate-brush";
  return "unknown";
}

function readAsciiSlice(bytes: Uint8Array, offset: number, length: number): string {
  const end = Math.min(bytes.byteLength, offset + length);
  let out = "";
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function extractReadableTokensFromBytes(bytes: Uint8Array, maxScanBytes = 4096): readonly string[] {
  const limit = Math.min(bytes.byteLength, maxScanBytes);
  const tokens = new Set<string>();
  let current = "";
  for (let i = 0; i < limit; i += 1) {
    const b = bytes[i] ?? 0;
    const isWord = (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x2d || b === 0x5f;
    if (isWord) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 3 && current.length <= 40) tokens.add(current.toLowerCase());
      current = "";
    }
  }
  if (current.length >= 3 && current.length <= 40) tokens.add(current.toLowerCase());
  return [...tokens].slice(0, 48);
}

function parseKppHeaderTokens(bytes: Uint8Array): readonly string[] {
  const tokens = new Set<string>();
  const ascii = readAsciiSlice(bytes, 8, Math.min(bytes.byteLength - 8, 4096));
  const paintopMatch = ascii.match(/paintopid=["']([a-zA-Z0-9_-]+)["']/u);
  if (paintopMatch?.[1]) tokens.add(paintopMatch[1].toLowerCase());
  const presetNameMatch = ascii.match(/<Preset[^>]*\bname=["']([^"']{1,64})["']/u);
  if (presetNameMatch?.[1]) {
    for (const part of presetNameMatch[1].toLowerCase().split(/[\s_/.-]+/u)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  return [...tokens];
}

function scanAbr8BimSectionKeys(bytes: Uint8Array): readonly string[] {
  const keys = new Set<string>();
  const limit = Math.min(bytes.byteLength - 8, 4096);
  for (let i = 0; i <= limit; i += 1) {
    if (bytes[i] === 0x38 && bytes[i + 1] === 0x42 && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
      const key = readAsciiSlice(bytes, i + 4, 4);
      if (/^[a-zA-Z0-9]{4}$/u.test(key)) keys.add(key);
    }
  }
  return [...keys];
}

/** `.abr` · `.sut` · `.kpp` · `.brush`/`.brushset` 파일명과 바이너리 헤더를 로컬 ₩0 판독한다. */
export function inspectImportedBrushFileMetadata(
  input: ImportedBrushFileInput,
): BrushHeaderMetadataInspection {
  const detectedFormat = detectFormatByFileName(input.fileName);
  const bytes = input.headerBytes;
  if (!bytes || bytes.byteLength === 0) {
    return Object.freeze({
      detectedFormat, headerVerified: false, inspectionMode: "filename-only",
      formatVersionLabel: detectedFormat === "unknown" ? "미지정 포맷" : `${detectedFormat.toUpperCase()} (파일명 기준)`,
      sectionKeys: Object.freeze([]), extractedTokens: Object.freeze([]), warningKo: null, warningEn: null,
    });
  }

  if (detectedFormat === "sut") {
    const verified = readAsciiSlice(bytes, 0, 16) === SQLITE_MAGIC;
    return Object.freeze({
      detectedFormat, headerVerified: verified, inspectionMode: "header-and-filename",
      formatVersionLabel: verified ? "CSP .sut (SQLite3 헤더 확인)" : "CSP .sut (헤더 불일치)",
      sectionKeys: Object.freeze(verified ? ["sqlite3-sut"] : []),
      extractedTokens: Object.freeze(extractReadableTokensFromBytes(bytes)),
      warningKo: verified ? null : "SQLite3(.sut) 시그니처가 확인되지 않아 파일명 기준으로 추천했습니다.",
      warningEn: verified ? null : "SQLite3 (.sut) signature not detected; fell back to filename.",
    });
  }

  if (detectedFormat === "abr") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = bytes.byteLength >= 2 ? view.getUint16(0, false) : 0;
    const subversion = bytes.byteLength >= 4 ? view.getUint16(2, false) : 0;
    const sectionKeys = scanAbr8BimSectionKeys(bytes);
    const verified = ABR_SUPPORTED_VERSIONS.has(version) && (version < 6 || sectionKeys.length > 0 || subversion === 1 || subversion === 2);
    return Object.freeze({
      detectedFormat, headerVerified: verified, inspectionMode: "header-and-filename",
      formatVersionLabel: verified ? `Photoshop .abr v${version}${version >= 6 ? `.${subversion}` : ""}` : "Photoshop .abr (헤더 미확인)",
      sectionKeys: Object.freeze(sectionKeys),
      extractedTokens: Object.freeze(extractReadableTokensFromBytes(bytes)),
      warningKo: verified ? null : "ABR 버전 헤더(v1/v2/v6 8BIM)가 확인되지 않아 파일명 기준으로 추천했습니다.",
      warningEn: verified ? null : "ABR version header not confirmed; fell back to filename.",
    });
  }

  if (detectedFormat === "kpp") {
    const isPng = bytes.byteLength >= PNG_MAGIC.length && PNG_MAGIC.every((b, idx) => bytes[idx] === b);
    const extractedTokens = [...new Set([...(isPng ? parseKppHeaderTokens(bytes) : []), ...extractReadableTokensFromBytes(bytes)])];
    return Object.freeze({
      detectedFormat, headerVerified: isPng, inspectionMode: "header-and-filename",
      formatVersionLabel: isPng ? "Krita .kpp (PNG preset 헤더 확인)" : "Krita .kpp (PNG 헤더 불일치)",
      sectionKeys: Object.freeze(isPng ? ["png-kpp-preset"] : []),
      extractedTokens: Object.freeze(extractedTokens),
      warningKo: isPng ? null : "Krita .kpp PNG 시그니처가 확인되지 않아 파일명 기준으로 추천했습니다.",
      warningEn: isPng ? null : "Krita .kpp PNG signature not detected; fell back to filename.",
    });
  }

  if (detectedFormat === "procreate-brush") {
    const isZip = bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    return Object.freeze({
      detectedFormat, headerVerified: isZip, inspectionMode: "header-and-filename",
      formatVersionLabel: isZip ? "Procreate .brush (ZIP 컨테이너 확인)" : "Procreate .brush (헤더 미확인)",
      sectionKeys: Object.freeze(isZip ? ["zip-procreate-brush"] : []),
      extractedTokens: Object.freeze(extractReadableTokensFromBytes(bytes)),
      warningKo: isZip ? null : "ZIP 컨테이너 시그니처가 확인되지 않아 파일명 기준으로 추천했습니다.",
      warningEn: isZip ? null : "ZIP container signature not detected; fell back to filename.",
    });
  }

  return Object.freeze({
    detectedFormat: "unknown", headerVerified: false, inspectionMode: "header-and-filename",
    formatVersionLabel: "미지원 확장자 (파일명 추론)", sectionKeys: Object.freeze([]),
    extractedTokens: Object.freeze(extractReadableTokensFromBytes(bytes)),
    warningKo: "지원 확장자(.abr·.sut·.kpp·.brush)가 아니어서 파일명 기준으로 추천했습니다.",
    warningEn: "Unsupported extension; recommended closest canonical brush from filename.",
  });
}

function resolveDefaultBrushForFormat(
  format: ImportedBrushFileFormat,
  sourceToolHint?: MigratorSourceToolId,
): SpectralCanonicalBrushId {
  if (sourceToolHint) return TOOL_MIGRATOR_PROFILES[sourceToolHint].defaultCanonicalBrushId;
  if (format === "sut") return "km7-gpen-ink";
  if (format === "procreate-brush") return "km7-watercolor-granulation";
  if (format === "kpp" || format === "abr") return "km7-oil-impasto-30deg";
  return "km7-gpen-ink";
}

export function recommendSpectralBrushForFile(
  input: ImportedBrushFileInput,
): SpectralBrushRecommendation {
  const inspection = inspectImportedBrushFileMetadata(input);
  const withoutExt = input.fileName.replace(/\.[a-z0-9]+$/iu, "").toLowerCase();
  const nameTokens = [withoutExt, ...withoutExt.split(/[\s_./()[\]-]+/u).filter(Boolean)];
  const fallbackId = resolveDefaultBrushForFormat(inspection.detectedFormat, input.sourceToolHint);

  const scored = Object.values(TOONSTUDIO_SPECTRAL_CANONICAL_BRUSHES).map((spec) => {
    let score = spec.id === fallbackId ? 1.5 : 0;
    const signals: string[] = [];
    for (const kw of spec.keywords) {
      const kwLower = kw.toLowerCase();
      if (nameTokens.some((tok) => tok === kwLower || tok.includes(kwLower))) {
        score += kwLower.length >= 4 ? 6.5 : 4.5;
        signals.push(`파일명:${kw}`);
      }
      if (inspection.extractedTokens.some((tok) => tok === kwLower || tok.includes(kwLower))) {
        score += 5.0;
        signals.push(`헤더:${kw}`);
      }
    }
    if (inspection.headerVerified && inspection.sectionKeys.includes("patt") && spec.id === "km7-oil-impasto-30deg") {
      score += 1.2;
      signals.push("헤더:8BIM-patt");
    }
    return { spec, score, signals: [...new Set(signals)] };
  });

  scored.sort((a, b) => b.score - a.score || a.spec.id.localeCompare(b.spec.id));
  const best = scored[0]!;
  const hasDirectSignal = best.signals.length > 0;
  const confidence01 = Number(
    (hasDirectSignal
      ? Math.min(0.98, 0.72 + Math.min(0.2, best.score * 0.02) + (inspection.headerVerified ? 0.06 : 0))
      : inspection.headerVerified ? 0.64 : 0.54
    ).toFixed(2),
  );
  const signalPreview = best.signals.slice(0, 3).join(", ");

  return Object.freeze({
    fileName: input.fileName,
    detectedFormat: inspection.detectedFormat,
    headerInspection: inspection,
    primary: best.spec,
    alternatives: Object.freeze(scored.slice(1, 3).map((entry) => entry.spec)),
    confidence01,
    matchedSignals: Object.freeze(best.signals),
    reasonKo: hasDirectSignal
      ? `${inspection.formatVersionLabel} · 일치 신호(${signalPreview}) 기반으로 ${best.spec.nameKo}를 매핑했습니다.`
      : `${inspection.formatVersionLabel} 기본 프로필을 기준으로 ${best.spec.nameKo}를 추천했습니다.`,
    reasonEn: hasDirectSignal
      ? `Mapped to ${best.spec.nameEn} from ${inspection.formatVersionLabel} signals (${signalPreview}).`
      : `Recommended ${best.spec.nameEn} from ${inspection.formatVersionLabel} default profile.`,
  });
}

export function recommendSpectralBrushesForBatch(
  files: readonly ImportedBrushFileInput[],
): readonly SpectralBrushRecommendation[] {
  return Object.freeze(files.map((file) => recommendSpectralBrushForFile(file)));
}

function makeKppHeader(xml: string): Uint8Array {
  const buf = new Uint8Array(PNG_MAGIC.length + xml.length);
  buf.set(PNG_MAGIC, 0);
  for (let i = 0; i < xml.length; i += 1) buf[PNG_MAGIC.length + i] = xml.charCodeAt(i);
  return buf;
}

export function buildSampleBrushInputsForTool(
  toolId: MigratorSourceToolId,
): readonly ImportedBrushFileInput[] {
  const sqliteHeader = new Uint8Array(64);
  for (let i = 0; i < SQLITE_MAGIC.length; i += 1) sqliteHeader[i] = SQLITE_MAGIC.charCodeAt(i);
  const abrV6Header = new Uint8Array([
    0x00, 0x06, 0x00, 0x02,
    0x38, 0x42, 0x49, 0x4d, 0x73, 0x61, 0x6d, 0x70, 0x00, 0x00, 0x00, 0x00,
    0x38, 0x42, 0x49, 0x4d, 0x70, 0x61, 0x74, 0x74, 0x00, 0x00, 0x00, 0x00,
  ]);
  const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

  if (toolId === "clip-studio") {
    return Object.freeze([
      { fileName: "웹툰_메인_G펜.sut", headerBytes: sqliteHeader, sourceToolHint: toolId },
      { fileName: "수채_과립_워시.sut", headerBytes: sqliteHeader, sourceToolHint: toolId },
    ]);
  }
  if (toolId === "procreate") {
    return Object.freeze([
      { fileName: "6B_연필_스케치.brush", headerBytes: zipHeader, sourceToolHint: toolId },
      { fileName: "Mineral_Watercolor_Wash.brushset", headerBytes: zipHeader, sourceToolHint: toolId },
    ]);
  }
  if (toolId === "photoshop") {
    return Object.freeze([
      { fileName: "Impasto_Oil_Flat.abr", headerBytes: abrV6Header, sourceToolHint: toolId },
      { fileName: "Soft_Airbrush_Skin.abr", headerBytes: abrV6Header, sourceToolHint: toolId },
    ]);
  }
  return Object.freeze([
    { fileName: "Wet_Bristle_Oil.kpp", headerBytes: makeKppHeader(`<Preset name="Impasto Oil Bristle" paintopid="colorsmudge"/>`), sourceToolHint: toolId },
    { fileName: "Sumi_Dry_Rake_Hanji.kpp", headerBytes: makeKppHeader(`<Preset name="Sumi Dry Rake" paintopid="paintbrush"/>`), sourceToolHint: toolId },
  ]);
}
