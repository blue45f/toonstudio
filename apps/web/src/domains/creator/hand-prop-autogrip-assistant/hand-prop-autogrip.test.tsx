// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANATOMICAL_JOINT_LIMITS,
  FINGER_IDS,
  GRIP_INTENTS,
  HAND_GRIP_TYPE_LABELS,
  HAND_PROP_CATALOG,
  NEUTRAL_OPEN_HAND_POSE,
  StudioHandPropAutoGripPanel,
  applyHandGripProposal,
  clampHandRigPose,
  createBaselineHandSnapshot,
  createHandGripSessionState,
  evaluateHandPropPoseMetrics,
  exportHandGripRigJson,
  flattenHandJoints15,
  getGripIntentMeta,
  getHandPropSpec,
  previewHandGripProposal,
  proposeHandPropGripsTop3,
  revertHandGripProposal,
  tweakFingerCurl,
  tweakGripTightness,
  tweakWristOrientation,
  type GripIntent,
  type HandGripType,
  type HandPropId,
  type HandSide,
} from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("1. 8종 3D 소품 카탈로그 및 물리 사양 검증", () => {
  it("웹툰 실전 3D 소품 8종과 5종 파지 유형을 모두 포함한다", () => {
    const ids = HAND_PROP_CATALOG.map((p) => p.id);
    expect(ids).toEqual(["mug", "sword", "smartphone", "pen", "umbrella", "teacup", "cane", "letter"]);

    const coveredTypes = new Set<HandGripType>(HAND_PROP_CATALOG.map((p) => p.gripType));
    expect(coveredTypes).toEqual(new Set(["cylindrical", "pinch", "handle", "flat", "precision"]));
  });

  it("모든 소품이 양수 물리 지름·두께·충돌 반경과 2~5 권장 접촉점을 갖는다", () => {
    for (const prop of HAND_PROP_CATALOG) {
      expect(prop.diameterMm).toBeGreaterThan(0);
      expect(prop.thicknessMm).toBeGreaterThan(0);
      expect(prop.collisionRadiusMm).toBeGreaterThan(0);
      expect(prop.recommendedContacts).toBeGreaterThanOrEqual(2);
      expect(prop.recommendedContacts).toBeLessThanOrEqual(5);
      expect(prop.labelKo.length).toBeGreaterThan(1);
      expect(prop.labelEn.length).toBeGreaterThan(1);
      expect(prop.sceneNoteKo.length).toBeGreaterThan(8);
    }
  });

  it("getHandPropSpec이 각 소품의 고유 물리 사양을 반환한다", () => {
    expect(getHandPropSpec("pen").gripType).toBe("precision");
    expect(getHandPropSpec("pen").diameterMm).toBe(11);
    expect(getHandPropSpec("smartphone").gripType).toBe("flat");
    expect(getHandPropSpec("teacup").gripType).toBe("pinch");
    expect(getHandPropSpec("sword").gripType).toBe("cylindrical");
    expect(getHandPropSpec("mug").gripType).toBe("handle");
  });

  it("3종 감정·행동 의도 메타데이터가 모두 정의되어 있다", () => {
    expect(GRIP_INTENTS.map((i) => i.id)).toEqual(["relaxed-hold", "tense-grip", "offering"]);
    for (const item of GRIP_INTENTS) {
      const found = getGripIntentMeta(item.id);
      expect(found.labelKo.length).toBeGreaterThan(2);
      expect(found.summaryKo.length).toBeGreaterThan(10);
    }
  });

  it("5종 파지 유형 라벨이 한/영 모두 비어 있지 않다", () => {
    const types: readonly HandGripType[] = ["cylindrical", "pinch", "handle", "flat", "precision"];
    for (const gripType of types) {
      expect(HAND_GRIP_TYPE_LABELS[gripType].ko.length).toBeGreaterThan(1);
      expect(HAND_GRIP_TYPE_LABELS[gripType].en.length).toBeGreaterThan(1);
    }
  });
});

describe("2. 15관절 손 모델 클램핑 및 결정론적 Top-3 파지 제안", () => {
  it("clampHandRigPose가 극단값·NaN·Infinity 입력을 15관절 해부학적 안전 범위 안으로 클램프한다", () => {
    const clamped = clampHandRigPose({
      fingers: {
        thumb: { mcpDeg: -999, pipDeg: 999, dipDeg: Number.NaN },
        index: { mcpDeg: 400, pipDeg: -50, dipDeg: Number.POSITIVE_INFINITY },
        middle: { mcpDeg: 50, pipDeg: 200, dipDeg: -40 },
        ring: { mcpDeg: -100, pipDeg: 108, dipDeg: 90 },
        pinky: { mcpDeg: 120, pipDeg: 150, dipDeg: 120 },
      },
      thumbOppositionDeg: 150,
      wrist: { flexionDeg: 180, deviationDeg: -90, pronationDeg: 360 },
      tightness: 250,
    });

    for (const finger of FINGER_IDS) {
      const limit = ANATOMICAL_JOINT_LIMITS.fingers[finger];
      expect(clamped.fingers[finger].mcpDeg).toBeGreaterThanOrEqual(limit.mcpDeg.min);
      expect(clamped.fingers[finger].mcpDeg).toBeLessThanOrEqual(limit.mcpDeg.max);
      expect(clamped.fingers[finger].pipDeg).toBeGreaterThanOrEqual(limit.pipDeg.min);
      expect(clamped.fingers[finger].pipDeg).toBeLessThanOrEqual(limit.pipDeg.max);
      expect(clamped.fingers[finger].dipDeg).toBeGreaterThanOrEqual(limit.dipDeg.min);
      expect(clamped.fingers[finger].dipDeg).toBeLessThanOrEqual(limit.dipDeg.max);
    }
    expect(clamped.thumbOppositionDeg).toBe(ANATOMICAL_JOINT_LIMITS.thumbOppositionDeg.max);
    expect(clamped.wrist.flexionDeg).toBe(ANATOMICAL_JOINT_LIMITS.wrist.flexionDeg.max);
    expect(clamped.wrist.deviationDeg).toBe(ANATOMICAL_JOINT_LIMITS.wrist.deviationDeg.min);
    expect(clamped.wrist.pronationDeg).toBe(ANATOMICAL_JOINT_LIMITS.wrist.pronationDeg.max);
    expect(clamped.tightness).toBe(100);
  });

  it("8종 소품 × 좌/우 손 × 3종 의도(48조합) 모두 유효한 Top-3 제안과 안전 관절 각도를 반환한다", () => {
    const sides: readonly HandSide[] = ["left", "right"];
    const intents: readonly GripIntent[] = ["relaxed-hold", "tense-grip", "offering"];

    for (const prop of HAND_PROP_CATALOG) {
      for (const handSide of sides) {
        for (const intent of intents) {
          const bundle = proposeHandPropGripsTop3({ propId: prop.id, handSide, intent });
          expect(bundle.proposals).toHaveLength(3);
          expect(bundle.proposals.map((p) => p.rank)).toEqual([1, 2, 3]);

          for (const proposal of bundle.proposals) {
            expect(proposal.requiresAuthorApproval).toBe(true);
            expect(proposal.contactPoints).toBeGreaterThanOrEqual(2);
            expect(proposal.contactPoints).toBeLessThanOrEqual(5);
            expect(proposal.clearanceScore).toBeGreaterThanOrEqual(0);
            expect(proposal.clearanceScore).toBeLessThanOrEqual(100);
            expect(proposal.silhouetteScore).toBeGreaterThanOrEqual(0);
            expect(proposal.silhouetteScore).toBeLessThanOrEqual(100);
            expect(proposal.descriptionKo.length).toBeGreaterThan(10);

            for (const finger of FINGER_IDS) {
              const limit = ANATOMICAL_JOINT_LIMITS.fingers[finger];
              const j = proposal.pose.fingers[finger];
              expect(j.mcpDeg).toBeGreaterThanOrEqual(limit.mcpDeg.min);
              expect(j.mcpDeg).toBeLessThanOrEqual(limit.mcpDeg.max);
              expect(j.pipDeg).toBeGreaterThanOrEqual(limit.pipDeg.min);
              expect(j.pipDeg).toBeLessThanOrEqual(limit.pipDeg.max);
              expect(j.dipDeg).toBeGreaterThanOrEqual(limit.dipDeg.min);
              expect(j.dipDeg).toBeLessThanOrEqual(limit.dipDeg.max);
            }
          }
        }
      }
    }
  });

  it("동일한 입력 조합에 대해 완전히 결정론적인 Top-3 결과를 생성한다", () => {
    const first = proposeHandPropGripsTop3({ propId: "sword", handSide: "left", intent: "tense-grip" });
    const second = proposeHandPropGripsTop3({ propId: "sword", handSide: "left", intent: "tense-grip" });
    expect(second).toEqual(first);
  });

  it("Top-3 후보(안정 밀착·실루엣 선명·연기 강조)가 서로 구별되는 관절 구성을 가진다", () => {
    const bundle = proposeHandPropGripsTop3({ propId: "mug", handSide: "right", intent: "relaxed-hold" });
    expect(bundle.proposals.map((p) => p.variant)).toEqual([
      "ergonomic-natural",
      "camera-silhouette",
      "expressive-character",
    ]);
    expect(bundle.proposals[1].pose.wrist.pronationDeg).toBeLessThan(bundle.proposals[0].pose.wrist.pronationDeg);
    expect(bundle.proposals[2].pose.fingers.pinky.pipDeg).toBeLessThan(bundle.proposals[0].pose.fingers.pinky.pipDeg);
  });

  it("감정·행동 의도(긴장한 힘 vs 가볍게 쥠 vs 건네기)가 파지 강도와 손목 회내각을 분명히 분화한다", () => {
    const relaxed = proposeHandPropGripsTop3({ propId: "mug", handSide: "right", intent: "relaxed-hold" }).proposals[0];
    const tense = proposeHandPropGripsTop3({ propId: "mug", handSide: "right", intent: "tense-grip" }).proposals[0];
    const offering = proposeHandPropGripsTop3({ propId: "mug", handSide: "right", intent: "offering" }).proposals[0];

    expect(tense.pose.tightness).toBeGreaterThan(relaxed.pose.tightness);
    expect(tense.pose.fingers.index.pipDeg).toBeGreaterThan(relaxed.pose.fingers.index.pipDeg);
    expect(offering.pose.wrist.pronationDeg).toBeLessThan(relaxed.pose.wrist.pronationDeg);
    expect(offering.pose.fingers.pinky.pipDeg).toBeLessThan(tense.pose.fingers.pinky.pipDeg);
  });

  it("소품 물리 특성(장검 원통 vs 찻잔 집게 vs 스마트폰 평면)에 따라 손가락 굴곡과 접촉점이 차별화된다", () => {
    const sword = proposeHandPropGripsTop3({ propId: "sword", handSide: "right", intent: "tense-grip" }).proposals[0];
    const teacup = proposeHandPropGripsTop3({ propId: "teacup", handSide: "right", intent: "relaxed-hold" }).proposals[0];
    const phone = proposeHandPropGripsTop3({ propId: "smartphone", handSide: "right", intent: "relaxed-hold" }).proposals[0];

    expect(sword.pose.fingers.pinky.pipDeg).toBeGreaterThan(teacup.pose.fingers.pinky.pipDeg + 40);
    expect(sword.contactPoints).toBeGreaterThan(teacup.contactPoints);
    expect(phone.pose.fingers.index.mcpDeg).toBeLessThan(sword.pose.fingers.index.mcpDeg - 20);
  });

  it("flattenHandJoints15가 15개 관절을 좌/우 VRM Humanoid 표준 본 이름으로 변환한다", () => {
    const leftJoints = flattenHandJoints15(NEUTRAL_OPEN_HAND_POSE, "left");
    const rightJoints = flattenHandJoints15(NEUTRAL_OPEN_HAND_POSE, "right");

    expect(leftJoints).toHaveLength(15);
    expect(rightJoints).toHaveLength(15);
    expect(leftJoints.every((j) => j.boneName.startsWith("left"))).toBe(true);
    expect(rightJoints.every((j) => j.boneName.startsWith("right"))).toBe(true);
    expect(leftJoints[0]?.boneName).toBe("leftThumbMetacarpal");
    expect(rightJoints[14]?.boneName).toBe("rightLittleDistal");
  });

  it("소품 충돌 반경 대비 손가락을 과도하게 말아 넣으면 clearanceScore가 떨어지고 위험 등급이 올라간다", () => {
    const phone = getHandPropSpec("smartphone");
    const natural = proposeHandPropGripsTop3({ propId: "smartphone", handSide: "right", intent: "relaxed-hold" }).proposals[0];
    let crushed = natural.pose;
    for (const finger of FINGER_IDS) {
      crushed = tweakFingerCurl(crushed, finger, 60);
    }
    const naturalMetrics = evaluateHandPropPoseMetrics(natural.pose, phone, "right", "relaxed-hold");
    const crushedMetrics = evaluateHandPropPoseMetrics(crushed, phone, "right", "relaxed-hold");

    expect(crushedMetrics.clearanceScore).toBeLessThan(naturalMetrics.clearanceScore - 20);
    expect(crushedMetrics.penetrationRisk).toBe("overlap");
  });
});

describe("3. 관절별 미세 보정 (tweakFingerCurl · tweakGripTightness · tweakWristOrientation)", () => {
  it("tweakFingerCurl이 대상 손가락만 불변적으로 보정하고 나머지 4손가락은 유지한다", () => {
    const base = proposeHandPropGripsTop3({ propId: "pen", handSide: "right", intent: "relaxed-hold" }).proposals[0].pose;
    const tweaked = tweakFingerCurl(base, "index", 14);

    expect(tweaked).not.toBe(base);
    expect(tweaked.fingers.index.pipDeg).toBeGreaterThan(base.fingers.index.pipDeg);
    expect(tweaked.fingers.index.mcpDeg).toBeGreaterThan(base.fingers.index.mcpDeg);
    expect(tweaked.fingers.middle).toEqual(base.fingers.middle);
    expect(tweaked.fingers.ring).toEqual(base.fingers.ring);
    expect(tweaked.fingers.pinky).toEqual(base.fingers.pinky);
    expect(tweaked.fingers.thumb).toEqual(base.fingers.thumb);
  });

  it("tweakFingerCurl을 엄지에 적용하면 엄지 대립각도 안전 범위 안에서 연동 변화한다", () => {
    const base = NEUTRAL_OPEN_HAND_POSE;
    const curled = tweakFingerCurl(base, "thumb", 25);
    const overCurled = tweakFingerCurl(base, "thumb", 500);

    expect(curled.thumbOppositionDeg).toBeGreaterThan(base.thumbOppositionDeg);
    expect(overCurled.thumbOppositionDeg).toBeLessThanOrEqual(ANATOMICAL_JOINT_LIMITS.thumbOppositionDeg.max);
    expect(overCurled.fingers.thumb.pipDeg).toBeLessThanOrEqual(ANATOMICAL_JOINT_LIMITS.fingers.thumb.pipDeg.max);
  });

  it("tweakGripTightness가 양수/음수 델타에 따라 5손가락 굴곡과 파지 강도를 연동 보정한다", () => {
    const base = proposeHandPropGripsTop3({ propId: "umbrella", handSide: "right", intent: "relaxed-hold" }).proposals[0].pose;
    const tighter = tweakGripTightness(base, 20);
    const looser = tweakGripTightness(base, -20);

    expect(tighter.tightness).toBeGreaterThan(base.tightness);
    expect(looser.tightness).toBeLessThan(base.tightness);
    expect(tighter.fingers.middle.pipDeg).toBeGreaterThan(base.fingers.middle.pipDeg);
    expect(looser.fingers.middle.pipDeg).toBeLessThan(base.fingers.middle.pipDeg);
  });

  it("tweakWristOrientation이 지정한 축만 패치하고 해부학적 한계 내로 클램프한다", () => {
    const base = NEUTRAL_OPEN_HAND_POSE;
    const patched = tweakWristOrientation(base, { flexionDeg: -999, pronationDeg: 32 });

    expect(patched.wrist.flexionDeg).toBe(ANATOMICAL_JOINT_LIMITS.wrist.flexionDeg.min);
    expect(patched.wrist.deviationDeg).toBe(base.wrist.deviationDeg);
    expect(patched.wrist.pronationDeg).toBe(32);
  });

  it("NaN/Infinity 미세 보정 입력이 들어와도 크래시 없이 유효 각도를 유지한다", () => {
    const base = NEUTRAL_OPEN_HAND_POSE;
    const r1 = tweakFingerCurl(base, "ring", Number.NaN);
    const r2 = tweakGripTightness(base, Number.POSITIVE_INFINITY);

    expect(r1.fingers.ring).toEqual(base.fingers.ring);
    expect(Number.isFinite(r2.tightness)).toBe(true);
    expect(Number.isFinite(r2.fingers.index.pipDeg)).toBe(true);
  });

  it("미세 보정 포즈를 evaluateHandPropPoseMetrics에 넣으면 점수가 즉시 재계산된다", () => {
    const prop = getHandPropSpec("teacup");
    const proposal = proposeHandPropGripsTop3({ propId: "teacup", handSide: "right", intent: "offering" }).proposals[0];
    const tweaked = tweakWristOrientation(tweakFingerCurl(proposal.pose, "pinky", -16), { pronationDeg: -26 });
    const metrics = evaluateHandPropPoseMetrics(tweaked, prop, "right", "offering");

    expect(metrics.contactPoints).toBeGreaterThanOrEqual(2);
    expect(metrics.silhouetteScore).toBeGreaterThanOrEqual(60);
  });
});

describe("4. 비파괴 미리보기·적용·되돌리기 상태 머신 및 3D 리깅 JSON 내보내기", () => {
  it("초기 세션은 idle 상태이며 canRevert=false이고 current와 baseline이 같다", () => {
    const session = createHandGripSessionState(createBaselineHandSnapshot("mug", "right", "relaxed-hold"));
    expect(session.status).toBe("idle");
    expect(session.canRevert).toBe(false);
    expect(session.appliedProposalId).toBeNull();
    expect(session.previewingProposalId).toBeNull();
    expect(session.current).toEqual(session.baseline);
  });

  it("previewHandGripProposal은 baseline과 current를 바꾸지 않고 미리보기만 토글한다", () => {
    const session = createHandGripSessionState();
    const p1 = proposeHandPropGripsTop3({ propId: "mug", handSide: "right", intent: "relaxed-hold" }).proposals[0];

    const previewed = previewHandGripProposal(session, p1.id);
    expect(previewed.status).toBe("previewing");
    expect(previewed.previewingProposalId).toBe(p1.id);
    expect(previewed.canRevert).toBe(false);
    expect(previewed.current).toEqual(session.baseline);

    const toggledOff = previewHandGripProposal(previewed, p1.id);
    expect(toggledOff.status).toBe("idle");
    expect(toggledOff.previewingProposalId).toBeNull();
  });

  it("applyHandGripProposal이 커스텀 미세 보정 포즈를 포함해 current에 적용하고 baseline을 보존한다", () => {
    const base = createHandGripSessionState();
    const proposal = proposeHandPropGripsTop3({ propId: "sword", handSide: "right", intent: "tense-grip" }).proposals[0];
    const tweaked = tweakFingerCurl(proposal.pose, "index", 10);

    const applied = applyHandGripProposal(base, proposal, tweaked);
    expect(applied.status).toBe("applied");
    expect(applied.canRevert).toBe(true);
    expect(applied.appliedProposalId).toBe(proposal.id);
    expect(applied.current.pose).toEqual(tweaked);
    expect(applied.baseline).toEqual(base.baseline);
    expect(applied.history).toHaveLength(1);
  });

  it("여러 번 적용한 뒤 revertHandGripProposal 호출 시 원본 baseline을 완전히 복원한다", () => {
    const base = createHandGripSessionState();
    const bundle = proposeHandPropGripsTop3({ propId: "cane", handSide: "left", intent: "offering" });

    const s1 = applyHandGripProposal(base, bundle.proposals[0]);
    const s2 = applyHandGripProposal(s1, bundle.proposals[2]);
    expect(s2.history).toHaveLength(2);

    const reverted = revertHandGripProposal(s2);
    expect(reverted.status).toBe("reverted");
    expect(reverted.canRevert).toBe(false);
    expect(reverted.appliedProposalId).toBeNull();
    expect(reverted.current).toEqual(base.baseline);
    expect(reverted.history).toHaveLength(3);
  });

  it("미적용 상태에서 revertHandGripProposal을 호출해도 이력을 오염시키지 않는다", () => {
    const base = createHandGripSessionState();
    const reverted = revertHandGripProposal(base);
    expect(reverted.status).toBe("idle");
    expect(reverted.history).toHaveLength(0);
    expect(reverted.current).toEqual(base.baseline);
  });

  it("exportHandGripRigJson이 15관절 본·손 좌우 mirrorSign·충돌 지표·비파괴 정책을 유효 JSON으로 직렬화한다", () => {
    const prop = getHandPropSpec("letter");
    const bundle = proposeHandPropGripsTop3({ propId: "letter", handSide: "left", intent: "offering" });
    const session = applyHandGripProposal(createHandGripSessionState(), bundle.proposals[1]);
    const metrics = evaluateHandPropPoseMetrics(bundle.proposals[1].pose, prop, "left", "offering");

    const raw = exportHandGripRigJson({
      prop,
      handSide: "left",
      intent: "offering",
      pose: bundle.proposals[1].pose,
      metrics,
      session,
      activeProposalId: bundle.proposals[1].id,
    });

    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      nonDestructivePolicy: string;
      handSide: HandSide;
      mirrorSign: number;
      rig15: { jointCount: number; wrist: { boneName: string }; joints: { boneName: string }[] };
      session: { status: string; canRevert: boolean };
    };

    expect(parsed.schemaVersion).toBe("toonstudio.hand-prop-autogrip.v1");
    expect(parsed.nonDestructivePolicy).toBe("author-approval-required");
    expect(parsed.handSide).toBe("left");
    expect(parsed.mirrorSign).toBe(-1);
    expect(parsed.rig15.jointCount).toBe(15);
    expect(parsed.rig15.joints).toHaveLength(15);
    expect(parsed.rig15.wrist.boneName).toBe("leftHand");
    expect(parsed.session.status).toBe("applied");
    expect(parsed.session.canRevert).toBe(true);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});

describe("5. StudioHandPropAutoGripPanel UI 렌더 및 상호작용", () => {
  it("Props 없이 단독 렌더 시 8종 소품·좌우 전환·3종 의도·Top-3 카드·승인 배지를 표시한다", () => {
    render(<StudioHandPropAutoGripPanel />);

    expect(screen.getByTestId("studio-hand-prop-autogrip-panel")).toBeTruthy();
    expect(screen.getByTestId("autogrip-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("예제 기준 유지 중");

    for (const prop of HAND_PROP_CATALOG) {
      expect(screen.getByTestId(`autogrip-prop-${prop.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("autogrip-side-left")).toBeTruthy();
    expect(screen.getByTestId("autogrip-side-right")).toBeTruthy();
    for (const item of GRIP_INTENTS) {
      expect(screen.getByTestId(`autogrip-intent-${item.id}`)).toBeTruthy();
    }
    for (const rank of [1, 2, 3]) {
      expect(screen.getByTestId(`autogrip-proposal-card-${rank}`)).toBeTruthy();
    }
  });

  it("순수 시맨틱 SVG에 15개 관절 노드와 접촉점 하이라이트가 정상 렌더된다", () => {
    render(<StudioHandPropAutoGripPanel />);

    const svg = screen.getByTestId("autogrip-silhouette-svg");
    expect(svg.getAttribute("data-joint-count")).toBe("15");
    for (const finger of FINGER_IDS) {
      expect(screen.getByTestId(`joint-${finger}-mcp`)).toBeTruthy();
      expect(screen.getByTestId(`joint-${finger}-pip`)).toBeTruthy();
      expect(screen.getByTestId(`joint-${finger}-dip`)).toBeTruthy();
    }
    expect(screen.getByTestId("contact-point-thumb")).toBeTruthy();
    expect(screen.getByTestId("contact-point-index")).toBeTruthy();
  });

  it("8종 소품 카드를 선택하면 SVG 소품 외곽선·data-prop-id·상태 배너가 즉시 전환된다", () => {
    render(<StudioHandPropAutoGripPanel />);

    const testOrder: readonly HandPropId[] = ["sword", "smartphone", "pen", "teacup", "letter"];
    for (const id of testOrder) {
      fireEvent.click(screen.getByTestId(`autogrip-prop-${id}`));
      expect(screen.getByTestId(`autogrip-prop-${id}`).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-prop-id")).toBe(id);
      expect(screen.getByTestId("autogrip-silhouette-svg").querySelector(`[data-prop-shape="${id}"]`)).not.toBeNull();
    }
  });

  it("좌/우 손 전환 버튼이 aria-pressed와 SVG 미러링 속성을 즉시 갱신한다", () => {
    render(<StudioHandPropAutoGripPanel />);

    fireEvent.click(screen.getByTestId("autogrip-side-left"));
    expect(screen.getByTestId("autogrip-side-left").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-hand-side")).toBe("left");

    fireEvent.click(screen.getByTestId("autogrip-side-right"));
    expect(screen.getByTestId("autogrip-side-right").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-hand-side")).toBe("right");
  });

  it("감정·행동 의도(긴장한 힘·건네기) 전환 시 파지 강도와 손목 회내각이 실시간 변한다", () => {
    render(<StudioHandPropAutoGripPanel />);

    const relaxedTightness = screen.getByTestId("autogrip-tightness-readout").textContent ?? "";
    fireEvent.click(screen.getByTestId("autogrip-intent-tense-grip"));
    const tenseTightness = screen.getByTestId("autogrip-tightness-readout").textContent ?? "";
    expect(tenseTightness).not.toBe(relaxedTightness);

    fireEvent.click(screen.getByTestId("autogrip-intent-offering"));
    expect(screen.getByTestId("autogrip-intent-offering").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("autogrip-slider-wrist-pronation-readout").textContent).toContain("-");
  });

  it("5손가락 굴곡·파지 강도·손목 각도 슬라이더 조작 시 관절 리드아웃과 SVG가 반응하고 초기화된다", () => {
    render(<StudioHandPropAutoGripPanel />);

    const beforeIndex = screen.getByTestId("autogrip-finger-readout-index").textContent;
    const beforeWrist = screen.getByTestId("autogrip-slider-wrist-flexion-readout").textContent;

    fireEvent.change(screen.getByTestId("autogrip-slider-finger-index"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("autogrip-slider-tightness"), { target: { value: "15" } });
    fireEvent.change(screen.getByTestId("autogrip-slider-wrist-flexion"), { target: { value: "18" } });

    expect(screen.getByTestId("autogrip-finger-readout-index").textContent).not.toBe(beforeIndex);
    expect(screen.getByTestId("autogrip-slider-wrist-flexion-readout").textContent).not.toBe(beforeWrist);

    fireEvent.click(screen.getByTestId("autogrip-reset-tweaks-btn"));
    expect(screen.getByTestId("autogrip-finger-readout-index").textContent).toBe(beforeIndex);
    expect(screen.getByTestId("autogrip-slider-wrist-flexion-readout").textContent).toBe(beforeWrist);
  });

  it("미리보기 → 적용 → 되돌리기 비파괴 흐름과 onApply·onRevert 콜백을 정확히 실행한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioHandPropAutoGripPanel onApply={onApply} onRevert={onRevert} />);

    expect((screen.getByTestId("autogrip-revert-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("autogrip-preview-btn-2"));
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("미리보기");
    expect(screen.getByTestId("autogrip-active-stage-label").textContent).toContain("미리보기");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("autogrip-apply-btn-2"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("적용됨");
    expect((screen.getByTestId("autogrip-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("autogrip-card-revert-btn-2"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("되돌림");
    expect((screen.getByTestId("autogrip-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("3D 리깅 JSON 내보내기 버튼과 미리보기 토글이 onExportJson을 호출하고 15관절 JSON을 표시한다", () => {
    const onExportJson = vi.fn();
    render(<StudioHandPropAutoGripPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("autogrip-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.hand-prop-autogrip.v1");
    expect(screen.getByTestId("autogrip-json-preview").textContent).toContain('"jointCount": 15');

    fireEvent.click(screen.getByTestId("autogrip-toggle-json-btn"));
    expect(screen.queryByTestId("autogrip-json-preview")).toBeNull();
  });

  it("영문 로케일(locale='en') 렌더와 전체 초기화(Reset) 버튼이 정상 동작한다", () => {
    render(
      <StudioHandPropAutoGripPanel
        initialPropId="pen"
        initialHandSide="left"
        initialGripIntent="offering"
        locale="en"
      />,
    );

    expect(screen.getByTestId("autogrip-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-prop-id")).toBe("pen");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-hand-side")).toBe("left");

    fireEvent.click(screen.getByTestId("autogrip-prop-sword"));
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-prop-id")).toBe("sword");

    fireEvent.click(screen.getByTestId("autogrip-reset-btn"));
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-prop-id")).toBe("pen");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-hand-side")).toBe("left");
  });
});

describe("전달 확인과 합성 예제 경계", () => {
  it("고정 예제이며 실제 메시 충돌·원고 저장을 확인하지 않음을 표시하고 내보낸다", () => {
    render(<StudioHandPropAutoGripPanel />);
    expect(screen.getByTestId("autogrip-example-disclosure").textContent).toContain("실제 3D");
    expect(screen.queryByText("관통 없음")).toBeNull();
    fireEvent.click(screen.getByTestId("autogrip-toggle-json-btn"));
    const payload = JSON.parse(screen.getByTestId("autogrip-json-preview").textContent ?? "{}");
    expect(payload.execution).toEqual({ source: "synthetic-catalog", meshCollisionChecked: false, sceneMutationVerified: false, persistenceVerified: false });
    const metrics = evaluateHandPropPoseMetrics(NEUTRAL_OPEN_HAND_POSE, getHandPropSpec("sword"), "right", "relaxed-hold");
    expect(metrics.contactPoints).toBe(0);
  });

  it("비동기 적용 확인 전에는 상태를 확정하거나 중복 요청하지 않는다", async () => {
    let acknowledge: (() => void) | undefined;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    render(<StudioHandPropAutoGripPanel onApply={onApply} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).not.toContain("적용됨");
    expect((screen.getByTestId("autogrip-side-left") as HTMLButtonElement).matches(":disabled")).toBe(true);
    await act(async () => { acknowledge?.(); });
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("적용됨");
  });

  it("반환값을 사용하지 않던 기존 void 콜백 호출자도 계속 동작한다", () => {
    const events: string[] = [];
    render(<StudioHandPropAutoGripPanel onApply={() => events.push("apply")} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    expect(events).toEqual(["apply"]);
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("적용됨");
  });

  it.each(["throw", "reject", "decline", "blank"])("적용 %s 실패를 알리고 같은 버튼으로 최신 콜백에 재시도한다", async (mode) => {
    const failed = vi.fn(() => {
      if (mode === "throw") throw new Error("전달 실패");
      if (mode === "reject") return Promise.reject(new Error("전달 실패"));
      if (mode === "blank") return Promise.reject(new Error(""));
      return { accepted: false, message: "전달 거절" };
    });
    const view = render(<StudioHandPropAutoGripPanel onApply={failed} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).not.toContain("적용됨");
    const accepted = vi.fn(() => ({ accepted: true }));
    view.rerender(<StudioHandPropAutoGripPanel onApply={accepted} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    await waitFor(() => expect(accepted).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("적용됨");
  });

  it("적용 후 초기화도 복원 확인을 기다리며 실패 시 적용 이력을 보존한다", async () => {
    const onRevert = vi.fn().mockRejectedValueOnce(new Error("복원 실패")).mockResolvedValueOnce(undefined);
    render(<StudioHandPropAutoGripPanel onRevert={onRevert} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    fireEvent.click(screen.getByTestId("autogrip-reset-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("autogrip-session-status-badge").textContent).toContain("적용됨");
    expect((screen.getByTestId("autogrip-revert-btn") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("autogrip-reset-btn"));
    await waitFor(() => expect(screen.getByTestId("autogrip-session-status-badge").textContent).not.toContain("적용됨"));
    expect(onRevert).toHaveBeenCalledTimes(2);
  });

  it("적용 후 소품·손·의도를 바꿔도 JSON의 대상과 적용 ID가 섞이지 않는다", () => {
    const onExportJson = vi.fn();
    render(<StudioHandPropAutoGripPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("autogrip-apply-btn-1"));
    fireEvent.click(screen.getByTestId("autogrip-prop-pen"));
    fireEvent.click(screen.getByTestId("autogrip-side-left"));
    fireEvent.click(screen.getByTestId("autogrip-intent-offering"));
    fireEvent.click(screen.getByTestId("autogrip-toggle-json-btn"));
    const payload = JSON.parse(screen.getByTestId("autogrip-json-preview").textContent ?? "{}");
    expect(payload.handSide).toBe("left");
    expect(payload.prop.id).toBe("pen");
    expect(payload.activeProposalId).toContain("grip-pen-left-offering-");
    expect(payload.session.appliedProposalId).toBeNull();
    expect(payload.session.status).not.toBe("applied");
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    const deliveredSession = onExportJson.mock.calls[0]?.[1];
    expect(deliveredSession.current.propId).toBe("pen");
    expect(deliveredSession.current.handSide).toBe("left");
    expect(deliveredSession.appliedProposalId).toBeNull();
    expect(deliveredSession.current.pose.fingers.index.mcpDeg).toBe(payload.rig15.joints.find((joint: { boneName: string }) => joint.boneName === "leftIndexProximal").angleDeg);
    fireEvent.click(screen.getByTestId("autogrip-revert-btn"));
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-hand-side")).toBe("right");
    expect(screen.getByTestId("autogrip-silhouette-svg").getAttribute("data-prop-id")).toBe("mug");
  });

  it("클립보드 거부를 성공으로 표시하지 않고 미리보기와 복사 재시도를 제공한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("복사 권한 없음")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioHandPropAutoGripPanel />);
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("autogrip-json-preview")).toBeTruthy();
    expect(screen.queryByText(/복사했습니다/)).toBeNull();
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("복사했습니다"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("전달 콜백이 거절하면 복사를 중복 실행하지 않는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onExportJson = vi.fn().mockResolvedValue({ accepted: false, message: "받는 쪽에서 거절했습니다" });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioHandPropAutoGripPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("클립보드가 없으면 성공 대신 미리보기에서 직접 복사하도록 안내한다", async () => {
    vi.stubGlobal("navigator", {});
    render(<StudioHandPropAutoGripPanel />);
    fireEvent.click(screen.getByTestId("autogrip-export-json-btn"));
    expect((await screen.findByRole("alert")).textContent).toContain("직접 복사");
    expect(screen.getByTestId("autogrip-json-preview")).toBeTruthy();
  });
});

describe("6. 코드 위생 · Calm Atelier · 탈-바이올렛 하네스 계약 자가 검증", () => {
  it("모듈 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·Web Storage·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "hand-prop-autogrip-engine.ts",
      "StudioHandPropAutoGripPanel.tsx",
      "index.ts",
      "hand-prop-autogrip.test.tsx",
      "use-hand-grip-delivery.ts",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(5);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "hand-prop-autogrip.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioHandPropAutoGripPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
        expect(src).toContain("oklch(");
        expect(src).toContain("currentColor");
      }
    }
  });

  it("모든 oklch(...) 색상이 바이올렛 대역(270~320°)을 완전히 배제한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const panelSrc = readFileSync(path.join(dir, "StudioHandPropAutoGripPanel.tsx"), "utf8");
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const hue = Number(match[1]);
      expect(Number.isFinite(hue)).toBe(true);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });
});
