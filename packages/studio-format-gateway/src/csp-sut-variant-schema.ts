/**
 * Clip Studio Paint `.sut` / `.sutg` / `EditImageTool.todb` SQLite 컬럼 별칭,
 * `Node` + `Variant` 분리 스키마 조회 및 고급 브러시 속성 추출 헬퍼.
 *
 * REA 역공학으로 검증된 CSP 5.1.5 `EditImageTool.todb` (255 `Node` 행, 416 `Variant` 행,
 * 507개 `Variant` 브러시 엔진 컬럼)의 컬럼 매핑과 활성 변형(NodeVariantId) 조인,
 * Material 테이블 PNG 팁 자동 결선, 수채/워터엣지/듀얼브러시/텍스처/테이퍼 추출을 수행한다.
 */

import type { CspSqliteTableSnapshot, CspSqliteValue } from "./csp-sut";

export function normalizedColumn(name: string): string {
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
    "dualbrushcompositemode",
    "changergbbydual",
    "syncdualbrushsize",
    "dualantialias",
    "dualsize",
    "dualflow",
    "dualhardness",
    "dualinterval",
    "dualthickness",
    "dualrotation",
    "dualribbon",
    "dualusespray",
    "dualspraysize",
    "dualspraydensity",
    "dualspraybias",
    "dualtexturedensity",
  ]),
  texture: new Set([
    "texturedensity",
    "texturescale",
    "texturescale2",
    "texturerotation",
    "texturerotate",
    "texturecompositemode",
    "texturereversedensity",
    "textureforplot",
    "texturebrightness",
    "texturecontrast",
    "brushusepatternimage",
  ]),
  ribbon: new Set(["brushribbon"]),
  spray: new Set([
    "brushusespray",
    "brushspraysize",
    "brushspraysizesyncbrushsize",
    "brushspraydensity",
    "brushspraybias",
    "brushrotationinspray",
    "brushrotationrandominspray",
  ]),
  colorJitter: new Set([
    "brushchangepatterncolor",
    "brushchangestrokecolor",
    "brushhuechange",
    "brushsaturationchange",
    "brushvaluechange",
    "brushstrokehuechange",
    "brushstrokesaturationchange",
    "brushstrokevaluechange",
    "brushsubcolor",
    "brushstrokesubcolor",
    "brushchangecolortarget",
  ]),
  tipShape: new Set([
    "brushthickness",
    "brushverticalthicknes",
    "brushrotationrandomscale",
    "brushpatternordertype",
    "brushpatternordertype2",
    "brushpatternreversehorizontal",
    "brushpatternreversevertical",
    "brushblendpatternbydarken",
    "brushadjustflowbyinterval",
    "brushatleast1pixel",
    "antialias",
    "brushsharpencorner",
    "brushuserevision",
    "brushrevisionbyspeed",
    "flickerreduction",
  ]),
  taper: new Set([
    "brushusein",
    "brushinlength",
    "brushinratio",
    "brushuseout",
    "brushoutlength",
    "brushoutratio",
    "brushinoutbyspeed",
  ]),
  materialRef: new Set([
    "brushpatternimagearray",
    "materialid",
    "tipmaterialid",
    "materialuuid",
    "catalogpath",
    "originalpath",
    "pwid",
    "id",
  ]),
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

function exactNumericColumn(
  row: Readonly<Record<string, CspSqliteValue>>,
  normalizedName: string,
): number | null {
  for (const [column, value] of Object.entries(row)) {
    if (normalizedColumn(column) !== normalizedName) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
  }
  return null;
}

function exactStringColumn(
  row: Readonly<Record<string, CspSqliteValue>>,
  normalizedName: string,
): string | null {
  for (const [column, value] of Object.entries(row)) {
    if (normalizedColumn(column) !== normalizedName) continue;
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function normalizeUnitOrPercentScalar(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (Number.isInteger(value) && value > 1 && value <= 100) return value / 100;
  return null;
}

function normalizedFraction(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return 1;
}

export interface CspWaterColorFeature {
  readonly enabled: boolean;
  readonly mixingMode: number;
  readonly lmsLinearity: number | null;
  readonly mixColor: number | null;
  readonly mixAlpha: number | null;
  readonly colorExtension: number | null;
}

export interface CspWaterEdgeFeature {
  readonly enabled: boolean;
  readonly radius: number | null;
  readonly strength: number | null;
  readonly vividness: number | null;
}

export interface CspDualBrushFeature {
  readonly enabled: boolean;
  readonly size: number | null;
  readonly compositeMode: number | null;
  readonly hardness: number | null;
  readonly interval: number | null;
}

export interface CspTextureFeature {
  readonly enabled: boolean;
  readonly density: number | null;
  readonly scale: number | null;
  readonly rotationDeg: number | null;
  readonly compositeMode: number | null;
}

export interface CspTaperFeature {
  readonly useIn: boolean;
  readonly inLength: number | null;
  readonly useOut: boolean;
  readonly outLength: number | null;
}

export interface CspProgramFeatureExtensions {
  readonly waterColor?: CspWaterColorFeature;
  readonly waterEdge?: CspWaterEdgeFeature;
  readonly dualBrush?: CspDualBrushFeature;
  readonly texture?: CspTextureFeature;
  readonly taper?: CspTaperFeature;
  readonly linkedAssetId?: string;
}

export function extractCspProgramFeatures(
  row: Readonly<Record<string, CspSqliteValue>>,
): CspProgramFeatureExtensions {
  const useWater = exactNumericColumn(row, "brushusewatercolor");
  const mixingMode = exactNumericColumn(row, "brushcolormixingmode");
  const lmsLinearity = normalizedFraction(exactNumericColumn(row, "brushlmslinearity"));
  const mixColor = normalizedFraction(exactNumericColumn(row, "brushmixcolor"));
  const mixAlpha = normalizedFraction(exactNumericColumn(row, "brushmixalpha"));
  const colorExtension = normalizedFraction(exactNumericColumn(row, "brushmixcolorextension"));
  const waterEnabled =
    (useWater !== null && useWater !== 0) ||
    (mixColor !== null && mixColor > 0) ||
    (mixingMode !== null && mixingMode > 0 && useWater !== 0);
  const waterColor: CspWaterColorFeature | undefined = waterEnabled
    ? {
        enabled: true,
        mixingMode: mixingMode ?? 0,
        lmsLinearity,
        mixColor,
        mixAlpha,
        colorExtension,
      }
    : undefined;

  const useEdge = exactNumericColumn(row, "brushusewateredge");
  const edgeRadius = exactNumericColumn(row, "brushwateredgeradius");
  const edgeStrength = normalizedFraction(exactNumericColumn(row, "brushwateredgestrength"));
  const edgeVividness = normalizedFraction(exactNumericColumn(row, "brushwateredgevividness"));
  const edgeEnabled =
    (useEdge !== null && useEdge !== 0) ||
    (edgeStrength !== null && edgeStrength > 0 && useEdge !== 0);
  const waterEdge: CspWaterEdgeFeature | undefined = edgeEnabled
    ? {
        enabled: true,
        radius: edgeRadius,
        strength: edgeStrength,
        vividness: edgeVividness,
      }
    : undefined;

  const useDual = exactNumericColumn(row, "usedualbrush");
  const dualSize = exactNumericColumn(row, "dual2brushsize");
  const dualComposite = exactNumericColumn(row, "dual2compositemode");
  const dualHardness = normalizedFraction(exactNumericColumn(row, "dual2brushhardness"));
  const dualInterval = exactNumericColumn(row, "dual2brushinterval");
  const dualBrush: CspDualBrushFeature | undefined = useDual !== null && useDual !== 0
    ? {
        enabled: true,
        size: dualSize,
        compositeMode: dualComposite,
        hardness: dualHardness,
        interval: dualInterval,
      }
    : undefined;

  const usePattern = exactNumericColumn(row, "brushusepatternimage");
  const texDensity = normalizedFraction(exactNumericColumn(row, "texturedensity"));
  const texScale = exactNumericColumn(row, "texturescale2");
  const texRot = exactNumericColumn(row, "texturerotation");
  const texComposite = exactNumericColumn(row, "texturecompositemode");
  const textureEnabled =
    (usePattern !== null && usePattern !== 0) ||
    (texDensity !== null && texDensity > 0 && usePattern !== 0);
  const texture: CspTextureFeature | undefined = textureEnabled
    ? {
        enabled: true,
        density: texDensity,
        scale: texScale,
        rotationDeg: texRot,
        compositeMode: texComposite,
      }
    : undefined;

  const useIn = (exactNumericColumn(row, "brushusein") ?? 0) !== 0;
  const inLength = exactNumericColumn(row, "brushinlength");
  const useOut = (exactNumericColumn(row, "brushuseout") ?? 0) !== 0;
  const outLength = exactNumericColumn(row, "brushoutlength");
  const taper: CspTaperFeature | undefined =
    useIn || useOut || (inLength !== null && inLength > 0) || (outLength !== null && outLength > 0)
      ? {
          useIn: useIn || (inLength !== null && inLength > 0),
          inLength,
          useOut: useOut || (outLength !== null && outLength > 0),
          outLength,
        }
      : undefined;

  return {
    ...(waterColor ? { waterColor } : {}),
    ...(waterEdge ? { waterEdge } : {}),
    ...(dualBrush ? { dualBrush } : {}),
    ...(texture ? { texture } : {}),
    ...(taper ? { taper } : {}),
  };
}

export function extractCspRowKeyCandidates(
  row: Readonly<Record<string, CspSqliteValue>>,
): readonly string[] {
  const keys: string[] = [];
  for (const name of ["materialid", "tipmaterialid", "materialuuid", "catalogpath", "originalpath", "pwid", "id"]) {
    const str = exactStringColumn(row, name);
    if (str) keys.push(str.toLowerCase());
    const num = exactNumericColumn(row, name);
    if (num !== null) keys.push(`id:${Math.trunc(num)}`);
  }
  const patBlob = cellByField(row, "materialRef");
  if (patBlob?.value instanceof Uint8Array && patBlob.value.byteLength >= 4) {
    const ascii = new TextDecoder("latin1").decode(patBlob.value);
    const paths = ascii.match(/(?:material|tip|brush)[/\\][^\0\s]{2,120}/giu);
    if (paths) for (const p of paths) keys.push(p.toLowerCase());
  }
  return keys;
}

export interface CspNodeVariantMetadata {
  readonly name: string | null;
  readonly outputProcess: string | null;
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
