/**
 * 수채 획의 "정착 표면" 해석 — StudioDrawNode 수채 분기에서 떼어 낸 단일 권위.
 *
 * 우선순위는 `applyStudioBrushAliasWatercolorMaterial`과 같다(커스텀 프로그램 세트 오버라이드가 레인 핀보다
 * 앞서고, 웻 텍스처 권위는 브러시당 하나): wet-edge-bloom 핀 → 리빙잉크 정착 베이크 → 젖은 종이 정착 베이크.
 * - 리빙잉크 베이크 레인(커밋 렌더): 바이트 동일한 베이스 워시를 바로 그리고 시분할 캐시에서 증강 dab을 받는다
 *   (2026-08-14 정지 수정 그대로).
 * - 젖은 종이 레인(커밋 렌더): dab 계획은 다른 레인과 같은 재질 스케일 베이스 워시이고, 정착 시뮬레이션 래스터가
 *   준비되면 그 래스터가 획을 대신 그린다(`wetPaperBake`). 라이브 초안·썸네일은 언제나 베이스 워시다.
 * SVG 내보내기는 같은 프로그램 해석(`resolveStudioWetPaperBakeProgramIdForBrush`)을 쓰고 동기로 굽는다.
 */

import {
  requestStudioLivingInkSettledBakeDabs,
  resolveStudioLivingInkSettledBakeProgram,
} from "../../studio-living-ink-settled-bake-v1";
import {
  applyStudioBrushAliasWatercolorMaterial,
  resolveStudioBrushAliasWatercolorMaterialStage,
  type StudioBrushAliasWatercolorDab,
} from "../studio-brush-alias-profile";
import { resolveStudioBrushEngineLaneWatercolorMaterial } from "../studio-brush-engine-lane-catalog";

import { requestStudioWetPaperBake } from "./studio-wet-paper-host";

import type { StudioBrushEngineProgramSet } from "../studio-brush-engine-program-set";
import type { StudioWetPaperCanvasBake } from "./studio-wet-paper-host";
import type { StudioWetPaperBakeProgramId } from "./studio-wet-paper-program-ids";

export { drawStudioWetPaperBake } from "./studio-wet-paper-host";

/**
 * 브러시가 젖은 종이 정착 베이크를 쓰는가. 다른 웻 텍스처 프로그램(블룸·리빙잉크)이 해석되면 null —
 * 레인 핀만으로는 권위를 얻지 못한다(fail-closed).
 */
export function resolveStudioWetPaperBakeProgramIdForBrush(
  brushId: unknown,
  enginePrograms?: StudioBrushEngineProgramSet | null,
): StudioWetPaperBakeProgramId | null {
  if (typeof brushId !== "string") return null;
  const stage = resolveStudioBrushAliasWatercolorMaterialStage(brushId, enginePrograms);
  if (stage.wetEdgeBloomProgramId || stage.livingInkBakeProgramId) return null;
  return resolveStudioBrushEngineLaneWatercolorMaterial(brushId)?.wetPaperBakeProgramId ?? null;
}

export interface StudioWatercolorSettledSurfaceInput {
  readonly brush: string;
  /** 플래너 dab(재질 스케일 전). */
  readonly plannedDabs: readonly StudioBrushAliasWatercolorDab[];
  /** 획 고정 시드(`watercolorBrushSeedFromKey(element.id)`). */
  readonly seed: number;
  readonly activeDraft: boolean;
  /** 문서 렌더(커밋 획)만 베이크를 요청한다. */
  readonly durableDocumentRender: boolean;
  readonly enginePrograms: StudioBrushEngineProgramSet | null;
  /** 획 색(젖은 종이 래스터 합성). */
  readonly color: string;
  /** 베이크가 캐시에 들어오면 한 번 불린다(렌더 세대 증가). */
  readonly onBakeReady: () => void;
  readonly bakeGeneration: number;
}

export interface StudioWatercolorSettledSurface {
  readonly dabs: readonly StudioBrushAliasWatercolorDab[];
  /** 준비된 젖은 종이 정착 래스터(없으면 dab 베이스 워시를 그린다). */
  readonly wetPaperBake: StudioWetPaperCanvasBake | null;
}

export function resolveStudioWatercolorSettledSurface(
  input: StudioWatercolorSettledSurfaceInput,
): StudioWatercolorSettledSurface {
  const { brush, plannedDabs, seed, enginePrograms } = input;
  const stage = resolveStudioBrushAliasWatercolorMaterialStage(brush, enginePrograms);
  const livingInkBakeProgram = input.durableDocumentRender && stage.livingInkBakeProgramId
    ? resolveStudioLivingInkSettledBakeProgram(stage.livingInkBakeProgramId)
    : null;
  if (livingInkBakeProgram) {
    const baseDabs = applyStudioBrushAliasWatercolorMaterial(brush, plannedDabs, seed, "live", enginePrograms);
    const baked = requestStudioLivingInkSettledBakeDabs(
      baseDabs,
      { ...livingInkBakeProgram, seed, phase: "settled" },
      input.onBakeReady,
      input.bakeGeneration,
    );
    return { dabs: baked ?? baseDabs, wetPaperBake: null };
  }
  const dabs = applyStudioBrushAliasWatercolorMaterial(
    brush,
    plannedDabs,
    seed,
    input.activeDraft ? "live" : "settled",
    enginePrograms,
  );
  const wetPaperProgramId = input.durableDocumentRender && !input.activeDraft
    ? resolveStudioWetPaperBakeProgramIdForBrush(brush, enginePrograms)
    : null;
  const wetPaperBake = wetPaperProgramId
    ? requestStudioWetPaperBake(
        dabs,
        { seed, programId: wetPaperProgramId },
        input.color,
        input.onBakeReady,
        input.bakeGeneration,
      )
    : null;
  return { dabs, wetPaperBake };
}
