// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceDegradedBanner } from "./ServiceDegradedBanner";
import { StudioSaveSyncStatusCenter } from "@/domains/creator/StudioSaveSyncStatusCenter";
import { createEmptyOperationJournal } from "@/domains/creator/studio-operation-recovery-coordinator";

import { useI18n } from "@/shared/lib/i18n";
import { getActiveEditorStatusSlot, registerEditorStatusSlot, registerModalStatusSlot } from "@/shared/lib/modal-status-slot";

const availableCapabilities = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
} as const;

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  requestServiceCapabilityRefresh: mocks.refresh,
  useServiceCapabilityState: () => mocks.state,
}));
function renderBanner(immersive: boolean) {
  return render(
    <MemoryRouter>
      <ServiceDegradedBanner immersive={immersive} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    status: "degraded",
    checking: false,
    report: {
      status: "degraded",
      incidentId: "inc_test",
      retryAfterSeconds: 30,
      checkedAt: new Date().toISOString(),
      capabilities: {
        ...availableCapabilities,
        communityRead: "unavailable",
        studioCloudSave: "unavailable",
      },
    },
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  };
});
afterEach(cleanup);

describe.each([false, true])("ServiceDegradedBanner immersive=%s", (immersive) => {
  it("states the affected capabilities without blocking local editing", () => {
    renderBanner(immersive);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("커뮤니티 조회");
    expect(status.textContent).toContain("클라우드 저장");
    expect(status.textContent).toContain("로컬 편집은 계속 사용할 수 있습니다");

    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href"))
      .toBe("/status");
  });

  it("announces recovery without retaining the degraded copy", () => {
    mocks.state = {
      ...mocks.state,
      status: "available",
      report: {
        status: "available",
        incidentId: null,
        retryAfterSeconds: null,
        checkedAt: new Date().toISOString(),
        capabilities: availableCapabilities,
      },
      recoveredAt: Date.now(),
    };

    renderBanner(immersive);

    expect(screen.getByRole("status").textContent)
      .toContain("온라인 기능이 복구되었습니다");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
  });
});

it("몰입 화면의 상단 도구를 덮지 않고 장애 상세를 펼치거나 접을 수 있다", () => {
  render(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  const status = screen.getByRole("status");
  // 가상 스튜디오 도크가 게시하는 여백 변수보다 위에 뜨고, 변수가 없으면 기존 5.5rem을 유지한다.
  expect(status.className).toContain("bottom-[calc(max(5.5rem,var(--immersive-dock-clearance,0px),calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem))+env(safe-area-inset-bottom))]");
  expect(status.className).not.toContain("top-");
  expect(status.className.split(" ")).toContain("bg-panel");
  expect(status.className).not.toContain("bg-warn/10");
  expect(status.querySelector("div")?.className).toContain("max-sm:grid-cols-[auto_minmax(0,1fr)]");
  const detail = screen.getByText(/로컬 편집은 계속 사용할 수 있습니다/);
  expect(detail.hidden).toBe(true);
  const expand = screen.getByRole("button", { name: "서비스 상태 알림 펼치기" });
  expect(expand.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(expand);
  expect(detail.hidden).toBe(false);
  const collapse = screen.getByRole("button", { name: "서비스 상태 알림 접기" });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(collapse);
  expect(detail.hidden).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href")).toBe("/status");
});

it("몰입 화면의 고정 배너는 아래 편집기 조작을 가리지 않고 조작부는 계속 눌린다", () => {
  render(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  const status = screen.getByRole("status");
  expect(status.className).toContain("pointer-events-none");
  expect(screen.getByRole("button", { name: "서비스 상태 알림 펼치기" }).className)
    .toContain("pointer-events-auto");
  const actions = screen.getByRole("button", { name: "다시 확인" }).parentElement;
  expect(actions?.className).toContain("pointer-events-auto");
});

it("일반 문서 흐름의 알림은 클릭 차단 방식을 바꾸지 않는다", () => {
  renderBanner(false);
  const status = screen.getByRole("status");
  expect(status.className).not.toContain("pointer-events-none");
  expect(screen.getByRole("button", { name: "다시 확인" }).parentElement?.className)
    .not.toContain("pointer-events-auto");
});

it("고정 알림의 높이 변경에 맞춰 조작부 공간을 확보하고 해제한다", () => {
  const property = "--service-status-overlay-clearance";
  document.documentElement.style.setProperty(property, "8px");
  const view = renderBanner(true);
  const banner = screen.getByRole("status");
  banner.style.position = "fixed";
  const bounds = vi.spyOn(banner, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(0, 600, 390, 150));
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 600 + 12}px`);
  bounds.mockReturnValue(new DOMRect(0, 520, 390, 230));
  fireEvent.click(screen.getByRole("button", { name: "서비스 상태 알림 펼치기" }));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 520 + 12}px`);
  view.unmount();
  expect(document.documentElement.style.getPropertyValue(property)).toBe("8px");
  bounds.mockRestore();
  document.documentElement.style.removeProperty(property);
});

it("일반 문서 흐름의 알림은 고정 조작부의 공간을 변경하지 않는다", () => {
  const property = "--service-status-overlay-clearance";
  const view = renderBanner(false);
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe("");
  view.unmount();
});

it("웜업 안내에서 고정 배너로 바뀌는 전이에서도 배너의 점유 높이를 이어서 게시한다", () => {
  const property = "--service-status-overlay-clearance";
  mocks.state = { ...mocks.state, report: null, warmingUp: true };
  const view = renderBanner(true);
  expect(screen.getByRole("status").getAttribute("data-service-degraded-banner")).toBe("warming");

  // 웜업이 끝나면 같은 자리에 고정 배너가 붙는다. 이때부터 배너 높이만큼 위 요소가 올라가야 한다.
  mocks.state = { ...mocks.state, warmingUp: false };
  view.rerender(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  const banner = screen.getByRole("status");
  expect(banner.getAttribute("data-service-degraded-banner")).toBe("degraded");
  banner.style.position = "fixed";
  const bounds = vi.spyOn(banner, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(0, 600, 390, 150));
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 600 + 12}px`);
  view.unmount();
  expect(document.documentElement.style.getPropertyValue(property)).toBe("");
  bounds.mockRestore();
  document.documentElement.style.removeProperty(property);
});


it("단일 요청 실패만으로 커뮤니티·저장·협업 전체가 제한됐다고 안내하지 않는다", () => {
  mocks.state = { ...mocks.state, report: null };
  renderBanner(false);
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("온라인 연결 상태를 다시 확인하고 있습니다");
  expect(status.textContent).not.toContain("커뮤니티·클라우드 저장·협업·게시");
  expect(status.textContent).not.toContain("일부 온라인 기능을 잠시 사용할 수 없습니다");
  expect(screen.getByRole("button", { name: "다시 확인" })).toBeTruthy();
});

it("서버가 확인한 로그인 상태 저하를 정확한 기능 이름으로 안내한다", () => {
  mocks.state = { ...mocks.state, report: {
    status: "degraded", capabilities: { ...availableCapabilities, authSession: "degraded" },
  } };
  renderBanner(false);
  expect(screen.getByRole("status").textContent).toContain("로그인·세션");
  expect(screen.getByRole("status").textContent).not.toContain("클라우드 저장");
});

describe("상태 안내의 역할 구조", () => {
  // ARIA in HTML: aside(complementary 랜드마크)에는 role="status" 를 줄 수 없다(axe aria-allowed-role).
  // 상태 영역은 랜드마크가 아니므로 div 로 두고, 낭독은 role=status 가 맡는다.
  it("장애·복구 안내는 aside 가 아니라 role=status 인 div 이다", () => {
    const { container } = renderBanner(false);
    const status = screen.getByRole("status");
    expect(status.tagName).toBe("DIV");
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("절전 해제 안내(연결 칩)도 aside 가 아니다", () => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    const { container } = renderBanner(false);
    expect(screen.getByRole("status").tagName).toBe("DIV");
    expect(container.querySelector("aside")).toBeNull();
  });
});

describe("절전 해제 안내", () => {
  it("첫 연결 대기 중에는 장애 경고 대신 조용한 연결 안내만 보인다", () => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    const { container } = renderBanner(false);
    const notice = screen.getByRole("status");
    expect(notice.getAttribute("data-service-degraded-banner")).toBe("warming");
    expect(notice.textContent).toContain("온라인 기능을 연결하는 중이에요.");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
    expect(container.querySelector('[data-service-degraded-banner="degraded"]')).toBeNull();
  });

  it("연결 대기 구간이 끝나면 기존 장애 안내로 돌아간다", () => {
    mocks.state = { ...mocks.state, warmingUp: false };
    renderBanner(false);
    expect(screen.getByRole("status").getAttribute("data-service-degraded-banner")).toBe("degraded");
  });
});

describe("일반 화면 알림의 휴대폰 접힘", () => {
  it("설명은 휴대폰 폭에서만 접혀 있고, 토글로 펼치거나 접는다", () => {
    renderBanner(false);
    const description = screen.getByText(/로컬 편집은 계속 사용할 수 있습니다/);
    // 넓은 화면에서는 항상 보이므로 hidden 속성이 아니라 휴대폰 폭 CSS로만 접는다.
    expect(description.hidden).toBe(false);
    expect(description.className).toContain("max-sm:hidden");

    const expand = screen.getByRole("button", { name: "서비스 상태 알림 펼치기" });
    expect(expand.className).toContain("sm:hidden");
    expect(expand.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expand);
    expect(description.className).not.toContain("max-sm:hidden");
    const collapse = screen.getByRole("button", { name: "서비스 상태 알림 접기" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapse);
    expect(description.className).toContain("max-sm:hidden");
  });

  it("조작 버튼 두 개는 휴대폰에서 한 줄 전체 폭 두 칸으로 놓인다", () => {
    renderBanner(false);
    const actions = screen.getByRole("button", { name: "다시 확인" }).parentElement;
    expect(actions?.className).toContain("max-sm:grid-cols-2");
    expect(actions?.className).toContain("max-sm:w-full");
  });
});

describe("영어 화면", () => {
  afterEach(() => {
    useI18n.getState().setLang("ko");
  });

  it("장애 안내와 기능 이름, 조작 버튼을 영어로 보여 준다", () => {
    useI18n.getState().setLang("en");
    renderBanner(false);
    const status = screen.getByRole("status");

    expect(status.textContent).toContain("Some online features are temporarily unavailable.");
    expect(status.textContent).toContain("Community browsing · Cloud save are limited.");
    expect(status.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Status details" }).getAttribute("href")).toBe("/status");
  });

  it("연결 준비 안내도 영어로 보여 준다", () => {
    useI18n.getState().setLang("en");
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    renderBanner(false);
    const notice = screen.getByRole("status");

    expect(notice.textContent).toContain("Connecting online features.");
    expect(notice.textContent).not.toMatch(/[가-힣]/u);
  });
});

describe("연결 준비 칩의 자리", () => {
  const property = "--service-status-overlay-clearance";

  beforeEach(() => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
  });

  it("알림 열(왼쪽 아래)의 맨 아래 칸에 놓이고 휴대폰에서는 조작 열을 비켜 한 줄 칩이 된다", () => {
    renderBanner(true);
    const chip = screen.getByRole("status");

    expect(chip.className).toContain("left-4");
    expect(chip.className).not.toContain("left-1/2");
    // 휴대폰: 하단 탭 위 기준선, 오른쪽 조작 열 폭만큼 줄임.
    expect(chip.className).toContain("max-md:bottom-[max(var(--site-float-base),");
    expect(chip.className).toContain("max-md:left-3");
    expect(chip.className).toContain("max-md:max-w-[calc(100vw-0.75rem-max(0.75rem,var(--site-float-column)))]");
    // 칩은 모든 폭에서 한 줄 — 두 번째 문장은 화면 읽기 전용으로만 남겨 칩 점유를 줄인다.
    expect(screen.getByText("탐색과 로컬 작업은 지금 바로 할 수 있어요.").className).toContain("sr-only");
    expect(screen.getByText("탐색과 로컬 작업은 지금 바로 할 수 있어요.").className).not.toContain("max-md:sr-only");
  });

  it("점유 높이를 게시해 그 위의 OST·베타 안내가 칩을 가리지 않게 하고, 사라지면 거둔다", () => {
    const view = renderBanner(true);
    const chip = screen.getByRole("status");
    chip.style.position = "fixed";
    const bounds = vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 700, 240, 34));

    fireEvent(window, new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 700 + 12}px`);

    view.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
    bounds.mockRestore();
  });

  it("일반 페이지에서는 상태를 본문 흐름에 남기고 몰입형 알림의 점유 높이를 해제한다", () => {
    const view = renderBanner(true);
    const chip = screen.getByRole("status");
    chip.style.position = "fixed";
    const bounds = vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 700, 240, 34));
    fireEvent(window, new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(property)).not.toBe("");

    view.rerender(<MemoryRouter><ServiceDegradedBanner immersive={false} /></MemoryRouter>);

    const inline = screen.getByRole("status");
    expect(inline.getAttribute("data-service-status-placement")).toBe("page-inline");
    expect(inline.className).not.toContain("fixed");
    expect(inline.textContent).toContain("온라인 기능을 연결하는 중이에요.");
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
    bounds.mockRestore();
  });
});

describe("모달이 내준 상태 자리(B-05)", () => {
  it("떠 있는 배너 대신 모달의 자리에 한 줄 칩으로 들어가고, 자리가 사라지면 다시 뜬다", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    let unregister: () => void = () => {};
    act(() => {
      unregister = registerModalStatusSlot(slot);
    });
    try {
      renderBanner(true);
      const chip = screen.getByRole("status");
      expect(slot.contains(chip)).toBe(true);
      expect(chip.getAttribute("data-service-status-placement")).toBe("modal-slot");
      // 떠 있는 배너의 고정 배치(z-90 하단 고정)를 쓰지 않는다 — 모달 조작을 가리지 않는다.
      expect(chip.className).not.toContain("fixed");
      expect(chip.className).not.toContain("z-[90]");
      expect(chip.textContent).toContain("일부 온라인 기능을 잠시 사용할 수 없습니다");
      // 알림은 숨기지 않는다: 설명은 화면 읽기용으로 남고 다시 확인도 그대로 된다.
      expect(chip.textContent).toContain("로컬 편집은 계속 사용할 수 있습니다");
      fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
      expect(mocks.refresh).toHaveBeenCalledOnce();
    } finally {
      act(() => unregister());
    }
    const floating = screen.getByRole("status");
    expect(slot.contains(floating)).toBe(false);
    expect(floating.className).toContain("fixed");
    slot.remove();
  });

  it("웜업 안내도 모달 자리가 있으면 그 안에 들어간다", () => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    let unregister: () => void = () => {};
    act(() => {
      unregister = registerModalStatusSlot(slot);
    });
    try {
      renderBanner(true);
      const chip = screen.getByRole("status");
      expect(slot.contains(chip)).toBe(true);
      expect(chip.getAttribute("data-service-degraded-banner")).toBe("warming");
      expect(chip.textContent).toContain("온라인 기능을 연결하는 중이에요.");
    } finally {
      act(() => unregister());
      slot.remove();
    }
  });
});

it("몰입 알림의 조작부를 펼친 모바일 작업 메뉴의 실측 높이 위에 둔다", () => {
  render(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  expect(screen.getByRole("status").className).toContain("calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem)");
  expect(screen.getByRole("button", { name: "서비스 상태 알림 펼치기" })).toBeTruthy();
});


it("연결 준비 안내도 실제 모바일 도크 높이 위에 머문다", () => {
  mocks.state = { ...mocks.state, report: null, warmingUp: true };
  render(<ServiceDegradedBanner immersive />);
  const chip = screen.getByRole("status");
  expect(chip.getAttribute("data-service-degraded-banner")).toBe("warming");
  expect(chip.className).toContain("calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem)");
  expect(chip.className).toContain("calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem+env(safe-area-inset-bottom))");
});

function EditorStatusHarness({ editor = true }: { readonly editor?: boolean }) {
  return <MemoryRouter>
    <ServiceDegradedBanner immersive />
    {editor ? <StudioSaveSyncStatusCenter journal={createEmptyOperationJournal("notice-test")} /> : null}
  </MemoryRouter>;
}

describe("편집기에서 저장·연결 상태 한곳으로 이동", () => {
  it("닫힌 패널에서는 한 번 알리고, 같은 버튼을 열면 원문·재확인·상태 페이지를 제공한다", () => {
    render(<EditorStatusHarness />);
    const trigger = screen.getByRole("button", { name: "저장 상태 열기: 아직 저장 기록 없음" });
    const summary = screen.getByRole("status");
    expect(trigger.contains(summary)).toBe(true);
    expect(summary.textContent).toContain("온라인 기능 확인 필요");
    expect(summary.className).not.toContain("fixed");
    expect(screen.queryByRole("link", { name: "상태 자세히" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "저장 상태 상세" });
    expect(within(panel).getByText(/커뮤니티 조회 · 클라우드 저장이 제한됩니다/u)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "상태 자세히" }).getAttribute("href")).toBe("/status");
    fireEvent.click(within(panel).getByRole("button", { name: "다시 확인" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "저장 상태 상세" })).toBeNull();
    expect(screen.queryByRole("link", { name: "상태 자세히" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("연결 준비·제한·복구가 바뀌어도 원고 저장 성공으로 표시하지 않는다", () => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    const view = render(<EditorStatusHarness />);
    expect(screen.getByRole("status").textContent).toContain("온라인 연결 확인 중");
    mocks.state = { ...mocks.state, warmingUp: false };
    view.rerender(<EditorStatusHarness />);
    expect(screen.getByRole("status").textContent).toContain("온라인 기능 확인 필요");
    mocks.state = { ...mocks.state, status: "available", recoveredAt: Date.now() };
    view.rerender(<EditorStatusHarness />);
    expect(screen.getByRole("status").textContent).toContain("온라인 기능 복구");
    expect(screen.getByRole("button", { name: "저장 상태 열기: 아직 저장 기록 없음" })).toBeTruthy();
    expect(screen.queryByText("이 기기에 저장됨")).toBeNull();
  });

  it("모달 알림 우선·닫은 뒤 편집기 복귀·편집기 해제 뒤 기본 배치를 유지한다", () => {
    const view = render(<EditorStatusHarness />);
    const editor = getActiveEditorStatusSlot();
    const modal = document.createElement("div");
    document.body.appendChild(modal);
    let close = () => {};
    act(() => { close = registerModalStatusSlot(modal); });
    try {
      expect(modal.contains(screen.getByRole("status"))).toBe(true);
      expect(getActiveEditorStatusSlot()).toBe(editor);
    } finally {
      act(() => close());
      modal.remove();
    }
    expect(editor?.summary.contains(screen.getByRole("status"))).toBe(true);
    view.rerender(<EditorStatusHarness editor={false} />);
    expect(getActiveEditorStatusSlot()).toBeNull();
    expect(screen.getByRole("status").className).toContain("fixed");
  });
});


it("그리기 저장 요약은 연결 준비를 상세에 두고 실제 제한·복구는 계속 알린다", () => {
  const summary = document.createElement("span"), details = document.createElement("div");
  summary.dataset.studioDrawingSaveSummary = "true";
  document.body.append(summary, details);
  const release = registerEditorStatusSlot(details, summary);
  mocks.state = { ...mocks.state, warmingUp: true, report: null };
  const view = renderBanner(true);
  try {
    expect(summary.textContent).toBe("");
    expect(within(details).getByText("온라인 기능을 연결하는 중이에요.")).toBeTruthy();
    expect(within(details).getByRole("link", { name: "상태 자세히" })).toBeTruthy();
    mocks.state = { ...mocks.state, warmingUp: false };
    view.rerender(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
    expect(within(summary).getByRole("status").textContent).toContain("온라인 기능 확인 필요");
    mocks.state = { ...mocks.state, status: "available", recoveredAt: Date.now() };
    view.rerender(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
    expect(within(summary).getByRole("status").textContent).toContain("온라인 기능 복구");
    expect(screen.queryByText("이 기기에 저장됨")).toBeNull();
  } finally {
    view.unmount(); release(); summary.remove(); details.remove();
  }
});
