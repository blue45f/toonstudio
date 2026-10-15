import { poolItemFromProcessCompareItem, type ComparePoolItem } from "./compare-review-model";
import { buildProcessCompareItems } from "./process-compare-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

/**
 * 공정 리비전(원고·버전 표면의 데이터)에서 비교 풀의 씨앗을 만든다.
 * ProductionEpisodeProcessMatrix의 processes를 그대로 넘기면 된다.
 */
export function buildCompareSeedPoolFromProcesses(
  processes: readonly ProductionManuscriptProcess[],
  resolveImageUrl: ((processId: string, revisionId: string) => string | null) | undefined,
  addedBy: string,
): ComparePoolItem[] {
  const items = buildProcessCompareItems(
    processes.map((process) => ({
      id: process.artifact.id,
      label: process.label,
      kind: process.processType,
      revisions: process.revisions.map((revision) => ({ id: revision.id, createdAt: revision.createdAt })),
    })),
    resolveImageUrl,
  );
  return items.map((item) => poolItemFromProcessCompareItem(item, addedBy, item.createdAt));
}
