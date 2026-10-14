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
  LocatedPrivateObjectReferenceSchema,
  PrivateSignedReadUrlSchema,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import {
  PRODUCTION_VOICE_COMMENTARY_MAX_BYTES,
  productionVoiceCommentaryContentTypeSchema,
  productionVoiceCommentaryCreateSchema,
  productionVoiceCommentaryDeleteSchema,
  type ProductionVoiceCommentaryCreate,
  type ProductionVoiceCommentaryDelete,
  type ProductionVoiceCommentarySignedRead,
  type ProductionVoiceCommentaryTrack,
  type ProductionVoiceCommentaryView,
} from "./production-voice-commentary.dto";
import {
  ProductionVoiceCommentaryRepository,
  ProductionVoiceCommentaryRepositoryError,
  type ProductionVoiceCommentaryRecord,
} from "./production-voice-commentary.repository";

function unavailable(): never {
  throw new ServiceUnavailableException({ code: "production_voice_commentary_unavailable" });
}

/** 검수 음성 노트와 같은 방식의 실서명 검증 — 선언된 타입과 실제 바이트가 다르면 저장 전에 거부한다. */
function exactMime(file: StudioWorkAssetUploadFile): string {
  const contentType = file.mimetype.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const parsed = productionVoiceCommentaryContentTypeSchema.safeParse(contentType);
  if (!parsed.success) throw new UnsupportedMediaTypeException({ code: "production_voice_commentary_media_type" });
  const bytes = file.buffer;
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, value: string) => [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  const matched = contentType === "audio/webm" ? starts(0x1a, 0x45, 0xdf, 0xa3)
    : contentType === "audio/ogg" ? ascii(0, "OggS")
      : contentType === "audio/wav" ? ascii(0, "RIFF") && ascii(8, "WAVE")
        : contentType === "audio/mp4" ? bytes.length >= 12 && ascii(4, "ftyp")
          : contentType === "audio/mpeg" ? ascii(0, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
            : false;
  if (!matched) throw new UnsupportedMediaTypeException({ code: "production_voice_commentary_signature" });
  return parsed.data;
}

@Injectable()
export class ProductionVoiceCommentaryService {
  constructor(
    @Inject(ProductionVoiceCommentaryRepository) readonly repository: ProductionVoiceCommentaryRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
  ) {}

  private async run<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof ProductionVoiceCommentaryRepositoryError) {
        if (error.code === "forbidden") throw new ForbiddenException({ code: "production_voice_commentary_forbidden" });
        if (error.code === "not-found") throw new NotFoundException({ code: "production_voice_commentary_not_found" });
        if (["idempotency", "conflict"].includes(error.code)) throw new ConflictException({ code: `production_voice_commentary_${error.code}` });
        if (error.code === "invalid-source") throw new BadRequestException({ code: "production_voice_commentary_invalid_source" });
      }
      throw new ServiceUnavailableException({ code: "production_voice_commentary_unavailable" });
    }
  }

  private requireStorage(): PrivateObjectStoragePort {
    if (!this.storage) return unavailable();
    return this.storage;
  }

  /**
   * 해설 트랙은 목록 화면이 곧 재생 화면이라(패널이 track.audio.url을 그대로
   * 재생한다), 응답마다 300초 서명 URL을 새로 발급해 오디오 참조를 채운다.
   * 검수 음성 노트가 읽기 호출에서만 서명하는 것과 다른 지점이 이것뿐이다.
   */
  private async view(record: ProductionVoiceCommentaryRecord): Promise<ProductionVoiceCommentaryView> {
    let audio: ProductionVoiceCommentaryTrack["audio"] = null;
    if (!record.deletedAt) {
      const signed = PrivateSignedReadUrlSchema.parse(
        await this.requireStorage().createSignedReadUrl({ object: record.object, expiresInSeconds: 300 }),
      );
      audio = { kind: "server", url: signed.url, mimeType: record.contentType, byteSize: record.byteLength };
    }
    return { track: { ...record.meta, audio }, canDelete: record.canDelete };
  }

  async create(actor: string, projectId: string, episodeId: string, raw: ProductionVoiceCommentaryCreate, file: StudioWorkAssetUploadFile | undefined) {
    const input = productionVoiceCommentaryCreateSchema.parse(raw);
    if (input.track.episodeId !== episodeId) {
      throw new BadRequestException({ code: "production_voice_commentary_invalid_source" });
    }
    if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.byteLength || file.size <= 0) {
      throw new BadRequestException({ code: "production_voice_commentary_file_required" });
    }
    if (file.size > PRODUCTION_VOICE_COMMENTARY_MAX_BYTES) {
      throw new PayloadTooLargeException({ code: "production_voice_commentary_too_large" });
    }
    const contentType = exactMime(file);
    await this.run(() => this.repository.authorizeCreate(actor, projectId, episodeId, input.track));
    const storage = this.requireStorage();
    await this.run(() => storage.verifyPrivatePurposeBuckets({}, ["derived"]));
    const bytes = Uint8Array.from(file.buffer);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const object = LocatedPrivateObjectReferenceSchema.parse(await this.run(() => storage.uploadImmutable({
      purpose: "derived",
      contentType,
      bytes,
      controlMetadata: {
        documentId: projectId,
        operationId: input.operationId,
        labels: { kind: "episode-voice-commentary", episodeId },
      },
    })));
    try {
      const { record, replayed } = await this.run(() => this.repository.create(actor, projectId, episodeId, input, {
        contentType, byteLength: file.size, sha256, object,
      }));
      return { view: await this.view(record), replayed };
    } catch (error) {
      const referenced = await this.repository.objectReferenced(object).catch(() => true);
      if (!referenced) await storage.deleteGeneratedObject({ object }).catch(() => undefined);
      throw error;
    }
  }

  list(actor: string, projectId: string, episodeId: string) {
    return this.run(async () => {
      await this.pruneExpired();
      const { items } = await this.repository.list(actor, projectId, episodeId);
      return { items: await Promise.all(items.map((record) => this.view(record))) };
    });
  }

  async signedRead(actor: string, projectId: string, episodeId: string, trackId: string) {
    const storage = this.requireStorage();
    return this.run(async () => {
      const first = await this.repository.read(actor, projectId, episodeId, trackId);
      const signed = PrivateSignedReadUrlSchema.parse(
        await storage.createSignedReadUrl({ object: first.record.object, expiresInSeconds: 300 }),
      );
      const current = await this.repository.read(actor, projectId, episodeId, trackId);
      if (current.record.sha256 !== first.record.sha256
        || JSON.stringify(current.record.object) !== JSON.stringify(first.record.object)) {
        throw new ConflictException({ code: "production_voice_commentary_changed_during_read" });
      }
      const view = await this.view(current.record);
      return { ...view, signedRead: signed as ProductionVoiceCommentarySignedRead };
    });
  }

  async delete(actor: string, projectId: string, episodeId: string, trackId: string, raw: ProductionVoiceCommentaryDelete) {
    const input = productionVoiceCommentaryDeleteSchema.parse(raw);
    const storage = this.requireStorage();
    return this.run(async () => {
      const result = await this.repository.delete(actor, projectId, episodeId, trackId, input);
      if (result.deleteObject) await storage.deleteGeneratedObject({ object: result.record.object });
      return { view: await this.view(result.record), replayed: result.replayed };
    });
  }

  async pruneExpired(): Promise<void> {
    if (!this.storage) return;
    const candidates = await this.repository.claimExpired(20).catch(() => []);
    for (const candidate of candidates) {
      if (candidate.deleteObject) await this.storage.deleteGeneratedObject({ object: candidate.object }).catch(() => undefined);
    }
  }
}
