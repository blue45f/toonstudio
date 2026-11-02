// @vitest-environment jsdom

import { createHash } from "node:crypto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MARKET_KINDS } from "../models/market-kind";

import { MarketMultiKindManifestBuilder } from "./MarketMultiKindManifestBuilder";

import {
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
} from "@/shared/lib/creator-marketplace-resource-contract";

afterEach(cleanup);

describe("MarketMultiKindManifestBuilder", () => {
  it("내장 참조 manifest의 해시를 서버 게시 계약의 정규 JSON과 일치시킨다", () => {
    const onApply = vi.fn();
    render(
      <MemoryRouter>
        <MarketMultiKindManifestBuilder onApplyManifest={onApply} />
      </MemoryRouter>,
    );

    const builtinKinds = MARKET_KINDS.filter((meta) =>
      meta.kind === "asset" || meta.kind === "3d-preset" || meta.kind === "3d-asset",
    );
    for (const meta of builtinKinds) {
      fireEvent.click(screen.getByRole("button", { name: meta.label }));
      fireEvent.change(screen.getByLabelText("전달 모드"), {
        target: { value: "builtin-ref" },
      });
      fireEvent.click(screen.getByRole("button", { name: "공개 Manifest JSON에 반영" }));
    }

    expect(onApply).toHaveBeenCalledTimes(3);
    for (const [json] of onApply.mock.calls as [string, string][]) {
      const manifest = CreatorMarketplaceResourceManifestSchema.parse(JSON.parse(json));
      const delivery = manifest.entries[0].delivery;
      expect(delivery.mode).toBe("builtin-ref");
      if (delivery.mode !== "builtin-ref") throw new Error("내장 참조 전달이 필요합니다.");
      const canonicalContent = canonicalizeCreatorMarketplaceJson({
        mode: "builtin-ref",
        runtimeRef: delivery.runtimeRef,
      });
      expect(delivery.sha256).toBe(createHash("sha256").update(canonicalContent).digest("hex"));
    }
  });

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
