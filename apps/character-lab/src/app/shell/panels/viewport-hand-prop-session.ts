/** 손·머리·배경 소품 선택과 그립 포즈의 UI 세션. 엔진의 실제 장착 계약을 그대로 호출한다. */
import { useState } from "react";

import { isLabFailure } from "../../../contracts";

import {
  buildHandPropGripPoseCommands, findWebtoonHandPropSpec, findWebtoonHeadPropSpec, findWebtoonStagePropSpec,
  toHandPropAttachment, toHeadPropAttachment, toStagePropAttachment,
} from "./viewport-hand-prop-controls";

import type { ViewportHandPropControlsProps } from "./viewport-hand-prop-controls";
import type { CharacterEngine, HandPropId, HandPropSide, HeadPropId, LabCommand, Pose, StagePropId } from "../../../contracts";

export function useViewportHandPropSession(
  engine: CharacterEngine | null,
  pose: Pose,
  dispatch: (command: LabCommand) => void,
  setNotice: (notice: string) => void,
): ViewportHandPropControlsProps {
  const [handPropId, setHandPropId] = useState<HandPropId | "">("");
  const [handPropSide, setHandPropSide] = useState<HandPropSide>("rightHand");
  const [headPropId, setHeadPropId] = useState<HeadPropId | "">("");
  const [stagePropId, setStagePropId] = useState<StagePropId | "">("");
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
  const onApplyHeadProp = async (nextHeadPropId: HeadPropId | ""): Promise<void> => {
    setHeadPropId(nextHeadPropId);
    if (!engine?.setHeadProp) return;
    const attachment = nextHeadPropId ? toHeadPropAttachment(nextHeadPropId) : null;
    setHandPropBusy(true);
    try {
      await engine.setHeadProp(attachment);
      const spec = nextHeadPropId ? findWebtoonHeadPropSpec(nextHeadPropId) : null;
      setNotice(spec ? `머리 액세서리 장착: ${spec.labelKo}` : "머리 액세서리를 해제했습니다.");
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "머리 액세서리를 장착하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };
  const onApplyStageProp = async (nextStagePropId: StagePropId | ""): Promise<void> => {
    setStagePropId(nextStagePropId);
    if (!engine?.setStageProp) return;
    const attachment = nextStagePropId ? toStagePropAttachment(nextStagePropId) : null;
    setHandPropBusy(true);
    try {
      await engine.setStageProp(attachment);
      const spec = nextStagePropId ? findWebtoonStagePropSpec(nextStagePropId) : null;
      setNotice(spec ? `배경 스테이지 배치: ${spec.labelKo}` : "배경 스테이지를 해제했습니다.");
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "배경 스테이지를 배치하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };

  return {
    engineReady: Boolean(engine?.setHandProp), propId: handPropId, hand: handPropSide, busy: handPropBusy,
    headPropId, stagePropId,
    onSelectProp: (nextPropId: HandPropId | "") => void onApplyHandProp(nextPropId, handPropSide),
    onChangeHand: (nextSide: HandPropSide) => void onApplyHandProp(handPropId, nextSide),
    onApplyGripPose: onApplyHandPropGripPose,
    onSelectHeadProp: (nextHeadPropId: HeadPropId | "") => void onApplyHeadProp(nextHeadPropId),
    onSelectStageProp: (nextStagePropId: StagePropId | "") => void onApplyStageProp(nextStagePropId),
  };
}
