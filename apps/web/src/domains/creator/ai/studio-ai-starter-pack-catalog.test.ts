import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  AI_STARTER_PACK_BASE_URL,
  cosineSimilarity,
  createStudioAiStarterPackCatalog,
  findSimilarStarterPackItems,
  searchSemanticIndexByVector,
  searchStarterPackOffline,
  type StarterPackSemanticIndex,
} from "./studio-ai-starter-pack-catalog";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.resolve(TEST_DIR, "../../../../public");
const HAS_STARTER_PACK_ASSETS = fs.existsSync(
  path.join(PUBLIC_ROOT, "assets/ai-starter-pack/manifest.json"),
);

function createSyntheticStarterPackFetch() {
  const requestedUrls: string[] = [];
  const fixtures: Record<string, unknown> = {
    "assets/ai-starter-pack/manifest.json": {
      items: [
        {
          id: "bg-1",
          category: "backgrounds",
          titleKo: "로판 황궁 노을",
          genreKo: "로판",
          size: "1024x1024",
          model: "gpt-image-1.5",
          publicPath: "/assets/ai-starter-pack/backgrounds/bg-1.webp",
          bytes: 1024,
        },
      ],
      proV2Assets: [
        {
          id: "cov-1",
          category: "cover-template",
          titleKo: "로판 표지",
          size: "1024x1536",
          model: "gpt-image-1.5",
          path: "pro-v2/cov-1.webp",
          bytes: 2048,
        },
      ],
    },
    "assets/ai-starter-pack/audiotoon/manifest.json": {
      clips: [
        { id: "aud-1", lang: "en", voice: "nova", titleKo: "오프닝", publicPath: "/assets/ai-starter-pack/audiotoon/aud-1.mp3", bytes: 512 },
        { id: "aud-2", lang: "ko", voice: "alloy", role: "나레이션", path: "audiotoon/aud-2.mp3", bytes: 512 },
      ],
    },
    "assets/ai-starter-pack/distilled/sfx-dictionary-200.json": {
      genres: [
        {
          genreKo: "로판",
          entries: [{ id: "sfx-1", ko: "두근두근", en: "ba-dump", ja: "ドキドキ" }],
        },
      ],
    },
    "assets/ai-starter-pack/distilled/oklch-palettes-200.json": {
      items: [
        {
          id: "pal-1",
          nameKo: "우산 아래 느와르",
          genre: "noir",
          mood: "noir",
          lightingNoteKo: "가로등 반사광",
          swatches: ["#112233"],
        },
      ],
    },
    "assets/ai-starter-pack/distilled/bg3d-camera-presets-100.json": {
      themes: [
        {
          themeKo: "궁전 복도",
          presets: [
            {
              id: "bg3d-1",
              titleKo: "광각 복도",
              lensMm: 24,
              timeOfDay: "dusk",
              webtoonUseCaseKo: "입장 연출",
              props: ["샹들리에"],
            },
          ],
        },
      ],
    },
    "assets/ai-starter-pack/distilled/mcp-workflow-macros-100.json": {
      domains: [
        {
          domainKo: "캔버스",
          macros: [
            {
              id: "mac-1",
              titleKo: "캔버스 정리",
              naturalPromptKo: "캔버스를 화면에 맞춰 정렬",
              steps: [{ toolName: "studio.canvas.fit", reasonKo: "시야 맞춤" }],
            },
          ],
        },
      ],
    },
    "assets/ai-starter-pack/distilled/cliffhanger-patterns-100.json": {
      patterns: [
        {
          id: "clf-1",
          nameKo: "긴 여백 반전",
          genreKo: "로판",
          penultimateCutKo: "정적",
          finalCutHookKo: "문 열림",
          scrollGapPx: 480,
        },
      ],
    },
    "assets/ai-starter-pack/distilled/character-archetypes-50.json": {
      archetypes: [
        {
          id: "arc-1",
          labelKo: "냉철한 왕녀",
          visualCueKo: "은빛 왕관",
          speechEndings: ["~하라"],
          sampleLines: ["물러서라."],
          forbiddenLines: ["안녕?"],
        },
      ],
    },
  };
  const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    const relative = url.replace(/^\/+/u, "");
    const payload = fixtures[relative];
    if (!payload) return new Response("Not Found", { status: 404 });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, requestedUrls };
}

function createDiskBackedFetch() {
  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    const relative = url.replace(/^\/+/u, "");
    const fullPath = path.join(PUBLIC_ROOT, relative);
    if (!fs.existsSync(fullPath)) {
      return new Response("Not Found", { status: 404 });
    }
    const raw = fs.readFileSync(fullPath, "utf8");
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, requestedUrls };
}

describe("studio-ai-starter-pack-catalog (영구 ₩0 오프라인 카탈로그 및 시맨틱 검색)", () => {
  it("스파스 체크아웃 환경에서도 지연 로드·중복 제거·캐시 초기화 및 카탈로그 브라우징이 정확히 동작한다", async () => {
    const { fetchImpl, requestedUrls } = createSyntheticStarterPackFetch();
    const catalog = createStudioAiStarterPackCatalog({ fetchImpl });

    expect(requestedUrls).toHaveLength(0);
    const [first, second] = await Promise.all([catalog.loadVisuals(), catalog.loadVisuals()]);
    expect(first).toHaveLength(2);
    expect(second).toBe(first);
    expect(requestedUrls).toEqual([`${AI_STARTER_PACK_BASE_URL}/manifest.json`]);

    catalog.clearCache();
    expect(catalog.getLoadedDatasets()).toEqual([]);
    const covers = await catalog.browseVisuals({ tier: "pro-v2", category: "cover-template" });
    expect(covers).toHaveLength(1);
    const enAudio = await catalog.browseAudioClips({ lang: "en" });
    expect(enAudio).toHaveLength(1);
    expect(await catalog.browseSfx({ genreKo: "로판", query: "두근" })).toHaveLength(1);
    expect(await catalog.browseOklchPalettes({ query: "우산" })).toHaveLength(1);
    expect(await catalog.browseBg3dPresets({ maxLensMm: 28 })).toHaveLength(1);
    expect(await catalog.browseMcpMacros({ toolPrefix: "studio.canvas." })).toHaveLength(1);
    expect(await catalog.browseCliffhangers({ minGapPx: 400 })).toHaveLength(1);
    expect(await catalog.browseCharacterArchetypes({ query: "왕녀" })).toHaveLength(1);
  });

  it.runIf(HAS_STARTER_PACK_ASSETS)(
    "생성 시점에 어떠한 네트워크 요청도 실행하지 않고 요청한 카탈로그만 지연 로드·캐시·중복 제거한다",
    async () => {
    const { fetchImpl, requestedUrls } = createDiskBackedFetch();
    const catalog = createStudioAiStarterPackCatalog({ fetchImpl });

    expect(requestedUrls).toHaveLength(0);
    expect(catalog.getLoadedDatasets()).toEqual([]);

    // 동시 중복 요청 시 fetch 1회로 병합
    const [first, second] = await Promise.all([catalog.loadVisuals(), catalog.loadVisuals()]);
    expect(first).toHaveLength(40);
    expect(second).toBe(first);
    expect(requestedUrls).toEqual([`${AI_STARTER_PACK_BASE_URL}/manifest.json`]);
    expect(catalog.getLoadedDatasets()).toEqual(["visualsManifest"]);

    // 캐시 초기화 후 재요청
    catalog.clearCache();
    expect(catalog.getLoadedDatasets()).toEqual([]);
    const third = await catalog.loadVisuals();
    expect(third).toHaveLength(40);
    expect(requestedUrls).toHaveLength(2);
  });

  it.runIf(HAS_STARTER_PACK_ASSETS)(
    "실제 public/assets/ai-starter-pack 전체 자산(40 비주얼·20 오디오·200 SFX·200 팔레트·100 3D·100 매크로·100 클리프행어·50 아키타입·884 임베딩)을 정확히 정규화 로드한다",
    async () => {
    const { fetchImpl } = createDiskBackedFetch();
    const catalog = createStudioAiStarterPackCatalog({ fetchImpl });

    const [
      visuals,
      audioClips,
      sfx,
      palettes,
      bg3d,
      macros,
      cliffhangers,
      archetypes,
      episodes,
      manuals,
      semanticIndex,
    ] = await Promise.all([
      catalog.loadVisuals(),
      catalog.loadAudioClips(),
      catalog.loadSfx(),
      catalog.loadOklchPalettes(),
      catalog.loadBg3dPresets(),
      catalog.loadMcpMacros(),
      catalog.loadCliffhangers(),
      catalog.loadCharacterArchetypes(),
      catalog.loadStarterEpisodes(),
      catalog.loadMultilingualManuals(),
      catalog.loadSemanticIndex(),
    ]);

    expect(visuals).toHaveLength(40);
    expect(visuals.filter((v) => v.tier === "v1")).toHaveLength(28);
    expect(visuals.filter((v) => v.tier === "pro-v2")).toHaveLength(12);
    for (const v of visuals) {
      expect(v.publicPath.startsWith("/assets/ai-starter-pack/")).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_ROOT, v.publicPath.replace(/^\/+/u, "")))).toBe(true);
    }

    expect(audioClips).toHaveLength(20);
    expect(audioClips.filter((a) => a.tier === "v1")).toHaveLength(8);
    expect(audioClips.filter((a) => a.tier === "v2-dub")).toHaveLength(12);
    for (const clip of audioClips) {
      expect(clip.publicPath.startsWith("/assets/ai-starter-pack/audiotoon/")).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_ROOT, clip.publicPath.replace(/^\/+/u, "")))).toBe(true);
    }

    expect(sfx).toHaveLength(200);
    expect(palettes).toHaveLength(200);
    expect(bg3d).toHaveLength(100);
    expect(macros).toHaveLength(100);
    expect(cliffhangers).toHaveLength(100);
    expect(archetypes).toHaveLength(50);
    expect(episodes).toHaveLength(20);
    expect(manuals).toHaveLength(24);
    expect(semanticIndex.totalItems).toBe(884);
    expect(semanticIndex.dimensions).toBe(256);
    expect(semanticIndex.runtimeCostKrw).toBe(0);
  });

  it.runIf(HAS_STARTER_PACK_ASSETS)(
    "카탈로그별 타입 안전 브라우징·필터링이 정확하게 동작한다",
    async () => {
    const { fetchImpl } = createDiskBackedFetch();
    const catalog = createStudioAiStarterPackCatalog({ fetchImpl });

    const covers = await catalog.browseVisuals({ tier: "pro-v2", category: "cover-template" });
    expect(covers).toHaveLength(6);

    const enAudio = await catalog.browseAudioClips({ lang: "en" });
    expect(enAudio.length).toBeGreaterThanOrEqual(3);
    expect(enAudio.every((clip) => clip.lang === "en")).toBe(true);

    const ropanSfx = await catalog.browseSfx({ genreKo: "로판", query: "두근" });
    expect(ropanSfx.length).toBeGreaterThanOrEqual(1);
    expect(ropanSfx[0]?.ko).toContain("두근");

    const noirPalettes = await catalog.browseOklchPalettes({ query: "우산" });
    expect(noirPalettes.length).toBeGreaterThanOrEqual(1);

    const wideBg3d = await catalog.browseBg3dPresets({ maxLensMm: 28 });
    expect(wideBg3d.length).toBeGreaterThan(0);
    expect(wideBg3d.every((p) => p.lensMm <= 28)).toBe(true);

    const canvasMacros = await catalog.browseMcpMacros({ toolPrefix: "studio.canvas." });
    expect(canvasMacros.length).toBeGreaterThan(0);

    const deepGapCliffhangers = await catalog.browseCliffhangers({ minGapPx: 400 });
    expect(deepGapCliffhangers.length).toBeGreaterThan(0);
    expect(deepGapCliffhangers.every((c) => c.scrollGapPx >= 400)).toBe(true);

    const royalArchetypes = await catalog.browseCharacterArchetypes({ query: "왕녀" });
    expect(royalArchetypes.length).toBeGreaterThanOrEqual(1);
  });

  it.runIf(HAS_STARTER_PACK_ASSETS)(
    "코사인 유사도 수학과 884건 오프라인 시맨틱 검색(0 토큰)이 정확히 작동한다",
    async () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);

    const { fetchImpl, requestedUrls } = createDiskBackedFetch();
    const catalog = createStudioAiStarterPackCatalog({ fetchImpl });

    // 유사 에셋 추천: 서울 지하철 야간 우천 배경과 시맨틱하게 가까운 항목 탐색
    const similar = await catalog.findSimilar("vis1:bg-noir-subway-rain", { topK: 8 });
    expect(similar).toHaveLength(8);
    expect(similar.some((hit) => hit.id === "vis1:bg-noir-subway-rain")).toBe(false);
    expect(similar[0]!.score).toBeGreaterThan(0.45);
    expect(similar[0]!.score).toBeGreaterThanOrEqual(similar[7]!.score);

    // 0토큰 오프라인 하이브리드 검색: 어휘 일치 + 256D 코사인 확장
    const offlineHits = await catalog.searchOffline("로판 황궁", { topK: 10 });
    expect(offlineHits.length).toBeGreaterThanOrEqual(5);
    expect(offlineHits[0]!.score).toBeGreaterThan(0.5);
    // 시맨틱 확장으로 종류가 다양한 자산이 함께 추천되어야 한다
    const distinctKinds = new Set(offlineHits.map((h) => h.kind));
    expect(distinctKinds.size).toBeGreaterThanOrEqual(2);

    // 인덱스 파일 1개만 로드했고 외부 API 호출은 0건
    expect(requestedUrls).toEqual([
      `${AI_STARTER_PACK_BASE_URL}/embeddings/catalog-semantic-index-256d.json`,
    ]);
  });

  it("합성 인덱스로 벡터 검색·시드 부재·빈 질의·HTTP 오류 경계를 검증한다", async () => {
    const miniIndex: StarterPackSemanticIndex = {
      model: "test-256d",
      dimensions: 3,
      runtimeCostKrw: 0,
      totalItems: 3,
      items: [
        { id: "vis1:rain", kind: "visual-v1", title: "빗속 골목", v: [1, 0, 0] },
        { id: "sfx:rain", kind: "sfx", title: "주륵주륵 빗소리", v: [0.95, 0.31, 0] },
        { id: "oklch:sun", kind: "oklch-palette", title: "햇살 오후", v: [0, 0, 1] },
      ],
    };

    const vecHits = searchSemanticIndexByVector(miniIndex, [1, 0, 0], {
      kinds: ["sfx"],
      topK: 5,
    });
    expect(vecHits).toHaveLength(1);
    expect(vecHits[0]?.id).toBe("sfx:rain");

    expect(findSimilarStarterPackItems(miniIndex, "missing-id")).toEqual([]);
    expect(searchStarterPackOffline(miniIndex, "   ")).toEqual([]);

    const failingCatalog = createStudioAiStarterPackCatalog({
      fetchImpl: (async () => new Response("error", { status: 503 })) as unknown as typeof fetch,
    });
    await expect(failingCatalog.loadVisuals()).rejects.toThrow("HTTP 503");
  });
});
