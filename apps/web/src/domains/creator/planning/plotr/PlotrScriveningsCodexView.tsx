/**
 * 연속 대본 스트림(Scrivenings) · 비파괴 스냅샷 단어 Diff · 실시간 설정 자동 탐지(Codex) 뷰.
 *
 * `writer-room/studio-scrivenings-snapshot-codex.ts` 엔진을 실제 화면에 마운트해
 * 여러 장면을 한 페이지에서 연속 편집·분할·병합하고, 대수술 전 스냅샷을 남긴 뒤
 * 단어 단위 변경점 비교·안전 복원(자동 백업 포함) 및 폐기 설정 경고까지 실시간 처리한다.
 */
import {
  AlertTriangle,
  BookOpen,
  Camera,
  GitCompare,
  Layers,
  RotateCcw,
  Scissors,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  applyScriveningsCompositeEdit,
  buildScriveningsCompositeStream,
  compileCodexMatcher,
  computeWordDiff,
  createSceneSnapshot,
  mergeAdjacentScenes,
  restoreSceneFromSnapshot,
  scanTextForCodexMatches,
  splitSceneAtOffset,
  type CodexEntityEntry,
  type SceneSnapshotRecord,
  type ScriptSceneCard,
} from "../../writer-room/studio-scrivenings-snapshot-codex";
import "./plotr-story-atelier.css";

export interface PlotrScriveningsCodexViewProps {
  readonly scenes: readonly ScriptSceneCard[];
  readonly snapshots: readonly SceneSnapshotRecord[];
  readonly codexEntries: readonly CodexEntityEntry[];
  readonly onChange: (patch: {
    readonly scenes: readonly ScriptSceneCard[];
    readonly snapshots: readonly SceneSnapshotRecord[];
  }) => void;
}

const BTN_BASE =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrScriveningsCodexView({
  scenes,
  snapshots,
  codexEntries,
  onChange,
}: PlotrScriveningsCodexViewProps) {
  const composite = useMemo(() => buildScriveningsCompositeStream(scenes), [scenes]);
  const [draftComposite, setDraftComposite] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id ?? "");
  const [snapshotLabel, setSnapshotLabel] = useState("개고 전 보관본");
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);
  const [undoScenes, setUndoScenes] = useState<readonly ScriptSceneCard[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const editorText = draftComposite !== null ? draftComposite : composite.text;
  const activeScene =
    scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0] ?? null;

  const matcher = useMemo(() => compileCodexMatcher(codexEntries), [codexEntries]);
  const codexMatches = useMemo(
    () => scanTextForCodexMatches(editorText, matcher),
    [editorText, matcher],
  );
  const retiredWarnings = useMemo(
    () => codexMatches.filter((m) => m.severity === "warning"),
    [codexMatches],
  );

  const sceneSnapshots = useMemo(
    () =>
      activeScene
        ? snapshots.filter((snap) => snap.sceneId === activeScene.id)
        : [],
    [snapshots, activeScene],
  );
  const activeCompareSnap =
    sceneSnapshots.find((s) => s.snapshotId === compareSnapshotId) ??
    sceneSnapshots[0] ??
    null;

  const wordDiff = useMemo(() => {
    if (!activeScene || !activeCompareSnap) return null;
    return computeWordDiff(activeCompareSnap.body, activeScene.body);
  }, [activeScene, activeCompareSnap]);

  const handleApplyComposite = () => {
    const result = applyScriveningsCompositeEdit(scenes, editorText);
    if (!result.ok) {
      setStatusMessage(result.errorKo ?? "장면 구분선을 확인해 주세요.");
      return;
    }
    onChange({ scenes: result.scenes, snapshots });
    setDraftComposite(null);
    setStatusMessage(
      result.changedSceneIds.length > 0
        ? `연속 대본에서 수정한 ${result.changedSceneIds.length}개 장면을 바로 반영했어요.`
        : "변경된 내용이 없어요.",
    );
  };

  const handleSplitActiveScene = () => {
    if (!activeScene) return;
    const mid = Math.max(1, Math.floor(activeScene.body.length / 2));
    const payload = splitSceneAtOffset(
      scenes,
      activeScene.id,
      mid,
      `scene-split-${Date.now()}`,
      `${activeScene.title} (후반)`,
    );
    setUndoScenes(payload.previousScenes);
    onChange({ scenes: payload.nextScenes, snapshots });
    setDraftComposite(null);
    setStatusMessage(`'${activeScene.title}' 장면을 둘로 나눴어요.`);
  };

  const handleMergeWithNext = () => {
    if (!activeScene) return;
    const sorted = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((s) => s.id === activeScene.id);
    const nextScene = idx >= 0 ? sorted[idx + 1] : undefined;
    if (!nextScene) return;
    const payload = mergeAdjacentScenes(scenes, activeScene.id, nextScene.id);
    setUndoScenes(payload.previousScenes);
    onChange({ scenes: payload.nextScenes, snapshots });
    setDraftComposite(null);
    setStatusMessage(`'${activeScene.title}'과 '${nextScene.title}'을 하나로 합쳤어요.`);
  };

  const handleUndoSplitMerge = () => {
    if (!undoScenes) return;
    onChange({ scenes: undoScenes, snapshots });
    setUndoScenes(null);
    setDraftComposite(null);
    setStatusMessage("직전 장면 분할·병합을 되돌렸어요.");
  };

  const handleCaptureSnapshot = () => {
    if (!activeScene) return;
    const snap = createSceneSnapshot(
      activeScene,
      snapshotLabel,
      new Date().toISOString(),
    );
    const deduped = snapshots.filter((s) => s.snapshotId !== snap.snapshotId);
    onChange({ scenes, snapshots: [snap, ...deduped] });
    setCompareSnapshotId(snap.snapshotId);
    setStatusMessage(`'${activeScene.title}' 보관본을 남겼어요.`);
  };

  const handleRestoreSnapshot = (snap: SceneSnapshotRecord) => {
    if (!activeScene || activeScene.id !== snap.sceneId) return;
    const { restoredScene, autoBackupSnapshot } = restoreSceneFromSnapshot(
      activeScene,
      snap,
      new Date().toISOString(),
    );
    const nextScenes = scenes.map((s) => (s.id === restoredScene.id ? restoredScene : s));
    const nextSnapshots = [
      autoBackupSnapshot,
      ...snapshots.filter((s) => s.snapshotId !== autoBackupSnapshot.snapshotId),
    ];
    onChange({ scenes: nextScenes, snapshots: nextSnapshots });
    setDraftComposite(null);
    setStatusMessage("현재 본문을 자동 백업한 뒤 선택한 보관본으로 안전하게 복원했어요.");
  };

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => a.orderIndex - b.orderIndex),
    [scenes],
  );
  const canMergeNext =
    activeScene !== null &&
    sortedScenes.findIndex((s) => s.id === activeScene.id) < sortedScenes.length - 1;

  return (
    <section
      aria-label="연속 대본과 스냅샷·설정 탐지"
      data-testid="plotr-scrivenings-codex-view"
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <BookOpen className="size-4 text-accent" aria-hidden="true" />
            <span>연속 대본 편집 · 스냅샷 비교 · 설정 자동 탐지</span>
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            여러 장면을 한 번에 고치고, 대수술 전에 스냅샷을 남겨 단어 변경점과 설정 오류를 즉시 확인해요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleApplyComposite}
            disabled={draftComposite === null}
            title={draftComposite === null ? "본문을 수정하면 반영 버튼이 켜져요" : undefined}
            className={`${BTN_BASE} border-accent bg-accent text-on-accent disabled:opacity-40`}
          >
            연속 대본 반영하기
          </button>
          {undoScenes ? (
            <button
              type="button"
              onClick={handleUndoSplitMerge}
              className={`${BTN_BASE} border-line bg-card text-fg hover:bg-raised`}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              <span>분할·병합 되돌리기</span>
            </button>
          ) : null}
        </div>
      </header>

      {statusMessage ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="scrivenings-status-message"
          className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2"
        >
          {statusMessage}
        </p>
      ) : null}

      {retiredWarnings.length > 0 ? (
        <div
          role="alert"
          data-testid="codex-retired-warning"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/50 bg-warn/10 px-3 py-2.5 text-xs text-warn"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{retiredWarnings[0]!.warningKo}</span>
        </div>
      ) : null}

      {scenes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-xs text-fg-2">
          아직 장면 카드가 없어요. 장르 샘플을 고르거나 대본을 컷으로 나누면 여기서 연속 편집할 수 있어요.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,1fr)]">
          {/* 왼쪽: 연속 편집 에디터 + 장면 분할/병합 */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {sortedScenes.map((scene) => {
                const isSelected = activeScene?.id === scene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`${BTN_BASE} ${
                      isSelected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                    }`}
                  >
                    {scene.orderIndex + 1}. {scene.title}
                  </button>
                );
              })}
            </div>

            <label className="block text-xs font-semibold text-fg-2">
              연속 대본 편집창 (장면 구분선 `=== [SCENE:…] ===`은 유지해 주세요)
              <textarea
                rows={9}
                data-testid="scrivenings-composite-textarea"
                value={editorText}
                onChange={(e) => setDraftComposite(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-card p-3 font-sans text-xs leading-relaxed text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSplitActiveScene}
                disabled={!activeScene}
                title={!activeScene ? "분할할 장면을 먼저 골라 주세요" : undefined}
                className={`${BTN_BASE} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
              >
                <Scissors className="size-3.5" aria-hidden="true" />
                <span>선택 장면 둘로 나누기</span>
              </button>
              <button
                type="button"
                onClick={handleMergeWithNext}
                disabled={!canMergeNext}
                title={!canMergeNext ? "뒤에 이어진 장면이 있어야 합칠 수 있어요" : undefined}
                className={`${BTN_BASE} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
              >
                <Layers className="size-3.5" aria-hidden="true" />
                <span>다음 장면과 합치기</span>
              </button>
            </div>
          </div>

          {/* 오른쪽: 스냅샷 + 단어 Diff + 실시간 설정(Codex) 감지 */}
          <div className="space-y-3">
            <section className="space-y-2.5 rounded-xl border border-line bg-card p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Camera className="size-3.5 text-accent" aria-hidden="true" />
                <span>장면 스냅샷 · 단어 Diff 비교</span>
              </h4>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  aria-label="스냅샷 이름"
                  placeholder="예: 대사 수정 전"
                  className="min-h-11 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
                />
                <button
                  type="button"
                  data-testid="capture-scene-snapshot-btn"
                  onClick={handleCaptureSnapshot}
                  disabled={!activeScene}
                  title={!activeScene ? "보관할 장면을 선택해 주세요" : undefined}
                  className={`${BTN_BASE} border-accent/50 bg-accent-soft text-accent disabled:opacity-40`}
                >
                  스냅샷 찍기
                </button>
              </div>

              {sceneSnapshots.length > 0 ? (
                <ul className="space-y-1.5">
                  {sceneSnapshots.map((snap) => (
                    <li
                      key={snap.snapshotId}
                      className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setCompareSnapshotId(snap.snapshotId)}
                        className="min-h-11 flex-1 text-left font-semibold text-fg hover:text-accent"
                      >
                        {snap.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreSnapshot(snap)}
                        className={`${BTN_BASE} border-line bg-card text-fg-2 hover:text-fg`}
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        <span>복원</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-3">
                  수정 전에 스냅샷을 찍어 두면 언제든 단어 변경점을 비교하고 안전하게 되돌릴 수 있어요.
                </p>
              )}

              {wordDiff && activeCompareSnap ? (
                <div
                  data-testid="scrivenings-word-diff"
                  className="space-y-1.5 rounded-lg border border-line bg-panel p-2.5 text-xs"
                >
                  <p className="flex items-center justify-between font-semibold text-fg-2 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <GitCompare className="size-3.5 text-accent" aria-hidden="true" />
                      <span>‘{activeCompareSnap.label}’ 대비</span>
                    </span>
                    <span>
                      +{wordDiff.addedTokens} / -{wordDiff.removedTokens}어절
                    </span>
                  </p>
                  <p className="leading-relaxed text-fg">
                    {wordDiff.chunks.map((chunk, idx) =>
                      chunk.op === "insert" ? (
                        <ins key={idx} className="plotr-diff-ins no-underline">
                          {chunk.text}
                        </ins>
                      ) : chunk.op === "delete" ? (
                        <del key={idx} className="plotr-diff-del">
                          {chunk.text}
                        </del>
                      ) : (
                        <span key={idx}>{chunk.text}</span>
                      ),
                    )}
                  </p>
                </div>
              ) : null}
            </section>

            {/* 실시간 Codex 별칭 감지 */}
            <section className="space-y-2 rounded-xl border border-line bg-card p-3">
              <h4 className="text-xs font-bold text-fg tabular-nums">
                대본 속 설정 자동 감지 ({codexMatches.length}건)
              </h4>
              {codexMatches.length === 0 ? (
                <p className="text-xs text-fg-3">
                  등록된 인물·장소 이름이나 별칭을 대본에 적으면 자동으로 인식해 표시해요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {codexMatches.slice(0, 6).map((match, idx) => (
                    <li
                      key={`${match.entityId}-${match.startOffset}-${idx}`}
                      className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="font-semibold text-fg">
                          {match.canonical}
                          {match.matchedSurface !== match.canonical
                            ? ` (표기: ${match.matchedSurface})`
                            : ""}
                        </strong>
                        <span
                          className={
                            match.severity === "warning"
                              ? "font-semibold text-warn"
                              : "text-fg-3"
                          }
                        >
                          {match.severity === "warning" ? "폐기·주의" : "확인됨"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-fg-2">{match.summary}</p>
                      {match.voiceTone ? (
                        <p className="mt-0.5 text-[11px] text-fg-3">말투: {match.voiceTone}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

export default PlotrScriveningsCodexView;
