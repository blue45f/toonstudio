import { ENGINEERING_ATLAS_INTERACTION_CANVAS3D } from "./engineering-atlas-interaction-canvas3d";
import { ENGINEERING_ATLAS_INTERACTION_CHOICE } from "./engineering-atlas-interaction-choice";
import { ENGINEERING_ATLAS_INTERACTION_HTML5 } from "./engineering-atlas-interaction-html5";
import { ENGINEERING_ATLAS_INTERACTION_POINTER } from "./engineering-atlas-interaction-pointer";
import { ENGINEERING_ATLAS_INTERACTION_REORDER } from "./engineering-atlas-interaction-reorder";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · interaction 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(engineering-atlas-interaction-*.ts)에 나눠 두고 이 파일이 순서대로 합친다.
 * 순서: 표준 끌어 놓기 → 목록 순서 바꾸기 → Pointer Events 직접 구현 → 장면 안 객체(캔버스·3D) → 선택 기준·접근성.
 */
export const ENGINEERING_ATLAS_INTERACTION: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_INTERACTION_HTML5,
  ...ENGINEERING_ATLAS_INTERACTION_REORDER,
  ...ENGINEERING_ATLAS_INTERACTION_POINTER,
  ...ENGINEERING_ATLAS_INTERACTION_CANVAS3D,
  ...ENGINEERING_ATLAS_INTERACTION_CHOICE,
];
