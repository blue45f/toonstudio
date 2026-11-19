/**
 * 작품별 · 팀별 · 스튜디오별 · 프로젝트별 전용 카페/커뮤니티 허브 및 멀티 이미지 첨부 모델.
 */

export type WorkspaceCafeScope = "work" | "team" | "studio" | "project";

export type CafeBoardChannel =
  | "notice"
  | "manuscript-feedback"
  | "reference-moodboard"
  | "general"
  | "fanart-gallery";

export interface CafeImageAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly caption: string;
  readonly spoilerBlur: boolean;
}

export interface WorkspaceCafeSpace {
  readonly id: string;
  readonly scope: WorkspaceCafeScope;
  readonly entityId: string;
  readonly name: string;
  readonly descriptionKo: string;
  readonly visibility: "public" | "members-only" | "nda-restricted";
  readonly memberCount: number;
  readonly channels: readonly CafeBoardChannel[];
}

export interface WorkspaceCafePost {
  readonly id: string;
  readonly cafeId: string;
  readonly scope: WorkspaceCafeScope;
  readonly channel: CafeBoardChannel;
  readonly authorName: string;
  readonly authorRoleBadge: string;
  readonly title: string;
  readonly body: string;
  readonly attachments: readonly CafeImageAttachment[];
  readonly createdAt: string;
}

export const WORKSPACE_CAFE_SCOPE_LABELS: Readonly<Record<WorkspaceCafeScope, string>> = Object.freeze({
  work: "작품별 카페",
  team: "팀별 카페",
  studio: "스튜디오별 카페",
  project: "프로젝트별 카페",
});

export const CAFE_CHANNEL_LABELS: Readonly<Record<CafeBoardChannel, string>> = Object.freeze({
  notice: "공지사항",
  "manuscript-feedback": "원고 피드백",
  "reference-moodboard": "레퍼런스 · 무드보드",
  general: "자유 소통",
  "fanart-gallery": "팬아트 · 갤러리",
});

export const CAFE_MAX_IMAGES_PER_POST = 8;
export const CAFE_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB
const ALLOWED_CAFE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function validateCafeImageAttachment(input: {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly caption?: string;
  readonly spoilerBlur?: boolean;
  readonly existingCount: number;
}): { readonly ok: true; readonly attachment: CafeImageAttachment } | { readonly ok: false; readonly errorKo: string } {
  if (input.existingCount >= CAFE_MAX_IMAGES_PER_POST) {
    return { ok: false, errorKo: `게시글당 이미지는 최대 ${CAFE_MAX_IMAGES_PER_POST}장까지 첨부할 수 있습니다.` };
  }
  if (!ALLOWED_CAFE_IMAGE_MIMES.has(input.mimeType)) {
    return { ok: false, errorKo: "PNG, JPG, WebP, GIF 이미지 파일만 업로드할 수 있습니다." };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > CAFE_MAX_IMAGE_BYTES) {
    return { ok: false, errorKo: "이미지 파일 크기는 10MB 이하로 제한됩니다." };
  }
  if (!input.dataUrl.startsWith("data:image/")) {
    return { ok: false, errorKo: "유효한 이미지 데이터 URL이 아닙니다." };
  }
  return {
    ok: true,
    attachment: {
      id: `cafe-img-${input.existingCount + 1}-${Date.now().toString(36)}`,
      fileName: input.fileName,
      mimeType: input.mimeType as CafeImageAttachment["mimeType"],
      sizeBytes: input.sizeBytes,
      dataUrl: input.dataUrl,
      caption: (input.caption ?? "").trim().slice(0, 120),
      spoilerBlur: Boolean(input.spoilerBlur),
    },
  };
}

export function createWorkspaceCafePost(input: {
  readonly cafe: WorkspaceCafeSpace;
  readonly channel: CafeBoardChannel;
  readonly authorName: string;
  readonly authorRoleBadge: string;
  readonly title: string;
  readonly body: string;
  readonly attachments: readonly CafeImageAttachment[];
}): { readonly ok: true; readonly post: WorkspaceCafePost } | { readonly ok: false; readonly errorKo: string } {
  const cleanTitle = input.title.trim();
  const cleanBody = input.body.trim();
  if (cleanTitle.length < 2) {
    return { ok: false, errorKo: "게시글 제목을 2자 이상 입력해 주세요." };
  }
  if (!cleanBody && input.attachments.length === 0) {
    return { ok: false, errorKo: "본문 내용 또는 첨부 이미지를 1개 이상 입력해 주세요." };
  }
  if (!input.cafe.channels.includes(input.channel)) {
    return { ok: false, errorKo: "선택한 카페에서 지원하지 않는 게시판 채널입니다." };
  }
  return {
    ok: true,
    post: {
      id: `post-${input.cafe.scope}-${Date.now().toString(36)}`,
      cafeId: input.cafe.id,
      scope: input.cafe.scope,
      channel: input.channel,
      authorName: input.authorName.trim() || "익명 창작자",
      authorRoleBadge: input.authorRoleBadge.trim() || "멤버",
      title: cleanTitle,
      body: cleanBody,
      attachments: [...input.attachments],
      createdAt: new Date().toISOString(),
    },
  };
}

export function createDefaultWorkspaceCafes(): readonly WorkspaceCafeSpace[] {
  return [
    {
      id: "cafe-work-gate",
      scope: "work",
      entityId: "work-gate-breaker",
      name: "서울 게이트 브레이커 공식 작품 카페",
      descriptionKo: "회차 토론, 팬아트 공유, 작가 공지가 모이는 작품 전용 커뮤니티",
      visibility: "public",
      memberCount: 4820,
      channels: ["notice", "fanart-gallery", "general"],
    },
    {
      id: "cafe-team-alpha",
      scope: "team",
      entityId: "team-alpha-line",
      name: "알파 작화팀 원고 피드백 카페",
      descriptionKo: "선화·채색·후보정 팀원 간 레퍼런스 이미지 및 컷 피드백 공유",
      visibility: "members-only",
      memberCount: 14,
      channels: ["notice", "manuscript-feedback", "reference-moodboard", "general"],
    },
    {
      id: "cafe-studio-chronicle",
      scope: "studio",
      entityId: "studio-chronicle",
      name: "스튜디오 크로니클 사내 라운지",
      descriptionKo: "소속 작가·PD·어시스턴트 전사 공지, 브러시/3D 에셋 공유 허브",
      visibility: "members-only",
      memberCount: 68,
      channels: ["notice", "reference-moodboard", "general"],
    },
    {
      id: "cafe-project-season2",
      scope: "project",
      entityId: "proj-s2-relaunch",
      name: "시즌2 런칭 비밀 프로젝트 카페 (NDA)",
      descriptionKo: "미공개 콘티·캐릭터 시트·IP 확장 자료를 보안 워터마크 하에 공유",
      visibility: "nda-restricted",
      memberCount: 9,
      channels: ["notice", "manuscript-feedback", "reference-moodboard"],
    },
  ];
}
