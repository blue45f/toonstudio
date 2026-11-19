import {
  verifySubmittedRightsReceipt,
  type RightsReceiptVerificationResult,
} from "../assistant/studio-rights-receipt-verifier";
import {
  generateWorkflowPackRightsReceipt,
  serializeWorkflowPackRightsReceipt,
  type StudioWorkflowPackRightsReceipt,
} from "../assistant/studio-workflow-pack-rights-receipt";

import type {
  StudioWorkflowPack,
  StudioWorkflowPackRightsEntry,
  WorkflowPackLicenseCode,
} from "../assistant/studio-workflow-pack";

export type RightsRemediationActionKind =
  | "replace-with-commercial-safe"
  | "remove-restricted-asset"
  | "resign-receipt-hash";

export interface RightsSafeReplacementCandidate {
  readonly matchKeyword: string;
  readonly replacement: StudioWorkflowPackRightsEntry;
}

export interface RightsRemediationStep {
  readonly kind: RightsRemediationActionKind;
  readonly targetAssetLabel?: string;
  readonly previousLicense?: WorkflowPackLicenseCode;
  readonly replacement?: StudioWorkflowPackRightsEntry;
  readonly reason: string;
}

export interface RightsRemediationPlan {
  readonly packId: string;
  readonly packName: string;
  readonly needsRemediation: boolean;
  readonly blockedAssetCount: number;
  readonly hashDriftDetected: boolean;
  readonly steps: readonly RightsRemediationStep[];
  readonly summary: string;
}

export interface RightsRemediationExecutionResult {
  readonly remediatedPack: StudioWorkflowPack;
  readonly remediatedReceipt: StudioWorkflowPackRightsReceipt;
  readonly serializedReceipt: string;
  readonly verification: RightsReceiptVerificationResult;
  readonly appliedActions: readonly string[];
}

const RESTRICTED_LICENSES: ReadonlySet<WorkflowPackLicenseCode> = new Set([
  "CC-BY-NC",
  "GPL-3.0",
]);

/**
 * 상업 연재용 기본 대체 에셋 카탈로그 (CC0 / MIT / COMMERCIAL 클린 항목).
 */
export const DEFAULT_COMMERCIAL_SAFE_REPLACEMENTS: readonly RightsSafeReplacementCandidate[] = [
  {
    matchKeyword: "조명",
    replacement: { assetLabel: "스튜디오 표준 3D 라이팅 프리셋 (상업 클린)", license: "CC0" },
  },
  {
    matchKeyword: "라이팅",
    replacement: { assetLabel: "스튜디오 표준 3D 라이팅 프리셋 (상업 클린)", license: "CC0" },
  },
  {
    matchKeyword: "식자",
    replacement: { assetLabel: "ToonStudio 기본 한글 식자 스타일 세트", license: "MIT" },
  },
  {
    matchKeyword: "효과음",
    replacement: { assetLabel: "ToonStudio 상업 연재용 SFX 벡터 번들", license: "COMMERCIAL" },
  },
  {
    matchKeyword: "말풍선",
    replacement: { assetLabel: "ToonStudio 표준 말풍선 프리셋", license: "MIT" },
  },
  {
    matchKeyword: "브러시",
    replacement: { assetLabel: "ToonStudio 기본 펜·잉크 브러시 프리셋", license: "CC0" },
  },
];

function findSafeReplacement(
  assetLabel: string,
  catalog: readonly RightsSafeReplacementCandidate[],
): StudioWorkflowPackRightsEntry | null {
  const normalized = assetLabel.toLowerCase();
  for (const candidate of catalog) {
    if (normalized.includes(candidate.matchKeyword.toLowerCase())) {
      return candidate.replacement;
    }
  }
  return null;
}

/**
 * 워크플로우 팩과(선택적) 기존 증명서를 점검해 1클릭 상업 연재 복구 계획을 생성한다.
 */
export function buildRightsRemediationPlan(
  pack: StudioWorkflowPack,
  existingReceipt?: StudioWorkflowPackRightsReceipt | null,
  safeCatalog: readonly RightsSafeReplacementCandidate[] = DEFAULT_COMMERCIAL_SAFE_REPLACEMENTS,
): RightsRemediationPlan {
  const steps: RightsRemediationStep[] = [];
  let blockedAssetCount = 0;

  for (const entry of pack.rightsBom) {
    if (!RESTRICTED_LICENSES.has(entry.license)) continue;
    blockedAssetCount += 1;
    const replacement = findSafeReplacement(entry.assetLabel, safeCatalog);
    if (replacement) {
      steps.push({
        kind: "replace-with-commercial-safe",
        targetAssetLabel: entry.assetLabel,
        previousLicense: entry.license,
        replacement,
        reason: `비상업·제한 라이선스(${entry.license})를 상업 클린 에셋(${replacement.license})으로 교체합니다.`,
      });
    } else {
      steps.push({
        kind: "remove-restricted-asset",
        targetAssetLabel: entry.assetLabel,
        previousLicense: entry.license,
        reason: `매칭되는 대체 에셋이 없어 제한 항목(${entry.license})을 Rights BOM에서 제외합니다.`,
      });
    }
  }

  let hashDriftDetected = false;
  if (existingReceipt) {
    const check = verifySubmittedRightsReceipt(
      serializeWorkflowPackRightsReceipt(existingReceipt),
      pack,
    );
    if (check.integrityVerified === false) {
      hashDriftDetected = true;
    }
  }

  if (blockedAssetCount > 0 || hashDriftDetected) {
    steps.push({
      kind: "resign-receipt-hash",
      reason: hashDriftDetected
        ? "기존 증명서 해시 불일치를 해소하기 위해 최신 팩 기준으로 증명서를 재서명합니다."
        : "복구된 Rights BOM 기준으로 상업 연재 증명서를 재서명합니다.",
    });
  }

  const needsRemediation = steps.length > 0;
  const summary = !needsRemediation
    ? "복구할 항목 없음: 상업 연재 클린 및 무결성 정상"
    : `복구 계획 생성 완료 (제한 에셋 ${blockedAssetCount}건${hashDriftDetected ? " · 해시 재서명 필요" : ""})`;

  return {
    packId: pack.id,
    packName: pack.name,
    needsRemediation,
    blockedAssetCount,
    hashDriftDetected,
    steps,
    summary,
  };
}

/**
 * 1클릭 복구 계획을 불변으로 적용하고 재서명된 증명서와 최종 무결성 검증 결과를 반환한다.
 */
export function applyRightsRemediationPlan(
  pack: StudioWorkflowPack,
  plan: RightsRemediationPlan,
  generatedAtIso = new Date().toISOString(),
): RightsRemediationExecutionResult {
  const nextBom: StudioWorkflowPackRightsEntry[] = [];
  const appliedActions: string[] = [];

  const stepByAsset = new Map<string, RightsRemediationStep>();
  for (const step of plan.steps) {
    if (step.targetAssetLabel) {
      stepByAsset.set(step.targetAssetLabel, step);
    }
  }

  for (const entry of pack.rightsBom) {
    const step = stepByAsset.get(entry.assetLabel);
    if (!step) {
      nextBom.push(entry);
      continue;
    }
    if (step.kind === "replace-with-commercial-safe" && step.replacement) {
      nextBom.push(step.replacement);
      appliedActions.push(
        `교체: "${entry.assetLabel}" (${entry.license}) → "${step.replacement.assetLabel}" (${step.replacement.license})`,
      );
    } else if (step.kind === "remove-restricted-asset") {
      appliedActions.push(`제외: "${entry.assetLabel}" (${entry.license})`);
    } else {
      nextBom.push(entry);
    }
  }

  const remediatedPack: StudioWorkflowPack = {
    ...pack,
    rightsBom: nextBom,
  };

  const remediatedReceipt = generateWorkflowPackRightsReceipt(remediatedPack, generatedAtIso);
  const serializedReceipt = serializeWorkflowPackRightsReceipt(remediatedReceipt);
  const verification = verifySubmittedRightsReceipt(serializedReceipt, remediatedPack);

  if (plan.steps.some((step) => step.kind === "resign-receipt-hash")) {
    appliedActions.push(`재서명: ${remediatedReceipt.integrityHash}`);
  }

  return {
    remediatedPack,
    remediatedReceipt,
    serializedReceipt,
    verification,
    appliedActions,
  };
}
