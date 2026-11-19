// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioIpExpansionPanel } from "./StudioIpExpansionPanel";

afterEach(cleanup);

describe("StudioIpExpansionPanel", () => {
  it("스핀오프를 추가하고 4개 탭 전환 후 IP 피치 바이블을 내보낸다", () => {
    const onExport = vi.fn();
    render(<StudioIpExpansionPanel onExportPitchBible={onExport} />);

    fireEvent.change(screen.getByPlaceholderText("신규 스핀오프/외전 제목"), {
      target: { value: "외전: 길드장의 귀환" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    fireEvent.click(screen.getByRole("tab", { name: "파일럿 사전검증" }));
    expect(screen.getByText(/원천 IP 파일럿 콘티 사전검증 입력/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "시즌 펀딩 · 로열티" }));
    expect(screen.getByText(/시즌제 팬덤 펀딩 · 완결 동행 시뮬레이터/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "멀티포맷 · QR 키트" }));
    expect(screen.getByText(/오프라인 QR 체험 · 굿즈 BOM 빌더/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "IP 피치 바이블 내보내기" }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]?.[0]).toContain("외전: 길드장의 귀환");
    expect(onExport.mock.calls[0]?.[0]).toContain("로컬 스토리 · 관광 · F&B 브랜드 협업");
  });
});
