import { findWebtoonHeadPropSpec, findWebtoonStagePropSpec, toHandPropAttachment, toHeadPropAttachment, toStagePropAttachment } from "./viewport-hand-prop-controls";
import { describeHandPropAttachment, failureText } from "./viewport-pane-options";

import type { CharacterEngine, HandPropId, HandPropSide, HeadPropId, StagePropId } from "../../../contracts";

interface ViewportPropActionDeps {
  readonly engine: CharacterEngine | null;
  readonly setHandPropId: (id: HandPropId | "") => void;
  readonly setHandPropSide: (side: HandPropSide) => void;
  readonly setHeadPropId: (id: HeadPropId | "") => void;
  readonly setStagePropId: (id: StagePropId | "") => void;
  readonly setHandPropBusy: (busy: boolean) => void;
  readonly setNotice: (notice: string) => void;
}

/** 선택 상태·비동기 장착·실패 알림 순서를 보존하는 뷰포트 소품 동작. */
export function createViewportPropActions({
  engine,
  setHandPropId,
  setHandPropSide,
  setHeadPropId,
  setStagePropId,
  setHandPropBusy,
  setNotice,
}: ViewportPropActionDeps) {
  const onApplyHandProp = async (nextPropId: HandPropId | "", nextSide: HandPropSide): Promise<void> => {
    setHandPropId(nextPropId);
    setHandPropSide(nextSide);
    if (!engine?.setHandProp) return;
    const attachment = nextPropId ? toHandPropAttachment(nextPropId, nextSide) : null;
    setHandPropBusy(true);
    try {
      await engine.setHandProp(attachment);
      setNotice(describeHandPropAttachment(nextPropId, nextSide));
    } catch (error) {
      setNotice(failureText(error, "손 소품을 장착하지 못했습니다."));
    } finally {
      setHandPropBusy(false);
    }
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

  return { onApplyHandProp, onApplyHeadProp, onApplyStageProp };
}
