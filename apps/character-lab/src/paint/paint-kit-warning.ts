/**
 * 키트 소스의 페인트 경고(순수, 계약 문서 8.4절).
 *
 * 페인트 레이어와 데칼 텍스처는 **역할 단위** 하나이고 같은 역할의 모든 메시에 같은 UV로 붙는다(`PaintLayer.part`).
 * 키트에서 `skin`(TS_Body)·`head`(TS_Head)는 변형이 없어 UV가 고정이지만, 헤어·상의·하의·신발·액세서리는
 * 프리셋(변형)마다 GLB가 달라 UV가 다르다. 변형을 바꾸면 이미 칠한 그림이 어긋난다.
 * v1은 막지 않고 한글 경고만 보인다. 정식 해결(레이어를 변형 id로 키잉)은 레시피 v3 후보다.
 *
 * 이 모듈은 문구와 판정만 가진다. 화면 배치는 PaintPanel이 한다.
 */
import { PAINTABLE_PART_ROLES, PART_ROLE_LABELS_KO } from "../contracts";

import { isPaintLayerEmpty } from "./paint-layer";

import type { CharacterSource, PaintLayer, PartRole } from "../contracts";

/** 키트에서도 UV가 변형과 무관하게 고정인 역할(베이스 메시). 여기에 없는 페인트 가능 역할은 경고 대상이다. */
export const KIT_UV_STABLE_PAINT_ROLES: readonly PartRole[] = ["skin", "head"];

/** 키트에서 변형(프리셋)을 바꾸면 UV가 달라지는 페인트 가능 역할 — 새 페인트 가능 역할은 안전이 확인되기 전까지 경고 대상이다. */
export const KIT_VARIANT_UV_PAINT_ROLES: readonly PartRole[] = PAINTABLE_PART_ROLES.filter((role) => !KIT_UV_STABLE_PAINT_ROLES.includes(role));

export interface KitPaintWarning {
  readonly part: PartRole;
  readonly messageKo: string;
}

/**
 * 활성 소스 종류와 페인트 대상 부위로 경고 문구를 돌려준다. 키트가 아니거나 UV가 고정인 부위면 null.
 * 문구는 변형을 바꿔야 문제가 생긴다는 점을 먼저 말한다(칠하는 것 자체는 막지 않는다).
 */
export function kitPaintWarningKo(sourceKind: CharacterSource["kind"], part: PartRole): string | null {
  if (sourceKind !== "kit") return null;
  if (!KIT_VARIANT_UV_PAINT_ROLES.includes(part)) return null;
  return `${PART_ROLE_LABELS_KO[part]} 변형을 바꾸면 UV가 달라져 그림이 어긋납니다. 변형을 확정한 뒤에 칠하세요.`;
}

/**
 * 이미 칠한 픽셀이 있는 레이어 중 키트에서 어긋날 수 있는 것의 경고 목록(레시피 불러오기·PSD 내보내기 전 안내용).
 * 비어 있는 레이어는 잃을 그림이 없으므로 제외한다. 순서는 입력 레이어 순서를 따른다.
 */
export function kitPaintWarningsForLayers(sourceKind: CharacterSource["kind"], layers: readonly PaintLayer[]): readonly KitPaintWarning[] {
  const warnings: KitPaintWarning[] = [];
  for (const layer of layers) {
    if (isPaintLayerEmpty(layer)) continue;
    const messageKo = kitPaintWarningKo(sourceKind, layer.part);
    if (messageKo) warnings.push({ part: layer.part, messageKo });
  }
  return warnings;
}
