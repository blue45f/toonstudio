/**
 * 뉴스레터 Resend 어댑터 테스트 — 키 보관·어댑터 분기·전송 계약 검증.
 *
 * 실제 Resend 호출은 하지 않는다. 전송은 주입한 목(deliver)으로만 검증하고,
 * 기본 릴레이 구현은 이 테스트에서 실행하지 않는다.
 */

import { describe, expect, it, vi } from "vitest";

import {
  NEWSLETTER_RESEND_API_KEY_STORAGE_KEY,
  NewsletterMailDeliveryError,
  createResendNewsletterMailAdapter,
  isNewsletterResendConfigured,
  loadNewsletterResendApiKey,
  resolveNewsletterMailAdapter,
  saveNewsletterResendApiKey,
  type NewsletterMailKeyStorage,
} from "./newsletter-mail-resend";
import type { NewsletterMailRequest } from "./newsletter-mail-adapter";

function createMemoryStorage(): NewsletterMailKeyStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

const REQUEST: NewsletterMailRequest = {
  authorName: "김밤하늘",
  subject: "24화 소식",
  body: "새 화가 나왔어요.",
  recipientIds: ["reader-1", "reader-2"],
  unsubscribePath: "/newsletter",
};

describe("Resend 키 보관", () => {
  it("저장하면 앞뒤 공백을 정리해 다시 읽을 수 있다", () => {
    const storage = createMemoryStorage();
    expect(saveNewsletterResendApiKey(storage, "  re_test_key  ")).toBe(true);
    expect(loadNewsletterResendApiKey(storage)).toBe("re_test_key");
  });

  it("빈 키로 저장하면 등록이 해제된다", () => {
    const storage = createMemoryStorage();
    saveNewsletterResendApiKey(storage, "re_test_key");
    expect(saveNewsletterResendApiKey(storage, "")).toBe(true);
    expect(loadNewsletterResendApiKey(storage)).toBe("");
    expect(isNewsletterResendConfigured(loadNewsletterResendApiKey(storage))).toBe(false);
  });

  it("저장소가 없으면 로드는 빈 문자열, 저장은 실패를 돌려준다", () => {
    expect(loadNewsletterResendApiKey(null)).toBe("");
    expect(loadNewsletterResendApiKey(undefined)).toBe("");
    expect(saveNewsletterResendApiKey(null, "re_test_key")).toBe(false);
  });

  it("저장 키 이름이 세션 정책 키와 같다", () => {
    expect(NEWSLETTER_RESEND_API_KEY_STORAGE_KEY).toBe("toonstudio_newsletter_resend_api_key");
  });
});

describe("Resend 어댑터", () => {
  it("주입된 전송 함수에 키와 메일 요청을 넘기고 영수증을 확정한다", async () => {
    const deliver = vi.fn(async () => ({ acceptedCount: 2, deliveredAt: "2026-10-06T00:00:00.000Z" }));
    const adapter = createResendNewsletterMailAdapter({ apiKey: "re_test_key", deliver });

    const receipt = await adapter.send(REQUEST);
    expect(adapter.id).toBe("resend");
    expect(receipt).toEqual({
      adapterId: "resend",
      acceptedCount: 2,
      deliveredAt: "2026-10-06T00:00:00.000Z",
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith({ ...REQUEST, apiKey: "re_test_key" });
  });

  it("전송 함수가 deliveredAt을 주지 않으면 접수 시각으로 채운다", async () => {
    const adapter = createResendNewsletterMailAdapter({
      apiKey: "re_test_key",
      deliver: async () => ({ acceptedCount: 1 }),
    });
    const receipt = await adapter.send(REQUEST);
    expect(receipt.acceptedCount).toBe(1);
    expect(Number.isNaN(Date.parse(receipt.deliveredAt))).toBe(false);
  });

  it("빈 키로는 전송을 시도하지 않고 실패로 드러낸다", async () => {
    const deliver = vi.fn(async () => ({ acceptedCount: 1 }));
    const adapter = createResendNewsletterMailAdapter({ apiKey: "  ", deliver });
    await expect(adapter.send(REQUEST)).rejects.toBeInstanceOf(NewsletterMailDeliveryError);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("전송이 실패하면 키가 새지 않는 일반 오류로 감싸 던진다", async () => {
    const adapter = createResendNewsletterMailAdapter({
      apiKey: "re_secret_value",
      deliver: async () => {
        throw new Error("upstream rejected key re_secret_value");
      },
    });
    await expect(adapter.send(REQUEST)).rejects.toBeInstanceOf(NewsletterMailDeliveryError);
    await expect(adapter.send(REQUEST)).rejects.not.toThrowError(/re_secret_value/);
  });
});

describe("어댑터 결정(resolve)", () => {
  it("키가 없으면 로컬 기록 전용 어댑터를 돌려준다", () => {
    const adapter = resolveNewsletterMailAdapter(createMemoryStorage());
    expect(adapter.id).toBe("local-log");
  });

  it("키가 있으면 Resend 어댑터를 돌려준다", () => {
    const storage = createMemoryStorage();
    saveNewsletterResendApiKey(storage, "re_test_key");
    const adapter = resolveNewsletterMailAdapter(storage);
    expect(adapter.id).toBe("resend");
  });
});
