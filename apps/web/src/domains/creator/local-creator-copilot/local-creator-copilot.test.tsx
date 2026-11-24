// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  LOCAL_COPILOT_PRIVACY_CONTRACT,
  StudioLocalCreatorCopilotPanel,
  buildSampleLocalHabitState,
  clusterSignaturePaletteOklch,
  computeOklabDistance,
  createEmptyLocalHabitState,
  createInMemoryOpfsStorageManager,
  discoverRepeatedMacros,
  executeHabitMacro,
  exportLocalHabitsToJson,
  formatCssOklch,
  generateLocalCopilotInsights,
  importLocalHabitsFromJson,
  loadLocalHabitsSnapshotFromOpfs,
  recommendNextBrush,
  recordHabitEvent,
  recordHabitEventsBatch,
  saveLocalHabitsSnapshotToOpfs,
  setLocalHabitOptIn,
  summarizePreferredPanelLayout,
  wipeLocalHabits,
  wipeLocalHabitsSnapshotInOpfs,
  type CreatorHabitEvent,
  type StoredColorObservation,
} from "./index";

const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/local-creator-copilot");
const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const WEB_STORAGE_REGEX = /\b(localStorage|sessionStorage)\b/;
const NETWORK_API_REGEX = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/;

describe("local-creator-copilot: 온디바이스 로컬 크리에이터 습관 학습 보조 비서", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("완전 옵트인(기본 비활성)과 외부 네트워크 호출 0건 · 전송 0바이트 계약을 보장한다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const empty = createEmptyLocalHabitState();
    expect(empty.optInEnabled).toBe(false);
    expect(empty.totalRecordedEvents).toBe(0);
    expect(empty.externalBytesTransmitted).toBe(0);
    expect(LOCAL_COPILOT_PRIVACY_CONTRACT.externalBytesTransmitted).toBe(0);
    expect(LOCAL_COPILOT_PRIVACY_CONTRACT.externalNetworkCalls).toBe(0);
    expect(LOCAL_COPILOT_PRIVACY_CONTRACT.usesWebStorage).toBe(false);

    // 옵트인 비활성 상태에서는 어떤 이벤트도 기록되지 않아야 한다
    const blocked = recordHabitEvent(empty, {
      kind: "color-used",
      color: { l: 0.65, c: 0.14, h: 35 },
      usage: "base-fill",
    });
    expect(blocked.recorded).toBe(false);
    expect(blocked.ignoredReason).toBe("opt-in-disabled");
    expect(blocked.state.totalRecordedEvents).toBe(0);
    expect(blocked.externalBytesTransmitted).toBe(0);

    // 옵트인 활성화 후 정상 기록
    const optedIn = setLocalHabitOptIn(empty, true, 100);
    const recorded = recordHabitEvent(optedIn, {
      kind: "color-used",
      color: { l: 0.65, c: 0.14, h: 35 },
      usage: "base-fill",
      timestampMs: 101,
    });
    expect(recorded.recorded).toBe(true);
    expect(recorded.state.totalRecordedEvents).toBe(1);
    expect(recorded.state.colorObservations).toHaveLength(1);
    expect(recorded.externalBytesTransmitted).toBe(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OKLCH 색상 군집화는 색상환 0°/360° 경계 왜곡 없이 결정론적 5색 시그니처 팔레트와 설명 가능한 근거를 생성한다", () => {
    const observations: readonly StoredColorObservation[] = [
      // 군집 1: 0°/355° 경계 크림슨 (Oklab 직교 좌표 군집화 검증)
      { l: 0.55, c: 0.19, h: 356, weight: 2, usage: "shading" },
      { l: 0.57, c: 0.18, h: 4, weight: 2, usage: "shading" },
      { l: 0.56, c: 0.185, h: 359, weight: 2, usage: "shading" },
      // 군집 2: 딥 잉크
      { l: 0.2, c: 0.015, h: 250, weight: 2.5, usage: "lineart" },
      { l: 0.22, c: 0.018, h: 255, weight: 2.5, usage: "lineart" },
      // 군집 3: 웜 피부 밑색
      { l: 0.82, c: 0.065, h: 58, weight: 3, usage: "base-fill" },
      { l: 0.81, c: 0.07, h: 54, weight: 3, usage: "base-fill" },
      // 군집 4: 코발트 배경
      { l: 0.48, c: 0.11, h: 242, weight: 1.8, usage: "background" },
      { l: 0.46, c: 0.105, h: 238, weight: 1.8, usage: "background" },
      // 군집 5: 페이퍼 하이라이트
      { l: 0.95, c: 0.018, h: 90, weight: 1.5, usage: "highlight" },
      { l: 0.94, c: 0.02, h: 94, weight: 1.5, usage: "highlight" },
    ];

    const first = clusterSignaturePaletteOklch(observations, 5);
    const second = clusterSignaturePaletteOklch(observations, 5);
    expect(first).toEqual(second);
    expect(first.swatches).toHaveLength(5);
    expect(first.evidence.observationCount).toBe(observations.length);
    expect(first.evidence.confidence).toBeGreaterThan(0.5);
    expect(first.evidence.rationaleKo).toContain("11건");

    // 크림슨 군집의 평균 색상각은 180° 부근이 아니라 0°/360° 근처여야 한다
    const crimsonSwatch = first.swatches.find((s) => s.dominantUsage === "shading");
    expect(crimsonSwatch).toBeDefined();
    if (crimsonSwatch) {
      expect(crimsonSwatch.oklch.h <= 12 || crimsonSwatch.oklch.h >= 348).toBe(true);
      expect(crimsonSwatch.cssOklch).toBe(formatCssOklch(crimsonSwatch.oklch));
      expect(crimsonSwatch.cssOklch.startsWith("oklch(")).toBe(true);
    }

    // 5개 군집 중심은 서로 지각적으로 구별 가능해야 한다
    for (let i = 0; i < first.swatches.length; i += 1) {
      for (let j = i + 1; j < first.swatches.length; j += 1) {
        const a = first.swatches[i];
        const b = first.swatches[j];
        if (a && b) {
          expect(computeOklabDistance(a.oklch, b.oklch)).toBeGreaterThan(0.1);
        }
      }
    }
  });

  it("브러시 전이 마르코프 체인, 선호 컷 종횡비·배치 앵커, 반복 액션 매크로 마이닝과 1클릭 실행을 검증한다", () => {
    const events: readonly CreatorHabitEvent[] = [
      // 브러시 전이: pencil -> gpen (4회), pencil -> soft-ink (1회)
      { kind: "brush-selected", brushId: "pencil", brushLabelKo: "연필", brushLabelEn: "Pencil", stage: "rough" },
      { kind: "brush-selected", brushId: "gpen", brushLabelKo: "G펜", brushLabelEn: "G-Pen", stage: "ink" },
      { kind: "brush-selected", brushId: "pencil", brushLabelKo: "연필", brushLabelEn: "Pencil", stage: "rough" },
      { kind: "brush-selected", brushId: "gpen", brushLabelKo: "G펜", brushLabelEn: "G-Pen", stage: "ink" },
      { kind: "brush-selected", brushId: "pencil", brushLabelKo: "연필", brushLabelEn: "Pencil", stage: "rough" },
      { kind: "brush-selected", brushId: "gpen", brushLabelKo: "G펜", brushLabelEn: "G-Pen", stage: "ink" },
      { kind: "brush-selected", brushId: "pencil", brushLabelKo: "연필", brushLabelEn: "Pencil", stage: "rough" },
      { kind: "brush-selected", brushId: "gpen", brushLabelKo: "G펜", brushLabelEn: "G-Pen", stage: "ink" },
      { kind: "brush-selected", brushId: "pencil", brushLabelKo: "연필", brushLabelEn: "Pencil", stage: "rough" },
      { kind: "brush-selected", brushId: "soft-ink", brushLabelKo: "소프트 잉크", brushLabelEn: "Soft Ink", stage: "ink" },
      // 선호 컷: 9:16 + top-center (3회) vs 16:9 + bottom-wide (1회)
      { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center" },
      { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center" },
      { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center" },
      { kind: "panel-created", aspectRatio: "16:9", anchor: "bottom-wide" },
      // 반복 3단계 매크로 3회 + 단일 액션 연타(무시 대상)
      { kind: "studio-action", actionId: "undo", labelKo: "실행 취소", labelEn: "Undo", category: "layer" },
      { kind: "studio-action", actionId: "undo", labelKo: "실행 취소", labelEn: "Undo", category: "layer" },
      { kind: "studio-action", actionId: "undo", labelKo: "실행 취소", labelEn: "Undo", category: "layer" },
      ...Array.from({ length: 3 }, (): readonly CreatorHabitEvent[] => [
        { kind: "studio-action", actionId: "new-panel", labelKo: "새 컷", labelEn: "New Panel", category: "panel" },
        { kind: "studio-action", actionId: "add-line-layer", labelKo: "선화 레이어", labelEn: "Line Layer", category: "layer" },
        { kind: "studio-action", actionId: "clip-shadow", labelKo: "명암 클리핑", labelEn: "Clip Shadow", category: "layer" },
      ]).flat(),
    ];

    const state = recordHabitEventsBatch(setLocalHabitOptIn(createEmptyLocalHabitState(), true), events);

    // 마르코프 다음 브러시 추천 검증
    const brushRec = recommendNextBrush(state, "pencil");
    expect(brushRec).not.toBeNull();
    expect(brushRec?.isMarkovTransition).toBe(true);
    expect(brushRec?.recommendedBrush.id).toBe("gpen");
    expect(brushRec?.transitionProbability).toBe(0.8);
    expect(brushRec?.evidence.observationCount).toBe(5);
    expect(brushRec?.candidates).toHaveLength(2);
    expect(brushRec?.evidence.rationaleKo).toContain("4/5회 (80%)");

    // 전이 이력이 없는 브러시 질의 시 안전 폴백 검증
    const fallbackRec = recommendNextBrush(state, "soft-ink");
    expect(fallbackRec?.isMarkovTransition).toBe(false);
    expect(fallbackRec?.evidence.confidence).toBeLessThanOrEqual(0.48);

    // 선호 컷 비율·배치 앵커 검증
    const panelHabit = summarizePreferredPanelLayout(state);
    expect(panelHabit?.aspectRatio).toBe("9:16");
    expect(panelHabit?.anchor).toBe("top-center");
    expect(panelHabit?.pairObservationCount).toBe(3);
    expect(panelHabit?.evidence.observationCount).toBe(4);

    // 반복 매크로 마이닝 & 중복 하위 시퀀스 제거 검증
    const macros = discoverRepeatedMacros(state, 2);
    expect(macros).toHaveLength(1);
    const topMacro = macros[0];
    expect(topMacro?.steps.map((s) => s.id)).toEqual(["new-panel", "add-line-layer", "clip-shadow"]);
    expect(topMacro?.occurrences).toBe(3);
    expect(topMacro?.estimatedClicksSavedPerRun).toBe(2);
    expect(topMacro?.preferredPanelSpec?.aspectRatio).toBe("9:16");
    expect(topMacro?.preferredPanelSpec?.anchor).toBe("top-center");

    // 매크로 1클릭 실행 영수증 검증
    if (topMacro) {
      const receipt = executeHabitMacro(state, topMacro, 9999);
      expect(receipt.stepsExecuted).toHaveLength(3);
      expect(receipt.clicksSaved).toBe(2);
      expect(receipt.externalBytesTransmitted).toBe(0);
      expect(receipt.nextState.executedMacroCount).toBe(1);
    }
  });

  it("1클릭 초기화(wipeLocalHabits), JSON 내보내기/가져오기 보안 검증, OPFS 스냅샷 왕복 저장을 검증한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const seeded = buildSampleLocalHabitState();
    const insightsBefore = generateLocalCopilotInsights(seeded);
    expect(insightsBefore.signaturePalette.swatches).toHaveLength(5);
    expect(insightsBefore.nextBrush).not.toBeNull();
    expect(insightsBefore.macros.length).toBeGreaterThanOrEqual(2);

    // JSON 왕복 동등성 검증
    const exported = exportLocalHabitsToJson(seeded);
    const imported = importLocalHabitsFromJson(exported);
    expect(imported.ok).toBe(true);
    expect(imported.externalBytesTransmitted).toBe(0);
    expect(imported.state).toEqual(seeded);

    // 악성/오류 JSON 입력 방어 검증
    expect(importLocalHabitsFromJson("").errorCode).toBe("empty");
    expect(importLocalHabitsFromJson("{not-json").errorCode).toBe("invalid-json");
    expect(importLocalHabitsFromJson(JSON.stringify({ schemaVersion: 99 })).errorCode).toBe("invalid-schema");

    // 프로토타입 오염 키 차단 검증
    const pollutedJson = JSON.stringify({
      schemaVersion: 1,
      optInEnabled: true,
      panelAspectCounts: JSON.parse('{"__proto__":99,"9:16":3}'),
    });
    const sanitized = importLocalHabitsFromJson(pollutedJson);
    expect(sanitized.ok).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(sanitized.state?.panelAspectCounts ?? {}, "__proto__")).toBe(false);
    expect(sanitized.state?.panelAspectCounts["9:16"]).toBe(3);

    // OPFS 스냅샷 저장 -> 불러오기 -> 삭제 왕복 검증
    const opfs = createInMemoryOpfsStorageManager();
    const saveRes = await saveLocalHabitsSnapshotToOpfs(seeded, opfs);
    expect(saveRes.saved).toBe(true);
    expect(saveRes.backend).toBe("opfs");
    expect(saveRes.bytesWritten).toBeGreaterThan(100);
    expect(saveRes.externalBytesTransmitted).toBe(0);

    const loadRes = await loadLocalHabitsSnapshotFromOpfs(opfs);
    expect(loadRes.loaded).toBe(true);
    expect(loadRes.state).toEqual(seeded);

    const wipeOpfsRes = await wipeLocalHabitsSnapshotInOpfs(opfs);
    expect(wipeOpfsRes.wiped).toBe(true);
    expect(wipeOpfsRes.externalBytesTransmitted).toBe(0);

    const loadAfterWipe = await loadLocalHabitsSnapshotFromOpfs(opfs);
    expect(loadAfterWipe.loaded).toBe(false);

    // OPFS 미지원 환경 폴백 검증
    const noOpfsSave = await saveLocalHabitsSnapshotToOpfs(seeded, null);
    expect(noOpfsSave.saved).toBe(false);
    expect(noOpfsSave.backend).toBe("memory-only");

    // 1클릭 로컬 학습 데이터 초기화 검증
    const wiped = wipeLocalHabits({ keepOptIn: false });
    expect(wiped.optInEnabled).toBe(false);
    expect(wiped.totalRecordedEvents).toBe(0);
    expect(wiped.colorObservations).toHaveLength(0);
    expect(Object.keys(wiped.brushTransitions)).toHaveLength(0);
    expect(wiped.actionHistory).toHaveLength(0);
    expect(wiped.externalBytesTransmitted).toBe(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("StudioLocalCreatorCopilotPanel은 props 없이 단독 렌더되고 배지·추천 적용·매크로 실행·JSON 복원·초기화·EN 전환이 동작한다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onApplyPalette = vi.fn();
    const onApplyBrush = vi.fn();
    const onExecuteMacro = vi.fn();
    const onExportJson = vi.fn();

    // 1) 완전 무인자 단독 렌더 확인
    render(<StudioLocalCreatorCopilotPanel />);
    expect(screen.getByTestId("local-only-privacy-badge").textContent).toContain("로컬 전용 · 외부 전송 0바이트");
    expect(screen.getByTestId("summary-palette-count").textContent).toContain("5 / 5색");
    expect(screen.getByTestId("summary-panel-layout").textContent).toContain("9:16");
    expect(screen.getByTestId("summary-external-bytes").textContent).toContain("0바이트 · 0건");
    cleanup();

    // 2) 콜백 연동 전체 인터랙션 검증
    render(
      <StudioLocalCreatorCopilotPanel
        onApplyPalette={onApplyPalette}
        onApplyBrush={onApplyBrush}
        onExecuteMacro={onExecuteMacro}
        onExportJson={onExportJson}
      />,
    );

    // 팔레트 적용
    fireEvent.click(screen.getByTestId("apply-palette-button"));
    expect(onApplyPalette).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("apply-palette-button").textContent).toContain("시그니처 팔레트 적용됨");

    // 브러시 기준 변경 및 추천 브러시 전환
    fireEvent.click(screen.getByRole("button", { name: "러프 연필" }));
    expect(screen.getByTestId("next-brush-card").textContent).toContain("G펜 잉킹");
    fireEvent.click(screen.getByTestId("apply-brush-button"));
    expect(onApplyBrush).toHaveBeenCalledTimes(1);

    // 매크로 1클릭 실행
    const macroButtons = screen.getAllByRole("button", { name: /1클릭 실행/ });
    expect(macroButtons.length).toBeGreaterThanOrEqual(1);
    if (macroButtons[0]) fireEvent.click(macroButtons[0]);
    expect(onExecuteMacro).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("macro-execution-receipt").textContent).toContain("최근 실행:");

    // JSON 내보내기 -> 초기화 -> JSON 복원
    fireEvent.click(screen.getByTestId("copilot-export-json-button"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const exportedJson = (screen.getByTestId("copilot-json-textarea") as HTMLTextAreaElement).value;
    expect(exportedJson).toContain('"schemaVersion": 1');

    // 1클릭 초기화
    fireEvent.click(screen.getByTestId("copilot-wipe-button"));
    expect(screen.getByTestId("summary-observation-count").textContent).toContain("0건");
    expect(screen.getByTestId("signature-palette-empty")).toBeTruthy();
    expect(screen.getByTestId("next-brush-empty")).toBeTruthy();
    expect(screen.getByTestId("macro-list-empty")).toBeTruthy();

    // 옵트인 꺼진 상태에서 기록 시도 차단 확인
    fireEvent.click(screen.getByRole("button", { name: "컷 작업 1건 기록" }));
    expect(screen.getByTestId("summary-observation-count").textContent).toContain("0건");
    expect(screen.getByTestId("copilot-status-banner").textContent).toContain("옵트인이 꺼져");

    // 잘못된 JSON 오류 안내 확인 후 정상 JSON 복원
    fireEvent.change(screen.getByTestId("copilot-json-textarea"), { target: { value: "{broken" } });
    fireEvent.click(screen.getByTestId("copilot-import-json-button"));
    expect(screen.getByTestId("copilot-json-error").textContent).toContain("올바른 JSON");

    fireEvent.change(screen.getByTestId("copilot-json-textarea"), { target: { value: exportedJson } });
    fireEvent.click(screen.getByTestId("copilot-import-json-button"));
    expect(screen.getByTestId("summary-palette-count").textContent).toContain("5 / 5색");

    // EN 로케일 단독 렌더 검증
    cleanup();
    useI18n.setState({ lang: "en" });
    render(<StudioLocalCreatorCopilotPanel />);
    expect(screen.getByTestId("local-only-privacy-badge").textContent).toContain("Local Only · 0 Bytes Sent");
    expect(screen.getByRole("button", { name: "Reset Local Data" })).toBeTruthy();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Calm Atelier 토큰 위생 · 원시색상/WebStorage/외부네트워크 호출 0건 · 파일 800줄 이하 규칙을 준수한다", () => {
    const files: readonly { readonly name: string; readonly isTest?: boolean }[] = [
      { name: "local-habit-types.ts" },
      { name: "local-habit-storage.ts" },
      { name: "local-habit-learner.ts" },
      { name: "StudioLocalCreatorCopilotPanel.tsx" },
      { name: "index.ts" },
      { name: "local-creator-copilot.test.tsx", isTest: true },
    ];

    for (const file of files) {
      const source = readFileSync(resolve(MODULE_DIR, file.name), "utf8");
      const lines = source.split("\n").length;
      expect(lines, `${file.name} line count ${lines} <= 800`).toBeLessThanOrEqual(800);
      expect(RAW_COLOR_REGEX.test(source), `${file.name} must not contain raw hex/rgb/hsl`).toBe(false);
      if (!file.isTest) {
        expect(WEB_STORAGE_REGEX.test(source), `${file.name} must not use localStorage/sessionStorage`).toBe(false);
        expect(NETWORK_API_REGEX.test(source), `${file.name} must not call external network APIs`).toBe(false);
      }
    }

    const panelSource = readFileSync(resolve(MODULE_DIR, "StudioLocalCreatorCopilotPanel.tsx"), "utf8");
    expect(panelSource.includes("transition-all")).toBe(false);
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
