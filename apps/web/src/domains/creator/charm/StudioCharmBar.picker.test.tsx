// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { barHarness, resetCharmBarHarness } from "./studio-charm-bar-harness.test-fixture";
import { createStudioCharmId } from "./studio-charm-model";
import { STUDIO_CHARM_STARTER_PACK } from "./studio-charm-starter-pack";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 참 고르기 선택기의 접근성: 권리 요약을 hover(title)에만 두지 않고 키보드·터치로도 볼 수 있게 하고,
 * 고정 상태는 라벨이 아니라 `aria-pressed` 한 곳으로만 전한다.
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const TEAR = createStudioCharmId("emoji", "1f4a7");
const MINE = createStudioCharmId("library", "mine-1");

const mineAsset = {
  id: "mine-1",
  name: "내 손 모양",
  dataUrl: "data:image/png;base64,AAAA",
  width: 120,
  height: 90,
  rights: {
    sourceKind: "uploaded",
    licenseId: "own-work",
    licenseLabel: "직접 그린 그림",
    attributionRequired: false,
    rightsConfirmed: true,
  },
};

beforeEach(() => {
  useI18n.getState().setLang("ko");
  resetCharmBarHarness();
});

afterEach(() => {
  cleanup();
});

async function openPicker(charms: Parameters<typeof barHarness>[0] = [TEAR]) {
  const h = await barHarness(charms);
  h.renderBar({ hostLibrary: { assets: [mineAsset], loaded: true, loading: false } });
  await waitFor(() => expect(screen.getByRole("button", { name: "참 고르기" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
  const dialog = screen.getByRole("dialog", { name: "참 고르기" });
  return { h, dialog };
}

function tile(dialog: HTMLElement, id: string): HTMLButtonElement {
  const found = dialog.querySelector<HTMLButtonElement>(`[data-studio-charm-pick="${id}"]`);
  if (!found) throw new Error(`${id} 타일이 없습니다`);
  return found;
}

/** 분류 칩을 눌러 해당 분류의 타일이 나오게 한다(전체 보기는 처음 60개만 보인다). */
async function showSection(dialog: HTMLElement, name: RegExp, id: string): Promise<HTMLButtonElement> {
  fireEvent.click(within(dialog).getByRole("button", { name }));
  return waitFor(() => tile(dialog, id));
}

describe("참 고르기: 권리 요약을 키보드·터치로도 본다", () => {
  it("각 타일은 권리 요약을 aria-describedby 로 연결한다(title 에만 있지 않다)", async () => {
    const { dialog } = await openPicker();
    // 분류를 바꾸면 이전 타일은 사라지므로 타일마다 그 자리에서 연결된 설명을 읽는다.
    const describedBy = (pick: HTMLButtonElement): string => {
      const id = pick.getAttribute("aria-describedby");
      expect(id, `${pick.dataset.studioCharmPick} 의 설명 연결`).toBeTruthy();
      return document.getElementById(id ?? "")?.textContent ?? "";
    };
    expect(describedBy(await waitFor(() => tile(dialog, FOCUS)))).toContain("ToonStudio 가 코드로 직접 만든 내장 벡터");
    expect(describedBy(await showSection(dialog, /^이모지\s*\d+$/, TEAR))).toContain("이모지 글꼴");
    expect(describedBy(await showSection(dialog, /^내 소재\s*\d+$/, MINE))).toContain("직접 그린 그림");
  });

  it("타일에 포커스를 두면 눈에 보이는 영역에 이름과 권리 요약이 뜬다", async () => {
    const { dialog } = await openPicker();
    const pick = await waitFor(() => tile(dialog, FOCUS));
    const detail = () => dialog.querySelector<HTMLElement>("[data-studio-charm-rights]");
    expect(detail()?.textContent).toContain("항목에 포커스를 두거나 올리면");
    act(() => { pick.focus(); });
    expect(detail()?.textContent).toContain("집중선");
    expect(detail()?.textContent).toContain("ToonStudio 가 코드로 직접 만든 내장 벡터");
    // 눈에 보이는 영역은 접근성 트리에서 숨긴다: 스크린리더는 타일의 aria-describedby 로 읽는다.
    expect(detail()?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.pointerEnter(await showSection(dialog, /^내 소재\s*\d+$/, MINE));
    expect(detail()?.textContent).toContain("내 손 모양");
    expect(detail()?.textContent).toContain("직접 그린 그림");
  });

  it("터치처럼 눌러서 고정해도 그 항목의 권리 요약이 남아 보인다", async () => {
    const { dialog } = await openPicker();
    fireEvent.click(await waitFor(() => tile(dialog, FOCUS)));
    expect(dialog.querySelector("[data-studio-charm-rights]")?.textContent).toContain("집중선");
  });

  it("AI 생성 소재는 요약에 더해 AI 로 표시된다", async () => {
    const h = await barHarness([]);
    h.renderBar();
    fireEvent.click(await screen.findByRole("button", { name: "참 고르기" }));
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^일러스트\s*\d+$/ }));
    const ai = await waitFor(() => {
      const found = dialog.querySelector<HTMLButtonElement>("[data-studio-charm-pick^='raster:']");
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    expect(ai.getAttribute("aria-label")).toContain("AI 생성");
    act(() => { ai.focus(); });
    expect(dialog.querySelector("[data-studio-charm-rights]")?.textContent).toContain("AI 생성");
  });
});

describe("참 고르기: 고정 상태는 aria-pressed 로만 전한다", () => {
  it("라벨은 고정 여부와 상관없이 같고 aria-pressed 만 바뀐다", async () => {
    const { h, dialog } = await openPicker([TEAR]);
    const pick = await waitFor(() => tile(dialog, FOCUS));
    expect(pick.getAttribute("aria-label")).toBe("집중선 — 참 바에 고정");
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pick);
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([TEAR, FOCUS]));
    await waitFor(() => expect(tile(dialog, FOCUS).getAttribute("aria-pressed")).toBe("true"));
    expect(tile(dialog, FOCUS).getAttribute("aria-label")).toBe("집중선 — 참 바에 고정");
  });
});

describe("참 바: 기본 참 안내의 개수", () => {
  it("기본 참을 자동으로 담은 뒤 다른 참을 더 고정해도 안내는 담은 개수(스타터 팩)를 말한다", async () => {
    const h = await barHarness([], { settled: false });
    h.renderBar();
    const note = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-studio-charm-note='starter']");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(note.textContent).toContain(`기본 참 ${STUDIO_CHARM_STARTER_PACK.length}개를 담았어요`);
    h.store.dispatch({ type: "pin", id: MINE });
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toHaveLength(STUDIO_CHARM_STARTER_PACK.length + 1));
    expect(document.querySelector("[data-studio-charm-note='starter']")?.textContent).toContain(
      `기본 참 ${STUDIO_CHARM_STARTER_PACK.length}개를 담았어요`,
    );
  });
});
