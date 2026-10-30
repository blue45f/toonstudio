import type { Office2dActor } from "./office2d-actors";
import type { Office2dAtlasDrawFrame } from "./office2d-atlas-frames";
import { office2dExpressionSheet } from "./office2d-expression-catalog";
import { office2dExpressionFrame } from "./office2d-expression-layer";
import type { Office2dAtlasPoint } from "./office2d-generated-atlases";
import type { Office2dSheetFrame } from "./office2d-poses";
import type { Office2dDrawable } from "./office2d-renderer";

export interface Office2dStandingExpression {
  readonly image: Office2dDrawable;
  readonly frameIndex: number;
  readonly drawFrame: Office2dAtlasDrawFrame;
  readonly eyewearOffset: Office2dAtlasPoint;
}

/** 유효한 전신 표정 하나를 기존 몸체 대신 선택한다. 미수신·다른 자세면 전체 몸체로 폴백한다. */
export function resolveOffice2dStandingExpression(
  actor: Office2dActor,
  pose: Office2dSheetFrame,
  frame: { readonly time: number; readonly now: number; readonly reducedMotion: boolean },
  image: (url: string) => Office2dDrawable | null,
): Office2dStandingExpression | null {
  const frameIndex = office2dExpressionFrame(actor, pose, frame.time, frame.now, frame.reducedMotion);
  if (frameIndex === null) return null;
  const sheet = office2dExpressionSheet(actor.character);
  if (!sheet) return null;
  const selected = sheet.frames[frameIndex];
  const bitmap = image(sheet.url);
  if (!selected || !bitmap || bitmap.width !== sheet.width || bitmap.height !== sheet.height) return null;
  return { image: bitmap, frameIndex, eyewearOffset: selected.eyewearOffset, drawFrame: {
    source: selected.source, destination: selected.target, accessoryOffset: selected.accessoryOffset,
  } };
}
