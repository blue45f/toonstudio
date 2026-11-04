export interface StudioLifecycleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioLifecyclePixelCrop {
  readonly leftRatio: number;
  readonly topRatio: number;
  readonly rightRatio: number;
  readonly bottomRatio: number;
}

export interface StudioLifecyclePixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface StudioLifecyclePublicationObservation {
  readonly authorityStatus: string | null;
  readonly documentRenderer: string | null;
  readonly konvaDocumentShadow: string | null;
  readonly skiaSurface: {
    readonly visibility: string | null;
    readonly phase: string | null;
    readonly cachedItems: number;
  } | null;
}

/** 잉크가 있는 문서에만 적용한다. 빈 baseline/Undo의 disabled 상태는 호출자가 따로 다룬다. */
export function isStudioLifecycleDocumentPublicationReady(
  observation: StudioLifecyclePublicationObservation,
): boolean {
  if (observation.authorityStatus === "unavailable") {
    return observation.documentRenderer === "compatibility"
      && observation.konvaDocumentShadow === "mounted";
  }
  const surface = observation.skiaSurface;
  return observation.authorityStatus === "active"
    && observation.documentRenderer === "skia-canvaskit-document-webgl2"
    && surface !== null
    && surface.visibility === "visible"
    && surface.phase === "presented"
    && Number.isSafeInteger(surface.cachedItems)
    && surface.cachedItems > 0;
}

export interface StudioLifecyclePhysicalCapturePlan {
  /** 현재 viewport 좌표계의 CSS rect. Stage 소유 영역 안의 완전한 device pixel만 포함한다. */
  readonly clip: StudioLifecycleRect;
  /** clip PNG 안의 정수 device-pixel ROI. right/bottom은 제외 경계다. */
  readonly artworkBounds: StudioLifecyclePixelBounds;
  /**
   * 원래 ROI를 선택하는 viewport CSS rect. CSS 정수화 API는 이 rect 대신 더 큰 PNG에서
   * artworkBounds를 무손실 추출해야 하며, fractional 크기를 내림하거나 resize하면 안 된다.
   */
  readonly artworkClip: StudioLifecycleRect;
  /** CSS 크기를 정수화하는 screenshot API용 enclosing rect. 최종 비교 ROI는 확대하지 않는다. */
  readonly screenshotClip: StudioLifecycleRect;
  /** screenshotClip PNG에서 무손실 추출할 정수 device-pixel ROI. */
  readonly screenshotArtworkBounds: StudioLifecyclePixelBounds;
  /** 기존 floor/ceil 기반 PNG 비교 함수와 같은 픽셀을 선택하는 호환 비율이다. */
  readonly artworkCrop: StudioLifecyclePixelCrop;
}

function invalidCapture(reason: string): never {
  throw new Error(`Studio 생명주기 캡처 좌표 오류: ${reason}. 원고와 viewport 배치를 확인하세요.`);
}

function positiveSize(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function positivePixelCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * 전체 Stage screenshot의 enclosing CSS rect와 기존 ratio floor/ceil 선택을 먼저 보존한다.
 * 그 device-pixel ROI를 화면 안으로 옮겨 표현하며, 가려진 부분을 줄여 통과시키지 않는다.
 */
export function planStudioLifecyclePhysicalCapture(input: {
  readonly stage: StudioLifecycleRect;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly artworkCrop: StudioLifecyclePixelCrop;
  readonly deviceScaleFactor?: number;
}): StudioLifecyclePhysicalCapturePlan {
  const { stage, viewport, artworkCrop } = input;
  const dpr = input.deviceScaleFactor ?? 1;
  if (!Number.isFinite(stage.x) || !Number.isFinite(stage.y)
    || !positiveSize(stage.width) || !positiveSize(stage.height)) {
    invalidCapture("Stage 위치와 크기가 유효하지 않습니다");
  }
  if (!positiveSize(viewport.width) || !positiveSize(viewport.height)
    || viewport.width <= 1 || viewport.height <= 1) {
    invalidCapture("viewport가 비어 있거나 임시 1×1 크기입니다");
  }
  if (!positiveSize(dpr)) invalidCapture("deviceScaleFactor가 유효하지 않습니다");
  const { leftRatio, topRatio, rightRatio, bottomRatio } = artworkCrop;
  if (![leftRatio, topRatio, rightRatio, bottomRatio].every(Number.isFinite)
    || leftRatio < 0 || topRatio < 0 || rightRatio > 1 || bottomRatio > 1
    || leftRatio >= rightRatio || topRatio >= bottomRatio) {
    invalidCapture("artwork 비율의 순서 또는 범위가 유효하지 않습니다");
  }

  const stageRight = stage.x + stage.width;
  const stageBottom = stage.y + stage.height;
  if (!Number.isFinite(stageRight) || !Number.isFinite(stageBottom)) {
    invalidCapture("Stage 경계가 유한하지 않습니다");
  }
  // 기존 Playwright element screenshot의 enclosingIntRect와 같은 정수 근처 오차 보정이다.
  const enclosingEpsilon = 1e-3;
  const sourceX = Math.floor(stage.x + enclosingEpsilon);
  const sourceY = Math.floor(stage.y + enclosingEpsilon);
  const sourceWidth = Math.round((Math.ceil(stageRight - enclosingEpsilon) - sourceX) * dpr);
  const sourceHeight = Math.round((Math.ceil(stageBottom - enclosingEpsilon) - sourceY) * dpr);
  if (!positivePixelCount(sourceWidth) || !positivePixelCount(sourceHeight)) {
    invalidCapture("전체 Stage의 PNG 크기가 유효하지 않습니다");
  }

  // 전체 Stage PNG와 같은 device-pixel 격자를 사용해 가시 영역 안쪽으로만 자른다.
  const visibleLeft = Math.ceil((Math.max(0, stage.x) - sourceX) * dpr);
  const visibleTop = Math.ceil((Math.max(0, stage.y) - sourceY) * dpr);
  const visibleRight = Math.floor((Math.min(viewport.width, stageRight) - sourceX) * dpr);
  const visibleBottom = Math.floor((Math.min(viewport.height, stageBottom) - sourceY) * dpr);
  const clipWidth = visibleRight - visibleLeft;
  const clipHeight = visibleBottom - visibleTop;
  if (!positivePixelCount(clipWidth) || !positivePixelCount(clipHeight)
    || clipWidth / dpr < 1 || clipHeight / dpr < 1) {
    invalidCapture("Stage의 가시 영역이 없거나 한 CSS 픽셀보다 작습니다");
  }

  const sourceBounds = {
    left: Math.floor(sourceWidth * leftRatio),
    top: Math.floor(sourceHeight * topRatio),
    right: Math.ceil(sourceWidth * rightRatio),
    bottom: Math.ceil(sourceHeight * bottomRatio),
  };
  if (sourceBounds.left < visibleLeft || sourceBounds.top < visibleTop
    || sourceBounds.right > visibleRight || sourceBounds.bottom > visibleBottom) {
    invalidCapture("원래 artwork ROI 일부가 viewport 또는 Stage 소유 영역 밖에 있습니다");
  }
  const artworkBounds = {
    left: sourceBounds.left - visibleLeft,
    top: sourceBounds.top - visibleTop,
    right: sourceBounds.right - visibleLeft,
    bottom: sourceBounds.bottom - visibleTop,
  };
  if (!positivePixelCount(artworkBounds.right - artworkBounds.left)
    || !positivePixelCount(artworkBounds.bottom - artworkBounds.top)) {
    invalidCapture("artwork ROI에 비교할 픽셀이 없습니다");
  }
  const artworkClip = {
    x: sourceX + sourceBounds.left / dpr,
    y: sourceY + sourceBounds.top / dpr,
    width: (sourceBounds.right - sourceBounds.left) / dpr,
    height: (sourceBounds.bottom - sourceBounds.top) / dpr,
  };
  const screenshotX = Math.floor(artworkClip.x);
  const screenshotY = Math.floor(artworkClip.y);
  const screenshotRight = Math.ceil(artworkClip.x + artworkClip.width);
  const screenshotBottom = Math.ceil(artworkClip.y + artworkClip.height);
  if (screenshotX < 0 || screenshotY < 0
    || screenshotRight > viewport.width || screenshotBottom > viewport.height) {
    invalidCapture("정수 screenshot 영역이 viewport 밖에 있습니다");
  }
  const screenshotOffsetX = (screenshotX - sourceX) * dpr;
  const screenshotOffsetY = (screenshotY - sourceY) * dpr;
  const integerOffsetX = Math.round(screenshotOffsetX);
  const integerOffsetY = Math.round(screenshotOffsetY);
  // 두 screenshot 원점의 device-pixel 격자가 다르면 정수 crop만으로 원래 픽셀을 보존할 수 없다.
  if (Math.abs(screenshotOffsetX - integerOffsetX) > 1e-7
    || Math.abs(screenshotOffsetY - integerOffsetY) > 1e-7) {
    invalidCapture("정수 screenshot과 원래 artwork의 device-pixel 격자가 일치하지 않습니다");
  }
  const screenshotArtworkBounds = {
    left: sourceBounds.left - integerOffsetX,
    top: sourceBounds.top - integerOffsetY,
    right: sourceBounds.right - integerOffsetX,
    bottom: sourceBounds.bottom - integerOffsetY,
  };
  return {
    clip: {
      x: sourceX + visibleLeft / dpr,
      y: sourceY + visibleTop / dpr,
      width: clipWidth / dpr,
      height: clipHeight / dpr,
    },
    artworkBounds,
    artworkClip,
    screenshotClip: {
      x: screenshotX,
      y: screenshotY,
      width: screenshotRight - screenshotX,
      height: screenshotBottom - screenshotY,
    },
    screenshotArtworkBounds,
    // 정수 경계 안쪽 값으로 ratio를 표현해 부동소수점 왕복이 ROI를 한 픽셀 넓히지 않게 한다.
    artworkCrop: {
      leftRatio: (artworkBounds.left + 0.25) / clipWidth,
      topRatio: (artworkBounds.top + 0.25) / clipHeight,
      rightRatio: (artworkBounds.right - 0.25) / clipWidth,
      bottomRatio: (artworkBounds.bottom - 0.25) / clipHeight,
    },
  };
}
