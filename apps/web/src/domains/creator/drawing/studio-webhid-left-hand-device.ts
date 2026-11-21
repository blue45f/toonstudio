/**
 * Chrome WebHID 왼손 단축키 디바이스 바인딩 & 바이너리 리포트 파서 (`T-020`).
 *
 * - TourBox(Neo/Elite), Wacom ExpressKey Remote, Xencelabs Quick Keys 3종 VID/PID 프로파일을 지원한다.
 * - `navigator.hid` 피처 디텍션과 보안 컨텍스트(HTTPS/localhost) 검사를 안전하게 수행한다.
 * - 바이너리 InputReport를 `parseLeftHandHidReport`로 해석해 스튜디오 액션 6종으로 변환한다.
 */

export type LeftHandHidProfileId = "tourbox" | "wacom-ekr" | "xencelabs-quick-keys";

export type LeftHandStudioActionId =
  | "brush.size+"
  | "brush.size-"
  | "canvas.rotate"
  | "history.undo"
  | "history.redo"
  | "eyedropper";

export type LeftHandControlId =
  | "dial.cw"
  | "dial.ccw"
  | "wheel.cw"
  | "wheel.ccw"
  | "button.1"
  | "button.2"
  | "button.3"
  | "button.4"
  | "button.5"
  | "button.6";

export type LeftHandKeymapPresetId = "inking" | "coloring" | "retouch";
export type LeftHandKeymap = Readonly<Record<LeftHandControlId, LeftHandStudioActionId>>;

export interface LeftHandStudioActionMeta {
  readonly id: LeftHandStudioActionId;
  readonly label: string;
  readonly shortLabel: string;
  readonly defaultDelta: number;
}

export const LEFT_HAND_STUDIO_ACTION_CATALOG: Readonly<
  Record<LeftHandStudioActionId, LeftHandStudioActionMeta>
> = Object.freeze({
  "brush.size+": Object.freeze({ id: "brush.size+", label: "브러시 크기 키우기", shortLabel: "브러시 +", defaultDelta: 1 }),
  "brush.size-": Object.freeze({ id: "brush.size-", label: "브러시 크기 줄이기", shortLabel: "브러시 -", defaultDelta: -1 }),
  "canvas.rotate": Object.freeze({ id: "canvas.rotate", label: "캔버스 회전", shortLabel: "캔버스 회전", defaultDelta: 15 }),
  "history.undo": Object.freeze({ id: "history.undo", label: "실행 취소 (Undo)", shortLabel: "실행 취소", defaultDelta: 1 }),
  "history.redo": Object.freeze({ id: "history.redo", label: "다시 실행 (Redo)", shortLabel: "다시 실행", defaultDelta: 1 }),
  eyedropper: Object.freeze({ id: "eyedropper", label: "스포이드 색 추출", shortLabel: "스포이드", defaultDelta: 1 }),
});

export interface LeftHandHidDeviceProfile {
  readonly id: LeftHandHidProfileId;
  readonly vendorName: string;
  readonly displayName: string;
  readonly vendorId: number;
  readonly productIds: readonly number[];
  readonly usagePage: number;
  readonly usage: number;
  readonly defaultReportId: number;
  readonly supportedControls: readonly LeftHandControlId[];
}

export const LEFT_HAND_HID_DEVICE_PROFILES: Readonly<
  Record<LeftHandHidProfileId, LeftHandHidDeviceProfile>
> = Object.freeze({
  tourbox: Object.freeze({
    id: "tourbox",
    vendorName: "TourBox Tech",
    displayName: "TourBox Neo / Elite",
    vendorId: 0x0483,
    productIds: Object.freeze([0x5740, 0x5750] as const),
    usagePage: 0xff00,
    usage: 0x01,
    defaultReportId: 0x01,
    supportedControls: Object.freeze([
      "dial.cw", "dial.ccw", "wheel.cw", "wheel.ccw",
      "button.1", "button.2", "button.3", "button.4", "button.5", "button.6",
    ] as const),
  }),
  "wacom-ekr": Object.freeze({
    id: "wacom-ekr",
    vendorName: "Wacom",
    displayName: "Wacom ExpressKey Remote",
    vendorId: 0x056a,
    productIds: Object.freeze([0x0331, 0x0332, 0x039f] as const),
    usagePage: 0xff0d,
    usage: 0x01,
    defaultReportId: 0x11,
    supportedControls: Object.freeze([
      "dial.cw", "dial.ccw",
      "button.1", "button.2", "button.3", "button.4", "button.5", "button.6",
    ] as const),
  }),
  "xencelabs-quick-keys": Object.freeze({
    id: "xencelabs-quick-keys",
    vendorName: "Xencelabs",
    displayName: "Xencelabs Quick Keys",
    vendorId: 0x28bd,
    productIds: Object.freeze([0x5202, 0x5203] as const),
    usagePage: 0xff0a,
    usage: 0x01,
    defaultReportId: 0x02,
    supportedControls: Object.freeze([
      "wheel.cw", "wheel.ccw",
      "button.1", "button.2", "button.3", "button.4", "button.5", "button.6",
    ] as const),
  }),
});

export const LEFT_HAND_KEYMAP_PRESETS: Readonly<
  Record<LeftHandKeymapPresetId, LeftHandKeymap>
> = Object.freeze({
  inking: Object.freeze({
    "dial.cw": "brush.size+",
    "dial.ccw": "brush.size-",
    "wheel.cw": "canvas.rotate",
    "wheel.ccw": "canvas.rotate",
    "button.1": "history.undo",
    "button.2": "history.redo",
    "button.3": "eyedropper",
    "button.4": "brush.size+",
    "button.5": "brush.size-",
    "button.6": "canvas.rotate",
  }),
  coloring: Object.freeze({
    "dial.cw": "brush.size+",
    "dial.ccw": "brush.size-",
    "wheel.cw": "brush.size+",
    "wheel.ccw": "brush.size-",
    "button.1": "eyedropper",
    "button.2": "history.undo",
    "button.3": "history.redo",
    "button.4": "canvas.rotate",
    "button.5": "brush.size+",
    "button.6": "brush.size-",
  }),
  retouch: Object.freeze({
    "dial.cw": "canvas.rotate",
    "dial.ccw": "canvas.rotate",
    "wheel.cw": "brush.size+",
    "wheel.ccw": "brush.size-",
    "button.1": "history.undo",
    "button.2": "history.redo",
    "button.3": "eyedropper",
    "button.4": "canvas.rotate",
    "button.5": "history.undo",
    "button.6": "eyedropper",
  }),
});

export interface WebHidDeviceFilter {
  readonly vendorId: number;
  readonly productId?: number;
  readonly usagePage?: number;
  readonly usage?: number;
}

export interface WebHidInputReportEventLike {
  readonly reportId: number;
  readonly data: DataView;
  readonly device?: WebHidDeviceLike;
}

export interface WebHidDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: "inputreport", listener: (event: WebHidInputReportEventLike) => void): void;
  removeEventListener(type: "inputreport", listener: (event: WebHidInputReportEventLike) => void): void;
}

export interface WebHidDisconnectEventLike {
  readonly device: WebHidDeviceLike;
}

export interface WebHidNavigatorLike {
  requestDevice(options: { readonly filters: readonly WebHidDeviceFilter[] }): Promise<readonly WebHidDeviceLike[]>;
  getDevices(): Promise<readonly WebHidDeviceLike[]>;
  addEventListener?(type: "disconnect", listener: (event: WebHidDisconnectEventLike) => void): void;
  removeEventListener?(type: "disconnect", listener: (event: WebHidDisconnectEventLike) => void): void;
}

export interface WebHidProbeEnv {
  readonly hid?: WebHidNavigatorLike | null;
  readonly isSecureContext?: boolean;
}

export interface WebHidSupportReport {
  readonly supported: boolean;
  readonly secureContext: boolean;
  readonly reason: string;
  readonly availableProfilesCount: number;
}

export interface LeftHandHidParserState {
  readonly buttonMask: number;
  readonly ringPosition: number | null;
}

export const INITIAL_LEFT_HAND_HID_PARSER_STATE: LeftHandHidParserState = Object.freeze({
  buttonMask: 0,
  ringPosition: null,
});

export interface LeftHandHidActionEvent {
  readonly profileId: LeftHandHidProfileId;
  readonly control: LeftHandControlId;
  readonly action: LeftHandStudioActionId;
  readonly triggerKind: "press" | "release" | "step";
  readonly pressed: boolean;
  readonly delta: number;
  readonly label: string;
  readonly rawHex: string;
}

export interface ParseLeftHandHidReportInput {
  readonly profileId: LeftHandHidProfileId;
  readonly reportId: number;
  readonly data: DataView | Uint8Array;
  readonly previousState?: LeftHandHidParserState;
  readonly keymap?: LeftHandKeymap;
  readonly emitReleases?: boolean;
}

export interface ParsedLeftHandHidReport {
  readonly profileId: LeftHandHidProfileId;
  readonly reportId: number;
  readonly nextState: LeftHandHidParserState;
  readonly events: readonly LeftHandHidActionEvent[];
  readonly rawHex: string;
}

export type WebHidConnectStatus = "connected" | "unsupported" | "cancelled" | "permission-denied" | "error";

export interface WebHidConnectResult {
  readonly status: WebHidConnectStatus;
  readonly profileId: LeftHandHidProfileId | null;
  readonly deviceName: string | null;
  readonly message: string;
}

export interface WebHidLeftHandControllerSnapshot {
  readonly supported: boolean;
  readonly connected: boolean;
  readonly profileId: LeftHandHidProfileId | null;
  readonly deviceName: string | null;
  readonly keymapPreset: LeftHandKeymapPresetId;
  readonly keymap: LeftHandKeymap;
  readonly lastEvent: LeftHandHidActionEvent | null;
  readonly processedReports: number;
}

export interface WebHidLeftHandController {
  connect(preferredProfile?: LeftHandHidProfileId): Promise<WebHidConnectResult>;
  disconnect(): Promise<void>;
  setKeymapPreset(presetId: LeftHandKeymapPresetId): LeftHandKeymap;
  rebindControl(control: LeftHandControlId, action: LeftHandStudioActionId): LeftHandKeymap;
  simulateReport(profileId: LeftHandHidProfileId, reportId: number, bytes: Uint8Array): ParsedLeftHandHidReport;
  getSnapshot(): WebHidLeftHandControllerSnapshot;
}

type GlobalRecord = Record<string, unknown>;

const BUTTON_BIT_CONTROLS: readonly LeftHandControlId[] = Object.freeze([
  "button.1", "button.2", "button.3", "button.4", "button.5", "button.6",
]);

const TOURBOX_BUTTON_MAP: Readonly<Record<number, LeftHandControlId>> = Object.freeze({
  0x00: "button.1", 0x01: "button.2", 0x02: "button.3", 0x03: "button.4", 0x22: "button.5", 0x23: "button.6",
});

const TOURBOX_ROTARY_MAP: Readonly<Record<number, LeftHandControlId>> = Object.freeze({
  0x04: "dial.cw", 0x44: "dial.ccw", 0x09: "wheel.cw", 0x49: "wheel.ccw", 0x0f: "dial.cw", 0x4f: "dial.ccw",
});

const WACOM_RING_STEPS = 72;

function resolveHidNavigator(env?: WebHidProbeEnv): WebHidNavigatorLike | null {
  if (env && "hid" in env) return env.hid ?? null;
  try {
    if (typeof navigator === "undefined" || navigator === null) return null;
    const candidate = (navigator as unknown as GlobalRecord)["hid"] as WebHidNavigatorLike | undefined;
    if (candidate && typeof candidate.requestDevice === "function" && typeof candidate.getDevices === "function") {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveSecureContext(env?: WebHidProbeEnv): boolean {
  if (env && typeof env.isSecureContext === "boolean") return env.isSecureContext;
  const g = globalThis as unknown as GlobalRecord;
  return typeof g["isSecureContext"] === "boolean" ? (g["isSecureContext"] as boolean) : false;
}

/** 현재 브라우저의 `navigator.hid` 가용성과 보안 컨텍스트를 안전하게 점검한다. */
export function detectWebHidSupport(env?: WebHidProbeEnv): WebHidSupportReport {
  const hid = resolveHidNavigator(env);
  const secureContext = resolveSecureContext(env);
  const availableProfilesCount = Object.keys(LEFT_HAND_HID_DEVICE_PROFILES).length;
  if (!hid) {
    return Object.freeze({
      supported: false,
      secureContext,
      reason: "현재 브라우저는 WebHID API(`navigator.hid`)를 지원하지 않습니다. Chrome/Edge 데스크톱에서 연결할 수 있습니다.",
      availableProfilesCount,
    });
  }
  if (!secureContext) {
    return Object.freeze({
      supported: false,
      secureContext: false,
      reason: "WebHID 장치 접근은 HTTPS 또는 localhost 보안 컨텍스트에서만 허용됩니다.",
      availableProfilesCount,
    });
  }
  return Object.freeze({
    supported: true,
    secureContext: true,
    reason: "WebHID 활성 · TourBox, Wacom ExpressKey Remote, Xencelabs Quick Keys 연결 준비 완료",
    availableProfilesCount,
  });
}

/** 지정 프로파일 목록의 Chrome WebHID `requestDevice` 필터 배열을 생성한다. */
export function buildWebHidDeviceFilters(
  profileIds?: readonly LeftHandHidProfileId[],
): readonly WebHidDeviceFilter[] {
  const ids: readonly LeftHandHidProfileId[] =
    profileIds && profileIds.length > 0 ? profileIds : (["tourbox", "wacom-ekr", "xencelabs-quick-keys"] as const);
  const filters: WebHidDeviceFilter[] = [];
  for (const id of ids) {
    const profile = LEFT_HAND_HID_DEVICE_PROFILES[id];
    for (const productId of profile.productIds) {
      filters.push(Object.freeze({ vendorId: profile.vendorId, productId }));
    }
  }
  return Object.freeze(filters);
}

/** USB VID/PID로 등록된 3종 왼손 리모컨 프로파일을 판별한다. */
export function matchLeftHandHidProfile(vendorId: number, productId: number): LeftHandHidDeviceProfile | null {
  const profiles = Object.values(LEFT_HAND_HID_DEVICE_PROFILES);
  for (const p of profiles) {
    if (p.vendorId === vendorId && p.productIds.includes(productId)) return p;
  }
  for (const p of profiles) {
    if (p.vendorId === vendorId) return p;
  }
  return null;
}

export function createLeftHandKeymap(
  presetId: LeftHandKeymapPresetId = "inking",
  overrides?: Partial<Record<LeftHandControlId, LeftHandStudioActionId>>,
): LeftHandKeymap {
  const base = LEFT_HAND_KEYMAP_PRESETS[presetId];
  return overrides ? Object.freeze({ ...base, ...overrides }) : base;
}

export function rebindLeftHandControl(
  keymap: LeftHandKeymap,
  control: LeftHandControlId,
  action: LeftHandStudioActionId,
): LeftHandKeymap {
  return Object.freeze({ ...keymap, [control]: action });
}

function formatRawHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  const count = Math.min(bytes.length, 16);
  for (let i = 0; i < count; i += 1) parts.push((bytes[i] ?? 0).toString(16).padStart(2, "0"));
  return parts.join(" ");
}

function buildActionEvent(
  profileId: LeftHandHidProfileId,
  control: LeftHandControlId,
  keymap: LeftHandKeymap,
  triggerKind: "press" | "release" | "step",
  magnitude: number,
  rawHex: string,
): LeftHandHidActionEvent {
  const action = keymap[control];
  const safeMag = Math.max(1, Math.abs(Math.trunc(magnitude)));
  const isCcw = control === "dial.ccw" || control === "wheel.ccw";
  const delta =
    triggerKind === "release"
      ? 0
      : action === "canvas.rotate"
        ? (isCcw ? -15 : 15) * safeMag
        : action === "brush.size-"
          ? -safeMag
          : action === "brush.size+"
            ? safeMag
            : isCcw ? -safeMag : safeMag;
  return Object.freeze({
    profileId,
    control,
    action,
    triggerKind,
    pressed: triggerKind !== "release",
    delta,
    label: LEFT_HAND_STUDIO_ACTION_CATALOG[action].label,
    rawHex,
  });
}

function collectBitmaskEvents(
  profileId: LeftHandHidProfileId,
  prevMask: number,
  nextMask: number,
  keymap: LeftHandKeymap,
  emitReleases: boolean,
  rawHex: string,
): LeftHandHidActionEvent[] {
  const events: LeftHandHidActionEvent[] = [];
  for (let i = 0; i < BUTTON_BIT_CONTROLS.length; i += 1) {
    const bit = 1 << i;
    const was = (prevMask & bit) !== 0;
    const now = (nextMask & bit) !== 0;
    const control = BUTTON_BIT_CONTROLS[i] as LeftHandControlId;
    if (now && !was) events.push(buildActionEvent(profileId, control, keymap, "press", 1, rawHex));
    else if (!now && was && emitReleases) events.push(buildActionEvent(profileId, control, keymap, "release", 0, rawHex));
  }
  return events;
}

/** TourBox · Wacom ExpressKey Remote · Xencelabs Quick Keys의 바이너리 HID InputReport를 해석한다. */
export function parseLeftHandHidReport(input: ParseLeftHandHidReportInput): ParsedLeftHandHidReport {
  const bytes =
    input.data instanceof Uint8Array
      ? input.data
      : new Uint8Array(input.data.buffer, input.data.byteOffset, input.data.byteLength);
  const prev = input.previousState ?? INITIAL_LEFT_HAND_HID_PARSER_STATE;
  const keymap = input.keymap ?? LEFT_HAND_KEYMAP_PRESETS.inking;
  const emitReleases = input.emitReleases ?? false;
  const rawHex = formatRawHex(bytes);

  if (input.profileId === "tourbox") {
    if (bytes.length === 0) {
      return Object.freeze({ profileId: input.profileId, reportId: input.reportId, nextState: prev, events: Object.freeze([]), rawHex });
    }
    const code = bytes[0] ?? 0;
    const rotary = TOURBOX_ROTARY_MAP[code];
    if (rotary) {
      const steps = bytes.length >= 2 && (bytes[1] ?? 0) > 0 ? Math.min(8, bytes[1] ?? 1) : 1;
      return Object.freeze({
        profileId: input.profileId,
        reportId: input.reportId,
        nextState: prev,
        events: Object.freeze([buildActionEvent("tourbox", rotary, keymap, "step", steps, rawHex)]),
        rawHex,
      });
    }
    const isRelease = (code & 0x80) !== 0;
    const control = TOURBOX_BUTTON_MAP[code & 0x7f];
    if (!control) {
      return Object.freeze({ profileId: input.profileId, reportId: input.reportId, nextState: prev, events: Object.freeze([]), rawHex });
    }
    const bit = 1 << BUTTON_BIT_CONTROLS.indexOf(control);
    const nextMask = isRelease ? prev.buttonMask & ~bit : prev.buttonMask | bit;
    const events = collectBitmaskEvents("tourbox", prev.buttonMask, nextMask, keymap, emitReleases, rawHex);
    return Object.freeze({
      profileId: input.profileId,
      reportId: input.reportId,
      nextState: Object.freeze({ buttonMask: nextMask, ringPosition: prev.ringPosition }),
      events: Object.freeze(events),
      rawHex,
    });
  }

  if (input.profileId === "wacom-ekr") {
    if (bytes.length < 2) {
      return Object.freeze({ profileId: input.profileId, reportId: input.reportId, nextState: prev, events: Object.freeze([]), rawHex });
    }
    const ringByte = bytes[0] ?? 0;
    const ringPos = (ringByte & 0x80) !== 0 ? (ringByte & 0x7f) % WACOM_RING_STEPS : null;
    const buttonMask = (bytes[1] ?? 0) | ((bytes.length >= 3 ? (bytes[2] ?? 0) : 0) << 8);
    const events = collectBitmaskEvents("wacom-ekr", prev.buttonMask, buttonMask, keymap, emitReleases, rawHex);
    if (ringPos !== null && prev.ringPosition !== null && ringPos !== prev.ringPosition) {
      let diff = ringPos - prev.ringPosition;
      if (diff > WACOM_RING_STEPS / 2) diff -= WACOM_RING_STEPS;
      if (diff < -WACOM_RING_STEPS / 2) diff += WACOM_RING_STEPS;
      if (diff !== 0) {
        events.push(buildActionEvent("wacom-ekr", diff > 0 ? "dial.cw" : "dial.ccw", keymap, "step", Math.abs(diff), rawHex));
      }
    }
    return Object.freeze({
      profileId: input.profileId,
      reportId: input.reportId,
      nextState: Object.freeze({ buttonMask, ringPosition: ringPos }),
      events: Object.freeze(events),
      rawHex,
    });
  }

  // xencelabs-quick-keys
  if (bytes.length < 4) {
    return Object.freeze({ profileId: input.profileId, reportId: input.reportId, nextState: prev, events: Object.freeze([]), rawHex });
  }
  const buttonMask = (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
  const wheelByte = bytes.length >= 8 ? (bytes[7] ?? 0) : bytes.length >= 5 ? (bytes[4] ?? 0) : 0;
  const events = collectBitmaskEvents("xencelabs-quick-keys", prev.buttonMask, buttonMask, keymap, emitReleases, rawHex);
  if (wheelByte === 0x01) {
    events.push(buildActionEvent("xencelabs-quick-keys", "wheel.cw", keymap, "step", 1, rawHex));
  } else if (wheelByte === 0x02 || wheelByte === 0xff) {
    events.push(buildActionEvent("xencelabs-quick-keys", "wheel.ccw", keymap, "step", 1, rawHex));
  }
  return Object.freeze({
    profileId: input.profileId,
    reportId: input.reportId,
    nextState: Object.freeze({ buttonMask, ringPosition: prev.ringPosition }),
    events: Object.freeze(events),
    rawHex,
  });
}

/** 진단·프리뷰용 표준 바이너리 HID 패킷을 생성한다. */
export function createSampleHidReportPacket(
  profileId: LeftHandHidProfileId,
  control: LeftHandControlId,
): { readonly reportId: number; readonly bytes: Uint8Array } {
  const reportId = LEFT_HAND_HID_DEVICE_PROFILES[profileId].defaultReportId;
  if (profileId === "tourbox") {
    const codeMap: Record<LeftHandControlId, number> = {
      "dial.cw": 0x04, "dial.ccw": 0x44, "wheel.cw": 0x09, "wheel.ccw": 0x49,
      "button.1": 0x00, "button.2": 0x01, "button.3": 0x02, "button.4": 0x03, "button.5": 0x22, "button.6": 0x23,
    };
    return Object.freeze({ reportId, bytes: new Uint8Array([codeMap[control], 0x01]) });
  }
  const btnIdx = BUTTON_BIT_CONTROLS.indexOf(control);
  if (profileId === "wacom-ekr") {
    if (btnIdx >= 0) return Object.freeze({ reportId, bytes: new Uint8Array([0x00, 1 << btnIdx, 0x00, 0x00]) });
    const ringPos = control === "dial.ccw" || control === "wheel.ccw" ? 70 : 2;
    return Object.freeze({ reportId, bytes: new Uint8Array([0x80 | ringPos, 0x00, 0x00, 0x00]) });
  }
  const packet = new Uint8Array([0xf0, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  if (btnIdx >= 0) packet[2] = 1 << btnIdx;
  else packet[7] = control === "wheel.ccw" || control === "dial.ccw" ? 0x02 : 0x01;
  return Object.freeze({ reportId, bytes: packet });
}

function classifyErrorName(caught: unknown): string {
  if (caught instanceof Error) return caught.name;
  if (typeof caught === "object" && caught !== null && "name" in caught) {
    return String((caught as { readonly name: unknown }).name);
  }
  return "UnknownError";
}

/** WebHID 왼손 리모컨 런타임 연결·키맵·리포트 수신 컨트롤러를 생성한다. */
export function createWebHidLeftHandController(options?: {
  readonly env?: WebHidProbeEnv;
  readonly keymapPreset?: LeftHandKeymapPresetId;
  readonly onAction?: (event: LeftHandHidActionEvent) => void;
}): WebHidLeftHandController {
  const env = options?.env;
  let keymapPreset: LeftHandKeymapPresetId = options?.keymapPreset ?? "inking";
  let keymap: LeftHandKeymap = LEFT_HAND_KEYMAP_PRESETS[keymapPreset];
  let activeDevice: WebHidDeviceLike | null = null;
  let activeProfileId: LeftHandHidProfileId | null = null;
  let parserState: LeftHandHidParserState = INITIAL_LEFT_HAND_HID_PARSER_STATE;
  let lastEvent: LeftHandHidActionEvent | null = null;
  let processedReports = 0;

  const dispatchParsed = (parsed: ParsedLeftHandHidReport): ParsedLeftHandHidReport => {
    parserState = parsed.nextState;
    processedReports += 1;
    for (const evt of parsed.events) {
      lastEvent = evt;
      options?.onAction?.(evt);
    }
    return parsed;
  };

  const handleInputReport = (event: WebHidInputReportEventLike): void => {
    if (!activeProfileId) return;
    dispatchParsed(
      parseLeftHandHidReport({
        profileId: activeProfileId,
        reportId: event.reportId,
        data: event.data,
        previousState: parserState,
        keymap,
      }),
    );
  };

  const handleDisconnect = (event: WebHidDisconnectEventLike): void => {
    if (activeDevice && event.device === activeDevice) {
      activeDevice.removeEventListener("inputreport", handleInputReport);
      activeDevice = null;
      activeProfileId = null;
      parserState = INITIAL_LEFT_HAND_HID_PARSER_STATE;
    }
  };

  const detachCurrent = async (): Promise<void> => {
    resolveHidNavigator(env)?.removeEventListener?.("disconnect", handleDisconnect);
    if (activeDevice) {
      activeDevice.removeEventListener("inputreport", handleInputReport);
      try {
        if (activeDevice.opened) await activeDevice.close();
      } catch {
        // 이미 분리된 장치 닫기 오류는 무시한다.
      }
    }
    activeDevice = null;
    activeProfileId = null;
    parserState = INITIAL_LEFT_HAND_HID_PARSER_STATE;
  };

  return {
    async connect(preferredProfile?: LeftHandHidProfileId): Promise<WebHidConnectResult> {
      const support = detectWebHidSupport(env);
      const hid = resolveHidNavigator(env);
      if (!support.supported || !hid) {
        return Object.freeze({ status: "unsupported", profileId: null, deviceName: null, message: support.reason });
      }
      try {
        const filters = buildWebHidDeviceFilters(preferredProfile ? [preferredProfile] : undefined);
        const selected = (await hid.requestDevice({ filters }))[0];
        if (!selected) {
          return Object.freeze({ status: "cancelled", profileId: null, deviceName: null, message: "사용자가 장치 선택을 취소했습니다." });
        }
        await detachCurrent();
        if (!selected.opened) await selected.open();
        const matched =
          matchLeftHandHidProfile(selected.vendorId, selected.productId)
          ?? (preferredProfile ? LEFT_HAND_HID_DEVICE_PROFILES[preferredProfile] : LEFT_HAND_HID_DEVICE_PROFILES.tourbox);
        activeDevice = selected;
        activeProfileId = matched.id;
        parserState = INITIAL_LEFT_HAND_HID_PARSER_STATE;
        selected.addEventListener("inputreport", handleInputReport);
        hid.addEventListener?.("disconnect", handleDisconnect);
        const deviceName = selected.productName || matched.displayName;
        return Object.freeze({ status: "connected", profileId: matched.id, deviceName, message: `${deviceName} 연결 완료` });
      } catch (caught) {
        const errName = classifyErrorName(caught);
        if (errName === "AbortError") {
          return Object.freeze({ status: "cancelled", profileId: null, deviceName: null, message: "장치 연결 요청이 취소되었습니다." });
        }
        if (errName === "NotAllowedError" || errName === "SecurityError") {
          return Object.freeze({ status: "permission-denied", profileId: null, deviceName: null, message: "WebHID 장치 접근 권한이 거부되었습니다." });
        }
        return Object.freeze({
          status: "error",
          profileId: null,
          deviceName: null,
          message: caught instanceof Error ? caught.message : "장치 연결 중 오류가 발생했습니다.",
        });
      }
    },
    disconnect: detachCurrent,
    setKeymapPreset(presetId) {
      keymapPreset = presetId;
      keymap = LEFT_HAND_KEYMAP_PRESETS[presetId];
      return keymap;
    },
    rebindControl(control, action) {
      keymap = rebindLeftHandControl(keymap, control, action);
      return keymap;
    },
    simulateReport(profileId, reportId, bytes) {
      return dispatchParsed(parseLeftHandHidReport({ profileId, reportId, data: bytes, previousState: parserState, keymap }));
    },
    getSnapshot() {
      return Object.freeze({
        supported: detectWebHidSupport(env).supported,
        connected: activeDevice !== null,
        profileId: activeProfileId,
        deviceName: activeDevice?.productName ?? null,
        keymapPreset,
        keymap,
        lastEvent,
        processedReports,
      });
    },
  };
}
