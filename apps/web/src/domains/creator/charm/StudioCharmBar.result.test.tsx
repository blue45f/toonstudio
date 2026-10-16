// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import { announcementText, barHarness, chipButtons, resetCharmBarHarness } from "./studio-charm-bar-harness.test-fixture";
import { createStudioCharmId } from "./studio-charm-model";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 붙이기 결과 안내가 정직한지 확인한다.
 *
 * 호스트의 이모지·말풍선·효과음 명령은 성공 여부를 돌려주지 않는다(`void`). 그래서 호스트가 잠금·저장 중으로 거절했는데도
 * "붙였어요"라고 알리면 거짓이 된다 — 성공 신호가 없는 명령은 "요청했어요"라고 알린다. 거절(`false`)도 이유가 잠금·저장 중만은
 * 아니다(일러스트 네트워크 실패, 이미 진행 중인 삽입). 그리고 알림이 스크린리더 전용이면 시각 사용자는 실패를 알 수 없어서,
 * 요청·거절·실패는 눈에 보이는 안내로도 띄운다(같은 문장은 스크린리더가 상태 영역으로 읽으므로 보이는 쪽은 숨긴다).
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const TEAR = createStudioCharmId("emoji", "1f4a7");
const SPEECH = createStudioCharmId("bubble", "speech");
const SFX = createStudioCharmId("sfx", "sfx-kwang");

function resultNote(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-studio-charm-note='result']");
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  resetCharmBarHarness();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("참 바: 붙이기 결과 안내", () => {
  it("호스트가 성공을 확인해 준 이미지는 '붙였어요'이고 눈에 보이는 경고는 없다", async () => {
    const h = await barHarness([FOCUS]);
    h.renderBar();
    await waitFor(() => expect(chipButtons()).toHaveLength(1));
    fireEvent.click(chipButtons()[0]);
    await waitFor(() => expect(announcementText()).toBe("붙였어요: 집중선"));
    expect(resultNote()).toBeNull();
  });

  it("성공 신호가 없는 이모지·말풍선·효과음은 '붙였어요' 대신 '요청했어요'로 알리고 눈에 보이게도 띄운다", async () => {
    const h = await barHarness([TEAR, SPEECH, SFX]);
    h.renderBar();
    await waitFor(() => expect(chipButtons()).toHaveLength(3));
    for (const [index, label] of ["눈물·물방울", "말풍선 · 말하기"].entries()) {
      fireEvent.click(chipButtons()[index]);
      await waitFor(() => expect(announcementText()).toContain("요청했어요"));
      expect(announcementText()).toContain(label);
      expect(announcementText()).not.toContain("붙였어요");
      expect(announcementText()).toContain("잠금이나 저장 중");
      const note = resultNote();
      expect(note?.textContent).toContain(label);
      expect(note?.textContent).toContain("요청");
      // 보이는 쪽은 숨긴다: 같은 문장을 스크린리더가 상태 영역으로 이미 읽는다.
      expect(note?.getAttribute("aria-hidden")).toBe("true");
    }
    fireEvent.click(chipButtons()[2]);
    await waitFor(() => expect(announcementText()).toContain("요청했어요"));
    expect(h.commands.addSfxPreset).toHaveBeenCalledTimes(1);
  });

  it("호스트가 거절하면 잠금·저장 중만이 아니라 진행 중인 삽입과 네트워크도 이유로 알리고 눈에 보이게 띄운다", async () => {
    const asset = STUDIO_RASTER_ASSETS[0];
    const h = await barHarness([createStudioCharmId("raster", asset.id), FOCUS]);
    h.spies.addBuiltinRasterAsset.mockResolvedValueOnce(false);
    h.spies.addRenderedImage.mockReturnValueOnce(false);
    h.renderBar();
    await waitFor(() => expect(chipButtons()).toHaveLength(2));
    for (const index of [0, 1]) {
      fireEvent.click(chipButtons()[index]);
      await waitFor(() => expect(announcementText()).toContain("붙이지 못했어요"));
      expect(announcementText()).toContain("네트워크");
      expect(announcementText()).toContain("저장 중");
      expect(announcementText()).toContain("다른 삽입");
      expect(resultNote()?.textContent).toContain("붙이지 못");
      expect(resultNote()?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("호스트 명령이 예외를 던지면 그 메시지를 알리고 눈에 보이게 띄운다", async () => {
    const h = await barHarness([FOCUS]);
    h.spies.addRenderedImage.mockImplementationOnce(() => { throw new Error("저장 중이라 붙일 수 없어요"); });
    h.renderBar();
    await waitFor(() => expect(chipButtons()).toHaveLength(1));
    fireEvent.click(chipButtons()[0]);
    await waitFor(() => expect(announcementText()).toBe("저장 중이라 붙일 수 없어요"));
    expect(resultNote()?.textContent).toContain("저장 중이라 붙일 수 없어요");
  });

  it("눈에 보이는 안내는 다음 붙이기가 성공하면 사라진다", async () => {
    const h = await barHarness([FOCUS, TEAR]);
    h.renderBar();
    await waitFor(() => expect(chipButtons()).toHaveLength(2));
    fireEvent.click(chipButtons()[1]);
    await waitFor(() => expect(resultNote()).not.toBeNull());
    fireEvent.click(chipButtons()[0]);
    await waitFor(() => expect(announcementText()).toBe("붙였어요: 집중선"));
    expect(resultNote()).toBeNull();
  });

  it("눈에 보이는 안내는 몇 초 뒤에 저절로 사라진다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await barHarness([TEAR]);
    h.renderBar();
    expect(chipButtons()).toHaveLength(1);
    fireEvent.click(chipButtons()[0]);
    await act(async () => { await Promise.resolve(); });
    expect(resultNote()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(resultNote()).toBeNull();
    // 스크린리더용 상태 영역의 문장은 남아 다시 읽을 수 있다.
    expect(announcementText()).toContain("요청했어요");
  });

  it("영어 화면에서는 영어 문구로 알린다", async () => {
    useI18n.getState().setLang("en");
    const h = await barHarness([TEAR]);
    h.renderBar();
    const chip = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: "눈물·물방울" });
      expect(found).toHaveLength(1);
      return found[0];
    });
    fireEvent.click(chip);
    await waitFor(() => expect(announcementText()).toContain("Requested stamping 눈물·물방울"));
    expect(resultNote()?.textContent).toContain("Requested");
  });
});
