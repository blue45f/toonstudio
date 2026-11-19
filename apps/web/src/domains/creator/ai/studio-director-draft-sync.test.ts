import { describe, expect, it } from "vitest";

import { createStudioAiComicDirectorSession, loadStudioAiComicDirectorSession } from "./studio-ai-comic-director-session";
import { StudioDirectorDraftSync } from "./studio-director-draft-sync";

function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const initial = createStudioAiComicDirectorSession({ id: "story", title: "첫 화", storyText: "원본" });
  const draft = new StudioDirectorDraftSync(initial, storage);
  const reopen = () => new StudioDirectorDraftSync(loadStudioAiComicDirectorSession(storage, initial.id)!, storage);
  return { initial, storage, draft, reopen };
}

describe("콘티의 로컬 대본과 클라우드 revision", () => {
  it("조회 중 입력한 대본을 보존하고 충돌 상태에서는 명시적으로 서버본을 다시 열 수 있다", () => {
    const { initial, draft, reopen } = setup();
    draft.edit({ storyText: "입력 중인 대사" });
    const remote = { ...initial, revision: 4, storyText: "협업자가 쓴 대사" };
    expect(draft.receive("read", initial, remote)).toBe("conflict");
    expect(reopen().current.storyText).toBe("입력 중인 대사");
    expect(draft.receive("reload", draft.current, remote)).toBe("saved");
    expect(reopen().current.storyText).toBe("협업자가 쓴 대사");
  });

  it("저장 요청 뒤 입력을 보존하고 다시 열어 마지막 수정만 추가 저장한다", () => {
    const { initial, draft, reopen } = setup();
    draft.receive("read", initial, initial);
    draft.edit({ storyText: "1차 대본" });
    const sent = draft.current;
    draft.edit({ storyText: "2차 대본" });
    const ack = { ...sent, revision: 2 };
    expect(draft.receive("save", sent, ack)).toBe("local");
    const reopened = reopen();
    expect(reopened.receive("read", reopened.current, ack)).toBe("local");
    expect(reopened.current.storyText).toBe("2차 대본");
    expect(reopened.receive("save", reopened.current, { ...reopened.current, revision: 3 })).toBe("saved");
    expect(reopen().current.storyText).toBe("2차 대본");
  });

  it("보관 중 서버가 다른 클라우드 revision을 저장하면 양쪽 원본을 구분한다", () => {
    const { initial, draft, reopen } = setup();
    draft.receive("read", initial, initial);
    draft.edit({ storyText: "내 대사" });
    const reopened = reopen();
    expect(reopened.receive("read", reopened.current, { ...initial, storyText: "팀 대사", revision: 2 })).toBe("conflict");
    expect(reopened.current.storyText).toBe("내 대사");
    expect(reopened.conflicted).toBe(true);
  });

  it("저장소가 가득 차도 입력을 유지하고 저장 실패를 표시한다", () => {
    const { initial } = setup();
    const draft = new StudioDirectorDraftSync(initial, { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    draft.edit({ storyText: "복사할 수 있는 대본" });
    expect(draft.storageFailed).toBe(true);
    expect(draft.current.storyText).toBe("복사할 수 있는 대본");
  });
});
