/**
 * 제작 관리 사전은 소비 모듈이 평가될 때 동기 등록하여 첫 렌더와 재진입을 지원한다.
 * ko/en 외 로케일의 public 자산 로딩 경로는 바꾸지 않는다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n-core";

import { productionHubI18nBuiltins } from "./production-hub-i18n-builtins";

registerI18nLocaleEntries("ko", productionHubI18nBuiltins.ko);
registerI18nEnglishSourceEntries(productionHubI18nBuiltins.en);
