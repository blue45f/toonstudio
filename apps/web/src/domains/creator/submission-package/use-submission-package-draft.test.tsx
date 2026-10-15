// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_SUBMISSION_DRAFT_TEXT,
  parseSubmissionDraftText,
  submissionDraftStorageKey,
  writeSubmissionDraftText,
  type SubmissionDraftStorage,
} from "./submission-package-draft-store";
import { gifBytes, imageFile, pngBytes, sheetOf } from "./submission-package.test-fixture";
import { useSubmissionPackageDraft, type UseSubmissionPackageDraftOptions } from "./use-submission-package-draft";

const PROJECT_ID = "proj-1";
const KEY = submissionDraftStorageKey(PROJECT_ID);

class MemoryStorage implements SubmissionDraftStorage {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.writes.push(value);
    this.values.set(key, value);
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(overrides: Partial<UseSubmissionPackageDraftOptions> = {}) {
  const storage = new MemoryStorage();
  const hook = renderHook((props: Partial<UseSubmissionPackageDraftOptions>) =>
    useSubmissionPackageDraft({
      projectId: PROJECT_ID,
      projectTitle: "내 작품",
      documents: [],
      characters: [],
      storage,
      ...props,
    }),
    { initialProps: overrides },
  );
  return { ...hook, storage };
}

function episodeId(index: number, result: { current: ReturnType<typeof useSubmissionPackageDraft> }): string {
  const episode = result.current.state.episodes[index];
  if (!episode) throw new Error(`${index + 1}번째 회차가 없어요.`);
  return episode.id;
}

describe("초안 훅 — 시작", () => {
  it("저장된 글이 없으면 프로젝트 이름과 빈 회차 3칸으로 시작하고 저장소가 있으면 saved 다", () => {
    const { result } = setup();
    expect(result.current.state.title).toBe("내 작품");
    expect(result.current.state.episodes).toHaveLength(3);
    expect(result.current.restoredFromSaved).toBe(false);
    expect(result.current.persistence).toBe("saved");
    expect(result.current.platform).not.toBeNull();
    expect(result.current.report.canBuild).toBe(false);
  });

  it("저장소를 쓸 수 없으면 unavailable 이고 화면은 그대로 동작한다", () => {
    const { result } = setup({ storage: null });
    expect(result.current.persistence).toBe("unavailable");
    act(() => result.current.actions.setField("title", "그래도 적힌다"));
    expect(result.current.state.title).toBe("그래도 적힌다");
  });

  it("저장된 글이 있으면 복원하고 이미지는 비어 있다고 표시한다", () => {
    const storage = new MemoryStorage();
    writeSubmissionDraftText(storage, PROJECT_ID, {
      ...EMPTY_SUBMISSION_DRAFT_TEXT,
      title: "저장된 제목",
      episodes: [{ id: "saved-1", number: 7, title: "일곱째", note: "" }],
    });
    const { result } = setup({ storage });
    expect(result.current.restoredFromSaved).toBe(true);
    expect(result.current.state.title).toBe("저장된 제목");
    expect(result.current.state.episodes.map((episode) => [episode.id, episode.number, episode.pages.length])).toEqual([["saved-1", 7, 0]]);
  });

  it("문서가 있으면 회차 칸의 출발점으로 쓰고 부족한 만큼 빈 칸을 이어 둔다", () => {
    const { result } = setup({ documents: [{ id: "doc-1", title: "첫 손님", width: 690, height: 8_000, pageCount: 2 }] });
    expect(result.current.state.episodes).toHaveLength(3);
    expect(result.current.state.episodes[0]).toMatchObject({ number: 1, title: "첫 손님", document: { id: "doc-1", width: 690 } });
    expect(result.current.state.episodes[2]?.document).toBeNull();
  });
});

describe("초안 훅 — 글 저장", () => {
  it("바꾸기 전에는 저장소에 쓰지 않는다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { storage } = setup();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(storage.writes).toHaveLength(0);
  });

  it("연달아 고쳐도 마지막 상태를 한 번만 저장한다 — 400ms 뒤에", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, storage } = setup();

    act(() => result.current.actions.setField("title", "첫"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => result.current.actions.setField("title", "첫 번째"));
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(storage.writes).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(storage.writes).toHaveLength(1);
    expect(parseSubmissionDraftText(storage.values.get(KEY) ?? null)?.title).toBe("첫 번째");
    expect(result.current.persistence).toBe("saved");
  });

  it("이미지를 더하는 것만으로는 저장하지 않는다 — 이미지는 저장 대상이 아니다", async () => {
    const { result, storage } = setup();
    await act(async () => {
      await result.current.actions.addFiles(episodeId(0, result), [imageFile(pngBytes(690, 4_000, 1_000), "01.png", "image/png")]);
    });
    // 디바운스(400ms)보다 오래 기다려도 쓰기가 없어야 한다.
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 600));
    });
    expect(storage.writes).toHaveLength(0);
    expect(result.current.state.episodes[0]?.pages).toHaveLength(1);
  });

  it("저장소 쓰기가 막히면 unavailable 로 바꿔 알리고 계속 동작한다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, storage } = setup();
    storage.failWrites = true;
    act(() => result.current.actions.setField("title", "막힌 저장소"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.persistence).toBe("unavailable");
    expect(result.current.state.title).toBe("막힌 저장소");
  });
});

describe("초안 훅 — 이미지 읽기", () => {
  it("이름의 숫자 순서로 정렬해 담고 읽는 동안 reading 개수를 알린다", async () => {
    const { result } = setup();
    const id = episodeId(0, result);
    const files = ["10.png", "2.png", "1.png"].map((name) => imageFile(pngBytes(690, 4_000, 800), name, "image/png"));

    let reading: Promise<void> = Promise.resolve();
    act(() => {
      reading = result.current.actions.addFiles(id, files);
    });
    expect(result.current.state.episodes[0]?.reading).toBe(3);
    await act(async () => {
      await reading;
    });
    const episode = result.current.state.episodes[0];
    expect(episode?.reading).toBe(0);
    expect(episode?.pages.map((page) => page.name)).toEqual(["1.png", "2.png", "10.png"]);
    expect(episode?.pages.every((page) => page.failure === null && page.width === 690)).toBe(true);
  });

  it("담을 수 없는 파일은 실패 사유와 함께 목록에 남기고 만들기 점검이 막는다", async () => {
    const { result } = setup();
    const id = episodeId(1, result);
    await act(async () => {
      await result.current.actions.addFiles(id, [imageFile(gifBytes(), "anim.gif", "image/gif")]);
    });
    expect(result.current.state.episodes[1]?.pages[0]).toMatchObject({ name: "anim.gif", failure: "unsupported" });
    expect(result.current.report.issues.some((issue) => issue.code === "page-unsupported")).toBe(true);
  });

  it("빈 목록은 아무것도 바꾸지 않는다", async () => {
    const { result } = setup();
    const before = result.current.state;
    await act(async () => {
      await result.current.actions.addFiles(episodeId(0, result), []);
    });
    expect(result.current.state).toBe(before);
  });

  it("순서를 바꾸고 하나씩 뺀다", async () => {
    const { result } = setup();
    const id = episodeId(0, result);
    await act(async () => {
      await result.current.actions.addFiles(id, [
        imageFile(pngBytes(690, 100, 500), "a.png", "image/png"),
        imageFile(pngBytes(690, 100, 500), "b.png", "image/png"),
      ]);
    });
    const [first, second] = result.current.state.episodes[0]?.pages ?? [];
    if (!first || !second) throw new Error("이미지가 두 장이어야 해요.");
    act(() => result.current.actions.movePage(id, second.id, -1));
    expect(result.current.state.episodes[0]?.pages.map((page) => page.name)).toEqual(["b.png", "a.png"]);
    act(() => result.current.actions.removePage(id, second.id));
    expect(result.current.state.episodes[0]?.pages.map((page) => page.name)).toEqual(["a.png"]);
  });
});

describe("초안 훅 — 캐릭터 선택과 점검", () => {
  it("시트에 내용이 있는 캐릭터만 기본으로 담고 직접 켜고 끈 선택이 우선한다", () => {
    const filled = sheetOf("c1", { name: "한도깨" });
    const empty = sheetOf("c2", { name: "행인", personality: "" });
    const { result } = setup({ characters: [filled, empty] });
    expect([...result.current.selectedCharacterIds]).toEqual(["c1"]);
    expect(result.current.draft.characters.map((sheet) => sheet.id)).toEqual(["c1"]);

    act(() => result.current.actions.toggleCharacter("c2", true));
    act(() => result.current.actions.toggleCharacter("c1", false));
    expect([...result.current.selectedCharacterIds]).toEqual(["c2"]);
    expect(result.current.draft.characters.map((sheet) => sheet.id)).toEqual(["c2"]);
  });

  it("점검 결과는 초안에서 바로 계산되고, 폭 기준을 바꾸면 플랫폼 기준도 따라 바뀐다", () => {
    const { result } = setup();
    expect(result.current.state.targetWidth).toBe("naver");
    expect(result.current.platform?.maxFileBytes).toBeGreaterThan(0);
    act(() => result.current.actions.setField("title", "제목"));
    expect(result.current.report.issues.some((issue) => issue.code === "title-missing")).toBe(false);
    act(() => result.current.actions.setTarget("any"));
    expect(result.current.platform).toBeNull();
  });
});
