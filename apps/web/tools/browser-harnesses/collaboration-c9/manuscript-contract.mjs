import { createHash } from 'node:crypto';

const SCHEMA = 'toonstudio.page-manifest.v1';
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const MEDIA = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });
const SUBJECT_KEYS = ['schemaVersion', 'projectId', 'workId', 'artifactId', 'reviewId', 'revisionId', 'rootGraphHash'];
const PAGE_KEYS = ['ordinal', 'path', 'sha256', 'mediaType', 'byteLength', 'sourceReviewId', 'sourceRevisionId', 'sourceArtifactId', 'sourceOrdinal', 'mapping'];
const MAX_ORDINAL = 1_000_000;

class ManuscriptContractError extends Error {
  constructor(code) {
    super(`고정 원고 계약을 확인하세요 (${code}).`);
    this.name = 'ManuscriptContractError';
    this.code = code;
  }
}
function check(value, code) { if (!value) throw new ManuscriptContractError(code); }
function record(value, code) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  return value;
}
function keys(value, required, optional, code) {
  record(value, code);
  check(required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), code);
}
function identity(value) { return typeof value === 'string' && ID.test(value) && !value.includes('://'); }
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function clone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(clone));
  if (value !== null && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])));
  return value;
}
function subjectOf(value) {
  keys(value, SUBJECT_KEYS, [], 'SUBJECT_SHAPE');
  check(value.schemaVersion === 1 && SUBJECT_KEYS.slice(1, -1).every((key) => identity(value[key]))
    && typeof value.rootGraphHash === 'string' && HASH.test(value.rootGraphHash), 'SUBJECT_VALUE');
  return clone(value);
}
function bounds(value) {
  keys(value, ['x', 'y', 'width', 'height'], [], 'MAPPING_BOUNDS');
  check(finite(value.x) && finite(value.y) && finite(value.width) && value.width > 0
    && finite(value.height) && value.height > 0, 'MAPPING_BOUNDS');
}
function mappingOf(value, subject, sourceOrdinal) {
  record(value, 'MAPPING_SHAPE');
  if (value.status === 'unmapped') {
    keys(value, ['status', 'reason'], [], 'MAPPING_SHAPE');
    check(['legacy-review', 'source-unavailable', 'source-identity-ambiguous', 'source-geometry-unsupported', 'render-geometry-mismatch'].includes(value.reason), 'MAPPING_REASON');
    return clone(value);
  }
  keys(value, ['status', 'version', 'sourceServerRevision', 'sourceContentDigest', 'page'], [], 'MAPPING_SHAPE');
  check(value.status === 'mapped' && value.version === 1 && integer(value.sourceServerRevision, 1, 2_147_483_647)
    && value.sourceContentDigest === subject.rootGraphHash, 'MAPPING_SOURCE');
  const page = value.page;
  keys(page, ['ordinal', 'id', 'width', 'height', 'renderWidth', 'renderHeight', 'frames', 'elements'], [], 'MAPPING_PAGE');
  check(integer(page.ordinal, 0, 99_999) && page.ordinal === sourceOrdinal && identity(page.id)
    && ['width', 'height', 'renderWidth', 'renderHeight'].every((key) => integer(page[key], 1))
    && Array.isArray(page.frames) && page.frames.length <= 100_000
    && Array.isArray(page.elements) && page.elements.length <= 100_000, 'MAPPING_PAGE');
  const elementIds = new Set();
  for (const element of page.elements) {
    keys(element, ['id', 'type', 'origin'], [], 'MAPPING_ELEMENT');
    check(identity(element.id) && !elementIds.has(element.id) && typeof element.type === 'string'
      && /^[a-z][a-z0-9-]{0,63}$/u.test(element.type) && ['page', 'master'].includes(element.origin), 'MAPPING_ELEMENT');
    elementIds.add(element.id);
  }
  const frameIds = new Set();
  for (const frame of page.frames) {
    keys(frame, ['id', 'bounds'], ['polygon'], 'MAPPING_FRAME');
    check(identity(frame.id) && !frameIds.has(frame.id)
      && page.elements.some((element) => element.id === frame.id && element.type === 'frame'), 'MAPPING_FRAME');
    frameIds.add(frame.id); bounds(frame.bounds);
    if (Object.hasOwn(frame, 'polygon')) {
      check(Array.isArray(frame.polygon) && frame.polygon.length >= 3 && frame.polygon.length <= 10_000, 'MAPPING_POLYGON');
      for (const point of frame.polygon) {
        keys(point, ['x', 'y'], [], 'MAPPING_POLYGON');
        check(finite(point.x) && finite(point.y), 'MAPPING_POLYGON');
      }
    }
  }
  check(Math.abs(page.renderWidth / page.width - page.renderHeight / page.height) <= 1 / page.width + 1 / page.height, 'MAPPING_ASPECT');
  return clone(value);
}
function pageEvidence(page) {
  return { ordinal: page.ordinal, sha256: page.sha256, mediaType: page.mediaType,
    byteLength: page.byteLength, mappingSha256: hash(stable(page.mapping)) };
}

/** 제품의 전체 페이지 출력과 같은 순서를 요구하는 이 측정 전용 입력 경계다. */
export function validateManuscriptManifest(manifest, { subject, expectedPageCount, expectedOutputArtifactId } = {}) {
  const fixedSubject = subjectOf(subject);
  check(integer(expectedPageCount, 1, MAX_ORDINAL + 1), 'EXPECTED_PAGE_COUNT');
  keys(manifest, ['schema', 'projectId', 'workId', 'artifactId', 'pageCount', 'contentBytes', 'pages'], ['title', 'createdAt'], 'MANIFEST_SHAPE');
  check(manifest.schema === SCHEMA && manifest.projectId === fixedSubject.projectId
    && manifest.workId === fixedSubject.workId, 'MANIFEST_SOURCE');
  // 출력 대상 artifact와 각 페이지를 캡처한 원본 review artifact는 별도 식별자다.
  check(identity(manifest.artifactId) && (expectedOutputArtifactId === undefined
    || (identity(expectedOutputArtifactId) && manifest.artifactId === expectedOutputArtifactId)), 'MANIFEST_OUTPUT_ARTIFACT');
  check(manifest.pageCount === expectedPageCount && Array.isArray(manifest.pages)
    && manifest.pages.length === expectedPageCount && Array.from(manifest.pages).every((page) => page !== undefined)
    && integer(manifest.contentBytes, 1), 'MANIFEST_COUNT');
  check(!Object.hasOwn(manifest, 'title') || typeof manifest.title === 'string', 'MANIFEST_METADATA');
  check(!Object.hasOwn(manifest, 'createdAt') || (typeof manifest.createdAt === 'string' && Number.isFinite(Date.parse(manifest.createdAt))), 'MANIFEST_METADATA');
  let contentBytes = 0;
  let serverRevision;
  const pageIds = new Set();
  const pages = manifest.pages.map((page, index) => {
    keys(page, PAGE_KEYS, [], 'PAGE_SHAPE');
    check(page.ordinal === index && page.sourceOrdinal === index, 'PAGE_ORDER');
    check(page.sourceReviewId === fixedSubject.reviewId && page.sourceRevisionId === fixedSubject.revisionId
      && page.sourceArtifactId === fixedSubject.artifactId, 'PAGE_SOURCE');
    check(typeof page.sha256 === 'string' && HASH.test(page.sha256) && Object.hasOwn(MEDIA, page.mediaType)
      && integer(page.byteLength, 1), 'PAGE_CONTENT');
    // 제품 archive가 만드는 상대 경로만 받으며 인코딩·역슬래시·상위 경로도 배제한다.
    check(page.path === `pages/${String(index + 1).padStart(4, '0')}.${MEDIA[page.mediaType]}`, 'PAGE_PATH');
    const mapping = mappingOf(page.mapping, fixedSubject, page.sourceOrdinal);
    if (mapping.status === 'mapped') {
      check(serverRevision === undefined || serverRevision === mapping.sourceServerRevision, 'MAPPING_REVISION');
      check(!pageIds.has(mapping.page.id), 'MAPPING_PAGE_DUPLICATE');
      serverRevision = mapping.sourceServerRevision; pageIds.add(mapping.page.id);
    }
    contentBytes += page.byteLength;
    check(Number.isSafeInteger(contentBytes), 'MANIFEST_BYTES');
    return clone({ ...page, mapping });
  });
  check(contentBytes === manifest.contentBytes, 'MANIFEST_BYTES');
  const normalized = { schema: SCHEMA, subject: fixedSubject, outputArtifactId: manifest.artifactId,
    pageCount: pages.length, contentBytes, pages: Object.freeze(pages) };
  const manifestSha256 = hash(stable(normalized));
  const safeEvidence = clone({ schema: SCHEMA, subject: fixedSubject, outputArtifactId: manifest.artifactId, pageCount: pages.length, contentBytes,
    manifestSha256, pages: pages.map(pageEvidence) });
  return clone({ ...normalized, manifestSha256, safeEvidence });
}

export function initialPreviewState() {
  return Object.freeze({ schemaVersion: 1, nextIndex: 0, nextCursor: null, complete: false, manifestSha256: null });
}
function imageOrigin(value) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 2_048, 'IMAGE_ORIGIN');
  let url;
  try { url = new URL(value); } catch { throw new ManuscriptContractError('IMAGE_ORIGIN'); }
  check(typeof value === 'string' && value === url.origin && url.protocol === 'https:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash, 'IMAGE_ORIGIN');
  return url.origin;
}
function previewUrl(value, allowedImageOrigin) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 8_192 && value === value.trim(), 'IMAGE_URL');
  let url;
  try { url = new URL(value); } catch { throw new ManuscriptContractError('IMAGE_URL'); }
  check(url.protocol === 'https:' && url.origin === allowedImageOrigin && !url.username && !url.password && !url.hash, 'IMAGE_URL');
  return value;
}

/** 원본 state는 바꾸지 않으며 URL은 반환한 previews에서만 일시적으로 사용한다. */
export function validateManuscriptPreviewBatch(payload, { manifest, state, cursor, now, allowedImageOrigin } = {}) {
  record(manifest, 'VALIDATED_MANIFEST');
  check(manifest.schema === SCHEMA && HASH.test(manifest.manifestSha256 ?? '') && Array.isArray(manifest.pages)
    && identity(manifest.outputArtifactId)
    && manifest.pageCount === manifest.pages.length && manifest.pageCount > 0
    && hash(stable({ schema: manifest.schema, subject: manifest.subject, outputArtifactId: manifest.outputArtifactId, pageCount: manifest.pageCount,
      contentBytes: manifest.contentBytes, pages: manifest.pages })) === manifest.manifestSha256, 'VALIDATED_MANIFEST');
  keys(state, ['schemaVersion', 'nextIndex', 'nextCursor', 'complete', 'manifestSha256'], [], 'PREVIEW_STATE');
  check(state.schemaVersion === 1 && integer(state.nextIndex, 0, manifest.pageCount - 1) && state.complete === false
    && (state.nextIndex === 0 ? state.manifestSha256 === null : state.manifestSha256 === manifest.manifestSha256), 'PREVIEW_STATE');
  const previous = manifest.pages[state.nextIndex - 1];
  const expectedCursor = previous ? `${previous.sourceOrdinal}.${previous.sha256}` : null;
  check(cursor === expectedCursor && state.nextCursor === expectedCursor, 'PREVIEW_CURSOR');
  check(integer(now, 0), 'PREVIEW_NOW');
  const allowedOrigin = imageOrigin(allowedImageOrigin);
  keys(payload, ['ok', 'subject', 'previews', 'nextCursor'], [], 'PREVIEW_SHAPE');
  check(payload.ok === true && stable(subjectOf(payload.subject)) === stable(manifest.subject), 'PREVIEW_SUBJECT');
  check(Array.isArray(payload.previews) && payload.previews.length >= 1 && payload.previews.length <= 32
    && Array.from(payload.previews).every((page) => page !== undefined)
    && state.nextIndex + payload.previews.length <= manifest.pageCount, 'PREVIEW_COUNT');
  const previews = payload.previews.map((preview, offset) => {
    keys(preview, ['ordinal', 'sha256', 'mediaType', 'byteLength', 'url', 'expiresAt', 'mapping'], [], 'PREVIEW_PAGE');
    const expected = manifest.pages[state.nextIndex + offset];
    check(preview.ordinal === expected.sourceOrdinal && preview.sha256 === expected.sha256
      && preview.mediaType === expected.mediaType && preview.byteLength === expected.byteLength, 'PREVIEW_CONTENT');
    const mapping = mappingOf(preview.mapping, manifest.subject, preview.ordinal);
    check(stable(mapping) === stable(expected.mapping), 'PREVIEW_MAPPING');
    check(integer(preview.expiresAt, 1) && preview.expiresAt > now && preview.expiresAt - now <= 30_000, 'PREVIEW_EXPIRY');
    return clone({ ordinal: preview.ordinal, sha256: preview.sha256, byteLength: preview.byteLength,
      mediaType: preview.mediaType, mapping, url: previewUrl(preview.url, allowedOrigin), expiresAt: preview.expiresAt });
  });
  const nextIndex = state.nextIndex + previews.length;
  const complete = nextIndex === manifest.pageCount;
  const last = previews.at(-1);
  const nextCursor = complete ? null : `${last.ordinal}.${last.sha256}`;
  check(payload.nextCursor === nextCursor, 'PREVIEW_NEXT_CURSOR');
  const nextState = Object.freeze({ schemaVersion: 1, nextIndex, nextCursor, complete, manifestSha256: manifest.manifestSha256 });
  const safeEvidence = clone({ subject: manifest.subject, manifestSha256: manifest.manifestSha256,
    fromOrdinal: previews[0].ordinal, toOrdinal: last.ordinal, pageCount: previews.length, complete,
    pages: previews.map(pageEvidence) });
  return Object.freeze({ state: nextState, previews: Object.freeze(previews), safeEvidence, complete });
}

export function verifyManuscriptImageBytes(bytes, expectedPage) {
  const view = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  check(view !== null, 'IMAGE_BYTES_TYPE');
  record(expectedPage, 'IMAGE_EXPECTED_PAGE');
  check(integer(expectedPage.ordinal, 0, MAX_ORDINAL) && typeof expectedPage.sha256 === 'string'
    && HASH.test(expectedPage.sha256) && integer(expectedPage.byteLength, 1)
    && Object.hasOwn(MEDIA, expectedPage.mediaType), 'IMAGE_EXPECTED_PAGE');
  check(view.byteLength === expectedPage.byteLength, 'IMAGE_BYTES_SIZE');
  const sha256 = hash(view);
  check(sha256 === expectedPage.sha256, 'IMAGE_BYTES_HASH');
  return Object.freeze({ ordinal: expectedPage.ordinal, sha256, byteLength: view.byteLength,
    mediaType: expectedPage.mediaType, verified: true });
}
