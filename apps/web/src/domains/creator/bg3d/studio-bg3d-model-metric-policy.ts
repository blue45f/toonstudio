/** 없으면 기존 2m 자동 맞춤 배치를 유지한다. 명시된 새 SKP만 원본 미터 치수를 보존한다. */
export type StudioBg3dModelMetricPolicy = "authored-metres";
export type StudioBg3dMetricInstanceScale = [number, number, number];

export class StudioBg3dModelMetricPolicyError extends Error {
  constructor() {
    super("원본 미터 치수를 문서의 배율 범위 안에서 보존할 수 없어 모델을 배치하지 않았습니다.");
    this.name = "StudioBg3dModelMetricPolicyError";
  }
}

export function readStudioBg3dModelMetricPolicy(value: unknown): StudioBg3dModelMetricPolicy | undefined {
  return typeof value === "object" && value !== null && "metricPolicy" in value && value.metricPolicy === "authored-metres"
    ? "authored-metres" : undefined;
}

interface NormalizedModelCache {
  readonly normalizationScale?: number;
  readonly root: { readonly scale: { readonly x: number; readonly y: number; readonly z: number } };
}

/** 공유 캐시는 계속 2m로 맞춘다. 문서에 저장하는 역배율만으로 새 SKP의 원본 치수를 되돌린다. */
export function resolveStudioBg3dMetricInstanceScale(
  policy: StudioBg3dModelMetricPolicy | undefined,
  cached: NormalizedModelCache | null | undefined,
): StudioBg3dMetricInstanceScale {
  if (policy === undefined) return [1, 1, 1];
  if (!cached) throw new StudioBg3dModelMetricPolicyError();
  const { x, y, z } = cached.root.scale;
  const normalization = cached.normalizationScale ?? x;
  if (!Number.isFinite(normalization) || normalization <= 0
    || [x, y, z].some((value) => !Number.isFinite(value) || Math.abs(value - normalization) > 1e-12)) {
    throw new StudioBg3dModelMetricPolicyError();
  }
  const inverse = 1 / normalization;
  return copyStudioBg3dMetricInstanceScale([inverse, inverse, inverse]);
}

/** canonical parser의 0.001~1000 한도에 맞추려고 값을 잘라 실제 크기를 바꾸지 않는다. */
export function copyStudioBg3dMetricInstanceScale(value: readonly number[] | undefined): StudioBg3dMetricInstanceScale {
  if (value === undefined) return [1, 1, 1];
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component) || component < 0.001 || component > 1000)) {
    throw new StudioBg3dModelMetricPolicyError();
  }
  return [value[0], value[1], value[2]];
}
