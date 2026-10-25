import { useState, type FocusEvent, type FormEvent } from "react";
import {
  ACON_USAGE_SCOPE_SPECS,
  auditStudioAssetEulaCompliance,
  countActiveRawEditableSeats,
  evaluatePersonalToCoUseUpgrade,
  executeBatchAssetSeatDistribution,
  revokeExpiredAssistantAssetSeats,
  STUDIO_ASSET_CATEGORY_LABELS,
  STUDIO_PLATFORM_SOURCE_LABELS,
  type AconUsageScopeTier,
  type AssetDeliveryMode,
  type StudioLicensedAssetItem,
} from "@/domains/market/public/market-studio-license-pool";
import {
  WEBTOON_SPECIALIZATION_PARTS,
  type WebtoonSpecializationCode,
} from "@/domains/collaboration/public/webtoon-assistant-outsourcing";

const INITIAL_STUDIO_ASSETS: readonly StudioLicensedAssetItem[] = [
  {
    assetId: "ast-acon-palace",
    titleKo: "로판 황궁 대연회장 & 황실 정원 통합 3D 패키지",
    platformSource: "acon3d",
    category: "3d-background",
    genreLabelKo: "판타지/로판",
    fileFormat: ".skp",
    usageScopeTier: "co-use-1",
    maxEditableSeats: 5,
    purchasePriceKrw: 185000,
    isSharedDriveMounted: true,
    attribution: {
      creatorPenName: "별빛스튜디오 (김작가)",
      workTitle: "황녀님의 회귀 시계",
      registeredAtIso: "2026-10-01",
      isWorkPubliclyLaunched: false,
    },
    seatAssignments: [
      {
        seatId: "seat-palace-1",
        assigneeId: "usr-lead",
        assigneePenName: "김작가 (메인)",
        partLabelKo: "3D 배경 담당 (모델링·추출·배치)",
        deliveryMode: "raw-editable-seat",
        assignedAtIso: "2026-10-02",
        contractEndDateIso: "2027-06-30",
        isRevoked: false,
      },
      {
        seatId: "seat-palace-2",
        assigneeId: "usr-sub-expired",
        assigneePenName: "박어시 (단기3D)",
        partLabelKo: "3D 배경 담당 (모델링·추출·배치)",
        deliveryMode: "raw-editable-seat",
        assignedAtIso: "2026-10-05",
        contractEndDateIso: "2026-10-20",
        isRevoked: false,
      },
    ],
  },
  {
    assetId: "ast-snaptoon-dungeon",
    titleKo: "현판 S급 게이트 보스룸 & 폐허 도시 스냅툰 배경",
    platformSource: "snaptoon-warehouse",
    category: "3d-background",
    genreLabelKo: "현대판타지/아포칼립스",
    fileFormat: ".snaptoon",
    usageScopeTier: "personal-1p",
    maxEditableSeats: 1,
    purchasePriceKrw: 68000,
    isSharedDriveMounted: false,
    attribution: {
      creatorPenName: "별빛스튜디오 (김작가)",
      workTitle: "황녀님의 회귀 시계",
      registeredAtIso: "2026-10-10",
      isWorkPubliclyLaunched: false,
    },
    seatAssignments: [
      {
        seatId: "seat-dungeon-1",
        assigneeId: "usr-lead",
        assigneePenName: "김작가 (메인)",
        partLabelKo: "3D 배경 담당 (모델링·추출·배치)",
        deliveryMode: "raw-editable-seat",
        assignedAtIso: "2026-10-10",
        contractEndDateIso: "2027-06-30",
        isRevoked: false,
      },
    ],
  },
  {
    assetId: "ast-pixel-romance-brush",
    titleKo: "로맨스 원꾸 홀로그램 빛망울·보석·꽃잎 브러시 60종",
    platformSource: "pixelstore",
    category: "brush-sut",
    genreLabelKo: "로판/현로 원꾸",
    fileFormat: ".sut",
    usageScopeTier: "co-use-5",
    maxEditableSeats: 15,
    purchasePriceKrw: 96000,
    isSharedDriveMounted: true,
    attribution: {
      creatorPenName: "별빛스튜디오 (김작가)",
      workTitle: "황녀님의 회귀 시계",
      registeredAtIso: "2026-10-12",
      isWorkPubliclyLaunched: false,
    },
    seatAssignments: [
      {
        seatId: "seat-brush-1",
        assigneeId: "usr-post-1",
        assigneePenName: "세아 (원꾸어시)",
        partLabelKo: "후보정·원꾸 담당 (식자 전 최종 마감)",
        deliveryMode: "raw-editable-seat",
        assignedAtIso: "2026-10-12",
        contractEndDateIso: "2026-12-31",
        isRevoked: false,
      },
    ],
  },
];

export function ProductionAssetLicenseDistributionSuite() {
  const [assets, setAssets] = useState<readonly StudioLicensedAssetItem[]>(INITIAL_STUDIO_ASSETS);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("ast-snaptoon-dungeon");
  const [targetUpgradeTier, setTargetUpgradeTier] = useState<AconUsageScopeTier>("co-use-1");

  // EULA 금지 행위 시뮬레이션 토글
  const [isSimpleRenderResaleAttempt, setIsSimpleRenderResaleAttempt] = useState<boolean>(false);
  const [isSecondaryToolificationAttempt, setIsSecondaryToolificationAttempt] = useState<boolean>(false);

  // 배치 시트 배포(`/api/v1/resources/batch`) 입력 상태
  const [assigneePenName, setAssigneePenName] = useState<string>("도윤 (3D배경 어시)");
  const [assigneePartCode, setAssigneePartCode] = useState<WebtoonSpecializationCode>("001.008");
  const [deliveryMode, setDeliveryMode] = useState<AssetDeliveryMode>("raw-editable-seat");
  const [contractEndDateIso, setContractEndDateIso] = useState<string>("2026-12-31");
  const [lastBatchMessage, setLastBatchMessage] = useState<string | null>(null);
  const [workTitleInvalidAfterBlur, setWorkTitleInvalidAfterBlur] = useState<boolean>(false);

  const selectedAsset = assets.find((item) => item.assetId === selectedAssetId) ?? assets[0];

  const eulaAudit = auditStudioAssetEulaCompliance({
    asset: selectedAsset,
    isSimpleRenderResaleAttempt,
    isSecondaryToolificationAttempt,
  });

  const upgradeEval = evaluatePersonalToCoUseUpgrade(selectedAsset, targetUpgradeTier);

  const updateSelectedAsset = (updater: (current: StudioLicensedAssetItem) => StudioLicensedAssetItem) => {
    setAssets((prev) =>
      prev.map((item) => (item.assetId === selectedAsset.assetId ? updater(item) : item)),
    );
  };

  const handleUpgradeTier = () => {
    if (!upgradeEval.canUpgrade) return;
    const spec = ACON_USAGE_SCOPE_SPECS[targetUpgradeTier];
    updateSelectedAsset((current) => ({
      ...current,
      usageScopeTier: targetUpgradeTier,
      maxEditableSeats: spec.maxEditableSeats,
      purchasePriceKrw: current.purchasePriceKrw + upgradeEval.estimatedUpgradeDiffKrw,
    }));
    setLastBatchMessage(
      `[${selectedAsset.titleKo}] ${spec.labelKo}으로 업그레이드 완료 (추가 차액 ${upgradeEval.estimatedUpgradeDiffKrw.toLocaleString("ko-KR")}원 반영)`,
    );
  };

  const handleBatchAssignSeat = () => {
    const partMeta =
      WEBTOON_SPECIALIZATION_PARTS.find((item) => item.code === assigneePartCode)
      ?? WEBTOON_SPECIALIZATION_PARTS[7];

    const result = executeBatchAssetSeatDistribution(assets, {
      batchId: `batch-${Date.now()}`,
      assetIds: [selectedAsset.assetId],
      assigneeId: `usr-${assigneePenName.trim() || "assistant"}`,
      assigneePenName: assigneePenName.trim() || "신규 어시스턴트",
      partLabelKo: partMeta.labelKo,
      deliveryMode,
      assignedAtIso: "2026-10-26",
      contractEndDateIso,
    });

    setAssets(result.updatedAssets);
    if (result.rejectedAssets.length > 0) {
      setLastBatchMessage(`배치 배포 차단 (${result.endpointPattern}): ${result.rejectedAssets[0]?.reasonKo}`);
    } else {
      setLastBatchMessage(
        `배치 배포 성공 (${result.endpointPattern}): '${assigneePenName}'님에게 [${selectedAsset.titleKo}] ${deliveryMode === "raw-editable-seat" ? "원본 편집 시트" : "2D 추출 원고 전달 권한(시트 미소모)"} 배정 완료`,
      );
    }
  };

  const handleRevokeExpiredSeats = () => {
    const result = revokeExpiredAssistantAssetSeats(assets, "2026-10-26");
    setAssets(result.updatedAssets);
    setLastBatchMessage(
      `계약 종료일(2026-10-26 이전) 경과 외주 어시스턴트 시트 ${result.revokedCount}건을 일괄 회수했습니다.`,
    );
  };

  // `accessible-error-announcement`: 사용자 상호작용 후에만 `:user-invalid` 및 `aria-invalid` 동기화
  const syncWorkTitleValidity = (
    event: FocusEvent<HTMLInputElement> | FormEvent<HTMLInputElement>,
    forceAfterBlur: boolean,
  ) => {
    const input = event.currentTarget;
    const isInvalid =
      typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:user-invalid)")
        ? input.matches(":user-invalid") || (forceAfterBlur && !input.value.trim())
        : (forceAfterBlur || workTitleInvalidAfterBlur) && !input.value.trim();
    setWorkTitleInvalidAfterBlur(isInvalid);
  };

  return (
    <section
      aria-label="스튜디오 3D 배경·브러시·이펙트 통합 라이선스 풀 및 어시스턴트 시트 배포 관리"
      data-testid="production-asset-license-distribution-suite"
      style={{
        display: "grid",
        gap: "0.9rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <strong style={{ fontSize: "0.9rem" }}>
            스튜디오 3D 배경·브러시·이펙트 통합 라이선스 풀 &amp; 어시스턴트 시트 배포 (에이콘3D · 픽셀 · 스냅툰 표준)
          </strong>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#475569" }}>
            개인 사용권(1인) vs 공동 사용권(1회권·5회권·무제한권) 구분, 창작자명·창작물명 의무 등록, 외부 공개 전 업그레이드 및 <code>/api/v1/resources/batch</code> 기반 시트 배포·계약 만료 회수를 통제합니다.
          </p>
        </div>
        <button
          type="button"
          data-testid="revoke-expired-seats-btn"
          onClick={handleRevokeExpiredSeats}
          style={{
            padding: "0.28rem 0.65rem",
            fontSize: "0.75rem",
            borderRadius: "6px",
            border: "1px solid #b45309",
            background: "#fef3c7",
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          외주 계약 만료자 시트 일괄 회수
        </button>
      </div>

      {/* 1. 보유 에셋 풀 카탈로그 선택 */}
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
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem", fontSize: "0.76rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 600 }}>
            관리 대상 스튜디오 에셋:
            <select
              aria-label="관리 대상 스튜디오 에셋 선택"
              data-testid="studio-asset-select"
              value={selectedAsset.assetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
            >
              {assets.map((asset) => {
                const activeSeats = countActiveRawEditableSeats(asset);
                const maxLabel = asset.maxEditableSeats === -1 ? "무제한" : `${asset.maxEditableSeats}석`;
                return (
                  <option key={asset.assetId} value={asset.assetId}>
                    [{STUDIO_PLATFORM_SOURCE_LABELS[asset.platformSource]}] {asset.titleKo} ({activeSeats}/{maxLabel})
                  </option>
                );
              })}
            </select>
          </label>
          <span
            data-testid="selected-asset-tier-pill"
            style={{
              padding: "0.2rem 0.55rem",
              borderRadius: "999px",
              background: selectedAsset.usageScopeTier === "personal-1p" ? "#fee2e2" : "#dbeafe",
              color: selectedAsset.usageScopeTier === "personal-1p" ? "#991b1b" : "#1e40af",
              fontWeight: 600,
            }}
          >
            {ACON_USAGE_SCOPE_SPECS[selectedAsset.usageScopeTier].labelKo} · 활성 원본 시트{" "}
            {countActiveRawEditableSeats(selectedAsset)}/
            {selectedAsset.maxEditableSeats === -1 ? "∞" : selectedAsset.maxEditableSeats}석
          </span>
          <span style={{ color: "#64748b" }}>
            분류: {STUDIO_ASSET_CATEGORY_LABELS[selectedAsset.category]} ({selectedAsset.genreLabelKo})
          </span>
        </div>

        {/* 2. 창작자명·창작물명 필수 등록 및 외부 공개 전 공동 사용권 업그레이드 */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem", fontSize: "0.75rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            창작자명(필명/스튜디오):
            <input
              type="text"
              aria-label="에셋 등록 창작자명"
              data-testid="asset-attribution-creator-input"
              value={selectedAsset.attribution.creatorPenName}
              onChange={(e) =>
                updateSelectedAsset((curr) => ({
                  ...curr,
                  attribution: { ...curr.attribution, creatorPenName: e.target.value },
                }))
              }
              style={{ width: "10rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>

          <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.15rem" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              창작물명(작품명):
              <input
                type="text"
                required
                aria-label="에셋 등록 창작물명"
                aria-invalid={workTitleInvalidAfterBlur ? "true" : undefined}
                aria-errormessage="asset-work-title-error"
                data-testid="asset-attribution-work-title-input"
                value={selectedAsset.attribution.workTitle}
                onChange={(e) =>
                  updateSelectedAsset((curr) => ({
                    ...curr,
                    attribution: { ...curr.attribution, workTitle: e.target.value },
                  }))
                }
                onBlur={(e) => syncWorkTitleValidity(e, true)}
                onInput={(e) => {
                  if (workTitleInvalidAfterBlur) syncWorkTitleValidity(e, false);
                }}
                style={{ width: "10rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
              />
            </label>
            {workTitleInvalidAfterBlur && (
              <span
                id="asset-work-title-error"
                role="alert"
                data-testid="asset-work-title-error"
                style={{ fontSize: "0.7rem", color: "#b91c1c" }}
              >
                저작권 보호를 위해 창작물명(작품명)을 반드시 기입해야 합니다.
              </span>
            )}
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="checkbox"
              data-testid="asset-work-public-launched-toggle"
              checked={selectedAsset.attribution.isWorkPubliclyLaunched}
              onChange={(e) =>
                updateSelectedAsset((curr) => ({
                  ...curr,
                  attribution: { ...curr.attribution, isWorkPubliclyLaunched: e.target.checked },
                }))
              }
            />
            창작물 외부 공개(연재 런칭) 완료 여부
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="checkbox"
              data-testid="asset-shared-drive-mounted-toggle"
              checked={selectedAsset.isSharedDriveMounted}
              onChange={(e) =>
                updateSelectedAsset((curr) => ({
                  ...curr,
                  isSharedDriveMounted: e.target.checked,
                }))
              }
            />
            어시스턴트 공용 드라이브 마운트
          </label>
        </div>

        {/* 개인 사용권 -> 공동 사용권 업그레이드 제어 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.45rem",
            padding: "0.45rem 0.65rem",
            borderRadius: "6px",
            background: upgradeEval.canUpgrade ? "#eff6ff" : "#f1f5f9",
            fontSize: "0.75rem",
          }}
        >
          <span data-testid="license-upgrade-eval-message">{upgradeEval.reasonKo}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <select
              aria-label="업그레이드 목표 공동 사용권 등급"
              data-testid="target-upgrade-tier-select"
              value={targetUpgradeTier}
              onChange={(e) => setTargetUpgradeTier(e.target.value as AconUsageScopeTier)}
              style={{ fontSize: "0.74rem", padding: "0.16rem 0.35rem" }}
            >
              <option value="co-use-1">공동 사용권 1회권 (5인)</option>
              <option value="co-use-5">공동 사용권 5회권 (15인)</option>
              <option value="co-use-unlimited">공동 사용권 무제한권</option>
            </select>
            <button
              type="button"
              data-testid="execute-license-upgrade-btn"
              disabled={!upgradeEval.canUpgrade}
              onClick={handleUpgradeTier}
              style={{
                padding: "0.2rem 0.55rem",
                fontSize: "0.74rem",
                borderRadius: "6px",
                border: "1px solid #2563eb",
                background: upgradeEval.canUpgrade ? "#2563eb" : "#cbd5e1",
                color: "#ffffff",
              }}
            >
              공동 사용권 전환
            </button>
          </div>
        </div>
      </div>

      {/* 3. 픽셀 `/api/v1/resources/batch` 기반 작가·파트별 어시스턴트 시트 배포 */}
      <div
        style={{
          display: "grid",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          fontSize: "0.75rem",
        }}
      >
        <strong>어시스턴트 에셋 시트 배치 할당 (<code>/api/v1/resources/batch</code>)</strong>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            배정 인원 필명:
            <input
              type="text"
              aria-label="시트 배정 어시스턴트 필명"
              data-testid="batch-assignee-pen-name-input"
              value={assigneePenName}
              onChange={(e) => setAssigneePenName(e.target.value)}
              style={{ width: "8.5rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            담당 파트:
            <select
              aria-label="시트 배정 담당 파트"
              value={assigneePartCode}
              onChange={(e) => setAssigneePartCode(e.target.value as WebtoonSpecializationCode)}
              style={{ fontSize: "0.74rem", padding: "0.18rem 0.35rem" }}
            >
              {WEBTOON_SPECIALIZATION_PARTS.map((part) => (
                <option key={part.code} value={part.code}>
                  [{part.code}] {part.labelKo}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            전달 방식:
            <select
              aria-label="에셋 전달 및 시트 소모 방식"
              data-testid="batch-delivery-mode-select"
              value={deliveryMode}
              onChange={(e) => setDeliveryMode(e.target.value as AssetDeliveryMode)}
              style={{ fontSize: "0.74rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="raw-editable-seat">원본 파일(.skp/.sut) 직접 편집 (시트 1석 소모)</option>
              <option value="flattened-2d-render-only">작가 추출 2D 원고만 전달 (시트 미소모)</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            외주 계약 종료일:
            <input
              type="text"
              aria-label="어시스턴트 외주 계약 종료일"
              value={contractEndDateIso}
              onChange={(e) => setContractEndDateIso(e.target.value)}
              style={{ width: "6.5rem", padding: "0.18rem 0.35rem", fontSize: "0.75rem" }}
            />
          </label>

          <button
            type="button"
            data-testid="batch-assign-seat-btn"
            onClick={handleBatchAssignSeat}
            style={{
              padding: "0.22rem 0.6rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #0f766e",
              background: "#ccfbf1",
              color: "#115e59",
              fontWeight: 600,
            }}
          >
            시트 배치 배정
          </button>
        </div>

        {lastBatchMessage && (
          <p
            role="status"
            data-testid="batch-distribution-status-message"
            style={{ margin: 0, fontWeight: 600, color: "#0f766e" }}
          >
            {lastBatchMessage}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {selectedAsset.seatAssignments.map((seat) => (
            <span
              key={seat.seatId}
              data-testid={`seat-chip-${seat.seatId}`}
              style={{
                padding: "0.2rem 0.5rem",
                borderRadius: "999px",
                background: seat.isRevoked
                  ? "#f1f5f9"
                  : seat.deliveryMode === "raw-editable-seat"
                    ? "#e0e7ff"
                    : "#dcfce7",
                color: seat.isRevoked
                  ? "#64748b"
                  : seat.deliveryMode === "raw-editable-seat"
                    ? "#3730a3"
                    : "#166534",
                textDecoration: seat.isRevoked ? "line-through" : "none",
                fontSize: "0.72rem",
              }}
            >
              {seat.assigneePenName} ({seat.deliveryMode === "raw-editable-seat" ? "원본시트" : "2D원고전달"} · 만료 {seat.contractEndDateIso}
              {seat.isRevoked ? " · 회수됨" : ""})
            </span>
          ))}
        </div>
      </div>

      {/* 4. 3대 EULA 금지 행위 감사 및 준수 상태 배너 */}
      <div
        style={{
          display: "grid",
          gap: "0.45rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: eulaAudit.isCompliant ? "#f0fdf4" : "#fef2f2",
          fontSize: "0.75rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.45rem" }}>
          <strong data-testid="eula-compliance-status-heading" style={{ color: eulaAudit.isCompliant ? "#166534" : "#991b1b" }}>
            EULA 실시간 감사 결과: {eulaAudit.isCompliant ? "라이선스 준수 (적법 배포 중)" : `약관 위반 위험 ${eulaAudit.violationsKo.length}건 감지`}
          </strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <input
                type="checkbox"
                data-testid="simulate-simple-render-resale-toggle"
                checked={isSimpleRenderResaleAttempt}
                onChange={(e) => setIsSimpleRenderResaleAttempt(e.target.checked)}
              />
              단순 이미지 추출 판매 차단 검사
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <input
                type="checkbox"
                data-testid="simulate-secondary-toolification-toggle"
                checked={isSecondaryToolificationAttempt}
                onChange={(e) => setIsSecondaryToolificationAttempt(e.target.checked)}
              />
              2차 도구화(재가공 판매) 차단 검사
            </label>
          </div>
        </div>

        {eulaAudit.violationsKo.length > 0 && (
          <ul role="alert" data-testid="eula-violation-list" style={{ margin: 0, paddingLeft: "1.1rem", color: "#b91c1c" }}>
            {eulaAudit.violationsKo.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
