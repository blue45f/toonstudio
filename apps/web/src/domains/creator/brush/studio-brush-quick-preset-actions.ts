/**
 * 브러시 프리셋 상단 요약 바에서 즉시 실행하는 사용자 복제·원본 복원 액션(P1-10).
 *
 * 인스펙터 상단에서 깊은 브러시 스튜디오 모달을 열지 않고도 현재 프리셋을 내 브러시(고정 선반 포함)로
 * 복제하여 즉시 선택 상태를 유지하거나, 검증된 기본값 트랜잭션으로 원본 복원할 수 있게 한다.
 */

import {
  createStudioBuiltInBrushDefaultRestoreProfile,
  createStudioSavedBrushDefaultRestoreProfile,
  planStudioBrushDefaultRestore,
  resolveStudioCoreBrushDefaultRestoreProfile,
  type StudioBrushDefaultRestoreDirection,
  type StudioBrushDefaultRestoreTransaction,
} from "./studio-brush-default-restore";
import {
  createBrush,
  duplicateBrushName,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  notifyStudioBrushLibraryChanged,
  openProductBrushLibraryRepository,
  type ProductBrushLibraryRepository,
} from "./studio-brush-library-sqlite-repository";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";

export interface CloneCurrentStudioBrushPresetInput {
  readonly baseName: string;
  readonly currentSnapshot: StudioBrushSnapshot;
  readonly existingBrushes: readonly StudioSavedBrush[];
  readonly repositoryFactory?: () => Promise<Pick<ProductBrushLibraryRepository, "repository">>;
  readonly nowMs?: number;
}

export interface CloneCurrentStudioBrushPresetResult {
  readonly cloned: StudioSavedBrush;
  readonly nextBrushes: StudioSavedBrush[];
}

export async function cloneCurrentStudioBrushPreset(
  input: CloneCurrentStudioBrushPresetInput,
): Promise<CloneCurrentStudioBrushPresetResult> {
  const nextName = duplicateBrushName(
    input.baseName.trim() || "내 브러시",
    input.existingBrushes.map((candidate) => candidate.name),
  );
  const now = input.nowMs ?? Date.now();
  const baseCreated = createBrush(nextName, input.currentSnapshot);
  const cloned: StudioSavedBrush = {
    ...baseCreated,
    pinned: true,
    lastUsedAt: now,
    updatedAt: now,
  };
  const openRepo = input.repositoryFactory ?? openProductBrushLibraryRepository;
  try {
    const product = await openRepo();
    await product.repository.put(cloned);
    notifyStudioBrushLibraryChanged();
  } catch {
    // 저장소 접근이 제한된 테스트·읽기전용 환경에서도 메모리 선반과 선택 상태는 즉시 유지한다.
  }
  return {
    cloned,
    nextBrushes: [cloned, ...input.existingBrushes.filter((item) => item.id !== cloned.id)],
  };
}

export interface RestoreCurrentStudioBrushDefaultsInput {
  readonly currentSnapshot: StudioBrushSnapshot;
  readonly savedBrushBaseline: StudioSavedBrush | null;
  readonly onRestoreDefaults: (
    transaction: StudioBrushDefaultRestoreTransaction,
    direction: StudioBrushDefaultRestoreDirection,
  ) => void;
}

export interface RestoreCurrentStudioBrushDefaultsResult {
  readonly status: "restored" | "unchanged" | "unavailable";
  readonly summary: string;
}

export async function restoreCurrentStudioBrushDefaults(
  input: RestoreCurrentStudioBrushDefaultsInput,
): Promise<RestoreCurrentStudioBrushDefaultsResult> {
  const { currentSnapshot, savedBrushBaseline, onRestoreDefaults } = input;
  const profile =
    savedBrushBaseline && savedBrushBaseline.brushId === currentSnapshot.brushId
      ? createStudioSavedBrushDefaultRestoreProfile(savedBrushBaseline)
      : currentSnapshot.sourcePresetId
        ? await materializeStudioBrushCatalogSelection(currentSnapshot.sourcePresetId).then(
            (selection) =>
              selection ? createStudioBuiltInBrushDefaultRestoreProfile(selection) : null,
          )
        : resolveStudioCoreBrushDefaultRestoreProfile(currentSnapshot.brushId);

  if (!profile) {
    return {
      status: "unavailable",
      summary: "이 브러시의 원본 프로필을 찾지 못했습니다.",
    };
  }
  const transaction = planStudioBrushDefaultRestore(currentSnapshot, profile);
  if (transaction.changes.length === 0) {
    return {
      status: "unchanged",
      summary: "이미 원본 기본값과 같습니다.",
    };
  }
  onRestoreDefaults(transaction, "redo");
  return {
    status: "restored",
    summary: transaction.summary,
  };
}
