/** GLSL·TSL 재질이 공통으로 허용하는 기본 명암·외곽선 수치다. */
export function hasStudioMToonRuntimeFactors(material: {
  readonly shadingShiftFactor: number;
  readonly shadingToonyFactor: number;
  readonly outlineWidthFactor: number;
  readonly outlineWidthMode: string;
}): boolean {
  return Number.isFinite(material.shadingShiftFactor) && material.shadingShiftFactor >= -1 && material.shadingShiftFactor <= 1
    && Number.isFinite(material.shadingToonyFactor) && material.shadingToonyFactor >= 0 && material.shadingToonyFactor <= 1
    && Number.isFinite(material.outlineWidthFactor) && material.outlineWidthFactor >= 0 && Number.isFinite(Math.fround(material.outlineWidthFactor))
    && ["none", "worldCoordinates", "screenCoordinates"].includes(material.outlineWidthMode);
}
