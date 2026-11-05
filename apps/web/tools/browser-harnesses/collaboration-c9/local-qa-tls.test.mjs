import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStudioReviewQaCertificates } from '../../../../../scripts/studio-review-local-storage-runtime.mjs';
import { prepareLocalQaTls } from './local-qa-tls.mjs';

const runner = process.env.VITEST ? await import('vitest') : await import('node:test');
const { test } = runner;
const before = runner.beforeAll ?? runner.before;
const after = runner.afterAll ?? runner.after;

let generated;
let infra;
let leaf;
let certificatePath;
before(async () => {
  generated = await createStudioReviewQaCertificates();
  await mkdir('/tmp/toon-collaboration-c9-real-qa', { recursive: true, mode: 0o700 });
  infra = await mkdtemp('/tmp/toon-collaboration-c9-real-qa/infra-tls-test-');
  certificatePath = join(infra, 'public.crt');
  await copyFile(join(generated, 'public.crt'), certificatePath);
  leaf = new X509Certificate(await readFile(certificatePath));
});
after(async () => {
  if (infra) await rm(infra, { recursive: true, force: true });
  if (generated) await rm(generated, { recursive: true, force: true });
});
function environment() {
  const pgData = join(infra, 'pgdata');
  return { config: { expectedPgData: pgData },
    actorsConfig: { cleanup: { pgData }, storage: { qaOnly: true, baseUrl: 'https://127.0.0.1:59963', certificatePath } },
    actualInput: { imageOrigin: 'https://127.0.0.1:59963' } };
}
function rejects(operation) { return assert.rejects(operation, { name: 'C9PreconditionError' }); }

test('실제 원고 입력 또는 certificatePath가 없으면 기존 시스템 신뢰와 Chromium 기본 인자를 유지한다', async () => {
  assert.deepEqual(await prepareLocalQaTls({ actorsConfig: {} }), { launchOptions: {}, evidence: { mode: 'system-trust' } });
  assert.deepEqual(await prepareLocalQaTls({ actorsConfig: { storage: { qaOnly: false } } }),
    { launchOptions: {}, evidence: { mode: 'system-trust' } });
  const actualWithoutCertificate = environment(); delete actualWithoutCertificate.actorsConfig.storage.certificatePath;
  assert.deepEqual(await prepareLocalQaTls(actualWithoutCertificate), { launchOptions: {}, evidence: { mode: 'system-trust' } });
  const synthetic = environment(); synthetic.actualInput = null;
  assert.deepEqual(await prepareLocalQaTls(synthetic), { launchOptions: {}, evidence: { mode: 'system-trust' } });
  // 합성 모드에서 사용하지 않는 공용 인증서 설정은 검증하거나 예외로 적용하지 않는다.
  synthetic.actorsConfig.storage = { qaOnly: false, baseUrl: 'unused', certificatePath: '/unused/private.key' };
  assert.deepEqual(await prepareLocalQaTls(synthetic), { launchOptions: {}, evidence: { mode: 'system-trust' } });
});

test('실제 QA leaf 하나의 정확한 SPKI만 허용하고 공개 인증서 hash만 보고한다', async () => {
  const prepared = await prepareLocalQaTls(environment());
  const expectedPin = createHash('sha256').update(leaf.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  assert.deepEqual(prepared.launchOptions, { args: [`--ignore-certificate-errors-spki-list=${expectedPin}`] });
  assert.deepEqual(prepared.evidence, { mode: 'qa-loopback-leaf-spki',
    certificateSha256: createHash('sha256').update(leaf.raw).digest('hex') });
  assert.equal(JSON.stringify(prepared.evidence).includes(certificatePath), false);
  assert.equal(JSON.stringify(prepared.evidence).includes('59963'), false);
  assert.equal(Object.hasOwn(prepared.launchOptions, 'ignoreHTTPSErrors'), false);
});

test('QA storage·실제 이미지 origin이 일치해야 하며 원격·HTTP 예외는 거절한다', async () => {
  const notQa = environment(); notQa.actorsConfig.storage.qaOnly = false;
  await rejects(() => prepareLocalQaTls(notQa));
  const mismatch = environment(); mismatch.actualInput.imageOrigin = 'https://127.0.0.1:59964';
  await rejects(() => prepareLocalQaTls(mismatch));
  for (const baseUrl of ['https://outside.invalid:59963', 'http://127.0.0.1:59963', 'https://127.0.0.1:59963/path']) {
    const env = environment(); env.actorsConfig.storage.baseUrl = baseUrl; env.actualInput.imageOrigin = baseUrl;
    await rejects(() => prepareLocalQaTls(env));
  }
});

test('정확한 localhost SAN은 허용하고 SAN 없는 IPv6 loopback은 거절한다', async () => {
  const env = environment(); env.actorsConfig.storage.baseUrl = 'https://localhost:59963';
  env.actualInput.imageOrigin = env.actorsConfig.storage.baseUrl;
  assert.equal((await prepareLocalQaTls(env)).evidence.mode, 'qa-loopback-leaf-spki');
  env.actorsConfig.storage.baseUrl = 'https://[::1]:59963'; env.actualInput.imageOrigin = env.actorsConfig.storage.baseUrl;
  await rejects(() => prepareLocalQaTls(env));
});

test('임시 경로 별칭과 실제 경로를 섞어도 같은 소유 infra의 공개 leaf를 확인한다', async () => {
  const env = environment();
  env.actorsConfig.storage.certificatePath = await realpath(certificatePath);
  assert.equal((await prepareLocalQaTls(env)).evidence.mode, 'qa-loopback-leaf-spki');
  const canonicalPgData = join(await realpath(infra), 'pgdata');
  env.config.expectedPgData = canonicalPgData; env.actorsConfig.cleanup.pgData = canonicalPgData;
  env.actorsConfig.storage.certificatePath = certificatePath;
  assert.equal((await prepareLocalQaTls(env)).evidence.mode, 'qa-loopback-leaf-spki');
});

test('CA 인증서와 만료·유효기간 이전 leaf는 거절한다', async () => {
  const caPath = join(infra, 'ca.crt'); await copyFile(join(generated, 'ca.crt'), caPath);
  const ca = environment(); ca.actorsConfig.storage.certificatePath = caPath;
  await rejects(() => prepareLocalQaTls(ca));
  await rejects(() => prepareLocalQaTls(environment(), { now: Date.parse(leaf.validFrom) - 1 }));
  await rejects(() => prepareLocalQaTls(environment(), { now: Date.parse(leaf.validTo) }));
});

test('소유 infra 밖 파일·키 경로·심볼릭 링크는 거절한다', async () => {
  const outside = environment(); outside.actorsConfig.storage.certificatePath = join(generated, 'public.crt');
  await rejects(() => prepareLocalQaTls(outside));
  const key = environment(); key.actorsConfig.storage.certificatePath = join(infra, 'private.key');
  await rejects(() => prepareLocalQaTls(key));
  const linkedPath = join(infra, 'linked.crt'); await symlink(certificatePath, linkedPath);
  const linked = environment(); linked.actorsConfig.storage.certificatePath = linkedPath;
  await rejects(() => prepareLocalQaTls(linked));
  await symlink(generated, join(infra, 'outside'));
  const escaped = environment(); escaped.actorsConfig.storage.certificatePath = join(infra, 'outside', 'public.crt');
  await rejects(() => prepareLocalQaTls(escaped));
});

test('키가 섞인 PEM과 여러 공개 인증서 묶음은 거절한다', async () => {
  const mixedPath = join(infra, 'mixed.pem');
  await writeFile(mixedPath, Buffer.concat([await readFile(certificatePath), await readFile(join(generated, 'private.key'))]), { mode: 0o600 });
  const mixed = environment(); mixed.actorsConfig.storage.certificatePath = mixedPath;
  await rejects(() => prepareLocalQaTls(mixed));
  const chainPath = join(infra, 'chain.pem');
  await writeFile(chainPath, Buffer.concat([await readFile(certificatePath), await readFile(join(generated, 'ca.crt'))]));
  const chain = environment(); chain.actorsConfig.storage.certificatePath = chainPath;
  await rejects(() => prepareLocalQaTls(chain));
});
