/**
 * 브러시 그레인 소스 통합 카탈로그 (R8 타일 등록 배선, brush-textures G4 후속).
 *
 * 배경. R8 그레인 소스는 종이 프리셋 타일 6종(studio-paper-media-r8-grain-assets)뿐이었고
 * 그마저 선택 표면이 없어, 패턴 타일 4종(studio-brush-pattern-r8-grain-assets)을 구워도
 * 사용자가 고를 방법이 없었다. 이 모듈이 두 베이커를 하나의 소스 목록으로 묶어
 * (1) 브러시 랩 초기화의 일괄 등록 진입점과 (2) 그레인 소스 선택 표면의 데이터 소스를 제공한다.
 *
 * 계약.
 * - 목록은 결정적이다: 종이 6종(STUDIO_PAPER_PRESET_IDS_V1 순서) → 패턴 4종
 *   (STUDIO_BRUSH_PATTERN_STYLE_IDS_V1 순서). id는 `paper:{presetId}` / `pattern:{styleId}`.
 * - 등록은 명시 호출로만 일어난다. 등록 결과(하이드레이션 영수증)는 모듈 메모에 남아
 *   선택 표면이 소스 해시를 그대로 표시할 수 있다 — 영수증의 encoded/decoded Sha256이
 *   실제 등록된 타일 바이트를 가리킨다.
 * - 선택은 기존 계약을 그대로 쓴다: 그레인 설정의 `source`에 엔트리의 source를 넣으면
 *   정규화·샘플러·하이드레이터가 종이 소스와 같은 경로로 소비한다(소스 종류 구분 없음).
 */

import {
  STUDIO_BRUSH_PATTERN_STYLE_IDS_V1,
  bakeStudioBrushPatternR8GrainTileV1,
  registerStudioBrushPatternR8GrainTilesV1,
  type StudioBrushPatternStyleIdV1,
} from "./studio-brush-pattern-r8-grain-assets";
import {
  bakeStudioPaperMediaR8GrainTileV1,
  registerStudioPaperMediaR8GrainPresetTilesV1,
} from "./studio-paper-media-r8-grain-assets";
import {
  STUDIO_PAPER_PRESET_IDS_V1,
  getStudioPaperPresetV1,
} from "./studio-paper-media-profile-v1";

import type { StudioBrushR8TextureGrainSource } from "./studio-brush-r8-grain-asset-contract";
import type {
  StudioBrushR8GrainHydrationReceipt,
  StudioBrushR8GrainRegistry,
} from "./studio-brush-r8-grain-runtime";
import type { StudioPaperPresetIdV1 } from "./studio-paper-media-profile-v1";

export const STUDIO_BRUSH_GRAIN_SOURCE_CATALOG_VERSION_V1 = 1 as const;

export type StudioBrushGrainSourceKindV1 = "paper" | "pattern";

export interface StudioBrushGrainSourceEntryV1 {
  /** 선택 표면의 안정 키 — `paper:{presetId}` 또는 `pattern:{styleId}`. */
  readonly id: string;
  readonly kind: StudioBrushGrainSourceKindV1;
  /** 종이 프리셋 id(kind=paper) 또는 패턴 스타일 id(kind=pattern). */
  readonly styleKey: string;
  readonly label: string;
  readonly description: string;
  /** 그레인 설정 `source`에 그대로 넣을 수 있는 R8 소스 참조. */
  readonly source: Readonly<StudioBrushR8TextureGrainSource>;
  /** 등록 영수증과 대조할 수 있는 소스 해시(계약 값 그대로). */
  readonly encodedSha256: string;
  readonly decodedSha256: string;
}

/** 패턴 4종의 사용자 표시 이름 — 종이 프리셋의 nameKo와 같은 자리. */
export const STUDIO_BRUSH_PATTERN_STYLE_LABELS_V1: Readonly<
  Record<StudioBrushPatternStyleIdV1, { label: string; description: string }>
> = Object.freeze({
  noise: { label: "거친 노이즈", description: "종이와 무관한 거친 알갱이 질감" },
  "paper-fibre": { label: "종이 섬유", description: "가로로 긴 섬유 결이 드러나는 질감" },
  "canvas-weave": { label: "캔버스 직조", description: "씨실·날실이 교차하는 직조 질감" },
  "halftone-dots": { label: "망점 도트", description: "규칙적인 망점 패턴 질감" },
});

let catalogCacheV1: readonly StudioBrushGrainSourceEntryV1[] | null = null;

function buildCatalogV1(): readonly StudioBrushGrainSourceEntryV1[] {
  const paperEntries = STUDIO_PAPER_PRESET_IDS_V1.map((presetId: StudioPaperPresetIdV1) => {
    const baked = bakeStudioPaperMediaR8GrainTileV1(presetId);
    const preset = getStudioPaperPresetV1(presetId);
    return Object.freeze({
      id: `paper:${presetId}`,
      kind: "paper" as const,
      styleKey: presetId,
      label: preset.nameKo,
      description: preset.descriptionKo,
      source: baked.source,
      encodedSha256: baked.source.asset.encodedSha256,
      decodedSha256: baked.source.asset.decodedSha256,
    });
  });
  const patternEntries = STUDIO_BRUSH_PATTERN_STYLE_IDS_V1.map((styleId) => {
    const baked = bakeStudioBrushPatternR8GrainTileV1(styleId);
    const meta = STUDIO_BRUSH_PATTERN_STYLE_LABELS_V1[styleId];
    return Object.freeze({
      id: `pattern:${styleId}`,
      kind: "pattern" as const,
      styleKey: styleId,
      label: meta.label,
      description: meta.description,
      source: baked.source,
      encodedSha256: baked.source.asset.encodedSha256,
      decodedSha256: baked.source.asset.decodedSha256,
    });
  });
  return Object.freeze([...paperEntries, ...patternEntries]);
}

/**
 * 그레인 소스 선택 목록 — 종이 6종 + 패턴 4종. 베이크가 메모이즈되어 있어
 * 재호출은 타일을 다시 굽지 않는다.
 */
export function listStudioBrushGrainSourcesV1(): readonly StudioBrushGrainSourceEntryV1[] {
  catalogCacheV1 ??= buildCatalogV1();
  return catalogCacheV1;
}

/** 그레인 설정에 들어 있는 소스가 카탈로그의 어느 엔트리인지(assetId 기준) 찾는다. */
export function findStudioBrushGrainSourceEntryV1(
  source: unknown,
): StudioBrushGrainSourceEntryV1 | null {
  if (typeof source !== "object" || source === null) return null;
  const asset = (source as { asset?: unknown }).asset;
  if (typeof asset !== "object" || asset === null) return null;
  const assetId = (asset as { assetId?: unknown }).assetId;
  if (typeof assetId !== "string") return null;
  return listStudioBrushGrainSourcesV1().find((entry) => entry.source.asset.assetId === assetId) ?? null;
}

export interface StudioBrushGrainSourceRegistrationV1 {
  readonly entry: StudioBrushGrainSourceEntryV1;
  readonly status: "ready" | "rejected";
  /** status=ready일 때만 존재 — 소스 해시가 남는 하이드레이션 영수증. */
  readonly receipt: Readonly<StudioBrushR8GrainHydrationReceipt> | null;
}

let lastRegistrationsV1: readonly StudioBrushGrainSourceRegistrationV1[] | null = null;

/**
 * 브러시 랩 초기화 진입점 — 종이 6종과 패턴 4종 타일을 R8 레지스트리에 일괄 등록하고
 * 엔트리별 영수증을 돌려준다. 레지스트리 hydrate는 같은 소스에 대해 캐시 영수증을
 * 돌려주므로 재호출은 안전하다(중복 등록 없음).
 */
export function registerStudioBrushGrainSourcesV1(
  registry?: StudioBrushR8GrainRegistry,
): readonly StudioBrushGrainSourceRegistrationV1[] {
  const byAssetId = new Map<string, { status: "ready" | "rejected"; receipt: Readonly<StudioBrushR8GrainHydrationReceipt> | null }>();
  for (const registration of registerStudioPaperMediaR8GrainPresetTilesV1(registry)) {
    byAssetId.set(
      registration.source.asset.assetId,
      registration.result.status === "ready"
        ? { status: "ready", receipt: registration.result.receipt }
        : { status: "rejected", receipt: null },
    );
  }
  for (const registration of registerStudioBrushPatternR8GrainTilesV1(registry)) {
    byAssetId.set(
      registration.source.asset.assetId,
      registration.result.status === "ready"
        ? { status: "ready", receipt: registration.result.receipt }
        : { status: "rejected", receipt: null },
    );
  }
  const registrations = Object.freeze(
    listStudioBrushGrainSourcesV1().map((entry) => {
      const found = byAssetId.get(entry.source.asset.assetId);
      return Object.freeze({
        entry,
        status: found?.status ?? ("rejected" as const),
        receipt: found?.receipt ?? null,
      });
    }),
  );
  lastRegistrationsV1 = registrations;
  return registrations;
}

/** 마지막 일괄 등록의 영수증 목록(등록 전이면 빈 목록) — 선택 표면의 해시 표시용. */
export function studioBrushGrainSourceRegistrationsV1(): readonly StudioBrushGrainSourceRegistrationV1[] {
  return lastRegistrationsV1 ?? Object.freeze([]);
}
