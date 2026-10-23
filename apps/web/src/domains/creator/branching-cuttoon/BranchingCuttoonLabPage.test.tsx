// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  BRANCHING_CUTTOON_LIMITS,
  serializeBranchingCuttoon,
  validateBranchingCuttoon,
  type BranchingCuttoonGraph,
} from "./model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import { BRANCHING_DRAFT_STORAGE_KEY, progressStorageKey, readDraft, writeDraft } from "./branching-cuttoon-storage";
import { memoryStore, tNow, type MemoryStore } from "./branching-cuttoon-test-kit";
import { BranchingCuttoonLabPage } from "./BranchingCuttoonLabPage";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  useI18n.getState().setLang("ko");
});

function sample(): BranchingCuttoonGraph {
  return createSampleBranchingGraph(tNow);
}

function renderPage(store: MemoryStore = memoryStore()) {
  const view = render(<BranchingCuttoonLabPage storage={store.resolve} />);
  return { ...view, store };
}

/** 샘플을 불러온 화면. 처음 화면은 아직 아무것도 만들지 않아 확인 없이 바로 바뀐다. */
function renderWithSample() {
  const page = renderPage();
  fireEvent.click(button("샘플 불러오기"));
  return page;
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });
const field = (label: string | RegExp): HTMLElement => screen.getByLabelText(label);
const nodeNav = (): HTMLElement => screen.getByRole("navigation", { name: /^장면 목록/u });
const nodeButton = (title: string | RegExp): HTMLElement => within(nodeNav()).getByRole("button", { name: title });
const selectedNodeButton = (): HTMLElement => {
  const selected = within(nodeNav()).getAllByRole("button").filter((found) => found.getAttribute("aria-current") === "true");
  const [only] = selected;
  if (selected.length !== 1 || !only) throw new Error(`선택된 장면 버튼이 ${selected.length}개예요.`);
  return only;
};
const editHeading = (title: string): HTMLElement => screen.getByRole("heading", { level: 3, name: `장면 편집: ${title}` });
const status = (text: string | RegExp): HTMLElement => screen.getByText(text);

function savedDraft(store: MemoryStore): BranchingCuttoonGraph | null {
  const result = readDraft(store.resolve);
  return result.kind === "restored" ? result.graph : null;
}

describe("분기형 컷툰 실험실 — 처음 화면", () => {
  it("실험 기능임과 저장 범위, 아직 없는 것(서버 저장·통계·정산)을 먼저 밝힌다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "분기형 컷툰" })).toBeTruthy();
    expect(screen.getByText("실험 기능")).toBeTruthy();
    expect(screen.getByText("이 기기에만 저장돼요")).toBeTruthy();
    expect(screen.getByText(/서버 저장, 독자 통계, 정산은 아직 없어요/u)).toBeTruthy();
    expect(screen.getByText(/JSON 으로 내보내서 따로 보관해 주세요/u)).toBeTruthy();
  });

  it("화면 선택 묶음에서 ‘만들기’가 눌린 상태로 시작한다", () => {
    renderPage();
    const modes = screen.getByRole("group", { name: "화면 선택" });
    expect(within(modes).getByRole("button", { name: "만들기" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(modes).getByRole("button", { name: "미리 읽기" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("저장된 초안이 없으면 시작 장면 하나뿐인 새 이야기로 시작하고, 고칠 항목을 바로 알린다", () => {
    renderPage();
    expect(selectedNodeButton().textContent).toContain("시작 장면");
    expect(editHeading("시작 장면")).toBeTruthy();
    expect(screen.getByText(/고쳐야 할 오류가 \d+개/u)).toBeTruthy();
    expect(screen.queryByText(/저장해 둔 초안을 읽지 못해/u)).toBeNull();
  });

  it("아무것도 하지 않으면 저장소에 아무것도 쓰지 않는다", () => {
    const { store } = renderPage();
    expect(store.writeAttempts()).toBe(0);
  });

  it("아직 읽을 수 없는 이야기는 ‘미리 읽기’에서 고칠 항목이 있다고 안내하고, ‘고치러 가기’로 돌아온다", () => {
    renderPage();
    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { level: 2, name: "미리 읽기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "먼저 고칠 항목이 있어요" })).toBeTruthy();
    fireEvent.click(button("고치러 가기"));
    expect(screen.getByRole("heading", { level: 2, name: "이야기 만들기" })).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 샘플과 새로 시작", () => {
  it("샘플을 불러오면 오류 없이 읽을 수 있다고 알리고, 장면 목록과 점검 결과가 채워진다", () => {
    const { store } = renderWithSample();
    expect(status("샘플 이야기를 불러왔어요. 오류 없이 읽을 수 있고, 되돌아가는 길 경고가 하나 들어 있어요.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    expect(status("오류는 없고 확인할 경고가 1개 있어요. 미리 읽을 수 있어요.")).toBeTruthy();
    expect(savedDraft(store)).toEqual(sample());
  });

  it("처음 화면에서는 확인 없이 바뀌고, 만들어 둔 내용이 있으면 먼저 확인한다", () => {
    renderWithSample();
    fireEvent.click(button("새로 시작"));
    const confirm = screen.getByRole("group", { name: "초안 바꾸기 확인" });
    expect(confirm.textContent).toContain("지금 만든 초안(장면 8개)을 바꿀까요?");
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("group", { name: "초안 바꾸기 확인" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();

    fireEvent.click(button("새로 시작"));
    fireEvent.click(within(screen.getByRole("group", { name: "초안 바꾸기 확인" })).getByRole("button", { name: "초안 바꾸기" }));
    expect(screen.getByRole("navigation", { name: "장면 목록 (1/200)" })).toBeTruthy();
    expect(status("새로 시작했어요. 시작 장면 하나만 있어요.")).toBeTruthy();
  });

  it("컷만 하나 더해도 만든 내용으로 보고 샘플로 바꾸기 전에 확인한다", () => {
    renderPage();
    fireEvent.click(button("컷 추가"));
    fireEvent.click(button("샘플 불러오기"));
    expect(screen.getByRole("group", { name: "초안 바꾸기 확인" })).toBeTruthy();
  });

  it("시작 장면의 제목만 고친 초안은 아직 만든 내용이 아니라서 확인 없이 바뀐다", () => {
    renderPage();
    fireEvent.change(field("장면 제목"), { target: { value: "내 시작" } });
    fireEvent.click(button("샘플 불러오기"));
    expect(screen.queryByRole("group", { name: "초안 바꾸기 확인" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 초안 저장과 복원", () => {
  it("저장해 둔 초안이 있으면 그대로 되살린다", () => {
    const store = memoryStore();
    writeDraft(store.resolve, sample());
    renderPage(store);
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    expect(editHeading("비 오는 골목")).toBeTruthy();
    expect(screen.queryByText(/저장해 둔 초안을 읽지 못해/u)).toBeNull();
  });

  it("고칠 때마다 이 브라우저에 저장한다", () => {
    const { store } = renderWithSample();
    fireEvent.change(field("장면 제목"), { target: { value: "고친 시작" } });
    expect(savedDraft(store)?.nodes.find((node) => node.id === "rain")?.title).toBe("고친 시작");
  });

  it("읽을 수 없는 초안이 있으면 새 초안으로 시작하며 알리고, 고치기 시작하면 안내가 사라진다", () => {
    const store = memoryStore({ [BRANCHING_DRAFT_STORAGE_KEY]: "깨진 값" });
    renderPage(store);
    expect(status(/저장해 둔 초안을 읽지 못해 새 초안으로 시작했어요/u)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (1/200)" })).toBeTruthy();
    // 안내만으로는 저장소를 건드리지 않는다(이전 값을 지우지 않는다).
    expect(store.writeAttempts()).toBe(0);
    fireEvent.change(field("장면 제목"), { target: { value: "다시 시작" } });
    expect(screen.queryByText(/저장해 둔 초안을 읽지 못해/u)).toBeNull();
    expect(savedDraft(store)?.nodes[0]?.title).toBe("다시 시작");
  });

  it("저장하지 못해도 화면 내용은 그대로이고, 저장이 되살아나면 안내가 사라진다", () => {
    const store = memoryStore();
    store.failWrites = true;
    renderPage(store);
    fireEvent.change(field("장면 제목"), { target: { value: "고친 시작" } });
    expect(status(/이 브라우저에 초안을 저장하지 못했어요/u)).toBeTruthy();
    expect(screen.getByText(/JSON 파일로 내보내기 버튼을 눌러 따로 보관해 주세요/u)).toBeTruthy();
    expect((field("장면 제목") as HTMLInputElement).value).toBe("고친 시작");
    store.failWrites = false;
    fireEvent.change(field("장면 제목"), { target: { value: "다시 고친 시작" } });
    expect(screen.queryByText(/이 브라우저에 초안을 저장하지 못했어요/u)).toBeNull();
    expect(savedDraft(store)?.nodes[0]?.title).toBe("다시 고친 시작");
  });
});

describe("분기형 컷툰 실험실 — 장면 목록 편집", () => {
  it("장면과 결말을 더하면 목록에 생기고, 새 장면의 제목 칸으로 초점이 간다", () => {
    renderPage();
    fireEvent.click(button("장면 추가"));
    expect(screen.getByRole("navigation", { name: "장면 목록 (2/200)" })).toBeTruthy();
    expect(editHeading("새 장면")).toBeTruthy();
    expect(document.activeElement).toBe(field("장면 제목"));
    expect((field("장면 제목") as HTMLInputElement).value).toBe("새 장면");
    expect(selectedNodeButton().textContent).toContain("새 장면");

    fireEvent.click(button("결말 추가"));
    expect(screen.getByRole("navigation", { name: "장면 목록 (3/200)" })).toBeTruthy();
    expect(editHeading("새 결말")).toBeTruthy();
    expect(selectedNodeButton().textContent).toContain("결말");
  });

  it("장면 종류와 오류·경고 수를 글자로 함께 보여 준다(색만으로 전달하지 않는다)", () => {
    renderWithSample();
    expect(nodeButton(/비 오는 골목/u).textContent).toContain("시작");
    expect(nodeButton(/사물함의 편지/u).textContent).toContain("결말");
    expect(nodeButton(/빗속의 발소리/u).textContent).toContain("경고 1");
  });

  it("장면을 고르면 그 장면의 양식으로 바뀌고 aria-current 가 옮겨 간다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/우산 아래/u));
    expect(editHeading("우산 아래")).toBeTruthy();
    expect(selectedNodeButton().textContent).toContain("우산 아래");
    expect(within(nodeNav()).getAllByRole("button").filter((found) => found.getAttribute("aria-current") === "true")).toHaveLength(1);
  });

  it("제목을 고치면 목록과 양식 제목이 함께 바뀌고 입력 길이는 한도에서 멈춘다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/우산 아래/u));
    const title = field("장면 제목") as HTMLInputElement;
    expect(title.maxLength).toBe(BRANCHING_CUTTOON_LIMITS.nodeTitleLength);
    fireEvent.change(title, { target: { value: "비를 피하는 곳" } });
    expect(editHeading("비를 피하는 곳")).toBeTruthy();
    expect(nodeButton(/비를 피하는 곳/u)).toBeTruthy();
  });

  it("종류를 장면 ↔ 결말로 바꿀 수 있고, 결말에 남은 선택지는 경고로 알린다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/함께 걷는 길/u));
    fireEvent.change(field("장면 종류"), { target: { value: "ending" } });
    expect(screen.getByText(/함께 걷는 길: 결말 장면의 선택지 1개는 독자에게 보이지 않아요/u)).toBeTruthy();
    expect(screen.getByText("결말 장면에는 선택지를 두지 않아요. 남아 있는 선택지는 독자에게 보이지 않으니 지워 주세요.")).toBeTruthy();
    // 결말에는 선택지를 더하는 버튼이 없다.
    expect(screen.queryByRole("button", { name: "선택지 추가" })).toBeNull();
    fireEvent.change(field("장면 종류"), { target: { value: "scene" } });
    expect(screen.queryByText(/결말 장면의 선택지 1개는/u)).toBeNull();
  });

  it("다른 장면을 시작 장면으로 지정하면 이전 시작 장면은 일반 장면이 된다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/우산 아래/u));
    fireEvent.click(button("시작 장면으로 지정"));
    expect(nodeButton(/우산 아래/u).textContent).toContain("시작");
    expect(nodeButton(/비 오는 골목/u).textContent).toContain("장면");
    expect(screen.getByText("이야기가 시작되는 장면이에요.")).toBeTruthy();
  });

  it("시작 장면은 지울 수 없고 이유를 안내한다", () => {
    renderWithSample();
    expect(screen.queryByRole("button", { name: "장면 지우기" })).toBeNull();
    expect(screen.getByText(/시작 장면은 지울 수 없어요/u)).toBeTruthy();
  });

  it("장면을 지울 때는 먼저 확인하고, 그 장면으로 오던 선택지가 함께 지워진다고 알린다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/우산 아래/u));
    fireEvent.click(button("장면 지우기"));
    const confirm = screen.getByRole("group", { name: "장면 지우기 확인" });
    expect(confirm.textContent).toContain("이 장면을 지울까요? 이 장면으로 오는 선택지 1개도 함께 지워져요.");
    fireEvent.click(within(confirm).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("group", { name: "장면 지우기 확인" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();

    fireEvent.click(button("장면 지우기"));
    fireEvent.click(within(screen.getByRole("group", { name: "장면 지우기 확인" })).getByRole("button", { name: "지우기" }));
    expect(screen.getByRole("navigation", { name: "장면 목록 (7/200)" })).toBeTruthy();
    expect(within(nodeNav()).queryByRole("button", { name: /우산 아래/u })).toBeNull();
    // 선택은 시작 장면으로 옮겨 가고 양식도 바뀐다.
    expect(editHeading("비 오는 골목")).toBeTruthy();
    expect(selectedNodeButton().textContent).toContain("비 오는 골목");
  });

  it("장면 수 한도에 닿으면 더하지 않고 이유와 다음 행동을 안내한다", () => {
    const store = memoryStore();
    const full: BranchingCuttoonGraph = {
      title: "가득 찬 이야기",
      startNodeId: "n0",
      cuts: [],
      nodes: Array.from({ length: BRANCHING_CUTTOON_LIMITS.nodes }, (_unused, index) => ({
        id: `n${index}`,
        kind: index === 0 ? "start" : "scene",
        title: `장면 ${index}`,
        cutIds: [],
        choices: [],
      })),
    };
    writeDraft(store.resolve, full);
    renderPage(store);
    fireEvent.click(button("장면 추가"));
    expect(screen.getByText("장면은 200개까지만 만들 수 있어요. 필요 없는 장면을 지운 뒤 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (200/200)" })).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 컷과 선택지 편집", () => {
  it("컷을 더하면 글 입력 칸으로 초점이 가고, 글을 쓰면 반영·저장된다", () => {
    const { store } = renderPage();
    fireEvent.click(button("컷 추가"));
    const caption = field("컷 1 글") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(caption);
    expect(caption.maxLength).toBe(BRANCHING_CUTTOON_LIMITS.captionLength);
    fireEvent.change(caption, { target: { value: "비가 내려요." } });
    expect((field("컷 1 글") as HTMLTextAreaElement).value).toBe("비가 내려요.");
    expect(savedDraft(store)?.cuts[0]?.caption).toBe("비가 내려요.");
    expect(screen.getByText("컷 (1/30)")).toBeTruthy();
  });

  it("컷 순서를 옮기고 빼며, 뺀 뒤에는 ‘컷 추가’ 버튼으로 초점이 돌아온다", () => {
    renderWithSample();
    expect(screen.getByText("컷 (3/30)")).toBeTruthy();
    expect((field("컷 1 글") as HTMLTextAreaElement).value).toBe("좁은 골목에 비가 쏟아지고 있어요.");
    expect(button("컷 1 위로 옮기기").hasAttribute("disabled")).toBe(true);
    expect(button("컷 3 아래로 옮기기").hasAttribute("disabled")).toBe(true);
    fireEvent.click(button("컷 1 아래로 옮기기"));
    expect((field("컷 2 글") as HTMLTextAreaElement).value).toBe("좁은 골목에 비가 쏟아지고 있어요.");
    fireEvent.click(button("컷 2 빼기"));
    expect(screen.getByText("컷 (2/30)")).toBeTruthy();
    expect(document.activeElement).toBe(button("컷 추가"));
  });

  it("선택지를 더하면 이름 칸으로 초점이 가고, 도착 장면 목록에는 모든 장면이 제목으로 나온다", () => {
    renderPage();
    fireEvent.click(button("장면 추가"));
    fireEvent.click(nodeButton(/시작 장면/u));
    fireEvent.click(button("선택지 추가"));
    const label = field("선택지 1 이름") as HTMLInputElement;
    expect(document.activeElement).toBe(label);
    expect(label.maxLength).toBe(BRANCHING_CUTTOON_LIMITS.choiceLabelLength);
    const target = field("선택지 1 도착 장면") as HTMLSelectElement;
    const options = within(target).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["도착 장면을 골라 주세요", "시작 장면", "새 장면"]);
    expect(target.value).toBe("");

    fireEvent.change(label, { target: { value: "문을 연다" } });
    fireEvent.change(target, { target: { value: "n1" } });
    expect((field("선택지 1 이름") as HTMLInputElement).value).toBe("문을 연다");
    expect((field("선택지 1 도착 장면") as HTMLSelectElement).value).toBe("n1");
  });

  it("제목이 같은 장면은 식별자를 덧붙여 도착 장면 선택에서 구분한다", () => {
    renderPage();
    fireEvent.click(button("장면 추가"));
    fireEvent.click(button("장면 추가"));
    fireEvent.click(nodeButton(/시작 장면/u));
    fireEvent.click(button("선택지 추가"));
    const options = within(field("선택지 1 도착 장면")).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["도착 장면을 골라 주세요", "시작 장면", "새 장면 (n1)", "새 장면 (n2)"]);
  });

  it("선택지 순서를 옮기고 지우며, 지운 뒤에는 ‘선택지 추가’ 버튼으로 초점이 돌아온다", () => {
    renderWithSample();
    expect((field("선택지 1 이름") as HTMLInputElement).value).toBe("우산을 건네요");
    expect(button("선택지 1 위로 옮기기").hasAttribute("disabled")).toBe(true);
    fireEvent.click(button("선택지 1 아래로 옮기기"));
    expect((field("선택지 1 이름") as HTMLInputElement).value).toBe("못 본 척 지나가요");
    fireEvent.click(button("선택지 1 지우기"));
    expect(screen.getByText("선택지 (1/6)")).toBeTruthy();
    expect(document.activeElement).toBe(button("선택지 추가"));
  });

  it("장면마다 선택지는 6개까지이고, 넘기려 하면 더하지 않고 안내한다", () => {
    renderWithSample();
    for (let count = 2; count < BRANCHING_CUTTOON_LIMITS.choicesPerNode; count += 1) fireEvent.click(button("선택지 추가"));
    expect(screen.getByText("선택지 (6/6)")).toBeTruthy();
    fireEvent.click(button("선택지 추가"));
    expect(screen.getByText("선택지는 장면마다 6개까지만 둘 수 있어요.")).toBeTruthy();
    expect(screen.getByText("선택지 (6/6)")).toBeTruthy();
    expect(screen.queryByLabelText("선택지 7 이름")).toBeNull();
  });

  it("컷 한도(장면마다 30개)에 닿으면 더하지 않고 안내한다", () => {
    renderPage();
    for (let count = 0; count < BRANCHING_CUTTOON_LIMITS.cutsPerNode; count += 1) fireEvent.click(button("컷 추가"));
    expect(screen.getByText("컷 (30/30)")).toBeTruthy();
    fireEvent.click(button("컷 추가"));
    expect(screen.getByText("컷은 장면마다 30개까지만 둘 수 있어요.")).toBeTruthy();
    expect(screen.getByText("컷 (30/30)")).toBeTruthy();
  });

  it("컷 표에 없는 컷을 가리키는 초안은 글을 고칠 수 없다고 안내하고 참조를 뺄 수 있다", () => {
    const store = memoryStore();
    const broken: BranchingCuttoonGraph = {
      title: "깨진 이야기",
      startNodeId: "start",
      cuts: [],
      nodes: [{ id: "start", kind: "start", title: "시작", cutIds: ["k9"], choices: [] }],
    };
    writeDraft(store.resolve, broken);
    renderPage(store);
    const caption = field("컷 1 글") as HTMLTextAreaElement;
    expect(caption.readOnly).toBe(true);
    expect(caption.placeholder).toBe("컷 표에 없는 컷이에요 (k9). 이 컷을 빼고 새로 추가해 주세요.");
    fireEvent.click(button("컷 1 빼기"));
    expect(screen.getByText("컷 (0/30)")).toBeTruthy();
  });

  it("없는 장면을 가리키는 선택지는 그 값을 감추지 않고 보여 준다", () => {
    const store = memoryStore();
    const broken: BranchingCuttoonGraph = {
      title: "깨진 이야기",
      startNodeId: "start",
      cuts: [],
      nodes: [{ id: "start", kind: "start", title: "시작", cutIds: [], choices: [{ id: "c1", label: "가요", targetNodeId: "사라진곳" }] }],
    };
    writeDraft(store.resolve, broken);
    renderPage(store);
    const target = field("선택지 1 도착 장면") as HTMLSelectElement;
    expect(target.value).toBe("사라진곳");
    expect(within(target).getByRole("option", { name: "없는 장면 (사라진곳)" })).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 점검 결과와 이동", () => {
  it("항목을 누르면 그 장면으로 이동하고, 선택지 문제는 선택지 이름 칸에 초점을 둔다", () => {
    renderWithSample();
    // 샘플의 경고: ‘빗속의 발소리’의 선택지 1 이 시작 장면으로 되돌아간다.
    const item = screen.getByRole("button", { name: /되돌아가는 길이에요/u });
    expect(item.textContent).toContain("해당 장면으로 이동");
    fireEvent.click(item);
    expect(editHeading("빗속의 발소리")).toBeTruthy();
    expect(selectedNodeButton().textContent).toContain("빗속의 발소리");
    const label = field("선택지 1 이름") as HTMLInputElement;
    expect(label.value).toBe("다시 골목 입구로 돌아가요");
    expect(document.activeElement).toBe(label);
  });

  it("같은 항목을 다시 눌러도 다시 이동한다(다른 곳으로 초점이 갔다 와도)", () => {
    renderWithSample();
    const item = screen.getByRole("button", { name: /되돌아가는 길이에요/u });
    fireEvent.click(item);
    field("장면 제목").focus();
    expect(document.activeElement).toBe(field("장면 제목"));
    fireEvent.click(screen.getByRole("button", { name: /되돌아가는 길이에요/u }));
    expect(document.activeElement).toBe(field("선택지 1 이름"));
  });

  it("장면 단위 문제는 제목 칸으로, 이동할 장면이 없는 항목은 눌러지지 않는 글로 보인다", () => {
    renderPage();
    // 새 초안: 막다른 길(시작 장면)과 결말 없음. 결말 없음은 장면이 없는 항목이다.
    const ending = screen.getByText("결말 장면이 하나도 없어요. 결말 장면을 하나 이상 더해 주세요.");
    expect(ending.closest("button")).toBeNull();
    const deadEnd = screen.getByRole("button", { name: /막다른 길이에요/u });
    fireEvent.click(deadEnd);
    expect(document.activeElement).toBe(field("장면 제목"));
  });

  it("오류와 경고를 나눠 목록으로 보이고, 요약과 통계를 함께 알린다", () => {
    renderWithSample();
    expect(screen.getByRole("list", { name: "경고" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "오류" })).toBeNull();
    expect(screen.getByText("가장 짧은 길")).toBeTruthy();
    expect(screen.getByText("2번 선택")).toBeTruthy();
    expect(screen.getByText("결말까지 가는 길")).toBeTruthy();
    expect(screen.getByText("4개")).toBeTruthy();
    expect(screen.getByText("1곳")).toBeTruthy();
  });

  it("고치면 점검 결과가 바로 바뀐다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/빗속의 발소리/u));
    fireEvent.change(field("선택지 1 도착 장면"), { target: { value: "endHome" } });
    // ‘되돌아가는 길’이 없어지고 같은 이름의 선택지는 아니라서 고칠 항목이 모두 사라진다.
    expect(status("고칠 항목이 없어요. 미리 읽기로 이야기를 확인해 보세요.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "경고" })).toBeNull();
  });

  it("오류를 만들면 요약이 오류 수를 알리고 ‘미리 읽기’ 대신 고칠 곳을 안내한다", () => {
    renderWithSample();
    fireEvent.click(nodeButton(/함께 걷는 길/u));
    fireEvent.change(field("선택지 1 도착 장면"), { target: { value: "" } });
    // 도착 장면이 빈 선택지 하나가 오류 3개로 번진다: 그 선택지, 막다른 길이 된 장면, 닿을 수 없게 된 결말.
    expect(status("고쳐야 할 오류가 3개, 확인할 경고가 1개 있어요. 오류를 고칠 때까지 미리 읽을 수 없어요.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "오류" })).toBeTruthy();
    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { name: "먼저 고칠 항목이 있어요" })).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 미리 읽기", () => {
  it("만든 이야기를 독자가 보게 될 모습으로 읽고, 만들기로 돌아오면 편집 내용이 그대로다", () => {
    const { store } = renderWithSample();
    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { level: 2, name: "미리 읽기" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "비 오는 골목" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "우산을 건네요" }));
    expect(screen.getByRole("heading", { level: 3, name: "우산 아래" })).toBeTruthy();
    expect(store.data.has(progressStorageKey("draft"))).toBe(true);

    fireEvent.click(button("만들기"));
    expect(screen.getByRole("heading", { level: 2, name: "이야기 만들기" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();

    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { level: 3, name: "우산 아래" })).toBeTruthy();
    expect(screen.getByText("이어 읽고 있어요. 마지막으로 읽던 장면에서 시작했어요.")).toBeTruthy();
  });

  it("글만 고치면 읽던 위치를 지키고, 장면·선택지의 연결을 바꾸면 처음부터 다시 시작한다", () => {
    renderWithSample();
    fireEvent.click(button("미리 읽기"));
    fireEvent.click(screen.getByRole("button", { name: "우산을 건네요" }));
    fireEvent.click(button("만들기"));

    fireEvent.click(nodeButton(/우산 아래/u));
    fireEvent.change(field("장면 제목"), { target: { value: "우산 속" } });
    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { level: 3, name: "우산 속" })).toBeTruthy();

    fireEvent.click(button("만들기"));
    fireEvent.click(nodeButton(/우산 속/u));
    fireEvent.change(field("선택지 2 도착 장면"), { target: { value: "key" } });
    fireEvent.click(button("미리 읽기"));
    expect(screen.getByRole("heading", { level: 3, name: "비 오는 골목" })).toBeTruthy();
    expect(screen.getByText("이야기의 길이 바뀌어서 처음부터 시작했어요.")).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 가져오기와 내보내기", () => {
  function paste(text: string): void {
    fireEvent.change(field("또는 JSON 붙여넣기"), { target: { value: text } });
    fireEvent.click(button("붙여넣은 JSON 가져오기"));
  }

  it("붙여넣은 JSON 을 가져오면 현재 초안을 바꾸고 점검 결과를 확인하라고 안내한다", () => {
    const { store } = renderPage();
    paste(serializeBranchingCuttoon(sample()));
    expect(status("파일을 가져왔어요. 장면 8개를 불러왔어요. 점검 결과를 확인해 주세요.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    expect(savedDraft(store)).toEqual(sample());
    expect((field("또는 JSON 붙여넣기") as HTMLTextAreaElement).value).toBe("");
  });

  it("만들어 둔 내용이 있으면 가져오기 전에 확인하고, 취소하면 초안이 그대로다", () => {
    renderWithSample();
    fireEvent.click(button("새로 시작"));
    fireEvent.click(within(screen.getByRole("group", { name: "초안 바꾸기 확인" })).getByRole("button", { name: "초안 바꾸기" }));
    fireEvent.click(button("컷 추가"));
    paste(serializeBranchingCuttoon(sample()));
    const confirm = screen.getByRole("group", { name: "초안 바꾸기 확인" });
    expect(confirm.textContent).toContain("지금 만든 초안(장면 1개)을 바꿀까요?");
    fireEvent.click(within(confirm).getByRole("button", { name: "취소" }));
    expect(screen.getByRole("navigation", { name: "장면 목록 (1/200)" })).toBeTruthy();
    expect(screen.getByText("컷 (1/30)")).toBeTruthy();
  });

  it("가져오지 못하면 초안을 건드리지 않고 원인을 알린다", () => {
    const { store } = renderWithSample();
    const before = savedDraft(store);
    paste("{ 이건 JSON 이 아니에요");
    expect(screen.getByText("가져오지 못했어요. 파일 모양을 확인하고 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.getByText("JSON 형식이 아니에요. 내보낸 파일이 맞는지 확인해 주세요.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    expect(savedDraft(store)).toEqual(before);
  });

  it("모르는 항목은 읽지 않고 건너뛰었다고 알린다", () => {
    renderPage();
    const parsed: unknown = JSON.parse(serializeBranchingCuttoon(sample()));
    if (typeof parsed !== "object" || parsed === null) throw new Error("준비 실패");
    paste(JSON.stringify({ ...parsed, 모르는항목: 1 }));
    expect(screen.getByText(/알 수 없는 항목 1개는 읽지 않고 건너뛰었어요/u)).toBeTruthy();
  });

  it("검증하지 않고 모양만 확인한다: 오류가 있는 파일도 가져오되 점검 결과가 알린다", () => {
    renderPage();
    const broken: BranchingCuttoonGraph = { ...sample(), startNodeId: "없는시작" };
    expect(validateBranchingCuttoon(broken).valid).toBe(false);
    paste(serializeBranchingCuttoon(broken));
    expect(screen.getByRole("navigation", { name: "장면 목록 (8/200)" })).toBeTruthy();
    expect(status(/고쳐야 할 오류가 \d+개/u)).toBeTruthy();
  });
});

describe("분기형 컷툰 실험실 — 언어", () => {
  it("언어를 바꾸면 화면 문구가 영어로 바뀐다", () => {
    useI18n.getState().setLang("en");
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: tNow("branchingCuttoon.page.title") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tNow("branchingCuttoon.page.loadSample") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "샘플 불러오기" })).toBeNull();
    expect(tNow("branchingCuttoon.page.title")).not.toBe("분기형 컷툰");
  });
});
