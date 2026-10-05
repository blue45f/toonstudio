// @vitest-environment jsdom
/**
 * S4-03 Poly Haven 카테고리 탐색 회귀 테스트.
 *
 * 계약: 검색 전 구성은 HDRI·텍스처·3D 모델 카테고리 행(대표 타일 4장씩)이며,
 * 타일은 종류별 실제 검색 결과로만 만든다. 종류는 서버가 설명 끝 메타 구간에
 * 합성한 라벨을 복원해 판별하고, 종류 검색에 섞인 다른 종류 자료는 행에
 * 넣지 않는다. 실자료가 4장에 못 미치거나 API가 없으면 행을 만들지 않고,
 * 세 행 모두 없으면 정직한 빈 상태로 떨어진다. 결과 카드에는 종류 배지
 * (좌상단)와 HDRI 2:1 타일을 Poly Haven 표면에만 적용한다.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolyHavenPage } from "./ResourceSearchPage";
import { polyHavenKindOf } from "./polyhaven-resource";

import type { CreatorResource } from "@/shared/lib/creator-resources";

const request = vi.fn<typeof fetch>();

type Kind = "hdri" | "texture" | "model";

/* 서버 provider(polyhaven-provider.ts normalize)의 설명 합성을 그대로 흉내 낸다:
   [원문 설명, "종류 · 분류 · 해상도 · (폴리곤) · 태그"].join(" · ") */
const META: Record<Kind, string> = {
  hdri: "HDRI · outdoor · 최대 8K · 태그 sky, clouds",
  texture: "텍스처 · concrete · 최대 8K · 태그 wall, rough",
  model: "3D 모델 · furniture · 최대 4K · 폴리곤 12,345 · 태그 chair, wood",
};

function polyItem(slug: string, kind: Kind, extra: Partial<CreatorResource> = {}): CreatorResource {
  return {
    id: `polyhaven:${slug}`,
    provider: "polyhaven",
    title: `자료 ${slug}`,
    creator: "Poly Haven 작가",
    description: `원문 설명 ${slug} · ${META[kind]}`,
    sourceUrl: `https://polyhaven.com/a/${slug}`,
    license: "CC0",
    licenseUrl: "",
    credit: "Poly Haven",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    imageUrl: `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png`,
    ...extra,
  };
}

function searchResponse(status: string, items: CreatorResource[]) {
  return Response.json({ provider: "polyhaven", page: 1, status, items, hasMore: false, message: "공식 제공처 응답", fetchedAt: "2026-10-05T00:00:00.000Z" });
}

/* 종류 검색에 다른 종류가 섞이는 경우까지 재현한다: HDRI 검색 응답의 텍스처는
   원문 설명에 "HDRI"가 들어 있어도 메타 꼬리가 텍스처라 행에서 걸러져야 한다. */
const STRAY_TEXTURE = polyItem("stray", "texture", {
  title: "HDRI 배경용 텍스처",
  description: "HDRI 배경에 함께 쓰는 타일 · 텍스처 · fabric · 최대 4K",
});

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  const parsed = new URL(url, "https://local.test");
  if (parsed.searchParams.get("provider") !== "polyhaven") return Promise.resolve(Response.json({}));
  const q = parsed.searchParams.get("q") ?? "";
  if (q === "HDRI") return Promise.resolve(searchResponse("ready", [1, 2, 3, 4].map((n) => polyItem(`hdri-${n}`, "hdri")).concat(STRAY_TEXTURE)));
  if (q === "텍스처") return Promise.resolve(searchResponse("ready", [1, 2, 3, 4].map((n) => polyItem(`texture-${n}`, "texture"))));
  if (q === "3D 모델") return Promise.resolve(searchResponse("ready", [1, 2, 3].map((n) => polyItem(`model-${n}`, "model"))));
  if (q === "chair") return Promise.resolve(searchResponse("ready", [
    polyItem("card-hdri", "hdri"),
    polyItem("card-texture", "texture"),
    polyItem("card-plain", "hdri", { description: "메타 없는 원문 설명" }),
  ]));
  return Promise.resolve(searchResponse("ready", []));
}

function unavailableFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
  return Promise.resolve(searchResponse("not_configured", []));
}

function searchCalls(q: string): number {
  return request.mock.calls
    .map((call) => new URL(String(call[0]), "https://local.test"))
    .filter((url) => url.pathname.includes("/api/creator-resources/search") && url.searchParams.get("provider") === "polyhaven" && url.searchParams.get("q") === q)
    .length;
}

const mount = (path = "/research/3d-assets") =>
  render(<MemoryRouter initialEntries={[path]}><PolyHavenPage /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("종류 분류기 (서버 설명 메타 복원)", () => {
  it("종류별 메타 꼬리에서 종류를 복원한다", () => {
    expect(polyHavenKindOf(polyItem("a", "hdri"))).toBe("hdri");
    expect(polyHavenKindOf(polyItem("b", "texture"))).toBe("texture");
    expect(polyHavenKindOf(polyItem("c", "model"))).toBe("model");
  });

  it("원문 설명에 다른 종류 단어가 있어도 메타 꼬리가 우선한다", () => {
    expect(polyHavenKindOf(STRAY_TEXTURE)).toBe("texture");
  });

  it("메타가 없으면 추측하지 않고 null을 돌려준다", () => {
    expect(polyHavenKindOf(polyItem("d", "hdri", { description: "메타 없는 원문 설명" }))).toBeNull();
    expect(polyHavenKindOf({ ...polyItem("e", "hdri"), provider: "met" as CreatorResource["provider"] })).toBeNull();
  });
});

describe("검색 전 카테고리 행 (S4-03)", () => {
  it("HDRI·텍스처 행을 실자료 4장씩 만들고, 3장뿐인 3D 모델 행은 만들지 않는다", async () => {
    mount();
    const hdriSection = await screen.findByRole("region", { name: "HDRI 대표 자료" }, { timeout: 10000 });
    expect(await within(hdriSection).findAllByRole("button", undefined, { timeout: 10000 })).toHaveLength(4);
    const textureSection = await screen.findByRole("region", { name: "텍스처 대표 자료" }, { timeout: 10000 });
    expect(await within(textureSection).findAllByRole("button", undefined, { timeout: 10000 })).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "3D 모델 대표 자료" })).toBeNull();
    // 종류 검색에 섞인 텍스처는 HDRI 행에 들어가지 않는다
    expect(screen.queryByRole("button", { name: /HDRI 배경용 텍스처/u })).toBeNull();
  });

  it("HDRI 타일은 2:1 파노라마, 텍스처 타일은 4:3 비율을 쓰고 종류 배지를 좌상단에 단다", async () => {
    mount();
    const hdriSection = await screen.findByRole("region", { name: "HDRI 대표 자료" }, { timeout: 10000 });
    const hdriTile = (await within(hdriSection).findAllByRole("button", undefined, { timeout: 10000 }))[0];
    expect(hdriTile.querySelector("span.relative")?.className).toContain("aspect-[2/1]");
    expect(hdriTile.querySelector("span.left-3")?.textContent).toBe("HDRI");
    const textureSection = await screen.findByRole("region", { name: "텍스처 대표 자료" }, { timeout: 10000 });
    const textureTile = (await within(textureSection).findAllByRole("button", undefined, { timeout: 10000 }))[0];
    expect(textureTile.querySelector("span.relative")?.className).toContain("aspect-[4/3]");
    expect(textureTile.querySelector("span.left-3")?.textContent).toBe("텍스처");
  });

  it("타일을 누르면 같은 종류 검색을 실행한다", async () => {
    mount();
    const hdriSection = await screen.findByRole("region", { name: "HDRI 대표 자료" }, { timeout: 10000 });
    const tiles = await within(hdriSection).findAllByRole("button", undefined, { timeout: 10000 });
    expect(searchCalls("HDRI")).toBe(1);
    fireEvent.click(tiles[0]);
    await waitFor(() => expect(searchCalls("HDRI")).toBe(2), { timeout: 10000 });
    expect(await screen.findByRole("heading", { name: "자료 hdri-2" }, { timeout: 10000 })).toBeTruthy();
  });

  it("세 카테고리 모두 자료를 확인하지 못하면 타일을 위장하지 않고 빈 상태로 떨어진다", async () => {
    request.mockImplementation(unavailableFetch);
    mount();
    expect(await screen.findByText(/추천 키워드로 바로 검색해 보세요/u, undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /대표 자료/u })).toBeNull();
    // 카테고리 확인을 시도했으므로 "검색할 때만 호출" 안내는 붙지 않는다
    expect(screen.queryByText(/외부 API는 검색할 때만 호출합니다/u)).toBeNull();
  });
});

describe("검색 결과 카드 (S4-03)", () => {
  it("종류가 확인된 카드에만 좌상단 배지를 달고 HDRI 카드만 2:1 타일을 쓴다", async () => {
    mount("/research/3d-assets?q=chair&page=1");
    const hdriCard = (await screen.findByRole("heading", { name: "자료 card-hdri" }, { timeout: 10000 })).closest("article");
    expect(hdriCard?.querySelector("span.left-3")?.textContent).toBe("HDRI");
    expect(hdriCard?.querySelector("div.relative")?.className).toContain("aspect-[2/1]");
    // 타일 이미지는 한 장만 렌더한다 (장식 추가로 표현식이 중복되지 않는다)
    expect(hdriCard?.querySelectorAll("img")).toHaveLength(1);
    const textureCard = (await screen.findByRole("heading", { name: "자료 card-texture" }, { timeout: 10000 })).closest("article");
    expect(textureCard?.querySelector("span.left-3")?.textContent).toBe("텍스처");
    expect(textureCard?.querySelector("div.relative")?.className).toContain("aspect-[4/3]");
    const plainCard = (await screen.findByRole("heading", { name: "자료 card-plain" }, { timeout: 10000 })).closest("article");
    expect(plainCard?.querySelector("span.left-3")).toBeNull();
    expect(plainCard?.querySelector("div.relative")?.className).toContain("aspect-[4/3]");
  });
});
