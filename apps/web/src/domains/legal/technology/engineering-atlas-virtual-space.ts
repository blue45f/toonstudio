import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { VIRTUAL_SPACE_ASSET_CARDS } from "./engineering-atlas-virtual-space-assets";
import { VIRTUAL_SPACE_AUTHORITY_CARDS } from "./engineering-atlas-virtual-space-authority";
import { VIRTUAL_SPACE_CORE_CARDS } from "./engineering-atlas-virtual-space-core";
import { VIRTUAL_SPACE_EXTRA_CARDS } from "./engineering-atlas-virtual-space-extras";
import { VIRTUAL_SPACE_MOTION_CARDS } from "./engineering-atlas-virtual-space-motion";
import { VIRTUAL_SPACE_SOCIAL_CARDS } from "./engineering-atlas-virtual-space-social";

/**
 * 기술 도감 · virtual-space 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드 본문은 보조 파일(engineering-atlas-virtual-space-*.ts)에 두고 여기서 순서대로 모은다.
 */
export const ENGINEERING_ATLAS_VIRTUAL_SPACE: readonly EngineeringAtlasEntry[] = [
  ...VIRTUAL_SPACE_CORE_CARDS,
  ...VIRTUAL_SPACE_AUTHORITY_CARDS,
  ...VIRTUAL_SPACE_MOTION_CARDS,
  ...VIRTUAL_SPACE_SOCIAL_CARDS,
  ...VIRTUAL_SPACE_ASSET_CARDS,
  ...VIRTUAL_SPACE_EXTRA_CARDS,
];
