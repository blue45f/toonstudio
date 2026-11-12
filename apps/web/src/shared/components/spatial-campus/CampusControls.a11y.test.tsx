// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import { campusDistrict, type CampusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { CampusContext, type CampusContextValue } from "./campus-context";
import { CampusControls } from "./CampusControls";

function context(district = campusDistrict("service")): CampusContextValue {
  return {
    binding: { routeId: "settings", districtId: "service", surface: "native", private: false },
    district, mode: "task", privacyMode: false, privacySensitive: false, returnHref: "/studio",
    setMode: vi.fn(), setPrivacyMode: vi.fn(),
  };
}
function controls(value: CampusContextValue, compact = false) {
  return <MemoryRouter><CampusContext.Provider value={value}><CampusControls compact={compact} /></CampusContext.Provider></MemoryRouter>;
}
beforeEach(() => {
  useI18n.getState().setLang("ko");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => cleanup());

describe("공간 지도 이름과 현재 공간", () => {
  it.each([
    ["ko", false, "안내·설정관", "안내·설정관 · 공간 지도 열기"],
    ["en", false, "Help & settings", "Help & settings · Open campus map"],
    ["ko", true, "공간 지도", "공간 지도 열기"],
    ["en", true, "Campus", "Open campus map"],
  ] as const)("%s의 compact=%s 지도 이름이 보이는 명칭과 열기 목적을 유지한다", (locale, compact, caption, accessibleName) => {
    useI18n.getState().setLang(locale);
    render(controls(context(), compact));
    const trigger = screen.getByRole("button", { name: accessibleName });
    expect(trigger.textContent).toBe(caption);
    expect(trigger.getAttribute("aria-label")?.toLocaleLowerCase()).toContain(caption.toLocaleLowerCase());
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: locale === "ko" ? "창작 세계의 공간 지도" : "Creative campus map" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each(["ko", "en"])("%s의 외부 공간 이름이 바뀌어도 같은 조작부의 음성 이름에 즉시 반영한다", (locale) => {
    useI18n.getState().setLang(locale);
    const district: CampusDistrict = { ...campusDistrict("service"), label: { ko: "내 스튜디오 7호", en: "My studio 7" } };
    const value = context(district), purpose = locale === "ko" ? "공간 지도 열기" : "Open campus map";
    const caption = locale === "ko" ? district.label.ko : district.label.en;
    const view = render(controls(value));
    const trigger = screen.getByRole("button", { name: `${caption} · ${purpose}` });
    const next = { ...value, district: { ...district, label: { ko: "내 스튜디오 8호", en: "My studio 8" } } };
    view.rerender(controls(next));
    const nextCaption = locale === "ko" ? next.district.label.ko : next.district.label.en;
    expect(screen.getByRole("button", { name: `${nextCaption} · ${purpose}` })).toBe(trigger);
    expect(trigger.textContent).toBe(nextCaption);
  });

  it("native가 아닌 작업의 compact 지도 비노출 계약을 이름 변경으로 넓히지 않는다", () => {
    const value = context();
    render(controls({ ...value, binding: { ...value.binding, surface: "protected" } }, true));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
