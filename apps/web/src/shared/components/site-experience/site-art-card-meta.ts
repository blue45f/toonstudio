import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";

export type SiteArtCardId =
  | "nb-discover-spotlight" | "nb-explore-spectrum" | "nb-ranking-constellation" | "nb-library-archive"
  | "nb-create-canvas" | "nb-planning-storylab" | "nb-spatial-stage" | "nb-production-control"
  | "nb-market-atelier" | "nb-learn-academy" | "nb-community-plaza" | "nb-showcase-premiere"
  | "nb-workflow-bridge" | "nb-manage-vault" | "nb-play-fortune" | "nb-trust-sanctuary";

export type ContextualSubNavGroupId = "discover" | "create" | "production" | "ecosystem" | "academy" | "personal";

export interface IllustratedCardMeta {
  readonly cardId: SiteArtCardId;
  readonly src320: string;
  readonly src640: string;
  readonly srcSet: string;
  readonly atelierModelLabel: string;
  readonly stageBadge: { readonly ko: string; readonly en: string };
}

const RAW: Record<SiteArtCardId, readonly [string, string, string]> = {
  "nb-discover-spotlight": ["Key-Art Curation", "STAGE 01 · 작품 발견 허브", "STAGE 01 · DISCOVERY HUB"],
  "nb-explore-spectrum": ["Genre Spectrum", "STAGE 01 · 장르 스펙트럼 탐색", "STAGE 01 · GENRE SPECTRUM"],
  "nb-ranking-constellation": ["Serial Observatory", "STAGE 01 · 실시간 차트 & 요일표", "STAGE 01 · CHARTS & CALENDAR"],
  "nb-library-archive": ["Personal Archive", "STAGE 01 · 개인 서재 아카이브", "STAGE 01 · PERSONAL LIBRARY"],
  "nb-create-canvas": ["Direct-Ink Studio", "STAGE 02 · 창작 캔버스", "STAGE 02 · CREATIVE CANVAS"],
  "nb-planning-storylab": ["Story Architecture", "STAGE 02 · 스토리랩 & 기획", "STAGE 02 · STORY LAB"],
  "nb-spatial-stage": ["3D Spatial Stage", "STAGE 02 · 3D 배경 & 포저", "STAGE 02 · 3D SPATIAL STAGE"],
  "nb-production-control": ["Production Control", "STAGE 02 · 제작 운영 & 검수", "STAGE 02 · PRODUCTION OPS"],
  "nb-market-atelier": ["Asset Atelier", "STAGE 03 · 에셋 마켓 & 핏", "STAGE 03 · ASSET MARKET"],
  "nb-learn-academy": ["Creator Academy", "STAGE 03 · 드로잉 아카데미", "STAGE 03 · CREATOR ACADEMY"],
  "nb-community-plaza": ["Creator Plaza", "STAGE 03 · 커뮤니티 광장", "STAGE 03 · COMMUNITY PLAZA"],
  "nb-showcase-premiere": ["Premiere Gallery", "STAGE 03 · 쇼케이스 & 콜라보", "STAGE 03 · SHOWCASE GALLERY"],
  "nb-workflow-bridge": ["Workflow Compass", "STAGE 00 · 통합 창작 동선", "STAGE 00 · WORKFLOW COMPASS"],
  "nb-manage-vault": ["Creator Space", "STAGE 04 · 마이 스페이스", "STAGE 04 · MY SPACE"],
  "nb-play-fortune": ["Interactive Play", "STAGE 04 · 플레이 & 운세", "STAGE 04 · INTERACTIVE PLAY"],
  "nb-trust-sanctuary": ["Trust Sanctuary", "STAGE 04 · 신뢰 & 접근성", "STAGE 04 · TRUST SANCTUARY"],
};

function meta(cardId: SiteArtCardId): IllustratedCardMeta {
  const [atelierModelLabel, ko, en] = RAW[cardId] ?? RAW["nb-workflow-bridge"];
  const base = `/assets/site-experience/site-art-v1/cards/${cardId}`;
  return { cardId, src320: `${base}-320.webp`, src640: `${base}-640.webp`, srcSet: `${base}-320.webp 320w, ${base}-640.webp 640w`, atelierModelLabel, stageBadge: { ko, en } };
}

const ROUTE_MAP: Record<SiteRouteVisualKind, SiteArtCardId> = {
  workflow: "nb-workflow-bridge", discover: "nb-discover-spotlight", create: "nb-create-canvas",
  planning: "nb-planning-storylab", spatial: "nb-spatial-stage", assets: "nb-market-atelier",
  production: "nb-production-control", review: "nb-production-control", publish: "nb-showcase-premiere",
  learn: "nb-learn-academy", connect: "nb-community-plaza", manage: "nb-manage-vault",
  trust: "nb-trust-sanctuary", play: "nb-play-fortune",
};

const SUBNAV_MAP: Record<string, SiteArtCardId> = {
  discover: "nb-discover-spotlight", create: "nb-create-canvas", production: "nb-production-control",
  ecosystem: "nb-market-atelier", academy: "nb-learn-academy", personal: "nb-manage-vault",
};

export const resolveIllustratedCardMetaForRouteVisual = (k: SiteRouteVisualKind) => meta(ROUTE_MAP[k] ?? "nb-workflow-bridge");
export const resolveSiteArtCardMetaForSubNavGroup = (g: string) => meta(SUBNAV_MAP[g] ?? "nb-workflow-bridge");

export function resolveIllustratedCardMetaForPath(pathname: string): IllustratedCardMeta {
  const p = (pathname.split(/[?#]/, 1)[0] || "/").toLowerCase();
  if (/^\/(explore|genres|search)/.test(p)) return meta("nb-explore-spectrum");
  if (/^\/(ranking|calendar|schedule)/.test(p)) return meta("nb-ranking-constellation");
  if (/^\/(library|bookmarks|history)/.test(p)) return meta("nb-library-archive");
  if (/^\/(discover|webtoon|series)/.test(p)) return meta("nb-discover-spotlight");
  if (/^\/(story-lab|novel|planning)/.test(p)) return meta("nb-planning-storylab");
  if (/^\/(studio\/3d|world|spatial)/.test(p)) return meta("nb-spatial-stage");
  if (/^\/(production|quality|ops|publish)/.test(p)) return meta("nb-production-control");
  if (/^\/(create|studio)/.test(p)) return meta("nb-create-canvas");
  if (/^\/(market|asset-fit|goods)/.test(p)) return meta("nb-market-atelier");
  if (/^\/(learn|trace|academy|encyclopedia|cliche)/.test(p)) return meta("nb-learn-academy");
  if (/^\/(community|league|cafe)/.test(p)) return meta("nb-community-plaza");
  if (/^\/(showcase|collab)/.test(p)) return meta("nb-showcase-premiere");
  if (/^\/(my-space|me|creator|onboarding)/.test(p)) return meta("nb-manage-vault");
  if (/^\/(play|fortune|cut-play)/.test(p)) return meta("nb-play-fortune");
  if (/^\/(pricing|security|accessibility|trust|terms|privacy)/.test(p)) return meta("nb-trust-sanctuary");
  return meta("nb-workflow-bridge");
}
