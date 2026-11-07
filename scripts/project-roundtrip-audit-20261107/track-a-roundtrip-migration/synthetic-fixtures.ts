import {
  studioPackageCrc32,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package";
import {
  createDefaultStudioSaveProfile,
  type StudioSaveProfile,
} from "../../../apps/web/src/domains/creator/save-first/studio-save-profile";
import { createStudioProjectDefinition } from "../../../apps/web/src/domains/creator/studio-project-definition";
import { sha256HexPortable } from "../../../apps/web/src/domains/creator/studio-sha256";

import type { StudioSubmission } from "../../../apps/web/src/domains/creator/save-first/studio-submission-store";
import type { StudioAutosavePayload } from "../../../apps/web/src/domains/creator/studio-autosave";
import type { StudioProjectDocumentEntry } from "../../../apps/web/src/domains/creator/studio-project-document-store";
import type { StudioProjectLibraryEntry } from "../../../apps/web/src/domains/creator/studio-project-library-store";

const TEXT_ENCODER = new TextEncoder();

function uint32BigEndian(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = TEXT_ENCODER.encode(type);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.byteLength);
  const crc = studioPackageCrc32(crcInput);
  const output = new Uint8Array(12 + data.byteLength);
  output.set(uint32BigEndian(data.byteLength), 0);
  output.set(typeBytes, 4);
  output.set(data, 8);
  output.set(uint32BigEndian(crc), 8 + data.byteLength);
  return output;
}

/** 외부 파일이나 실사용자 데이터를 전혀 쓰지 않고 결정론적 합성 PNG 바이트를 생성한다. */
export function createSyntheticPngBytes(seed = 1, width = 2, height = 2): Uint8Array {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  ihdr.set(uint32BigEndian(width), 0);
  ihdr.set(uint32BigEndian(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = Uint8Array.from([
    0x78,
    0x9c,
    0x63,
    0x60,
    seed & 0xff,
    0x02,
    0x00,
    0x00,
    0x05,
    0x00,
    0x01,
  ]);
  const iend = new Uint8Array(0);
  const parts = [
    signature,
    buildPngChunk("IHDR", ihdr),
    buildPngChunk("IDAT", idat),
    buildPngChunk("IEND", iend),
  ];
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function createSyntheticWavBytes(): Uint8Array {
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
  ]);
}

export function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${Buffer.from(binary, "binary").toString("base64")}`;
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function canonicalJsonDigest(value: unknown): string {
  return sha256HexPortable(TEXT_ENCODER.encode(JSON.stringify(value)));
}

export function createMemoryStorage(initialEntries: Readonly<Record<string, string>> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initialEntries));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

export function snapshotStorageState(storage: Storage): Readonly<Record<string, string>> {
  const entries: Array<readonly [string, string]> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) {
      const val = storage.getItem(key);
      if (val !== null) entries.push([key, val]);
    }
  }
  entries.sort(([left], [right]) => left.localeCompare(right, "en"));
  return Object.freeze(Object.fromEntries(entries));
}

export interface TrackASyntheticRoundtripFixture {
  readonly savedAt: string;
  readonly hangulNfcText: string;
  readonly hangulNfdText: string;
  readonly hangulJamoText: string;
  readonly emojiComplexText: string;
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly profile: StudioSaveProfile;
  readonly submissions: readonly StudioSubmission[];
  readonly primarySnapshot: StudioAutosavePayload;
  readonly archivedEmptyElementsSnapshot: StudioAutosavePayload;
  readonly rasterBytes: Uint8Array;
  readonly rasterSha256: string;
  readonly rasterDataUrl: string;
  readonly wavBytes: Uint8Array;
  readonly wavSha256: string;
  readonly sourceDigest: string;
}

/**
 * 트랙 A 검증용 합성 프로젝트 픽스처:
 * - 한글(완성형 NFC, 조합형 NFD, 호환 자모 ㄱ-ㅎㅏ-ㅣ)
 * - 복합 Emoji(ZWJ 가족 시퀀스 👨‍👩‍👧‍👦, 피부톤 수식어 👍🏽, 서로게이트 페어 🎨✨🦊)
 * - 중첩 씬/레이어/그룹 및 마스터·캐릭터 바이블·코멘트·AI 참조·레이어 콤프
 * - 빈값(빈 문자열, 빈 배열, null, 보관 문서의 빈 요소 페이지)
 */
export function createTrackASyntheticFixture(): TrackASyntheticRoundtripFixture {
  const savedAt = "2026-11-06T12:00:00.000Z";
  const hangulNfcText = "별빛 서고의 비밀 기록 1화 (가나다라마바사)";
  const hangulNfdText = "한글조합형테스트".normalize("NFD");
  const hangulJamoText = "ㅋㅋㅋ ㅎㅎㅎ ㅏㅑㅓㅕ";
  const emojiComplexText = "👨‍👩‍👧‍👦👍🏽🎨✨🦊🏳️‍🌈";

  const rasterBytes = createSyntheticPngBytes(77, 4, 4);
  const rasterSha256 = sha256HexPortable(rasterBytes);
  const rasterDataUrl = bytesToDataUrl("image/png", rasterBytes);

  const thumbBytes = createSyntheticPngBytes(33, 2, 2);
  const thumbDataUrl = bytesToDataUrl("image/png", thumbBytes);

  const wavBytes = createSyntheticWavBytes();
  const wavSha256 = sha256HexPortable(wavBytes);

  const project: StudioProjectLibraryEntry = {
    id: "proj-track-a-roundtrip",
    title: `${hangulNfcText} ${emojiComplexText}`,
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: "webtoon-episode",
    description: `NFD:${hangulNfdText} / 자모:${hangulJamoText} / 이모지:${emojiComplexText}`,
    primaryLocale: "ko-KR",
    createdAt: "2026-11-06T10:00:00.000Z",
    updatedAt: savedAt,
    lastOpenedAt: savedAt,
    lastOpenedDocumentId: "doc-main-1",
    thumbnailUrl: thumbDataUrl,
    definition: createStudioProjectDefinition({
      format: "vertical-webtoon",
      purpose: "serial",
      startPoint: "script",
      collaboration: "team",
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["webtoon", "storyboard", "design", "review"],
      deliveryProfileIds: ["webtoon-long-image", "episode-package"],
    }),
  };

  const documents: readonly StudioProjectDocumentEntry[] = [
    {
      id: "doc-main-1",
      projectId: project.id,
      title: `1화 원고 ${emojiComplexText}`,
      kind: "webtoon",
      status: "active",
      statusBeforeTrash: null,
      defaultWorkspace: "comic",
      allowedWorkspaces: ["comic", "draw", "image", "localization", "review"],
      width: 720,
      height: 2400,
      pageCount: 2,
      createdAt: "2026-11-06T10:05:00.000Z",
      updatedAt: savedAt,
      lastOpenedAt: savedAt,
    },
    {
      id: "doc-archived-empty-2",
      projectId: project.id,
      title: `2화 빈 레이어 보관본 (${hangulJamoText})`,
      kind: "illustration",
      status: "archived",
      statusBeforeTrash: null,
      defaultWorkspace: "draw",
      allowedWorkspaces: ["draw", "image", "review"],
      width: 1080,
      height: 1920,
      pageCount: 1,
      createdAt: "2026-11-06T10:10:00.000Z",
      updatedAt: savedAt,
      lastOpenedAt: "2026-11-06T10:15:00.000Z",
    },
  ];

  const baseProfile = createDefaultStudioSaveProfile(project.id, {
    now: savedAt,
    autoSave: true,
    createVersions: true,
  });
  const profile: StudioSaveProfile = {
    ...baseProfile,
    accessMode: "collaborators",
    distributionState: "submitted",
    revision: 11,
    lastManualSaveAt: savedAt,
    lastExportAt: "2026-11-06T11:40:00.000Z",
    lastSubmissionAt: "2026-11-06T11:50:00.000Z",
    updatedAt: savedAt,
  };

  const submissions: readonly StudioSubmission[] = [
    {
      id: "sub-track-a-1",
      projectId: project.id,
      platform: "naver-webtoon",
      presetId: "webtoon-long-image",
      presetVersion: "1",
      sourceRevision: 11,
      status: "published",
      packageName: "별빛서고-1화.toonstudio",
      externalUrl: null,
      notes: `제출 메모: ${hangulNfcText} ${emojiComplexText}`,
      createdAt: "2026-11-06T11:50:00.000Z",
      updatedAt: "2026-11-06T11:50:00.000Z",
    },
  ];

  const primarySnapshot = {
    version: 2,
    savedAt,
    title: `${hangulNfcText} ${emojiComplexText}`,
    description: `설명: ${hangulNfdText} / ${hangulJamoText}`,
    tagsText: `한글태그, ${hangulJamoText}, ${emojiComplexText}, 회귀검증`,
    currentPageId: "page-2",
    webtoonTheme: "vivid",
    panelGutter: 28,
    pagesList: [
      {
        id: "page-1",
        name: `표지 컷 ${emojiComplexText}`,
        note: `노트: ${hangulNfdText}`,
        bg: "#f8fafc",
        bgGrad: null,
        canvasW: 720,
        canvasH: 2400,
        groups: [
          {
            id: "grp-hero-1",
            name: `주인공 폴더 ${emojiComplexText}`,
            collapsed: false,
            hidden: false,
            locked: false,
          },
          {
            id: "grp-fx-2",
            name: `효과음 폴더 (${hangulJamoText})`,
            collapsed: true,
            hidden: false,
            locked: true,
          },
        ],
        elements: [
          {
            id: "frame-1",
            type: "frame",
            name: "첫 컷 테두리",
            x: 24,
            y: 36,
            w: 672,
            h: 820,
            stroke: "#0f172a",
            strokeWidth: 4,
            fill: "#ffffff",
            opacity: 1,
          },
          {
            id: "draw-hero-line-1",
            type: "draw",
            name: `선화 레이어 ${emojiComplexText}`,
            groupId: "grp-hero-1",
            brush: "pen",
            kind: "freehand",
            mode: "pen",
            stroke: "#1e293b",
            strokeWidth: 6,
            opacity: 1,
            points: [40, 60, 120, 140, 220, 180, 310, 260],
          },
          {
            id: "image-hero-raster-1",
            type: "image",
            name: `채색 래스터 (${hangulNfdText})`,
            groupId: "grp-hero-1",
            clipToBelow: true,
            x: 64,
            y: 120,
            w: 320,
            h: 320,
            src: rasterDataUrl,
            opacity: 1,
          },
          {
            id: "text-dialogue-1",
            type: "text",
            name: "대사 레이어",
            groupId: "grp-fx-2",
            x: 96,
            y: 480,
            w: 280,
            h: 80,
            text: `${hangulNfcText}\n${hangulJamoText} ${emojiComplexText}`,
            fontSize: 20,
            fill: "#0f172a",
            opacity: 1,
          },
          {
            id: "rect-sfx-badge-1",
            type: "rect",
            name: "효과 배경",
            groupId: "grp-fx-2",
            x: 420,
            y: 520,
            w: 160,
            h: 96,
            fill: "#38bdf8",
            stroke: "#0284c7",
            strokeWidth: 2,
            opacity: 0.9,
          },
        ],
      },
      {
        id: "page-2",
        name: "빈 요소 페이지 (메타데이터 전용)",
        note: "",
        bg: "#0f172a",
        bgGrad: null,
        canvasW: 720,
        canvasH: 2400,
        elements: [],
      },
    ],
    master: {
      elements: [
        {
          id: "master-watermark-1",
          type: "draw",
          brush: "pen",
          kind: "freehand",
          mode: "pen",
          stroke: "#64748b",
          strokeWidth: 2,
          opacity: 0.5,
          points: [12, 12, 48, 48],
        },
      ],
    },
    characterBible: {
      version: 1,
      characters: [
        {
          id: "char-hana-1",
          name: `하나 ${emojiComplexText}`,
          role: "수석 기록보관사",
          appearance: `남색 로브 (${hangulNfdText})`,
          costume: "서고 정복",
          colors: ["#1e293b", "#38bdf8"],
          voice: `차분한 어조 ${hangulJamoText}`,
          goal: "원고 무결성 수호",
          relationships: ["열쇠지기 루카와 협력"],
          props: ["회중시계", "봉인 열쇠"],
          lockedFields: ["appearance", "costume"],
        },
      ],
    },
    comments: {
      version: 1,
      threads: [
        {
          id: "comment-thread-1",
          anchor: { type: "page", pageId: "page-1" },
          author: { displayName: `편집자 ${emojiComplexText}` },
          body: `식자 확인 완료: ${hangulNfcText} / ${hangulJamoText}`,
          resolved: false,
          createdAt: savedAt,
          updatedAt: savedAt,
          replies: [
            {
              id: "comment-reply-1",
              author: { displayName: "작가" },
              body: `반영했습니다 ${emojiComplexText}`,
              createdAt: savedAt,
            },
          ],
        },
      ],
    },
    aiImageReferences: {
      version: 1,
      references: [
        {
          id: "ref-style-1",
          role: "style",
          asset: { assetId: "synthetic-asset-style-1" },
          label: `역광 스타일 ${emojiComplexText}`,
          guidance: `선 질감 유지 (${hangulNfdText})`,
        },
      ],
    },
  } as unknown as StudioAutosavePayload;

  const archivedEmptyElementsSnapshot = {
    version: 2,
    savedAt: "2026-11-06T10:15:00.000Z",
    title: `2화 빈 레이어 보관본 (${hangulJamoText})`,
    description: "",
    tagsText: "",
    currentPageId: "page-empty-1",
    webtoonTheme: "classic",
    panelGutter: 24,
    pagesList: [
      {
        id: "page-empty-1",
        bg: "#ffffff",
        bgGrad: null,
        canvasW: 1080,
        canvasH: 1920,
        elements: [],
      },
    ],
  } as unknown as StudioAutosavePayload;

  const bundle = {
    savedAt,
    hangulNfcText,
    hangulNfdText,
    hangulJamoText,
    emojiComplexText,
    project,
    documents,
    profile,
    submissions,
    primarySnapshot,
    archivedEmptyElementsSnapshot,
    rasterBytes,
    rasterSha256,
    rasterDataUrl,
    wavBytes,
    wavSha256,
  };
  const sourceDigest = canonicalJsonDigest({
    ...bundle,
    rasterBytes: [...rasterBytes],
    wavBytes: [...wavBytes],
  });
  return deepFreeze({
    ...bundle,
    sourceDigest,
  });
}
