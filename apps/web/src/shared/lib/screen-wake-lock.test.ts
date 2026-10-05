import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireScreenWakeLock, isScreenWakeLockSupported } from "./screen-wake-lock";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("screen-wake-lock", () => {
  it("wakeLock이 없는 환경에서는 미지원이고 획득은 null이다", async () => {
    vi.stubGlobal("navigator", {});
    expect(isScreenWakeLockSupported()).toBe(false);
    await expect(acquireScreenWakeLock()).resolves.toBeNull();
  });

  it("획득하면 lease가 활성화되고, release는 한 번만 센티넬을 해제한다", async () => {
    const sentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
      }),
    };
    vi.stubGlobal("navigator", {
      wakeLock: { request: vi.fn(async () => sentinel) },
    });
    expect(isScreenWakeLockSupported()).toBe(true);
    const lease = await acquireScreenWakeLock();
    expect(lease).not.toBeNull();
    expect(lease?.isActive()).toBe(true);
    await lease?.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(lease?.isActive()).toBe(false);
    await lease?.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("브라우저가 자동 해제한 센티넬은 비활성으로 보인다", async () => {
    const sentinel = { released: false, release: vi.fn(async () => undefined) };
    vi.stubGlobal("navigator", {
      wakeLock: { request: vi.fn(async () => sentinel) },
    });
    const lease = await acquireScreenWakeLock();
    sentinel.released = true;
    expect(lease?.isActive()).toBe(false);
  });

  it("요청이 거부되면 던지지 않고 null을 돌려준다", async () => {
    vi.stubGlobal("navigator", {
      wakeLock: {
        request: vi.fn(async () => {
          throw new DOMException("blocked", "NotAllowedError");
        }),
      },
    });
    await expect(acquireScreenWakeLock()).resolves.toBeNull();
  });
});
