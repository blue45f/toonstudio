/**
 * growth-i18n.ts — 확산 장치 네임스페이스의 사전 등록 모듈.
 *
 * monetization-i18n.ts와 같은 배선 계약이다: 이 네임스페이스의 키를
 * 렌더하는 진입 모듈은 이 모듈을 side-effect import 해야 한다.
 * monetization-i18n.ts가 이 모듈을 함께 import하므로, monetization
 * 네임스페이스가 로딩되는 진입점에서는 별도 배선이 필요 없다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { growthI18nBuiltins } from "./growth-i18n-builtins";

registerI18nLocaleEntries("ko", growthI18nBuiltins.ko);
registerI18nEnglishSourceEntries(growthI18nBuiltins.en);
