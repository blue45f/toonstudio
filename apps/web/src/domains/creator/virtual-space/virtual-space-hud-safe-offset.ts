/**
 * 가상 스튜디오 좁은 화면(태블릿 세로·모바일) 미니맵 ↔ 이동 조이스틱 비충돌 세이프존 계산기.
 *
 * - 모바일(< 640px)과 태블릿 세로(640px–1023px)에서 터치 이동 조이스틱·하단 모바일 도크·
 *   OS 하단 안전 영역(safe-area-inset-bottom)과 미니맵/공간 지도 메뉴가 겹치지 않도록
 *   하단 오프셋과 수평 반대편 앵커를 순수 계산한다.
 * - 순수 계산 모듈(₩0 로컬, 브라우저 스토리지 미사용).
 */

/** 태블릿 세로/모바일을 좁은 화면으로 분류하는 상한 너비(px). */
export const VIRTUAL_SPACE_NARROW_BREAKPOINT_PX = 1024;

/** 모바일 세로 화면으로 분류하는 상한 너비(px). */
export const VIRTUAL_SPACE_MOBILE_BREAKPOINT_PX = 640;

/** 미니맵과 이동 조이스틱 사이 최소 이격 간격(px). */
export const VIRTUAL_SPACE_DEFAULT_MIN_GAP_PX = 16;

/** 기본 데스크톱 폴백 뷰포트 너비(px, SSR·테스트 환경용). */
export const VIRTUAL_SPACE_FALLBACK_VIEWPORT_WIDTH_PX = 1280;

/** 기본 데스크톱 폴백 뷰포트 높이(px, SSR·테스트 환경용). */
export const VIRTUAL_SPACE_FALLBACK_VIEWPORT_HEIGHT_PX = 844;

export type VirtualSpaceViewportClass = "mobile" | "tablet-portrait" | "desktop";

export type VirtualSpaceHudHandedness = "right" | "left";

export interface VirtualSpaceHudSafeOffsetInput {
  /** 현재 뷰포트 너비(px). */
  readonly viewportWidth: number;
  /** 현재 뷰포트 높이(px). 기본 844. */
  readonly viewportHeight?: number;
  /** 터치 이동 조이스틱 활성 여부. 미지정 시 좁은 화면은 true, 데스크톱은 false. */
  readonly joystickVisible?: boolean;
  /** 터치 이동 조이스틱 지름(px). 미지정 시 모바일 96, 태블릿/데스크톱 112. */
  readonly joystickSizePx?: number;
  /** 조이스틱 배치 손잡이 방향. 기본 "right". */
  readonly joystickHandedness?: VirtualSpaceHudHandedness;
  /** 하단 모바일 도크 점유 높이(px). 미지정 시 좁은 화면 64, 데스크톱 0. */
  readonly bottomDockHeightPx?: number;
  /** OS 하단 안전 영역 인셋(px, env(safe-area-inset-bottom)). 기본 0. */
  readonly safeAreaBottomPx?: number;
  /** 조이스틱과 미니맵/메뉴 사이 최소 간격(px). 기본 16. */
  readonly minGapPx?: number;
  /** 미니맵 기본 높이(px, 비충돌 사각형 검증용). 기본 156. */
  readonly minimapHeightPx?: number;
  /** 미니맵 기본 너비(px, 비충돌 사각형 검증용). 기본 220. */
  readonly minimapWidthPx?: number;
  /** 화면 하단/측면 기본 여백(px). 기본 16. */
  readonly baseMarginPx?: number;
}

export interface VirtualSpaceHudRect {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export interface VirtualSpaceHudSafeOffsetResult {
  readonly viewportClass: VirtualSpaceViewportClass;
  /** 모바일·태블릿 세로 등 좁은 화면 여부 (`viewportWidth < 1024`). */
  readonly isNarrowViewport: boolean;
  /** 조이스틱 회피 세이프존이 실제로 적용되었는지 여부. */
  readonly joystickAvoidanceActive: boolean;
  /** 미니맵 하단 세이프존 오프셋(px). */
  readonly minimapBottomOffsetPx: number;
  /** 미니맵 측면 여백(px). */
  readonly minimapSideInsetPx: number;
  /** 조이스틱과 반대편으로 배정된 미니맵 수평 앵커. */
  readonly minimapHorizontalAnchor: VirtualSpaceHudHandedness;
  /** 공간 지도 메뉴 하단 안전 패딩(px). */
  readonly menuBottomPaddingPx: number;
  /** 조이스틱이 화면 하단에서 점유하는 최상단 높이(px). */
  readonly joystickFootprintBottomPx: number;
  /** 조이스틱과 미니맵 사각형이 겹치지 않는지 검증 결과. */
  readonly collisionFree: boolean;
  /** 조이스틱 상단과 미니맵 하단 사이 실제 확보 간격(px). */
  readonly clearancePx: number;
  /** 조이스틱 하단 기준 점유 영역(px, 검증·디버그용). */
  readonly joystickRect: VirtualSpaceHudRect | null;
  /** 미니맵 하단 기준 점유 영역(px, 검증·디버그용). */
  readonly minimapRect: VirtualSpaceHudRect;
  /** 컴포넌트 style에 바로 바인딩할 CSS 커스텀 프로퍼티 맵. */
  readonly cssVariables: Readonly<{
    readonly "--vspace-hud-safe-bottom": string;
    readonly "--vspace-minimap-bottom-offset": string;
    readonly "--vspace-menu-safe-padding-bottom": string;
  }>;
}

function sanitizeNonNegative(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function sanitizePositive(value: number | undefined, fallback: number, min: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

/**
 * 뷰포트 너비에 따라 화면 등급을 분류한다.
 * - `< 640`: 모바일
 * - `640–1023`: 태블릿 세로
 * - `>= 1024`: 데스크톱
 */
export function classifyVirtualSpaceViewport(viewportWidth: number): VirtualSpaceViewportClass {
  const width = sanitizePositive(viewportWidth, VIRTUAL_SPACE_FALLBACK_VIEWPORT_WIDTH_PX, 240);
  if (width < VIRTUAL_SPACE_MOBILE_BREAKPOINT_PX) return "mobile";
  if (width < VIRTUAL_SPACE_NARROW_BREAKPOINT_PX) return "tablet-portrait";
  return "desktop";
}

/**
 * 브라우저 환경에서 현재 뷰포트 크기를 안전하게 읽는다.
 * 명시적 값이 전달되면 그대로 우선 사용하고, SSR/미지원 환경에서는 안전한 기본값을 돌려준다.
 */
export function resolveVirtualSpaceViewportMetrics(overrides?: {
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
}): { readonly viewportWidth: number; readonly viewportHeight: number } {
  const fallbackWidth =
    typeof window !== "undefined" && Number.isFinite(window.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : VIRTUAL_SPACE_FALLBACK_VIEWPORT_WIDTH_PX;
  const fallbackHeight =
    typeof window !== "undefined" && Number.isFinite(window.innerHeight) && window.innerHeight > 0
      ? window.innerHeight
      : VIRTUAL_SPACE_FALLBACK_VIEWPORT_HEIGHT_PX;
  return Object.freeze({
    viewportWidth: sanitizePositive(overrides?.viewportWidth, fallbackWidth, 240),
    viewportHeight: sanitizePositive(overrides?.viewportHeight, fallbackHeight, 320),
  });
}

function rectsOverlap(a: VirtualSpaceHudRect, b: VirtualSpaceHudRect): boolean {
  const separatedX = a.right <= b.left || b.right <= a.left;
  const separatedY = a.top <= b.bottom || b.top <= a.bottom;
  return !separatedX && !separatedY;
}

/**
 * 좁은 화면(태블릿 세로·모바일)에서 미니맵·공간 지도 메뉴와 하단 이동 조이스틱이
 * 충돌하지 않도록 하단 세이프존 오프셋과 수평 반대편 앵커를 계산한다.
 */
export function computeVirtualSpaceHudSafeOffset(
  input: VirtualSpaceHudSafeOffsetInput,
): VirtualSpaceHudSafeOffsetResult {
  const viewportWidth = sanitizePositive(
    input.viewportWidth,
    VIRTUAL_SPACE_FALLBACK_VIEWPORT_WIDTH_PX,
    240,
  );
  const viewportHeight = sanitizePositive(
    input.viewportHeight,
    VIRTUAL_SPACE_FALLBACK_VIEWPORT_HEIGHT_PX,
    320,
  );
  const viewportClass = classifyVirtualSpaceViewport(viewportWidth);
  const isNarrowViewport = viewportClass !== "desktop";
  const joystickVisible = input.joystickVisible ?? isNarrowViewport;
  const joystickHandedness: VirtualSpaceHudHandedness =
    input.joystickHandedness === "left" ? "left" : "right";
  const baseMarginPx = sanitizePositive(input.baseMarginPx, 16, 8);
  const minGapPx = sanitizePositive(input.minGapPx, VIRTUAL_SPACE_DEFAULT_MIN_GAP_PX, 12);
  const safeAreaBottomPx = sanitizeNonNegative(input.safeAreaBottomPx, 0);
  const bottomDockHeightPx = sanitizeNonNegative(
    input.bottomDockHeightPx,
    isNarrowViewport ? 64 : 0,
  );
  const joystickSizePx = sanitizePositive(
    input.joystickSizePx,
    viewportClass === "mobile" ? 96 : 112,
    64,
  );
  const minimapWidthPx = sanitizePositive(
    input.minimapWidthPx,
    viewportClass === "mobile" ? 188 : 220,
    120,
  );
  const minimapHeightPx = sanitizePositive(
    input.minimapHeightPx,
    viewportClass === "mobile" ? 132 : 156,
    88,
  );

  const baseBottomPx = safeAreaBottomPx + bottomDockHeightPx + baseMarginPx;
  const joystickFootprintBottomPx = joystickVisible
    ? baseBottomPx + joystickSizePx
    : baseBottomPx;

  const joystickAvoidanceActive = joystickVisible;
  const minimapHorizontalAnchor: VirtualSpaceHudHandedness =
    joystickHandedness === "right" ? "left" : "right";

  // 조이스틱이 활성 상태면 미니맵·메뉴 하단 오프셋을 조이스틱 상단 + 최소 이격 간격 이상으로 올려
  // 화면 너비가 320px~1023px인 좁은 화면에서도 수직 비충돌을 수학적으로 보장한다.
  const minimapBottomOffsetPx = joystickAvoidanceActive
    ? joystickFootprintBottomPx + minGapPx
    : baseBottomPx;
  const menuBottomPaddingPx = joystickAvoidanceActive
    ? joystickFootprintBottomPx + minGapPx
    : baseBottomPx;

  const joystickRect: VirtualSpaceHudRect | null = joystickVisible
    ? Object.freeze({
        left:
          joystickHandedness === "left"
            ? baseMarginPx
            : Math.max(baseMarginPx, viewportWidth - baseMarginPx - joystickSizePx),
        right:
          joystickHandedness === "left"
            ? baseMarginPx + joystickSizePx
            : Math.max(baseMarginPx + joystickSizePx, viewportWidth - baseMarginPx),
        bottom: baseBottomPx,
        top: baseBottomPx + joystickSizePx,
      })
    : null;

  const minimapLeft =
    minimapHorizontalAnchor === "left"
      ? baseMarginPx
      : Math.max(baseMarginPx, viewportWidth - baseMarginPx - minimapWidthPx);
  const clampedMinimapTop = Math.min(
    Math.max(viewportHeight, minimapBottomOffsetPx + minimapHeightPx),
    minimapBottomOffsetPx + minimapHeightPx,
  );
  const minimapRect: VirtualSpaceHudRect = Object.freeze({
    left: minimapLeft,
    right: minimapLeft + minimapWidthPx,
    bottom: minimapBottomOffsetPx,
    top: clampedMinimapTop,
  });

  const verticalGapPx = joystickRect ? minimapRect.bottom - joystickRect.top : minGapPx;
  const horizontalGapPx = joystickRect
    ? Math.max(minimapRect.left - joystickRect.right, joystickRect.left - minimapRect.right)
    : minGapPx;
  const collisionFree = joystickRect ? !rectsOverlap(joystickRect, minimapRect) : true;
  const clearancePx = joystickRect
    ? Math.max(0, Math.max(verticalGapPx, horizontalGapPx))
    : minGapPx;

  return Object.freeze({
    viewportClass,
    isNarrowViewport,
    joystickAvoidanceActive,
    minimapBottomOffsetPx,
    minimapSideInsetPx: baseMarginPx,
    minimapHorizontalAnchor,
    menuBottomPaddingPx,
    joystickFootprintBottomPx,
    collisionFree,
    clearancePx,
    joystickRect,
    minimapRect,
    cssVariables: Object.freeze({
      "--vspace-hud-safe-bottom": `${minimapBottomOffsetPx}px`,
      "--vspace-minimap-bottom-offset": `${minimapBottomOffsetPx}px`,
      "--vspace-menu-safe-padding-bottom": `${menuBottomPaddingPx}px`,
    }),
  });
}
