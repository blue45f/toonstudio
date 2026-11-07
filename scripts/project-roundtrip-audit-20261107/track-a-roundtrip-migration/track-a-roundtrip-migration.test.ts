import {
  applyCommand,
  CommandBus,
  createEmptyScene,
  findNode,
  listNodeIds,
  projectDigest,
  sceneIRSchema,
  validateComicGraph,
  type JournalEntryIR,
  type JournalStore,
  type SceneIR,
  type SnapshotIR,
} from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  buildStudioProjectPackage,
  studioProjectPackageFileName,
  studioProjectPackageFileStem,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package";
import {
  importStudioProjectPackage,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package-import";
import {
  buildStudioProjectWorkspacePackageEntries,
  collectStudioProjectWorkspaceSnapshots,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-workspace-snapshots";
import {
  studioSaveProfileForProject,
} from "../../../apps/web/src/domains/creator/save-first/studio-save-profile";
import {
  studioSubmissionsForProject,
} from "../../../apps/web/src/domains/creator/save-first/studio-submission-store";
import {
  assertStudioAutosaveReaderSupported,
  parseStudioAutosave,
  readStudioAutosave,
  studioAutosaveHasContent,
  studioAutosaveKey,
  StudioAutosaveUnsupportedVersionError,
  writeStudioLifecycleAutosave,
  type StudioAutosavePayload,
} from "../../../apps/web/src/domains/creator/studio-autosave";
import {
  normalizeStudioCharacterBible,
} from "../../../apps/web/src/domains/creator/studio-character-bible";
import {
  createEmptyStudioVersionCoordinates,
} from "../../../apps/web/src/domains/creator/studio-foundation/studio-version-coordinates";
import {
  buildLayerTree,
  createLayerGroup,
  emptyGroupIds,
  isEffectivelyHidden,
  isEffectivelyLocked,
  itemBelowId,
} from "../../../apps/web/src/domains/creator/studio-layers";
import {
  browserStudioOpfsDigest,
} from "../../../apps/web/src/domains/creator/studio-opfs-asset-store";
import {
  buildStudioProjectArchive,
  importStudioProjectArchive,
  resolveStudioProjectArchiveAttachment,
} from "../../../apps/web/src/domains/creator/studio-project-archive";
import {
  createStudioProjectDocument,
  readStudioProjectDocuments,
  writeStudioProjectDocuments,
} from "../../../apps/web/src/domains/creator/studio-project-document-store";
import {
  parseStudioProjectFile,
} from "../../../apps/web/src/domains/creator/studio-project-file";
import {
  createStudioProject,
  trashStudioProject,
  updateStudioProjectThumbnailUrl,
  writeStudioProjectLibrary,
} from "../../../apps/web/src/domains/creator/studio-project-library-store";
import { sha256HexPortable } from "../../../apps/web/src/domains/creator/studio-sha256";
import {
  buildStudioV12RecoveryPackage,
  importStudioV12RecoveryPackage,
  restoreStudioV12RecoveryPackage,
} from "../../../apps/web/src/domains/creator/studio-v12-recovery-package";
import {
  migrateStudioProjectSnapshotV2ToArchiveV3,
  projectStudioArchiveV3ToV2Snapshot,
  serializeStudioProjectArchiveV3,
  validateStudioProjectArchiveV3,
} from "../../../apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3";
import {
  readStudioZipArchive,
} from "../../../apps/web/src/domains/creator/studio-zip-reader";

import {
  bytesToDataUrl,
  canonicalJsonDigest,
  createMemoryStorage,
  createSyntheticPngBytes,
  createTrackASyntheticFixture,
} from "./synthetic-fixtures";

import type { StudioProjectSnapshot } from "../../../apps/web/src/domains/creator/studio-project-snapshot";

function createMemoryJournalStore(): JournalStore {
  const entries: JournalEntryIR[] = [];
  const snapshots: SnapshotIR[] = [];
  return {
    async append(entry) {
      entries.push(entry);
    },
    async readEntries() {
      return [...entries];
    },
    async writeSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
    async readSnapshots() {
      return [...snapshots];
    },
  };
}

describe("Track A: 합성 프로젝트 한글/emoji/중첩 scene·layer/빈값/중복id 왕복 및 마이그레이션 입력 경계값 감사", () => {
  it("A-1. 한글(NFC/NFD/호환자모) 및 복합 Emoji(ZWJ·피부톤·서로게이트)가 .toonstudio 패키지·ZIP UTF-8 플래그·캔버스 스냅샷을 무손실 왕복하고 원본 불변성을 유지한다", async () => {
    const fixture = createTrackASyntheticFixture();
    const sourceDigestBefore = fixture.sourceDigest;

    // 1. 파일명 stem 정규화(NFKC) 및 제어문자 치환 검증
    const stem = studioProjectPackageFileStem(`  ${fixture.hangulNfcText} / : * ? ${fixture.emojiComplexText}  `);
    expect(stem).toContain("별빛 서고의 비밀 기록 1화");
    expect(stem).not.toMatch(/[\\/:*?"<>|]/u);
    expect(studioProjectPackageFileName(fixture.project.title).endsWith(".toonstudio")).toBe(true);

    // 2. 원본 스토리지에 합성 프로젝트·문서·자동저장 시딩 후 스냅샷 수집 및 패키지 빌드
    const sourceStorage = createMemoryStorage();
    writeStudioProjectLibrary(sourceStorage, {
      schemaVersion: 1,
      projects: [fixture.project],
      updatedAt: fixture.savedAt,
    });
    writeStudioProjectDocuments(sourceStorage, {
      schemaVersion: 1,
      projectId: fixture.project.id,
      documents: fixture.documents,
      updatedAt: fixture.savedAt,
    });
    const mainKey = studioAutosaveKey({ userId: null, workId: "doc-main-1" });
    const archivedKey = studioAutosaveKey({ userId: null, workId: "doc-archived-empty-2" });
    writeStudioLifecycleAutosave(sourceStorage, mainKey, fixture.primarySnapshot, {
      preservePrimary: false,
    });
    writeStudioLifecycleAutosave(sourceStorage, archivedKey, fixture.archivedEmptyElementsSnapshot, {
      preservePrimary: false,
    });

    const collected = await collectStudioProjectWorkspaceSnapshots({
      storage: sourceStorage,
      projectId: fixture.project.id,
      documents: fixture.documents,
      lastOpenedDocumentId: fixture.project.lastOpenedDocumentId,
    });
    expect(collected).toHaveLength(2);

    const additionalEntries = buildStudioProjectWorkspacePackageEntries(
      fixture.documents,
      collected,
    );
    const built = buildStudioProjectPackage({
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      exportedAt: fixture.savedAt,
      additionalEntries,
    });

    // 3. ZIP 로컬/센트럴 헤더의 UTF-8 General Purpose Bit 11 (0x0800) 설정 검증
    const zipBytes = new Uint8Array(await built.blob.arrayBuffer());
    const localFlags = zipBytes[6]! | (zipBytes[7]! << 8);
    expect((localFlags & 0x0800) !== 0).toBe(true);
    const parsedZip = await readStudioZipArchive(built.blob);
    expect(parsedZip.entries.length).toBe(built.manifest.entryNames.length);

    // 4. 새 스토리지로 import 후 한글(NFC/NFD/자모)·Emoji·메타데이터·제출기록·보관 문서 상태 왕복 검증
    const targetStorage = createMemoryStorage();
    let docCounter = 0;
    const imported = await importStudioProjectPackage(
      new File([built.blob], built.fileName, { type: built.blob.type }),
      {
        storage: targetStorage,
        now: "2026-11-06T12:30:00.000Z",
        createProjectId: () => "track-a-imported",
        createDocumentId: () => `doc-${++docCounter}`,
      },
    );

    expect(imported.project.id).toBe("import-track-a-imported");
    expect(imported.project.title).toBe(fixture.project.title);
    expect(imported.project.description).toBe(fixture.project.description);
    expect(imported.project.description).toContain(fixture.hangulNfdText);
    expect(imported.project.description).toContain(fixture.hangulJamoText);
    expect(imported.project.description).toContain(fixture.emojiComplexText);
    expect(imported.project.thumbnailUrl).toBe(fixture.project.thumbnailUrl);
    expect(imported.project.definition).toEqual(fixture.project.definition);
    expect(imported.restoredSnapshotCount).toBe(2);
    expect(imported.restoredSubmissionCount).toBe(1);

    const importedDocs = readStudioProjectDocuments(targetStorage, imported.project.id).documents;
    expect(importedDocs).toHaveLength(2);
    const importedMainDoc = importedDocs.find((doc) => doc.id === "import-document-doc-1")!;
    const importedArchivedDoc = importedDocs.find((doc) => doc.id === "import-document-doc-2")!;
    expect(importedMainDoc.title).toBe(fixture.documents[0]!.title);
    expect(importedArchivedDoc.status).toBe("archived");
    expect(importedArchivedDoc.title).toContain(fixture.hangulJamoText);

    const restoredMainAutosave = readStudioAutosave(
      targetStorage,
      studioAutosaveKey({ userId: null, workId: importedMainDoc.id }),
    );
    expect(restoredMainAutosave).not.toBeNull();
    expect(restoredMainAutosave!.payload.title).toBe(fixture.primarySnapshot.title);
    expect(restoredMainAutosave!.payload.description).toBe(fixture.primarySnapshot.description);
    expect(restoredMainAutosave!.payload.tagsText).toBe(fixture.primarySnapshot.tagsText);
    expect(restoredMainAutosave!.payload.currentPageId).toBe("page-2");

    const page1 = restoredMainAutosave!.payload.pagesList[0] as Record<string, unknown>;
    expect(page1.name).toBe(`표지 컷 ${fixture.emojiComplexText}`);
    expect(page1.note).toBe(`노트: ${fixture.hangulNfdText}`);
    const page1Elements = page1.elements as Array<Record<string, unknown>>;
    expect(page1Elements.map((el) => el.id)).toEqual([
      "frame-1",
      "draw-hero-line-1",
      "image-hero-raster-1",
      "text-dialogue-1",
      "rect-sfx-badge-1",
    ]);
    expect(page1Elements[3]?.text).toBe(
      `${fixture.hangulNfcText}\n${fixture.hangulJamoText} ${fixture.emojiComplexText}`,
    );

    const restoredProfile = studioSaveProfileForProject(targetStorage, imported.project.id);
    expect(restoredProfile.accessMode).toBe("collaborators");
    expect(restoredProfile.distributionState).toBe("submitted");
    expect(restoredProfile.revision).toBe(11);

    const restoredSubmissions = studioSubmissionsForProject(targetStorage, imported.project.id);
    expect(restoredSubmissions).toHaveLength(1);
    expect(restoredSubmissions[0]?.notes).toBe(fixture.submissions[0]!.notes);

    // 5. 원본 픽스처 불변성 확인
    const sourceDigestAfter = canonicalJsonDigest({
      savedAt: fixture.savedAt,
      hangulNfcText: fixture.hangulNfcText,
      hangulNfdText: fixture.hangulNfdText,
      hangulJamoText: fixture.hangulJamoText,
      emojiComplexText: fixture.emojiComplexText,
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      primarySnapshot: fixture.primarySnapshot,
      archivedEmptyElementsSnapshot: fixture.archivedEmptyElementsSnapshot,
      rasterBytes: [...fixture.rasterBytes],
      rasterSha256: fixture.rasterSha256,
      rasterDataUrl: fixture.rasterDataUrl,
      wavBytes: [...fixture.wavBytes],
      wavSha256: fixture.wavSha256,
    });
    expect(sourceDigestAfter).toBe(sourceDigestBefore);
  });

  it("A-2. .toonproject.zip 아카이브에서 한글/Emoji·중첩 페이지·래스터 PNG 및 WAV 오디오 첨부 참조가 무손실 왕복한다", async () => {
    const fixture = createTrackASyntheticFixture();
    const projectWithAudio = {
      ...fixture.primarySnapshot,
      pagesList: fixture.primarySnapshot.pagesList.map((page, index) =>
        index === 0
          ? {
              ...page,
              elements: [
                ...(page.elements ?? []),
                {
                  id: "audio-cue-track-a",
                  type: "custom",
                  audio: "pending-audio-uri",
                },
              ],
            }
          : page
      ),
    };

    const builtArchive = await buildStudioProjectArchive(
      {
        project: projectWithAudio,
        attachments: [
          {
            kind: "audio",
            data: new Blob([Uint8Array.from(fixture.wavBytes)], { type: "audio/wav" }),
            mimeType: "audio/wav",
            documentReferences: [{ pointer: "/pagesList/0/elements/5/audio", usage: "audio" }],
          },
        ],
      },
      { crc32ExecutionMode: "direct-bounded" },
    );

    expect(builtArchive.manifest.attachments).toHaveLength(2);

    const importedRehydrated = await importStudioProjectArchive(builtArchive.blob, {
      rehydrateDataUrls: true,
    });
    const importedRefOnly = await importStudioProjectArchive(builtArchive.blob, {
      rehydrateDataUrls: false,
    });

    const rehydratedPage1 = importedRehydrated.project.pagesList[0] as Record<string, unknown>;
    const rehydratedElements = rehydratedPage1.elements as Array<Record<string, unknown>>;
    const rasterEl = rehydratedElements.find((el) => el.id === "image-hero-raster-1")!;
    expect(rasterEl.src).toBe(fixture.rasterDataUrl);
    const dialogueEl = rehydratedElements.find((el) => el.id === "text-dialogue-1")!;
    expect(dialogueEl.text).toBe(
      `${fixture.hangulNfcText}\n${fixture.hangulJamoText} ${fixture.emojiComplexText}`,
    );

    // page-2의 빈 요소 배열(elements: [])도 손실 없이 보존됨
    expect(importedRehydrated.project.pagesList[1]?.elements).toEqual([]);

    // 참조 전용 모드(rehydrateDataUrls: false)에서 content-addressed URI 및 바이트 해시 일치 확인
    const refPage1Elements = (importedRefOnly.project.pagesList[0]?.elements ?? []) as Array<
      Record<string, unknown>
    >;
    const rasterUri = String(refPage1Elements.find((el) => el.id === "image-hero-raster-1")?.src ?? "");
    const audioUri = String(refPage1Elements.find((el) => el.id === "audio-cue-track-a")?.audio ?? "");
    expect(rasterUri).toBe(`toonstudio-asset://sha256/${fixture.rasterSha256}`);
    expect(audioUri).toBe(`toonstudio-asset://sha256/${fixture.wavSha256}`);

    const resolvedRaster = resolveStudioProjectArchiveAttachment(
      importedRefOnly.attachments,
      rasterUri,
    );
    const resolvedAudio = resolveStudioProjectArchiveAttachment(
      importedRefOnly.attachments,
      audioUri,
    );
    expect(resolvedRaster).not.toBeNull();
    expect(resolvedAudio).not.toBeNull();
    expect(
      sha256HexPortable(new Uint8Array(await resolvedRaster!.blob.arrayBuffer())),
    ).toBe(fixture.rasterSha256);
    expect(
      sha256HexPortable(new Uint8Array(await resolvedAudio!.blob.arrayBuffer())),
    ).toBe(fixture.wavSha256);
  });

  it("A-3. 중첩 SceneIR(3단계 재귀 group·clip·blend·한글/Emoji 텍스트) 및 StudioLayers 연속 그룹 트리가 무손실 왕복한다", async () => {
    const fixture = createTrackASyntheticFixture();

    // 1. 3단계 재귀 group 구조를 가진 SceneIR 구성 및 스키마·탐색·커맨드 저널 복원 검증
    const nestedScene: SceneIR = {
      version: 11,
      width: 720,
      height: 2400,
      background: { r: 0.97, g: 0.98, b: 0.99, a: 1 },
      nodes: [
        {
          id: "grp-root-panel",
          kind: "group",
          opacity: 0.95,
          blend: "src-over",
          clip: {
            verbs: [
              { v: "M", x: 0, y: 0 },
              { v: "L", x: 720, y: 0 },
              { v: "L", x: 720, y: 800 },
              { v: "L", x: 0, y: 800 },
              { v: "Z" },
            ],
          },
          children: [
            {
              id: "grp-character-rig",
              kind: "group",
              opacity: 1,
              blend: "multiply",
              clip: null,
              children: [
                {
                  id: "grp-face-detail",
                  kind: "group",
                  opacity: 0.9,
                  blend: "screen",
                  clip: null,
                  children: [
                    {
                      id: "stroke-eye-highlight",
                      kind: "stroke-path",
                      opacity: 1,
                      blend: "src-over",
                      path: {
                        verbs: [
                          { v: "M", x: 120, y: 160 },
                          { v: "L", x: 140, y: 175 },
                        ],
                      },
                      paint: { kind: "solid", color: { r: 1, g: 1, b: 1, a: 1 } },
                      strokeWidth: 3.5,
                      cap: "round",
                      join: "round",
                      miterLimit: 4,
                    },
                    {
                      id: "text-dialogue-nested",
                      kind: "text",
                      opacity: 1,
                      blend: "src-over",
                      x: 160,
                      y: 220,
                      text: `${fixture.hangulNfcText} ${fixture.emojiComplexText}`,
                      fontSizePx: 22,
                      color: { r: 0.06, g: 0.09, b: 0.16, a: 1 },
                      fontFamily: "Pretendard",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const parsedScene = sceneIRSchema.parse(nestedScene);
    expect(listNodeIds(parsedScene)).toEqual([
      "grp-root-panel",
      "grp-character-rig",
      "grp-face-detail",
      "stroke-eye-highlight",
      "text-dialogue-nested",
    ]);
    const foundText = findNode(parsedScene, "text-dialogue-nested");
    expect(foundText?.kind).toBe("text");
    if (foundText?.kind === "text") {
      expect(foundText.text).toBe(`${fixture.hangulNfcText} ${fixture.emojiComplexText}`);
    }

    // 2. V12 복구 패키지를 통한 재귀 SceneIR + 저널 + 바이너리 첨부 왕복 검증
    const sourceHistory = createMemoryJournalStore();
    const { bus } = await CommandBus.open(sourceHistory, {
      snapshotEvery: 2,
      now: (() => {
        let tick = 1_000;
        return () => (tick += 10);
      })(),
    });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 2400) });
    for (const rootNode of parsedScene.nodes) {
      await bus.dispatch({ type: "scene/add-node", node: rootNode });
    }

    const v12Built = await buildStudioV12RecoveryPackage(
      {
        project: {
          projectId: fixture.project.id,
          workspaceId: "draw",
          title: `${fixture.hangulNfdText} ${fixture.emojiComplexText}`,
        },
        history: sourceHistory,
        attachments: [
          {
            data: Uint8Array.from(fixture.rasterBytes),
            mimeType: "image/png",
            rights: { owner: `작가 ${fixture.emojiComplexText}`, licenseSpdx: "CC0-1.0" },
            metadata: { name: `래스터 ${fixture.hangulNfcText}`, kind: "raster", sourceFormat: "png" },
          },
        ],
        metadata: {
          title: `${fixture.hangulNfdText} ${fixture.emojiComplexText}`,
          description: `설명 ${fixture.hangulJamoText}`,
          tags: ["한글태그", fixture.emojiComplexText],
        },
      },
      {
        digest: browserStudioOpfsDigest(),
        crc32ExecutionMode: "direct-bounded",
      },
    );

    const v12Imported = await importStudioV12RecoveryPackage(v12Built.bytes, {
      digest: browserStudioOpfsDigest(),
      crc32ExecutionMode: "direct-bounded",
    });
    const targetHistory = createMemoryJournalStore();
    const storedAttachments = new Map<string, Uint8Array>();
    const v12Restored = await restoreStudioV12RecoveryPackage(v12Imported, {
      history: targetHistory,
      attachments: {
        async put(attachment) {
          storedAttachments.set(attachment.contentHash, attachment.bytes);
          return attachment.contentHash;
        },
      },
    });
    expect(v12Restored.recovery.issues).toEqual([]);
    expect(projectDigest(v12Restored.project)).toBe(projectDigest(v12Built.recoveredProject));
    expect(listNodeIds(v12Restored.project.scene)).toEqual([
      "grp-root-panel",
      "grp-character-rig",
      "grp-face-detail",
      "stroke-eye-highlight",
      "text-dialogue-nested",
    ]);
    // V12 normalizedText는 NFD 제목을 NFC로 정규화한다
    expect(v12Imported.manifest.project.title).toBe(
      `${fixture.hangulNfdText.normalize("NFC")} ${fixture.emojiComplexText}`,
    );
    expect(storedAttachments.size).toBe(1);
    const restoredAttachmentBytes = [...storedAttachments.values()][0]!;
    expect(sha256HexPortable(restoredAttachmentBytes)).toBe(fixture.rasterSha256);

    // 3. StudioLayers 연속 그룹 블록(buildLayerTree) 및 클리핑 마스크(itemBelowId) 검증
    const groups = [
      createLayerGroup("grp-hero-1", `주인공 ${fixture.emojiComplexText}`),
      { ...createLayerGroup("grp-fx-2", `효과음 ${fixture.hangulJamoText}`), hidden: true, locked: true },
      createLayerGroup("grp-unused-3", "비어있는 그룹"),
    ];
    const itemsZOrder = [
      { id: "frame-1", type: "frame" },
      { id: "draw-hero-line-1", type: "draw", groupId: "grp-hero-1" },
      { id: "image-hero-raster-1", type: "image", groupId: "grp-hero-1" },
      { id: "text-dialogue-1", type: "text", groupId: "grp-fx-2" },
    ];
    const tree = buildLayerTree([...itemsZOrder].reverse(), groups);
    expect(tree.map((node) => (node.kind === "group" ? `group:${node.group.id}:${node.items.length}` : `item:${node.item.id}`))).toEqual([
      "group:grp-fx-2:1",
      "group:grp-hero-1:2",
      "item:frame-1",
    ]);
    expect(emptyGroupIds(itemsZOrder, groups)).toEqual(["grp-unused-3"]);
    expect(isEffectivelyHidden(itemsZOrder[3]!, groups)).toBe(true);
    expect(isEffectivelyLocked(itemsZOrder[3]!, groups)).toBe(true);
    expect(
      itemBelowId(
        itemsZOrder.map((item) => item.id),
        "image-hero-raster-1",
      ),
    ).toBe("draw-hero-line-1");
  });

  it("A-4. 빈값(0페이지 거부, 빈 요소 배열, 빈 마스터, 공백 전용 제목 거부, null 썸네일)과 중복 ID 방어 불변식을 검증한다", async () => {
    const fixture = createTrackASyntheticFixture();

    // 1. 0페이지(pagesList: []) 거부
    expect(
      parseStudioAutosave(
        JSON.stringify({
          version: 2,
          savedAt: fixture.savedAt,
          pagesList: [],
        }),
      ),
    ).toBeNull();
    expect(() =>
      parseStudioProjectFile({
        version: 2,
        savedAt: fixture.savedAt,
        pagesList: [],
      }),
    ).toThrow();

    // 2. 공백 전용 프로젝트/문서 제목 거부
    const storage = createMemoryStorage();
    expect(() =>
      createStudioProject(storage, {
        title: "   \t\n  ",
        kind: "webtoon",
      }),
    ).toThrow(/title is required/iu);

    const validProject = createStudioProject(storage, {
      title: "정상 프로젝트",
      kind: "webtoon",
    });
    expect(() =>
      createStudioProjectDocument(storage, validProject.id, {
        title: "   ",
        kind: "webtoon",
      }),
    ).toThrow(/title is required/iu);

    // 3. 마스터 빈 배열(master: { elements: [] })과 thumbnailUrl: null 처리
    const emptyMasterAutosave = parseStudioAutosave(
      JSON.stringify({
        version: 2,
        savedAt: fixture.savedAt,
        title: "마스터 빈 배열 원고",
        pagesList: [{ id: "page-1", canvasH: 1200, elements: [] }],
        master: { elements: [] },
      }),
    );
    expect(emptyMasterAutosave).not.toBeNull();
    expect(emptyMasterAutosave!.version).toBe(2);

    // 4. V12 복구 패키지의 비디(bidi) 제어문자 및 단독 서로게이트 거부
    const history = createMemoryJournalStore();
    const { bus } = await CommandBus.open(history);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 1280) });
    await expect(
      buildStudioV12RecoveryPackage(
        {
          project: {
            projectId: "proj-bidi",
            workspaceId: "draw",
            title: "악성 방향 제어 \u202E 제목",
          },
          history,
        },
        { digest: browserStudioOpfsDigest(), crc32ExecutionMode: "direct-bounded" },
      ),
    ).rejects.toThrow();

    // 5. 중복 ID 방어: ComicGraphIR에서 중복 panel.id 거부
    const comicIssues = validateComicGraph({
      version: 1,
      pages: [
        {
          id: "comic-page-1",
          widthPx: 720,
          heightPx: 2400,
          panels: [
            {
              id: "dup-panel-1",
              readingOrder: 0,
              folderId: "folder-1",
              masksContent: true,
              shape: {
                verbs: [
                  { v: "M", x: 0, y: 0 },
                  { v: "L", x: 100, y: 0 },
                  { v: "L", x: 100, y: 100 },
                  { v: "Z" },
                ],
              },
            },
            {
              id: "dup-panel-1",
              readingOrder: 1,
              folderId: "folder-2",
              masksContent: true,
              shape: {
                verbs: [
                  { v: "M", x: 0, y: 120 },
                  { v: "L", x: 100, y: 120 },
                  { v: "L", x: 100, y: 220 },
                  { v: "Z" },
                ],
              },
            },
          ],
          balloons: [],
          tones: [],
          effectLines: [],
        },
      ],
      characters: [],
      exportProfiles: [],
    });
    expect(comicIssues.some((issue) => issue.message.includes("dup-panel-1"))).toBe(true);

    // 6. normalizeStudioCharacterBible에서 중복 character.id 첫 항목만 유지
    const dedupedBible = normalizeStudioCharacterBible({
      version: 1,
      characters: [
        {
          id: "dup-char-1",
          name: "첫 번째 하나",
          role: "주연",
          appearance: "A",
          costume: "B",
          colors: ["#000000"],
          voice: "C",
          goal: "D",
          relationships: [],
          props: [],
          lockedFields: [],
        },
        {
          id: "dup-char-1",
          name: "두 번째 중복 하나",
          role: "조연",
          appearance: "E",
          costume: "F",
          colors: [],
          voice: "G",
          goal: "H",
          relationships: [],
          props: [],
          lockedFields: [],
        },
      ],
    });
    expect(dedupedBible.characters).toHaveLength(1);
    expect(dedupedBible.characters[0]?.name).toBe("첫 번째 하나");
  });

  it("A-5. 마이그레이션 입력 경계값(v1->v2 승격, 미래 버전 거부, 캔버스 치수/페이지 수 한계, Archive V3 극단 zoom/pan)을 검증한다", () => {
    const fixture = createTrackASyntheticFixture();

    // 1. parseStudioAutosave: v1 -> v2 승격 및 미래 버전(v99) 거부
    const upgradedV1 = parseStudioAutosave(
      JSON.stringify({
        version: 1,
        savedAt: fixture.savedAt,
        title: "구버전 V1 원고",
        pagesList: [{ id: "page-1", canvasH: 1200, elements: [] }],
      }),
    );
    expect(upgradedV1?.version).toBe(2);
    expect(upgradedV1?.title).toBe("구버전 V1 원고");

    const futureRaw = JSON.stringify({
      version: 99,
      savedAt: fixture.savedAt,
      title: "미래 버전 V99",
      pagesList: [{ id: "page-1", canvasH: 1200, elements: [] }],
    });
    expect(parseStudioAutosave(futureRaw)).toBeNull();
    expect(() => assertStudioAutosaveReaderSupported(futureRaw)).toThrow(
      StudioAutosaveUnsupportedVersionError,
    );

    // 2. parseStudioProjectFile 치수 경계: canvasH 1..100,000 허용, 0 및 100,001 거부
    expect(
      parseStudioProjectFile({
        version: 2,
        savedAt: fixture.savedAt,
        pagesList: [{ id: "page-min", bg: "#ffffff", bgGrad: null, canvasH: 100, elements: [] }],
      }).pagesList[0]?.canvasH,
    ).toBe(100);
    expect(
      parseStudioProjectFile({
        version: 2,
        savedAt: fixture.savedAt,
        pagesList: [{ id: "page-max", bg: "#ffffff", bgGrad: null, canvasH: 100_000, elements: [] }],
      }).pagesList[0]?.canvasH,
    ).toBe(100_000);
    expect(() =>
      parseStudioProjectFile({
        version: 2,
        savedAt: fixture.savedAt,
        pagesList: [{ id: "page-zero", bg: "#ffffff", bgGrad: null, canvasH: 0, elements: [] }],
      }),
    ).toThrow();
    expect(() =>
      parseStudioProjectFile({
        version: 2,
        savedAt: fixture.savedAt,
        pagesList: [{ id: "page-too-tall", bg: "#ffffff", bgGrad: null, canvasH: 100_001, elements: [] }],
      }),
    ).toThrow();

    // 3. createStudioProjectDocument 치수(1..1,000,000) 및 pageCount(1..100,000) 경계
    const storage = createMemoryStorage();
    const proj = createStudioProject(storage, { title: "경계값 프로젝트", kind: "webtoon" });
    const minMaxDoc = createStudioProjectDocument(storage, proj.id, {
      title: "최대 치수 원고",
      kind: "webtoon",
      width: 1,
      height: 1_000_000,
      pageCount: 100_000,
    });
    expect(minMaxDoc.width).toBe(1);
    expect(minMaxDoc.height).toBe(1_000_000);
    expect(minMaxDoc.pageCount).toBe(100_000);

    expect(() =>
      createStudioProjectDocument(storage, proj.id, {
        title: "0폭 원고",
        kind: "webtoon",
        width: 0,
        height: 1000,
      }),
    ).toThrow(/positive integers/iu);
    expect(() =>
      createStudioProjectDocument(storage, proj.id, {
        title: "초과 높이 원고",
        kind: "webtoon",
        width: 1000,
        height: 1_000_001,
      }),
    ).toThrow(/positive integers/iu);
    expect(() =>
      createStudioProjectDocument(storage, proj.id, {
        title: "0페이지 원고",
        kind: "webtoon",
        pageCount: 0,
      }),
    ).toThrow(/page count is invalid/iu);
    expect(() =>
      createStudioProjectDocument(storage, proj.id, {
        title: "초과 페이지수 원고",
        kind: "webtoon",
        pageCount: 100_001,
      }),
    ).toThrow(/page count is invalid/iu);

    // 4. Archive V3 마이그레이션: 정상 V2 -> V3 -> V2 왕복 및 극단 zoom/pan(0, -1, NaN, Infinity) 거부 확인
    const v2Snapshot = {
      version: 2,
      savedAt: fixture.savedAt,
      title: fixture.primarySnapshot.title ?? "",
      description: fixture.primarySnapshot.description ?? "",
      tagsText: fixture.primarySnapshot.tagsText ?? "",
      linkedTitleId: null,
      linkedSeriesId: null,
      linkedChallengeId: null,
      pagesList: fixture.primarySnapshot.pagesList,
      master: fixture.primarySnapshot.master,
      characterBible: fixture.primarySnapshot.characterBible,
      writerRoom: undefined,
      aiProvenance: undefined,
      comments: fixture.primarySnapshot.comments,
      releaseSchedule: undefined,
      publicationAnalytics: undefined,
      referenceBoard: undefined,
      aiImageReferences: fixture.primarySnapshot.aiImageReferences,
      currentPageId: "page-2",
      webtoonTheme: "vivid",
      panelGutter: 28,
      publishPack: undefined,
    } as unknown as StudioProjectSnapshot;

    const migrated = migrateStudioProjectSnapshotV2ToArchiveV3({
      snapshot: v2Snapshot,
      archiveId: "archive-v3-track-a",
      workScope: "work:doc-main-1",
      createdAt: fixture.savedAt,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      zoom: 1.5,
      panX: -0,
      panY: 42,
    });
    expect(validateStudioProjectArchiveV3(migrated.archive)).toEqual([]);
    expect(serializeStudioProjectArchiveV3(migrated.archive)).toContain(fixture.emojiComplexText);
    const projectedBack = projectStudioArchiveV3ToV2Snapshot({
      archive: migrated.archive,
      workspace: migrated.workspace,
    });
    expect(projectedBack.title).toBe(v2Snapshot.title);
    expect(projectedBack.currentPageId).toBe("page-2");

    for (const invalidZoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        migrateStudioProjectSnapshotV2ToArchiveV3({
          snapshot: v2Snapshot,
          archiveId: "archive-v3-invalid-zoom",
          workScope: "work:doc-main-1",
          createdAt: fixture.savedAt,
          sourceCoordinates: createEmptyStudioVersionCoordinates(),
          zoom: invalidZoom,
        }),
      ).toThrow(/workspace state is invalid/iu);
    }
    for (const invalidPan of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        migrateStudioProjectSnapshotV2ToArchiveV3({
          snapshot: v2Snapshot,
          archiveId: "archive-v3-invalid-pan",
          workScope: "work:doc-main-1",
          createdAt: fixture.savedAt,
          sourceCoordinates: createEmptyStudioVersionCoordinates(),
          panX: invalidPan,
        }),
      ).toThrow(/workspace state is invalid/iu);
    }
  });

  it("A-6. [재현 증거] main(68018c7f)에서 발견된 트랙 A 경계·왕복 결함(GAP-A1 ~ GAP-A9)을 결정론적으로 재현한다", async () => {
    const fixture = createTrackASyntheticFixture();

    // [GAP-A1] 휴지통(status: "trashed", statusBeforeTrash: "archived") 프로젝트가 .toonstudio import 후 "active"로 초기화됨
    const trashedStore = createMemoryStorage();
    const createdProj = createStudioProject(trashedStore, {
      id: "proj-trashed-1",
      title: "휴지통 프로젝트",
      kind: "webtoon",
      createdAt: fixture.savedAt,
    });
    const trashedProj = trashStudioProject(trashedStore, createdProj.id, { at: fixture.savedAt });
    expect(trashedProj.status).toBe("trashed");
    const trashedPkg = buildStudioProjectPackage({
      project: trashedProj,
      documents: fixture.documents.map((d) => ({ ...d, projectId: trashedProj.id })),
      profile: fixture.profile,
      exportedAt: fixture.savedAt,
      additionalEntries: buildStudioProjectWorkspacePackageEntries(fixture.documents, [
        {
          documentId: "doc-main-1",
          key: "k1",
          authority: "memory-current",
          savedAt: fixture.savedAt,
          payload: fixture.primarySnapshot,
        },
      ]),
    });
    const importedTrashedTarget = createMemoryStorage();
    const importedTrashed = await importStudioProjectPackage(
      new File([trashedPkg.blob], trashedPkg.fileName, { type: trashedPkg.blob.type }),
      { storage: importedTrashedTarget, now: fixture.savedAt },
    );
    // 재현: 원본 프로젝트는 status === "trashed"이나 import 결과는 "active"로 풀림
    expect(trashedProj.status).toBe("trashed");
    expect(importedTrashed.project.status).toBe("active");

    // [GAP-A2] 10,000번째 문서(index 9999) 스냅샷 경로가 5자리(document-10000.autosave.json)로 생성되어 4자리 정규식과 불일치함
    const tenThousandDocs = Array.from({ length: 10_000 }, (_, idx) => ({
      ...fixture.documents[0]!,
      id: `doc-bulk-${idx + 1}`,
    }));
    const tenThousandEntries = buildStudioProjectWorkspacePackageEntries(tenThousandDocs, [
      {
        documentId: "doc-bulk-10000",
        key: "k-10000",
        authority: "memory-current",
        savedAt: fixture.savedAt,
        payload: fixture.primarySnapshot,
      },
    ]);
    const lastEntryName = Object.keys(tenThousandEntries).find((name) =>
      name.endsWith(".autosave.json"),
    );
    expect(lastEntryName).toBe("documents/document-10000.autosave.json");

    // [GAP-A3] 2페이지이나 모든 페이지가 elements: []이고 메타데이터 문자열이 비어 있는 원고는 writeStudioLifecycleAutosave 후 readStudioAutosave에서 null로 누락됨
    const twoEmptyPagesPayload = {
      version: 2,
      savedAt: fixture.savedAt,
      title: "",
      description: "",
      tagsText: "",
      currentPageId: "page-2",
      pagesList: [
        { id: "page-1", name: "1페이지 커스텀 이름", bg: "#0f172a", canvasH: 2400, elements: [] },
        { id: "page-2", name: "2페이지 커스텀 이름", bg: "#1e293b", canvasH: 2400, elements: [] },
      ],
    } as unknown as StudioAutosavePayload;
    expect(studioAutosaveHasContent(twoEmptyPagesPayload)).toBe(false);
    const gapA3Store = createMemoryStorage();
    const gapA3Key = studioAutosaveKey({ userId: null, workId: "doc-empty-pages" });
    writeStudioLifecycleAutosave(gapA3Store, gapA3Key, twoEmptyPagesPayload, {
      preservePrimary: false,
    });
    expect(readStudioAutosave(gapA3Store, gapA3Key)).toBeNull();

    // [GAP-A4] 2,048자를 초과하는 data:image/png;base64,... 프로젝트 썸네일이 updateStudioProjectThumbnailUrl에서 2,048자로 절단됨
    const largePngBytes = new Uint8Array(1_800);
    largePngBytes.set(createSyntheticPngBytes(1, 16, 16), 0);
    const longDataUrl = bytesToDataUrl("image/png", largePngBytes);
    expect(longDataUrl.length).toBeGreaterThan(2_048);
    const thumbStore = createMemoryStorage();
    const thumbProj = createStudioProject(thumbStore, { title: "썸네일 프로젝트", kind: "webtoon" });
    const updatedThumbProj = updateStudioProjectThumbnailUrl(thumbStore, thumbProj.id, longDataUrl);
    expect(updatedThumbProj.thumbnailUrl?.length).toBe(2_048);
    expect(updatedThumbProj.thumbnailUrl).not.toBe(longDataUrl);

    // [GAP-A5] Archive V3 승격 시 한글 page.id("1페이지")가 SAFE_ID에서 거부되고, 비표준 ISO savedAt("2026-11-06T12:00:00Z")이 소실됨
    const v2WithHangulPageId = {
      version: 2,
      savedAt: "2026-11-06T12:00:00Z",
      title: "한글 페이지 ID 테스트",
      description: "",
      tagsText: "",
      linkedTitleId: null,
      linkedSeriesId: null,
      linkedChallengeId: null,
      pagesList: [{ id: "1페이지", canvasH: 1200, elements: [] }],
      master: fixture.primarySnapshot.master,
      characterBible: fixture.primarySnapshot.characterBible,
      comments: fixture.primarySnapshot.comments,
      aiImageReferences: fixture.primarySnapshot.aiImageReferences,
      currentPageId: "1페이지",
      webtoonTheme: "classic",
      panelGutter: 24,
    } as unknown as StudioProjectSnapshot;
    expect(() =>
      migrateStudioProjectSnapshotV2ToArchiveV3({
        snapshot: v2WithHangulPageId,
        archiveId: "archive-hangul-page-id",
        workScope: "work:doc-1",
        createdAt: fixture.savedAt,
        sourceCoordinates: createEmptyStudioVersionCoordinates(),
      }),
    ).toThrow(/workspace state is invalid/iu);

    // [GAP-A6] parseStudioAutosave가 비정상 버전(0, -1, 1.5, NaN) 및 비정상 savedAt("not-a-date")을 거부하지 않고 version: 2로 수용함
    const parsedNegativeVersion = parseStudioAutosave(
      JSON.stringify({
        version: -1,
        savedAt: "not-a-valid-iso-date",
        pagesList: [{ id: "page-1", canvasH: 1200, elements: [] }],
      }),
    );
    expect(parsedNegativeVersion).not.toBeNull();
    expect(parsedNegativeVersion?.version).toBe(2);
    expect(parsedNegativeVersion?.savedAt).toBe("not-a-valid-iso-date");

    // [GAP-A7] 동일 한글 60음절 제목이 NFC(60 코드유닛)에서는 통과하나 NFD(180 코드유닛)에서는 120자 제한으로 거부됨
    const sixtySyllablesNfc = "한".repeat(60);
    const sixtySyllablesNfd = sixtySyllablesNfc.normalize("NFD");
    expect(sixtySyllablesNfc.length).toBe(60);
    expect(sixtySyllablesNfd.length).toBe(180);
    expect(() =>
      createStudioProject(createMemoryStorage(), {
        title: sixtySyllablesNfc,
        kind: "webtoon",
      }),
    ).not.toThrow();
    expect(() =>
      createStudioProject(createMemoryStorage(), {
        title: sixtySyllablesNfd,
        kind: "webtoon",
      }),
    ).toThrow(/too long/iu);

    // [GAP-A8] SceneIR의 scene/add-node가 중복 노드 ID 추가를 차단하지 않음
    let sceneState: SceneIR = createEmptyScene(720, 1280);
    sceneState = applyCommand(sceneState, {
      type: "scene/add-node",
      node: {
        id: "dup-node-1",
        kind: "text",
        opacity: 1,
        blend: "src-over",
        x: 0,
        y: 0,
        text: "첫 노드",
        fontSizePx: 16,
        color: { r: 0, g: 0, b: 0, a: 1 },
        fontFamily: "sans-serif",
      },
    });
    sceneState = applyCommand(sceneState, {
      type: "scene/add-node",
      node: {
        id: "dup-node-1",
        kind: "text",
        opacity: 1,
        blend: "src-over",
        x: 10,
        y: 10,
        text: "중복 ID 두 번째 노드",
        fontSizePx: 16,
        color: { r: 0, g: 0, b: 0, a: 1 },
        fontFamily: "sans-serif",
      },
    });
    expect(listNodeIds(sceneState)).toEqual(["dup-node-1", "dup-node-1"]);

    // [GAP-A9] { version: 1, pagesList: [...] }는 parseStudioAutosave에서 성공하나 parseStudioProjectFile에서는 실패함
    const v1WithPagesList = {
      version: 1,
      savedAt: fixture.savedAt,
      pagesList: [{ id: "page-1", canvasH: 1200, elements: [] }],
    };
    expect(parseStudioAutosave(JSON.stringify(v1WithPagesList))?.version).toBe(2);
    expect(() => parseStudioProjectFile(v1WithPagesList)).toThrow();
  });
});
