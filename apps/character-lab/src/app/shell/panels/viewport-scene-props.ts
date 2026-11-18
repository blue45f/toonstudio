import { useState, useSyncExternalStore } from "react";

import { isLabFailure } from "../../../contracts";

import {
  buildHandPropGripPoseCommands, findWebtoonHandPropSpec, findWebtoonHeadPropSpec, findWebtoonStagePropSpec,
  toHandPropAttachment, toHeadPropAttachment, toStagePropAttachment,
} from "./viewport-hand-prop-controls";
import {
  findWebtoonSceneDirectorPreset, getDefaultStripDirectorSession, resolveDirectorShadingProfile,
} from "./viewport-scene-director";

import type { ViewportHandPropControlsProps } from "./viewport-hand-prop-controls";
import type { ViewportSceneDirectorControlsProps, WebtoonSceneDirectorPresetId } from "./viewport-scene-director";
import type { CharacterEngine, CharacterRecipe, HandPropId, HandPropSide, HeadPropId, LabCommand, StagePropId } from "../../../contracts";

interface ViewportScenePropsOptions {
  readonly engine: CharacterEngine | null;
  readonly recipe: Pick<CharacterRecipe, "pose" | "shading">;
  readonly dispatch: (command: LabCommand) => void;
  readonly onNotice: (notice: string) => void;
}

export function failureText(error: unknown, fallback: string): string {
  return isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : fallback;
}

/** 소품 선택과 씬 디렉터가 공유하는 장착 대기·포즈·연출 세션을 함께 관리한다. */
export function useViewportSceneProps({ engine, recipe, dispatch, onNotice }: ViewportScenePropsOptions): {
  readonly handProp: ViewportHandPropControlsProps;
  readonly sceneDirector: ViewportSceneDirectorControlsProps;
} {
  const stripDirector = getDefaultStripDirectorSession();
  const activeDirectorId = useSyncExternalStore(
    stripDirector.subscribe,
    () => stripDirector.getState().activeDirectorId,
    () => stripDirector.getState().activeDirectorId,
  );
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
    const cmds = buildHandPropGripPoseCommands(recipe.pose, handPropId, handPropSide);
    for (const cmd of cmds) dispatch(cmd);
    const spec = findWebtoonHandPropSpec(handPropId);
    if (spec) onNotice(`소품 그립 포즈 적용: ${spec.labelKo} (${handPropSide === "rightHand" ? "오른손" : "왼손"})`);
  };
  const onApplyHeadProp = async (nextHeadPropId: HeadPropId | ""): Promise<void> => {
    setHeadPropId(nextHeadPropId);
    if (!engine?.setHeadProp) return;
    const attachment = nextHeadPropId ? toHeadPropAttachment(nextHeadPropId) : null;
    setHandPropBusy(true);
    try {
      await engine.setHeadProp(attachment);
      const spec = nextHeadPropId ? findWebtoonHeadPropSpec(nextHeadPropId) : null;
      onNotice(spec ? `머리 액세서리 장착: ${spec.labelKo}` : "머리 액세서리를 해제했습니다.");
    } catch (error) {
      onNotice(failureText(error, "머리 액세서리를 장착하지 못했습니다."));
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
      onNotice(spec ? `배경 스테이지 배치: ${spec.labelKo}` : "배경 스테이지를 해제했습니다.");
    } catch (error) {
      onNotice(failureText(error, "배경 스테이지를 배치하지 못했습니다."));
    } finally {
      setHandPropBusy(false);
    }
  };
  const onSelectSceneDirector = async (presetId: WebtoonSceneDirectorPresetId | ""): Promise<void> => {
    if (!presetId) {
      setHandPropId("");
      setHeadPropId("");
      setStagePropId("");
      stripDirector.update({ activeDirectorId: "", actingArc: "none", bakeStripFx: false });
      if (!engine) return;
      setHandPropBusy(true);
      try {
        if (engine.setHandProp) await engine.setHandProp(null);
        if (engine.setHeadProp) await engine.setHeadProp(null);
        if (engine.setStageProp) await engine.setStageProp(null);
        onNotice("원클릭 씬 디렉터를 해제했습니다.");
      } catch (error) {
        onNotice(failureText(error, "씬 디렉터 해제 중 오류가 발생했습니다."));
      } finally {
        setHandPropBusy(false);
      }
      return;
    }

    const preset = findWebtoonSceneDirectorPreset(presetId);
    if (!preset) return;
    setHandPropId(preset.handPropId);
    setHandPropSide(preset.handSide);
    setHeadPropId(preset.headPropId);
    setStagePropId(preset.stagePropId);
    stripDirector.update({
      activeDirectorId: preset.id,
      actingArc: preset.actingArc,
      bakeStripFx: true,
      stripFxLines: preset.fxLinesKind,
      dialogueLines: preset.dialogueLines,
    });

    for (const cmd of buildHandPropGripPoseCommands(recipe.pose, preset.handPropId, preset.handSide)) {
      dispatch(cmd);
    }
    dispatch({
      type: "shading/set",
      profile: resolveDirectorShadingProfile(recipe.shading, preset.toonShaderId),
    });

    if (!engine) return;
    setHandPropBusy(true);
    try {
      if (engine.setHandProp) await engine.setHandProp(toHandPropAttachment(preset.handPropId, preset.handSide));
      if (engine.setHeadProp) await engine.setHeadProp(toHeadPropAttachment(preset.headPropId));
      if (engine.setStageProp) await engine.setStageProp(toStagePropAttachment(preset.stagePropId));
      onNotice(`씬 디렉터 적용: ${preset.labelKo}`);
    } catch (error) {
      onNotice(failureText(error, "원클릭 씬 디렉터 소품 장착에 실패했습니다."));
    } finally {
      setHandPropBusy(false);
    }
  };

  return {
    sceneDirector: {
      engineReady: Boolean(engine?.setHandProp),
      busy: handPropBusy,
      activeDirectorId,
      onSelectDirector: (presetId) => void onSelectSceneDirector(presetId),
    },
    handProp: {
      engineReady: Boolean(engine?.setHandProp), propId: handPropId, hand: handPropSide, busy: handPropBusy,
      headPropId, stagePropId,
      onSelectProp: (nextPropId) => void onApplyHandProp(nextPropId, handPropSide),
      onChangeHand: (nextSide) => void onApplyHandProp(handPropId, nextSide),
      onApplyGripPose: onApplyHandPropGripPose,
      onSelectHeadProp: (nextHeadPropId) => void onApplyHeadProp(nextHeadPropId),
      onSelectStageProp: (nextStagePropId) => void onApplyStageProp(nextStagePropId),
    },
  };
}
