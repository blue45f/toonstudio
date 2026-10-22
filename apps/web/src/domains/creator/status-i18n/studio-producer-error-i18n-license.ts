/**
 * 생산자 구조화 에러 해석 모듈 — license 구간: shared-resource-priority-license-model 검사 결과 13코드 + 용도 라벨 5키 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간부터 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 *
 * params: use-not-licensed는 용도 코드({usage})를 싣고, 라벨은 생산자의
 * 용도 사전(ASSET_LICENSE_USE_LABELS)과 같은 값으로 이 구간에 등록한
 * usage.* 키로 표시 지점에서 해석한다. license-expiring-soon은 {days}를 싣는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  AssetLicenseIssue,
  AssetLicenseIssueCode,
  AssetLicenseUse,
} from "../production-hub/shared-resource-priority-license-model";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.license.metadataMissing": "라이선스 메타데이터가 없어 배분할 수 없습니다. 사용 조건을 먼저 등록하세요.",
  "studio.producerError.license.rightsUnconfirmed": "권리 확인이 끝나지 않은 에셋은 배분할 수 없습니다.",
  "studio.producerError.license.licenseUnknownBlock": "라이선스를 알 수 없는 에셋은 공유·게시할 수 없습니다.",
  "studio.producerError.license.licenseUnknownWarn": "라이선스가 확인되지 않았습니다. 공유·게시 전에 확인하세요.",
  "studio.producerError.license.noncommercialLicense": "비상업 라이선스 에셋은 상업 작품에 쓸 수 없습니다 (라이선스 상업성 원칙).",
  "studio.producerError.license.commercialUnknown": "상업 이용 가능 여부가 확인되지 않았습니다.",
  "studio.producerError.license.redistributionForbidden": "재배포가 금지된 에셋은 다른 작품과 공유할 수 없습니다.",
  "studio.producerError.license.redistributionUnknown": "재배포 가능 여부가 확인되지 않았습니다.",
  "studio.producerError.license.projectNotLicensed": "이 작품에는 사용이 허가되지 않은 에셋입니다.",
  "studio.producerError.license.useNotLicensed": "이 용도({usage})는 허가되지 않았습니다.",
  "studio.producerError.license.licenseExpired": "라이선스 기간이 만료됐습니다.",
  "studio.producerError.license.licenseExpiringSoon": "라이선스가 {days}일 안에 만료됩니다.",
  "studio.producerError.license.attributionRequired": "출처표기가 필요합니다. 크레딧에 표기했는지 확인하세요.",
  "studio.producerError.license.attributionUnknown": "출처표기 필요 여부가 확인되지 않았습니다.",
  "studio.producerError.license.usage.internal-production": "작품 내부 제작",
  "studio.producerError.license.usage.cross-project-share": "다른 작품과 공유",
  "studio.producerError.license.usage.publication": "게시·출판",
  "studio.producerError.license.usage.merchandise": "굿즈",
  "studio.producerError.license.usage.adaptation": "영상화 등 2차 이용",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.license.metadataMissing": "This asset has no license metadata, so it cannot be allocated. Register its usage terms first.",
  "studio.producerError.license.rightsUnconfirmed": "Assets whose rights have not been confirmed cannot be allocated.",
  "studio.producerError.license.licenseUnknownBlock": "Assets with an unknown license cannot be shared or published.",
  "studio.producerError.license.licenseUnknownWarn": "The license has not been confirmed. Check it before sharing or publishing.",
  "studio.producerError.license.noncommercialLicense": "Noncommercial-license assets cannot be used in commercial works (commercial licensing principle).",
  "studio.producerError.license.commercialUnknown": "Whether commercial use is allowed has not been confirmed.",
  "studio.producerError.license.redistributionForbidden": "Assets that forbid redistribution cannot be shared with other projects.",
  "studio.producerError.license.redistributionUnknown": "Whether redistribution is allowed has not been confirmed.",
  "studio.producerError.license.projectNotLicensed": "This asset is not licensed for use in this project.",
  "studio.producerError.license.useNotLicensed": "This use ({usage}) is not licensed.",
  "studio.producerError.license.licenseExpired": "The license period has expired.",
  "studio.producerError.license.licenseExpiringSoon": "The license expires within {days} days.",
  "studio.producerError.license.attributionRequired": "Attribution is required. Check that it appears in the credits.",
  "studio.producerError.license.attributionUnknown": "Whether attribution is required has not been confirmed.",
  "studio.producerError.license.usage.internal-production": "Internal production",
  "studio.producerError.license.usage.cross-project-share": "Share across projects",
  "studio.producerError.license.usage.publication": "Publication",
  "studio.producerError.license.usage.merchandise": "Merchandise",
  "studio.producerError.license.usage.adaptation": "Adaptation",
});

const LICENSE_ISSUE_KEYS: Readonly<Record<AssetLicenseIssueCode, string>> = {
  "metadata-missing": "studio.producerError.license.metadataMissing",
  "rights-unconfirmed": "studio.producerError.license.rightsUnconfirmed",
  // license-unknown은 방출 지점의 severity(공유·게시=blocker, 그 외=warning)로 문구가 갈린다.
  "license-unknown": "studio.producerError.license.licenseUnknownBlock",
  "noncommercial-license": "studio.producerError.license.noncommercialLicense",
  "commercial-unknown": "studio.producerError.license.commercialUnknown",
  "redistribution-forbidden": "studio.producerError.license.redistributionForbidden",
  "redistribution-unknown": "studio.producerError.license.redistributionUnknown",
  "project-not-licensed": "studio.producerError.license.projectNotLicensed",
  "use-not-licensed": "studio.producerError.license.useNotLicensed",
  "license-expired": "studio.producerError.license.licenseExpired",
  "license-expiring-soon": "studio.producerError.license.licenseExpiringSoon",
  "attribution-required": "studio.producerError.license.attributionRequired",
  "attribution-unknown": "studio.producerError.license.attributionUnknown",
};

const LICENSE_ISSUE_KO: Readonly<Record<string, string>> = {
  "studio.producerError.license.metadataMissing": "라이선스 메타데이터가 없어 배분할 수 없습니다. 사용 조건을 먼저 등록하세요.",
  "studio.producerError.license.rightsUnconfirmed": "권리 확인이 끝나지 않은 에셋은 배분할 수 없습니다.",
  "studio.producerError.license.licenseUnknownBlock": "라이선스를 알 수 없는 에셋은 공유·게시할 수 없습니다.",
  "studio.producerError.license.licenseUnknownWarn": "라이선스가 확인되지 않았습니다. 공유·게시 전에 확인하세요.",
  "studio.producerError.license.noncommercialLicense": "비상업 라이선스 에셋은 상업 작품에 쓸 수 없습니다 (라이선스 상업성 원칙).",
  "studio.producerError.license.commercialUnknown": "상업 이용 가능 여부가 확인되지 않았습니다.",
  "studio.producerError.license.redistributionForbidden": "재배포가 금지된 에셋은 다른 작품과 공유할 수 없습니다.",
  "studio.producerError.license.redistributionUnknown": "재배포 가능 여부가 확인되지 않았습니다.",
  "studio.producerError.license.projectNotLicensed": "이 작품에는 사용이 허가되지 않은 에셋입니다.",
  "studio.producerError.license.useNotLicensed": "이 용도({usage})는 허가되지 않았습니다.",
  "studio.producerError.license.licenseExpired": "라이선스 기간이 만료됐습니다.",
  "studio.producerError.license.licenseExpiringSoon": "라이선스가 {days}일 안에 만료됩니다.",
  "studio.producerError.license.attributionRequired": "출처표기가 필요합니다. 크레딧에 표기했는지 확인하세요.",
  "studio.producerError.license.attributionUnknown": "출처표기 필요 여부가 확인되지 않았습니다.",
};

const LICENSE_USAGE_KEYS: Readonly<Record<AssetLicenseUse, string>> = {
  "internal-production": "studio.producerError.license.usage.internal-production",
  "cross-project-share": "studio.producerError.license.usage.cross-project-share",
  publication: "studio.producerError.license.usage.publication",
  merchandise: "studio.producerError.license.usage.merchandise",
  adaptation: "studio.producerError.license.usage.adaptation",
};

const LICENSE_USAGE_KO: Readonly<Record<AssetLicenseUse, string>> = {
  "internal-production": "작품 내부 제작",
  "cross-project-share": "다른 작품과 공유",
  publication: "게시·출판",
  merchandise: "굿즈",
  adaptation: "영상화 등 2차 이용",
};

function isAssetLicenseUse(value: string | undefined): value is AssetLicenseUse {
  return value !== undefined && Object.hasOwn(LICENSE_USAGE_KEYS, value);
}

/**
 * 표시 지점 전용 해석 (license 검사 결과): Board 렌더가 issue.code로 부른다.
 * license-unknown은 severity로 block/warn 문구를 가르고, use-not-licensed의
 * {usage}는 용도 코드를 usage.* 라벨 키로 먼저 해석해 넣는다.
 */
export function resolveAssetLicenseIssue(issue: AssetLicenseIssue): string {
  const key = issue.code === "license-unknown" && issue.severity === "warning"
    ? "studio.producerError.license.licenseUnknownWarn"
    : LICENSE_ISSUE_KEYS[issue.code];
  const usageParam = issue.params?.usage;
  const params: Record<string, string> = { ...issue.params };
  if (isAssetLicenseUse(usageParam)) {
    params.usage = resolveProducerError(LICENSE_USAGE_KEYS[usageParam], LICENSE_USAGE_KO[usageParam]);
  }
  return resolveProducerError(key, LICENSE_ISSUE_KO[key], params);
}
