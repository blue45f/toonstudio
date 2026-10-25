import { describe, expect, it } from "vitest";
import {
  auditStudioAssetEulaCompliance,
  countActiveRawEditableSeats,
  evaluatePersonalToCoUseUpgrade,
  executeBatchAssetSeatDistribution,
  revokeExpiredAssistantAssetSeats,
  type StudioLicensedAssetItem,
} from "./market-studio-license-pool";

const BASE_PERSONAL_ASSET: StudioLicensedAssetItem = {
  assetId: "ast-test-1",
  titleKo: "스냅툰 황궁 복도 3D 배경",
  platformSource: "acon3d",
  category: "3d-background",
  genreLabelKo: "로판",
  fileFormat: ".skp",
  usageScopeTier: "personal-1p",
  maxEditableSeats: 1,
  purchasePriceKrw: 50000,
  isSharedDriveMounted: false,
  attribution: {
    creatorPenName: "별빛작가",
    workTitle: "황궁의 비밀",
    registeredAtIso: "2026-10-01",
    isWorkPubliclyLaunched: false,
  },
  seatAssignments: [
    {
      seatId: "seat-1",
      assigneeId: "usr-owner",
      assigneePenName: "별빛작가",
      partLabelKo: "3D 배경 담당",
      deliveryMode: "raw-editable-seat",
      assignedAtIso: "2026-10-01",
      contractEndDateIso: "2027-12-31",
      isRevoked: false,
    },
  ],
};

describe("market-studio-license-pool (에이콘3D · 픽셀스토어 · 스냅툰 라이선스 풀 모델)", () => {
  it("창작물 외부 공개(연재 런칭) 전에는 개인 사용권을 공동 사용권으로 차액 업그레이드할 수 있으나 공개 후에는 차단한다", () => {
    const preLaunchUpgrade = evaluatePersonalToCoUseUpgrade(BASE_PERSONAL_ASSET, "co-use-1");
    expect(preLaunchUpgrade.canUpgrade).toBe(true);
    expect(preLaunchUpgrade.estimatedUpgradeDiffKrw).toBe(75000); // 50,000 * (2.5 - 1.0)

    const launchedAsset: StudioLicensedAssetItem = {
      ...BASE_PERSONAL_ASSET,
      attribution: {
        ...BASE_PERSONAL_ASSET.attribution,
        isWorkPubliclyLaunched: true,
      },
    };
    const postLaunchUpgrade = evaluatePersonalToCoUseUpgrade(launchedAsset, "co-use-1");
    expect(postLaunchUpgrade.canUpgrade).toBe(false);
    expect(postLaunchUpgrade.reasonKo).toContain("외부에 공개(연재 런칭)된 이후에는");
  });

  it("창작자명·창작물명 누락, 개인 사용권 공용 드라이브 노출, 단순 이미지 추출 판매, 2차 도구화를 EULA 위반으로 검출한다", () => {
    const compliantAudit = auditStudioAssetEulaCompliance({
      asset: BASE_PERSONAL_ASSET,
      isSimpleRenderResaleAttempt: false,
      isSecondaryToolificationAttempt: false,
    });
    expect(compliantAudit.isCompliant).toBe(true);

    const violatedAudit = auditStudioAssetEulaCompliance({
      asset: {
        ...BASE_PERSONAL_ASSET,
        isSharedDriveMounted: true,
        attribution: { ...BASE_PERSONAL_ASSET.attribution, workTitle: "" },
      },
      isSimpleRenderResaleAttempt: true,
      isSecondaryToolificationAttempt: true,
    });
    expect(violatedAudit.isCompliant).toBe(false);
    expect(violatedAudit.violationsKo).toHaveLength(4);
  });

  it("/api/v1/resources/batch 배포 시 2D 추출 원고 전달 모드는 원본 시트를 소모하지 않고, 원본 편집 모드는 시트 초과 시 차단한다", () => {
    // 1인 개인 사용권에 2D 추출 원고만 전달받는 채색 어시 추가 -> 허용 (원본 시트 미소모)
    const flattenedBatch = executeBatchAssetSeatDistribution([BASE_PERSONAL_ASSET], {
      batchId: "b-1",
      assetIds: ["ast-test-1"],
      assigneeId: "usr-colorist",
      assigneePenName: "채색어시",
      partLabelKo: "채색 작가",
      deliveryMode: "flattened-2d-render-only",
      assignedAtIso: "2026-10-26",
      contractEndDateIso: "2026-12-31",
    });
    expect(flattenedBatch.succeededAssetIds).toEqual(["ast-test-1"]);
    expect(countActiveRawEditableSeats(flattenedBatch.updatedAssets[0]!)).toBe(1);

    // 1인 개인 사용권에 원본(.skp) 편집 어시 추가 -> 시트 초과로 차단
    const rawOverflowBatch = executeBatchAssetSeatDistribution([BASE_PERSONAL_ASSET], {
      batchId: "b-2",
      assetIds: ["ast-test-1"],
      assigneeId: "usr-3d-sub",
      assigneePenName: "배경어시",
      partLabelKo: "3D 배경 담당",
      deliveryMode: "raw-editable-seat",
      assignedAtIso: "2026-10-26",
      contractEndDateIso: "2026-12-31",
    });
    expect(rawOverflowBatch.rejectedAssets).toHaveLength(1);
    expect(rawOverflowBatch.rejectedAssets[0]?.reasonKo).toContain("소진되었습니다");
  });

  it("단기 외주 계약 종료일이 지난 어시스턴트 시트를 일괄 회수한다", () => {
    const assetWithExpiredSub: StudioLicensedAssetItem = {
      ...BASE_PERSONAL_ASSET,
      usageScopeTier: "co-use-1",
      maxEditableSeats: 5,
      seatAssignments: [
        ...BASE_PERSONAL_ASSET.seatAssignments,
        {
          seatId: "seat-expired",
          assigneeId: "usr-temp",
          assigneePenName: "단기대타어시",
          partLabelKo: "3D 배경 담당",
          deliveryMode: "raw-editable-seat",
          assignedAtIso: "2026-10-01",
          contractEndDateIso: "2026-10-15",
          isRevoked: false,
        },
      ],
    };

    const revoked = revokeExpiredAssistantAssetSeats([assetWithExpiredSub], "2026-10-26");
    expect(revoked.revokedCount).toBe(1);
    expect(countActiveRawEditableSeats(revoked.updatedAssets[0]!)).toBe(1);
  });
});
