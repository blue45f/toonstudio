/**
 * 헤어 카드 실제 렌더 썸네일(A-07)의 데이터 쪽: 카드가 그릴 헤어 파라미터, 렌더 캐시 키, 렌더 URL 훅.
 *
 * 카드가 그리는 헤어 = 지금 헤어의 색(기본·끝·그림자·하이라이트·그라데이션) + 그 카드의 스타일
 * 레시피(형태). 선택된 카드는 지금 헤어 그대로다. 두상은 셰이퍼가 마지막으로 잰 모델 두상이다.
 * three.js 렌더러(`character-shaper-hair-thumbnail.ts`)는 처음 필요할 때만 지연 로드한다.
 */
import { useEffect, useMemo, useState } from "react";

import {
  AVATAR_FORGE_VERSION,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  type AvatarForgeHairParams,
} from "../vrm/studio-vrm-avatar-forge";
import { useStudioVrmHairPreviewSource } from "../vrm/studio-vrm-hair-preview-source";
import { buildStudioVrmHairGeometryIdentity } from "../vrm/studio-vrm-hair-transition";

import { CHARACTER_SLOT_CATALOG } from "./character-shaper-catalog";

import type { CharacterSlotPreviewSpec } from "./character-shaper-contract";
import type { StudioVrmHeadFit } from "../vrm/studio-vrm-head-fit";

export type CharacterHairPreviewSpec = Extract<CharacterSlotPreviewSpec, { kind: "hair" }>;

function round(value: number): string {
  return value.toFixed(4);
}

/** 같은 헤어·두상이면 같은 키(렌더 캐시 키). three.js 없이 계산한다. */
export function characterHairThumbnailKey(hair: AvatarForgeHairParams, head: StudioVrmHeadFit | null): string {
  const fit = head ?? null;
  return [
    buildStudioVrmHairGeometryIdentity(hair),
    fit ? [Math.abs(fit.center[0]), fit.center[1], Math.abs(fit.center[2])].map(round).join(",") : "standard",
    fit ? [fit.radiusX, fit.radiusY, fit.radiusZ, fit.faceFront].map(round).join(",") : "",
  ].join("|");
}

/** 카드 한 장이 그릴 헤어 파라미터. 선택된 카드는 지금 헤어, 나머지는 지금 색 + 카드 형태. */
export function resolveCharacterHairCardParams(
  spec: CharacterHairPreviewSpec,
  live: AvatarForgeHairParams | null,
  selected: boolean,
): AvatarForgeHairParams {
  if (selected && live && live.style === spec.style) return live;
  const entry = CHARACTER_SLOT_CATALOG.entries.find(
    (item) => item.apply.kind === "forge-hair" && (item.apply.hair.style ?? "none") === spec.style,
  );
  const card = entry?.apply.kind === "forge-hair"
    ? entry.apply.hair
    : { style: spec.style, bangStyle: spec.bangStyle, length: spec.length, volume: spec.volume };
  const base = live ?? createAvatarForgeState().hair;
  return sanitizeAvatarForgeState({
    version: AVATAR_FORGE_VERSION,
    hair: { ...base, ...card, style: spec.style },
  }).hair;
}

function webglAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.WebGL2RenderingContext !== "undefined";
}

/** 헤어 카드(`spec`)의 렌더 URL. 헤어 카드가 아니거나(null) 렌더 전·불가면 null. */
export function useCharacterHairThumbnail(spec: CharacterHairPreviewSpec | null, selected: boolean): string | null {
  const source = useStudioVrmHairPreviewSource();
  const hair = useMemo(
    () => (spec ? resolveCharacterHairCardParams(spec, source.hair, selected) : null),
    [spec, source.hair, selected],
  );
  const key = hair ? characterHairThumbnailKey(hair, source.head) : null;
  const [rendered, setRendered] = useState<{ readonly key: string; readonly url: string | null } | null>(null);
  const head = source.head;
  const style = spec?.style ?? "none";

  useEffect(() => {
    if (!hair || !key || style === "none" || !webglAvailable()) return;
    let cancelled = false;
    void import("./character-shaper-hair-thumbnail")
      .then(({ renderCharacterHairThumbnail }) => renderCharacterHairThumbnail(hair, head))
      .then((url) => {
        if (!cancelled) setRendered({ key, url });
      })
      .catch((error: unknown) => {
        console.warn("[character-shaper] 헤어 카드 썸네일을 그리지 못해 도해를 유지합니다.", error);
        if (!cancelled) setRendered({ key, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, style, hair, head]);

  // 새 렌더가 오기 전까지는 직전 이미지를 유지해 깜빡이지 않는다.
  return spec ? rendered?.url ?? null : null;
}
