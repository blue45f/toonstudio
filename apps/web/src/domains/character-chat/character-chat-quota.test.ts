/**
 * 캐릭터 챗 쿼터 어댑터 테스트 — 월 사용량 집계(UTC 월 경계·인사말 제외·
 * 타 프로필 제외)와 BYOK 정직성(상한 없음)을 고정한다.
 */

import { describe, expect, it } from "vitest";

import { CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP } from "./character-chat-engine";
import {
  buildCharacterChatQuotaView,
  countMonthlyFanMessages,
} from "./character-chat-quota";
import type { CharacterChatSession } from "./character-chat-types";

const NOW = Date.UTC(2026, 9, 14, 3, 0, 0); // 2026-10

function session(
  profileId: string,
  messages: readonly { role: "fan" | "character"; createdAt: string }[],
): CharacterChatSession {
  return {
    id: `s-${profileId}`,
    profileId,
    ownerId: null,
    messages: messages.map((message, index) => ({
      id: `m-${index}`,
      role: message.role,
      text: "x",
      createdAt: message.createdAt,
    })),
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

const sessions: readonly CharacterChatSession[] = [
  session("p1", [
    { role: "character", createdAt: "2026-10-01T00:00:00.000Z" }, // 인사말 — 세지 않음
    { role: "fan", createdAt: "2026-10-02T00:00:00.000Z" },
    { role: "fan", createdAt: "2026-10-14T00:00:00.000Z" },
    { role: "fan", createdAt: "2026-09-30T23:59:59.000Z" }, // 지난달 — 세지 않음
    { role: "character", createdAt: "2026-10-14T00:01:00.000Z" },
  ]),
  session("p2", [{ role: "fan", createdAt: "2026-10-03T00:00:00.000Z" }]),
];

describe("countMonthlyFanMessages", () => {
  it("이번 달 팬 메시지만 센다", () => {
    expect(countMonthlyFanMessages(sessions, "p1", NOW)).toBe(2);
    expect(countMonthlyFanMessages(sessions, "p2", NOW)).toBe(1);
    expect(countMonthlyFanMessages(sessions, "missing", NOW)).toBe(0);
  });

  it("깨진 createdAt은 세지 않는다", () => {
    const broken = [session("p1", [{ role: "fan", createdAt: "not-a-date" }])];
    expect(countMonthlyFanMessages(broken, "p1", NOW)).toBe(0);
  });
});

describe("buildCharacterChatQuotaView", () => {
  it("BYOK(미강제)에서는 상한 없음 뷰 — 숫자를 지어내지 않는다", () => {
    const view = buildCharacterChatQuotaView(sessions, "p1", {
      platformEnforced: false,
      now: NOW,
    });
    expect(view.state).toBe("unlimited");
    expect(view.limit).toBeNull();
    expect(view.canProceed).toBe(true);
  });

  it("플랫폼 강제 시 상한 상수(300)와 월 사용량을 잇는다", () => {
    const view = buildCharacterChatQuotaView(sessions, "p1", {
      platformEnforced: true,
      now: NOW,
    });
    expect(view.limit).toBe(CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP);
    expect(view.used).toBe(2);
    expect(view.remaining).toBe(CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP - 2);
    expect(view.resetsAt).toBe(Date.UTC(2026, 10, 1));
  });

  it("상한만큼 쌓이면 exhausted로 전송을 막는다", () => {
    const many = [
      session(
        "p1",
        Array.from({ length: CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP }, () => ({
          role: "fan" as const,
          createdAt: "2026-10-05T00:00:00.000Z",
        })),
      ),
    ];
    const view = buildCharacterChatQuotaView(many, "p1", {
      platformEnforced: true,
      now: NOW,
    });
    expect(view.state).toBe("exhausted");
    expect(view.canProceed).toBe(false);
    expect(view.copy.ko.detail).toContain("다른 캐릭터");
  });
});
