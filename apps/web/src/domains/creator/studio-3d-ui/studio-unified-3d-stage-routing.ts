/**
 * 통합 3D 스테이지 4단계 규약 및 기존 3D 딥링크 무손실 라우팅 계약.
 */

/** PRODUCT.md 정본 4단계 통합 3D 스테이지 식별자. */
export const UNIFIED_3D_STAGE_IDS = ["build", "pose", "shot", "live-ink"] as const;
export type Unified3dStageId = (typeof UNIFIED_3D_STAGE_IDS)[number];

export interface Unified3dStageSpec {
  readonly id: Unified3dStageId;
  readonly stepNumber: 1 | 2 | 3 | 4;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly summaryKo: string;
  readonly canonicalPath: string;
  readonly legacyPathAliases: readonly string[];
}

export const UNIFIED_3D_STAGE_SPECS: readonly Unified3dStageSpec[] = Object.freeze([
  Object.freeze({
    id: "build",
    stepNumber: 1,
    labelKo: "1 공간 조립",
    shortLabelKo: "공간 조립",
    summaryKo: "배경 세트·가구·벽면 컷어웨이를 배치합니다.",
    canonicalPath: "/studio/3d/stage?stage=build",
    legacyPathAliases: Object.freeze([
      "/studio/bg3d",
      "/studio/3d/dcc/build",
      "/studio/3d/dcc/model",
      "/studio/3d/dcc/cad",
    ]),
  }),
  Object.freeze({
    id: "pose",
    stepNumber: 2,
    labelKo: "2 캐릭터 포즈",
    shortLabelKo: "캐릭터 포즈",
    summaryKo: "캐릭터 체형·표정·관절 포즈와 턴테이블을 맞춥니다.",
    canonicalPath: "/studio/3d/stage?stage=pose",
    legacyPathAliases: Object.freeze([
      "/studio/poser",
      "/studio/character",
      "/studio/assets/characters/new",
      "/shaper",
      "/studio/3d/dcc/sculpt",
    ]),
  }),
  Object.freeze({
    id: "shot",
    stepNumber: 3,
    labelKo: "3 카메라 컷",
    shortLabelKo: "카메라 컷",
    summaryKo: "렌즈·180도 행동선·컷 구도를 확정합니다.",
    canonicalPath: "/studio/3d/stage?stage=shot",
    legacyPathAliases: Object.freeze([
      "/studio/3d/dcc/shot",
      "/studio/storyworld",
      "/studio/compose",
    ]),
  }),
  Object.freeze({
    id: "live-ink",
    stepNumber: 4,
    labelKo: "4 선화 브리지",
    shortLabelKo: "선화 브리지",
    summaryKo: "실시간 선화·톤 분할을 확인하고 2D 원고 컷에 굽습니다.",
    canonicalPath: "/studio/3d/stage?stage=live-ink",
    legacyPathAliases: Object.freeze([
      "/studio/3d/dcc/material",
      "/studio/lift3d",
    ]),
  }),
]);

export interface Unified3dDeepLinkResolution {
  readonly stageId: Unified3dStageId;
  readonly legacySurfaceId: string | null;
  readonly preservedParams: Readonly<Record<string, string>>;
  readonly canonicalHref: string;
}

function normalizePathname(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "/";
  const withoutTrailing = trimmed.length > 1 ? trimmed.replace(/\/+$/u, "") : trimmed;
  return withoutTrailing.toLowerCase();
}

export function isUnified3dStageId(value: unknown): value is Unified3dStageId {
  return (
    typeof value === "string" &&
    (UNIFIED_3D_STAGE_IDS as readonly string[]).includes(value)
  );
}

/** 통합 3D 스테이지 정본 URL을 생성하며 기존 쿼리 파라미터를 무손실 유지한다. */
export function buildUnified3dStageHref(
  stageId: Unified3dStageId,
  preservedParams: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams();
  params.set("stage", stageId);
  for (const key of Object.keys(preservedParams).sort()) {
    if (key === "stage") continue;
    const val = preservedParams[key];
    if (val !== undefined && val !== "") {
      params.set(key, val);
    }
  }
  return `/studio/3d/stage?${params.toString()}`;
}

/**
 * 기존 딥링크(`/studio/bg3d`, `/studio/poser`, `/shaper`, `/studio/assets/characters/new`,
 * `/studio/3d/dcc/*`, `/studio/lift3d` 등)를 4단계 통합 스테이지로 무손실 매핑한다.
 */
export function resolveUnified3dStageFromDeepLink(
  pathname: string,
  search = "",
): Unified3dDeepLinkResolution {
  const normalized = normalizePathname(pathname);
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const preservedParams: Record<string, string> = {};
  query.forEach((value, key) => {
    if (key !== "stage" && value !== "") {
      preservedParams[key] = value;
    }
  });

  const explicitStage = query.get("stage");
  if (isUnified3dStageId(explicitStage)) {
    return {
      stageId: explicitStage,
      legacySurfaceId: normalized === "/studio/3d/stage" ? null : normalized,
      preservedParams,
      canonicalHref: buildUnified3dStageHref(explicitStage, preservedParams),
    };
  }

  for (const spec of UNIFIED_3D_STAGE_SPECS) {
    for (const alias of spec.legacyPathAliases) {
      if (normalized === alias || normalized.startsWith(`${alias}/`) || normalized.endsWith(alias)) {
        return {
          stageId: spec.id,
          legacySurfaceId: alias,
          preservedParams,
          canonicalHref: buildUnified3dStageHref(spec.id, preservedParams),
        };
      }
    }
  }

  return {
    stageId: "build",
    legacySurfaceId: normalized === "/studio/3d/stage" ? null : normalized,
    preservedParams,
    canonicalHref: buildUnified3dStageHref("build", preservedParams),
  };
}
