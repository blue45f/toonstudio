// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioAiComicDirectorSession, saveStudioAiComicDirectorSession } from "./studio-ai-comic-director-session";
import { prepareDirectorEditorReturn, restoreDirectorEditorReturn } from "./studio-director-editor-return";

import { useApp } from "@/shared/lib/store";

const receiptKey = "toonspectrum:director-editor-return:v1";

function setup(workId: string | null = null) {
  const session = createStudioAiComicDirectorSession({ id: "session-a", title: "나의 콘티", storyText: "공개하지 않은 초고", workId });
  saveStudioAiComicDirectorSession(localStorage, session);
  return session;
}
function visit(href: string) {
  history.replaceState({ idx: 3 }, "", href);
}
beforeEach(() => {
  visit("/studio/compose/session-a");
  useApp.setState({ userId: null });
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("콘티에서 격리된 원고 문서로 복귀", () => {
  it("같은 탭의 같은 콘티만 한 번 열고 쿼리·앵커와 브라우저 이력을 보존한다", () => {
    const session = setup();
    const href = prepareDirectorEditorReturn(session, "/studio/canvas?room=workshop#page", { variants: 4, qualityProfile: "final" })!;
    const receipt = sessionStorage.getItem(receiptKey)!;
    expect(receipt).not.toContain(session.storyText);
    expect(receipt).not.toContain(session.title);
    visit(href);
    const listener = vi.fn();
    restoreDirectorEditorReturn(listener)();
    restoreDirectorEditorReturn(listener)();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toMatchObject({ storyText: session.storyText, variants: 4, qualityProfile: "final" });
    expect(location.pathname + location.search + location.hash).toBe("/studio/canvas?room=workshop#page");
    expect(history.state).toEqual({ idx: 3 });
    expect(sessionStorage.getItem(receiptKey)).toBeNull();
  });

  it("다른 작품·리믹스·출고·외부 주소로 콘티를 전달하지 않는다", () => {
    const session = setup();
    for (const path of ["/studio/canvas?id=other", "/studio/remix/other/canvas", "/studio/publish", "https://elsewhere.test/studio/canvas"]) {
      expect(prepareDirectorEditorReturn(session, path)).toBeNull();
    }
    const href = prepareDirectorEditorReturn(session, "/studio/canvas")!;
    const listener = vi.fn();
    visit(href + "&id=other");
    restoreDirectorEditorReturn(listener)();
    visit(href.replace(/directorReturn=.*/, "directorReturn=unknown"));
    restoreDirectorEditorReturn(listener)();
    expect(listener).not.toHaveBeenCalled();
  });

  it("작품의 로그인 복구를 기다리고 다른 계정에서 소비한 표식은 다시 열지 않는다", () => {
    const session = setup("work-a");
    const path = "/studio/work/work-a/canvas";
    expect(prepareDirectorEditorReturn(session, path)).toBeNull();
    useApp.setState({ userId: "actor-a" });
    visit(prepareDirectorEditorReturn(session, path)!);
    useApp.setState({ userId: null });
    const listener = vi.fn();
    const unsubscribe = restoreDirectorEditorReturn(listener);
    expect(listener).not.toHaveBeenCalled();
    useApp.setState({ userId: "actor-a" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    visit(prepareDirectorEditorReturn(session, path)!);
    useApp.setState({ userId: "actor-b" });
    restoreDirectorEditorReturn(listener)();
    useApp.setState({ userId: "actor-a" });
    restoreDirectorEditorReturn(listener)();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("전달 직전 바뀐 콘티와 손상된 요청은 적용하지 않는다", () => {
    const session = setup();
    visit(prepareDirectorEditorReturn(session, "/studio/canvas")!);
    const listener = vi.fn();
    saveStudioAiComicDirectorSession(localStorage, { ...session, revision: session.revision + 1, storyText: "새 대본" });
    restoreDirectorEditorReturn(listener)();
    expect(listener).not.toHaveBeenCalled();
    visit(prepareDirectorEditorReturn(session, "/studio/canvas")!);
    sessionStorage.setItem(receiptKey, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(receiptKey)!), request: { indexes: "all" } }));
    restoreDirectorEditorReturn(listener)();
    expect(listener).not.toHaveBeenCalled();
  });

  it("저장소가 막혔으면 페이지를 이동할 주소를 만들지 않는다", () => {
    const session = setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(prepareDirectorEditorReturn(session, "/studio/canvas")).toBeNull();
  });
});
