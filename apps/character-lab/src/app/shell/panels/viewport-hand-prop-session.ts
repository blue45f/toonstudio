/** 손 소품 선택·장착·그립 포즈의 UI 세션. 엔진의 실제 setHandProp 계약을 그대로 호출한다. */
import { useState } from "react";

import { isLabFailure } from "../../../contracts";

import { buildHandPropGripPoseCommands, findWebtoonHandPropSpec, toHandPropAttachment } from "./viewport-hand-prop-controls";

import type { CharacterEngine, HandPropId, HandPropSide, LabCommand, Pose } from "../../../contracts";

export function useViewportHandPropSession(
  engine: CharacterEngine | null,
  pose: Pose,
  dispatch: (command: LabCommand) => void,
  setNotice: (notice: string) => void,
) {
  const [handPropId, setHandPropId] = useState<HandPropId | "">("");
  const [handPropSide, setHandPropSide] = useState<HandPropSide>("rightHand");
  const [handPropBusy, setHandPropBusy] = useState(false);
  const onApplyHandProp = async (nextPropId: HandPropId | "", nextSide: HandPropSide): Promise<void> => {
    setHandPropId(nextPropId);
    setHandPropSide(nextSide);
    if (!engine?.setHandProp) return;
    const attachment = nextPropId ? toHandPropAttachment(nextPropId, nextSide) : null;
    setHandPropBusy(true);
    try {
      await engine.setHandProp(attachment);
      const spec = nextPropId ? findWebtoonHandPropSpec(nextPropId) : null;
      setNotice(
        spec
          ? `손 소품 장착: ${spec.labelKo} (${nextSide === "rightHand" ? "오른손" : "왼손"})`
          : "손 소품을 해제했습니다.",
      );
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "손 소품을 장착하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };
  const onApplyHandPropGripPose = (): void => {
    if (!handPropId) return;
    const cmds = buildHandPropGripPoseCommands(pose, handPropId, handPropSide);
    for (const cmd of cmds) dispatch(cmd);
    const spec = findWebtoonHandPropSpec(handPropId);
    if (spec) setNotice(`소품 그립 포즈 적용: ${spec.labelKo} (${handPropSide === "rightHand" ? "오른손" : "왼손"})`);
  };

  return {
    engineReady: Boolean(engine?.setHandProp), propId: handPropId, hand: handPropSide, busy: handPropBusy,
    onSelectProp: (nextPropId: HandPropId | "") => void onApplyHandProp(nextPropId, handPropSide),
    onChangeHand: (nextSide: HandPropSide) => void onApplyHandProp(handPropId, nextSide),
    onApplyGripPose: onApplyHandPropGripPose,
  };
}
