// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  evaluateMarketProductionFit,
  mergeMarketProductionProfile,
} from "../models/market-production-fit";

import { MarketFitScenePreview } from "./MarketFitScenePreview";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

const completeProfile = mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
  studioVersion: "1.4.0",
});

function paletteRecord(): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    packageId: "original/palette/noir-blossom",
    name: "느와르 블라썸 팔레트",
    description: "밤의 도시 무드 팔레트",
    kind: "palette",
    resourceVersion: "1.1.0",
    minimumStudioVersion: "1.0.0",
    tags: ["야경"],
    license: "cc0-1.0",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: "palette/noir-blossom",
      kind: "palette",
      name: "느와르 블라썸",
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonstudio.palette+json",
        payload: {
          schemaVersion: 1,
          resourceKind: "palette",
          runtime: "studio-palette-v1",
          definition: { colors: ["#1a1a2e", "#e94560"] },
        },
        byteSize: 80,
        sha256: "a".repeat(64),
      },
    }],
    id: "123e4567-e89b-42d3-a456-426614174000",
    manifestHash: "b".repeat(64),
    manifestByteSize: 256,
    publisher: { id: "author-1", name: "테스트 작가", avatar: null },
    createdAt: "2026-07-27T01:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
    isOwner: false,
    access: "free",
  } as CreatorMarketplaceResourceRecord;
}

function filterRecord(): CreatorMarketplaceResourceRecord {
  return {
    ...paletteRecord(),
    packageId: "original/filter/moonlight",
    name: "문라이트 필터",
    kind: "filter",
    entries: [{
      id: "filter/moonlight",
      kind: "filter",
      name: "문라이트",
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonstudio.filter+json",
        payload: {
          schemaVersion: 1,
          resourceKind: "filter",
          runtime: "studio-filter-v1",
          definition: {
            engine: "css-filter",
            values: { brightness: 1.1, saturate: 0.8 },
          },
        },
        byteSize: 96,
        sha256: "c".repeat(64),
      },
    }],
  } as CreatorMarketplaceResourceRecord;
}

afterEach(() => {
  cleanup();
});

describe("MarketFitScenePreview", () => {
  it("layers the marketplace cover over the default real scene and shows the fit reason", () => {
    const record = paletteRecord();
    const evaluation = evaluateMarketProductionFit(record, completeProfile);
    const { container } = render(
      <MarketFitScenePreview record={record} evaluation={evaluation} />,
    );

    expect(screen.getByRole("heading", { name: "장면에 올려보기" })).toBeTruthy();
    expect(screen.getByText("느와르 블라썸 팔레트")).toBeTruthy();
    expect(screen.getByText(/상업 작품 사용이 허용된 사용권입니다/)).toBeTruthy();

    const stage = screen.getByRole("img", { name: /합성 미리보기/ });
    const baseImage = stage.querySelector("img");
    expect(baseImage?.getAttribute("src"))
      .toBe("/assets/studio/backgrounds/webtoon_creator_room.png");

    const coverLayer = screen.getByTestId("fit-scene-cover-layer");
    expect(coverLayer.style.opacity).toBe("0.65");
    expect(container.querySelectorAll("img")).not.toHaveLength(0);
  });

  it("swaps the background scene image from the picker", () => {
    const record = paletteRecord();
    const evaluation = evaluateMarketProductionFit(record, completeProfile);
    render(<MarketFitScenePreview record={record} evaluation={evaluation} />);

    const neonChip = screen.getByRole("button", { name: /네온 골목/ });
    fireEvent.click(neonChip);

    expect(neonChip.getAttribute("aria-pressed")).toBe("true");
    const stage = screen.getByRole("img", { name: /합성 미리보기/ });
    expect(stage.querySelector("img")?.getAttribute("src"))
      .toBe("/assets/studio/backgrounds/webtoon_neon_alley.png");
  });

  it("drives the overlay opacity and size from the sliders", () => {
    const record = paletteRecord();
    const evaluation = evaluateMarketProductionFit(record, completeProfile);
    render(<MarketFitScenePreview record={record} evaluation={evaluation} />);

    fireEvent.change(screen.getByLabelText(/에셋 투명도/), { target: { value: "30" } });
    expect(screen.getByTestId("fit-scene-cover-layer").style.opacity).toBe("0.3");

    fireEvent.change(screen.getByLabelText(/레이어 크기/), { target: { value: "50" } });
    const coverBox = screen.getByTestId("fit-scene-cover-layer").firstElementChild;
    expect((coverBox as HTMLElement | null)?.style.width).toBe("50%");
  });

  it("applies a filter resource's real parameters to the scene image itself", () => {
    const record = filterRecord();
    const evaluation = evaluateMarketProductionFit(record, completeProfile);
    render(<MarketFitScenePreview record={record} evaluation={evaluation} />);

    const filterLayer = screen.getByTestId("fit-scene-filter-layer");
    expect(filterLayer.getAttribute("src"))
      .toBe("/assets/studio/backgrounds/webtoon_creator_room.png");
    expect(filterLayer.style.filter).toBe("brightness(1.1) saturate(0.8)");
    expect(filterLayer.style.opacity).toBe("0.65");
    expect(screen.queryByTestId("fit-scene-cover-layer")).toBeNull();
    expect(screen.queryByLabelText(/레이어 크기/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/에셋 투명도/), { target: { value: "90" } });
    expect(filterLayer.style.opacity).toBe("0.9");
  });
});
