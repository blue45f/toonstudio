import { describe, expect, it, vi } from "vitest";

import { createStudioAiComicDirectorSession, loadStudioAiComicDirectorSession, studioAiComicDirectorStorageKey } from "./studio-ai-comic-director-session";
import { StudioDirectorDraftSync } from "./studio-director-draft-sync";

function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const initial = createStudioAiComicDirectorSession({ id: "story", title: "첫 화", storyText: "원본" });
  const key = studioAiComicDirectorStorageKey(initial.id);
  const write = async (expected: string | null, raw: string) => {
    expect(storage.getItem(key)).toBe(expected);
    storage.setItem(key, raw);
  };
  const draft = new StudioDirectorDraftSync(initial, null, write);
  const reopen = () => new StudioDirectorDraftSync(loadStudioAiComicDirectorSession(storage, initial.id)!, storage.getItem(key), write);
  return { initial, storage, draft, reopen };
}

describe("콘티의 로컬 대본과 클라우드 revision", () => {
  it("조회 중 입력한 대본을 보존하고 충돌 상태에서는 명시적으로 서버본을 다시 열 수 있다", async () => {
    const { initial, draft, reopen } = setup();
    draft.edit({ storyText: "입력 중인 대사" });
    const remote = { ...initial, revision: 4, storyText: "협업자가 쓴 대사" };
    expect(draft.receive("read", initial, remote)).toBe("conflict");
    await draft.persist();
    expect(reopen().current.storyText).toBe("입력 중인 대사");
    expect(draft.receive("reload", draft.current, remote)).toBe("saved");
    await draft.persist();
    expect(reopen().current.storyText).toBe("협업자가 쓴 대사");
  });

  it("저장 요청 뒤 입력을 보존하고 다시 열어 마지막 수정만 추가 저장한다", async () => {
    const { initial, draft, reopen } = setup();
    draft.receive("read", initial, initial);
    draft.edit({ storyText: "1차 대본" });
    const sent = draft.current;
    draft.edit({ storyText: "2차 대본" });
    const ack = { ...sent, revision: 2 };
    expect(draft.receive("save", sent, ack)).toBe("local");
    await draft.persist();
    const reopened = reopen();
    expect(reopened.receive("read", reopened.current, ack)).toBe("local");
    expect(reopened.current.storyText).toBe("2차 대본");
    expect(reopened.receive("save", reopened.current, { ...reopened.current, revision: 3 })).toBe("saved");
    await reopened.persist();
    expect(reopen().current.storyText).toBe("2차 대본");
  });

  it("보관 중 서버가 다른 클라우드 revision을 저장하면 양쪽 원본을 구분한다", async () => {
    const { initial, draft, reopen } = setup();
    draft.receive("read", initial, initial);
    draft.edit({ storyText: "내 대사" });
    await draft.persist();
    const reopened = reopen();
    expect(reopened.receive("read", reopened.current, { ...initial, storyText: "팀 대사", revision: 2 })).toBe("conflict");
    expect(reopened.current.storyText).toBe("내 대사");
    expect(reopened.conflicted).toBe(true);
  });

  it("저장소가 가득 차도 입력을 유지하고 저장 실패를 표시한다", async () => {
    const { initial } = setup();
    const draft = new StudioDirectorDraftSync(initial, null, async () => { throw new Error("quota"); });
    draft.edit({ storyText: "복사할 수 있는 대본" });
    expect(await draft.persist()).toBe(false);
    expect(draft.storageFailed).toBe(true);
    expect(draft.current.storyText).toBe("복사할 수 있는 대본");
  });
});

it("이름이 같은 다른 작품·리믹스의 서버 응답은 현재 대본을 바꾸지 않는다", () => {
  const { draft, initial } = setup();
  for (const scope of [{ workId: "other" }, { remixSourceWorkId: "other" }]) {
    expect(() => draft.receive("read", initial, { ...initial, ...scope, storyText: "다른 원고" })).toThrow("다른 작품");
    expect(draft.current).toBe(initial);
  }
});

it("첫 개방에 실패한 새 대본은 명시적인 재시도까지 작성 중인 내용을 메모리에 보존한다", async () => {
  const { initial } = setup();
  const write = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined);
  const draft = new StudioDirectorDraftSync(initial, null, write, true);
  draft.edit({ storyText: "계속 집필" });
  expect(draft.storageFailed).toBe(true);
  expect(await draft.persist()).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(await draft.persist(true)).toBe(false);
  draft.edit({ storyText: "마지막 문장" });
  expect(await draft.persist()).toBe(false);
  expect(write).toHaveBeenCalledTimes(1);
  expect(await draft.persist(true)).toBe(true);
  expect(JSON.parse(write.mock.lastCall![1]).storyText).toBe("마지막 문장");
  expect(draft.storageFailed).toBe(false);
});
