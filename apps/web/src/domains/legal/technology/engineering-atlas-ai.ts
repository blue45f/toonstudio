import { ENGINEERING_ATLAS_AI_COPILOT_STYLE } from "./engineering-atlas-ai-copilot-style";
import { ENGINEERING_ATLAS_AI_EVAL_STARTER } from "./engineering-atlas-ai-eval-starter";
import { ENGINEERING_ATLAS_AI_GENERATIVE } from "./engineering-atlas-ai-generative";
import { ENGINEERING_ATLAS_AI_ONDEVICE } from "./engineering-atlas-ai-ondevice";
import { ENGINEERING_ATLAS_AI_ROUTING } from "./engineering-atlas-ai-routing";
import { ENGINEERING_ATLAS_AI_SILICON } from "./engineering-atlas-ai-silicon";
import { ENGINEERING_ATLAS_AI_WAVE4_VRAM_PAGER } from "./engineering-atlas-ai-wave4-vram-pager";
import { ENGINEERING_ATLAS_AI_WAVES8TO23_LORE_JAMO_SEARCH } from "./engineering-atlas-ai-waves8to23-lore-jamo-search";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(engineering-atlas-ai-*.ts)에 두고 여기서 한 배열로 합친다.
 */
export const ENGINEERING_ATLAS_AI: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_AI_ROUTING,
  ...ENGINEERING_ATLAS_AI_EVAL_STARTER,
  ...ENGINEERING_ATLAS_AI_COPILOT_STYLE,
  ...ENGINEERING_ATLAS_AI_WAVE4_VRAM_PAGER,
  ...ENGINEERING_ATLAS_AI_WAVES8TO23_LORE_JAMO_SEARCH,
  ...ENGINEERING_ATLAS_AI_ONDEVICE,
  ...ENGINEERING_ATLAS_AI_SILICON,
  ...ENGINEERING_ATLAS_AI_GENERATIVE,
];
