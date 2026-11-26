/**
 * #29 컴패니언 폰 자이로/다이얼 컨트롤러 · #30 WebHID/WebMIDI 하드웨어 매퍼 ·
 * #31 외부 DCC(.psd/.glb) 핫싱크 매니페스트 관리자(전 기능 ₩0 로컬, 외부 드라이버 불필요).
 */

import { canonicalJsonBytes, sha256Hex } from "./crypto-binary-utils";

/* -------------------------------------------------------------------------- */
/* #29 Companion Phone Gyro / Dial Controller                                 */
/* -------------------------------------------------------------------------- */

export type CompanionDialMode = "brush-size" | "canvas-rotate" | "zoom" | "timeline-scrub";

export interface CompanionGyroDialSample {
  /** 요/방위각(도). */
  readonly alphaDeg: number;
  /** 전후 기울기 피치(도). */
  readonly betaDeg: number;
  /** 좌우 기울기 롤(도). */
  readonly gammaDeg: number;
  /** 가상 로터리 다이얼 디텐트 틱(정수 증감). */
  readonly dialDetentDelta: number;
  /** 다이얼 중앙 클릭(모드 전환 트리거). */
  readonly dialPressed?: boolean;
  readonly timestampMs: number;
}

export interface CompanionGyroDialConfig {
  readonly deadzoneDeg?: number;
  readonly smoothingAlpha?: number;
  readonly brushSizePxPerDetent?: number;
  readonly zoomStepPerDetent?: number;
  readonly rotateDegPerDetent?: number;
}

export interface CompanionStudioGestureAction {
  readonly activeMode: CompanionDialMode;
  readonly modeSwitched: boolean;
  readonly canvasRotateDeltaDeg: number;
  readonly zoomMultiplierDelta: number;
  readonly brushSizeDeltaPx: number;
  readonly timelineFrameDelta: number;
  readonly smoothedRollDeg: number;
  readonly smoothedPitchDeg: number;
}

const DIAL_MODE_CYCLE: readonly CompanionDialMode[] = [
  "brush-size",
  "canvas-rotate",
  "zoom",
  "timeline-scrub",
];

/**
 * 스마트폰 자이로 기울기 + 가상 다이얼을 스튜디오 제스처 명령으로 변환하는 컨트롤러.
 * 데드존 필터링과 EMA 저역통과 필터로 손떨림 지터를 제거한다.
 */
export class CompanionGyroDialController {
  private readonly deadzoneDeg: number;
  private readonly smoothingAlpha: number;
  private readonly brushSizePxPerDetent: number;
  private readonly zoomStepPerDetent: number;
  private readonly rotateDegPerDetent: number;

  private modeIndex = 0;
  private smoothedRollDeg = 0;
  private smoothedPitchDeg = 0;
  private lastRollDeg: number | null = null;
  private wasPressed = false;

  constructor(config: CompanionGyroDialConfig = {}) {
    this.deadzoneDeg = Math.max(0.5, config.deadzoneDeg ?? 3.0);
    this.smoothingAlpha = Math.max(0.05, Math.min(1, config.smoothingAlpha ?? 0.35));
    this.brushSizePxPerDetent = config.brushSizePxPerDetent ?? 2.0;
    this.zoomStepPerDetent = config.zoomStepPerDetent ?? 0.08;
    this.rotateDegPerDetent = config.rotateDegPerDetent ?? 5.0;
  }

  getActiveMode(): CompanionDialMode {
    return DIAL_MODE_CYCLE[this.modeIndex];
  }

  setActiveMode(mode: CompanionDialMode): void {
    const idx = DIAL_MODE_CYCLE.indexOf(mode);
    if (idx >= 0) {
      this.modeIndex = idx;
    }
  }

  processSample(sample: CompanionGyroDialSample): CompanionStudioGestureAction {
    let modeSwitched = false;
    const pressedNow = sample.dialPressed === true;
    if (pressedNow && !this.wasPressed) {
      this.modeIndex = (this.modeIndex + 1) % DIAL_MODE_CYCLE.length;
      modeSwitched = true;
    }
    this.wasPressed = pressedNow;

    const activeMode = DIAL_MODE_CYCLE[this.modeIndex];

    // EMA 저역통과 스무딩
    if (this.lastRollDeg === null) {
      this.smoothedRollDeg = sample.gammaDeg;
      this.smoothedPitchDeg = sample.betaDeg;
      this.lastRollDeg = sample.gammaDeg;
    } else {
      this.smoothedRollDeg =
        this.smoothedRollDeg * (1 - this.smoothingAlpha) + sample.gammaDeg * this.smoothingAlpha;
      this.smoothedPitchDeg =
        this.smoothedPitchDeg * (1 - this.smoothingAlpha) + sample.betaDeg * this.smoothingAlpha;
    }

    const rawRollDelta = this.smoothedRollDeg - this.lastRollDeg;
    let gyroRotateDelta = 0;
    if (Math.abs(rawRollDelta) >= this.deadzoneDeg) {
      gyroRotateDelta = Number(rawRollDelta.toFixed(2));
      this.lastRollDeg = this.smoothedRollDeg;
    }

    const detents = Math.trunc(sample.dialDetentDelta);
    let canvasRotateDeltaDeg = gyroRotateDelta;
    let zoomMultiplierDelta = 0;
    let brushSizeDeltaPx = 0;
    let timelineFrameDelta = 0;

    if (detents !== 0) {
      if (activeMode === "brush-size") {
        brushSizeDeltaPx = Number((detents * this.brushSizePxPerDetent).toFixed(2));
      } else if (activeMode === "canvas-rotate") {
        canvasRotateDeltaDeg = Number(
          (canvasRotateDeltaDeg + detents * this.rotateDegPerDetent).toFixed(2),
        );
      } else if (activeMode === "zoom") {
        zoomMultiplierDelta = Number((detents * this.zoomStepPerDetent).toFixed(3));
      } else {
        timelineFrameDelta = detents;
      }
    }

    return {
      activeMode,
      modeSwitched,
      canvasRotateDeltaDeg,
      zoomMultiplierDelta,
      brushSizeDeltaPx,
      timelineFrameDelta,
      smoothedRollDeg: Number(this.smoothedRollDeg.toFixed(2)),
      smoothedPitchDeg: Number(this.smoothedPitchDeg.toFixed(2)),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* #30 WebHID / WebMIDI Hardware Mapper                                       */
/* -------------------------------------------------------------------------- */

export type HardwareStudioCommandId =
  | "brush.size"
  | "brush.opacity"
  | "canvas.zoom"
  | "canvas.rotate"
  | "history.undo"
  | "history.redo"
  | "layer.toggleVisibility"
  | "tool.switch";

export type HardwareResponseCurve = "linear" | "exponential" | "stepped";

export interface HardwareControlBinding {
  /** 바인딩 키(예: "hid:dial0", "hid:btn0", "midi:cc:7", "midi:note:36"). */
  readonly controlKey: string;
  readonly layer: "base" | "fn";
  readonly command: HardwareStudioCommandId;
  readonly scale: number;
  readonly curve: HardwareResponseCurve;
}

export interface MappedHardwareCommand {
  readonly source: "webhid" | "webmidi";
  readonly controlKey: string;
  readonly layer: "base" | "fn";
  readonly command: HardwareStudioCommandId;
  readonly value: number;
  readonly rawBytesHex: string;
}

const DEFAULT_HARDWARE_BINDINGS: readonly HardwareControlBinding[] = [
  { controlKey: "hid:dial0", layer: "base", command: "brush.size", scale: 2, curve: "linear" },
  { controlKey: "hid:dial0", layer: "fn", command: "canvas.rotate", scale: 5, curve: "linear" },
  { controlKey: "hid:dial1", layer: "base", command: "canvas.zoom", scale: 0.05, curve: "exponential" },
  { controlKey: "hid:btn0", layer: "base", command: "history.undo", scale: 1, curve: "stepped" },
  { controlKey: "hid:btn1", layer: "base", command: "history.redo", scale: 1, curve: "stepped" },
  { controlKey: "midi:cc:1", layer: "base", command: "brush.size", scale: 1, curve: "exponential" },
  { controlKey: "midi:cc:7", layer: "base", command: "brush.opacity", scale: 1, curve: "linear" },
  { controlKey: "midi:note:36", layer: "base", command: "history.undo", scale: 1, curve: "stepped" },
  { controlKey: "midi:note:37", layer: "base", command: "layer.toggleVisibility", scale: 1, curve: "stepped" },
];

function applyResponseCurve(value: number, curve: HardwareResponseCurve, scale: number): number {
  if (curve === "stepped") {
    return value === 0 ? 0 : Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * scale));
  }
  if (curve === "exponential") {
    const sign = value < 0 ? -1 : 1;
    const mag = Math.abs(value);
    return Number((sign * Math.pow(mag, 1.35) * scale).toFixed(4));
  }
  return Number((value * scale).toFixed(4));
}

function bytesToShortHex(packet: Uint8Array): string {
  let out = "";
  for (let i = 0; i < packet.byteLength; i += 1) {
    const b = packet[i];
    out += (b < 16 ? "0" : "") + b.toString(16);
  }
  return out;
}

/**
 * WebHID(Surface Dial · TourBox 계열 4바이트 리포트) 및 WebMIDI(CC/NoteOn) 원시 패킷 매퍼.
 */
export class HardwareHidMidiMapper {
  private readonly bindings = new Map<string, HardwareControlBinding>();

  constructor(customBindings?: readonly HardwareControlBinding[]) {
    const list = customBindings ?? DEFAULT_HARDWARE_BINDINGS;
    for (let i = 0; i < list.length; i += 1) {
      this.setBinding(list[i]);
    }
  }

  setBinding(binding: HardwareControlBinding): void {
    this.bindings.set(`${binding.layer}::${binding.controlKey}`, binding);
  }

  /**
   * 4바이트 WebHID 컨트롤러 리포트 디코딩:
   * `[reportId, buttonMask(bit7=fn시프트, bit0..bit6=매크로버튼), dial0SignedI8, dial1SignedI8]`.
   */
  decodeHidReport(report: Uint8Array): readonly MappedHardwareCommand[] {
    if (report.byteLength < 4) {
      throw new Error("WebHID 컨트롤러 리포트는 최소 4바이트여야 합니다.");
    }
    const buttonMask = report[1];
    const fnHeld = (buttonMask & 0x80) !== 0;
    const layer: "base" | "fn" = fnHeld ? "fn" : "base";
    const dial0 = report[2] >= 128 ? report[2] - 256 : report[2];
    const dial1 = report[3] >= 128 ? report[3] - 256 : report[3];
    const rawHex = bytesToShortHex(report);
    const commands: MappedHardwareCommand[] = [];

    if (dial0 !== 0) {
      const cmd = this.resolveCommand("webhid", "hid:dial0", layer, dial0, rawHex);
      if (cmd) commands.push(cmd);
    }
    if (dial1 !== 0) {
      const cmd = this.resolveCommand("webhid", "hid:dial1", layer, dial1, rawHex);
      if (cmd) commands.push(cmd);
    }
    for (let bit = 0; bit < 7; bit += 1) {
      if ((buttonMask & (1 << bit)) !== 0) {
        const cmd = this.resolveCommand("webhid", `hid:btn${bit}`, layer, 1, rawHex);
        if (cmd) commands.push(cmd);
      }
    }
    return commands;
  }

  /**
   * 표준 3바이트 WebMIDI 패킷 디코딩(Control Change 0xB0..0xBF, Note On 0x90..0x9F).
   */
  decodeMidiMessage(message: Uint8Array, fnHeld = false): MappedHardwareCommand | null {
    if (message.byteLength < 3) {
      throw new Error("WebMIDI 메시지는 최소 3바이트여야 합니다.");
    }
    const statusHigh = message[0] & 0xf0;
    const data1 = message[1] & 0x7f;
    const data2 = message[2] & 0x7f;
    const layer: "base" | "fn" = fnHeld ? "fn" : "base";
    const rawHex = bytesToShortHex(message);

    if (statusHigh === 0xb0) {
      const normalized = data2 / 127;
      return this.resolveCommand("webmidi", `midi:cc:${data1}`, layer, normalized, rawHex);
    }
    if (statusHigh === 0x90 && data2 > 0) {
      return this.resolveCommand("webmidi", `midi:note:${data1}`, layer, data2 / 127, rawHex);
    }
    return null;
  }

  private resolveCommand(
    source: "webhid" | "webmidi",
    controlKey: string,
    layer: "base" | "fn",
    inputVal: number,
    rawBytesHex: string,
  ): MappedHardwareCommand | null {
    const binding =
      this.bindings.get(`${layer}::${controlKey}`) ??
      this.bindings.get(`base::${controlKey}`);
    if (!binding) {
      return null;
    }
    return {
      source,
      controlKey,
      layer: binding.layer,
      command: binding.command,
      value: applyResponseCurve(inputVal, binding.curve, binding.scale),
      rawBytesHex,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* #31 External DCC Hot-Sync Manifest (.psd / .glb)                           */
/* -------------------------------------------------------------------------- */

export type ExternalDccFormat = "psd" | "glb";

export interface ExternalDccAssetLinkInput {
  readonly linkId: string;
  readonly format: ExternalDccFormat;
  readonly externalPath: string;
  readonly targetCutId: string;
  readonly targetNodeOrLayerId: string;
  readonly initialBytes: Uint8Array;
  readonly preservedStudioMetadata: Readonly<Record<string, string | number | boolean>>;
  readonly linkedAtMs?: number;
}

export interface ExternalDccManifestEntry {
  readonly linkId: string;
  readonly format: ExternalDccFormat;
  readonly externalPath: string;
  readonly targetCutId: string;
  readonly targetNodeOrLayerId: string;
  readonly revision: number;
  readonly contentSha256Hex: string;
  readonly byteLength: number;
  readonly preservedStudioMetadata: Readonly<Record<string, string | number | boolean>>;
  readonly lastSyncedAtMs: number;
}

export type ExternalDccSyncStatus = "NO_CHANGE" | "SYNC_READY" | "INVALID_MAGIC_HEADER" | "UNKNOWN_LINK";

export interface ExternalDccHotSyncPlan {
  readonly linkId: string;
  readonly status: ExternalDccSyncStatus;
  readonly format?: ExternalDccFormat;
  readonly previousSha256Hex?: string;
  readonly nextSha256Hex?: string;
  readonly nextRevision?: number;
  readonly preservedStudioMetadata?: Readonly<Record<string, string | number | boolean>>;
  readonly replacePayloadOnly: boolean;
  readonly messageKo: string;
}

/** `.psd` (`8BPS`) 및 `.glb` (`glTF` 0x46546C67) 바이너리 매직 헤더 검증. */
export function validateExternalDccHeader(
  format: ExternalDccFormat,
  bytes: Uint8Array,
): boolean {
  if (bytes.byteLength < 12) {
    return false;
  }
  if (format === "psd") {
    return (
      bytes[0] === 0x38 && // '8'
      bytes[1] === 0x42 && // 'B'
      bytes[2] === 0x50 && // 'P'
      bytes[3] === 0x53    // 'S'
    );
  }
  // glTF 2.0 binary magic "glTF" (little-endian 0x46546C67) + version 2
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  return magic === 0x46546c67 && version === 2;
}

/**
 * 외부 Photoshop/CSP `.psd` 및 Blender `.glb` 파일의 SHA-256 변경 감지 및
 * 비파괴 핫싱크 매니페스트 관리자.
 */
export class ExternalDccHotSyncManager {
  private readonly entries = new Map<string, ExternalDccManifestEntry>();

  registerLink(input: ExternalDccAssetLinkInput): ExternalDccManifestEntry {
    if (!validateExternalDccHeader(input.format, input.initialBytes)) {
      throw new Error(
        `유효하지 않은 ${input.format.toUpperCase()} 파일 매직 헤더입니다(${input.externalPath}).`,
      );
    }
    const entry: ExternalDccManifestEntry = {
      linkId: input.linkId,
      format: input.format,
      externalPath: input.externalPath,
      targetCutId: input.targetCutId,
      targetNodeOrLayerId: input.targetNodeOrLayerId,
      revision: 1,
      contentSha256Hex: sha256Hex(input.initialBytes),
      byteLength: input.initialBytes.byteLength,
      preservedStudioMetadata: { ...input.preservedStudioMetadata },
      lastSyncedAtMs: input.linkedAtMs ?? Date.now(),
    };
    this.entries.set(input.linkId, entry);
    return entry;
  }

  /** 외부 파일 수정 감지 및 비파괴 핫싱크 적용(스튜디오 변환·블렌드·권리 메타데이터 보존). */
  detectAndApplyHotSync(
    linkId: string,
    latestBytes: Uint8Array,
    nowMs = Date.now(),
  ): ExternalDccHotSyncPlan {
    const existing = this.entries.get(linkId);
    if (!existing) {
      return {
        linkId,
        status: "UNKNOWN_LINK",
        replacePayloadOnly: false,
        messageKo: `등록되지 않은 외부 DCC 링크입니다(${linkId}).`,
      };
    }

    if (!validateExternalDccHeader(existing.format, latestBytes)) {
      return {
        linkId,
        status: "INVALID_MAGIC_HEADER",
        format: existing.format,
        previousSha256Hex: existing.contentSha256Hex,
        replacePayloadOnly: false,
        messageKo: `${existing.format.toUpperCase()} 헤더 검증에 실패해 기존 자산을 보호했습니다.`,
      };
    }

    const nextSha256Hex = sha256Hex(latestBytes);
    if (nextSha256Hex === existing.contentSha256Hex) {
      return {
        linkId,
        status: "NO_CHANGE",
        format: existing.format,
        previousSha256Hex: existing.contentSha256Hex,
        nextSha256Hex,
        nextRevision: existing.revision,
        preservedStudioMetadata: existing.preservedStudioMetadata,
        replacePayloadOnly: false,
        messageKo: "외부 파일 해시 변동이 없어 재로드를 건너뜁니다.",
      };
    }

    const updated: ExternalDccManifestEntry = {
      ...existing,
      revision: existing.revision + 1,
      contentSha256Hex: nextSha256Hex,
      byteLength: latestBytes.byteLength,
      lastSyncedAtMs: nowMs,
    };
    this.entries.set(linkId, updated);

    return {
      linkId,
      status: "SYNC_READY",
      format: existing.format,
      previousSha256Hex: existing.contentSha256Hex,
      nextSha256Hex,
      nextRevision: updated.revision,
      preservedStudioMetadata: updated.preservedStudioMetadata,
      replacePayloadOnly: true,
      messageKo: `${existing.format.toUpperCase()} 리비전 ${updated.revision} 핫싱크 준비 완료(스튜디오 변환·레이어 설정 보존).`,
    };
  }

  /** OPFS 영속 저장용 결정론적 매니페스트 JSON 및 무결성 해시 내보내기. */
  exportManifestSnapshot(): {
    readonly schemaVersion: "toonstudio-dcc-hotsync-manifest-v1";
    readonly entries: readonly ExternalDccManifestEntry[];
    readonly manifestSha256Hex: string;
  } {
    const entries = [...this.entries.values()].sort((a, b) => a.linkId.localeCompare(b.linkId));
    return {
      schemaVersion: "toonstudio-dcc-hotsync-manifest-v1",
      entries,
      manifestSha256Hex: sha256Hex(canonicalJsonBytes(entries)),
    };
  }
}
