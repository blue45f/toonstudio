// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMERA_COACH_SCENE_PRESETS,
  FOCAL_LENGTH_MAX_MM,
  FOCAL_LENGTH_MIN_MM,
  PITCH_MAX_DEG,
  PITCH_MIN_DEG,
  ROLL_MAX_DEG,
  ROLL_MIN_DEG,
  StudioCameraFramingCoachPanel,
  applyCameraProposal,
  auditCameraContinuity,
  classifyActionHemisphere,
  createCameraCoachSession,
  exportCameraRigJson,
  getCameraCoachScenePreset,
  mirrorYawAcrossActionAxis,
  normalizeYawDeg,
  previewCameraProposal,
  proposeCameraFramingsTop3,
  resetCameraRigFineTune,
  resolveEffectiveCameraView,
  revertCameraProposal,
  shortestYawDeltaDeg,
  toggleAxisCrossSimulation,
  updateCameraRigFineTune,
  type CameraFramingCoachInput,
  type CameraFramingType,
} from "./index";

afterEach(cleanup);

describe("1. 방위각 정규화·반구 판정·축선 대칭 수학", () => {
  it("normalizeYawDeg는 임의 각도를 (-180, 180] 범위로 정규화하고 비정상 입력을 0으로 보정한다", () => {
    expect(normalizeYawDeg(0)).toBe(0);
    expect(normalizeYawDeg(180)).toBe(180);
    expect(normalizeYawDeg(-180)).toBe(180);
    expect(normalizeYawDeg(270)).toBe(-90);
    expect(normalizeYawDeg(-270)).toBe(90);
    expect(normalizeYawDeg(540)).toBe(180);
    expect(normalizeYawDeg(Number.NaN)).toBe(0);
  });

  it("shortestYawDeltaDeg는 180° 경계를 넘는 최단 부호 각도차를 계산한다", () => {
    expect(shortestYawDeltaDeg(50, 120)).toBe(70);
    expect(shortestYawDeltaDeg(170, -170)).toBe(20);
    expect(shortestYawDeltaDeg(-170, 170)).toBe(-20);
  });

  it("classifyActionHemisphere는 front/back/neutral 반구를 정확히 구분한다", () => {
    expect(classifyActionHemisphere(60)).toBe("front");
    expect(classifyActionHemisphere(-60)).toBe("back");
    expect(classifyActionHemisphere(0)).toBe("neutral");
    expect(classifyActionHemisphere(10)).toBe("neutral");
    expect(classifyActionHemisphere(175)).toBe("neutral");
    expect(classifyActionHemisphere(-175)).toBe("neutral");
  });

  it("mirrorYawAcrossActionAxis는 항상 180° 액션 축선 반대편 반구로 방위각을 반전한다", () => {
    expect(mirrorYawAcrossActionAxis(55)).toBe(-55);
    expect(mirrorYawAcrossActionAxis(-120)).toBe(120);
    expect(classifyActionHemisphere(mirrorYawAcrossActionAxis(5))).toBe("back");
    expect(classifyActionHemisphere(mirrorYawAcrossActionAxis(-5))).toBe("front");
  });
});

describe("2. 180° 법칙(Action Axis) 월선 감지 엔진 (auditCameraContinuity)", () => {
  it("동일 반구(front→front)에서 단일 피사체 위치·시선을 유지하면 safe를 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 52,
      nextSubjectSide: "left", nextGazeDirection: "left-to-right", nextShotScale: "closeup", nextCameraYawDeg: 88,
      speakerCount: 1,
    });
    expect(report.status).toBe("safe");
    expect(report.hemisphereCrossed).toBe(false);
    expect(report.eyelineMatched).toBe(true);
    expect(report.absYawDeltaDeg).toBe(36);
    expect(report.reasonKo).toContain("180°");
  });

  it("카메라가 front(+55°)에서 back(-55°)으로 넘어가면 axis-crossed와 교정 방위각을 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 55,
      nextSubjectSide: "right", nextGazeDirection: "right-to-left", nextShotScale: "closeup", nextCameraYawDeg: -55,
      speakerCount: 1,
    });
    expect(report.status).toBe("axis-crossed");
    expect(report.hemisphereCrossed).toBe(true);
    expect(report.eyelineMatched).toBe(false);
    expect(report.recommendedSafeYawDeg).toBeGreaterThan(0);
    expect(report.reasonKo).toContain("반대편 반구");
  });

  it("역반구(back -65° → front +65°) 월선도 대칭적으로 axis-crossed로 감지한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "right", prevGazeDirection: "right-to-left", prevShotScale: "wide", prevCameraYawDeg: -65,
      nextSubjectSide: "right", nextGazeDirection: "right-to-left", nextShotScale: "medium", nextCameraYawDeg: 65,
      speakerCount: 1,
    });
    expect(report.status).toBe("axis-crossed");
    expect(report.prevHemisphere).toBe("back");
    expect(report.nextHemisphere).toBe("front");
    expect(report.recommendedSafeYawDeg).toBeLessThan(0);
  });

  it("각도차가 작더라도(+18° → -18°, Δ36°) 0° 액션 축선을 넘으면 axis-crossed로 판정한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 18,
      nextSubjectSide: "left", nextGazeDirection: "left-to-right", nextShotScale: "medium", nextCameraYawDeg: -18,
      speakerCount: 1,
    });
    expect(report.absYawDeltaDeg).toBe(36);
    expect(report.hemisphereCrossed).toBe(true);
    expect(report.status).toBe("axis-crossed");
  });

  it("카메라가 180° 중립 축선(±12°) 위에 놓이면 warning과 안쪽 보정 방위각을 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 55,
      nextSubjectSide: "left", nextGazeDirection: "left-to-right", nextShotScale: "closeup", nextCameraYawDeg: 6,
      speakerCount: 1,
    });
    expect(report.status).toBe("warning");
    expect(report.onNeutralAxis).toBe(true);
    expect(report.recommendedSafeYawDeg).toBeGreaterThanOrEqual(24);
    expect(report.reasonKo).toContain("중립 축선");
  });

  it("단일 피사체가 좌↔우 반전 및 시선 역전을 동시에 일으키면 axis-crossed를 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 45,
      nextSubjectSide: "right", nextGazeDirection: "right-to-left", nextShotScale: "closeup", nextCameraYawDeg: 75,
      speakerCount: 1, isSameSubjectFocus: true,
    });
    expect(report.status).toBe("axis-crossed");
    expect(report.subjectSideFlipped).toBe(true);
  });

  it("단일 피사체가 같은 반구에서 시선은 유지한 채 좌→우로 급이동하면 warning을 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 50,
      nextSubjectSide: "right", nextGazeDirection: "left-to-right", nextShotScale: "medium", nextCameraYawDeg: 72,
      speakerCount: 1, isSameSubjectFocus: true,
    });
    expect(report.status).toBe("warning");
    expect(report.subjectSideFlipped).toBe(true);
  });

  it("2인 대화 리버스 컷(좌/좌→우 ↔ 우/우→좌)은 동일 반구에서 safe 및 시선 정합(true)으로 판정한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 52,
      nextSubjectSide: "right", nextGazeDirection: "right-to-left", nextShotScale: "medium", nextCameraYawDeg: 124,
      speakerCount: 2, isSameSubjectFocus: false,
    });
    expect(report.status).toBe("safe");
    expect(report.eyelineMatched).toBe(true);
    expect(report.reasonKo).toContain("시선 교차");
  });

  it("2인 리버스 컷에서 좌우 위치만 바뀌고 같은 수평 시선을 유지하면 axis-crossed를 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 50,
      nextSubjectSide: "right", nextGazeDirection: "left-to-right", nextShotScale: "medium", nextCameraYawDeg: 118,
      speakerCount: 2, isSameSubjectFocus: false,
    });
    expect(report.status).toBe("axis-crossed");
    expect(report.eyelineMatched).toBe(false);
  });

  it("동일 반구라도 회전폭이 115° 이상 과도하면 warning을 반환한다", () => {
    const report = auditCameraContinuity({
      prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 22,
      nextSubjectSide: "left", nextGazeDirection: "left-to-right", nextShotScale: "medium", nextCameraYawDeg: 150,
      speakerCount: 1,
    });
    expect(report.status).toBe("warning");
    expect(report.absYawDeltaDeg).toBe(128);
  });
});

describe("3. 비파괴 Top-3 구도 고스트 가이드 제안 엔진 (proposeCameraFramingsTop3)", () => {
  it("항상 중복 없는 3개의 구도를 rank 1·2·3 내림차순 점수로 반환한다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("dialogue-standoff").input);
    expect(top3).toHaveLength(3);
    expect(top3.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(new Set(top3.map((p) => p.framingType)).size).toBe(3);
    expect(top3[0].score).toBeGreaterThanOrEqual(top3[1].score);
    expect(top3[1].score).toBeGreaterThanOrEqual(top3[2].score);
  });

  it("5종 프리셋 전체를 순회하면 6대 카메라 구도 유형이 모두 등장한다", () => {
    const seen = new Set<CameraFramingType>();
    for (const preset of CAMERA_COACH_SCENE_PRESETS) {
      for (const proposal of proposeCameraFramingsTop3(preset.input)) {
        seen.add(proposal.framingType);
      }
    }
    const expected: readonly CameraFramingType[] = [
      "low-angle-closeup", "over-the-shoulder", "dutch-tilt",
      "high-angle-wide", "rule-of-thirds-eye", "eyeline-insert",
    ];
    for (const type of expected) {
      expect(seen.has(type)).toBe(true);
    }
  });

  it("대화 맞대응(confrontation·2인)은 오버더숄더(OTS)를 1순위로 제안하고 2개 인물 앵커를 포함한다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("dialogue-standoff").input);
    expect(top3[0].framingType).toBe("over-the-shoulder");
    expect(top3[0].subjectAnchors.length).toBe(2);
    expect(top3[0].subjectAnchors.some((a) => a.role === "foreground-shoulder")).toBe(true);
  });

  it("충격 반전(reveal·설마?!)은 더치 앵글을 1순위로 제안하고 0이 아닌 롤 각도를 부여한다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("shock-reveal").input);
    expect(top3[0].framingType).toBe("dutch-tilt");
    expect(Math.abs(top3[0].cameraRig.rollDeg)).toBeGreaterThanOrEqual(10);
  });

  it("추격 코너(impact·우→좌)는 로앵글 클로즈업/더치 앵글을 최상위에 두고 음수 롤로 좌향 속도를 살린다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("chase-corner").input);
    const types = top3.map((p) => p.framingType);
    expect(types).toContain("low-angle-closeup");
    expect(types).toContain("dutch-tilt");
    const dutch = top3.find((p) => p.framingType === "dutch-tilt");
    expect(dutch?.cameraRig.rollDeg).toBeLessThan(0);
  });

  it("고백 클로즈업(intimacy·2인)은 인서트 시선 연결을 상위 추천에 포함하고 105mm 초점거리를 제안한다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("confession-closeup").input);
    const insert = top3.find((p) => p.framingType === "eyeline-insert");
    expect(insert).toBeDefined();
    expect(insert?.focalLengthMm).toBe(105);
  });

  it("군중 원경(calm·광장 인파)은 하이앵글 원경과 3분할 아이레벨을 상위에 배치한다", () => {
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("crowd-wide").input);
    const types = top3.map((p) => p.framingType);
    expect(types).toContain("high-angle-wide");
    expect(types).toContain("rule-of-thirds-eye");
  });

  it("직전 컷 방위각이 역반구(-65°)여도 모든 Top-3 제안안은 180° 법칙(safe)을 엄격히 지킨다", () => {
    const input: CameraFramingCoachInput = {
      prevSubjectSide: "right", prevGazeDirection: "right-to-left", prevShotScale: "medium", prevCameraYawDeg: -65,
      dialogueTension: "confrontation", speakerCount: 2, dialogueText: "더 이상 물러설 곳은 없어!",
    };
    const top3 = proposeCameraFramingsTop3(input);
    for (const proposal of top3) {
      expect(proposal.cameraRig.yawDeg).toBeLessThan(0);
      expect(proposal.continuityAudit.status).toBe("safe");
      expect(proposal.continuityAudit.hemisphereCrossed).toBe(false);
    }
  });

  it("모든 제안안의 초점거리·앵커 좌표·시선 벡터·3분할 교점이 정규화 범위 안에 있다", () => {
    for (const preset of CAMERA_COACH_SCENE_PRESETS) {
      for (const p of proposeCameraFramingsTop3(preset.input)) {
        expect(p.focalLengthMm).toBeGreaterThanOrEqual(FOCAL_LENGTH_MIN_MM);
        expect(p.focalLengthMm).toBeLessThanOrEqual(FOCAL_LENGTH_MAX_MM);
        expect(p.thirdsIntersection.x === 0.333 || p.thirdsIntersection.x === 0.667).toBe(true);
        expect(p.thirdsIntersection.y === 0.333 || p.thirdsIntersection.y === 0.667).toBe(true);
        expect(p.gazeVector.fromX).toBeGreaterThanOrEqual(0);
        expect(p.gazeVector.toX).toBeLessThanOrEqual(1);
        for (const anchor of p.subjectAnchors) {
          expect(anchor.x).toBeGreaterThan(0);
          expect(anchor.x).toBeLessThan(1);
          expect(anchor.y).toBeGreaterThan(0);
          expect(anchor.y).toBeLessThan(1);
        }
      }
    }
  });
});

describe("4. 비파괴 상태 머신·미세 조정·JSON 내보내기", () => {
  it("미리보기(previewCameraProposal)는 원본과 현재 스냅샷을 변경하지 않고 토글된다", () => {
    const base = createCameraCoachSession();
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("dialogue-standoff").input);
    const previewing = previewCameraProposal(base, top3[1].id);
    expect(previewing.status).toBe("previewing");
    expect(previewing.previewingProposalId).toBe(top3[1].id);
    expect(previewing.current).toEqual(base.original);
    expect(previewing.appliedProposalId).toBeNull();

    const toggledOff = previewCameraProposal(previewing, top3[1].id);
    expect(toggledOff.status).toBe("idle");
    expect(toggledOff.previewingProposalId).toBeNull();
  });

  it("적용(applyCameraProposal)과 원복(revertCameraProposal)이 원본 스냅샷을 보존하며 정확히 복원한다", () => {
    const base = createCameraCoachSession({
      shotScale: "medium", subjectSide: "left", gazeDirection: "left-to-right",
      rig: { focalLengthMm: 50, yawDeg: 52, pitchDeg: 0, rollDeg: 0 },
    });
    const top3 = proposeCameraFramingsTop3(getCameraCoachScenePreset("shock-reveal").input);
    const tuned = updateCameraRigFineTune(base, { focalLengthMm: 42, rollDeg: 18 });
    const applied = applyCameraProposal(tuned, top3[0]);

    expect(applied.status).toBe("applied");
    expect(applied.appliedProposalId).toBe(top3[0].id);
    expect(applied.current.rig.focalLengthMm).toBe(42);
    expect(applied.current.rig.rollDeg).toBe(18);
    expect(applied.original.rig.focalLengthMm).toBe(50);
    expect(applied.historyCount).toBe(1);

    const reverted = revertCameraProposal(applied);
    expect(reverted.status).toBe("reverted");
    expect(reverted.appliedProposalId).toBeNull();
    expect(reverted.current).toEqual(base.original);
  });

  it("updateCameraRigFineTune은 초점거리(24~135)·피치(-35~35)·롤(-25~25)을 안전 범위로 클램프하고 초기화된다", () => {
    const base = createCameraCoachSession();
    const clamped = updateCameraRigFineTune(base, { focalLengthMm: 999, pitchDeg: -99, rollDeg: 99, yawDeg: 250 });
    expect(clamped.rigOverrides.focalLengthMm).toBe(FOCAL_LENGTH_MAX_MM);
    expect(clamped.rigOverrides.pitchDeg).toBe(PITCH_MIN_DEG);
    expect(clamped.rigOverrides.rollDeg).toBe(ROLL_MAX_DEG);
    expect(clamped.rigOverrides.yawDeg).toBe(-110);

    const low = updateCameraRigFineTune(base, { focalLengthMm: 5, pitchDeg: 80, rollDeg: -80 });
    expect(low.rigOverrides.focalLengthMm).toBe(FOCAL_LENGTH_MIN_MM);
    expect(low.rigOverrides.pitchDeg).toBe(PITCH_MAX_DEG);
    expect(low.rigOverrides.rollDeg).toBe(ROLL_MIN_DEG);

    expect(resetCameraRigFineTune(clamped).rigOverrides).toEqual({});
  });

  it("toggleAxisCrossSimulation과 resolveEffectiveCameraView는 180° 월선 시뮬레이션 시 axis-crossed를 즉시 반영한다", () => {
    const input = getCameraCoachScenePreset("dialogue-standoff").input;
    const top3 = proposeCameraFramingsTop3(input);
    const session = toggleAxisCrossSimulation(createCameraCoachSession(), true);
    const view = resolveEffectiveCameraView(input, top3, session);
    expect(view.continuityAudit.status).toBe("axis-crossed");
    expect(view.continuityAudit.hemisphereCrossed).toBe(true);
    expect(view.rig.yawDeg).toBeLessThan(0);
  });

  it("exportCameraRigJson은 스키마·활성 릭·연속성 감사·Top-3 제안을 포함한 유효 JSON을 생성한다", () => {
    const input = getCameraCoachScenePreset("chase-corner").input;
    const top3 = proposeCameraFramingsTop3(input);
    const session = applyCameraProposal(createCameraCoachSession(), top3[0]);
    const activeView = resolveEffectiveCameraView(input, top3, session);
    const json = exportCameraRigJson({ sceneId: "chase-corner", input, session, activeView, top3 });
    const parsed = JSON.parse(json) as {
      schema: string; sceneId: string; sessionStatus: string;
      activeCameraRig: { focalLengthMm: number; thirdsIntersection: { x: number } };
      continuityAudit: { status: string };
      top3Proposals: { rank: number }[];
    };
    expect(parsed.schema).toBe("toonstudio.camera-framing-continuity-coach.v1");
    expect(parsed.sceneId).toBe("chase-corner");
    expect(parsed.sessionStatus).toBe("applied");
    expect(parsed.activeCameraRig.focalLengthMm).toBe(top3[0].focalLengthMm);
    expect(parsed.continuityAudit.status).toBe("safe");
    expect(parsed.top3Proposals).toHaveLength(3);
  });
});

describe("5. StudioCameraFramingCoachPanel UI 렌더링 및 상호작용", () => {
  it("props 없이 기본 렌더 시 2단 SVG 프리뷰·5종 프리셋·Top-3 카드·승인 배지를 표시한다", () => {
    render(<StudioCameraFramingCoachPanel />);
    expect(screen.getByTestId("studio-camera-framing-coach-panel")).toBeTruthy();
    expect(screen.getByTestId("camera-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("camera-topview-svg")).toBeTruthy();
    expect(screen.getByTestId("camera-frame-ghost-svg")).toBeTruthy();
    expect(screen.getByTestId("camera-continuity-banner").getAttribute("data-status")).toBe("safe");
    for (const preset of CAMERA_COACH_SCENE_PRESETS) {
      expect(screen.getByTestId(`camera-preset-${preset.id}`)).toBeTruthy();
    }
    for (const rank of [1, 2, 3]) {
      expect(screen.getByTestId(`camera-proposal-card-${rank}`)).toBeTruthy();
    }
  });

  it("initialSceneId와 initialTension props가 초기 씬 및 긴장도 상태를 올바르게 설정한다", () => {
    render(<StudioCameraFramingCoachPanel initialSceneId="crowd-wide" initialTension="reveal" />);
    expect(screen.getByTestId("camera-preset-crowd-wide").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("camera-tension-reveal").getAttribute("aria-pressed")).toBe("true");
  });

  it("5종 상황 프리셋 버튼을 클릭하면 대사·긴장도·1순위 구도와 9:16 SVG가 즉시 갱신된다", () => {
    render(<StudioCameraFramingCoachPanel />);
    fireEvent.click(screen.getByTestId("camera-preset-shock-reveal"));
    expect(screen.getByTestId("camera-proposal-card-1").getAttribute("data-framing-type")).toBe("dutch-tilt");
    expect(screen.getByTestId("camera-frame-ghost-svg").getAttribute("data-framing-type")).toBe("dutch-tilt");

    fireEvent.click(screen.getByTestId("camera-preset-crowd-wide"));
    expect(screen.getByTestId("camera-tension-calm").getAttribute("aria-pressed")).toBe("true");
  });

  it("180° 월선 시뮬레이션 토글 시 탑뷰 SVG와 배너가 axis-crossed로 전환되고 자동 보정으로 복구된다", () => {
    render(<StudioCameraFramingCoachPanel />);
    fireEvent.click(screen.getByTestId("camera-simulate-cross-btn"));
    expect(screen.getByTestId("camera-topview-svg").getAttribute("data-continuity-status")).toBe("axis-crossed");
    expect(screen.getByTestId("camera-topview-svg").getAttribute("data-axis-crossed")).toBe("true");
    expect(screen.getByTestId("camera-continuity-banner").getAttribute("data-status")).toBe("axis-crossed");
    expect(screen.getByTestId("camera-continuity-status-text").textContent).toContain("180° 월선");

    fireEvent.click(screen.getByTestId("camera-auto-fix-axis-btn"));
    expect(screen.getByTestId("camera-topview-svg").getAttribute("data-continuity-status")).toBe("safe");
    expect(screen.getByTestId("camera-continuity-banner").getAttribute("data-status")).toBe("safe");
  });

  it("미리보기 → 적용 → 원복 흐름이 비파괴적으로 동작하며 onApply/onRevert 콜백을 정확히 호출한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioCameraFramingCoachPanel onApply={onApply} onRevert={onRevert} />);

    expect((screen.getByTestId("camera-revert-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("camera-preview-btn-2"));
    expect(screen.getByTestId("camera-session-status-badge").textContent).toContain("미리보기");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("camera-apply-btn-2"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("camera-session-status-badge").textContent).toContain("적용됨");
    expect((screen.getByTestId("camera-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("camera-card-revert-btn-2"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("camera-session-status-badge").textContent).toContain("원복됨");
    expect((screen.getByTestId("camera-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("초점거리(24~135mm)·틸트·롤 슬라이더 조작과 초기화 버튼이 9:16 SVG와 리드아웃을 실시간 갱신한다", () => {
    render(<StudioCameraFramingCoachPanel />);
    fireEvent.change(screen.getByTestId("camera-focal-slider"), { target: { value: "120" } });
    fireEvent.change(screen.getByTestId("camera-pitch-slider"), { target: { value: "-22" } });
    fireEvent.change(screen.getByTestId("camera-roll-slider"), { target: { value: "16" } });

    expect(screen.getByTestId("camera-focal-readout").textContent).toBe("120mm");
    expect(screen.getByTestId("camera-pitch-readout").textContent).toBe("-22°");
    expect(screen.getByTestId("camera-roll-readout").textContent).toBe("+16°");
    expect(screen.getByTestId("camera-frame-ghost-svg").getAttribute("data-focal-mm")).toBe("120");
    expect(screen.getByTestId("camera-frame-ghost-svg").getAttribute("data-pitch-deg")).toBe("-22");
    expect(screen.getByTestId("camera-frame-ghost-svg").getAttribute("data-roll-deg")).toBe("16");

    fireEvent.click(screen.getByTestId("camera-reset-finetune-btn"));
    expect(screen.getByTestId("camera-frame-ghost-svg").getAttribute("data-roll-deg")).toBe("0");
  });

  it("직전 컷 컨트롤(방위각·피사체 위치·화자 수)과 대사 입력 변경이 연속성과 Top-3를 즉시 갱신한다", () => {
    render(<StudioCameraFramingCoachPanel />);
    fireEvent.click(screen.getByTestId("camera-speaker-1"));
    fireEvent.change(screen.getByTestId("camera-dialogue-input"), { target: { value: "설마?! 정체가 형이었다고?!" } });
    fireEvent.click(screen.getByTestId("camera-tension-reveal"));
    expect(screen.getByTestId("camera-proposal-card-1").getAttribute("data-framing-type")).toBe("dutch-tilt");

    fireEvent.change(screen.getByTestId("camera-prev-yaw-slider"), { target: { value: "-70" } });
    expect(screen.getByTestId("camera-prev-yaw-readout").textContent).toBe("-70°");
    expect(Number(screen.getByTestId("camera-topview-svg").getAttribute("data-next-yaw"))).toBeLessThan(0);
  });

  it("JSON 내보내기 버튼이 onExportJson을 호출하고 미리보기 드로어를 토글한다", () => {
    const onExportJson = vi.fn();
    render(<StudioCameraFramingCoachPanel onExportJson={onExportJson} />);
    expect(screen.queryByTestId("camera-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("camera-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.camera-framing-continuity-coach.v1");
    expect(screen.getByTestId("camera-json-preview").textContent).toContain('"activeCameraRig"');

    fireEvent.click(screen.getByTestId("camera-toggle-json-btn"));
    expect(screen.queryByTestId("camera-json-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')에서 모든 핵심 라벨과 승인 배지가 영문으로 렌더링된다", () => {
    render(<StudioCameraFramingCoachPanel locale="en" />);
    expect(screen.getByTestId("camera-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.getByTestId("camera-continuity-status-text").textContent).toContain("180° Safe");
  });

  it("렌더링된 모든 button 요소가 min-h-11 터치/포인터 기준을 만족한다", () => {
    const { container } = render(<StudioCameraFramingCoachPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});

describe("6. 하네스·탈-바이올렛·Calm Atelier 코드 위생 자가 검증", () => {
  const dir = path.resolve(import.meta.dirname);
  const ownedFiles = [
    "camera-framing-coach-engine.ts",
    "StudioCameraFramingCoachPanel.tsx",
    "index.ts",
    "camera-framing-coach.test.tsx",
  ];

  it("4개 소유 파일이 모두 존재하며 각각 800줄 이하이다", () => {
    const present = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(present.sort()).toEqual([...ownedFiles].sort());
    for (const file of ownedFiles) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const lineCount = readFileSync(fullPath, "utf8").split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
    }
  });

  it("원시 hex/rgb/hsl·transition-all·Web Storage·private Map store·BigInt·Sparkles·= {} 기본 props가 0건이다", () => {
    for (const file of ownedFiles) {
      if (file === "camera-framing-coach.test.tsx") continue;
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("transition-all");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toContain("Sparkles");
      expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
      expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
    }
  });

  it("모든 OKLCH 색상의 휴(Hue)가 바이올렛 대역(270~320°) 0%이며 UI 접근성·한글 타이포 규율을 충족한다", () => {
    const panelSrc = readFileSync(path.join(dir, "StudioCameraFramingCoachPanel.tsx"), "utf8");
    const oklchMatches = Array.from(panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu));
    expect(oklchMatches.length).toBeGreaterThanOrEqual(8);
    for (const match of oklchMatches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }

    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
    expect(panelSrc).not.toContain("하는 것을 가능하게");
    expect(panelSrc).not.toContain("직관적인 경험을 제공");
    expect(panelSrc).not.toContain("원활한 워크플로우를 보장");
  });
});
