/**
 * studio-psd-adjustment-commit.ts
 *
 * PSD 가져오기가 복원한 조정 레이어 명세(PsdImportedAdjustmentLayer)를 실제
 * 문서 요소(AdjustmentEl)로 바꿔 래스터 요소 사이에 원래 스택 순서대로
 * 끼워 넣는 순수 다리.
 *
 * 배경: 가져오기 결과의 adjustmentLayers는 문서 적용 단계(교환 커밋)가
 * 소비하지 않으면 적용 버튼을 누르는 순간 사라진다. 이 모듈이 그 소비
 * 지점의 변환·병합 규칙을 고정한다:
 *  - 지오메트리는 조정 레이어 규약대로 페이지 전체(0,0,페이지 크기).
 *  - 이름·파라미터·불투명도·블렌드·숨김·클립·폴더 경로는 명세 그대로 옮긴다.
 *  - 순서는 flatten 기준 stackIndex로 래스터와 병합한다. 래스터에
 *    stackIndex가 없는(구형 결과) 경우 조정은 래스터 뒤에 원래 상대
 *    순서대로 붙는다 — 순서를 지어내지 않는다.
 */
import type { El } from "./studio-element-model";
import type { PsdImportedAdjustmentLayer, PsdImportedElement } from "./studio-psd-import";

export interface PsdAdjustmentCommitSize {
  /** 페이지에 배치되는 PSD 폭(스케일 반영). */
  readonly width: number;
  /** 페이지에 배치되는 PSD 높이(스케일 반영). */
  readonly height: number;
}

/** 복원 명세 1건 → 문서 조정 레이어 요소. 메타데이터 규약은 AdjustmentEl & StudioElementLayerMetadata. */
export function psdAdjustmentElFromImported(
  layer: PsdImportedAdjustmentLayer,
  size: PsdAdjustmentCommitSize,
): El {
  const folderId = layer.psdFolderPath?.at(-1)?.id;
  return {
    id: layer.id,
    type: "adjustment",
    x: 0,
    y: 0,
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    rotation: 0,
    adjustment: layer.kind,
    parameters: layer.parameters,
    clipToBelow: layer.clipBelow ?? false,
    name: layer.name,
    ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
    ...(layer.blendMode ? { blendMode: layer.blendMode } : {}),
    ...(layer.hidden ? { hidden: true as const } : {}),
    ...(layer.clipBelow ? { clipBelow: true as const } : {}),
    ...(layer.maskSrc ? { maskSrc: layer.maskSrc } : {}),
    ...(layer.maskEnabled === false ? { maskEnabled: false as const } : {}),
    ...(layer.psdFolderPath ? { psdFolderPath: layer.psdFolderPath } : {}),
    ...(folderId ? { groupId: folderId, psdGroupId: folderId } : {}),
  } as El;
}

/**
 * 래스터 요소 묶음(요소 + 그 요소에 붙은 편집 텍스트 복사본)과 조정 레이어를
 * stackIndex 기준으로 병합한 최종 요소 배열(뒤→앞)을 만든다.
 *
 * @param rasterGroups 래스터 요소 1개당 한 묶음. 묶음의 stackIndex는 대표
 *   래스터 요소의 flatten 위치다.
 * @param adjustments 복원 명세(입력 순서 = Studio z-order).
 */
export function mergePsdElementsWithAdjustments(
  rasterGroups: readonly {
    readonly stackIndex?: number;
    readonly elements: readonly El[];
  }[],
  adjustments: readonly PsdImportedAdjustmentLayer[],
  size: PsdAdjustmentCommitSize,
): El[] {
  if (adjustments.length === 0) return rasterGroups.flatMap((group) => [...group.elements]);
  const sortedAdjustments = [...adjustments].sort((a, b) => a.stackIndex - b.stackIndex);
  const merged: El[] = [];
  let cursor = 0;
  const flushAdjustmentsBefore = (stackIndex: number | undefined): void => {
    // 래스터 위치를 모르면(undefined) 조정을 뒤로 미룬다 — 순서를 지어내지 않는다.
    if (stackIndex === undefined) return;
    while (cursor < sortedAdjustments.length) {
      const next = sortedAdjustments[cursor]!;
      if (next.stackIndex >= stackIndex) break;
      merged.push(psdAdjustmentElFromImported(next, size));
      cursor += 1;
    }
  };
  for (const group of rasterGroups) {
    flushAdjustmentsBefore(group.stackIndex);
    merged.push(...group.elements);
  }
  while (cursor < sortedAdjustments.length) {
    merged.push(psdAdjustmentElFromImported(sortedAdjustments[cursor]!, size));
    cursor += 1;
  }
  return merged;
}

/** PsdImportedElement 목록에서 stackIndex를 읽는 보조 — 구형 결과는 undefined. */
export function psdElementStackIndex(element: PsdImportedElement): number | undefined {
  return element.stackIndex;
}
