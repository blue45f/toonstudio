// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoryworldProject } from "../studio-storyworld-causality";
import type { StoryworldIssueDispositionStatus } from "../studio-storyworld-issue-dispositions";
import { PLAUSIBILITY_EXAMPLE_PROJECT } from "./studio-story-plausibility-example";
import { HUB_NOW, makeHubDeps, memoryStorage } from "./studio-story-plausibility-hub.test-support";
import { HubHarness, type HubHarnessProps } from "./studio-story-plausibility-hub.test-utils";
import { runPlausibilityCheck } from "./studio-story-plausibility-run";
import { ARCADIA_FIXTURE } from "./studio-story-plausibility-run.fixtures";
import { plausibilitySummaryStorageKey } from "./studio-story-plausibility-summary";

vi.mock("../universe-store", () => ({ storyworldAuxStore: { load: async () => null, save: async () => undefined } }));

const KNOWLEDGE = "아직 모르는 일을 아는 것처럼 행동해요";
const AGE = "나이와 연도가 맞지 않아요";
const RESOLUTION = "해결이 앞에서 준비되지 않은 일에 기대요";
const MOTIVE = "중요한 선택의 이유를 아직 모르겠다고 하셨어요";

const detail = () => screen.getByRole("complementary", { name: "근거 상세" });
const row = (title: string) => screen.getByRole("button", { name: new RegExp(title, "u") });
const rows = () => screen.getAllByRole("button").filter((button) => button.hasAttribute("data-finding-row"));
const score = () => screen.getByText(/\/ 100 · 점수 신뢰/u).previousElementSibling?.textContent ?? "";

type Spies = NonNullable<HubHarnessProps["spies"]>;

async function renderExample(extra: Partial<HubHarnessProps> = {}) {
  const deps = extra.deps ?? makeHubDeps();
  render(<HubHarness deps={deps} initialProject={PLAUSIBILITY_EXAMPLE_PROJECT} {...extra} />);
  await screen.findByRole("heading", { name: "점검 범위" });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("개연성 허브: 리포트", () => {
  it("불러오는 동안 상태를 알리고, 끝나면 결과 건수를 알린다", async () => {
    render(<HubHarness deps={makeHubDeps()} initialProject={PLAUSIBILITY_EXAMPLE_PROJECT} />);
    expect(screen.getByText("이야기를 점검하는 중이에요…")).toBeTruthy();
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(await screen.findByText("점검을 마쳤어요. 오류 2, 경고 1, 제안 1.")).toBeTruthy();
    expect(screen.queryByText("이야기를 점검하는 중이에요…")).toBeNull();
  });

  it("발견을 범주별로 묶고 심각도와 확정·추정을 색이 아닌 글자로 보여 준다", async () => {
    await renderExample();
    for (const heading of ["동기 1건", "정보 1건", "인물 일관성 1건", "우연·해결 방식 1건"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(within(row(RESOLUTION)).getByText("경고")).toBeTruthy();
    expect(within(row(RESOLUTION)).getByText("추정")).toBeTruthy();
    expect(within(row(KNOWLEDGE)).getByText("오류")).toBeTruthy();
    expect(within(row(KNOWLEDGE)).getByText("확정")).toBeTruthy();
    expect(within(row(MOTIVE)).getByText("제안")).toBeTruthy();
  });

  it("점검 가능 범위, 점수, 계산식, 점검 출처, 한계를 함께 보여 준다", async () => {
    await renderExample();
    expect(screen.getByRole("meter", { name: /점검 가능 범위 \d+%/u })).toBeTruthy();
    expect(screen.getByText(/입력하지 않은 칸은 ‘문제 없음’이 아니라 ‘점검 불가’예요/u)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "개연성 점수" })).toBeTruthy();
    fireEvent.click(screen.getByText("점수 계산식 보기"));
    expect(screen.getByText(/오류 건수 × 15/u)).toBeTruthy();
    expect(screen.getByRole("table", { name: /범주별 감점/u })).toBeTruthy();
    fireEvent.click(screen.getByText(/곳을 사용했어요/u));
    expect(screen.getByText(/복선 장부 · 연결 안 됨/u)).toBeTruthy();
    fireEvent.click(screen.getByText("이 점검의 한계"));
    expect(screen.getByText(/이야기가 재미있는지, 감동적인지는 판단하지 않습니다/u)).toBeTruthy();
  });

  it("심각도·범주·검색 필터가 겹쳐 적용되고 표시 건수를 알린다", async () => {
    await renderExample();
    expect(screen.getByText("4개 표시")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^오류 2$/u }));
    expect(screen.getByText("2개 표시 (전체 4개 중)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(MOTIVE, "u") })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "범주" }), { target: { value: "information" } });
    expect(screen.getByText("1개 표시 (전체 4개 중)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(AGE, "u") })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는말" } });
    expect(screen.getByText("조건에 맞는 항목이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조건 모두 지우기" }));
    expect(screen.getByText("4개 표시")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "추궁" } });
    expect(screen.getByText("1개 표시 (전체 4개 중)")).toBeTruthy();
  });

  it("방향키로 항목을 옮기면 근거 상세가 따라 바뀌고 탭 순서에는 고른 항목만 있다", async () => {
    await renderExample();
    expect(within(detail()).getByRole("heading", { name: KNOWLEDGE, level: 3 })).toBeTruthy();
    const list = rows();
    expect(list).toHaveLength(4);
    expect(list.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    const [first, second, , last] = list;
    if (!first || !second || !last) throw new Error("목록이 비어 있습니다.");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    const heading = within(detail()).getAllByRole("heading", { level: 3 })[0];
    expect(second.textContent).toContain(heading?.textContent ?? "###");
    expect(second.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(second, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });

  it("상세에는 질문, 근거, 해결 방법, 처리 기록, 출처가 있다", async () => {
    await renderExample();
    const panel = within(detail());
    expect(panel.getByText("작가님께 드리는 질문")).toBeTruthy();
    expect(panel.getByText(/하은은 이 사실을 어떻게 알았나요/u)).toBeTruthy();
    expect(panel.getByRole("heading", { name: "근거" })).toBeTruthy();
    expect(panel.getByText("추궁")).toBeTruthy();
    expect(panel.getByRole("heading", { name: /해결하는 방법 \(고르기 전에는 아무것도 바뀌지 않아요\)/u })).toBeTruthy();
    expect(panel.getByRole("group", { name: "이 항목 처리하기" })).toBeTruthy();
    expect(panel.getByText(/인과 점검 ·/u)).toBeTruthy();
  });

  it("추정 발견에는 틀릴 수 있다는 안내가 붙는다", async () => {
    await renderExample();
    fireEvent.click(row(RESOLUTION));
    expect(within(detail()).getByText(/추정이에요\. 글쓰기 관습에 기댄 의심이라 틀릴 수 있어요/u)).toBeTruthy();
  });

  it("해결 방법의 ‘설정에서 열기’는 이동만 하고 문서를 바꾸지 않는다", async () => {
    const onOpenSettings = vi.fn<NonNullable<Spies["onOpenSettings"]>>();
    const onProjectChange = vi.fn<NonNullable<Spies["onProjectChange"]>>();
    await renderExample({ spies: { onOpenSettings, onProjectChange } });
    fireEvent.click(row(AGE));
    fireEvent.click(within(detail()).getByRole("button", { name: "설정에서 인물 열기" }));
    expect(onOpenSettings).toHaveBeenCalledWith("character", "haeun");
    expect(onProjectChange).not.toHaveBeenCalled();
  });
});

describe("개연성 허브: 처리 기록", () => {
  it("해결함을 사유와 함께 기록하면 목록에서 접히고, 접힌 곳에서 다시 열어 되돌릴 수 있다", async () => {
    const onSetDisposition = vi.fn<NonNullable<Spies["onSetDisposition"]>>();
    const onClearDisposition = vi.fn<NonNullable<Spies["onClearDisposition"]>>();
    await renderExample({ spies: { onSetDisposition, onClearDisposition } });
    fireEvent.click(within(detail()).getByRole("button", { name: "해결함" }));
    fireEvent.change(screen.getByRole("textbox", { name: /사유/u }), { target: { value: "  3화에서 고쳤어요  " } });
    fireEvent.click(screen.getByRole("button", { name: "‘해결함’으로 기록하기" }));

    expect(onSetDisposition).toHaveBeenCalledTimes(1);
    const call = onSetDisposition.mock.calls[0];
    expect(call?.[0]?.length).toBeGreaterThan(0);
    expect(call?.[1]).toBe<StoryworldIssueDispositionStatus>("resolved");
    expect(call?.[2]).toBe("3화에서 고쳤어요");

    expect(screen.getByText(/처리한 항목 1건/u)).toBeTruthy();
    expect(screen.getByText("3개 표시")).toBeTruthy();
    expect(screen.getByText(/항목을 ‘해결함’으로 기록했어요/u)).toBeTruthy();

    fireEvent.click(screen.getByText(/처리한 항목 1건/u));
    const handledRow = row(KNOWLEDGE);
    expect(within(handledRow).getByText("해결함")).toBeTruthy();
    fireEvent.click(handledRow);
    expect(within(detail()).getByText("3화에서 고쳤어요")).toBeTruthy();
    fireEvent.click(within(detail()).getByRole("button", { name: /처리 되돌리기/u }));
    expect(onClearDisposition).toHaveBeenCalledWith(call?.[0]);
    await waitFor(() => expect(screen.getByText("4개 표시")).toBeTruthy());
  });

  it("의도된 설정은 점수에서 빠지고 나중에는 점수에 계속 반영된다", async () => {
    await renderExample();
    const before = Number(score());
    fireEvent.click(row(MOTIVE));
    fireEvent.click(within(detail()).getByRole("button", { name: "나중에" }));
    fireEvent.click(screen.getByRole("button", { name: "‘나중에’로 기록하기" }));
    expect(screen.getByText(/처리한 항목 1건/u)).toBeTruthy();
    expect(Number(score())).toBe(before);

    fireEvent.click(row(AGE));
    fireEvent.click(within(detail()).getByRole("button", { name: "의도된 설정" }));
    expect(screen.getByText(/일부러 그렇게 쓴 연출이에요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "‘의도된 설정’으로 기록하기" }));
    expect(screen.getByText(/처리한 항목 2건/u)).toBeTruthy();
    expect(Number(score())).toBeGreaterThan(before);
  });

  it("사유 입력에서 Esc는 취소하고 Ctrl+Enter는 기록한다", async () => {
    const onSetDisposition = vi.fn<NonNullable<Spies["onSetDisposition"]>>();
    await renderExample({ spies: { onSetDisposition } });
    fireEvent.click(within(detail()).getByRole("button", { name: "해결함" }));
    const reason = screen.getByRole("textbox", { name: /사유/u });
    expect(document.activeElement).toBe(reason);
    fireEvent.keyDown(reason, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /사유/u })).toBeNull();
    expect(onSetDisposition).not.toHaveBeenCalled();
    fireEvent.click(within(detail()).getByRole("button", { name: "의도된 설정" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: /사유/u }), { key: "Enter", ctrlKey: true });
    expect(onSetDisposition).toHaveBeenCalledTimes(1);
  });

  it("‘방금 한 일 되돌리기’가 마지막 처리 기록을 되돌린다", async () => {
    const onClearDisposition = vi.fn<NonNullable<Spies["onClearDisposition"]>>();
    await renderExample({ spies: { onClearDisposition } });
    expect(screen.queryByRole("button", { name: /방금 한 일 되돌리기/u })).toBeNull();
    fireEvent.click(within(detail()).getByRole("button", { name: "해결함" }));
    fireEvent.click(screen.getByRole("button", { name: "‘해결함’으로 기록하기" }));
    fireEvent.click(screen.getByRole("button", { name: /방금 한 일 되돌리기/u }));
    expect(onClearDisposition).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/되돌렸어요: /u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /방금 한 일 되돌리기/u })).toBeNull();
    await waitFor(() => expect(screen.getByText("4개 표시")).toBeTruthy());
  });

  it("다른 화면(모순·위험 탭)에서 이미 처리한 항목은 처음부터 접혀 있다", async () => {
    const result = await runPlausibilityCheck(
      { project: PLAUSIBILITY_EXAMPLE_PROJECT, workId: null, scopeKey: "s", scopeSceneIds: null },
      makeHubDeps(),
    );
    const knowledge = result.report.findings.find((finding) => finding.source.code === "knowledge-leak");
    if (!knowledge) throw new Error("지식 새어 나감 발견이 필요합니다.");
    await renderExample({
      initialDispositions: [{ issueKey: knowledge.dispositionKey, status: "ignored", note: "다른 탭에서 무시", updatedAtIso: HUB_NOW.toISOString() }],
    });
    expect(screen.getByText(/처리한 항목 1건/u)).toBeTruthy();
    expect(screen.getByText("3개 표시")).toBeTruthy();
  });
});

describe("개연성 허브: 다시 점검, 오류, 요약", () => {
  it("다시 점검하면 점검 시각을 새로 받고 결과를 유지한다", async () => {
    let calls = 0;
    const deps = makeHubDeps({ now: () => new Date(HUB_NOW.getTime() + calls++ * 60_000) });
    await renderExample({ deps });
    const before = screen.getByText(/마지막 점검:/u).textContent;
    fireEvent.click(screen.getByRole("button", { name: "다시 점검" }));
    await waitFor(() => expect(screen.getByText(/마지막 점검:/u).textContent).not.toBe(before));
    expect(screen.getByText("4개 표시")).toBeTruthy();
  });

  it("점검에 실패하면 이유와 다시 시도 버튼을 보여 주고, 다시 시도하면 결과가 나온다", async () => {
    let fail = true;
    const deps = makeHubDeps({
      now: () => {
        if (fail) throw new Error("시계를 읽을 수 없어요");
        return HUB_NOW;
      },
    });
    render(<HubHarness deps={deps} initialProject={PLAUSIBILITY_EXAMPLE_PROJECT} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("점검을 마치지 못했어요");
    expect(alert.textContent).toContain("저장된 설정은 그대로예요");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("작품 id가 있으면 준비도 패널이 읽을 요약을 남기고, 처리 기록을 반영해 갱신한다", async () => {
    const storage = memoryStorage();
    await renderExample({ deps: makeHubDeps({ storage }) });
    const key = plausibilitySummaryStorageKey("work-1");
    await waitFor(() => expect(storage.map.has(key)).toBe(true));
    expect(JSON.parse(storage.map.get(key) ?? "{}")).toMatchObject({ errorCount: 2, warningCount: 1, suggestionCount: 1, partial: false, checkedAtIso: HUB_NOW.toISOString() });
    fireEvent.click(within(detail()).getByRole("button", { name: "해결함" }));
    fireEvent.click(screen.getByRole("button", { name: "‘해결함’으로 기록하기" }));
    await waitFor(() => expect(JSON.parse(storage.map.get(key) ?? "{}")).toMatchObject({ errorCount: 1 }));
  });

  it("작품 id가 없으면 요약을 저장하지 않는다", async () => {
    const storage = memoryStorage();
    await renderExample({ deps: makeHubDeps({ storage }), workId: null });
    await act(async () => { await Promise.resolve(); });
    expect(storage.map.size).toBe(0);
  });
});

describe("개연성 허브: 원고에서 보기와 내보내기", () => {
  const manuscriptDeps = () => makeHubDeps({
    loadManuscript: async (_scope, copyId) => ({
      status: "ok",
      text: ARCADIA_FIXTURE.text,
      info: { copyId, length: ARCADIA_FIXTURE.text.length, chunks: 1, savedAtIso: HUB_NOW.toISOString() },
    }),
  });

  it("이름 표기 발견의 근거에서 원고를 열면 인용 단어가 강조된다", async () => {
    render(<HubHarness deps={manuscriptDeps()} initialProject={ARCADIA_FIXTURE.project} />);
    await screen.findByRole("heading", { name: "점검 범위" });
    const panel = within(detail());
    expect(panel.getByRole("heading", { name: "이름 표기가 달라 보여요" })).toBeTruthy();
    expect(panel.getByText("아르카디야가", { selector: "mark" }).tagName).toBe("MARK");
    fireEvent.click(panel.getByRole("button", { name: "원고에서 보기" }));
    const view = panel.getByRole("region", { name: /원고/u });
    expect(within(view).getByText("아르카디야가", { selector: "mark" })).toBeTruthy();
    expect(view.textContent).toContain("문을 열었다");
    fireEvent.click(panel.getByRole("button", { name: "원고 접기" }));
    expect(panel.queryByRole("region", { name: /원고/u })).toBeNull();
  });

  it("원고 사본이 없으면 이유를 알린다", async () => {
    render(<HubHarness deps={makeHubDeps()} initialProject={ARCADIA_FIXTURE.project} />);
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(screen.getByText(/원고 사본 1개를 이 기기에서 찾지 못했어요/u)).toBeTruthy();
  });

  it("원고에서 가져오지 않은 장면은 ‘원고에서 보기’가 꺼져 있고 이유가 보인다", async () => {
    await renderExample();
    const button = within(detail()).getByRole("button", { name: "원고에서 보기" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(within(detail()).getByText(/이 장면은 원고에서 가져온 것이 아니에요/u)).toBeTruthy();
  });

  it("Markdown·JSON으로 내보내면 계산식과 점검 가능 범위가 들어 있고 파일 이름에 제목이 없다", async () => {
    const blobs: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:test"; }),
      revokeObjectURL: vi.fn(),
    });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) { names.push(this.download); });
    await renderExample();
    fireEvent.click(screen.getByText("내보내기"));
    fireEvent.click(screen.getByRole("button", { name: "Markdown 파일" }));
    fireEvent.click(screen.getByRole("button", { name: "JSON 파일" }));
    expect(names).toEqual(["story-plausibility-report-20261015.md", "story-plausibility-report-20261015.json"]);
    const [markdownBlob, jsonBlob] = blobs;
    if (!markdownBlob || !jsonBlob) throw new Error("내보낸 파일이 없습니다.");
    const markdown = await readBlob(markdownBlob);
    const json: unknown = JSON.parse(await readBlob(jsonBlob));
    expect(markdown).toContain("# 개연성 점검 리포트 — 예시: 기억 시장의 열쇠");
    expect(markdown).toContain("## 점수 계산식");
    expect(markdown).toContain("점검 가능 범위(커버리지)");
    expect(json).toMatchObject({
      format: "toonstudio.story-plausibility-report",
      generatedAtIso: HUB_NOW.toISOString(),
      summary: { score: { formula: expect.stringContaining("× 15") }, coverage: { percent: expect.any(Number) } },
    });
    expect(screen.getByText(/story-plausibility-report-20261015\.json 파일을 저장했어요/u)).toBeTruthy();
  });

  it("브라우저가 내려받기를 막으면 그렇게 알린다", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => { throw new Error("blocked"); }), revokeObjectURL: vi.fn() });
    await renderExample();
    fireEvent.click(screen.getByText("내보내기"));
    fireEvent.click(screen.getByRole("button", { name: "JSON 파일" }));
    expect(screen.getByText("파일을 저장하지 못했어요. 브라우저의 다운로드 설정을 확인해 주세요.")).toBeTruthy();
  });
});

describe("개연성 허브: 빈 상태와 예시 이야기", () => {
  const emptyProject: StoryworldProject = { ...PLAUSIBILITY_EXAMPLE_PROJECT, id: "empty", title: "빈 작품", scenes: [], facts: [] };

  it("장면이 없으면 안내와 함께 원고로 시작하기·예시 이야기 버튼을 보여 준다", () => {
    render(<HubHarness deps={makeHubDeps()} initialProject={emptyProject} />);
    expect(screen.getByRole("heading", { name: "아직 점검할 장면이 없어요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "원고로 시작하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "예시 이야기로 점검해 보기" })).toBeTruthy();
  });

  it("예시 이야기는 읽기 전용으로 열리고, 내 설정으로 돌아갈 수 있다", async () => {
    const onSetDisposition = vi.fn<NonNullable<Spies["onSetDisposition"]>>();
    const onProjectChange = vi.fn<NonNullable<Spies["onProjectChange"]>>();
    render(<HubHarness deps={makeHubDeps()} initialProject={emptyProject} spies={{ onSetDisposition, onProjectChange }} />);
    fireEvent.click(screen.getByRole("button", { name: "예시 이야기로 점검해 보기" }));
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(screen.getByText(/일부러 문제를 심어 둔 예시 이야기예요/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "원고로 시작하기" }).hasAttribute("disabled")).toBe(true);
    expect(within(detail()).getByRole("button", { name: "해결함" }).hasAttribute("disabled")).toBe(true);
    expect(within(detail()).getByText("예시 이야기에서는 처리 기록을 남기지 않아요.")).toBeTruthy();
    expect(onSetDisposition).not.toHaveBeenCalled();
    expect(onProjectChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "내 설정으로 돌아가기" }));
    expect(screen.getByRole("heading", { name: "아직 점검할 장면이 없어요" })).toBeTruthy();
  });

  it("입력이 거의 없는 문서는 ‘문제 없음’이 아니라 ‘아직 모름’이라고 알리고 질문지로 안내한다", async () => {
    const sparse: StoryworldProject = {
      ...PLAUSIBILITY_EXAMPLE_PROJECT,
      id: "sparse",
      facts: [],
      characters: [],
      scenes: [{ id: "a", title: "첫 장면", order: 10 }, { id: "b", title: "둘째 장면", order: 20 }],
    };
    render(<HubHarness deps={makeHubDeps()} initialProject={sparse} />);
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(screen.getByText("찾은 문제가 없지만, 아직 모르는 부분이 많아요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "질문지로 채우기" })).toBeTruthy();
    expect(screen.getByText(/점수 신뢰 낮음/u)).toBeTruthy();
  });
});
