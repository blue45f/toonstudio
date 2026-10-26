import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";
import {
  type ContextualSubNavGroupId,
  getNanoBananaSiteCard,
  NANO_BANANA_SITE_CARD_LIST,
  NANO_BANANA_SITE_CARDS,
  resolveNanoBananaCardForDomain,
  resolveNanoBananaCardForPath,
  resolveNanoBananaCardForRouteVisual,
  resolveNanoBananaCardForSubNavGroup,
  type SiteDesignDomain,
} from "./nano-banana-site-ui-pack";

const WEB_PUBLIC_ROOT = resolve(__dirname, "../../../../public");
const MANIFEST_PATH = resolve(
  WEB_PUBLIC_ROOT,
  "assets/site-experience/nano-banana-site-v1/manifest.json",
);

function sha256File(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

describe("nano-banana-site-ui-pack", () => {
  it("verifies manifest.json and all 16 card + 4 master WebP files on disk with SHA-256 integrity", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as {
      packId: string;
      version: number;
      boards: Array<{ boardId: string; src: string; sha256: string }>;
      cards: Array<{
        cardId: string;
        src640: string;
        src320: string;
        sha256_640: string;
        sha256_320: string;
      }>;
    };

    expect(manifest.packId).toBe("nano-banana-site-v1");
    expect(manifest.version).toBe(1);
    expect(manifest.boards).toHaveLength(4);
    expect(manifest.cards).toHaveLength(16);
    expect(NANO_BANANA_SITE_CARD_LIST).toHaveLength(16);

    for (const board of manifest.boards) {
      const diskPath = resolve(WEB_PUBLIC_ROOT, board.src.replace(/^\//u, ""));
      expect(existsSync(diskPath)).toBe(true);
      expect(sha256File(diskPath)).toBe(board.sha256);
      expect(statSync(diskPath).size).toBeLessThan(200_000);
    }

    for (const card of manifest.cards) {
      const disk640 = resolve(WEB_PUBLIC_ROOT, card.src640.replace(/^\//u, ""));
      const disk320 = resolve(WEB_PUBLIC_ROOT, card.src320.replace(/^\//u, ""));
      expect(existsSync(disk640)).toBe(true);
      expect(existsSync(disk320)).toBe(true);
      expect(sha256File(disk640)).toBe(card.sha256_640);
      expect(sha256File(disk320)).toBe(card.sha256_320);
      expect(statSync(disk640).size).toBeLessThan(120_000);
      expect(statSync(disk320).size).toBeLessThan(60_000);
    }
  });

  it("maps all 15 SiteDesignDomains, 14 SiteRouteVisualKinds, and 6 ContextualSubNavGroups", () => {
    const domains: SiteDesignDomain[] = [
      "workflow",
      "create",
      "planning",
      "spatial",
      "production",
      "discover",
      "learn",
      "market",
      "community",
      "showcase",
      "manage",
      "play",
      "trust",
      "workspace",
      "admin",
    ];
    for (const domain of domains) {
      const card = resolveNanoBananaCardForDomain(domain);
      expect(NANO_BANANA_SITE_CARDS[card.cardId]).toBeDefined();
    }

    const visualKinds: SiteRouteVisualKind[] = [
      "workflow",
      "discover",
      "create",
      "planning",
      "spatial",
      "assets",
      "production",
      "review",
      "publish",
      "learn",
      "connect",
      "manage",
      "trust",
      "play",
    ];
    for (const kind of visualKinds) {
      const card = resolveNanoBananaCardForRouteVisual(kind);
      expect(NANO_BANANA_SITE_CARDS[card.cardId]).toBeDefined();
    }

    const subNavGroups: ContextualSubNavGroupId[] = [
      "discover",
      "create",
      "production",
      "ecosystem",
      "academy",
      "personal",
    ];
    for (const groupId of subNavGroups) {
      const card = resolveNanoBananaCardForSubNavGroup(groupId);
      expect(NANO_BANANA_SITE_CARDS[card.cardId]).toBeDefined();
    }
  });

  it("resolves distinct signature cards across major site routes", () => {
    expect(resolveNanoBananaCardForPath("/").cardId).toBe("nb-workflow-bridge");
    expect(resolveNanoBananaCardForPath("/discover").cardId).toBe("nb-discover-spotlight");
    expect(resolveNanoBananaCardForPath("/explore?genre=fantasy").cardId).toBe("nb-explore-spectrum");
    expect(resolveNanoBananaCardForPath("/ranking").cardId).toBe("nb-ranking-constellation");
    expect(resolveNanoBananaCardForPath("/calendar").cardId).toBe("nb-ranking-constellation");
    expect(resolveNanoBananaCardForPath("/library").cardId).toBe("nb-library-archive");
    expect(resolveNanoBananaCardForPath("/create").cardId).toBe("nb-create-canvas");
    expect(resolveNanoBananaCardForPath("/studio").cardId).toBe("nb-create-canvas");
    expect(resolveNanoBananaCardForPath("/story-lab").cardId).toBe("nb-planning-storylab");
    expect(resolveNanoBananaCardForPath("/studio/3d").cardId).toBe("nb-spatial-stage");
    expect(resolveNanoBananaCardForPath("/production").cardId).toBe("nb-production-control");
    expect(resolveNanoBananaCardForPath("/market").cardId).toBe("nb-market-atelier");
    expect(resolveNanoBananaCardForPath("/learn").cardId).toBe("nb-learn-academy");
    expect(resolveNanoBananaCardForPath("/community").cardId).toBe("nb-community-plaza");
    expect(resolveNanoBananaCardForPath("/showcase").cardId).toBe("nb-showcase-premiere");
    expect(resolveNanoBananaCardForPath("/my-space").cardId).toBe("nb-manage-vault");
    expect(resolveNanoBananaCardForPath("/fortune").cardId).toBe("nb-play-fortune");
    expect(resolveNanoBananaCardForPath("/pricing").cardId).toBe("nb-trust-sanctuary");
  });

  it("keeps English copy free of Hangul across all 16 cards and 48 interactive lenses", () => {
    const hangulRegex = /[가-힣]/u;
    for (const card of NANO_BANANA_SITE_CARD_LIST) {
      expect(getNanoBananaSiteCard(card.cardId)).toBe(card);
      expect(card.title.en).not.toMatch(hangulRegex);
      expect(card.subtitle.en).not.toMatch(hangulRegex);
      expect(card.stageBadge.en).not.toMatch(hangulRegex);
      for (const chip of card.quickChips) {
        expect(chip.en).not.toMatch(hangulRegex);
      }
      expect(card.lenses).toHaveLength(3);
      for (const lens of card.lenses) {
        expect(lens.label.en).not.toMatch(hangulRegex);
        expect(lens.headline.en).not.toMatch(hangulRegex);
        expect(lens.detail.en).not.toMatch(hangulRegex);
        expect(lens.promptSeed.en).not.toMatch(hangulRegex);
        expect(lens.ctaLabel.en).not.toMatch(hangulRegex);
      }
    }
  });
});
