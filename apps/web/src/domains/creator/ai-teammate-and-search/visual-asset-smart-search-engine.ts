/**
 * 차세대 웹툰 소재 초고도화 검색 커널.
 *
 * 5대 복합 검색 축을 단일 결정론적 엔진으로 통합한다:
 * 1) 자연어 + 감정/상황 시맨틱 검색 (예: "비 오는 밤 옥상 고백씬", "액션 속도선")
 * 2) 3획 낙서 실루엣 매칭(`sketchStrokeHint`)
 * 3) 현재 캔버스 색상 무드 매칭(`paletteMood`)
 * 4) 카메라 앵글/투시 필터(`cameraAngle`)
 * 5) 원클릭 상업 출고 안전(Rights BOM) 필터(`commercialSafeOnly`) + 현재 컷 맥락 자동 추천 + 연관 세트 번들
 */

import {
  CAMERA_ANGLE_OPTIONS,
  PALETTE_MOOD_OPTIONS,
  SKETCH_STROKE_HINTS,
  SMART_STUDIO_ASSET_CATALOG,
  type CameraAngleFilter,
  type PaletteMoodId,
  type SketchStrokeHint,
  type StudioSmartAssetItem,
} from "./visual-asset-smart-search-catalog";

export {
  CAMERA_ANGLE_OPTIONS,
  PALETTE_MOOD_OPTIONS,
  SKETCH_STROKE_HINTS,
  SMART_STUDIO_ASSET_CATALOG,
  type CameraAngleFilter,
  type CameraAngleOption,
  type PaletteMoodId,
  type PaletteMoodOption,
  type RightsBomStatus,
  type SketchStrokeHint,
  type SketchStrokeHintOption,
  type StudioAssetRightsBom,
  type StudioSmartAssetCategory,
  type StudioSmartAssetItem,
} from "./visual-asset-smart-search-catalog";

export interface SmartAssetSearchQuery {
  readonly query?: string;
  readonly sketchStrokeHint?: SketchStrokeHint | null;
  readonly paletteMood?: PaletteMoodId | null;
  readonly cameraAngle?: CameraAngleFilter | null;
  readonly commercialSafeOnly?: boolean;
  readonly limit?: number;
}

export interface SmartAssetSearchHit {
  readonly asset: StudioSmartAssetItem;
  readonly matchScore: number;
  readonly matchReasons: readonly string[];
}

export interface RecommendedAssetBundle {
  readonly bundleId: string;
  readonly bundleName: string;
  readonly commercialSafe: boolean;
  readonly items: readonly StudioSmartAssetItem[];
  readonly reason: string;
}

export interface SmartAssetSearchResult {
  readonly hits: readonly SmartAssetSearchHit[];
  readonly totalCatalogCount: number;
  readonly blockedByRightsBomCount: number;
  readonly activeFilterCount: number;
  readonly expandedKeywords: readonly string[];
  readonly recommendedBundles: readonly RecommendedAssetBundle[];
}

export interface CutAssetRecommendationContext {
  readonly sceneText: string;
  readonly paletteMood?: PaletteMoodId | null;
  readonly cameraAngle?: CameraAngleFilter | null;
  readonly commercialSafeOnly?: boolean;
  readonly limit?: number;
}

export interface ContextualCutRecommendationResult {
  readonly sceneText: string;
  readonly inferredPaletteMood: PaletteMoodId | null;
  readonly inferredCameraAngle: CameraAngleFilter | null;
  readonly inferredSketchHint: SketchStrokeHint | null;
  readonly hits: readonly SmartAssetSearchHit[];
  readonly recommendedBundles: readonly RecommendedAssetBundle[];
}

const SYNONYM_EXPANSION_MAP: Readonly<Record<string, readonly string[]>> = {
  비: ["비", "우천", "빗줄기", "빗방울"],
  우천: ["비", "우천", "빗줄기"],
  밤: ["밤", "야간", "야경", "가로등"],
  야경: ["밤", "야경", "도시", "가로등"],
  옥상: ["옥상", "난간", "야경"],
  고백: ["고백", "로맨스", "설렘", "애절"],
  고백씬: ["고백", "로맨스", "설렘", "애절"],
  로맨스: ["로맨스", "고백", "설렘", "꽃잎"],
  액션: ["액션", "전투", "타격", "속도선"],
  속도선: ["속도선", "집중선", "액션", "타격"],
  집중선: ["속도선", "집중선", "액션"],
  전투: ["전투", "액션", "타격", "폭발"],
  검기: ["검기", "참격", "먹선", "액션"],
  노을: ["노을", "석양", "방과후", "역광"],
  석양: ["노을", "석양", "방과후", "역광"],
  교실: ["교실", "학교", "학원", "창가"],
  숲: ["숲", "식물", "온실", "나뭇잎", "햇살"],
  낮: ["낮", "햇살", "정원", "보태니컬"],
  느와르: ["느와르", "스릴러", "골목", "실루엣"],
  군중: ["군중", "엑스트라", "실루엣"],
  말풍선: ["말풍선", "효과음", "SFX"],
};

const KOREAN_PARTICLE_SUFFIX_RE =
  /(에서|으로|까지|부터|처럼|하는|오는|씬|은|는|이|가|을|를|의|에|로|과|와)$/u;

function tokenizeSemanticQuery(rawQuery: string): readonly string[] {
  const cleaned = rawQuery.trim().toLowerCase();
  if (!cleaned) return [];
  const rawTokens = cleaned
    .split(/[\s,·/|+_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const expanded = new Set<string>();
  for (const token of rawTokens) {
    expanded.add(token);
    const stripped = token.replace(KOREAN_PARTICLE_SUFFIX_RE, "");
    if (stripped.length >= 1) {
      expanded.add(stripped);
    }
    const directSynonyms = SYNONYM_EXPANSION_MAP[token];
    if (directSynonyms) {
      for (const syn of directSynonyms) expanded.add(syn);
    }
    const strippedSynonyms = SYNONYM_EXPANSION_MAP[stripped];
    if (strippedSynonyms) {
      for (const syn of strippedSynonyms) expanded.add(syn);
    }
  }
  return [...expanded];
}

function labelForSketchHint(hint: SketchStrokeHint): string {
  return SKETCH_STROKE_HINTS.find((item) => item.id === hint)?.label ?? hint;
}

function labelForPaletteMood(mood: PaletteMoodId): string {
  return PALETTE_MOOD_OPTIONS.find((item) => item.id === mood)?.label ?? mood;
}

function labelForCameraAngle(angle: CameraAngleFilter): string {
  return CAMERA_ANGLE_OPTIONS.find((item) => item.id === angle)?.label ?? angle;
}

function buildRecommendedBundles(
  hits: readonly SmartAssetSearchHit[],
  catalog: readonly StudioSmartAssetItem[],
  commercialSafeOnly: boolean,
): readonly RecommendedAssetBundle[] {
  const seenBundles = new Set<string>();
  const bundles: RecommendedAssetBundle[] = [];

  for (const hit of hits) {
    const { bundleId, bundleName } = hit.asset;
    if (seenBundles.has(bundleId)) continue;
    seenBundles.add(bundleId);

    const siblings = catalog.filter(
      (item) =>
        item.bundleId === bundleId &&
        (!commercialSafeOnly || item.rightsBom.commercialSafe),
    );
    if (siblings.length < 2) continue;

    bundles.push({
      bundleId,
      bundleName,
      commercialSafe: siblings.every((item) => item.rightsBom.commercialSafe),
      items: siblings,
      reason: `'${hit.asset.title}'와 톤·구도가 맞물리는 ${siblings.length}종 연관 세트`,
    });
    if (bundles.length >= 3) break;
  }

  return bundles;
}

/**
 * 5대 복합 소재 검색 커널(자연어·실루엣·색무드·카메라앵글·상업안전 BOM).
 */
export function searchStudioAssetsSmart(
  queryInput: SmartAssetSearchQuery,
  catalog: readonly StudioSmartAssetItem[] = SMART_STUDIO_ASSET_CATALOG,
): SmartAssetSearchResult {
  const rawQuery = (queryInput.query ?? "").trim();
  const expandedKeywords = tokenizeSemanticQuery(rawQuery);
  const sketchStrokeHint = queryInput.sketchStrokeHint ?? null;
  const paletteMood = queryInput.paletteMood ?? null;
  const cameraAngle = queryInput.cameraAngle ?? null;
  const commercialSafeOnly = queryInput.commercialSafeOnly === true;
  const limit = queryInput.limit ?? 24;

  const activeFilterCount =
    (rawQuery.length > 0 ? 1 : 0) +
    (sketchStrokeHint ? 1 : 0) +
    (paletteMood ? 1 : 0) +
    (cameraAngle ? 1 : 0) +
    (commercialSafeOnly ? 1 : 0);

  let blockedByRightsBomCount = 0;
  const scoredHits: SmartAssetSearchHit[] = [];

  for (const asset of catalog) {
    if (sketchStrokeHint && !asset.sketchStrokeHints.includes(sketchStrokeHint)) {
      continue;
    }
    if (paletteMood && !asset.paletteMoods.includes(paletteMood)) {
      continue;
    }
    if (cameraAngle && !asset.cameraAngles.includes(cameraAngle)) {
      continue;
    }

    const reasons: string[] = [];
    let semanticScore = 0;
    const matchedKeywords: string[] = [];

    if (expandedKeywords.length > 0) {
      const haystack = `${asset.title} ${asset.summary} ${asset.categoryLabel}`.toLowerCase();
      const tagSet = new Set(asset.semanticTags.map((tag) => tag.toLowerCase()));
      const emotionSet = new Set(asset.emotionTags.map((tag) => tag.toLowerCase()));

      for (const keyword of expandedKeywords) {
        if (tagSet.has(keyword)) {
          semanticScore += 18;
          matchedKeywords.push(keyword);
        } else if (emotionSet.has(keyword)) {
          semanticScore += 15;
          matchedKeywords.push(keyword);
        } else if (haystack.includes(keyword)) {
          semanticScore += 12;
          matchedKeywords.push(keyword);
        }
      }

      if (semanticScore === 0) {
        continue;
      }
      const uniqueMatches = [...new Set(matchedKeywords)].slice(0, 4);
      reasons.push(`시맨틱 일치: ${uniqueMatches.join("·")}`);
    }

    if (commercialSafeOnly && !asset.rightsBom.commercialSafe) {
      blockedByRightsBomCount += 1;
      continue;
    }

    let score = 45 + Math.round(asset.popularityRank * 0.25);
    if (expandedKeywords.length > 0) {
      score = Math.min(99, 40 + semanticScore + Math.round(asset.popularityRank * 0.15));
    }
    if (sketchStrokeHint) {
      score = Math.min(100, score + 8);
      reasons.push(`실루엣 획: ${labelForSketchHint(sketchStrokeHint)}`);
    }
    if (paletteMood) {
      score = Math.min(100, score + 8);
      reasons.push(`색감 무드: ${labelForPaletteMood(paletteMood)}`);
    }
    if (cameraAngle) {
      score = Math.min(100, score + 8);
      reasons.push(`구도 앵글: ${labelForCameraAngle(cameraAngle)}`);
    }
    if (commercialSafeOnly) {
      reasons.push("상업 출고 BOM 통과");
    } else if (reasons.length === 0) {
      reasons.push(`인기 추천 · ${asset.layerOutputSummary}`);
    }

    scoredHits.push({
      asset,
      matchScore: Math.min(100, Math.max(1, score)),
      matchReasons: reasons,
    });
  }

  scoredHits.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (b.asset.popularityRank !== a.asset.popularityRank) {
      return b.asset.popularityRank - a.asset.popularityRank;
    }
    return a.asset.id.localeCompare(b.asset.id);
  });

  const limitedHits = scoredHits.slice(0, Math.max(1, limit));
  const recommendedBundles = buildRecommendedBundles(
    limitedHits,
    catalog,
    commercialSafeOnly,
  );

  return {
    hits: limitedHits,
    totalCatalogCount: catalog.length,
    blockedByRightsBomCount,
    activeFilterCount,
    expandedKeywords,
    recommendedBundles,
  };
}

function inferMoodFromSceneText(text: string): PaletteMoodId | null {
  if (/(비|밤|야간|옥상|야경|빗물|네온)/u.test(text)) return "cool-night";
  if (/(액션|속도선|전투|검기|충돌|느와르|골목|스릴러)/u.test(text)) return "noir-ink";
  if (/(노을|석양|방과후|교실|역광)/u.test(text)) return "warm-sunset";
  if (/(벚꽃|꽃잎|로판|두근|파스텔|첫만남)/u.test(text)) return "pastel-romance";
  if (/(숲|온실|식물|나뭇잎|햇살|정원|보태니컬)/u.test(text)) return "botanical-day";
  return null;
}

function inferAngleFromSceneText(text: string): CameraAngleFilter | null {
  if (/(조감|전경|스카이라인|내려다본 도시)/u.test(text)) return "bird-eye";
  if (/(충돌|타격|속도선|긴박|기울|폭발)/u.test(text)) return "dutch";
  if (/(위압|저각도|거대|올려다)/u.test(text)) return "low-angle";
  if (/(내려다|여운|옥상)/u.test(text)) return "high-angle";
  if (/(고백|대화|눈맞춤|클로즈업)/u.test(text)) return "eye-level";
  return null;
}

function inferSketchHintFromSceneText(text: string): SketchStrokeHint | null {
  if (/(속도선|집중선|폭발|타격|충돌)/u.test(text)) return "burst";
  if (/(꽃잎|검기|아치|호)/u.test(text)) return "arc";
  if (/(옥상|교실|복도|투시)/u.test(text)) return "perspective";
  if (/(빗줄기|전봇대|난간)/u.test(text)) return "vertical";
  if (/(군중|실루엣|그림자)/u.test(text)) return "silhouette";
  if (/(창문|하프톤|빌딩|격자)/u.test(text)) return "grid";
  return null;
}

/**
 * 현재 편집 중인 컷의 대사·장면 문맥을 읽어 색감·구도·획 힌트를 추론하고
 * 상업 안전 소재 및 연관 세트 번들을 자동 추천한다.
 */
export function recommendContextualAssetsForCut(
  context: CutAssetRecommendationContext,
  catalog: readonly StudioSmartAssetItem[] = SMART_STUDIO_ASSET_CATALOG,
): ContextualCutRecommendationResult {
  const sceneText = context.sceneText.trim();
  const inferredPaletteMood = context.paletteMood ?? inferMoodFromSceneText(sceneText);
  const inferredCameraAngle = context.cameraAngle ?? inferAngleFromSceneText(sceneText);
  const inferredSketchHint = inferSketchHintFromSceneText(sceneText);
  const commercialSafeOnly = context.commercialSafeOnly ?? true;
  const limit = context.limit ?? 4;

  const primary = searchStudioAssetsSmart(
    {
      query: sceneText,
      paletteMood: inferredPaletteMood,
      commercialSafeOnly,
      limit,
    },
    catalog,
  );

  if (primary.hits.length > 0) {
    return {
      sceneText,
      inferredPaletteMood,
      inferredCameraAngle,
      inferredSketchHint,
      hits: primary.hits,
      recommendedBundles: primary.recommendedBundles,
    };
  }

  const fallback = searchStudioAssetsSmart(
    {
      paletteMood: inferredPaletteMood,
      cameraAngle: inferredCameraAngle,
      commercialSafeOnly,
      limit,
    },
    catalog,
  );

  return {
    sceneText,
    inferredPaletteMood,
    inferredCameraAngle,
    inferredSketchHint,
    hits: fallback.hits,
    recommendedBundles: fallback.recommendedBundles,
  };
}
