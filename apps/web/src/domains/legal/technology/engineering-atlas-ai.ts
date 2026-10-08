import { ENGINEERING_ATLAS_AI_GENERATIVE } from "./engineering-atlas-ai-generative";
import { ENGINEERING_ATLAS_AI_ONDEVICE } from "./engineering-atlas-ai-ondevice";
import { ENGINEERING_ATLAS_AI_ROUTING } from "./engineering-atlas-ai-routing";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(engineering-atlas-ai-*.ts)에 두고 여기서 한 배열로 합친다.
 */
export const ENGINEERING_ATLAS_AI: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_AI_ROUTING,
  ...ENGINEERING_ATLAS_AI_ONDEVICE,
  ...ENGINEERING_ATLAS_AI_GENERATIVE,
];
