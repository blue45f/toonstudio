// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineeringLibrariesPage } from "./EngineeringLibrariesPage";
import { externalLinkForName } from "./engineering-external-links";
import { isLicenseCaution, licenseBasis, mapRowHref, officialLinksForName } from "./engineering-library-card-helpers";
import { LIBRARY_GUIDE_AREAS } from "./engineering-library-guide-content";
import { LIBRARY_AREA_GROUPS } from "./engineering-library-guide-groups";
import { LIBRARY_GUIDE_OVERVIEW } from "./engineering-library-guide-overview";
import { LIBRARY_KIND_LABELS, type LibraryCard } from "./engineering-library-guide-types";
import { licenseNeedsEnglish, localizedLicense } from "./engineering-library-license-labels";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

import { useI18n } from "@/shared/lib/i18n-core";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
// 도감 데이터는 수백 KB 라서 링크 줄이 렌더 뒤에 동적으로 불러온다. 화면 시험에서는 영역·카드가 가리키는 카드마다 이름만 있는 픽스처로 바꾼다
// (카드가 실제로 있는지는 계약 시험 `engineering-library-guide-content.test.ts` 가 따로 확인한다).
vi.mock("./engineering-atlas-content", async () => {
  const { LIBRARY_GUIDE_AREAS: areas } = await import("./engineering-library-guide-content");
  const ids = [...new Set(areas.flatMap((area) => [...area.atlasIds, ...area.libraries.flatMap((card) => card.atlasIds ?? [])]))];
  return { ENGINEERING_ATLAS_ENTRIES: ids.map((id) => ({ id, name: `Atlas card ${id}` })) };
});

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  window.history.replaceState(null, "", "/");
  scrollIntoView.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/libraries"]}>
      <EngineeringLibrariesPage />
    </MemoryRouter>,
  );
}

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const BODY = "#engineering-libraries-body";

const allCards = (): readonly LibraryCard[] => LIBRARY_GUIDE_AREAS.flatMap((area) => area.libraries);
const findCard = (id: string): LibraryCard => {
  const card = allCards().find((item) => item.id === id);
  if (!card) throw new Error(`카드 ${id} 없음`);
  return card;
};

/** pnpm-workspace.yaml 의 `patchedDependencies` 항목 수(개수를 글에 박지 않고 파일에서 읽어 맞춘다). */
function patchedDependencyCount(): number {
  const lines = readFileSync("pnpm-workspace.yaml", "utf8").split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith("patchedDependencies:"));
  if (start < 0) throw new Error("patchedDependencies 없음");
  let count = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    if (/^\s{2}\S/u.test(line) && !/^\s*#/u.test(line)) count += 1;
  }
  return count;
}

describe("EngineeringLibrariesPage", () => {
  it("한 장 스택·고르는 원칙·상태와 라이선스 읽는 법·읽는 법과 모든 영역을 번호 순서대로 그린다", () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/무엇으로 만들었고, 왜 그것을 골랐나/u);

    const overview = container.querySelector("#libraries-overview") as HTMLElement;
    expect(overview).toBeTruthy();
    expect(overview.querySelector(`figure[data-diagram="${LIBRARY_GUIDE_OVERVIEW.diagram.id}"]`)).toBeTruthy();
    const principles = within(overview).getByRole("heading", { level: 3, name: /원칙/u }).parentElement as HTMLElement;
    expect(principles.querySelectorAll("li")).toHaveLength(LIBRARY_GUIDE_OVERVIEW.principles.length);
    for (const principle of LIBRARY_GUIDE_OVERVIEW.principles) expect(principles.textContent).toContain(principle.title.ko);
    expect(overview.querySelector(".eng-legend")).toBeTruthy();
    // 상태 배지 읽는 법은 이 페이지 카드가 실제로 쓰는 상태의 뜻을 그대로 보여 주고, 라이선스가 법률 판단이 아님을 밝힌다.
    for (const status of ["live", "configured", "experimental", "reference-only"] as const) {
      expect(overview.textContent).toContain(ENGINEERING_STATUS_META[status].description.ko);
    }
    expect(overview.textContent).toContain("법률 판단이 아니라");
    for (const line of LIBRARY_GUIDE_OVERVIEW.howToRead) expect(overview.textContent).toContain(line.ko);

    // 영역 구획만 센다(영역 안의 '왜 이런 설계인가'·'라이브러리 카드' 구획은 `-why`·`-cards` 로 끝나는 id 를 가진다).
    const rendered = [...container.querySelectorAll<HTMLElement>(`${BODY} section[id]`)]
      .map((element) => element.id)
      .filter((id) => !/-(?:why|cards)$/u.test(id));
    expect(rendered).toEqual(LIBRARY_GUIDE_AREAS.map((area) => area.id));
  });

  it("영역마다 번호·제목·질문·한 줄 요약·쉬운 비유·도식·'왜 이런 설계인가'·라이브러리 카드를 같은 순서로 보여 준다", () => {
    const { container } = renderPage();
    for (const area of LIBRARY_GUIDE_AREAS) {
      const element = container.querySelector(`#${area.id}`) as HTMLElement;
      expect(element, area.id).toBeTruthy();
      expect(element.getAttribute("aria-labelledby")).toBe(`${area.id}-title`);
      const heading = element.querySelector(`#${area.id}-title`) as HTMLElement;
      expect(heading.tagName, area.id).toBe("H3");
      expect(heading.textContent).toContain(area.title.ko);
      expect(heading.textContent).toContain(String(area.number));
      for (const value of [area.question.ko, area.oneLine.ko, area.easy.ko]) expect(element.textContent, area.id).toContain(value);

      const figure = element.querySelector(`figure[data-diagram="${area.diagram.id}"]`) as HTMLElement;
      expect(figure, area.id).toBeTruthy();
      expect(figure.querySelector(".eng-dia__list-alt")?.textContent, area.id).toBe(area.diagram.alt.ko);

      const why = element.querySelector(`section#${area.id}-why`) as HTMLElement;
      // 영역마다 같은 소제목이 반복되므로 이름에 영역 제목을 함께 넣어 랜드마크 이름이 겹치지 않는다.
      expect(why.getAttribute("aria-labelledby"), area.id).toBe(`${area.id}-title ${area.id}-why-title`);
      expect(why.querySelectorAll("ol > li"), area.id).toHaveLength(area.designWhy.length);
      for (const choice of area.designWhy) expect(why.textContent).toContain(choice.title.ko);

      const cards = element.querySelectorAll(`li[id^="library-"]`);
      expect(cards, area.id).toHaveLength(area.libraries.length);
      expect([...cards].map((card) => card.id), area.id).toEqual(area.libraries.map((card) => `library-${card.id}`));
      if (area.pitfall) expect(element.textContent, area.id).toContain(area.pitfall.ko);

      // 도식 → 왜 이런 설계인가 → 라이브러리 카드 순서.
      const order = [figure, why, cards[0] as Element];
      for (let index = 1; index < order.length; index += 1) {
        const before = order[index - 1] as Element;
        const after = order[index] as Element;
        expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING, area.id).toBeTruthy();
      }
    }
  });

  it("이름이 붙은 구획(section) 랜드마크는 페이지 안에서 이름이 겹치지 않는다", () => {
    const { container } = renderPage();
    const names = [...container.querySelectorAll<HTMLElement>("section[aria-labelledby]")].map((section) =>
      (section.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/u)
        .map((id) => container.querySelector(`#${id}`)?.textContent?.replace(/\s+/gu, " ").trim() ?? "")
        .join(" "),
    );
    // 영역마다 구획 셋(영역·왜 이런 설계인가·라이브러리 카드)이 있으므로 이름이 충분히 모여야 한다.
    expect(names.length).toBeGreaterThanOrEqual(LIBRARY_GUIDE_AREAS.length * 3);
    expect(names.every((name) => name.length > 0)).toBe(true);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it("카드는 접힌 채로 이름·종류·상태·라이선스·한 줄 소개를 보여 주고, 펼치면 하는 일·이유·대안·대가·파일·근거·링크가 나온다", async () => {
    const { container } = renderPage();
    const card = findCard("hokusai");
    const element = container.querySelector(`#library-${card.id}`) as HTMLElement;
    const details = element.querySelector("details[data-eng-disclosure]") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    const summary = element.querySelector("summary") as HTMLElement;
    for (const value of [card.name, LIBRARY_KIND_LABELS[card.kind].ko, ENGINEERING_STATUS_META[card.status].label.ko, card.license, card.oneLine.ko]) {
      expect(summary.textContent, value).toContain(value);
    }

    details.open = true;
    for (const value of [card.usedFor.ko, card.why.ko, card.alternatives?.ko ?? "", card.cost.ko]) expect(element.textContent).toContain(value);
    for (const path of card.paths) expect(within(element).getAllByText(path).length, path).toBeGreaterThan(0);
    // 라이선스 근거: 패키지가 없으면 근거 파일을 그대로 적는다.
    expect(licenseBasis(card)).toEqual({ kind: "file", value: card.licenseSource });
    expect(within(element).getAllByText(card.licenseSource as string).length).toBeGreaterThan(0);

    const official = within(element).getByRole("link", { name: /Hokusai · 공식 사이트/u });
    expect(official.getAttribute("href")).toBe(externalLinkForName("Hokusai"));
    expect(official.getAttribute("rel")).toContain("noopener");
    const mapLink = element.querySelector(`[data-map-row-id="${card.mapRowId}"]`) as HTMLAnchorElement;
    expect(mapLink.getAttribute("href")).toBe(mapRowHref(card.mapRowId as string));

    const atlasId = card.atlasIds?.[0] as string;
    await waitFor(() => {
      expect(element.querySelector(`[data-atlas-id="${atlasId}"]`)?.textContent).toBe(`Atlas card ${atlasId}`);
    });
    expect(element.querySelector(`[data-atlas-id="${atlasId}"]`)?.getAttribute("href")).toBe(`/about/technology/atlas#${atlasId}`);
  });

  it("조건이 까다로운 라이선스(비상업·카피레프트·자체 라이선스)는 경고 표시와 글자로 함께 알린다", () => {
    const { container } = renderPage();
    const mixbox = container.querySelector("#library-mixbox summary") as HTMLElement;
    expect(mixbox.textContent).toContain("CC-BY-NC-4.0");
    expect(mixbox.textContent).toContain("조건 확인 필요");
    const chip = [...mixbox.querySelectorAll<HTMLElement>("span[title]")].find((item) => item.textContent?.includes("CC-BY-NC-4.0"));
    expect(chip?.getAttribute("title")).toContain("법률 판단을 하지 않고");

    const plain = container.querySelector("#library-hokusai summary") as HTMLElement;
    expect(plain.textContent).not.toContain("조건 확인 필요");

    for (const license of ["CC-BY-NC-4.0", "LGPL-2.1-only", "GPL-3.0-or-later", "AGPL-3.0", "MPL-2.0", "Remotion License"]) {
      expect(isLicenseCaution(license), license).toBe(true);
    }
    for (const license of ["MIT", "MIT OR Apache-2.0", "Apache-2.0 OR MIT", "BSD-3-Clause", "ISC", "Web standard", "Service terms", "Per-model terms"]) {
      expect(isLicenseCaution(license), license).toBe(false);
    }
  });

  it("공식 링크는 레지스트리에 있는 이름만 걸고, 여러 부품을 묶은 이름은 부품마다 찾는다", () => {
    expect(officialLinksForName("Vello · ThorVG").map((link) => link.name)).toEqual(["Vello", "ThorVG"]);
    expect(officialLinksForName("CanvasKit (Skia)")).toEqual([{ name: "CanvasKit", url: externalLinkForName("CanvasKit") }]);
    expect(officialLinksForName("Tailwind CSS · Radix UI · cmdk")).toHaveLength(3);
    expect(officialLinksForName("Paper.js · Rough.js · polygon-clipping")).toHaveLength(3);
    expect(officialLinksForName("React 19 · React Compiler").map((link) => link.name)).toEqual(["React 19"]);
    // 레지스트리에 없는 이름은 주소를 지어내지 않고 링크 없이 둔다.
    expect(officialLinksForName("Some Unknown Library")).toEqual([]);
    for (const card of allCards()) {
      for (const link of officialLinksForName(card.name)) expect(link.url.startsWith("https://"), `${card.id}: ${link.name}`).toBe(true);
    }
  });

  it("영역·카드 링크는 렌더 뒤에 이름으로 풀리고 올바른 주소로 이어진다", async () => {
    const { container } = renderPage();
    const first = LIBRARY_GUIDE_AREAS[0];
    if (!first) throw new Error("영역이 없음");
    const atlasId = first.atlasIds[0] as string;
    const chapterId = first.chapterIds[0] as string;
    const termId = first.glossaryIds[0] as string;

    // 영역 아래 "더 깊이 보기" 줄.
    const linkRow = `#${first.id} nav[aria-label="더 깊이 보기"]`;
    await waitFor(() => {
      expect(container.querySelector(`${linkRow} [data-atlas-id="${atlasId}"]`)?.textContent).toBe(`Atlas card ${atlasId}`);
    });
    expect(container.querySelector(`${linkRow} [data-atlas-id="${atlasId}"]`)?.getAttribute("href")).toBe(`/about/technology/atlas#${atlasId}`);
    // 챕터·용어 이름은 각각 따로 불러오므로 링크가 나타날 때까지 기다린 뒤 확인한다.
    await waitFor(() => {
      expect(container.querySelector(`${linkRow} [data-chapter-id="${chapterId}"]`)).toBeTruthy();
      expect(container.querySelector(`${linkRow} [data-glossary-id="${termId}"]`)).toBeTruthy();
    });
    const chapter = container.querySelector(`${linkRow} [data-chapter-id="${chapterId}"]`) as HTMLAnchorElement;
    expect(chapter.getAttribute("href")).toBe(`/about/technology/story#${chapterId}`);
    expect(chapter.textContent).toBe(PUBLISHED_ENGINEERING_CHAPTERS.find((item) => item.id === chapterId)?.title.ko);
    const term = container.querySelector(`${linkRow} [data-glossary-id="${termId}"]`) as HTMLAnchorElement;
    expect(term.getAttribute("href")).toBe(`/about/technology/glossary#glossary-${termId}`);
    expect(term.textContent).not.toBe(termId);
  });

  it("영역 이동 띠는 영역마다 링크를 두고, 모두 펼치기·접기가 라이브러리 카드를 한꺼번에 바꾼다", () => {
    const { container } = renderPage();
    const strip = screen.getByRole("navigation", { name: "구간 이동" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(LIBRARY_GUIDE_AREAS.map((area) => `#${area.id}`));
    for (const [index, link] of links.entries()) {
      const area = LIBRARY_GUIDE_AREAS[index];
      expect(link.getAttribute("aria-label")).toBe(`${area?.number}. ${area?.title.ko}`);
    }

    const all = () => [...container.querySelectorAll<HTMLDetailsElement>(`${BODY} details[data-eng-disclosure]`)];
    expect(all()).toHaveLength(allCards().length);
    expect(all().every((item) => !item.open)).toBe(true);
    fireEvent.click(within(strip).getByRole("button", { name: "모두 펼치기" }));
    expect(all().every((item) => item.open)).toBe(true);
    fireEvent.click(within(strip).getByRole("button", { name: "모두 접기" }));
    expect(all().every((item) => !item.open)).toBe(true);
  });

  it("영역 바로가기는 묶음 이름과 영역의 질문·라이브러리 수를 보여 주고 모든 영역이 정확히 한 묶음에 속한다", () => {
    renderPage();
    const map = screen.getAllByRole("navigation", { name: "영역 바로가기" })[0] as HTMLElement;
    for (const group of LIBRARY_AREA_GROUPS) expect(map.textContent).toContain(group.label.ko);
    for (const area of LIBRARY_GUIDE_AREAS) {
      const link = map.querySelector(`a[href="#${area.id}"]`) as HTMLElement;
      expect(link, area.id).toBeTruthy();
      expect(link.textContent).toContain(area.title.ko);
      expect(link.textContent).toContain(area.question.ko);
      expect(link.textContent).toContain(`라이브러리 ${area.libraries.length}개`);
    }
    const grouped = LIBRARY_AREA_GROUPS.flatMap((group) => group.areaIds);
    expect(grouped).toEqual(LIBRARY_GUIDE_AREAS.map((area) => area.id));
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("인쇄 직전에 접힌 카드를 모두 펼치고 인쇄 뒤에는 원래대로 되돌린다", () => {
    const { container } = renderPage();
    const all = () => [...container.querySelectorAll<HTMLDetailsElement>(`${BODY} details[data-eng-disclosure]`)];
    const second = all()[1] as HTMLDetailsElement;
    second.open = true; // 사용자가 직접 펼쳐 둔 것은 인쇄 뒤에도 펼친 채로 남는다.
    window.dispatchEvent(new Event("beforeprint"));
    expect(all().every((item) => item.open)).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect(all().filter((item) => item.open)).toEqual([second]);
  });

  it("주소의 #library-<카드> 앵커로 들어오면 그 카드를 펼치고, 영역 앵커는 카드를 펼치지 않는다", () => {
    window.history.replaceState(null, "", "#library-hokusai");
    const { container } = renderPage();
    const details = (id: string) => container.querySelector(`#${id} details[data-eng-disclosure]`) as HTMLDetailsElement;
    expect(details("library-hokusai").open).toBe(true);
    expect(details("library-perfect-freehand").open).toBe(false);
    expect(scrollIntoView).toHaveBeenCalled();

    window.history.replaceState(null, "", "#brush-engines");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(details("library-perfect-freehand").open).toBe(false);

    // 잘못 인코딩된 주소와 없는 카드는 예외 없이 지나간다.
    window.history.replaceState(null, "", "#library-%E0");
    expect(() => window.dispatchEvent(new HashChangeEvent("hashchange"))).not.toThrow();
    window.history.replaceState(null, "", "#library-does-not-exist");
    expect(() => window.dispatchEvent(new HashChangeEvent("hashchange"))).not.toThrow();
  });

  it("영어 화면에서는 한 장 요약과 모든 영역(카드를 펼친 상태)에 한글이 섞이지 않는다", async () => {
    useI18n.getState().setLang("en");
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/What it is built with, and why we chose it/u);
    for (const element of container.querySelectorAll<HTMLElement>(`#libraries-overview, ${BODY}`)) {
      for (const details of element.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")) details.open = true;
    }
    // 이름이 풀리는 링크 줄은 도감·챕터·용어 이름이 영어로 바뀐 뒤에 확인한다.
    await waitFor(() => {
      const chapter = container.querySelector("#brush-engines nav [data-chapter-id]") as HTMLElement;
      expect(chapter.textContent).not.toBe(chapter.getAttribute("data-chapter-id"));
    });
    for (const element of container.querySelectorAll<HTMLElement>(`#libraries-overview, ${BODY}`)) {
      const hangul = (element.textContent ?? "").match(HANGUL);
      expect(hangul, `${element.id || "body"}: 한글 "${hangul?.[0]}"`).toBeNull();
    }
    expect(container.querySelector("#brush-engines-title")?.textContent).toContain("Brush engines");
  });
});

describe("라이브러리 해설 화면 데이터", () => {
  it("라이선스 문구에 한글이 있으면 영어 짝을 표에 둔다", () => {
    for (const card of allCards()) {
      expect(licenseNeedsEnglish(card.license), `${card.id}: ${card.license}`).toBe(false);
      const text = localizedLicense(card.license);
      expect(HANGUL.test(text.en), `${card.id}: ${text.en}`).toBe(false);
    }
  });

  it("한 장 요약의 '패치 N개'는 pnpm-workspace.yaml 의 patchedDependencies 수와 같고 포크 2개가 실제로 있다", () => {
    const principle = LIBRARY_GUIDE_OVERVIEW.principles.find((item) => item.body.ko.includes("패치"));
    if (!principle) throw new Error("패치를 말하는 원칙이 없음");
    const count = patchedDependencyCount();
    expect(count).toBeGreaterThan(0);
    expect(principle.body.ko).toContain(`pnpm 패치 ${count}개`);
    expect(principle.body.en).toContain(`${count} pnpm patches`);
    // 포크: 벤더링한 wgpu-toon 과 override 로 바꿔 끼운 braces.
    expect(principle.body.ko).toContain("포크 2개");
    expect(repoPathExists("crates/vendor/wgpu-toon")).toBe(true);
    expect(repoPathExists("patches/braces")).toBe(true);
    expect(readFileSync("pnpm-workspace.yaml", "utf8")).toContain("file:patches/braces");
  });

  it("카드 id 는 앵커(library-<id>)로 쓰이므로 페이지 전체에서 고유하고 영역 id 와 겹치지 않는다", () => {
    const ids = allCards().map((card) => `library-${card.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    const areaIds = new Set(LIBRARY_GUIDE_AREAS.map((area) => area.id));
    for (const id of ids) expect(areaIds.has(id)).toBe(false);
  });
});
