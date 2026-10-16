import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VERSION_SHARE_PASSWORD_MAX_FAILURES,
  VERSION_SHARE_PASSWORD_WINDOW_MS,
  VersionSharePasswordGuard,
  type VersionSharePasswordAttempt,
} from "./version-share-password-guard";

const LINK = "link-key-a";
const NOW = Date.parse("2026-10-16T00:00:00.000Z");

beforeEach(() => {
  // 오답 창의 시작·끝은 호출 시각(Date.now)으로 정해지므로 시계를 고정해 창 경계를 정확히 짚는다.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function admitOrThrow(guard: VersionSharePasswordGuard, key = LINK): VersionSharePasswordAttempt {
  const admission = guard.admit(key);
  if (!admission.admitted) throw new Error(`선점 거절: ${admission.retryAfterSeconds}s`);
  return admission.attempt;
}

/** 선점이 가능한지만 본다. admit 은 선점이라는 부수 효과가 있으므로 가능했다면 곧바로 되돌린다. */
function canAdmit(guard: VersionSharePasswordGuard, key = LINK): boolean {
  const admission = guard.admit(key);
  if (admission.admitted) admission.attempt.release();
  return admission.admitted;
}

describe("VersionSharePasswordGuard", () => {
  it("검증 전에 시도를 선점하므로 판정이 끝나기 전에도 한도를 넘는 요청은 거절된다", () => {
    const guard = new VersionSharePasswordGuard();
    const attempts = Array.from({ length: VERSION_SHARE_PASSWORD_MAX_FAILURES }, () => admitOrThrow(guard));

    // 확정된 오답은 아직 없고 판정 중인 시도만 가득 찬 경우: 창 전체가 아니라 짧은 재시도를 안내한다.
    expect(guard.admit(LINK)).toEqual({ admitted: false, reason: "busy", retryAfterSeconds: 1 });
    expect(attempts).toHaveLength(VERSION_SHARE_PASSWORD_MAX_FAILURES);
  });

  it("확정된 오답이 한도 밑이면 판정 중인 시도가 자리를 채워도 잠금이 아니라 일시 차단이다", () => {
    const guard = new VersionSharePasswordGuard();
    // 오답 4건 확정 + 판정 중 6건 = 한도(10): 아직 잠긴 것이 아니다. 판정 중인 시도가 끝나면 풀린다.
    for (let count = 0; count < 4; count += 1) admitOrThrow(guard).fail();
    const inFlight = Array.from({ length: VERSION_SHARE_PASSWORD_MAX_FAILURES - 4 }, () => admitOrThrow(guard));

    expect(guard.admit(LINK)).toMatchObject({ admitted: false, reason: "busy", retryAfterSeconds: 1 });
    inFlight.forEach((attempt) => attempt.release());
    expect(canAdmit(guard)).toBe(true);

    // 확정된 오답이 한도에 닿으면 판정 중인 시도가 있든 없든 잠금이다.
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES - 4; count += 1) admitOrThrow(guard).fail();
    expect(guard.admit(LINK)).toMatchObject({ admitted: false, reason: "locked" });
  });

  it("오답으로 확정하면 창이 끝날 때까지 남은 초(올림)를 안내하고 창이 지나면 풀린다", () => {
    const guard = new VersionSharePasswordGuard();
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES; count += 1) admitOrThrow(guard).fail();

    vi.setSystemTime(NOW + 1_500);
    expect(guard.admit(LINK)).toEqual({
      admitted: false,
      reason: "locked",
      retryAfterSeconds: Math.ceil((VERSION_SHARE_PASSWORD_WINDOW_MS - 1_500) / 1000),
    });
    vi.setSystemTime(NOW + VERSION_SHARE_PASSWORD_WINDOW_MS + 1);
    expect(canAdmit(guard)).toBe(true);
  });

  it("fail 과 release 는 먼저 부른 쪽만 효력이 있고 이후 호출은 무시한다", () => {
    const guard = new VersionSharePasswordGuard();
    const released = admitOrThrow(guard);
    released.release();
    released.fail();
    released.fail();
    // 되돌린 시도는 오답이 아니므로 한도만큼 다시 선점할 수 있다.
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES; count += 1) admitOrThrow(guard).release();

    const failed = admitOrThrow(guard);
    failed.fail();
    failed.fail();
    failed.release();
    // 오답은 한 번만 세어졌으니 8건을 더 틀려도 9건이라 아직 열려 있고, 한 건을 더하면 잠긴다.
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES - 2; count += 1) admitOrThrow(guard).fail();
    expect(canAdmit(guard)).toBe(true);
    admitOrThrow(guard).fail();
    expect(canAdmit(guard)).toBe(false);
  });

  it("올바른 비밀번호로 열리면 그 링크의 오답 기록이 지워진다", () => {
    const guard = new VersionSharePasswordGuard();
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES - 1; count += 1) admitOrThrow(guard).fail();
    guard.reset(LINK);
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES - 1; count += 1) admitOrThrow(guard).fail();
    expect(canAdmit(guard)).toBe(true);
  });

  it("없는 토큰을 대량으로 보내도 실제 링크의 확정된 오답 창을 밀어내지 못한다", () => {
    const guard = new VersionSharePasswordGuard();
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES; count += 1) admitOrThrow(guard, "real-link").fail();
    // 모두 선점됐다가 되돌려진다(링크 없음·회수·만료·저장소 오류와 같은 경로).
    for (let index = 0; index < 5_000; index += 1) admitOrThrow(guard, `ghost-${index}`).release();

    expect(canAdmit(guard, "real-link")).toBe(false);
    expect(canAdmit(guard, "ghost-1")).toBe(true);
  });

  it("링크마다 독립이다", () => {
    const guard = new VersionSharePasswordGuard();
    for (let count = 0; count < VERSION_SHARE_PASSWORD_MAX_FAILURES; count += 1) admitOrThrow(guard, "link-a").fail();
    expect(canAdmit(guard, "link-a")).toBe(false);
    expect(canAdmit(guard, "link-b")).toBe(true);
  });
});
