import { STUDIO_CRDT_READER_CAPABILITIES, assertStudioCrdtSupportedReaders, requiresStudioBg3dBundleReader,
  studioCrdtReaderMetadata, supportsStudioCrdtReaders, validStudioCrdtReaderMetadata,
  type StudioCrdtReaderMetadata } from "./studio-crdt-reader-capability";
import { createStudioCrdtLocalWireMessage, type StudioCrdtLocalWireMessage } from "./studio-crdt-protocol";

const BRAND = "toonspectrum:studio-crdt-readers:v1";
interface Advertisement { brand: typeof BRAND; workId: string; senderSessionId: string; readerCapabilities: readonly string[] }
function advertisement(value: unknown, workId: string, self: string): Advertisement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).sort().join(",") !== "brand,readerCapabilities,senderSessionId,workId" || entry.brand !== BRAND
    || entry.workId !== workId || typeof entry.senderSessionId !== "string" || entry.senderSessionId === self
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(entry.senderSessionId) || !validStudioCrdtReaderMetadata(entry)) return null;
  return entry as unknown as Advertisement;
}
/** 일반 v8 바이트는 유지하고, 기능 문서만 구 reader가 거부할 추가 봉투를 사용한다. */
export class StudioCrdtLocalReaderFence {
  private readonly peers = new Map<string, readonly string[]>();
  private required: StudioCrdtReaderMetadata = {};
  constructor(private readonly workId: string, private readonly sessionId: string,
    private readonly post: (value: unknown) => void) {}
  advertise(): void { this.post({ brand: BRAND, workId: this.workId, senderSessionId: this.sessionId, readerCapabilities: STUDIO_CRDT_READER_CAPABILITIES }); }
  receiveAdvertisement(value: unknown): boolean {
    if (!value || typeof value !== "object" || !("brand" in value) || value.brand !== BRAND) return false;
    const parsed = advertisement(value, this.workId, this.sessionId);
    if (parsed) {
      const first = !this.peers.has(parsed.senderSessionId);
      if (this.peers.size >= 256 && first) this.peers.delete(this.peers.keys().next().value!);
      this.peers.set(parsed.senderSessionId, parsed.readerCapabilities);
      if (first) this.advertise();
    }
    return true;
  }
  decorate(message: Parameters<typeof createStudioCrdtLocalWireMessage>[0]): StudioCrdtLocalWireMessage {
    if (requiresStudioBg3dBundleReader(message.payload)) this.required = studioCrdtReaderMetadata(message.payload);
    const meta = requiresStudioBg3dBundleReader(this.required) ? this.required : {};
    if (message.kind === "sync-request") return createStudioCrdtLocalWireMessage({ ...message, ...meta, payload: { ...message.payload, ...meta } });
    if (message.kind === "sync-response") return createStudioCrdtLocalWireMessage({ ...message, ...meta, payload: { ...message.payload, ...meta } });
    return createStudioCrdtLocalWireMessage({ ...message, ...meta, payload: { ...message.payload, ...meta } });
  }
  accept(wire: StudioCrdtLocalWireMessage): StudioCrdtLocalWireMessage | null {
    try { assertStudioCrdtSupportedReaders(wire); } catch { return null; }
    const feature = requiresStudioBg3dBundleReader(wire);
    if (feature && (!supportsStudioCrdtReaders(wire) || !wire.artifactScope)) return null;
    if (requiresStudioBg3dBundleReader(this.required) && !feature && wire.kind !== "sync-request") return null;
    const readers = wire.readerCapabilities ?? this.peers.get(wire.senderSessionId);
    if (requiresStudioBg3dBundleReader(this.required) && !supportsStudioCrdtReaders({ readerCapabilities: readers })) return null;
    if (feature) this.required = studioCrdtReaderMetadata(wire);
    if (wire.kind === "sync-request" && readers) return { ...wire, payload: { ...wire.payload, readerCapabilities: readers } };
    return wire;
  }
}
