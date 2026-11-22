// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { IrInteractiveMoatShowcase } from "./IrInteractiveMoatShowcase";
import {
  IrDefenseQaAccordion,
  IrSoloLicenseIntegrityCard,
  IrVerifiedSnapshotStrip,
} from "./IrQaAndLicenseSection";

afterEach(cleanup);

describe("IR 인터랙티브 체감 위젯 및 심사 방어 섹션", () => {
  it("7밴드 KM 분광 슬라이더와 안료 프리셋 조작에 따라 실시간 색상·채도가 바뀐다", () => {
    render(<IrInteractiveMoatShowcase mode="spectral" surface="site" lang="ko" />);

    const slider = screen.getByRole("slider", { name: "안료 혼색 비율 조절" });
    const km7Swatch = screen.getByTestId("km7-swatch");
    const rgbSwatch = screen.getByTestId("rgb-swatch");
    const initialKm7 = km7Swatch.getAttribute("aria-label");
    const initialRgb = rgbSwatch.getAttribute("aria-label");
    expect(initialKm7).not.toBe(initialRgb);

    fireEvent.change(slider, { target: { value: "25" } });
    expect(km7Swatch.getAttribute("aria-label")).not.toBe(initialKm7);

    fireEvent.click(screen.getByRole("button", { name: "버밀리온 레드 + 프탈로 블루" }));
    expect(screen.getByText(/자줏빛 그림자 톤/)).toBeTruthy();
  });

  it("₩0 베타 인프라 SVG 비교 차트와 단위경제성 시뮬레이터가 실측과 가정을 구분해 계산한다", () => {
    render(<IrInteractiveMoatShowcase mode="economics" surface="site" lang="ko" />);

    expect(screen.getByText("₩0 / 월 (실측)")).toBeTruthy();
    expect(screen.getByText("가정값 · 확정 가격 아님")).toBeTruthy();

    const output = screen.getByTestId("unit-economics-output");
    expect(output.textContent).toContain("1명");

    fireEvent.click(screen.getByRole("button", { name: "유료 인프라 전환기 (가정)" }));
    expect(output.textContent).toContain("27명");
    expect(output.textContent).toContain("₩5,970,000");
  });

  it("5대 핵심 Q&A 아코디언이 개별 토글과 전체 펼치기·접기를 지원한다", () => {
    render(<IrDefenseQaAccordion surface="site" lang="ko" />);

    const triggers = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-expanded"));
    expect(triggers).toHaveLength(5);
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(triggers[1]);
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "5문항 모두 펼치기" }));
    for (const trigger of triggers) {
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }

    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    for (const trigger of triggers) {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("발표 표면(surface=present) 컴포넌트가 정적 덱 내보내기(renderToStaticMarkup)에서 안전하게 렌더된다", () => {
    const html = renderToStaticMarkup(
      <div>
        <IrVerifiedSnapshotStrip surface="present" lang="ko" />
        <IrInteractiveMoatShowcase mode="full" surface="present" lang="ko" />
        <IrSoloLicenseIntegrityCard surface="present" lang="ko" compact />
        <IrDefenseQaAccordion surface="present" lang="ko" compact />
      </div>,
    );
    expect(html).toContain('data-surface="present"');
    expect(html).toContain("0133");
    expect(html).toContain("590");
    expect(html).toContain("₩0 / 월 (실측)");
  });
});
