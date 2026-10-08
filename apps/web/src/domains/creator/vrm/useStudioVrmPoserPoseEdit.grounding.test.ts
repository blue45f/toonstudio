import { describe, expect, it, vi } from "vitest";

import { applyPoserVisualState } from "./studio-vrm-poser-utils";
import { commitStudioVrmFullStateHistoryTransaction } from "./studio-vrm-state-history";
import { useStudioVrmPoserPoseEdit } from "./useStudioVrmPoserPoseEdit";

import type { StudioVrmPhotoPoseConfidenceSummary } from "./studio-vrm-photo-pose";
import type { StudioVrmPhotoPoseApplyPayload } from "./StudioVrmPhotoPoseScanner";
import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: vi.fn(),
  useRef: <T,>(initial: T) => ({ current: initial }),
}));
vi.mock("./studio-vrm-poser-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-vrm-poser-utils")>(),
  serializeFullVrmState: (value: unknown) => value,
  applyPoserVisualState: vi.fn(),
}));
vi.mock("./studio-vrm-persistent-ik-signature", () => ({ buildStudioVrmPersistentIkSignature: () => "candidate" }));
vi.mock("./studio-vrm-state-history", () => ({
  commitStudioVrmFullStateHistoryTransaction: vi.fn((_history, before, after) => ({ entries: [before, after], index: 1, generation: 1 })),
}));

// 스캐너가 만드는 실제 payload처럼 필수 신뢰도 요약을 싣는다. 2026-09-29 d23dc14bb부터 적용
// 경로가 저신뢰 관절 하이라이트를 위해 confidence.joints를 읽는다. 전 관절 고신뢰라 하이라이트는 없다.
const HIGH_CONFIDENCE: StudioVrmPhotoPoseConfidenceSummary = {
  overall: 0.9, coverage: 0.9, quality: "high", lowConfidenceGroups: [],
  groups: { torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 },
  joints: { leftShoulder: 1, rightShoulder: 1, leftElbow: 1, rightElbow: 1, leftWrist: 1, rightWrist: 1,
    leftHip: 1, rightHip: 1, leftKnee: 1, rightKnee: 1, leftAnkle: 1, rightAnkle: 1 },
};

function photoPosePayload(yOffset: number | undefined): StudioVrmPhotoPoseApplyPayload {
  return { sourceName: "grounding.png", bones: { hips: [0.1, 0, 0] }, landmarks: [], worldLandmarks: [],
    confidence: HIGH_CONFIDENCE, fingerEdits: {}, detectedHandSides: [], yOffset };
}

function fixture() {
  vi.clearAllMocks();
  const before = { yOffset: 0.4, poseTranslations: {}, ikConstraints: [], avatarForge: null };
  const host = { activeModelId: "grounding", customBones: {}, fingerEdits: {}, customYOffset: 0.4,
    poseTranslations: {}, lockedPoseBones: [], vrmPropItems: [], bodyScale: 1, jointLimitsEnabled: false,
    vrmRef: { current: { humanoid: { getNormalizedBoneNode: () => ({}) } } },
    pendingPersistentIkCommandRef: { current: null }, jointIkTransactionRef: { current: null },
    persistentIkResolvedSignatureRef: { current: null }, persistentIkCaptureIsReady: () => true,
    fullStateHistoryRef: { current: { entries: [before], index: 0, generation: 0 } }, captureFullState: () => before,
    setCanUndo: vi.fn(), setCanRedo: vi.fn(), setActivePoseId: vi.fn(), setCustomBones: vi.fn(),
    setFingerEdits: vi.fn(), setCustomYOffset: vi.fn(), setJointHandleStatus: vi.fn(),
    setPhotoPoseLowConfidenceBones: vi.fn(),
  } as unknown as StudioVrmPoserHost;
  useStudioVrmPoserPoseEdit(host);
  return { host, before };
}

describe("grounding root state and history wiring", () => {
  it.each([0.1, undefined])("commits the same root height to history, state and renderer (%s)", (yOffset) => {
    const { host, before } = fixture();
    expect(host.handlePhotoPoseApply(photoPosePayload(yOffset))).toBe(true);
    const expected = yOffset ?? before.yOffset;
    expect(commitStudioVrmFullStateHistoryTransaction).toHaveBeenCalledWith(expect.anything(), before, expect.objectContaining({ yOffset: expected }), "grounding");
    expect(host.setCustomYOffset).toHaveBeenCalledWith(expected);
    expect(applyPoserVisualState).toHaveBeenCalledWith(host.vrmRef.current, expect.objectContaining({ yOffset: expected }));
  });

  it.each([NaN, Infinity, -Infinity])("rejects a non-finite root height before any mutation (%s)", (yOffset) => {
    const { host } = fixture();
    expect(host.handlePhotoPoseApply(photoPosePayload(yOffset))).toBe(false);
    expect(commitStudioVrmFullStateHistoryTransaction).not.toHaveBeenCalled();
    expect(host.setCustomYOffset).not.toHaveBeenCalled();
    expect(applyPoserVisualState).not.toHaveBeenCalled();
  });
});
