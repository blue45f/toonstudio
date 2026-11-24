/**
 * OPFS Git형 프로젝트 브랜치 · 청크 중복제거 스냅샷 커밋 · 레이어 Diff · 원클릭 롤백 탭.
 */

import { GitBranch, GitCommitHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";

import {
  OpfsSnapshotVcsEngine,
  createOpfsVfsAdapter,
  createSeededWebtoonVcs,
  makeDeterministicLayerPayload,
  type SnapshotDeltaDiff,
  type VcsBranchSummary,
  type VcsCommitObject,
  type VcsProjectSnapshot,
  type VcsStorageStats,
  type VfsBackendKind,
} from "./opfs-snapshot-vcs";

export interface OpfsSnapshotVcsTabProps {
  readonly onNotify: (message: string) => void;
  readonly onBackendReady?: (backend: VfsBackendKind) => void;
}

interface VcsViewState {
  readonly ready: boolean;
  readonly activeBranch: string;
  readonly branches: readonly VcsBranchSummary[];
  readonly history: readonly VcsCommitObject[];
  readonly stats: VcsStorageStats | null;
  readonly latestSnapshot: VcsProjectSnapshot | null;
  readonly selectedCommitId: string | null;
  readonly selectedDiff: SnapshotDeltaDiff | null;
  readonly errorKo: string | null;
}

type LayerMutationKind = "edit-lineart" | "add-fx" | "tune-opacity";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

function formatBytesKo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function buildViewState(
  engine: OpfsSnapshotVcsEngine,
  latestSnapshot: VcsProjectSnapshot | null,
  preferredCommitId?: string | null,
): VcsViewState {
  const history = engine.getCommitHistory();
  const selectedId = preferredCommitId ?? history[0]?.id ?? null;
  const selectedCommit = selectedId ? engine.getCommit(selectedId) : null;
  const selectedDiff = selectedCommit
    ? engine.diffCommits(selectedCommit.parentId, selectedCommit.id)
    : null;
  return {
    ready: true,
    activeBranch: engine.currentBranch,
    branches: engine.getBranchList(),
    history,
    stats: engine.getStorageStats(),
    latestSnapshot,
    selectedCommitId: selectedId,
    selectedDiff,
    errorKo: null,
  };
}

export function OpfsSnapshotVcsTab({
  onNotify,
  onBackendReady,
}: OpfsSnapshotVcsTabProps): ReactElement {
  const uid = useId();
  const engineRef = useRef<OpfsSnapshotVcsEngine | null>(null);
  const initializationRef = useRef<ReturnType<typeof createSeededWebtoonVcs> | null>(null);
  const seqRef = useRef<number>(3);
  const [newBranchName, setNewBranchName] = useState<string>("alt-lighting");
  const [commitMessage, setCommitMessage] = useState<string>("펜선 하이라이트 보정");
  const [mutationKind, setMutationKind] = useState<LayerMutationKind>("edit-lineart");
  const [view, setView] = useState<VcsViewState>({
    ready: false,
    activeBranch: "main",
    branches: [],
    history: [],
    stats: null,
    latestSnapshot: null,
    selectedCommitId: null,
    selectedDiff: null,
    errorKo: null,
  });

  useEffect(() => {
    let active = true;
    initializationRef.current ??= createOpfsVfsAdapter({ namespaceDir: "toonstudio-vcs-panel" })
      .then((adapter) => createSeededWebtoonVcs(adapter));
    void initializationRef.current
      .then(({ engine, latestSnapshot }) => {
        if (!active) return;
        engineRef.current = engine;
        onBackendReady?.(engine.backendKind);
        setView(buildViewState(engine, latestSnapshot));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setView((prev) => ({
          ...prev,
          ready: true,
          errorKo: `OPFS 초기화 오류: ${error instanceof Error ? error.message : String(error)}`,
        }));
      });
    return () => {
      active = false;
    };
  }, [onBackendReady]);

  const handleCreateBranch = async (): Promise<void> => {
    const engine = engineRef.current;
    const candidate = newBranchName.trim();
    if (!engine || !candidate) return;
    try {
      await engine.createBranch(candidate);
      const snap = await engine.checkoutBranch(candidate);
      setView(buildViewState(engine, snap ?? view.latestSnapshot));
      setNewBranchName("");
      onNotify(`"${candidate}" 브랜치를 분기하고 체크아웃했습니다.`);
    } catch (error: unknown) {
      onNotify(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSwitchBranch = async (branchName: string): Promise<void> => {
    const engine = engineRef.current;
    if (!engine) return;
    const snap = await engine.checkoutBranch(branchName);
    setView(buildViewState(engine, snap));
    onNotify(`"${branchName}" 브랜치로 전환했습니다.`);
  };

  const handleCommitSnapshot = async (): Promise<void> => {
    const engine = engineRef.current;
    const current = view.latestSnapshot;
    if (!engine || !current) return;
    const seq = seqRef.current;
    seqRef.current += 1;

    let nextLayers = [...current.layers];
    if (mutationKind === "edit-lineart") {
      nextLayers = nextLayers.map((layer) =>
        layer.layerId === "layer-line"
          ? { ...layer, payload: makeDeterministicLayerPayload(24_576, 600 + seq * 17) }
          : layer,
      );
    } else if (mutationKind === "add-fx") {
      nextLayers.push({
        layerId: `layer-spark-${seq}`,
        name: `효과선 레이어 #${seq}`,
        kind: "fx",
        opacity: 0.85,
        visible: true,
        blendMode: "add",
        payload: makeDeterministicLayerPayload(8_192, 900 + seq * 23),
      });
    } else {
      nextLayers = nextLayers.map((layer) =>
        layer.layerId === "layer-bg" ? { ...layer, opacity: layer.opacity > 0.85 ? 0.8 : 1.0 } : layer,
      );
    }

    const nextSnapshot: VcsProjectSnapshot = { ...current, layers: nextLayers };
    const message = commitMessage.trim() || `스냅샷 커밋 #${seq}`;
    const committed = await engine.commit(nextSnapshot, { message });
    setView(buildViewState(engine, nextSnapshot, committed.id));
    setCommitMessage("");
    onNotify(
      `커밋 ${committed.id} 저장 완료 (재사용 청크 ${committed.stats.reusedChunks}개 · 신규 ${committed.stats.newChunksWritten}개).`,
    );
  };

  const handleRollbackCommit = async (targetId: string): Promise<void> => {
    const engine = engineRef.current;
    if (!engine) return;
    const result = await engine.rollbackToCommit(targetId);
    setView(buildViewState(engine, result.restoredSnapshot, result.rollbackCommit?.id ?? targetId));
    onNotify(`커밋 ${targetId} 상태로 무손실 롤백을 완료했습니다(청크 무결성 검증 통과).`);
  };

  const handleSelectCommitDiff = (commitId: string): void => {
    const engine = engineRef.current;
    if (!engine) return;
    setView(buildViewState(engine, view.latestSnapshot, commitId));
  };

  return (
    <div className="space-y-4">
      {view.errorKo ? (
        <p className="rounded-lg border border-bad/40 bg-bad/15 px-3 py-2 text-xs text-bad">
          {view.errorKo}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">청크 중복제거 절감률</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-good">
            {view.stats ? `${view.stats.deduplicationPercent.toFixed(1)}%` : "-"}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">논리 용량 / 실저장 용량</div>
          <div className="mt-1 text-xs font-bold tabular-nums text-fg">
            {view.stats
              ? `${formatBytesKo(view.stats.logicalBytes)} / ${formatBytesKo(view.stats.physicalStoredBytes)}`
              : "-"}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">고유 청크 · 총 커밋</div>
          <div className="mt-1 text-xs font-bold tabular-nums text-fg">
            {view.stats ? `${view.stats.uniqueChunkCount}청크 · ${view.stats.commitCount}커밋` : "-"}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">활성 브랜치 · 해시</div>
          <div className="mt-1 text-xs font-bold text-accent">
            {view.activeBranch} ({view.stats?.hashAlgorithm ?? "sha-256"})
          </div>
        </div>
      </div>

      {/* 브랜치 분기 & 스냅샷 커밋 폼 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg">브랜치 선택 및 새 시안 분기</div>
          <div className="flex flex-wrap gap-2">
            {view.branches.map((br) => (
              <button
                key={br.name}
                type="button"
                aria-pressed={br.isCurrent}
                onClick={() => {
                  void handleSwitchBranch(br.name);
                }}
                className={br.isCurrent ? CHIP_ACTIVE : BTN_OUTLINE}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {br.name} ({br.commitCount})
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label htmlFor={`${uid}-branch-name`} className="text-[11px] font-semibold text-fg-2">
                새 브랜치 이름
              </label>
              <input
                id={`${uid}-branch-name`}
                type="text"
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                placeholder="예: alt-lighting"
                className={`min-h-11 rounded-lg border border-line bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`}
              />
            </div>
            <button
              type="button"
              disabled={!view.ready || newBranchName.trim().length === 0}
              onClick={() => {
                void handleCreateBranch();
              }}
              className={BTN_OUTLINE}
            >
              <span>브랜치 분기</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg">스냅샷 커밋 생성</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-commit-msg`} className="text-[11px] font-semibold text-fg-2">
                커밋 메시지
              </label>
              <input
                id={`${uid}-commit-msg`}
                type="text"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="변경 사항 설명"
                className={`min-h-11 rounded-lg border border-line bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-layer-mut`} className="text-[11px] font-semibold text-fg-2">
                레이어 변경 시뮬레이션
              </label>
              <select
                id={`${uid}-layer-mut`}
                value={mutationKind}
                onChange={(event) => setMutationKind(event.target.value as LayerMutationKind)}
                className={`min-h-11 rounded-lg border border-line bg-canvas px-3 text-xs text-fg ${FOCUS_RING}`}
              >
                <option value="edit-lineart">펜선화 레이어 수정 (배경 청크 재사용)</option>
                <option value="add-fx">효과선 FX 레이어 신규 추가</option>
                <option value="tune-opacity">배경 불투명도 메타데이터 변경</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={!view.ready}
            onClick={() => {
              void handleCommitSnapshot();
            }}
            className={BTN_PRIMARY}
          >
            <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>스냅샷 커밋</span>
          </button>
        </div>
      </div>

      {/* 커밋 이력 & 레이어 델타 Diff */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg">브랜치 스냅샷 이력 ({view.activeBranch})</div>
          <ul className="space-y-2">
            {view.history.map((commit, index) => {
              const isHead = index === 0;
              const isSelected = commit.id === view.selectedCommitId;
              return (
                <li
                  key={commit.id}
                  className={`flex flex-col items-stretch justify-between gap-2 rounded-lg border p-2.5 text-xs sm:flex-row sm:flex-wrap sm:items-center ${
                    isSelected ? "border-accent bg-accent-soft" : "border-line bg-canvas"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectCommitDiff(commit.id)}
                    className={`min-h-11 w-full min-w-0 cursor-pointer text-left sm:w-auto sm:flex-1 ${FOCUS_RING}`}
                  >
                    <div className="flex flex-col items-start gap-1.5 font-semibold text-fg sm:flex-row sm:flex-wrap sm:items-center">
                      <span className="font-mono text-[11px] whitespace-nowrap text-accent">{commit.id}</span>
                      <span>{commit.message}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">
                      레이어 {commit.layerManifest.length}개 · 청크 재사용 {commit.stats.reusedChunks} / 신규{" "}
                      {commit.stats.newChunksWritten}
                    </div>
                  </button>

                  {isHead ? (
                    <span className="self-start rounded-md border border-good/40 bg-good/15 px-2 py-1 text-[11px] font-semibold text-good sm:self-auto">
                      HEAD
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void handleRollbackCommit(commit.id);
                      }}
                      className={`${BTN_OUTLINE} w-full sm:w-auto`}
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>원클릭 롤백</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg">
            레이어 델타 Diff {view.selectedDiff ? `(${view.selectedDiff.toCommitId})` : ""}
          </div>
          {view.selectedDiff ? (
            <ul className="space-y-1.5">
              {view.selectedDiff.entries.map((entry) => (
                <li
                  key={entry.layerId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-fg">{entry.name}</div>
                    <div className="text-[11px] tabular-nums text-fg-3">
                      재사용 청크 {entry.reusedChunkCount}개 · 변경 청크 {entry.changedChunkCount}개
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                      entry.status === "added"
                        ? "border-good/40 bg-good/15 text-good"
                        : entry.status === "modified"
                          ? "border-warn/40 bg-warn/15 text-warn"
                          : entry.status === "removed"
                            ? "border-bad/40 bg-bad/15 text-bad"
                            : "border-line bg-raised text-fg-2"
                    }`}
                  >
                    {entry.status === "added"
                      ? "추가"
                      : entry.status === "modified"
                        ? "수정"
                        : entry.status === "removed"
                          ? "삭제"
                          : "유지"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-3">스냅샷 이력을 불러오는 중입니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
