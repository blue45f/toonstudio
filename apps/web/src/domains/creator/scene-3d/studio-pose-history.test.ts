import { describe, expect, it } from "vitest";

import {
  canRedoStudioPose,
  canUndoStudioPose,
  createStudioPoseHistory,
  describeStudioPoseHistory,
  recordStudioPoseHistory,
  redoStudioPoseHistory,
  STUDIO_POSE_HISTORY_MAX_DEPTH,
  undoStudioPoseHistory,
  type StudioPoseHistory,
} from "./studio-pose-history";
import {
  createStudioMannequinRestPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

function poseWithSpine(xDeg: number): StudioMannequinPose {
  const rad = (xDeg * Math.PI) / 180;
  return { joints: { spine: [rad, 0, 0] }, pelvisOffset: [0, 0, 0] };
}

describe("studio-pose-history (되돌리기/다시실행)", () => {
  it("빈 히스토리는 되돌리기·다시실행이 불가능하다", () => {
    const history = createStudioPoseHistory();
    expect(canUndoStudioPose(history)).toBe(false);
    expect(canRedoStudioPose(history)).toBe(false);
    expect(undoStudioPoseHistory(history, createStudioMannequinRestPose())).toBeNull();
    expect(redoStudioPoseHistory(history, createStudioMannequinRestPose())).toBeNull();
  });

  it("기록 → 되돌리기 → 다시실행 순서로 포즈가 오간다", () => {
    const rest = createStudioMannequinRestPose();
    const poseA = poseWithSpine(10);
    const poseB = poseWithSpine(30);

    let history: StudioPoseHistory = createStudioPoseHistory();
    history = recordStudioPoseHistory(history, rest);
    history = recordStudioPoseHistory(history, poseA);

    const undone = undoStudioPoseHistory(history, poseB);
    expect(undone).not.toBeNull();
    expect(undone?.pose).toBe(poseA);
    expect(canUndoStudioPose(undone!.history)).toBe(true);
    expect(canRedoStudioPose(undone!.history)).toBe(true);

    const undone2 = undoStudioPoseHistory(undone!.history, undone!.pose);
    expect(undone2?.pose).toBe(rest);
    expect(canUndoStudioPose(undone2!.history)).toBe(false);

    const redone = redoStudioPoseHistory(undone2!.history, undone2!.pose);
    expect(redone?.pose).toBe(poseA);
    const redone2 = redoStudioPoseHistory(redone!.history, redone!.pose);
    expect(redone2?.pose).toBe(poseB);
    expect(canRedoStudioPose(redone2!.history)).toBe(false);
  });

  it("새 결정을 내리면 다시실행 스택이 비워진다", () => {
    const rest = createStudioMannequinRestPose();
    const poseA = poseWithSpine(10);
    const poseB = poseWithSpine(20);
    const poseC = poseWithSpine(40);

    let history = recordStudioPoseHistory(createStudioPoseHistory(), rest);
    const undone = undoStudioPoseHistory(history, poseA);
    expect(canRedoStudioPose(undone!.history)).toBe(true);

    history = recordStudioPoseHistory(undone!.history, poseB);
    expect(canRedoStudioPose(history)).toBe(false);
    expect(canUndoStudioPose(history)).toBe(true);
    // 다시실행 스택이 비워졌으므로 poseA 로는 돌아갈 수 없다.
    const back = undoStudioPoseHistory(history, poseC);
    expect(back?.pose).toBe(poseB);
  });

  it(`최대 ${STUDIO_POSE_HISTORY_MAX_DEPTH}개를 넘지 않는다`, () => {
    let history = createStudioPoseHistory();
    for (let i = 0; i < STUDIO_POSE_HISTORY_MAX_DEPTH + 10; i += 1) {
      history = recordStudioPoseHistory(history, poseWithSpine(i));
    }
    const summary = describeStudioPoseHistory(history);
    expect(summary.undoCount).toBe(STUDIO_POSE_HISTORY_MAX_DEPTH);
    expect(summary.canUndo).toBe(true);
    expect(summary.canRedo).toBe(false);
    expect(summary.redoCount).toBe(0);
  });

  it("상태 요약을 돌려준다", () => {
    const rest = createStudioMannequinRestPose();
    const history = recordStudioPoseHistory(createStudioPoseHistory(), rest);
    expect(describeStudioPoseHistory(history)).toEqual({
      canUndo: true,
      canRedo: false,
      undoCount: 1,
      redoCount: 0,
    });
  });

  it("손 접촉·콘트라포스토 메타데이터를 되돌리기·다시실행 전 구간에서 포즈와 함께 정확히 보존한다", () => {
    const rest = createStudioMannequinRestPose();
    const poseLeftContra = poseWithSpine(12);
    const poseChinContact = poseWithSpine(24);

    let history = createStudioPoseHistory();
    history = recordStudioPoseHistory(history, rest);
    expect("pastMeta" in history).toBe(false);

    history = recordStudioPoseHistory(history, poseLeftContra, {
      contrapposto: "left",
    });
    expect(history.pastMeta).toEqual([undefined, { contrapposto: "left" }]);

    const undone1 = undoStudioPoseHistory(history, poseChinContact, {
      contrapposto: "left",
      handContacts: { right: "chin" },
    });
    expect(undone1?.pose).toBe(poseLeftContra);
    expect(undone1?.meta).toEqual({ contrapposto: "left" });

    const undone2 = undoStudioPoseHistory(undone1!.history, undone1!.pose, undone1!.meta);
    expect(undone2?.pose).toBe(rest);
    expect(undone2?.meta).toBeUndefined();

    const redone1 = redoStudioPoseHistory(undone2!.history, undone2!.pose, undone2!.meta);
    expect(redone1?.pose).toBe(poseLeftContra);
    expect(redone1?.meta).toEqual({ contrapposto: "left" });

    const redone2 = redoStudioPoseHistory(redone1!.history, redone1!.pose, redone1!.meta);
    expect(redone2?.pose).toBe(poseChinContact);
    expect(redone2?.meta).toEqual({
      contrapposto: "left",
      handContacts: { right: "chin" },
    });
  });

  it("몸만 바꾼 단계는 양방향 이력에 별도로 편집한 손가락 상태를 끼워 넣지 않는다", () => {
    const hands = { fingerPose: { right: { index: [12, 30, 42] as const } }, leftSplayDeg: {}, rightSplayDeg: { index: 8 } };
    const handHistory = recordStudioPoseHistory(createStudioPoseHistory(), poseWithSpine(0), { hands });
    const bodyHistory = recordStudioPoseHistory(handHistory, poseWithSpine(12), { contrapposto: "left" });
    const liveHands = { ...hands, leftSplayDeg: { index: -9 } };
    const undone = undoStudioPoseHistory(bodyHistory, poseWithSpine(24), { contrapposto: "right", hands: liveHands });
    if (!undone) throw new Error("몸 포즈의 되돌리기 단계가 없습니다.");
    expect(undone.meta).toEqual({ contrapposto: "left" });
    expect(undone.history.futureMeta).toEqual([{ contrapposto: "right" }]);

    const redone = redoStudioPoseHistory(undone.history, undone.pose, { contrapposto: "left", hands: liveHands });
    expect(redone?.meta).toEqual({ contrapposto: "right" });
    expect(redone?.history.pastMeta).toEqual([{ hands }, { contrapposto: "left" }]);
  });
});
