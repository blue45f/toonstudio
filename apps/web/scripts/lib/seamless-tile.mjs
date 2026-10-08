/**
 * 이음선이 보이지 않는 주기 타일 만들기.
 *
 * 생성 이미지의 한 칸은 좌우·상하 가장자리가 서로 이어지지 않아 그대로 이어 붙이면 칸마다 돌이 잘려 보인다.
 * 이를 숨기려고 칸을 좌우로 뒤집어 섞으면 접합부마다 거울 대칭 무늬(나비 모양)가 생긴다.
 * 여기서는 가장자리 겹침 구간에서 두 이미지의 차이가 가장 작은 경로(min-cut)를 따라 이어 붙여,
 * 뒤집지 않고도 가로·세로로 끊김 없이 이어지는 타일을 만든다(이미지 퀼팅의 이음 단계).
 *
 * 타일 폭이 W일 때 겹침 폭을 B라 하면, 타일 끝(x ≥ W−B) 너머로 이어지는 B열이 타일 처음 B열과 겹친다고 본다.
 * 겹침 구간을 위에서 아래로 가르는 최소 오차 경로의 왼쪽은 "끝에서 이어지는 쪽", 오른쪽은 "원래 타일"에서 가져오면
 * 결과(폭 W−B)는 끝과 처음이 원본의 이웃 열로 이어진다.
 */

/**
 * @typedef {object} RawImage
 * @property {Uint8Array} data 행 우선 픽셀(채널 인터리브)
 * @property {number} width
 * @property {number} height
 * @property {number} channels
 */

/**
 * 위에서 아래로 가며 열이 한 칸 넘게 바뀌지 않는 최소 누적 오차 경로.
 * @param {Float64Array} error rows×cols 오차(Infinity는 지나갈 수 없는 칸)
 * @param {number} rows
 * @param {number} cols
 * @returns {Int32Array} 행마다 선택한 열
 */
export function minimumCutPath(error, rows, cols) {
  const cost = Float64Array.from(error);
  const back = new Int8Array(rows * cols);
  for (let y = 1; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let best = cost[(y - 1) * cols + x];
      let step = 0;
      if (x > 0 && cost[(y - 1) * cols + x - 1] < best) { best = cost[(y - 1) * cols + x - 1]; step = -1; }
      if (x < cols - 1 && cost[(y - 1) * cols + x + 1] < best) { best = cost[(y - 1) * cols + x + 1]; step = 1; }
      cost[y * cols + x] += best;
      back[y * cols + x] = step;
    }
  }
  const path = new Int32Array(rows);
  let column = 0;
  for (let x = 1; x < cols; x += 1) if (cost[(rows - 1) * cols + x] < cost[(rows - 1) * cols + column]) column = x;
  path[rows - 1] = column;
  for (let y = rows - 1; y > 0; y -= 1) {
    column += back[y * cols + column];
    path[y - 1] = column;
  }
  return path;
}

/**
 * 가로 방향으로 주기화한다. 결과 폭은 width − overlap.
 * @param {RawImage} image
 * @param {number} overlap 타일 끝과 처음이 겹치는 열 수
 * @returns {RawImage}
 */
export function periodizeHorizontally(image, overlap) {
  const { data, width, height, channels } = image;
  if (!Number.isInteger(overlap) || overlap < 2 || overlap * 2 > width) {
    throw new RangeError(`겹침 폭은 2 이상이고 타일 폭의 절반 이하여야 합니다: ${overlap} (폭 ${width})`);
  }
  const outWidth = width - overlap;
  const error = new Float64Array(height * overlap);
  for (let y = 0; y < height; y += 1) {
    // 0열은 끝에서 이어지는 쪽이 한 열 이상 남아야 끝·처음이 원본 이웃으로 이어지므로 경로가 지날 수 없다.
    error[y * overlap] = Number.POSITIVE_INFINITY;
    for (let x = 1; x < overlap; x += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) {
        const difference = data[(y * width + x) * channels + c] - data[(y * width + outWidth + x) * channels + c];
        sum += difference * difference;
      }
      error[y * overlap + x] = sum;
    }
  }
  const path = minimumCutPath(error, height, overlap);
  const out = new Uint8Array(outWidth * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const from = x < path[y] ? outWidth + x : x;
      const source = (y * width + from) * channels;
      const target = (y * outWidth + x) * channels;
      for (let c = 0; c < channels; c += 1) out[target + c] = data[source + c];
    }
  }
  return { data: out, width: outWidth, height, channels };
}

/**
 * 가로·세로를 바꾼다.
 * @param {RawImage} image
 * @returns {RawImage}
 */
export function transposeImage(image) {
  const { data, width, height, channels } = image;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * channels;
      const target = (x * height + y) * channels;
      for (let c = 0; c < channels; c += 1) out[target + c] = data[source + c];
    }
  }
  return { data: out, width: height, height: width, channels };
}

/**
 * 가로·세로 모두 이어지는 주기 타일. 결과 크기는 (width − overlap) × (height − overlap).
 * @param {RawImage} image
 * @param {number} overlap
 * @returns {RawImage}
 */
export function periodizeTile(image, overlap) {
  return transposeImage(periodizeHorizontally(transposeImage(periodizeHorizontally(image, overlap)), overlap));
}

/**
 * 타일을 둘러싼 이음의 눈에 띄는 정도: (끝↔처음 열 차이) / (이웃 열 차이 평균). 1에 가까우면 이음이 안 보인다.
 * @param {RawImage} image
 * @returns {{ horizontal: number, vertical: number }}
 */
export function seamRatio(image) {
  const { data, width, height, channels } = image;
  const at = (x, y, c) => data[(y * width + x) * channels + c];
  let inner = 0, wrap = 0, innerCount = 0, wrapCount = 0;
  let innerV = 0, wrapV = 0, innerCountV = 0, wrapCountV = 0;
  for (let y = 0; y < height; y += 1) {
    for (let c = 0; c < channels; c += 1) {
      wrap += Math.abs(at(0, y, c) - at(width - 1, y, c)); wrapCount += 1;
      for (let x = 1; x < width; x += 1) { inner += Math.abs(at(x, y, c) - at(x - 1, y, c)); innerCount += 1; }
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < channels; c += 1) {
      wrapV += Math.abs(at(x, 0, c) - at(x, height - 1, c)); wrapCountV += 1;
      for (let y = 1; y < height; y += 1) { innerV += Math.abs(at(x, y, c) - at(x, y - 1, c)); innerCountV += 1; }
    }
  }
  return {
    horizontal: (wrap / wrapCount) / (inner / innerCount || 1),
    vertical: (wrapV / wrapCountV) / (innerV / innerCountV || 1),
  };
}
