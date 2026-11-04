/**
 * 순간 이동 직후 화면을 덮는 어두운 막.
 * 카메라가 먼 곳으로 한 프레임에 건너뛰면 길을 잃기 쉬워, 이동 순간 가장 진하고 곧 부드럽게 풀리는 막으로 새 장소를 드러낸다.
 * 동작 줄이기 설정에서는 막 없이 바로 보여 준다.
 */
export const OFFICE2D_TELEPORT_VEIL_MS = 340;
export const OFFICE2D_TELEPORT_VEIL_ALPHA = 0.78;

export class Office2dTeleportVeil {
  private startedAt: number | null = null;

  /** 순간 이동이 일어난 시각(밀리초)을 기록한다. */
  trigger(nowMs: number): void {
    this.startedAt = nowMs;
  }

  /** 지금 막의 불투명도(0~1). 시간이 지나면 0이다. */
  opacity(nowMs: number, reducedMotion: boolean): number {
    if (this.startedAt === null || reducedMotion) return 0;
    const age = (nowMs - this.startedAt) / OFFICE2D_TELEPORT_VEIL_MS;
    if (!(age < 1)) return 0;
    return (1 - Math.max(0, age)) ** 2 * OFFICE2D_TELEPORT_VEIL_ALPHA;
  }
}
