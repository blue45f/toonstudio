/**
 * LT 휘도 경계의 "한 픽셀 중심선(능선)" 추출.
 *
 * Sobel 크기 장은 계단형 경계에서 경계 양쪽 두 픽셀이 같은 값을 가진다(중심 차분의 발자국이 2픽셀이다).
 * 이 반응을 그대로 선으로 쓰면 선 폭 설정과 무관하게 선이 항상 두 픽셀 이상이 되어 "픽셀 기준 선폭"을 약속할 수
 * 없다. 그래서 Canny 의 비최대 억제(non-maximum suppression)와 같은 규칙으로 기울기 방향 이웃보다 작지 않은
 * 픽셀만 남겨 중심선을 만든다. 폭은 `studio-bg3d-lt-line-stroke.ts` 가 그 위에 다시 칠한다.
 *
 * 규칙(결정적이다):
 * - 기울기 방향을 4방향(가로·세로·두 대각)으로 양자화하고, 그 축의 이웃 `prev`(왼쪽/위/왼위/왼아래)와
 *   `next`(오른쪽/아래/오른아래/오른위)를 비교한다.
 * - `크기 ≥ prev` 이고 `크기 > next` 이면 능선이다. 동점(계단형 경계의 두 픽셀)은 `next` 쪽 픽셀이 이긴다.
 * - 알파 0 인 투명 픽셀은 크기가 0 이다. 투명 픽셀이 동점을 가져가 물체 가장자리 선이 사라지는 일이 없도록
 *   억제 전에 0 으로 만든다.
 * - `floor` 이하 크기는 능선이 아니다(어차피 임계값 아래라 선이 되지 않는다).
 *
 * 가려진 선 제거(`relocateStudioBg3dLtOccludedRidges`)는 비최대 억제가 끝난 뒤에 능선을 옮긴다. 억제 전에
 * 가려진 픽셀을 0 으로 만들면 그 옆 픽셀이 새 최대가 되어 두 칸 떨어진 가짜 선이 생기기 때문이다.
 *
 * 수용 영역: 입력 픽셀 하나가 결과에 미치는 거리는 Sobel 1 + 비최대 억제 1 = 2픽셀(가려진 선 제거 +1)이다.
 */

export interface StudioBg3dLtRidgeFieldInput {
  readonly width: number;
  readonly height: number;
  /** 이미 흐림 처리가 끝난 단일 채널 장(휘도). 길이는 width × height. */
  readonly field: Float32Array;
  /** 알파가 0 인 픽셀의 크기를 0 으로 만들 RGBA 바이트. */
  readonly rgba: Uint8Array | Uint8ClampedArray;
  /** 이 값 이하의 크기는 능선 후보에서 제외한다. */
  readonly floor: number;
}

export interface StudioBg3dLtRidgeField {
  /** `clamp01(hypot(Gx, Gy) / 4)` (투명 픽셀은 0). */
  readonly magnitude: Float32Array;
  /** 능선이면 1, 아니면 0. */
  readonly ridge: Uint8Array;
}

const TAN_22_5_DEGREES = Math.tan(Math.PI / 8);

/** 가려진 선을 옮길 이웃을 고르는 동점 우선순위. 축 방향 이웃이 대각 이웃보다 먼저다. */
const NEIGHBOR_PRIORITY: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function extractStudioBg3dLtRidgeField(input: StudioBg3dLtRidgeFieldInput): StudioBg3dLtRidgeField {
  const { width, height, field, rgba, floor } = input;
  const pixelCount = width * height;
  if (field.length !== pixelCount || rgba.length !== pixelCount * 4) {
    throw new RangeError("LT ridge input length must equal width * height.");
  }
  const magnitude = new Float32Array(pixelCount);
  // 0 가로 기울기(왼쪽·오른쪽 비교), 1 세로, 2 대각(\\), 3 대각(/)
  const sector = new Uint8Array(pixelCount);
  const last = { x: width - 1, y: height - 1 };
  const sample = (x: number, y: number): number =>
    field[Math.min(last.y, Math.max(0, y)) * width + Math.min(last.x, Math.max(0, x))]!;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const interiorRow = y > 0 && y < last.y;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      if (rgba[index * 4 + 3] === 0) continue;
      let topLeft: number;
      let top: number;
      let topRight: number;
      let left: number;
      let right: number;
      let bottomLeft: number;
      let bottom: number;
      let bottomRight: number;
      if (interiorRow && x > 0 && x < last.x) {
        topLeft = field[index - width - 1]!;
        top = field[index - width]!;
        topRight = field[index - width + 1]!;
        left = field[index - 1]!;
        right = field[index + 1]!;
        bottomLeft = field[index + width - 1]!;
        bottom = field[index + width]!;
        bottomRight = field[index + width + 1]!;
      } else {
        topLeft = sample(x - 1, y - 1);
        top = sample(x, y - 1);
        topRight = sample(x + 1, y - 1);
        left = sample(x - 1, y);
        right = sample(x + 1, y);
        bottomLeft = sample(x - 1, y + 1);
        bottom = sample(x, y + 1);
        bottomRight = sample(x + 1, y + 1);
      }
      const horizontal = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      magnitude[index] = clamp01(Math.hypot(horizontal, vertical) / 4);
      const absoluteX = Math.abs(horizontal);
      const absoluteY = Math.abs(vertical);
      sector[index] =
        absoluteY <= absoluteX * TAN_22_5_DEGREES
          ? 0
          : absoluteX <= absoluteY * TAN_22_5_DEGREES
            ? 1
            : horizontal * vertical > 0
              ? 2
              : 3;
    }
  }

  const ridge = new Uint8Array(pixelCount);
  const at = (x: number, y: number): number =>
    magnitude[Math.min(last.y, Math.max(0, y)) * width + Math.min(last.x, Math.max(0, x))]!;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const value = magnitude[index]!;
      if (value <= floor) continue;
      let previous: number;
      let next: number;
      switch (sector[index]) {
        case 0:
          previous = at(x - 1, y);
          next = at(x + 1, y);
          break;
        case 1:
          previous = at(x, y - 1);
          next = at(x, y + 1);
          break;
        case 2:
          previous = at(x - 1, y - 1);
          next = at(x + 1, y + 1);
          break;
        default:
          previous = at(x - 1, y + 1);
          next = at(x + 1, y - 1);
          break;
      }
      if (value >= previous && value > next) ridge[index] = 1;
    }
  }
  return { magnitude, ridge };
}

export interface StudioBg3dLtOcclusionInput {
  readonly width: number;
  readonly height: number;
  /** 정규화 깊이(작을수록 가깝다). 길이는 width × height. */
  readonly depth: Float32Array;
  /** 깊이 에지 추출기의 `occluded` 채널(앞 물체에 가려지는 면, 0..255). */
  readonly occluded: Uint8ClampedArray;
  /** `occluded` 바이트 값 → 가려지지 않은 정도(0..1) 표. 길이 256. */
  readonly visibilityByByte: Float32Array;
}

/**
 * 가려진 선 제거: 앞 물체 경계의 먼 쪽(가려지는 면)에 앉은 능선을 가장 가까운 이웃 픽셀로 옮긴다.
 *
 * 한 경계의 휘도 반응은 양쪽 두 픽셀에 나타나는데, 비최대 억제는 어느 쪽이든 하나를 고른다. 먼 쪽이 뽑히면
 * 깊이 윤곽(앞 물체 쪽 픽셀)과 한 칸 떨어진 두 줄이 된다. 그래서 가려진 비율만큼의 크기를 이웃 8칸 중 깊이가
 * 가장 작은(가장 가까운) 픽셀로 옮겨 합치고, 가려진 픽셀에는 가려지지 않은 비율만 남긴다(0 이 되면 능선
 * 표시도 지운다). 옮겨 받은 픽셀은 능선이 되며 크기는 옮겨 온 값(이미 능선이었다면 둘 중 큰 값)이다.
 * `field` 를 제자리에서 바꾼다.
 */
export function relocateStudioBg3dLtOccludedRidges(
  field: StudioBg3dLtRidgeField,
  occlusion: StudioBg3dLtOcclusionInput
): void {
  const { width, height, depth, occluded, visibilityByByte } = occlusion;
  const pixelCount = width * height;
  if (
    field.magnitude.length !== pixelCount ||
    depth.length !== pixelCount ||
    occluded.length !== pixelCount ||
    visibilityByByte.length !== 256
  ) {
    throw new RangeError("LT occlusion input length must equal width * height.");
  }
  const { magnitude, ridge } = field;
  let moved: Float32Array | null = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const hidden = occluded[index]!;
      if (hidden === 0 || !ridge[index]) continue;
      const visibility = visibilityByByte[hidden]!;
      if (visibility >= 1) continue;
      // 가장 가까운(깊이가 가장 작은) 이웃. 동점은 NEIGHBOR_PRIORITY 순서(왼·오·위·아래·대각)의 첫 픽셀이라
      // 세로·가로 경계의 선이 대각으로 밀리지 않는다.
      let nearest = -1;
      let nearestDepth = depth[index]!;
      for (const [dx, dy] of NEIGHBOR_PRIORITY) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const candidate = depth[ny * width + nx]!;
        if (candidate < nearestDepth) {
          nearestDepth = candidate;
          nearest = ny * width + nx;
        }
      }
      if (nearest < 0) continue;
      moved ??= new Float32Array(pixelCount);
      const share = magnitude[index]! * (1 - visibility);
      if (share > moved[nearest]!) moved[nearest] = share;
      magnitude[index] = magnitude[index]! * visibility;
      if (magnitude[index] === 0) ridge[index] = 0;
    }
  }
  if (!moved) return;
  for (let index = 0; index < pixelCount; index += 1) {
    const share = moved[index]!;
    if (share === 0) continue;
    // 옮겨 받은 자리가 능선이 아니었다면 그 픽셀의 원래 Sobel 크기는 비최대 억제로 탈락한 값이라 쓰지 않는다.
    magnitude[index] = ridge[index] ? Math.max(magnitude[index]!, share) : share;
    ridge[index] = 1;
  }
}
