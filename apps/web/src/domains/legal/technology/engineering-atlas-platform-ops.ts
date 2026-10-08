import { PLATFORM_OPS_BACKEND_CARDS } from "./engineering-atlas-platform-ops-backend";
import { PLATFORM_OPS_DATA_CARDS } from "./engineering-atlas-platform-ops-data";
import { PLATFORM_OPS_EDGE_CARDS } from "./engineering-atlas-platform-ops-edge";
import { PLATFORM_OPS_QUALITY_CARDS } from "./engineering-atlas-platform-ops-quality";
import { PLATFORM_OPS_SAFETY_CARDS } from "./engineering-atlas-platform-ops-safety";
import { PLATFORM_OPS_TRANSACTION_CARDS } from "./engineering-atlas-platform-ops-transactions";
import { PLATFORM_OPS_TRUST_CARDS } from "./engineering-atlas-platform-ops-trust";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(`engineering-atlas-platform-ops-*.ts`)에 두고 여기서 한 배열로 모은다.
 */
export const ENGINEERING_ATLAS_PLATFORM_OPS: readonly EngineeringAtlasEntry[] = [
  ...PLATFORM_OPS_EDGE_CARDS,
  ...PLATFORM_OPS_DATA_CARDS,
  ...PLATFORM_OPS_TRUST_CARDS,
  ...PLATFORM_OPS_BACKEND_CARDS,
  ...PLATFORM_OPS_TRANSACTION_CARDS,
  ...PLATFORM_OPS_QUALITY_CARDS,
  ...PLATFORM_OPS_SAFETY_CARDS,
];
