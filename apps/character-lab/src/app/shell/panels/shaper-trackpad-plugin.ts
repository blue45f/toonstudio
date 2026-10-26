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

/**
 * SHAPER `UIManager::Awake` (`0x06000327`), `UIManager::.ctor` (`0x06000339`), `UIButtonHelper::.ctor` (`0x060002c1`),
 * `UIImageView::ShowEditButtons`/`SetImage` (`0x060002e8..0x060002eb`), `UILayerToggleHelper::Start` (`0x0600030d`),
 * `UIManager::AlignUI` (`0x06000317`), `UIScrollViewMaxHeightPanel::AlignPanel` (`0x06000373`),
 * `UIManager::AddUIHeadPartItem` (`0x06000328`) 역공학 UI/UX 디자인 토큰:
 * CIL `ldc.r4` 상수에서 추출한 스튜디오 다크 테마 색상 및 레이아웃 치수.
 */
export const SHAPER_UI_DESIGN_TOKENS = {
  /** UIImageView::SetImage (0x060002eb): (0.07, 0.07, 0.07, 1.0) -> #121212 */
  canvasBackdropHex: "#121212",
  canvasBackdropRgba: [0.07, 0.07, 0.07, 1.0] as const,
  /** UIImageView::ShowEditButtons (0x060002e8): (0.07, 0.07, 0.07, 0.5) */
  hoverEditScrimRgba: [0.07, 0.07, 0.07, 0.5] as const,
  /** UIManager::Awake (0x06000327): defaultColorBlock (0.2, 0.2, 0.2, 1.0) -> #333333 */
  defaultPanelHex: "#333333",
  defaultPanelRgba: [0.2, 0.2, 0.2, 1.0] as const,
  /** UILayerToggleHelper::Start (0x0600030d): (0.4, 0.4, 0.4, 1.0) -> #666666 */
  layerToggleMutedRgba: [0.4, 0.4, 0.4, 1.0] as const,
  /** UIButtonHelper::.ctor (0x060002c1): disabled (0.45, 0.45, 0.45, 1.0) -> #737373 */
  buttonDisabledRgba: [0.45, 0.45, 0.45, 1.0] as const,
  /** UIManager::.ctor (0x06000339) & UITextKeycap::SetKeyCap (0x06000384): (0.69, 0.69, 0.69, 1.0) -> #B0B0B0 */
  toolIconDefaultHex: "#b0b0b0",
  toolIconDefaultRgba: [0.69, 0.69, 0.69, 1.0] as const,
  /** UIButtonHelper::.ctor (0x060002c1): enabled (0.98, 0.98, 0.98, 1.0) -> #FAFAFA */
  buttonActiveRgba: [0.98, 0.98, 0.98, 1.0] as const,
  /** UIManager::Awake (0x06000327): toggleColorBlock (1.0, 1.0, 0.0, 1.0) */
  toggleHighlightRgba: [1.0, 1.0, 0.0, 1.0] as const,
  /** UIManager::AlignUI (0x06000317): 좌측 툴 도크 170px, 우측 인스펙터 330px, 상단 60px, 하단 24px */
  leftDockWidthPx: 170,
  rightInspectorWidthPx: 330,
  topBarHeightPx: 60,
  bottomStatusBarHeightPx: 24,
  /** UIScrollViewMaxHeightPanel::AlignPanel (0x06000373): windowH - 90 */
  scrollPanelVerticalReservePx: 90,
  /** UIManager::AddUIHeadPartItem (0x06000328): 100x100 카드, 122px 간격, 20px 패딩 */
  presetCardSizePx: 100,
  presetCardStepPx: 122,
  presetGridPaddingPx: 20,
} as const;

export interface ShaperColorPalettePickerInput {
  /** 2D 채도·명도(SV) 피커 사각형 내 포인터 로컬 좌표 (px) */
  readonly svPointerPos: readonly [number, number];
  /** 2D SV 피커 사각형 크기 (width, height px) */
  readonly svRectSize: readonly [number, number];
  /** 1D 색상(Hue) 리본 내 포인터 로컬 X 좌표 (px) */
  readonly huePointerX: number;
  /** 1D Hue 리본 너비 (px) */
  readonly hueRectWidth: number;
  /** UIManager.instance.scaleFactor (기본 1.0) */
  readonly scaleFactor?: number;
  /** 클릭된 UIColorBox 앵커 좌표 (ColorPalette::Open 0x06000121 팝업 배치용) */
  readonly anchorBoxPos?: readonly [number, number];
}

export interface ShaperColorPalettePickerResult {
  readonly hsv: readonly [number, number, number];
  readonly rgb01: readonly [number, number, number];
  readonly rgb255: readonly [number, number, number];
  readonly hex: string;
  readonly pureHueRgb01: readonly [number, number, number];
  readonly clampedSvHandlePos: readonly [number, number];
  readonly clampedHueHandleX: number;
  readonly popupPosition: readonly [number, number];
}

function hsvToRgb01(h: number, s: number, v: number): readonly [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/**
 * SHAPER `ColorPalette` (`0x0600011c..0x06000121`), `ColorPalettePicker0` (`0x06000127..0x06000129`),
 * `ColorPalettePicker1` (`0x06000132..0x06000134`), `UIColorBox` (`0x060002c4`) 역공학 내재화:
 * 2D SV 사각형과 1D Hue 리본의 포인터 오프셋을 `scaleFactor`로 나눈 뒤 `[0, sizeDelta]`로 정규화하여
 * HSV, 선형 RGB(`0..1`), 8비트 RGB(`0..255`), `#RRGGBB` 헥스 문자열, `[4, size - 4]` 클램프 핸들 좌표 및
 * `ColorPalette::Open` (`0x06000121`)의 `(-20, +4)` 팝업 오프셋 좌표를 산출한다.
 */
export function sampleShaperColorPalettePicker2d(
  input: ShaperColorPalettePickerInput,
): ShaperColorPalettePickerResult {
  const {
    svPointerPos,
    svRectSize,
    huePointerX,
    hueRectWidth,
    scaleFactor = 1,
    anchorBoxPos = [0, 0],
  } = input;
  const safeScale = scaleFactor > 1e-6 ? scaleFactor : 1;
  const svW = Math.max(8, svRectSize[0]);
  const svH = Math.max(8, svRectSize[1]);
  const hueW = Math.max(8, hueRectWidth);

  const localSvX = Math.max(0, Math.min(svW, svPointerPos[0] / safeScale));
  const localSvY = Math.max(0, Math.min(svH, svPointerPos[1] / safeScale));
  const localHueX = Math.max(0, Math.min(hueW, huePointerX / safeScale));

  const s = localSvX / svW;
  const v = localSvY / svH;
  const h = localHueX / hueW;

  const clampedSvHandlePos: readonly [number, number] = [
    Math.max(4, Math.min(svW - 4, localSvX)),
    Math.max(4, Math.min(svH - 4, localSvY)),
  ];
  const clampedHueHandleX = Math.max(4, Math.min(hueW - 4, localHueX));

  const pureHueRgb01 = hsvToRgb01(h, 1, 1);
  const rgb01 = hsvToRgb01(h, s, v);
  const r255 = Math.round(rgb01[0] * 255);
  const g255 = Math.round(rgb01[1] * 255);
  const b255 = Math.round(rgb01[2] * 255);
  const toHex2 = (n: number): string => n.toString(16).padStart(2, "0").toUpperCase();
  const hex = `#${toHex2(r255)}${toHex2(g255)}${toHex2(b255)}`;

  return {
    hsv: [h, s, v],
    rgb01,
    rgb255: [r255, g255, b255],
    hex,
    pureHueRgb01,
    clampedSvHandlePos,
    clampedHueHandleX,
    popupPosition: [anchorBoxPos[0] - 20, anchorBoxPos[1] + 4],
  };
}

export interface ShaperPresetGridItemLayout {
  readonly column: 0 | 1;
  readonly row: number;
  readonly anchoredX: number;
  readonly anchoredY: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly contentHeight: number;
  readonly maxScrollPanelHeight: number;
}

/**
 * SHAPER `UIManager::AddUIHeadPartItem` (`0x06000328`, RVA `219100`) &
 * `UIScrollViewMaxHeightPanel::AlignPanel` (`0x06000373`, RVA `229152`) 역공학 내재화:
 * 우측 330px 패널 내부의 2열 프리셋 썸네일 카드 배치(`x = 20 + col * 122`, `y = -20 - row * 122`, 카드 크기 `100x100`)와
 * 전체 스크롤 컨텐츠 높이 및 최대 스크롤 뷰 높이(`windowHeightPx - 90`)를 계산한다.
 */
export function computeShaperPresetGridItemLayout(
  itemIndex: number,
  totalCount: number,
  windowHeightPx = 900,
): ShaperPresetGridItemLayout {
  const idx = Math.max(0, Math.trunc(itemIndex));
  const count = Math.max(0, Math.trunc(totalCount));
  const column = (idx % 2) as 0 | 1;
  const row = Math.floor(idx / 2);
  const totalRows = Math.ceil(count / 2);
  return {
    column,
    row,
    anchoredX: 20 + column * 122,
    anchoredY: -20 - row * 122,
    cardWidth: 100,
    cardHeight: 100,
    contentHeight: totalRows > 0 ? totalRows * 122 + 20 : 0,
    maxScrollPanelHeight: Math.max(
      120,
      windowHeightPx - SHAPER_UI_DESIGN_TOKENS.scrollPanelVerticalReservePx,
    ),
  };
}

export interface ShaperWebcamPopupLayout {
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly popupWidth: number;
  readonly popupHeight: number;
  readonly actionBarHeight: number;
}

/**
 * SHAPER `UIManager::ResizeWebCamPopup` (`0x06000325`, RVA `217164`) 역공학 내재화:
 * 웹캠/사진 AI 포즈 캡처 팝업에서 원본 영상 종횡비를 유지하면서 프리뷰 폭(`372..552px`)과
 * 팝업 외곽 크기(`popupWidth = Math.max(420, previewW + 48)`, `popupHeight = previewH + 172`, 하단 버튼바 `36px`)를 계산한다.
 */
export function computeShaperWebcamPopupLayout(
  sourceWidth: number,
  sourceHeight: number,
  targetPreviewHeight = 372,
): ShaperWebcamPopupLayout {
  const safeW = Math.max(1, sourceWidth);
  const safeH = Math.max(1, sourceHeight);
  const previewHeight = Math.max(120, targetPreviewHeight);
  const aspect = safeW / safeH;
  const previewWidth = Math.min(552, Math.max(190, Math.round(previewHeight * aspect)));
  return {
    previewWidth,
    previewHeight,
    popupWidth: Math.max(420, previewWidth + 48),
    popupHeight: previewHeight + 172,
    actionBarHeight: 36,
  };
}

export interface ShaperKeycapShortcutItem {
  readonly keys: string;
  readonly description: string;
}

export interface ShaperContextStatusBarGuide {
  readonly contextLabelKo: string;
  readonly shortcuts: readonly ShaperKeycapShortcutItem[];
  readonly rawToolTipText: string;
}

/**
 * SHAPER `UIManager::SetDefaultToolTip` (`0x0600032e`, RVA `220068`) &
 * `UITextKeycap::SetKeyCap` (`0x06000384`, RVA `229600`) 역공학 내재화:
 * 현재 활성 인스펙터 탭·드로잉 모드·플랫폼(`isMac`)에 맞춰 하단 24px 상태바에 표시할
 * SHAPER 원문 키캡 단축키 가이드(`0x70004847`, `0x70004934`, `0x70004f4d`, `0x7000502e`, `0x700050fd`)를 생성한다.
 */
export function resolveShaperContextStatusBarGuide(options: {
  readonly inspectorTab: string;
  readonly drawingMode?: boolean;
  readonly isMac?: boolean;
}): ShaperContextStatusBarGuide {
  const { inspectorTab, drawingMode = false, isMac = false } = options;
  const modCtrl = isMac ? "Cmd" : "Ctrl";
  const modAlt = isMac ? "Option" : "Alt";

  if (drawingMode || inspectorTab === "paint") {
    const shortcuts: readonly ShaperKeycapShortcutItem[] = [
      { keys: "LMB 드래그", description: "3D 표면 앵커링 삼각기둥 스트로크 그리기" },
      { keys: `${modAlt} + 클릭`, description: "파츠 프리셋 펜선 제외 적용" },
      { keys: "Shift + 클릭", description: "기존 펜선 유지 적용" },
      { keys: `${modCtrl} + Z`, description: "스트로크 실행 취소" },
    ];
    return {
      contextLabelKo: "3D 브러시 · 라인 드로잉 모드",
      shortcuts,
      rawToolTipText: shortcuts.map((s) => `${s.description} [${s.keys}]`).join("   "),
    };
  }

  switch (inspectorTab) {
    case "pose": {
      const shortcuts: readonly ShaperKeycapShortcutItem[] = [
        { keys: `${modAlt} + 클릭`, description: "포즈 좌우 대칭(Mirror) 적용" },
        { keys: "Shift + 클릭", description: "카메라 각도 제외 포즈만 적용" },
        { keys: `${modCtrl} + 클릭`, description: "카메라 각도만 적용" },
        { keys: "F5", description: "시점 초기화 / 턴테이블" },
      ];
      return {
        contextLabelKo: "포즈 · IK/FK 리깅 편집",
        shortcuts,
        rawToolTipText: shortcuts.map((s) => `${s.description} [${s.keys}]`).join("   "),
      };
    }
    case "render": {
      const shortcuts: readonly ShaperKeycapShortcutItem[] = [
        { keys: "F12 / Space", description: "정면·씬 조명 및 툰 셰이더 전환" },
        { keys: "← → ↑ ↓", description: "씬 조명 회전" },
        { keys: `${modAlt} + ← →`, description: "툰 명암 경계(Cubic MatCap) 조절" },
        { keys: "F10", description: "안구 카메라 응시 고정 토글" },
      ];
      return {
        contextLabelKo: "툰 셰이딩 · 비등방 외곽선 · 조명",
        shortcuts,
        rawToolTipText: shortcuts.map((s) => `${s.description} [${s.keys}]`).join("   "),
      };
    }
    case "physics": {
      const shortcuts: readonly ShaperKeycapShortcutItem[] = [
        { keys: "LMB", description: "헤어 가닥 심기(Plant)" },
        { keys: `${modCtrl} + Scroll`, description: "Z축 모근 뿌리 회전 (±10°)" },
        { keys: `${modAlt} + Scroll`, description: "헤어 휘어짐(Bend) 조절" },
        { keys: "Shift + Scroll", description: "헤어 길이(Length) 조절" },
      ];
      return {
        contextLabelKo: "헤어 스플라인 · DynamicBone 물리",
        shortcuts,
        rawToolTipText: shortcuts.map((s) => `${s.description} [${s.keys}]`).join("   "),
      };
    }
    default: {
      const shortcuts: readonly ShaperKeycapShortcutItem[] = [
        { keys: "Shift + 클릭", description: "프리셋 색상만 적용" },
        { keys: `${modCtrl} + 클릭`, description: "프리셋 형태만 적용" },
        { keys: "F / B / C", description: "전신 · 상반신 · 얼굴 카메라 프레이밍" },
        { keys: "1 ~ 9", description: "우측 인스펙터 탭 즉시 전환" },
      ];
      return {
        contextLabelKo: "케이지 제어점 · 슬롯 프리셋 조합",
        shortcuts,
        rawToolTipText: shortcuts.map((s) => `${s.description} [${s.keys}]`).join("   "),
      };
    }
  }
}
