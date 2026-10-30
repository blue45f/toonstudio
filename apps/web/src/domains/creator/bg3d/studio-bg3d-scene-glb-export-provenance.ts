import {
  assertStudioBg3dModelExportReceiptCurrent,
  assertStudioBg3dModelFileExportAllowed,
  resolveStudioBg3dModelExportProvenance,
  StudioBg3dModelExportProvenanceError,
} from "./studio-bg3d-model-export-provenance";
import { StudioBg3dSceneGlbError } from "./studio-bg3d-scene-glb-source";
import type { StudioBg3dModelExportProvenanceOptions, StudioBg3dModelExportProvenanceReceipt } from "./studio-bg3d-model-export-provenance";
import type { StudioBg3dSceneGlbSource, StudioBg3dSceneGlbSourceAsset } from "./studio-bg3d-scene-glb-source";

export interface StudioBg3dSceneGlbExportProvenance {
  readonly assetCount: number;
}
interface ProvenanceState {
  readonly source: StudioBg3dSceneGlbSource;
  readonly assets: ReadonlyMap<string, StudioBg3dSceneGlbSourceAsset>;
  readonly receipts: readonly StudioBg3dModelExportProvenanceReceipt[];
}
const preparations = new WeakMap<StudioBg3dSceneGlbExportProvenance, ProvenanceState>();

function sceneError(error: unknown): never {
  if (error instanceof StudioBg3dModelExportProvenanceError) throw new StudioBg3dSceneGlbError(error.code, error.message, { cause: error });
  throw error;
}

/** source가 이미 수집한 실제 표시 모델만 확인한다. 숨긴 자산과 도형 전용 장면은 권위 조회를 시작하지 않는다. */
export async function prepareStudioBg3dSceneGlbExportProvenance(source: StudioBg3dSceneGlbSource,
  options: StudioBg3dModelExportProvenanceOptions): Promise<StudioBg3dSceneGlbExportProvenance> {
  const receipts: StudioBg3dModelExportProvenanceReceipt[] = [];
  const assets = new Map(source.assets);
  try {
    for (const asset of assets.values()) {
      const receipt = await resolveStudioBg3dModelExportProvenance(asset.entry.record, options);
      assertStudioBg3dModelFileExportAllowed(receipt);
      receipts.push(receipt);
    }
    const result = Object.freeze({ assetCount: assets.size });
    preparations.set(result, { source, assets, receipts });
    return result;
  } catch (error) { sceneError(error); }
}

/** 다른 장면의 영수증·복제 DTO·교체된 asset map을 같은 장면의 허가로 쓰지 않는다. */
export function assertStudioBg3dSceneGlbExportProvenanceSource(preparation: StudioBg3dSceneGlbExportProvenance,
  source: StudioBg3dSceneGlbSource): void {
  const state = preparations.get(preparation);
  if (!state || state.source !== source || state.assets.size !== source.assets.size
    || [...state.assets].some(([id, asset]) => source.assets.get(id) !== asset)) {
    throw new StudioBg3dSceneGlbError("rights-unavailable", "현재 표시 장면의 내보내기 출처를 다시 확인해 주세요.");
  }
}

export async function assertStudioBg3dSceneGlbExportProvenanceCurrent(preparation: StudioBg3dSceneGlbExportProvenance,
  source: StudioBg3dSceneGlbSource): Promise<void> {
  assertStudioBg3dSceneGlbExportProvenanceSource(preparation, source);
  const state = preparations.get(preparation);
  if (!state) throw new StudioBg3dSceneGlbError("rights-unavailable", "장면의 내보내기 출처를 확인하지 못했습니다.");
  try {
    for (const receipt of state.receipts) {
      await assertStudioBg3dModelExportReceiptCurrent(receipt);
      assertStudioBg3dModelFileExportAllowed(receipt);
    }
  } catch (error) { sceneError(error); }
}
