/**
 * 썸네일 캐시 키와 LRU 캐시.
 *
 * 프리셋 P의 썸네일은 `reduce(recipe, slot/apply P)`의 플랜이므로, P의 patch가 덮어쓰는 값은 썸네일에 영향이 없다.
 * 캐시 키는 그 부분을 뺀 레시피 digest다: 해당 슬롯 값, (카탈로그가 있으면) P의 patch가 다루는 파라미터·색,
 * 그리고 P가 덮어쓰는 표정/포즈/손 포즈 필드(카탈로그가 없으면 슬롯 종류로 판정)를 뺀다.
 * 따라서 같은 슬롯의 현재 선택을 바꾸거나 P가 덮어쓰는 키를 슬라이더로 바꿔도 P 카드의 키는 그대로이고,
 * 다른 슬롯·다른 색·셰이딩 모드가 바뀌면 키가 바뀐다.
 * paint 레이어(base64, 수 MB)는 썸네일에 반영하지 않으므로 키에서 제외한다.
 *
 * 레시피 v3(2026-10-23 S-1): 그림을 바꾸는 v3 값 — 직접 지정한 상속 채널 색(27채널 맵 전체)·옷장(층·추가 소품)·형태 값·표면·헤어 색 흐름·
 * 비례 목표·화풍 중립 표정 — 을 키에 넣는다(넣지 않으면 아우터를 바꿔도 다른 카드가 옛 그림을 재사용한다). 툰 모드에서는 툰 4필드와 look도 넣는다.
 * PBR 모드는 툰 필드·look을 그리지 않으므로(엔진 외곽선·툰 재질 경로) 빼서 캐시를 살린다. 화풍 출처(`style.packId`·`packRevision`)는
 * 값이 이미 레시피에 복사돼 있어(copy-on-apply) 그림과 무관하므로 뺀다. 그림자·후처리·IBL·톤 매핑은 지금처럼 키에 넣지 않는다(기존 결정).
 * 화풍 카드(`ThumbnailRequest.shading`, 다섯째 인자 `options.shading`)는 레시피 셰이딩 대신 그 프로파일의 모드·툰·look으로 키를 만들고
 * `|style|` 표지를 붙인다 — 팩마다 키가 달라 서로 덮어쓰지 않고, 같은 프리셋의 일반 카드 키와도 겹치지 않는다.
 */
import { presetSlot } from "../contracts";
import { fnv1a64Hex } from "../shared/hash";
import { stableStringify } from "../shared/stable-json";

import type { BodyParamKey, CapturedRaster, ChannelKey, CharacterRecipe, FaceParamKey, PresetCatalog, PresetId, ShadingMode, ShadingProfile } from "../contracts";

export const THUMBNAIL_CACHE_DEFAULT_LIMIT = 400;

export interface ThumbnailKeyOptions {
  /** 화풍 카드 미리보기 셰이딩(`ThumbnailRequest.shading`). 있으면 `shadingMode` 인자 대신 이 프로파일의 모드를 쓴다. */
  readonly shading?: ShadingProfile;
}

export function thumbnailCacheKey(presetId: PresetId, recipe: CharacterRecipe, shadingMode: ShadingMode, catalog?: PresetCatalog, options: ThumbnailKeyOptions = {}): string {
  const slot = presetSlot(presetId);
  const target = catalog?.get(presetId);

  const body: Partial<Record<BodyParamKey, number>> = { ...recipe.body };
  const face: Partial<Record<FaceParamKey, number>> = { ...recipe.face };
  const colors: Partial<Record<ChannelKey, string>> = { ...recipe.colors };
  if (target) {
    for (const key of Object.keys(target.patch.body ?? {}) as BodyParamKey[]) delete body[key];
    for (const key of Object.keys(target.patch.face ?? {}) as FaceParamKey[]) delete face[key];
    for (const key of Object.keys(target.patch.colors ?? {}) as ChannelKey[]) delete colors[key];
  }
  // 연기 필드는 patch가 그 필드를 통째로 교체할 때만 썸네일과 무관하다. 카탈로그가 없으면 슬롯 종류로 근사한다.
  const overridesExpression = target ? target.patch.expression !== undefined : slot === "expression";
  const overridesPose = target ? target.patch.pose !== undefined : slot === "pose";
  const overridesHandPose = target ? target.patch.handPose !== undefined : slot === "hand-pose";
  const override = options.shading;
  const mode = override?.mode ?? shadingMode;
  const shading = override ?? recipe.shading;

  const subject = {
    source: recipe.source,
    slots: { ...recipe.slots, [slot]: null },
    body,
    face,
    colors,
    expression: overridesExpression ? null : recipe.expression,
    pose: overridesPose ? null : recipe.pose,
    handPose: overridesHandPose ? null : recipe.handPose,
    physics: recipe.physics,
    shadingMode: mode,
    toonLook: mode === "toon" ? { toon: shading.toon, look: shading.look } : null,
    style: { proportion: recipe.style.proportion, neutralFacs: recipe.style.neutralFacs },
    wardrobe: recipe.wardrobe,
    partParams: recipe.partParams,
    surfaces: recipe.surfaces,
    hairColor: recipe.hairColor,
  };
  return `${presetId}|${mode}${override ? "|style" : ""}|${fnv1a64Hex(stableStringify(subject))}`;
}

export interface ThumbnailCache {
  readonly limit: number;
  get(key: string): CapturedRaster | undefined;
  set(key: string, raster: CapturedRaster): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  /** 가장 오래된 것부터 */
  keys(): readonly string[];
}

/** 접근 순서 기반 LRU. `get`/`set`이 항목을 최신으로 올리고 한도를 넘으면 가장 오래된 항목을 버린다. */
export function createThumbnailCache(limit: number = THUMBNAIL_CACHE_DEFAULT_LIMIT): ThumbnailCache {
  const max = Math.max(1, Math.floor(limit));
  const map = new Map<string, CapturedRaster>();
  return {
    limit: max,
    get(key) {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, raster) {
      map.delete(key);
      map.set(key, raster);
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    has: (key) => map.has(key),
    delete: (key) => map.delete(key),
    clear: () => map.clear(),
    size: () => map.size,
    keys: () => [...map.keys()],
  };
}
