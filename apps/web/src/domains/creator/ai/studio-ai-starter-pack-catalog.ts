/**
 * 영구 ₩0 AI 스타터 팩 오프라인 카탈로그 및 256차원 시맨틱 검색 클라이언트.
 *
 * - 런타임 AI API 토큰 소비 0원(정적 JSON·WebP·MP3 자산만 지연 로드).
 * - 정적 JSON 번들 임포트 없이 요청한 카탈로그 파일만 개별 fetch 후 메모리 캐시하므로
 *   스튜디오 초기 진입 그래프(eager graph)에 0바이트 영향을 준다.
 * - 884건 256차원 임베딩 인덱스 위에서 코사인 유사도 검색, 유사 에셋 추천,
 *   어휘 앵커 기반 오프라인 하이브리드 시맨틱 검색을 API 호출 없이 수행한다.
 */

import {
  AI_STARTER_PACK_BASE_URL,
  AI_STARTER_PACK_ENDPOINTS,
  type StarterPackArchetypeFilter,
  type StarterPackAudioClip,
  type StarterPackAudioFilter,
  type StarterPackBg3dFilter,
  type StarterPackBg3dPreset,
  type StarterPackCharacterArchetype,
  type StarterPackCliffhangerFilter,
  type StarterPackCliffhangerPattern,
  type StarterPackDatasetKey,
  type StarterPackEpisodeTemplate,
  type StarterPackLoadOptions,
  type StarterPackMcpMacro,
  type StarterPackMcpMacroFilter,
  type StarterPackMultilingualManual,
  type StarterPackOfflineSearchHit,
  type StarterPackOklchPalette,
  type StarterPackPaletteFilter,
  type StarterPackSemanticEntry,
  type StarterPackSemanticHit,
  type StarterPackSemanticIndex,
  type StarterPackSemanticKind,
  type StarterPackSemanticSearchOptions,
  type StarterPackSfxEntry,
  type StarterPackSfxFilter,
  type StarterPackVisualAsset,
  type StarterPackVisualCategory,
  type StarterPackVisualFilter,
  type StudioAiStarterPackCatalog,
  type StudioAiStarterPackCatalogOptions,
} from "./studio-ai-starter-pack-types";

export * from "./studio-ai-starter-pack-types";

// ---------- 순수 수학 · 오프라인 검색 유틸리티 ----------

function normalizeQueryText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, " ");
}

function matchesText(haystackParts: readonly (string | undefined)[], query?: string): boolean {
  const normalized = query ? normalizeQueryText(query) : "";
  if (!normalized) return true;
  const joined = haystackParts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
  return normalized.split(" ").every((token) => joined.includes(token));
}

function normalizePublicPath(baseUrl: string, rawPath: string): string {
  const cleanBase = baseUrl.replace(/\/+$/u, "");
  if (rawPath.startsWith("/")) return rawPath;
  return `${cleanBase}/${rawPath.replace(/^\/+/u, "")}`;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-12 || !Number.isFinite(denom)) return 0;
  return dot / denom;
}

function toBigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/gu, "");
  const out = new Set<string>();
  if (compact.length < 2) {
    if (compact.length === 1) out.add(compact);
    return out;
  }
  for (let i = 0; i < compact.length - 1; i += 1) {
    out.add(compact.slice(i, i + 2));
  }
  return out;
}

function computeLexicalScore(query: string, entry: StarterPackSemanticEntry): number {
  const q = normalizeQueryText(query);
  if (!q) return 0;
  const target = `${entry.title} ${entry.id}`.toLowerCase();
  if (target === q) return 1;
  if (target.includes(q)) return 0.92;

  const tokens = q.split(" ").filter((t) => t.length > 0);
  let matchedTokens = 0;
  for (const token of tokens) {
    if (target.includes(token)) matchedTokens += 1;
  }
  const tokenRatio = tokens.length > 0 ? matchedTokens / tokens.length : 0;

  const qBigrams = toBigrams(q);
  const tBigrams = toBigrams(entry.title.toLowerCase());
  let overlap = 0;
  for (const bg of qBigrams) {
    if (tBigrams.has(bg)) overlap += 1;
  }
  const bigramRecall = qBigrams.size > 0 ? overlap / qBigrams.size : 0;
  const combined = tokenRatio * 0.72 + bigramRecall * 0.28;
  return combined > 0.08 ? Math.min(0.95, combined) : 0;
}

export function searchSemanticIndexByVector(
  index: StarterPackSemanticIndex,
  queryVector: readonly number[],
  options: StarterPackSemanticSearchOptions = {},
): StarterPackSemanticHit[] {
  if (queryVector.length === 0) return [];
  const topK = Math.max(1, Math.min(100, options.topK ?? 12));
  const minScore = options.minScore ?? -1;
  const kindSet = options.kinds?.length ? new Set<StarterPackSemanticKind>(options.kinds) : null;
  const excludeSet = options.excludeIds?.length ? new Set(options.excludeIds) : null;

  const hits: StarterPackSemanticHit[] = [];
  for (const item of index.items) {
    if (kindSet && !kindSet.has(item.kind)) continue;
    if (excludeSet?.has(item.id)) continue;
    const score = cosineSimilarity(queryVector, item.v);
    if (score < minScore) continue;
    hits.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      score: Number(score.toFixed(6)),
    });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, topK);
}

export function findSimilarStarterPackItems(
  index: StarterPackSemanticIndex,
  seedId: string,
  options: StarterPackSemanticSearchOptions = {},
): StarterPackSemanticHit[] {
  const seed = index.items.find((item) => item.id === seedId);
  if (!seed) return [];
  return searchSemanticIndexByVector(index, seed.v, {
    ...options,
    excludeIds: [...(options.excludeIds ?? []), seed.id],
  });
}

/**
 * 0토큰 오프라인 하이브리드 시맨틱 검색:
 * 어휘 일치 상위 앵커들의 256차원 임베딩 가중 중심(centroid)을 구성해 전체 884건과 코사인 유사도를 계산한다.
 */
export function searchStarterPackOffline(
  index: StarterPackSemanticIndex,
  queryText: string,
  options: StarterPackSemanticSearchOptions = {},
): StarterPackOfflineSearchHit[] {
  const q = normalizeQueryText(queryText);
  if (!q) return [];
  const topK = Math.max(1, Math.min(100, options.topK ?? 12));
  const minScore = options.minScore ?? 0.12;
  const kindSet = options.kinds?.length ? new Set<StarterPackSemanticKind>(options.kinds) : null;
  const excludeSet = options.excludeIds?.length ? new Set(options.excludeIds) : null;

  const lexicalById = new Map<string, number>();
  const anchors: Array<{ item: StarterPackSemanticEntry; weight: number }> = [];
  for (const item of index.items) {
    const lex = computeLexicalScore(q, item);
    if (lex > 0) {
      lexicalById.set(item.id, lex);
      anchors.push({ item, weight: lex });
    }
  }
  anchors.sort((a, b) => b.weight - a.weight);
  const topAnchors = anchors.slice(0, 6);

  let centroid: number[] | null = null;
  if (topAnchors.length > 0 && index.dimensions > 0) {
    centroid = new Array<number>(index.dimensions).fill(0);
    for (const anchor of topAnchors) {
      const w = anchor.weight * anchor.weight;
      for (let d = 0; d < index.dimensions; d += 1) {
        centroid[d] = (centroid[d] ?? 0) + (anchor.item.v[d] ?? 0) * w;
      }
    }
  }

  const hits: StarterPackOfflineSearchHit[] = [];
  for (const item of index.items) {
    if (kindSet && !kindSet.has(item.kind)) continue;
    if (excludeSet?.has(item.id)) continue;

    const lexicalScore = lexicalById.get(item.id) ?? 0;
    const rawSemantic = centroid ? Math.max(0, cosineSimilarity(centroid, item.v)) : 0;
    const score = centroid
      ? lexicalScore > 0
        ? lexicalScore * 0.58 + rawSemantic * 0.42
        : rawSemantic * 0.78
      : lexicalScore;
    if (score < minScore) continue;

    const matchMode: StarterPackOfflineSearchHit["matchMode"] =
      lexicalScore > 0 && rawSemantic > 0
        ? "hybrid"
        : lexicalScore > 0
          ? "lexical-only"
          : "semantic-expansion";
    hits.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      score: Number(score.toFixed(6)),
      lexicalScore: Number(lexicalScore.toFixed(6)),
      semanticScore: Number(rawSemantic.toFixed(6)),
      matchMode,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, topK);
}

// ---------- 순수 필터링 헬퍼 ----------

export function filterStarterPackVisuals(
  items: readonly StarterPackVisualAsset[],
  filter: StarterPackVisualFilter = {},
): StarterPackVisualAsset[] {
  return items.filter((item) => {
    if (filter.tier && item.tier !== filter.tier) return false;
    if (filter.category && item.category !== filter.category) return false;
    if (filter.genreKo && !item.genreKo.toLowerCase().includes(filter.genreKo.trim().toLowerCase())) {
      return false;
    }
    return matchesText([item.id, item.titleKo, item.genreKo, item.category], filter.query);
  });
}

export function filterStarterPackAudioClips(
  items: readonly StarterPackAudioClip[],
  filter: StarterPackAudioFilter = {},
): StarterPackAudioClip[] {
  return items.filter((item) => {
    if (filter.tier && item.tier !== filter.tier) return false;
    if (filter.lang && item.lang.toLowerCase() !== filter.lang.trim().toLowerCase()) return false;
    if (filter.voice && item.voice.toLowerCase() !== filter.voice.trim().toLowerCase()) return false;
    return matchesText([item.id, item.title, item.text, item.instructions, item.lang], filter.query);
  });
}

export function filterStarterPackSfx(
  items: readonly StarterPackSfxEntry[],
  filter: StarterPackSfxFilter = {},
): StarterPackSfxEntry[] {
  return items.filter((item) => {
    if (filter.genreKo && !item.genreKo.toLowerCase().includes(filter.genreKo.trim().toLowerCase())) {
      return false;
    }
    if (filter.category && !item.category.toLowerCase().includes(filter.category.trim().toLowerCase())) {
      return false;
    }
    if (filter.intensity && item.intensity.toLowerCase() !== filter.intensity.trim().toLowerCase()) {
      return false;
    }
    return matchesText(
      [item.id, item.ko, item.ja, item.en, item.genreKo, item.category, item.usageExampleKo],
      filter.query,
    );
  });
}

export function filterStarterPackPalettes(
  items: readonly StarterPackOklchPalette[],
  filter: StarterPackPaletteFilter = {},
): StarterPackOklchPalette[] {
  return items.filter((item) => {
    if (filter.genre && !item.genre.toLowerCase().includes(filter.genre.trim().toLowerCase())) {
      return false;
    }
    if (filter.mood && !item.mood.toLowerCase().includes(filter.mood.trim().toLowerCase())) {
      return false;
    }
    return matchesText([item.id, item.nameKo, item.genre, item.mood, item.lightingNoteKo], filter.query);
  });
}

export function filterStarterPackBg3dPresets(
  items: readonly StarterPackBg3dPreset[],
  filter: StarterPackBg3dFilter = {},
): StarterPackBg3dPreset[] {
  return items.filter((item) => {
    if (filter.themeKo && !item.themeKo.toLowerCase().includes(filter.themeKo.trim().toLowerCase())) {
      return false;
    }
    if (filter.timeOfDay && item.timeOfDay.toLowerCase() !== filter.timeOfDay.trim().toLowerCase()) {
      return false;
    }
    if (filter.minLensMm !== undefined && item.lensMm < filter.minLensMm) return false;
    if (filter.maxLensMm !== undefined && item.lensMm > filter.maxLensMm) return false;
    return matchesText(
      [item.id, item.themeKo, item.titleKo, item.webtoonUseCaseKo, ...item.props],
      filter.query,
    );
  });
}

export function filterStarterPackMcpMacros(
  items: readonly StarterPackMcpMacro[],
  filter: StarterPackMcpMacroFilter = {},
): StarterPackMcpMacro[] {
  return items.filter((item) => {
    if (filter.domainKo && !item.domainKo.toLowerCase().includes(filter.domainKo.trim().toLowerCase())) {
      return false;
    }
    if (
      filter.toolPrefix &&
      !item.steps.some((step) => step.toolName.startsWith(filter.toolPrefix ?? ""))
    ) {
      return false;
    }
    return matchesText(
      [
        item.id,
        item.domainKo,
        item.titleKo,
        item.naturalPromptKo,
        ...item.steps.map((s) => `${s.toolName} ${s.reasonKo}`),
      ],
      filter.query,
    );
  });
}

export function filterStarterPackCliffhangers(
  items: readonly StarterPackCliffhangerPattern[],
  filter: StarterPackCliffhangerFilter = {},
): StarterPackCliffhangerPattern[] {
  return items.filter((item) => {
    if (filter.genreKo && !item.genreKo.toLowerCase().includes(filter.genreKo.trim().toLowerCase())) {
      return false;
    }
    if (filter.minGapPx !== undefined && item.scrollGapPx < filter.minGapPx) return false;
    if (filter.maxGapPx !== undefined && item.scrollGapPx > filter.maxGapPx) return false;
    return matchesText(
      [item.id, item.nameKo, item.genreKo, item.penultimateCutKo, item.finalCutHookKo],
      filter.query,
    );
  });
}

export function filterStarterPackArchetypes(
  items: readonly StarterPackCharacterArchetype[],
  filter: StarterPackArchetypeFilter = {},
): StarterPackCharacterArchetype[] {
  return items.filter((item) =>
    matchesText(
      [
        item.id,
        item.labelKo,
        item.visualCueKo,
        ...item.speechEndings,
        ...item.sampleLines,
        ...item.forbiddenLines,
      ],
      filter.query,
    ),
  );
}

// ---------- 지연 로드 정규화 및 카탈로그 클라이언트 ----------

interface RawVisualManifest {
  items?: ReadonlyArray<{
    id: string;
    category: StarterPackVisualCategory;
    titleKo: string;
    genreKo: string;
    size: string;
    model: string;
    bytes: number;
    publicPath: string;
  }>;
  proV2Assets?: ReadonlyArray<{
    id: string;
    category: StarterPackVisualCategory;
    titleKo: string;
    model: string;
    size: string;
    path: string;
    bytes: number;
  }>;
}

interface RawAudioManifest {
  clips?: ReadonlyArray<{
    id: string;
    voice: string;
    titleKo?: string;
    role?: string;
    lang?: string;
    instructions?: string;
    text?: string;
    publicPath?: string;
    path?: string;
    bytes: number;
  }>;
}

interface RawSfxPayload {
  genres?: ReadonlyArray<{ genreKo: string; entries: ReadonlyArray<Omit<StarterPackSfxEntry, "genreKo">> }>;
}

interface RawBg3dPayload {
  themes?: ReadonlyArray<{ themeKo: string; presets: ReadonlyArray<Omit<StarterPackBg3dPreset, "themeKo">> }>;
}

interface RawMcpPayload {
  domains?: ReadonlyArray<{ domainKo: string; macros: ReadonlyArray<Omit<StarterPackMcpMacro, "domainKo">> }>;
}

export function createStudioAiStarterPackCatalog(
  options: StudioAiStarterPackCatalogOptions = {},
): StudioAiStarterPackCatalog {
  const baseUrl = (options.baseUrl ?? AI_STARTER_PACK_BASE_URL).replace(/\/+$/u, "");
  const cache = new Map<StarterPackDatasetKey, unknown>();
  const inflight = new Map<StarterPackDatasetKey, Promise<unknown>>();

  async function loadDataset<T>(
    key: StarterPackDatasetKey,
    transform: (raw: unknown) => T,
    opts: StarterPackLoadOptions = {},
  ): Promise<T> {
    if (cache.has(key)) return cache.get(key) as T;
    const pending = inflight.get(key);
    if (pending && !opts.signal) return pending as Promise<T>;

    const fetchFn = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
      throw new Error("스타터 팩 자산을 불러올 fetch 구현을 찾을 수 없습니다.");
    }

    const url = `${baseUrl}/${AI_STARTER_PACK_ENDPOINTS[key]}`;
    const task = (async () => {
      const response = await fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`스타터 팩 카탈로그(${key}) 로드 실패: HTTP ${response.status}`);
      }
      const normalized = transform(await response.json());
      cache.set(key, normalized);
      return normalized;
    })();

    if (!opts.signal) inflight.set(key, task);
    try {
      return await task;
    } finally {
      if (inflight.get(key) === task) inflight.delete(key);
    }
  }

  const loadVisuals = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackVisualAsset[]>(
      "visualsManifest",
      (raw) => {
        const data = (raw ?? {}) as RawVisualManifest;
        const v1: StarterPackVisualAsset[] = (data.items ?? []).map((item) => ({
          id: item.id,
          tier: "v1",
          category: item.category,
          titleKo: item.titleKo,
          genreKo: item.genreKo,
          size: item.size,
          model: item.model,
          bytes: item.bytes,
          publicPath: normalizePublicPath(baseUrl, item.publicPath),
        }));
        const v2: StarterPackVisualAsset[] = (data.proV2Assets ?? []).map((item) => ({
          id: item.id,
          tier: "pro-v2",
          category: item.category,
          titleKo: item.titleKo,
          genreKo:
            item.category === "cover-template"
              ? "표지 템플릿"
              : item.category === "isometric-3d-ref"
                ? "3D 배경 레퍼런스"
                : "연출 스터디 플레이트",
          size: item.size,
          model: item.model,
          bytes: item.bytes,
          publicPath: normalizePublicPath(baseUrl, item.path),
        }));
        return Object.freeze([...v1, ...v2]);
      },
      opts,
    );

  const loadAudioClips = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackAudioClip[]>(
      "audiotoonManifest",
      (raw) => {
        const data = (raw ?? {}) as RawAudioManifest;
        return Object.freeze(
          (data.clips ?? []).map((clip) => {
            const isV1 = typeof clip.publicPath === "string" && clip.publicPath.length > 0;
            return {
              id: clip.id,
              tier: isV1 ? "v1" : "v2-dub",
              lang: clip.lang?.trim() || "ko",
              voice: clip.voice,
              title: clip.titleKo?.trim() || clip.role?.trim() || clip.id,
              publicPath: normalizePublicPath(baseUrl, clip.publicPath ?? clip.path ?? ""),
              bytes: clip.bytes,
              ...(clip.instructions ? { instructions: clip.instructions } : {}),
              ...(clip.text ? { text: clip.text } : {}),
            };
          }),
        );
      },
      opts,
    );

  const loadSfx = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackSfxEntry[]>(
      "sfxDictionary",
      (raw) =>
        Object.freeze(
          ((raw ?? {}) as RawSfxPayload).genres?.flatMap((g) =>
            (g.entries ?? []).map((entry) => ({ ...entry, genreKo: g.genreKo })),
          ) ?? [],
        ),
      opts,
    );

  const loadOklchPalettes = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackOklchPalette[]>(
      "oklchPalettes",
      (raw) => Object.freeze([...(((raw ?? {}) as { items?: StarterPackOklchPalette[] }).items ?? [])]),
      opts,
    );

  const loadBg3dPresets = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackBg3dPreset[]>(
      "bg3dPresets",
      (raw) =>
        Object.freeze(
          ((raw ?? {}) as RawBg3dPayload).themes?.flatMap((t) =>
            (t.presets ?? []).map((preset) => ({ ...preset, themeKo: t.themeKo })),
          ) ?? [],
        ),
      opts,
    );

  const loadMcpMacros = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackMcpMacro[]>(
      "mcpMacros",
      (raw) =>
        Object.freeze(
          ((raw ?? {}) as RawMcpPayload).domains?.flatMap((d) =>
            (d.macros ?? []).map((macro) => ({ ...macro, domainKo: d.domainKo })),
          ) ?? [],
        ),
      opts,
    );

  const loadCliffhangers = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackCliffhangerPattern[]>(
      "cliffhangers",
      (raw) => Object.freeze([...(((raw ?? {}) as { patterns?: StarterPackCliffhangerPattern[] }).patterns ?? [])]),
      opts,
    );

  const loadCharacterArchetypes = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackCharacterArchetype[]>(
      "characterArchetypes",
      (raw) => Object.freeze([...(((raw ?? {}) as { archetypes?: StarterPackCharacterArchetype[] }).archetypes ?? [])]),
      opts,
    );

  const loadStarterEpisodes = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackEpisodeTemplate[]>(
      "starterEpisodes",
      (raw) => Object.freeze([...(((raw ?? {}) as { episodes?: StarterPackEpisodeTemplate[] }).episodes ?? [])]),
      opts,
    );

  const loadMultilingualManuals = (opts?: StarterPackLoadOptions) =>
    loadDataset<readonly StarterPackMultilingualManual[]>(
      "multilingualManuals",
      (raw) => Object.freeze([...(((raw ?? {}) as { manuals?: StarterPackMultilingualManual[] }).manuals ?? [])]),
      opts,
    );

  const loadSemanticIndex = (opts?: StarterPackLoadOptions) =>
    loadDataset<StarterPackSemanticIndex>(
      "semanticIndex",
      (raw) => {
        const data = (raw ?? {}) as { model?: string; dimensions?: number; items?: StarterPackSemanticEntry[] };
        const items = data.items ?? [];
        return Object.freeze({
          model: data.model ?? "text-embedding-3-large",
          dimensions: data.dimensions ?? items[0]?.v.length ?? 256,
          runtimeCostKrw: 0 as const,
          totalItems: items.length,
          items: Object.freeze(items),
        });
      },
      opts,
    );

  return {
    baseUrl,
    loadVisuals,
    browseVisuals: async (filter, opts) => filterStarterPackVisuals(await loadVisuals(opts), filter),
    loadAudioClips,
    browseAudioClips: async (filter, opts) => filterStarterPackAudioClips(await loadAudioClips(opts), filter),
    loadSfx,
    browseSfx: async (filter, opts) => filterStarterPackSfx(await loadSfx(opts), filter),
    loadOklchPalettes,
    browseOklchPalettes: async (filter, opts) => filterStarterPackPalettes(await loadOklchPalettes(opts), filter),
    loadBg3dPresets,
    browseBg3dPresets: async (filter, opts) => filterStarterPackBg3dPresets(await loadBg3dPresets(opts), filter),
    loadMcpMacros,
    browseMcpMacros: async (filter, opts) => filterStarterPackMcpMacros(await loadMcpMacros(opts), filter),
    loadCliffhangers,
    browseCliffhangers: async (filter, opts) => filterStarterPackCliffhangers(await loadCliffhangers(opts), filter),
    loadCharacterArchetypes,
    browseCharacterArchetypes: async (filter, opts) =>
      filterStarterPackArchetypes(await loadCharacterArchetypes(opts), filter),
    loadStarterEpisodes,
    loadMultilingualManuals,
    loadSemanticIndex,
    searchByVector: async (queryVector, searchOpts, loadOpts) =>
      searchSemanticIndexByVector(await loadSemanticIndex(loadOpts), queryVector, searchOpts),
    findSimilar: async (seedId, searchOpts, loadOpts) =>
      findSimilarStarterPackItems(await loadSemanticIndex(loadOpts), seedId, searchOpts),
    searchOffline: async (queryText, searchOpts, loadOpts) =>
      searchStarterPackOffline(await loadSemanticIndex(loadOpts), queryText, searchOpts),
    getLoadedDatasets: () => [...cache.keys()],
    clearCache: () => {
      cache.clear();
      inflight.clear();
    },
  };
}

let defaultStarterPackCatalog: StudioAiStarterPackCatalog | null = null;

/** 스튜디오 전역에서 재사용할 지연 초기화 스타터 팩 카탈로그 싱글턴을 반환한다. */
export function getStudioAiStarterPackCatalog(): StudioAiStarterPackCatalog {
  if (!defaultStarterPackCatalog) {
    defaultStarterPackCatalog = createStudioAiStarterPackCatalog();
  }
  return defaultStarterPackCatalog;
}
