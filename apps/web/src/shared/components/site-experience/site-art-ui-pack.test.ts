import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";
import {
  type ContextualSubNavGroupId,
  getSiteArtCard,
  ILLUSTRATED_SITE_CARD_LIST,
  SITE_ART_CARDS,
  resolveIllustratedCardForDomain,
  resolveSiteArtCardForPath,
  resolveIllustratedCardForRouteVisual,
  resolveIllustratedCardForSubNavGroup,
  type SiteDesignDomain,
} from "./site-art-ui-pack";

const WEB_PUBLIC_ROOT = resolve(__dirname, "../../../../public");
const MANIFEST_PATH = resolve(
  WEB_PUBLIC_ROOT,
  "assets/site-experience/site-art-v1/manifest.json",
);

function sha256File(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

describe("site-art-ui-pack", () => {
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

    expect(manifest.packId).toBe("site-art-v1");
    expect(manifest.version).toBe(1);
    expect(manifest.boards).toHaveLength(4);
    expect(manifest.cards).toHaveLength(16);
    expect(ILLUSTRATED_SITE_CARD_LIST).toHaveLength(16);

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
      const card = resolveIllustratedCardForDomain(domain);
      expect(SITE_ART_CARDS[card.cardId]).toBeDefined();
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
      const card = resolveIllustratedCardForRouteVisual(kind);
      expect(SITE_ART_CARDS[card.cardId]).toBeDefined();
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
      const card = resolveIllustratedCardForSubNavGroup(groupId);
      expect(SITE_ART_CARDS[card.cardId]).toBeDefined();
    }
  });

  it("resolves distinct signature cards across major site routes", () => {
    expect(resolveSiteArtCardForPath("/").cardId).toBe("nb-workflow-bridge");
    expect(resolveSiteArtCardForPath("/discover").cardId).toBe("nb-discover-spotlight");
    expect(resolveSiteArtCardForPath("/explore?genre=fantasy").cardId).toBe("nb-explore-spectrum");
    expect(resolveSiteArtCardForPath("/ranking").cardId).toBe("nb-ranking-constellation");
    expect(resolveSiteArtCardForPath("/calendar").cardId).toBe("nb-ranking-constellation");
    expect(resolveSiteArtCardForPath("/library").cardId).toBe("nb-library-archive");
    expect(resolveSiteArtCardForPath("/create").cardId).toBe("nb-create-canvas");
    expect(resolveSiteArtCardForPath("/studio").cardId).toBe("nb-create-canvas");
    expect(resolveSiteArtCardForPath("/story-lab").cardId).toBe("nb-planning-storylab");
    expect(resolveSiteArtCardForPath("/studio/3d").cardId).toBe("nb-spatial-stage");
    expect(resolveSiteArtCardForPath("/production").cardId).toBe("nb-production-control");
    expect(resolveSiteArtCardForPath("/market").cardId).toBe("nb-market-atelier");
    expect(resolveSiteArtCardForPath("/learn").cardId).toBe("nb-learn-academy");
    expect(resolveSiteArtCardForPath("/community").cardId).toBe("nb-community-plaza");
    expect(resolveSiteArtCardForPath("/showcase").cardId).toBe("nb-showcase-premiere");
    expect(resolveSiteArtCardForPath("/my-space").cardId).toBe("nb-manage-vault");
    expect(resolveSiteArtCardForPath("/fortune").cardId).toBe("nb-play-fortune");
    expect(resolveSiteArtCardForPath("/pricing").cardId).toBe("nb-trust-sanctuary");
  });

  it("keeps English copy free of Hangul and omits direct Illustrated model branding in user-facing copy", () => {
    const hangulRegex = /[가-힣]/u;
    const directBrandingRegex = /nano\s*banana|나노\s*바나나/iu;
    for (const card of ILLUSTRATED_SITE_CARD_LIST) {
      expect(getSiteArtCard(card.cardId)).toBe(card);
      expect(card.atelierModelLabel).not.toMatch(directBrandingRegex);
      expect(card.title.ko).not.toMatch(directBrandingRegex);
      expect(card.title.en).not.toMatch(hangulRegex);
      expect(card.title.en).not.toMatch(directBrandingRegex);
      expect(card.subtitle.ko).not.toMatch(directBrandingRegex);
      expect(card.subtitle.en).not.toMatch(hangulRegex);
      expect(card.subtitle.en).not.toMatch(directBrandingRegex);
      expect(card.stageBadge.ko).not.toMatch(directBrandingRegex);
      expect(card.stageBadge.en).not.toMatch(hangulRegex);
      expect(card.stageBadge.en).not.toMatch(directBrandingRegex);
      for (const chip of card.quickChips) {
        expect(chip.ko).not.toMatch(directBrandingRegex);
        expect(chip.en).not.toMatch(hangulRegex);
        expect(chip.en).not.toMatch(directBrandingRegex);
      }
      expect(card.lenses).toHaveLength(3);
      const previewIds = new Set(card.lenses.map((lens) => lens.previewCardId));
      expect(previewIds.size).toBe(3);
      for (const lens of card.lenses) {
        expect(lens.previewCardId).toBeDefined();
        expect(
          SITE_ART_CARDS[
            lens.previewCardId as keyof typeof SITE_ART_CARDS
          ],
        ).toBeDefined();
        expect(lens.label.ko).not.toMatch(directBrandingRegex);
        expect(lens.label.ko).not.toMatch(/창작 레시피|AI 키 볼트/u);
        expect(lens.label.en).not.toMatch(hangulRegex);
        expect(lens.label.en).not.toMatch(directBrandingRegex);
        expect(lens.headline.ko).not.toMatch(directBrandingRegex);
        expect(lens.headline.en).not.toMatch(hangulRegex);
        expect(lens.headline.en).not.toMatch(directBrandingRegex);
        expect(lens.detail.ko).not.toMatch(directBrandingRegex);
        expect(lens.detail.en).not.toMatch(hangulRegex);
        expect(lens.detail.en).not.toMatch(directBrandingRegex);
        expect(lens.promptSeed.en).not.toMatch(hangulRegex);
        expect(lens.ctaLabel.ko).not.toMatch(directBrandingRegex);
        expect(lens.ctaLabel.en).not.toMatch(hangulRegex);
        expect(lens.ctaLabel.en).not.toMatch(directBrandingRegex);
      }
    }
  });
});
