import { brushProgramIRSchema } from "@toonstudio/studio-project-model";

import { CspToolFileError } from "./csp-sut-error";
import {
  constantMapping,
  parseCspPressureGraph,
  pressureMapping,
  safeScalar,
} from "./csp-sut-pressure-graph";
import {
  extractValidatedPngs,
  formatCspIssue,
  inspectCspToolFile,
  resolveCspLimits,
  validateCspSqliteHeader,
  validateCspSqliteSnapshot,
  type CspSqliteHeaderInspection,
  type CspSqliteSnapshot,
  type CspSqliteTableSnapshot,
  type CspSqliteValue,
  type CspToolFileKind,
  type CspToolFileLimits,
} from "./csp-sut-sqlite-inspect";
import {
  buildNodeVariantLookup,
  cellByField,
  extractCspProgramFeatures,
  extractCspRowKeyCandidates,
  normalizeUnitOrPercentScalar,
  numericCell,
  semanticField,
  stringCell,
  type CspProgramFeatureExtensions,
} from "./csp-sut-variant-schema";
import {
  bytesToBase64,
  fnv1a64Hex,
  stableTextId,
  type FormatIssue,
} from "./format-common";

import type { BrushProgramIR, DynamicMappingIR } from "@toonstudio/studio-project-model";

export { CspToolFileError, type CspToolFileErrorCode } from "./csp-sut-error";
export { parseCspPressureGraph, type CspPressureGraph } from "./csp-sut-pressure-graph";
export {
  CSP_TOOL_FILE_LIMITS,
  inspectCspToolFile,
  type CspSqliteHeaderInspection,
  type CspSqliteSnapshot,
  type CspSqliteTableSnapshot,
  type CspSqliteValue,
  type CspToolFileKind,
  type CspToolFileLimits,
} from "./csp-sut-sqlite-inspect";
export type {
  CspDualBrushFeature,
  CspProgramFeatureExtensions,
  CspTaperFeature,
  CspTextureFeature,
  CspWaterColorFeature,
  CspWaterEdgeFeature,
} from "./csp-sut-variant-schema";

export interface CspSqliteReadContext {
  kind: CspToolFileKind;
  maxTables: number;
  maxColumnsPerTable: number;
  maxRows: number;
  maxBlobBytes: number;
  maxTextCharacters: number;
  signal?: AbortSignal;
}

export type CspSutSqliteReader = (
  bytes: Uint8Array,
  context: CspSqliteReadContext,
) => Promise<CspSqliteSnapshot>;

export interface CspToolFileImportOptions {
  kind: CspToolFileKind;
  sqliteReader?: CspSutSqliteReader;
  signal?: AbortSignal;
  limits?: Partial<CspToolFileLimits>;
}

export interface CspEmbeddedAsset {
  id: string;
  mimeType: "image/png";
  sourceTable: string;
  sourceColumn: string;
  sourceRow: number;
  width: number;
  height: number;
  base64: string;
}

export interface CspToolRights {
  authors: string[];
  licenses: string[];
  websites: string[];
  emails: string[];
}

export interface CspToolFileImportResult {
  format: "clip-studio-tool" | "clip-studio-tool-group";
  supportLevel: "structured-partial" | "preserve-only";
  inspection: CspSqliteHeaderInspection;
  sqliteVersion: string | null;
  tables: Array<{ name: string; columns: string[]; rowCount: number }>;
  programs: BrushProgramIR[];
  programFeatures?: Readonly<Record<string, CspProgramFeatureExtensions>>;
  assets: CspEmbeddedAsset[];
  rights: CspToolRights;
  warnings: FormatIssue[];
  unsupported: FormatIssue[];
  sourcePayload: { format: "csp-sut" | "csp-sutg"; base64: string };
}

interface ExtractedAssetEntry {
  readonly asset: CspEmbeddedAsset;
  readonly rowKeys: readonly string[];
}

function addRight(target: string[], value: string | null): void {
  if (value !== null && !target.includes(value)) target.push(value);
}

function matchEmbeddedAssetForRow(
  row: Readonly<Record<string, CspSqliteValue>>,
  programIndex: number,
  totalBrushRows: number,
  assetEntries: readonly ExtractedAssetEntry[],
): CspEmbeddedAsset | null {
  if (assetEntries.length === 0) return null;
  const rowKeys = extractCspRowKeyCandidates(row);
  for (const key of rowKeys) {
    const matched = assetEntries.find((entry) => entry.rowKeys.includes(key));
    if (matched) return matched.asset;
  }
  if (totalBrushRows === 1 && assetEntries.length === 1) {
    return assetEntries[0]!.asset;
  }
  if (programIndex < assetEntries.length && assetEntries.length <= totalBrushRows) {
    return assetEntries[programIndex]!.asset;
  }
  return null;
}

function programForRow(
  bytes: Uint8Array,
  kind: CspToolFileKind,
  table: CspSqliteTableSnapshot,
  row: Readonly<Record<string, CspSqliteValue>>,
  rowIndex: number,
  unsupported: FormatIssue[],
  warnings: FormatIssue[],
  nodeLookup: ReturnType<typeof buildNodeVariantLookup> | undefined,
  linkedAsset: CspEmbeddedAsset | null,
): { program: BrushProgramIR; features: CspProgramFeatureExtensions } | null {
  const variantId = numericCell(row, "variantId");
  if (
    variantId !== null &&
    nodeLookup &&
    nodeLookup.byActiveVariantId.size > 0 &&
    !nodeLookup.byActiveVariantId.has(variantId)
  ) {
    return null;
  }
  const linkedNode =
    variantId !== null && nodeLookup
      ? (nodeLookup.byActiveVariantId.get(variantId) ??
        nodeLookup.byFallbackVariantId.get(variantId) ??
        null)
      : null;

  const pressureCell = cellByField(row, "pressureGraph");
  const opacityPressureCell = cellByField(row, "opacityPressureGraph");
  const brushSize = numericCell(row, "brushSize");
  const hardness = numericCell(row, "hardness");
  const spacing = numericCell(row, "spacing");
  const opacity = numericCell(row, "opacity");
  const stabilization = numericCell(row, "stabilization");
  const angleJitter = numericCell(row, "angleJitter");
  const hasBrushField =
    pressureCell !== null ||
    opacityPressureCell !== null ||
    brushSize !== null ||
    hardness !== null ||
    spacing !== null ||
    opacity !== null;
  if (!hasBrushField) return null;

  const path = `${table.name}[${rowIndex}]`;
  const outputProcess = stringCell(row, "outputProcess") ?? linkedNode?.outputProcess ?? null;
  if (
    outputProcess !== null &&
    !["direct-draw", "direct draw", "brush"].includes(outputProcess.toLowerCase())
  ) {
    unsupported.push(
      formatCspIssue(
        "semantic",
        "sut-output-process-unsupported",
        `output process ${outputProcess} is not a verified direct-draw brush`,
        path,
      ),
    );
    return null;
  }
  if (outputProcess === null) {
    warnings.push(
      formatCspIssue(
        "semantic",
        "sut-output-process-missing",
        "output process is absent; row is imported only because verified brush fields are present",
        path,
      ),
    );
  }

  const sizeDynamics: DynamicMappingIR[] = [];
  const flowDynamics: DynamicMappingIR[] = [];
  if (brushSize !== null) {
    if (brushSize > 0 && brushSize <= 10_000) {
      if (brushSize > 1_000) {
        warnings.push(
          formatCspIssue(
            "semantic",
            "sut-brush-size-clamped",
            `brush size ${brushSize}px exceeds the 1000px IR normalization reference`,
            path,
          ),
        );
      }
      sizeDynamics.push(constantMapping(Math.min(1, brushSize / 1_000)));
    } else {
      unsupported.push(
        formatCspIssue("semantic", "sut-brush-size-invalid", `brush size ${brushSize} is invalid`, path),
      );
    }
  }
  const parseGraphCell = (
    cell: { column: string; value: CspSqliteValue } | null,
    target: DynamicMappingIR[],
    code: string,
  ): void => {
    if (cell === null) return;
    if (!(cell.value instanceof Uint8Array)) {
      unsupported.push(formatCspIssue("semantic", code, `${cell.column} is not a BLOB`, path));
      return;
    }
    try {
      target.push(pressureMapping(parseCspPressureGraph(cell.value).curve));
    } catch (cause) {
      unsupported.push(
        formatCspIssue("semantic", code, cause instanceof Error ? cause.message : String(cause), path),
      );
    }
  };
  parseGraphCell(pressureCell, sizeDynamics, "sut-pressure-graph-unsupported");
  parseGraphCell(opacityPressureCell, flowDynamics, "sut-opacity-pressure-graph-unsupported");
  const validOpacity = normalizeUnitOrPercentScalar(opacity);
  if (validOpacity !== null) flowDynamics.push(constantMapping(validOpacity));
  else if (opacity !== null) {
    unsupported.push(
      formatCspIssue(
        "semantic",
        "sut-opacity-scale-unverified",
        `opacity ${opacity} is outside the verified normalized [0,1] or integer [0,100] scale`,
        path,
      ),
    );
  }

  const identityBytes = new TextEncoder().encode(`${fnv1a64Hex(bytes)}\0${table.name}\0${rowIndex}`);
  const id = stableTextId(`csp-${kind}`, identityBytes);
  const rawName = stringCell(row, "name") ?? linkedNode?.name ?? null;
  const name = rawName ?? `${kind.toUpperCase()} ${table.name} ${rowIndex + 1}`;
  if (rawName === null) {
    warnings.push(formatCspIssue("semantic", "sut-name-missing", `fallback name ${name} assigned`, path));
  }
  const validHardness = normalizeUnitOrPercentScalar(hardness);
  const validSpacing = safeScalar(spacing, 1, 1_000);
  if (hardness !== null && validHardness === null) {
    unsupported.push(formatCspIssue("semantic", "sut-hardness-scale-unverified", `hardness ${hardness} rejected`, path));
  }
  if (spacing !== null && validSpacing === null) {
    unsupported.push(formatCspIssue("semantic", "sut-spacing-scale-unverified", `spacing ${spacing} rejected`, path));
  }
  const validStabilization = normalizeUnitOrPercentScalar(stabilization);
  if (stabilization !== null && validStabilization === null) {
    unsupported.push(
      formatCspIssue("semantic", "sut-stabilization-scale-unverified", `stabilization ${stabilization} rejected`, path),
    );
  }
  const validAngleJitter = Math.min(180, safeScalar(angleJitter, 0, 360) ?? 0);

  const extracted = extractCspProgramFeatures(row);
  const features: CspProgramFeatureExtensions = {
    ...extracted,
    ...(linkedAsset ? { linkedAssetId: linkedAsset.id } : {}),
  };

  const mixingKind: "none" | "smudge" | "wet" = features.waterColor?.enabled
    ? (features.waterColor.mixingMode === 1 ? "smudge" : "wet")
    : features.waterEdge?.enabled
      ? "wet"
      : "none";
  const mixingStrength = mixingKind === "none"
    ? 0
    : Math.min(
        1,
        Math.max(
          0.1,
          features.waterColor?.mixColor ??
            features.waterColor?.lmsLinearity ??
            features.waterColor?.colorExtension ??
            features.waterEdge?.strength ??
            0.55,
        ),
      );

  const tipKind: "round" | "stamp" | "image" = linkedAsset
    ? "image"
    : features.dualBrush?.enabled || features.texture?.enabled
      ? "stamp"
      : "round";

  const providerPreference = ["hokusai-natural-media"];
  if (features.waterColor?.enabled) providerPreference.push("csp:watercolor");
  if (features.waterEdge?.enabled) providerPreference.push("csp:water-edge");
  if (features.dualBrush?.enabled) providerPreference.push("csp:dual-brush");
  if (features.texture?.enabled) providerPreference.push("csp:texture");
  if (features.taper) providerPreference.push("csp:taper");

  const program = brushProgramIRSchema.parse({
    id,
    name,
    stabilizer: {
      kind: "ema",
      strength: validStabilization ?? 0.35,
      predictionMs: 0,
    },
    sizeDynamics,
    flowDynamics,
    geometry: {
      kind: "perfect-freehand",
      thinning: features.taper ? 0.72 : 0.5,
      smoothing: validStabilization ?? 0.5,
      streamline: validStabilization ?? 0.5,
      capStart: !(features.taper?.useIn ?? false),
      capEnd: !(features.taper?.useOut ?? false),
    },
    tip: {
      kind: tipKind,
      hardness: validHardness ?? 1,
      spacingPct: validSpacing ?? 10,
      angleJitterDeg: validAngleJitter,
      ...(linkedAsset ? { imageAssetId: linkedAsset.id } : {}),
    },
    mixing: { kind: mixingKind, strength: mixingStrength },
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference,
    sourcePayload: {
      format: kind === "sut" ? "csp-sut" : "csp-sutg",
      base64: bytesToBase64(bytes),
    },
  });
  return { program, features };
}

export async function importCspToolFile(
  source: Uint8Array | ArrayBuffer,
  options: CspToolFileImportOptions,
): Promise<CspToolFileImportResult> {
  const limits = resolveCspLimits(options.limits);
  if (options.signal?.aborted) throw new CspToolFileError("import aborted", "aborted");
  const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
  if (bytes.byteLength > limits.maxBytes) {
    throw new CspToolFileError("SUT/SUTG exceeds the source safety limit", "source-too-large");
  }
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  const inspection = inspectCspToolFile(bytes);
  const validSqlite = validateCspSqliteHeader(bytes, inspection, warnings, unsupported);
  const resultBase = {
    format: options.kind === "sut" ? ("clip-studio-tool" as const) : ("clip-studio-tool-group" as const),
    inspection,
    rights: { authors: [], licenses: [], websites: [], emails: [] } satisfies CspToolRights,
    warnings,
    unsupported,
    sourcePayload: {
      format: options.kind === "sut" ? ("csp-sut" as const) : ("csp-sutg" as const),
      base64: bytesToBase64(bytes),
    },
  };
  if (!validSqlite || options.sqliteReader === undefined) {
    if (validSqlite) {
      unsupported.push(
        formatCspIssue(
          "semantic",
          "sut-sqlite-reader-unavailable",
          "SQLite container is verified, but no sandboxed SQLite reader was provided; original bytes are preserved without claiming semantic import",
        ),
      );
    }
    return {
      ...resultBase,
      supportLevel: "preserve-only",
      sqliteVersion: null,
      tables: [],
      programs: [],
      assets: [],
    };
  }

  let snapshot: CspSqliteSnapshot;
  try {
    snapshot = await options.sqliteReader(bytes, {
      kind: options.kind,
      maxTables: limits.maxTables,
      maxColumnsPerTable: limits.maxColumnsPerTable,
      maxRows: limits.maxRows,
      maxBlobBytes: limits.maxBlobBytes,
      maxTextCharacters: limits.maxTextCharacters,
      signal: options.signal,
    });
    validateCspSqliteSnapshot(snapshot, limits);
  } catch (cause) {
    if (options.signal?.aborted) throw new CspToolFileError("import aborted", "aborted");
    unsupported.push(
      formatCspIssue("semantic", "sut-sqlite-read-failed", cause instanceof Error ? cause.message : String(cause)),
    );
    return {
      ...resultBase,
      supportLevel: "preserve-only",
      sqliteVersion: null,
      tables: [],
      programs: [],
      assets: [],
    };
  }

  const nodeLookup = buildNodeVariantLookup(snapshot.tables);
  const assetEntries: ExtractedAssetEntry[] = [];
  const candidateRows: Array<{ table: CspSqliteTableSnapshot; row: Readonly<Record<string, CspSqliteValue>>; rowIndex: number }> = [];

  for (const table of snapshot.tables) {
    for (const column of table.columns) {
      if (semanticField(column) === null) {
        unsupported.push(
          formatCspIssue(
            "semantic",
            "sut-column-unmapped",
            `SQLite column ${column} is preserved in the original SUT/SUTG payload`,
            table.name,
          ),
        );
      }
    }
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      if (row === undefined) continue;
      addRight(resultBase.rights.authors, stringCell(row, "author"));
      addRight(resultBase.rights.licenses, stringCell(row, "license"));
      addRight(resultBase.rights.websites, stringCell(row, "website"));
      addRight(resultBase.rights.emails, stringCell(row, "email"));
      const fileData = cellByField(row, "fileData");
      if (fileData?.value instanceof Uint8Array) {
        const rowKeys = extractCspRowKeyCandidates(row);
        for (const png of extractValidatedPngs(fileData.value, limits.maxEmbeddedPngPixels)) {
          assetEntries.push({
            asset: {
              id: stableTextId("csp-embedded-png", png.bytes),
              mimeType: "image/png",
              sourceTable: table.name,
              sourceColumn: fileData.column,
              sourceRow: rowIndex,
              width: png.width,
              height: png.height,
              base64: bytesToBase64(png.bytes),
            },
            rowKeys,
          });
        }
      }
      candidateRows.push({ table, row, rowIndex });
    }
  }

  const activeBrushCandidates = candidateRows.filter(({ row }) => {
    const variantId = numericCell(row, "variantId");
    if (
      variantId !== null &&
      nodeLookup.byActiveVariantId.size > 0 &&
      !nodeLookup.byActiveVariantId.has(variantId)
    ) {
      return false;
    }
    return (
      cellByField(row, "pressureGraph") !== null ||
      cellByField(row, "opacityPressureGraph") !== null ||
      numericCell(row, "brushSize") !== null ||
      numericCell(row, "hardness") !== null ||
      numericCell(row, "spacing") !== null ||
      numericCell(row, "opacity") !== null
    );
  });

  const programs: BrushProgramIR[] = [];
  const programFeatures: Record<string, CspProgramFeatureExtensions> = {};
  const linkedAssetIds = new Set<string>();
  for (let idx = 0; idx < activeBrushCandidates.length; idx += 1) {
    const candidate = activeBrushCandidates[idx]!;
    const linkedAsset = matchEmbeddedAssetForRow(
      candidate.row,
      idx,
      activeBrushCandidates.length,
      assetEntries,
    );
    const built = programForRow(
      bytes,
      options.kind,
      candidate.table,
      candidate.row,
      candidate.rowIndex,
      unsupported,
      warnings,
      nodeLookup,
      linkedAsset,
    );
    if (built !== null) {
      programs.push(built.program);
      if (Object.keys(built.features).length > 0) {
        programFeatures[built.program.id] = built.features;
      }
      if (linkedAsset) linkedAssetIds.add(linkedAsset.id);
    }
  }

  const assets = assetEntries.map((entry) => entry.asset);
  assets.sort((left, right) => left.id.localeCompare(right.id, "en"));
  resultBase.rights.authors.sort();
  resultBase.rights.licenses.sort();
  resultBase.rights.websites.sort();
  resultBase.rights.emails.sort();

  const unlinkedAssets = assets.filter((asset) => !linkedAssetIds.has(asset.id));
  if (unlinkedAssets.length > 0) {
    unsupported.push(
      formatCspIssue(
        "semantic",
        "sut-material-link-unverified",
        `${unlinkedAssets.length} validated PNG material(s) were extracted but could not be matched to a brush row`,
      ),
    );
  }
  if (programs.length === 0) {
    unsupported.push(
      formatCspIssue(
        "semantic",
        "sut-brush-schema-unrecognized",
        "no row contained the verified clean-room brush field subset; original tables remain represented by their inventory and source payload",
      ),
    );
  }
  return {
    ...resultBase,
    supportLevel: programs.length > 0 ? "structured-partial" : "preserve-only",
    sqliteVersion: snapshot.sqliteVersion ?? null,
    tables: snapshot.tables.map((table) => ({
      name: table.name,
      columns: [...table.columns],
      rowCount: table.rows.length,
    })),
    programs,
    ...(Object.keys(programFeatures).length > 0 ? { programFeatures } : {}),
    assets,
  };
}
