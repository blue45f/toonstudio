/**
 * studio-decoration-credit-purchase.ts — 꾸미기 유료 아이템 크레딧 결제
 * 오케스트레이션 (P3). Nest에 의존하지 않는 순수 모듈이다.
 *
 * 경유 방식 (spend 오케스트레이션 패턴 경유, spend API 자체 경유 아님):
 *  - spend API(`credit-spend.ts`)는 고정 단가 키(feature) + 1단위 가격
 *    일치 규칙으로 동작한다. 꾸미기 상품은 상품마다 가격이 달라 단가 키
 *    체계로 표현할 수 없으므로, spend API를 직접 경유하지 않는다.
 *  - 대신 spend와 동일한 오케스트레이션 패턴을 따른다: 서버 카탈로그
 *    가격 권위 → 예약(reserve) → 확정(capture) → 멱등키(requestId)
 *    기반 중복 결제 방지. 마켓 정산 모듈과 같은 seam 방식을 쓴다.
 *  - DB에 직접 접근하지 않는다. 지갑 호출은 아래 seam 인터페이스로만
 *    하며, 라이브 지갑 어댑터는 spend·마켓과 동일한 공개 reserve /
 *    capture 경로로 연결하는 것이 후속 과제이다 (이 파일 자체는
 *    지갑 서비스 파일을 건드리지 않는다).
 *
 * 분리 원칙:
 *  - 이 모듈은 "장착 권한 구매"만을 결제한다. 구매 이후의 배치 저장은
 *    기존 무료 decoration `save()` 경로가 담당하며, 이 모듈은 save()를
 *    호출하거나 save()에 차감을 끼우지 않는다.
 *  - 장착 권한의 영속화(구매한 아이템 목록 테이블)는 이 모듈의 범위가
 *    아니다. 구매 식별자(purchaseId = 예약 식별자)를 반환하므로
 *    호출부는 이를 권한 기록의 외부 키로 쓸 수 있다. 권한 테이블
 *    신설은 별도 마이그레이션 결정이 필요하다 (후속 과제).
 *  - 카탈로그 외 아이템(무료)은 `decoration_free_item`으로 거부한다.
 *    무료 아이템을 결제 경로로 보내 과금하는 일을 막기 위함이며,
 *    호출부는 이 경우 기존 무료 배치 경로로 돌려보낸다.
 */
import {
  PAID_OPERATIONS_DISABLED,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";
import { decorationCreditPrice } from "./studio-decoration-credit-catalog";

export type DecorationCreditReservationStatus =
  | "reserved"
  | "captured"
  | "released"
  | "expired";

export interface DecorationCreditReservation {
  id: string;
  status: DecorationCreditReservationStatus;
  requestedAmount: number;
  capturedAmount: number;
}

/** 지갑 서비스 중 꾸미기 결제가 사용하는 구조적 인터페이스 (seam). */
export interface DecorationCreditWallet {
  reserveDecorationCredits(input: {
    userId: string;
    itemId: string;
    priceCredits: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<DecorationCreditReservation>;
  captureDecorationReservation(
    reservationId: string,
  ): Promise<DecorationCreditReservation>;
}

export interface DecorationCreditPurchaseInput {
  itemId?: unknown;
  requestId?: unknown;
}

export interface DecorationCreditPurchaseResult {
  purchaseId: string;
  itemId: string;
  priceCredits: number;
  charged: true;
}

export class DecorationCreditError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DecorationCreditError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function decorationCreditIdempotencyKey(requestId: string): string {
  return `decoration-credit:${requestId}`;
}

export async function purchaseDecorationCredits(
  wallet: DecorationCreditWallet,
  userIdValue: string | undefined,
  body: DecorationCreditPurchaseInput,
  paidOperations?: PaidOperationsSettingStore,
): Promise<DecorationCreditPurchaseResult> {
  const userId = userIdValue?.trim();
  if (!userId) {
    throw new DecorationCreditError(
      "decoration_login_required",
      403,
      "로그인이 필요해요.",
    );
  }
  const itemId = boundedText(body?.itemId, 200);
  if (!itemId) {
    throw new DecorationCreditError(
      "decoration_invalid_input",
      400,
      "꾸미기 아이템 식별자가 필요합니다.",
    );
  }
  const requestId = boundedText(body?.requestId, 200);
  if (!requestId) {
    throw new DecorationCreditError(
      "decoration_invalid_input",
      400,
      "구매 요청 식별자가 필요합니다.",
    );
  }

  // 서버 카탈로그 가격 권위: 클라이언트 제시 가격은 받지 않는다.
  const priceCredits: number | null = decorationCreditPrice(itemId);
  if (priceCredits === null) {
    throw new DecorationCreditError(
      "decoration_free_item",
      400,
      "이 아이템은 유료 카탈로그 상품이 아닙니다. 무료 배치 경로를 이용하세요.",
      { itemId },
    );
  }
  // 유료 실행 게이트: 카탈로그 가격 확인 뒤, 첫 지갑 호출(예약) 전에
  // 검사한다. 카탈로그 외 무료 아이템은 게이트와 무관하게 기존
  // decoration_free_item으로 거부되어 무료 배치 경로로 돌아간다.
  if (!(await resolvePaidOperationsEnabled(paidOperations))) {
    throw new DecorationCreditError(
      PAID_OPERATIONS_DISABLED,
      403,
      "유료 운영이 비활성화되어 있어 꾸미기 아이템 결제를 실행할 수 없습니다.",
      { itemId },
    );
  }
  const reservation = await wallet.reserveDecorationCredits({
    userId,
    itemId,
    priceCredits,
    idempotencyKey: decorationCreditIdempotencyKey(requestId),
    metadata: { itemId, decorationPurchaseRequestId: requestId },
  });

  let settled: DecorationCreditReservation;
  if (reservation.status === "captured") {
    // 동일 requestId 재호출: 이미 확정된 구매이다. 재차감하지 않는다.
    settled = reservation;
  } else if (reservation.status === "reserved") {
    settled = await wallet.captureDecorationReservation(reservation.id);
    if (settled.status !== "captured") {
      throw new DecorationCreditError(
        "decoration_settlement_failed",
        409,
        "꾸미기 아이템 결제 확정에 실패했습니다.",
        { purchaseId: reservation.id },
      );
    }
  } else {
    // released / expired: 동일 멱등키로는 새 예약을 만들 수 없다.
    throw new DecorationCreditError(
      "decoration_request_reused_after_release",
      409,
      "이미 종료된 구매 요청 식별자입니다. 새 요청 식별자로 다시 요청하세요.",
      { purchaseId: reservation.id, status: reservation.status },
    );
  }

  return {
    purchaseId: settled.id,
    itemId,
    priceCredits,
    charged: true,
  };
}
