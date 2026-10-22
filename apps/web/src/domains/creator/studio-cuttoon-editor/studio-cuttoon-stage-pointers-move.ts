/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag.
 * 본체는 studio-cuttoon-stage-pointers-move-handler.ts 가 소유한다. */
// @ts-nocheck
"use no memo";
import { createStudioCuttoonStagePointerMoveHandler } from "./studio-cuttoon-stage-pointers-move-handler";

import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersMove(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  api.onStageMove = createStudioCuttoonStagePointerMoveHandler(h, api);
}
