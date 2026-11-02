import {
  initialPreviewState, validateManuscriptPreviewBatch, verifyManuscriptImageBytes,
} from './manuscript-contract.mjs';

// Signed addresses and response bodies are private, transient state. Nothing below
// creates captures, fulfills responses, injects images, or changes product data.
const SUBJECT_FIELDS = ['projectId', 'workId', 'artifactId', 'revisionId', 'rootGraphHash'];
const fault = (code) => new Error(code);
function requireValue(condition, code) { if (!condition) throw fault(code); }
function parsedUrl(value, code) {
  try { return new URL(value); } catch { throw fault(code); }
}
function origin(value, image = false) {
  const url = parsedUrl(value, 'manuscript-origin-invalid');
  requireValue(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'manuscript-origin-invalid');
  requireValue(image ? url.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    : ['http:', 'https:'].includes(url.protocol), 'manuscript-origin-invalid');
  return url.origin;
}
async function guarded(code, operation) {
  try { return await operation(); } catch { throw fault(code); }
}

/** Start this panel's independent milestone observers before its opening action. */
export async function captureManuscriptMilestones({ action, completions,
  now = () => performance.now(), timestamp = () => new Date().toISOString() }) {
  requireValue(typeof action === 'function' && typeof now === 'function' && typeof timestamp === 'function'
    && Array.isArray(completions) && completions.length > 0
    && completions.every((entry) => typeof entry?.operation === 'string' && entry.operation.length > 0
      && typeof entry.complete === 'function')
    && new Set(completions.map((entry) => entry.operation)).size === completions.length,
  'manuscript-milestones-invalid');
  let fail;
  const failure = new Promise((_, reject) => { fail = reject; });
  // Observers may reject before the opening action settles. Consume every such
  // rejection immediately, including failures arriving after this call rejects.
  failure.catch(() => {});
  const probes = completions.map(({ operation, complete }) => {
    let pending;
    try { pending = Promise.resolve(complete()); }
    catch (error) { pending = Promise.reject(error); }
    return pending.then((observed) => {
      const hostEndMs = now();
      const finishedAt = timestamp();
      requireValue(Number.isFinite(hostEndMs) && typeof finishedAt === 'string', 'manuscript-milestone-clock-invalid');
      return { operation, observed, hostEndMs, finishedAt };
    }).catch((error) => { fail(error); return null; });
  });
  let pendingAction;
  try { pendingAction = Promise.resolve(action()); }
  catch (error) { pendingAction = Promise.reject(error); }
  const actionDone = pendingAction.catch((error) => { fail(error); });
  const succeeded = Promise.all([actionDone, ...probes]).then(([, ...captured]) => captured);
  return Promise.race([failure, succeeded]);
}

export function createManuscriptSession({ contract, subject, imageOrigin, webOrigin, apiOrigin = webOrigin }) {
  const imagesOrigin = origin(imageOrigin, true);
  const applicationOrigin = origin(webOrigin);
  const apiOrigins = new Set([applicationOrigin, origin(apiOrigin)]);
  requireValue(contract?.schema === 'toonstudio.page-manifest.v1' && Array.isArray(contract.pages)
    && contract.pageCount === contract.pages.length && contract.pageCount > 0, 'manuscript-contract-required');
  requireValue(subject?.schemaVersion === 1 && subject.reviewId === contract.subject?.reviewId
    && SUBJECT_FIELDS.every((key) => subject[key] === contract.subject[key]), 'manuscript-subject-mismatch');
  const endpoint = `/api/studio-project-graph/reviews/${encodeURIComponent(subject.reviewId)}/previews`;
  const pages = new Map(contract.pages.map((page) => [page.ordinal, page]));
  const knownIdentities = new Map();
  const knownOrdinals = new Set();
  const observedAddresses = new Map();
  const pendingPreviews = [];
  const queuedResponses = new WeakSet();
  const imageValidation = new WeakMap();
  const pendingDecoded = [];
  const previewEvidence = [];
  const imageEvidence = [];
  const decodedEvidence = [];
  let prepared = false;
  let preparing = false;
  let preflightBatches = 0;
  let verifiedImageRequests = 0;

  function imageIdentity(address) {
    const url = parsedUrl(address, 'manuscript-image-address-invalid');
    requireValue(url.origin === imagesOrigin && !url.username && !url.password && !url.hash,
      'manuscript-image-origin-mismatch');
    return `${url.origin}${url.pathname}`;
  }
  function previewRequest(address) {
    const url = parsedUrl(address, 'manuscript-preview-address-invalid');
    if (!apiOrigins.has(url.origin) || url.pathname !== endpoint) return null;
    requireValue(!url.username && !url.password && !url.hash, 'manuscript-preview-request-mismatch');
    const expected = [...SUBJECT_FIELDS, ...(url.searchParams.has('cursor') ? ['cursor'] : [])];
    requireValue([...url.searchParams.keys()].length === expected.length
      && expected.every((key) => url.searchParams.getAll(key).length === 1)
      && SUBJECT_FIELDS.every((key) => url.searchParams.get(key) === subject[key]), 'manuscript-preview-request-mismatch');
    return { cursor: url.searchParams.get('cursor') };
  }
  function stateForCursor(cursor) {
    if (cursor === null) return initialPreviewState();
    const index = contract.pages.findIndex((page) => `${page.ordinal}.${page.sha256}` === cursor);
    requireValue(index >= 0 && index + 1 < contract.pageCount, 'manuscript-preview-cursor-mismatch');
    return Object.freeze({ ...initialPreviewState(), nextIndex: index + 1,
      nextCursor: cursor, manifestSha256: contract.manifestSha256 });
  }
  function validateBatch(payload, state, cursor, now) {
    try {
      return validateManuscriptPreviewBatch(payload, { manifest: contract, state, cursor, now,
        allowedImageOrigin: imagesOrigin });
    } catch { throw fault('manuscript-preview-body-mismatch'); }
  }
  function rememberBatch(batch, phase) {
    for (const preview of batch.previews) {
      const identity = imageIdentity(preview.url);
      const expected = pages.get(preview.ordinal);
      requireValue(expected && expected.sha256 === preview.sha256 && expected.byteLength === preview.byteLength
        && expected.mediaType === preview.mediaType, 'manuscript-preview-manifest-mismatch');
      let aliases = knownIdentities.get(identity);
      if (phase === 'preflight') {
        if (!aliases) { aliases = new Map(); knownIdentities.set(identity, aliases); }
        // Different manuscript pages may intentionally contain identical bytes.
        const previous = aliases.values().next().value;
        requireValue(!previous || (previous.sha256 === expected.sha256 && previous.byteLength === expected.byteLength
          && previous.mediaType === expected.mediaType), 'manuscript-image-identity-collision');
        aliases.set(preview.ordinal, expected);
        knownOrdinals.add(preview.ordinal);
      } else {
        requireValue(aliases?.get(preview.ordinal)?.sha256 === preview.sha256,
          'manuscript-image-identity-changed');
      }
      if (phase === 'observed') {
        const observedOrdinals = observedAddresses.get(preview.url) ?? new Set();
        observedOrdinals.add(preview.ordinal);
        observedAddresses.set(preview.url, observedOrdinals);
      }
    }
    // The pure contract deliberately omits addresses, archive paths and titles.
    previewEvidence.push(Object.freeze({ phase, ...batch.safeEvidence }));
  }
  function assertExactAddress(address, ordinal) {
    const expected = knownIdentities.get(imageIdentity(address))?.get(ordinal);
    requireValue(expected && observedAddresses.get(address)?.has(ordinal),
      'manuscript-observed-address-unverified');
  }

  const session = {
    async prepare(context) {
      requireValue(!prepared && !preparing, 'manuscript-preflight-already-started');
      preparing = true;
      return guarded('manuscript-preflight-failed', async () => {
        let state = initialPreviewState();
        let cursor = null;
        do {
          requireValue(preflightBatches < contract.pageCount, 'manuscript-preflight-pagination-exceeded');
          const query = new URLSearchParams(SUBJECT_FIELDS.map((key) => [key, subject[key]]));
          if (cursor !== null) query.set('cursor', cursor);
          const response = await context.request.get(`${applicationOrigin}${endpoint}?${query}`,
            { failOnStatusCode: false, maxRedirects: 0 });
          requireValue(response.status() === 200, 'manuscript-preflight-http-failed');
          const finalRequest = previewRequest(response.url());
          requireValue(finalRequest && finalRequest.cursor === cursor, 'manuscript-preflight-redirect-mismatch');
          const receivedAt = Date.now();
          const payload = await response.json();
          const batch = validateBatch(payload, state, cursor, receivedAt);
          rememberBatch(batch, 'preflight');
          state = batch.state;
          cursor = state.nextCursor;
          preflightBatches += 1;
        } while (cursor !== null);
        requireValue(state.complete && knownOrdinals.size === contract.pageCount, 'manuscript-preflight-incomplete');
        prepared = true;
        return session.safeEvidence;
      });
    },
    acceptsImageRequest(address) {
      if (!prepared) return false;
      try { return knownIdentities.has(imageIdentity(address)); } catch { return false; }
    },
    queuePreviewResponse(response) {
      const request = previewRequest(response.url());
      if (!request || queuedResponses.has(response)) return false;
      requireValue(prepared && response.request().method() === 'GET', 'manuscript-preview-observation-invalid');
      queuedResponses.add(response);
      // No response.json/body/hash work occurs in the timed response callback.
      pendingPreviews.push({ response, cursor: request.cursor, receivedAt: Date.now() });
      return true;
    },
    async validatePendingPreviews() {
      requireValue(prepared, 'manuscript-preflight-required');
      return guarded('manuscript-observed-previews-invalid', async () => {
        while (pendingPreviews.length) {
          const { response, cursor, receivedAt } = pendingPreviews.shift();
          await response.finished();
          requireValue(response.status() === 200, 'manuscript-observed-preview-http-failed');
          const payload = await response.json();
          // Each real response can be a list prefix, prefetch, or a selected-image
          // refresh beginning after a known page. Cursor identity remains strict.
          const batch = validateBatch(payload, stateForCursor(cursor), cursor, receivedAt);
          rememberBatch(batch, 'observed');
        }
        while (pendingDecoded.length) {
          const observed = pendingDecoded[0];
          assertExactAddress(observed.address, observed.ordinal);
          decodedEvidence.push({ ordinal: observed.ordinal, ...(observed.image ?? {}), addressVerified: true });
          pendingDecoded.shift();
        }
        return session.safeEvidence;
      });
    },
    assertObservedImageUrl(address, ordinal, image = null) {
      requireValue(prepared && Number.isSafeInteger(ordinal), 'manuscript-decode-observation-invalid');
      const expected = knownIdentities.get(imageIdentity(address))?.get(ordinal);
      requireValue(expected, 'manuscript-decoded-image-identity-mismatch');
      if (image !== null) {
        requireValue(image.complete === true && Number.isSafeInteger(image.width) && image.width > 0
          && Number.isSafeInteger(image.height) && image.height > 0, 'manuscript-decoded-image-size-invalid');
        if (expected.mapping.status === 'mapped') requireValue(image.width === expected.mapping.page.renderWidth
          && image.height === expected.mapping.page.renderHeight, 'manuscript-decoded-image-mapping-mismatch');
      }
      // A renewed query is checked against the actual API body after timing ends.
      // Until then, the complete address stays only in this private queue.
      pendingDecoded.push({ address, ordinal, image: image === null ? null
        : { width: image.width, height: image.height, complete: image.complete } });
    },
    async validateImageRequest(response) {
      requireValue(prepared && response && typeof response.body === 'function', 'manuscript-image-response-required');
      if (imageValidation.has(response)) return imageValidation.get(response);
      const validation = guarded('manuscript-observed-image-invalid', async () => {
        const request = response.request();
        requireValue(request.method() === 'GET' && response.status() === 200, 'manuscript-image-http-failed');
        const aliases = knownIdentities.get(imageIdentity(request.url()));
        requireValue(aliases, 'manuscript-image-request-unexpected');
        const sourceOrdinals = [...aliases.keys()].filter((ordinal) => observedAddresses.get(request.url())?.has(ordinal)
          && observedAddresses.get(response.url())?.has(ordinal));
        requireValue(sourceOrdinals.length > 0, 'manuscript-image-address-unverified');
        const expected = aliases.get(sourceOrdinals[0]);
        for (const ordinal of sourceOrdinals) {
          assertExactAddress(request.url(), ordinal); assertExactAddress(response.url(), ordinal);
        }
        await response.finished();
        const mediaType = (await response.headerValue('content-type') ?? '').split(';')[0].trim().toLowerCase();
        requireValue(mediaType === expected.mediaType, 'manuscript-image-content-type-mismatch');
        const bytes = await response.body();
        let proof;
        try { proof = verifyManuscriptImageBytes(bytes, expected); }
        catch { throw fault('manuscript-image-bytes-mismatch'); }
        const safe = { ordinal: proof.ordinal, sourceOrdinals, sha256: proof.sha256, byteLength: proof.byteLength,
          mediaType: proof.mediaType, verified: proof.verified === true };
        verifiedImageRequests += 1;
        imageEvidence.push(safe);
        return safe;
      });
      imageValidation.set(response, validation);
      return validation;
    },
    get safeEvidence() {
      return {
        manifestSha256: contract.manifestSha256, manifestPageCount: contract.pageCount,
        manifestContentBytes: contract.contentBytes, preflightComplete: prepared, preflightBatches,
        pendingPreviewResponses: pendingPreviews.length, pendingDecodedSources: pendingDecoded.length,
        verifiedImageRequests, previewBatches: [...previewEvidence],
        images: imageEvidence.map((entry) => ({ ...entry, sourceOrdinals: [...entry.sourceOrdinals] })),
        decodedImages: decodedEvidence.map((entry) => ({ ...entry })),
      };
    },
  };
  return session;
}

/** Observe the actual submitted PinnedImage; no synthetic images or captures. */
export async function observeManuscriptImageDecode(page, { ordinal, session }) {
  requireValue(Number.isSafeInteger(ordinal) && ordinal >= 0 && session
    && typeof session.assertObservedImageUrl === 'function', 'manuscript-image-observer-invalid');
  return guarded('manuscript-image-decode-observation-failed', async () => {
    const region = page.getByRole('region', { name: '고정 제출 원고 이미지', exact: true });
    const ordinalSelect = region.getByRole('combobox', { name: '이미지 순번', exact: true });
    await ordinalSelect.waitFor({ state: 'visible' });
    requireValue(await ordinalSelect.inputValue() === String(ordinal), 'manuscript-image-ordinal-mismatch');
    requireValue(await region.getByRole('combobox', { name: '비교 기준본', exact: true }).inputValue() === '',
      'manuscript-image-baseline-active');
    const image = region.locator('figure img');
    await image.waitFor({ state: 'visible' });
    await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden' });
    const observed = await image.evaluate(async (element, expectedOrdinal) => {
      if (!(element instanceof HTMLImageElement)) throw new Error('manuscript-pinned-image-required');
      await element.decode();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const regionElement = element.closest('section[aria-label="고정 제출 원고 이미지"]');
      const selections = regionElement ? [...regionElement.querySelectorAll('select')] : [];
      const position = selections.find((select) => select.closest('label')?.textContent?.includes('이미지 순번'));
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      let left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
      let top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
      let opaqueAncestors = true;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor), clip = ancestor.getBoundingClientRect();
        if (Number(ancestorStyle.opacity) === 0) opaqueAncestors = false;
        if (/^(auto|scroll|hidden|clip)$/u.test(ancestorStyle.overflowX)) {
          left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        }
        if (/^(auto|scroll|hidden|clip)$/u.test(ancestorStyle.overflowY)) {
          top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
        }
      }
      const visible = element.isConnected && style.display !== 'none' && style.visibility === 'visible'
        && Number(style.opacity) > 0 && opaqueAncestors && right > left && bottom > top;
      const data = window.__c9Telemetry;
      if (!visible || !element.complete || !element.naturalWidth || !element.naturalHeight
        || !element.currentSrc || position?.value !== String(expectedOrdinal) || !data) {
        throw new Error('manuscript-pinned-image-incomplete');
      }
      return { time: performance.now(), timeOrigin: performance.timeOrigin, inputs: data.inputEvents,
        lastInputAt: data.lastInputAt, longTaskSupported: data.observerSupported, longTasks: [...data.longTasks],
        transientCurrentSrc: element.currentSrc,
        image: { ordinal: expectedOrdinal, width: element.naturalWidth, height: element.naturalHeight, complete: element.complete } };
    }, ordinal);
    session.assertObservedImageUrl(observed.transientCurrentSrc, ordinal, observed.image);
    const safe = { ...observed };
    delete safe.transientCurrentSrc;
    return safe;
  });
}
