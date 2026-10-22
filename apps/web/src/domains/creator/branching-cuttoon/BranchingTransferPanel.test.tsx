// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  BRANCHING_IMPORT_LIMITS,
  parseBranchingCuttoonJson,
  serializeBranchingCuttoon,
  type BranchingCuttoonGraph,
} from "./model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import { tNow } from "./branching-cuttoon-test-kit";
import { BranchingTransferPanel } from "./BranchingTransferPanel";

const createObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  restore(URL, "createObjectURL", createObjectURL);
  restore(URL, "revokeObjectURL", revokeObjectURL);
  restore(navigator, "clipboard", clipboard);
  vi.restoreAllMocks();
  vi.useRealTimers();
  useI18n.getState().setLang("ko");
});

function sample(): BranchingCuttoonGraph {
  return createSampleBranchingGraph(tNow);
}

function renderPanel() {
  const onImport = vi.fn<(graph: BranchingCuttoonGraph, ignoredFieldCount: number) => void>();
  const graph = sample();
  const view = render(<BranchingTransferPanel graph={graph} onImport={onImport} />);
  return { ...view, onImport, graph };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });
const fileInput = (): HTMLInputElement => {
  const input = screen.getByLabelText("JSON 파일 고르기");
  if (!(input instanceof HTMLInputElement)) throw new Error("파일 입력 칸이 아니에요.");
  return input;
};

/** jsdom 의 File 은 text() 가 없을 수 있어 필요한 동작만 얹은 파일을 만든다. */
function fileWith(read: () => Promise<string>, size = 100): File {
  const file = new File(["x"], "story.json", { type: "application/json" });
  Object.defineProperty(file, "text", { configurable: true, value: read });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function chooseFile(file: File): void {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

describe("내보내기", () => {
  function stubDownload() {
    const created: Blob[] = [];
    const revoked: string[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: (blob: Blob): string => {
        created.push(blob);
        return "blob:branching-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: (url: string): void => {
        revoked.push(url);
      },
    });
    const clicked: Array<{ href: string; download: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    return { created, revoked, clicked };
  }

  it("JSON 파일로 내보내면 지금 초안이 그대로 담긴 파일이 내려가고, 보관하라고 알린다", async () => {
    const download = stubDownload();
    const { graph } = renderPanel();
    fireEvent.click(button("JSON 파일로 내보내기"));
    expect(download.clicked).toEqual([{ href: "blob:branching-test", download: "branching-cuttoon.json" }]);
    expect(download.created).toHaveLength(1);
    const blob = download.created[0];
    expect(blob?.type).toBe("application/json");
    expect(screen.getByText("파일로 내보냈어요. 내려받은 파일을 따로 보관해 주세요.")).toBeTruthy();
    // 내보낸 글을 다시 읽으면 같은 그래프가 된다(왕복).
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("읽기 실패"));
      if (blob) reader.readAsText(blob);
    });
    expect(text).toBe(serializeBranchingCuttoon(graph));
    const parsed = parseBranchingCuttoonJson(text);
    expect(parsed.ok && parsed.graph).toEqual(graph);
  });

  it("임시 주소는 시간이 지나면 해제한다", () => {
    vi.useFakeTimers();
    const download = stubDownload();
    renderPanel();
    fireEvent.click(button("JSON 파일로 내보내기"));
    expect(download.revoked).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(download.revoked).toEqual(["blob:branching-test"]);
  });

  it("파일로 내보낼 수 없는 환경이면 복사 버튼을 안내한다", () => {
    Reflect.deleteProperty(URL, "createObjectURL");
    renderPanel();
    fireEvent.click(button("JSON 파일로 내보내기"));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("파일로 내보내지 못했어요. JSON 복사 버튼을 눌러 직접 보관해 주세요.");
  });

  it("내려받기 중에 던져도 화면이 멈추지 않고 실패를 알린다", () => {
    stubDownload();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("차단됨");
    });
    renderPanel();
    fireEvent.click(button("JSON 파일로 내보내기"));
    expect(screen.getByRole("alert").textContent).toContain("파일로 내보내지 못했어요");
  });

  it("JSON 복사는 클립보드에 같은 글을 쓰고 복사했다고 알린다", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { graph } = renderPanel();
    fireEvent.click(button("JSON 복사"));
    await waitFor(() => expect(screen.getByText("JSON 을 복사했어요. 메모나 파일에 붙여 넣어 보관해 주세요.")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(serializeBranchingCuttoon(graph));
  });

  it("복사가 거절되거나 클립보드가 없으면 실패와 다음 행동을 알린다", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("거절"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();
    fireEvent.click(button("JSON 복사"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("복사하지 못했어요. JSON 파일로 내보내기 버튼을 눌러 파일로 받아 주세요."));

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    fireEvent.click(button("JSON 복사"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("복사하지 못했어요"));
  });

  it("오류가 남은 초안도 내보낼 수 있다고 미리 알린다", () => {
    renderPanel();
    expect(screen.getByText("지금 초안을 그대로 JSON 으로 만들어요. 오류가 남아 있어도 내보낼 수 있어요.")).toBeTruthy();
    expect(screen.getByText(/서버로 보내지 않고 이 기기 안에서만 읽고 써요/u)).toBeTruthy();
  });
});

describe("가져오기 — 붙여넣기", () => {
  const paste = (text: string): void => {
    fireEvent.change(screen.getByLabelText("또는 JSON 붙여넣기"), { target: { value: text } });
  };

  it("비어 있거나 공백뿐이면 가져오기 버튼이 꺼져 있다", () => {
    renderPanel();
    expect(button("붙여넣은 JSON 가져오기").hasAttribute("disabled")).toBe(true);
    paste("  \n ");
    expect(button("붙여넣은 JSON 가져오기").hasAttribute("disabled")).toBe(true);
    paste("{}");
    expect(button("붙여넣은 JSON 가져오기").hasAttribute("disabled")).toBe(false);
  });

  it("모양이 맞는 JSON 은 부모에게 그래프와 건너뛴 항목 수를 넘기고 칸을 비운다", () => {
    const { onImport } = renderPanel();
    paste(serializeBranchingCuttoon(sample()));
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]?.[0]).toEqual(sample());
    expect(onImport.mock.calls[0]?.[1]).toBe(0);
    expect((screen.getByLabelText("또는 JSON 붙여넣기") as HTMLTextAreaElement).value).toBe("");
  });

  it("알 수 없는 필드는 개수만 세어 넘긴다", () => {
    const { onImport } = renderPanel();
    const parsed: unknown = JSON.parse(serializeBranchingCuttoon(sample()));
    if (typeof parsed !== "object" || parsed === null) throw new Error("준비 실패");
    paste(JSON.stringify({ ...parsed, 낯선: 1, 또낯선: 2 }));
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(onImport.mock.calls[0]?.[1]).toBe(2);
  });

  it("JSON 이 아니면 부모를 부르지 않고 원인과 다음 행동을 알린다", () => {
    const { onImport } = renderPanel();
    paste("이건 JSON 이 아니에요");
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(onImport).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("가져오지 못했어요. 파일 모양을 확인하고 다시 시도해 주세요.");
    expect(alert.textContent).toContain("JSON 형식이 아니에요. 내보낸 파일이 맞는지 확인해 주세요.");
    // 붙여넣은 글은 지우지 않아 고쳐서 다시 시도할 수 있다.
    expect((screen.getByLabelText("또는 JSON 붙여넣기") as HTMLTextAreaElement).value).toBe("이건 JSON 이 아니에요");
  });

  it("모양이 틀린 위치를 알리고, 많으면 다섯 줄까지만 보이며 나머지는 개수로 알린다", () => {
    const { onImport } = renderPanel();
    const broken = JSON.stringify({
      format: "toonstudio.branching-cuttoon",
      schemaVersion: 1,
      title: "깨진 이야기",
      startNodeId: "a",
      cuts: [],
      nodes: Array.from({ length: 10 }, () => ({})),
    });
    paste(broken);
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(onImport).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(5);
    expect(alert.textContent).toMatch(/nodes\[0\]\.\w+ 항목이 없어요/u);
    expect(alert.textContent).toMatch(/이 밖에도 \d+개의 문제가 더 있어요\./u);
  });

  it("형식 이름이 다른 파일은 이 화면의 파일이 아니라고 알린다", () => {
    renderPanel();
    paste(JSON.stringify({ format: "other", schemaVersion: 1 }));
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(screen.getByRole("alert").textContent).toContain("분기형 컷툰 파일이 아니에요");
  });

  it("지원하지 않는 판 번호는 그렇다고 알린다", () => {
    renderPanel();
    paste(JSON.stringify({ format: "toonstudio.branching-cuttoon", schemaVersion: 99 }));
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(screen.getByRole("alert").textContent).toContain("지원하지 않는 판 번호예요");
  });

  it("실패 뒤에 고쳐서 다시 가져오면 오류 안내가 사라진다", () => {
    const { onImport } = renderPanel();
    paste("{");
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(screen.getByRole("alert")).toBeTruthy();
    paste(serializeBranchingCuttoon(sample()));
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe("가져오기 — 파일", () => {
  it("파일을 고르면 읽어서 같은 방식으로 부모에게 넘기고, 같은 파일을 다시 고를 수 있게 선택을 비운다", async () => {
    const { onImport } = renderPanel();
    const text = serializeBranchingCuttoon(sample());
    chooseFile(fileWith(() => Promise.resolve(text)));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0]?.[0]).toEqual(sample());
    expect(fileInput().value).toBe("");
  });

  it("읽는 동안에는 상태를 알리고, 끝나면 사라진다", async () => {
    const { onImport } = renderPanel();
    let finish: (text: string) => void = () => undefined;
    chooseFile(fileWith(() => new Promise<string>((resolve) => { finish = resolve; })));
    const reading = screen.getByRole("status", { name: "파일을 읽는 중이에요…" });
    expect(reading.getAttribute("aria-busy")).toBe("true");
    expect(onImport).not.toHaveBeenCalled();
    await act(async () => { finish(serializeBranchingCuttoon(sample())); });
    expect(screen.queryByRole("status", { name: "파일을 읽는 중이에요…" })).toBeNull();
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("파일을 읽지 못하면 안내와 ‘다시 시도’를 보이고, 다시 시도하면 같은 파일을 읽는다", async () => {
    const { onImport } = renderPanel();
    let attempts = 0;
    const text = serializeBranchingCuttoon(sample());
    chooseFile(fileWith(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("읽기 실패")) : Promise.resolve(text);
    }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("파일을 읽지 못했어요. 다시 시도하거나 다른 파일을 골라 주세요.");
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(attempts).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("너무 큰 파일은 읽기 전에 거절하고 크기 안내를 한다", () => {
    const read = vi.fn<() => Promise<string>>().mockResolvedValue("{}");
    const { onImport } = renderPanel();
    chooseFile(fileWith(read, BRANCHING_IMPORT_LIMITS.maxTextLength * 3 + 1));
    expect(read).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("파일이 너무 커요. 1MiB 이하의 파일만 읽어요");
  });

  it("파일 안의 내용이 JSON 이 아니면 붙여넣기와 같은 오류 안내를 보인다", async () => {
    const { onImport } = renderPanel();
    chooseFile(fileWith(() => Promise.resolve("<html></html>")));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("JSON 형식이 아니에요");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("파일을 고르지 않고 대화상자를 닫으면 아무 일도 하지 않는다", () => {
    const { onImport } = renderPanel();
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("접근성과 영어", () => {
  it("입력 칸은 모두 보이는 label 로 이름이 붙고, 구역은 제목으로 이름이 붙는다", () => {
    renderPanel();
    expect(screen.getByRole("region", { name: "내보내기와 가져오기" })).toBeTruthy();
    expect(screen.getByLabelText("JSON 파일 고르기").getAttribute("type")).toBe("file");
    expect(screen.getByLabelText("또는 JSON 붙여넣기").tagName).toBe("TEXTAREA");
    expect(fileInput().accept).toContain(".json");
  });

  it("영어에서도 같은 구조로 보인다", () => {
    useI18n.getState().setLang("en");
    renderPanel();
    expect(screen.getByRole("region", { name: tNow("branchingCuttoon.transfer.heading") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tNow("branchingCuttoon.transfer.exportFile") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "JSON 복사" })).toBeNull();
  });
});
