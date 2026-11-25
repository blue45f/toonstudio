// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  StudioCameraFramingCoachPanel,
  auditCameraContinuity,
  createCameraCoachSession,
  exportCameraRigJson,
  getCameraCoachScenePreset,
  proposeCameraFramingsTop3,
  resolveEffectiveCameraView,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("정렬할 수 없는 방위각과 지원 길이를 넘는 대사를 계산에서 거부한다", () => {
  const input = getCameraCoachScenePreset().input;
  expect(() => auditCameraContinuity({
    ...input, nextCameraYawDeg: NaN, nextSubjectSide: "left", nextGazeDirection: "camera",
  })).toThrow();
  expect(() => proposeCameraFramingsTop3({ ...input, dialogueText: "가".repeat(8193) })).toThrow();
});

it("JSON은 원문을 보존하며 비유한 좌표와 중복 제안을 거부한다", () => {
  const preset = getCameraCoachScenePreset();
  const input = { ...preset.input, dialogueText: "  첫 줄\n둘째 줄 🤝  " };
  const session = createCameraCoachSession();
  const top3 = proposeCameraFramingsTop3(input);
  const activeView = resolveEffectiveCameraView(input, top3, session);
  const payload = { sceneId: preset.id, input, session, top3, activeView };
  expect(JSON.parse(exportCameraRigJson(payload)).dialogueIntent.dialogueText).toBe(input.dialogueText);
  expect(() => exportCameraRigJson({
    ...payload, activeView: { ...activeView, rig: { ...activeView.rig, yawDeg: Infinity } },
  })).toThrow();
  const [firstProposal] = top3;
  if (!firstProposal) throw new Error("카메라 제안이 없습니다.");
  expect(() => exportCameraRigJson({ ...payload, top3: [...top3, firstProposal] })).toThrow();
});

it("직전 컷 조건을 바꾸면 예전 제안의 미리보기를 해제한다", () => {
  render(<StudioCameraFramingCoachPanel />);
  const preview = screen.getByTestId("camera-preview-btn-1");
  fireEvent.click(preview);
  expect(preview.getAttribute("aria-pressed")).toBe("true");
  fireEvent.change(screen.getByTestId("camera-dialogue-input"), { target: { value: "새 대사" } });
  expect(screen.getByTestId("camera-preview-btn-1").getAttribute("aria-pressed")).toBe("false");
});

it("복사 실패와 전달 성공을 분리하고 같은 JSON을 다시 복사한다", async () => {
  const clipboard = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValueOnce(undefined);
  const recipient = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
  render(<StudioCameraFramingCoachPanel onExportJson={recipient} />);
  fireEvent.click(screen.getByTestId("camera-copy-json-btn"));
  await screen.findByTestId("camera-retry-clipboard");
  expect(recipient).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId("camera-retry-clipboard"));
  await waitFor(() => expect(screen.getByTestId("camera-delivery-clipboard").textContent).toContain("복사 완료"));
  expect(clipboard).toHaveBeenCalledTimes(2);
  expect(clipboard.mock.calls[0]?.[0]).toBe(clipboard.mock.calls[1]?.[0]);
  expect(recipient).toHaveBeenCalledTimes(1);
});
