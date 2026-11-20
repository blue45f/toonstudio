import {
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
} from "../apps/web/src/domains/creator/brush/studio-brush-catalog";

export interface FidelityCaseDefinition {
  /** Saved IDs remain stable when the picker display name changes. */
  readonly id:
    | "inkwash-pen"
    | "pen"
    | "gpen"
    | "maru-pen"
    | "watercolor"
    | "oil"
    | "pencil"
    | "airbrush";
  readonly contract: string;
}

/** A case resolved against the shipped picker: name and width come from the catalogue, not literals. */
export interface FidelityCase extends FidelityCaseDefinition {
  readonly brushName: string;
  /** Catalogue default width, so a preview build measures the shipped configuration. */
  readonly brushWidth: number;
  readonly brushOperation: "paint" | "erase";
}

/**
 * 8대 대표 매체 라이브/커밋 픽셀 일치 검증 스위트:
 * 먹번짐·펜·G펜·마루펜·수채(38밴드 KM/LBM)·유화(GGX 임파스토)·연필·에어브러시.
 * 모든 ID는 실제 노출 카탈로그에서 이름·기본 폭을 동적 해석한다.
 */
export const FIDELITY_CASES = Object.freeze([
  {
    id: "inkwash-pen",
    contract: "fluid wet-ink live overlay → committed document pixels",
  },
  {
    id: "pen",
    contract: "thin-line causal filtering → committed document geometry",
  },
  {
    id: "gpen",
    contract: "dip-pen nib flex & taper sharpness → committed outline fidelity",
  },
  {
    id: "maru-pen",
    contract: "ultra-fine manga nib pressure taper → committed subpixel stroke fidelity",
  },
  {
    id: "watercolor",
    contract: "38-band KM wet pigment & capillary edge bloom → committed wash fidelity",
  },
  {
    id: "oil",
    contract: "GGX impasto relief & bristle load carrier → committed ribbon fidelity",
  },
  {
    id: "pencil",
    contract: "dry-media paper tooth grain response → committed graphite fidelity",
  },
  {
    id: "airbrush",
    contract: "linear soft-falloff continuous envelope → committed mist fidelity",
  },
] as const satisfies readonly FidelityCaseDefinition[]);

/**
 * Bind a case to the brush the shipped picker actually lists. The child probe drives the desktop
 * catalogue by its accessible label, so the label has to come from the same source the UI renders
 * from; reading it here also keeps the "selected brush matches the case" assertion meaningful
 * instead of echoing a literal back at itself.
 */
export function resolveCase(
  definition: FidelityCaseDefinition,
  catalogue = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
): FidelityCase {
  const item = catalogue.find((entry) => entry.id === definition.id);
  if (!item) {
    throw new Error(
      `fidelity case "${definition.id}" is not listed in the shipped brush picker;`
      + " a delisted or renamed id must be replaced here, not selected by a stale label",
    );
  }
  return {
    ...definition,
    brushName: item.name,
    brushWidth: item.defaultWidth,
    brushOperation: item.operation,
  };
}

