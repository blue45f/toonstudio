// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EngineeringSeminarResources } from "./EngineeringSeminarResources";
import { ENGINEERING_GLOSSARY_TERM_COUNT } from "./engineering-glossary-count";

import { useI18n } from "@/shared/lib/i18n-core";

/**
 * 발표 후 참고 자료 목록(공식 문서·생성 도구·자산 사이트)의 계약 검사.
 * 링크 접속 자체는 네트워크가 필요해 테스트가 아니라 점검 스크립트로 확인했고(보고서 참조),
 * 여기서는 형식(https·새 탭·중복 없음)과 고친 주소, 한영 문구, 개수 표기를 지킨다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const CATEGORIES = ["3D", "DRAWING", "INPUT", "LOCAL", "REALTIME", "SPACE", "AI", "WEB", "WORKFLOW", "API", "AUTH", "OSS", "SHARE", "PLATFORM", "REFERENCE"];

function renderResources(query?: string) {
  return render(
    <MemoryRouter initialEntries={["/about/technology/deck"]}>
      <EngineeringSeminarResources query={query} />
    </MemoryRouter>,
  );
}

function resourceItems(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-seminar-resource]")];
}

function anchorOf(item: HTMLElement): HTMLAnchorElement {
  const anchor = item.querySelector("a");
  if (!(anchor instanceof HTMLAnchorElement)) throw new Error("resource link is missing");
  return anchor;
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
});

describe("EngineeringSeminarResources", () => {
  it("모든 자료는 https 주소·새 탭·noopener 이고 이름과 주소가 겹치지 않으며 분류가 알려진 값이다", () => {
    const { container } = renderResources();
    const items = resourceItems(container);
    expect(items.length).toBeGreaterThanOrEqual(50);
    const hrefs = items.map((item) => anchorOf(item).getAttribute("href") ?? "");
    const names = items.map((item) => anchorOf(item).textContent ?? "");
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(names).size).toBe(names.length);
    for (const item of items) {
      const anchor = anchorOf(item);
      expect(anchor.getAttribute("href"), anchor.textContent ?? "").toMatch(/^https:\/\/[^\s/]+\.[^\s/]+\//u);
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toContain("noopener");
      expect(anchor.getAttribute("rel")).toContain("noreferrer");
      expect(CATEGORIES).toContain(item.getAttribute("data-seminar-resource"));
    }
  });

  it("옮겨 간 주소는 새 주소로 고쳐 두었다(paperjs https·MediaPipe·MCP 문서 버전 주소)", () => {
    const { container } = renderResources();
    const hrefs = resourceItems(container).map((item) => anchorOf(item).getAttribute("href"));
    expect(hrefs).toContain("https://paperjs.org/tutorials/");
    expect(hrefs).toContain("https://developers.google.com/edge/mediapipe/solutions/guide");
    expect(hrefs).toContain("https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro");
    for (const stale of ["http://paperjs.org/tutorials/", "https://ai.google.dev/edge/mediapipe/solutions/guide", "https://modelcontextprotocol.io/docs/getting-started/intro"]) {
      expect(hrefs, stale).not.toContain(stale);
    }
    // 이번 주제 확장으로 더한 자료(WebRTC·TURN·SSRF·OPFS 등)가 빠지지 않았다.
    for (const added of [
      "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation",
      "https://developers.cloudflare.com/realtime/turn/",
      "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html",
      "https://web.dev/articles/origin-private-file-system",
      "https://pnpm.io/cli/patch",
      "https://agents.md/",
    ]) expect(hrefs, added).toContain(added);
  });

  it("요약의 자료 개수는 실제 항목 수와 같고, 용어집 링크의 개수는 가벼운 상수와 같다", () => {
    const { container } = renderResources();
    const summary = container.querySelector("summary");
    expect(summary?.textContent).toContain(`· ${resourceItems(container).length}`);
    const glossary = [...container.querySelectorAll("a")].find((anchor) => anchor.getAttribute("href") === "/about/technology/glossary");
    expect(glossary?.textContent).toBe(`용어집(${ENGINEERING_GLOSSARY_TERM_COUNT}개)`);
  });

  it("검색어가 있으면 맞는 자료만 남기고 목록을 펼친다", () => {
    const { container } = renderResources("webrtc");
    const items = resourceItems(container);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThan(10);
    // 검색은 분류·이름·주소·설명 전체에서 찾으므로 주소에만 들어 있어도 남는다.
    for (const item of items) expect([anchorOf(item).getAttribute("href"), item.textContent].join(" ").toLocaleLowerCase()).toContain("webrtc");
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(renderResources("zzz-no-such-resource").container.textContent).toContain("검색어와 일치하는 추가 참고 자료가 없습니다.");
  });

  it("영어 화면에는 한글이 없다", () => {
    useI18n.getState().setLang("en");
    const { container } = renderResources();
    const text = container.textContent ?? "";
    expect(HANGUL.test(text), text.match(/[ㄱ-ㆎ가-힣]+/u)?.[0]).toBe(false);
    const glossary = [...container.querySelectorAll("a")].find((anchor) => anchor.getAttribute("href") === "/about/technology/glossary");
    expect(glossary?.textContent).toBe(`glossary (${ENGINEERING_GLOSSARY_TERM_COUNT} terms)`);
  });
});
