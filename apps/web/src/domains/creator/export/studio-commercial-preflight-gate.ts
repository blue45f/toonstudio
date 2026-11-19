/**
 * 원스톱 상용 출고 프리플라이트 게이트 (AC-008 / PRODUCT.md · F09).
 *
 * 1) 375px 모바일 뷰포트 기준 말풍선 폰트 가독성 검증
 * 2) 스마트 컷 여백 보호 슬라이싱(대사/말풍선 중간 절단 금지)
 * 3) Rights BOM 상업 라이선스 충돌(NC/GPL/AGPL/비상업 전용) 자동 차단
 */

export type ExportCommercialMode = "commercial" | "personal-preview";

export interface PreflightBubbleBox {
  readonly id: string;
  readonly text: string;
  readonly fontSizePx: number;
  readonly topY: number;
  readonly bottomY: number;
}

export interface PreflightAssetLicense {
  readonly assetId: string;
  readonly name: string;
  readonly licenseCode: string;
  readonly sourceUrl?: string;
}

export interface CommercialPreflightInput {
  readonly documentWidthPx: number;
  readonly documentHeightPx: number;
  readonly targetSliceHeightPx: number;
  readonly exportMode: ExportCommercialMode;
  readonly bubbles: readonly PreflightBubbleBox[];
  readonly assets: readonly PreflightAssetLicense[];
}

export interface PreflightIssue {
  readonly id: string;
  readonly severity: "blocker" | "warning";
  readonly category: "mobile-legibility" | "slice-safety" | "rights-bom";
  readonly messageKo: string;
  readonly targetId?: string;
}

export interface CommercialPreflightReport {
  readonly passed: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly safeSliceYs: readonly number[];
  readonly issues: readonly PreflightIssue[];
}

const MOBILE_VIEWPORT_PX = 375;
const MIN_MOBILE_FONT_PX = 11;
const SAFE_GUTTER_PADDING_PX = 12;

const COMMERCIAL_BLOCKED_LICENSE_RE = /\b(NC|CC-BY-NC|CC-BY-NC-SA|CC-BY-NC-ND|GPL|AGPL|PERSONAL-ONLY|NON-COMMERCIAL)\b/i;

export function isLicenseBlockedForCommercial(licenseCode: string): boolean {
  return COMMERCIAL_BLOCKED_LICENSE_RE.test(licenseCode.trim());
}

/**
 * 말풍선·대사 박스를 가로지르지 않도록 안전한 슬라이스 Y 좌표를 계산한다.
 */
export function computeSafeSliceYs(
  documentHeightPx: number,
  targetSliceHeightPx: number,
  bubbles: readonly PreflightBubbleBox[],
): { readonly sliceYs: number[]; readonly adjustedCount: number } {
  if (documentHeightPx <= 0 || targetSliceHeightPx <= 0) {
    return { sliceYs: [], adjustedCount: 0 };
  }

  const sliceYs: number[] = [];
  let adjustedCount = 0;
  let cursor = targetSliceHeightPx;

  while (cursor < documentHeightPx) {
    let candidate = cursor;
    const hit = bubbles.find((b) => candidate > b.topY && candidate < b.bottomY);
    if (hit) {
      const above = Math.max(0, hit.topY - SAFE_GUTTER_PADDING_PX);
      const prev = sliceYs.length > 0 ? sliceYs[sliceYs.length - 1]! : 0;
      if (above > prev + 64) {
        candidate = above;
      } else {
        candidate = Math.min(documentHeightPx, hit.bottomY + SAFE_GUTTER_PADDING_PX);
      }
      adjustedCount += 1;
    }

    if (candidate >= documentHeightPx) break;
    sliceYs.push(Math.round(candidate));
    cursor = candidate + targetSliceHeightPx;
  }

  return { sliceYs, adjustedCount };
}

export function runCommercialPreflightGate(
  input: CommercialPreflightInput,
): CommercialPreflightReport {
  const issues: PreflightIssue[] = [];
  const scaleToMobile =
    input.documentWidthPx > 0 ? MOBILE_VIEWPORT_PX / input.documentWidthPx : 1;

  // 1. 375px 모바일 말풍선 가독성 점검
  for (const bubble of input.bubbles) {
    const renderedPx = Number((bubble.fontSizePx * scaleToMobile).toFixed(1));
    if (renderedPx < MIN_MOBILE_FONT_PX) {
      issues.push({
        id: `legibility:${bubble.id}`,
        severity: "warning",
        category: "mobile-legibility",
        targetId: bubble.id,
        messageKo: `375px 모바일 기준 글자 크기가 ${renderedPx}px로 작습니다(권장 ${MIN_MOBILE_FONT_PX}px 이상).`,
      });
    }
  }

  // 2. Rights BOM 상업 라이선스 충돌 차단
  if (input.exportMode === "commercial") {
    for (const asset of input.assets) {
      if (isLicenseBlockedForCommercial(asset.licenseCode)) {
        issues.push({
          id: `rights:${asset.assetId}`,
          severity: "blocker",
          category: "rights-bom",
          targetId: asset.assetId,
          messageKo: `상업 출고 불가 라이선스(${asset.licenseCode}) 소재 '${asset.name}'가 포함되어 있습니다. 교체하거나 비상업 미리보기로 전환하세요.`,
        });
      }
    }
  }

  // 3. 스마트 컷 여백 보호 슬라이싱
  const { sliceYs, adjustedCount } = computeSafeSliceYs(
    input.documentHeightPx,
    input.targetSliceHeightPx,
    input.bubbles,
  );
  if (adjustedCount > 0) {
    issues.push({
      id: "slice:auto-adjusted",
      severity: "warning",
      category: "slice-safety",
      messageKo: `말풍선 중간 절단을 막기 위해 슬라이스 경계 ${adjustedCount}곳을 안전한 컷 여백으로 자동 이동했습니다.`,
    });
  }

  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return Object.freeze({
    passed: blockerCount === 0,
    blockerCount,
    warningCount,
    safeSliceYs: Object.freeze(sliceYs),
    issues: Object.freeze(issues),
  });
}
