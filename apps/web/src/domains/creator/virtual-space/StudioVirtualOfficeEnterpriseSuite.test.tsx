// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualOfficeEnterpriseSuite } from "./StudioVirtualOfficeEnterpriseSuite";
import { StudioVirtualSpaceCollaborationHub } from "./StudioVirtualSpaceCollaborationHub";
import { StudioVirtualSpaceTownProgramPanel } from "./StudioVirtualSpaceTownProgramPanel";
import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

afterEach(cleanup);

describe("StudioVirtualOfficeEnterpriseSuite", () => {
  it("탭 1: 다층 빌딩 엘리베이터 이동, Knock-to-Enter 승인, 영구 테이블 고정, 지향성 음성 콘을 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    expect(screen.getByTestId("studio-virtual-office-enterprise-suite")).toBeTruthy();
    expect(screen.getByText(/내 위치: FLOOR-2F/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /1F 이동/u }));
    expect(screen.getByText(/내 위치: FLOOR-1F/u)).toBeTruthy();

    // 노크 입장 승인
    fireEvent.click(screen.getByRole("button", { name: "입장 승인" }));
    expect(screen.getByRole("status").textContent).toContain("노크 입장을 승인했습니다");

    // 어깨 톡 전송
    fireEvent.click(screen.getByRole("button", { name: "어깨 톡 전송" }));
    expect(screen.getByRole("status").textContent).toContain("어깨 톡(Shoulder Tap)을 보냈습니다");

    // 영구 테이블 문서 고정
    fireEvent.click(screen.getByRole("button", { name: "테이블에 문서 고정" }));
    expect(screen.getByText(/14화 컷 45~52 배경 컬러 교정 시트/u)).toBeTruthy();

    // 지향성 음성 콘 후방 감쇠 전환
    fireEvent.click(screen.getByRole("button", { name: "뒤돌아보기 (180° 후방 감쇠)" }));
    expect(screen.getByText(/후방 감쇠 적용/u)).toBeTruthy();
  });

  it("탭 2: AI 에이전트 데스크 태스크 배정, 회의 메모리 검색, MCP 오피스 쿼리 브리지를 동작시킨다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", { name: /AI 에이전트 데스크 · 회의 메모리 · MCP 브리지/u }),
    );

    expect(screen.getAllByText(/소피아 회의록·메모리 봇/u).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "태스크 지시" }));
    expect(screen.getByRole("status").textContent).toContain("신규 자동 검수 태스크를 배정했습니다");

    fireEvent.click(screen.getByRole("button", { name: "즉시 완료 산출" }));
    expect(screen.getByRole("status").textContent).toContain("완료 처리되었습니다");

    // MCP 오피스 컨텍스트 쿼리 전환
    fireEvent.change(screen.getByLabelText("MCP 오피스 쿼리 인텐트"), {
      target: { value: "agent-desk-status" },
    });
    expect(screen.getByText(/AI 에이전트 데스크 4기 중/u)).toBeTruthy();
  });

  it("탭 3: DCC 실시간 작업 앱 상태(True Status), 비동기 데스크 노트(Aikido), 4화면 동시 공유를 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", {
        name: /DCC 작업 프레즌스 · 데스크 비동기 노트 · 4화면 동시공유/u,
      }),
    );

    fireEvent.click(screen.getByLabelText("파일명 보안 마스킹"));
    fireEvent.click(screen.getByRole("button", { name: "상태 반영" }));
    expect(screen.getByText("Blender 4.2 LTS · 보안 마스킹 작업 파일")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "책상에 노트 드롭" }));
    expect(screen.getByRole("status").textContent).toContain("비동기 보이스 노트를 남겼습니다");

    fireEvent.click(screen.getByRole("button", { name: "동시 화면 추가" }));
    expect(screen.getByText(/활성 스트림: 3\/4/u)).toBeTruthy();
  });

  it("탭 4: ZEP 호스트 관제(전원 소환·음소거·룰렛), SpatialChat 미디어 핀, SoWork 주간 인사이트를 표시한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", { name: /호스트 관제 · 공간 미디어 핀 · 주간 인사이트/u }),
    );

    fireEvent.click(screen.getByRole("button", { name: "1F 타운홀로 전원 소환" }));
    expect(screen.getByText(/전원 소환 완료/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "캔버스 핀 추가" }));
    expect(screen.getByText(/15화 지하철역 공간 레퍼런스 무드보드/u)).toBeTruthy();

    expect(screen.getByText(/주간 딥 포커스\(집중 작화\) 시간/u)).toBeTruthy();
  });

  it("탭 5: Wave 2 원격페어링(Tuple·Pop), 상태모자·Kudos(Teemyco), 리셉션·호출(Sococo), 귓속말코칭·3D페데스탈(Nooks·FrameVR·Arthur·Virbela)을 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", {
        name: /원격페어링 · 상태모자 · 리셉션 · 3D페데스탈/u,
      }),
    );

    expect(
      screen.getByTestId("studio-virtual-office-pairing-xr-panel"),
    ).toBeTruthy();

    // Teemyco Kudos 발송
    fireEvent.click(screen.getByTestId("post-kudos-shoutout-btn"));
    expect(screen.getByTestId("wave2-kpi-kudos").textContent).toContain(
      "칭찬 Kudos 3건",
    );

    // Sococo 게스트 리셉션 입장 승인 & Get Teammate 호출 수락
    fireEvent.click(screen.getByTestId("admit-guest-guest-ext-sound"));
    fireEvent.click(screen.getByTestId("accept-summon-sum-1"));

    // Tuple/Pop 레이저 잉크 추가 및 만료 정리
    fireEvent.click(screen.getByTestId("add-fading-laser-ink-btn"));
    expect(screen.getByTestId("wave2-kpi-ink").textContent).toContain(
      "레이저 2",
    );
    fireEvent.click(screen.getByTestId("prune-fading-ink-btn"));
    expect(screen.getByTestId("wave2-kpi-ink").textContent).toContain(
      "레이저 0",
    );

    // Nooks 귓속말 코칭 & FrameVR/Arthur 3D 페데스탈 회전 + 공간 핀 추가
    fireEvent.click(screen.getByTestId("send-whisper-directive-btn"));
    expect(screen.getByTestId("coaching-whisper-banner").textContent).toContain(
      "42화 성채 3D 역광 포인트",
    );

    fireEvent.click(screen.getByTestId("rotate-pedestal-45-btn"));
    expect(screen.getByTestId("pedestal-angle-readout").textContent).toContain(
      "회전각 90°",
    );

    fireEvent.click(screen.getByTestId("add-pedestal-spatial-pin-btn"));
    expect(screen.getByTestId("wave2-kpi-pedestal").textContent).toContain(
      "공간핀 3개",
    );
  });

  it("탭 6: Wave 3 그린룸·품평로테이션(Airmeet·Remo), 3D홀로그램·포털(ENGAGE XR·Spatial.io), 딥스프린트(Focusmate·Flow Club), 사운드스케이프(Bramble)를 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", {
        name: /그린룸 · 품평로테이션 · 3D홀로그램 · 딥스프린트/u,
      }),
    );

    expect(
      screen.getByTestId("studio-virtual-office-stage-sprint-holo-panel"),
    ).toBeTruthy();

    // Airmeet 그린룸 콘티덱 동기화 완료 후 본무대 라이브 전환
    fireEvent.click(screen.getByTestId("toggle-greenroom-deck-btn"));
    fireEvent.click(screen.getByTestId("promote-main-stage-btn"));
    expect(screen.getByTestId("wave3-kpi-stage").textContent).toContain(
      "ON-AIR 본무대 송출중",
    );

    // Remo 스피드 품평 테이블 로테이션
    fireEvent.click(screen.getByTestId("rotate-critique-tables-btn"));
    expect(screen.getByTestId("wave3-kpi-rotation").textContent).toContain(
      "2라운드",
    );

    // ENGAGE XR 3D 홀로그램 녹화 & Spatial.io 포털 워프
    fireEvent.click(screen.getByTestId("record-ghost-clip-btn"));
    fireEvent.click(screen.getByTestId("traverse-portal-portal-ep42-cathedral"));
    expect(screen.getByTestId("wave3-kpi-hologram").textContent).toContain(
      "3D 홀로그램 재생 2개 · 포털 이동 7명",
    );

    // Focusmate / Flow Club 스프린트 단계 전환 및 목표 추가
    fireEvent.click(screen.getByTestId("advance-sprint-phase-btn"));
    expect(screen.getByTestId("sprint-phase-badge").textContent).toContain(
      "silent-deep-drawing",
    );
    fireEvent.click(screen.getByTestId("add-sprint-goal-btn"));
    expect(screen.getByTestId("wave3-kpi-sprint").textContent).toContain(
      "1/4",
    );
  });

  it("탭 7: Wave 4 네이버후드(Welo), 비동기컷핀(Claap), 스토리보드워룸(Miro), 커서챗·하이파이브(FigJam), Go-Live시어터(Discord), 바이오필릭·허들(Kosy·Slack)을 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", {
        name: /워룸투표 · 비동기컷핀 · Go-Live시어터 · 바이오필릭/u,
      }),
    );

    expect(screen.getByTestId("virtual-office-wave4-panel")).toBeTruthy();

    fireEvent.click(screen.getByTestId("welo-issue-visitor-pass-btn"));
    expect(screen.getByTestId("welo-zone-nb-bg-3d").textContent).toContain("자동 방음 잠김");

    fireEvent.click(screen.getByTestId("claap-approve-claap-pin-14-38"));
    expect(screen.getByTestId("claap-thread-claap-pin-14-38").textContent).toContain(
      "approved-signoff",
    );

    fireEvent.click(screen.getByTestId("miro-bring-everyone-btn"));
    expect(screen.getByTestId("miro-bring-everyone-btn").textContent).toContain(
      "뷰포트 동기화 켜짐 (#42컷)",
    );

    fireEvent.click(screen.getByTestId("miro-vote-vote-opt-a"));
    fireEvent.click(screen.getByTestId("figjam-send-cursor-bubble-btn"));
    fireEvent.click(screen.getByTestId("discord-promote-member-color-lead"));
    fireEvent.click(screen.getByTestId("kosy-theme-sunlit-greenhouse"));
    fireEvent.click(screen.getByTestId("slack-check-chk-2"));
    fireEvent.click(screen.getByTestId("slack-burst-🚀"));
    expect(screen.getByTestId("wave4-status-notice").textContent).toContain("🚀");
  });

  it("탭 8: Wave 5 플로팅PiP·오버더숄더(Whereby·Airtime), AI소음번역(Krisp), 캘린더동기화(Cal.com), 스탠드업봇·40대카탈로그(Pumble)를 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    fireEvent.click(
      screen.getByRole("tab", {
        name: /플로팅PiP · AI소음번역 · 캘린더동기화 · 40대총괄/u,
      }),
    );

    expect(screen.getByTestId("virtual-office-holistic-master-panel")).toBeTruthy();

    fireEvent.click(screen.getByTestId("holistic-toggle-pip-btn"));
    fireEvent.click(screen.getByTestId("holistic-next-slide-btn"));
    fireEvent.click(screen.getByTestId("holistic-toggle-krisp-btn"));
    fireEvent.click(screen.getByTestId("holistic-locale-en-btn"));
    fireEvent.click(screen.getByTestId("holistic-cal-time-610-btn"));
    expect(screen.getByRole("status").textContent).toContain("in-meeting");

    expect(screen.getByTestId("nano-banana-studio-pack-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nano-banana-pose-idle-btn"));
    fireEvent.click(screen.getByTestId("nano-banana-dir-left-btn"));
    expect(
      screen.getByTestId("nano-banana-active-character-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/nano-banana-v10/frames/idle-left.webp");
    fireEvent.click(screen.getByTestId("nano-banana-prop-biophilic-planter-set-btn"));
    expect(screen.getByRole("status").textContent).toContain("바이오필릭 플랜테리어 컬렉션");

    // Nano Banana v11+v12 Next-Gen Engine Panel verification
    expect(screen.getByTestId("virtual-office-nextgen-engine-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nextgen-theme-romance-palace-conservatory-btn"));
    expect(
      screen.getByTestId("nextgen-active-theme-hero-img").getAttribute("src"),
    ).toContain(
      "/assets/virtual-studio/nano-banana-v12/themes/romance-palace-conservatory.webp",
    );

    fireEvent.click(screen.getByTestId("nextgen-persona-sound-letterer-btn"));
    expect(
      screen.getByTestId("nextgen-active-persona-sprite-img").getAttribute("src"),
    ).toContain("/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-work.webp");

    fireEvent.click(screen.getByTestId("nextgen-ghost-mode-g-btn"));
    fireEvent.click(screen.getByTestId("nextgen-move-left-btn"));
    fireEvent.click(screen.getByTestId("nextgen-interact-x-btn"));
    fireEvent.click(screen.getByTestId("nextgen-click-to-walk-btn"));
    fireEvent.click(screen.getByTestId("nextgen-webaudio-ping-page-flip-chime-btn"));
    expect(screen.getByTestId("nextgen-webaudio-ping-status").textContent).toContain(
      "880Hz",
    );
    fireEvent.click(screen.getByTestId("nextgen-wall-barrier-toggle-btn"));
    fireEvent.click(screen.getByTestId("nextgen-approach-desk-desk-ep43-c19-btn"));
    fireEvent.click(screen.getByTestId("nextgen-advance-cut-desk-ep43-c19-btn"));
    expect(screen.getByRole("status").textContent).toContain("EP.43 C19");
  });

  it("REA UI/UX 공간 플로어 레이더 캔버스 · 지향성 음성 콘 SVG · 플로팅 글래스모피즘 독 · ⌘K 공간 커맨드 런처를 제어한다", () => {
    render(<StudioVirtualOfficeEnterpriseSuite />);

    expect(screen.getByTestId("studio-virtual-office-spatial-canvas-hud")).toBeTruthy();
    expect(screen.getByTestId("spatial-voice-cone-svg")).toBeTruthy();
    expect(screen.getByTestId("spatial-nano-banana-floor-backdrop")).toBeTruthy();
    expect(screen.getByTestId("spatial-companion-mascot-follower")).toBeTruthy();

    fireEvent.click(screen.getByTestId("spatial-view-mode-acoustic-heatmap"));
    expect(screen.getByTestId("spatial-hud-toast").textContent).toContain("음향 dB 히트맵");

    fireEvent.click(screen.getByTestId("spatial-canvas-zone-zone-3f-conte-vault"));
    expect(screen.getByTestId("spatial-hud-toast").textContent).toContain(
      "3F 스포일러 보안 콘티 워룸",
    );

    fireEvent.click(screen.getByTestId("spatial-dock-rotate-cone-btn"));
    fireEvent.click(screen.getByTestId("spatial-dock-megaphone-btn"));
    fireEvent.click(screen.getByTestId("spatial-dock-helmet-btn"));

    fireEvent.click(screen.getByTestId("spatial-dock-cmdk-btn"));
    expect(screen.getByTestId("spatial-cmdk-palette")).toBeTruthy();
    fireEvent.click(screen.getByTestId("spatial-cmdk-item-cmd-warroom-dot-vote"));
    expect(screen.getByTestId("virtual-office-wave4-panel")).toBeTruthy();
  });

  it("StudioVirtualSpaceCollaborationHub 및 StudioVirtualSpaceTownProgramPanel 내부 탭으로 통합 연결된다", () => {
    render(<StudioVirtualSpaceCollaborationHub />);
    fireEvent.click(screen.getByRole("tab", { name: "13대 가상오피스 통합관제" }));
    expect(screen.getByTestId("studio-virtual-office-enterprise-suite")).toBeTruthy();
    cleanup();

    render(
      <StudioVirtualSpaceTownProgramPanel
        operations={{ phase: "ready", project: null, inbox: [], calendar: [], error: null }}
        manifest={DEFAULT_STUDIO_WORLD_MANIFEST}
        decorations={studioVirtualDecorationPreset("minimal")}
        rewards={{ version: 1, unlocked: [] }}
        spotlightActive={false}
        onDecorations={vi.fn()}
        onClaimReward={vi.fn()}
        onEquipReward={vi.fn()}
        onMoveToRoom={vi.fn()}
        onOpenPeople={vi.fn()}
        onOpenAnnotation={vi.fn()}
        onOpenSessions={vi.fn()}
        onStartSpotlight={vi.fn()}
        onStopSpotlight={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "가상오피스" }));
    expect(screen.getByTestId("studio-virtual-office-enterprise-suite")).toBeTruthy();
  });
});
