/** 일반 지우개는 원래 입력을 그대로 쓰고, 나머지는 촉에 맞게 접촉 압력을 조절한다. */
export function studioEraserPressureProfiles<V extends string>(version: V) {
  function round<Id extends string>(id: Id, diameterScale: number, minimum: number, maximum: number, exponent: number) {
    return { version, id, family: "causal-ink" as const, diameterScale, pressure: { minimum, maximum, exponent } };
  }

  return {
    "kneaded-eraser": round("kneaded-eraser", 1.16, 0.24, 0.92, 0.86),
    "precision-eraser": round("precision-eraser", 1, 0.12, 1, 1.35),
    "broad-eraser": round("broad-eraser", 1, 0.72, 1, 0.7),
    "lift-eraser": round("lift-eraser", 1, 0.32, 0.96, 1.12),
  };
}

export type StudioEraserPressureId = keyof ReturnType<typeof studioEraserPressureProfiles>;

/** 모든 원형 지우개가 동일한 연속 획 마스크 경로를 사용한다. */
export const STUDIO_ERASER_RENDER_ROUTES = {
  "standard-eraser": "continuous-analytic",
  "kneaded-eraser": "continuous-analytic",
  "precision-eraser": "continuous-analytic",
  "broad-eraser": "continuous-analytic",
  "lift-eraser": "continuous-analytic",
} as const satisfies Record<"standard-eraser" | StudioEraserPressureId, "continuous-analytic">;
