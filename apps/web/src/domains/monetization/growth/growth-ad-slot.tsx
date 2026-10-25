/**
 * growth-ad-slot.tsx — 광고 슬롯 프레임워크 (5단계, 2026-10-25).
 *
 * 표시 프레임워크만 제공한다:
 *  - 제공자 SDK·실광고·추적 스크립트를 포함하지 않는다. 슬롯이
 *    켜져도 렌더되는 것은 "광고 영역" 표시 상자뿐이다.
 *  - 기본값은 OFF다 (`adsEnabled` 미전달 시 렌더하지 않음).
 *  - 붙는 면은 공개 면(포털·커뮤니티·작품 탐색)으로만 한정한다.
 *    작업 화면·캔버스·편집기 면은 가드가 강제 차단한다:
 *    `adsEnabled`가 true여도 금지 면에서는 렌더하지 않으며,
 *    프로그래밍 배치 검증(`assertAdSlotSurface`)은 금지 면에서
 *    예외를 던진다.
 *  - 유료 결제와 무관한 표시 프레임워크다. 유료 경로는 손대지
 *    않는다.
 */
import { useT } from "@/shared/lib/i18n";

/** 광고 슬롯을 붙일 수 있는 공개 면. */
export const AD_SLOT_ALLOWED_SURFACES = [
  "portal",
  "community",
  "work-discovery",
] as const;

export type AdSlotSurface = (typeof AD_SLOT_ALLOWED_SURFACES)[number];

/** 광고 슬롯이 절대 붙지 않는 면 (작업 화면·캔버스 계열). */
export const AD_SLOT_FORBIDDEN_SURFACES = [
  "studio",
  "canvas",
  "editor",
  "work-surface",
] as const;

export type AdSlotForbiddenSurface =
  (typeof AD_SLOT_FORBIDDEN_SURFACES)[number];

function isAllowedSurface(surface: string): surface is AdSlotSurface {
  return (AD_SLOT_ALLOWED_SURFACES as readonly string[]).includes(surface);
}

function isForbiddenSurface(surface: string): boolean {
  return (AD_SLOT_FORBIDDEN_SURFACES as readonly string[]).includes(surface);
}

/**
 * 슬롯 가시성 판정 (fail-closed): 허용 면 + 명시적 ON일 때만 true.
 * 금지 면·미지정 면·OFF이면 false다.
 */
export function resolveAdSlotVisibility(input: {
  surface: string;
  adsEnabled?: boolean;
}): boolean {
  if (input.adsEnabled !== true) return false;
  if (isForbiddenSurface(input.surface)) return false;
  return isAllowedSurface(input.surface);
}

/**
 * 배치 검증 가드. 금지 면에 슬롯을 배치하려는 호출을 예외로
 * 막는다. 렌더 단계에서는 `resolveAdSlotVisibility`가 null로
 * fail-closed 처리하므로, 이 함수는 배치 코드·테스트용이다.
 */
export function assertAdSlotSurface(surface: string): void {
  if (isForbiddenSurface(surface)) {
    throw new Error(
      `광고 슬롯은 작업 화면·캔버스 면(${surface})에 붙일 수 없습니다.`,
    );
  }
  if (!isAllowedSurface(surface)) {
    throw new Error(`알 수 없는 광고 슬롯 면입니다: ${surface}`);
  }
}

export function GrowthAdSlot({
  surface,
  adsEnabled = false,
  className,
}: {
  readonly surface: string;
  /** 기본값 OFF. 명시적 true + 허용 면일 때만 표시 상자가 렌더된다. */
  readonly adsEnabled?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  if (!resolveAdSlotVisibility({ surface, adsEnabled })) {
    return null;
  }
  return (
    <aside
      aria-label={t("growth.adSlot.placeholder")}
      className={className}
    >
      <p>{t("growth.adSlot.placeholder")}</p>
    </aside>
  );
}
