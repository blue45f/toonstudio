// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as settings from "@/shared/lib/nextgen-lab-settings";
import { buildSpeculationRulesJson, STUDIO_PRERENDER_URLS } from "@/shared/lib/speculation-rules";

import { installSpeculationRulesOnce } from "./nextgen-web-platform-enhancer";

function isolatedDocument(): Document {
  // 활성 문서에 규칙을 넣지 않도록 분리된 HTMLDocument를 사용한다.
  return document.implementation.createHTMLDocument("speculation contract");
}

function addCanonicalRule(doc: Document): HTMLScriptElement {
  const script = doc.createElement("script");
  script.type = "speculationrules";
  script.textContent = buildSpeculationRulesJson(STUDIO_PRERENDER_URLS);
  doc.head.appendChild(script);
  return script;
}

describe("쇼케이스의 정본 prerender 설정·DOM 주입 계약", () => {
  beforeEach(() => {
    vi.spyOn(settings, "getNextgenLabSettingsSnapshot").mockReturnValue({
      ...settings.NEXTGEN_LAB_DEFAULTS,
      studioPrerender: true,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("OFF면 규칙을 추가하지 않고, 다음 호출의 ON 설정을 같은 정본 getter에서 읽는다", () => {
    const doc = isolatedDocument();
    const supports = vi.fn(() => true);
    vi.mocked(settings.getNextgenLabSettingsSnapshot).mockReturnValue({
      ...settings.NEXTGEN_LAB_DEFAULTS,
      studioPrerender: false,
    });
    expect(installSpeculationRulesOnce({ doc, scriptSupports: supports })).toEqual({
      installed: false, status: "disabled", urls: [],
    });
    expect(doc.head.querySelector('script[type="speculationrules"]')).toBeNull();
    expect(supports).not.toHaveBeenCalled();

    vi.mocked(settings.getNextgenLabSettingsSnapshot).mockReturnValue(settings.NEXTGEN_LAB_DEFAULTS);
    expect(installSpeculationRulesOnce({ doc, scriptSupports: supports })).toEqual({
      installed: true, status: "installed", urls: ["/studio"],
    });
    expect(doc.head.querySelector('script[type="speculationrules"]')?.textContent)
      .toBe(buildSpeculationRulesJson(STUDIO_PRERENDER_URLS));
    expect(settings.getNextgenLabSettingsSnapshot).toHaveBeenCalledTimes(2);
  });

  it("ON이어도 미지원이면 태그와 적용 URL이 없다", () => {
    const doc = isolatedDocument();
    expect(installSpeculationRulesOnce({ doc, scriptSupports: () => false })).toEqual({
      installed: false, status: "unsupported", urls: [],
    });
    expect(doc.head.querySelector('script[type="speculationrules"]')).toBeNull();
  });

  it("기존 canonical은 중복 생성하지 않고 요청 목록 대신 실제 기존 /studio URL을 반환한다", () => {
    const doc = isolatedDocument();
    const canonical = addCanonicalRule(doc);
    expect(installSpeculationRulesOnce({ doc, scriptSupports: () => true })).toEqual({
      installed: true, status: "already-installed", urls: ["/studio"],
    });
    expect(installSpeculationRulesOnce({
      doc, urls: ["/compare"], scriptSupports: () => true,
    })).toEqual({ installed: true, status: "already-installed", urls: ["/studio"] });
    expect(doc.head.querySelectorAll('script[type="speculationrules"]')).toHaveLength(1);
    expect(doc.head.querySelector('script[type="speculationrules"]')).toBe(canonical);
  });

  it("OFF 요청은 기존 다른 설치자의 canonical을 교체하거나 제거하지 않는다", () => {
    const doc = isolatedDocument();
    const canonical = addCanonicalRule(doc);
    vi.mocked(settings.getNextgenLabSettingsSnapshot).mockReturnValue({
      ...settings.NEXTGEN_LAB_DEFAULTS, studioPrerender: false,
    });
    expect(installSpeculationRulesOnce({ doc, scriptSupports: () => true })).toEqual({
      installed: false, status: "disabled", urls: [],
    });
    expect(doc.head.querySelectorAll('script[type="speculationrules"]')).toHaveLength(1);
    expect(doc.head.querySelector('script[type="speculationrules"]')).toBe(canonical);
  });

  it("명시적 custom URL은 기존 prefetch 계약과 실제 요청 URL을 유지한다", () => {
    const doc = isolatedDocument();
    expect(installSpeculationRulesOnce({
      doc, urls: ["/compare"], eagerness: "conservative", scriptSupports: () => true,
    })).toEqual({ installed: true, status: "installed", urls: ["/compare"] });
    const text = doc.head.querySelector('script[type="speculationrules"]')?.textContent ?? "";
    expect(JSON.parse(text)).toEqual({
      prefetch: [{ source: "list", urls: ["/compare"], eagerness: "conservative" }],
    });
  });

  it("해석할 수 없는 기존 규칙은 URL 성공 목록을 꾸며내지 않는다", () => {
    const doc = isolatedDocument();
    const script = doc.createElement("script");
    script.type = "speculationrules";
    script.textContent = "invalid json";
    doc.head.appendChild(script);
    expect(installSpeculationRulesOnce({ doc, scriptSupports: () => true })).toEqual({
      installed: true, status: "already-installed", urls: [],
    });
    expect(doc.head.querySelectorAll('script[type="speculationrules"]')).toHaveLength(1);
  });
});
