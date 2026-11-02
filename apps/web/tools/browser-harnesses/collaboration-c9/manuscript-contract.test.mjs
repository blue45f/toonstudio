import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { initialPreviewState, validateManuscriptManifest, validateManuscriptPreviewBatch,
  verifyManuscriptImageBytes } from './manuscript-contract.mjs';

const NOW = Date.parse('2026-11-02T04:00:00.000Z');
const ORIGIN = 'https://127.0.0.1:51901';
const SUBJECT = Object.freeze({ schemaVersion: 1, projectId: 'graph-project', workId: 'saved-work',
  artifactId: 'capture-artifact', reviewId: 'fixed-review', revisionId: 'fixed-revision', rootGraphHash: 'a'.repeat(64) });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copy = (value) => structuredClone(value);
function fixture(count = 3) {
  const contents = Array.from({ length: count }, (_, ordinal) => new TextEncoder().encode(`stored-page-${ordinal}`));
  const pages = contents.map((bytes, ordinal) => ({ ordinal, path: `pages/${String(ordinal + 1).padStart(4, '0')}.png`,
    sha256: digest(bytes), mediaType: 'image/png', byteLength: bytes.byteLength,
    sourceReviewId: SUBJECT.reviewId, sourceRevisionId: SUBJECT.revisionId, sourceArtifactId: SUBJECT.artifactId, sourceOrdinal: ordinal,
    mapping: { status: 'mapped', version: 1, sourceServerRevision: 7, sourceContentDigest: SUBJECT.rootGraphHash,
      page: { ordinal, id: `authoring-page-${ordinal}`, width: 800, height: 1600, renderWidth: 400, renderHeight: 800,
        elements: [{ id: `frame-${ordinal}`, type: 'frame', origin: 'page' }],
        frames: [{ id: `frame-${ordinal}`, bounds: { x: 10, y: 20, width: 300, height: 600 },
          polygon: [{ x: 10, y: 20 }, { x: 310, y: 20 }, { x: 310, y: 620 }] }] } } }));
  const manifest = { schema: 'toonstudio.page-manifest.v1', projectId: SUBJECT.projectId, workId: SUBJECT.workId,
    artifactId: SUBJECT.artifactId, title: '통제 검증의 기존 저장 원고', createdAt: '2026-11-02T03:50:00.000Z',
    pageCount: count, contentBytes: contents.reduce((sum, bytes) => sum + bytes.byteLength, 0), pages };
  return { manifest, contents };
}
function validate(raw = fixture().manifest, subject = SUBJECT, expectedPageCount = raw.pageCount) {
  return validateManuscriptManifest(raw, { subject, expectedPageCount });
}
function batch(manifest, start = 0, length = manifest.pageCount - start) {
  const previews = manifest.pages.slice(start, start + length).map((page) => ({ ordinal: page.sourceOrdinal,
    sha256: page.sha256, byteLength: page.byteLength, mediaType: page.mediaType, mapping: copy(page.mapping),
    url: `${ORIGIN}/preview/${page.sha256}.png?signature=synthetic-private-${start}`, expiresAt: NOW + 30_000 }));
  const last = previews.at(-1);
  return { ok: true, subject: copy(SUBJECT), previews,
    nextCursor: start + length === manifest.pageCount ? null : `${last.ordinal}.${last.sha256}` };
}
function read(payload, manifest, state = initialPreviewState(), options = {}) {
  return validateManuscriptPreviewBatch(payload, { manifest, state, cursor: state.nextCursor,
    now: NOW, allowedImageOrigin: ORIGIN, ...options });
}
function rejects(action, code) {
  assert.throws(action, (error) => error.name === 'ManuscriptContractError' && (!code || error.code === code));
}

test('실제 제품 manifest 형태의 60페이지를 정규화하고 입력과 안전 증거에서 URL을 제외한다', () => {
  const { manifest } = fixture(60);
  const before = copy(manifest);
  const result = validate(manifest, SUBJECT, 60);
  assert.equal(result.pageCount, 60);
  assert.equal(result.contentBytes, manifest.contentBytes);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.subject, SUBJECT);
  assert.deepEqual(manifest, before);
  assert.equal(Object.isFrozen(result.pages[0].mapping.page.frames), true);
  assert.equal(JSON.stringify(result.safeEvidence).includes('url'), false);
  assert.equal(JSON.stringify(result.safeEvidence).includes(manifest.title), false);
});

test('빈 원고·생략된 명시 페이지 수·다른 수량·합계·안전 정수 초과를 거절한다', () => {
  const empty = fixture(0).manifest;
  rejects(() => validate(empty), 'EXPECTED_PAGE_COUNT');
  rejects(() => validateManuscriptManifest(fixture().manifest, { subject: SUBJECT }), 'EXPECTED_PAGE_COUNT');
  rejects(() => validate(fixture().manifest, SUBJECT, 60), 'MANIFEST_COUNT');
  const wrong = fixture().manifest; wrong.contentBytes++;
  rejects(() => validate(wrong), 'MANIFEST_BYTES');
  wrong.pages[0].byteLength = Number.MAX_SAFE_INTEGER; wrong.contentBytes = Number.MAX_SAFE_INTEGER;
  rejects(() => validate(wrong), 'MANIFEST_BYTES');
  const sparse = fixture().manifest; delete sparse.pages[1];
  rejects(() => validate(sparse), 'MANIFEST_COUNT');
});

test('다른 작품·산출물·검수·revision 또는 source 순서 변경과 중복을 거절한다', () => {
  for (const key of ['projectId', 'workId']) {
    const raw = fixture().manifest; raw[key] = 'different-source';
    rejects(() => validate(raw), 'MANIFEST_SOURCE');
  }
  for (const key of ['sourceReviewId', 'sourceRevisionId', 'sourceArtifactId']) {
    const raw = fixture().manifest; raw.pages[1][key] = 'different-source';
    rejects(() => validate(raw), 'PAGE_SOURCE');
  }
  for (const key of ['ordinal', 'sourceOrdinal']) {
    const raw = fixture().manifest; raw.pages[1][key] = 0;
    rejects(() => validate(raw), 'PAGE_ORDER');
  }
  const reordered = fixture().manifest; reordered.pages.reverse();
  rejects(() => validate(reordered), 'PAGE_ORDER');
});

test('QuickExport의 출력 대상 artifact와 고정 검수 원본 artifact가 다른 정상 경로를 보존한다', () => {
  const raw = fixture().manifest;
  const sameArtifact = validate(raw);
  raw.artifactId = 'process-output-artifact';
  const manifest = validate(raw);
  assert.equal(manifest.outputArtifactId, raw.artifactId);
  assert.equal(manifest.safeEvidence.outputArtifactId, raw.artifactId);
  assert.equal(manifest.subject.artifactId, SUBJECT.artifactId);
  assert.equal(manifest.pages.every((page) => page.sourceArtifactId === SUBJECT.artifactId), true);
  assert.notEqual(manifest.manifestSha256, sameArtifact.manifestSha256);
  assert.equal(read(batch(manifest), manifest).complete, true);
  assert.equal(validateManuscriptManifest(raw, { subject: SUBJECT, expectedPageCount: raw.pageCount,
    expectedOutputArtifactId: raw.artifactId }).outputArtifactId, raw.artifactId);
  rejects(() => validateManuscriptManifest(raw, { subject: SUBJECT, expectedPageCount: raw.pageCount,
    expectedOutputArtifactId: 'different-output' }), 'MANIFEST_OUTPUT_ARTIFACT');
  for (const artifactId of ['', 'https://private.invalid/artifact', 'bad?token=private']) {
    const invalid = copy(raw); invalid.artifactId = artifactId;
    rejects(() => validate(invalid), 'MANIFEST_OUTPUT_ARTIFACT');
  }
  const mixed = copy(raw); mixed.pages[1].sourceArtifactId = raw.artifactId;
  rejects(() => validate(mixed), 'PAGE_SOURCE');
});

test('archive 경로 탈출·중복·인코딩·절대 URL과 확장자 불일치를 거절한다', () => {
  for (const path of ['../page.png', '/pages/0001.png', 'pages/../0001.png', 'pages\\0001.png',
    'pages/%2e%2e/0001.png', 'https://example.invalid/page.png', 'pages/0001.jpg', 'pages/0001.png?token=private']) {
    const raw = fixture().manifest; raw.pages[0].path = path;
    rejects(() => validate(raw), 'PAGE_PATH');
  }
  const duplicate = fixture().manifest; duplicate.pages[1].path = duplicate.pages[0].path;
  rejects(() => validate(duplicate), 'PAGE_PATH');
});

test('잘못된 hash·size·media type 및 숨겨진 URL 필드를 거절한다', () => {
  for (const [key, value] of [['sha256', 'A'.repeat(64)], ['sha256', 'short'], ['byteLength', 0],
    ['byteLength', 1.5], ['mediaType', 'image/svg+xml']]) {
    const raw = fixture().manifest; raw.pages[0][key] = value;
    rejects(() => validate(raw), 'PAGE_CONTENT');
  }
  const raw = fixture().manifest; raw.pages[0].url = `${ORIGIN}/private?signature=never-store`;
  rejects(() => validate(raw), 'PAGE_SHAPE');
});

test('제품 mapping union을 보존하고 잘못된 geometry·authoring identity·source를 거절한다', () => {
  const legacy = fixture(1).manifest;
  legacy.pages[0].mapping = { status: 'unmapped', reason: 'legacy-review' };
  assert.equal(validate(legacy).pages[0].mapping.status, 'unmapped');
  const mutations = [
    (mapping) => { mapping.sourceContentDigest = 'b'.repeat(64); },
    (mapping) => { mapping.sourceServerRevision = 0; },
    (mapping) => { mapping.page.ordinal = 1; },
    (mapping) => { mapping.page.frames[0].bounds.width = -1; },
    (mapping) => { mapping.page.frames[0].polygon[0].x = Infinity; },
    (mapping) => { mapping.page.elements.push(copy(mapping.page.elements[0])); },
    (mapping) => { mapping.page.elements[0].type = 'rect'; },
    (mapping) => { mapping.page.renderHeight = 300; },
    (mapping) => { mapping.url = 'https://private.invalid'; },
  ];
  for (const mutate of mutations) {
    const raw = fixture(1).manifest; mutate(raw.pages[0].mapping);
    rejects(() => validate(raw));
  }
  const differentRevision = fixture().manifest; differentRevision.pages[1].mapping.sourceServerRevision++;
  rejects(() => validate(differentRevision), 'MAPPING_REVISION');
  const duplicatePage = fixture().manifest; duplicatePage.pages[1].mapping.page.id = duplicatePage.pages[0].mapping.page.id;
  rejects(() => validate(duplicatePage), 'MAPPING_PAGE_DUPLICATE');
});

test('두 preview 구간의 전체 순서와 terminal cursor를 검증하며 입력 state를 변경하지 않는다', () => {
  const manifest = validate();
  const initial = initialPreviewState();
  const before = copy(initial);
  const first = read(batch(manifest, 0, 2), manifest, initial);
  assert.deepEqual(initial, before);
  assert.equal(first.complete, false);
  assert.equal(first.state.nextIndex, 2);
  assert.equal(first.state.nextCursor, `1.${manifest.pages[1].sha256}`);
  const last = read(batch(manifest, 2, 1), manifest, first.state);
  assert.equal(last.complete, true);
  assert.equal(last.state.nextCursor, null);
  assert.equal(last.state.nextIndex, 3);
  assert.deepEqual(last.previews.map((page) => page.ordinal), [2]);
  rejects(() => read(batch(manifest), manifest, last.state), 'PREVIEW_STATE');
});

test('다른 source 페이지가 같은 이미지 bytes와 URL을 재사용해도 페이지 순서와 mapping을 보존한다', () => {
  const { manifest: raw, contents } = fixture(2);
  raw.pages[1].sha256 = raw.pages[0].sha256;
  raw.pages[1].byteLength = raw.pages[0].byteLength;
  raw.contentBytes = raw.pages.reduce((sum, page) => sum + page.byteLength, 0);
  const manifest = validate(raw);
  const payload = batch(manifest);
  assert.equal(payload.previews[0].url, payload.previews[1].url);
  const result = read(payload, manifest);
  assert.equal(result.complete, true);
  assert.deepEqual(result.previews.map((page) => page.ordinal), [0, 1]);
  assert.notEqual(result.previews[0].mapping.page.id, result.previews[1].mapping.page.id);
  assert.equal(verifyManuscriptImageBytes(contents[0], manifest.pages[1]).ordinal, 1);
});

test('cursor 누락·순환·재사용·조기 종료·과잉 구간과 manifest 교체를 거절한다', () => {
  const manifest = validate();
  const first = read(batch(manifest, 0, 1), manifest);
  rejects(() => read(batch(manifest, 1, 1), manifest, first.state, { cursor: null }), 'PREVIEW_CURSOR');
  rejects(() => read(batch(manifest, 0, 1), manifest, first.state), 'PREVIEW_CONTENT');
  const wrong = batch(manifest, 1, 1); wrong.nextCursor = first.state.nextCursor;
  rejects(() => read(wrong, manifest, first.state), 'PREVIEW_NEXT_CURSOR');
  const early = batch(manifest, 0, 1); early.nextCursor = null;
  rejects(() => read(early, manifest), 'PREVIEW_NEXT_CURSOR');
  const last = batch(manifest); last.nextCursor = `2.${manifest.pages[2].sha256}`;
  rejects(() => read(last, manifest), 'PREVIEW_NEXT_CURSOR');
  const changed = fixture().manifest; changed.pages[0].sha256 = 'c'.repeat(64);
  const other = validate(changed);
  rejects(() => read(batch(other, 1, 1), other, first.state), 'PREVIEW_STATE');
  const oversized = validate(fixture(33).manifest);
  rejects(() => read(batch(oversized), oversized), 'PREVIEW_COUNT');
  const empty = batch(manifest); empty.previews = [];
  rejects(() => read(empty, manifest), 'PREVIEW_COUNT');
  const sparse = batch(manifest); delete sparse.previews[1];
  rejects(() => read(sparse, manifest), 'PREVIEW_COUNT');
});

test('실제 GET의 subject 및 ordinal·hash·size·type·mapping 변경을 거절한다', () => {
  const manifest = validate();
  for (const key of ['projectId', 'workId', 'artifactId', 'reviewId', 'revisionId', 'rootGraphHash']) {
    const payload = batch(manifest); payload.subject[key] = key === 'rootGraphHash' ? 'c'.repeat(64) : 'wrong-source';
    rejects(() => read(payload, manifest), 'PREVIEW_SUBJECT');
  }
  for (const [key, value] of [['ordinal', 1], ['sha256', 'b'.repeat(64)], ['byteLength', 1], ['mediaType', 'image/jpeg']]) {
    const payload = batch(manifest); payload.previews[0][key] = value;
    rejects(() => read(payload, manifest), 'PREVIEW_CONTENT');
  }
  const mapping = batch(manifest); mapping.previews[0].mapping.page.frames[0].bounds.x++;
  rejects(() => read(mapping, manifest), 'PREVIEW_MAPPING');
  const duplicate = batch(manifest); duplicate.previews[1] = copy(duplicate.previews[0]);
  rejects(() => read(duplicate, manifest), 'PREVIEW_CONTENT');
  const unavailable = batch(manifest); unavailable.ok = false;
  rejects(() => read(unavailable, manifest), 'PREVIEW_SUBJECT');
});

test('expiry는 관측 시각 이후 30초 이하만 허용한다', () => {
  const manifest = validate();
  for (const expiresAt of [NOW - 1, NOW, NOW + 30_001, NaN, Infinity, NOW + 0.5]) {
    const payload = batch(manifest); payload.previews[0].expiresAt = expiresAt;
    rejects(() => read(payload, manifest), 'PREVIEW_EXPIRY');
  }
  const payload = batch(manifest); payload.previews[0].expiresAt = NOW + 1;
  assert.equal(read(payload, manifest).complete, true);
});

test('HTTPS 정확 loopback origin과 무자격 URL만 허용하며 signed query는 transient에만 둔다', () => {
  const manifest = validate();
  for (const origin of ['http://127.0.0.1:51901', 'https://public.invalid', `${ORIGIN}/`, `${ORIGIN}/path`,
    'https://user:password@127.0.0.1:51901', `${ORIGIN}?secret=x`]) {
    rejects(() => read(batch(manifest), manifest, initialPreviewState(), { allowedImageOrigin: origin }), 'IMAGE_ORIGIN');
  }
  for (const url of ['http://127.0.0.1:51901/page.png', 'https://localhost:51901/page.png',
    'https://127.0.0.1:51902/page.png', 'https://127.0.0.1.evil.invalid:51901/page.png',
    'https://user:password@127.0.0.1:51901/page.png', `${ORIGIN}/page.png#private`, 'data:image/png;base64,eA==', 'not a URL']) {
    const payload = batch(manifest); payload.previews[0].url = url;
    rejects(() => read(payload, manifest), 'IMAGE_URL');
  }
  const payload = batch(manifest);
  const original = copy(payload);
  const result = read(payload, manifest);
  assert.deepEqual(payload, original);
  assert.match(result.previews[0].url, /signature=synthetic-private/u);
  const evidence = JSON.stringify({ state: result.state, manifest: manifest.safeEvidence, batch: result.safeEvidence });
  for (const secret of ['signature', 'synthetic-private', ORIGIN, 'url']) assert.equal(evidence.includes(secret), false);
  const unsafe = batch(manifest); unsafe.previews[0].url = 'https://synthetic-user:synthetic-secret@private.invalid/?signature=do-not-print';
  let failure;
  try { read(unsafe, manifest); } catch (error) { failure = error; }
  assert.equal(failure?.name, 'ManuscriptContractError');
  const output = `${failure.name} ${failure.message} ${failure.stack} ${JSON.stringify(failure)}`;
  for (const secret of ['synthetic-user', 'synthetic-secret', 'private.invalid', 'do-not-print']) assert.equal(output.includes(secret), false);
});

test('localhost와 IPv6도 명시한 정확 origin일 때만 허용하고 서명 query 갱신은 저장하지 않는다', () => {
  const manifest = validate();
  for (const allowedImageOrigin of ['https://localhost:51901', 'https://[::1]:51901']) {
    const payload = batch(manifest);
    payload.previews.forEach((page) => { page.url = page.url.replace(ORIGIN, allowedImageOrigin); });
    const result = read(payload, manifest, initialPreviewState(), { allowedImageOrigin });
    assert.equal(result.complete, true);
    const updated = copy(payload);
    updated.previews.forEach((page) => { page.url = page.url.replace('synthetic-private-0', 'synthetic-renewed'); });
    const renewed = read(updated, manifest, initialPreviewState(), { allowedImageOrigin });
    assert.deepEqual(renewed.safeEvidence, result.safeEvidence);
    assert.notEqual(renewed.previews[0].url, result.previews[0].url);
  }
});

test('원본 이미지 응답 bytes의 실제 hash와 길이를 확인하고 decode 성공은 만들어내지 않는다', () => {
  const { manifest: raw, contents } = fixture();
  const manifest = validate(raw);
  const expected = manifest.pages[0];
  const proof = verifyManuscriptImageBytes(contents[0], expected);
  assert.deepEqual(proof, { ordinal: 0, sha256: expected.sha256, byteLength: contents[0].byteLength,
    mediaType: 'image/png', verified: true });
  assert.deepEqual(verifyManuscriptImageBytes(contents[0].buffer, expected), proof);
  assert.equal(Object.hasOwn(proof, 'decoded'), false);
  rejects(() => verifyManuscriptImageBytes('stored-page-0', expected), 'IMAGE_BYTES_TYPE');
  rejects(() => verifyManuscriptImageBytes(contents[0].subarray(1), expected), 'IMAGE_BYTES_SIZE');
  const altered = contents[0].slice(); altered[0] ^= 1;
  rejects(() => verifyManuscriptImageBytes(altered, expected), 'IMAGE_BYTES_HASH');
  const withTransientUrl = { ...expected, url: `${ORIGIN}/private?signature=do-not-store` };
  assert.deepEqual(verifyManuscriptImageBytes(contents[0], withTransientUrl), proof);
});
