import "./zero-barrier-ux.css";

import {
  CheckCircle2,
  Compass,
  Layers,
  Mic,
  MicOff,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  CREATION_STAGE_PROFILES,
  GENRE_STARTER_KITS,
  IDLE_HESITATION_THRESHOLD_MS,
  PROFICIENCY_MODE_PROFILES,
  QUICK_VOICE_COMMAND_PRESETS,
  REPEATED_UNDO_THRESHOLD,
  STUDIO_ADAPTIVE_TOOL_CATALOG,
  VOICE_COMMAND_RULES,
  applyVoiceCommandToSnapshot,
  createBrowserVoiceCommandSession,
  createRecoveryStore,
  createStarterKitSnapshot,
  detectInlineSmartGuide,
  getNextProficiencyMode,
  parseVoiceCanvasCommand,
  pushRecoveryCheckpoint,
  recoverPreviousCheckpoint,
  redoRecoveredCheckpoint,
  resolveAdaptiveWorkspaceView,
  resolveBrowserSpeechRecognitionCtor,
  type BeginnerCoreActionId,
  type BrowserVoiceSessionHandle,
  type CreationStageId,
  type GenreStarterKitId,
  type RecoveryCheckpointStore,
  type VoiceCommandParseResult,
  type WorkspaceProficiencyMode,
} from "./zero-barrier-adaptive-ux-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const INITIAL_TIMESTAMP_MS = 1_763_740_000_000;

/**
 * 진입장벽 제로(Zero-Barrier) 초직관 적응형 워크스페이스 패널.
 *
 * - 초보 쉬움(핵심 4버튼 · 복잡함 80% 숨김) ↔ 표준 창작 ↔ 프로 스튜디오 1클릭 전환
 * - 작업 단계별 적응형 도구 필터(아이디어 → 컷 나누기 → 그리기 → 채색 → 대사·식자 → 완성 내보내기)
 * - 원클릭 장르 스타터 킷 6종(빈 캔버스 공포 0%)
 * - 한국어/영어 자연어 음성·텍스트 명령 실행 및 1클릭 실행취소 · 안전 후보 3개 추천
 * - 15초 멈춤·반복 취소 감지 인라인 스마트 가이드 및 1초 안전 복구 루프
 */
export function StudioZeroBarrierUxPanel() {
  const bt = useBilingual("StudioZeroBarrierUxPanel");
  const voiceInputId = useId();

  const [mode, setMode] = useState<WorkspaceProficiencyMode>("beginner-easy");
  const [stage, setStage] = useState<CreationStageId>("idea");
  const [recoveryStore, setRecoveryStore] = useState<RecoveryCheckpointStore>(() =>
    createRecoveryStore(
      createStarterKitSnapshot("rofan-opening", { seq: 1, timestampMs: INITIAL_TIMESTAMP_MS }),
    ),
  );
  const [commandInput, setCommandInput] = useState("");
  const [lastParseResult, setLastParseResult] = useState<VoiceCommandParseResult | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>(
    "로판 1화 스타터 킷 4컷이 준비돼 있어요. 핵심 4버튼이나 빠른 명령을 눌러 바로 이어서 만들어 보세요.",
  );
  const [voiceListening, setVoiceListening] = useState(false);
  const [idleDurationMs, setIdleDurationMs] = useState(0);
  const [consecutiveUndoCount, setConsecutiveUndoCount] = useState(0);
  const [failedCommandCount, setFailedCommandCount] = useState(0);

  const stepSeqRef = useRef(2);
  const voiceSessionRef = useRef<BrowserVoiceSessionHandle | null>(null);
  const speechSupported = useMemo(() => resolveBrowserSpeechRecognitionCtor() !== null, []);

  const adaptiveView = useMemo(() => resolveAdaptiveWorkspaceView(mode, stage), [mode, stage]);
  const activeStageProfile = useMemo(
    () => CREATION_STAGE_PROFILES.find((item) => item.id === stage) ?? CREATION_STAGE_PROFILES[0],
    [stage],
  );
  const hasStarterSnapshot = recoveryStore.current.panels.length > 0;
  const smartGuide = useMemo(
    () =>
      detectInlineSmartGuide({
        idleDurationMs,
        consecutiveUndoCount,
        recentFailedCommandCount: failedCommandCount,
        currentStage: stage,
        mode,
        hasStarterSnapshot,
      }),
    [idleDurationMs, consecutiveUndoCount, failedCommandCount, stage, mode, hasStarterSnapshot],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIdleDurationMs((prev) =>
        prev >= IDLE_HESITATION_THRESHOLD_MS ? prev : prev + 5_000,
      );
    }, 5_000);
    return () => {
      window.clearInterval(timer);
      voiceSessionRef.current?.stop();
    };
  }, []);

  const nextClock = (): { readonly seq: number; readonly timestampMs: number } => {
    const seq = stepSeqRef.current;
    stepSeqRef.current += 1;
    return { seq, timestampMs: INITIAL_TIMESTAMP_MS + seq * 1_000 };
  };

  const resetHesitation = () => {
    setIdleDurationMs(0);
  };

  const handleSelectMode = (nextMode: WorkspaceProficiencyMode) => {
    resetHesitation();
    setConsecutiveUndoCount(0);
    setMode(nextMode);
    const profile = PROFICIENCY_MODE_PROFILES.find((item) => item.id === nextMode);
    setStatusBanner(
      profile
        ? `'${profile.labelKo}' 화면으로 바꿨어요. ${profile.summaryKo}`
        : "작업 화면 모드를 바꿨어요.",
    );
  };

  const handleSelectStage = (nextStage: CreationStageId) => {
    resetHesitation();
    setStage(nextStage);
  };

  const handleLoadStarterKit = (kitId: GenreStarterKitId) => {
    resetHesitation();
    setConsecutiveUndoCount(0);
    setFailedCommandCount(0);
    const { seq, timestampMs } = nextClock();
    const nextSnapshot = createStarterKitSnapshot(kitId, { seq, timestampMs });
    setRecoveryStore((prev) =>
      pushRecoveryCheckpoint(prev, nextSnapshot, `${prev.current.titleKo} 작업 직전`, timestampMs),
    );
    setLastParseResult(null);
    setStatusBanner(nextSnapshot.lastChangeSummaryKo);
  };

  const handleInstantRecover = (reasonLabel?: string) => {
    resetHesitation();
    const { timestampMs } = nextClock();
    setRecoveryStore((prev) => {
      const outcome = recoverPreviousCheckpoint(prev, timestampMs);
      if (!outcome.ok) {
        setStatusBanner("되돌릴 이전 기록이 아직 없어요. 스타터 킷이나 명령을 먼저 실행해 보세요.");
        return prev;
      }
      setConsecutiveUndoCount((count) => count + 1);
      setStatusBanner(
        reasonLabel
          ? `${reasonLabel} — 1초 만에 '${outcome.restoredLabelKo ?? "이전 상태"}'로 안전 복구했어요.`
          : `1초 만에 '${outcome.restoredLabelKo ?? "방금 전 상태"}'로 안전 복구했어요.`,
      );
      return outcome.store;
    });
  };

  const handleRedo = () => {
    resetHesitation();
    setConsecutiveUndoCount(0);
    const { timestampMs } = nextClock();
    setRecoveryStore((prev) => {
      const outcome = redoRecoveredCheckpoint(prev, timestampMs);
      if (!outcome.ok) return prev;
      setStatusBanner(`방금 복구했던 작업('${outcome.restoredLabelKo ?? "최근 상태"}')을 다시 적용했어요.`);
      return outcome.store;
    });
  };

  const executeParsedCommand = (parsed: VoiceCommandParseResult) => {
    resetHesitation();
    setLastParseResult(parsed);

    if (!parsed.matched || !parsed.actionId) {
      setFailedCommandCount((count) => count + 1);
      setStatusBanner(parsed.messageKo);
      return;
    }

    setFailedCommandCount(0);
    if (parsed.actionId === "undo-last") {
      handleInstantRecover("음성 명령으로 되돌리기 실행");
      return;
    }

    const { seq, timestampMs } = nextClock();
    setConsecutiveUndoCount(0);
    setRecoveryStore((prev) => {
      const applied = applyVoiceCommandToSnapshot(prev.current, parsed, { seq, timestampMs });
      if (applied.nextMode) {
        setMode(applied.nextMode);
      }
      setStatusBanner(applied.summaryKo);
      return pushRecoveryCheckpoint(
        prev,
        applied.nextSnapshot,
        `${parsed.actionLabelKo ?? "작업"} 실행 직전`,
        timestampMs,
      );
    });
  };

  const runTextCommand = (rawText: string) => {
    const { seq } = nextClock();
    const parsed = parseVoiceCanvasCommand(rawText, { commandSeq: seq });
    executeParsedCommand(parsed);
  };

  const handleCoreButtonClick = (actionId: BeginnerCoreActionId) => {
    switch (actionId) {
      case "pick-template":
        setStage("panel");
        handleLoadStarterKit("seoul-campus-romance");
        break;
      case "place-character":
        setStage("draw");
        runTextCommand("캐릭터 놓아줘");
        break;
      case "write-dialogue":
        setStage("lettering");
        runTextCommand("말풍선 추가");
        break;
      case "export-finish":
        setStage("publish");
        runTextCommand("완성 내보내기");
        break;
    }
  };

  const handleToggleMicrophone = () => {
    resetHesitation();
    if (voiceListening) {
      voiceSessionRef.current?.stop();
      setVoiceListening(false);
      return;
    }
    const session = createBrowserVoiceCommandSession({
      lang: "ko-KR",
      onTranscriptResult: (parsed) => {
        setCommandInput(parsed.rawInput);
        executeParsedCommand(parsed);
      },
      onStatusChange: (status, messageKo) => {
        setVoiceListening(status === "listening");
        setStatusBanner(messageKo);
      },
    });
    voiceSessionRef.current = session;
    session.start();
  };

  const handleSmartGuideAction = () => {
    switch (smartGuide.recommendedActionKind) {
      case "apply-starter-kit":
        handleLoadStarterKit("rofan-opening");
        break;
      case "instant-recover":
        handleInstantRecover("스마트 가이드 추천 복구");
        break;
      case "run-voice-chip":
        runTextCommand("채색해 줘");
        break;
      case "promote-mode":
        handleSelectMode(mode === "beginner-easy" ? "pro-studio" : "beginner-easy");
        break;
    }
  };

  const currentSnapshot = recoveryStore.current;
  const nextStepMode = getNextProficiencyMode(mode);

  return (
    <section
      className="zb-ux-shell"
      data-testid="studio-zero-barrier-ux-panel"
      aria-label={bt("진입장벽 제로 적응형 워크스페이스", "Zero-barrier adaptive workspace")}
    >
      <div className="zb-ux-body">
        <header className="zb-ux-header">
          <div>
            <span className="zb-ux-kicker">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {bt("처음 열어도 1분 만에 첫 4컷 완성", "Finish your first 4 panels in 1 minute")}
            </span>
            <h2 className="zb-ux-title">
              {bt("진입장벽 제로 초직관 워크스페이스", "Zero-Barrier Adaptive Workspace")}
            </h2>
            <p className="zb-ux-subtitle">
              {bt(
                "초보 때는 핵심 4버튼만 보여 드리고, 손에 익으면 클릭 한 번으로 프로 스튜디오 전체 도구를 펼쳐요.",
                "Start with 4 essential buttons and expand to full Pro Studio in one click.",
              )}
            </p>
          </div>
          <div className="zb-ux-actions-row">
            {mode !== "pro-studio" ? (
              <button
                type="button"
                className="zb-ux-btn"
                data-tone="primary"
                data-testid="zb-one-click-pro-expand"
                onClick={() => handleSelectMode("pro-studio")}
              >
                <Layers className="size-4" aria-hidden="true" />
                {bt("1클릭 프로 모드 확장", "1-Click Pro Mode")}
              </button>
            ) : (
              <button
                type="button"
                className="zb-ux-btn"
                data-tone="good"
                data-testid="zb-back-to-beginner"
                onClick={() => handleSelectMode("beginner-easy")}
              >
                <Compass className="size-4" aria-hidden="true" />
                {bt("초보 4버튼 화면으로", "Back to Easy 4 Buttons")}
              </button>
            )}
          </div>
        </header>

        {/* 1. 숙련도 3단 스위처 + 핵심 4버튼 + 작업 단계별 적응형 도구 필터 */}
        <section className="zb-ux-section" aria-labelledby="zb-mode-heading">
          <div className="zb-ux-section-head">
            <h3 id="zb-mode-heading" className="zb-ux-section-title">
              <Compass className="size-4" aria-hidden="true" />
              {bt("1. 내 손에 맞는 화면 단계 고르기", "1. Pick your comfort level")}
            </h3>
            <span className="zb-ux-badge zb-ux-num" data-tone="good" data-testid="zb-complexity-badge">
              {bt(
                `복잡함 ${adaptiveView.hiddenComplexityPercent}% 숨김 · 전체 ${STUDIO_ADAPTIVE_TOOL_CATALOG.length}종 중 ${adaptiveView.modeAllowedTools.length}종 활성`,
                `${adaptiveView.hiddenComplexityPercent}% simpler · ${adaptiveView.modeAllowedTools.length}/${STUDIO_ADAPTIVE_TOOL_CATALOG.length} tools active`,
              )}
            </span>
          </div>

          <div className="zb-ux-mode-grid" role="group" aria-label={bt("숙련도 모드 선택", "Proficiency mode")}>
            {PROFICIENCY_MODE_PROFILES.map((profile) => {
              const selected = profile.id === mode;
              return (
                <button
                  key={profile.id}
                  type="button"
                  className="zb-ux-mode-btn"
                  aria-pressed={selected}
                  data-testid={`zb-mode-${profile.id}`}
                  onClick={() => handleSelectMode(profile.id)}
                >
                  <span>
                    {bt(profile.labelKo, profile.labelEn)} · {bt(profile.badgeKo, profile.badgeEn)}
                  </span>
                  <span className="zb-ux-mode-meta">{bt(profile.summaryKo, profile.summaryEn)}</span>
                </button>
              );
            })}
          </div>

          <div className="zb-ux-core-grid" data-testid="zb-beginner-core-actions">
            {adaptiveView.coreButtons.map((button) => (
              <button
                key={button.id}
                type="button"
                className="zb-ux-core-btn"
                data-highlighted={button.highlighted ? "true" : "false"}
                data-testid={`zb-core-btn-${button.id}`}
                onClick={() => handleCoreButtonClick(button.id)}
              >
                <span>{bt(button.labelKo, button.labelEn)}</span>
                <span className="zb-ux-mode-meta">{bt(button.hintKo, button.hintEn)}</span>
              </button>
            ))}
          </div>

          <div className="zb-ux-section-head">
            <span className="zb-ux-mode-meta">
              {bt(
                `지금 단계(${activeStageProfile?.labelKo ?? "아이디어"}): ${activeStageProfile?.goalKo ?? ""}`,
                `Current step (${activeStageProfile?.labelEn ?? "Idea"}): ${activeStageProfile?.goalEn ?? ""}`,
              )}
            </span>
            {mode !== "pro-studio" ? (
              <button
                type="button"
                className="zb-ux-chip"
                data-testid="zb-next-mode-step"
                onClick={() => handleSelectMode(nextStepMode)}
              >
                {bt(
                  nextStepMode === "creator-standard" ? "다음 단계: 표준 창작 열기" : "다음 단계: 프로 스튜디오 열기",
                  nextStepMode === "creator-standard" ? "Next: Creator Standard" : "Next: Pro Studio",
                )}
              </button>
            ) : null}
          </div>

          <div className="zb-ux-stage-bar" role="tablist" aria-label={bt("작업 단계별 도구 필터", "Creation stages")}>
            {CREATION_STAGE_PROFILES.map((stageItem) => (
              <button
                key={stageItem.id}
                type="button"
                role="tab"
                className="zb-ux-stage-btn"
                aria-selected={stage === stageItem.id}
                data-testid={`zb-stage-${stageItem.id}`}
                onClick={() => handleSelectStage(stageItem.id)}
              >
                <span className="zb-ux-num">{stageItem.order}.</span> {bt(stageItem.labelKo, stageItem.labelEn)}
              </button>
            ))}
          </div>

          <div className="zb-ux-tools-grid" data-testid="zb-stage-tools-list">
            {adaptiveView.stageVisibleTools.map((tool) => (
              <div key={tool.id} className="zb-ux-tool-card" data-testid={`zb-visible-tool-${tool.id}`}>
                <p className="zb-ux-tool-name">{bt(tool.labelKo, tool.labelEn)}</p>
                <p className="zb-ux-tool-hint">{bt(tool.plainHintKo, tool.plainHintEn)}</p>
              </div>
            ))}
          </div>
          <p className="zb-ux-mode-meta zb-ux-num" data-testid="zb-stage-filter-summary">
            {bt(
              `지금 단계에 꼭 필요한 ${adaptiveView.stageVisibleTools.length}개만 보여 드려요 (다른 단계 도구 ${adaptiveView.hiddenByStageCount}개 자동 숨김).`,
              `Showing ${adaptiveView.stageVisibleTools.length} tools for this stage (${adaptiveView.hiddenByStageCount} other-stage tools tucked away).`,
            )}
          </p>
        </section>

        {/* 2. 원클릭 장르 스타터 킷 6종 */}
        <section className="zb-ux-section" aria-labelledby="zb-kits-heading">
          <div className="zb-ux-section-head">
            <h3 id="zb-kits-heading" className="zb-ux-section-title">
              <Wand2 className="size-4" aria-hidden="true" />
              {bt("2. 원클릭 장르 스타터 킷 6종 (빈 화면 고민 0%)", "2. 6 One-Click Genre Starter Kits")}
            </h3>
            <span className="zb-ux-badge zb-ux-num" data-tone="good">
              {bt(
                `현재 적용: ${currentSnapshot.titleKo} · ${currentSnapshot.panels.length}컷 준비됨`,
                `Active: ${currentSnapshot.titleEn} · ${currentSnapshot.panels.length} panels ready`,
              )}
            </span>
          </div>

          <div className="zb-ux-kits-grid" data-testid="zb-starter-kits-grid">
            {GENRE_STARTER_KITS.map((kit) => {
              const active = currentSnapshot.kitId === kit.id;
              return (
                <button
                  key={kit.id}
                  type="button"
                  className="zb-ux-kit-btn"
                  data-tone={kit.toneVariant}
                  aria-pressed={active}
                  data-testid={`zb-kit-${kit.id}`}
                  onClick={() => handleLoadStarterKit(kit.id)}
                >
                  <span>{bt(kit.titleKo, kit.titleEn)}</span>
                  <span className="zb-ux-mode-meta">{bt(kit.taglineKo, kit.taglineEn)}</span>
                  <span className="zb-ux-mode-meta">{kit.moodPaletteKo}</span>
                </button>
              );
            })}
          </div>

          <div className="zb-ux-preview-grid" data-testid="zb-active-snapshot-panels">
            {currentSnapshot.panels.map((panel) => (
              <article key={panel.panelIndex} className="zb-ux-panel-card">
                <div className="zb-ux-section-head">
                  <strong className="zb-ux-tool-name zb-ux-num">
                    {bt(`${panel.panelIndex}컷 · ${panel.framingKo}`, `Panel ${panel.panelIndex} · ${panel.framingEn}`)}
                  </strong>
                  <span className="zb-ux-mode-meta">
                    {panel.isColored ? bt("채색됨", "Colored") : bt("밑그림", "Sketch")}
                    {" · "}
                    {panel.lineCleaned ? bt("선 보정", "Clean line") : bt("원본 선", "Raw line")}
                  </span>
                </div>
                <p className="zb-ux-tool-hint">
                  {bt("배경", "Backdrop")}: {panel.backgroundPresetKo}
                </p>
                <p className="zb-ux-tool-hint">
                  {bt("포즈", "Pose")}: {panel.characterPoseKo}
                </p>
                <p className="zb-ux-dialogue">
                  “{panel.dialogueKo}”{panel.sfxKo ? ` [${panel.sfxKo}]` : ""}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 3. 한국어/영어 자연어 음성·텍스트 명령 바 */}
        <section className="zb-ux-section" aria-labelledby="zb-voice-heading">
          <div className="zb-ux-section-head">
            <h3 id="zb-voice-heading" className="zb-ux-section-title">
              <Mic className="size-4" aria-hidden="true" />
              {bt("3. 말하듯 바로 실행하는 음성·자연어 명령", "3. Natural Korean/English Voice Commands")}
            </h3>
            <span className="zb-ux-badge zb-ux-num">
              {bt(
                `한·영 ${VOICE_COMMAND_RULES.length}종 지원 · ${speechSupported ? "마이크 사용 가능" : "오프라인 입력 지원"}`,
                `${VOICE_COMMAND_RULES.length} KO/EN commands · ${speechSupported ? "Mic ready" : "Offline text ready"}`,
              )}
            </span>
          </div>

          <form
            className="zb-ux-voice-row"
            onSubmit={(event) => {
              event.preventDefault();
              runTextCommand(commandInput);
            }}
          >
            <label htmlFor={voiceInputId} className="sr-only">
              {bt("캔버스 음성 또는 텍스트 명령 입력", "Enter voice or text canvas command")}
            </label>
            <input
              id={voiceInputId}
              type="text"
              className="zb-ux-input"
              data-testid="zb-voice-command-input"
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder={bt(
                "예: 채색해 줘 · 배경 넣어줘 · 말풍선 추가 · 선 깔끔하게 · Color it",
                "e.g. Color it · Add background · Add speech bubble · Clean lines",
              )}
            />
            <button type="submit" className="zb-ux-btn" data-tone="primary" data-testid="zb-voice-submit">
              {bt("명령 실행", "Run")}
            </button>
            <button
              type="button"
              className="zb-ux-btn"
              aria-pressed={voiceListening}
              data-testid="zb-voice-mic-toggle"
              onClick={handleToggleMicrophone}
            >
              {voiceListening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
              {voiceListening ? bt("듣기 멈춤", "Stop mic") : bt("음성 듣기", "Voice mic")}
            </button>
          </form>

          <div className="zb-ux-chip-list" aria-label={bt("빠른 명령 버튼", "Quick command chips")}>
            {QUICK_VOICE_COMMAND_PRESETS.map((preset) => (
              <button
                key={preset.actionId}
                type="button"
                className="zb-ux-chip"
                data-testid={`zb-quick-cmd-${preset.actionId}`}
                onClick={() => {
                  setCommandInput(preset.commandKo);
                  runTextCommand(preset.commandKo);
                }}
              >
                {bt(preset.commandKo, preset.commandEn)}
              </button>
            ))}
          </div>

          <div
            role="status"
            aria-live="polite"
            className="zb-ux-feedback"
            data-tone={lastParseResult && !lastParseResult.matched ? "warn" : "info"}
            data-testid="zb-command-feedback"
          >
            <span>
              <CheckCircle2 className="mr-1.5 inline size-4 align-text-bottom" aria-hidden="true" />
              {statusBanner}
            </span>
            {lastParseResult?.matched && lastParseResult.undoToken ? (
              <button
                type="button"
                className="zb-ux-btn"
                data-tone="warn"
                data-testid="zb-command-one-click-undo"
                onClick={() => handleInstantRecover(`방금 명령(${lastParseResult.actionLabelKo ?? ""}) 취소`)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {bt("방금 명령 1클릭 취소", "1-Click Undo")}
              </button>
            ) : null}
          </div>

          {lastParseResult && !lastParseResult.matched ? (
            <div className="zb-ux-chip-list" data-testid="zb-voice-fallback-candidates">
              {lastParseResult.fallbackCandidates.map((candidate) => (
                <button
                  key={candidate.actionId}
                  type="button"
                  className="zb-ux-btn"
                  data-tone="good"
                  data-testid={`zb-fallback-${candidate.actionId}`}
                  onClick={() => {
                    setCommandInput(candidate.exampleKo);
                    runTextCommand(candidate.exampleKo);
                  }}
                >
                  {bt(`추천: ${candidate.labelKo} ("${candidate.exampleKo}")`, `Try: ${candidate.labelEn}`)}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {/* 4. 맥락형 인라인 스마트 가이드 & 1초 안전 복구 루프 */}
        <section className="zb-ux-section" aria-labelledby="zb-recovery-heading">
          <div className="zb-ux-section-head">
            <h3 id="zb-recovery-heading" className="zb-ux-section-title">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {bt("4. 막힘 감지 가이드 & 1초 안전 복구", "4. Smart Inline Guide & 1s Safe Recovery")}
            </h3>
            <span className="zb-ux-badge zb-ux-num" data-tone={smartGuide.needsHelp ? "warn" : "good"}>
              {bt(
                `복구 지점 ${recoveryStore.history.length}개 · 저장 ${currentSnapshot.savedCount}회 · 반복취소 기준 ${REPEATED_UNDO_THRESHOLD}회`,
                `${recoveryStore.history.length} checkpoints · ${currentSnapshot.savedCount} saves`,
              )}
            </span>
          </div>

          <div
            className="zb-ux-guide-card"
            data-alert={smartGuide.needsHelp ? "true" : "false"}
            data-testid="zb-inline-smart-guide"
          >
            <p className="zb-ux-tool-name">{bt(smartGuide.headlineKo, smartGuide.headlineEn)}</p>
            <div className="zb-ux-actions-row">
              <button
                type="button"
                className="zb-ux-btn"
                data-tone="good"
                data-testid="zb-instant-recover-btn"
                disabled={recoveryStore.history.length === 0}
                onClick={() => handleInstantRecover()}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {bt("1초 만에 방금 전으로 안전 복구", "Restore last state in 1s")}
              </button>
              <button
                type="button"
                className="zb-ux-btn"
                data-testid="zb-redo-btn"
                disabled={recoveryStore.redoStack.length === 0}
                onClick={handleRedo}
              >
                <RotateCw className="size-4" aria-hidden="true" />
                {bt("복구 다시 앞으로", "Redo")}
              </button>
              <button
                type="button"
                className="zb-ux-btn"
                data-tone="primary"
                data-testid="zb-guide-recommended-action"
                onClick={handleSmartGuideAction}
              >
                {bt(smartGuide.recommendedActionLabelKo, smartGuide.recommendedActionLabelEn)}
              </button>
              <button
                type="button"
                className="zb-ux-chip"
                data-testid="zb-simulate-hesitation"
                onClick={() => setIdleDurationMs(IDLE_HESITATION_THRESHOLD_MS)}
              >
                {bt("15초 멈춤 도움말 미리 보기", "Preview 15s pause hint")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
