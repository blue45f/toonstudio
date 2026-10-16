// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DICT } from "@/shared/lib/i18n-core";
import { useI18n } from "@/shared/lib/i18n";
import { getRuntimeTranslationPendingKeys } from "@/shared/lib/i18n-runtime-translation";

import { announcementText, barHarness, chipButtons, resetCharmBarHarness } from "./studio-charm-bar-harness.test-fixture";
import { createStudioCharmId } from "./studio-charm-model";

/**
 * 참 바 문구가 사용자 소재 이름을 번역 소스로 등록하지 않는지 확인한다.
 *
 * `bi(ko, en)` 은 쌍마다 전역 번역 사전에 키를 등록하고 영문을 기계 번역 소스로 올린다. 그래서 `bi` 의 인자에 내 소재
 * 이름 같은 동적 값을 끼워 넣으면 ① 사용자가 만든 텍스트가 ja 등 다른 언어에서 외부 번역 API 로 나갈 수 있고
 * ② 새 문구마다 전역 번역 갱신(다시 그리기)이 일어난다. 동적 값은 번역된 틀에 자리표시(`{label}`)로 채운다.
 */

const MINE = createStudioCharmId("library", "mine-7");
const MINE_OTHER = createStudioCharmId("library", "mine-8");
const FOCUS = createStudioCharmId("fx", "radial-focus");

const PRIVATE_NAME = "비공개 신작 시안 7";
const OTHER_NAME = "미공개 캐릭터 설정 8";

const privateAsset = { id: "mine-7", name: PRIVATE_NAME, dataUrl: "data:image/png;base64,AAAA", width: 120, height: 90 };
const otherAsset = { id: "mine-8", name: OTHER_NAME, dataUrl: "data:image/png;base64,BBBB", width: 100, height: 100 };
const ASSETS = { assets: [privateAsset, otherAsset], loaded: true, loading: false } as const;

beforeEach(() => {
  useI18n.getState().setLang("ko");
  resetCharmBarHarness();
});

afterEach(() => {
  cleanup();
});

describe("참 바 문구: 내 소재 이름이 번역 소스로 등록되지 않는다(실행 검사)", () => {
  function registeredTexts(): string[] {
    const pending = getRuntimeTranslationPendingKeys("ja").map((key) => DICT.en?.[key] ?? DICT.ko?.[key] ?? "");
    const dictionaries = [DICT.ko, DICT.en].flatMap((dictionary) => Object.values(dictionary ?? {}));
    return [...pending, ...dictionaries];
  }

  function charmKeyCount(): number {
    return Object.keys(DICT.ko ?? {}).filter((key) => key.startsWith("legacyUi.StudioCharmBar.")).length;
  }

  /** 붙이기·순서 편집(고르기·옮기기·빼기)·선택기 고정/해제까지 이름이 문구에 들어가는 길을 모두 지난다. */
  async function exerciseLabelledAnnouncements(): Promise<void> {
    const h = await barHarness([MINE, MINE_OTHER, FOCUS]);
    h.renderBar({ hostLibrary: ASSETS });
    await waitFor(() => expect(chipButtons()).toHaveLength(3));

    fireEvent.click(chipButtons()[0]);
    await waitFor(() => expect(announcementText()).toBe(`붙였어요: ${PRIVATE_NAME}`));

    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "참 바 메뉴" })).getByRole("button", { name: "순서·삭제 편집" }));
    fireEvent.click(chipButtons()[0]);
    expect(announcementText()).toBe(`편집할 참으로 골랐어요: ${PRIVATE_NAME} (1/3)`);
    const group = screen.getByRole("group", { name: "선택한 참 편집" });
    expect(group.textContent).toContain(`선택됨: ${PRIVATE_NAME}`);
    fireEvent.click(within(group).getByRole("button", { name: "뒤로 옮기기" }));
    await waitFor(() => expect(announcementText()).toBe(`2번째로 옮겼어요: ${PRIVATE_NAME} (3개 중)`));
    fireEvent.click(within(group).getByRole("button", { name: "참 바에서 빼기" }));
    await waitFor(() => expect(announcementText()).toBe(`참 바에서 뺐어요: ${PRIVATE_NAME}`));

    fireEvent.click(within(group).getByRole("button", { name: "순서 편집 끝내기" }));
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    const picker = screen.getByRole("dialog", { name: "참 고르기" });
    fireEvent.click(within(picker).getByRole("button", { name: /^내 소재\s*\d+$/ }));
    const pick = await waitFor(() => {
      const found = picker.querySelector<HTMLButtonElement>(`[data-studio-charm-pick="${MINE}"]`);
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.click(pick);
    await waitFor(() => expect(announcementText()).toBe(`참 바에 고정했어요: ${PRIVATE_NAME}`));
    fireEvent.click(pick);
    await waitFor(() => expect(announcementText()).toBe(`참 바에서 뺐어요: ${PRIVATE_NAME}`));
    await act(async () => { await Promise.resolve(); });
  }

  it("내 소재 이름이 든 안내를 모두 띄워도 ja 번역 대기 목록과 사전에 이름이 없다", async () => {
    await exerciseLabelledAnnouncements();
    const leaked = registeredTexts().filter((text) => text.includes(PRIVATE_NAME));
    expect(leaked).toEqual([]);
  });

  it("이름이 달라도 등록되는 문구 수는 늘지 않는다(틀 하나에 값만 바뀐다)", async () => {
    const h = await barHarness([MINE, MINE_OTHER]);
    h.renderBar({ hostLibrary: ASSETS });
    await waitFor(() => expect(chipButtons()).toHaveLength(2));
    fireEvent.click(chipButtons()[0]);
    await waitFor(() => expect(announcementText()).toBe(`붙였어요: ${PRIVATE_NAME}`));
    const afterFirst = charmKeyCount();
    fireEvent.click(chipButtons()[1]);
    await waitFor(() => expect(announcementText()).toBe(`붙였어요: ${OTHER_NAME}`));
    expect(charmKeyCount()).toBe(afterFirst);
    expect(registeredTexts().filter((text) => text.includes(OTHER_NAME))).toEqual([]);
  });

  it("영어 화면에서도 틀은 영문이고 이름은 그대로 채워진다", async () => {
    useI18n.getState().setLang("en");
    const h = await barHarness([MINE]);
    h.renderBar({ hostLibrary: ASSETS });
    const chip = await waitFor(() => {
      const found = within(screen.getByRole("toolbar", { name: "Pinned charms" })).getAllByRole("button");
      expect(found).toHaveLength(1);
      return found[0];
    });
    fireEvent.click(chip);
    await waitFor(() => expect(announcementText()).toBe(`Stamped: ${PRIVATE_NAME}`));
  });
});
