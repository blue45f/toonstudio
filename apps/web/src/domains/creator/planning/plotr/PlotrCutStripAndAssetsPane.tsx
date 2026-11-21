/**
 * Plotr 컷 스트립 · 선택 개수 반응형 프롬프트 바 · 빈 컷 일괄 조립 큐(Esc 중단) ·
 * 말풍선/효과선/효과음 · 텐션 곡선 · 프로젝트 그림체 패널.
 */
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Layers,
  MessageSquare,
  Palette,
  Play,
  Scissors,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelBatchCutQueue,
  createBatchCutQueue,
  resolveContextPromptMode,
  stepBatchCutQueue,
} from "./plotr-consistency-and-batch";
import { auditCharacterConsistencyAcrossCuts } from "./plotr-character-sheet-model";
import {
  applyGlobalPanelBorder,
  auditReverseShotAxis,
  batchToggleCutBubbles,
  fixReverseShotAxisOnCut,
  mergePlotrCutWithNext,
  movePlotrCut,
  splitPlotrCut,
  updateCutDialoguePreservingSource,
} from "./plotr-script-cut-engine";
import {
  PLOTR_CAMERA_FRAMING_PRESETS,
  PLOTR_LIGHTING_MOOD_PRESETS,
  applyCutFramingPreset,
  applyCutLightingMood,
} from "./plotr-visual-cut-renderer";
import {
  PLOTR_EFFECT_LINE_LABELS,
  PLOTR_SFX_PRESETS,
  type PlotrBatchQueueState,
  type PlotrCameraFramingId,
  type PlotrCutCard,
  type PlotrDocumentState,
  type PlotrEffectLineKind,
  type PlotrLightingMoodId,
} from "./plotr-types";
import { PlotrCharacterConsistencySheet } from "./PlotrCharacterConsistencySheet";
import { PlotrConsistencyAssetStrip } from "./PlotrConsistencyAssetStrip";
import { PlotrTensionAndStylePanel } from "./PlotrTensionAndStylePanel";
import { PlotrVisualCutPreviewCard } from "./PlotrVisualCutPreviewCard";

export interface PlotrCutStripAndAssetsPaneProps {
  readonly document: PlotrDocumentState;
  readonly expertMode: boolean;
  readonly onUpdateDocument: (
    updater: (prev: PlotrDocumentState) => PlotrDocumentState,
    noticeKo?: string,
  ) => void;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrCutStripAndAssetsPane({
  document,
  expertMode,
  onUpdateDocument,
}: PlotrCutStripAndAssetsPaneProps) {
  const [selectedCutIds, setSelectedCutIds] = useState<readonly string[]>(() =>
    document.cuts[0] ? [document.cuts[0].id] : [],
  );
  const [promptInput, setPromptInput] = useState("");
  const [batchQueue, setBatchQueue] = useState<PlotrBatchQueueState>({
    active: false,
    cancelled: false,
    phase: "idle",
    pendingAssetIds: [],
    queuedCutIds: [],
    completedCutIds: [],
    concurrency: 3,
    statusMessageKo: "",
  });
  const cutIdCounterRef = useRef(1);

  const validSelectedIds = useMemo(() => {
    const existing = new Set(document.cuts.map((c) => c.id));
    return selectedCutIds.filter((id) => existing.has(id));
  }, [document.cuts, selectedCutIds]);

  const primaryCut: PlotrCutCard | null = useMemo(() => {
    const firstId = validSelectedIds[0];
    return document.cuts.find((c) => c.id === firstId) ?? document.cuts[0] ?? null;
  }, [document.cuts, validSelectedIds]);

  const promptMode = useMemo(
    () => resolveContextPromptMode(validSelectedIds),
    [validSelectedIds],
  );
  const reverseShotWarnings = useMemo(
    () => auditReverseShotAxis(document.cuts),
    [document.cuts],
  );
  const reverseShotWarningCutIds = useMemo(
    () => new Set(reverseShotWarnings.map((w) => w.cutId)),
    [reverseShotWarnings],
  );
  const characterAudit = useMemo(
    () =>
      auditCharacterConsistencyAcrossCuts(
        document.assets,
        document.cuts,
        document.codexEntries,
      ),
    [document.assets, document.cuts, document.codexEntries],
  );

  const handleChangeCutFraming = (cutId: string, framing: PlotrCameraFramingId) => {
    const label = PLOTR_CAMERA_FRAMING_PRESETS[framing].labelKo;
    onUpdateDocument(
      (prev) => ({ ...prev, cuts: applyCutFramingPreset(prev.cuts, cutId, framing) }),
      `카메라 구도를 '${label}'으로 바로 전환했어요.`,
    );
  };

  const handleChangeCutLightingMood = (cutId: string, mood: PlotrLightingMoodId) => {
    const label = PLOTR_LIGHTING_MOOD_PRESETS[mood].labelKo;
    onUpdateDocument(
      (prev) => ({ ...prev, cuts: applyCutLightingMood(prev.cuts, cutId, mood) }),
      `조명 분위기를 '${label}' 무드로 바꿨어요.`,
    );
  };

  // Esc 키로 빈 컷 일괄 조립 즉시 중단
  useEffect(() => {
    if (!batchQueue.active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBatchQueue((prev) => cancelBatchCutQueue(prev));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [batchQueue.active]);

  const handleToggleCutSelection = (cutId: string, multi: boolean) => {
    setSelectedCutIds((prev) => {
      if (!multi) {
        return prev.length === 1 && prev[0] === cutId ? [] : [cutId];
      }
      return prev.includes(cutId)
        ? prev.filter((id) => id !== cutId)
        : [...prev, cutId];
    });
  };

  const handleRunBatchAssembly = () => {
    const queue = createBatchCutQueue(document.assets, document.cuts);
    if (!queue.active) {
      setBatchQueue(queue);
      return;
    }
    const step1 = stepBatchCutQueue(queue, document.assets, document.cuts, document.artStyle);
    let nextQueue = step1.nextQueue;
    let nextAssets = step1.nextAssets;
    let nextCuts = step1.nextCuts;
    if (nextQueue.active && queue.phase === "resolving-assets") {
      const step2 = stepBatchCutQueue(nextQueue, nextAssets, nextCuts, document.artStyle);
      nextQueue = step2.nextQueue;
      nextAssets = step2.nextAssets;
      nextCuts = step2.nextCuts;
    }
    setBatchQueue(nextQueue);
    onUpdateDocument(
      (prev) => ({ ...prev, assets: nextAssets, cuts: nextCuts }),
      nextQueue.statusMessageKo,
    );
  };

  const handleContinueBatchStep = () => {
    if (!batchQueue.active) return;
    const stepped = stepBatchCutQueue(
      batchQueue,
      document.assets,
      document.cuts,
      document.artStyle,
    );
    setBatchQueue(stepped.nextQueue);
    onUpdateDocument(
      (prev) => ({
        ...prev,
        assets: stepped.nextAssets,
        cuts: stepped.nextCuts,
      }),
      stepped.nextQueue.statusMessageKo,
    );
  };

  const handleContextPromptSubmit = () => {
    const instruction = promptInput.trim();
    if (!instruction) return;
    const seq = cutIdCounterRef.current;
    cutIdCounterRef.current += 1;

    if (promptMode.mode === "create") {
      const created: PlotrCutCard = {
        id: `plotr-cut-add-${seq}`,
        orderIndex: document.cuts.length,
        sceneTitle: `${document.cuts.length + 1}컷`,
        actionSummary: instruction,
        dialogues: [],
        cameraShot: "미디엄샷 · 아이레벨",
        cameraSide: "center",
        locationName:
          document.assets.find((a) => a.category === "location")?.name ?? "주요 무대",
        emotionBeat: "새 장면 추가",
        tensionScore: 68,
        effectLine: "none",
        sfxText: "",
        referencedAssetIds: [],
        bubblesApplied: false,
        panelBorderEnabled: document.panelBorderEnabled,
        panelBorderWidthPx: document.panelBorderWidthPx,
        renderReady: true,
        compositionBrief: `[${document.artStyle.labelKo}] ${instruction}`,
      };
      onUpdateDocument(
        (prev) => ({ ...prev, cuts: [...prev.cuts, created] }),
        `새 컷(${created.sceneTitle})을 추가했어요.`,
      );
      setSelectedCutIds([created.id]);
    } else if (promptMode.mode === "edit" && primaryCut) {
      onUpdateDocument(
        (prev) => ({
          ...prev,
          cuts: prev.cuts.map((cut) =>
            cut.id === primaryCut.id
              ? {
                  ...cut,
                  actionSummary: instruction,
                  compositionBrief: `[${prev.artStyle.labelKo}] ${instruction}`,
                }
              : cut,
          ),
        }),
        `${primaryCut.sceneTitle} 연출 지시를 바로 수정했어요.`,
      );
    } else {
      const refCuts = document.cuts.filter((c) => validSelectedIds.includes(c.id));
      const mergedAssetIds = Array.from(
        new Set(refCuts.flatMap((c) => c.referencedAssetIds)),
      );
      const composed: PlotrCutCard = {
        id: `plotr-cut-ref-${seq}`,
        orderIndex: document.cuts.length,
        sceneTitle: `${document.cuts.length + 1}컷`,
        actionSummary: `${instruction} (${refCuts.map((c) => c.sceneTitle).join(" + ")} 참조 합성)`,
        dialogues: [],
        cameraShot: "투샷 합성 구도 35mm",
        cameraSide: "center",
        locationName: refCuts[0]?.locationName ?? "주요 무대",
        emotionBeat: "참조 연결",
        tensionScore: Math.min(95, Math.max(...refCuts.map((c) => c.tensionScore)) + 5),
        effectLine: "focus",
        sfxText: "",
        referencedAssetIds: mergedAssetIds,
        bubblesApplied: false,
        panelBorderEnabled: document.panelBorderEnabled,
        panelBorderWidthPx: document.panelBorderWidthPx,
        renderReady: true,
        compositionBrief: `[${document.artStyle.labelKo} · 참조 합성] ${instruction}`,
      };
      onUpdateDocument(
        (prev) => ({ ...prev, cuts: [...prev.cuts, composed] }),
        `${refCuts.length}개 컷을 참조한 새 연결 컷을 만들었어요.`,
      );
      setSelectedCutIds([composed.id]);
    }
    setPromptInput("");
  };

  const handleStyleOnlyRestyle = () => {
    if (!primaryCut) return;
    onUpdateDocument(
      (prev) => ({
        ...prev,
        cuts: prev.cuts.map((cut) =>
          cut.id === primaryCut.id
            ? {
                ...cut,
                renderReady: true,
                compositionBrief: `[화풍만 변경 · ${prev.artStyle.labelKo}] 구도 유지 · ${cut.actionSummary}`,
              }
            : cut,
        ),
      }),
      `${primaryCut.sceneTitle}의 구도는 유지하고 '${document.artStyle.labelKo}' 그림체로 맞췄어요.`,
    );
  };

  const emptyCutCount = document.cuts.filter((c) => !c.renderReady).length;
  const activeRefCount = primaryCut?.referencedAssetIds.length ?? 0;

  return (
    <div className="space-y-4">
      <PlotrConsistencyAssetStrip
        document={document}
        primaryCut={primaryCut}
        onUpdateDocument={onUpdateDocument}
      />

      <PlotrCharacterConsistencySheet
        document={document}
        audit={characterAudit}
        onUpdateDocument={onUpdateDocument}
      />

      {/* 빈 컷 일괄 조립 · 말풍선 한꺼번에 올리기 · 컷선 */}
      <section
        aria-label="컷 일괄 작업 도구"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3"
      >
        <button
          type="button"
          data-testid="plotr-batch-assemble-btn"
          onClick={handleRunBatchAssembly}
          disabled={document.cuts.length === 0}
          title={document.cuts.length === 0 ? "먼저 대본을 컷으로 나눠 주세요" : undefined}
          className={`${BTN} border-accent bg-accent text-on-accent disabled:opacity-40`}
        >
          <Play className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">빈 컷 한꺼번에 조립 ({emptyCutCount}컷)</span>
        </button>

        {batchQueue.active ? (
          <>
            <button
              type="button"
              onClick={handleContinueBatchStep}
              className={`${BTN} border-accent/50 bg-accent-soft text-accent`}
            >
              다음 3컷 이어서 조립
            </button>
            <button
              type="button"
              onClick={() => setBatchQueue((prev) => cancelBatchCutQueue(prev))}
              className={`${BTN} border-warn/50 bg-warn/10 text-warn`}
            >
              조립 멈추기 (Esc)
            </button>
          </>
        ) : null}

        <button
          type="button"
          data-testid="plotr-batch-bubbles-btn"
          onClick={() =>
            onUpdateDocument(
              (prev) => ({ ...prev, cuts: batchToggleCutBubbles(prev.cuts, true) }),
              "모든 컷에 대사·나레이션 말풍선을 올렸어요(수정한 대사는 그대로 유지됩니다).",
            )
          }
          disabled={document.cuts.length === 0}
          title={document.cuts.length === 0 ? "먼저 컷을 만들어 주세요" : undefined}
          className={`${BTN} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          <span>말풍선 올리기</span>
        </button>

        <button
          type="button"
          data-testid="plotr-clear-bubbles-btn"
          onClick={() =>
            onUpdateDocument(
              (prev) => ({ ...prev, cuts: batchToggleCutBubbles(prev.cuts, false) }),
              "전체 말풍선을 지웠어요(수정해 둔 원본 대사와 효과선·효과음은 보존됩니다).",
            )
          }
          disabled={document.cuts.length === 0}
          title={document.cuts.length === 0 ? "지울 컷이 없어요" : undefined}
          className={`${BTN} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40`}
        >
          말풍선 지우기
        </button>

        {expertMode ? (
          <label className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={document.panelBorderEnabled}
              onChange={(e) =>
                onUpdateDocument((prev) => ({
                  ...prev,
                  panelBorderEnabled: e.target.checked,
                  cuts: applyGlobalPanelBorder(
                    prev.cuts,
                    e.target.checked,
                    prev.panelBorderWidthPx,
                  ),
                }))
              }
            />
            <span>컷선</span>
            <input
              type="range"
              min={1}
              max={8}
              value={document.panelBorderWidthPx}
              aria-label="컷선 굵기"
              onChange={(e) => {
                const widthPx = Number(e.target.value);
                onUpdateDocument((prev) => ({
                  ...prev,
                  panelBorderWidthPx: widthPx,
                  cuts: applyGlobalPanelBorder(prev.cuts, prev.panelBorderEnabled, widthPx),
                }));
              }}
              className="w-16 accent-accent"
            />
            <span className="tabular-nums">{document.panelBorderWidthPx}px</span>
          </label>
        ) : null}
      </section>

      {batchQueue.statusMessageKo ? (
        <p role="status" aria-live="polite" className="text-xs text-fg-2">
          {batchQueue.statusMessageKo}
        </p>
      ) : null}

      {reverseShotWarnings.length > 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/45 bg-warn/10 px-3 py-2.5 text-xs text-warn"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>{reverseShotWarnings[0]!.messageKo}</span>
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdateDocument(
                (prev) => ({
                  ...prev,
                  cuts: fixReverseShotAxisOnCut(prev.cuts, reverseShotWarnings[0]!.cutId),
                }),
                "180° 리버스 샷 시선 축을 반대편으로 바로잡았어요.",
              )
            }
            className={`${BTN} border-warn/50 bg-panel text-warn`}
          >
            시선 축 바로잡기
          </button>
        </div>
      ) : null}

      {/* 컷 스트립 보드 */}
      {document.cuts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center text-xs text-fg-2">
          아직 나뉜 컷이 없어요. 위에서 장르 샘플을 고르거나 대본을 넣고 ‘대본을 컷으로 나누기’를 눌러 보세요.
        </p>
      ) : (
        <ol
          aria-label="스토리보드 컷 목록"
          data-testid="plotr-cut-strip-list"
          className="grid gap-3 md:grid-cols-2"
        >
          {document.cuts.map((cut, index) => {
            const isSelected = validSelectedIds.includes(cut.id);
            return (
              <li
                key={cut.id}
                style={{ ["--plotr-index" as string]: index }}
                data-testid={`plotr-cut-card-${cut.id}`}
                data-selected={isSelected ? "true" : "false"}
                className="plotr-cut-card plotr-stagger-card flex flex-col gap-2.5 rounded-xl p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleToggleCutSelection(cut.id, e.shiftKey)}
                    className="inline-flex min-h-11 items-center gap-2 text-left text-xs font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="rounded-md border border-line bg-panel px-2 py-0.5 tabular-nums text-accent">
                      {cut.sceneTitle}
                    </span>
                    <span className="text-fg-2">{cut.cameraShot}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] tabular-nums">
                    {cut.referencedAssetIds.length > 0 ? (
                      <span
                        data-testid={`plotr-cut-ref-badge-${cut.id}`}
                        className="rounded-md border border-accent/40 bg-accent-soft px-2 py-0.5 font-semibold text-accent"
                      >
                        소재 {cut.referencedAssetIds.length} 참조
                      </span>
                    ) : null}
                    <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-fg-2">
                      {cut.renderReady ? "콘티 준비됨" : "글콘티"}
                    </span>
                  </div>
                </div>

                <PlotrVisualCutPreviewCard
                  cut={cut}
                  worldSettingNote={document.helper.worldSettingNote}
                  docMood={document.helper.mood}
                  characterProfiles={characterAudit.profiles}
                  hasReverseShotWarning={reverseShotWarningCutIds.has(cut.id)}
                  onChangeFraming={handleChangeCutFraming}
                  onChangeLightingMood={handleChangeCutLightingMood}
                />

                <p className="text-xs leading-relaxed text-fg [word-break:keep-all]">
                  {cut.actionSummary}
                </p>

                {cut.dialogues.length > 0 ? (
                  <div className="space-y-1.5">
                    {cut.dialogues.map((dlg) => (
                      <label
                        key={dlg.id}
                        className={`block rounded-lg border p-2 text-xs ${
                          cut.bubblesApplied
                            ? "border-accent/45 bg-panel"
                            : "border-dashed border-line bg-panel/60"
                        }`}
                      >
                        <span className="text-[11px] font-semibold text-fg-3">
                          {dlg.kind === "narration" ? "나레이션" : dlg.speaker || "화자"}
                          {cut.bubblesApplied ? " · 말풍선 배치됨" : " · 대사 미리보기"}
                        </span>
                        <input
                          type="text"
                          value={dlg.text}
                          data-testid={`plotr-dialogue-input-${cut.id}-${dlg.id}`}
                          onChange={(e) =>
                            onUpdateDocument((prev) => ({
                              ...prev,
                              cuts: updateCutDialoguePreservingSource(
                                prev.cuts,
                                cut.id,
                                dlg.id,
                                e.target.value,
                              ),
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-md border border-line bg-card px-2 text-xs text-fg"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                  <select
                    aria-label={`${cut.sceneTitle} 효과선`}
                    value={cut.effectLine}
                    onChange={(e) => {
                      const nextEffect = e.target.value as PlotrEffectLineKind;
                      onUpdateDocument((prev) => ({
                        ...prev,
                        cuts: prev.cuts.map((c) =>
                          c.id === cut.id ? { ...c, effectLine: nextEffect } : c,
                        ),
                      }));
                    }}
                    className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  >
                    {(Object.keys(PLOTR_EFFECT_LINE_LABELS) as PlotrEffectLineKind[]).map(
                      (kind) => (
                        <option key={kind} value={kind}>
                          {PLOTR_EFFECT_LINE_LABELS[kind]}
                        </option>
                      ),
                    )}
                  </select>

                  <select
                    aria-label={`${cut.sceneTitle} 효과음`}
                    value={PLOTR_SFX_PRESETS.includes(cut.sfxText) ? cut.sfxText : ""}
                    onChange={(e) => {
                      const nextSfx = e.target.value;
                      onUpdateDocument((prev) => ({
                        ...prev,
                        cuts: prev.cuts.map((c) =>
                          c.id === cut.id ? { ...c, sfxText: nextSfx } : c,
                        ),
                      }));
                    }}
                    className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  >
                    <option value="">효과음 없음</option>
                    {PLOTR_SFX_PRESETS.map((sfx) => (
                      <option key={sfx} value={sfx}>
                        {sfx}
                      </option>
                    ))}
                  </select>

                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      aria-label={`${cut.sceneTitle} 다중 선택 토글`}
                      aria-pressed={isSelected}
                      onClick={() => handleToggleCutSelection(cut.id, true)}
                      className={`${BTN} border-line bg-panel text-fg-2 hover:text-fg`}
                    >
                      {isSelected ? "선택됨" : "선택"}
                    </button>
                    {expertMode ? (
                      <>
                        <button
                          type="button"
                          aria-label={`${cut.sceneTitle} 위로 이동`}
                          disabled={index === 0}
                          title={index === 0 ? "첫 번째 컷이에요" : "위로 옮기기"}
                          onClick={() =>
                            onUpdateDocument((prev) => ({
                              ...prev,
                              cuts: movePlotrCut(prev.cuts, cut.id, -1),
                            }))
                          }
                          className={`${BTN} border-line bg-panel text-fg-2 disabled:opacity-40`}
                        >
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                          <span>위로</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${cut.sceneTitle} 아래로 이동`}
                          disabled={index === document.cuts.length - 1}
                          title={
                            index === document.cuts.length - 1
                              ? "마지막 컷이에요"
                              : "아래로 옮기기"
                          }
                          onClick={() =>
                            onUpdateDocument((prev) => ({
                              ...prev,
                              cuts: movePlotrCut(prev.cuts, cut.id, 1),
                            }))
                          }
                          className={`${BTN} border-line bg-panel text-fg-2 disabled:opacity-40`}
                        >
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                          <span>아래로</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateDocument(
                              (prev) => ({
                                ...prev,
                                cuts: splitPlotrCut(prev.cuts, cut.id),
                              }),
                              `${cut.sceneTitle}을 두 컷으로 나눴어요.`,
                            )
                          }
                          className={`${BTN} border-line bg-panel text-fg-2 hover:text-fg`}
                        >
                          <Scissors className="size-3.5" aria-hidden="true" />
                          <span>나누기</span>
                        </button>
                        <button
                          type="button"
                          disabled={index === document.cuts.length - 1}
                          title={
                            index === document.cuts.length - 1
                              ? "뒤에 이어진 컷이 없어요"
                              : "다음 컷과 합치기"
                          }
                          onClick={() =>
                            onUpdateDocument(
                              (prev) => ({
                                ...prev,
                                cuts: mergePlotrCutWithNext(prev.cuts, cut.id),
                              }),
                              `${cut.sceneTitle}과 다음 컷을 하나로 합쳤어요.`,
                            )
                          }
                          className={`${BTN} border-line bg-panel text-fg-2 hover:text-fg disabled:opacity-40`}
                        >
                          <Layers className="size-3.5" aria-hidden="true" />
                          <span>합치기</span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* 선택 개수 반응형 하단 액션 바 (0=생성 / 1=수정·화풍변경 / 2+=참조합성) */}
      <section
        aria-label="상황별 컷 액션 바"
        data-testid="plotr-context-action-bar"
        data-prompt-mode={promptMode.mode}
        className="space-y-2 rounded-xl border border-line bg-panel p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-fg">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            <span>{promptMode.labelKo}</span>
          </span>
          <span className="text-fg-3 tabular-nums">
            {activeRefCount > 0 ? `소재 ${activeRefCount} 참조 · ` : ""}
            그림체: {document.artStyle.labelKo}
          </span>
        </div>
        <p className="text-xs text-fg-2 [word-break:keep-all]">{promptMode.hintKo}</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="예: 비 오는 유리창 너머로 두 인물이 마주 보는 로우앵글"
            aria-label="컷 지시문 입력"
            className="min-h-11 min-w-[14rem] flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg"
          />
          <button
            type="button"
            data-testid="plotr-context-submit-btn"
            disabled={!promptInput.trim()}
            title={!promptInput.trim() ? "컷에 반영할 지시문을 입력해 주세요" : undefined}
            onClick={handleContextPromptSubmit}
            className={`${BTN} border-accent bg-accent text-on-accent disabled:opacity-40`}
          >
            {promptMode.buttonLabelKo}
          </button>
          {promptMode.mode === "edit" && primaryCut ? (
            <button
              type="button"
              data-testid="plotr-restyle-only-btn"
              onClick={handleStyleOnlyRestyle}
              className={`${BTN} border-accent/50 bg-accent-soft text-accent`}
            >
              <Palette className="size-3.5" aria-hidden="true" />
              <span>화풍만 변경</span>
            </button>
          ) : null}
        </div>
      </section>

      <PlotrTensionAndStylePanel
        document={document}
        expertMode={expertMode}
        onUpdateDocument={onUpdateDocument}
      />
    </div>
  );
}

export default PlotrCutStripAndAssetsPane;
