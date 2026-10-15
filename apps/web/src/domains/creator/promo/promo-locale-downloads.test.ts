import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyPromoProject } from "./promo-model";
import {
  downloadPromoLocaleBatch,
  PROMO_LOCALE_BATCH_FILE_NAME,
  PROMO_LOCALE_BATCH_MAX_BYTES,
  promoLocaleBatchBytes,
} from "./promo-locale-downloads";
import { promoUnzip } from "./promo-zip";

import type { PromoLocaleRequest } from "./promo-locale-batch";
import type { PromoPanel, PromoProject } from "./promo-model";
import type { PromoTranslationBundle } from "./promo-translation-drafts";

const hoisted = vi.hoisted(() => ({ download: vi.fn<(blob: Blob, fileName: string) => void>() }));
vi.mock("./promo-media", () => ({ downloadPromoBlob: hoisted.download }));

const PNG = "data:image/png;base64,aGVsbG8=";
const panel = (id: string, caption: string): PromoPanel => ({ id, src: PNG, description: "", caption, motion: "still", fit: "contain", weight: 1 });
const project: PromoProject = { ...emptyPromoProject(), panels: [panel("c1", "어서 와"), panel("c2", "또 만나")] };
const at = "2026-10-15T09:00:00.000Z";
const rows = [{ pageId: "p1", elementId: "e1", source: "어서 와" }, { pageId: "p1", elementId: "e2", source: "또 만나" }];
const bundle: PromoTranslationBundle = {
  documentId: "work-1",
  revision: 4,
  rows,
  drafts: [
    { id: "d1", pageId: "p1", elementId: "e1", source: "어서 와", locale: "en", text: "Welcome.", approved: true, updatedAt: at },
    { id: "d2", pageId: "p1", elementId: "e2", source: "또 만나", locale: "en", text: "See you.", approved: true, updatedAt: at },
  ],
};
const request = (locale: string): PromoLocaleRequest => ({ locale, title: "", cta: "", policy: { includeDrafts: false, includeStale: false } });

beforeEach(() => hoisted.download.mockReset());

describe("로케일 묶음 ZIP 저장", () => {
  it("로케일별 파일과 manifest·README를 ZIP 하나로 저장하고 결과를 돌려준다", async () => {
    const result = downloadPromoLocaleBatch(project, bundle, [request("en")]);
    expect(hoisted.download).toHaveBeenCalledTimes(1);
    const [blob, fileName] = hoisted.download.mock.calls[0] ?? [];
    expect(fileName).toBe(PROMO_LOCALE_BATCH_FILE_NAME);
    expect(PROMO_LOCALE_BATCH_FILE_NAME).toBe("toonstudio-promo-locales.zip");
    expect(blob?.type).toBe("application/zip");
    const files = promoUnzip(new Uint8Array(await (blob?.arrayBuffer() ?? Promise.resolve(new ArrayBuffer(0)))));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "en/captions.srt", "en/captions.vtt", "en/project.json", "manifest.json"]);
    const srt = new TextDecoder().decode(files["en/captions.srt"]);
    expect(srt).toContain("Welcome.");
    expect(srt).toContain("See you.");
    expect(result.files["en/captions.srt"]).toBe(srt);
    expect(result.warningCount).toBe(0);
  });

  it("묶음을 만들지 못하면(컷 없음·로케일 없음) 아무 파일도 저장하지 않는다", () => {
    expect(() => downloadPromoLocaleBatch({ ...project, panels: [] }, bundle, [request("en")])).toThrow("컷이 없어");
    expect(() => downloadPromoLocaleBatch(project, bundle, [])).toThrow("로케일을 하나 이상");
    expect(() => downloadPromoLocaleBatch(project, bundle, [request("../en")])).toThrow();
    expect(hoisted.download).not.toHaveBeenCalled();
  });

  it("파일 크기는 글자 수의 합으로 세고 메모리 보호 상한은 200MB다", () => {
    expect(promoLocaleBatchBytes({})).toBe(0);
    expect(promoLocaleBatchBytes({ a: "가나다", b: "1234" })).toBe(7);
    expect(PROMO_LOCALE_BATCH_MAX_BYTES).toBe(200_000_000);
  });
});
