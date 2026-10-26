/**
 * SHAPER macOS 네이티브 번들 플러그인 2종 역공학 내재화:
 * 1. TrackpadTouchOSX.bundle/Contents/MacOS/TrackpadTouchOSX (ev_48cb36fc827d7f3fa9e44d7e45f04ce646926ee3d233428a2e4ec61805501b2f):
 *    - _SetupTrackingObject (0x3330): 513개(0x201) 엔트리의 20바이트 링 버퍼 할당
 *    - _getUserTouchId (0x35b4): NSTouch identity를 10-슬롯(0..9) 테이블에 매핑, 포화 시 최고령 타임스탬프 슬롯 축출
 *    - _HandleTouchEvent (0x3130) & _clearFingersOlderThan (0x3514): 1.5초 이상 갱신되지 않은 유령 터치 슬롯 자동 정리
 * 2. LibUniWinC.bundle/Contents/MacOS/LibUniWinC (ev_2481e97e7252e4563caff60a2b3f90c4b1eb5c3fa757fae4150b1ff05c2997be):
 *    - 투명/테두리 없음/항상 위/클릭 투과(HitTest 알파 임계치) 및 파일 드롭 윈도우 상태 판별
 */

/** _SetupTrackingObject(0x3330): mov w9, #0x201 (513) */
export const SHAPER_TRACKPAD_RING_BUFFER_CAPACITY = 513;

/** _getUserTouchId(0x35b4): 10-손가락 슬롯 테이블 크기 */
export const SHAPER_TRACKPAD_MAX_FINGERS = 10;

/** _HandleTouchEvent(0x3130): fmov d1, #-1.5 -> _clearFingersOlderThan(timestamp - 1.5) */
export const SHAPER_TRACKPAD_STALE_TIMEOUT_SEC = 1.5;

/** NSTouchPhase 매핑: 0=Began, 1=Moved, 2=Cancelled, 3=Ended, 4=Stationary */
export type ShaperTrackpadTouchPhase = 0 | 1 | 2 | 3 | 4;

export interface ShaperRawTrackpadTouchEvent {
  readonly identity: string;
  readonly phase: ShaperTrackpadTouchPhase;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly deviceWidth?: number;
  readonly deviceHeight?: number;
}

export interface ShaperTrackpadTouchRecord {
  readonly touchId: number;
  readonly phase: ShaperTrackpadTouchPhase;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly deviceWidth: number;
  readonly deviceHeight: number;
}

export interface ShaperTrackpadFingerSlot {
  readonly touchId: number;
  readonly identity: string | null;
  readonly lastTimestampSec: number;
}

export interface ShaperTrackpadTouchTracker {
  handleTouchEvents(
    events: readonly ShaperRawTrackpadTouchEvent[],
    timestampSec: number,
  ): readonly ShaperTrackpadTouchRecord[];
  popTouchRecord(): ShaperTrackpadTouchRecord | null;
  clearFingersOlderThan(cutoffTimestampSec: number): number;
  getFingerSlots(): readonly ShaperTrackpadFingerSlot[];
  getPendingCount(): number;
}

/**
 * TrackpadTouchOSX 네이티브 ARM64 어셈블리(`0x3130..0x3664`)의 513-링 버퍼 및 10-슬롯 터치 ID 할당기를 생성한다.
 */
export function createShaperTrackpadTouchTracker(): ShaperTrackpadTouchTracker {
  const slots: Array<{ identity: string | null; lastTimestampSec: number }> = Array.from(
    { length: SHAPER_TRACKPAD_MAX_FINGERS },
    () => ({ identity: null, lastTimestampSec: -Infinity }),
  );
  const ringBuffer: Array<ShaperTrackpadTouchRecord | null> = Array.from(
    { length: SHAPER_TRACKPAD_RING_BUFFER_CAPACITY },
    () => null,
  );
  let readIndex = 0;
  let writeIndex = 0;

  const clearFingersOlderThan = (cutoffTimestampSec: number): number => {
    let cleared = 0;
    for (let i = 0; i < SHAPER_TRACKPAD_MAX_FINGERS; i += 1) {
      const slot = slots[i];
      if (slot && slot.identity !== null && slot.lastTimestampSec < cutoffTimestampSec) {
        slot.identity = null;
        slot.lastTimestampSec = -Infinity;
        cleared += 1;
      }
    }
    return cleared;
  };

  const resolveUserTouchId = (identity: string, timestampSec: number): number => {
    for (let i = 0; i < SHAPER_TRACKPAD_MAX_FINGERS; i += 1) {
      const slot = slots[i];
      if (slot && slot.identity === identity) {
        slot.lastTimestampSec = timestampSec;
        return i;
      }
    }
    for (let i = 0; i < SHAPER_TRACKPAD_MAX_FINGERS; i += 1) {
      const slot = slots[i];
      if (slot && slot.identity === null) {
        slot.identity = identity;
        slot.lastTimestampSec = timestampSec;
        return i;
      }
    }
    // 10개 슬롯이 모두 점유된 경우 가장 오래된 타임스탬프 슬롯을 축출(_getUserTouchId 0x3620)
    let oldestIdx = 0;
    let oldestTime = Infinity;
    for (let i = 0; i < SHAPER_TRACKPAD_MAX_FINGERS; i += 1) {
      const slot = slots[i];
      if (slot && slot.lastTimestampSec < oldestTime) {
        oldestTime = slot.lastTimestampSec;
        oldestIdx = i;
      }
    }
    const targetSlot = slots[oldestIdx];
    if (targetSlot) {
      targetSlot.identity = identity;
      targetSlot.lastTimestampSec = timestampSec;
    }
    return oldestIdx;
  };

  const pushRecord = (record: ShaperTrackpadTouchRecord): void => {
    ringBuffer[writeIndex] = record;
    writeIndex = (writeIndex + 1) % SHAPER_TRACKPAD_RING_BUFFER_CAPACITY;
    if (writeIndex === readIndex) {
      readIndex = (readIndex + 1) % SHAPER_TRACKPAD_RING_BUFFER_CAPACITY;
    }
  };

  return {
    handleTouchEvents(events, timestampSec) {
      clearFingersOlderThan(timestampSec - SHAPER_TRACKPAD_STALE_TIMEOUT_SEC);
      const emitted: ShaperTrackpadTouchRecord[] = [];
      for (const ev of events) {
        const touchId = resolveUserTouchId(ev.identity, timestampSec);
        if (ev.phase === 2 || ev.phase === 3) {
          const slot = slots[touchId];
          if (slot) {
            slot.identity = null;
            slot.lastTimestampSec = -Infinity;
          }
        }
        const record: ShaperTrackpadTouchRecord = {
          touchId,
          phase: ev.phase,
          normalizedX: ev.normalizedX,
          normalizedY: ev.normalizedY,
          deviceWidth: ev.deviceWidth ?? 160,
          deviceHeight: ev.deviceHeight ?? 115,
        };
        pushRecord(record);
        emitted.push(record);
      }
      return emitted;
    },
    popTouchRecord() {
      if (readIndex === writeIndex) return null;
      const record = ringBuffer[readIndex] ?? null;
      ringBuffer[readIndex] = null;
      readIndex = (readIndex + 1) % SHAPER_TRACKPAD_RING_BUFFER_CAPACITY;
      return record;
    },
    clearFingersOlderThan,
    getFingerSlots() {
      return slots.map((s, idx) => ({
        touchId: idx,
        identity: s.identity,
        lastTimestampSec: s.lastTimestampSec,
      }));
    },
    getPendingCount() {
      return (
        (writeIndex - readIndex + SHAPER_TRACKPAD_RING_BUFFER_CAPACITY) %
        SHAPER_TRACKPAD_RING_BUFFER_CAPACITY
      );
    },
  };
}

export interface ShaperNativeWindowStateInput {
  readonly isTransparent: boolean;
  readonly isClickThroughEnabled: boolean;
  readonly cursorPixelAlpha: number;
  readonly alphaThreshold?: number;
}

/**
 * LibUniWinC 네이티브 플러그인(`_SetTransparent`, `_SetClickThrough`)의 픽셀 알파 기반 클릭 투과 판별기:
 * 투명 윈도우 모드에서 클릭 투과가 활성화되어 있고 커서 아래 픽셀 알파가 임계값(`0.1`) 미만이면 마우스 이벤트를 뒤쪽 창으로 통과시킨다.
 */
export function shouldPassThroughShaperNativeWindowClick(
  input: ShaperNativeWindowStateInput,
): boolean {
  const {
    isTransparent,
    isClickThroughEnabled,
    cursorPixelAlpha,
    alphaThreshold = 0.1,
  } = input;
  if (!isTransparent || !isClickThroughEnabled) return false;
  return cursorPixelAlpha < alphaThreshold;
}
