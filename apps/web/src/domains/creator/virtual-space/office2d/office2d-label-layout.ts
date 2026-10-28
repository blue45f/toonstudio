/**
 * ToonOffice 2D 화면 공간 라벨 배치(이름표 겹침 정리).
 *
 * Gather는 이름표·비디오 버블에 무중력 Matter 몸체를 달아 서로 밀어내게 했다(벤치마크 F11). 캔버스 오버레이에서는 그만한 물리가
 * 필요 없어서, 같은 효과를 내는 결정적 탐욕 배치를 쓴다.
 *
 * 1. 우선순위 높은 라벨부터 놓는다(나 → 대화 상대·동료 → NPC → 상주 동료, 같으면 가까운 순).
 * 2. 원래 자리가 이미 놓인 라벨과 겹치면 위로 한 칸씩(라벨 높이 + 간격) 최대 3칸까지 올려 본다.
 * 3. 그래도 겹치면 원래 자리에 두되 흐리게(alpha 0.35) 그려 더 중요한 라벨을 가리지 않는다.
 * 4. 벽 명판(방 이름)은 고정 장애물이 아니라 "양보하는 쪽"이다. 최종 라벨과 겹치는 명판은 흐리게 그린다
 *    (방 이름은 위치 칩·미니맵에도 있으므로 사람 이름이 우선이다).
 *
 * 순수 함수라 캔버스 없이 테스트한다. 좌표는 화면(CSS px)이다.
 */

export interface Office2dLabelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Office2dLabelRequest {
  readonly id: string;
  /** 라벨 가운데 x와 아래쪽 y(머리 위 기준점). */
  readonly anchorX: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  /** 클수록 먼저 놓인다. */
  readonly priority: number;
  /** 같은 우선순위에서 작을수록 먼저(보통 나와의 거리). */
  readonly distance: number;
}

export interface Office2dLabelPlacement {
  readonly id: string;
  /** 원래 자리에서 위로 옮긴 거리(px, 0 이상). */
  readonly lift: number;
  readonly alpha: number;
  readonly box: Office2dLabelBox;
}

const GAP = 3;
const MAX_STEPS = 3;
const BLOCKED_ALPHA = 0.35;

export function office2dBoxesOverlap(a: Office2dLabelBox, b: Office2dLabelBox, padding = 0): boolean {
  return a.x - padding < b.x + b.width && a.x + a.width + padding > b.x && a.y - padding < b.y + b.height && a.y + a.height + padding > b.y;
}

export function layoutOffice2dLabels(requests: readonly Office2dLabelRequest[]): ReadonlyMap<string, Office2dLabelPlacement> {
  const ordered = [...requests].sort((left, right) => right.priority - left.priority || left.distance - right.distance || left.id.localeCompare(right.id));
  const placed: Office2dLabelBox[] = [];
  const result = new Map<string, Office2dLabelPlacement>();
  for (const request of ordered) {
    const base: Office2dLabelBox = { x: request.anchorX - request.width / 2, y: request.bottom - request.height, width: request.width, height: request.height };
    let chosen: Office2dLabelPlacement | null = null;
    for (let step = 0; step <= MAX_STEPS; step += 1) {
      const lift = step * (request.height + GAP);
      const box = { ...base, y: base.y - lift };
      if (!placed.some((other) => office2dBoxesOverlap(box, other, 1))) {
        chosen = { id: request.id, lift, alpha: 1, box };
        break;
      }
    }
    const placement = chosen ?? { id: request.id, lift: 0, alpha: BLOCKED_ALPHA, box: base };
    if (placement.alpha === 1) placed.push(placement.box);
    result.set(request.id, placement);
  }
  return result;
}

/** 벽 명판이 최종 라벨과 겹치면 흐리게 그릴 투명도(0.22), 아니면 1. */
export function office2dSignAlpha(sign: Office2dLabelBox, labels: readonly Office2dLabelBox[]): number {
  return labels.some((label) => office2dBoxesOverlap(sign, label, 2)) ? 0.22 : 1;
}
