import { THREE_D_ASSET_CARDS } from "./engineering-atlas-three-d-assets";
import { THREE_D_CHARACTER_CARDS } from "./engineering-atlas-three-d-character";
import { THREE_D_DCC_CARDS } from "./engineering-atlas-three-d-dcc";
import { THREE_D_GEOMETRY_CARDS } from "./engineering-atlas-three-d-geometry";
import { THREE_D_RENDER_CARDS } from "./engineering-atlas-three-d-render";
import { THREE_D_XR_CARDS } from "./engineering-atlas-three-d-xr";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · three-d 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(engineering-atlas-three-d-*.ts)에 두고 여기서 한 배열로 합친다.
 */
export const ENGINEERING_ATLAS_THREE_D: readonly EngineeringAtlasEntry[] = [
  ...THREE_D_RENDER_CARDS,
  ...THREE_D_CHARACTER_CARDS,
  ...THREE_D_ASSET_CARDS,
  ...THREE_D_GEOMETRY_CARDS,
  ...THREE_D_DCC_CARDS,
  ...THREE_D_XR_CARDS,
];
