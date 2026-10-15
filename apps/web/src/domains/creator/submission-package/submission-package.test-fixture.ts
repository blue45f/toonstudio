/**
 * 투고 패키지 시험용 도우미 — 실제 이미지를 만들지 않고 파일 머리 바이트(서명과 크기 필드)만 가진 합성 파일을 만든다.
 * 판독기는 머리만 읽으므로 이것으로 형식·크기 판독과 ZIP 조립 전체를 시험할 수 있다.
 */
import { toSubmissionPageFile } from "./submission-image-probe";
import type {
  SubmissionCharacterSheet,
  SubmissionEpisode,
  SubmissionImageMime,
  SubmissionPackageDraft,
  SubmissionPageFile,
} from "./submission-package-types";

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function withPadding(head: number[], totalBytes: number): Uint8Array {
  const length = Math.max(head.length, totalBytes);
  const bytes = new Uint8Array(length);
  bytes.set(head);
  return bytes;
}

export function pngBytes(width: number, height: number, totalBytes = 0): Uint8Array {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0];
  return withPadding(head, totalBytes);
}

/** `app1Bytes` 만큼의 큰 APP1(EXIF) 구간을 SOF 앞에 끼워 머리를 늘린다(4KB 안에 크기가 없는 JPEG). */
export function jpegBytes(width: number, height: number, options: { app1Bytes?: number; totalBytes?: number } = {}): Uint8Array {
  const head: number[] = [0xff, 0xd8, 0xff, 0xe0, ...u16be(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const app1 = options.app1Bytes ?? 0;
  if (app1 > 0) {
    head.push(0xff, 0xe1, ...u16be(app1 + 2));
    for (let index = 0; index < app1; index += 1) head.push(0);
  }
  head.push(0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  return withPadding(head, options.totalBytes ?? 0);
}

export function webpLossyBytes(width: number, height: number, totalBytes = 0): Uint8Array {
  const head = [
    0x52, 0x49, 0x46, 0x46, ...u32be(0).reverse(), 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, ...u32be(0).reverse(),
    0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height),
  ];
  return withPadding(head, totalBytes);
}

export function webpLosslessBytes(width: number, height: number, totalBytes = 0): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const bits = [w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f];
  const head = [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c, 0, 0, 0, 0,
    0x2f, ...bits,
  ];
  return withPadding(head, totalBytes);
}

export function webpExtendedBytes(width: number, height: number, totalBytes = 0): Uint8Array {
  const head = [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
    0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1),
  ];
  return withPadding(head, totalBytes);
}

export function gifBytes(): Uint8Array {
  return Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
}

export function imageFile(bytes: Uint8Array, name: string, type = ""): File {
  return new File([bytes as BlobPart], name, { type });
}

let counter = 0;

/** 실제 판독 경로(`toSubmissionPageFile`)를 거치는 페이지. */
export async function probedPage(bytes: Uint8Array, name: string, id?: string): Promise<SubmissionPageFile> {
  counter += 1;
  return toSubmissionPageFile(imageFile(bytes, name), { id: id ?? `probed-${counter}` });
}

/** 판독을 거치지 않고 메타데이터만 지정한 페이지(규칙 시험용). `size` 는 보고되는 용량이다. */
export function readyPage(options: {
  id: string;
  width?: number;
  height?: number;
  size?: number;
  mime?: SubmissionImageMime;
  name?: string;
}): SubmissionPageFile {
  const size = options.size ?? 1_000;
  return {
    id: options.id,
    name: options.name ?? `${options.id}.png`,
    size,
    blob: new Blob([new Uint8Array(Math.min(size, 64))]),
    mime: options.mime ?? "image/png",
    width: options.width ?? 690,
    height: options.height ?? 2_000,
    failure: null,
  };
}

export function failedPage(options: { id: string; failure: "unsupported" | "unreadable" | "empty"; name?: string }): SubmissionPageFile {
  return {
    id: options.id,
    name: options.name ?? `${options.id}.bin`,
    size: options.failure === "empty" ? 0 : 10,
    blob: new Blob([new Uint8Array(options.failure === "empty" ? 0 : 10)]),
    mime: null,
    width: null,
    height: null,
    failure: options.failure,
  };
}

export function episodeOf(number: number, pages: readonly SubmissionPageFile[], overrides: Partial<SubmissionEpisode> = {}): SubmissionEpisode {
  return { id: `ep-${number}`, number, title: `${number}화 제목`, note: "", pages, ...overrides };
}

export function sheetOf(id: string, overrides: Partial<SubmissionCharacterSheet> = {}): SubmissionCharacterSheet {
  return {
    id,
    name: `캐릭터 ${id}`,
    aliases: [],
    personality: "겁이 많지만 책임감으로 버틴다.",
    speechStyle: "",
    background: "",
    motivation: "",
    signatureLines: [],
    appearanceNotes: "",
    relations: [],
    ...overrides,
  };
}

/** 3화가 모두 690px 인 완성된 초안. 시험에서 한 군데씩만 고쳐 쓴다. */
export function completeDraft(overrides: Partial<SubmissionPackageDraft> = {}): SubmissionPackageDraft {
  return {
    title: "달빛 아래 편의점",
    authorName: "밤토끼",
    logline: "야간 편의점 알바생이 밤마다 찾아오는 손님들의 사연을 듣는다.",
    synopsis: "첫 손님은 길을 잃은 도깨비다.\n\n두 번째 손님은 시간을 파는 상인이다.",
    targetWidth: "naver",
    episodes: [1, 2, 3].map((number) =>
      episodeOf(number, [readyPage({ id: `p${number}-1`, size: 2_000 }), readyPage({ id: `p${number}-2`, size: 3_000 })]),
    ),
    characters: [sheetOf("c1")],
    ...overrides,
  };
}

/** 완성 초안에서 1~3화를 꺼낸다. 인덱스 접근에 단언을 쓰지 않으려는 도우미다. */
export function threeEpisodes(draft: SubmissionPackageDraft = completeDraft()): readonly [SubmissionEpisode, SubmissionEpisode, SubmissionEpisode] {
  const [first, second, third] = draft.episodes;
  if (!first || !second || !third) throw new Error("시험 초안에는 3화가 있어야 해요.");
  return [first, second, third];
}
