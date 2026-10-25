/**
 * 스튜디오 3D 배경·브러시·이펙트 통합 라이선스 풀(Pool) 및 어시스턴트 시트 배포·회수 엔진.
 *
 * REA 클린룸 역공학 근거:
 * - 에이콘3D (`https://www.acon3d.com/ko`, `/ko/faqs/28`, `/ko/faqs/32`):
 *   - 작품 수가 아닌 "원본 에셋 파일을 실제로 편집·가공하거나 접근 가능한 인원수" 기준 사용권 구분:
 *     `개인 사용권(1인)` vs `공동 사용권(1회권 / 5회권 / 무제한권)`
 *   - 저작권 확인 및 법적 보호를 위한 구매자 `창작자명(필명)` 및 `창작물명(작품명)` 의무 등록
 *   - `개인 사용권` → `공동 사용권` 업그레이드는 반드시 **창작물 외부 공개(연재 런칭) 전**에만 가능
 *   - 3대 금지 행위: (1) 비배정 인원 원본 재배포·공유 드라이브 노출 금지, (2) 단순 이미지 추출 재판매 금지, (3) 2차 도구화 금지
 * - 픽셀 / 픽셀스토어 (`https://pixelstore.kr`):
 *   - `/api/v1/store`, `/api/v1/resources/batch` 기반 브러시·3D·화상소재·식자효과음 배치 배포 아키텍처
 * - 스냅툰 웨어하우스 (`https://snaptoonwarehouse.com`):
 *   - 웹툰 장르별 3D 배경(로판 황궁·현대 오피스·무협 객잔·아포칼립스·학교·병원/법원 등) 및 클립스튜디오·스냅툰 파이프라인
 */

export type StudioAssetPlatformSource = "acon3d" | "pixelstore" | "snaptoon-warehouse" | "toonstudio-market";

export type StudioAssetCategory =
  | "3d-background"
  | "3d-prop-vehicle"
  | "brush-sut"
  | "image-effect"
  | "sfx-typography";

export type StudioAssetFileFormat =
  | ".skp"
  | ".blend"
  | ".snaptoon"
  | ".sut"
  | ".clip"
  | ".psd"
  | ".png"
  | ".fbx";

export type AconUsageScopeTier =
  | "personal-1p"
  | "co-use-1"
  | "co-use-5"
  | "co-use-unlimited";

export type AssetDeliveryMode =
  | "raw-editable-seat"
  | "flattened-2d-render-only";

export interface WorkLicenseAttributionRegistration {
  readonly creatorPenName: string;
  readonly workTitle: string;
  readonly registeredAtIso: string;
  readonly isWorkPubliclyLaunched: boolean;
}

export interface StudioAssetSeatAssignment {
  readonly seatId: string;
  readonly assigneeId: string;
  readonly assigneePenName: string;
  readonly partLabelKo: string;
  readonly deliveryMode: AssetDeliveryMode;
  readonly assignedAtIso: string;
  readonly contractEndDateIso: string;
  readonly isRevoked: boolean;
}

export interface StudioLicensedAssetItem {
  readonly assetId: string;
  readonly titleKo: string;
  readonly platformSource: StudioAssetPlatformSource;
  readonly category: StudioAssetCategory;
  readonly genreLabelKo: string;
  readonly fileFormat: StudioAssetFileFormat;
  readonly usageScopeTier: AconUsageScopeTier;
  readonly maxEditableSeats: number; // 1 for personal-1p, 5 for co-use-1/5, -1 for unlimited
  readonly purchasePriceKrw: number;
  readonly isSharedDriveMounted: boolean;
  readonly attribution: WorkLicenseAttributionRegistration;
  readonly seatAssignments: readonly StudioAssetSeatAssignment[];
}

export interface LicenseUpgradeEvaluation {
  readonly canUpgrade: boolean;
  readonly currentTier: AconUsageScopeTier;
  readonly targetTier: AconUsageScopeTier;
  readonly estimatedUpgradeDiffKrw: number;
  readonly reasonKo: string;
}

export interface StudioAssetEulaAuditInput {
  readonly asset: StudioLicensedAssetItem;
  readonly isSimpleRenderResaleAttempt: boolean;
  readonly isSecondaryToolificationAttempt: boolean;
}

export interface StudioAssetEulaAuditResult {
  readonly isCompliant: boolean;
  readonly activeRawEditableSeatCount: number;
  readonly flattenedRenderParticipantCount: number;
  readonly violationsKo: readonly string[];
  readonly advisoriesKo: readonly string[];
}

export interface BatchSeatDistributionRequest {
  readonly batchId: string;
  readonly assetIds: readonly string[];
  readonly assigneeId: string;
  readonly assigneePenName: string;
  readonly partLabelKo: string;
  readonly deliveryMode: AssetDeliveryMode;
  readonly assignedAtIso: string;
  readonly contractEndDateIso: string;
}

export interface BatchSeatDistributionResponse {
  readonly batchId: string;
  readonly endpointPattern: "/api/v1/resources/batch";
  readonly updatedAssets: readonly StudioLicensedAssetItem[];
  readonly succeededAssetIds: readonly string[];
  readonly rejectedAssets: readonly { readonly assetId: string; readonly reasonKo: string }[];
}

export const ACON_USAGE_SCOPE_SPECS: Readonly<
  Record<
    AconUsageScopeTier,
    {
      readonly labelKo: string;
      readonly maxEditableSeats: number;
      readonly priceMultiplier: number;
      readonly allowSharedDriveRawAccess: boolean;
      readonly summaryKo: string;
    }
  >
> = Object.freeze({
  "personal-1p": {
    labelKo: "개인 사용권 (1인 원본 편집 전용)",
    maxEditableSeats: 1,
    priceMultiplier: 1.0,
    allowSharedDriveRawAccess: false,
    summaryKo:
      "구매자 본인 1인만 원본 파일을 편집·가공 가능. 본인 추출 2D 원고 이미지를 어시스턴트에게 전달하는 것만 허용되며 원본 공유 불가.",
  },
  "co-use-1": {
    labelKo: "공동 사용권 1회권 (팀 최대 5인 원본 편집)",
    maxEditableSeats: 5,
    priceMultiplier: 2.5,
    allowSharedDriveRawAccess: true,
    summaryKo:
      "지정된 단일 창작물(작품) 내에서 메인 작가 및 어시스턴트 최대 5인이 원본 파일을 공동 편집·접근 가능.",
  },
  "co-use-5": {
    labelKo: "공동 사용권 5회권 (스튜디오 다작 15인 풀)",
    maxEditableSeats: 15,
    priceMultiplier: 4.0,
    allowSharedDriveRawAccess: true,
    summaryKo:
      "스튜디오 내 최대 5개 창작물·15인 이내 소속 작가 및 외주 어시스턴트에게 시트 할당·회수 가능.",
  },
  "co-use-unlimited": {
    labelKo: "공동 사용권 무제한권 (법인 엔터프라이즈)",
    maxEditableSeats: -1,
    priceMultiplier: 6.5,
    allowSharedDriveRawAccess: true,
    summaryKo:
      "법인 스튜디오·에이전시 전 작품 및 소속·외주 인원수 제한 없이 원본 에셋 시트 배포 가능.",
  },
});

export const STUDIO_ASSET_CATEGORY_LABELS: Readonly<Record<StudioAssetCategory, string>> = Object.freeze({
  "3d-background": "3D 배경·건축물 (.skp / .snaptoon / .blend)",
  "3d-prop-vehicle": "3D 소품·탈것·무기 (.skp / .fbx)",
  "brush-sut": "브러시·펜·원꾸 소재 (.sut / .abr)",
  "image-effect": "화상소재·이펙트·텍스처 (.clip / .psd / .png)",
  "sfx-typography": "식자·효과음·말풍선 타이포 (.clip / .ai)",
});

export const STUDIO_PLATFORM_SOURCE_LABELS: Readonly<Record<StudioAssetPlatformSource, string>> = Object.freeze({
  acon3d: "에이콘3D (ACON3D)",
  pixelstore: "픽셀스토어 (PIXEL)",
  "snaptoon-warehouse": "스냅툰 웨어하우스",
  "toonstudio-market": "툰스튜디오 에셋 마켓",
});

/**
 * 원본 파일을 직접 편집(`raw-editable-seat`)하는 활성 시트 수만 집계한다.
 * 메인 작가가 2D 이미지로 렌더링·추출한 원고만 전달받는(`flattened-2d-render-only`) 어시스턴트는
 * 에이콘3D 약관상 원본 편집 인원수에 포함되지 않는다.
 */
export function countActiveRawEditableSeats(asset: StudioLicensedAssetItem): number {
  return asset.seatAssignments.filter(
    (seat) => !seat.isRevoked && seat.deliveryMode === "raw-editable-seat",
  ).length;
}

/**
 * 에이콘3D `/ko/faqs/32` 기준:
 * `개인 사용권(personal-1p)`에서 `공동 사용권(co-use-*)`으로의 업그레이드는
 * 반드시 **창작물 외부 공개(연재 런칭) 전(`!isWorkPubliclyLaunched`)**에만 허용된다.
 */
export function evaluatePersonalToCoUseUpgrade(
  asset: StudioLicensedAssetItem,
  targetTier: AconUsageScopeTier,
): LicenseUpgradeEvaluation {
  if (targetTier === "personal-1p") {
    return {
      canUpgrade: false,
      currentTier: asset.usageScopeTier,
      targetTier,
      estimatedUpgradeDiffKrw: 0,
      reasonKo: "공동 사용권에서 개인 사용권으로의 다운그레이드는 지원되지 않습니다.",
    };
  }

  if (asset.usageScopeTier === targetTier) {
    return {
      canUpgrade: false,
      currentTier: asset.usageScopeTier,
      targetTier,
      estimatedUpgradeDiffKrw: 0,
      reasonKo: "이미 동일한 공동 사용권 등급이 적용되어 있습니다.",
    };
  }

  if (asset.usageScopeTier === "personal-1p" && asset.attribution.isWorkPubliclyLaunched) {
    return {
      canUpgrade: false,
      currentTier: asset.usageScopeTier,
      targetTier,
      estimatedUpgradeDiffKrw: 0,
      reasonKo:
        "창작물이 이미 외부에 공개(연재 런칭)된 이후에는 개인 사용권을 공동 사용권으로 전환할 수 없습니다 (에이콘3D 약관 제32항). 신규 공동 사용권을 별도 구매해야 합니다.",
    };
  }

  const currentMultiplier = ACON_USAGE_SCOPE_SPECS[asset.usageScopeTier].priceMultiplier;
  const targetMultiplier = ACON_USAGE_SCOPE_SPECS[targetTier].priceMultiplier;
  const basePrice = Math.round(asset.purchasePriceKrw / currentMultiplier);
  const estimatedUpgradeDiffKrw = Math.max(
    0,
    Math.round(basePrice * (targetMultiplier - currentMultiplier)),
  );

  return {
    canUpgrade: true,
    currentTier: asset.usageScopeTier,
    targetTier,
    estimatedUpgradeDiffKrw,
    reasonKo: `창작물 외부 공개 전이므로 ${ACON_USAGE_SCOPE_SPECS[targetTier].labelKo}으로 차액(${estimatedUpgradeDiffKrw.toLocaleString("ko-KR")}원) 업그레이드가 가능합니다.`,
  };
}

/**
 * 에이콘3D·픽셀스토어·스냅툰 웨어하우스 EULA 준수 여부를 실시간 감사한다.
 */
export function auditStudioAssetEulaCompliance(
  input: StudioAssetEulaAuditInput,
): StudioAssetEulaAuditResult {
  const { asset, isSimpleRenderResaleAttempt, isSecondaryToolificationAttempt } = input;
  const violationsKo: string[] = [];
  const advisoriesKo: string[] = [];

  const activeRawSeats = asset.seatAssignments.filter(
    (seat) => !seat.isRevoked && seat.deliveryMode === "raw-editable-seat",
  );
  const flattenedParticipants = asset.seatAssignments.filter(
    (seat) => !seat.isRevoked && seat.deliveryMode === "flattened-2d-render-only",
  );

  // 1. 창작자명·창작물명 필수 등록 확인 (`/ko/faqs/28`)
  if (!asset.attribution.creatorPenName.trim() || !asset.attribution.workTitle.trim()) {
    violationsKo.push(
      "저작권 확인 보호를 위한 '창작자명(필명)' 또는 '창작물명(작품명)'이 등록되지 않았습니다.",
    );
  } else {
    advisoriesKo.push(
      `저작권 보호 등록 완료: 창작자명 '${asset.attribution.creatorPenName}' · 창작물명 '${asset.attribution.workTitle}'`,
    );
  }

  // 2. 개인 사용권인데 공용 드라이브에 마운트하거나 2인 이상 원본 편집 시트 배정한 경우 (`/ko/faqs/32`)
  if (asset.usageScopeTier === "personal-1p") {
    if (asset.isSharedDriveMounted) {
      violationsKo.push(
        "개인 사용권 에셋이 제3자(어시스턴트)가 접근 가능한 공용 클라우드/드라이브에 마운트되어 있습니다. 공동 사용권이 필요합니다.",
      );
    }
    if (activeRawSeats.length > 1) {
      violationsKo.push(
        `개인 사용권은 구매자 본인 1인만 원본 파일(${asset.fileFormat})을 편집할 수 있으나 현재 ${activeRawSeats.length}명에게 원본 시트가 배정되었습니다.`,
      );
    }
  }

  // 3. 공동 사용권 최대 편집 시트 초과 여부
  if (asset.maxEditableSeats !== -1 && activeRawSeats.length > asset.maxEditableSeats) {
    violationsKo.push(
      `허용된 원본 편집 인원(${asset.maxEditableSeats}명)을 초과하여 ${activeRawSeats.length}명이 배정되었습니다.`,
    );
  }

  // 4. 단순 이미지 추출 판매 및 2차 도구화 금지
  if (isSimpleRenderResaleAttempt) {
    violationsKo.push(
      "금지 행위 감지: 3D 배경·소품을 단순 렌더링 또는 색보정만 거쳐 배경 이미지팩/스톡으로 재판매할 수 없습니다.",
    );
  }
  if (isSecondaryToolificationAttempt) {
    violationsKo.push(
      "금지 행위 감지: 구매한 브러시·3D 소재를 변형하여 새로운 브러시/3D 에셋 상품으로 판매하는 '2차 도구화'는 엄격히 금지됩니다.",
    );
  }

  if (flattenedParticipants.length > 0) {
    advisoriesKo.push(
      `2D 추출 원고만 전달받는 어시스턴트(${flattenedParticipants.length}명)는 원본 편집 시트를 소모하지 않고 적법하게 협업 중입니다.`,
    );
  }

  return {
    isCompliant: violationsKo.length === 0,
    activeRawEditableSeatCount: activeRawSeats.length,
    flattenedRenderParticipantCount: flattenedParticipants.length,
    violationsKo,
    advisoriesKo,
  };
}

/**
 * 픽셀스토어 `/api/v1/resources/batch` 패턴에 따라 스튜디오 보유 에셋들을
 * 특정 작가 또는 파트별 어시스턴트에게 일괄 시트 배정한다.
 */
export function executeBatchAssetSeatDistribution(
  assets: readonly StudioLicensedAssetItem[],
  request: BatchSeatDistributionRequest,
): BatchSeatDistributionResponse {
  const succeededAssetIds: string[] = [];
  const rejectedAssets: { readonly assetId: string; readonly reasonKo: string }[] = [];

  const updatedAssets = assets.map((asset) => {
    if (!request.assetIds.includes(asset.assetId)) {
      return asset;
    }

    // 창작자명·창작물명 미등록 시 원본 배포 차단
    if (!asset.attribution.creatorPenName.trim() || !asset.attribution.workTitle.trim()) {
      rejectedAssets.push({
        assetId: asset.assetId,
        reasonKo: "창작자명·창작물명이 미등록된 에셋은 배포할 수 없습니다.",
      });
      return asset;
    }

    const currentRawSeats = countActiveRawEditableSeats(asset);
    const willConsumeRawSeat = request.deliveryMode === "raw-editable-seat";

    if (willConsumeRawSeat && asset.maxEditableSeats !== -1 && currentRawSeats + 1 > asset.maxEditableSeats) {
      rejectedAssets.push({
        assetId: asset.assetId,
        reasonKo: `${asset.titleKo}: 허용된 원본 편집 시트(${asset.maxEditableSeats}석)가 모두 소진되었습니다. 공동 사용권 등급 업그레이드 또는 2D 렌더링 전달 모드를 사용하세요.`,
      });
      return asset;
    }

    const newSeat: StudioAssetSeatAssignment = {
      seatId: `seat-${asset.assetId}-${request.assigneeId}-${asset.seatAssignments.length + 1}`,
      assigneeId: request.assigneeId,
      assigneePenName: request.assigneePenName,
      partLabelKo: request.partLabelKo,
      deliveryMode: request.deliveryMode,
      assignedAtIso: request.assignedAtIso,
      contractEndDateIso: request.contractEndDateIso,
      isRevoked: false,
    };

    succeededAssetIds.push(asset.assetId);
    return {
      ...asset,
      seatAssignments: [...asset.seatAssignments, newSeat],
    };
  });

  return {
    batchId: request.batchId,
    endpointPattern: "/api/v1/resources/batch",
    updatedAssets,
    succeededAssetIds,
    rejectedAssets,
  };
}

/**
 * 단기 외주 어시스턴트의 계약 종료일(`contractEndDateIso`)이 기준일(`referenceDateIso`)보다 이전인 경우
 * 배정된 원본 에셋 시트를 일괄 회수하여 무단 보유 및 시트 누수를 방지한다.
 */
export function revokeExpiredAssistantAssetSeats(
  assets: readonly StudioLicensedAssetItem[],
  referenceDateIso: string,
): {
  readonly updatedAssets: readonly StudioLicensedAssetItem[];
  readonly revokedCount: number;
} {
  let revokedCount = 0;
  const updatedAssets = assets.map((asset) => {
    const nextAssignments = asset.seatAssignments.map((seat) => {
      if (!seat.isRevoked && seat.contractEndDateIso < referenceDateIso) {
        revokedCount += 1;
        return { ...seat, isRevoked: true };
      }
      return seat;
    });
    return {
      ...asset,
      seatAssignments: nextAssignments,
    };
  });

  return {
    updatedAssets,
    revokedCount,
  };
}
