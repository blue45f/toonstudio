import { describe, expect, it } from "vitest";

import {
  SHELL_BOOT_HOST_PHASES,
  SHELL_BOOT_IDLE_FALLBACK_MS,
  SHELL_BOOT_IDLE_TIMEOUT_MS,
  SHELL_BOOT_PHASE_AFTER_PAINT,
  SHELL_BOOT_PHASE_IDLE,
  SHELL_BOOT_PHASE_PAINT,
  advanceShellBootPhase,
  isShellBootPhaseReached,
  shellBootPhaseForHost,
  type ShellBootHostId,
} from "./shell-boot-phases";

const AFTER_PAINT_HOSTS: readonly ShellBootHostId[] = [
  "service-capability-runtime",
  "store-sync",
  "service-degraded-banner",
  "accessible-tooltip-layer",
  "guest-migration-bridge",
  "account-nudge-host",
  "site-creation-compass",
  "active-project-context-bridge",
];

const IDLE_HOSTS: readonly ShellBootHostId[] = [
  "pwa-install-showcase-host",
  "pwa-connection-pulse",
  "creator-onboarding-gate",
  "ambient-experience-host",
  "site-next-steps",
  "public-site-next-steps",
];

describe("shell boot phases — 호스트 단계 배정", () => {
  it("단계화 대상 호스트는 전부 paint가 아닌 단계에 배정된다 (첫 페인트와 경합 금지)", () => {
    for (const [hostId, phase] of Object.entries(SHELL_BOOT_HOST_PHASES)) {
      expect(phase, hostId).toBeGreaterThan(SHELL_BOOT_PHASE_PAINT);
    }
  });

  it("정확성 인접 호스트는 idle이 아니라 after-paint에 배정된다", () => {
    for (const hostId of AFTER_PAINT_HOSTS) {
      expect(shellBootPhaseForHost(hostId), hostId).toBe(SHELL_BOOT_PHASE_AFTER_PAINT);
    }
  });

  it("장식·홍보·온보딩 호스트는 idle에 배정된다", () => {
    for (const hostId of IDLE_HOSTS) {
      expect(shellBootPhaseForHost(hostId), hostId).toBe(SHELL_BOOT_PHASE_IDLE);
    }
  });

  it("배정표는 after-paint 8종 + idle 6종, 총 14종을 빠짐없이 담는다", () => {
    expect(Object.keys(SHELL_BOOT_HOST_PHASES)).toHaveLength(
      AFTER_PAINT_HOSTS.length + IDLE_HOSTS.length,
    );
    for (const hostId of [...AFTER_PAINT_HOSTS, ...IDLE_HOSTS]) {
      expect(SHELL_BOOT_HOST_PHASES).toHaveProperty(hostId);
    }
  });

  it("idle 상한은 유한하고 폴백보다 길다 (rIC timeout이 폴백을 이긴다)", () => {
    expect(SHELL_BOOT_IDLE_TIMEOUT_MS).toBe(2_000);
    expect(SHELL_BOOT_IDLE_FALLBACK_MS).toBe(1_200);
    expect(SHELL_BOOT_IDLE_TIMEOUT_MS).toBeGreaterThan(SHELL_BOOT_IDLE_FALLBACK_MS);
  });
});

describe("shell boot phases — 도달 판정과 전진", () => {
  it("isShellBootPhaseReached는 경계에서 정확하다", () => {
    expect(isShellBootPhaseReached(SHELL_BOOT_PHASE_PAINT, SHELL_BOOT_PHASE_PAINT)).toBe(true);
    expect(isShellBootPhaseReached(SHELL_BOOT_PHASE_PAINT, SHELL_BOOT_PHASE_AFTER_PAINT)).toBe(false);
    expect(isShellBootPhaseReached(SHELL_BOOT_PHASE_AFTER_PAINT, SHELL_BOOT_PHASE_IDLE)).toBe(false);
    expect(isShellBootPhaseReached(SHELL_BOOT_PHASE_IDLE, SHELL_BOOT_PHASE_AFTER_PAINT)).toBe(true);
    expect(isShellBootPhaseReached(SHELL_BOOT_PHASE_IDLE, SHELL_BOOT_PHASE_IDLE)).toBe(true);
  });

  it("advanceShellBootPhase는 단조 증가만 허용한다", () => {
    expect(advanceShellBootPhase(SHELL_BOOT_PHASE_PAINT, SHELL_BOOT_PHASE_AFTER_PAINT))
      .toBe(SHELL_BOOT_PHASE_AFTER_PAINT);
    expect(advanceShellBootPhase(SHELL_BOOT_PHASE_PAINT, SHELL_BOOT_PHASE_IDLE))
      .toBe(SHELL_BOOT_PHASE_IDLE);
    expect(advanceShellBootPhase(SHELL_BOOT_PHASE_IDLE, SHELL_BOOT_PHASE_AFTER_PAINT))
      .toBe(SHELL_BOOT_PHASE_IDLE);
    expect(advanceShellBootPhase(SHELL_BOOT_PHASE_AFTER_PAINT, SHELL_BOOT_PHASE_PAINT))
      .toBe(SHELL_BOOT_PHASE_AFTER_PAINT);
  });
});
