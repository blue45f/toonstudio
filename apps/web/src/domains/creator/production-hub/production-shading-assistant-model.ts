/**
 * AI 음영 어시스턴트(`Shad-1` / `Shad-Preview` 클린룸 대응) 모델.
 *
 * - 11종 광원 위치(`ShadingLightDirection`): 8방위(`top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`) + `front`(정면) / `backlight`(역광) / `optimal`(최적)
 * - 음영 스타일(`ShadingEdgeStyle`): `hard`(하드 엣지 — 셀 채색) / `soft`(소프트 엣지 — 브러시 채색)
 * - 음영 양(`ShadingAmount`): `backlight`(역광 — 넓고 깊은 음영) / `normal`(보통) / `narrow`(좁음)
 * - 해상도 및 토큰 추정: 선택 영역 크기에 따라 `2K`(40 토큰) 또는 `4K`(55 토큰) 자동 추천
 * - 실시간 RGB/Hex 색상 및 곱하기(`Multiply`) 블렌딩 미리보기 계산
 * - 다운로드 옵션: 범위(`all` 전체 / `page` 페이지별 / `region` 영역별) × 패키징(`merged` 합쳐진 결과물 vs `separated` 분리된 결과물)
 */

export type ShadingLightDirection =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "front"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "backlight"
  | "optimal";

export type ShadingEdgeStyle = "hard" | "soft";
export type ShadingAmount = "backlight" | "normal" | "narrow";
export type ShadingResolutionTier = "2K" | "4K";
export type ShadingDownloadScope = "all" | "page" | "region";
export type ShadingDownloadPackaging = "merged" | "separated";

export const SHADING_LIGHT_DIRECTIONS: readonly {
  readonly id: ShadingLightDirection;
  readonly labelKo: string;
  readonly badge: string;
}[] = [
  { id: "top-left", labelKo: "좌상단", badge: "↖" },
  { id: "top", labelKo: "상단", badge: "↑" },
  { id: "top-right", labelKo: "우상단", badge: "↗" },
  { id: "left", labelKo: "좌측", badge: "←" },
  { id: "front", labelKo: "정면", badge: "◎" },
  { id: "right", labelKo: "우측", badge: "→" },
  { id: "bottom-left", labelKo: "좌하단", badge: "↙" },
  { id: "bottom", labelKo: "하단", badge: "↓" },
  { id: "bottom-right", labelKo: "우하단", badge: "↘" },
  { id: "backlight", labelKo: "역광", badge: "◐" },
  { id: "optimal", labelKo: "최적 자동", badge: "✦" },
];

export interface ShadingRegionCandidate {
  readonly id: string;
  readonly pageNumber: number;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly lightDirection: ShadingLightDirection;
  readonly edgeStyle: ShadingEdgeStyle;
  readonly shadowAmount: ShadingAmount;
  readonly resolution: ShadingResolutionTier;
  readonly shadowHex: string;
  readonly opacityPercent: number;
  readonly visible: boolean;
}

/**
 * 크롭 영역의 가로·세로 픽셀 크기에 따라 적합한 해상도(`2K`: 40토큰 / `4K`: 55토큰)를 자동 추천한다.
 */
export function recommendShadingResolution(
  widthPx: number,
  heightPx: number,
): { readonly resolution: ShadingResolutionTier; readonly estimatedTokens: number; readonly reasonKo: string } {
  const maxSide = Math.max(widthPx, heightPx);
  if (maxSide > 2048) {
    return {
      resolution: "4K",
      estimatedTokens: 55,
      reasonKo: `선택 영역 긴 변(${maxSide}px)이 2048px을 초과해 선명도 유지를 위해 4K(55토큰)를 권장합니다.`,
    };
  }
  return {
    resolution: "2K",
    estimatedTokens: 40,
    reasonKo: `선택 영역 긴 변(${maxSide}px)이 2048px 이하이므로 2K(40토큰)로 빠르게 생성할 수 있습니다.`,
  };
}

export function shadingTokenCost(resolution: ShadingResolutionTier): number {
  return resolution === "4K" ? 55 : 40;
}

export function parseShadingHexColor(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const cleaned = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{6}$/u.test(cleaned)) {
    return {
      r: Number.parseInt(cleaned.slice(0, 2), 16),
      g: Number.parseInt(cleaned.slice(2, 4), 16),
      b: Number.parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return { r: 92, g: 84, b: 112 };
}

/**
 * 기본 채색 픽셀(`baseRgb`) 위에 그레이스케일 음영 강도(`maskStrength`, 0~1)와
 * 사용자가 고른 음영 색상(`shadowHex`)·불투명도(`opacityPercent`, 0~100)를
 * 곱하기(`Multiply`) 블렌딩으로 합성한 결과 RGB/Hex를 계산한다.
 */
export function computeMultiplyShadedColor(input: {
  readonly baseRgb: { readonly r: number; readonly g: number; readonly b: number };
  readonly shadowHex: string;
  readonly maskStrength: number;
  readonly opacityPercent: number;
}): { readonly r: number; readonly g: number; readonly b: number; readonly hex: string } {
  const shadow = parseShadingHexColor(input.shadowHex);
  const alpha = Math.min(1, Math.max(0, input.maskStrength)) * (Math.min(100, Math.max(0, input.opacityPercent)) / 100);

  const multiplyChannel = (base: number, tint: number): number => {
    const multiplied = (base * tint) / 255;
    return Math.round(base * (1 - alpha) + multiplied * alpha);
  };

  const r = multiplyChannel(input.baseRgb.r, shadow.r);
  const g = multiplyChannel(input.baseRgb.g, shadow.g);
  const b = multiplyChannel(input.baseRgb.b, shadow.b);
  const toHex = (val: number) => Math.min(255, Math.max(0, val)).toString(16).padStart(2, "0");

  return {
    r,
    g,
    b,
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
  };
}

/**
 * 음영 전용 투명 PNG 다운로드 시 `merged`(`합쳐진 결과물`)와 `separated`(`분리된 결과물`)에 따라
 * 생성될 출력 파일 매니페스트 목록을 구성한다.
 */
export function buildShadingDownloadManifest(input: {
  readonly regions: readonly ShadingRegionCandidate[];
  readonly scope: ShadingDownloadScope;
  readonly packaging: ShadingDownloadPackaging;
  readonly targetPageNumber?: number;
  readonly targetRegionId?: string;
}): readonly { readonly fileName: string; readonly pageNumber: number; readonly regionCount: number }[] {
  const active = input.regions.filter((region) => {
    if (!region.visible) return false;
    if (input.scope === "page" && input.targetPageNumber !== undefined) {
      return region.pageNumber === input.targetPageNumber;
    }
    if (input.scope === "region" && input.targetRegionId !== undefined) {
      return region.id === input.targetRegionId;
    }
    return true;
  });

  if (active.length === 0) return [];

  if (input.packaging === "merged") {
    const byPage = new Map<number, ShadingRegionCandidate[]>();
    for (const region of active) {
      const list = byPage.get(region.pageNumber) ?? [];
      list.push(region);
      byPage.set(region.pageNumber, list);
    }
    return [...byPage.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, list]) => ({
        fileName: `page-${String(pageNumber).padStart(3, "0")}-shading-merged.png`,
        pageNumber,
        regionCount: list.length,
      }));
  }

  return active.map((region, index) => ({
    fileName: `page-${String(region.pageNumber).padStart(3, "0")}-region-${index + 1}-${region.id}.png`,
    pageNumber: region.pageNumber,
    regionCount: 1,
  }));
}
