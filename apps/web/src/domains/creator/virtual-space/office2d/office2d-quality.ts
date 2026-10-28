/**
 * ToonOffice 2D 동적 해상도(품질 단계) 관리.
 *
 * Kumospace는 highQuality · performance · batterySaver 3단계로 텍스처·캔버스 배율을 낮추고, SoWork는 회의 중·비활성 탭에서
 * 프레임을 낮춘다(벤치마크 F21·F29). 작업용 PC에서 드로잉 툴과 같이 켜 두는 공간이므로, 프레임이 떨어지면 캔버스 픽셀 배율
 * (devicePixelRatio 상한)을 한 단계씩 낮추고, 충분히 여유가 생기면 천천히 되돌린다.
 *
 * - 2초 창의 평균 FPS가 42 미만이면 한 단계 내린다(바로 다음 창부터 다시 판단).
 * - 평균 FPS 57 이상이 연속 3창(약 6초) 이어지면 한 단계 올린다. 오르내림이 반복되지 않게 올리는 쪽을 더 느리게 한다.
 * - 단계: 2 → 1.5 → 1.25 → 1 (장치 배율보다 높게 올리지 않는다).
 */

export const OFFICE2D_PIXEL_RATIO_STEPS: readonly number[] = Object.freeze([2, 1.5, 1.25, 1]);
const WINDOW_MS = 2000;
const DOWNGRADE_FPS = 42;
const UPGRADE_FPS = 57;
const UPGRADE_WINDOWS = 3;
/** 탭 전환 등으로 생긴 긴 공백은 프레임 시간 표본에서 뺀다. */
const MAX_SAMPLE_MS = 250;

export class Office2dResolutionGovernor {
  private index: number;
  private readonly minIndex: number;
  private windowMs = 0;
  private windowFrames = 0;
  private goodWindows = 0;

  constructor(devicePixelRatio: number) {
    const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const first = OFFICE2D_PIXEL_RATIO_STEPS.findIndex((step) => step <= device + 1e-6);
    this.minIndex = first < 0 ? OFFICE2D_PIXEL_RATIO_STEPS.length - 1 : first;
    this.index = this.minIndex;
  }

  get pixelRatio(): number {
    return OFFICE2D_PIXEL_RATIO_STEPS[this.index] ?? 1;
  }

  /** 프레임 하나의 경과(ms)를 넣는다. 배율이 바뀌면 새 배율을, 아니면 null을 돌려준다. */
  sample(frameMs: number): number | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > MAX_SAMPLE_MS) return null;
    this.windowMs += frameMs;
    this.windowFrames += 1;
    if (this.windowMs < WINDOW_MS) return null;
    const fps = (this.windowFrames * 1000) / this.windowMs;
    this.windowMs = 0;
    this.windowFrames = 0;
    if (fps < DOWNGRADE_FPS) {
      this.goodWindows = 0;
      if (this.index < OFFICE2D_PIXEL_RATIO_STEPS.length - 1) {
        this.index += 1;
        return this.pixelRatio;
      }
      return null;
    }
    if (fps >= UPGRADE_FPS) {
      this.goodWindows += 1;
      if (this.goodWindows >= UPGRADE_WINDOWS && this.index > this.minIndex) {
        this.goodWindows = 0;
        this.index -= 1;
        return this.pixelRatio;
      }
      return null;
    }
    this.goodWindows = 0;
    return null;
  }

  /** 탭이 다시 보이면 이전 창 표본을 버린다(숨김 동안의 공백이 평균을 왜곡하지 않게). */
  resetWindow(): void {
    this.windowMs = 0;
    this.windowFrames = 0;
    this.goodWindows = 0;
  }
}
