// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dSceneOutliner } from "./StudioBg3dSceneOutliner";
import { resolveStudioBg3dHierarchy } from "./studio-bg3d-hierarchy";
import {
  createStudioBg3dOrganizationController,
  type StudioBg3dOrganizationResult,
} from "./studio-bg3d-organization-controller";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, normalizeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { buildStudioBg3dOrganizationView } from "./studio-bg3d-scene-organization";
import { createStudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

import type { StudioBg3dSkpSidecarLoader } from "./StudioBg3dOutlinerSkpSourceSection";
import type { StudioBg3dOrganizationAction } from "./studio-bg3d-organization-mutation";
import type { StudioBg3dLayerListItem } from "./studio-bg3d-object-ops";
import type { StudioBg3dOrganizationEntitySource } from "./studio-bg3d-scene-organization";
import type { StudioBg3dSkpSidecar, StudioBg3dSkpSourceRef } from "./studio-bg3d-skp-sidecar";

const SKP_HASH = `sha256:${"ab12".repeat(16)}`;

const ITEMS: readonly StudioBg3dLayerListItem[] = [
  { id: "chair-1", label: "의자 1", kind: "model", visible: true, locked: false, parentId: null },
  { id: "chair-2", label: "의자 2", kind: "model", visible: true, locked: false, parentId: null },
  { id: "desk", label: "책상", kind: "primitive", visible: true, locked: false, parentId: null },
  { id: "wall", label: "벽", kind: "primitive", visible: true, locked: false, parentId: null },
];

const ENTITIES: readonly StudioBg3dOrganizationEntitySource[] = [
  { id: "chair-1", tags: ["가구", "교실"], componentRef: { id: "comp-chair", name: "교실 의자" } },
  { id: "chair-2", tags: ["가구"], componentRef: { id: "comp-chair", name: "교실 의자" } },
  { id: "desk", tags: ["가구"] },
  { id: "wall", tags: ["벽체"] },
];

function documentWith(meta?: Record<string, unknown>) {
  return normalizeStudioBg3dSceneDocument({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, ...(meta ? { meta } : {}) });
}

interface SetupOptions {
  readonly entities?: readonly StudioBg3dOrganizationEntitySource[];
  readonly meta?: Record<string, unknown>;
  readonly selected?: readonly string[];
  readonly skpSources?: ReadonlyMap<string, StudioBg3dSkpSourceRef>;
  readonly apply?: (action: StudioBg3dOrganizationAction) => StudioBg3dOrganizationResult;
  readonly variant?: "dock" | "panel";
  readonly loadSkpSidecar?: StudioBg3dSkpSidecarLoader;
}

function setup(options: SetupOptions = {}) {
  const apply = vi.fn<(action: StudioBg3dOrganizationAction) => StudioBg3dOrganizationResult>(
    options.apply ?? (() => ({ ok: true })),
  );
  const selectEntities = vi.fn();
  const onSelect = vi.fn();
  const organization = createStudioBg3dOrganizationController({
    view: buildStudioBg3dOrganizationView({
      entities: options.entities ?? ENTITIES,
      document: documentWith(options.meta),
    }),
    skpSourceByEntityId: options.skpSources ?? new Map(),
    apply,
    selectEntities,
  });
  const controller = createStudioBg3dSceneOutlinerController({
    query: "",
    items: ITEMS,
    filteredItems: ITEMS,
    hierarchy: resolveStudioBg3dHierarchy(ITEMS),
    selectedIds: new Set(options.selected ?? []),
    primitiveColors: new Map(),
    onQueryChange: vi.fn(),
    onSelect,
    onRename: vi.fn(),
    onToggleVisibility: vi.fn(),
    onToggleLock: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    organization,
  });
  const view = render(
    <StudioBg3dSceneOutliner
      controller={controller}
      variant={options.variant ?? "panel"}
      {...(options.loadSkpSidecar ? { loadSkpSidecar: options.loadSkpSidecar } : {})}
    />,
  );
  return { apply, selectEntities, onSelect, controller, ...view };
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /태그와 장면 정보/ }));
}

/** 행의 본문 버튼(이름 라벨이 없는 버튼). 행 안의 이름 변경·숨기기 같은 동작 버튼과 구별한다. */
function rowButton(label: string): HTMLElement {
  const found = screen
    .getAllByRole("button")
    .find((button) => !button.hasAttribute("aria-label") && (button.textContent ?? "").startsWith(label));
  if (!found) throw new Error(`행 버튼을 찾지 못했습니다: ${label}`);
  return found;
}

/** 제목으로 영역을 찾는다. 영역마다 자기 상태 안내 칸을 가지므로 안내 문구는 영역 안에서 읽는다. */
function sectionOf(heading: string): HTMLElement {
  const section = screen.getByRole("heading", { name: heading }).closest("section");
  if (!section) throw new Error(`영역을 찾지 못했습니다: ${heading}`);
  return section;
}

function sidecar(names: {
  components?: readonly string[];
  tags?: readonly string[];
  scenes?: readonly string[];
}): StudioBg3dSkpSidecar {
  const list = (items: readonly string[] = []) => ({ available: true, items, total: items.length, truncated: false });
  return {
    contentHash: SKP_HASH,
    components: list(names.components),
    tags: list(names.tags),
    scenes: list(names.scenes),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioBg3dSceneOutliner 태그·컴포넌트 보기", () => {
  it("구성 정보 컨트롤러가 없으면 보기 전환과 태그 영역을 그리지 않는다", () => {
    const controller = createStudioBg3dSceneOutlinerController({
      query: "",
      items: ITEMS,
      filteredItems: ITEMS,
      hierarchy: resolveStudioBg3dHierarchy(ITEMS),
      selectedIds: new Set(),
      primitiveColors: new Map(),
      onQueryChange: vi.fn(),
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onDuplicate: vi.fn(),
      onRemove: vi.fn(),
    });
    render(<StudioBg3dSceneOutliner controller={controller} />);
    expect(screen.queryByRole("group", { name: "목록 보기 방식" })).toBeNull();
    expect(screen.queryByRole("button", { name: /태그와 장면 정보/ })).toBeNull();
  });

  it("행마다 태그를 글자로 보여 주고 태그로 숨겨진 오브젝트를 읽어 준다", () => {
    setup({ meta: { hiddenTags: ["벽체"] } });
    const chair = rowButton("의자 1");
    expect(chair.textContent).toContain("가구 · 교실");
    expect(within(chair).getByText("태그:")).toBeTruthy();
    const wall = rowButton("벽");
    expect(within(wall).getByText("태그로 숨김")).toBeTruthy();
    expect(screen.getByRole("button", { name: "벽 숨기기" })).toBeTruthy();
  });

  it("컴포넌트 보기는 묶음 머리글 아래에 인스턴스를 모으고 나머지는 컴포넌트 없음으로 모은다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    const items = screen.getAllByRole("treeitem");
    expect(items.map((item) => item.getAttribute("aria-level"))).toEqual(["1", "2", "2", "1", "2", "2"]);
    expect(screen.getByRole("button", { name: "교실 의자 인스턴스 2개 모두 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "컴포넌트 없음 인스턴스 2개 모두 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "컴포넌트" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("묶음 머리글을 누르면 인스턴스를 모두 고르고 접으면 인스턴스 행이 사라진다", () => {
    const { selectEntities } = setup();
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 인스턴스 2개 모두 선택" }));
    expect(selectEntities).toHaveBeenCalledWith(["chair-1", "chair-2"]);

    fireEvent.click(screen.getByRole("button", { name: "교실 의자 접기" }));
    expect(screen.queryByText("의자 1")).toBeNull();
    expect(screen.getByRole("button", { name: "교실 의자 펼치기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 펼치기" }));
    expect(rowButton("의자 1")).toBeTruthy();
  });

  it("컴포넌트가 하나도 없으면 안내 문구를 보이고 목록은 계층 보기와 같다", () => {
    setup({ entities: ENTITIES.map(({ id, tags }) => ({ id, ...(tags ? { tags } : {}) })) });
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    expect(screen.getByText(/컴포넌트로 묶은 오브젝트가 아직 없어요/)).toBeTruthy();
    expect(screen.getAllByRole("treeitem")).toHaveLength(4);
  });

  it("묶음 이름을 줄 안에서 바꾸고 Enter 로 저장하면 컨트롤러가 모든 인스턴스를 바꾼다", () => {
    const { apply } = setup();
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 이름 바꾸기" }));
    const input = screen.getByRole("textbox", { name: "컴포넌트 이름" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "복도 의자" } });
    fireEvent.submit(input);
    expect(apply).toHaveBeenCalledWith({ type: "rename-component", componentId: "comp-chair", name: "복도 의자" });
    expect(screen.queryByRole("textbox", { name: "컴포넌트 이름" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "교실 의자 이름 바꾸기" }));
  });

  it("이름 바꾸기가 거절되면 이유와 다음 행동을 알리고 입력은 남긴다", () => {
    setup({ apply: () => ({ ok: false, reason: "invalid-input" }) });
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 이름 바꾸기" }));
    const input = screen.getByRole("textbox", { name: "컴포넌트 이름" });
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.submit(input);
    expect(screen.getByRole("alert").textContent).toMatch(/다시 입력해 주세요/);
    expect((screen.getByRole("textbox", { name: "컴포넌트 이름" }) as HTMLInputElement).value).toBe("https://example.com");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "컴포넌트 이름" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "컴포넌트 이름" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("묶음 풀기는 인스턴스 전체를 대상으로 컨트롤러를 부른다", () => {
    const { apply } = setup();
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 묶음 풀기" }));
    expect(apply).toHaveBeenCalledWith({ type: "ungroup-component", ids: ["chair-1", "chair-2"] });
  });

  it("키보드로 묶음과 인스턴스를 오가며 선택한다", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      callback(0);
      return 1;
    });
    const { onSelect, selectEntities } = setup();
    fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
    const group = screen.getByRole("button", { name: "교실 의자 인스턴스 2개 모두 선택" });
    group.focus();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("chair-1", "replace");
    expect(document.activeElement).toBe(rowButton("의자 1"));

    fireEvent.keyDown(rowButton("의자 1"), { key: "ArrowLeft" });
    expect(selectEntities).toHaveBeenLastCalledWith(["chair-1", "chair-2"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "교실 의자 인스턴스 2개 모두 선택" }), { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "교실 의자 펼치기" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "교실 의자 인스턴스 2개 모두 선택" }), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "교실 의자 접기" })).toBeTruthy();
  });
});

describe("태그와 장면 정보 영역", () => {
  it("접힌 채 시작하고 열면 태그 목록과 숨김·선택 버튼을 보인다", () => {
    const { apply, selectEntities } = setup();
    const toggle = screen.getByRole("button", { name: /태그와 장면 정보/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "장면 태그 목록" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("list", { name: "장면 태그 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "가구 태그 숨기기" }));
    expect(apply).toHaveBeenCalledWith({ type: "toggle-tag-visibility", tag: "가구" });
    fireEvent.click(screen.getByRole("button", { name: "가구 태그 오브젝트 3개 선택" }));
    expect(selectEntities).toHaveBeenCalledWith(["chair-1", "chair-2", "desk"]);
  });

  it("숨긴 태그는 보이기 버튼으로 읽히고 안내 문구가 오브젝트 숨김과 다르다고 알린다", () => {
    setup({ meta: { hiddenTags: ["가구"] } });
    openPanel();
    expect(screen.getByRole("button", { name: "가구 태그 보이기" })).toBeTruthy();
    expect(screen.getByText(/오브젝트 자체의 숨김 상태는 바뀌지 않아요/)).toBeTruthy();
  });

  it("선택한 오브젝트에 태그를 붙이면 입력을 비우고 성공을 알린다", () => {
    const { apply } = setup({ selected: ["desk", "wall"] });
    openPanel();
    const input = screen.getByLabelText("선택한 오브젝트에 붙일 태그") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  교실 소품 " } });
    fireEvent.submit(input);
    expect(apply).toHaveBeenCalledWith({ type: "add-tag", ids: ["desk", "wall"], tag: "  교실 소품 " });
    expect(input.value).toBe("");
    expect(within(sectionOf("태그")).getByRole("status").textContent).toBe("태그를 붙였어요.");
  });

  it("선택이 없으면 컨트롤러를 부르지 않고 먼저 고르라고 안내한다", () => {
    const { apply } = setup();
    openPanel();
    const input = screen.getByLabelText("선택한 오브젝트에 붙일 태그");
    fireEvent.change(input, { target: { value: "소품" } });
    fireEvent.submit(input);
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/오브젝트를 하나 이상 골라 주세요/);
  });

  it("태그 규칙에 걸리거나 한도를 넘으면 이유와 다음 행동을 알리고 입력을 남긴다", () => {
    let reason: "invalid-input" | "limit-exceeded" = "invalid-input";
    setup({ selected: ["desk"], apply: () => ({ ok: false, reason }) });
    openPanel();
    const input = screen.getByLabelText("선택한 오브젝트에 붙일 태그") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.submit(input);
    expect(screen.getByRole("alert").textContent).toMatch(/다시 입력해 주세요/);
    expect(input.value).toBe("https://example.com");

    reason = "limit-exceeded";
    fireEvent.submit(input);
    expect(screen.getByRole("alert").textContent).toMatch(/8개.*64개.*다시 시도해 주세요/);
  });

  it("다른 작업 중이라 거절되면 끝난 뒤 다시 시도하라고 알린다", () => {
    setup({ selected: ["desk"], apply: () => ({ ok: false, reason: "busy" }) });
    openPanel();
    const input = screen.getByLabelText("선택한 오브젝트에 붙일 태그");
    fireEvent.change(input, { target: { value: "소품" } });
    fireEvent.submit(input);
    expect(screen.getByRole("alert").textContent).toMatch(/끝난 뒤 다시 시도해 주세요/);
  });

  it("선택한 오브젝트의 태그를 떼면 컨트롤러가 선택 전체를 대상으로 부르고 입력칸에 포커스가 간다", () => {
    const { apply } = setup({ selected: ["chair-1", "chair-2"] });
    openPanel();
    const selectedList = screen.getByRole("list", { name: "선택한 오브젝트의 태그" });
    expect(within(selectedList).getByRole("button", { name: "가구 태그 떼기" }).textContent).toContain("2/2");
    expect(within(selectedList).getByRole("button", { name: "교실 태그 떼기" }).textContent).toContain("1/2");
    fireEvent.click(within(selectedList).getByRole("button", { name: "가구 태그 떼기" }));
    expect(apply).toHaveBeenCalledWith({ type: "remove-tag", ids: ["chair-1", "chair-2"], tag: "가구" });
    expect(document.activeElement).toBe(screen.getByLabelText("선택한 오브젝트에 붙일 태그"));
  });

  it("컴포넌트로 묶기와 풀기를 선택 전체에 적용한다", () => {
    const { apply } = setup({ selected: ["desk", "wall"] });
    openPanel();
    const ungroup = screen.getByRole("button", { name: "선택한 오브젝트 묶음 풀기" }) as HTMLButtonElement;
    expect(ungroup.disabled).toBe(true);
    const input = screen.getByLabelText("묶음 이름");
    fireEvent.change(input, { target: { value: "교실 세트" } });
    fireEvent.submit(input);
    expect(apply).toHaveBeenCalledWith({ type: "group-component", ids: ["desk", "wall"], name: "교실 세트" });
    expect(screen.getByText("컴포넌트로 묶었어요.")).toBeTruthy();
  });

  it("선택한 오브젝트가 컴포넌트에 속하면 묶음 풀기가 켜진다", () => {
    const { apply } = setup({ selected: ["chair-1"] });
    openPanel();
    const ungroup = screen.getByRole("button", { name: "선택한 오브젝트 묶음 풀기" }) as HTMLButtonElement;
    expect(ungroup.disabled).toBe(false);
    fireEvent.click(ungroup);
    expect(apply).toHaveBeenCalledWith({ type: "ungroup-component", ids: ["chair-1"] });
  });

  it("장면 이름·메모는 바뀐 칸만 보내고 저장 전에는 아무것도 커밋하지 않는다", () => {
    const { apply } = setup({ meta: { name: "교실", memo: "아침" } });
    openPanel();
    const name = screen.getByLabelText("장면 이름") as HTMLInputElement;
    const memo = screen.getByLabelText("장면 메모") as HTMLTextAreaElement;
    expect(name.value).toBe("교실");
    expect(memo.value).toBe("아침");
    const save = screen.getByRole("button", { name: "장면 정보 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(memo, { target: { value: "아침\n창가 책상" } });
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText("저장하지 않은 변경이 있어요.")).toBeTruthy();
    fireEvent.submit(name.closest("form") ?? name);
    expect(apply).toHaveBeenCalledWith({ type: "set-scene-meta", memo: "아침\n창가 책상" });
    expect(screen.getByText("장면 정보를 저장했어요.")).toBeTruthy();
  });

  it("장면 정보 저장이 거절되면 쓸 수 없는 글을 지우라고 알린다", () => {
    setup({ apply: () => ({ ok: false, reason: "invalid-input" }) });
    openPanel();
    fireEvent.change(screen.getByLabelText("장면 이름"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "장면 정보 저장" }));
    expect(screen.getByRole("alert").textContent).toMatch(/지우고 다시 저장해 주세요/);
  });
});

describe("선택한 SKP 소재의 원본 이름", () => {
  const skpSources = new Map([["chair-1", { contentHash: SKP_HASH, name: "교실 의자.skp" }]]);

  it(".skp 에서 온 오브젝트를 고르지 않으면 이 영역을 그리지 않는다", () => {
    setup({ skpSources, selected: ["desk"] });
    openPanel();
    expect(screen.queryByRole("heading", { name: "원본 SKP 이름" })).toBeNull();
  });

  it("불러오는 동안 상태를 알리고 이름은 글자로만 그리며 복원하지 않는 것을 말한다", async () => {
    const loadSkpSidecar: StudioBg3dSkpSidecarLoader = vi.fn(async () => ({
      status: "found" as const,
      sidecar: sidecar({
        components: ["Chair <img src=x onerror=alert(1)>"],
        tags: ["벽", "https://example.com"],
        scenes: ["정면 뷰"],
      }),
    }));
    const { container } = setup({ skpSources, selected: ["chair-1"], loadSkpSidecar });
    openPanel();
    expect(within(sectionOf("원본 SKP 이름")).getByRole("status").textContent).toContain("이름 기록을 불러오는 중이에요");
    expect(screen.getByText(/컴포넌트 계층, 태그\(레이어\) 표시 상태, 장면\(카메라\)은 되살리지 않아요/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Chair <img src=x onerror=alert(1)>")).toBeTruthy());
    expect(container.querySelector("img")).toBeNull();
    expect(loadSkpSidecar).toHaveBeenCalledWith(SKP_HASH, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText(/1개는 태그 규칙에 맞지 않아 제안하지 않아요/)).toBeTruthy();
    expect(screen.getByText(/카메라 위치나 표시 상태는 되살리지 않아요/)).toBeTruthy();
  });

  it("태그 제안은 사용자가 눌렀을 때만 선택한 오브젝트에 붙는다", async () => {
    const loadSkpSidecar: StudioBg3dSkpSidecarLoader = async () => ({ status: "found", sidecar: sidecar({ tags: ["벽"] }) });
    const { apply } = setup({ skpSources, selected: ["chair-1"], loadSkpSidecar });
    openPanel();
    const button = await screen.findByRole("button", { name: "벽 태그로 붙이기" });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(apply).toHaveBeenCalledWith({ type: "add-tag", ids: ["chair-1"], tag: "벽" });
  });

  it("장면 이름은 메모 초안에만 더하고 저장은 따로 누른다", async () => {
    const loadSkpSidecar: StudioBg3dSkpSidecarLoader = async () => ({ status: "found", sidecar: sidecar({ scenes: ["정면 뷰"] }) });
    const { apply } = setup({ skpSources, selected: ["chair-1"], loadSkpSidecar });
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "SKP 장면: 정면 뷰 메모에 붙이기" }));
    expect((screen.getByLabelText("장면 메모") as HTMLTextAreaElement).value).toBe("SKP 장면: 정면 뷰");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "SKP 장면: 정면 뷰 메모에 붙이기" }));
    expect((screen.getByLabelText("장면 메모") as HTMLTextAreaElement).value).toBe("SKP 장면: 정면 뷰");
    fireEvent.click(screen.getByRole("button", { name: "장면 정보 저장" }));
    expect(apply).toHaveBeenCalledWith({ type: "set-scene-meta", memo: "SKP 장면: 정면 뷰" });
  });

  it("기록이 없으면 그 사실을, 읽기에 실패하면 다시 시도 버튼을 보인다", async () => {
    let call = 0;
    const loadSkpSidecar: StudioBg3dSkpSidecarLoader = vi.fn(async () => {
      call += 1;
      if (call === 1) return { status: "failed" as const };
      if (call === 2) return { status: "missing" as const };
      return { status: "found" as const, sidecar: sidecar({ components: ["의자"] }) };
    });
    setup({ skpSources, selected: ["chair-1"], loadSkpSidecar });
    openPanel();
    expect((await screen.findByRole("alert")).textContent).toMatch(/다시 시도해 주세요/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    await waitFor(() => expect(screen.getByText(/이름 기록이 없어요/)).toBeTruthy());
    expect(loadSkpSidecar).toHaveBeenCalledTimes(2);
  });
});
