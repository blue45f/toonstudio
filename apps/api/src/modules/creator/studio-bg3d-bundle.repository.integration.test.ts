import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { Pool } from "pg";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN } from "@toonstudio/contracts/studio-work-asset-contract";
import { hashStudioBg3dSixPassBundleManifest, studioBg3dSixPassArtifactSourceUri, parseStudioBg3dSixPassBundleManifest, verifyStudioBg3dSixPassBundleReceipt, STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { bg3dBundleFixture, bg3dTestObject, bg3dBundleCrdtFixture } from "./studio-bg3d-bundle.test-fixture";
import type { DrizzleStudioBg3dBundleRepository } from "./studio-bg3d-bundle.repository";
import type { StudioBg3dBundleService } from "./studio-bg3d-bundle.service";
import type * as DatabaseRuntime from "../../platform/database";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";

const target = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !target) throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL for BG3D bundle persistence");
const localIntegration = target ? describe : describe.skip;
localIntegration("6패스 PostgreSQL 봉인·권한·quota", () => {
  let pool: Pool;
  let runtime: typeof DatabaseRuntime;
  let repository: DrizzleStudioBg3dBundleRepository;
  let service: StudioBg3dBundleService;
  let previousUrl: string | undefined;
  let policyBaseline: readonly unknown[] | null = null;
  const users: string[] = [];
  const works: string[] = [];
  const upload = vi.fn<PrivateObjectStoragePort["uploadImmutable"]>().mockImplementation(async (input) => bg3dTestObject(input.bytes, input.contentType === "application/json" ? "application/json" : "image/png"));
  beforeAll(async () => {
    if (!target || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(target).hostname)) throw new Error("이 검증은 명시적인 일회용 로컬 PostgreSQL만 사용합니다.");
    validatePostgresIntegrationUrl(target);
    previousUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = target;
    pool = new Pool({ connectionString: target, max: 3, application_name: "bg3d-bundle-local-proof" });
    const guards = await pool.query<{ tgname: string }>(`SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname=ANY($1::text[])
        AND tgrelid IN (to_regclass('public.studio_bg3d_bundle_revision'),to_regclass('public.studio_bg3d_bundle_artifact'))`, [["studio_bg3d_revision_guard", "studio_bg3d_artifact_guard"]]);
    expect(guards.rows.map(({ tgname }) => tgname).sort(), "실행 준비 단계에서 0121의 실제 불변 원본 trigger를 적용해야 합니다.")
      .toEqual(["studio_bg3d_artifact_guard", "studio_bg3d_revision_guard"]);
    policyBaseline = (await pool.query('SELECT * FROM membership_policy_override ORDER BY key')).rows;
    runtime = await import("../../platform/database");
    const { DrizzleStudioBg3dBundleRepository } = await import("./studio-bg3d-bundle.repository");
    const { StudioBg3dBundleService } = await import("./studio-bg3d-bundle.service");
    repository = new DrizzleStudioBg3dBundleRepository();
    service = new StudioBg3dBundleService(repository, { verifyPrivatePurposeBuckets: async () => ({ ready: true, privatePurposeBuckets: 3 }),
      uploadImmutable: upload, createSignedReadUrl: async () => ({ url: "https://private.example.test/source", expiresAtEpochMs: Date.now() + 119_000 }), deleteGeneratedObject: async () => { throw new Error("원본 삭제 미지원"); } });
    vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN);
  });
  afterEach(async () => {
    if (works.length) await pool.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works.splice(0)]);
    if (users.length) await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users.splice(0)]);
    upload.mockClear();
  });
  afterAll(async () => {
    try {
      if (policyBaseline !== null) expect((await pool.query('SELECT * FROM membership_policy_override ORDER BY key')).rows).toEqual(policyBaseline);
    } finally {
      vi.unstubAllEnvs(); await Promise.all([pool?.end(), runtime?.dbPool.end()]);
      if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    }
  });
  async function work() {
    const owner = randomUUID(), outsider = randomUUID(), id: string = randomUUID(); users.push(owner, outsider); works.push(id);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2),($3,$4)', [owner, "봉인 검증 소유자", outsider, "별도 계정"]);
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [id, owner, "6패스 검증"]);
    const f = bg3dBundleFixture(), key = { workId: id, bundleId: f.manifest.bundleId, renderRevisionId: f.manifest.renderRevisionId };
    return { ...f, owner, outsider, key, workId: id };
  }
  async function sealed(f: Awaited<ReturnType<typeof work>>) {
    await service.prepare(f.owner, f.key, f.manifest);
    for (const role of ["color", "tone", "shadow", "depth", "texture-line", "main-line", "scene"] as const) {
      const body = role === "scene" ? f.scene : f.png;
      await service.upload(f.owner, f.key, role, { buffer: body, size: body.byteLength, mimetype: role === "scene" ? "application/json" : "image/png" });
    }
    return service.seal(f.owner, f.key);
  }
  /** 서버의 metadata·저장 fence fixture이며 제품 reader·GPU 결과 검증은 별도다. */
  function nativeDocument(f: ReturnType<typeof bg3dBundleFixture>) {
    const manifestHash = hashStudioBg3dSixPassBundleManifest(f.manifest), main = f.manifest.layers.find(({ role }) => role === "main-line");
    if (!main) throw new Error("native 주선화가 없습니다.");
    const elements = f.manifest.layers.map((layer) => ({ id: layer.elementId, type: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0,
      blendMode: layer.blendMode, opacity: layer.opacity, hidden: !layer.visible, groupId: f.manifest.groupId, src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
      bg3dLtBundleId: f.manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated",
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: f.manifest.bundleId, renderRevisionId: f.manifest.renderRevisionId,
        manifestHash, role: layer.role, elementId: layer.elementId } }));
    const state = { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1, minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
      bundles: [{ bundleId: f.manifest.bundleId, activeRevisionId: f.manifest.renderRevisionId, revisions: [f.manifest] }] };
    const source = f.manifest.scene.contentHash;
    const passRevision = { revision: f.manifest.linePassRevision, sourceHash: source, sceneHash: source, cameraHash: f.manifest.cameraHash,
      baseGeometryHash: source, topologyHash: source, objectIdentityHash: source, objectStableIds: [], passRootHash: source,
      artifact: { pass: "line", role: "main-line", contentHash: main.artifact.contentHash, byteSize: main.artifact.byteSize,
        mime: "image/png", width: main.artifact.width, height: main.artifact.height, locator: `studio-opfs-cas:${main.artifact.contentHash}` } };
    const linked3dRender = { kind: "toonstudio.studio-linked-3d-render", version: 2, authority: "studio-project-linked-3d-pass-index",
      links: [{ bundleId: f.manifest.bundleId, shotId: "shot-one", sourceShotId: null, stageSourceHash: source,
        layers: f.manifest.layers.map(({ role, elementId }) => ({ role, elementId })), passRevision, corrections: [] }] };
    return { version: 5, pagesList: [{ id: f.manifest.pageId, bg: "#fff", bgGrad: null, canvasH: 1080,
      groups: [{ id: f.manifest.groupId, name: "6패스" }], elements, bg3dLtBundles: state, linked3dRender }] };
  }
  it("한 역할 누락은 봉인하지 않고 동일 prepare 재호출은 quota를 중복 예약하지 않는다", async () => {
    const f = await work();
    await service.prepare(f.owner, f.key, f.manifest); await service.prepare(f.owner, f.key, f.manifest);
    expect((await service.get(f.owner, f.key)).state).toBe("prepared");
    await expect(service.seal(f.owner, f.key)).rejects.toThrow(/모두 저장/);
    const usage = await pool.query<{ count: string; bytes: string }>('SELECT count(*),sum(bytes)::text AS bytes FROM membership_resource_usage_event WHERE "userId"=$1', [f.owner]);
    expect(usage.rows[0]?.count).toBe("1");
    expect(Number(usage.rows[0]?.bytes)).toBe(f.scene.byteLength + f.png.byteLength * 6);
    const ready = await service.capabilities(f.owner, f.workId); expect(ready.enabled).toBe(true);
  });
  it("실제 PNG 여섯 장과 scene 저장 후에만 작품 범위의 봉인 영수증을 발급한다", async () => {
    const f = await work(), result = await sealed(f);
    expect(result.uploadedRoles).toHaveLength(7);
    expect(() => verifyStudioBg3dSixPassBundleReceipt(result.receipt, f.manifest, f.workId)).not.toThrow();
    expect((await service.seal(f.owner, f.key)).manifestHash).toBe(result.manifestHash);
    expect(upload).toHaveBeenCalledTimes(7);
    await service.upload(f.owner, f.key, "color", { buffer: f.png, size: f.png.length, mimetype: "image/png" });
    expect(upload).toHaveBeenCalledTimes(7);
    expect((await service.download(f.owner, f.key, "color")).contentHash).toBe(f.manifest.layers[0].artifact.contentHash);
    await expect(service.assertReaderCapability(f.workId, [])).rejects.toThrow(/업데이트/);
    await expect(service.assertReaderCapability(f.workId, ["bg3d-sixpass-bundle.v1"])).resolves.toBeUndefined();
    const ref = { kind: "bg3d-sixpass-bundle" as const, bundleId: f.manifest.bundleId, renderRevisionId: f.manifest.renderRevisionId,
      manifestHash: result.manifestHash, role: "color" as const, elementId: "element-color" };
    await expect(service.verifySealedReferences(f.workId, [ref])).resolves.toBeUndefined();
    await expect(service.verifySealedReferences(f.workId, [{ ...ref, elementId: "other-element" }])).rejects.toThrow(/봉인된 원본/);
  });
  it("다른 계정·viewer는 업로드·봉인할 수 없고 현재 ACL 변경을 즉시 반영한다", async () => {
    const f = await work();
    await expect(service.prepare(f.outsider, f.key, f.manifest)).rejects.toThrow(/접근/);
    await service.prepare(f.owner, f.key, f.manifest);
    await pool.query('INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,$4,$5,now())', [f.workId, f.outsider, "editor", "active", randomUUID()]);
    await service.upload(f.outsider, f.key, "color", { buffer: f.png, size: f.png.length, mimetype: "image/png" });
    await pool.query('UPDATE creator_work_collaborator SET role=$1 WHERE "workId"=$2 AND "userId"=$3', ["viewer", f.workId, f.outsider]);
    expect((await service.get(f.outsider, f.key)).state).toBe("prepared");
    await expect(service.upload(f.outsider, f.key, "tone", { buffer: f.png, size: f.png.length, mimetype: "image/png" })).rejects.toThrow();
    await expect(service.seal(f.outsider, f.key)).rejects.toThrow();
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("같은 revision ID의 다른 원본·부모·그룹을 DB와 API 모두 거부한다", async () => {
    const f = await work(); await sealed(f);
    await expect(service.prepare(f.owner, f.key, { ...f.manifest, cameraHash: `sha256:${"0".repeat(64)}` })).rejects.toThrow(/바꿀 수 없습니다/);
    const next = bg3dBundleFixture("revision-two", f.manifest.renderRevisionId);
    const nextKey = { ...f.key, renderRevisionId: next.manifest.renderRevisionId };
    await expect(service.prepare(f.owner, nextKey, { ...next.manifest, groupId: "different-group" })).rejects.toThrow(/부모·레이어·그룹/);
    await service.prepare(f.owner, nextKey, next.manifest);
    await expect(pool.query('UPDATE studio_bg3d_bundle_revision SET "parentRevisionId"=NULL WHERE "workId"=$1 AND "renderRevisionId"=$2', [f.workId, next.manifest.renderRevisionId])).rejects.toThrow(/immutable/);
    await expect(pool.query('DELETE FROM studio_bg3d_bundle_artifact WHERE "workId"=$1', [f.workId])).rejects.toThrow(/retained/);
    const stale = parseStudioBg3dSixPassBundleManifest({ ...next.manifest, renderRevisionId: "stale-revision", parentRevisionId: null });
    await expect(service.prepare(f.owner, { ...f.key, renderRevisionId: stale.renderRevisionId }, stale)).rejects.toThrow(/부모 revision/);
  });
  it("테스트 계정의 일일 한도를 소진하면 전체 예약을 거부하고 공유 정책값을 바꾸지 않는다", async () => {
    const f = await work();
    const { resolveEffectiveResourcePolicy } = await import("../membership-operations/membership-resource-quota");
    const policy = await runtime.db.transaction((transaction) => resolveEffectiveResourcePolicy(transaction, f.owner));
    expect(policy.dailyUploadMaxBytes).toBeGreaterThan(0);
    await pool.query(`INSERT INTO membership_resource_usage_event (id,"userId",kind,"sourceKey",bytes,metadata)
      VALUES ($1,$2,'upload',$3,$4,'{"surface":"bg3d-native-quota-fixture"}'::jsonb)`,
      [randomUUID(), f.owner, `bg3d-quota-fixture:${randomUUID()}`, policy.dailyUploadMaxBytes]);
    await expect(service.prepare(f.owner, f.key, f.manifest)).rejects.toMatchObject({ response: { quota: "daily-upload" } });
    expect(await runtime.db.transaction((transaction) => resolveEffectiveResourcePolicy(transaction, f.owner))).toEqual(policy);
    expect((await pool.query('SELECT count(*)::text AS value FROM studio_bg3d_bundle_revision WHERE "workId"=$1', [f.workId])).rows[0]?.value).toBe("0");
    expect(upload).not.toHaveBeenCalled();
  });
  it("보존 묶음이 있는 작품의 실제 owner REST 저장은 구형 reader로 덮어쓸 수 없다", async () => {
    const f = await work(); await sealed(f);
    const { updateWork } = await import("../../server/creator/works");
    await expect(updateWork(f.owner, f.workId, { title: "구형 저장", baseRevision: 1 })).rejects.toThrow(/업데이트/);
    const before = await pool.query<{ title: string; revision: number }>('SELECT title,revision FROM creator_work WHERE id=$1', [f.workId]);
    expect(before.rows[0]).toEqual({ title: "6패스 검증", revision: 1 });
    await updateWork(f.owner, f.workId, { title: "현재 저장", baseRevision: 1, readerCapabilities: ["bg3d-sixpass-bundle.v1"] });
    const after = await pool.query<{ title: string; revision: number }>('SELECT title,revision FROM creator_work WHERE id=$1', [f.workId]);
    expect(after.rows[0]).toEqual({ title: "현재 저장", revision: 2 });
  });

  it("현재 reader도 REST 덮어쓰기·과거 복원으로 보존된 registry를 버릴 수 없다", async () => {
    const f = await work(); await sealed(f);
    const state = { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
      minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
      bundles: [{ bundleId: f.manifest.bundleId, activeRevisionId: null, revisions: [f.manifest] }] };
    const document = { version: 5, pagesList: [{ id: f.manifest.pageId, elements: [], bg3dLtBundles: state }] };
    const { eq } = await import("drizzle-orm"), { createCreatorWorkRevisionSnapshot } = await import("../../server/creator-work-revisions");
    const [baseline] = await runtime.db.select().from(runtime.creatorWorks).where(eq(runtime.creatorWorks.id, f.workId));
    if (!baseline) throw new Error("복원 검증 원고가 없습니다.");
    await pool.query('INSERT INTO creator_work_revision ("workId",revision,snapshot) VALUES ($1,1,$2::jsonb)', [f.workId, JSON.stringify(createCreatorWorkRevisionSnapshot(baseline))]);
    await pool.query('UPDATE creator_work SET doc=$2::jsonb WHERE id=$1', [f.workId, JSON.stringify(document)]);
    const { updateWork } = await import("../../server/creator/works");
    const { restoreWorkRevision } = await import("./work-revision-service");
    const { CreatorPublicationCollaborationRepository } = await import("./creator-publication-collaboration.repository");
    const { assertStudioBg3dBundleAuthorizedReader } = await import("./studio-bg3d-bundle.repository");
    const features = ["bg3d-sixpass-bundle.v1"];
    await expect(assertStudioBg3dBundleAuthorizedReader(f.owner, f.workId, [])).rejects.toThrow(/업데이트/);
    await expect(assertStudioBg3dBundleAuthorizedReader(f.owner, f.workId, features)).resolves.toEqual(features);
    const shared = new CreatorPublicationCollaborationRepository();
    await expect(shared.saveSharedDocument(f.owner, f.workId, 1, BigInt(0), { title: "보존 저장" }, undefined, features)).resolves.toMatchObject({ revision: 2 });
    await expect(updateWork(f.owner, f.workId, { doc: {}, baseRevision: 2, readerCapabilities: features })).rejects.toThrow(/보존/);
    await expect(restoreWorkRevision(f.owner, f.workId, 1, 2, features)).rejects.toThrow(/보존/);
    const current = await pool.query<{ revision: number; doc: unknown }>('SELECT revision,doc FROM creator_work WHERE id=$1', [f.workId]);
    expect(current.rows[0]?.revision).toBe(2); expect(current.rows[0]?.doc).toEqual(document);
  });

  it("첫 native Yjs commit 뒤 비어 있는 REST baseline으로도 게시 원본을 지울 수 없다", async () => {
    const f = await work(); await sealed(f);
    const { DrizzleStudioCrdtRepository } = await import("./studio-crdt.repository");
    const { hydrateStudioScopedCrdtDocument } = await import("./studio-scoped-crdt-authority");
    const { assertStudioCrdtBg3dBundleAdmission } = await import("./studio-crdt-bg3d-bundle");
    const { updateWork } = await import("../../server/creator/works");
    const { CreatorPublicationCollaborationRepository } = await import("./creator-publication-collaboration.repository");
    const candidate = bg3dBundleCrdtFixture(f.manifest), payload = Y.encodeStateAsUpdate(candidate), features = ["bg3d-sixpass-bundle.v1"];
    const stored = await new DrizzleStudioCrdtRepository().appendUpdate({ workId: f.workId, updateId: randomUUID(), actorUserId: f.owner, payload, createdAt: new Date() },
      async (current, transaction) => {
        const before = hydrateStudioScopedCrdtDocument(current);
        try { await assertStudioCrdtBg3dBundleAdmission(transaction, f.workId, before, candidate, features, candidate); }
        finally { before.destroy(); }
      });
    expect(stored.inserted).toBe(true); candidate.destroy();
    const baseline = await pool.query<{ revision: number; doc: unknown }>('SELECT revision,doc FROM creator_work WHERE id=$1', [f.workId]);
    expect(baseline.rows[0]).toEqual({ revision: 1, doc: {} });
    await expect(updateWork(f.owner, f.workId, { doc: {}, baseRevision: 1, readerCapabilities: features })).rejects.toThrow(/게시한 6패스/);
    await expect(new CreatorPublicationCollaborationRepository().saveSharedDocument(f.owner, f.workId, 1, stored.receipt.sequence,
      { doc: {} }, undefined, features)).rejects.toThrow(/게시한 6패스/);
    const preserved = await pool.query<{ revision: number; doc: unknown }>('SELECT revision,doc FROM creator_work WHERE id=$1', [f.workId]);
    expect(preserved.rows[0]).toEqual(baseline.rows[0]);
    const state = { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1, minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
      bundles: [{ bundleId: f.manifest.bundleId, activeRevisionId: f.manifest.renderRevisionId, revisions: [f.manifest] }] };
    await expect(updateWork(f.owner, f.workId, { doc: { metadata: { bg3dLtBundles: state }, pagesList: [] }, baseRevision: 1, readerCapabilities: features })).rejects.toThrow(/pagesList/);
    const document = { version: 5, pagesList: [{ id: f.manifest.pageId, bg3dLtBundles: state, elements: [] }] };
    await expect(updateWork(f.owner, f.workId, { doc: document, baseRevision: 1, readerCapabilities: features })).resolves.toMatchObject({ revision: 2 });
  });

  it("undo와 무관하게 sealed tip으로 진행하며 같은 부모의 두 번째 봉인을 DB도 거부한다", async () => {
    const f = await work(); await sealed(f);
    const second = bg3dBundleFixture("revision-two", f.manifest.renderRevisionId), sibling = bg3dBundleFixture("revision-sibling", f.manifest.renderRevisionId);
    const candidates = [second, sibling].map((entry) => ({ ...f, ...entry, key: { ...f.key, renderRevisionId: entry.manifest.renderRevisionId } }));
    for (const candidate of candidates) {
      await service.prepare(f.owner, candidate.key, candidate.manifest);
      for (const role of ["color", "tone", "shadow", "depth", "texture-line", "main-line", "scene"] as const) {
        const body = role === "scene" ? candidate.scene : candidate.png;
        await service.upload(f.owner, candidate.key, role, { buffer: body, size: body.byteLength, mimetype: role === "scene" ? "application/json" : "image/png" });
      }
    }
    await service.seal(f.owner, candidates[0].key);
    await expect(service.seal(f.owner, candidates[1].key)).rejects.toThrow(/부모/);
    await expect(pool.query(`UPDATE studio_bg3d_bundle_revision SET state='sealed',"sealedAt"=now() WHERE "workId"=$1 AND "renderRevisionId"=$2`,
      [f.workId, sibling.manifest.renderRevisionId])).rejects.toMatchObject({ code: "23505", constraint: "studio_bg3d_bundle_sealed_parent_unique" });
    const third = bg3dBundleFixture("revision-three", second.manifest.renderRevisionId);
    await expect(sealed({ ...f, ...third, key: { ...f.key, renderRevisionId: third.manifest.renderRevisionId } })).resolves.toMatchObject({ state: "sealed" });
    const counts = await pool.query<{ sealed: string; siblings: string }>(`SELECT count(*) FILTER (WHERE state='sealed')::text AS sealed,count(*) FILTER (WHERE state='sealed' AND "parentRevisionId"=$2)::text AS siblings FROM studio_bg3d_bundle_revision WHERE "workId"=$1`, [f.workId, f.manifest.renderRevisionId]);
    expect(counts.rows[0]).toEqual({ sealed: "3", siblings: "1" });
  });

  it("문서 미반영 봉인 이력을 권한 확인 후 복구해 다음 부모로 저장하고 prepared 형제는 제외한다", async () => {
    const f = await work(); await sealed(f);
    const orphan = bg3dBundleFixture("orphan-sealed", f.manifest.renderRevisionId);
    await sealed({ ...f, ...orphan, key: { ...f.key, renderRevisionId: orphan.manifest.renderRevisionId } });
    const pending = bg3dBundleFixture("prepared-after-orphan", orphan.manifest.renderRevisionId);
    await service.prepare(f.owner, { ...f.key, renderRevisionId: pending.manifest.renderRevisionId }, pending.manifest);
    const stale = bg3dBundleFixture("stale-before-recovery", f.manifest.renderRevisionId);
    await expect(service.prepare(f.owner, { ...f.key, renderRevisionId: stale.manifest.renderRevisionId }, stale.manifest)).rejects.toThrow(/부모 revision/);
    await expect(service.sealedChain(f.outsider, { workId: f.workId, bundleId: f.manifest.bundleId })).rejects.toThrow(/접근|권한/);
    const chain = await service.sealedChain(f.owner, { workId: f.workId, bundleId: f.manifest.bundleId });
    expect(chain.revisions.map(({ renderRevisionId }) => renderRevisionId)).toEqual([f.manifest.renderRevisionId, orphan.manifest.renderRevisionId]);
    expect(chain.sealedTipRevisionId).toBe(orphan.manifest.renderRevisionId);
    expect(JSON.stringify(chain)).not.toMatch(/providerId|objectPath|bucket|signedRead/);
    for (const role of ["color", "tone", "shadow", "depth", "texture-line", "main-line", "scene"] as const) {
      expect((await service.download(f.owner, { ...f.key, renderRevisionId: orphan.manifest.renderRevisionId }, role)).role).toBe(role);
    }
    const recovered = bg3dBundleFixture("after-recovery", chain.sealedTipRevisionId);
    await sealed({ ...f, ...recovered, key: { ...f.key, renderRevisionId: recovered.manifest.renderRevisionId } });
    const state = { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
      minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
      bundles: [{ bundleId: f.manifest.bundleId, activeRevisionId: recovered.manifest.renderRevisionId, revisions: [...chain.revisions, recovered.manifest] }] };
    const { updateWork } = await import("../../server/creator/works");
    const doc = { version: 5, pagesList: [{ id: f.manifest.pageId, elements: [], bg3dLtBundles: state }] };
    await expect(updateWork(f.owner, f.workId, { doc, baseRevision: 1, readerCapabilities: ["bg3d-sixpass-bundle.v1"] })).resolves.toMatchObject({ revision: 2 });
    const saved = await pool.query<{ doc: unknown }>('SELECT doc FROM creator_work WHERE id=$1', [f.workId]);
    expect(saved.rows[0]?.doc).toEqual(doc);
    expect((await service.sealedChain(f.owner, { workId: f.workId, bundleId: f.manifest.bundleId })).revisions).toHaveLength(3);
  });

  it("임시 작품은 native7 봉인만으로 첫 저장·승격하며 다른 작품·미봉인·구형 reader와 일반 미업로드 선화는 거부한다", async () => {
    const f = await work(); await sealed(f);
    const { CreatorDraftCollaborationRepository } = await import("./creator-draft-collaboration.repository");
    const { updateWork } = await import("../../server/creator/works");
    const draft = new CreatorDraftCollaborationRepository(), draftDocumentId = `draft_${randomUUID()}`, features = ["bg3d-sixpass-bundle.v1"];
    const room = await draft.provision({ ownerUserId: f.owner, ownerScopeKey: f.owner, draftDocumentId,
      intent: "cloud-save", clientMutationId: randomUUID(), initialSnapshotByteLength: 0 });
    works.push(room.provisionalWorkId);
    const doc = nativeDocument(f), key = { ...f.key, workId: room.provisionalWorkId };
    await expect(updateWork(f.owner, room.provisionalWorkId, { doc, baseRevision: 1, readerCapabilities: features })).rejects.toThrow();
    await service.prepare(f.owner, key, f.manifest);
    await expect(updateWork(f.owner, room.provisionalWorkId, { doc, baseRevision: 1, readerCapabilities: features })).rejects.toThrow(/봉인|원본/);
    await sealed({ ...f, key, workId: room.provisionalWorkId });
    await expect(updateWork(f.owner, room.provisionalWorkId, { doc, baseRevision: 1, readerCapabilities: features })).resolves.toMatchObject({ revision: 2 });
    const genericRows = await pool.query<{ value: string }>('SELECT count(*)::text AS value FROM creator_work_asset WHERE "workId"=$1', [room.provisionalWorkId]);
    expect(genericRows.rows[0]?.value).toBe("0");
    const promotion = { ownerUserId: f.owner, ownerScopeKey: f.owner, roomId: room.roomId, draftDocumentId,
      targetWorkId: room.provisionalWorkId, expectedGraphRevision: room.graphRevision, expectedWorkRevision: 2,
      finalStatus: "draft" as const, clientMutationId: randomUUID() };
    await expect(draft.promote(promotion)).rejects.toThrow(/업데이트/);
    expect((await pool.query<{ hidden: boolean }>('SELECT hidden FROM creator_work WHERE id=$1', [room.provisionalWorkId])).rows[0]?.hidden).toBe(true);
    await expect(draft.promote({ ...promotion, readerCapabilities: features })).resolves.toMatchObject({ status: "promoted" });
    const saved = await pool.query<{ hidden: boolean; doc: unknown }>('SELECT hidden,doc FROM creator_work WHERE id=$1', [room.provisionalWorkId]);
    expect(saved.rows[0]).toEqual({ hidden: false, doc });
    const main = doc.pagesList[0].elements.find(({ bg3dLtRole }) => bg3dLtRole === "main-line");
    if (!main) throw new Error("일반 선화 fixture가 없습니다.");
    const link = doc.pagesList[0].linked3dRender.links[0];
    const ordinary = { version: 3, pagesList: [{ id: f.manifest.pageId, elements: [{ id: main.id, type: "image", src: main.src }],
      linked3dRender: { ...doc.pagesList[0].linked3dRender, links: [{ ...link, layers: [{ elementId: main.id, role: "main-line" }] }] } }] };
    await expect(updateWork(f.owner, f.workId, { doc: ordinary, baseRevision: 1, readerCapabilities: features })).rejects.toThrow();
    expect((await pool.query<{ revision: number }>('SELECT revision FROM creator_work WHERE id=$1', [f.workId])).rows[0]?.revision).toBe(1);
  });

});
