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
