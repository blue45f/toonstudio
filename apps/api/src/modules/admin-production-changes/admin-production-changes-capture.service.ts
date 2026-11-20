import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { inspectStrictJpegDimensions, inspectStrictStaticWebpDimensions } from "@toonstudio/contracts/strict-raster-image-inspector";
import { inspectStudioPngStructure } from "@toonstudio/contracts/studio-png-structure";
import { PrivateObjectReferenceSchema, PrivateSignedReadUrlSchema } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { PRIVATE_OBJECT_STORAGE_PORT, type PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { AdminProductionChangesRepository } from "./admin-production-changes.repository";

export const PRODUCTION_CAPTURE_MAX_BYTES = 5 * 1024 * 1024;
export type ProductionCaptureFile = { buffer: Buffer; mimetype: string; size: number };
const CAPTURE_BASE = "/api/admin/production-changes/captures/";
function unavailable() { return new ServiceUnavailableException("캡처 저장소를 사용할 수 없습니다. 저장 설정과 허용 용량을 확인해 주세요. 증빙 링크는 별도로 기록할 수 있습니다."); }

export function validateProductionCapture(file: ProductionCaptureFile | undefined): ProductionCaptureFile {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.byteLength || file.size < 1 || file.size > PRODUCTION_CAPTURE_MAX_BYTES) throw new BadRequestException("캡처는 5MiB 이하의 PNG·JPG·WebP 파일이어야 합니다.");
  try {
    let dimensions: { width: number; height: number };
    if (file.mimetype === "image/png") {
      if (file.buffer.length < 24) throw new Error("invalid PNG");
      dimensions = { width: file.buffer.readUInt32BE(16), height: file.buffer.readUInt32BE(20) };
      inspectStudioPngStructure(file.buffer, dimensions.width, dimensions.height);
    } else if (file.mimetype === "image/jpeg") dimensions = inspectStrictJpegDimensions(file.buffer);
    else if (file.mimetype === "image/webp") dimensions = inspectStrictStaticWebpDimensions(file.buffer);
    else throw new Error("unsupported image");
    if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 16384 || dimensions.height > 16384 || dimensions.width * dimensions.height > 64_000_000) throw new Error("image dimensions too large");
  } catch { throw new BadRequestException("캡처 파일의 형식·내용·크기를 확인해 주세요. 정지된 PNG·JPG·WebP 이미지만 저장합니다."); }
  return file;
}

@Injectable()
export class AdminProductionChangesCaptureService {
  constructor(@Inject(AdminProductionChangesRepository) private readonly repository: AdminProductionChangesRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort) {}

  async upload(userId: string, raw: ProductionCaptureFile | undefined): Promise<{ url: string }> {
    await this.repository.assertWrite(userId);
    const file = validateProductionCapture(raw);
    if (!this.storage) throw unavailable();
    const id = randomUUID();
    const sha = createHash("sha256").update(file.buffer).digest("hex");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    let reference;
    try {
      reference = PrivateObjectReferenceSchema.parse(await this.storage.uploadImmutable({
        purpose: "derived", contentType: file.mimetype, bytes: Uint8Array.from(file.buffer),
        controlMetadata: { documentId: "admin-production-changes", operationId: id, labels: { scope: "verification-capture" } },
      }, { signal: abort.signal }));
      if (reference.digest !== `sha256:${sha}` || reference.byteLength !== file.size || reference.contentType !== file.mimetype || reference.purpose !== "derived") throw new Error("capture-reference-mismatch");
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); }
    // 업로드 사이에 권한이 회수되어도 저장된 파일의 접근 URL은 발급하지 않는다.
    await this.repository.saveCapture(userId, { id, object: reference, contentType: file.mimetype, byteLength: file.size });
    return { url: CAPTURE_BASE + id };
  }
  async read(userId: string, id: string): Promise<string> {
    const metadata = await this.repository.readCapture(userId, id);
    if (!this.storage) throw unavailable();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      const signed = PrivateSignedReadUrlSchema.parse(await this.storage.createSignedReadUrl({ object: metadata.object, expiresInSeconds: 60 }, { signal: abort.signal }));
      if (signed.expiresAtEpochMs <= Date.now()) throw new Error("expired-capture-link");
      return signed.url;
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); }
  }
}
