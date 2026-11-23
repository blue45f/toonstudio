import {
  BookOpenText,
  ClipboardCheck,
  GraduationCap,
  Handshake,
  LayoutGrid,
  MessageSquareText,
  MonitorUp,
  PenTool,
  Timer,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";

/**
 * 웹툰 협업 동선: 지금 있는 구역에서 바로 이어지는 일.
 * 회의실은 회차 보드·원고 검토·피드백·화면 공유, 작업실은 내 원고·회차 보드·같이 작업하기로 이어진다.
 * 링크는 기존 제작 관리(production-hub)·스튜디오 경로만 쓰고, 패널은 HUD 패널을 그대로 연다.
 */
export type SpaceZoneWorkKind = "meeting" | "atelier" | "story" | "review";

export type SpaceZoneWorkItem =
  | { readonly id: string; readonly kind: "href"; readonly href: string; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon }
  | { readonly id: string; readonly kind: "panel"; readonly panel: StudioVirtualWorkspacePanel; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon }
  | { readonly id: string; readonly kind: "cowork" | "share"; readonly labelKo: string; readonly labelEn: string; readonly icon: LucideIcon };

const ZONE_KIND: Readonly<Record<string, SpaceZoneWorkKind>> = {
  "team-meeting": "meeting",
  meeting: "meeting",
  "personal-atelier": "atelier",
  drawing: "atelier",
  storyboard: "atelier",
  "story-lab": "story",
  writers: "story",
  "review-gallery": "review",
  review: "review",
};

const ACTION_KIND: Partial<Record<StudioWorldInteractionDefinition["action"], SpaceZoneWorkKind>> = {
  live: "meeting",
  canvas: "atelier",
  comic: "atelier",
  story: "story",
  review: "review",
};

/** 구역(방 id)과 그 방의 기본 동작으로 협업 동선 종류를 고른다. 해당 없으면 null. */
export function spaceZoneWorkKind(roomId: string | null | undefined, roomAction?: StudioWorldInteractionDefinition["action"]): SpaceZoneWorkKind | null {
  return (roomId ? ZONE_KIND[roomId] : undefined) ?? (roomAction ? ACTION_KIND[roomAction] : undefined) ?? null;
}

export const SPACE_ZONE_WORK_TITLES: Readonly<Record<SpaceZoneWorkKind, { readonly ko: string; readonly en: string }>> = {
  meeting: { ko: "회의실에서 바로", en: "From the meeting room" },
  atelier: { ko: "작업실에서 바로", en: "From the studio" },
  story: { ko: "공동 작업실에서 바로", en: "From the co-work room" },
  review: { ko: "갤러리에서 바로", en: "From the gallery" },
};

export interface SpaceZoneWorkContext {
  readonly projectId: string;
  /** 제작 관리 프로젝트가 연결돼 있으면 production-hub 경로를 쓴다. */
  readonly productionProjectId: string | null;
  readonly personal: boolean;
}

function boardHref({ projectId, productionProjectId }: SpaceZoneWorkContext): string {
  return productionProjectId
    ? `/production/projects/${encodeURIComponent(productionProjectId)}/episodes`
    : `/studio/p/${encodeURIComponent(projectId)}/production`;
}

function reviewHref({ projectId, productionProjectId }: SpaceZoneWorkContext): string {
  return productionProjectId
    ? `/production/projects/${encodeURIComponent(productionProjectId)}/review`
    : `/studio/p/${encodeURIComponent(projectId)}/review?view=inbox`;
}

/** 구역 종류별 바로 가기(최대 4개). 개인 공간은 팀 전용 동선(피드백·같이 작업하기·화면 공유)을 뺀다. */
export function spaceZoneWorkItems(kind: SpaceZoneWorkKind, context: SpaceZoneWorkContext): readonly SpaceZoneWorkItem[] {
  if (context.personal) {
    const manuscript: SpaceZoneWorkItem = { id: "manuscript", kind: "href", href: "/studio", labelKo: "내 원고 열기", labelEn: "Open my pages", icon: PenTool };
    return kind === "story"
      ? [{ id: "story", kind: "href", href: "/studio/new", labelKo: "새 이야기 시작", labelEn: "Start a new story", icon: BookOpenText }, manuscript]
      : [manuscript];
  }
  const encoded = encodeURIComponent(context.projectId);
  const board: SpaceZoneWorkItem = { id: "board", kind: "href", href: boardHref(context), labelKo: "회차 보드", labelEn: "Episode board", icon: LayoutGrid };
  const review: SpaceZoneWorkItem = { id: "review", kind: "href", href: reviewHref(context), labelKo: "원고 검토", labelEn: "Page review", icon: ClipboardCheck };
  const feedback: SpaceZoneWorkItem = { id: "feedback", kind: "panel", panel: "work", labelKo: "피드백·검수함", labelEn: "Feedback inbox", icon: MessageSquareText };
  const cowork: SpaceZoneWorkItem = { id: "cowork", kind: "cowork", labelKo: "같이 작업하기", labelEn: "Work together", icon: Handshake };
  switch (kind) {
    case "meeting":
      return [board, review, feedback, { id: "share", kind: "share", labelKo: "화면 공유", labelEn: "Share screen", icon: MonitorUp }];
    case "atelier":
      return [{ id: "manuscript", kind: "href", href: `/studio/work/${encoded}/canvas`, labelKo: "내 원고 열기", labelEn: "Open my pages", icon: PenTool }, board, cowork];
    case "story":
      return [{ id: "story", kind: "href", href: `/studio/p/${encoded}/story?view=script`, labelKo: "대본·콘티", labelEn: "Script & storyboard", icon: BookOpenText }, board, cowork];
    case "review":
      return [review, feedback, cowork];
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* 검수 딥링크(?zone=...) & 개인 마감 직행(Zero-Walk) 단축 동선                                      */
/* ---------------------------------------------------------------------------------------------- */

export type SpaceDeepLinkZoneKey = "review" | "desk" | "classroom" | "stage";

export interface SpaceDeepLinkZoneResolution {
  /** 정규화된 딥링크 구역 키 (`review` | `desk` | `classroom` | `stage`). */
  readonly zone: SpaceDeepLinkZoneKey;
  /** 2D/캠퍼스 월드에서 즉시 착석·이동할 대상 룸 id. */
  readonly roomId: string;
  /** 기본 제공 장소 카탈로그 id (`?place=` 호환). */
  readonly placeId: string;
  /** 해당 구역의 협업 동선 종류. */
  readonly workKind: SpaceZoneWorkKind;
  /** 착석 직후 바로 열 HUD 패널(개인 모드에서는 scope 필터가 적용된다). */
  readonly panel: StudioVirtualWorkspacePanel;
  /** `?reviewId=...`로 전달된 검증된 검수 항목 id. 없거나 유효하지 않으면 null. */
  readonly reviewId: string | null;
  /** 아바타 보행 이동 없이 즉시 착석·패널 오픈을 수행한다. */
  readonly instantSeat: true;
  /** 맵 걷기 과정을 건너뛰는 직행(Zero-Walk) 진입 여부. */
  readonly skipWalk: true;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 정규화된 공간 딥링크 URL. */
  readonly deepLinkHref: string;
}

interface DeepLinkZoneTemplate {
  readonly zone: SpaceDeepLinkZoneKey;
  readonly roomId: string;
  readonly placeId: string;
  readonly workKind: SpaceZoneWorkKind;
  readonly panel: StudioVirtualWorkspacePanel;
  readonly labelKo: string;
  readonly labelEn: string;
}

const DEEP_LINK_ZONE_TEMPLATES: Readonly<Record<SpaceDeepLinkZoneKey, DeepLinkZoneTemplate>> = Object.freeze({
  review: Object.freeze({
    zone: "review",
    roomId: "review",
    placeId: "review-gallery",
    workKind: "review",
    panel: "work",
    labelKo: "붉은펜 검수실",
    labelEn: "Redline review room",
  }),
  desk: Object.freeze({
    zone: "desk",
    roomId: "drawing",
    placeId: "personal-atelier",
    workKind: "atelier",
    panel: "seats",
    labelKo: "집중 작화 책상",
    labelEn: "Focus drawing desk",
  }),
  classroom: Object.freeze({
    zone: "classroom",
    roomId: "story-lab",
    placeId: "story-lab",
    workKind: "story",
    panel: "sessions",
    labelKo: "강의실·크리틱 룸",
    labelEn: "Classroom & critique room",
  }),
  stage: Object.freeze({
    zone: "stage",
    roomId: "event-stage",
    placeId: "event-stage",
    workKind: "meeting",
    panel: "town",
    labelKo: "발표·라이브 스테이지",
    labelEn: "Presentation & live stage",
  }),
});

const DEEP_LINK_ZONE_ALIASES: Readonly<Record<string, SpaceDeepLinkZoneKey>> = Object.freeze({
  review: "review",
  "review-gallery": "review",
  "hq-review-room": "review",
  redline: "review",
  quality: "review",
  desk: "desk",
  drawing: "desk",
  "personal-atelier": "desk",
  "hq-ink-bay": "desk",
  "hq-focus-booths": "desk",
  "zone-focus": "desk",
  "zone-2f-main-atelier": "desk",
  focus: "desk",
  classroom: "classroom",
  story: "classroom",
  "story-lab": "classroom",
  writers: "classroom",
  "hq-story-room": "classroom",
  critique: "classroom",
  stage: "stage",
  "event-stage": "stage",
  live: "stage",
  meeting: "stage",
  "team-meeting": "stage",
  "hq-meeting-room": "stage",
  "zone-1f-golive-stage": "stage",
});

const SAFE_REVIEW_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu;

function extractSearchQuery(search: string): string {
  const trimmed = search.trim();
  if (!trimmed) return "";
  const queryStart = trimmed.indexOf("?");
  if (queryStart >= 0) return trimmed.slice(queryStart + 1);
  if (trimmed.startsWith("/") || trimmed.includes("://")) return "";
  return trimmed;
}

function sanitizeReviewId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("..") || !SAFE_REVIEW_ID.test(trimmed)) return null;
  return trimmed;
}

/**
 * `?zone=review`, `?zone=desk`, `?zone=classroom`, `?zone=stage`, `?reviewId=...` 쿼리를
 * 안전하게 파싱해 아바타 이동 없이 해당 구역·검수 패널로 즉시 착석하는 정보를 반환한다.
 * 알 수 없거나 위험한 `zone` 값은 fail-closed로 `null`을 돌려준다.
 */
export function resolveSpaceDeepLinkZone(search: string): SpaceDeepLinkZoneResolution | null {
  if (typeof search !== "string") return null;
  const queryText = extractSearchQuery(search);
  if (!queryText) return null;
  const params = new URLSearchParams(queryText);
  const rawZone = params.get("zone")?.trim().toLowerCase() ?? "";
  const reviewId = sanitizeReviewId(params.get("reviewId"));

  const canonicalZone: SpaceDeepLinkZoneKey | null = rawZone
    ? (DEEP_LINK_ZONE_ALIASES[rawZone] ?? null)
    : reviewId
      ? "review"
      : null;
  if (!canonicalZone) return null;

  const template = DEEP_LINK_ZONE_TEMPLATES[canonicalZone];
  const deepLinkHref = reviewId
    ? `/studio/space?zone=${template.zone}&reviewId=${encodeURIComponent(reviewId)}`
    : `/studio/space?zone=${template.zone}`;

  return Object.freeze({
    ...template,
    reviewId,
    instantSeat: true as const,
    skipWalk: true as const,
    deepLinkHref,
  });
}

export type ZeroWalkShortcutId =
  | "open-manuscript"
  | "direct-redline-review"
  | "focus-timer-silent-desk"
  | "team-desk-presence"
  | "synced-review-table"
  | "classroom-critique";

export type ZeroWalkShortcutTargetKind = "href" | "zone-deep-link" | "panel" | "focus-desk";

export interface ZeroWalkShortcutOptions {
  readonly personal: boolean;
  readonly activeZoneId: string;
  readonly reviewCount?: number;
}

export interface ZeroWalkShortcutItem {
  readonly id: ZeroWalkShortcutId;
  readonly targetKind: ZeroWalkShortcutTargetKind;
  readonly targetZone: SpaceDeepLinkZoneKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly href: string;
  readonly panel: StudioVirtualWorkspacePanel | null;
  readonly active: boolean;
  readonly badgeCount: number | null;
  readonly badgeLabelKo: string | null;
  readonly badgeLabelEn: string | null;
  readonly zeroWalk: true;
  readonly icon: LucideIcon;
}

function normalizeReviewCount(reviewCount: number | undefined): number {
  if (typeof reviewCount !== "number" || !Number.isFinite(reviewCount)) return 0;
  return Math.max(0, Math.floor(reviewCount));
}

function matchesDeepLinkZone(activeZoneId: string, target: SpaceDeepLinkZoneKey): boolean {
  const normalized = activeZoneId.trim().toLowerCase();
  if (!normalized) return false;
  return DEEP_LINK_ZONE_ALIASES[normalized] === target;
}

/**
 * 14개 구역을 걸어 다니지 않고 즉시 원고·검수·집중 책상·수업으로 직행하는 Zero-Walk 단축 액션 3종을 만든다.
 * - 개인 마감 모드(`personal=true`): 내 원고 바로 열기 · 붉은펜 검수실 직행 · 집중 타이머·무음 책상
 * - 팀·수업 모드(`personal=false`): 팀원 책상 현황 · 동기화 검수 테이블 · 강의실 크리틱
 */
export function buildZeroWalkShortcuts(options: ZeroWalkShortcutOptions): readonly ZeroWalkShortcutItem[] {
  const safeReviewCount = normalizeReviewCount(options.reviewCount);
  const reviewBadgeCount = safeReviewCount > 0 ? safeReviewCount : null;
  const reviewBadgeKo = reviewBadgeCount !== null ? `검수 ${reviewBadgeCount}건` : null;
  const reviewBadgeEn = reviewBadgeCount !== null ? `${reviewBadgeCount} reviews` : null;

  if (options.personal) {
    return Object.freeze([
      Object.freeze({
        id: "open-manuscript",
        targetKind: "href" as const,
        targetZone: "desk" as const,
        labelKo: "내 원고 바로 열기",
        labelEn: "Open my manuscript",
        descriptionKo: "맵 이동 없이 내 원고 캔버스로 바로 진입합니다.",
        descriptionEn: "Open your manuscript canvas directly without walking.",
        href: "/studio",
        panel: null,
        active: false,
        badgeCount: null,
        badgeLabelKo: null,
        badgeLabelEn: null,
        zeroWalk: true as const,
        icon: PenTool,
      }),
      Object.freeze({
        id: "direct-redline-review",
        targetKind: "zone-deep-link" as const,
        targetZone: "review" as const,
        labelKo: "붉은펜 검수실 직행",
        labelEn: "Direct to redline review",
        descriptionKo: "아바타 이동 없이 검수실 딥링크로 즉시 착석합니다.",
        descriptionEn: "Seat straight in the redline review room via deep link.",
        href: "/studio/space?zone=review",
        panel: "work" as const,
        active: matchesDeepLinkZone(options.activeZoneId, "review"),
        badgeCount: reviewBadgeCount,
        badgeLabelKo: reviewBadgeKo,
        badgeLabelEn: reviewBadgeEn,
        zeroWalk: true as const,
        icon: ClipboardCheck,
      }),
      Object.freeze({
        id: "focus-timer-silent-desk",
        targetKind: "focus-desk" as const,
        targetZone: "desk" as const,
        labelKo: "집중 타이머·무음 책상",
        labelEn: "Focus timer & silent desk",
        descriptionKo: "무음 책상에 바로 착석해 마감 집중 타이머를 시작합니다.",
        descriptionEn: "Seat at a silent desk and start a deadline focus timer.",
        href: "/studio/space?zone=desk",
        panel: "seats" as const,
        active: matchesDeepLinkZone(options.activeZoneId, "desk"),
        badgeCount: null,
        badgeLabelKo: null,
        badgeLabelEn: null,
        zeroWalk: true as const,
        icon: Timer,
      }),
    ]);
  }

  return Object.freeze([
    Object.freeze({
      id: "team-desk-presence",
      targetKind: "panel" as const,
      targetZone: "desk" as const,
      labelKo: "팀원 책상 현황",
      labelEn: "Team desk status",
      descriptionKo: "접속한 팀원의 작업 자리와 집중·피드백 상태를 바로 확인합니다.",
      descriptionEn: "View connected teammates' desks and focus/feedback status right away.",
      href: "/studio/space?zone=desk",
      panel: "people" as const,
      active: matchesDeepLinkZone(options.activeZoneId, "desk"),
      badgeCount: null,
      badgeLabelKo: null,
      badgeLabelEn: null,
      zeroWalk: true as const,
      icon: UsersRound,
    }),
    Object.freeze({
      id: "synced-review-table",
      targetKind: "zone-deep-link" as const,
      targetZone: "review" as const,
      labelKo: "동기화 검수 테이블",
      labelEn: "Synced review table",
      descriptionKo: "PD·팀원과 같은 컷을 띄우고 붉은펜 피드백을 동기화합니다.",
      descriptionEn: "Sync the same episode panel with teammates for redline review.",
      href: "/studio/space?zone=review",
      panel: "work" as const,
      active: matchesDeepLinkZone(options.activeZoneId, "review"),
      badgeCount: reviewBadgeCount,
      badgeLabelKo: reviewBadgeKo,
      badgeLabelEn: reviewBadgeEn,
      zeroWalk: true as const,
      icon: ClipboardCheck,
    }),
    Object.freeze({
      id: "classroom-critique",
      targetKind: "zone-deep-link" as const,
      targetZone: "classroom" as const,
      labelKo: "강의실 크리틱",
      labelEn: "Classroom critique",
      descriptionKo: "실기 강의실 딥링크로 직행해 과제 합평 세션을 엽니다.",
      descriptionEn: "Jump directly to the classroom critique and assignment session.",
      href: "/studio/space?zone=classroom",
      panel: "sessions" as const,
      active: matchesDeepLinkZone(options.activeZoneId, "classroom"),
      badgeCount: null,
      badgeLabelKo: null,
      badgeLabelEn: null,
      zeroWalk: true as const,
      icon: GraduationCap,
    }),
  ]);
}
