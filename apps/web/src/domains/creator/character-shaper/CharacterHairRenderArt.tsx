/**
 * 헤어 카드의 실제 렌더 썸네일(A-07). 렌더가 준비되면 선화 도해 대신 이미지를 그리고, WebGL 이
 * 없거나 렌더 전에는 도해(children)를 그대로 둔다. 데이터·훅은 `character-hair-thumbnail-source.ts`.
 */
import { useCharacterHairThumbnail, type CharacterHairPreviewSpec } from "./character-hair-thumbnail-source";

import type { ReactNode } from "react";

/** SVG 안에서 선화 도해를 실제 헤어 렌더로 바꿔 그린다(80×100 프레임 전체). */
export function CharacterHairRenderArt({
  spec,
  selected,
  children,
}: {
  readonly spec: CharacterHairPreviewSpec;
  readonly selected: boolean;
  readonly children: ReactNode;
}) {
  const url = useCharacterHairThumbnail(spec, selected);
  if (!url) return <>{children}</>;
  return (
    <image
      data-character-hair-render="true"
      href={url}
      x={0}
      y={0}
      width={80}
      height={100}
      preserveAspectRatio="xMidYMid slice"
    />
  );
}
