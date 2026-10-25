/**
 * Creator Bundle 에셋 로더·폴백 경로 정리.
 *
 * 번들 에셋 URL은 sha256 내용 주소 키(테마 팩 데이터의 assetRoot +
 * 해시.glb)다. 실물 서빙 완료 신호는 별도의 배포 인덱스
 * (/assets/studio/bundle-v2/manifest.json)이며, 인덱스가 없거나 키
 * 방식·합계가 다르면 "배포 미완료"다. 이 모듈은 그 판정을 URL 해석
 * 한 곳으로 모은다:
 *
 * - 배포 완료: 서빙 URL을 돌려준다.
 * - 배포 미완료: URL을 돌려주지 않고 로컬 카탈로그 폴백을 지시한다.
 *   R2 서빙 완료를 가정하지 않으며, 패널이 번들 에셋을 배치 가능으로
 *   오인 표시하지 않게 한다.
 * - sha256 형식이 아니면 fail-closed로 미완료다.
 *
 * 실제 바이트 로드는 기존 로더(studio-bg3d-bundle-asset-loader)가
 * 맡고, 이 모듈은 URL·폴백 판정만 한다(로더 동작을 바꾸지 않는다).
 */

export type StudioBg3dBundleAssetFallbackStatus = "available" | "unavailable";

export type StudioBg3dBundleAssetFallback = "none" | "local-catalog";

export interface StudioBg3dBundleAssetFallbackResolution {
  readonly status: StudioBg3dBundleAssetFallbackStatus;
  /** 배포 완료일 때만 있는 서빙 URL. 미완료면 null이다. */
  readonly url: string | null;
  readonly fallback: StudioBg3dBundleAssetFallback;
  readonly reasonKo: string;
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function normalizeAssetRoot(assetRoot: unknown): string | null {
  if (typeof assetRoot !== "string" || assetRoot.length === 0) return null;
  return assetRoot.endsWith("/") ? assetRoot : `${assetRoot}/`;
}

/**
 * 번들 에셋의 서빙 URL·폴백을 판정한다. deployAvailable은 배포 인덱스
 * 판정(loadStudioBg3dBundleDeployAvailability)의 결과를 그대로 넘긴다.
 */
export function resolveStudioBg3dBundleAssetFallback(input: {
  readonly deployAvailable: unknown;
  readonly assetRoot: unknown;
  readonly sha256: unknown;
}): StudioBg3dBundleAssetFallbackResolution {
  const root = normalizeAssetRoot(input.assetRoot);
  const hashValid = typeof input.sha256 === "string" && SHA256_PATTERN.test(input.sha256);
  if (input.deployAvailable !== true || root === null || !hashValid) {
    return Object.freeze({
      status: "unavailable",
      url: null,
      fallback: "local-catalog",
      reasonKo: "R2 서빙이 완료되지 않았습니다. 번들 에셋을 배치 가능으로 표시하지 않고 로컬 카탈로그 에셋을 사용하세요.",
    });
  }
  const hash = (input.sha256 as string).slice("sha256:".length);
  return Object.freeze({
    status: "available",
    url: `${root}${hash}.glb`,
    fallback: "none",
    reasonKo: "배포 인덱스에서 R2 서빙 완료가 확인됐습니다.",
  });
}
