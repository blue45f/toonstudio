// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";

afterEach(cleanup);

describe("StudioVirtualSpaceEntryLobby resume (W-2)", () => {
  it("지난 장소가 있으면 이어서 시작과 처음부터를 고르게 하고 기본 입장 버튼은 숨긴다", () => {
    const onResume = vi.fn(), onEnter = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="희준 작가" returning
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={onEnter}
      resumePlace={{ labelKo: "트리 라이브러리", labelEn: "Tree Library" }} onResume={onResume} /></MemoryRouter>);
    expect(screen.getByText(/지난번에는 트리 라이브러리에 있었어요/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "이 캐릭터로 바로 입장" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이어서 시작" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "처음부터 시작" }));
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it("닉네임이 없으면 이어서 시작도 막는다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()}
      resumePlace={{ labelKo: "트리 라이브러리", labelEn: "Tree Library" }} onResume={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "이어서 시작" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("StudioVirtualSpaceEntryLobby", () => {
  it("requires a direct character choice before entering without requesting media", async () => {
    const choose = vi.fn();
    const chooseStyle = vi.fn();
    const chooseNickname = vi.fn();
    const enter = vi.fn();
    const props = {
      returning: false,
      projectName: "Project Aurora",
      onAvatarIndex: choose,
      onArtStyle: chooseStyle,
      onNickname: chooseNickname,
      onEnter: enter,
    } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={-1} nickname="" {...props} /></MemoryRouter>);

    expect(screen.getByText("마이크 꺼짐")).toBeTruthy();
    expect(screen.getByText("카메라 꺼짐")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "함께 작업할 스튜디오에 입장하세요" })).toBeTruthy();
    expect(screen.getByText(/오늘 할 원고 작업을 고르고/u)).toBeTruthy();
    expect(screen.getByText("동료가 수락하면 함께 작업")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "자동 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    expect(choose).toHaveBeenCalledWith(0);
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="" {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/공개 닉네임/u), { target: { value: "희준 작가" } });
    expect(chooseNickname).toHaveBeenCalledWith("희준 작가");
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="희준 작가" {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByText("아트 스타일·연결 고급 설정"));
    fireEvent.click(within(await screen.findByRole("group", { name: "아트 스타일" })).getByRole("button", { name: /픽셀 아틀리에/ }));
    expect(chooseStyle).toHaveBeenCalledWith("retro");
    fireEvent.click(screen.getByRole("button", { name: "선택하고 입장" }));
    expect(enter).toHaveBeenCalledTimes(1);
  });
  it("공백만 입력한 닉네임은 유효하지 않다고 안내하고 입장을 막는다 (F-B06-2)", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="   " returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText(/공개 닉네임/u).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("공개 닉네임을 확인하면 입장할 수 있어요.")).toBeTruthy();
  });
  it("입장코드 콜백이 있으면 코드 패널을 보여 주고 유효한 코드로 입장 의도를 전한다", () => {
    const enterWithCode = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()}
      onEnterWithCode={enterWithCode} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "입장코드로 입장" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("입장코드"), { target: { value: "abc234" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect(enterWithCode).toHaveBeenCalledWith("ABC234");
  });

  it("입장코드 콜백이 없으면 코드 패널을 렌더하지 않는다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "입장코드로 입장" })).toBeNull();
  });

  it("개인 아틀리에는 고급 설정을 열기 전 미리보기를 마운트하지 않고 RTC 안내를 표시하지 않는다", async () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={0} nickname="작가" returning
      projectName="나의 아틀리에" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText("소규모 협업은 P2P 우선")).toBeNull();
    expect(screen.queryByRole("group", { name: "아트 스타일" })).toBeNull();
    expect(document.querySelector(".space-lobby__advanced-body")).toBeNull();
    fireEvent.click(screen.getByText("아트 스타일 설정"));
    expect(within(await screen.findByRole("group", { name: "아트 스타일" })).getByRole("button", { name: /픽셀 아틀리에/ })).toBeTruthy();
    expect(document.querySelector(".studio-vspace-rtc-panel")).toBeNull();
    expect(screen.getByText(/내 작품을 열거나 새 작품을 만들고/u)).toBeTruthy();
    expect(screen.queryByText("동료가 수락하면 함께 작업")).toBeNull();
  });
  it("게스트 모드는 닉네임만으로 입장하고 캐릭터 선택을 숨긴다", () => {
    const enter = vi.fn();
    const chooseNickname = vi.fn();
    const props = {
      guestMode: true, avatarIndex: 0, returning: false, projectName: "Project Aurora",
      onAvatarIndex: vi.fn(), onNickname: chooseNickname, onEnter: enter,
    } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby nickname="" {...props} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "초대받은 공간에 입장하세요" })).toBeTruthy();
    expect(screen.getByText(/초대 링크로 입장하는 게스트예요/u)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "내 캐릭터" })).toBeNull();
    expect(screen.queryByText("아트 스타일·연결 고급 설정")).toBeNull();
    expect(screen.getByRole("button", { name: "게스트로 입장" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/공개 닉네임/u), { target: { value: "초대 게스트" } });
    expect(chooseNickname).toHaveBeenCalledWith("초대 게스트");
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby nickname="초대 게스트" {...props} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "게스트로 입장" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(screen.getByText("게스트 세션은 24시간 동안 유효해요.")).toBeTruthy();
  });
  it("왼쪽 무대에 고른 캐릭터와 공개 이름표를 크게 보여 주고, 개인 작업실은 혼자 쓰는 공간임을 알린다", () => {
    const props = { returning: false, projectName: "나의 아틀리에", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={-1} nickname="" {...props} /></MemoryRouter>);
    const stage = screen.getByRole("region", { name: "입장 미리보기" });
    expect(within(stage).getByText("캐릭터를 골라 주세요")).toBeTruthy();
    expect(within(stage).getByText("닉네임을 입력하세요")).toBeTruthy();
    expect(within(stage).getByText("나만 입장하는 개인 작업실")).toBeTruthy();
    expect(within(stage).queryByText("마이크 꺼짐")).toBeNull();
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={0} nickname="희준 작가" {...props} /></MemoryRouter>);
    expect(within(stage).getByText("희준 작가")).toBeTruthy();
    expect(stage.querySelector(".space-lobby__character")).not.toBeNull();
    expect(screen.getByRole("button", { name: "하늘 캐릭터 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("studio-vspace-entry-title");
  });
});

describe("StudioVirtualSpaceEntryLobby 월드 미리보기와 첫 화면 순서", () => {
  it("무대에 입장할 월드의 실제 베이스 아트를 깔고 아트 스타일을 바꾸면 그 스타일의 월드로 교체한다", () => {
    const props = { returning: false, projectName: "Project Aurora", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" {...props} /></MemoryRouter>);
    const stage = screen.getByRole("region", { name: "입장 미리보기" });
    const preview = stage.querySelector<HTMLImageElement>("[data-world-preview]");
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute("src")).toBe("/assets/virtual-studio/style-packs-v5/sky-island/world/world-base.webp");
    // 초점은 스타일별 실측 좌표(포털 구역)를 인라인 object-position으로 적용한다.
    expect(preview!.style.objectPosition).toBe("61% 68%");
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" artStyle="retro" {...props} /></MemoryRouter>);
    const retroPreview = stage.querySelector<HTMLImageElement>("[data-world-preview]")!;
    expect(retroPreview.getAttribute("src"))
      .toBe("/assets/virtual-studio/style-packs-v5/retro/world/world-base.webp");
    expect(retroPreview.style.objectPosition).toBe("61% 73%");
  });

  it("필수 입력 순서는 닉네임이 캐릭터 선택보다 먼저이고, 입장 버튼이 입장코드보다 먼저다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()}
      onEnterWithCode={vi.fn()} /></MemoryRouter>);
    const nickname = screen.getByLabelText(/공개 닉네임/u);
    const picker = screen.getByRole("group", { name: "내 캐릭터" });
    expect(nickname.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const enterButton = screen.getByRole("button", { name: "선택하고 입장" });
    const codeHeading = screen.getByRole("heading", { name: "입장코드로 입장" });
    expect(enterButton.compareDocumentPosition(codeHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("캐릭터 온보딩 variant 아트 전면 구도 (W5-T3)", () => {
  it("무대 배경이 타일 시트가 아닌 전용 일러스트이고 준비 상태와 무대 칩을 보여 준다", () => {
    const props = { returning: false, projectName: "나의 창작 홈", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby variant="character-onboarding" avatarIndex={-1} nickname="" {...props} /></MemoryRouter>);
    const stage = screen.getByRole("region", { name: "입장 미리보기" });
    const art = stage.querySelector<HTMLImageElement>("[data-onboarding-stage-art]");
    expect(art).not.toBeNull();
    expect(art!.getAttribute("src")).toBe("/images/onboarding-character-stage.webp");
    expect(stage.querySelector("[data-world-preview]")).toBeNull();
    expect(within(stage).getByText("나중에도 언제든 변경 가능")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "시작 준비 상태" });
    expect(within(steps).getByText("아직 입력 전")).toBeTruthy();
    expect(within(steps).getByText("아직 선택 전")).toBeTruthy();
    expect(within(steps).getByText("두 가지를 마치면 시작")).toBeTruthy();

    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby variant="character-onboarding" avatarIndex={0} nickname="희준 작가" {...props} /></MemoryRouter>);
    expect(within(steps).getByText("희준 작가")).toBeTruthy();
    expect(within(steps).getByText("바로 시작할 수 있어요")).toBeTruthy();
    expect(steps.querySelectorAll("li[data-done]")).toHaveLength(3);
  });

  it("일반 입장 variant는 기존 월드 베이스 미리보기와 단계 표시 없음을 유지한다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("list", { name: "시작 준비 상태" })).toBeNull();
    expect(document.querySelector("[data-onboarding-stage-art]")).toBeNull();
    expect(document.querySelector("[data-world-preview]")).not.toBeNull();
  });
});

describe("월드 미리보기 로딩·실패 상태 (W5-T7)", () => {
  const props = { returning: false, projectName: "Project Aurora", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;

  it("텍스처가 도착하기 전에는 미리보기를 감춘 상태로 두고 도착하면 드러낸다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" {...props} /></MemoryRouter>);
    const preview = document.querySelector<HTMLImageElement>("[data-world-preview]")!;
    expect(preview.getAttribute("data-preview-state")).toBe("loading");
    fireEvent.load(preview);
    expect(preview.getAttribute("data-preview-state")).toBe("ready");
  });

  it("스타일을 바꾸면 새 텍스처 기준으로 로딩 상태가 초기화된다", () => {
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" {...props} /></MemoryRouter>);
    fireEvent.load(document.querySelector("[data-world-preview]")!);
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" artStyle="neon" {...props} /></MemoryRouter>);
    expect(document.querySelector("[data-world-preview]")!.getAttribute("data-preview-state")).toBe("loading");
  });

  it("텍스처 로딩에 실패하면 무대 머리에 안내를 띄우되 입장은 그대로 가능하다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" {...props} /></MemoryRouter>);
    const preview = document.querySelector<HTMLImageElement>("[data-world-preview]")!;
    fireEvent.error(preview);
    expect(preview.getAttribute("data-preview-state")).toBe("error");
    expect(screen.getByText("월드 미리보기를 불러오지 못했어요. 입장에는 영향이 없어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("입장코드 동선 안내 (W5-T7)", () => {
  it("코드로 들어올 수 있는 방문자에게 첫 화면에서 코드 경로를 안내하고 누르면 코드 패널로 포커스가 이동한다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()}
      onEnterWithCode={vi.fn()} /></MemoryRouter>);
    const hint = screen.getByRole("button", { name: /초대 코드가 있으면/u });
    fireEvent.click(hint);
    expect(document.activeElement).toBe(document.getElementById("studio-vspace-entry-code"));
  });

  it("코드 콜백이 없는 방문자와 게스트 모드에서는 안내를 띄우지 않는다", () => {
    const props = { returning: false, projectName: "Project Aurora", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" {...props} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /초대 코드가 있으면/u })).toBeNull();
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" guestMode onEnterWithCode={vi.fn()} {...props} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /초대 코드가 있으면/u })).toBeNull();
  });
});

describe("입장 로비 조작법 미리보기", () => {
  it("접힌 상태로 조작법 3가지를 미리 보여주고 미니 투어를 안내한다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="작가" returning={false}
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    const preview = screen.getByText("입장 전 조작법 미리보기").closest("details")!;
    expect(preview.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("입장 전 조작법 미리보기"));
    expect(preview.hasAttribute("open")).toBe(true);
    expect(within(preview).getByText("이동")).toBeTruthy();
    expect(within(preview).getByText("상호작용")).toBeTruthy();
    expect(within(preview).getByText("리액션")).toBeTruthy();
    expect(within(preview).getByText(/3단계 미니 투어가 나타나요/)).toBeTruthy();
  });
});

describe("StudioVirtualSpaceEntryLobby access gate (F-B06-1)", () => {
  it("자격 거절 안내는 alert로 명시하고 입장을 막는다", () => {
    const enter = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="게스트" returning={false} guestMode
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={enter}
      accessBlocked
      accessNotice={{ tone: "error", ko: "만료된 초대예요. 보낸 사람에게 새 초대를 요청해 주세요.", en: "This invitation has expired." }} /></MemoryRouter>);
    expect(screen.getByRole("alert").textContent).toContain("만료된 초대예요");
    expect(screen.getByRole("button", { name: "게스트로 입장" }).hasAttribute("disabled")).toBe(true);
  });

  it("확인 불가 안내는 재시도 버튼으로 검증을 다시 시도하게 한다", () => {
    const retry = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="게스트" returning={false} guestMode
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()}
      accessBlocked onRetryAccess={retry}
      accessNotice={{ tone: "error", ko: "초대 자격을 확인하지 못했어요.", en: "We couldn't verify your invitation." }} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("안내가 없으면 기존 입장 버튼 상태를 그대로 둔다", () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="게스트" returning={false} guestMode
      projectName="Project Aurora" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "게스트로 입장" }).hasAttribute("disabled")).toBe(false);
  });
});
