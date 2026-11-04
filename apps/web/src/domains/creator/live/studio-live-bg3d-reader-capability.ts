import { STUDIO_CRDT_READER_CAPABILITIES, validStudioCrdtReaderMetadata, type StudioCrdtReaderMetadata } from "./studio-crdt-reader-capability";
import type { ServerFailure } from "./studio-live-socket-wire";

/** 원격 전송은 서버 작품 권위를 사용한다. 이 기기 BroadcastChannel의 origin 메타는 옮기지 않는다. */
export function studioCrdtRemoteReaderRequest<T extends StudioCrdtReaderMetadata>(request: T): Omit<T, "readerCapabilities" | "requiredReaderCapabilities" | "artifactScope"> & { readonly readerCapabilities: readonly string[] } {
  const { readerCapabilities: _readers, requiredReaderCapabilities: _required, artifactScope: _scope, ...wire } = request;
  return { ...wire, readerCapabilities: STUDIO_CRDT_READER_CAPABILITIES };
}
export function studioLiveRequiredReaderFailure(value: unknown): ServerFailure | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  if (!validStudioCrdtReaderMetadata(metadata)) return null;
  if ((metadata.requiredReaderCapabilities as readonly string[] | undefined)?.some((entry) => !STUDIO_CRDT_READER_CAPABILITIES.includes(entry))) {
    return { ok: false, code: "reader_upgrade_required", message: "이 원고의 저장 계약을 지원하는 새 버전으로 업데이트해 주세요." };
  }
  return null;
}
