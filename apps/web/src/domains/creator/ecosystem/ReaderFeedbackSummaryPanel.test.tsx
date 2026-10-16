// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReaderFeedbackSummaryPanel } from "./ReaderFeedbackSummaryPanel";
import { createExampleReaderFeedback } from "./reader-feedback-example";
import { READER_FEEDBACK_HIDDEN_KEY } from "./reader-feedback-hidden";
import { READER_FEEDBACK_LIMITS, type ReaderFeedbackResponse } from "./reader-feedback-schema";

const EXAMPLES = createExampleReaderFeedback();

function fileJson(responses: readonly ReaderFeedbackResponse[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ kind: "toonstudio-reader-feedback", version: 1, exportedAt: "2026-10-16T01:05:00.000Z", responses, ...overrides });
}

function jsonFile(name: string, responses: readonly ReaderFeedbackResponse[], overrides: Record<string, unknown> = {}): File {
  return new File([fileJson(responses, overrides)], name, { type: "application/json" });
}

function textFile(name: string, text: string): File {
  return new File([text], name, { type: "application/json" });
}

function renderPanel() {
  return render(<MemoryRouter><ReaderFeedbackSummaryPanel /></MemoryRouter>);
}

function chooseFiles(files: readonly File[]) {
  fireEvent.change(screen.getByLabelText(/응답 파일 선택/u), { target: { files } });
}

const statusText = () => screen.getAllByRole("status").map((node) => node.textContent).join(" | ");

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReaderFeedbackSummaryPanel: 처음 상태", () => {
  it("빈 상태가 사용 방법을 가르치고, 한계 안내가 항상 보인다", () => {
    renderPanel();
    expect(screen.getByRole("heading", { level: 3, name: "회차별 독자 피드백 요약" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "아직 가져온 응답이 없어요" })).toBeTruthy();
    const steps = screen.getByRole("heading", { name: "아직 가져온 응답이 없어요" }).parentElement!;
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps).getByRole("link", { name: "독자용 화면 열기" }).getAttribute("href")).toBe("/studio/ecosystem/viewer");

    const caution = screen.getByRole("complementary", { name: "해석할 때 주의할 점" });
    expect(caution.textContent).toContain("자체 선택");
    expect(caution.textContent).toContain("대표하지 않아요");
    expect(caution.textContent).toContain("멈춘 곳이 실제보다 적게 보일 수 있어요");
    expect(caution.textContent).toContain("응답이 적으면 평균과 분포는 한두 명에 좌우돼요");
    expect(caution.textContent).toContain("닉네임은 신원 확인이 아니에요");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("파일 선택·붙여넣기·예시 체험 버튼이 이름으로 찾아지고 붙여넣기 영역은 펼침 상태를 알린다", () => {
    renderPanel();
    const input = screen.getByLabelText(/응답 파일 선택/u) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".json");
    const paste = screen.getByRole("button", { name: "붙여넣어 가져오기" });
    expect(paste.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(paste);
    expect(paste.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(paste.getAttribute("aria-controls")!)).toBeTruthy();
    expect((screen.getByRole("button", { name: "붙여넣은 내용 가져오기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/파일 하나는 256KB, 한 번에 20개까지, 합쳐서 1000개 응답까지 가져와요/u)).toBeTruthy();
  });
});

describe("ReaderFeedbackSummaryPanel: 예시 체험과 요약", () => {
  it("예시 응답을 불러오면 회차 비교표와 첫 회차 요약이 나온다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    expect(screen.queryByRole("heading", { name: "아직 가져온 응답이 없어요" })).toBeNull();

    const compare = screen.getByRole("table", { name: /회차별 응답 수와 평균/u });
    const rows = within(compare).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole("button", { name: "예시 작품 · Example story 1화" }).getAttribute("aria-current")).toBe("true");
    expect(within(rows[1]!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["8", "2.3", "2.1", "3/8", "7~8컷 (3명)"]);

    const group = screen.getByRole("article");
    expect(within(group).getByRole("heading", { level: 4, name: "예시 작품 · Example story 1화" })).toBeTruthy();
    expect(within(group).getByText("받은 응답").parentElement!.textContent).toBe("받은 응답8개");
    expect(within(group).getByText("재미 평균").parentElement!.textContent).toContain("2.3/3");
    expect(within(group).getByText("끝까지 읽음").parentElement!.textContent).toContain("3/8");
    expect(within(group).getByText(/응답이 30개 미만이라/u)).toBeTruthy();
    expect(statusText()).toContain("응답 14개 추가 · 0개 갱신 · 중복 0개 제외");
  });

  it("회차 이름을 누르면 그 회차의 요약으로 바뀌고 선택 표시가 따라간다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const second = screen.getByRole("button", { name: "예시 작품 · Example story 2화" });
    fireEvent.click(second);
    expect(second.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "예시 작품 · Example story 1화" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("heading", { level: 4, name: "예시 작품 · Example story 2화" })).toBeTruthy();
    expect(screen.getByText("받은 응답").parentElement!.textContent).toBe("받은 응답6개");
  });

  it("이탈 지점은 SVG 그래프와 같은 내용의 표로 함께 준다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const chart = screen.getByRole("img", { name: /컷 번호로 알려 준 멈춘 곳/u });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    expect(chart.getAttribute("aria-labelledby")).toBeTruthy();
    expect(chart.textContent).toContain("가장 많이 멈춘 구간: 7~8컷 (3명)");
    // 값이 있는 칸은 색뿐 아니라 개수 글자로도 말한다.
    expect(Array.from(chart.querySelectorAll("text")).map((text) => text.textContent)).toEqual(["3", "1"]);

    const table = screen.getByRole("table", { name: "컷 번호로 알려 준 멈춘 곳", hidden: true });
    const body = within(table).getAllByRole("row", { hidden: true }).slice(1);
    expect(body).toHaveLength(12);
    const peak = body.find((row) => within(row).queryByText("7~8컷"));
    expect(within(peak!).getAllByRole("cell", { hidden: true }).map((cell) => cell.textContent)).toEqual(["3"]);
    // 표본이 10개 미만이라 비율 열은 없다.
    expect(within(table).queryByRole("columnheader", { name: "비율", hidden: true })).toBeNull();

    expect(screen.getByRole("img", { name: /스크롤 위치로 알려 준 멈춘 곳/u })).toBeTruthy();
    expect(screen.getAllByText("표로 보기").length).toBe(2);
  });

  it("개수 글자는 칸 색 위가 아니라 칸 위의 별도 줄에 놓이고, 어떤 것도 그림 밖으로 잘리지 않는다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const charts = screen.getAllByRole("img", { name: /멈춘 곳/u });
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      const [, , viewWidth = NaN, viewHeight = NaN] = (chart.getAttribute("viewBox") ?? "").split(" ").map(Number);
      // 바깥 크기와 그림 좌표가 같아 배율이 생기지 않는다.
      expect(Number(chart.getAttribute("width"))).toBe(viewWidth);
      expect(Number(chart.getAttribute("height"))).toBe(viewHeight);

      const cells = Array.from(chart.querySelectorAll("rect"));
      expect(cells.length).toBeGreaterThan(0);
      const cellTop = Math.min(...cells.map((cell) => Number(cell.getAttribute("y"))));
      for (const cell of cells) {
        expect(Number(cell.getAttribute("x")) + Number(cell.getAttribute("width"))).toBeLessThanOrEqual(viewWidth);
        expect(Number(cell.getAttribute("y")) + Number(cell.getAttribute("height"))).toBeLessThanOrEqual(viewHeight);
      }

      const counts = Array.from(chart.querySelectorAll("text"));
      expect(counts.length).toBeGreaterThan(0);
      for (const text of counts) {
        // dominant-baseline 이 central 이면 y 는 글자 상자의 가운데다. 상자 전체가 그림 맨 위와 칸 윗변 사이에 있어야 한다.
        expect(text.getAttribute("dominant-baseline")).toBe("central");
        const half = Number(text.getAttribute("font-size")) / 2;
        const center = Number(text.getAttribute("y"));
        expect(center - half).toBeGreaterThanOrEqual(0);
        expect(center + half).toBeLessThanOrEqual(cellTop);
        // 글자색은 칸 색에 따라 바뀌지 않고 본문 글자색 하나다.
        expect(text.getAttribute("style") ?? "").toContain("var(--color-fg)");
        expect(text.getAttribute("style") ?? "").not.toContain("on-accent");
        // 글자는 어떤 칸의 가로 가운데 바로 위에 있다.
        expect(cells.some((cell) => Number(cell.getAttribute("x")) + Number(cell.getAttribute("width")) / 2 === Number(text.getAttribute("x")))).toBe(true);
      }
    }
  });

  it("점수 분포와 감정 분포는 개수를 글자로 보여 준다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const distribution = screen.getByRole("heading", { level: 5, name: "점수 분포" }).parentElement!;
    expect(within(distribution).getByText("재밌었어요").parentElement!.textContent).toContain("3명");
    expect(within(distribution).getByText("헷갈렸어요").parentElement!.textContent).toContain("2명");
    const emotions = screen.getByRole("heading", { level: 5, name: "느낀 감정" }).parentElement!;
    expect(within(emotions).getByText("설렘").parentElement!.textContent).toContain("2명");
    expect(within(emotions).queryByText(/%/u)).toBeNull();
  });

  it("대표 의견은 5개이고 스포일러 의견은 눌러서 펼친다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const representative = screen.getByRole("heading", { level: 5, name: "대표 의견" }).parentElement!;
    const list = within(representative).getAllByRole("list")[0]!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText(/동생이 돌아오는 장면/u)).toBeNull();
    const reveal = screen.getAllByRole("button", { name: "스포일러 보기" })[0]!;
    expect(reveal.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reveal);
    expect(screen.getByText(/동생이 돌아오는 장면/u)).toBeTruthy();
  });
});

describe("ReaderFeedbackSummaryPanel: 여러 파일 합치기", () => {
  it("겹치는 응답은 한 번만 세고, 열지 못한 파일은 사유와 함께 남긴다", async () => {
    renderPanel();
    chooseFiles([
      jsonFile("reader-a.json", EXAMPLES.slice(0, 6)),
      jsonFile("reader-b.json", EXAMPLES.slice(3, 10)),
      textFile("not-feedback.json", JSON.stringify({ kind: "toonstudio-beta", version: 1 })),
      textFile("legacy.json", JSON.stringify({ kind: "toonstudio-beta-feedback", version: 1, feedback: [] })),
    ]);
    await screen.findByText(/응답 10개 추가/u);
    expect(statusText()).toContain("응답 10개 추가 · 0개 갱신 · 중복 3개 제외 · 열지 못한 파일 2개");
    const results = screen.getByRole("heading", { level: 4, name: "가져오기 결과" }).parentElement!.parentElement!;
    const items = within(results).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "reader-a.json 응답 6개를 읽었어요.",
      "reader-b.json 응답 7개를 읽었어요.",
      "not-feedback.json 독자 피드백 파일이 아니에요.",
      "legacy.json 이전 '검토 응답' 형식이에요. 위쪽 '응답 가져오기'로 가져와 주세요.",
    ]);
    expect(screen.getByRole("button", { name: "예시 작품 · Example story 1화" })).toBeTruthy();
    expect(screen.getByText("받은 응답").parentElement!.textContent).toBe("받은 응답8개");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("같은 id 의 더 늦은 응답은 갱신으로 세고, 같은 파일을 다시 고르면 모두 중복이다", async () => {
    renderPanel();
    chooseFiles([jsonFile("first.json", EXAMPLES.slice(0, 2))]);
    await screen.findByText(/응답 2개 추가/u);
    const edited = { ...EXAMPLES[0]!, createdAt: "2026-10-20T00:00:00.000Z", comment: "고쳐 다시 보낸 의견입니다." };
    chooseFiles([jsonFile("edited.json", [edited])]);
    await waitFor(() => expect(statusText()).toContain("응답 0개 추가 · 1개 갱신 · 중복 0개 제외"));
    chooseFiles([jsonFile("edited-again.json", [edited])]);
    await waitFor(() => expect(statusText()).toContain("응답 0개 추가 · 0개 갱신 · 중복 1개 제외"));
    expect(screen.getByText("고쳐 다시 보낸 의견입니다.")).toBeTruthy();
  });

  it("파일을 읽는 동안 읽는 중 상태를 보이고, 끝나면 사라진다", async () => {
    renderPanel();
    let release: (text: string) => void = () => undefined;
    const slow = textFile("slow.json", "x");
    Object.defineProperty(slow, "text", { value: () => new Promise<string>((resolve) => { release = resolve; }) });
    chooseFiles([slow]);
    const busy = await screen.findByRole("status", { name: "파일을 읽는 중" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.textContent).toContain("파일을 읽는 중…");
    expect(screen.queryByRole("heading", { name: "아직 가져온 응답이 없어요" })).toBeNull();
    await act(async () => { release(fileJson(EXAMPLES.slice(0, 1))); });
    await waitFor(() => expect(screen.queryByRole("status", { name: "파일을 읽는 중" })).toBeNull());
    expect(statusText()).toContain("응답 1개 추가");
  });

  it("읽기에 실패한 파일은 다시 시도할 수 있고, 형식 오류는 다시 시도 버튼이 없다", async () => {
    renderPanel();
    const flaky = textFile("flaky.json", "x");
    const read = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("NotReadableError"))
      .mockResolvedValueOnce(fileJson(EXAMPLES.slice(0, 3)));
    Object.defineProperty(flaky, "text", { value: read });
    chooseFiles([flaky, textFile("broken.json", "{ 깨짐")]);
    await screen.findByText("파일을 읽지 못했어요. 다시 시도해 보세요.");
    expect(screen.getByText("JSON 형식이 아니에요.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "다시 시도" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "아직 가져온 응답이 없어요" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("응답 3개를 읽었어요.");
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getByText("받은 응답").parentElement!.textContent).toBe("받은 응답3개");
    expect(screen.getByText("JSON 형식이 아니에요.")).toBeTruthy();
  });

  it("너무 큰 파일은 내용을 읽지 않고 거절한다", async () => {
    renderPanel();
    const big = textFile("big.json", "{}");
    const read = vi.fn(async () => "{}");
    Object.defineProperty(big, "text", { value: read });
    Object.defineProperty(big, "size", { value: READER_FEEDBACK_LIMITS.maxFileBytes + 1 });
    chooseFiles([big, textFile("empty.json", "")]);
    await screen.findByText(/파일이 너무 커요. 한 파일은 256KB까지 가져올 수 있어요./u);
    expect(screen.getByText("빈 파일이에요.")).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it("한 번에 20개 파일까지만 읽고 나머지는 건너뛴 수를 알린다", async () => {
    renderPanel();
    const many = Array.from({ length: 21 }, (_, index) => jsonFile(`r-${index}.json`, [{ ...EXAMPLES[0]!, id: `bulk-${index}`, comment: `의견 ${index}번`, createdAt: `2026-10-10T00:${String(index).padStart(2, "0")}:00.000Z` }]));
    chooseFiles(many);
    await screen.findByText(/응답 20개 추가/u);
    expect(statusText()).toContain("한 번에 20개 파일까지만 읽어 1개는 건너뛰었어요.");
    expect(screen.getByText("받은 응답").parentElement!.textContent).toBe("받은 응답20개");
  });

  it("붙여넣은 내용도 같은 검증을 거치고, 실패하면 입력을 지우지 않는다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "붙여넣어 가져오기" }));
    const box = screen.getByLabelText("독자가 복사해 보낸 응답 내용") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "{ 깨짐" } });
    fireEvent.click(screen.getByRole("button", { name: "붙여넣은 내용 가져오기" }));
    await screen.findByText("JSON 형식이 아니에요.");
    expect(box.value).toBe("{ 깨짐");
    fireEvent.change(box, { target: { value: fileJson(EXAMPLES.slice(8, 10)) } });
    fireEvent.click(screen.getByRole("button", { name: "붙여넣은 내용 가져오기" }));
    await screen.findByText(/응답 2개 추가/u);
    expect(screen.getByRole("heading", { level: 4, name: "예시 작품 · Example story 2화" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "입력 지우기" }));
    expect(box.value).toBe("");
  });

  it("비우기를 누르면 처음 상태로 돌아가고 결과 닫기는 보고서만 닫는다", async () => {
    renderPanel();
    chooseFiles([jsonFile("a.json", EXAMPLES.slice(0, 2)), textFile("bad.json", "[]")]);
    await screen.findByText(/응답 2개 추가/u);
    fireEvent.click(screen.getByRole("button", { name: "결과 닫기" }));
    expect(screen.queryByRole("heading", { name: "가져오기 결과" })).toBeNull();
    expect(screen.getByText("받은 응답").parentElement!.textContent).toBe("받은 응답2개");
    fireEvent.click(screen.getByRole("button", { name: "가져온 응답 비우기" }));
    expect(screen.getByRole("heading", { name: "아직 가져온 응답이 없어요" })).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("ReaderFeedbackSummaryPanel: 악의적 입력", () => {
  it("HTML·스크립트 조각은 요소가 되지 않고 글자 그대로 보인다", async () => {
    const { container } = renderPanel();
    const attack = '<img src=x onerror="document.title=1"><script>document.title=2</script>';
    const hostile = { ...EXAMPLES[2]!, target: { kind: "manual" as const, id: null, title: attack, episode: 1 }, nickname: "<b>굵게</b>", comment: `${attack} javascript:alert(3)`, spoiler: false };
    chooseFiles([jsonFile("hostile.json", [hostile])]);
    await screen.findByText(/응답 1개 추가/u);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(screen.getAllByText(new RegExp(attack.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("<b>굵게</b>")).toBeTruthy();
    expect(container.querySelector("a[href^='javascript']")).toBeNull();
    expect(document.title).not.toBe("1");
    expect(document.title).not.toBe("2");
  });

  it("프로토타입 오염 키가 든 파일은 열지 않고 전역 객체를 건드리지 않는다", async () => {
    renderPanel();
    const polluted = fileJson(EXAMPLES.slice(0, 1)).replace('{"kind"', '{"__proto__":{"polluted":"yes"},"kind"');
    chooseFiles([textFile("polluted.json", polluted), textFile("ctor.json", fileJson(EXAMPLES.slice(0, 1)).replace('"id":"example-1-1"', '"id":"example-1-1","constructor":{"prototype":{"polluted":"yes"}}'))]);
    await screen.findAllByText("허용되지 않는 항목이 들어 있어 열지 않았어요.");
    expect(screen.getAllByText("허용되지 않는 항목이 들어 있어 열지 않았어요.")).toHaveLength(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(screen.getByRole("heading", { name: "아직 가져온 응답이 없어요" })).toBeTruthy();
  });

  it("아주 깊거나 큰 JSON 은 구조가 복잡하다는 안내만 보이고 화면이 멈추지 않는다", async () => {
    renderPanel();
    chooseFiles([textFile("deep.json", "[".repeat(50_000)), textFile("wide.json", JSON.stringify(Array.from({ length: 30_000 }, () => 0)))]);
    await screen.findAllByText("구조가 너무 복잡해서 열지 않았어요.");
    expect(screen.getAllByText("구조가 너무 복잡해서 열지 않았어요.")).toHaveLength(2);
  });

  it("형식이 어긋난 값은 알려 준 위치와 함께 거절하고 입력의 키 이름을 되풀이하지 않는다", async () => {
    const { container } = renderPanel();
    const bad = JSON.parse(fileJson(EXAMPLES.slice(0, 1)));
    bad.responses[0].ratings.fun = 9;
    bad.responses[0]["<img src=x onerror=alert(1)>"] = 1;
    chooseFiles([textFile("bad-shape.json", JSON.stringify(bad))]);
    await screen.findByText(/파일 내용이 형식에 맞지 않아요/u);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("onerror");
  });
});

describe("ReaderFeedbackSummaryPanel: 의견 숨기기(이 브라우저에만 표시)", () => {
  function hideFirstRepresentative() {
    const representative = screen.getByRole("heading", { level: 5, name: "대표 의견" }).parentElement!;
    const list = within(representative).getAllByRole("list")[0]!;
    const first = within(list).getAllByRole("listitem")[0]!;
    const text = first.querySelector("p:last-of-type")?.textContent ?? "";
    fireEvent.click(within(first).getByRole("button", { name: "이 의견 숨기기" }));
    return text;
  }

  it("숨긴 의견은 대표 목록에서 빠지고 숨긴 의견 목록에 모이며 집계는 그대로다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    const before = screen.getByRole("heading", { level: 5, name: "점수 분포" }).parentElement!.textContent;
    const hiddenText = hideFirstRepresentative();
    expect(hiddenText).not.toBe("");
    const representative = screen.getByRole("heading", { level: 5, name: "대표 의견" }).parentElement!;
    const list = within(representative).getAllByRole("list")[0]!;
    expect(within(list).queryByText(hiddenText)).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("숨긴 의견 (1개)")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 5, name: "점수 분포" }).parentElement!.textContent).toBe(before);
    expect(JSON.parse(window.localStorage.getItem(READER_FEEDBACK_HIDDEN_KEY) ?? "null")).toEqual({ version: 1, ids: [expect.stringMatching(/^example-1-/u)] });
    // 숨긴 의견 목록에서 다시 보이게 할 수 있다.
    fireEvent.click(screen.getByRole("button", { name: "다시 보이기" }));
    expect(screen.queryByText(/^숨긴 의견/u)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(READER_FEEDBACK_HIDDEN_KEY) ?? "null")).toEqual({ version: 1, ids: [] });
  });

  it("숨김 표시는 화면을 다시 열어 같은 응답을 가져와도 이어진다", () => {
    const first = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    hideFirstRepresentative();
    first.unmount();
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    expect(screen.getByText("숨긴 의견 (1개)")).toBeTruthy();
  });

  it("저장소가 막혀 있어도 숨기기는 동작하고 저장되지 않는다고 알린다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    hideFirstRepresentative();
    expect(screen.getByText("숨긴 의견 (1개)")).toBeTruthy();
    expect(statusText()).toContain("이 브라우저가 저장을 막고 있어");
  });

  it("깨진 저장값이 있어도 숨김 없이 정상 시작한다", () => {
    window.localStorage.setItem(READER_FEEDBACK_HIDDEN_KEY, "{ 깨짐");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /예시 응답으로 체험하기/u }));
    expect(screen.queryByText(/^숨긴 의견/u)).toBeNull();
  });
});
