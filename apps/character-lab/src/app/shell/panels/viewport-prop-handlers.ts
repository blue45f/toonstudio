import {
  buildHandPropGripPoseCommands, findWebtoonHandPropSpec, findWebtoonHeadPropSpec, findWebtoonStagePropSpec,
  toHandPropAttachment, toHeadPropAttachment, toStagePropAttachment,
} from "./viewport-hand-prop-controls";
import { failureText } from "./viewport-pane-helpers";

import type { CharacterEngine, HandPropId, HandPropSide, HeadPropId, LabCommand, Pose, StagePropId } from "../../../contracts";

interface ViewportPropHandlerOptions {
  readonly engine: CharacterEngine | null;
  readonly pose: Pose;
  readonly dispatch: (command: LabCommand) => void;
  readonly handPropId: HandPropId | "";
  readonly handPropSide: HandPropSide;
  readonly setHandPropId: (value: HandPropId | "") => void;
  readonly setHandPropSide: (value: HandPropSide) => void;
  readonly setHeadPropId: (value: HeadPropId | "") => void;
  readonly setStagePropId: (value: StagePropId | "") => void;
  readonly setHandPropBusy: (value: boolean) => void;
  readonly setNotice: (value: string) => void;
}

export function createViewportPropHandlers({
  engine, pose, dispatch, handPropId, handPropSide,
  setHandPropId, setHandPropSide, setHeadPropId, setStagePropId, setHandPropBusy, setNotice,
}: ViewportPropHandlerOptions) {
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
      setNotice(failureText(error, "손 소품을 장착하지 못했습니다."));
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
      setNotice(failureText(error, "머리 액세서리를 장착하지 못했습니다."));
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
      setNotice(failureText(error, "배경 스테이지를 배치하지 못했습니다."));
    } finally {
      setHandPropBusy(false);
    }
  };

  return { onApplyHandProp, onApplyHandPropGripPose, onApplyHeadProp, onApplyStageProp };
}
