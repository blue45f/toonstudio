/**
 * growth-i18n-builtins.ts — 확산 장치(growth) 네임스페이스의 ko/en 사전.
 *
 * monetization 네임스페이스와 같은 형제 패턴을 따른다:
 *  - ko는 런타임 사전에 병합하고, en은 런타임 기계번역의 소스 사전에
 *    등록한다. ko/en 외 73개 로케일은 기존 public 자산 로딩 +
 *    en 소스 기계번역 경로로 해결되므로, public/i18n을 대량 수정하지
 *    않는다.
 *  - 이 JSON은 monetization builtins와 달리 스크립트 생성물이 아니라
 *    수작성 ko/en 소스다. 재생성 스크립트가 이 파일을 덮지 않도록
 *    growth 네임스페이스는 별도 파일로 둔다.
 */
import dictionaries from "./i18n/generated/i18n-growth-builtins.json";

export const growthI18nBuiltins = dictionaries;
