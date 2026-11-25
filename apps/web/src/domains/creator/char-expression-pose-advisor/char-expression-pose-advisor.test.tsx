// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADVISOR_DIALOGUE_PRESETS,
  CHARACTER_ARCHETYPES,
  HAND_GESTURE_PRESETS,
  PREVIOUS_CUT_PRESETS,
  StudioCharExpressionPoseAdvisorPanel,
  UPPER_BODY_POSE_PRESETS,
  VRM_BLENDSHAPE_KEYS,
  analyzeDialogueIntent,
  applyAdvisorProposal,
  checkExpressionContinuity,
  clampIntensity,
  createAdvisorSessionState,
  exportAdvisorStateJson,
  getPreviousCutPreset,
  previewAdvisorProposal,
  recommendCharacterAdjustments,
  revertAdvisorProposal,
  updateAdvisorPreviousCut,
  type CharacterArchetype,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 한국어 대사·문장부호 기반 8대 감정 분류기", () => {
  it("기쁨 어휘와 물결표(~) 대사를 joy로 분류하고 신호를 기록한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "드디어 해냈어! 정말 너무 기뻐~", archetype: "energetic", intensity: 4 });
    expect(res.primaryEmotion).toBe("joy");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(res.detectedSignals.some((s) => s.includes("물결표"))).toBe(true);
  });

  it("격앙된 분노 어휘와 강조 감탄(!!)을 anger로 분류하고 권장 강도를 높인다", () => {
    const res = analyzeDialogueIntent({ dialogue: "지금 장난해?! 당장 그만둬!!", archetype: "stoic", intensity: 4 });
    expect(res.primaryEmotion).toBe("anger");
    expect(res.suggestedIntensity).toBeGreaterThanOrEqual(4);
  });

  it("슬픔 어휘와 말줄임표·눈물 자모(ㅠㅠ)를 sadness로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "결국 혼자 남았네... 정말 미안해ㅠㅠ", archetype: "gentle", intensity: 3 });
    expect(res.primaryEmotion).toBe("sadness");
    expect(res.detectedSignals.some((s) => s.includes("말줄임표"))).toBe(true);
  });

  it("감탄사(헉)와 의문감탄(?!)을 surprise로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "헉?! 설마 네가 여기 있을 줄이야?!", archetype: "energetic", intensity: 5 });
    expect(res.primaryEmotion).toBe("surprise");
    expect(res.detectedSignals.some((s) => s.includes("부호(?!)"))).toBe(true);
  });

  it("더듬기(아,)와 부끄러움·부정 어휘를 embarrassed로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "아, 아니거든! 딱히 너 때문에 얼굴 붉힌 거 아니야...", archetype: "tsundere", intensity: 3 });
    expect(res.primaryEmotion).toBe("embarrassed");
    expect(res.detectedSignals.some((s) => s.includes("더듬기"))).toBe(true);
  });

  it("흥·후후·고작 등 여유 비웃음 대사를 smirk로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "흥, 고작 그 정도로 나를 막겠다고? 후후, 재밌네~", archetype: "villain", intensity: 4 });
    expect(res.primaryEmotion).toBe("smirk");
  });

  it("하아·지쳤·야근·말줄임표 대사를 tired로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "하아... 오늘도 야근이야. 너무 피곤하고 지쳤어...", archetype: "stoic", intensity: 2 });
    expect(res.primaryEmotion).toBe("tired");
    expect(res.suggestedIntensity).toBeLessThanOrEqual(3);
  });

  it("반드시·지켜·물러서지 등 결의 어휘를 determined로 분류한다", () => {
    const res = analyzeDialogueIntent({ dialogue: "반드시 지켜낼 거야! 끝까지 물러서지 않아!", archetype: "stoic", intensity: 5 });
    expect(res.primaryEmotion).toBe("determined");
  });
});

describe("2. 한글 음절 중성 분해 입모양 비젬(Viseme) 및 강도 클램핑", () => {
  it("ㅏ/ㅑ/ㅘ 종결 음절에서 aa 비젬을 정확히 추론한다", () => {
    const r1 = analyzeDialogueIntent({ dialogue: "가지 마!" });
    expect(r1.viseme).toBe("aa");
    expect(r1.visemeSourceSyllable).toBe("마");

    const r2 = analyzeDialogueIntent({ dialogue: "이리 와!" });
    expect(r2.viseme).toBe("aa");
    expect(r2.visemeSourceSyllable).toBe("와");
  });

  it("ㅣ/ㅢ/ㅟ 음절은 ih, ㅜ/ㅠ/ㅡ 음절은 ou 비젬으로 분해한다", () => {
    const rIh = analyzeDialogueIntent({ dialogue: "여기 있지!" });
    expect(rIh.viseme).toBe("ih");
    expect(rIh.visemeSourceSyllable).toBe("지");

    const rOu = analyzeDialogueIntent({ dialogue: "대체 누구?" });
    expect(rOu.viseme).toBe("ou");
    expect(rOu.visemeSourceSyllable).toBe("구");
  });

  it("ㅐ/ㅔ 음절은 ee, ㅓ/ㅗ/ㅕ 음절은 oh 비젬으로 분해한다", () => {
    const rEe = analyzeDialogueIntent({ dialogue: "정말 미안해..." });
    expect(rEe.viseme).toBe("ee");
    expect(rEe.visemeSourceSyllable).toBe("해");

    const rOh = analyzeDialogueIntent({ dialogue: "잠깐, 뭐라고?" });
    expect(rOh.viseme).toBe("oh");
    expect(rOh.visemeSourceSyllable).toBe("고");
  });

  it("빈 대사·말줄임표 전용·닫힌 콧소리(음.../흠...)는 closed 비젬을 반환한다", () => {
    expect(analyzeDialogueIntent({ dialogue: "" }).viseme).toBe("closed");
    expect(analyzeDialogueIntent({ dialogue: "..." }).viseme).toBe("closed");
    expect(analyzeDialogueIntent({ dialogue: "음..." }).viseme).toBe("closed");
    expect(analyzeDialogueIntent({ dialogue: "(침묵)" }).viseme).toBe("closed");
  });

  it("영문 대사 폴백에서도 마지막 모음 기반 비젬을 추론한다", () => {
    expect(analyzeDialogueIntent({ dialogue: "Whoa!" }).viseme).toBe("aa");
    expect(analyzeDialogueIntent({ dialogue: "No way!" }).viseme).toBe("ih");
    expect(analyzeDialogueIntent({ dialogue: "Stop!" }).viseme).toBe("oh");
  });

  it("감정 강도는 1~5 정수 범위로 안전하게 클램핑된다", () => {
    expect(clampIntensity(undefined)).toBe(3);
    expect(clampIntensity(Number.NaN)).toBe(3);
    expect(clampIntensity(-10)).toBe(1);
    expect(clampIntensity(0)).toBe(1);
    expect(clampIntensity(3.4)).toBe(3);
    expect(clampIntensity(99)).toBe(5);
  });
});

describe("3. Top-3 비파괴 추천안 생성 및 성격 아키타입 5종 분화", () => {
  it("항상 신뢰도 내림차순의 Top-3 추천안(canonical·archetype-nuance·dramatic-contrast)을 생성한다", () => {
    const bundle = recommendCharacterAdjustments({
      dialogue: "반드시 이겨서 돌아올게!",
      archetype: "energetic",
      intensity: 4,
    });
    expect(bundle.proposals).toHaveLength(3);
    expect(bundle.proposals.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(bundle.proposals.map((p) => p.variant)).toEqual([
      "canonical",
      "archetype-nuance",
      "dramatic-contrast",
    ]);
    expect(bundle.proposals[0].confidence).toBeGreaterThanOrEqual(bundle.proposals[1].confidence);
    expect(bundle.proposals[1].confidence).toBeGreaterThanOrEqual(bundle.proposals[2].confidence);
    for (const p of bundle.proposals) {
      expect(p.requiresAuthorApproval).toBe(true);
    }
  });

  it("모든 추천안은 11종 VRM 표준 블렌드셰이프를 [0, 1] 범위로 출력하고 활성 비젬만 켠다", () => {
    const bundle = recommendCharacterAdjustments({
      dialogue: "당장 멈춰!",
      archetype: "stoic",
      intensity: 5,
    });
    expect(bundle.analysis.viseme).toBe("ou");
    for (const p of bundle.proposals) {
      for (const key of VRM_BLENDSHAPE_KEYS) {
        expect(p.blendShapes[key]).toBeGreaterThanOrEqual(0);
        expect(p.blendShapes[key]).toBeLessThanOrEqual(1);
      }
      expect(p.blendShapes.ou).toBeGreaterThan(0);
      expect(p.blendShapes.aa).toBe(0);
      expect(p.blendShapes.ih).toBe(0);
      expect(p.blendShapes.ee).toBe(0);
      expect(p.blendShapes.oh).toBe(0);
    }

    const silentBundle = recommendCharacterAdjustments({ dialogue: "...", archetype: "stoic", intensity: 2 });
    expect(silentBundle.proposals[0].blendShapes.aa).toBe(0);
    expect(silentBundle.proposals[0].blendShapes.ih).toBe(0);
    expect(silentBundle.proposals[0].blendShapes.ou).toBe(0);
    expect(silentBundle.proposals[0].blendShapes.ee).toBe(0);
    expect(silentBundle.proposals[0].blendShapes.oh).toBe(0);
  });

  it("동일 대사라도 5종 아키타입(냉정·활발·츤데레·온화·카리스마)에 따라 표정 폭·시선·포즈가 차별화된다", () => {
    const archetypes: readonly CharacterArchetype[] = CHARACTER_ARCHETYPES.map((a) => a.id);
    const results = archetypes.map((archetype) =>
      recommendCharacterAdjustments({ dialogue: "정말 고마워, 덕분에 살았어!", archetype, intensity: 4 }),
    );
    const stoicHappy = results[0]?.proposals[0].blendShapes.happy ?? 0;
    const energeticHappy = results[1]?.proposals[0].blendShapes.happy ?? 0;
    const tsundereYaw = results[2]?.proposals[1].gazeYaw ?? 0;
    const villainPose = results[4]?.proposals[1].upperBodyPoseId;

    expect(energeticHappy).toBeGreaterThan(stoicHappy);
    expect(tsundereYaw).toBeLessThan(-5);
    expect(villainPose).toBe("tilted-smirk-command");
  });

  it("모든 추천안이 유효한 상체 포즈·손 모양 프리셋 ID, 눈썹/시선 값, 1줄 이유를 포함한다", () => {
    for (const scenario of ADVISOR_DIALOGUE_PRESETS) {
      const bundle = recommendCharacterAdjustments(scenario);
      for (const p of bundle.proposals) {
        expect(UPPER_BODY_POSE_PRESETS[p.upperBodyPoseId]).toBeDefined();
        expect(HAND_GESTURE_PRESETS[p.handGestureId]).toBeDefined();
        expect(p.eyebrowTiltDeg).toBeGreaterThanOrEqual(-26);
        expect(p.eyebrowTiltDeg).toBeLessThanOrEqual(24);
        expect(p.gazeYaw).toBeGreaterThanOrEqual(-24);
        expect(p.gazeYaw).toBeLessThanOrEqual(24);
        expect(p.gazePitch).toBeGreaterThanOrEqual(-18);
        expect(p.gazePitch).toBeLessThanOrEqual(18);
        expect(p.reasonKo.length).toBeGreaterThan(8);
        expect(p.reasonEn.length).toBeGreaterThan(8);
      }
    }
  });
});

describe("4. 직전 컷 연속성 검사, 비파괴 상태기계 및 JSON 내보내기", () => {
  it("유사한 감정·시선 연결 시 smooth로 판정하고 불필요한 중간 전환안을 만들지 않는다", () => {
    const prev = getPreviousCutPreset("bright-joy").snapshot;
    const bundle = recommendCharacterAdjustments(
      { dialogue: "정말 다행이야, 너무 기뻐!", archetype: "gentle", intensity: 3 },
      prev,
    );
    expect(bundle.continuityCheck).not.toBeNull();
    expect(bundle.continuityCheck?.severity).toBe("smooth");
    expect(bundle.continuityCheck?.bridgeProposal).toBeNull();
  });

  it("환한 웃음 직전 컷에서 격앙 분노로 급변 시 abrupt-jump와 중간 완충 전환안을 생성한다", () => {
    const prev = getPreviousCutPreset("bright-joy").snapshot;
    const bundle = recommendCharacterAdjustments(
      { dialogue: "지금 장난해?! 당장 그만둬!!", archetype: "energetic", intensity: 5 },
      prev,
    );
    const report = bundle.continuityCheck;
    expect(report).not.toBeNull();
    expect(report?.severity).toBe("abrupt-jump");
    expect(report?.expressionJumpScore).toBeGreaterThanOrEqual(65);
    expect(report?.valenceFlipped).toBe(true);
    expect(report?.bridgeProposal).not.toBeNull();

    const bridge = report?.bridgeProposal;
    expect(bridge?.variant).toBe("continuity-bridge");
    expect(bridge?.blendShapes.angry).toBeLessThan(bundle.proposals[0].blendShapes.angry);
    expect(bridge?.blendShapes.happy).toBeGreaterThan(0);
    expect(bridge?.eyebrowTiltDeg).toBeGreaterThan(bundle.proposals[0].eyebrowTiltDeg);
    expect(bridge?.eyebrowTiltDeg).toBeLessThan(prev.eyebrowTiltDeg);
  });

  it("checkExpressionContinuity 단독 호출 시 시선·눈썹 각도 델타를 정확히 보고한다", () => {
    const prev = getPreviousCutPreset("tense-anger").snapshot;
    const target = recommendCharacterAdjustments({
      dialogue: "아, 아니거든! 보지 마...",
      archetype: "tsundere",
      intensity: 4,
    }).proposals[1];
    const report = checkExpressionContinuity(prev, target);
    expect(report.eyebrowDeltaDeg).toBeGreaterThan(0);
    expect(report.gazeDeltaDeg).toBeGreaterThan(10);
    expect(report.jumpFactorsKo.length).toBeGreaterThan(0);
  });

  it("previewAdvisorProposal은 current·baseline을 건드리지 않고 미리보기 상태만 토글한다", () => {
    const session = createAdvisorSessionState();
    const proposal = recommendCharacterAdjustments({ dialogue: "반드시 해내겠어!", intensity: 4 }).proposals[0];

    const previewed = previewAdvisorProposal(session, proposal.id);
    expect(previewed.status).toBe("previewing");
    expect(previewed.previewingProposalId).toBe(proposal.id);
    expect(previewed.appliedProposalId).toBeNull();
    expect(previewed.current).toEqual(session.baseline);
    expect(previewed.canRevert).toBe(false);

    const toggledOff = previewAdvisorProposal(previewed, proposal.id);
    expect(toggledOff.status).toBe("idle");
    expect(toggledOff.previewingProposalId).toBeNull();
  });

  it("applyAdvisorProposal 후 revertAdvisorProposal이 원본 baseline을 완벽히 복구한다", () => {
    const baseSession = createAdvisorSessionState();
    const bundle = recommendCharacterAdjustments({ dialogue: "지금 장난해?! 멈춰!!", intensity: 5 });

    const applied1 = applyAdvisorProposal(baseSession, bundle.proposals[0]);
    expect(applied1.status).toBe("applied");
    expect(applied1.canRevert).toBe(true);
    expect(applied1.appliedProposalId).toBe(bundle.proposals[0].id);
    expect(applied1.current.emotion).toBe("anger");
    expect(applied1.baseline).toEqual(baseSession.baseline);

    const applied2 = applyAdvisorProposal(applied1, bundle.proposals[2]);
    expect(applied2.appliedProposalId).toBe(bundle.proposals[2].id);
    expect(applied2.history).toHaveLength(2);
    expect(applied2.baseline).toEqual(baseSession.baseline);

    const reverted = revertAdvisorProposal(applied2);
    expect(reverted.status).toBe("reverted");
    expect(reverted.canRevert).toBe(false);
    expect(reverted.appliedProposalId).toBeNull();
    expect(reverted.current).toEqual(baseSession.baseline);
    expect(reverted.history).toHaveLength(3);
  });

  it("updateAdvisorPreviousCut은 직전 컷 기준만 교체하고 원본·적용 상태를 유지한다", () => {
    const initial = createAdvisorSessionState();
    const nextPrev = getPreviousCutPreset("deep-sadness").snapshot;
    const updated = updateAdvisorPreviousCut(initial, nextPrev);
    expect(updated.previousCut.emotion).toBe("sadness");
    expect(updated.baseline).toEqual(initial.baseline);
    expect(updated.current).toEqual(initial.current);
  });

  it("exportAdvisorStateJson이 스키마 버전·VRM 가중치·연속성·비파괴 정책을 유효 JSON으로 직렬화한다", () => {
    const prev = getPreviousCutPreset("bright-joy").snapshot;
    const session = createAdvisorSessionState(undefined, prev);
    const bundle = recommendCharacterAdjustments({ dialogue: "지금 장난해?!", archetype: "stoic", intensity: 4 }, prev);
    const applied = applyAdvisorProposal(session, bundle.proposals[0]);

    const raw = exportAdvisorStateJson({ bundle, session: applied });
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      nonDestructivePolicy: string;
      session: { status: string; canRevert: boolean };
      topProposals: { rank: number }[];
      continuityCheck: { severity: string };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.char-expression-pose-advisor.v1");
    expect(parsed.nonDestructivePolicy).toBe("author-approval-required");
    expect(parsed.session.status).toBe("applied");
    expect(parsed.session.canRevert).toBe(true);
    expect(parsed.topProposals).toHaveLength(3);
    expect(parsed.continuityCheck.severity).toBe("abrupt-jump");
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});

describe("5. StudioCharExpressionPoseAdvisorPanel 단독 렌더 및 상호작용", () => {
  it("Props 없이 단독 렌더 시 작가 승인 후 적용 배지·입력 컨트롤·Top-3 카드·SVG 도해가 표시된다", () => {
    render(<StudioCharExpressionPoseAdvisorPanel />);

    expect(screen.getByTestId("studio-char-expression-pose-advisor-panel")).toBeTruthy();
    expect(screen.getByTestId("advisor-approval-badge").textContent).toContain("작가 선택 후 메모리 예제 적용");
    expect(screen.getByTestId("advisor-dialogue-input")).toBeTruthy();
    expect(screen.getByTestId("advisor-intensity-slider")).toBeTruthy();
    expect(screen.getByTestId("advisor-continuity-badge")).toBeTruthy();

    for (const arch of CHARACTER_ARCHETYPES) {
      expect(screen.getByTestId(`advisor-archetype-${arch.id}`)).toBeTruthy();
    }
    for (const prev of PREVIOUS_CUT_PRESETS) {
      expect(screen.getByTestId(`advisor-prev-cut-${prev.id}`)).toBeTruthy();
    }
    for (const rank of [1, 2, 3]) {
      expect(screen.getByTestId(`advisor-proposal-card-${rank}`)).toBeTruthy();
      expect(screen.getByTestId(`advisor-proposal-svg-${rank}`)).toBeTruthy();
      expect(screen.getByTestId(`advisor-proposal-${rank}-bars`)).toBeTruthy();
    }
  });

  it("대사 입력을 바꾸면 감지 감정·입모양 비젬·SVG 속성이 실시간 갱신된다", () => {
    render(<StudioCharExpressionPoseAdvisorPanel />);

    fireEvent.change(screen.getByTestId("advisor-dialogue-input"), {
      target: { value: "결국 혼자 남았네... 미안해ㅠㅠ" },
    });
    expect(screen.getByTestId("advisor-detected-emotion").textContent).toContain("슬픔");
    expect(screen.getByTestId("advisor-detected-viseme").textContent).toContain("ee");
    expect(screen.getByTestId("advisor-proposal-svg-1").getAttribute("data-viseme")).toBe("ee");
  });

  it("캐릭터 성격 전환 및 감정 강도 슬라이더 조작이 추천안과 수치 리드아웃을 즉시 갱신한다", () => {
    render(<StudioCharExpressionPoseAdvisorPanel />);

    fireEvent.click(screen.getByTestId("advisor-archetype-tsundere"));
    expect(screen.getByTestId("advisor-archetype-tsundere").getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByTestId("advisor-intensity-slider"), { target: { value: "2" } });
    expect(screen.getByTestId("advisor-intensity-readout").textContent).toContain("2 / 5");
  });

  it("미리보기 → 1클릭 적용 → 원래대로 되돌리기 흐름이 비파괴적으로 동작하고 콜백을 호출한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioCharExpressionPoseAdvisorPanel onApplyProposal={onApply} onRevertProposal={onRevert} />);

    expect((screen.getByTestId("advisor-revert-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("advisor-preview-btn-1"));
    expect(screen.getByTestId("advisor-session-status-badge").textContent).toContain("미리보기");
    expect(screen.getByTestId("advisor-active-cut-label").textContent).toContain("미리보기");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("advisor-apply-btn-1"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("advisor-session-status-badge").textContent).toContain("적용됨");
    expect((screen.getByTestId("advisor-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("advisor-card-revert-btn-1"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("advisor-session-status-badge").textContent).toContain("되돌림");
    expect((screen.getByTestId("advisor-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("직전 컷 급변 시 연속성 경고 배지와 중간 전환안 1클릭 적용이 동작한다", () => {
    const onApply = vi.fn();
    render(<StudioCharExpressionPoseAdvisorPanel onApplyProposal={onApply} />);

    expect(screen.getByTestId("advisor-continuity-badge").getAttribute("data-severity")).toBe("abrupt-jump");
    fireEvent.click(screen.getByTestId("advisor-bridge-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.variant).toBe("continuity-bridge");

    fireEvent.click(screen.getByTestId("advisor-prev-cut-tense-anger"));
    expect(screen.getByTestId("advisor-continuity-badge").getAttribute("data-severity")).toBe("smooth");
  });

  it("JSON 복사 버튼·미리보기 토글 및 영문 로케일 렌더가 정상 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onExportJson = vi.fn();
    render(<StudioCharExpressionPoseAdvisorPanel locale="en" onExportJson={onExportJson} />);

    expect(screen.getByTestId("advisor-approval-badge").textContent).toContain("Author Choice · In-Memory Example");
    expect(screen.queryByTestId("advisor-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("advisor-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.char-expression-pose-advisor.v1");
    expect(screen.getByTestId("advisor-json-preview").textContent).toContain('"topProposals"');

    await waitFor(() => expect(screen.getByTestId("advisor-copy-status").textContent).toContain("Clipboard copy completed"));
    fireEvent.click(screen.getByTestId("advisor-toggle-json-btn"));
    expect(screen.queryByTestId("advisor-json-preview")).toBeNull();
  });
});

describe("6. 코드 위생 및 Calm Atelier 규율 자가 검증", () => {
  it("4개 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·Web Storage·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "char-expression-pose-engine.ts",
      "StudioCharExpressionPoseAdvisorPanel.tsx",
      "index.ts",
      "char-expression-pose-advisor.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "char-expression-pose-advisor.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioCharExpressionPoseAdvisorPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("작가 선택 후 메모리 예제 적용");
      }
    }
  });
});
