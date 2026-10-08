import { OPEN_DATA_CONTRACT_CARDS } from "./engineering-atlas-open-data-contracts";
import { OPEN_DATA_GATE_CARDS } from "./engineering-atlas-open-data-gates";
import { OPEN_DATA_NETWORK_CARDS } from "./engineering-atlas-open-data-network";
import { OPEN_DATA_OSS_CARDS } from "./engineering-atlas-open-data-oss";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · open-data 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드 내용은 보조 파일(engineering-atlas-open-data-*.ts)에 나눠 두고 이 파일에서 모은다.
 */
export const ENGINEERING_ATLAS_OPEN_DATA: readonly EngineeringAtlasEntry[] = [
  ...OPEN_DATA_GATE_CARDS,
  ...OPEN_DATA_NETWORK_CARDS,
  ...OPEN_DATA_CONTRACT_CARDS,
  ...OPEN_DATA_OSS_CARDS,
];
