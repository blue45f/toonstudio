import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Image, decodePng, encodePng } from "image-js";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import { canonicalJson, DEFAULT_REVIEW_DELIVERY_PROFILE, type ReviewDeliveryJob } from "@toonstudio/studio-project-model";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioReviewCaptureSubject } from "./studio-review-capture-subject";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";
import type { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";

type ImageFile = { buffer: Buffer; size: number; mimetype: string };
interface Harness {
  pool: () => Pool;
  service: () => StudioReviewPreviewProducerService;
  graph: () => StudioProjectGraphRepository;
  storage: () => PrivateObjectStoragePort;
  readObject: (hash: string) => Buffer | undefined;
  addUser: (id: string) => void;
  capture: () => Promise<{ actor: string; input: StudioReviewPreviewCapture }>;
  completeCapture: (actor: string, intent: StudioReviewPreviewIntent, raster: (ordinal: number) => ImageFile) => Promise<{ subject: StudioReviewCaptureSubject }>;
}

const originalText = "내가 오늘까지 보내지 않을게.";
const revisedText = "네가 내일까지 보내 줄래?";
function documentWithEightCuts(revised: boolean) {
  return { width: 2, pagesList: Array.from({ length: 8 }, (_, index) => {
    const id = `cut-${index + 1}`, changed = revised && index === 3;
    return { id: `page-${index + 1}`, bg: "#ffffff", bgGrad: null, canvasH: 1, elements: [
      { id, type: "frame", x: 0, y: 0, width: 2, height: 1, bg: changed ? "#f00000" : "#102030" },
      { id: `line-${index + 1}`, type: "bubble", frameClipId: id, x: 0, y: 0, width: 1, height: 1, text: changed ? revisedText : originalText },
    ] };
  }) };
}
function samplePng(index: number, revised: boolean) {
  // 이 작은 검수 래스터에서는 컷 식별색과 배경 변경 픽셀을 따로 확인한다.
  const bytes = Buffer.from(encodePng(new Image(2, 1, { colorModel: "RGBA",
    data: Uint8Array.of(index, 0, 0, 255, ...(revised && index === 3 ? [240, 0, 0] : [16, 32, 48]), 255) })));
  return { buffer: bytes, size: bytes.length, mimetype: "image/png" };
}
const command = (job: ReviewDeliveryJob) => ({ operationId: randomUUID(), expectedVersion: job.version, manifestDigest: job.manifestDigest });

export function registerApprovedCutDeliveryCase(h: Harness) {
  it("승인 후 8컷 중 한 컷만 고쳐 재검수하고 구버전 인계를 막은 뒤 편집 담당자가 수정본을 수령한다", async () => {
    const { readApprovedCutChanges } = await import("./studio-approved-cut-comparison");
    const { StudioReviewDeliveryRepository } = await import("./review-delivery/review-delivery.repository");
    const { StudioReviewDeliveryService } = await import("./review-delivery/review-delivery.service");
    const { actor, input } = await h.capture(), pool = h.pool();
    const repo = new StudioReviewDeliveryRepository(pool);
    const fetchImage = (hash: string) => {
      const bytes = h.readObject(hash);
      if (!bytes) throw new Error("고정 검수 이미지를 읽을 수 없습니다.");
      return new Response(Uint8Array.from(bytes), { headers: { "content-type": "image/png" } });
    };
    const delivery = new StudioReviewDeliveryService(repo, h.storage(), async (url) => fetchImage(new URL(String(url)).pathname.slice(1)));
    async function member(role: "editor" | "viewer") {
      const id = randomUUID(); h.addUser(id);
      await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, `합성 ${role}`]);
      await pool.query('INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,\'active\',$4,now())',
        [input.workId, id, role, randomUUID()]);
      return id;
    }
    const editor = await member("editor"), viewer = await member("viewer");
    async function save(revised: boolean) {
      const doc = documentWithEightCuts(revised);
      const revision = revised ? 6 : 5;
      const saved = await pool.query('UPDATE creator_work SET revision=$2,doc=$3::jsonb WHERE id=$1 AND revision=$2::integer-1', [input.workId, revision, JSON.stringify(doc)]);
      expect(saved.rowCount).toBe(1);
    }
    async function captureSaved(revised: boolean) {
      const revision = revised ? 6 : 5;
      const doc = documentWithEightCuts(revised);
      const intent = await h.service().prepare(editor, { ...input, intentId: randomUUID(), sourceServerRevision: revision,
        sourceContentDigest: studioReviewPreviewDigest(doc), pageCount: 8 });
      return (await h.completeCapture(editor, intent, (index) => samplePng(index, revised))).subject;
    }
    const prepare = (subject: StudioReviewCaptureSubject, recipient: string, includeSource: boolean) => {
      const profile = includeSource ? { ...DEFAULT_REVIEW_DELIVERY_PROFILE, includeEditableSource: true as const } : DEFAULT_REVIEW_DELIVERY_PROFILE;
      const mode = "free" as const, statement = "팀 편집 담당자에게 이 합성 원고와 승인 이미지를 전달합니다.";
      return repo.prepare(actor, input.workId, { id: randomUUID(), operationId: randomUUID(), subject,
        title: "기차역의 약속 8컷", recipientUserId: recipient, profile,
        rights: { contract: "studio-review-delivery-rights-v1", statementVersion: 1, mode, statement, confirmed: true,
          rightsGraphDigest: studioReviewPreviewDigest({ subject, recipient, profile, mode, statement }) } });
    };
    await save(false);
    const original = await captureSaved(false);
    await h.graph().decideReview(actor, original.reviewId, { status: "approved" });
    const draft = await prepare(original, editor, true), ready = await prepare(original, editor, true);
    const issued = await repo.issue(actor, input.workId, ready.id, command(ready));
    await expect(prepare(original, viewer, true)).rejects.toMatchObject({ response: { code: "studio_review_delivery_editor_required" } });
    const imageOnly = await prepare(original, viewer, false);
    expect(imageOnly.manifest.editableSource).toBeUndefined();
    const legacy = await repo.list(actor, input.workId), capable = await repo.list(actor, input.workId, true);
    expect(legacy.items.map((job) => job.id)).toEqual([imageOnly.id]);
    expect(legacy.recipients.find((item) => item.userId === editor)).not.toHaveProperty("canReceiveSource");
    expect(capable.items.map((job) => job.id)).toContain(ready.id);
    expect(capable.recipients.find((item) => item.userId === editor)?.canReceiveSource).toBe(true);
    // 같은 승인본을 한 건은 먼저 수신하고, 다른 건은 마지막 고정 이미지 읽기 도중에 수정한다.
    const received = await delivery.download(editor, input.workId, issued.id, command(issued));
    expect(received.job).toMatchObject({ state: "delivered", subject: original, canAccept: true });
    const staged = await prepare(original, editor, true);
    const inFlight = await repo.issue(actor, input.workId, staged.id, command(staged));
    const fetched: string[] = [];
    const expectedPages = inFlight.manifest.pages.map((page) => page.sha256);
    const racingDelivery = new StudioReviewDeliveryService(repo, h.storage(), async (url) => {
      const hash = new URL(String(url)).pathname.slice(1);
      const image = fetchImage(hash);
      fetched.push(hash);
      if (hash === expectedPages.at(-1)) await save(true);
      return image;
    });
    const stale = { status: 409, response: { code: "studio_review_delivery_source_changed" } };
    await expect(racingDelivery.download(editor, input.workId, inFlight.id, command(inFlight))).rejects.toMatchObject(stale);
    expect(fetched).toEqual(expectedPages);
    await expect(repo.accept(editor, input.workId, issued.id, { ...command(received.job), confirmed: true })).rejects.toMatchObject(stale);
    const afterRace = (await repo.list(actor, input.workId, true)).items;
    expect(afterRace.find((job) => job.id === inFlight.id)).toMatchObject({ state: "issued", version: inFlight.version, deliveredAt: null, archiveSha256: null });
    expect(afterRace.find((job) => job.id === issued.id)).toMatchObject({ state: "delivered", version: received.job.version, acceptedAt: null });
    const events = await pool.query(`SELECT action FROM studio_review_delivery_event
      WHERE ("deliveryId"=$1 AND action='download') OR ("deliveryId"=$2 AND action='accept')`, [inFlight.id, issued.id]);
    expect(events.rowCount).toBe(0);
    const current = await captureSaved(true);
    await expect(prepare(original, editor, false)).rejects.toMatchObject(stale);
    await expect(repo.issue(actor, input.workId, draft.id, command(draft))).rejects.toMatchObject(stale);
    await expect(delivery.download(editor, input.workId, inFlight.id, command(inFlight))).rejects.toMatchObject(stale);
    const started = performance.now();
    const result = await readApprovedCutChanges(pool, editor, original, current);
    const detectionMs = performance.now() - started;
    expect(result.changes).toEqual([{ pageId: "page-4", frameId: "cut-4", beforeIndex: 3, afterIndex: 3,
      kinds: expect.arrayContaining(["dialogue", "image"]),
      dialogue: [{ elementId: "line-4", before: originalText, after: revisedText }] }]);
    await expect(prepare(current, editor, true)).rejects.toMatchObject({ response: { code: "studio_review_delivery_approval_required" } });
    await h.graph().decideReview(actor, current.reviewId, { status: "approved" });
    const next = await prepare(current, editor, true), sent = await repo.issue(actor, input.workId, next.id, command(next));
    const download = await delivery.download(editor, input.workId, next.id, command(sent));
    expect(download.job.recipient.userId).toBe(editor);
    const archiveDir = await mkdtemp(join(tmpdir(), "approved-cuts-"));
    try {
      const path = join(archiveDir, "delivery.zip");
      await writeFile(path, download.bytes);
      const entries = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).trim().split("\n");
      expect(entries).toHaveLength(11);
      const extract = (name: string) => execFileSync("unzip", ["-p", path, name]);
      expect(extract("source/manuscript.toonstudio-work.json").toString()).toBe(canonicalJson(documentWithEightCuts(true)));
      const manifest = JSON.parse(extract("manifest.json").toString());
      expect(manifest.source.rootGraphHash).toBe(studioReviewPreviewDigest(documentWithEightCuts(true)));
      expect(manifest.editableSource).toEqual({ path: "source/manuscript.toonstudio-work.json", sha256: manifest.source.rootGraphHash });
      for (const page of next.manifest.pages) {
        const pixels = decodePng(extract(page.path)).getRawImage().data;
        expect(pixels).toEqual(decodePng(samplePng(page.ordinal, true).buffer).getRawImage().data);
        expect(Buffer.from(pixels).equals(Buffer.from(decodePng(samplePng(page.ordinal, false).buffer).getRawImage().data))).toBe(page.ordinal !== 3);
      }
      const accepted = await repo.accept(editor, input.workId, sent.id, { ...command(download.job), confirmed: true });
      expect(accepted).toMatchObject({ state: "accepted", subject: current });
      if (process.env.STUDIO_APPROVED_CUT_EVIDENCE_DIR) {
        const target = process.env.STUDIO_APPROVED_CUT_EVIDENCE_DIR;
        await mkdir(target, { recursive: true });
        await Promise.all([
          writeFile(join(target, "delivery.zip"), download.bytes),
          writeFile(join(target, "before-cut-4.png"), samplePng(3, false).buffer),
          writeFile(join(target, "after-cut-4.png"), extract("pages/000004.png")),
          writeFile(join(target, "result.json"), JSON.stringify({ detectionMs, expectedChanged: 1, detected: result.changes.length,
            changed: result.changes, missed: 0, sourceHash: current.rootGraphHash, archiveSha256: accepted.archiveSha256,
            archiveBytes: download.bytes.length, recipientState: accepted.state, matchedPngs: 8, staleActionsBlocked: ["prepare", "issue", "download", "confirmDownload", "accept"] }, null, 2)),
        ]);
      }
    } finally { await rm(archiveDir, { recursive: true, force: true }); }
  }, 45_000);
}
