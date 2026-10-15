import { createCanvasBubbleTextMeasurer } from "../lettering/studio-bubble-text-fit";
import { buildPromoLocaleBatch, type PromoLocaleBatchResult, type PromoLocaleRequest } from "./promo-locale-batch";
import { downloadPromoBlob } from "./promo-media";
import { promoZip } from "./promo-zip";

import type { PromoProject } from "./promo-model";
import type { PromoTranslationBundle } from "./promo-translation-drafts";

/** 브라우저 메모리 보호용 상한 — ZIP 라이브러리 상한(500MB)보다 먼저 막고 로케일을 나눠 내보내게 안내한다. */
export const PROMO_LOCALE_BATCH_MAX_BYTES = 200_000_000;
export const PROMO_LOCALE_BATCH_FILE_NAME = "toonstudio-promo-locales.zip";

export function promoLocaleBatchBytes(files: Readonly<Record<string, string>>): number {
  return Object.values(files).reduce((sum, content) => sum + content.length, 0);
}

/** 로케일별 SRT·VTT·프로젝트 JSON을 ZIP 하나로 저장한다. 파일을 만들다 실패하면 아무것도 저장하지 않는다. */
export function downloadPromoLocaleBatch(project: PromoProject, bundle: PromoTranslationBundle, requests: readonly PromoLocaleRequest[]): PromoLocaleBatchResult {
  const result = buildPromoLocaleBatch({ project, bundle, requests, measurer: createCanvasBubbleTextMeasurer() });
  if (promoLocaleBatchBytes(result.files) > PROMO_LOCALE_BATCH_MAX_BYTES) {
    throw new Error("로케일 묶음이 200MB를 넘어요. 로케일을 나눠 내보내거나 컷 이미지를 줄여 주세요. 아무 파일도 저장하지 않았어요.");
  }
  const bytes = promoZip(result.files);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadPromoBlob(new Blob([buffer], { type: "application/zip" }), PROMO_LOCALE_BATCH_FILE_NAME);
  return result;
}
