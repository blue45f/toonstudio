import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { ENGINEERING_ATLAS_DRAWING_DOCUMENT } from "./engineering-atlas-drawing-document";
import { ENGINEERING_ATLAS_DRAWING_ENGINES } from "./engineering-atlas-drawing-engines";
import { ENGINEERING_ATLAS_DRAWING_INPUT } from "./engineering-atlas-drawing-input";
import { ENGINEERING_ATLAS_DRAWING_OUTPUT } from "./engineering-atlas-drawing-output";
import { ENGINEERING_ATLAS_DRAWING_PAINT } from "./engineering-atlas-drawing-paint";

/** 기술 도감 · drawing 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_DRAWING: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_DRAWING_INPUT,
  ...ENGINEERING_ATLAS_DRAWING_ENGINES,
  ...ENGINEERING_ATLAS_DRAWING_PAINT,
  ...ENGINEERING_ATLAS_DRAWING_DOCUMENT,
  ...ENGINEERING_ATLAS_DRAWING_OUTPUT,
];
