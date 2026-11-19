import { describe, expect, it, vi } from "vitest";

import {
  assertStudioLinked3dPassProjectArchiveEvidence,
  collectStudioLinked3dPassProjectArchiveReferences,
  prepareStudioLinked3dPassProjectArchiveExport,
  restoreStudioLinked3dPassProjectArchiveImport,
} from "../studio-linked-3d-pass-project-archive";
import {
  computeStudioLinked3dPassRootHash,
  prepareStudioLinked3dLinePass,
  type StudioLinked3dPassCasAuthority,
} from "../studio-linked-3d-pass-transaction";
import {
  materializeStudioLinked3dLinePassLocator,
  parseStudioLinked3dRenderDocument,
  upsertStudioLinked3dRenderLink,
} from "../studio-linked-3d-render-document";
import { createStudioLinked3dRenderPageFixture } from "../studio-linked-3d-render-test-fixture";
import {
  buildStudioProjectArchive as buildStudioProjectArchiveWithBackend,
  importStudioProjectArchive,
} from "../studio-project-archive";
import { parseStudioProjectFile, type StudioProjectFile } from "../studio-project-file";
import { sha256HexPortable } from "../studio-sha256";
import { studioShared3dStageEntryAsDocument } from "../studio-shared-3d-stage-collection";
import { createDefaultStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { encodeStudioBg3dSceneGlbRgbaPng } from "../bg3d/studio-bg3d-scene-glb-exact-images";
import { hashStudioShared3dStageBackground } from "../studio-shared-3d-stage-document";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zcy8AAAAASUVORK5CYII=";

function buildStudioProjectArchive(
  input: Parameters<typeof buildStudioProjectArchiveWithBackend>[0],
  options: NonNullable<Parameters<typeof buildStudioProjectArchiveWithBackend>[1]> = {},
): ReturnType<typeof buildStudioProjectArchiveWithBackend> {
  return buildStudioProjectArchiveWithBackend(input, {
    crc32ExecutionMode: "direct-headless",
    ...options,
  });
}

function createAuthority() {
  const blobs = new Map<string, Uint8Array>();
  const owners = new Map<string, string[]>();
  const reads = { stat: 0, get: 0 };
  const authority: StudioLinked3dPassCasAuthority & {
    stat(hash: string): Promise<{
      readonly hash: string;
      readonly bytes: number;
      readonly mime: string;
    } | null>;
  } = {
    kind: "opfs",
    async put(bytes, options) {
      const hash = `sha256:${sha256HexPortable(bytes)}` as const;
      const copy = Uint8Array.from(bytes);
      blobs.set(hash, copy);
      const mime = options?.mime ?? "application/octet-stream";
      return {
        ref: { hash, bytes: copy.byteLength, mime },
        entry: {
          hash,
          path: `blobs/${hash.slice(7)}.bin`,
          bytes: copy.byteLength,
          storedBytes: copy.byteLength,
          codec: "identity",
          mime,
          createdAt: 1,
          lastAccessAt: 1,
        },
        deduped: false,
      };
    },
    async get(hash) {
      reads.get += 1;
      const bytes = blobs.get(hash);
      return bytes ? Uint8Array.from(bytes) : null;
    },
    async stat(hash) {
      reads.stat += 1;
      const bytes = blobs.get(hash);
      return bytes
        ? { hash, bytes: bytes.byteLength, mime: "image/png" }
        : null;
    },
    async ownerRefs(owner) {
      return [...(owners.get(owner) ?? [])] as `sha256:${string}`[];
    },
    async setOwnerRefs(owner, hashes) {
      const next = [...hashes].toSorted() as `sha256:${string}`[];
      owners.set(owner, next);
      return next;
    },
  };
  return { authority, blobs, owners, reads };
}

async function linkedPage(
  pageId: string,
  authority: StudioLinked3dPassCasAuthority,
) {
  const page = createStudioLinked3dRenderPageFixture(pageId);
  const current = page.linked3dRender!.links[0]!;
  const stage = studioShared3dStageEntryAsDocument(page.shared3dStage, current.bundleId);
  const sceneElement = page.elements.find((element) =>
    element.type === "image" && element.bg3dScene);
  const scene = sceneElement?.type === "image" ? sceneElement.bg3dScene : undefined;
  if (!stage || !scene?.activeShotId) throw new Error("linked archive fixture setup failed");
  const prepared = await prepareStudioLinked3dLinePass({
    authority,
    sourceHash: stage.background.sourceHash,
    scene,
    layers: [{ role: "main-line", pngDataUrl: PNG_DATA_URL, width: 1, height: 1 }],
  });
  const elements = materializeStudioLinked3dLinePassLocator(
    page.elements,
    current.bundleId,
    prepared.descriptor,
  );
  if (!elements) throw new Error("linked archive fixture locator setup failed");
  const linked3dRender = upsertStudioLinked3dRenderLink({
    value: page.linked3dRender,
    bundleId: current.bundleId,
    shotId: scene.activeShotId,
    passRevision: prepared.descriptor,
    elements,
    shared3dStage: page.shared3dStage!,
  });
  if (!linked3dRender) throw new Error("linked archive fixture receipt setup failed");
  return { ...page, elements, linked3dRender };
}

async function projectWithLinkedPages(
  authority: StudioLinked3dPassCasAuthority,
): Promise<StudioProjectFile> {
  const pagesList = await Promise.all([
    linkedPage("page-linked-a", authority),
    linkedPage("page-linked-b", authority),
  ]);
  return parseStudioProjectFile({
    version: 2,
    title: "Linked pass archive",
    description: "portable exact PNG",
    tagsText: "3d",
    pagesList,
    currentPageId: pagesList[0]!.id,
    webtoonTheme: "classic",
    panelGutter: 24,
  });
}

describe("Studio linked 3D pass project archive", () => {
  it("고밀도 배경의 실제 PNG를 원고 백업·연결 패스·패스 백업에서 같은 바이트로 보존한다", async () => {
    const edge = 1_320;
    const rgba = new Uint8Array(edge * edge * 4);
    let seed = 12345;
    for (let index = 0; index < rgba.length; index += 1) {
      seed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;
      rgba[index] = seed >>> 24;
    }
    const png = encodeStudioBg3dSceneGlbRgbaPng({
      width: edge, height: edge, rgba, maximumBytes: 8 * 1024 * 1024, signal: new AbortController().signal,
    });
    const src = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
    expect(src.length).toBeGreaterThan(8 * 1024 * 1024);
    const sha256 = sha256HexPortable(png);
    const { authority } = createAuthority();
    const project = await projectWithLinkedPages(authority);
    const image = { type: "image", id: "large-scene-image", x: 0, y: 0, width: edge, height: edge, src };
    const page = project.pagesList[0]!;
    const linked = parseStudioProjectFile({
      ...project, pagesList: [{ ...page, elements: [...page.elements, image] }],
    });
    const raster = parseStudioProjectFile({
      ...project, pagesList: [{ id: page.id, elements: [image], bg: "#fff", bgGrad: null, canvasH: edge }],
    });
    const scene = createDefaultStudioBg3dSceneDocument();
    const operations = await Promise.allSettled([
      buildStudioProjectArchive({ project: raster }).then(async built => {
        const restored = await importStudioProjectArchive(built.blob);
        const blob = restored.attachments.get(sha256)?.blob;
        expect(blob?.size).toBe(png.byteLength);
        expect(blob && sha256HexPortable(new Uint8Array(await blob.arrayBuffer()))).toBe(sha256);
      }),
      prepareStudioLinked3dLinePass({
        authority, sourceHash: hashStudioShared3dStageBackground(scene)!, scene,
        layers: [{ role: "main-line", pngDataUrl: src, width: edge, height: edge }],
      }).then(pass => expect(pass.descriptor.artifact.contentHash).toBe(`sha256:${sha256}`)),
      prepareStudioLinked3dPassProjectArchiveExport({ project: linked, authority })
        .then(attachments => expect(attachments).toHaveLength(1)),
    ]);
    for (const [index, operation] of operations.entries()) {
      const name = ["원고 보관과 복원", "연결 주선 준비", "연결 패스 보관"][index];
      expect.soft(operation.status === "fulfilled" ? "ok" : String(operation.reason), name).toBe("ok");
    }
  }, 30_000);

  it("deduplicates exact PNG bytes, covers only receipt-bound locators, and restores clean OPFS before apply", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.documentReferences).toHaveLength(2);
    expect(attachments[0]?.data).toBeInstanceOf(Blob);
    expect(attachments[0]?.data).toMatchObject({
      size: collectStudioLinked3dPassProjectArchiveReferences(project)[0]!.byteSize,
      type: "image/png",
    });

    const built = await buildStudioProjectArchive({ project, attachments });
    expect(built.isSelfContained).toBe(true);
    expect(built.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "EXTERNAL_PROJECT_DEPENDENCY",
    }));
    expect(built.manifest.attachments).toHaveLength(1);
    expect(assertStudioLinked3dPassProjectArchiveEvidence(
      built.canonicalProject,
      built.manifest.attachments,
    ).size).toBe(4);

    const imported = await importStudioProjectArchive(built.blob);
    expect(imported.isSelfContained).toBe(true);
    const target = createAuthority();
    let applied = false;
    const result = await restoreStudioLinked3dPassProjectArchiveImport({
      archive: imported,
      authority: target.authority,
      apply: (restoredProject) => {
        applied = true;
        expect(restoredProject.pagesList).toHaveLength(2);
        return "applied" as const;
      },
    });
    expect(result).toBe("applied");
    expect(applied).toBe(true);
    const contentHash = collectStudioLinked3dPassProjectArchiveReferences(project)[0]!.contentHash;
    expect(target.blobs.has(contentHash)).toBe(true);
    expect(target.owners.get("studio-linked-3d-pass:page-linked-a:page-linked-a-bundle"))
      .toContain(contentHash);
    expect(target.owners.get("studio-linked-3d-pass:page-linked-b:page-linked-b-bundle"))
      .toContain(contentHash);
  });

  it("rejects the aggregate attachment budget before stat or CAS payload materialization", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const receipt = collectStudioLinked3dPassProjectArchiveReferences(project)[0]!;
    source.reads.stat = 0;
    source.reads.get = 0;

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
      limits: { maxTotalAttachmentBytes: receipt.byteSize },
      consumedAttachmentBytes: 1,
    })).rejects.toMatchObject({ code: "attachment-limit" });
    expect(source.reads).toEqual({ stat: 0, get: 0 });
  });

  it("counts inline raster candidates before admitting linked CAS payload bytes", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const receipt = collectStudioLinked3dPassProjectArchiveReferences(project)[0]!;
    const projectWithInlineRaster = { ...project, description: PNG_DATA_URL };
    source.reads.stat = 0;
    source.reads.get = 0;

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project: projectWithInlineRaster,
      authority: source.authority,
      limits: { maxTotalAttachmentBytes: receipt.byteSize * 2 - 1 },
    })).rejects.toMatchObject({ code: "attachment-limit" });
    expect(source.reads).toEqual({ stat: 0, get: 0 });
  });

  it("preflights the OPFS stat receipt before the first CAS payload read", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    source.reads.stat = 0;
    source.reads.get = 0;
    const mismatchedAuthority = {
      ...source.authority,
      async stat(hash: string) {
        const entry = await source.authority.stat(hash);
        return entry ? { ...entry, bytes: entry.bytes + 1 } : null;
      },
    };

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: mismatchedAuthority,
    })).rejects.toMatchObject({ code: "attachment-mismatch" });
    expect(source.reads).toEqual({ stat: 1, get: 0 });
  });

  it("discards a stale export after stat and before reading CAS payload bytes", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    source.reads.stat = 0;
    source.reads.get = 0;
    let guardCalls = 0;

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
      isCurrent: () => {
        guardCalls += 1;
        return guardCalls === 1;
      },
    })).rejects.toMatchObject({ code: "stale" });
    expect(source.reads).toEqual({ stat: 1, get: 0 });
  });

  it("honors AbortSignal after stat and does not start a CAS payload read", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    source.reads.stat = 0;
    source.reads.get = 0;
    const controller = new AbortController();
    const abortingAuthority = {
      ...source.authority,
      async stat(hash: string) {
        const entry = await source.authority.stat(hash);
        controller.abort("archive route changed");
        return entry;
      },
    };

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: abortingAuthority,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "aborted" });
    expect(source.reads).toEqual({ stat: 1, get: 0 });
  });

  it("fails closed when a linked locator is not backed by an authenticated archive attachment", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    await expect(buildStudioProjectArchive({ project })).rejects.toMatchObject({
      code: "ATTACHMENT_MISSING",
    });
  });

  it("rejects an internally signed descriptor whose raster dimensions disagree with the PNG IHDR", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const page = project.pagesList[0]!;
    const document = parseStudioLinked3dRenderDocument(page.linked3dRender);
    if (!document) throw new Error("linked archive descriptor fixture is invalid");
    const link = document.links[0]!;
    const { passRootHash: _oldRoot, ...oldWithoutRoot } = link.passRevision;
    const withoutRoot = {
      ...oldWithoutRoot,
      artifact: { ...oldWithoutRoot.artifact, width: 2 },
    };
    const passRevision = {
      ...withoutRoot,
      passRootHash: computeStudioLinked3dPassRootHash(withoutRoot),
    };
    const forgedProject = parseStudioProjectFile({
      ...project,
      pagesList: project.pagesList.map((candidate) => candidate.id === page.id
        ? {
            ...candidate,
            linked3dRender: {
              ...document,
              links: document.links.map((candidateLink) => candidateLink.bundleId === link.bundleId
                ? { ...candidateLink, passRevision }
                : candidateLink),
            },
          }
        : candidate),
    });

    await expect(prepareStudioLinked3dPassProjectArchiveExport({
      project: forgedProject,
      authority: source.authority,
    })).rejects.toMatchObject({ code: "attachment-mismatch" });
  });

  it("rolls owner references back when the document application is rejected", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
    });
    const imported = await importStudioProjectArchive(
      (await buildStudioProjectArchive({ project, attachments })).blob,
    );
    const target = createAuthority();
    const owner = "studio-linked-3d-pass:page-linked-a:page-linked-a-bundle";
    target.owners.set(owner, ["sha256:previous"]);

    await expect(restoreStudioLinked3dPassProjectArchiveImport({
      archive: imported,
      authority: target.authority,
      apply: () => false,
    })).rejects.toMatchObject({ code: "commit-rejected" });
    expect(target.owners.get(owner)).toEqual(["sha256:previous"]);
  });

  it("restores owners sequentially in reverse order and surfaces any rollback failure", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
    });
    const imported = await importStudioProjectArchive(
      (await buildStudioProjectArchive({ project, attachments })).blob,
    );
    const target = createAuthority();
    const ownerA = "studio-linked-3d-pass:page-linked-a:page-linked-a-bundle";
    const ownerB = "studio-linked-3d-pass:page-linked-b:page-linked-b-bundle";
    target.owners.set(ownerA, ["sha256:previous-a"]);
    target.owners.set(ownerB, ["sha256:previous-b"]);
    const baseSetOwnerRefs = target.authority.setOwnerRefs.bind(target.authority);
    const order: string[] = [];
    const authority: StudioLinked3dPassCasAuthority = {
      ...target.authority,
      setOwnerRefs: vi.fn(async (owner, hashes) => {
        const rollback = hashes.length === 1
          && hashes[0] === (owner === ownerA ? "sha256:previous-a" : "sha256:previous-b");
        order.push(`${rollback ? "rollback" : "install"}:${owner}`);
        if (rollback && owner === ownerB) throw new Error("owner-b rollback failed");
        return baseSetOwnerRefs(owner, hashes);
      }),
    };

    await expect(restoreStudioLinked3dPassProjectArchiveImport({
      archive: imported,
      authority,
      apply: () => false,
    })).rejects.toThrow("owner 참조 일부를 되돌리지 못했습니다");
    expect(order).toEqual([
      `install:${ownerA}`,
      `install:${ownerB}`,
      `rollback:${ownerB}`,
      `rollback:${ownerA}`,
    ]);
    expect(target.owners.get(ownerA)).toEqual(["sha256:previous-a"]);
    expect(target.owners.get(ownerB)).not.toEqual(["sha256:previous-b"]);
  });

  it("rolls back an owner whose publication mutates before its acknowledgement fails", async () => {
    const source = createAuthority();
    const project = await projectWithLinkedPages(source.authority);
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({
      project,
      authority: source.authority,
    });
    const imported = await importStudioProjectArchive(
      (await buildStudioProjectArchive({ project, attachments })).blob,
    );
    const target = createAuthority();
    const owner = "studio-linked-3d-pass:page-linked-a:page-linked-a-bundle";
    const previous = ["sha256:previous-a"] as const;
    target.owners.set(owner, [...previous]);
    const baseSetOwnerRefs = target.authority.setOwnerRefs.bind(target.authority);
    let loseFirstPublicationAcknowledgement = true;
    const authority: StudioLinked3dPassCasAuthority = {
      ...target.authority,
      async setOwnerRefs(currentOwner, hashes) {
        const result = await baseSetOwnerRefs(currentOwner, hashes);
        if (currentOwner === owner && loseFirstPublicationAcknowledgement) {
          loseFirstPublicationAcknowledgement = false;
          throw new Error("owner publication acknowledgement lost");
        }
        return result;
      },
    };

    await expect(restoreStudioLinked3dPassProjectArchiveImport({
      archive: imported,
      authority,
      apply: () => true,
    })).rejects.toThrow("owner publication acknowledgement lost");
    expect(target.owners.get(owner)).toEqual(previous);
  });
});
