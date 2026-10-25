/**
 * studio-bg3d-sketchup-shadow-and-exporter.ts
 *
 * SketchUp 태양광 그림자 스터디(ShadowInfo: 위도·경도·Solar North·날짜·시각·Light/Dark 슬라이더) 및
 * 네이티브 `.skp` v17 바이너리 저작·다중 CAD 포맷 내보내기(`.skp`, `.dxf`, `.ifc`, `.obj`, `.stl`, `.ply`, `.glb`) 엔진.
 *
 * 근거(REA `ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a`):
 * - OpenSKP `create()` (`SkpBuilder`): 브라우저·Worker에서 SketchUp 2017+ 호환 `.skp` VFF 바이너리 직접 생성
 * - OpenSKP `toDXF`, `toIFC`, `toOBJ`, `toMTL`, `toSTLBinary`, `toPLYBinary`, `toInstancedGLB` 내보내기
 */

import { studioBg3dKelvinToHexColor } from "./studio-bg3d-sun-rig";

import type {
  StudioBg3dLightingSettings,
  StudioBg3dVec3,
} from "./studio-bg3d-scene-document-types";

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export interface SketchUpShadowInfoConfig {
  /** 위도(도, -90..90, 북위 양수, 기본 서울 37.5665°). */
  readonly latitudeDeg: number;
  /** 경도(도, -180..180, 동경 양수, 기본 서울 126.9780°). */
  readonly longitudeDeg: number;
  /** 표준시 UTC 오프셋(시간, 기본 +9 KST). */
  readonly utcOffsetHours: number;
  /** 모델의 Solar North 오프셋 각도(도, -180..180, 기본 0° = +Z/북쪽). */
  readonly solarNorthAngleDeg: number;
  /** 월(1..12). */
  readonly month: number;
  /** 일(1..31). */
  readonly day: number;
  /** 시각(0..24, 소수 허용, 예: 14.5 = 오후 2시 30분). */
  readonly timeOfDayHours: number;
  /** SketchUp Light 슬라이더(0..100, 기본 80) — 직사광 밝기 비중. */
  readonly lightSlider: number;
  /** SketchUp Dark 슬라이더(0..100, 기본 45) — 그림자 영역(주변광) 밝기 비중. */
  readonly darkSlider: number;
  readonly shadowsEnabled: boolean;
  readonly useSunForShading: boolean;
}

export const DEFAULT_SKETCHUP_SHADOW_INFO: SketchUpShadowInfoConfig = Object.freeze({
  latitudeDeg: 37.5665,
  longitudeDeg: 126.978,
  utcOffsetHours: 9,
  solarNorthAngleDeg: 0,
  month: 6,
  day: 21,
  timeOfDayHours: 13.5,
  lightSlider: 80,
  darkSlider: 45,
  shadowsEnabled: true,
  useSunForShading: true,
});

export interface SketchUpSolarPositionResult {
  readonly dayOfYear: number;
  readonly declinationDeg: number;
  readonly solarAltitudeDeg: number;
  readonly solarAzimuthDeg: number;
  readonly sunriseHour: number;
  readonly sunsetHour: number;
  readonly isDaytime: boolean;
  /** 피사체에서 태양을 향하는 Y-up 단위 벡터 `[x, y, z]`. */
  readonly sunDirectionYUp: StudioBg3dVec3;
  readonly colorTemperatureK: number;
}

const MONTH_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function computeDayOfYear(month: number, day: number): number {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  const maxDay = MONTH_DAYS[m] ?? 30;
  const d = Math.min(maxDay, Math.max(1, Math.round(day)));
  let total = d;
  for (let i = 1; i < m; i += 1) {
    total += MONTH_DAYS[i] ?? 30;
  }
  return total;
}

/**
 * SketchUp `ShadowInfo` 기반 천문 태양 위치(고도·방위각·일출/일몰·Y-up 광원 벡터) 계산기.
 */
export function computeSketchUpSolarPosition(
  config: SketchUpShadowInfoConfig,
): SketchUpSolarPositionResult {
  const latDeg = Math.min(89.5, Math.max(-89.5, config.latitudeDeg));
  const lonDeg = Math.min(180, Math.max(-180, config.longitudeDeg));
  const utcOffset = Math.min(14, Math.max(-12, config.utcOffsetHours));
  const northOffsetDeg = config.solarNorthAngleDeg;
  const dayOfYear = computeDayOfYear(config.month, config.day);

  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;

  // 태양 적위 (Cooper 방정식)
  const declinationDeg = 23.45 * Math.sin(((360 / 365) * (284 + dayOfYear)) * deg2rad);
  const decRad = declinationDeg * deg2rad;
  const latRad = latDeg * deg2rad;

  // 균시차 (Equation of Time, 분) 및 지방 태양시(Local Solar Time) 보정
  const bRad = ((360 / 365) * (dayOfYear - 81)) * deg2rad;
  const eotMinutes = 9.87 * Math.sin(2 * bRad) - 7.53 * Math.cos(bRad) - 1.5 * Math.sin(bRad);
  const standardMeridianDeg = utcOffset * 15;
  const timeCorrectionMinutes = 4 * (lonDeg - standardMeridianDeg) + eotMinutes;
  const solarTimeHours = config.timeOfDayHours + timeCorrectionMinutes / 60;

  // 시간각 (Hour Angle, 정오 = 0°, 시간당 15°)
  const hourAngleDeg = (solarTimeHours - 12) * 15;
  const hourAngleRad = hourAngleDeg * deg2rad;

  // 태양 고도 (Altitude)
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngleRad);
  const altRad = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  const solarAltitudeDeg = round6(altRad * rad2deg);

  // 태양 방위각 (북쪽=0°, 동쪽=90°, 남쪽=180°, 서쪽=270°)
  const cosAz = (Math.sin(decRad) - Math.sin(altRad) * Math.sin(latRad)) /
    Math.max(1e-6, Math.cos(altRad) * Math.cos(latRad));
  let azimuthFromNorthDeg = Math.acos(Math.min(1, Math.max(-1, cosAz))) * rad2deg;
  if (hourAngleDeg > 0) {
    azimuthFromNorthDeg = 360 - azimuthFromNorthDeg;
  }
  const adjustedAzimuthDeg = round6(((azimuthFromNorthDeg + northOffsetDeg) % 360 + 360) % 360);

  // 일출/일몰 시각 계산
  const cosSunsetHa = -Math.tan(latRad) * Math.tan(decRad);
  const clampedCosHa = Math.min(1, Math.max(-1, cosSunsetHa));
  const halfDayHours = (Math.acos(clampedCosHa) * rad2deg) / 15;
  const solarNoonClockHour = 12 - timeCorrectionMinutes / 60;
  const sunriseHour = round6(Math.max(0, solarNoonClockHour - halfDayHours));
  const sunsetHour = round6(Math.min(24, solarNoonClockHour + halfDayHours));

  const effectiveAltRad = Math.max(2 * deg2rad, altRad);
  const azRad = adjustedAzimuthDeg * deg2rad;
  const horiz = Math.cos(effectiveAltRad);
  // Y-up 오른손 좌표계: +X 동쪽, +Y 위쪽, -Z 북쪽
  const sunDirectionYUp: StudioBg3dVec3 = Object.freeze([
    round6(Math.sin(azRad) * horiz),
    round6(Math.sin(effectiveAltRad)),
    round6(-Math.cos(azRad) * horiz),
  ]);

  const isDaytime = solarAltitudeDeg > 0;
  const colorTemperatureK = !isDaytime
    ? 7500
    : solarAltitudeDeg < 15
      ? Math.round(2400 + (solarAltitudeDeg / 15) * 2000)
      : Math.round(4400 + Math.min(1, (solarAltitudeDeg - 15) / 50) * 1600);

  return Object.freeze({
    dayOfYear,
    declinationDeg: round6(declinationDeg),
    solarAltitudeDeg,
    solarAzimuthDeg: adjustedAzimuthDeg,
    sunriseHour,
    sunsetHour,
    isDaytime,
    sunDirectionYUp,
    colorTemperatureK,
  });
}

/**
 * SketchUp `ShadowInfo` 설정(Light/Dark 슬라이더 포함)을 ToonStudio `StudioBg3dLightingSettings`로 변환한다.
 */
export function applySketchUpShadowSettingsToLighting(
  config: SketchUpShadowInfoConfig,
): {
  readonly solar: SketchUpSolarPositionResult;
  readonly lighting: StudioBg3dLightingSettings;
} {
  const solar = computeSketchUpSolarPosition(config);
  const lightNorm = Math.min(100, Math.max(0, config.lightSlider)) / 100;
  const darkNorm = Math.min(100, Math.max(0, config.darkSlider)) / 100;

  const keyIntensity = round6(0.35 + lightNorm * 1.45);
  const ambientIntensity = round6(0.15 + darkNorm * 0.75);

  const lighting: StudioBg3dLightingSettings = Object.freeze({
    ambientColor: solar.isDaytime ? "#dde8f5" : "#6c7ea8",
    ambientIntensity,
    key: Object.freeze({
      color: studioBg3dKelvinToHexColor(solar.colorTemperatureK),
      direction: solar.sunDirectionYUp,
      intensity: keyIntensity,
      castsShadow: config.shadowsEnabled,
    }),
    fill: Object.freeze({
      color: solar.isDaytime ? "#c7d8f0" : "#44517d",
      direction: Object.freeze([
        round6(-solar.sunDirectionYUp[0]),
        0.45,
        round6(-solar.sunDirectionYUp[2]),
      ] as const),
      intensity: round6(ambientIntensity * 0.45),
      castsShadow: false,
    }),
  });

  return Object.freeze({ solar, lighting });
}

export type SketchUpExportFormat =
  | "skp"
  | "dxf"
  | "ifc"
  | "obj"
  | "stl"
  | "ply"
  | "instanced-glb";

export interface SketchUpExportableBoxSpec {
  readonly name: string;
  readonly layer?: string;
  readonly colorHex?: string;
  /** Y-up 미터 기준 중심 위치 `[x, y, z]`. */
  readonly positionMeters: StudioBg3dVec3;
  /** Y-up 미터 기준 가로(X), 높이(Y), 깊이(Z) 크기 `[width, height, depth]`. */
  readonly sizeMeters: StudioBg3dVec3;
}

export interface SketchUpExportSceneSpec {
  readonly modelName: string;
  readonly unit?: "mm" | "cm" | "m" | "in" | "ft";
  readonly boxes: readonly SketchUpExportableBoxSpec[];
  readonly tags?: readonly { readonly name: string; readonly colorHex: string; readonly hidden?: boolean }[];
  readonly sectionPlane?: {
    readonly name: string;
    readonly symbol: string;
    readonly planeMetersYUp: readonly [number, number, number, number];
  };
  readonly dimensions?: readonly {
    readonly startMeters: StudioBg3dVec3;
    readonly endMeters: StudioBg3dVec3;
    readonly offsetMeters: StudioBg3dVec3;
    readonly text?: string;
  }[];
  readonly leaderTexts?: readonly {
    readonly pointMeters: StudioBg3dVec3;
    readonly leaderOffsetMeters: StudioBg3dVec3;
    readonly text: string;
  }[];
}

export interface SketchUpExportArtifact {
  readonly format: SketchUpExportFormat;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly byteSize: number;
  readonly companionMtlBytes?: Uint8Array;
}

const METER_TO_INCH = 1 / 0.0254;

/**
 * ToonStudio Y-up 미터 좌표를 SketchUp `.skp` 빌더용 Z-up 인치 좌표로 역변환한다.
 * `(x_m, y_m, z_m) -> (x_m / 0.0254, -z_m / 0.0254, y_m / 0.0254)`
 */
export function metersYUpToSkpInchesZUp(
  pointMetersYUp: StudioBg3dVec3,
): [number, number, number] {
  return [
    round6(pointMetersYUp[0] * METER_TO_INCH),
    round6(-pointMetersYUp[2] * METER_TO_INCH),
    round6(pointMetersYUp[1] * METER_TO_INCH),
  ];
}

function parseHexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/u, "").trim();
  if (/^[0-9a-fA-F]{6}$/u.test(cleaned)) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return [210, 214, 220];
}

/**
 * OpenSKP `create()` (`SkpBuilder`)를 사용해 `SketchUpExportSceneSpec`으로부터
 * 실제 SketchUp 2017+ 호환 `.skp` VFF 바이너리 바이트(`Uint8Array`)를 생성한다.
 */
export async function buildSketchUpModelBytesFromSceneSpec(
  spec: SketchUpExportSceneSpec,
  openSkpMod?: typeof import("openskp"),
): Promise<Uint8Array> {
  const skp = openSkpMod ?? (await import("openskp"));
  const builder = skp.create();

  // OpenSKP SkpBuilder 규약: 모든 addMaterial 호출이 addLayer 호출보다 먼저 수행되어야 함
  const matIdByBoxIndex: number[] = [];
  for (const box of spec.boxes) {
    const rgb = parseHexToRgb(box.colorHex ?? "#d4d8e0");
    const matId = builder.addMaterial(`${box.name}_mat`, rgb);
    matIdByBoxIndex.push(matId);
  }

  const layerIdByName = new Map<string, number>();
  for (const tag of spec.tags ?? []) {
    const rgb = parseHexToRgb(tag.colorHex);
    const id = builder.addLayer(tag.name, { color: rgb, hidden: tag.hidden });
    layerIdByName.set(tag.name, id);
  }

  for (let i = 0; i < spec.boxes.length; i += 1) {
    const box = spec.boxes[i]!;
    const matId = matIdByBoxIndex[i]!;
    const layerId = box.layer ? layerIdByName.get(box.layer) : undefined;

    const hx = Math.max(0.01, box.sizeMeters[0] * 0.5);
    const hy = Math.max(0.01, box.sizeMeters[1] * 0.5);
    const hz = Math.max(0.01, box.sizeMeters[2] * 0.5);
    const [cx, cy, cz] = box.positionMeters;

    const p000 = metersYUpToSkpInchesZUp([cx - hx, cy - hy, cz - hz]);
    const p100 = metersYUpToSkpInchesZUp([cx + hx, cy - hy, cz - hz]);
    const p101 = metersYUpToSkpInchesZUp([cx + hx, cy - hy, cz + hz]);
    const p001 = metersYUpToSkpInchesZUp([cx - hx, cy - hy, cz + hz]);

    const p010 = metersYUpToSkpInchesZUp([cx - hx, cy + hy, cz - hz]);
    const p110 = metersYUpToSkpInchesZUp([cx + hx, cy + hy, cz - hz]);
    const p111 = metersYUpToSkpInchesZUp([cx + hx, cy + hy, cz + hz]);
    const p011 = metersYUpToSkpInchesZUp([cx - hx, cy + hy, cz + hz]);

    const faceOpts = {
      material: matId,
      ...(layerId !== undefined ? { layer: layerId } : {}),
    };

    // 6 faces of the box
    builder.addFace([p000, p001, p101, p100], faceOpts);
    builder.addFace([p010, p110, p111, p011], faceOpts);
    builder.addFace([p001, p011, p111, p101], faceOpts);
    builder.addFace([p100, p101, p111, p110], faceOpts);
    builder.addFace([p000, p100, p110, p010], faceOpts);
    builder.addFace([p000, p010, p011, p001], faceOpts);
  }

  if (spec.sectionPlane) {
    const [nx, ny, nz, dMeters] = spec.sectionPlane.planeMetersYUp;
    // plane: n · p + d = 0 => point on plane: -d * n
    const pointMeters: StudioBg3dVec3 = [
      -nx * dMeters,
      -ny * dMeters,
      -nz * dMeters,
    ];
    const pointInches = metersYUpToSkpInchesZUp(pointMeters);
    const normalSkp: [number, number, number] = [nx, -nz, ny];
    builder.addSectionPlane(pointInches, normalSkp);
  }

  for (const dim of spec.dimensions ?? []) {
    const offVec = dim.offsetMeters;
    const offsetMagMeters = Math.hypot(offVec[0], offVec[1], offVec[2]);
    builder.addDimension(
      metersYUpToSkpInchesZUp(dim.startMeters),
      metersYUpToSkpInchesZUp(dim.endMeters),
      offsetMagMeters * METER_TO_INCH,
    );
  }

  for (const txt of spec.leaderTexts ?? []) {
    builder.addText(
      txt.text,
      metersYUpToSkpInchesZUp(txt.pointMeters),
      metersYUpToSkpInchesZUp(txt.leaderOffsetMeters),
    );
  }

  return builder.toBytes();
}

/**
 * `SketchUpExportSceneSpec`을 지정된 CAD/3D 포맷(`.skp`, `.dxf`, `.ifc`, `.obj`, `.stl`, `.ply`, `instanced-glb`)으로 내보낸다.
 */
export async function exportSketchUpSceneToMultiCadFormat(
  spec: SketchUpExportSceneSpec,
  format: SketchUpExportFormat,
  openSkpMod?: typeof import("openskp"),
): Promise<SketchUpExportArtifact> {
  const skp = openSkpMod ?? (await import("openskp"));
  const skpBytes = await buildSketchUpModelBytesFromSceneSpec(spec, skp);
  const safeBase = spec.modelName.trim().replace(/[^a-zA-Z0-9가-힣_-]+/gu, "_") || "toonstudio_scene";
  const encoder = new TextEncoder();

  if (format === "skp") {
    return Object.freeze({
      format,
      fileName: `${safeBase}.skp`,
      mimeType: "application/vnd.sketchup.skp",
      bytes: skpBytes,
      byteSize: skpBytes.byteLength,
    });
  }

  const exactBuf = skpBytes.buffer.slice(
    skpBytes.byteOffset,
    skpBytes.byteOffset + skpBytes.byteLength,
  ) as ArrayBuffer;

  if (format === "instanced-glb") {
    const instancedScene = skp.buildInstancedScene(exactBuf);
    const glbBytes = skp.toInstancedGLB(instancedScene);
    return Object.freeze({
      format,
      fileName: `${safeBase}.glb`,
      mimeType: "model/gltf-binary",
      bytes: glbBytes,
      byteSize: glbBytes.byteLength,
    });
  }

  const scene = skp.buildScene(exactBuf);

  switch (format) {
    case "dxf": {
      const dxfText = skp.toDXF(scene);
      const bytes = encoder.encode(dxfText);
      return Object.freeze({
        format,
        fileName: `${safeBase}.dxf`,
        mimeType: "application/dxf",
        bytes,
        byteSize: bytes.byteLength,
      });
    }
    case "ifc": {
      const ifcText = skp.toIFC(scene);
      const bytes = encoder.encode(ifcText);
      return Object.freeze({
        format,
        fileName: `${safeBase}.ifc`,
        mimeType: "application/x-step",
        bytes,
        byteSize: bytes.byteLength,
      });
    }
    case "obj": {
      const mtlFile = `${safeBase}.mtl`;
      const objText = skp.toOBJ(scene, mtlFile);
      const mtlText = skp.toMTL(scene);
      const bytes = encoder.encode(objText);
      const companionMtlBytes = encoder.encode(mtlText);
      return Object.freeze({
        format,
        fileName: `${safeBase}.obj`,
        mimeType: "model/obj",
        bytes,
        byteSize: bytes.byteLength,
        companionMtlBytes,
      });
    }
    case "stl": {
      const bytes = skp.toSTLBinary(scene);
      return Object.freeze({
        format,
        fileName: `${safeBase}.stl`,
        mimeType: "model/stl",
        bytes,
        byteSize: bytes.byteLength,
      });
    }
    case "ply": {
      const bytes = skp.toPLYBinary(scene);
      return Object.freeze({
        format,
        fileName: `${safeBase}.ply`,
        mimeType: "application/octet-stream",
        bytes,
        byteSize: bytes.byteLength,
      });
    }
  }
}
