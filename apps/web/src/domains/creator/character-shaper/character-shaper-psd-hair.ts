/** 분리된 헤어 픽셀의 실제 색을 보존한다. 실루엣 알파는 상위 캐릭터 마스크에서 한 번 적용한다. */
export function separateCharacterPsdHair(input: {
  readonly flat: Uint8ClampedArray;
  readonly ownedHair: Uint8ClampedArray;
  readonly shadow?: Uint8ClampedArray;
  readonly highlight?: Uint8ClampedArray;
  readonly line?: Uint8ClampedArray;
}) {
  const ownership = new Uint8Array(input.flat.length / 4);
  const base = new Uint8ClampedArray(input.flat.length);
  const shadow = input.shadow ? new Uint8ClampedArray(input.flat.length) : undefined;
  const line = input.line ? new Uint8ClampedArray(input.flat.length) : undefined;
  let pixels = 0;
  for (let i = 0; i < input.flat.length; i += 4) {
    if ((input.ownedHair[i + 3] ?? 0) === 0) continue;
    ownership[i / 4] = 1;
    pixels += 1;
    const shadowAlpha = (input.shadow?.[i + 3] ?? 0) / 255;
    const highlightAlpha = (input.highlight?.[i + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c += 1) {
      const flat = input.flat[i + c] ?? 0;
      const highlight = (input.highlight?.[i + c] ?? 0) / 255 * highlightAlpha;
      const dark = flat * (1 - shadowAlpha + (input.shadow?.[i + c] ?? 255) / 255 * shadowAlpha);
      const appearance = dark + (255 - dark) * highlight;
      const highlightedBase = Math.round(flat + (255 - flat) * highlight);
      base[i + c] = highlightedBase;
      // Screen을 Base로 옮겨도 원래 Multiply→Screen 재합성이 유지되는 실제 채널 비율이다.
      if (shadow) shadow[i + c] = highlightedBase > 0 ? Math.min(255, Math.round(appearance / highlightedBase * 255)) : 255;
      if (line) line[i + c] = input.line?.[i + c] ?? 0;
    }
    base[i + 3] = 255;
    if (shadow) shadow[i + 3] = shadowAlpha > 0 ? 255 : 0;
    if (line) line[i + 3] = input.line?.[i + 3] ?? 0;
  }
  return { ownership, base, shadow, line, pixels };
}

/** 헤어를 숨겼을 때 본체의 색·음영·하이라이트가 같은 픽셀에 남지 않게 한다. */
export function withoutCharacterPsdHair(rgba: Uint8ClampedArray, ownership: Uint8Array): Uint8ClampedArray {
  const result = new Uint8ClampedArray(rgba);
  clearCharacterPsdHairPixels(result, ownership);
  return result;
}

/** 조립기가 새로 소유한 coverage 배열은 추가 전체 이미지 복사 없이 비운다. */
export function clearCharacterPsdHairPixels(rgba: Uint8ClampedArray, ownership: Uint8Array): void {
  for (let pixel = 0; pixel < ownership.length; pixel += 1) {
    if (ownership[pixel]) rgba.fill(0, pixel * 4, pixel * 4 + 4);
  }
}
