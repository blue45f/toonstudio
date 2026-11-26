/**
 * 영구 ₩0 AI 스타터 팩 카탈로그 타입 및 엔드포인트 상수 정의(순수 타입·상수 모듈).
 */

export const AI_STARTER_PACK_BASE_URL = "/assets/ai-starter-pack";

export const AI_STARTER_PACK_ENDPOINTS = Object.freeze({
  visualsManifest: "manifest.json",
  audiotoonManifest: "audiotoon/manifest.json",
  sfxDictionary: "distilled/sfx-dictionary-200.json",
  oklchPalettes: "distilled/oklch-palettes-200.json",
  bg3dPresets: "distilled/bg3d-camera-presets-100.json",
  mcpMacros: "distilled/mcp-workflow-macros-100.json",
  cliffhangers: "distilled/cliffhanger-patterns-100.json",
  characterArchetypes: "distilled/character-archetypes-50.json",
  starterEpisodes: "distilled/starter-episodes-20.json",
  multilingualManuals: "distilled/multilingual-manuals-24.json",
  semanticIndex: "embeddings/catalog-semantic-index-256d.json",
} as const);

export type StarterPackDatasetKey = keyof typeof AI_STARTER_PACK_ENDPOINTS;

export type StarterPackVisualCategory =
  | "backgrounds"
  | "textures"
  | "references"
  | "cover-template"
  | "isometric-3d-ref"
  | "study-plate";

export interface StarterPackVisualAsset {
  readonly id: string;
  readonly tier: "v1" | "pro-v2";
  readonly category: StarterPackVisualCategory;
  readonly titleKo: string;
  readonly genreKo: string;
  readonly size: string;
  readonly model: string;
  readonly bytes: number;
  readonly publicPath: string;
}

export interface StarterPackAudioClip {
  readonly id: string;
  readonly tier: "v1" | "v2-dub";
  readonly lang: string;
  readonly voice: string;
  readonly title: string;
  readonly publicPath: string;
  readonly bytes: number;
  readonly instructions?: string;
  readonly text?: string;
}

export interface StarterPackSfxEntry {
  readonly id: string;
  readonly genreKo: string;
  readonly ko: string;
  readonly ja: string;
  readonly en: string;
  readonly category: string;
  readonly intensity: string;
  readonly typographyTipKo: string;
  readonly placementHintKo: string;
  readonly usageExampleKo: string;
}

export interface StarterPackOklchPalette {
  readonly id: string;
  readonly nameKo: string;
  readonly mood: string;
  readonly genre: string;
  readonly bgHex: string;
  readonly midHex: string;
  readonly shadowHex: string;
  readonly accentHex: string;
  readonly highlightHex: string;
  readonly oklchAccent: string;
  readonly lightingNoteKo: string;
}

export interface StarterPackBg3dPreset {
  readonly id: string;
  readonly themeKo: string;
  readonly titleKo: string;
  readonly timeOfDay: string;
  readonly lensMm: number;
  readonly fovDeg: number;
  readonly cameraPos: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly keyLightHex: string;
  readonly rimLightHex: string;
  readonly fogDensity: number;
  readonly dofFocusM: number;
  readonly props: readonly string[];
  readonly webtoonUseCaseKo: string;
}

export interface StarterPackMcpMacroStep {
  readonly toolName: string;
  readonly reasonKo: string;
  readonly argumentsJson: string;
}

export interface StarterPackMcpMacro {
  readonly id: string;
  readonly domainKo: string;
  readonly titleKo: string;
  readonly naturalPromptKo: string;
  readonly steps: readonly StarterPackMcpMacroStep[];
}

export interface StarterPackCliffhangerPattern {
  readonly id: string;
  readonly nameKo: string;
  readonly genreKo: string;
  readonly scrollGapPx: number;
  readonly penultimateCutKo: string;
  readonly finalCutHookKo: string;
  readonly readerCommentPredictionKo: string;
}

export interface StarterPackCharacterArchetype {
  readonly id: string;
  readonly labelKo: string;
  readonly speechEndings: readonly string[];
  readonly sampleLines: readonly string[];
  readonly forbiddenLines: readonly string[];
  readonly visualCueKo: string;
}

export interface StarterPackEpisodeTemplate {
  readonly id: string;
  readonly titleKo: string;
  readonly genreKo: string;
  readonly loglineKo: string;
  readonly characters: readonly Record<string, unknown>[];
  readonly colorScript: unknown;
  readonly cuts: readonly Record<string, unknown>[];
}

export interface StarterPackMultilingualManual {
  readonly locale: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly Record<string, unknown>[];
  readonly faq: readonly Record<string, unknown>[];
}

export const STARTER_PACK_SEMANTIC_KINDS = [
  "visual-v1",
  "visual-pro-v2",
  "sfx",
  "bg3d-preset",
  "mcp-macro",
  "character-archetype",
  "cliffhanger",
  "starter-episode",
  "manual",
  "golden-eval",
  "oklch-palette",
] as const;

export type StarterPackSemanticKind = (typeof STARTER_PACK_SEMANTIC_KINDS)[number];

export interface StarterPackSemanticEntry {
  readonly id: string;
  readonly kind: StarterPackSemanticKind;
  readonly title: string;
  readonly v: readonly number[];
}

export interface StarterPackSemanticIndex {
  readonly model: string;
  readonly dimensions: number;
  readonly runtimeCostKrw: 0;
  readonly totalItems: number;
  readonly items: readonly StarterPackSemanticEntry[];
}

export interface StarterPackSemanticHit {
  readonly id: string;
  readonly kind: StarterPackSemanticKind;
  readonly title: string;
  readonly score: number;
}

export interface StarterPackOfflineSearchHit extends StarterPackSemanticHit {
  readonly lexicalScore: number;
  readonly semanticScore: number;
  readonly matchMode: "hybrid" | "lexical-only" | "semantic-expansion";
}

export interface StarterPackSemanticSearchOptions {
  readonly topK?: number;
  readonly kinds?: readonly StarterPackSemanticKind[];
  readonly minScore?: number;
  readonly excludeIds?: readonly string[];
}

export interface StarterPackLoadOptions {
  readonly signal?: AbortSignal;
}

export interface StarterPackVisualFilter {
  readonly tier?: "v1" | "pro-v2";
  readonly category?: StarterPackVisualCategory;
  readonly genreKo?: string;
  readonly query?: string;
}

export interface StarterPackAudioFilter {
  readonly tier?: "v1" | "v2-dub";
  readonly lang?: string;
  readonly voice?: string;
  readonly query?: string;
}

export interface StarterPackSfxFilter {
  readonly genreKo?: string;
  readonly category?: string;
  readonly intensity?: string;
  readonly query?: string;
}

export interface StarterPackPaletteFilter {
  readonly genre?: string;
  readonly mood?: string;
  readonly query?: string;
}

export interface StarterPackBg3dFilter {
  readonly themeKo?: string;
  readonly timeOfDay?: string;
  readonly minLensMm?: number;
  readonly maxLensMm?: number;
  readonly query?: string;
}

export interface StarterPackMcpMacroFilter {
  readonly domainKo?: string;
  readonly toolPrefix?: string;
  readonly query?: string;
}

export interface StarterPackCliffhangerFilter {
  readonly genreKo?: string;
  readonly minGapPx?: number;
  readonly maxGapPx?: number;
  readonly query?: string;
}

export interface StarterPackArchetypeFilter {
  readonly query?: string;
}

export interface StudioAiStarterPackCatalogOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface StudioAiStarterPackCatalog {
  readonly baseUrl: string;
  loadVisuals(opts?: StarterPackLoadOptions): Promise<readonly StarterPackVisualAsset[]>;
  browseVisuals(
    filter?: StarterPackVisualFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackVisualAsset[]>;
  loadAudioClips(opts?: StarterPackLoadOptions): Promise<readonly StarterPackAudioClip[]>;
  browseAudioClips(
    filter?: StarterPackAudioFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackAudioClip[]>;
  loadSfx(opts?: StarterPackLoadOptions): Promise<readonly StarterPackSfxEntry[]>;
  browseSfx(
    filter?: StarterPackSfxFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackSfxEntry[]>;
  loadOklchPalettes(opts?: StarterPackLoadOptions): Promise<readonly StarterPackOklchPalette[]>;
  browseOklchPalettes(
    filter?: StarterPackPaletteFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackOklchPalette[]>;
  loadBg3dPresets(opts?: StarterPackLoadOptions): Promise<readonly StarterPackBg3dPreset[]>;
  browseBg3dPresets(
    filter?: StarterPackBg3dFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackBg3dPreset[]>;
  loadMcpMacros(opts?: StarterPackLoadOptions): Promise<readonly StarterPackMcpMacro[]>;
  browseMcpMacros(
    filter?: StarterPackMcpMacroFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackMcpMacro[]>;
  loadCliffhangers(opts?: StarterPackLoadOptions): Promise<readonly StarterPackCliffhangerPattern[]>;
  browseCliffhangers(
    filter?: StarterPackCliffhangerFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackCliffhangerPattern[]>;
  loadCharacterArchetypes(
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackCharacterArchetype[]>;
  browseCharacterArchetypes(
    filter?: StarterPackArchetypeFilter,
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackCharacterArchetype[]>;
  loadStarterEpisodes(opts?: StarterPackLoadOptions): Promise<readonly StarterPackEpisodeTemplate[]>;
  loadMultilingualManuals(
    opts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackMultilingualManual[]>;
  loadSemanticIndex(opts?: StarterPackLoadOptions): Promise<StarterPackSemanticIndex>;
  searchByVector(
    queryVector: readonly number[],
    searchOpts?: StarterPackSemanticSearchOptions,
    loadOpts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackSemanticHit[]>;
  findSimilar(
    seedId: string,
    searchOpts?: StarterPackSemanticSearchOptions,
    loadOpts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackSemanticHit[]>;
  searchOffline(
    queryText: string,
    searchOpts?: StarterPackSemanticSearchOptions,
    loadOpts?: StarterPackLoadOptions,
  ): Promise<readonly StarterPackOfflineSearchHit[]>;
  getLoadedDatasets(): readonly StarterPackDatasetKey[];
  clearCache(): void;
}
