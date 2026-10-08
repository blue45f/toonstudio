import { ENGINEERING_ATLAS_WEB_PLATFORM_DELIVERY } from "./engineering-atlas-web-platform-delivery";
import { ENGINEERING_ATLAS_WEB_PLATFORM_HONESTY } from "./engineering-atlas-web-platform-honesty";
import { ENGINEERING_ATLAS_WEB_PLATFORM_ISOLATION } from "./engineering-atlas-web-platform-isolation";
import { ENGINEERING_ATLAS_WEB_PLATFORM_MEDIA } from "./engineering-atlas-web-platform-media";
import { ENGINEERING_ATLAS_WEB_PLATFORM_RUNTIME } from "./engineering-atlas-web-platform-runtime";
import { ENGINEERING_ATLAS_WEB_PLATFORM_SURFACE } from "./engineering-atlas-web-platform-surface";
import { ENGINEERING_ATLAS_WEB_PLATFORM_WASM } from "./engineering-atlas-web-platform-wasm";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드가 많아 주제별 보조 파일(engineering-atlas-web-platform-*.ts)에 나누어 두고 여기서 펼친다.
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_WEB_PLATFORM_ISOLATION,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_WASM,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_RUNTIME,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_SURFACE,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_DELIVERY,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_HONESTY,
  ...ENGINEERING_ATLAS_WEB_PLATFORM_MEDIA,
];
