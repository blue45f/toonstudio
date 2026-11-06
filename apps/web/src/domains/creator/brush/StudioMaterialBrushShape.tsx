import { Shape } from "react-konva/lib/ReactKonvaCore";
import { lazy, Suspense } from "react";

import { renderStudioMaterialBrush, studioMaterialBrushBounds } from "./studio-material-brush-runtime";
import { requiresLegacyMixboxStrokeMigration } from "../brush-lab/brush-studio-v6-legacy-pigment";

import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import type { DrawEl } from "../studio-element-model";

const LegacyPigmentStrokePlaceholder = lazy(() => import("./StudioLegacyPigmentStrokePlaceholder"));

/**
 * One renderer seam for saved V6 material programs.
 * StudioDrawNode owns document layout; this component owns contact replay only.
 */
export function StudioMaterialBrushShape({
  element,
  points,
  enginePrograms,
}: {
  readonly element: DrawEl;
  readonly points: readonly number[];
  readonly enginePrograms: StudioBrushEngineProgramSet;
}) {
  if (requiresLegacyMixboxStrokeMigration(enginePrograms.material)) return <Suspense fallback={null}><LegacyPigmentStrokePlaceholder points={points} /></Suspense>;
  // scene과 bounds가 같은 최신 replay 입력을 읽는다. 별도 기하·sample 캐시는 만들지 않는다.
  const replayInput = () => ({ ...element, points, brushEnginePrograms: enginePrograms });
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      // marks가 없는 정본 입력의 null만 빈 paint rect로 표현한다. 오류는 숨기지 않는다.
      selfRectFunc={() => studioMaterialBrushBounds(replayInput()) ?? { x: 0, y: 0, width: 0, height: 0 }}
      sceneFunc={(context) => {
        renderStudioMaterialBrush(context._context, replayInput());
      }}
    />
  );
}
