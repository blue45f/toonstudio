// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioKaistoryProductionWorkbench } from "./StudioKaistoryProductionWorkbench";

afterEach(cleanup);

describe("StudioKaistoryProductionWorkbench", () => {
  it("conti · design · editor · story 4대 탭을 전환하며 핵심 액션을 실행한다", () => {
    render(<StudioKaistoryProductionWorkbench projectId="proj-kaistory-demo" />);

    expect(
      screen.getByRole("heading", {
        name: /KAISTORY 만화 제작·다국어 검수·학습카드 파이프라인/u,
      }),
    ).toBeTruthy();

    // 1. Conti 탭: 1-2쪽 펼침 적용 버튼 클릭
    fireEvent.click(screen.getByRole("button", { name: "1-2쪽 펼침 적용" }));
    expect(screen.getByRole("status").textContent).toContain("쌍 설정 완료");

    // 2. Design 탭 전환 및 앞 말풍선 겹침 스냅 실행
    fireEvent.click(screen.getByRole("tab", { name: /2\. design · 편집·변환/u }));
    fireEvent.click(screen.getByRole("button", { name: /앞 말풍선에 살짝 겹치도록 옮기기/u }));
    expect(screen.getByRole("status").textContent).toContain("14px 겹치도록 스냅 완료");

    // 3. Editor 탭 전환 및 네이버 문법 좌/우 배치·소설 모드 전환
    fireEvent.click(screen.getByRole("tab", { name: /3\. editor · 렌더·내보내기/u }));
    fireEvent.click(screen.getByRole("button", { name: "네이버 문법 좌/우 번갈아 배치" }));
    expect(screen.getByRole("status").textContent).toContain(
      "네이버 문법 말풍선 좌/우 번갈아 배치를 전환했습니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: "소설(그래픽노블)" }));
    expect(screen.getByText(/그래픽노블 A4 조판 설정/u)).toBeTruthy();

    // 4. Story 탭 전환 및 학생 노출·버전 정책 확인
    fireEvent.click(screen.getByRole("tab", { name: /4\. story · 독자·학습카드/u }));
    expect(screen.getByText(/현재 노출 판정/u)).toBeTruthy();
    expect(screen.getByText(/영향 미리보기/u)).toBeTruthy();
  });
});
