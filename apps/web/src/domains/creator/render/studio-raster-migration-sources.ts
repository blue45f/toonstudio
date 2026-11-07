import {
  BrushStudioV6LegacyPigmentMigrationRequiredError,
  requiresLegacyMixboxStrokeMigration,
} from "../brush-lab/brush-studio-v6-legacy-pigment";

import type { El } from "../studio-element-model";

/** 집계만 분리한다. 전환·원본 변경 없이 재생 불가 이유를 유지한다. */
export function partitionStudioRasterMigrationSources(elements: readonly El[]): {
  readonly replayable: readonly El[];
  readonly unsupported: ReadonlyMap<string, string>;
} {
  const replayable: El[] = [];
  const unsupported = new Map<string, string>();
  for (const element of elements) {
    const material = element.type === "draw" && (element.kind ?? "freehand") === "freehand" && element.mode !== "eraser"
      ? element.brushEnginePrograms?.material : undefined;
    if (material && requiresLegacyMixboxStrokeMigration(material)) {
      unsupported.set(element.id, new BrushStudioV6LegacyPigmentMigrationRequiredError().message);
    } else {
      replayable.push(element);
    }
  }
  return { replayable, unsupported };
}
