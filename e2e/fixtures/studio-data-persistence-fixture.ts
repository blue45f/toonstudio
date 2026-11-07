import { studioPackageCrc32 } from "../../apps/web/src/domains/creator/save-first/studio-project-package";
import { createDefaultStudioSaveProfile } from "../../apps/web/src/domains/creator/save-first/studio-save-profile";
import { createStudioProjectDefinition } from "../../apps/web/src/domains/creator/studio-project-definition";
import { sha256HexPortable } from "../../apps/web/src/domains/creator/studio-sha256";

import type { StudioSaveProfile } from "../../apps/web/src/domains/creator/save-first/studio-save-profile";
import type { StudioSubmission } from "../../apps/web/src/domains/creator/save-first/studio-submission-store";
import type { StudioAutosavePayload } from "../../apps/web/src/domains/creator/studio-autosave";
import type { StudioProjectDocumentEntry } from "../../apps/web/src/domains/creator/studio-project-document-store";
import type { StudioProjectLibraryEntry } from "../../apps/web/src/domains/creator/studio-project-library-store";

const TEXT_ENCODER = new TextEncoder();

function uint32BigEndian(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = TEXT_ENCODER.encode(type);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.byteLength);
  const crc = studioPackageCrc32(crcInput);
  const out = new Uint8Array(12 + data.byteLength);
  out.set(uint32BigEndian(data.byteLength), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(uint32BigEndian(crc), 8 + data.byteLength);
  return out;
}

/** 로컬 합성 PNG 바이트를 결정론적으로 생성한다 (외부 에셋/실사용자 파일 미사용). */
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
  const chunks = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", iend),
  ];
  const total = chunks.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${globalThis.btoa(binary)}`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("유효한 data URL 형식이 아닙니다.");
  const binary = globalThis.atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value instanceof Uint8Array) {
    return value;
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export interface StudioDataPersistenceFixture {
  readonly savedAt: string;
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly profile: StudioSaveProfile;
  readonly submissions: readonly StudioSubmission[];
  readonly primaryAutosave: StudioAutosavePayload;
  readonly secondaryAutosave: StudioAutosavePayload;
  readonly media: Readonly<{
    readonly primaryRasterBytes: readonly number[];
    readonly primaryRasterSha256: string;
    readonly primaryRasterDataUrl: string;
    readonly thumbnailBytes: readonly number[];
    readonly thumbnailSha256: string;
    readonly thumbnailDataUrl: string;
    readonly attachmentWavBytes: readonly number[];
    readonly attachmentWavSha256: string;
  }>;
  readonly expectedParity: StudioDocumentParitySummary;
  readonly sourceDigest: string;
}

export interface StudioDocumentParitySummary {
  readonly title: string;
  readonly description: string;
  readonly tagsText: string;
  readonly currentPageId: string;
  readonly webtoonTheme: string;
  readonly panelGutter: number;
  readonly pageOrder: readonly string[];
  readonly pageDimensions: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
  readonly layerOrderByPage: Readonly<Record<string, readonly string[]>>;
  readonly layerTypesByPage: Readonly<Record<string, readonly string[]>>;
  readonly masterElementIds: readonly string[];
  readonly characterIds: readonly string[];
  readonly commentIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly primaryRasterSha256: string;
}

export function summarizeAutosavePayloadParity(
  payload: StudioAutosavePayload,
): StudioDocumentParitySummary {
  const pages = payload.pagesList ?? [];
  const pageOrder = pages.map((page) => String(page.id));
  const pageDimensions: Record<string, { readonly width: number; readonly height: number }> = {};
  const layerOrderByPage: Record<string, readonly string[]> = {};
  const layerTypesByPage: Record<string, readonly string[]> = {};
  let primaryRasterSha256 = "";

  for (const page of pages) {
    const pageRecord = page as Record<string, unknown>;
    const pageId = String(pageRecord.id);
    pageDimensions[pageId] = Object.freeze({
      width: typeof pageRecord.canvasW === "number" ? pageRecord.canvasW : 720,
      height: typeof pageRecord.canvasH === "number" ? pageRecord.canvasH : 2400,
    });
    const elements = Array.isArray(pageRecord.elements) ? pageRecord.elements : [];
    layerOrderByPage[pageId] = Object.freeze(
      elements.map((element) => String((element as Record<string, unknown>).id)),
    );
    layerTypesByPage[pageId] = Object.freeze(
      elements.map((element) => String((element as Record<string, unknown>).type)),
    );
    for (const element of elements) {
      const rec = element as Record<string, unknown>;
      if (rec.id === "image-raster-1" && typeof rec.src === "string" && rec.src.startsWith("data:")) {
        primaryRasterSha256 = sha256HexPortable(dataUrlToBytes(rec.src));
      }
    }
  }

  const masterRecord = (payload.master ?? {}) as Record<string, unknown>;
  const masterElements = Array.isArray(masterRecord.elements) ? masterRecord.elements : [];
  const bibleRecord = (payload.characterBible ?? {}) as Record<string, unknown>;
  const characters = Array.isArray(bibleRecord.characters) ? bibleRecord.characters : [];
  const commentsRecord = (payload.comments ?? {}) as Record<string, unknown>;
  const threads = Array.isArray(commentsRecord.threads) ? commentsRecord.threads : [];
  const refsRecord = (payload.aiImageReferences ?? {}) as Record<string, unknown>;
  const references = Array.isArray(refsRecord.references) ? refsRecord.references : [];

  return Object.freeze({
    title: payload.title ?? "",
    description: payload.description ?? "",
    tagsText: payload.tagsText ?? "",
    currentPageId: payload.currentPageId ?? "",
    webtoonTheme: typeof payload.webtoonTheme === "string" ? payload.webtoonTheme : "classic",
    panelGutter: typeof payload.panelGutter === "number" ? payload.panelGutter : 24,
    pageOrder: Object.freeze(pageOrder),
    pageDimensions: Object.freeze(pageDimensions),
    layerOrderByPage: Object.freeze(layerOrderByPage),
    layerTypesByPage: Object.freeze(layerTypesByPage),
    masterElementIds: Object.freeze(
      masterElements.map((element) => String((element as Record<string, unknown>).id)),
    ),
    characterIds: Object.freeze(
      characters.map((character) => String((character as Record<string, unknown>).id)),
    ),
    commentIds: Object.freeze(
      threads.map((thread) => String((thread as Record<string, unknown>).id)),
    ),
    referenceIds: Object.freeze(
      references.map((ref) => String((ref as Record<string, unknown>).id)),
    ),
    primaryRasterSha256,
  });
}

export function computeCanonicalFixtureDigest(value: unknown): string {
  return sha256HexPortable(TEXT_ENCODER.encode(JSON.stringify(value)));
}

/**
 * 저장 -> 닫기/재열기 -> 내보내기 -> 가져오기 -> 복원 전 경로에서 공유하는
 * 합성(synthetic) 다중 페이지·다중 레이어 픽스처를 생성한다.
 */
export function createStudioDataPersistenceFixture(): StudioDataPersistenceFixture {
  const savedAt = "2026-09-20T09:30:00.000Z";
  const primaryPng = createSyntheticPngBytes(42, 4, 4);
  const primaryPngSha256 = sha256HexPortable(primaryPng);
  const primaryPngDataUrl = bytesToDataUrl("image/png", primaryPng);

  const thumbnailPng = createSyntheticPngBytes(99, 2, 2);
  const thumbnailSha256 = sha256HexPortable(thumbnailPng);
  const thumbnailDataUrl = bytesToDataUrl("image/png", thumbnailPng);

  const wavBytes = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
  ]);
  const wavSha256 = sha256HexPortable(wavBytes);

  const project: StudioProjectLibraryEntry = {
    id: "proj-synthetic-persistence-1",
    title: "별빛 기록보관소 에피소드",
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: "webtoon-episode",
    description: "실제 브라우저 저장소 왕복 무결성 검증용 합성 프로젝트",
    primaryLocale: "ko-KR",
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: savedAt,
    lastOpenedAt: savedAt,
    lastOpenedDocumentId: "doc-ep-1",
    thumbnailUrl: thumbnailDataUrl,
    definition: createStudioProjectDefinition({
      format: "vertical-webtoon",
      purpose: "serial",
      startPoint: "script",
      collaboration: "solo",
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["webtoon", "storyboard", "design", "review"],
      deliveryProfileIds: ["webtoon-long-image", "episode-package"],
    }),
  };

  const documents: readonly StudioProjectDocumentEntry[] = [
    {
      id: "doc-ep-1",
      projectId: project.id,
      title: "1화: 시간의 서고",
      kind: "webtoon",
      status: "active",
      statusBeforeTrash: null,
      defaultWorkspace: "comic",
      allowedWorkspaces: ["comic", "draw", "image", "localization", "review"],
      width: 720,
      height: 2400,
      pageCount: 2,
      createdAt: "2026-09-20T08:05:00.000Z",
      updatedAt: savedAt,
      lastOpenedAt: savedAt,
    },
    {
      id: "doc-ep-2",
      projectId: project.id,
      title: "2화: 보관소의 열쇠 (보관됨)",
      kind: "illustration",
      status: "archived",
      statusBeforeTrash: null,
      defaultWorkspace: "draw",
      allowedWorkspaces: ["draw", "image", "review"],
      width: 1080,
      height: 1920,
      pageCount: 1,
      createdAt: "2026-09-20T08:10:00.000Z",
      updatedAt: savedAt,
      lastOpenedAt: "2026-09-20T08:15:00.000Z",
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
    revision: 7,
    lastManualSaveAt: savedAt,
    lastExportAt: "2026-09-20T09:10:00.000Z",
    lastSubmissionAt: "2026-09-20T09:20:00.000Z",
    updatedAt: savedAt,
  };

  const submissions: readonly StudioSubmission[] = [
    {
      id: "sub-synthetic-1",
      projectId: project.id,
      platform: "naver-webtoon",
      presetId: "webtoon-long-image",
      presetVersion: "1",
      sourceRevision: 7,
      status: "published",
      packageName: "ep1.toonstudio",
      externalUrl: null,
      notes: "합성 제출 기록 보존 검증",
      createdAt: "2026-09-20T09:20:00.000Z",
      updatedAt: "2026-09-20T09:20:00.000Z",
    },
  ];

  const primaryAutosave = {
    version: 2,
    savedAt,
    title: "1화: 시간의 서고",
    description: "다중 페이지·다중 레이어 합성 원고",
    tagsText: "판타지, 기록보관소, 회귀검증",
    currentPageId: "page-2",
    webtoonTheme: "vivid",
    panelGutter: 32,
    pagesList: [
      {
        id: "page-1",
        bg: "#f8fafc",
        bgGrad: null,
        canvasW: 720,
        canvasH: 2400,
        elements: [
          {
            id: "frame-panel-1",
            type: "frame",
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
            id: "draw-stroke-1",
            type: "draw",
            brush: "pen",
            kind: "freehand",
            mode: "pen",
            stroke: "#1e293b",
            strokeWidth: 6,
            opacity: 1,
            points: [40, 60, 120, 140, 220, 180, 310, 260],
          },
          {
            id: "image-raster-1",
            type: "image",
            x: 64,
            y: 120,
            w: 320,
            h: 320,
            src: primaryPngDataUrl,
            opacity: 1,
          },
          {
            id: "text-dialogue-1",
            type: "text",
            x: 96,
            y: 480,
            w: 240,
            h: 80,
            text: "마지막 정상 원고는 언제나 지켜져야 해.",
            fontSize: 20,
            fill: "#0f172a",
            opacity: 1,
          },
          {
            id: "vector-badge-1",
            type: "rect",
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
        bg: "#0f172a",
        bgGrad: null,
        canvasW: 720,
        canvasH: 2400,
        elements: [
          {
            id: "frame-panel-2",
            type: "frame",
            x: 24,
            y: 48,
            w: 672,
            h: 960,
            stroke: "#e2e8f0",
            strokeWidth: 3,
            fill: "#1e293b",
            opacity: 1,
          },
          {
            id: "draw-stroke-2",
            type: "draw",
            brush: "marker",
            kind: "freehand",
            mode: "pen",
            stroke: "#fbbf24",
            strokeWidth: 10,
            opacity: 0.85,
            points: [80, 120, 180, 240, 300, 360],
          },
          {
            id: "text-narration-2",
            type: "text",
            x: 72,
            y: 680,
            w: 480,
            h: 96,
            text: "2페이지 레이어 순서와 크기도 그대로 복원된다.",
            fontSize: 22,
            fill: "#f8fafc",
            opacity: 1,
          },
        ],
      },
    ],
    master: {
      elements: [
        {
          id: "master-watermark-stroke",
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
          id: "char-archivist-hana",
          name: "하나",
          role: "기록보관사",
          appearance: "남색 로브와 은테 안경",
          costume: "보관소 정복",
          colors: ["#1e293b", "#38bdf8"],
          voice: "차분하고 정확한 어조",
          goal: "손상된 원고 사본을 복구한다",
          relationships: [],
          props: ["회중시계", "봉인 열쇠"],
          lockedFields: ["appearance"],
        },
      ],
    },
    comments: {
      version: 1,
      threads: [
        {
          id: "comment-thread-1",
          anchor: { type: "page", pageId: "page-1" },
          author: { displayName: "검수자" },
          body: "1페이지 식자 위치와 레이어 순서 확인 완료",
          resolved: false,
          createdAt: savedAt,
          updatedAt: savedAt,
          replies: [],
        },
      ],
    },
    aiImageReferences: {
      version: 1,
      references: [
        {
          id: "ref-lighting-1",
          role: "style",
          asset: { assetId: "synthetic-asset-lighting-1" },
          label: "서고 조명 참조",
          guidance: "역광 대비 유지",
        },
      ],
    },
  } as unknown as StudioAutosavePayload;

  const secondaryAutosave = {
    version: 2,
    savedAt: "2026-09-20T08:15:00.000Z",
    title: "2화: 보관소의 열쇠 (보관됨)",
    description: "보조 보관 원고",
    tagsText: "보관",
    currentPageId: "page-archived-1",
    webtoonTheme: "classic",
    panelGutter: 24,
    pagesList: [
      {
        id: "page-archived-1",
        bg: "#ffffff",
        bgGrad: null,
        canvasW: 1080,
        canvasH: 1920,
        elements: [
          {
            id: "archived-stroke-1",
            type: "draw",
            brush: "pen",
            kind: "freehand",
            mode: "pen",
            stroke: "#334155",
            strokeWidth: 4,
            opacity: 1,
            points: [10, 10, 100, 100],
          },
        ],
      },
    ],
  } as unknown as StudioAutosavePayload;

  const expectedParity = summarizeAutosavePayloadParity(primaryAutosave);
  const rawBundle = {
    savedAt,
    project,
    documents,
    profile,
    submissions,
    primaryAutosave,
    secondaryAutosave,
    media: {
      primaryRasterBytes: [...primaryPng],
      primaryRasterSha256: primaryPngSha256,
      primaryRasterDataUrl: primaryPngDataUrl,
      thumbnailBytes: [...thumbnailPng],
      thumbnailSha256,
      thumbnailDataUrl,
      attachmentWavBytes: [...wavBytes],
      attachmentWavSha256: wavSha256,
    },
    expectedParity,
  };
  const sourceDigest = computeCanonicalFixtureDigest(rawBundle);
  return deepFreeze({
    ...rawBundle,
    sourceDigest,
  });
}
