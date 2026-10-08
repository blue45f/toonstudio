// 작품 유형: 웹툰 / 웹소설
export type WorkType = "webtoon" | "webnovel";

// 연재 상태
export type SerialStatus = "ongoing" | "completed" | "hiatus";

// 이용가
export type AgeRating = "all" | "12" | "15" | "19";

// 가격 모델
export type Pricing = "free" | "wait-free" | "paid" | "subscription";

export type PlatformId =
  | "naver-webtoon"
  | "naver-series"
  | "kakao-page"
  | "kakao-webtoon"
  | "ridi"
  | "munpia"
  | "joara"
  | "novelpia"
  | "lezhin"
  | "bomtoon"
  | "toptoon"
  | "postype"
  | "mrblue"
  | "comico"
  | "toomics"
  | "bookcube"
  | "onestory"
  | "kyobo"
  | "yes24"
  | "kmas";

export interface Platform {
  id: PlatformId;
  name: string; // 한글 정식 명칭
  short: string; // 짧은 라벨
  type: WorkType | "both";
  color: string; // 브랜드 컬러 (hex)
}

// 어디서 볼 수 있는가 (크로스 플랫폼 가용성)
export interface Availability {
  platformId: PlatformId;
  pricing: Pricing;
  isOriginal?: boolean; // 독점/오리지널 연재
  url?: string;
}

export interface TitleStats {
  views: number; // 누적 조회수
  likes: number; // 좋아요
  bookmarks: number; // 관심 등록
  ratingAvg: number; // 평균 별점 0~5
  ratingCount: number; // 평가 참여 수
  ratingDist: [number, number, number, number, number]; // 1~5점 분포
  rankDelta: number; // 주간 순위 변동 (+상승 / -하락 / 0 유지)
  trendingScore: number; // 급상승 점수 0~100
  completionRate: number; // 정주행 완독률 % (0~100)
  bingeIndex: number; // 정주행 몰입 지수 0~100 (한 번에 몰아보는 정도)
  // 플랫폼 실제 인기 순위(네이버 order=user 등, 1=최상위).
  popularityRank?: number;
  // 교차-플랫폼 정규화 인기 백분위(0~100, 100=플랫폼 내 최상위). 카탈로그 로드 시 계산.
  popularityPercentile?: number;
}

export interface Title {
  id: string;
  slug: string;
  type: WorkType;
  title: string;
  altTitles?: string[]; // 별칭/영문/축약 (검색용)
  author: string; // 글
  artist?: string; // 그림 (웹툰)
  genres: string[];
  tags: string[]; // 작품 특성 태그 (#사이다 #회빙환 등)
  synopsis: string; // 1~3문장 소개 (오리지널 요약)
  cover: [string, string]; // 표지 그라디언트 [from, to] hex (이미지 없을 때 폴백)
  coverImage?: string; // 실제 표지 이미지 URL (있으면 우선 사용)
  status: SerialStatus;
  ageRating: AgeRating;
  releaseYear: number;
  totalEpisodes?: number;
  updateDays?: string[]; // 연재요일 (월~일)
  availability: Availability[];
  // 원작-2차창작 그래프 (웹툰↔원작소설). 드라마·영화·애니 등 영상화·OST는 lib/title-universe.ts 에서 관리.
  adaptedFrom?: string; // 원작 작품 id (예: 웹툰의 원작 웹소설)
  stats: TitleStats;
  // 조회/관심 등 핵심 지표가 합성(추정)값일 때 true. 네이버가 공개 조회수 집계를 비공개로
  // 전환하면 viewCount가 0으로 내려오므로, 0 노출 방지용으로 보정한 작품을 추정으로 표시한다.
  statsEstimated?: boolean;
  featured?: boolean; // 에디터 추천
  editorNote?: string; // 에디터 한줄평
  // 관련 정보(유튜브 영상·뉴스 기사·나무위키·블로그 등 실제 목적지 직링크) — 크롤러가 주기적으로
  // 수집해 detail 샤드(TitleDetailExtra.r)에 실어 병합한다. 상세 화면에서만 사용(목록엔 없음).
  relatedInfo?: RelatedInfoItem[];
}

// ── 관련 정보 항목 (크롤 수집 · detail 샤드에 저장) ─────────────────────────
// "단순 검색 결과 페이지"가 아니라 실제 영상·기사·문서로 직접 연결되는 목적지 URL.
export type RelatedInfoCategory = "youtube" | "blog" | "news" | "wiki" | "interview";

export interface RelatedInfoItem {
  id: string;
  category: RelatedInfoCategory;
  title: string;
  url: string; // 실제 목적지(영상/기사/문서) 직링크
  sourceName: string; // 출처 표기 (예: "유튜브", "네이버 뉴스", "나무위키")
  dateOrViews?: string; // 조회수·발행일 등 부가 정보
  snippet?: string; // 요약
  thumbnail?: string; // 썸네일 URL (유튜브 등)
  badge?: string; // "공식 PV", "단독 보도" 등
}

// ── 회차 메타데이터 (크롤 수집 · apps/api/data/title-episodes.json 스냅샷) ─────────────
// 플랫폼이 공개하는 회차 목록 메타데이터만 담는다(번호·제목·공개일·썸네일). 컷 이미지
// 본문은 수집하지 않는다. 웹 소비 계약(apps/web/src/domains/catalog/title-episodes.ts의
// TitleEpisode)과 필드 단위로 동일하며, 상세 응답 루트의 episodes 로 공급된다.
// 공개 수치가 없는 필드(예: 플랫폼이 좋아요를 목록에 안 주는 경우)는 지어내지 않고 비운다.
export interface TitleEpisode {
  number: number; // 1부터 시작하는 회차 번호
  title?: string; // 회차 제목 — 없으면 화면은 "N화"로만 표기
  publishedAt?: string; // 공개일 (ISO 날짜 문자열)
  likes?: number; // 회차 좋아요 수 — 플랫폼이 공개할 때만
  thumbnailUrl?: string; // 회차 썸네일 (/api/cover 프록시 URL — 표지와 동일 선례)
  status?: "published" | "scheduled"; // 없으면 공개로 간주
}

// 스냅샷 항목 — 작품 1편의 회차 수집 결과. partial 이면 플랫폼 총수보다 적게 수집된 상태
// (상한 캡 도달)이며, totalEpisodes 는 그 경우에도 플랫폼이 보고한 총수를 유지한다.
export interface TitleEpisodeEntry {
  episodes: TitleEpisode[];
  totalEpisodes?: number; // 플랫폼이 보고한 총 회차 수
  crawledAt: string; // 수집 시각 (ISO)
  source: string; // 수집 플랫폼 id (예: "naver-webtoon")
  partial?: boolean;
}

// ── 정적 카탈로그 경량 카드 (additive) ─────────────────────────
// public/data 의 목록형 산출물(catalog.json, ranking/*.json 의 items[].title,
// calendar.json 의 days[].items)은 전송량을 줄이기 위해 상세 전용 필드를 생략/축약한
// 카드를 담는다(lib/catalog-slim.ts 규약). Title 은 TitleCard 의 상위집합이라 그대로
// 대입 가능 — API 폴백 모드의 풀 Title 응답도 같은 타입으로 소비할 수 있다.
export type TitleCardStats = Omit<TitleStats, "ratingDist"> & {
  ratingDist?: TitleStats["ratingDist"]; // 상세 전용 — detail 샤드 병합 후에만 존재
};

export type TitleCard = Omit<Title, "stats" | "synopsis"> & {
  synopsis?: string; // 카드 노출용 축약 시놉시스(캘린더 카드는 생략, 상세는 샤드 원문 병합)
  stats: TitleCardStats;
};

// 리뷰 표시 모델(시드 또는 DB 리뷰 공통 형태)
export interface SeedReview {
  id: string;
  titleId: string;
  userId?: string; // DB 리뷰일 때 작성자 (공개 프로필 링크용). 시드엔 없음.
  author: string; // 닉네임
  avatar: string; // 아바타 그라디언트 시드 컬러 (hex)
  rating: number; // 0.5 ~ 5 (0.5 단위)
  text: string;
  tags: string[]; // 리뷰 태그
  spoiler: boolean;
  likes: number;
  createdAt: string; // ISO 날짜
  progress?: "완독" | "정주행중" | "하차" | "정주행 예정";
}

// 사용자(로컬) 데이터
export type ReadState = "want" | "reading" | "paused" | "done" | "dropped";

export interface UserReview {
  titleId: string;
  rating: number;
  text: string;
  tags: string[];
  spoiler: boolean;
  createdAt: string;
}

export type FanCafeScope = "title" | "author" | "pencafe" | "cafe";
export type FanCafeScopeFilter = FanCafeScope | "all";
export type FanCafePostKind = "talk" | "theory" | "fanart" | "cosplay" | "event" | "cheer";

export interface CommunityAuthor {
  id?: string;
  name: string;
  avatar: string;
}

export interface ReviewReply {
  id: string;
  reviewId: string;
  parentId?: string | null;
  author: CommunityAuthor;
  text: string;
  spoiler: boolean;
  createdAt: string;
  deleted?: boolean; // 소프트 삭제 — 자리 표시("삭제된 댓글")로 렌더
  children?: ReviewReply[];
}

export interface FanCafeReply {
  id: string;
  postId: string;
  author: CommunityAuthor;
  text: string;
  createdAt: string;
  parentId?: string | null;
  deleted?: boolean; // 소프트 삭제 — 자리 표시("삭제된 댓글")로 렌더
  children?: FanCafeReply[];
}

export interface FanCafePost {
  id: string;
  scope: FanCafeScope;
  targetId: string;
  targetLabel: string;
  kind: FanCafePostKind;
  title: string;
  text: string;
  tags: string[];
  images?: string[]; // 축소된 data-URL 첨부(팬아트)
  author: CommunityAuthor;
  createdAt: string;
  replyCount: number;
  replies?: FanCafeReply[];
  likeCount?: number; // 좋아요 총개수 (상세 응답에서 채운다)
  viewerLiked?: boolean; // 조회 회원의 좋아요 여부 (상세 응답, 게스트는 false)
}

// ── 회원 개설형 커뮤니티(기존 장르 카페 URL·게시글과 호환) ──
export type CommunityCafeKind =
  | "creator"
  | "work"
  | "genre"
  | "project"
  | "study"
  | "social";
export type CommunityCafeVisibility = "public" | "private";
export type CommunityCafeJoinPolicy = "open" | "approval" | "invite";
export type CommunityCafePostingPolicy = "members" | "staff";
export type CommunityCafeRole = "owner" | "admin" | "moderator" | "member";
export type CommunityCafeStatus = "active" | "archived";
export type CommunityCafeMembershipState = "none" | "pending" | "member" | "banned";

export interface CommunityCafeRule {
  id: string;
  title: string;
  description: string;
}

export interface CommunityCafe {
  id: string;
  slug: string;
  name: string;
  description: string;
  genre: string;
  kind: CommunityCafeKind;
  tags: string[];
  visibility: CommunityCafeVisibility;
  joinPolicy: CommunityCafeJoinPolicy;
  postingPolicy: CommunityCafePostingPolicy;
  rules: CommunityCafeRule[];
  status: CommunityCafeStatus;
  createdBy: string;
  ownerName: string;
  memberCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
  viewerIsMember?: boolean;
  viewerRole?: CommunityCafeRole | null;
  viewerMembershipState?: CommunityCafeMembershipState;
  viewerJoinRequestId?: string | null;
  viewerCanViewContent?: boolean;
  viewerCanManage?: boolean;
  viewerCanModerate?: boolean;
  viewerCanPost?: boolean;
}

export interface CommunityCafeMember {
  userId: string;
  name: string;
  avatar: string | null;
  role: CommunityCafeRole;
  joinedAt: string;
}

export interface CommunityCafeJoinRequest {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  message: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityCafeBan {
  userId: string;
  userName: string;
  userAvatar: string | null;
  reason: string;
  bannedBy: string | null;
  bannedByName: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface CommunityCafeInvite {
  id: string;
  createdBy: string | null;
  creatorName: string;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedCommunityCafeInvite extends CommunityCafeInvite {
  code: string;
  sharePath: string;
}

export interface CommunityCafeModerationLog {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetUserId: string | null;
  targetPostId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface FanCafeBoard {
  scope: FanCafeScope;
  targetId: string;
  targetLabel: string;
  postCount: number;
  replyCount: number;
  latestPostAt: string;
}

export interface FanCafePostList {
  items: FanCafePost[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── 사이트 Q&A·의견 게시판 ──
export type FeedbackCategory = import("./feedback").FeedbackKind;
export type FeedbackStatus = "open" | "answered";

export interface FeedbackReply {
  id: string;
  postId: string;
  parentId?: string | null;
  author: CommunityAuthor;
  text: string;
  isOfficial: boolean; // 운영자(admin/operator) 답변
  createdAt: string;
  children?: FeedbackReply[];
}

export interface FeedbackPost {
  id: string;
  category: FeedbackCategory;
  title: string;
  text: string;
  tags: string[];
  status: FeedbackStatus;
  author: CommunityAuthor;
  createdAt: string;
  answeredAt: string | null;
  replyCount: number;
  replies?: FeedbackReply[];
}

export interface FeedbackPostList {
  items: FeedbackPost[];
  nextCursor: string | null;
  hasMore: boolean;
}
