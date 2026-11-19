// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioMultiFormatIpKitPanel } from "./StudioMultiFormatIpKitPanel";

afterEach(cleanup);

describe("StudioMultiFormatIpKitPanel", () => {
  it("멀티포맷 규격 전환, 3컷 시드 분할, 굿즈 BOM 수익 계산을 렌더링한다", () => {
    render(<StudioMultiFormatIpKitPanel workTitle="바다 마을 기록" rightsBomCleared />);

    fireEvent.click(screen.getByRole("button", { name: /자서전 · 소량 단행본 POD 인쇄/ }));
    expect(screen.getByText(/도련선 3mm 자동 포함/)).toBeTruthy();
    expect(screen.getByText(/1컷 · 도입 훅/)).toBeTruthy();
    expect(screen.getByText(/오프라인 QR 스캔/)).toBeTruthy();
  });
});
