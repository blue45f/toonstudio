// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BATON_STAGE_IDS,
  BATON_STAGE_SPECS,
  EXTERNAL_BRIDGE_IDS,
  EXTERNAL_BRIDGE_SPECS,
  REVIEW_PIN_STATUSES,
  REVIEW_STAMP_IDS,
  REVIEW_STAMP_SPECS,
  SAMPLE_REVIEW_CUTS,
  StudioVisualPinReviewPanel,
  VISUAL_PIN_BRIDGE_SCHEMA_VERSION,
  addVisualReviewPin,
  advanceBatonStage,
  buildExternalBridgeManifest,
  buildVisualReviewDigestMarkdown,
  clampPercent,
  createInitialVisualPinReviewState,
  cyclePinStatus,
  cycleReviewPinStatus,
  evaluateStageGateReadiness,
  getExternalBridgeSpec,
  getReviewStampSpec,
  moveReviewPin,
  normalizeSingleLineComment,
  removeReviewPin,
  resolveAllPinsForCut,
  rewindBatonStage,
  selectActiveReviewCut,
  setBeforeAfterSplitPct,
  summarizeBridgeFidelity,
  summarizeReviewPins,
  togglePinResolvedStatus,
  toggleReviewPinResolved,
  updateReviewPinComment,
  updateReviewPinStage,
  updateReviewPinStatus,
} from "./index";

afterEach(cleanup);

describe("1. 6종 원클릭 시각 검수 도장 & 컷 좌표 번호 핀 불변 상태 관리", () => {
  it("6종 도장 · 3종 핀 상태 · 6단계 바통 공정 · 5대 외부 브리지 상수가 모두 정의되어 있다", () => {
    expect(REVIEW_STAMP_IDS).toEqual([
      "expression-fix", "hand-anatomy", "balloon-pos", "bg-perspective", "tone-missing", "approved-stamp",
    ]);
    expect(REVIEW_STAMP_SPECS).toHaveLength(6);
    expect(REVIEW_PIN_STATUSES).toEqual(["open", "in-progress", "resolved"]);
    expect(BATON_STAGE_IDS).toEqual(["conti", "lineart", "flat-color", "shading", "lettering", "final-ready"]);
    expect(BATON_STAGE_SPECS).toHaveLength(6);
    expect(EXTERNAL_BRIDGE_IDS).toEqual([
      "csp-psd-layers", "photoshop-psd-cmyk", "blender-glb-camera", "figma-tokens-json", "slack-notion-digest",
    ]);
    expect(EXTERNAL_BRIDGE_SPECS).toHaveLength(5);
    expect(SAMPLE_REVIEW_CUTS).toHaveLength(3);
  });

  it("clampPercent가 0..100 클램프 · 소수 1자리 반올림 · NaN/Infinity 폴백을 안전하게 처리한다", () => {
    expect(clampPercent(-12.4)).toBe(0);
    expect(clampPercent(134.8)).toBe(100);
    expect(clampPercent(42.36)).toBe(42.4);
    expect(clampPercent(Number.NaN, 35)).toBe(35);
    expect(clampPercent(Number.POSITIVE_INFINITY, 25)).toBe(25);
  });

  it("normalizeSingleLineComment가 줄바꿈·연속 공백을 1줄로 압축하고 폴백·최대 길이를 보장한다", () => {
    const normalized = normalizeSingleLineComment("  눈매   수정\n입꼬리\r\n  보정  ", "기본 메모");
    expect(normalized).toBe("눈매 수정 입꼬리 보정");
    expect(normalized).not.toContain("\n");
    expect(normalizeSingleLineComment("   \n  ", "대체 1줄 메모")).toBe("대체 1줄 메모");
    const clipped = normalizeSingleLineComment("가나다라마바사아자차카타파하", "기본", 8);
    expect(clipped.length).toBeLessThanOrEqual(8);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("addVisualReviewPin이 기존 상태를 변이하지 않고 번호 핀·클램프 좌표·기본 공정을 불변 추가한다", () => {
    const base = createInitialVisualPinReviewState();
    Object.freeze(base);
    Object.freeze(base.pins);

    const next = addVisualReviewPin(base, {
      stampId: "tone-missing",
      xPct: 120,
      yPct: -5,
      comment: "목 그림자\n채색 누락 보강",
    });

    expect(next).not.toBe(base);
    expect(base.pins).toHaveLength(4);
    expect(next.pins).toHaveLength(5);
    expect(next.nextPinNumber).toBe(6);

    const added = next.pins[4];
    expect(added?.pinNumber).toBe(5);
    expect(added?.xPct).toBe(100);
    expect(added?.yPct).toBe(0);
    expect(added?.stageId).toBe("shading");
    expect(added?.status).toBe("open");
    expect(added?.comment).toBe("목 그림자 채색 누락 보강");
  });

  it("approved-stamp 도장은 기본 상태가 resolved이고 바통 승계 차단에 포함되지 않는다", () => {
    const stamp = getReviewStampSpec("approved-stamp");
    expect(stamp.blocksStageGate).toBe(false);
    expect(stamp.defaultStatus).toBe("resolved");

    const clean = createInitialVisualPinReviewState({ variant: "clean" });
    const stamped = addVisualReviewPin(clean, { stampId: "approved-stamp", xPct: 33.3, yPct: 44.4 });
    const gate = evaluateStageGateReadiness(stamped);
    expect(gate.unresolvedBlockingPins).toHaveLength(0);
    expect(gate.approvedStampCount).toBe(2);
    expect(gate.canAdvance).toBe(true);
  });

  it("toggleReviewPinResolved와 cycleReviewPinStatus가 1탭 해결 토글 및 3상태 순환을 불변 처리한다", () => {
    expect(togglePinResolvedStatus("open")).toBe("resolved");
    expect(togglePinResolvedStatus("in-progress")).toBe("resolved");
    expect(togglePinResolvedStatus("resolved")).toBe("open");
    expect(cyclePinStatus("open")).toBe("in-progress");
    expect(cyclePinStatus("in-progress")).toBe("resolved");
    expect(cyclePinStatus("resolved")).toBe("open");

    const s0 = createInitialVisualPinReviewState();
    const s1 = toggleReviewPinResolved(s0, "pin-1");
    expect(s1.pins.find((p) => p.id === "pin-1")?.status).toBe("resolved");
    const s2 = toggleReviewPinResolved(s1, "pin-1");
    expect(s2.pins.find((p) => p.id === "pin-1")?.status).toBe("open");
    const s3 = cycleReviewPinStatus(s2, "pin-1");
    expect(s3.pins.find((p) => p.id === "pin-1")?.status).toBe("in-progress");
    const s4 = updateReviewPinStatus(s3, "pin-1", "resolved");
    expect(s4.pins.find((p) => p.id === "pin-1")?.status).toBe("resolved");
  });

  it("코멘트·공정·좌표 수정 및 핀 삭제가 불변 동작하며 미존재 ID에는 원본 참조를 유지한다", () => {
    const s0 = createInitialVisualPinReviewState();
    expect(updateReviewPinComment(s0, "missing", "테스트")).toBe(s0);
    expect(removeReviewPin(s0, "missing")).toBe(s0);

    const s1 = updateReviewPinComment(s0, "pin-1", "시선 처리\n선명하게");
    expect(s1.pins.find((p) => p.id === "pin-1")?.comment).toBe("시선 처리 선명하게");

    const s2 = updateReviewPinStage(s1, "pin-1", "shading");
    expect(s2.pins.find((p) => p.id === "pin-1")?.stageId).toBe("shading");
    expect(s2.pins.find((p) => p.id === "pin-1")?.assignee).toBe("명암 어시");

    const s3 = moveReviewPin(s2, "pin-1", 15.67, 88.24);
    expect(s3.pins.find((p) => p.id === "pin-1")?.xPct).toBe(15.7);
    expect(s3.pins.find((p) => p.id === "pin-1")?.yPct).toBe(88.2);

    const s4 = removeReviewPin(s3, "pin-1");
    expect(s4.pins.some((p) => p.id === "pin-1")).toBe(false);
    expect(s4.pins).toHaveLength(s0.pins.length - 1);
  });

  it("resolveAllPinsForCut이 지정 컷 또는 회차 전체 미해결 핀을 한 번에 해결 처리한다", () => {
    const base = addVisualReviewPin(createInitialVisualPinReviewState(), {
      stampId: "tone-missing",
      cutId: "cut-02",
      xPct: 40,
      yPct: 50,
    });
    const cut1Resolved = resolveAllPinsForCut(base, "cut-01");
    expect(summarizeReviewPins(cut1Resolved.pins, "cut-01").blockingUnresolvedCount).toBe(0);
    expect(summarizeReviewPins(cut1Resolved.pins, "cut-02").blockingUnresolvedCount).toBe(1);

    const allResolved = resolveAllPinsForCut(cut1Resolved);
    expect(summarizeReviewPins(allResolved.pins).blockingUnresolvedCount).toBe(0);
  });

  it("setBeforeAfterSplitPct와 selectActiveReviewCut이 슬라이더 범위와 컷 전환을 안전하게 갱신한다", () => {
    const s0 = createInitialVisualPinReviewState();
    expect(setBeforeAfterSplitPct(s0, 50)).toBe(s0);
    const s1 = setBeforeAfterSplitPct(s0, 82.6);
    expect(s1.beforeAfterSplitPct).toBe(82.6);
    expect(setBeforeAfterSplitPct(s1, -10).beforeAfterSplitPct).toBe(0);
    expect(setBeforeAfterSplitPct(s1, 150).beforeAfterSplitPct).toBe(100);

    const s2 = selectActiveReviewCut(s1, "cut-03");
    expect(s2.activeCutId).toBe("cut-03");
    expect(selectActiveReviewCut(s2, "cut-03")).toBe(s2);
  });

  it("summarizeReviewPins가 전체 회차와 개별 컷의 도장·공정·상태 집계를 정확히 반환한다", () => {
    const state = createInitialVisualPinReviewState();
    const totalSummary = summarizeReviewPins(state.pins);
    expect(totalSummary.total).toBe(4);
    expect(totalSummary.openCount).toBe(1);
    expect(totalSummary.inProgressCount).toBe(1);
    expect(totalSummary.resolvedCount).toBe(2);
    expect(totalSummary.blockingUnresolvedCount).toBe(2);
    expect(totalSummary.unresolvedByStage.lineart).toBe(2);
    expect(totalSummary.byStamp["expression-fix"]).toBe(1);

    const cut2Summary = summarizeReviewPins(state.pins, "cut-02");
    expect(cut2Summary.total).toBe(1);
    expect(cut2Summary.resolvedCount).toBe(1);
    expect(cut2Summary.blockingUnresolvedCount).toBe(0);
  });
});

describe("2. 6단계 바통터치 상태기계 & 승계 자동 안내 · 1줄 알림 페이로드", () => {
  it("미해결 핀이 남아 있으면 evaluateStageGateReadiness가 blocked 상태와 1줄 요약 알림을 생성한다", () => {
    const state = createInitialVisualPinReviewState();
    const gate = evaluateStageGateReadiness(state);

    expect(gate.gateStatus).toBe("blocked");
    expect(gate.canAdvance).toBe(false);
    expect(gate.currentStage.id).toBe("lineart");
    expect(gate.nextStage?.id).toBe("flat-color");
    expect(gate.unresolvedBlockingPins).toHaveLength(2);
    expect(gate.notification.pinRefs).toEqual([1, 2]);
    expect(gate.autoGuidanceKo).toContain("미해결 핀 2건");
    expect(gate.notification.oneLineSummaryKo).toContain("[바통 대기]");
    expect(gate.notification.oneLineSummaryKo).not.toContain("\n");
    expect(gate.notification.oneLineSummaryEn).toContain("[Baton Hold]");
    expect(gate.notification.oneLineSummaryEn).not.toContain("\n");
  });

  it("미해결 핀 잔여 상태에서 advanceBatonStage 기본 호출은 전이를 차단하고 상태를 유지한다", () => {
    const state = createInitialVisualPinReviewState();
    const res = advanceBatonStage(state);
    expect(res.transitioned).toBe(false);
    expect(res.state).toBe(state);
    expect(res.gate.gateStatus).toBe("blocked");
  });

  it("미해결 핀을 모두 해결하면 ready로 전환되고 advanceBatonStage가 다음 공정(flat-color)으로 승계한다", () => {
    const resolved = resolveAllPinsForCut(createInitialVisualPinReviewState());
    const readyGate = evaluateStageGateReadiness(resolved);
    expect(readyGate.gateStatus).toBe("ready");
    expect(readyGate.canAdvance).toBe(true);
    expect(readyGate.notification.oneLineSummaryKo).toContain("[바통 준비]");

    const res = advanceBatonStage(resolved, { actorName: "선화 팀장" });
    expect(res.transitioned).toBe(true);
    expect(res.state.currentStageId).toBe("flat-color");
    expect(res.state.history[0]?.fromStageId).toBe("lineart");
    expect(res.state.history[0]?.toStageId).toBe("flat-color");
    expect(res.state.history[0]?.forced).toBe(false);
  });

  it("conti에서 final-ready까지 6단계 바통터치를 순차 완주하면 finalized와 100% 진행률에 도달한다", () => {
    let state = createInitialVisualPinReviewState({ variant: "clean", currentStageId: "conti" });
    const visited: string[] = [state.currentStageId];

    for (let step = 0; step < 5; step += 1) {
      const res = advanceBatonStage(state);
      expect(res.transitioned).toBe(true);
      state = res.state;
      visited.push(state.currentStageId);
    }

    expect(visited).toEqual(["conti", "lineart", "flat-color", "shading", "lettering", "final-ready"]);
    const finalGate = evaluateStageGateReadiness(state);
    expect(finalGate.gateStatus).toBe("finalized");
    expect(finalGate.canAdvance).toBe(false);
    expect(finalGate.nextStage).toBeNull();
    expect(finalGate.progressPct).toBe(100);
    expect(finalGate.notification.oneLineSummaryKo).toContain("[최종 승인]");

    const extraAdvance = advanceBatonStage(state);
    expect(extraAdvance.transitioned).toBe(false);
  });

  it("force=true 예외 승인은 forced=true 이력을 기록하되 미해결 핀 경고 안내는 그대로 유지한다", () => {
    const state = createInitialVisualPinReviewState();
    const res = advanceBatonStage(state, { force: true, actorName: "메인 작가" });
    expect(res.transitioned).toBe(true);
    expect(res.state.currentStageId).toBe("flat-color");
    expect(res.state.history[0]?.forced).toBe(true);
    expect(res.gate.gateStatus).toBe("blocked");
    expect(res.gate.unresolvedBlockingPins).toHaveLength(2);
  });

  it("rewindBatonStage가 수정 반려 시 이전 공정으로 되돌리고 동일 공정 지정은 no-op 반환한다", () => {
    const base = createInitialVisualPinReviewState({ variant: "clean", currentStageId: "shading" });
    const noop = rewindBatonStage(base, "shading");
    expect(noop.transitioned).toBe(false);
    expect(noop.state).toBe(base);

    const rewound = rewindBatonStage(base, "lineart", "담당 PD");
    expect(rewound.transitioned).toBe(true);
    expect(rewound.state.currentStageId).toBe("lineart");
    expect(rewound.state.history[0]?.direction).toBe("rewind");
  });

  it("현재 공정 이하 차단 핀과 후속 공정 차단 핀을 정확히 분리 분류한다", () => {
    const withLetteringPin = addVisualReviewPin(createInitialVisualPinReviewState(), {
      stampId: "balloon-pos",
      xPct: 20,
      yPct: 18,
    });
    const gate = evaluateStageGateReadiness(withLetteringPin);
    expect(gate.unresolvedBlockingPins).toHaveLength(3);
    expect(gate.currentStageBlockingPins).toHaveLength(2);
    expect(gate.upcomingStageBlockingPins).toHaveLength(1);
    expect(gate.upcomingStageBlockingPins[0]?.stageId).toBe("lettering");
  });

  it("clean 초기 변형은 승인 도장만으로 시작해 즉시 승계 가능 상태와 0건 차단을 보고한다", () => {
    const clean = createInitialVisualPinReviewState({ variant: "clean" });
    const gate = evaluateStageGateReadiness(clean);
    expect(gate.gateStatus).toBe("ready");
    expect(gate.canAdvance).toBe(true);
    expect(gate.unresolvedBlockingPins).toHaveLength(0);
    expect(gate.approvedStampCount).toBe(1);
  });
});

describe("3. 5대 외부 툴 오픈 표준 라운드트립 브리지 & 손실/보존 매핑표 · 매니페스트", () => {
  it("5대 외부 브리지 모두 유료 사유 포맷 미우회(proprietaryBypassAvoided=true)와 공개 표준 확장자를 선언한다", () => {
    const expectedExt: Readonly<Record<string, string>> = {
      "csp-psd-layers": ".psd",
      "photoshop-psd-cmyk": ".psd",
      "blender-glb-camera": ".glb",
      "figma-tokens-json": ".tokens.json",
      "slack-notion-digest": ".md",
    };
    for (const id of EXTERNAL_BRIDGE_IDS) {
      const spec = getExternalBridgeSpec(id);
      expect(spec.proprietaryBypassAvoided).toBe(true);
      expect(spec.fileExtension).toBe(expectedExt[id]);
      expect(spec.avoidedProprietaryFormatKo.length).toBeGreaterThan(5);
      expect(spec.mappings.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("모든 브리지 매핑표가 preserved/approximated/flattened 합계와 보존율을 정확히 계산한다", () => {
    for (const bridge of EXTERNAL_BRIDGE_SPECS) {
      const fid = summarizeBridgeFidelity(bridge);
      expect(fid.preservedCount + fid.approximatedCount + fid.flattenedCount).toBe(fid.totalMappings);
      expect(fid.preservedCount).toBeGreaterThanOrEqual(2);
      expect(fid.preservationRatePct).toBeGreaterThanOrEqual(50);
      expect(fid.preservationRatePct).toBeLessThanOrEqual(100);
    }
  });

  it("buildExternalBridgeManifest가 유효 JSON · 스키마 버전 · 권장 파일명 · 1줄 요약을 생성한다", () => {
    const state = createInitialVisualPinReviewState();
    const manifest = buildExternalBridgeManifest("blender-glb-camera", state);

    expect(manifest.schemaVersion).toBe(VISUAL_PIN_BRIDGE_SCHEMA_VERSION);
    expect(manifest.proprietaryBypassAvoided).toBe(true);
    expect(manifest.suggestedFileName).toBe("toonstudio-lineart-episode-blender-glb-camera.glb");
    expect(manifest.oneLineDigestKo).toContain("블렌더");
    expect(manifest.oneLineDigestKo).not.toContain("\n");

    const parsed = JSON.parse(manifest.jsonPayload) as {
      schemaVersion: string;
      bridgeId: string;
      proprietaryBypassAvoided: boolean;
      mappings: unknown[];
      pins: unknown[];
    };
    expect(parsed.schemaVersion).toBe(VISUAL_PIN_BRIDGE_SCHEMA_VERSION);
    expect(parsed.bridgeId).toBe("blender-glb-camera");
    expect(parsed.proprietaryBypassAvoided).toBe(true);
    expect(parsed.mappings).toHaveLength(5);
    expect(parsed.pins).toHaveLength(4);
  });

  it("scope='active-cut' 옵션이 현재 활성 컷 핀만 매니페스트와 파일명에 반영한다", () => {
    const state = selectActiveReviewCut(createInitialVisualPinReviewState(), "cut-02");
    const cutManifest = buildExternalBridgeManifest("csp-psd-layers", state, { scope: "active-cut" });
    expect(cutManifest.suggestedFileName).toBe("toonstudio-lineart-cut-02-csp-psd-layers.psd");
    expect(cutManifest.pins).toHaveLength(1);
    expect(cutManifest.pins[0]?.cutId).toBe("cut-02");
  });

  it("buildVisualReviewDigestMarkdown이 한글/영문 요약에 1줄 알림 · 핀 체크리스트 · 손실/보존 표를 포함한다", () => {
    const state = createInitialVisualPinReviewState();
    const koMd = buildVisualReviewDigestMarkdown(state, "slack-notion-digest", { locale: "ko" });
    expect(koMd).toContain("캔버스 핀 검수 브리프");
    expect(koMd).toContain("[바통 대기]");
    expect(koMd).toContain("- [ ] 1번");
    expect(koMd).toContain("- [x] 3번");
    expect(koMd).toContain("손실·보존 매핑표");
    expect(koMd).toContain("원본 보존");

    const enMd = buildVisualReviewDigestMarkdown(state, "figma-tokens-json", { locale: "en" });
    expect(enMd).toContain("Visual Pin Review Digest");
    expect(enMd).toContain("[Baton Hold]");
    expect(enMd).toContain("Preservation & Loss Mapping");
    expect(enMd).toContain("preserved");
  });

  it("핀이 0건인 상태에서도 Markdown/JSON 매니페스트가 안전하게 생성된다", () => {
    const emptyState = { ...createInitialVisualPinReviewState({ variant: "clean" }), pins: [] };
    const manifest = buildExternalBridgeManifest("photoshop-psd-cmyk", emptyState);
    expect(manifest.pins).toHaveLength(0);
    expect(manifest.markdownDigest).toContain("등록된 핀이 없습니다");
    expect(JSON.parse(manifest.jsonPayload)).toBeTruthy();
  });
});

describe("4. StudioVisualPinReviewPanel UI · 상호작용 · 접근성 · 코드 위생 자가 감사", () => {
  it("props 없이 단독 렌더링되며 6단계 바통 바 · 6종 도장 · 5대 외부 브리지 · 오픈 표준 배지를 표시한다", () => {
    render(<StudioVisualPinReviewPanel />);
    expect(screen.getByTestId("studio-visual-pin-review-panel")).toBeTruthy();
    expect(screen.getByTestId("visual-pin-open-standard-badge").textContent).toContain("오픈 표준");
    expect(screen.getByTestId("visual-pin-stage-kpi").textContent).toContain("선화");
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("2건");
    for (const stageId of BATON_STAGE_IDS) expect(screen.getByTestId(`visual-pin-stage-${stageId}`)).toBeTruthy();
    for (const stampId of REVIEW_STAMP_IDS) expect(screen.getByTestId(`visual-pin-stamp-${stampId}`)).toBeTruthy();
    for (const bridgeId of EXTERNAL_BRIDGE_IDS) expect(screen.getByTestId(`visual-pin-bridge-${bridgeId}`)).toBeTruthy();
  });

  it("원클릭 도장 선택 후 캔버스 클릭 시 번호 핀이 즉시 추가되고 승인 도장은 차단 핀을 늘리지 않는다", () => {
    render(<StudioVisualPinReviewPanel />);
    fireEvent.click(screen.getByTestId("visual-pin-stamp-tone-missing"));
    fireEvent.change(screen.getByTestId("visual-pin-quick-comment"), { target: { value: "옷깃 그림자 추가" } });
    fireEvent.click(screen.getByTestId("visual-pin-canvas-surface"), { clientX: 120, clientY: 80 });

    expect(screen.getByTestId("visual-pin-marker-pin-5")).toBeTruthy();
    expect(screen.getByTestId("visual-pin-card-pin-5")).toBeTruthy();
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("3건");

    fireEvent.click(screen.getByTestId("visual-pin-stamp-approved-stamp"));
    fireEvent.click(screen.getByTestId("visual-pin-canvas-surface"));
    expect(screen.getByTestId("visual-pin-marker-pin-6")).toBeTruthy();
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("3건");
  });

  it("1탭 해결 토글 · 상태 순환 · 1줄 코멘트 수정 · 필터 · 핀 삭제가 실시간으로 반영된다", () => {
    render(<StudioVisualPinReviewPanel />);
    expect(screen.getByTestId("visual-pin-status-pin-1").textContent).toContain("미해결");

    fireEvent.click(screen.getByTestId("visual-pin-resolve-toggle-pin-1"));
    expect(screen.getByTestId("visual-pin-status-pin-1").textContent).toContain("해결 완료");
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("1건");

    fireEvent.click(screen.getByTestId("visual-pin-cycle-status-pin-1"));
    expect(screen.getByTestId("visual-pin-status-pin-1").textContent).toContain("미해결");

    fireEvent.change(screen.getByTestId("visual-pin-comment-input-pin-1"), { target: { value: "눈빛 강조 재검토" } });
    expect((screen.getByTestId("visual-pin-comment-input-pin-1") as HTMLInputElement).value).toBe("눈빛 강조 재검토");

    fireEvent.click(screen.getByTestId("visual-pin-filter-resolved"));
    expect(screen.queryByTestId("visual-pin-card-pin-1")).toBeNull();
    expect(screen.getByTestId("visual-pin-card-pin-3")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visual-pin-filter-all"));
    fireEvent.click(screen.getByTestId("visual-pin-remove-pin-3"));
    expect(screen.queryByTestId("visual-pin-card-pin-3")).toBeNull();
  });

  it("미해결 핀 차단 상태에서 전체 해결 클릭 후 다음 공정 바통 승계 버튼이 활성화되고 전이된다", () => {
    const onStageAdvance = vi.fn();
    render(<StudioVisualPinReviewPanel onStageAdvance={onStageAdvance} />);

    const advanceBtn = screen.getByTestId("visual-pin-advance-btn") as HTMLButtonElement;
    expect(advanceBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("visual-pin-resolve-all-episode-btn"));
    expect(advanceBtn.disabled).toBe(false);
    expect(screen.getByTestId("visual-pin-gate-banner").textContent).toContain("미해결 핀 0건");

    fireEvent.click(advanceBtn);
    expect(onStageAdvance).toHaveBeenCalledTimes(1);
    expect(onStageAdvance.mock.calls[0]?.[0]).toBe("flat-color");
    expect(screen.getByTestId("visual-pin-stage-kpi").textContent).toContain("밑색");
  });

  it("컷 전환 탭과 전후 비교 슬라이더(버튼 · range 입력)가 분할선과 클립 레이어를 즉시 갱신한다", () => {
    render(<StudioVisualPinReviewPanel />);
    fireEvent.click(screen.getByTestId("visual-pin-cut-cut-02"));
    expect(screen.getByTestId("visual-pin-marker-pin-4")).toBeTruthy();
    expect(screen.queryByTestId("visual-pin-marker-pin-1")).toBeNull();

    fireEvent.click(screen.getByTestId("visual-pin-compare-100"));
    expect(screen.getByTestId("visual-pin-compare-divider").textContent).toContain("100%");

    fireEvent.change(screen.getByTestId("visual-pin-compare-slider"), { target: { value: "25" } });
    expect(screen.getByTestId("visual-pin-compare-divider").textContent).toContain("25%");
    expect(screen.getByTestId("visual-pin-after-layer").getAttribute("style")).toContain("75%");
  });

  it("5대 외부 브리지 전환 · 범위 토글 · Markdown/JSON 복사 콜백 · 미리보기 탭이 정상 동작한다", () => {
    const onCopyBridgeDigest = vi.fn();
    const onCopyBridgeJson = vi.fn();
    render(
      <StudioVisualPinReviewPanel
        onCopyBridgeDigest={onCopyBridgeDigest}
        onCopyBridgeJson={onCopyBridgeJson}
      />,
    );

    fireEvent.click(screen.getByTestId("visual-pin-bridge-blender-glb-camera"));
    expect(screen.getByTestId("visual-pin-bridge-detail").textContent).toContain(".glb");
    expect(screen.getByTestId("visual-pin-bridge-mapping-table").textContent).toContain("glTF 2.0");

    fireEvent.click(screen.getByTestId("visual-pin-scope-cut"));
    expect(screen.getByTestId("visual-pin-bridge-detail").textContent).toContain("cut-01");

    fireEvent.click(screen.getByTestId("visual-pin-copy-md-btn"));
    expect(onCopyBridgeDigest).toHaveBeenCalledTimes(1);
    expect(onCopyBridgeDigest.mock.calls[0]?.[0]).toContain("블렌더");

    fireEvent.click(screen.getByTestId("visual-pin-copy-json-btn"));
    expect(onCopyBridgeJson).toHaveBeenCalledTimes(1);
    expect(onCopyBridgeJson.mock.calls[0]?.[0]).toContain(VISUAL_PIN_BRIDGE_SCHEMA_VERSION);
    expect(screen.getByTestId("visual-pin-export-preview").textContent).toContain('"bridgeId": "blender-glb-camera"');

    fireEvent.click(screen.getByTestId("visual-pin-preview-tab-hidden"));
    expect(screen.queryByTestId("visual-pin-export-preview")).toBeNull();
  });

  it("영문 로케일(locale='en') · clean 변형 · 1줄 알림 복사 · 샘플 복원이 정상 동작한다", () => {
    const onStateChange = vi.fn();
    render(
      <StudioVisualPinReviewPanel
        locale="en"
        initialVariant="clean"
        initialBridgeId="slack-notion-digest"
        onStateChange={onStateChange}
      />,
    );
    expect(onStateChange).toHaveBeenCalled();
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("0 Open");
    expect(screen.getByTestId("visual-pin-bridge-detail").textContent).toContain("Slack & Notion");

    fireEvent.click(screen.getByTestId("visual-pin-copy-alert-btn"));
    expect(screen.getByTestId("visual-pin-status-banner").textContent).toContain("Copied 1-line baton notification");

    fireEvent.click(screen.getByTestId("visual-pin-reset-btn"));
    expect(screen.getByTestId("visual-pin-unresolved-kpi").textContent).toContain("2 Open");
  });

  it("코드 위생 자가 감사(4개 파일 <= 800줄 · 원시 색/transition-all/= {}/Storage/private Map store/BigInt/Sparkles 0건)", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "visual-pin-review-engine.ts",
      "StudioVisualPinReviewPanel.tsx",
      "index.ts",
      "visual-pin-review-studio.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "visual-pin-review-studio.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
      }

      if (file === "StudioVisualPinReviewPanel.tsx") {
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
