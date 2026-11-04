/** UI·장면·번역 런타임에 의존하지 않는 6패스 레이어 레시피. */
export type WebtoonSixPassLtRoleId =
  | "main-line"
  | "texture-line"
  | "shadow"
  | "tone"
  | "color"
  | "depth";

export interface WebtoonSixPassLtLayerEntry {
  readonly role: WebtoonSixPassLtRoleId;
  readonly nameKo: string;
  readonly blendMode: "normal" | "multiply" | "screen" | "soft-light";
  readonly opacity: number;
  readonly visibleByDefault: boolean;
}

/**
 * 7. 1-Click 웹툰 6패스 LT(Line + Tone + Shadow + Color + Depth) 레이어 스택 레시피 빌더
 *    (`color`와 `tone`이 상호 배타적으로 차단되지 않고 한 그룹 안에 동시 생성됨)
 */
export function buildSketchUpWebtoonSixPassLtRecipe(options?: {
  readonly includeColorBase?: boolean;
  readonly includeHalftone?: boolean;
  readonly includeShadowPass?: boolean;
  readonly includeDepthFogPass?: boolean;
  readonly shadowOpacity?: number;
  readonly depthFogOpacity?: number;
}): readonly WebtoonSixPassLtLayerEntry[] {
  const includeColor = options?.includeColorBase ?? true;
  const includeTone = options?.includeHalftone ?? true;
  const includeShadow = options?.includeShadowPass ?? true;
  const includeDepth = options?.includeDepthFogPass ?? true;

  const layers: WebtoonSixPassLtLayerEntry[] = [];
  if (includeColor) {
    layers.push({
      role: "color",
      nameKo: "3D LT · 밑색 (Flat Color)",
      blendMode: "normal",
      opacity: 1,
      visibleByDefault: true,
    });
  }
  if (includeTone) {
    layers.push({
      role: "tone",
      nameKo: "3D LT · 스크린톤 (Halftone)",
      blendMode: "multiply",
      opacity: 0.85,
      visibleByDefault: true,
    });
  }
  if (includeShadow) {
    layers.push({
      role: "shadow",
      nameKo: "3D LT · 태양 그림자 (Shadow Multiply)",
      blendMode: "multiply",
      opacity: Math.max(0.1, Math.min(1, options?.shadowOpacity ?? 0.68)),
      visibleByDefault: true,
    });
  }
  if (includeDepth) {
    layers.push({
      role: "depth",
      nameKo: "3D LT · 공기원근 안개 (Depth Fog)",
      blendMode: "screen",
      opacity: Math.max(0.05, Math.min(1, options?.depthFogOpacity ?? 0.32)),
      visibleByDefault: true,
    });
  }
  layers.push(
    {
      role: "texture-line",
      nameKo: "3D LT · 질감선 (Texture Line)",
      blendMode: "normal",
      opacity: 0.78,
      visibleByDefault: true,
    },
    {
      role: "main-line",
      nameKo: "3D LT · 윤곽 주선 (Main Line)",
      blendMode: "normal",
      opacity: 1,
      visibleByDefault: true,
    },
  );

  return layers;
}
