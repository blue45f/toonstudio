import { useEffect, useRef, useState } from "react";
import {
  buildProtectedShareMessageTemplate,
  computeInviteSeatRequirement,
  EXPORT_KEEP_RATIO_MAX_PX,
  EXPORT_KEEP_RATIO_MIN_PX,
  formatDynamicShareWatermark,
  THUMBNAIL_MAX_PX,
  THUMBNAIL_MIN_PX,
  validateThumbnailSpecDimensions,
  type EpisodeThumbnailSpecPreset,
  type GovernanceProcessPermission,
  type GovernanceProjectPermission,
  type GovernanceWorkspaceRole,
  type ManuscriptExportConfig,
  type ManuscriptExportFormat,
  type ManuscriptExportQuality,
  type ManuscriptExportResizeMode,
  type ProtectedShareConfig,
  type PublishPlatformPreset,
} from "./production-workspace-governance-model";

const INITIAL_PLATFORMS: readonly PublishPlatformPreset[] = [
  {
    id: "plat-naver",
    name: "네이버웹툰",
    isActive: true,
    publishUrl: "https://comic.naver.com/webtoon/list?titleId=999001",
    startDateIso: "2026-11-01",
    isPublicSeries: true,
  },
  {
    id: "plat-kakao",
    name: "카카오페이지",
    isActive: true,
    publishUrl: "https://page.kakao.com/content/999002",
    startDateIso: "2026-11-15",
    isPublicSeries: false,
  },
];

const INITIAL_THUMBNAIL_SPECS: readonly EpisodeThumbnailSpecPreset[] = [
  { id: "spec-square", name: "정방형 대표 썸네일", widthPx: 1080, heightPx: 1080, isActive: true },
  { id: "spec-landscape", name: "가로형 회차 목록 썸네일", widthPx: 400, heightPx: 300, isActive: true },
  { id: "spec-portrait", name: "세로형 포스터 썸네일", widthPx: 720, heightPx: 960, isActive: false },
];

export function ProductionWorkspaceGovernanceSuite() {
  // 1. 연재처 카탈로그 및 썸네일 규격(150~1440px)
  const [platforms, setPlatforms] = useState<readonly PublishPlatformPreset[]>(INITIAL_PLATFORMS);
  const [thumbnailSpecs, setThumbnailSpecs] = useState<readonly EpisodeThumbnailSpecPreset[]>(INITIAL_THUMBNAIL_SPECS);
  const [newSpecName, setNewSpecName] = useState<string>("글로벌 플랫폼 회차 배너");
  const [newSpecWidth, setNewSpecWidth] = useState<number>(600);
  const [newSpecHeight, setNewSpecHeight] = useState<number>(400);
  const [specError, setSpecError] = useState<string | null>(null);

  // 2. 통합 구성원 초대 & 실시간 시트 필요 여부 계산기
  const [workspaceRole, setWorkspaceRole] = useState<GovernanceWorkspaceRole>("guest");
  const [projectPermission, setProjectPermission] = useState<GovernanceProjectPermission>("comment");
  const [processPermission, setProcessPermission] = useState<GovernanceProcessPermission>("comment");

  // 3. 3종 원고 내보내기 설정
  const [exportConfig, setExportConfig] = useState<ManuscriptExportConfig>({
    fileNamePrefix: "EP12_FINAL",
    resizeMode: "fixed-slice",
    fixedWidthPx: 720,
    fixedHeightPx: 1100,
    keepRatioWidthPx: 720,
    format: "jpg",
    quality: "best",
    includeEpisodeThumbnails: true,
  });

  // 4. 보안 공유 링크 (수신인 식별자 + 조회일 동적 워터마크 + NDA + 즉시 활성 토글)
  const [shareConfig, setShareConfig] = useState<ProtectedShareConfig>({
    shareId: "shr-ep12-review",
    recipientIdentifier: "편집부 김책임 PD (ext-pd@partner.co.kr)",
    password: "toon-review-2026",
    expiresAtIso: "2026-11-10",
    watermarkEnabled: true,
    ndaBannerEnabled: true,
    isActive: true,
    selectedEpisodeProcessLabels: ["12화 · 선화 v3", "12화 · 채색·음영 v3"],
  });
  const [copiedShareMessage, setCopiedShareMessage] = useState<string | null>(null);
  const permissionGuideDialogRef = useRef<HTMLDialogElement | null>(null);

  // `closedby="any"` 미지원 브라우저용 light-dismiss 폴백
  useEffect(() => {
    const dialog = permissionGuideDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleFallbackClick = (event: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientY < rect.top
        || event.clientY > rect.bottom
        || event.clientX < rect.left
        || event.clientX > rect.right;
      if (clickedOutside && dialog.open) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handleFallbackClick);
    return () => dialog.removeEventListener("click", handleFallbackClick);
  }, []);

  const seatRequirement = computeInviteSeatRequirement({
    workspaceRole,
    projectPermissions: [projectPermission],
    processPermissions: [processPermission],
  });

  const dynamicWatermarkText = formatDynamicShareWatermark(
    shareConfig.recipientIdentifier,
    "2026-10-26",
  );

  const handleAddThumbnailSpec = () => {
    const validation = validateThumbnailSpecDimensions(newSpecWidth, newSpecHeight);
    if (!validation.valid) {
      setSpecError(validation.errorKo);
      return;
    }
    setSpecError(null);
    setThumbnailSpecs((prev) => [
      ...prev,
      {
        id: `spec-custom-${prev.length + 1}`,
        name: newSpecName.trim() || "커스텀 규격",
        widthPx: Math.trunc(newSpecWidth),
        heightPx: Math.trunc(newSpecHeight),
        isActive: true,
      },
    ]);
  };

  const handleCopyShareMessage = () => {
    const template = buildProtectedShareMessageTemplate(
      shareConfig,
      `https://app.toonstudio.io/share/${shareConfig.shareId}`,
    );
    setCopiedShareMessage(template);
  };

  return (
    <section
      aria-label="연재처·썸네일 규격·통합 초대 시트 계산기·3종 내보내기·보안 공유 거버넌스"
      data-testid="production-workspace-governance-suite"
      style={{
        display: "grid",
        gap: "0.9rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      {/* 1. 연재처 관리 및 에피소드 썸네일 규격(150~1440px) */}
      <div
        style={{
          display: "grid",
          gap: "0.55rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <strong style={{ fontSize: "0.86rem" }}>
          연재처 카탈로그 &amp; 에피소드 썸네일 규격 관리 ({THUMBNAIL_MIN_PX}~{THUMBNAIL_MAX_PX}px)
        </strong>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {platforms.map((plat) => (
            <label
              key={plat.id}
              data-testid={`publish-platform-item-${plat.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.25rem 0.55rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "0.75rem",
              }}
            >
              <input
                type="checkbox"
                checked={plat.isActive}
                onChange={(e) =>
                  setPlatforms((prev) =>
                    prev.map((item) => (item.id === plat.id ? { ...item, isActive: e.target.checked } : item)),
                  )
                }
              />
              <strong>{plat.name}</strong>
              <span style={{ color: "#475569" }}>
                ({plat.startDateIso} · {plat.isPublicSeries ? "공개 연재" : "비공개 준비"})
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem", fontSize: "0.75rem" }}>
          <span>규격 이름:</span>
          <input
            type="text"
            aria-label="새 썸네일 규격 이름"
            value={newSpecName}
            onChange={(e) => setNewSpecName(e.target.value)}
            style={{ width: "10rem", padding: "0.18rem 0.4rem", fontSize: "0.75rem" }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            가로(px):
            <input
              type="number"
              aria-label="새 썸네일 가로 픽셀"
              data-testid="thumbnail-spec-width-input"
              value={newSpecWidth}
              onChange={(e) => setNewSpecWidth(Number(e.target.value) || 0)}
              style={{ width: "4.5rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            세로(px):
            <input
              type="number"
              aria-label="새 썸네일 세로 픽셀"
              data-testid="thumbnail-spec-height-input"
              value={newSpecHeight}
              onChange={(e) => setNewSpecHeight(Number(e.target.value) || 0)}
              style={{ width: "4.5rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>
          <button
            type="button"
            data-testid="add-thumbnail-spec-btn"
            onClick={handleAddThumbnailSpec}
            style={{ padding: "0.2rem 0.55rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #0284c7" }}
          >
            썸네일 규격 추가
          </button>
        </div>

        {specError && (
          <p role="alert" data-testid="thumbnail-spec-error-alert" style={{ margin: 0, fontSize: "0.75rem", color: "#b91c1c" }}>
            {specError}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {thumbnailSpecs.map((spec) => (
            <span
              key={spec.id}
              data-testid={`thumbnail-spec-chip-${spec.id}`}
              style={{
                padding: "0.2rem 0.5rem",
                borderRadius: "999px",
                background: spec.isActive ? "#e0f2fe" : "#f1f5f9",
                color: spec.isActive ? "#0369a1" : "#64748b",
                fontSize: "0.73rem",
              }}
            >
              {spec.name} ({spec.widthPx}×{spec.heightPx}px)
            </span>
          ))}
        </div>
      </div>

      {/* 2. 통합 구성원 초대 & 실시간 시트 필요 여부 계산기 + 7×6 권한 안내 모달 */}
      <div
        style={{
          display: "grid",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.86rem" }}>통합 구성원 초대 &amp; 실시간 시트 필요 여부 판별기</strong>
          <button
            type="button"
            data-testid="open-permission-guide-modal-btn"
            onClick={() => permissionGuideDialogRef.current?.showModal()}
            style={{
              padding: "0.22rem 0.55rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #4f46e5",
              color: "#312e81",
              background: "#eef2ff",
            }}
          >
            7×6 권한 안내 보기
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem", fontSize: "0.75rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            워크스페이스 역할:
            <select
              aria-label="초대 워크스페이스 역할"
              data-testid="invite-workspace-role-select"
              value={workspaceRole}
              onChange={(e) => setWorkspaceRole(e.target.value as GovernanceWorkspaceRole)}
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="owner">소유자 (Owner)</option>
              <option value="admin">관리자 (Admin)</option>
              <option value="member">멤버 (Member)</option>
              <option value="guest">게스트 (Guest)</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            프로젝트 권한(7단계):
            <select
              aria-label="초대 프로젝트 권한"
              data-testid="invite-project-perm-select"
              value={projectPermission}
              onChange={(e) => setProjectPermission(e.target.value as GovernanceProjectPermission)}
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="full">전체 허용</option>
              <option value="manage">관리 허용</option>
              <option value="edit">편집 허용</option>
              <option value="limited-edit">제한된 편집 허용</option>
              <option value="comment">의견 허용 (무료 게스트 가능)</option>
              <option value="view">보기 허용 (무료 게스트 가능)</option>
              <option value="access">접근 허용 (무료 게스트 가능)</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            공정 권한(6단계):
            <select
              aria-label="초대 공정 권한"
              data-testid="invite-process-perm-select"
              value={processPermission}
              onChange={(e) => setProcessPermission(e.target.value as GovernanceProcessPermission)}
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="manage">관리 허용</option>
              <option value="edit">편집 허용</option>
              <option value="limited-edit">제한된 편집 허용 (버전 업로드·작업 완료)</option>
              <option value="comment">의견 허용 (무료 게스트 가능)</option>
              <option value="view">보기 허용 (무료 게스트 가능)</option>
              <option value="none">권한 없음</option>
            </select>
          </label>
        </div>

        <div
          data-testid="invite-seat-requirement-banner"
          style={{
            padding: "0.45rem 0.65rem",
            borderRadius: "6px",
            background: seatRequirement.requiresPaidSeat ? "#fef3c7" : "#dcfce7",
            color: seatRequirement.requiresPaidSeat ? "#92400e" : "#166534",
            fontSize: "0.76rem",
          }}
        >
          <strong>[{seatRequirement.badgeLabelKo}]</strong> {seatRequirement.reasonKo}
        </div>
      </div>

      {/* 3. 3종 원고 내보내기(고정 사이즈 분할 720×1100 / 비율 유지 360~1440px / 원본) */}
      <div
        style={{
          display: "grid",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <strong style={{ fontSize: "0.86rem" }}>
          원고 내보내기 3종 리사이즈 (고정 사이즈 분할 720×1100 · 비율 유지 {EXPORT_KEEP_RATIO_MIN_PX}~{EXPORT_KEEP_RATIO_MAX_PX}px · 원본)
        </strong>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem", fontSize: "0.75rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            파일명 접두사:
            <input
              type="text"
              aria-label="내보내기 파일명 접두사"
              value={exportConfig.fileNamePrefix}
              onChange={(e) => setExportConfig((prev) => ({ ...prev, fileNamePrefix: e.target.value }))}
              style={{ width: "8rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            리사이즈 방식:
            <select
              aria-label="원고 내보내기 리사이즈 방식"
              data-testid="export-resize-mode-select"
              value={exportConfig.resizeMode}
              onChange={(e) =>
                setExportConfig((prev) => ({ ...prev, resizeMode: e.target.value as ManuscriptExportResizeMode }))
              }
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="fixed-slice">고정 사이즈 분할 ({exportConfig.fixedWidthPx}×{exportConfig.fixedHeightPx}px)</option>
              <option value="keep-ratio">비율 유지 리사이즈 ({exportConfig.keepRatioWidthPx}px)</option>
              <option value="original">원본 해상도 유지</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            포맷:
            <select
              aria-label="내보내기 파일 포맷"
              value={exportConfig.format}
              onChange={(e) =>
                setExportConfig((prev) => ({ ...prev, format: e.target.value as ManuscriptExportFormat }))
              }
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            품질:
            <select
              aria-label="내보내기 이미지 품질"
              value={exportConfig.quality}
              onChange={(e) =>
                setExportConfig((prev) => ({ ...prev, quality: e.target.value as ManuscriptExportQuality }))
              }
              style={{ fontSize: "0.75rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="best">최상 (Best)</option>
              <option value="high">상 (High)</option>
              <option value="standard">보통 (Standard)</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="checkbox"
              checked={exportConfig.includeEpisodeThumbnails}
              onChange={(e) =>
                setExportConfig((prev) => ({ ...prev, includeEpisodeThumbnails: e.target.checked }))
              }
            />
            회차 썸네일 동반 ZIP 패키징
          </label>
        </div>
      </div>

      {/* 4. 보안 공유 링크 (수신인 식별자 + 조회 날짜 동적 워터마크, NDA, 즉시 활성 토글, 메시지 복사) */}
      <div
        style={{
          display: "grid",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.86rem" }}>
            보안 원고 공유 링크 (수신인 + 조회일 동적 워터마크 · NDA 서약 · 즉시 활성 제어)
          </strong>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <input
                type="checkbox"
                data-testid="protected-share-active-toggle"
                checked={shareConfig.isActive}
                onChange={(e) => setShareConfig((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              링크 활성화 상태 ({shareConfig.isActive ? "열람 가능" : "즉시 차단됨"})
            </label>

            <button
              type="button"
              data-testid="copy-protected-share-message-btn"
              onClick={handleCopyShareMessage}
              style={{
                padding: "0.22rem 0.6rem",
                fontSize: "0.75rem",
                borderRadius: "6px",
                border: "1px solid #0f766e",
                background: "#ccfbf1",
                color: "#115e59",
              }}
            >
              공유 안내 메시지 복사
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem", fontSize: "0.75rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            수신인 식별자:
            <input
              type="text"
              aria-label="보안 공유 수신인 식별자"
              data-testid="protected-share-recipient-input"
              value={shareConfig.recipientIdentifier}
              onChange={(e) => setShareConfig((prev) => ({ ...prev, recipientIdentifier: e.target.value }))}
              style={{ width: "16rem", padding: "0.18rem 0.4rem", fontSize: "0.75rem" }}
            />
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="checkbox"
              checked={shareConfig.watermarkEnabled}
              onChange={(e) => setShareConfig((prev) => ({ ...prev, watermarkEnabled: e.target.checked }))}
            />
            수신인+조회일 워터마크 표시
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="checkbox"
              checked={shareConfig.ndaBannerEnabled}
              onChange={(e) => setShareConfig((prev) => ({ ...prev, ndaBannerEnabled: e.target.checked }))}
            />
            NDA 기밀 유지 보호 배너
          </label>
        </div>

        {shareConfig.watermarkEnabled && (
          <div
            data-testid="dynamic-share-watermark-preview"
            style={{
              padding: "0.35rem 0.6rem",
              borderRadius: "6px",
              background: "#1e293b",
              color: "#f8fafc",
              fontSize: "0.74rem",
              fontFamily: "monospace",
            }}
          >
            워터마크 오버레이 미리보기: {dynamicWatermarkText}
          </div>
        )}

        {copiedShareMessage && (
          <pre
            data-testid="copied-share-message-preview"
            style={{
              margin: 0,
              padding: "0.5rem 0.65rem",
              borderRadius: "6px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              fontSize: "0.73rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {copiedShareMessage}
          </pre>
        )}
      </div>

      {/* 7×6 권한 안내 모달 (`closedby="any"` + light-dismiss 폴백) */}
      <dialog
        ref={permissionGuideDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby="permission-guide-dialog-title"
        data-testid="permission-guide-dialog"
        style={{
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          padding: "1rem 1.25rem",
          maxWidth: "34rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 id="permission-guide-dialog-title" style={{ margin: 0, fontSize: "0.95rem" }}>
              프로젝트(7단계) × 공정(6단계) 세부 권한 및 시트 과금 기준 안내
            </h3>
            <button
              type="button"
              onClick={() => permissionGuideDialogRef.current?.close()}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
            >
              닫기
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.79rem", lineHeight: 1.6 }}>
            <li><strong>전체 허용 / 관리 허용 / 편집 허용</strong>: 회차·공정 설정 및 공정 마감 확정 가능 (유료 시트 필요)</li>
            <li><strong>제한된 편집 허용</strong>: 본인 담당 공정의 새 버전 업로드 및 1단계 작업 완료 기록 가능 (유료 시트 필요)</li>
            <li><strong>의견 허용</strong>: 원고 열람 및 드로잉·코멘트 피드백 작성 가능 (게스트 역할 시 무료 초대)</li>
            <li><strong>보기 허용 / 접근 허용</strong>: 공개된 원고 및 피드백 열람 전용 (게스트 역할 시 무료 초대)</li>
          </ul>
        </div>
      </dialog>
    </section>
  );
}
