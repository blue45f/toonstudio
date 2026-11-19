// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { IpExchangeQuickPanel } from "./IpExchangeQuickPanel";

afterEach(cleanup);

describe("IpExchangeQuickPanel", () => {
  it("B2B IP 판권 보드와 조립형 3D 셀러 Fit 탭을 전환해 렌더링한다", () => {
    render(
      <MemoryRouter>
        <IpExchangeQuickPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/서울 게이트 브레이커/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "조립형 3D 셀러 Fit" }));
    expect(screen.getByText(/서울 옥상·계단 조립형 3D 모듈 세트/)).toBeTruthy();
    expect(screen.getByText(/OpenSKP/)).toBeTruthy();
  });
});
