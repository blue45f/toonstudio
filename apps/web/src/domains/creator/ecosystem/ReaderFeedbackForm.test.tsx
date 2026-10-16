// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadEcosystemJson } from "./ecosystem-preview";
import { ReaderFeedbackForm } from "./ReaderFeedbackForm";
import type { KnownFeedbackTarget } from "./reader-feedback-draft";
import { parseReaderFeedbackText } from "./reader-feedback-io";
import { mergeReaderFeedback, summarizeReaderFeedback } from "./reader-feedback-summary";
import { CONTACT_MASK } from "./reader-feedback-text";

vi.mock("./ecosystem-preview", () => ({ downloadEcosystemJson: vi.fn() }));

const KNOWN: KnownFeedbackTarget = { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: null, cutCount: 12 };
const download = vi.mocked(downloadEcosystemJson);

function setNavigator(name: "share" | "canShare" | "clipboard", value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true });
}

function unsetNavigator(name: "share" | "canShare" | "clipboard") {
  Reflect.deleteProperty(window.navigator, name);
}

/** 마지막으로 내보낸 파일 내용(검증 스키마를 거쳐 다시 읽은 값). */
function lastExport() {
  const [filename, value] = download.mock.calls.at(-1) ?? [];
  const parsed = parseReaderFeedbackText(JSON.stringify(value));
  if (!parsed.ok) throw new Error(`내보낸 파일이 다시 읽히지 않습니다: ${parsed.code}`);
  return { filename: String(filename), response: parsed.file.responses[0]! };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "파일로 저장" }));
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));

beforeEach(() => {
  download.mockClear();
});

afterEach(() => {
  cleanup();
  unsetNavigator("share");
  unsetNavigator("canShare");
  unsetNavigator("clipboard");
});

describe("ReaderFeedbackForm", () => {
  it("아는 대상이면 작품 이름 입력 없이 대상을 보여 주고, 모든 입력이 이름으로 찾아진다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    expect(screen.getByRole("heading", { level: 3, name: "회차 피드백 남기기" })).toBeTruthy();
    expect(screen.getByText("새 연재작 1화")).toBeTruthy();
    expect(screen.queryByLabelText("작품 이름")).toBeNull();
    // 패키지가 정한 대상이면 작품 이름·회차를 독자가 다시 적지 않는다(묶음이 갈라지는 것을 막는다).
    expect(screen.queryByLabelText("회차 번호 (선택)")).toBeNull();
    for (const label of ["자유 의견 (선택)", "닉네임 (선택)"]) expect(screen.getByLabelText(label)).toBeTruthy();
    for (const legend of ["얼마나 재밌었나요?", "내용이 잘 이해됐나요?", "어디까지 읽었나요?"]) expect(screen.getByRole("group", { name: legend })).toBeTruthy();
    // 3단계 척도는 처음에 아무것도 고르지 않은 상태다(기본값이 결과를 한쪽으로 쏠리게 하지 않는다).
    const fun = screen.getByRole("group", { name: "얼마나 재밌었나요?" });
    expect(within(fun).getAllByRole("radio")).toHaveLength(3);
    expect(within(fun).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("group", { name: /느낀 감정/u })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: /느낀 감정/u })).getAllByRole("checkbox")).toHaveLength(10);
  });

  it("아무것도 답하지 않고 저장하면 안내하고 의견 칸으로 초점을 옮기며 파일을 만들지 않는다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    save();
    expect(screen.getByRole("alert").textContent).toContain("하나 이상 답해 주세요");
    expect(document.activeElement).toBe(screen.getByLabelText("자유 의견 (선택)"));
    expect(download).not.toHaveBeenCalled();
  });

  it("답한 내용을 검증된 파일로 저장하고, 서버로 보내지 않았다고 알린다", async () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("재밌었어요");
    choose("헷갈렸어요");
    choose("중간에 멈췄어요");
    fireEvent.change(screen.getByLabelText("몇 번째 컷에서 멈췄나요?"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "웃김" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "긴장" }));
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: "7컷 대사가 너무 빨라요." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "이 의견에는 줄거리 스포일러가 있어요" }));
    fireEvent.change(screen.getByLabelText("닉네임 (선택)"), { target: { value: "별빛" } });
    save();

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const { filename, response } = lastExport();
    expect(filename).toMatch(/^toonstudio-reader-feedback-[0-9a-f]{8}\.json$/u);
    expect(response).toMatchObject({
      target: { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: null },
      nickname: "별빛",
      ratings: { fun: 3, understanding: 1 },
      reading: { status: "left", point: { mode: "cut", cut: 7, cutCount: 12 } },
      emotions: ["funny", "tense"],
      comment: "7컷 대사가 너무 빨라요.",
      spoiler: true,
    });
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("서버로는 아무것도 보내지 않았어요");
    expect(screen.getByRole("button", { name: "새 의견 쓰기" })).toBeTruthy();
  });

  it("같은 폼에서 고쳐 다시 저장하면 같은 id 로, 새 의견 쓰기 뒤에는 다른 id 로 나간다", async () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("괜찮았어요");
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const first = lastExport().response;
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: "고친 의견" } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(lastExport().response.id).toBe(first.id);
    expect(lastExport().response.comment).toBe("고친 의견");

    fireEvent.click(screen.getByRole("button", { name: "새 의견 쓰기" }));
    expect((screen.getByLabelText("자유 의견 (선택)") as HTMLTextAreaElement).value).toBe("");
    choose("재밌었어요");
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    expect(lastExport().response.id).not.toBe(first.id);
  });

  it("작품 이름·회차를 바꿔 다시 저장하면 새 id 로 나가, 합쳐도 앞선 회차의 응답이 사라지지 않는다", async () => {
    render(<ReaderFeedbackForm />);
    const episode = screen.getByLabelText("회차 번호 (선택)");
    const comment = screen.getByLabelText("자유 의견 (선택)");
    fireEvent.change(screen.getByLabelText("작품 이름"), { target: { value: "내 작품" } });
    fireEvent.change(episode, { target: { value: "1" } });
    choose("재밌었어요");
    fireEvent.change(comment, { target: { value: "1화는 도입이 좋았어요." } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const first = lastExport().response;

    fireEvent.change(episode, { target: { value: "2" } });
    fireEvent.change(comment, { target: { value: "2화는 전개가 빨랐어요." } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    const second = lastExport().response;
    expect(second.id).not.toBe(first.id);

    // 작가 쪽에서 두 파일을 합치거나 따로 가져와도 1화 응답이 2화 응답에 덮이지 않는다.
    const together = mergeReaderFeedback([], [first, second]);
    expect(together).toMatchObject({ added: 2, updated: 0, duplicates: 0 });
    const apart = mergeReaderFeedback(mergeReaderFeedback([], [first]).responses, [second]);
    expect(apart).toMatchObject({ added: 1, updated: 0, duplicates: 0 });
    expect(summarizeReaderFeedback(apart.responses).map((group) => [group.episode, group.count])).toEqual([[1, 1], [2, 1]]);
  });

  it("작품 이름을 바꿔도 새 id 로 나가고, 대소문자·띄어쓰기만 바꾼 이름은 같은 응답을 고친 것으로 본다", async () => {
    render(<ReaderFeedbackForm />);
    const title = screen.getByLabelText("작품 이름");
    fireEvent.change(title, { target: { value: "My Story" } });
    choose("괜찮았어요");
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const first = lastExport().response;

    fireEvent.change(title, { target: { value: "  my   STORY " } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(lastExport().response.id).toBe(first.id);

    fireEvent.change(title, { target: { value: "Another Story" } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    expect(lastExport().response.id).not.toBe(first.id);
    expect(lastExport().response.target.title).toBe("Another Story");

    // 이름을 바꿨다가 도로 돌려도, 마지막으로 내보낸 묶음과 같을 때만 id 를 잇는다.
    const third = lastExport().response;
    fireEvent.change(title, { target: { value: "Another Story" } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(4));
    expect(lastExport().response.id).toBe(third.id);
  });

  it("저장한 뒤 무엇을 고쳐도 '새 의견 쓰기'가 계속 보이고, 누르면 처음 입력으로 초점을 옮긴다", async () => {
    render(<ReaderFeedbackForm />);
    expect(screen.queryByRole("button", { name: "새 의견 쓰기" })).toBeNull();
    fireEvent.change(screen.getByLabelText("작품 이름"), { target: { value: "내 작품" } });
    choose("재밌었어요");
    expect(screen.queryByRole("button", { name: "새 의견 쓰기" })).toBeNull();
    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "새 의견 쓰기" })).toBeTruthy());

    // 고치면 '저장했어요' 안내는 사라지지만(내용이 달라졌으므로) 새로 쓰는 길은 남는다.
    fireEvent.change(screen.getByLabelText("회차 번호 (선택)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: "2화 의견" } });
    expect(screen.getByRole("status").textContent).toBe("");
    const another = screen.getByRole("button", { name: "새 의견 쓰기" });

    fireEvent.click(another);
    expect(screen.queryByRole("button", { name: "새 의견 쓰기" })).toBeNull();
    expect((screen.getByLabelText("작품 이름") as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText("작품 이름"));
  });

  it("공유·복사가 실패하거나 취소된 시도만 있으면 '새 의견 쓰기'를 보이지 않는다(쓴 내용을 지울 이유가 없다)", async () => {
    const share = vi.fn(async (_data: ShareData) => { throw new DOMException("취소", "AbortError"); });
    setNavigator("share", share);
    setNavigator("canShare", () => true);
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("재밌었어요");
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("공유를 취소했어요"));
    expect(screen.queryByRole("button", { name: "새 의견 쓰기" })).toBeNull();
    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "새 의견 쓰기" })).toBeTruthy());
  });

  it("컷 번호가 전체 컷 수를 넘으면 필드 오류로 알리고 그 칸으로 초점을 옮긴다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("중간에 멈췄어요");
    expect(screen.getByText("이 회차는 모두 12컷이에요.")).toBeTruthy();
    const cut = screen.getByLabelText("몇 번째 컷에서 멈췄나요?");
    fireEvent.change(cut, { target: { value: "13" } });
    save();
    expect(cut.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(cut);
    const message = "컷 번호는 1~12 사이의 숫자로 적어 주세요.";
    expect(screen.getAllByText(message).length).toBeGreaterThanOrEqual(1);
    expect(cut.getAttribute("aria-describedby")).toBe(screen.getAllByText(message).find((node) => node.tagName === "P")?.id);
    expect(download).not.toHaveBeenCalled();
    // 고쳐 쓰면 오류가 사라진다.
    fireEvent.change(cut, { target: { value: "12" } });
    expect(screen.queryByText(message)).toBeNull();
  });

  it("스크롤 위치로 알리면 슬라이더 값이 퍼센트로 담기고 값 문구가 읽힌다", async () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("중간에 멈췄어요");
    choose("스크롤 위치");
    const slider = screen.getByLabelText("회차 전체 중 어디쯤에서 멈췄나요?");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("맨 위에서 80% 내려온 곳");
    expect(screen.getByText("80%")).toBeTruthy();
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(lastExport().response.reading).toEqual({ status: "left", point: { mode: "scroll", percent: 80 } });
  });

  it("감정은 3개까지만 고를 수 있고, 선택 취소로 답하지 않은 상태로 돌아간다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    const emotions = screen.getByRole("group", { name: /느낀 감정/u });
    for (const name of ["웃김", "긴장", "슬픔"]) fireEvent.click(within(emotions).getByRole("checkbox", { name }));
    expect((within(emotions).getByRole("checkbox", { name: "분노" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(emotions).getByRole("checkbox", { name: "웃김" }) as HTMLInputElement).disabled).toBe(false);
    expect(within(emotions).getByText("3/3")).toBeTruthy();
    fireEvent.click(within(emotions).getByRole("checkbox", { name: "웃김" }));
    expect((within(emotions).getByRole("checkbox", { name: "분노" }) as HTMLInputElement).disabled).toBe(false);

    const fun = screen.getByRole("group", { name: "얼마나 재밌었나요?" });
    choose("재밌었어요");
    fireEvent.click(within(fun).getByRole("button", { name: "선택 취소" }));
    expect(within(fun).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(within(fun).queryByRole("button", { name: "선택 취소" })).toBeNull();
  });

  it("선택 취소를 눌러 단추가 사라져도 초점이 body 로 떨어지지 않고 그 묶음의 첫 선택지로 간다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    const fun = screen.getByRole("group", { name: "얼마나 재밌었나요?" });
    choose("재밌었어요");
    const clearFun = within(fun).getByRole("button", { name: "선택 취소" });
    clearFun.focus();
    fireEvent.click(clearFun);
    expect(document.activeElement).toBe(within(fun).getAllByRole("radio")[0]);

    choose("중간에 멈췄어요");
    const reading = screen.getByRole("group", { name: "어디까지 읽었나요?" });
    const clearReading = within(reading).getAllByRole("button", { name: "선택 취소" }).at(-1)!;
    clearReading.focus();
    fireEvent.click(clearReading);
    expect(document.activeElement).toBe(within(reading).getAllByRole("radio")[0]);
    expect(within(reading).queryByRole("button", { name: "선택 취소" })).toBeNull();
  });

  it("대상을 모를 때는 작품 이름이 필요하고 회차 번호는 선택이다", async () => {
    render(<ReaderFeedbackForm />);
    choose("괜찮았어요");
    save();
    const title = screen.getByLabelText("작품 이름");
    expect(screen.getAllByText("작품 이름을 적어 주세요.").length).toBeGreaterThanOrEqual(1);
    expect(document.activeElement).toBe(title);
    fireEvent.change(title, { target: { value: "내 작품" } });
    const episode = screen.getByLabelText("회차 번호 (선택)");
    fireEvent.change(episode, { target: { value: "0" } });
    save();
    expect(episode.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(episode);
    expect(screen.getAllByText("회차는 1~9999 사이의 숫자로 적어 주세요.").length).toBeGreaterThanOrEqual(1);
    expect(download).not.toHaveBeenCalled();
    fireEvent.change(episode, { target: { value: "3" } });
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(lastExport().response.target).toEqual({ kind: "manual", id: null, title: "내 작품", episode: 3 });
    expect(lastExport().filename).toMatch(/^toonstudio-reader-feedback-ep3-[0-9a-f]{8}\.json$/u);
  });

  it("대상이 회차를 정해 두었으면 대상 줄에 보이고 그대로 담긴다", async () => {
    render(<ReaderFeedbackForm target={{ ...KNOWN, episode: 4 }} />);
    expect(screen.getByText("새 연재작 1화").parentElement!.textContent).toBe("대상: 새 연재작 1화 · 4화");
    choose("재밌었어요");
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(lastExport().response.target.episode).toBe(4);
  });

  it("이메일·전화번호처럼 보이는 내용은 경고하고 파일에서는 가린다", async () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: "연락은 mail@example.com 으로" } });
    fireEvent.change(screen.getByLabelText("닉네임 (선택)"), { target: { value: "010-1234-5678" } });
    expect(screen.getByText(/\[연락처 가림\]으로 바뀌거나 비워져요/u)).toBeTruthy();
    save();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(lastExport().response.comment).toBe(`연락은 ${CONTACT_MASK} 으로`);
    expect(lastExport().response.nickname).toBeNull();
  });

  it("HTML 조각을 적어도 요소로 해석하지 않고 글자 그대로 미리 보여 준다", () => {
    const { container } = render(<ReaderFeedbackForm target={KNOWN} />);
    const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: attack } });
    fireEvent.change(screen.getByLabelText("닉네임 (선택)"), { target: { value: "<b>굵게</b>" } });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    const preview = screen.getByLabelText("내보낼 파일 내용 (읽기 전용)") as HTMLTextAreaElement;
    expect(preview.readOnly).toBe(true);
    expect(preview.value).toContain("onerror=\\\"alert(1)\\\"");
    expect(preview.value).toContain("<b>굵게</b>");
  });

  it("미리 보기는 저장할 때 정해지는 id·시각을 안내 문구로 보여 주고, 입력 전에는 안내만 보인다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    expect(screen.getByText("답할 내용을 입력하면 여기에 파일 내용이 보여요.")).toBeTruthy();
    choose("재밌었어요");
    const preview = screen.getByLabelText("내보낼 파일 내용 (읽기 전용)") as HTMLTextAreaElement;
    expect(JSON.parse(preview.value)).toMatchObject({
      kind: "toonstudio-reader-feedback", version: 1, exportedAt: "(저장할 때 정해져요)",
      responses: [{ id: "(저장할 때 정해져요)", createdAt: "(저장할 때 정해져요)", ratings: { fun: 3, understanding: null } }],
    });
  });

  it("공유를 지원하지 않는 브라우저에서는 공유 버튼을 감춘다", () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    expect(screen.queryByRole("button", { name: "공유하기" })).toBeNull();
    expect(screen.getByRole("button", { name: "내용 복사" })).toBeTruthy();
  });

  it("공유를 지원하면 파일로 공유하고, 사용자가 닫으면 취소로 안내한다", async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setNavigator("share", share);
    setNavigator("canShare", () => true);
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("재밌었어요");
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]![0];
    expect(data.files?.[0]?.type).toBe("application/json");
    expect(data.title).toBe("새 연재작 1화");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/파일을 공유했어요/u));

    share.mockRejectedValueOnce(new DOMException("취소", "AbortError"));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("공유를 취소했어요"));

    share.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("공유하지 못했어요"));
  });

  it("내용 복사는 검증된 JSON 을 클립보드에 쓰고, 실패하면 직접 복사할 길을 안내한다", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    setNavigator("clipboard", { writeText });
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("재밌었어요");
    fireEvent.click(screen.getByRole("button", { name: "내용 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseReaderFeedbackText(writeText.mock.calls[0]![0]).ok).toBe(true);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("내용을 복사했어요"));

    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "내용 복사" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("복사하지 못했어요"));
  });

  it("클립보드가 없는 환경에서도 복사 버튼이 오류 대신 안내를 보인다", async () => {
    render(<ReaderFeedbackForm target={KNOWN} />);
    choose("재밌었어요");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "내용 복사" })); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("복사하지 못했어요"));
  });
});
