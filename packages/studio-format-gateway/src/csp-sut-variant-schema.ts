/**
 * Clip Studio Paint `.sut` / `.sutg` / `EditImageTool.todb` SQLite 컬럼 별칭 및
 * `Node` + `Variant` 분리 스키마 조회 헬퍼.
 *
 * REA 역공학으로 검증된 CSP 5.1.5 `EditImageTool.todb` (255 `Node` 행, 416 `Variant` 행,
 * 507개 `Variant` 브러시 엔진 컬럼)의 컬럼 매핑과 활성 변형(NodeVariantId) 조인을 수행한다.
 */

import type { CspSqliteTableSnapshot, CspSqliteValue } from "./csp-sut";

function normalizedColumn(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[_\s.-]+/gu, "");
}

export const CSP_FIELD_ALIASES = Object.freeze({
  name: new Set(["name", "toolname", "subtoolname", "pwname", "nodename"]),
  outputProcess: new Set(["outputprocess", "processtype", "nodeoutputprocess"]),
  brushSize: new Set(["brushsize", "brushdiameter", "diameter"]),
  hardness: new Set(["hardness", "brushhardness"]),
  spacing: new Set(["spacing", "brushspacing", "interval", "brushinterval"]),
  opacity: new Set(["opacity", "brushopacity", "brushflow"]),
  stabilization: new Set(["stabilization", "stabilizer", "correction", "brushrevision"]),
  pressureGraph: new Set(["pressuregraph", "sizepressuregraph", "brushsizeeffector"]),
  opacityPressureGraph: new Set([
    "opacitypressuregraph",
    "flowpressuregraph",
    "brushfloweffector",
    "brushopacityeffector",
  ]),
  angleJitter: new Set(["anglejitter", "brushrotation", "brushangle"]),
  variantId: new Set(["variantid"]),
  nodeVariantId: new Set(["nodevariantid"]),
  nodeInitVariantId: new Set(["nodeinitvariantid"]),
  waterColor: new Set([
    "brushusewatercolor",
    "brushcolormixingmode",
    "brushlmslinearity",
    "brushmixcolor",
    "brushmixalpha",
    "brushmixcolorextension",
  ]),
  waterEdge: new Set([
    "brushusewateredge",
    "brushwateredgeradius",
    "brushwateredgestrength",
    "brushwateredgevividness",
  ]),
  dualBrush: new Set([
    "usedualbrush",
    "dual2brushsize",
    "dual2compositemode",
    "dual2brushhardness",
    "dual2brushinterval",
  ]),
  texture: new Set([
    "texturedensity",
    "texturescale2",
    "texturerotation",
    "texturecompositemode",
    "brushusepatternimage",
  ]),
  taper: new Set(["brushusein", "brushinlength", "brushuseout", "brushoutlength"]),
  author: new Set(["author", "creator"]),
  license: new Set(["license", "licence"]),
  website: new Set(["website", "url"]),
  email: new Set(["email"]),
  fileData: new Set(["filedata"]),
});

export type CspSemanticField = keyof typeof CSP_FIELD_ALIASES;

export function semanticField(column: string): CspSemanticField | null {
  const normalized = normalizedColumn(column);
  for (const [field, aliases] of Object.entries(CSP_FIELD_ALIASES) as Array<
    [CspSemanticField, ReadonlySet<string>]
  >) {
    if (aliases.has(normalized)) return field;
  }
  return null;
}

export function cellByField(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: CspSemanticField,
): { column: string; value: CspSqliteValue } | null {
  for (const [column, value] of Object.entries(row)) {
    if (semanticField(column) === field) return { column, value };
  }
  return null;
}

export function numericCell(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: CspSemanticField,
): number | null {
  const value = cellByField(row, field)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringCell(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: CspSemanticField,
): string | null {
  const value = cellByField(row, field)?.value;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export interface CspNodeVariantMetadata {
  readonly name: string | null;
  readonly outputProcess: string | null;
}

export function normalizeUnitOrPercentScalar(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (Number.isInteger(value) && value > 1 && value <= 100) return value / 100;
  return null;
}

export function buildNodeVariantLookup(
  tables: readonly CspSqliteTableSnapshot[],
): {
  readonly byActiveVariantId: ReadonlyMap<number, CspNodeVariantMetadata>;
  readonly byFallbackVariantId: ReadonlyMap<number, CspNodeVariantMetadata>;
} {
  const byActiveVariantId = new Map<number, CspNodeVariantMetadata>();
  const byFallbackVariantId = new Map<number, CspNodeVariantMetadata>();
  for (const table of tables) {
    for (const row of table.rows) {
      const activeId = numericCell(row, "nodeVariantId");
      const initId = numericCell(row, "nodeInitVariantId");
      if (activeId === null && initId === null) continue;
      const meta: CspNodeVariantMetadata = {
        name: stringCell(row, "name"),
        outputProcess: stringCell(row, "outputProcess"),
      };
      if (activeId !== null && !byActiveVariantId.has(activeId)) {
        byActiveVariantId.set(activeId, meta);
      }
      if (initId !== null && !byFallbackVariantId.has(initId)) {
        byFallbackVariantId.set(initId, meta);
      }
    }
  }
  return { byActiveVariantId, byFallbackVariantId };
}
