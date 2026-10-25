/**
 * 워크스페이스 연재처 카탈로그·에피소드 썸네일 규격·통합 초대 시트 계산기·7×6 권한 매트릭스·내보내기·보안 공유 모델.
 *
 * - 연재처 관리(`PublishPlatformPreset`): 워크스페이스 단위 연재처 등록·활성 토글 및 프로젝트별 연재 시작일·URL·공개 여부 매핑
 * - 에피소드 썸네일 규격(`EpisodeThumbnailSpecPreset`): 150~1440px 범위 검증, 정방형/가로형/세로형 규격 프리셋
 * - 통합 초대 시트 필요 여부 계산기(`computeInviteSeatRequirement`):
 *   - 워크스페이스 역할이 `owner`/`admin`/`member`이거나, `guest`라도 프로젝트·공정 권한 중 하나라도 `limited-edit`(`제한된 편집 허용`) 이상이면 유료 시트 필요(`requiresPaidSeat: true`)
 *   - `guest`이면서 모든 프로젝트·공정 권한이 `comment`(`의견 허용`) / `view`(`보기 허용`) / `access`(`접근 허용`) 이하이면 무료(`requiresPaidSeat: false`)
 * - 원고 내보내기(`ManuscriptExportConfig`): 3종 리사이즈(`fixed-slice` 720×1100 분할 / `keep-ratio` 360~1440px / `original` 원본), 포맷(JPG/PNG/PDF), 품질 3단계, 파일명 접두사, 썸네일 포함 ZIP
 * - 보안 공유 링크(`ProtectedShareConfig`): 수신인 식별자, 비밀번호, 만료일, `수신인 + 조회일` 동적 워터마크, NDA 기밀 유지 서약, 즉시 활성/비활성 토글
 */

export type GovernanceWorkspaceRole = "owner" | "admin" | "member" | "guest";

export type GovernanceProjectPermission =
  | "full"
  | "manage"
  | "edit"
  | "limited-edit"
  | "comment"
  | "view"
  | "access";

export type GovernanceProcessPermission =
  | "manage"
  | "edit"
  | "limited-edit"
  | "comment"
  | "view"
  | "none";

export type ManuscriptExportResizeMode = "fixed-slice" | "keep-ratio" | "original";
export type ManuscriptExportFormat = "jpg" | "png" | "pdf";
export type ManuscriptExportQuality = "best" | "high" | "standard";

export const THUMBNAIL_MIN_PX = 150;
export const THUMBNAIL_MAX_PX = 1440;
export const EXPORT_KEEP_RATIO_MIN_PX = 360;
export const EXPORT_KEEP_RATIO_MAX_PX = 1440;

export interface PublishPlatformPreset {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly publishUrl: string;
  readonly startDateIso: string;
  readonly isPublicSeries: boolean;
}

export interface EpisodeThumbnailSpecPreset {
  readonly id: string;
  readonly name: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly isActive: boolean;
}

export interface InviteSeatCalculationInput {
  readonly workspaceRole: GovernanceWorkspaceRole;
  readonly projectPermissions: readonly GovernanceProjectPermission[];
  readonly processPermissions: readonly GovernanceProcessPermission[];
}

export interface InviteSeatCalculationResult {
  readonly requiresPaidSeat: boolean;
  readonly badgeLabelKo: string;
  readonly reasonKo: string;
}

export interface ManuscriptExportConfig {
  readonly fileNamePrefix: string;
  readonly resizeMode: ManuscriptExportResizeMode;
  readonly fixedWidthPx: number;
  readonly fixedHeightPx: number;
  readonly keepRatioWidthPx: number;
  readonly format: ManuscriptExportFormat;
  readonly quality: ManuscriptExportQuality;
  readonly includeEpisodeThumbnails: boolean;
}

export interface ProtectedShareConfig {
  readonly shareId: string;
  readonly recipientIdentifier: string;
  readonly password: string;
  readonly expiresAtIso: string;
  readonly watermarkEnabled: boolean;
  readonly ndaBannerEnabled: boolean;
  readonly isActive: boolean;
  readonly selectedEpisodeProcessLabels: readonly string[];
}

const PAID_PROJECT_PERMISSIONS: ReadonlySet<GovernanceProjectPermission> = new Set([
  "full",
  "manage",
  "edit",
  "limited-edit",
]);

const PAID_PROCESS_PERMISSIONS: ReadonlySet<GovernanceProcessPermission> = new Set([
  "manage",
  "edit",
  "limited-edit",
]);

/** 에피소드 썸네일 규격(가로·세로 150~1440px)이 유효한지 검증한다. */
export function validateThumbnailSpecDimensions(
  widthPx: number,
  heightPx: number,
): { readonly valid: boolean; readonly errorKo: string | null } {
  const w = Math.trunc(widthPx);
  const h = Math.trunc(heightPx);
  if (
    !Number.isFinite(w)
    || !Number.isFinite(h)
    || w < THUMBNAIL_MIN_PX
    || w > THUMBNAIL_MAX_PX
    || h < THUMBNAIL_MIN_PX
    || h > THUMBNAIL_MAX_PX
  ) {
    return {
      valid: false,
      errorKo: `썸네일 규격은 가로·세로 모두 ${THUMBNAIL_MIN_PX}px 이상 ${THUMBNAIL_MAX_PX}px 이하여야 합니다.`,
    };
  }
  return { valid: true, errorKo: null };
}

/**
 * 통합 구성원 초대 시 실시간 시트 필요 여부(`시트 필요 여부`)를 판별한다.
 */
export function computeInviteSeatRequirement(
  input: InviteSeatCalculationInput,
): InviteSeatCalculationResult {
  if (input.workspaceRole !== "guest") {
    return {
      requiresPaidSeat: true,
      badgeLabelKo: "유료 시트 1개 필요",
      reasonKo: `워크스페이스 '${input.workspaceRole}' 역할은 기본 참여 시트 1개를 사용합니다.`,
    };
  }

  const hasPaidProjectPerm = input.projectPermissions.some((perm) => PAID_PROJECT_PERMISSIONS.has(perm));
  const hasPaidProcessPerm = input.processPermissions.some((perm) => PAID_PROCESS_PERMISSIONS.has(perm));

  if (hasPaidProjectPerm || hasPaidProcessPerm) {
    return {
      requiresPaidSeat: true,
      badgeLabelKo: "유료 시트 1개 필요 (편집 권한 포함)",
      reasonKo:
        "게스트 역할이지만 프로젝트 또는 공정에 '제한된 편집 허용'(버전 업로드·작업 완료) 이상 권한이 포함되어 시트 1개가 필요합니다.",
    };
  }

  return {
    requiresPaidSeat: false,
    badgeLabelKo: "무료 초대 (시트 불필요)",
    reasonKo:
      "게스트 역할이며 모든 프로젝트·공정이 '의견 허용' 또는 '보기 허용' 이하이므로 시트 차감 없이 무료로 초대할 수 있습니다.",
  };
}

/**
 * 보안 공유 링크 뷰어에 오버레이할 동적 워터마크 문구(`수신인 정보 + 조회 날짜`)를 생성한다.
 */
export function formatDynamicShareWatermark(
  recipientIdentifier: string,
  viewedAtDateIso: string,
): string {
  const recipient = recipientIdentifier.trim() || "외부 검수자";
  const datePart = viewedAtDateIso.slice(0, 10) || "2026-10-26";
  return `${recipient} · 열람일 ${datePart} · 무단 복제·유출 금지`;
}

/** 공유 링크 전달용 표준 안내 메시지 템플릿을 생성한다. */
export function buildProtectedShareMessageTemplate(
  config: ProtectedShareConfig,
  shareUrl: string,
): string {
  const lines = [
    `[보안 원고 공유] ${config.recipientIdentifier || "수신인"}님께 검수용 원고 링크를 전달드립니다.`,
    `- 포함 원고: ${config.selectedEpisodeProcessLabels.join(", ") || "선택된 회차·공정"}`,
    `- 링크: ${shareUrl}`,
    `- 만료일: ${config.expiresAtIso.slice(0, 10) || "별도 지정 없음"}`,
  ];
  if (config.password.trim()) {
    lines.push("- 비밀번호: 별도 전달된 비밀번호를 입력해 주세요.");
  }
  if (config.ndaBannerEnabled) {
    lines.push("- 안내: 열람 화면에 수신인 식별 워터마크와 기밀 유지(NDA) 보호가 적용되어 있습니다.");
  }
  return lines.join("\n");
}
