import { Shape } from "react-konva/lib/ReactKonvaCore";
import { lazy, Suspense } from "react";

import { renderStudioMaterialBrush } from "./studio-material-brush-runtime";
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
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context) => {
        renderStudioMaterialBrush(context._context, {
          ...element,
          points,
          brushEnginePrograms: enginePrograms,
        });
      }}
    />
  );
}
