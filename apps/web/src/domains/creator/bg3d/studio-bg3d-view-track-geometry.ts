/**
 * 캔버스 하나 안에서 추적 요소(트랙)의 칸만 그리는 View 의 좌표 계산.
 *
 * 두 사각형 모두 `getBoundingClientRect()` 가 주는 viewport(클라이언트) 좌표다. Drei 의 View 는 화면 밖
 * 판정을 `track.top > canvas.height` 처럼 viewport 좌표와 캔버스 크기를 섞어 비교한다. 캔버스가 창 왼쪽
 * 위에 붙어 있을 때만 맞는 식이라, 3D 정밀 편집처럼 뷰포트 위에 다른 패널이 있는 배치(트랙 top 589 >
 * 캔버스 높이 380)에서는 멀쩡히 보이는 View 를 "화면 밖"으로 보고 그리기를 멈춘다. 여기서는 두 사각형을
 * 같은 좌표계로 비교한다.
 */
export interface StudioBg3dViewRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioBg3dViewPlacement {
  /** three.js `setViewport`/`setScissor` 인자: 캔버스 CSS px, 원점은 캔버스 왼쪽 아래. */
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  /** 트랙이 캔버스와 겹치지 않거나 면적이 없어 그릴 수 없다. */
  readonly isOffscreen: boolean;
}

export function placeStudioBg3dViewTrack(
  canvas: StudioBg3dViewRect,
  track: StudioBg3dViewRect,
): StudioBg3dViewPlacement {
  const disjoint = track.bottom < canvas.top || track.top > canvas.bottom
    || track.right < canvas.left || track.left > canvas.right;
  // 면적 없는 트랙(닫힌 대화상자 등)은 aspect 가 NaN 이 되므로 그리지 않는다.
  const empty = !(track.width > 0) || !(track.height > 0);
  return {
    left: track.left - canvas.left,
    bottom: canvas.bottom - track.bottom,
    width: track.width,
    height: track.height,
    isOffscreen: disjoint || empty,
  };
}
