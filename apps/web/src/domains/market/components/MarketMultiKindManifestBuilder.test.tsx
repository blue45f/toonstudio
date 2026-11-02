// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MARKET_KINDS } from "../models/market-kind";

import { MarketMultiKindManifestBuilder } from "./MarketMultiKindManifestBuilder";

import { CreatorMarketplaceResourceManifestSchema } from "@/shared/lib/creator-marketplace-resource-contract";

afterEach(cleanup);

describe("MarketMultiKindManifestBuilder", () => {
  it("builds contract-valid public manifests across all 7 marketplace resource kinds and opens quality/recipe panels", () => {
    const onApply = vi.fn();
    render(
      <MemoryRouter>
        <MarketMultiKindManifestBuilder onApplyManifest={onApply} />
      </MemoryRouter>,
    );

    for (const meta of MARKET_KINDS) {
      fireEvent.click(screen.getByRole("button", { name: meta.label }));
      fireEvent.click(screen.getByRole("button", { name: "공개 Manifest JSON에 반영" }));
    }

    expect(onApply).toHaveBeenCalledTimes(7);
    for (const [json] of onApply.mock.calls as [string, string][]) {
      const parsed = CreatorMarketplaceResourceManifestSchema.safeParse(JSON.parse(json));
      expect(parsed.success).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "브러시" }));
    fireEvent.click(screen.getByRole("button", { name: "품질 시나리오·레시피 열기" }));
    expect(screen.getByTestId("market-asset-quality-matrix")).toBeTruthy();
    expect(screen.getByTestId("market-brush-recipe-lab")).toBeTruthy();
  });
});
