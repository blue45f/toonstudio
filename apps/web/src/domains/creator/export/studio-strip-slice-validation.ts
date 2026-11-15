export interface StripSliceLike {
  readonly index: number;
  readonly y: number;
  readonly height: number;
}

/**
 * 사용자 지정 분할 슬라이스 배열이 출력 전체 높이(`totalHeight`) 및 연속 순서(`0..N-1`)를
 * 만족하는지 검증하고 정규화된 사본을 반환한다.
 *
 * Konva 호환 백엔드(`Math.floor(width * pixelRatio)`)와 논리 미리보기(`Math.round`) 사이에
 * 소수 배율(예: 800/720 = 1.111) 리샘플 반올림 차이(수 px 이내)가 발생할 수 있으므로,
 * 허용 반올림 오차(`max(8, slices.length * 4)`px) 안에서는 내부 분할선 `y`를 그대로 유지한 채
 * 마지막 슬라이스 끝을 실제 캡처 높이 `totalHeight`에 정확히 맞춘다.
 */
export function validateCustomStripSlices(
  totalHeight: number,
  customSlices: readonly StripSliceLike[],
): { index: number; y: number; height: number }[] {
  if (!Array.isArray(customSlices) || customSlices.length === 0) {
    throw new Error("분할 경계 목록이 비어 있어 내보내기를 중단했어요.");
  }
  let expectedY = 0;
  for (let index = 0; index < customSlices.length; index += 1) {
    const slice = customSlices[index]!;
    if (
      !Number.isInteger(slice.y) ||
      !Number.isInteger(slice.height) ||
      slice.height < 1 ||
      slice.y !== expectedY
    ) {
      throw new Error("분할 경계 순서가 올바르지 않아 내보내기를 중단했어요.");
    }
    expectedY += slice.height;
  }

  const drift = totalHeight - expectedY;
  const maxRoundingDrift = Math.max(8, customSlices.length * 4);
  const lastSlice = customSlices[customSlices.length - 1]!;
  const reconciledLastHeight = lastSlice.height + drift;

  if (Math.abs(drift) > maxRoundingDrift || reconciledLastHeight < 1) {
    throw new Error(
      `분할 경계 높이 합계(${expectedY}px)가 전체 출력 높이(${totalHeight}px)와 달라 내보내기를 중단했어요.`,
    );
  }

  return customSlices.map((slice, index) => ({
    index,
    y: slice.y,
    height: index === customSlices.length - 1 ? reconciledLastHeight : slice.height,
  }));
}
