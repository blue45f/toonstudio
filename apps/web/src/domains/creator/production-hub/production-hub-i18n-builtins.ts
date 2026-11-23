// scripts/generate-i18n-builtins.mjs 가 public/i18n/app/productionHub 에서 생성한다.
// ko/en 은 모듈 평가 시 등록하고 다른 로케일은 기존 public URL 에서 불러온다.
import dictionaries from "./i18n/generated/i18n-production-hub-builtins.json";

export const productionHubI18nBuiltins = dictionaries;
