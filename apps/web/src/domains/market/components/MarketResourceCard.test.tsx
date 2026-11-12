// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketResourceCard } from "./MarketResourceCard";

import type { CreatorMarketplaceResourceManifest } from "@/shared/lib/creator-marketplace-resource-contract";

import { createCreatorMarketplacePortableDelivery } from "@/platform/creator-marketplace-client";

const wishlist = vi.hoisted(() => ({ toggle: vi.fn(), error: "" }));
vi.mock("../hooks/use-market-wishlist", () => ({
  useMarketWishlist: () => ({
    isWishlisted: () => false,
    toggleWishlist: wishlist.toggle,
    storageError: wishlist.error,
  }),
}));
vi.mock("../hooks/use-commerce-config", () => ({
  useCommerceConfig: () => ({ config: null, isPaidMode: false }),
}));

afterEach(() => { cleanup(); wishlist.toggle.mockClear(); wishlist.error = ""; });

async function manifest(): Promise<CreatorMarketplaceResourceManifest> {
  const delivery = await createCreatorMarketplacePortableDelivery("palette", {
    colors: ["#1a1a2e", "#e94560"],
  });
  return {
    schemaVersion: 1,
    packageId: "original/palette/noir-blossom",
    name: "느와르 블라썸 팔레트",
    description: "밤의 도시 무드 팔레트",
    kind: "palette",
    resourceVersion: "1.1.0",
    minimumStudioVersion: "0.1.0",
    tags: ["야경", "느와르"],
    license: "cc-by-4.0",
    attributionText: "© 테스트 작가",
    containsAi: false,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: "palette/noir-blossom",
      kind: "palette",
      name: "느와르 블라썸",
      delivery,
    }],
  };
}

describe("MarketResourceCard", () => {
  it("표지·이름·가격·이용 조건을 먼저 보여주고 상세에 필요한 맥락을 보존한다", async () => {
    const input = await manifest();
    const record = {
      ...input,
      id: "123e4567-e89b-42d3-a456-426614174000",
      manifestHash: "a".repeat(64),
      manifestByteSize: 256,
      publisher: { id: "author-1", name: "테스트 작가", avatar: null },
      createdAt: "2026-07-27T01:00:00.000Z",
      updatedAt: "2026-08-01T01:00:00.000Z",
      isOwner: false,
      access: "free" as const,
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MarketResourceCard record={record} />
      </MemoryRouter>
    );

    expect(html).toContain("PALETTE");
    expect(html).toContain("느와르 블라썸 팔레트");
    expect(html).toContain("테스트 작가");
    expect(html).toContain("CC BY 4.0");
    // 라이선스 이름과 전체 요약은 기본 카드에서 직접 읽을 수 있다.
    // SSR에서는 상거래 설정이 아직 없어 무료 운영 기본값 → "무료" 배지.
    expect(html).toContain('data-market-license-badge="true"');
    expect(html).toContain('data-market-price="free"');
    expect(html).toContain("무료");
    expect(html).toContain("aspect-[16/10]");
    expect(html).not.toContain("유료 운영");
    expect(html).not.toContain("#야경");
    expect(html).toContain(`href="/market/resource/${record.id}"`);
    expect(html).toContain("적용 전 확인");
    expect(html).not.toContain("6/7");
    expect(html).toContain("bg-canvas");
    expect(html).toContain("bg-accent");
    expect(html).toContain("text-on-accent");
    expect(html).toContain("찜하기");
    expect(html).not.toContain("비교 목록에 추가");
    expect(html).not.toContain('data-market-rights-bom="true"');
    expect(html).not.toContain("Rights BOM");
    expect(html).not.toContain("원고 위 시험 (Fit Lab)");
    expect(html).toContain("min-h-12");
    expect(html).toContain("호환 정보 있음");
    expect(html).toContain("AI 미포함 공개");
    expect(html).not.toContain("256 B");
    expect(html).toContain("저작자 표시 조건으로 상업 이용·수정·재배포 가능");
    expect(html).toContain("자세히");
    expect(html).toContain(`href="/market/creator/${record.publisher.id}"`);
    expect(html).not.toContain(">4.9<");
    expect(html).not.toContain("공식 인증 배급자");
    expect(html).not.toContain("text-white");
    expect(html).not.toContain("text-black");

    const brushHtml = renderToStaticMarkup(
      <MemoryRouter>
        <MarketResourceCard
          record={{
            ...record,
            kind: "brush",
            entries: record.entries.map((entry) => ({ ...entry, kind: "brush" as const })),
          }}
        />
      </MemoryRouter>,
    );
    expect(brushHtml).toContain("var(--color-card)");
    expect(brushHtml).toContain("var(--color-canvas)");
  });

  it("단일 미리보기와 찜 행동이 원래 리소스를 전달하고 보관 실패를 알린다", async () => {
    const input = await manifest();
    const record = {
      ...input,
      id: "123e4567-e89b-42d3-a456-426614174000",
      manifestHash: "a".repeat(64), manifestByteSize: 256,
      publisher: { id: "author-1", name: "테스트 작가", avatar: null },
      createdAt: "2026-07-27T01:00:00.000Z", updatedAt: "2026-08-01T01:00:00.000Z",
      isOwner: false, access: "free" as const,
    };
    wishlist.error = "이 브라우저에서 찜 목록을 저장하지 못했습니다.";
    const preview = vi.fn();
    render(<MemoryRouter><MarketResourceCard record={record} onQuickPreview={preview} /></MemoryRouter>);
    const previews = screen.getAllByRole("button", { name: `${record.name} 미리보기` });
    expect(previews).toHaveLength(1);
    fireEvent.click(previews[0]); expect(preview).toHaveBeenCalledTimes(1); expect(preview).toHaveBeenCalledWith(record);
    fireEvent.click(screen.getByRole("button", { name: `${record.name} 찜하기` }));
    expect(wishlist.toggle).toHaveBeenCalledTimes(1); expect(wishlist.toggle).toHaveBeenCalledWith(record);
    expect(screen.getByRole("alert").textContent).toBe(wishlist.error);
    expect(screen.getByRole("link", { name: `${record.name} 자세히 보기` }).getAttribute("href"))
      .toBe(`/market/resource/${record.id}`);
  });
});
