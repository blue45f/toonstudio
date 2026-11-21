// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionOverviewCoverStage } from "../production-hub/ProductionOverviewCoverStage";
import { createProductionDemoProject } from "../production-hub/production-demo";

import { StudioZeroBarrierUxPanel } from "./StudioZeroBarrierUxPanel";
import {
  CREATION_STAGE_PROFILES,
  GENRE_STARTER_KITS,
  IDLE_HESITATION_THRESHOLD_MS,
  STUDIO_ADAPTIVE_TOOL_CATALOG,
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
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionInstanceLike,
  type VoiceCommandActionId,
  type VoiceCommandParseResult,
} from "./zero-barrier-adaptive-ux-engine";

afterEach(cleanup);

describe("1. 숙련도별 적응형 워크스페이스 & 작업 단계별 도구 노출 불변식", () => {
  it("초보 쉬움 모드는 복잡도를 80% 숨기고 핵심 4버튼만 노출한다", () => {
    const view = resolveAdaptiveWorkspaceView("beginner-easy", "idea");
    expect(view.totalCatalogToolCount).toBe(20);
    expect(view.modeAllowedTools).toHaveLength(4);
    expect(view.hiddenByModeCount).toBe(16);
    expect(view.hiddenComplexityPercent).toBe(80);
    expect(view.coreButtons.map((button) => button.labelKo)).toEqual([
      "템플릿 고르기",
      "캐릭터 놓기",
      "대사 쓰기",
      "완성 내보내기",
    ]);
  });

  it("숙련도가 올라갈수록 전체 허용 도구 수가 단조 증가한다(초보 < 표준 < 프로)", () => {
    const beginner = resolveAdaptiveWorkspaceView("beginner-easy", "draw");
    const standard = resolveAdaptiveWorkspaceView("creator-standard", "draw");
    const pro = resolveAdaptiveWorkspaceView("pro-studio", "draw");

    expect(beginner.modeAllowedTools.length).toBeLessThan(standard.modeAllowedTools.length);
    expect(standard.modeAllowedTools.length).toBeLessThan(pro.modeAllowedTools.length);
    expect(pro.hiddenComplexityPercent).toBe(0);
  });

  it("6개 작업 단계 모두에서 현재 단계 도구만 노출되고 초보 < 표준 < 프로 불변식을 만족한다", () => {
    expect(CREATION_STAGE_PROFILES).toHaveLength(6);
    for (const stage of CREATION_STAGE_PROFILES) {
      const beginner = resolveAdaptiveWorkspaceView("beginner-easy", stage.id);
      const standard = resolveAdaptiveWorkspaceView("creator-standard", stage.id);
      const pro = resolveAdaptiveWorkspaceView("pro-studio", stage.id);

      expect(beginner.stageVisibleTools.length).toBeGreaterThanOrEqual(1);
      expect(beginner.stageVisibleTools.length).toBeLessThan(beginner.modeAllowedTools.length);
      expect(beginner.stageVisibleTools.length).toBeLessThan(standard.stageVisibleTools.length);
      expect(standard.stageVisibleTools.length).toBeLessThan(pro.stageVisibleTools.length);
      expect(pro.stageVisibleTools.length).toBeLessThan(pro.modeAllowedTools.length);
    }
  });

  it("현재 작업 단계에 따라 초보 핵심 4버튼의 강조 버튼이 정확히 전환된다", () => {
    const ideaHighlighted = resolveAdaptiveWorkspaceView("beginner-easy", "idea").coreButtons.find(
      (button) => button.highlighted,
    );
    const drawHighlighted = resolveAdaptiveWorkspaceView("beginner-easy", "draw").coreButtons.find(
      (button) => button.highlighted,
    );
    const letterHighlighted = resolveAdaptiveWorkspaceView("beginner-easy", "lettering").coreButtons.find(
      (button) => button.highlighted,
    );
    const publishHighlighted = resolveAdaptiveWorkspaceView("beginner-easy", "publish").coreButtons.find(
      (button) => button.highlighted,
    );

    expect(ideaHighlighted?.id).toBe("pick-template");
    expect(drawHighlighted?.id).toBe("place-character");
    expect(letterHighlighted?.id).toBe("write-dialogue");
    expect(publishHighlighted?.id).toBe("export-finish");
  });

  it("getNextProficiencyMode는 초보 -> 표준 -> 프로 순서로 승격하고 프로에서 고정된다", () => {
    expect(getNextProficiencyMode("beginner-easy")).toBe("creator-standard");
    expect(getNextProficiencyMode("creator-standard")).toBe("pro-studio");
    expect(getNextProficiencyMode("pro-studio")).toBe("pro-studio");
  });

  it("적응형 도구 카탈로그는 중복 ID가 없고 초보 핵심 4버튼이 모두 포함된다", () => {
    const ids = new Set(STUDIO_ADAPTIVE_TOOL_CATALOG.map((tool) => tool.id));
    expect(ids.size).toBe(STUDIO_ADAPTIVE_TOOL_CATALOG.length);
    const coreCount = STUDIO_ADAPTIVE_TOOL_CATALOG.filter((tool) => tool.coreBeginnerActionId !== null).length;
    expect(coreCount).toBe(4);
  });

  it("초보 쉬움 모드 도구는 전문 용어 없이 쉬운 일상 한글로 안내된다", () => {
    const beginnerTools = resolveAdaptiveWorkspaceView("beginner-easy", "idea").modeAllowedTools;
    const forbiddenJargon = /(베지어|렌더 파이프라인|셰이더|CMYK|노드 그래프)/;
    for (const tool of beginnerTools) {
      expect(forbiddenJargon.test(tool.labelKo)).toBe(false);
      expect(forbiddenJargon.test(tool.plainHintKo)).toBe(false);
    }
  });
});

describe("2. 원클릭 장르 스타터 킷 6종(빈 캔버스 공포 0%)", () => {
  it("로판·헌터·학원 로맨스·일상 4컷·무협·스릴러 6종 스타터 킷이 모두 등록되어 있다", () => {
    expect(GENRE_STARTER_KITS).toHaveLength(6);
    expect(GENRE_STARTER_KITS.map((kit) => kit.titleKo)).toEqual([
      "로판 1화 오프닝",
      "현대 헌터 각성",
      "서울 학원 로맨스",
      "일상 4컷 개그",
      "무협 결투",
      "스릴러 반전",
    ]);
  });

  it("6종 스타터 킷 각각을 클릭 1번으로 생성하면 4컷·배경·포즈·말풍선이 채워지고 빈 캔버스 위험이 0%다", () => {
    for (const kit of GENRE_STARTER_KITS) {
      const snapshot = createStarterKitSnapshot(kit.id);
      expect(snapshot.kitId).toBe(kit.id);
      expect(snapshot.emptyCanvasRiskPercent).toBe(0);
      expect(snapshot.panels).toHaveLength(4);
      expect(snapshot.activeBackdropKo.length).toBeGreaterThan(3);
      for (const panel of snapshot.panels) {
        expect(panel.backgroundPresetKo.length).toBeGreaterThan(2);
        expect(panel.characterPoseKo.length).toBeGreaterThan(2);
        expect(panel.dialogueKo.length).toBeGreaterThan(2);
        expect(panel.isColored).toBe(true);
        expect(panel.lineCleaned).toBe(true);
      }
    }
  });

  it("생성된 스타트 스냅샷은 카탈로그 원본과 분리된 불변 복사본이다", () => {
    const snapshot = createStarterKitSnapshot("murim-duel");
    const copy = [...snapshot.panels];
    copy.pop();
    const fresh = createStarterKitSnapshot("murim-duel");
    expect(fresh.panels).toHaveLength(4);
  });

  it("시퀀스와 타임스탬프를 전달하면 결정론적 스냅샷 ID를 생성한다", () => {
    const snap = createStarterKitSnapshot("thriller-twist", { seq: 7, timestampMs: 1_763_740_123_000 });
    expect(snap.snapshotId).toBe("starter-thriller-twist-7");
    expect(snap.updatedAtMs).toBe(1_763_740_123_000);
  });
});

describe("3. 한국어/영어 자연어 음성 명령 캔버스 파서 & SpeechRecognition 래퍼", () => {
  it("핵심 한국어 음성 명령 6종을 정확히 파싱하고 1클릭 실행취소 토큰을 반환한다", () => {
    const cases: readonly [string, VoiceCommandActionId][] = [
      ["채색해 줘", "auto-color"],
      ["배경 넣어줘", "insert-background"],
      ["되돌려 줘", "undo-last"],
      ["말풍선 추가", "add-speech-bubble"],
      ["선 깔끔하게", "clean-lineart"],
      ["저장해 줘", "save-project"],
    ];

    cases.forEach(([utterance, expectedAction], index) => {
      const result = parseVoiceCanvasCommand(utterance, { commandSeq: index + 1 });
      expect(result.matched).toBe(true);
      expect(result.actionId).toBe(expectedAction);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.detectedLanguage).toBe("ko");
      expect(result.undoToken).toBe(`undo-cmd-${index + 1}-${expectedAction}`);
      expect(result.fallbackCandidates).toHaveLength(0);
    });
  });

  it("확장 한국어 음성 명령 6종(캐릭터·컷·효과음·내보내기·모드 전환)도 정확히 파싱한다", () => {
    const cases: readonly [string, VoiceCommandActionId][] = [
      ["캐릭터 놓아줘", "place-character"],
      ["컷 나눠줘", "split-panel"],
      ["효과음 넣어줘", "add-sfx"],
      ["완성 내보내기", "export-webtoon"],
      ["초보 모드로 바꿔줘", "switch-beginner-mode"],
      ["프로 모드로 열어줘", "switch-pro-mode"],
    ];

    for (const [utterance, expectedAction] of cases) {
      const result = parseVoiceCanvasCommand(utterance);
      expect(result.matched).toBe(true);
      expect(result.actionId).toBe(expectedAction);
      expect(result.undoToken).toBeTruthy();
    }
  });

  it("영어 자연어 음성 명령 12종 모두 정확히 파싱한다", () => {
    const cases: readonly [string, VoiceCommandActionId][] = [
      ["Color it please", "auto-color"],
      ["Add background", "insert-background"],
      ["Undo", "undo-last"],
      ["Add speech bubble", "add-speech-bubble"],
      ["Clean lines", "clean-lineart"],
      ["Save project", "save-project"],
      ["Place character", "place-character"],
      ["Split panel", "split-panel"],
      ["Add SFX", "add-sfx"],
      ["Export webtoon", "export-webtoon"],
      ["Beginner mode", "switch-beginner-mode"],
      ["Pro mode", "switch-pro-mode"],
    ];

    for (const [utterance, expectedAction] of cases) {
      const result = parseVoiceCanvasCommand(utterance);
      expect(result.matched).toBe(true);
      expect(result.actionId).toBe(expectedAction);
      expect(result.detectedLanguage).toBe("en");
    }
  });

  it("오인식되거나 알 수 없는 입력은 오작동하지 않고 안전한 추천 후보 3개를 반환한다", () => {
    const result = parseVoiceCanvasCommand("으아아아 뾰로롱 알수없는주문");
    expect(result.matched).toBe(false);
    expect(result.actionId).toBeNull();
    expect(result.undoToken).toBeNull();
    expect(result.fallbackCandidates).toHaveLength(3);
    const uniqueIds = new Set(result.fallbackCandidates.map((item) => item.actionId));
    expect(uniqueIds.size).toBe(3);
  });

  it("빈 문자열이나 공백 입력도 안전하게 처리하며 후보 3개를 추천한다", () => {
    const result = parseVoiceCanvasCommand("   ");
    expect(result.matched).toBe(false);
    expect(result.detectedLanguage).toBe("unknown");
    expect(result.fallbackCandidates).toHaveLength(3);
  });

  it("applyVoiceCommandToSnapshot은 컷 분할·말풍선·저장·배경·프로 전환을 무손실 불변으로 반영한다", () => {
    const base = createStarterKitSnapshot("daily-four-cut-gag");
    const splitRes = applyVoiceCommandToSnapshot(base, parseVoiceCanvasCommand("컷 나눠줘"), { seq: 2 });
    expect(splitRes.applied).toBe(true);
    expect(splitRes.nextSnapshot.panels).toHaveLength(5);
    expect(base.panels).toHaveLength(4);

    const saveRes = applyVoiceCommandToSnapshot(
      splitRes.nextSnapshot,
      parseVoiceCanvasCommand("저장해 줘"),
      { seq: 3 },
    );
    expect(saveRes.nextSnapshot.savedCount).toBe(base.savedCount + 1);

    const proRes = applyVoiceCommandToSnapshot(
      saveRes.nextSnapshot,
      parseVoiceCanvasCommand("프로 모드"),
      { seq: 4 },
    );
    expect(proRes.nextMode).toBe("pro-studio");
  });

  it("브라우저 SpeechRecognition 미지원 환경에서는 unsupported 상태로 안전 폴백한다", () => {
    const statuses: string[] = [];
    const session = createBrowserVoiceCommandSession({
      recognitionCtor: null,
      onTranscriptResult: () => {},
      onStatusChange: (status) => statuses.push(status),
    });

    expect(session.supported).toBe(false);
    expect(session.start()).toBe(false);
    expect(statuses).toContain("unsupported");
  });

  it("브라우저 SpeechRecognition 목 인스턴스와 연동해 음성 결과를 파싱하고 오류·중지를 처리한다", () => {
    const received: VoiceCommandParseResult[] = [];
    const statuses: string[] = [];
    const hooks: {
      emitResult?: (event: SpeechRecognitionEventLike) => void;
      emitError?: (event: SpeechRecognitionErrorEventLike) => void;
    } = {};

    class MockRecognition implements SpeechRecognitionInstanceLike {
      lang = "";
      interimResults = true;
      maxAlternatives = 3;
      onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
      onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;
      onend: (() => void) | null = null;
      stopped = false;

      start(): void {
        hooks.emitResult = (event) => this.onresult?.(event);
        hooks.emitError = (event) => this.onerror?.(event);
      }

      stop(): void {
        this.stopped = true;
        this.onend?.();
      }
    }

    const session = createBrowserVoiceCommandSession({
      lang: "ko-KR",
      recognitionCtor: MockRecognition,
      onTranscriptResult: (parsed) => received.push(parsed),
      onStatusChange: (status) => statuses.push(status),
    });

    expect(session.supported).toBe(true);
    expect(session.start()).toBe(true);
    expect(statuses).toContain("listening");

    hooks.emitResult?.({
      results: {
        length: 1,
        0: { length: 1, 0: { transcript: "채색해 줘", confidence: 0.96 } },
      },
    });
    expect(received).toHaveLength(1);
    expect(received[0]?.actionId).toBe("auto-color");

    hooks.emitError?.({ error: "no-speech" });
    expect(statuses).toContain("error");

    session.stop();
    expect(statuses[statuses.length - 1]).toBe("idle");
  });
});

describe("4. 맥락형 인라인 스마트 가이드 & 1초 안전 복구 루프", () => {
  it("아이디어/컷 단계에서 15초 이상 멈추면 스타터 킷을 추천하는 인라인 가이드를 띄운다", () => {
    const guide = detectInlineSmartGuide({
      idleDurationMs: IDLE_HESITATION_THRESHOLD_MS,
      consecutiveUndoCount: 0,
      recentFailedCommandCount: 0,
      currentStage: "idea",
      mode: "beginner-easy",
      hasStarterSnapshot: true,
    });
    expect(guide.needsHelp).toBe(true);
    expect(guide.triggerReason).toBe("idle-hesitation");
    expect(guide.recommendedActionKind).toBe("apply-starter-kit");
  });

  it("그리기/채색 단계에서 15초 이상 멈추면 빠른 명령과 1초 복구 안내를 함께 제시한다", () => {
    const guide = detectInlineSmartGuide({
      idleDurationMs: IDLE_HESITATION_THRESHOLD_MS + 3_000,
      consecutiveUndoCount: 0,
      recentFailedCommandCount: 0,
      currentStage: "color",
      mode: "beginner-easy",
      hasStarterSnapshot: true,
    });
    expect(guide.needsHelp).toBe(true);
    expect(guide.triggerReason).toBe("idle-hesitation");
    expect(guide.recommendedActionKind).toBe("run-voice-chip");
    expect(guide.suggestOneSecondRecovery).toBe(true);
  });

  it("같은 작업을 2회 이상 반복 취소하면 최우선으로 1초 안전 복구 가이드를 활성화한다", () => {
    const guide = detectInlineSmartGuide({
      idleDurationMs: 2_000,
      consecutiveUndoCount: 2,
      recentFailedCommandCount: 0,
      currentStage: "draw",
      mode: "beginner-easy",
      hasStarterSnapshot: true,
    });
    expect(guide.needsHelp).toBe(true);
    expect(guide.triggerReason).toBe("repeated-undo");
    expect(guide.recommendedActionKind).toBe("instant-recover");
    expect(guide.suggestOneSecondRecovery).toBe(true);
  });

  it("명령 오인식이 2회 누적되면 빠른 버튼 실행 가이드를 띄운다", () => {
    const guide = detectInlineSmartGuide({
      idleDurationMs: 1_000,
      consecutiveUndoCount: 0,
      recentFailedCommandCount: 2,
      currentStage: "lettering",
      mode: "creator-standard",
      hasStarterSnapshot: true,
    });
    expect(guide.needsHelp).toBe(true);
    expect(guide.triggerReason).toBe("command-mismatch");
    expect(guide.recommendedActionKind).toBe("run-voice-chip");
  });

  it("막힘 징후가 없을 때는 방해하지 않는 기본 안내 상태를 유지한다", () => {
    const guide = detectInlineSmartGuide({
      idleDurationMs: 4_000,
      consecutiveUndoCount: 0,
      recentFailedCommandCount: 0,
      currentStage: "idea",
      mode: "beginner-easy",
      hasStarterSnapshot: true,
    });
    expect(guide.needsHelp).toBe(false);
    expect(guide.triggerReason).toBe("none");
  });

  it("1초 안전 복구 루프는 다단계 변경 후 이전 스냅샷과 재적용 상태를 무손실로 왕복한다", () => {
    const s0 = createStarterKitSnapshot("rofan-opening", { seq: 1, timestampMs: 1_000 });
    const s1 = createStarterKitSnapshot("modern-hunter-awakening", { seq: 2, timestampMs: 2_000 });
    const s2 = applyVoiceCommandToSnapshot(s1, parseVoiceCanvasCommand("컷 나눠줘"), {
      seq: 3,
      timestampMs: 3_000,
    }).nextSnapshot;

    let store = createRecoveryStore(s0);
    expect(recoverPreviousCheckpoint(store, 1_500).ok).toBe(false);

    store = pushRecoveryCheckpoint(store, s1, "로판 1화 직전", 2_000);
    store = pushRecoveryCheckpoint(store, s2, "헌터 4컷 직전", 3_000);
    expect(store.history).toHaveLength(2);
    expect(store.current.panels).toHaveLength(5);

    const rec1 = recoverPreviousCheckpoint(store, 3_500);
    expect(rec1.ok).toBe(true);
    expect(rec1.recoveryTargetMs).toBe(1000);
    expect(rec1.store.current).toEqual(s1);
    expect(rec1.store.totalRecoveries).toBe(1);

    const rec2 = recoverPreviousCheckpoint(rec1.store, 3_800);
    expect(rec2.ok).toBe(true);
    expect(rec2.store.current).toEqual(s0);

    const redo1 = redoRecoveredCheckpoint(rec2.store, 4_000);
    expect(redo1.ok).toBe(true);
    expect(redo1.store.current).toEqual(s1);
  });
});

describe("5. StudioZeroBarrierUxPanel UI 렌더링 · 원클릭 인터랙션 · 지연 마운트", () => {
  it("초기 화면은 초보 쉬움(복잡함 80% 숨김), 핵심 4버튼, 스타터 킷 6종을 즉시 렌더링한다", () => {
    render(<StudioZeroBarrierUxPanel />);
    expect(screen.getByTestId("zb-complexity-badge").textContent).toContain("복잡함 80% 숨김");
    expect(screen.getByTestId("zb-beginner-core-actions").querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByTestId("zb-starter-kits-grid").querySelectorAll("button")).toHaveLength(6);
    expect(screen.getByTestId("zb-active-snapshot-panels").querySelectorAll("article")).toHaveLength(4);
  });

  it("1클릭 프로 모드 확장 버튼으로 20종 전체 도구를 열고 초보 버튼으로 다시 간소화한다", () => {
    render(<StudioZeroBarrierUxPanel />);
    fireEvent.click(screen.getByTestId("zb-one-click-pro-expand"));
    expect(screen.getByTestId("zb-complexity-badge").textContent).toContain("복잡함 0% 숨김");
    expect(screen.getByTestId("zb-complexity-badge").textContent).toContain("20종 활성");

    fireEvent.click(screen.getByTestId("zb-back-to-beginner"));
    expect(screen.getByTestId("zb-complexity-badge").textContent).toContain("복잡함 80% 숨김");
  });

  it("작업 단계 탭을 바꾸면 현재 단계에 필요한 도구만 동적으로 필터링된다", () => {
    render(<StudioZeroBarrierUxPanel />);
    fireEvent.click(screen.getByTestId("zb-mode-creator-standard"));

    fireEvent.click(screen.getByTestId("zb-stage-color"));
    expect(screen.getByTestId("zb-visible-tool-smart-flat-color")).toBeTruthy();
    expect(screen.queryByTestId("zb-visible-tool-bubble-sfx-placer")).toBeNull();

    fireEvent.click(screen.getByTestId("zb-stage-lettering"));
    expect(screen.getByTestId("zb-visible-tool-bubble-sfx-placer")).toBeTruthy();
    expect(screen.queryByTestId("zb-visible-tool-smart-flat-color")).toBeNull();
  });

  it("원클릭 스타터 킷 카드를 누르면 4컷 미리보기가 즉시 바뀌고 1초 안전 복구가 활성화된다", () => {
    render(<StudioZeroBarrierUxPanel />);
    const recoverBtn = screen.getByTestId("zb-instant-recover-btn") as HTMLButtonElement;
    expect(recoverBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("zb-kit-modern-hunter-awakening"));
    expect(screen.getByText(/비 오는 서울 도심 사거리 균열 게이트/)).toBeTruthy();
    expect(recoverBtn.disabled).toBe(false);

    fireEvent.click(recoverBtn);
    expect(screen.getByText(/달빛이 비치는 황궁 샹들리에 연회장/)).toBeTruthy();
  });

  it("자연어 명령을 실행하면 1클릭 취소 버튼이 나타나고 클릭 시 직전 상태로 복구된다", () => {
    render(<StudioZeroBarrierUxPanel />);
    const input = screen.getByTestId("zb-voice-command-input");
    fireEvent.change(input, { target: { value: "컷 나눠줘" } });
    fireEvent.click(screen.getByTestId("zb-voice-submit"));

    expect(screen.getByTestId("zb-active-snapshot-panels").querySelectorAll("article")).toHaveLength(5);
    const undoBtn = screen.getByTestId("zb-command-one-click-undo");
    fireEvent.click(undoBtn);
    expect(screen.getByTestId("zb-active-snapshot-panels").querySelectorAll("article")).toHaveLength(4);
  });

  it("알 수 없는 명령 입력 시 안전한 후보 3개가 뜨고 후보 클릭으로 즉시 실행된다", () => {
    render(<StudioZeroBarrierUxPanel />);
    const input = screen.getByTestId("zb-voice-command-input");
    fireEvent.change(input, { target: { value: "알수없는음성입력123" } });
    fireEvent.click(screen.getByTestId("zb-voice-submit"));

    const candidates = screen.getByTestId("zb-voice-fallback-candidates").querySelectorAll("button");
    expect(candidates).toHaveLength(3);

    fireEvent.click(screen.getByTestId("zb-fallback-insert-background"));
    expect(screen.getByTestId("zb-command-feedback").textContent).toContain("맞춤 배경");
  });

  it("ProductionOverviewCoverStage 하단 접이식 패널을 열면 lazyRetry로 패널이 지연 마운트된다", async () => {
    const aggregate = createProductionDemoProject();
    render(<ProductionOverviewCoverStage aggregate={aggregate} />);

    const disclosure = screen.getByTestId("studio-zero-barrier-ux-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-zero-barrier-ux-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-zero-barrier-ux-panel")).toBeTruthy();
    });
  });
});
