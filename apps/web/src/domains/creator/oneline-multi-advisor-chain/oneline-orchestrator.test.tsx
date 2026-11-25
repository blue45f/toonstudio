// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recommendCharacterAdjustments } from "../char-expression-pose-advisor";
import { isVioletSlopHue } from "../scene-lighting-atmosphere-advisor";

import {
  ADVISOR_SLOT_KEYS,
  ONE_LINE_SCENARIO_PRESETS,
  ORCHESTRATOR_SCHEMA_VERSION,
  StudioOneLineOrchestratorPanel,
  applySingleSlot,
  applyUnifiedSelection,
  auditUnifiedSceneCoherence,
  createOrchestratorSession,
  deriveCameraTension,
  exportUnifiedSceneBundleJson,
  exportUnifiedSceneMarkdown,
  findMatchingBundleId,
  getOneLineScenarioPreset,
  mapEmotionToBalloonTone,
  orchestrateOneLineSceneBundles,
  resolveActiveOrchestratorView,
  revertAllOrchestratorSlots,
  revertOrchestratorSlot,
  selectSlotCandidate,
  selectUnifiedBundle,
  togglePreviewOrchestrator,
} from "./index";

afterEach(cleanup);

describe("1. 5대 상황 프리셋 및 4대 실제 어시스턴트 엔진 연동", () => {
  it("5대 상황 프리셋(비 오는 옥상 고백 / 추격전 대치 / 충격 반전 독백 / 교실 노을 화해 / 액션 결정타)이 모두 정의되어 있다", () => {
    expect(ONE_LINE_SCENARIO_PRESETS).toHaveLength(5);
    const labels = ONE_LINE_SCENARIO_PRESETS.map((s) => s.labelKo);
    expect(labels).toEqual([
      "비 오는 옥상 고백",
      "추격전 대치",
      "충격 반전 독백",
      "교실 노을 화해",
      "액션 결정타",
    ]);
  });

  it("getOneLineScenarioPreset이 유효 ID를 정확히 찾고 미지정 시 기본 시나리오를 반환한다", () => {
    expect(getOneLineScenarioPreset("chase-standoff").labelKo).toBe("추격전 대치");
    expect(getOneLineScenarioPreset("action-finisher").cutPresetId).toBe("action-impact");
    expect(getOneLineScenarioPreset(undefined).id).toBe("rooftop-rain-confession");
  });

  it("Wave 47B 캐릭터 표정·포즈·손 모양 엔진을 실제 호출해 동일한 Top-3 및 비젬을 산출한다", () => {
    const dialogue = "설마?! 방금 지나간 사람이 사라진 형이었다고…?!";
    const result = orchestrateOneLineSceneBundles({ dialogue, scenarioId: "shock-reveal-monologue" });
    const direct = recommendCharacterAdjustments(
      { dialogue, intensity: result.intensity, archetype: result.archetype },
      result.previousExpressionCut,
    );
    expect(result.expressionBundle).toEqual(direct);
    expect(result.expressionBundle.proposals).toHaveLength(3);
    expect(result.expressionBundle.analysis.primaryEmotion).toBe("surprise");
  });

  it("Wave 48A 3점 조명·대기감 엔진을 실제 연동하고 모든 광원에서 바이올렛 휴(270~320°)가 0건이다", () => {
    for (const preset of ONE_LINE_SCENARIO_PRESETS) {
      const result = orchestrateOneLineSceneBundles({ dialogue: preset.defaultDialogueKo, scenarioId: preset.id });
      expect(result.lightingBundle.proposals).toHaveLength(3);
      for (const proposal of result.lightingBundle.proposals) {
        expect(isVioletSlopHue(proposal.rig.keyLight.colorOklch.h)).toBe(false);
        expect(isVioletSlopHue(proposal.rig.fillLight.colorOklch.h)).toBe(false);
        expect(isVioletSlopHue(proposal.rig.rimLight.pigmentOklch.h)).toBe(false);
        expect(isVioletSlopHue(proposal.rig.atmosphere.backdropOklch.h)).toBe(false);
        expect(proposal.readabilityAudit.faceContrastRatio).toBeGreaterThan(1);
      }
    }
  });

  it("Wave 48B 180° 카메라 앵글 엔진을 실제 연동해 5대 시나리오 모두 180° 안전 Top-3를 생성한다", () => {
    for (const preset of ONE_LINE_SCENARIO_PRESETS) {
      const result = orchestrateOneLineSceneBundles({ dialogue: preset.defaultDialogueKo, scenarioId: preset.id });
      expect(result.cameraProposals).toHaveLength(3);
      for (const cam of result.cameraProposals) {
        expect(cam.continuityAudit.hemisphereCrossed).toBe(false);
        expect(cam.continuityAudit.status).toBe("safe");
      }
    }
  });

  it("Wave 48C 말풍선 꼬리·한글 SFX 엔진을 실제 연동해 얼굴 가림률 0% 및 유효 읽기 순서 Top-3를 산출한다", () => {
    for (const preset of ONE_LINE_SCENARIO_PRESETS) {
      const result = orchestrateOneLineSceneBundles({ dialogue: preset.defaultDialogueKo, scenarioId: preset.id });
      expect(result.balloonBundle.proposals).toHaveLength(3);
      for (const bal of result.balloonBundle.proposals) {
        expect(bal.balloons.length).toBeGreaterThanOrEqual(1);
        expect(bal.metrics.faceOcclusionPct).toBe(0);
        expect(bal.metrics.readingOrderValid).toBe(true);
        expect(bal.sfx.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("동일 입력에 대해 완전 결정론적이며 공백 대사 입력 시 시나리오 기본 대사로 폴백한다", () => {
    const a = orchestrateOneLineSceneBundles({ dialogue: "   ", scenarioId: "sunset-classroom-reconcile" });
    const b = orchestrateOneLineSceneBundles({ dialogue: "", scenarioId: "sunset-classroom-reconcile" });
    expect(a).toEqual(b);
    expect(a.dialogue).toBe(getOneLineScenarioPreset("sunset-classroom-reconcile").defaultDialogueKo);
  });

  it("대사 내용을 극적으로 바꾸면 4대 엔진 분석 결과와 말풍선 톤·SFX가 연쇄 반영된다", () => {
    const calm = orchestrateOneLineSceneBundles({
      dialogue: "미안해, 그때는 너무 성급했어. 고마워.",
      scenarioId: "sunset-classroom-reconcile",
    });
    const urgent = orchestrateOneLineSceneBundles({
      dialogue: "거기 서!! 감히 배신하다니 지금 끝낸다!!",
      scenarioId: "sunset-classroom-reconcile",
    });
    expect(calm.derivedBalloonTone).not.toBe("shout");
    expect(urgent.derivedBalloonTone).toBe("shout");
    expect(urgent.expressionBundle.analysis.primaryEmotion).toBe("anger");
    expect(urgent.derivedCameraTension).not.toBe("intimacy");
  });
});

describe("2. 원스톱 통합 연출 3안 번들 및 크로스 어시스턴트 어댑터", () => {
  it("5대 시나리오 전체에서 통합 연출 세트 3안(감정 몰입 표준 / 시네마틱 극적 대비 / 가독성·리듬 최우선)을 생성한다", () => {
    for (const preset of ONE_LINE_SCENARIO_PRESETS) {
      const orch = orchestrateOneLineSceneBundles({ dialogue: preset.defaultDialogueKo, scenarioId: preset.id });
      expect(orch.unifiedBundles).toHaveLength(3);
      expect(orch.unifiedBundles[0].variant).toBe("emotional-standard");
      expect(orch.unifiedBundles[1].variant).toBe("cinematic-contrast");
      expect(orch.unifiedBundles[2].variant).toBe("readability-rhythm");
      for (const bundle of orch.unifiedBundles) {
        expect(bundle.requiresAuthorApproval).toBe(true);
        expect(bundle.coherence.violetSlopFree).toBe(true);
        expect(bundle.coherence.overallScore).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it("통합 3안이 47B·48A·48B·48C의 성격이 다른 변형안을 체계적으로 조합한다", () => {
    const orch = orchestrateOneLineSceneBundles({
      dialogue: "빗소리 때문에 안 들릴지도 모르지만… 사실 오래전부터 두근거리며 좋아했어.",
      scenarioId: "rooftop-rain-confession",
    });
    const [b1, b2, b3] = orch.unifiedBundles;
    expect(b1.expression.variant).toBe("canonical");
    expect(b2.expression.variant).toBe("dramatic-contrast");
    expect(b3.expression.variant).toBe("archetype-nuance");
    expect(b1.lighting.variant).toBe("cinematic-key");
    expect(b2.lighting.variant).toBe("dramatic-rim");
    expect(b3.lighting.variant).toBe("readable-soft");
    expect(b1.slotIndices).not.toEqual(b2.slotIndices);
    expect(b2.slotIndices).not.toEqual(b3.slotIndices);
  });

  it("mapEmotionToBalloonTone이 문장부호와 47B 감정에 따라 정확한 48C 톤을 반환한다", () => {
    expect(mapEmotionToBalloonTone("지금 끝낸다!!", "determined", 5)).toBe("shout");
    expect(mapEmotionToBalloonTone("설마 방금 그 사람이?!", "surprise", 4)).toBe("tension");
    expect(mapEmotionToBalloonTone("조용히 속삭여 줄게", "joy", 2)).toBe("whisper");
    expect(mapEmotionToBalloonTone("결국 혼자 남았어...", "sadness", 3)).toBe("thought");
    expect(mapEmotionToBalloonTone("오늘 날씨가 참 좋네.", "joy", 2)).toBe("normal");
  });

  it("deriveCameraTension이 대사 어휘·감정 신호로 카메라 긴장도를 적절히 도출한다", () => {
    expect(deriveCameraTension("설마 정체가 형이었다고?!", "surprise", "calm")).toBe("reveal");
    expect(deriveCameraTension("지금이다! 이 한 방으로 끝낸다!!", "determined", "calm")).toBe("impact");
    expect(deriveCameraTension("거기 서, 도망칠 곳 없어!", "anger", "calm")).toBe("confrontation");
    expect(deriveCameraTension("사실 좋아했어, 고마워.", "embarrassed", "calm")).toBe("intimacy");
    expect(deriveCameraTension("조용한 복도 끝에 서 있었다.", "tired", "calm")).toBe("calm");
  });

  it("줄바꿈으로 2줄 대사를 입력하면 48C 말풍선 2개가 세로 스크롤 읽기 순서를 유지하며 배치된다", () => {
    const orch = orchestrateOneLineSceneBundles({
      dialogue: "거기 서! 더는 물러설 곳 없어!\n…아직 끝난 게 아니야.",
      scenarioId: "chase-standoff",
    });
    expect(orch.dialoguesForBalloon).toHaveLength(2);
    expect(orch.balloonBundle.proposals[0].balloons).toHaveLength(2);
    expect(orch.balloonBundle.proposals[0].metrics.readingOrderValid).toBe(true);
  });

  it("auditUnifiedSceneCoherence가 4대 어시스턴트 교차 점검 지표와 한글·영문 코칭 노트를 산출한다", () => {
    const orch = orchestrateOneLineSceneBundles({
      dialogue: "지금이다! 반드시 뚫어내겠어, 이 한 방으로 끝낸다!!",
      scenarioId: "action-finisher",
    });
    const audit = auditUnifiedSceneCoherence({
      previousExpressionCut: orch.previousExpressionCut,
      previousLightingRig: orch.previousLightingRig,
      expression: orch.expressionBundle.proposals[0],
      lighting: orch.lightingBundle.proposals[1],
      camera: orch.cameraProposals[0],
      balloon: orch.balloonBundle.proposals[2],
    });
    expect(audit.overallScore).toBeGreaterThanOrEqual(0);
    expect(audit.overallScore).toBeLessThanOrEqual(100);
    expect(audit.violetSlopFree).toBe(true);
    expect(audit.notesKo.length).toBeGreaterThanOrEqual(3);
    expect(audit.notesEn.length).toBe(audit.notesKo.length);
  });
});

describe("3. 항목별 믹스&매치 비파괴 상태 머신", () => {
  const orch = orchestrateOneLineSceneBundles({
    dialogue: "빗소리 때문에 안 들릴지도 모르지만… 사실 오래전부터 두근거리며 좋아했어.",
    scenarioId: "rooftop-rain-confession",
  });

  it("초기 세션은 원본 보존(idle) 상태이며 적용 슬롯이 0개다", () => {
    const session = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    expect(session.status).toBe("idle");
    expect(session.appliedSlotCount).toBe(0);
    expect(session.canRevertAll).toBe(false);
    expect(session.selectedBundleId).toBe("bundle-emotional-standard");
    for (const key of ADVISOR_SLOT_KEYS) {
      expect(session.applied[key]).toBeNull();
    }
  });

  it("selectUnifiedBundle은 미리보기 상태만 갱신하고 적용 상태(applied)를 변경하지 않는다", () => {
    const s0 = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    const s1 = selectUnifiedBundle(s0, orch.unifiedBundles[1]);
    expect(s1.status).toBe("previewing");
    expect(s1.isPreviewing).toBe(true);
    expect(s1.selectedBundleId).toBe("bundle-cinematic-contrast");
    expect(s1.draftSelection).toEqual(orch.unifiedBundles[1].slotIndices);
    expect(s1.appliedSlotCount).toBe(0);
    expect(s1.applied.lighting).toBeNull();
  });

  it("항목별 믹스&매치로 '표정 1안 · 조명 2안 · 카메라 1안 · 말풍선 3안' 커스텀 조합을 독립 구성한다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = selectSlotCandidate(s, "expression", 0, orch.unifiedBundles);
    s = selectSlotCandidate(s, "lighting", 1, orch.unifiedBundles);
    s = selectSlotCandidate(s, "camera", 0, orch.unifiedBundles);
    s = selectSlotCandidate(s, "balloon", 2, orch.unifiedBundles);

    const view = resolveActiveOrchestratorView(orch, s);
    expect(view.activeIndices).toEqual({ expression: 0, lighting: 1, camera: 0, balloon: 2 });
    expect(view.isCustomMix).toBe(true);
    expect(view.matchedBundleId).toBeNull();
    expect(view.recipeLabelKo).toBe("표정 1안 · 조명 2안 · 카메라 1안 · 말풍선 3안");
    expect(view.expression.proposal.id).toBe(orch.expressionBundle.proposals[0].id);
    expect(view.lighting.proposal.id).toBe(orch.lightingBundle.proposals[1].id);
    expect(view.camera.proposal.id).toBe(orch.cameraProposals[0].id);
    expect(view.balloon.proposal.id).toBe(orch.balloonBundle.proposals[2].id);
  });

  it("커스텀 조합이 다시 통합 세트와 일치하면 findMatchingBundleId가 해당 세트 ID를 자동 복원한다", () => {
    const b2 = orch.unifiedBundles[1];
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = selectSlotCandidate(s, "expression", b2.slotIndices.expression, orch.unifiedBundles);
    s = selectSlotCandidate(s, "lighting", b2.slotIndices.lighting, orch.unifiedBundles);
    s = selectSlotCandidate(s, "camera", b2.slotIndices.camera, orch.unifiedBundles);
    s = selectSlotCandidate(s, "balloon", b2.slotIndices.balloon, orch.unifiedBundles);
    expect(findMatchingBundleId(s.draftSelection, orch.unifiedBundles)).toBe("bundle-cinematic-contrast");
    expect(s.selectedBundleId).toBe("bundle-cinematic-contrast");
    expect(resolveActiveOrchestratorView(orch, s).isCustomMix).toBe(false);
  });

  it("togglePreviewOrchestrator가 미리보기 토글 후 기존 적용 상태(applied/partial-applied)를 정확히 복구한다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = applyUnifiedSelection(s, orch);
    expect(s.status).toBe("applied");

    const previewOn = togglePreviewOrchestrator(s, true);
    expect(previewOn.status).toBe("previewing");
    expect(previewOn.isPreviewing).toBe(true);
    expect(previewOn.appliedSlotCount).toBe(4);

    const previewOff = togglePreviewOrchestrator(previewOn, false);
    expect(previewOff.status).toBe("applied");
    expect(previewOff.isPreviewing).toBe(false);
  });

  it("applyUnifiedSelection이 커스텀 믹스 4개 슬롯을 한 번에 비파괴 일괄 적용한다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = selectSlotCandidate(s, "lighting", 1, orch.unifiedBundles);
    s = selectSlotCandidate(s, "balloon", 2, orch.unifiedBundles);
    s = applyUnifiedSelection(s, orch);

    expect(s.status).toBe("applied");
    expect(s.isPreviewing).toBe(false);
    expect(s.appliedSlotCount).toBe(4);
    expect(s.canRevertAll).toBe(true);
    expect(s.applied.lighting?.index).toBe(1);
    expect(s.applied.balloon?.index).toBe(2);
    expect(s.history[s.history.length - 1]?.action).toBe("apply-all");
  });

  it("revertOrchestratorSlot이 조명 슬롯 하나만 원복하고 나머지 3개 슬롯 적용은 유지한다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = applyUnifiedSelection(s, orch);
    const partial = revertOrchestratorSlot(s, "lighting");

    expect(partial.status).toBe("partial-applied");
    expect(partial.appliedSlotCount).toBe(3);
    expect(partial.canRevertAll).toBe(true);
    expect(partial.applied.lighting).toBeNull();
    expect(partial.applied.expression).not.toBeNull();
    expect(partial.applied.camera).not.toBeNull();
    expect(partial.applied.balloon).not.toBeNull();
  });

  it("applySingleSlot 개별 적용 후 revertAllOrchestratorSlots로 전체 원복하면 4개 슬롯이 초기화된다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = applySingleSlot(s, "camera", orch);
    expect(s.status).toBe("partial-applied");
    expect(s.appliedSlotCount).toBe(1);
    expect(s.applied.camera).not.toBeNull();

    const reverted = revertAllOrchestratorSlots(s);
    expect(reverted.status).toBe("reverted");
    expect(reverted.appliedSlotCount).toBe(0);
    expect(reverted.canRevertAll).toBe(false);
    expect(reverted.applied.camera).toBeNull();
  });
});

describe("4. 통합 컷 연출 JSON 및 한글 연출 큐시트 Markdown 내보내기", () => {
  const orch = orchestrateOneLineSceneBundles({
    dialogue: "거기 서! 골목 끝 막다른 길이다, 더는 도망칠 곳 없어!!",
    scenarioId: "chase-standoff",
  });

  it("exportUnifiedSceneBundleJson이 정식 스키마·승인 정책·탈-바이올렛·4대 activeMix를 포함한 유효 JSON을 반환한다", () => {
    const s = applyUnifiedSelection(
      createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles),
      orch,
    );
    const raw = exportUnifiedSceneBundleJson(orch, s);
    const parsed = JSON.parse(raw) as {
      schema: string;
      requiresAuthorApproval: boolean;
      violetSlopPct: number;
      activeMix: {
        expression: { proposal: { id: string } };
        lighting: { keyLight: { colorCss: string } };
        camera: { proposal: { focalLengthMm: number } };
        balloon: { proposal: { sfx: { text: string } } };
      };
      unifiedBundles: unknown[];
    };
    expect(parsed.schema).toBe(ORCHESTRATOR_SCHEMA_VERSION);
    expect(parsed.requiresAuthorApproval).toBe(true);
    expect(parsed.violetSlopPct).toBe(0);
    expect(parsed.activeMix.expression.proposal.id).toBeTruthy();
    expect(parsed.activeMix.lighting.keyLight.colorCss).toMatch(/^oklch\(/u);
    expect(parsed.activeMix.camera.proposal.focalLengthMm).toBeGreaterThanOrEqual(24);
    expect(parsed.activeMix.balloon.proposal.sfx.text.length).toBeGreaterThan(0);
    expect(parsed.unifiedBundles).toHaveLength(3);
  });

  it("exportUnifiedSceneBundleJson이 커스텀 믹스(1·2·1·3) slotRank와 부분 원복 상태를 정확히 직렬화한다", () => {
    let s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    s = selectSlotCandidate(s, "expression", 0, orch.unifiedBundles);
    s = selectSlotCandidate(s, "lighting", 1, orch.unifiedBundles);
    s = selectSlotCandidate(s, "camera", 0, orch.unifiedBundles);
    s = selectSlotCandidate(s, "balloon", 2, orch.unifiedBundles);
    s = applyUnifiedSelection(s, orch);
    s = revertOrchestratorSlot(s, "balloon");

    const parsed = JSON.parse(exportUnifiedSceneBundleJson(orch, s)) as {
      session: { status: string; isCustomMix: boolean; appliedSlotCount: number; appliedSlots: Record<string, string | null> };
      activeMix: { expression: { slotRank: number }; lighting: { slotRank: number }; camera: { slotRank: number }; balloon: { slotRank: number } };
    };
    expect(parsed.session.status).toBe("partial-applied");
    expect(parsed.session.isCustomMix).toBe(true);
    expect(parsed.session.appliedSlotCount).toBe(3);
    expect(parsed.session.appliedSlots.balloon).toBeNull();
    expect(parsed.activeMix.expression.slotRank).toBe(1);
    expect(parsed.activeMix.lighting.slotRank).toBe(2);
    expect(parsed.activeMix.camera.slotRank).toBe(1);
    expect(parsed.activeMix.balloon.slotRank).toBe(3);
  });

  it("exportUnifiedSceneMarkdown 한글 큐시트가 입력 대사·조합·4대 어시스턴트 상세 항목을 모두 출력한다", () => {
    const s = applyUnifiedSelection(
      createOrchestratorSession(orch.unifiedBundles[1].slotIndices, orch.unifiedBundles),
      orch,
    );
    const md = exportUnifiedSceneMarkdown(orch, s, "ko");
    expect(md).toContain("# 컷 연출 큐시트 — 추격전 대치");
    expect(md).toContain(orch.dialogue);
    expect(md).toContain("## 1. 캐릭터 표정·포즈·손 모양 (47B)");
    expect(md).toContain("## 2. 3점 조명·대기감 (48A)");
    expect(md).toContain("## 3. 카메라 앵글·180° 연속성 (48B)");
    expect(md).toContain("## 4. 말풍선 꼬리·한글 효과음 (48C)");
    expect(md).toContain("oklch(");
  });

  it("exportUnifiedSceneMarkdown 영문 모드가 영문 큐시트 섹션을 결정론적으로 출력한다", () => {
    const s = createOrchestratorSession(orch.unifiedBundles[0].slotIndices, orch.unifiedBundles);
    const md = exportUnifiedSceneMarkdown(orch, s, "en");
    expect(md).toContain("# Cut Director Cue Sheet — Chase Standoff");
    expect(md).toContain("## 1. Character Expression & Pose (47B)");
    expect(md).toContain("## 4. Speech Balloon & Hangul SFX (48C)");
  });
});

describe("5. StudioOneLineOrchestratorPanel UI 및 순수 시맨틱 SVG 통합 프리뷰", () => {
  it("선택 props 없이 기본 렌더되며 승인 배지·5종 시나리오·통합 3안·4슬롯 스위처·통합 SVG가 표시된다", () => {
    render(<StudioOneLineOrchestratorPanel />);
    expect(screen.getByTestId("studio-oneline-orchestrator-panel")).toBeTruthy();
    expect(screen.getByTestId("orchestrator-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("orchestrator-scenario-rooftop-rain-confession").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("orchestrator-bundle-btn-1")).toBeTruthy();
    expect(screen.getByTestId("orchestrator-bundle-btn-2")).toBeTruthy();
    expect(screen.getByTestId("orchestrator-bundle-btn-3")).toBeTruthy();
    for (const slot of ADVISOR_SLOT_KEYS) {
      expect(screen.getByTestId(`orchestrator-slot-card-${slot}`)).toBeTruthy();
    }
    const svg = screen.getByTestId("orchestrator-unified-svg");
    expect(svg.getAttribute("data-violet-free")).toBe("true");
    expect(svg.getAttribute("data-face-occlusion")).toBe("0");
  });

  it("시나리오 프리셋 전환과 대사 직접 입력 시 SVG 프리뷰 속성과 4슬롯 분석이 실시간 갱신된다", () => {
    render(<StudioOneLineOrchestratorPanel />);
    fireEvent.click(screen.getByTestId("orchestrator-scenario-action-finisher"));
    expect(screen.getByTestId("orchestrator-scenario-action-finisher").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("orchestrator-dialogue-input") as HTMLInputElement).value).toContain("지금이다");

    fireEvent.change(screen.getByTestId("orchestrator-dialogue-input"), {
      target: { value: "설마?! 방금 지나간 사람이 사라진 형이었다고?!" },
    });
    expect((screen.getByTestId("orchestrator-dialogue-input") as HTMLInputElement).value).toContain("설마");
    expect(screen.getByTestId("orchestrator-svg-character-layer").textContent).toContain("놀람");
  });

  it("통합 세트 2안 선택 후 4슬롯 믹스(표정 1안·조명 2안·카메라 1안·말풍선 3안) 클릭 시 커스텀 조합과 SVG 레시피가 갱신된다", () => {
    render(<StudioOneLineOrchestratorPanel />);
    fireEvent.click(screen.getByTestId("orchestrator-bundle-btn-2"));
    expect(screen.getByTestId("orchestrator-bundle-btn-2").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("orchestrator-mix-expression-1"));
    fireEvent.click(screen.getByTestId("orchestrator-mix-lighting-2"));
    fireEvent.click(screen.getByTestId("orchestrator-mix-camera-1"));
    fireEvent.click(screen.getByTestId("orchestrator-mix-balloon-3"));

    expect(screen.getByTestId("orchestrator-recipe-summary").textContent).toContain("커스텀 믹스");
    expect(screen.getByTestId("orchestrator-recipe-summary").textContent).toContain("표정 1안 · 조명 2안 · 카메라 1안 · 말풍선 3안");
    expect(screen.getByTestId("orchestrator-unified-svg").getAttribute("data-active-recipe")).toBe("1-2-1-3");
  });

  it("미리보기(onApplyBundle 미호출) → 일괄 적용(호출) → 개별 슬롯 원복(부분 적용 3/4) → 전체 되돌리기가 동작한다", () => {
    const onApplyBundle = vi.fn();
    render(<StudioOneLineOrchestratorPanel onApplyBundle={onApplyBundle} />);

    fireEvent.click(screen.getByTestId("orchestrator-bundle-btn-2"));
    expect(screen.getByTestId("orchestrator-session-status-badge").textContent).toContain("미리보기");
    expect(onApplyBundle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("orchestrator-apply-all-btn"));
    expect(onApplyBundle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("orchestrator-session-status-badge").textContent).toContain("4/4");
    expect((screen.getByTestId("orchestrator-revert-all-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("orchestrator-slot-revert-lighting"));
    expect(screen.getByTestId("orchestrator-session-status-badge").textContent).toContain("3/4");
    expect(screen.getByTestId("orchestrator-slot-state-lighting").textContent).toContain("대기");
    expect(screen.getByTestId("orchestrator-slot-state-expression").textContent).toContain("적용");

    fireEvent.click(screen.getByTestId("orchestrator-revert-all-btn"));
    expect(screen.getByTestId("orchestrator-session-status-badge").textContent).toContain("원본 되돌림");
    expect((screen.getByTestId("orchestrator-revert-all-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("JSON 복사(onExportJson 콜백), 한글 큐시트 MD 복사, 프리뷰 닫기 및 영문 로케일 렌더가 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioOneLineOrchestratorPanel locale="en" onExportJson={onExportJson} />);
    expect(screen.getByTestId("orchestrator-approval-badge").textContent).toContain("Author Approval Required");

    fireEvent.click(screen.getByTestId("orchestrator-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain(ORCHESTRATOR_SCHEMA_VERSION);
    expect(screen.getByTestId("orchestrator-json-preview").textContent).toContain('"activeMix"');

    fireEvent.click(screen.getByTestId("orchestrator-export-md-btn"));
    expect(screen.getByTestId("orchestrator-markdown-preview").textContent).toContain("# Cut Director Cue Sheet");

    fireEvent.click(screen.getByTestId("orchestrator-close-export-btn"));
    expect(screen.queryByTestId("orchestrator-markdown-preview")).toBeNull();
  });

  it("initialDialogue와 initialScenarioId 선택 props가 초기 상태에 반영된다", () => {
    render(
      <StudioOneLineOrchestratorPanel
        initialScenarioId="shock-reveal-monologue"
        initialDialogue="설마 이 열쇠가 마지막 단서였다고?!"
      />,
    );
    expect(screen.getByTestId("orchestrator-scenario-shock-reveal-monologue").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("orchestrator-dialogue-input") as HTMLInputElement).value).toBe("설마 이 열쇠가 마지막 단서였다고?!");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("4개 소유 파일 존재, 전 파일 800줄 이하, 4대 엔진 실제 import 및 금지 패턴 0건을 보장한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "oneline-orchestrator-engine.ts",
      "StudioOneLineOrchestratorPanel.tsx",
      "index.ts",
      "oneline-orchestrator.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const engineSrc = readFileSync(path.join(dir, "oneline-orchestrator-engine.ts"), "utf8");
    expect(engineSrc).toContain("../char-expression-pose-advisor");
    expect(engineSrc).toContain("../scene-lighting-atmosphere-advisor");
    expect(engineSrc).toContain("../camera-framing-continuity-coach");
    expect(engineSrc).toContain("../balloon-sfx-placement-proposer");

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/u).length).toBeLessThanOrEqual(800);

      if (file !== "oneline-orchestrator.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
      }

      if (file === "StudioOneLineOrchestratorPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
        expect(src).toContain("작가 승인 후 적용");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 통합 SVG에 원시 색 및 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioOneLineOrchestratorPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(25);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svg = screen.getByTestId("orchestrator-unified-svg");
    const html = svg.outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(html).not.toMatch(/\brgba?\s*\(/iu);
    expect(html).not.toMatch(/\bhsla?\s*\(/iu);
    const oklchMatches = html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu);
    let colorCount = 0;
    for (const match of oklchMatches) {
      colorCount += 1;
      expect(isVioletSlopHue(Number(match[1]))).toBe(false);
    }
    expect(colorCount).toBeGreaterThanOrEqual(10);
  });
});
