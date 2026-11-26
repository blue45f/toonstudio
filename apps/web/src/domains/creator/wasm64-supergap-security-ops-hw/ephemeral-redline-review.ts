/**
 * #27 무설치 암호화 P2P 일회성 레드라인 검수 링크(EphemeralP2pRedlineReviewSession).
 *
 * - 편집자·PD에게 앱 설치 없이 공유 가능한 URL 프래그먼트(`#sessionId.key`) 기반
 *   AES-GCM-256 종단간 암호화 일회성 검수 링크를 생성한다(키가 서버로 전송되지 않는 ₩0 구조).
 * - 핀(pin) · 자유 필기 레드라인 스트로크(stroke) · 대사 코멘트(dialogue-comment) 패킷에
 *   엄격한 만료 TTL을 적용한다.
 * - 검수 오버레이는 스튜디오에서 ON/OFF 토글 가능한 독립 레이어로 투영되며,
 *   원본 아트워크 레이어를 1바이트도 변경하지 않았음을 SHA-256 무결성으로 증명한다.
 */

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJsonBytes,
  decryptAesGcm256,
  encryptAesGcm256,
  randomBytes,
  sha256Hex,
  utf8Decode,
  utf8Encode,
  type AesGcmCipherEnvelope,
} from "./crypto-binary-utils";

export type RedlineSemanticTone = "bad" | "warn" | "accent" | "cool";

export interface BaseArtLayerSnapshot {
  readonly layerId: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface RedlinePinAnnotation {
  readonly kind: "pin";
  readonly annotationId: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly severity: "info" | "revision" | "blocker";
  readonly tone: RedlineSemanticTone;
}

export interface RedlineStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface RedlineStrokeAnnotation {
  readonly kind: "stroke";
  readonly annotationId: string;
  readonly points: readonly RedlineStrokePoint[];
  readonly strokeWidthPx: number;
  readonly tone: RedlineSemanticTone;
}

export interface RedlineDialogueCommentAnnotation {
  readonly kind: "dialogue-comment";
  readonly annotationId: string;
  readonly balloonId: string;
  readonly originalText: string;
  readonly suggestedText: string;
  readonly reviewerNote: string;
}

export type RedlineAnnotationItem =
  | RedlinePinAnnotation
  | RedlineStrokeAnnotation
  | RedlineDialogueCommentAnnotation;

export interface CreateRedlineSessionOptions {
  readonly sessionId?: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly baseArtLayers: readonly BaseArtLayerSnapshot[];
  /** 검수 링크 만료 TTL(ms, 기본 24시간). */
  readonly ttlMs?: number;
  readonly nowMs?: number;
  readonly reviewOriginUrl?: string;
}

export interface EphemeralRedlineReviewLink {
  readonly sessionId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly shareableUrl: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly baselineLayerDigests: Readonly<Record<string, string>>;
}

export interface ParsedRedlineReviewLink {
  readonly sessionId: string;
  readonly sessionKey32: Uint8Array;
}

export interface RedlineReviewPacketPayload {
  readonly packetId: string;
  readonly sessionId: string;
  readonly cutId: string;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly annotations: readonly RedlineAnnotationItem[];
}

export interface EncryptedRedlineReviewPacket {
  readonly packetId: string;
  readonly sessionId: string;
  readonly cutId: string;
  readonly expiresAtMs: number;
  readonly envelope: AesGcmCipherEnvelope;
  readonly packetSha256Hex: string;
}

export interface RedlinePacketIngestResult {
  readonly accepted: boolean;
  readonly packetId: string;
  readonly annotationCount: number;
  readonly reason?: string;
}

export interface RedlineOverlaySnapshot {
  readonly sessionId: string;
  readonly cutId: string;
  readonly overlayVisible: boolean;
  readonly sessionExpired: boolean;
  readonly sessionRevoked: boolean;
  readonly baseArtLayersUntouched: boolean;
  readonly tamperedBaseLayerIds: readonly string[];
  readonly activePacketCount: number;
  readonly pins: readonly RedlinePinAnnotation[];
  readonly strokes: readonly RedlineStrokeAnnotation[];
  readonly dialogueComments: readonly RedlineDialogueCommentAnnotation[];
  readonly totalAnnotationCount: number;
}

function buildRedlineAad(
  sessionId: string,
  cutId: string,
  packetId: string,
  expiresAtMs: number,
): string {
  return `redline-v1|${sessionId}|${cutId}|${packetId}|${expiresAtMs}`;
}

/** URL 프래그먼트(`#sessionId.base64urlKey`)에서 무설치 검수 세션 ID와 복호화 키 추출. */
export function parseZeroInstallReviewLink(shareableUrl: string): ParsedRedlineReviewLink {
  const hashIdx = shareableUrl.indexOf("#");
  if (hashIdx < 0) {
    throw new Error("검수 링크에 암호화 키 프래그먼트(#)가 없습니다.");
  }
  const fragment = shareableUrl.slice(hashIdx + 1);
  const dotIdx = fragment.indexOf(".");
  if (dotIdx <= 0 || dotIdx === fragment.length - 1) {
    throw new Error("유효하지 않은 검수 링크 프래그먼트 형식입니다.");
  }
  const sessionId = fragment.slice(0, dotIdx);
  const keyB64 = fragment.slice(dotIdx + 1);
  const sessionKey32 = base64UrlToBytes(keyB64);
  if (sessionKey32.byteLength !== 32) {
    throw new Error("검수 링크 세션 키 길이가 32바이트가 아닙니다.");
  }
  return { sessionId, sessionKey32 };
}

/**
 * 무설치 암호화 P2P 일회성 레드라인 검수 세션.
 */
export class EphemeralP2pRedlineReviewSession {
  readonly sessionId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;

  private readonly reviewOriginUrl: string;
  private readonly sessionKey32: Uint8Array;
  private readonly baselineLayerDigests: ReadonlyMap<string, string>;
  private readonly packets = new Map<string, RedlineReviewPacketPayload>();
  private overlayVisible = true;
  private revoked = false;

  constructor(options: CreateRedlineSessionOptions) {
    const nowMs = options.nowMs ?? Date.now();
    const ttlMs = options.ttlMs ?? 24 * 3_600_000;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("검수 링크 TTL은 양수여야 합니다.");
    }
    this.sessionId =
      options.sessionId ?? `rev-${bytesToBase64Url(randomBytes(9)).replace(/[-_]/gu, "")}`;
    this.workId = options.workId;
    this.episodeId = options.episodeId;
    this.cutId = options.cutId;
    this.createdAtMs = nowMs;
    this.expiresAtMs = nowMs + ttlMs;
    this.reviewOriginUrl = options.reviewOriginUrl ?? "https://www.toonstudio.cloud/review";
    this.sessionKey32 = randomBytes(32);

    const digests = new Map<string, string>();
    for (let i = 0; i < options.baseArtLayers.length; i += 1) {
      const layer = options.baseArtLayers[i];
      digests.set(layer.layerId, sha256Hex(layer.bytes));
    }
    this.baselineLayerDigests = digests;
  }

  /** 무설치 P2P 암호화 검수 공유 링크 발급(키는 URL 해시 프래그먼트에만 포함). */
  getReviewLink(): EphemeralRedlineReviewLink {
    if (this.revoked) {
      throw new Error("철회된 검수 세션에서는 링크를 발급할 수 없습니다.");
    }
    const baselineObj: Record<string, string> = {};
    this.baselineLayerDigests.forEach((digest, layerId) => {
      baselineObj[layerId] = digest;
    });
    const shareableUrl = `${this.reviewOriginUrl}#${this.sessionId}.${bytesToBase64Url(this.sessionKey32)}`;
    return {
      sessionId: this.sessionId,
      workId: this.workId,
      episodeId: this.episodeId,
      cutId: this.cutId,
      shareableUrl,
      createdAtMs: this.createdAtMs,
      expiresAtMs: this.expiresAtMs,
      baselineLayerDigests: baselineObj,
    };
  }

  /**
   * 편집자(검수자) 측: 공유 링크만으로 핀·스트로크·대사 코멘트 패킷을 AES-GCM-256 암호화 생성.
   */
  static async createEncryptedRedlinePacket(input: {
    readonly shareableUrl: string;
    readonly cutId: string;
    readonly reviewerId: string;
    readonly reviewerName: string;
    readonly annotations: readonly RedlineAnnotationItem[];
    readonly packetTtlMs: number;
    readonly nowMs?: number;
    readonly packetId?: string;
  }): Promise<EncryptedRedlineReviewPacket> {
    const parsed = parseZeroInstallReviewLink(input.shareableUrl);
    const nowMs = input.nowMs ?? Date.now();
    if (!Number.isFinite(input.packetTtlMs) || input.packetTtlMs <= 0) {
      throw new Error("레드라인 패킷 TTL은 양수여야 합니다.");
    }
    const packetId =
      input.packetId ?? `pkt-${bytesToBase64Url(randomBytes(8)).replace(/[-_]/gu, "")}`;
    const expiresAtMs = nowMs + input.packetTtlMs;

    const payload: RedlineReviewPacketPayload = {
      packetId,
      sessionId: parsed.sessionId,
      cutId: input.cutId,
      reviewerId: input.reviewerId,
      reviewerName: input.reviewerName,
      createdAtMs: nowMs,
      expiresAtMs,
      annotations: input.annotations,
    };

    const aad = buildRedlineAad(parsed.sessionId, input.cutId, packetId, expiresAtMs);
    const envelope = await encryptAesGcm256(
      utf8Encode(JSON.stringify(payload)),
      parsed.sessionKey32,
      aad,
    );

    return {
      packetId,
      sessionId: parsed.sessionId,
      cutId: input.cutId,
      expiresAtMs,
      envelope,
      packetSha256Hex: sha256Hex(canonicalJsonBytes({ packetId, envelope })),
    };
  }

  /** 작가 스튜디오 측: 수신된 암호화 레드라인 패킷 복호화·만료 검사 후 오버레이 저장소에 반영. */
  async receiveEncryptedPacket(
    packet: EncryptedRedlineReviewPacket,
    nowMs = Date.now(),
  ): Promise<RedlinePacketIngestResult> {
    if (this.revoked) {
      return {
        accepted: false,
        packetId: packet.packetId,
        annotationCount: 0,
        reason: "철회된 검수 세션입니다.",
      };
    }
    if (nowMs > this.expiresAtMs || nowMs > packet.expiresAtMs) {
      return {
        accepted: false,
        packetId: packet.packetId,
        annotationCount: 0,
        reason: "검수 세션 또는 레드라인 패킷의 유효 TTL이 만료되었습니다.",
      };
    }
    if (packet.sessionId !== this.sessionId || packet.cutId !== this.cutId) {
      return {
        accepted: false,
        packetId: packet.packetId,
        annotationCount: 0,
        reason: "패킷의 세션 ID 또는 컷 ID가 현재 검수 대상과 일치하지 않습니다.",
      };
    }

    try {
      const expectedAad = buildRedlineAad(
        this.sessionId,
        this.cutId,
        packet.packetId,
        packet.expiresAtMs,
      );
      const plainBytes = await decryptAesGcm256(packet.envelope, this.sessionKey32, expectedAad);
      const payload = JSON.parse(utf8Decode(plainBytes)) as RedlineReviewPacketPayload;
      if (payload.sessionId !== this.sessionId || payload.cutId !== this.cutId) {
        return {
          accepted: false,
          packetId: packet.packetId,
          annotationCount: 0,
          reason: "복호화된 페이로드의 세션/컷 바인딩이 일치하지 않습니다.",
        };
      }
      this.packets.set(payload.packetId, payload);
      return {
        accepted: true,
        packetId: payload.packetId,
        annotationCount: payload.annotations.length,
      };
    } catch {
      return {
        accepted: false,
        packetId: packet.packetId,
        annotationCount: 0,
        reason: "암호화 레드라인 패킷 복호화 또는 인증 태그 검증에 실패했습니다.",
      };
    }
  }

  /** 검수 오버레이 표시 ON/OFF 토글(원본 레이어 무관). */
  setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible;
  }

  /** 만료된 패킷 정리 및 제거된 건수 반환. */
  purgeExpiredPackets(nowMs = Date.now()): number {
    let removed = 0;
    this.packets.forEach((packet, id) => {
      if (nowMs > packet.expiresAtMs) {
        this.packets.delete(id);
        removed += 1;
      }
    });
    return removed;
  }

  /** 세션 즉시 철회(일회성 키 버퍼 0으로 덮어쓰기 + 누적 패킷 폐기). */
  revokeSession(): void {
    this.revoked = true;
    this.sessionKey32.fill(0);
    this.packets.clear();
  }

  /**
   * 토글 가능한 비파괴 검수 오버레이 스냅샷 생성 + 원본 아트워크 레이어 무변조 SHA-256 대조.
   */
  buildOverlaySnapshot(
    currentBaseArtLayers: readonly BaseArtLayerSnapshot[],
    options: { readonly visibleOverride?: boolean; readonly nowMs?: number } = {},
  ): RedlineOverlaySnapshot {
    const nowMs = options.nowMs ?? Date.now();
    const effectiveVisible =
      options.visibleOverride !== undefined ? options.visibleOverride : this.overlayVisible;
    const sessionExpired = nowMs > this.expiresAtMs;

    // 원본 아트워크 레이어 무결성 감사
    const tamperedBaseLayerIds: string[] = [];
    const currentById = new Map<string, Uint8Array>();
    for (let i = 0; i < currentBaseArtLayers.length; i += 1) {
      currentById.set(currentBaseArtLayers[i].layerId, currentBaseArtLayers[i].bytes);
    }
    this.baselineLayerDigests.forEach((expectedDigest, layerId) => {
      const liveBytes = currentById.get(layerId);
      if (!liveBytes || sha256Hex(liveBytes) !== expectedDigest) {
        tamperedBaseLayerIds.push(layerId);
      }
    });

    const pins: RedlinePinAnnotation[] = [];
    const strokes: RedlineStrokeAnnotation[] = [];
    const dialogueComments: RedlineDialogueCommentAnnotation[] = [];
    let activePacketCount = 0;

    if (effectiveVisible && !sessionExpired && !this.revoked) {
      this.packets.forEach((packet) => {
        if (nowMs > packet.expiresAtMs) {
          return;
        }
        activePacketCount += 1;
        for (let i = 0; i < packet.annotations.length; i += 1) {
          const item = packet.annotations[i];
          if (item.kind === "pin") {
            pins.push(item);
          } else if (item.kind === "stroke") {
            strokes.push(item);
          } else {
            dialogueComments.push(item);
          }
        }
      });
    }

    return {
      sessionId: this.sessionId,
      cutId: this.cutId,
      overlayVisible: effectiveVisible,
      sessionExpired,
      sessionRevoked: this.revoked,
      baseArtLayersUntouched: tamperedBaseLayerIds.length === 0,
      tamperedBaseLayerIds,
      activePacketCount,
      pins,
      strokes,
      dialogueComments,
      totalAnnotationCount: pins.length + strokes.length + dialogueComments.length,
    };
  }
}
