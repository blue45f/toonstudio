/**
 * ToonStudio 10대 UI/UX 벤치마크 축 실측 스캐너 통합 진입점.
 */
import {
  scanAxis10LocalZeroCostAiGuard,
  scanAxis6BeginnerOnboardingAiSupport,
  scanAxis7AllInOneCreativeDepth,
  scanAxis8StudioDivisionOs,
  scanAxis9InitialBundleLazyBoundary,
} from "./ux-competitor-benchmark-platform-scanners.mjs";
import {
  findRawHexLiterals,
  findTransitionAllViolations,
  hasUnpairedBackdropFilter,
  scanAxis1GnbLnbJourney,
  scanAxis2MobileThumbUx,
  scanAxis3MultideviceConsistency,
  scanAxis4MinimalFormAiAutofill,
  scanAxis5OklchSpectrumA11y,
  stripCssComments,
} from "./ux-competitor-benchmark-ux-scanners.mjs";

export {
  findRawHexLiterals,
  findTransitionAllViolations,
  hasUnpairedBackdropFilter,
  scanAxis10LocalZeroCostAiGuard,
  scanAxis1GnbLnbJourney,
  scanAxis2MobileThumbUx,
  scanAxis3MultideviceConsistency,
  scanAxis4MinimalFormAiAutofill,
  scanAxis5OklchSpectrumA11y,
  scanAxis6BeginnerOnboardingAiSupport,
  scanAxis7AllInOneCreativeDepth,
  scanAxis8StudioDivisionOs,
  scanAxis9InitialBundleLazyBoundary,
  stripCssComments,
};

export function runAllAxisScanners(root, options = {}) {
  return [
    scanAxis1GnbLnbJourney(root),
    scanAxis2MobileThumbUx(root),
    scanAxis3MultideviceConsistency(root),
    scanAxis4MinimalFormAiAutofill(root),
    scanAxis5OklchSpectrumA11y(root),
    scanAxis6BeginnerOnboardingAiSupport(root),
    scanAxis7AllInOneCreativeDepth(root),
    scanAxis8StudioDivisionOs(root),
    scanAxis9InitialBundleLazyBoundary(root, options),
    scanAxis10LocalZeroCostAiGuard(root),
  ];
}
