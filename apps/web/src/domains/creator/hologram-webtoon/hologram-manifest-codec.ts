/**
 * `.toon-holo.json` 홀로그램 웹툰 매니페스트 직렬화/역직렬화 및 스키마 검증 코덱.
 */

export type HologramPlaneRole = "bg" | "mid" | "char" | "fx" | "balloon";

export const HOLOGRAM_PLANE_ROLES: readonly HologramPlaneRole[] = [
  "bg",
  "mid",
  "char",
  "fx",
  "balloon",
] as const;

export const HOLOGRAM_MANIFEST_SCHEMA = "toon-holo/1.0" as const;

export interface HologramManifestLayer {
  readonly id: string;
  readonly role: HologramPlaneRole;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly zMm: number;
  readonly opacity: number;
  readonly visible: boolean;
}

export interface HologramWebtoonManifest {
  readonly schema: typeof HOLOGRAM_MANIFEST_SCHEMA;
  readonly sceneId: string;
  readonly title: {
    readonly ko: string;
    readonly en: string;
  };
  readonly createdAtIso: string;
  readonly viewerDefaults: {
    readonly eyeZMm: number;
    readonly ipdMm: number;
    readonly maxComfortDisparityDeg: number;
    readonly holofoilIntensity: number;
    readonly depthOfFieldStrength: number;
  };
  readonly quilt: {
    readonly cols: number;
    readonly rows: number;
    readonly viewConeDeg: number;
  };
  readonly layers: readonly HologramManifestLayer[];
}

export type HologramManifestErrorCode =
  | "INVALID_JSON"
  | "INVALID_ROOT"
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_METADATA"
  | "INVALID_VIEWER_DEFAULTS"
  | "INVALID_QUILT_CONFIG"
  | "INVALID_LAYERS";

export type HologramManifestParseResult =
  | { readonly ok: true; readonly manifest: HologramWebtoonManifest }
  | { readonly ok: false; readonly errorCode: HologramManifestErrorCode; readonly message: string };

function roundValue(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHologramPlaneRole(value: unknown): value is HologramPlaneRole {
  return typeof value === "string" && (HOLOGRAM_PLANE_ROLES as readonly string[]).includes(value);
}

function validateManifestCandidate(candidate: unknown): HologramManifestParseResult {
  if (!isRecord(candidate)) {
    return { ok: false, errorCode: "INVALID_ROOT", message: "Manifest root must be a JSON object." };
  }
  if (candidate.schema !== HOLOGRAM_MANIFEST_SCHEMA) {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_SCHEMA",
      message: `Expected schema "${HOLOGRAM_MANIFEST_SCHEMA}".`,
    };
  }

  const title = candidate.title;
  if (
    !isNonEmptyString(candidate.sceneId) ||
    !isNonEmptyString(candidate.createdAtIso) ||
    !isRecord(title) ||
    !isNonEmptyString(title.ko) ||
    !isNonEmptyString(title.en)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_METADATA",
      message: "Manifest requires non-empty sceneId, createdAtIso, and bilingual title.",
    };
  }

  const vd = candidate.viewerDefaults;
  if (
    !isRecord(vd) ||
    !isFiniteInRange(vd.eyeZMm, 200, 3000) ||
    !isFiniteInRange(vd.ipdMm, 40, 85) ||
    !isFiniteInRange(vd.maxComfortDisparityDeg, 0.5, 5) ||
    !isFiniteInRange(vd.holofoilIntensity, 0, 1) ||
    !isFiniteInRange(vd.depthOfFieldStrength, 0, 1)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_VIEWER_DEFAULTS",
      message: "Manifest viewerDefaults contains missing or out-of-range numeric values.",
    };
  }

  const quilt = candidate.quilt;
  if (
    !isRecord(quilt) ||
    !isFiniteInRange(quilt.cols, 1, 16) ||
    !Number.isInteger(quilt.cols) ||
    !isFiniteInRange(quilt.rows, 1, 16) ||
    !Number.isInteger(quilt.rows) ||
    !isFiniteInRange(quilt.viewConeDeg, 2, 120)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_QUILT_CONFIG",
      message: "Manifest quilt requires integer cols/rows (1..16) and viewConeDeg (2..120).",
    };
  }

  if (!Array.isArray(candidate.layers) || candidate.layers.length === 0 || candidate.layers.length > 16) {
    return {
      ok: false,
      errorCode: "INVALID_LAYERS",
      message: "Manifest layers must be a non-empty array (1..16 entries).",
    };
  }

  const seenIds = new Set<string>();
  const validatedLayers: HologramManifestLayer[] = [];

  for (const rawLayer of candidate.layers) {
    if (
      !isRecord(rawLayer) ||
      !isNonEmptyString(rawLayer.id) ||
      seenIds.has(rawLayer.id) ||
      !isHologramPlaneRole(rawLayer.role) ||
      !isNonEmptyString(rawLayer.labelKo) ||
      !isNonEmptyString(rawLayer.labelEn) ||
      !isFiniteInRange(rawLayer.zMm, -400, 400) ||
      !isFiniteInRange(rawLayer.opacity, 0, 1) ||
      typeof rawLayer.visible !== "boolean"
    ) {
      return {
        ok: false,
        errorCode: "INVALID_LAYERS",
        message: "Each manifest layer requires unique id, valid plane role, labels, zMm (-400..400), opacity (0..1), and visible flag.",
      };
    }
    seenIds.add(rawLayer.id);
    validatedLayers.push({
      id: rawLayer.id,
      role: rawLayer.role,
      labelKo: rawLayer.labelKo,
      labelEn: rawLayer.labelEn,
      zMm: roundValue(rawLayer.zMm, 3),
      opacity: roundValue(rawLayer.opacity, 4),
      visible: rawLayer.visible,
    });
  }

  return {
    ok: true,
    manifest: {
      schema: HOLOGRAM_MANIFEST_SCHEMA,
      sceneId: candidate.sceneId.trim(),
      title: {
        ko: title.ko.trim(),
        en: title.en.trim(),
      },
      createdAtIso: candidate.createdAtIso.trim(),
      viewerDefaults: {
        eyeZMm: roundValue(vd.eyeZMm, 3),
        ipdMm: roundValue(vd.ipdMm, 3),
        maxComfortDisparityDeg: roundValue(vd.maxComfortDisparityDeg, 3),
        holofoilIntensity: roundValue(vd.holofoilIntensity, 4),
        depthOfFieldStrength: roundValue(vd.depthOfFieldStrength, 4),
      },
      quilt: {
        cols: quilt.cols,
        rows: quilt.rows,
        viewConeDeg: roundValue(quilt.viewConeDeg, 3),
      },
      layers: validatedLayers,
    },
  };
}

/**
 * `.toon-holo.json` 홀로그램 웹툰 매니페스트를 검증 후 결정적 JSON 문자열로 직렬화한다.
 */
export function serializeHologramManifest(manifest: HologramWebtoonManifest): string {
  const checked = validateManifestCandidate(manifest);
  if (!checked.ok) {
    throw new Error(`Invalid hologram manifest (${checked.errorCode}): ${checked.message}`);
  }
  return `${JSON.stringify(checked.manifest, null, 2)}\n`;
}

/**
 * `.toon-holo.json` 문자열을 파싱하고 스키마·수치 범위를 검증한다.
 */
export function parseHologramManifest(rawJson: string): HologramManifestParseResult {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    return { ok: false, errorCode: "INVALID_JSON", message: "Manifest input is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Syntax error";
    return { ok: false, errorCode: "INVALID_JSON", message: `Failed to parse JSON: ${detail}` };
  }
  return validateManifestCandidate(parsed);
}
