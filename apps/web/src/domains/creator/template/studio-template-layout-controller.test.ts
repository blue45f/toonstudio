import { expect, it, vi } from "vitest";
import { TEMPLATES } from "../studio-assets";
import { useStudioTemplateLayout, type StudioTemplateBackgroundControllerOptions } from "./studio-template-layout-controller";

it.each([true, false])("페이지 템플릿의 컷·치수·배경을 한 번에 적용하며 저장 거절 시 화면 선택을 유지한다 (%s)", async accepted => {
  let serial = 0;
  const options: StudioTemplateBackgroundControllerOptions = {
    elements: [], canvasH: 1080, panelGutter: 12, dialogueScript: "",
    uid: () => String(++serial), setMenu: vi.fn(), setCanvasH: vi.fn(),
    setBg: vi.fn(), setBgGrad: vi.fn(), setCurrentTemplate: vi.fn(),
    commit: vi.fn(() => accepted), undo: vi.fn(), setSelectedId: vi.fn(),
    setError: vi.fn(), announceDrawingShortcut: vi.fn(), comipoActionBusyRef: { current: false },
    captureDeferredComipoAction: vi.fn(), canApplyDeferredComipoAction: () => true,
    markStudioDocumentChanged: () => true,
  };
  const template = TEMPLATES.find(preset => preset.id === "webtoon2")!;
  await useStudioTemplateLayout(options).applyTemplate(template);
  expect(options.commit).toHaveBeenCalledExactlyOnceWith(
    [expect.objectContaining({ type: "frame" }), expect.objectContaining({ type: "frame" })],
    { canvasH: 1280, bg: "#ffffff", bgGrad: null },
  );
  expect(options.setCanvasH).not.toHaveBeenCalled();
  expect(options.setBg).not.toHaveBeenCalled();
  expect(options.setBgGrad).not.toHaveBeenCalled();
  expect(options.setCurrentTemplate).toHaveBeenCalledTimes(accepted ? 1 : 0);
  expect(options.announceDrawingShortcut).toHaveBeenCalledTimes(accepted ? 1 : 0);
});
