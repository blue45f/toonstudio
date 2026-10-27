/**
 * GitHub Code Review(CODEOWNERS / Protected Branch Merge Gate) + Airtable(Linked Record Rollup & Field Lock)
 * REA 역공학 기반 웹툰 스튜디오 LAYEROWNERS 자동 리뷰어 라우팅 및 보호 컷 병합 게이트 모델.
 *
 * - GitHub (`ev_d3443cb6f1b1ab8604159d66679a8ebb09f8970c299bf88f7c4866b4913ce8f1`):
 *   레이어 경로 패턴(`layer:p*:lineart*` 등)별 필수 승인 오너(`@subteam`) 자동 매칭,
 *   신규 리비전 업로드 시 기존 승인 자동 무효화(Dismiss Stale Approvals), 필수 규격 상태 체크(Status Checks) 통과 시에만 마스터 원고 병합 허용.
 * - Airtable (`ev_ac0f106a91ba3e99d3e78446c559e5f6879f02ba411f89b28f1d96bc55b32f12`):
 *   컷 ↔ 3D 배경·브러시 에셋 ↔ 담당 오너 ↔ 검수 상태 양방향 Linked Record Rollup 및 승인 완료 시 조건부 필드 잠금(Field Lock).
 */

export type LayerOwnerGroupHandle =
  | "@storyboard-lead"
  | "@lineart-owners"
  | "@bg3d-supervisors"
  | "@color-directors"
  | "@editorial-qa";

export type MergeGateCheckStatus = "passed" | "pending" | "failed";

export interface LayerOwnerRule {
  readonly id: string;
  readonly pattern: string;
  readonly stageLabelKo: string;
  readonly stageLabelEn: string;
  readonly ownerHandle: LayerOwnerRule["ownerGroup"];
  readonly ownerGroup: LayerOwnerGroupHandle;
  readonly requiredApprovals: number;
  readonly currentApprovals: number;
  readonly dismissStaleOnPush: boolean;
  readonly staleDismissedCount: number;
  readonly linkedAssetIds: readonly string[];
  readonly statusChecks: {
    readonly dpi600Verified: MergeGateCheckStatus;
    readonly srgbProfileVerified: MergeGateCheckStatus;
    readonly layerNamingVerified: MergeGateCheckStatus;
  };
  readonly fieldLocked: boolean;
  readonly latestRevisionHash: string;
}

export interface LayerOwnersMergeGateSummary {
  readonly rules: readonly LayerOwnerRule[];
  readonly totalRules: number;
  readonly mergeableRuleCount: number;
  readonly blockedRuleCount: number;
  readonly totalLinkedAssets: number;
  readonly staleDismissedTotal: number;
  readonly protectedBranchReady: boolean;
  readonly blockingReasonsKo: readonly string[];
}

export const DEFAULT_LAYER_OWNER_RULES: readonly LayerOwnerRule[] = [
  {
    id: "owner-rule-lineart",
    pattern: "layer:ep*:cut*:lineart/**",
    stageLabelKo: "선화·펜선 마스터 레이어",
    stageLabelEn: "Lineart & Ink Master Layers",
    ownerHandle: "@lineart-owners",
    ownerGroup: "@lineart-owners",
    requiredApprovals: 2,
    currentApprovals: 2,
    dismissStaleOnPush: true,
    staleDismissedCount: 0,
    linkedAssetIds: ["brush:g-pen-pro-v4", "guide:char-sheet-01"],
    statusChecks: {
      dpi600Verified: "passed",
      srgbProfileVerified: "passed",
      layerNamingVerified: "passed",
    },
    fieldLocked: true,
    latestRevisionHash: "rev_91a4c08",
  },
  {
    id: "owner-rule-bg3d",
    pattern: "layer:ep*:cut*:bg3d/**",
    stageLabelKo: "3D 배경·소품 렌더링 레이어",
    stageLabelEn: "3D Background & Prop Layers",
    ownerHandle: "@bg3d-supervisors",
    ownerGroup: "@bg3d-supervisors",
    requiredApprovals: 1,
    currentApprovals: 1,
    dismissStaleOnPush: true,
    staleDismissedCount: 1,
    linkedAssetIds: ["glb:palace-throne-hall", "lut:sunset-warm-02"],
    statusChecks: {
      dpi600Verified: "passed",
      srgbProfileVerified: "passed",
      layerNamingVerified: "passed",
    },
    fieldLocked: true,
    latestRevisionHash: "rev_44e2b19",
  },
  {
    id: "owner-rule-color",
    pattern: "layer:ep*:cut*:color-fx/**",
    stageLabelKo: "밑색·명암·후보정 조명 레이어",
    stageLabelEn: "Base Color & Lighting FX Layers",
    ownerHandle: "@color-directors",
    ownerGroup: "@color-directors",
    requiredApprovals: 2,
    currentApprovals: 1,
    dismissStaleOnPush: true,
    staleDismissedCount: 1,
    linkedAssetIds: ["palette:ep12-night-rain", "lut:cyber-neon-v2"],
    statusChecks: {
      dpi600Verified: "passed",
      srgbProfileVerified: "passed",
      layerNamingVerified: "pending",
    },
    fieldLocked: false,
    latestRevisionHash: "rev_7c05d82",
  },
  {
    id: "owner-rule-editorial",
    pattern: "layer:ep*:cut*:balloon-sfx/**",
    stageLabelKo: "식자·말풍선·효과음 최종 레이어",
    stageLabelEn: "Lettering, Balloons & SFX Layers",
    ownerHandle: "@editorial-qa",
    ownerGroup: "@editorial-qa",
    requiredApprovals: 1,
    currentApprovals: 1,
    dismissStaleOnPush: true,
    staleDismissedCount: 0,
    linkedAssetIds: ["font:toon-dialogue-kr", "sfx:metallic-slash-09"],
    statusChecks: {
      dpi600Verified: "passed",
      srgbProfileVerified: "passed",
      layerNamingVerified: "passed",
    },
    fieldLocked: true,
    latestRevisionHash: "rev_b83f110",
  },
];

export function isRuleMergeable(rule: LayerOwnerRule): boolean {
  const checksPassed =
    rule.statusChecks.dpi600Verified === "passed" &&
    rule.statusChecks.srgbProfileVerified === "passed" &&
    rule.statusChecks.layerNamingVerified === "passed";
  return checksPassed && rule.currentApprovals >= rule.requiredApprovals;
}

export function evaluateLayerOwnersMergeGate(
  rules: readonly LayerOwnerRule[],
): LayerOwnersMergeGateSummary {
  let mergeableRuleCount = 0;
  let blockedRuleCount = 0;
  let staleDismissedTotal = 0;
  const assetSet = new Set<string>();
  const blockingReasonsKo: string[] = [];

  for (const rule of rules) {
    staleDismissedTotal += rule.staleDismissedCount;
    for (const assetId of rule.linkedAssetIds) {
      assetSet.add(assetId);
    }
    if (isRuleMergeable(rule)) {
      mergeableRuleCount += 1;
    } else {
      blockedRuleCount += 1;
      if (rule.currentApprovals < rule.requiredApprovals) {
        blockingReasonsKo.push(
          `${rule.stageLabelKo}(${rule.ownerGroup}): 필수 승인 ${rule.requiredApprovals}건 중 ${rule.currentApprovals}건 완료`,
        );
      }
      if (
        rule.statusChecks.dpi600Verified !== "passed" ||
        rule.statusChecks.srgbProfileVerified !== "passed" ||
        rule.statusChecks.layerNamingVerified !== "passed"
      ) {
        blockingReasonsKo.push(
          `${rule.stageLabelKo}: 필수 자동 상태 체크(600dpi·sRGB·레이어 명명 규칙) 미통과`,
        );
      }
    }
  }

  return {
    rules,
    totalRules: rules.length,
    mergeableRuleCount,
    blockedRuleCount,
    totalLinkedAssets: assetSet.size,
    staleDismissedTotal,
    protectedBranchReady: rules.length > 0 && blockedRuleCount === 0,
    blockingReasonsKo,
  };
}

export function approveAndPassLayerOwnerRule(
  rules: readonly LayerOwnerRule[],
  ruleId: string,
): readonly LayerOwnerRule[] {
  return rules.map((rule) => {
    if (rule.id !== ruleId) return rule;
    const nextApprovals = Math.max(rule.requiredApprovals, rule.currentApprovals + 1);
    return {
      ...rule,
      currentApprovals: nextApprovals,
      statusChecks: {
        dpi600Verified: "passed",
        srgbProfileVerified: "passed",
        layerNamingVerified: "passed",
      },
      fieldLocked: true,
    };
  });
}

export function pushNewLayerRevisionWithStaleDismissal(
  rules: readonly LayerOwnerRule[],
  ruleId: string,
  newRevisionHash: string,
): readonly LayerOwnerRule[] {
  const sanitizedHash = newRevisionHash.trim() || "rev_updated";
  return rules.map((rule) => {
    if (rule.id !== ruleId) return rule;
    const shouldDismiss = rule.dismissStaleOnPush && rule.currentApprovals > 0;
    return {
      ...rule,
      currentApprovals: shouldDismiss ? 0 : rule.currentApprovals,
      staleDismissedCount: shouldDismiss
        ? rule.staleDismissedCount + rule.currentApprovals
        : rule.staleDismissedCount,
      fieldLocked: false,
      latestRevisionHash: sanitizedHash,
    };
  });
}
