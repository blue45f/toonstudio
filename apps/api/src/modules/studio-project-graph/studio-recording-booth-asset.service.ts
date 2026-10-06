import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import {
  STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES,
  studioRecordingBoothAssetContentTypeSchema,
  studioRecordingBoothAssetCreateSchema,
  studioRecordingBoothAssetDeleteSchema,
  type StudioRecordingBoothAssetCreate,
  type StudioRecordingBoothAssetDelete,
} from "@toonstudio/studio-project-model/recording-booth-asset";
import {
  LocatedPrivateObjectReferenceSchema,
  PrivateSignedReadUrlSchema,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import {
  StudioRecordingBoothAssetRepository,
  StudioRecordingBoothAssetRepositoryError,
} from "./studio-recording-booth-asset.repository";

function unavailable(): never {
  throw new ServiceUnavailableException({ code: "studio_recording_booth_asset_unavailable" });
}

function exactMime(file: StudioWorkAssetUploadFile): string {
  const contentType = file.mimetype.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const parsed = studioRecordingBoothAssetContentTypeSchema.safeParse(contentType);
  if (!parsed.success) throw new UnsupportedMediaTypeException({ code: "studio_recording_booth_asset_media_type" });
  const bytes = file.buffer;
  // WebM 컨테이너(EBML) 서명만 허용한다 — 부스 드라이버의 캡처 형식과 일치한다.
  const matched = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (!matched) throw new UnsupportedMediaTypeException({ code: "studio_recording_booth_asset_signature" });
  return parsed.data;
}

@Injectable()
export class StudioRecordingBoothAssetService {
  constructor(
    @Inject(StudioRecordingBoothAssetRepository) readonly repository: StudioRecordingBoothAssetRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
  ) {}

  private async run<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof StudioRecordingBoothAssetRepositoryError) {
        if (error.code === "forbidden") throw new ForbiddenException({ code: "studio_recording_booth_asset_forbidden" });
        if (error.code === "not-found") throw new NotFoundException({ code: "studio_recording_booth_asset_not_found" });
        if (["idempotency", "conflict"].includes(error.code)) throw new ConflictException({ code: `studio_recording_booth_asset_${error.code}` });
      }
      throw new ServiceUnavailableException({ code: "studio_recording_booth_asset_unavailable" });
    }
  }

  private requireStorage(): PrivateObjectStoragePort {
    if (!this.storage) return unavailable();
    return this.storage;
  }

  async create(actor: string, workId: string, raw: StudioRecordingBoothAssetCreate, file: StudioWorkAssetUploadFile | undefined) {
    const input = studioRecordingBoothAssetCreateSchema.parse(raw);
    if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.byteLength || file.size <= 0) {
      throw new BadRequestException({ code: "studio_recording_booth_asset_file_required" });
    }
    if (file.size > STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES) {
      throw new PayloadTooLargeException({ code: "studio_recording_booth_asset_too_large" });
    }
    const contentType = exactMime(file);
    await this.run(() => this.repository.authorizeCreate(actor, workId));
    const storage = this.requireStorage();
    await this.run(() => storage.verifyPrivatePurposeBuckets({}, ["derived"]));
    const bytes = Uint8Array.from(file.buffer);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const object = LocatedPrivateObjectReferenceSchema.parse(await this.run(() => storage.uploadImmutable({
      purpose: "derived",
      contentType,
      bytes,
      controlMetadata: {
        documentId: workId,
        operationId: input.operationId,
        labels: { kind: "recording-booth-asset", boothId: input.boothId },
      },
    })));
    try {
      return await this.run(() => this.repository.create(actor, workId, input, {
        contentType, byteLength: file.size, sha256, object,
      }));
    } catch (error) {
      const referenced = await this.repository.objectReferenced(object).catch(() => true);
      if (!referenced) await storage.deleteGeneratedObject({ object }).catch(() => undefined);
      throw error;
    }
  }

  list(actor: string, workId: string) {
    return this.run(() => this.repository.list(actor, workId));
  }

  async signedRead(actor: string, workId: string, assetId: string) {
    const storage = this.requireStorage();
    return this.run(async () => {
      const first = await this.repository.read(actor, workId, assetId);
      const signed = PrivateSignedReadUrlSchema.parse(await storage.createSignedReadUrl({ object: first.object, expiresInSeconds: 300 }));
      const current = await this.repository.read(actor, workId, assetId);
      if (current.view.asset.sha256 !== first.view.asset.sha256 || JSON.stringify(current.object) !== JSON.stringify(first.object)) {
        throw new ConflictException({ code: "studio_recording_booth_asset_changed_during_read" });
      }
      return { ...current.view, signedRead: signed };
    });
  }

  async delete(actor: string, workId: string, assetId: string, raw: StudioRecordingBoothAssetDelete) {
    const input = studioRecordingBoothAssetDeleteSchema.parse(raw);
    const storage = this.requireStorage();
    return this.run(async () => {
      const result = await this.repository.delete(actor, workId, assetId, input);
      if (result.deleteObject) await storage.deleteGeneratedObject({ object: result.object });
      return { ...result.view, replayed: result.replayed };
    });
  }
}
