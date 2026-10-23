// @vitest-environment jsdom
import {
  addChoice,
  addNode,
  chooseBranch,
  startReading,
  updateChoice,
  type BranchingCuttoonGraph,
  type BranchingReaderState,
} from "./model";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import { progressStorageKey, readProgress, writeProgress } from "./branching-cuttoon-storage";
import { accepted, blockedStorage, memoryStore, tNow } from "./branching-cuttoon-test-kit";
import { BranchingCuttoonPlayer } from "./BranchingCuttoonPlayer";
import { PlayerBoundary } from "./BranchingPlayerStates";

import type { ComponentProps, ReactElement } from "react";

const original = {
  scrollIntoView: Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView"),
};

beforeEach(() => {
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (original.scrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", original.scrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  useI18n.getState().setLang("ko");
});

function sample(): BranchingCuttoonGraph {
  return createSampleBranchingGraph(tNow);
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("시험 준비 단계가 실패했어요.");
  return value;
}

type PlayerProps = ComponentProps<typeof BranchingCuttoonPlayer>;

function renderPlayer(props: Partial<PlayerProps> = {}) {
  const store = memoryStore();
  const graph = props.graph ?? sample();
  const view = render(<BranchingCuttoonPlayer graph={graph} workId="ep1" storage={store.resolve} {...props} />);
  return { ...view, store, graph };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });
const sceneHeading = (name: string): HTMLElement => screen.getByRole("heading", { level: 3, name });

/** 장면이 바뀐 것을 화면 낭독기에 알리는 영역(role=status, aria-live=polite). */
function liveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('[aria-live="polite"].sr-only');
  if (!region) throw new Error("장면 변화 알림 영역을 찾지 못했어요.");
  return region;
}

/** 샘플에서 "우산을 건네요 → 열쇠에 대해 물어봐요" 두 번 고른 상태. */
function twoStepsIn(graph: BranchingCuttoonGraph): BranchingReaderState {
  const first = must(chooseBranch(graph, must(startReading(graph)), "c1"));
  return must(chooseBranch(graph, first, "c1"));
}

describe("분기형 컷툰 플레이어 — 읽기 흐름", () => {
  it("시작 장면의 제목과 컷을 위에서 아래로 보여 주고, 끝에 선택지를 둔다", () => {
    renderPlayer();
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    const cuts = within(screen.getByRole("list", { name: "이 장면의 컷" })).getAllByRole("listitem");
    expect(cuts).toHaveLength(3);
    expect(cuts[0]?.textContent).toContain("컷 1 / 3");
    expect(cuts[0]?.textContent).toContain("좁은 골목에 비가 쏟아지고 있어요.");
    expect(cuts[2]?.textContent).toContain("컷 3 / 3");
    const group = screen.getByRole("group", { name: "어떻게 할까요?" });
    expect(within(group).getAllByRole("button").map((choice) => choice.textContent)).toEqual(["우산을 건네요", "못 본 척 지나가요"]);
    expect(screen.getByText("가 본 장면 1 / 8")).toBeTruthy();
  });

  it("처음에는 되돌아가기가 꺼져 있고 처음부터 버튼은 켜져 있다", () => {
    renderPlayer();
    expect(button("한 걸음 되돌아가기").hasAttribute("disabled")).toBe(true);
    expect(button("처음부터").hasAttribute("disabled")).toBe(false);
  });

  it("선택지를 누르면 다음 장면으로 가고, 새 장면 제목으로 초점이 옮겨 가며, 장면이 바뀐 것을 알린다", () => {
    const { container } = renderPlayer();
    expect(liveRegion(container).textContent).toBe("");
    fireEvent.click(button("우산을 건네요"));
    const heading = sceneHeading("우산 아래");
    expect(document.activeElement).toBe(heading);
    expect(liveRegion(container).textContent).toBe("장면이 바뀌었어요: 우산 아래. 선택지가 2개 있어요.");
    expect(screen.getByText("가 본 장면 2 / 8")).toBeTruthy();
    expect(screen.getByText("지나온 선택 1개")).toBeTruthy();
    expect(screen.getByText("비 오는 골목 · 우산을 건네요")).toBeTruthy();
    expect(button("한 걸음 되돌아가기").hasAttribute("disabled")).toBe(false);
  });

  it("한 걸음 되돌아가면 이전 장면으로 돌아오고 가 본 장면 수는 유지된다", () => {
    const { container } = renderPlayer();
    fireEvent.click(button("우산을 건네요"));
    fireEvent.click(button("한 걸음 되돌아가기"));
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(document.activeElement).toBe(sceneHeading("비 오는 골목"));
    expect(liveRegion(container).textContent).toBe("한 걸음 되돌아갔어요: 비 오는 골목.");
    expect(screen.getByText("가 본 장면 2 / 8")).toBeTruthy();
    expect(button("한 걸음 되돌아가기").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/지나온 선택/u)).toBeNull();
  });

  it("결말에 닿으면 선택지 대신 결말 안내를 보이고, 처음부터 누르면 시작 장면으로 돌아간다", () => {
    const { container } = renderPlayer();
    fireEvent.click(button("우산을 건네요"));
    fireEvent.click(button("집까지 같이 걸어 줘요"));
    fireEvent.click(button("끝까지 바래다줘요"));
    expect(sceneHeading("함께 맞은 비")).toBeTruthy();
    expect(liveRegion(container).textContent).toBe("결말에 도착했어요: 함께 맞은 비.");
    const ending = screen.getByRole("region", { name: "결말 안내" });
    expect(ending.textContent).toContain("이야기가 끝났어요");
    expect(screen.queryByRole("group", { name: "어떻게 할까요?" })).toBeNull();
    expect(screen.queryByText("어떻게 할까요?")).toBeNull();
    // 결말에서도 되돌아가거나 처음부터 다시 읽을 수 있다.
    expect(button("한 걸음 되돌아가기").hasAttribute("disabled")).toBe(false);

    fireEvent.click(button("처음부터"));
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(liveRegion(container).textContent).toBe("처음부터 다시 시작했어요: 비 오는 골목.");
    expect(screen.queryByText(/지나온 선택/u)).toBeNull();
    expect(screen.getByText("가 본 장면 1 / 8")).toBeTruthy();
  });

  it("되돌아가는 길로 이미 본 장면에 다시 올 수 있다(가 본 장면 수는 늘지 않는다)", () => {
    renderPlayer();
    fireEvent.click(button("못 본 척 지나가요"));
    expect(sceneHeading("빗속의 발소리")).toBeTruthy();
    fireEvent.click(button("다시 골목 입구로 돌아가요"));
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.getByText("가 본 장면 2 / 8")).toBeTruthy();
    expect(screen.getByText("지나온 선택 2개")).toBeTruthy();
  });

  it("컷이 없는 장면은 그렇다고 알린다", () => {
    const graph = sample();
    const emptied: BranchingCuttoonGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === "rain" ? { ...node, cutIds: [] } : node)),
    };
    renderPlayer({ graph: emptied });
    expect(screen.getByText("이 장면에는 컷이 없어요.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "이 장면의 컷" })).toBeNull();
  });
});

describe("분기형 컷툰 플레이어 — 키보드와 보조기기", () => {
  it("선택지와 이동 버튼은 모두 실제 button 이고 Tab 순서에서 빠지지 않는다", () => {
    renderPlayer();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const found of buttons) {
      expect(found.tagName).toBe("BUTTON");
      expect(found.getAttribute("type")).toBe("button");
      expect(found.getAttribute("tabindex")).toBeNull();
    }
    const choice = button("우산을 건네요");
    choice.focus();
    expect(document.activeElement).toBe(choice);
  });

  it("선택지 묶음은 ‘어떻게 할까요?’ 제목으로 이름 붙은 group 이다", () => {
    renderPlayer();
    const group = screen.getByRole("group", { name: "어떻게 할까요?" });
    expect(group.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "어떻게 할까요?" })).toBeTruthy();
  });

  it("장면은 article 로 묶이고 장면 제목으로 이름 붙으며, 제목은 프로그램으로만 초점을 받는다", () => {
    renderPlayer();
    const article = screen.getByRole("article");
    const heading = sceneHeading("비 오는 골목");
    expect(article.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("장면 변화 알림은 정중한 live region 이고, 처음 그릴 때는 비어 있다", () => {
    const { container } = renderPlayer();
    const region = liveRegion(container);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
  });

  it("처음 그릴 때 초점을 가져가지 않는다(장면이 바뀐 뒤에만 제목으로 옮긴다)", () => {
    renderPlayer();
    expect(document.activeElement).toBe(document.body);
  });

  it("모션 감소를 켜 두면 장면 이동에서 부드러운 스크롤 대신 즉시 이동한다", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query }));
    renderPlayer();
    fireEvent.click(button("우산을 건네요"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("모션 감소를 켜지 않았다면 부드럽게 이동한다", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    renderPlayer();
    fireEvent.click(button("우산을 건네요"));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("matchMedia 나 scrollIntoView 가 없는 환경에서도 던지지 않는다", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderPlayer();
    expect(() => fireEvent.click(button("우산을 건네요"))).not.toThrow();
    expect(sceneHeading("우산 아래")).toBeTruthy();
  });

  it("언어를 바꾸면 열려 있는 읽기 화면의 문구가 함께 바뀐다", () => {
    renderPlayer();
    fireEvent.click(button("우산을 건네요"));
    act(() => { useI18n.getState().setLang("en"); });
    expect(screen.getByRole("button", { name: tNow("branchingCuttoon.player.back") })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: tNow("branchingCuttoon.player.choicesHeading") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "한 걸음 되돌아가기" })).toBeNull();
  });
});

describe("분기형 컷툰 플레이어 — 읽던 위치 저장과 복원", () => {
  it("선택할 때마다 읽던 위치를 이 브라우저에 저장한다", () => {
    const { store, graph } = renderPlayer();
    expect(store.data.size).toBe(0);
    fireEvent.click(button("우산을 건네요"));
    const saved = readProgress(store.resolve, "ep1", graph);
    expect(saved.outcome).toBe("resumed");
    expect(saved.state?.nodeId).toBe("share");
    expect(store.data.has(progressStorageKey("ep1"))).toBe(true);
    fireEvent.click(button("한 걸음 되돌아가기"));
    expect(readProgress(store.resolve, "ep1", graph).state?.nodeId).toBe("rain");
  });

  it("저장된 위치가 있으면 그 장면에서 이어 읽고 이어 읽는다고 알린다", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, twoStepsIn(graph));
    renderPlayer({ graph, storage: store.resolve });
    expect(sceneHeading("작은 열쇠")).toBeTruthy();
    expect(screen.getByText("이어 읽고 있어요. 마지막으로 읽던 장면에서 시작했어요.")).toBeTruthy();
    expect(screen.getByText("지나온 선택 2개")).toBeTruthy();
    expect(screen.getByText("가 본 장면 3 / 8")).toBeTruthy();
    // 이어 읽기 안내는 다음 선택 뒤에는 사라진다.
    fireEvent.click(button("번호표의 사물함을 찾아가요"));
    expect(screen.queryByText(/이어 읽고 있어요/u)).toBeNull();
  });

  it("글만 고쳐 다시 그려도(같은 판) 읽던 위치를 그대로 두고 새 글을 보여 준다", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, twoStepsIn(graph));
    const view = renderPlayer({ graph, storage: store.resolve });
    expect(sceneHeading("작은 열쇠")).toBeTruthy();
    const retitled: BranchingCuttoonGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === "key" ? { ...node, title: "고친 제목" } : node)),
    };
    view.rerender(<BranchingCuttoonPlayer graph={retitled} workId="ep1" storage={store.resolve} />);
    expect(sceneHeading("고친 제목")).toBeTruthy();
    expect(screen.getByText("지나온 선택 2개")).toBeTruthy();
    expect(screen.queryByText(/처음부터 시작했어요/u)).toBeNull();
  });

  it("장면·선택지의 연결이 바뀐 판이면 저장된 위치를 쓰지 않고 처음부터 시작한다고 알린다", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, twoStepsIn(graph));
    const withEnding = accepted(addNode(graph, "ending", "새 결말"));
    const changed = accepted(addChoice(withEnding.graph, "walk", "다른 길로", withEnding.nodeId));
    renderPlayer({ graph: changed.graph, storage: store.resolve });
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.getByText("이야기의 길이 바뀌어서 처음부터 시작했어요.")).toBeTruthy();
    expect(screen.queryByText(/이어 읽고 있어요/u)).toBeNull();
    expect(screen.queryByText(/지나온 선택/u)).toBeNull();
  });

  it("읽는 도중에 이야기의 길이 바뀌면 열려 있던 읽기를 처음부터 다시 시작한다", () => {
    const graph = sample();
    const view = renderPlayer({ graph });
    fireEvent.click(button("우산을 건네요"));
    expect(sceneHeading("우산 아래")).toBeTruthy();
    const withEnding = accepted(addNode(graph, "ending", "새 결말"));
    const changed = accepted(addChoice(withEnding.graph, "walk", "다른 길로", withEnding.nodeId));
    view.rerender(<BranchingCuttoonPlayer graph={changed.graph} workId="ep1" storage={view.store.resolve} />);
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.getByText("이야기의 길이 바뀌어서 처음부터 시작했어요.")).toBeTruthy();
  });

  it("깨진 기록이나 다른 작품의 기록은 처음부터 시작하고, 깨진 기록만 안내한다", () => {
    const graph = sample();
    const broken = memoryStore({ [progressStorageKey("ep1")]: "{깨진 값" });
    const first = renderPlayer({ graph, storage: broken.resolve });
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.getByText("이야기의 길이 바뀌어서 처음부터 시작했어요.")).toBeTruthy();
    first.unmount();

    const other = memoryStore();
    writeProgress(other.resolve, "ep2", graph, twoStepsIn(graph));
    renderPlayer({ graph, storage: other.resolve });
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.queryByText(/처음부터 시작했어요/u)).toBeNull();
  });

  it("저장하지 못해도 읽기는 계속되고, 저장이 되살아나면 안내가 사라진다", () => {
    const { store } = renderPlayer();
    store.failWrites = true;
    fireEvent.click(button("우산을 건네요"));
    expect(sceneHeading("우산 아래")).toBeTruthy();
    expect(screen.getByText(/읽던 위치를 저장하지 못했어요/u)).toBeTruthy();
    fireEvent.click(button("집까지 같이 걸어 줘요"));
    expect(sceneHeading("함께 걷는 길")).toBeTruthy();
    expect(screen.getByText(/읽던 위치를 저장하지 못했어요/u)).toBeTruthy();
    store.failWrites = false;
    fireEvent.click(button("끝까지 바래다줘요"));
    expect(sceneHeading("함께 맞은 비")).toBeTruthy();
    expect(screen.queryByText(/읽던 위치를 저장하지 못했어요/u)).toBeNull();
  });

  it("저장소가 막혀 있어도(프라이빗 창 등) 읽을 수 있고 저장하지 못했다고 알린다", () => {
    renderPlayer({ storage: blockedStorage });
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
    expect(screen.queryByText(/읽던 위치를 저장하지 못했어요/u)).toBeNull();
    fireEvent.click(button("우산을 건네요"));
    expect(sceneHeading("우산 아래")).toBeTruthy();
    expect(screen.getByText(/읽던 위치를 저장하지 못했어요/u)).toBeTruthy();
  });

  it("저장 실패 안내에는 읽기를 계속할 수 있다는 말이 들어 있다", () => {
    const { store } = renderPlayer();
    store.failWrites = true;
    fireEvent.click(button("우산을 건네요"));
    const notice = screen.getByText(/읽던 위치를 저장하지 못했어요/u);
    expect(notice.textContent).toContain("읽기는 계속할 수 있고");
  });
});

describe("분기형 컷툰 플레이어 — 읽을 수 없는 상태", () => {
  it("장면이 하나도 없으면 빈 상태와 ‘만들기로 가기’를 보여 준다", () => {
    const onOpenEditor = vi.fn();
    const empty: BranchingCuttoonGraph = { ...sample(), nodes: [] };
    renderPlayer({ graph: empty, onOpenEditor });
    expect(screen.getByRole("heading", { name: "읽을 장면이 없어요" })).toBeTruthy();
    fireEvent.click(button("만들기로 가기"));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it("돌아갈 곳이 없으면 이동 버튼을 보이지 않는다", () => {
    const empty: BranchingCuttoonGraph = { ...sample(), nodes: [] };
    renderPlayer({ graph: empty });
    expect(screen.getByRole("heading", { name: "읽을 장면이 없어요" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("고칠 오류가 남은 이야기는 읽게 하지 않고 오류 수와 고치러 가는 길을 안내한다(fail-closed)", () => {
    const onOpenEditor = vi.fn();
    const graph = sample();
    const dangling = accepted(updateChoice(graph, "rain", "c1", { targetNodeId: "없는장면" }));
    const store = memoryStore();
    renderPlayer({ graph: dangling.graph, storage: store.resolve, onOpenEditor });
    expect(screen.getByRole("heading", { name: "먼저 고칠 항목이 있어요" })).toBeTruthy();
    expect(screen.getByText(/오류가 \d+개 남아 있는 이야기는 미리 읽을 수 없어요/u)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "어떻게 할까요?" })).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    // 읽을 수 없는 이야기는 읽던 위치를 건드리지 않는다.
    expect(store.writeAttempts()).toBe(0);
    fireEvent.click(button("고치러 가기"));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it("경고뿐인 이야기(되돌아가는 길)는 읽을 수 있다", () => {
    renderPlayer();
    expect(screen.queryByRole("heading", { name: "먼저 고칠 항목이 있어요" })).toBeNull();
    expect(sceneHeading("비 오는 골목")).toBeTruthy();
  });
});

describe("분기형 컷툰 플레이어 — 그리기 오류 경계", () => {
  function Bomb({ fail }: { readonly fail: { current: boolean } }): ReactElement {
    if (fail.current) throw new Error("그리다 실패");
    return <p>복구된 화면</p>;
  }

  it("자식이 그리다 던지면 이 구역만 오류 안내와 ‘다시 시도’로 바꾸고, 다시 시도하면 새로 그린다", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fail = { current: true };
    render(
      <div>
        <p>바깥 화면</p>
        <PlayerBoundary>
          <Bomb fail={fail} />
        </PlayerBoundary>
      </div>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("미리 읽기 화면을 그리지 못했어요. 다시 시도해 주세요.");
    expect(screen.getByText("바깥 화면")).toBeTruthy();
    fail.current = false;
    fireEvent.click(button("다시 시도"));
    expect(screen.getByText("복구된 화면")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("다시 시도해도 계속 던지면 오류 안내가 그대로 남는다", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fail = { current: true };
    render(
      <PlayerBoundary>
        <Bomb fail={fail} />
      </PlayerBoundary>,
    );
    fireEvent.click(button("다시 시도"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(button("다시 시도")).toBeTruthy();
  });
});
