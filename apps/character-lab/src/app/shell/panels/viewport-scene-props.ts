/** 손·머리·무대 소품, 3D 효과음 스탬프, 원클릭 씬 디렉터 및 상대역 자동 캐스팅 동작을 뷰포트에서 분리한다. */
import { useState, useSyncExternalStore } from "react";

import {
  DUO_SHOT_DISTANCES,
  SHAPER_DUO_PARTNER_PROFILES,
  buildDuoEyeContactCommands,
  toDuoPartnerAttachment,
  type DuoShotState,
} from "./viewport-duo-shot-guide";
import {
  buildHandPropGripPoseCommands,
  findWebtoonHandPropSpec,
  findWebtoonHeadPropSpec,
  findWebtoonSfxStampSpec,
  findWebtoonStagePropSpec,
  toHandPropAttachment,
  toHeadPropAttachment,
  toSfxStampAttachment,
  toStagePropAttachment,
} from "./viewport-hand-prop-controls";
import { DEFAULT_MANGA_FX_STATE, type MangaSfxStampPreset, type ViewportMangaFxState } from "./viewport-manga-fx-overlay";
import {
  findWebtoonSceneDirectorPreset,
  getDefaultStripDirectorSession,
  resolveDirectorShadingProfile,
  type WebtoonSceneDirectorPresetId,
} from "./viewport-scene-director";
import { resolveViewportDuoShot } from "./viewport-stage";

import type { CharacterEngine, CharacterRecipe, HandPropId, HandPropSide, HeadPropId, LabCommand, StagePropId } from "../../../contracts";
import type { Dispatch, SetStateAction } from "react";

interface ViewportScenePropsContext {
  readonly engine: CharacterEngine | null;
  readonly recipe: CharacterRecipe;
  readonly getLatestRecipe: () => CharacterRecipe;
  readonly subjectHeightCm: number;
  readonly duoShot: DuoShotState;
  readonly setDuoShot: Dispatch<SetStateAction<DuoShotState>>;
  readonly setDuo3dBusy: Dispatch<SetStateAction<boolean>>;
  readonly dispatch: (command: LabCommand) => void;
  readonly setNotice: (notice: string | null) => void;
  readonly failureText: (error: unknown, fallback: string) => string;
}

export function useViewportSceneProps({
  engine,
  recipe,
  getLatestRecipe,
  subjectHeightCm,
  duoShot,
  setDuoShot,
  setDuo3dBusy,
  dispatch,
  setNotice,
  failureText,
}: ViewportScenePropsContext) {
  const syncDuoPartner3d = async (nextDuoShot: DuoShotState, prevDuoShot: DuoShotState): Promise<void> => {
    if (!engine?.setDuoPartner) return;
    const nextAttachment = toDuoPartnerAttachment(nextDuoShot, subjectHeightCm);
    const prevAttachment = toDuoPartnerAttachment(prevDuoShot, subjectHeightCm);
    if (!nextAttachment && !prevAttachment) return;
    setDuo3dBusy(true);
    try {
      await engine.setDuoPartner(nextAttachment);
      const partner = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === nextDuoShot.partnerId) ?? SHAPER_DUO_PARTNER_PROFILES[0]!;
      setNotice(
        nextAttachment
          ? `3D 듀오 스테이지 배치: ${partner.labelKo} (${DUO_SHOT_DISTANCES[nextDuoShot.distanceKey].labelKo})`
          : "3D 듀오 상대역 배치를 해제했습니다.",
      );
    } catch (error) {
      setNotice(failureText(error, "3D 듀오 상대역 캐릭터를 배치하지 못했습니다."));
    } finally {
      setDuo3dBusy(false);
    }
  };
  const stripDirector = getDefaultStripDirectorSession();
  const activeDirectorId = useSyncExternalStore(
    stripDirector.subscribe,
    () => stripDirector.getState().activeDirectorId,
    () => stripDirector.getState().activeDirectorId,
  );
  const [mangaFx, setMangaFx] = useState<ViewportMangaFxState>(DEFAULT_MANGA_FX_STATE);
  const [sfxBusy, setSfxBusy] = useState(false);
  const [handPropId, setHandPropId] = useState<HandPropId | "">("");
  const [handPropSide, setHandPropSide] = useState<HandPropSide>("rightHand");
  const [headPropId, setHeadPropId] = useState<HeadPropId | "">("");
  const [stagePropId, setStagePropId] = useState<StagePropId | "">("");
  const [handPropBusy, setHandPropBusy] = useState(false);

  const syncSfxStamp3d = async (enabled: boolean, stamp: MangaSfxStampPreset): Promise<void> => {
    if (!engine?.setSfxStamp) return;
    const attachment = enabled && stamp !== "none" ? toSfxStampAttachment(stamp) : null;
    setSfxBusy(true);
    try {
      await engine.setSfxStamp(attachment);
      const spec = enabled && stamp !== "none" ? findWebtoonSfxStampSpec(stamp) : null;
      if (spec) setNotice(`웹툰 효과음 스탬프 적용: ${spec.labelKo}`);
    } catch (error) {
      setNotice(failureText(error, "웹툰 효과음 스탬프를 배치하지 못했습니다."));
    } finally {
      setSfxBusy(false);
    }
  };

  const onToggleMangaFx = (): void => {
    setMangaFx((prev) => {
      const nextEnabled = !prev.enabled;
      if (prev.sfxStamp !== "none") {
        void syncSfxStamp3d(nextEnabled, prev.sfxStamp);
      }
      return { ...prev, enabled: nextEnabled };
    });
  };

  const onChangeMangaSfxStamp = (sfxStamp: MangaSfxStampPreset): void => {
    setMangaFx((prev) => {
      void syncSfxStamp3d(prev.enabled, sfxStamp);
      return { ...prev, sfxStamp };
    });
  };

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
    const cmds = buildHandPropGripPoseCommands(recipe.pose, handPropId, handPropSide);
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

  const castDirectorDuoPartner = async (presetId: WebtoonSceneDirectorPresetId): Promise<void> => {
    const preset = findWebtoonSceneDirectorPreset(presetId);
    if (!preset) return;
    const prevDuo = duoShot;
    const nextDuo: DuoShotState = {
      enabled: true,
      render3dPartner: true,
      partnerId: preset.duoCasting.partnerId,
      side: preset.duoCasting.side,
      distanceKey: preset.duoCasting.distanceKey,
      partnerStance: preset.duoCasting.stance,
      partnerExpression: preset.duoCasting.expression,
      partnerHandPropId: preset.duoCasting.partnerHandPropId,
    };
    setDuoShot(nextDuo);
    stripDirector.update({
      partnerSide: preset.duoCasting.side,
      speakerTargets: preset.speakerTargets,
    });
    const currentRecipe = getLatestRecipe();
    const resolved = resolveViewportDuoShot(currentRecipe, nextDuo);
    for (const cmd of buildDuoEyeContactCommands(currentRecipe.pose, resolved.duoEyeContact, resolved.duoPartner.labelKo)) {
      dispatch(cmd);
    }
    await syncDuoPartner3d(nextDuo, prevDuo);
    setNotice(`씬 디렉터 상대역 자동 캐스팅: ${resolved.duoPartner.labelKo} (${resolved.duoEyeContact.summaryKo})`);
  };

  const onSelectSceneDirector = async (presetId: WebtoonSceneDirectorPresetId | ""): Promise<void> => {
    if (!presetId) {
      setHandPropId("");
      setHeadPropId("");
      setStagePropId("");
      setMangaFx((prev) => ({ ...prev, sfxStamp: "none" }));
      stripDirector.reset();
      if (!engine) return;
      setHandPropBusy(true);
      try {
        if (engine.setHandProp) await engine.setHandProp(null);
        if (engine.setHeadProp) await engine.setHeadProp(null);
        if (engine.setStageProp) await engine.setStageProp(null);
        if (engine.setSfxStamp) await engine.setSfxStamp(null);
        setNotice("원클릭 씬 디렉터를 해제했습니다.");
      } catch (error) {
        setNotice(failureText(error, "씬 디렉터 해제 중 오류가 발생했습니다."));
      } finally {
        setHandPropBusy(false);
      }
      return;
    }

    const preset = findWebtoonSceneDirectorPreset(presetId);
    if (!preset) return;
    const currentLocale = stripDirector.getState().locale;
    setHandPropId(preset.handPropId);
    setHandPropSide(preset.handSide);
    setHeadPropId(preset.headPropId);
    setStagePropId(preset.stagePropId);
    setMangaFx((prev) => ({ ...prev, sfxStamp: preset.sfxStampId }));
    stripDirector.update({
      activeDirectorId: preset.id,
      manuscriptMood: preset.manuscriptMood,
      gutterPaces: preset.gutterPaces,
      actingArc: preset.actingArc,
      bakeStripFx: true,
      stripFxLines: preset.fxLinesKind,
      dialogueLines: preset.dialogueByLocale[currentLocale],
      bubbleShapes: preset.bubbleShapes,
      bubbleFontScales: preset.bubbleFontScales,
      sfxStamps: preset.sfxStamps,
      speakerTargets: preset.speakerTargets,
      cutCameraPresets: preset.cutCameraPresets,
      partnerSide: duoShot.enabled ? duoShot.side : preset.duoCasting.side,
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
      if (engine.setSfxStamp && mangaFx.enabled) await engine.setSfxStamp(toSfxStampAttachment(preset.sfxStampId));
      if (duoShot.enabled && duoShot.render3dPartner) {
        await castDirectorDuoPartner(preset.id);
      } else {
        setNotice(`씬 디렉터 적용: ${preset.labelKo}`);
      }
    } catch (error) {
      setNotice(failureText(error, "원클릭 씬 디렉터 소품 장착에 실패했습니다."));
    } finally {
      setHandPropBusy(false);
    }
  };

  return {
    stripDirector,
    mangaFx,
    setMangaFx,
    sfxBusy,
    onToggleMangaFx,
    onChangeMangaSfxStamp,
    activeDirectorId,
    handPropId,
    handPropSide,
    headPropId,
    stagePropId,
    handPropBusy,
    onApplyHandProp,
    onApplyHandPropGripPose,
    onApplyHeadProp,
    onApplyStageProp,
    castDirectorDuoPartner,
    onSelectSceneDirector,
    syncDuoPartner3d,
  };
}
