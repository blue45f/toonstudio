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

/** NSTouchPhase 매핑 (_HandleTouchEvent 0x2a0c): 0=Began(1), 1=Moved(2), 2=Ended(8), 3=Cancelled(0x10), 4=Stationary(4) */
export type ShaperTrackpadTouchPhase = 0 | 1 | 2 | 3 | 4;

/**
 * TrackpadTouchOSX `_HandleTouchEvent` (`0x2a0c`, Ghidra `ev_796f59dbb795e64bc171e96b2b59ee6e0ee3434cd1d786d40406816b040274eb`) 역공학 내재화:
 * macOS `NSTouchPhase` 비트마스크(`1=Began`, `2=Moved`, `4=Stationary`, `8=Ended`, `16=Cancelled`)를
 * 20바이트 링 버퍼 레코드의 `phase` 바이트(`0..4`)로 변환한다.
 */
export function mapShaperNsTouchPhaseToRingPhase(
  nsTouchPhaseBit: number,
): ShaperTrackpadTouchPhase | null {
  switch (nsTouchPhaseBit) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 4:
      return 4;
    case 8:
      return 2;
    case 16:
      return 3;
    default:
      return null;
  }
}

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

  const pushRecord = (record: ShaperTrackpadTouchRecord): void => {
    ringBuffer[writeIndex] = record;
    writeIndex = (writeIndex + 1) % SHAPER_TRACKPAD_RING_BUFFER_CAPACITY;
    if (writeIndex === readIndex) {
      readIndex = (readIndex + 1) % SHAPER_TRACKPAD_RING_BUFFER_CAPACITY;
    }
  };

  /**
   * TrackpadTouchOSX `_clearFingersOlderThan` (`0x37d0`, Ghidra `ev_796f59dbb795e64bc171e96b2b59ee6e0ee3434cd1d786d40406816b040274eb`):
   * `cutoffTimestampSec` 이전에 멈춘 유령 슬롯을 해제하고 `CONCAT11(2, touchId)`(`phase=2` Ended, `pos=(0,0)`) 합성 종료 레코드를 링 버퍼에 기록한다.
   */
  const clearFingersOlderThan = (cutoffTimestampSec: number): number => {
    let cleared = 0;
    for (let i = 0; i < SHAPER_TRACKPAD_MAX_FINGERS; i += 1) {
      const slot = slots[i];
      if (slot && slot.identity !== null && slot.lastTimestampSec < cutoffTimestampSec) {
        slot.identity = null;
        slot.lastTimestampSec = -Infinity;
        pushRecord({
          touchId: i,
          phase: 2,
          normalizedX: 0,
          normalizedY: 0,
          deviceWidth: 160,
          deviceHeight: 115,
        });
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

  return {
    handleTouchEvents(events, timestampSec) {
      clearFingersOlderThan(timestampSec - SHAPER_TRACKPAD_STALE_TIMEOUT_SEC);
      const emitted: ShaperTrackpadTouchRecord[] = [];
      for (const ev of events) {
        const touchId = resolveUserTouchId(ev.identity, timestampSec);
        const isTerminal = ev.phase === 2 || ev.phase === 3;
        if (isTerminal) {
          const slot = slots[touchId];
          if (slot) {
            slot.identity = null;
            slot.lastTimestampSec = -Infinity;
          }
        }
        const record: ShaperTrackpadTouchRecord = {
          touchId,
          phase: ev.phase,
          normalizedX: isTerminal ? 0 : ev.normalizedX,
          normalizedY: isTerminal ? 0 : ev.normalizedY,
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

export type ShaperUniWinCTransparentType = "none" | "alpha" | "color-key";

export interface ShaperNativeWindowStateInput {
  readonly isTransparent: boolean;
  readonly isClickThroughEnabled: boolean;
  readonly cursorPixelAlpha: number;
  readonly alphaThreshold?: number;
  /** LibUniWinC `_SetTransparentType` (`0x3d90`): `"none"`(0), `"alpha"`(1), `"color-key"`(2) */
  readonly transparentType?: ShaperUniWinCTransparentType;
  readonly cursorPixelRgb?: readonly [number, number, number];
  /** LibUniWinC `_SetKeyColor` (`0x3da0`): 크로마키 투명 기준 RGB (0..1) */
  readonly keyColorRgb?: readonly [number, number, number];
  readonly colorKeyTolerance?: number;
}

/**
 * LibUniWinC 네이티브 플러그인(`_SetTransparent`, `_SetTransparentType` `0x3d90`, `_SetKeyColor` `0x3da0`, `_SetClickThrough`)의
 * 픽셀 알파 / 컬러키 기반 클릭 투과 판별기:
 * - `"alpha"` 모드(기본): 커서 아래 픽셀 알파가 `alphaThreshold`(`0.1`) 미만이면 뒤쪽 창으로 클릭 투과
 * - `"color-key"` 모드: 커서 아래 픽셀 RGB와 `keyColorRgb` 간 최대 채널 오차가 `colorKeyTolerance`(`0.02`) 이하이거나 알파가 임계값 미만이면 투과
 */
export function shouldPassThroughShaperNativeWindowClick(
  input: ShaperNativeWindowStateInput,
): boolean {
  const {
    isTransparent,
    isClickThroughEnabled,
    cursorPixelAlpha,
    alphaThreshold = 0.1,
    transparentType = "alpha",
    cursorPixelRgb,
    keyColorRgb,
    colorKeyTolerance = 0.02,
  } = input;
  if (!isTransparent || !isClickThroughEnabled || transparentType === "none") {
    return false;
  }
  if (transparentType === "color-key" && cursorPixelRgb && keyColorRgb) {
    const maxDiff = Math.max(
      Math.abs(cursorPixelRgb[0] - keyColorRgb[0]),
      Math.abs(cursorPixelRgb[1] - keyColorRgb[1]),
      Math.abs(cursorPixelRgb[2] - keyColorRgb[2]),
    );
    if (maxDiff <= colorKeyTolerance) {
      return true;
    }
  }
  return cursorPixelAlpha < alphaThreshold;
}

export interface ShaperUniWinCFileFilterGroup {
  readonly title: string;
  readonly extensions: readonly string[];
}

export interface ShaperUniWinCFileFilterSpec {
  readonly groups: readonly ShaperUniWinCFileFilterGroup[];
  /** 와일드카드 `*`가 포함되어 모든 파일 형식을 허용(`allowedFileTypes = null`)하는지 여부 */
  readonly allowsAllFiles: boolean;
  readonly allowedExtensions: readonly string[] | null;
}

/**
 * LibUniWinC `CustomPanelHelper::addFileTypes` (`0x4328`, Ghidra `ev_66a1183877ebd0fb1a7b96d34bc3f17e22b94dcf331ff32759efb89bccfcd2d9`) 역공학 내재화:
 * 개행(`\n`, `0x0a`)으로 필터 줄을 분리하고 탭(`\t`, `0x09`)으로 제목(`col[0]`)과 확장자(`col[1..]`)를 분리한다.
 * 제목이나 확장자 중 하나라도 `"*"`이면 `allowsAllFiles = true` 및 `allowedExtensions = null`을 반환한다.
 */
export function parseShaperUniWinCFileTypesFilter(
  filterText: string,
): ShaperUniWinCFileFilterSpec {
  const lines = filterText.split("\n");
  const groups: ShaperUniWinCFileFilterGroup[] = [];
  const allExtensions: string[] = [];
  let allowsAllFiles = false;

  for (const rawLine of lines) {
    const cols = rawLine.split("\t");
    if (cols.length < 2) continue;
    const title = cols[0] ?? "";
    const exts: string[] = [];
    if (title === "*") {
      allowsAllFiles = true;
    }
    for (let i = 1; i < cols.length; i += 1) {
      const ext = (cols[i] ?? "").trim();
      if (!ext) continue;
      if (ext === "*") {
        allowsAllFiles = true;
      } else {
        exts.push(ext);
        if (!allExtensions.includes(ext)) {
          allExtensions.push(ext);
        }
      }
    }
    groups.push({ title, extensions: exts });
  }

  return {
    groups,
    allowsAllFiles,
    allowedExtensions: allowsAllFiles ? null : allExtensions,
  };
}
