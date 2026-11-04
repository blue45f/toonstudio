import type { StudioBg3dSixPassLtSettings } from "../bg3d/studio-bg3d-scene-document-types";

/** 실제 여섯 패스 출력을 선택한 장면에만 저장한다. 기존 v3에는 기본값을 주입하지 않는다. */
export const DEFAULT_STUDIO_BG3D_SIX_PASS_LT: StudioBg3dSixPassLtSettings = Object.freeze({
  version: 1,
  shadowOpacity: 0.68,
  depthFogOpacity: 0.32,
  fogNearMeters: 4,
  fogFarMeters: 25,
  fogTintHex: "#fed7aa",
});

export const DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS = DEFAULT_STUDIO_BG3D_SIX_PASS_LT;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 선택한 설정이 손상되면 조용히 3패스로 바꾸지 않고 저장·실행을 거부한다. */
export function parseStudioBg3dSixPassLtSettings(value: unknown): StudioBg3dSixPassLtSettings | null {
  if (!record(value) || value.version !== 1
    || Object.keys(value).sort().join(",") !== "depthFogOpacity,fogFarMeters,fogNearMeters,fogTintHex,shadowOpacity,version") return null;
  const { shadowOpacity, depthFogOpacity, fogNearMeters, fogFarMeters, fogTintHex } = value;
  if (typeof shadowOpacity !== "number" || !Number.isFinite(shadowOpacity) || shadowOpacity < 0 || shadowOpacity > 1
    || typeof depthFogOpacity !== "number" || !Number.isFinite(depthFogOpacity) || depthFogOpacity < 0 || depthFogOpacity > 1
    || typeof fogNearMeters !== "number" || !Number.isFinite(fogNearMeters) || fogNearMeters < 0 || fogNearMeters > 100_000
    || typeof fogFarMeters !== "number" || !Number.isFinite(fogFarMeters) || fogFarMeters <= fogNearMeters || fogFarMeters > 100_000
    || typeof fogTintHex !== "string" || !/^#[0-9a-f]{6}$/u.test(fogTintHex)) return null;
  return Object.freeze({ version: 1, shadowOpacity, depthFogOpacity, fogNearMeters, fogFarMeters, fogTintHex });
}

export function studioBg3dDocumentRequiresSixPassReader(value: unknown): boolean {
  return record(value) && ((record(value.output) && value.output.sixPassLt !== undefined)
    || (Array.isArray(value.shots) && value.shots.some((shot) => record(shot)
      && record(shot.output) && shot.output.sixPassLt !== undefined)));
}
