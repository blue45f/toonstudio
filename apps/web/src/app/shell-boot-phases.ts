/**
 * AppShell 호스트 부트 단계 계약 (스튜디오 경량 부트 패스트패스).
 *
 * AppShell의 lazy 호스트군은 전부 첫 렌더에서 동시에 마운트되면 각자의 청크
 * 요청이 라우트 청크(특히 /studio/canvas의 편집기)와 대역·메인스레드를 두고
 * 경합해 시작 요청 수와 interactive 시간을 늘린다. 그래서 호스트 마운트를
 * 첫 페인트 이후로 단계화한다:
 *
 * - paint(0): 라우터·헤더/푸터·본문·캠퍼스 프레임 등 첫 페인트 필수 표면.
 *   이 표에 없는 호스트가 여기 속한다.
 * - after-paint(1): 첫 페인트가 끝난 직후(이중 rAF)에 마운트한다. 세션·스토어
 *   동기화처럼 정확성에 닿지만 첫 페인트 자체에는 필요 없는 호스트.
 * - idle(2): 브라우저 유휴 시간(requestIdleCallback, 상한 있음)에 마운트한다.
 *   장식 배경·설치 홍보·온보딩처럼 늦어도 사용 흐름이 깨지지 않는 호스트.
 *   첫 입력과 online 전환은 이 단계를 즉시 승격한다(입력에서 파생되는
 *   호스트가 이벤트를 놓치지 않게).
 *
 * AgeGateHost·ToastHost는 기존 `useDeferredByInput`(입력 또는 4.5초)이
 * 이미 더 엄격하게 지연하므로 이 표에 넣지 않는다.
 * SpatialCampusFrame·AppRouter는 컨텍스트 공급자이자 본문 그 자체라
 * 단계를 늦추면 하위 트리가 리마운트되므로 paint 단계로 고정한다.
 */

export const SHELL_BOOT_PHASE_PAINT = 0;
export const SHELL_BOOT_PHASE_AFTER_PAINT = 1;
export const SHELL_BOOT_PHASE_IDLE = 2;

export type ShellBootPhase =
  | typeof SHELL_BOOT_PHASE_PAINT
  | typeof SHELL_BOOT_PHASE_AFTER_PAINT
  | typeof SHELL_BOOT_PHASE_IDLE;

/** requestIdleCallback 상한 — 유휴가 오지 않아도 이 시간 안에는 반드시 마운트한다. */
export const SHELL_BOOT_IDLE_TIMEOUT_MS = 2_000;
/** requestIdleCallback 미지원 브라우저의 폴백 지연. */
export const SHELL_BOOT_IDLE_FALLBACK_MS = 1_200;

export type ShellBootHostId =
  | "service-capability-runtime"
  | "store-sync"
  | "service-degraded-banner"
  | "accessible-tooltip-layer"
  | "guest-migration-bridge"
  | "account-nudge-host"
  | "site-creation-compass"
  | "active-project-context-bridge"
  | "pwa-install-showcase-host"
  | "pwa-connection-pulse"
  | "creator-onboarding-gate"
  | "ambient-experience-host"
  | "site-next-steps"
  | "public-site-next-steps";

/**
 * 단계화 대상 호스트의 단계 배정. 근거:
 * - after-paint: StoreSync(세션↔스토어 하이드레이션)·ServiceCapabilityRuntime/
 *   DegradedBanner(서비스 상태 표시)·GuestMigrationBridge(멱등 로컬 이관)·
 *   AccountNudgeHost(버스 구독 — 보호 동작 클릭보다 먼저 살아 있어야 함)·
 *   AccessibleTooltipLayer(표시 지연 360ms라 한 프레임 지연이 안 보임)·
 *   본문 인접 브리지 2종(Compass·ActiveProject)은 본문과 함께 읽히는 표면.
 * - idle: AmbientExperienceHost(순수 장식 캔버스+날씨 요청)·PWA 홍보/펄스·
 *   CreatorAdaptiveOnboardingGate(프로필 fetch 뒤에만 열리는 무거운 게이트)·
 *   하단 여정 안내 2종(접힘 아래 표면).
 */
export const SHELL_BOOT_HOST_PHASES: Readonly<Record<ShellBootHostId, ShellBootPhase>> = {
  "service-capability-runtime": SHELL_BOOT_PHASE_AFTER_PAINT,
  "store-sync": SHELL_BOOT_PHASE_AFTER_PAINT,
  "service-degraded-banner": SHELL_BOOT_PHASE_AFTER_PAINT,
  "accessible-tooltip-layer": SHELL_BOOT_PHASE_AFTER_PAINT,
  "guest-migration-bridge": SHELL_BOOT_PHASE_AFTER_PAINT,
  "account-nudge-host": SHELL_BOOT_PHASE_AFTER_PAINT,
  "site-creation-compass": SHELL_BOOT_PHASE_AFTER_PAINT,
  "active-project-context-bridge": SHELL_BOOT_PHASE_AFTER_PAINT,
  "pwa-install-showcase-host": SHELL_BOOT_PHASE_IDLE,
  "pwa-connection-pulse": SHELL_BOOT_PHASE_IDLE,
  "creator-onboarding-gate": SHELL_BOOT_PHASE_IDLE,
  "ambient-experience-host": SHELL_BOOT_PHASE_IDLE,
  "site-next-steps": SHELL_BOOT_PHASE_IDLE,
  "public-site-next-steps": SHELL_BOOT_PHASE_IDLE,
};

export function shellBootPhaseForHost(hostId: ShellBootHostId): ShellBootPhase {
  return SHELL_BOOT_HOST_PHASES[hostId];
}

/** 현재 단계가 호스트의 요구 단계에 도달했는지. */
export function isShellBootPhaseReached(
  current: ShellBootPhase,
  required: ShellBootPhase,
): boolean {
  return current >= required;
}

/**
 * 단계 전진은 단조 증가만 허용하고 범위를 paint~idle로 고정한다.
 * rAF·idle·입력 리스너가 어떤 순서로 발화해도 단계가 뒤로 가지 않게 한다.
 */
export function advanceShellBootPhase(
  current: ShellBootPhase,
  target: ShellBootPhase,
): ShellBootPhase {
  const next = Math.max(current, target);
  return Math.min(SHELL_BOOT_PHASE_IDLE, Math.max(SHELL_BOOT_PHASE_PAINT, next)) as ShellBootPhase;
}
