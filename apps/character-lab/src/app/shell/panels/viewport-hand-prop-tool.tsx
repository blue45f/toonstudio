import { useState } from "react";

import {
  ViewportHandPropControls, buildHandPropGripPoseCommands, findWebtoonHandPropSpec, toHandPropAttachment,
} from "./viewport-hand-prop-controls";
import { failureText } from "./viewport-status-overlay";

import type { CharacterEngine, HandPropId, HandPropSide, LabCommand, Pose } from "../../../contracts";

interface ViewportHandPropToolProps {
  readonly engine: CharacterEngine | null;
  readonly pose: Pose;
  readonly dispatch: (command: LabCommand) => void;
  readonly onNotice: (notice: string) => void;
}

/** 손 소품의 선택·장착 대기·그립 포즈를 같은 도구 수명 안에서 관리한다. */
export function ViewportHandPropTool({ engine, pose, dispatch, onNotice }: ViewportHandPropToolProps) {
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
      onNotice(
        spec
          ? `손 소품 장착: ${spec.labelKo} (${nextSide === "rightHand" ? "오른손" : "왼손"})`
          : "손 소품을 해제했습니다.",
      );
    } catch (error) {
      onNotice(failureText(error, "손 소품을 장착하지 못했습니다."));
    } finally {
      setHandPropBusy(false);
    }
  };

  const onApplyHandPropGripPose = (): void => {
    if (!handPropId) return;
    const cmds = buildHandPropGripPoseCommands(pose, handPropId, handPropSide);
    for (const cmd of cmds) dispatch(cmd);
    const spec = findWebtoonHandPropSpec(handPropId);
    if (spec) onNotice(`소품 그립 포즈 적용: ${spec.labelKo} (${handPropSide === "rightHand" ? "오른손" : "왼손"})`);
  };

  return (
    <ViewportHandPropControls
      engineReady={Boolean(engine?.setHandProp)}
      propId={handPropId}
      hand={handPropSide}
      busy={handPropBusy}
      onSelectProp={(nextPropId) => void onApplyHandProp(nextPropId, handPropSide)}
      onChangeHand={(nextSide) => void onApplyHandProp(handPropId, nextSide)}
      onApplyGripPose={onApplyHandPropGripPose}
    />
  );
}
