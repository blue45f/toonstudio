import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { COUNTS, artifactEvidence, assertCounts, check, digest, gitEvidence, hostEvidence, loadConfig, readJson, requireAt, sha256, snapshotDb, stats, unchangedDb, validateProfile } from './shared.mjs';
import { distAssetPath, verifyAssetBytes } from './asset-contract.mjs';
import { actualState, restoreActorContext, verifyActorSession, verifyActualProjectRead } from './actual-input.mjs';
import { createManuscriptSession, observeManuscriptImageDecode, captureManuscriptMilestones } from './manuscript-browser.mjs';
import { assertNativeDnt, launchPrivateDntBrowser, reportBrowserFailure, runWithOwnedBrowser } from './browser-finalization.mjs';
import { prepareLocalQaTls } from './local-qa-tls.mjs';

let stage = 'config';
const result = { schemaVersion: 2, status: 'not-started', verdict: '제어 측정 준비물; 최종 C9 p95 판정 불가', samples: [], apiReads: [], networkReads: [], validation: [], bootstrap: [], assets: [], concurrentReads: [], forbiddenMutations: [], blockedExternalRequests: [], pageErrors: [], db: null };
// 쿠키·토큰은 실행 중 메모리에만 보관하고 결과·로그·파일에는 쓰지 않는다.
const actorStorageStates = new Map();
let resultPath;
let saveQueue = Promise.resolve();
async function save() {
  if (!resultPath) return;
  const body = `${JSON.stringify(result, null, 2)}\n`;
  saveQueue = saveQueue.then(() => writeFile(resultPath, body, { mode: 0o600 }));
  await saveQueue;
}
function apiKind(url, projectId) {
  const path = new URL(url).pathname;
  if (path === `/api/production/projects/${encodeURIComponent(projectId)}` || path === `/api/production/projects/${projectId}`) return 'project-aggregate';
  if (path.startsWith('/api/auth/')) return 'auth';
  if (path.startsWith('/api/production/')) return 'production-other';
  if (path.startsWith('/api/creator/')) return 'creator-other';
  if (path.startsWith('/api/health/')) return 'health';
  if (path === '/api/me/merge') return 'account-bootstrap-merge';
  return 'other-api';
}
async function rendered(page, locator) {
  await locator.waitFor({ state: 'visible' });
  await page.locator('[aria-hidden="true"][data-phase]').waitFor({ state: 'hidden' });
  // semantic 완료의 두 번째 rAF 안에서 종료 시각을 고정한다. 후속 driver 왕복은 포함하지 않는다.
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const data = window.__c9Telemetry;
    resolve({ time: performance.now(), timeOrigin: performance.timeOrigin, inputs: data.inputEvents, lastInputAt: data.lastInputAt, longTaskSupported: data.observerSupported, longTasks: [...data.longTasks] });
  }))));
}
async function heap(cdp) {
  const [js, dom] = await Promise.all([cdp.send('Runtime.getHeapUsage'), cdp.send('Memory.getDOMCounters')]);
  return { checkedAt: new Date().toISOString(), js, dom, forcedGc: false, limitation: 'renderer JS heap snapshot. RSS/GPU/peak/메모리 누수 판정 아님.' };
}
async function instrumentation(context) {
  await context.addInitScript(() => {
    window.__c9Telemetry = { longTasks: [], lastInputAt: null, inputEvents: 0, observerSupported: PerformanceObserver.supportedEntryTypes.includes('longtask') };
    document.addEventListener('input', () => { window.__c9Telemetry.lastInputAt = performance.now(); window.__c9Telemetry.inputEvents++; }, true);
    if (window.__c9Telemetry.observerSupported) new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__c9Telemetry.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
}
async function measure(page, meta, action, completion, { navigation = false, startFrom = null, capturedCompletion = null, deferSave = false } = {}) {
  stage = `${meta.actorRole}/${meta.profile}/${meta.iteration}/${meta.operation}`;
  const hostStartMs = startFrom?.hostStartMs ?? performance.now();
  const startedAt = startFrom?.startedAt ?? new Date().toISOString();
  const browserStart = startFrom ? { time: startFrom.browser.startTime, timeOrigin: startFrom.browser.timeOrigin, inputs: startFrom.browser.inputEventsAtStart }
    : navigation ? null : await page.evaluate(() => ({ time: performance.now(), timeOrigin: performance.timeOrigin, inputs: window.__c9Telemetry.inputEvents }));
  await action();
  const observed = capturedCompletion?.observed ?? await completion();
  const hostEndMs = capturedCompletion?.hostEndMs ?? performance.now();
  check(observed && Number.isFinite(observed.time), 'browser semantic 완료 시각이 없습니다.');
  if (browserStart) check(browserStart.timeOrigin === observed.timeOrigin, '동작 중 문서가 바뀌어 browser interval을 비교할 수 없습니다.');
  const startTime = browserStart?.time ?? 0;
  const telemetry = { startTime, endTime: observed.time, durationMs: observed.time - startTime, timeOrigin: observed.timeOrigin,
    inputEventsAtStart: browserStart?.inputs ?? 0, inputEvents: observed.inputs - (browserStart?.inputs ?? 0), lastInputToObservedRenderMs: observed.lastInputAt === null || observed.lastInputAt < startTime ? null : observed.time - observed.lastInputAt,
    longTaskSupported: observed.longTaskSupported, longTasks: observed.longTasks.filter((entry) => entry.startTime >= startTime && entry.startTime <= observed.time) };
  const sample = { ...meta, startedAt, finishedAt: capturedCompletion?.finishedAt ?? new Date().toISOString(), hostStartMs, hostEndMs, hostElapsedMs: hostEndMs - hostStartMs, browser: telemetry,
    ...(observed.image ? { image: observed.image } : {}),
    method: startFrom ? '동일 패널 열기 시작→각 semantic milestone; 병렬 관측 시각이며 표본별 새 동작 아님' : navigation ? 'driver goto→semantic visible + 2 rAF; browser timeOrigin→rAF 안의 관측 시각' : 'driver action→semantic visible + 2 rAF; browser 시작 mark→rAF 안의 관측 시각',
    bodyValidationInsideTimedWindow: false, notInp: true };
  result.samples.push(sample);
  if (!deferSave) await save();
  return sample;
}
async function login(context, env, actor) {
  const response = await context.request.post(`${env.webOrigin}/api/auth/login`, { data: { email: actor.email, password: actor.password }, headers: { Origin: env.webOrigin, 'x-toonstudio-csrf': '1' } });
  result.authentication ??= [];
  result.authentication.push({ actorRole: actor.role, phase: 'actual-password-login', status: response.status() });
  check(response.status() === 201 || response.status() === 200, '실제 인증 로그인 실패');
  await verifyActorSession(context, env.webOrigin, actor.id);
  actorStorageStates.set(actor.id, await context.storageState());
  check((await context.cookies()).some((cookie) => cookie.httpOnly), 'HttpOnly 세션 쿠키를 확인하지 못했습니다.');
}
function verifyReadBytes(bytes, state, actorRole) {
  const payload = JSON.parse(bytes.toString('utf8'));
  if (state.actualInput) {
    const actor = state.actors.find((entry) => entry.role === actorRole);
    check(actor, '실제 원고 계정 역할이 없습니다.');
    verifyActualProjectRead(payload, state.actualInput, actor.id);
    return;
  }
  check(payload.aggregate?.projectId === state.projectId && payload.aggregate?.workId === state.workId && payload.access?.view === true, '실제 프로젝트 GET의 ID/ACL이 다릅니다.');
  assertCounts(payload.aggregate);
  check(digest(payload.aggregate) === state.aggregateSha256, '실제 GET aggregate와 seed snapshot이 다릅니다.');
  if (actorRole !== 'owner') check(payload.access.edit === false && payload.access.manage === false, 'C9 비소유자의 read-only 권한이 다릅니다.');
}
async function validateRead(response, state, actorRole, meta) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  check(response.ok(), '실제 프로젝트 GET 실패');
  const bytes = await response.body();
  verifyReadBytes(bytes, state, actorRole);
  result.validation.push({ ...meta, actorRole, kind: 'project-aggregate-json-count-digest-acl', startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, responseBodyBytes: bytes.length, timed: false, passed: true });
  return bytes.length;
}
function assetCandidate(request, env, manifestFiles) {
  const url = new URL(request.url());
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname.startsWith('/api/')) return false;
  return ['script', 'stylesheet', 'image', 'font', 'media', 'manifest'].includes(request.resourceType()) || (url.origin === env.webOrigin && manifestFiles.has(decodeURIComponent(url.pathname).replace(/^\/+/, ''))) || (url.origin === env.webOrigin && /\.(?:js|mjs|css|wasm|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp[34]|webm|ogg|bin|glb|gltf|basis|ktx2?)$/iu.test(url.pathname));
}
async function validateAsset(request, env, meta, manifestFiles) {
  const start = performance.now();
  const response = await request.response();
  check(response && response.ok(), '실제 요청된 static 자산의 응답이 실패했습니다.');
  await response.finished();
  const file = distAssetPath(request.url(), env.webOrigin);
  const bytes = await response.body();
  if (env.config.runtimeMode === 'development') {
    result.assets.push({ ...meta, file, decodedBytes: bytes.length, status: response.status(), verified: false, reason: 'development: dist 동일성 판정 불가', validationElapsedMs: performance.now() - start });
    return;
  }
  const dist = await realpath(env.config.artifact.distDir);
  const local = await realpath(resolve(dist, file));
  check(!isAbsolute(relative(dist, local)) && !relative(dist, local).startsWith('..') && (await stat(local)).isFile(), '실제 자산에 대응하는 dist 파일이 없습니다.');
  const expected = await readFile(local);
  const manifestEntry = manifestFiles.get(file);
  if (manifestEntry) check(sha256(expected) === manifestEntry.sha256, '검증 시작 후 manifest 자산의 bytes가 바뀌었습니다.');
  const proof = verifyAssetBytes(bytes, expected);
  result.assets.push({ ...meta, file, ...proof, status: response.status(), verified: true, inViteManifest: Boolean(manifestEntry), validationElapsedMs: performance.now() - start, sourceSha: env.git.sourceSha });
}
function checkMergePayload(payload) {
  const map = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  check(['ratings', 'reads', 'subscriptions', 'reviews', 'likedReviews'].every((key) => map(payload?.[key])) && Array.isArray(payload?.collections) && map(payload?.collectionIdMap), '실제 /api/me/merge 응답이 현재 HydratePayload 계약과 다릅니다.');
}
async function measureManuscript(page, cdp, env, state, actor, profile, iteration, session, freshNavigation, drain, setOperation) {
  const input = state.actualInput;
  const meta = (operation) => ({ actorRole: actor.role, profile: profile.id, iteration, operation });
  const select = page.getByRole('combobox', { name: '검수 제출본', exact: true });
  const region = page.getByRole('region', { name: '고정 제출 원고 이미지', exact: true });
  const picker = region.getByRole('combobox', { name: '이미지 순번', exact: true });
  const query = new URLSearchParams({ task: input.taskId, episode: input.episodeId });
  setOperation('viewer.navigation-render');
  await freshNavigation(`/production/projects/${encodeURIComponent(input.productionProjectId)}/review?${query}`, () => rendered(page, select));
  const before = await heap(cdp);
  setOperation('viewer.submission-select');
  await measure(page, meta('viewer.submission-select'), () => select.selectOption(input.submissionId), () => rendered(page, region));
  check(await select.inputValue() === input.submissionId, '실제 검수 제출본 선택이 다릅니다.');
  await drain();
  await region.scrollIntoViewIfNeeded();
  const openButton = region.getByRole('button', { name: '제출 원고 이미지 열기', exact: true });
  await openButton.waitFor({ state: 'visible' });
  setOperation('viewer.open-milestones');
  const hostStartMs = performance.now();
  const startedAt = new Date().toISOString();
  const browserStart = await page.evaluate(() => ({ time: performance.now(), timeOrigin: performance.timeOrigin, inputs: window.__c9Telemetry.inputEvents }));
  const anchor = { hostStartMs, startedAt, browser: { startTime: browserStart.time, timeOrigin: browserStart.timeOrigin, inputEventsAtStart: browserStart.inputs } };
  const firstOrdinal = input.measureOrdinals[0];
  // 모든 완료 관측을 click 전에 시작하고 저장 전에 각 종료 시각을 고정한다.
  const observations = await captureManuscriptMilestones({
    action: () => openButton.click(),
    completions: [
      { operation: 'viewer.first-verified-list', complete: async () => {
        await picker.locator('option').first().waitFor({ state: 'attached' });
        return rendered(page, picker);
      } },
      { operation: 'viewer.full-verified-list', complete: async () => {
        await picker.locator('option').nth(input.expectedPageCount - 1).waitFor({ state: 'attached' });
        check(await picker.locator('option').count() === input.expectedPageCount, '전체 이미지 목록의 표시 수가 다릅니다.');
        return rendered(page, picker);
      } },
      { operation: `viewer.image-${firstOrdinal}`, complete: async () => {
        const image = region.locator('img').first();
        await image.waitFor({ state: 'visible' });
        await image.scrollIntoViewIfNeeded();
        return observeManuscriptImageDecode(page, { ordinal: firstOrdinal, session });
      } },
    ],
  });
  for (const captured of observations) {
    await measure(page, { ...meta(captured.operation), milestoneStart: 'same-panel-open' }, async () => {}, async () => captured.observed,
      { startFrom: anchor, capturedCompletion: captured, deferSave: true });
  }
  await save();
  await drain();
  const afterFullList = await heap(cdp);
  for (const ordinal of input.measureOrdinals.slice(1)) {
    const operation = `viewer.image-${ordinal}`;
    setOperation(operation);
    await measure(page, { ...meta(operation), decodeStart: 'actual-page-selection' }, async () => {
      await picker.selectOption(String(ordinal));
      await region.locator('img').first().scrollIntoViewIfNeeded();
    }, () => observeManuscriptImageDecode(page, { ordinal, session }));
    await drain();
  }
  result.samples.push({ ...meta('memory-viewer-boundaries'), before: { ...before, phase: 'review landing before submitted-image panel' },
    afterFullList: { ...afterFullList, phase: 'full verified list and first image decode, before remaining selections' },
    after: { ...await heap(cdp), phase: 'after explicit image ordinal selections' }, timed: false });
  await drain();
}

async function actorProfile(browser, env, state, actor, profile) {
  const { config } = env;
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, locale: profile.locale, timezoneId: profile.timezoneId, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const pendingReads = [];
  const pendingAssets = [];
  const pendingManuscriptImages = [];
  const manuscript = state.actualInput ? createManuscriptSession({ contract: state.actualInput.contract, subject: state.actualInput.sourceEvidence.subject, imageOrigin: state.actualInput.imageOrigin, webOrigin: env.webOrigin, apiOrigin: env.apiOrigin }) : null;
  const pendingBootstrapMerges = [];
  const requestStarts = new WeakMap();
  const requestFinishes = new WeakMap();
  const requestFinishedSignals = new WeakMap();
  const validatedReads = new WeakSet();
  const manifestFiles = new Map((result.artifact.files ?? []).map((entry) => [entry.file, entry]));
  let phase = 'bootstrap';
  let iteration = null;
  let operation = 'login';
  const metadata = () => ({ actorRole: actor.role, profile: profile.id, phase, iteration, operation });
  async function drainValidation() {
    // JSON/count/digest/body copy/hash는 semantic 완료 뒤의 별도 phase에서만 한다.
    while (pendingReads.length) {
      const { response, meta } = pendingReads.shift();
      await response.finished();
      const request = response.request();
      const bodyStart = performance.now();
      const bytes = await response.body();
      const transferElapsedMs = performance.now() - bodyStart;
      const signal = requestFinishedSignals.get(request);
      if (signal) await signal.promise;
      const finished = requestFinishes.get(request);
      check(finished && !finished.failed, '실제 GET requestfinished 시각이 없거나 요청이 실패했습니다.');
      result.apiReads.push({ ...meta, ...finished, kind: apiKind(response.url(), state.projectId), status: response.status(), durationMs: finished.finishedHostMs - meta.hostStartMs, browserRequestTiming: request.timing(), responseBodyBytes: bytes.length, bodyCopyElapsedMs: transferElapsedMs, bodyMetric: 'decoded Playwright body bytes; wire transfer bytes 아님', timingMetric: 'request/response/requestfinished driver 이벤트 및 browser request.timing; body copy·검증 시간은 제외' });
      if (apiKind(response.url(), state.projectId) === 'project-aggregate') {
        const startedAt = new Date().toISOString(); const start = performance.now();
        check(response.ok(), '실제 프로젝트 GET 실패');
        verifyReadBytes(bytes, state, actor.role);
        result.validation.push({ ...meta, kind: 'project-aggregate-json-count-digest-acl', startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, responseBodyBytes: bytes.length, bodyCopyElapsedMs: transferElapsedMs, timed: false, passed: true });
        validatedReads.add(response);
      }
    }
    if (manuscript) {
      await manuscript.validatePendingPreviews();
      while (pendingManuscriptImages.length) {
        const { request } = pendingManuscriptImages.shift();
        const response = await request.response();
        check(response?.ok(), '실제 원고 이미지 응답이 실패했습니다.');
        await manuscript.validateImageRequest(response);
      }
    }
    while (pendingAssets.length) {
      const { request, meta } = pendingAssets.shift();
      await validateAsset(request, env, meta, manifestFiles);
    }
  }
  try {
    await instrumentation(context);
    // C9 조회 계측에는 WS가 필요하지 않다. 서버 연결 없이 시도만 기록하고 닫는다.
    await context.routeWebSocket('**/*', async (socket) => {
      const address = new URL(socket.url());
      address.protocol = address.protocol === 'wss:' ? 'https:' : 'http:';
      if (address.origin === env.webOrigin || address.origin === env.apiOrigin) {
        result.forbiddenMutations.push({ ...metadata(), method: 'WEBSOCKET', kind: 'websocket', blocked: true });
      } else {
        result.blockedExternalRequests.push({ ...metadata(), method: 'WEBSOCKET', resourceType: 'websocket', blocked: true });
      }
      await socket.close({ code: 1008 });
    });
    // routing은 bootstrap부터 끝까지 HTTP cache를 끈다. 응답 fixture·fulfill은 없다.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
      const manuscriptImage = manuscript?.acceptsImageRequest(request.url()) ?? false;
      if (url.origin !== env.webOrigin && url.origin !== env.apiOrigin && !manuscriptImage) {
        result.blockedExternalRequests.push({ ...metadata(), method: request.method(), resourceType: request.resourceType(), blocked: true });
        return route.abort('blockedbyclient');
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        if (phase === 'bootstrap' && request.method() === 'POST' && url.pathname === '/api/me/merge') {
          result.bootstrap.push({ ...metadata(), kind: 'actual-AppShell-me-merge-request', method: 'POST', startedAt: new Date().toISOString(), allowedOnlyBeforeMeasurement: true });
          return route.continue();
        }
        result.forbiddenMutations.push({ ...metadata(), method: request.method(), pathname: url.pathname.split('/').map((part) => /^[A-Za-z0-9_.~%+-]{32,}$/u.test(part) ? ':redacted' : part).join('/'), kind: apiKind(url, state.projectId), blocked: true });
        return route.abort('blockedbyclient');
      }
      if (manuscriptImage && request.method() !== 'GET') {
        result.forbiddenMutations.push({ ...metadata(), method: request.method(), kind: 'manuscript-image', blocked: true });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    // APIRequestContext 요청은 browser route에 걸리지 않는다. 실제 로그인은 준비 단계다.
    await login(context, env, actor);
    await validateRead(await context.request.get(`${env.webOrigin}/api/production/projects/${state.projectId}`), state, actor.role, { profile: profile.id, phase: 'preflight', iteration: null, operation: 'acl-read-preflight' });
    if (manuscript) await manuscript.prepare(context);
    const page = await context.newPage();
    const privacy = await assertNativeDnt(page);
    result.browser.privacy.actorContexts.push({ ...metadata(), ...privacy });
    page.setDefaultTimeout(config.actionTimeoutMs);
    page.setDefaultNavigationTimeout(config.navigationTimeoutMs);
    page.on('pageerror', (error) => { result.pageErrors.push({ ...metadata(), errorType: error.name }); });
    context.on('request', (request) => {
      const url = new URL(request.url());
      const meta = { ...metadata(), startedAt: new Date().toISOString(), hostStartMs: performance.now() };
      if (url.pathname.startsWith('/api/')) {
        requestStarts.set(request, meta);
        let resolveFinished;
        const promise = new Promise((resolve) => { resolveFinished = resolve; });
        requestFinishedSignals.set(request, { promise, resolve: resolveFinished });
      }
      if (phase === 'bootstrap' && request.method() === 'POST' && url.pathname === '/api/me/merge') pendingBootstrapMerges.push({ request, meta });
      if (manuscript?.acceptsImageRequest(request.url())) pendingManuscriptImages.push({ request, meta });
      else if (assetCandidate(request, env, manifestFiles)) pendingAssets.push({ request, meta });
    });
    context.on('requestfinished', (request) => { requestFinishes.set(request, { finishedAt: new Date().toISOString(), finishedHostMs: performance.now() }); requestFinishedSignals.get(request)?.resolve(); });
    context.on('requestfailed', (request) => { requestFinishes.set(request, { finishedAt: new Date().toISOString(), finishedHostMs: performance.now(), failed: true }); requestFinishedSignals.get(request)?.resolve(); });
    context.on('response', (response) => {
      manuscript?.queuePreviewResponse(response);
      const meta = requestStarts.get(response.request());
      if (meta && response.request().method() === 'GET') pendingReads.push({ response, meta: { ...meta, headersAt: new Date().toISOString(), headersHostMs: performance.now() } });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const network = new Map();
    cdp.on('Network.requestWillBeSent', (event) => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith('/api/') && event.request.method === 'GET') network.set(event.requestId, { ...metadata(), kind: apiKind(url, state.projectId), requestTimeSeconds: event.timestamp, wallTimeSeconds: event.wallTime });
    });
    cdp.on('Network.responseReceived', (event) => { const row = network.get(event.requestId); if (row) Object.assign(row, { headersTimeSeconds: event.timestamp, status: event.response.status }); });
    cdp.on('Network.loadingFinished', (event) => {
      const row = network.get(event.requestId);
      if (row) { result.networkReads.push({ ...row, finishedTimeSeconds: event.timestamp, durationMs: (event.timestamp - row.requestTimeSeconds) * 1000, encodedDataLength: event.encodedDataLength, clock: 'CDP monotonic seconds; Node 검증·body copy 제외' }); network.delete(event.requestId); }
    });
    const prefix = `/production/projects/${state.projectId}`;
    const boardPath = `${prefix}/production?boardFocus=all&boardEpisode=${encodeURIComponent(state.episodeId)}&boardArchived=0`;
    const handoffPath = `${prefix}/handoff`;
    const target = state.target;
    const board = page.getByTestId('production-work-board');
    const queue = page.getByTestId('division-handoff-queue');
    const boardSearch = board.getByRole('textbox', { name: '작업 검색', exact: true });
    const queueSearch = queue.getByRole('textbox', { name: '작업·공정·담당자 검색', exact: true });
    const boardTask = board.getByRole('button', { name: target.title, exact: true });
    const queueTask = queue.getByTestId(`division-task-${target.id}`);
    const dialog = page.getByRole('dialog', { name: target.title, exact: true });
    const readyBoard = async () => { await board.waitFor({ state: 'visible' }); await page.waitForFunction(() => document.querySelector('[data-testid="production-work-board"]')?.getAttribute('aria-busy') !== 'true'); return rendered(page, board); };
    // 실제 AppShell/StoreSync가 먼저 guest merge를 완료해야 한다. backend wiring이 없으면 실패한다.
    operation = 'AppShell-bootstrap-before-measurement';
    stage = `${actor.role}/${profile.id}/actual-AppShell-bootstrap`;
    const bootstrapStarted = performance.now();
    const mergeResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/me/merge').then((response) => ({ response }), (error) => ({ errorType: error.name }));
    await page.goto(`${env.webOrigin}${boardPath}`, { waitUntil: 'domcontentloaded' });
    const observedMerge = await mergeResponse;
    check(observedMerge.response, '실제 AppShell POST /api/me/merge를 관찰하지 못했습니다. MeController/MeService wiring을 확인하세요.');
    check(observedMerge.response.ok(), '실제 AppShell /api/me/merge 실패: backend wiring·DB 준비 상태를 확인하세요.');
    checkMergePayload(await observedMerge.response.json());
    // persist를 읽기만 하여 응답을 앱이 소비했는지 확인한다. 앱 상태·localStorage 주입은 없다.
    await page.waitForFunction((actorId) => {
      const persisted = JSON.parse(localStorage.getItem('toonstudio-store') ?? 'null');
      return persisted?.state?.libraryOwnerId === actorId && persisted?.state?.libraryMergeOwnerId === null;
    }, actor.id);
    await readyBoard();
    // 준비 중 시작된 merge 시도의 완료도 모두 관찰한 뒤 strict phase로 넘어간다.
    check(pendingBootstrapMerges.length > 0, '실제 AppShell merge request metadata가 없습니다.');
    for (const { request, meta } of pendingBootstrapMerges) {
      const response = await request.response();
      check(response && response.ok(), 'bootstrap 중 시작한 실제 /api/me/merge 시도가 실패했습니다.');
      await response.finished();
      await requestFinishedSignals.get(request)?.promise;
      const finished = requestFinishes.get(request);
      check(finished && !finished.failed, '실제 /api/me/merge 요청이 완료되지 못했습니다.');
      checkMergePayload(await response.json());
      result.bootstrap.push({ ...meta, kind: 'actual-AppShell-me-merge-attempt-finished', status: response.status(), finishedAt: new Date().toISOString(), payloadShapeVerified: true, measurementIncluded: false });
    }
    await drainValidation();
    check(result.forbiddenMutations.length === 0 && result.pageErrors.length === 0 && result.blockedExternalRequests.length === 0, 'bootstrap 중 예상 밖 mutation·pageerror·외부 요청이 발생했습니다.');
    const afterBootstrap = await snapshotDb(env, state.projectId);
    unchangedDb(state.baseline, afterBootstrap);
    result.bootstrap.push({ actorRole: actor.role, profile: profile.id, kind: 'actual-AppShell-me-merge-complete', status: observedMerge.response.status(), payloadShapeVerified: true, appConsumedResponseObserved: true, appStateInjected: false, elapsedMs: performance.now() - bootstrapStarted, source: 'actual AppShell + StoreSync; 실제 MeController/MeService 필요', productionSnapshotUnchanged: true, measurementIncluded: false });
    phase = 'measurement';
    result.bootstrap.push({ actorRole: actor.role, profile: profile.id, kind: 'strict-mutation-guard-enabled', enabledAt: new Date().toISOString(), allNonReadMethodsBlocked: true, noSilentPostExemptions: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
    if (profile.network) await cdp.send('Network.emulateNetworkConditions', profile.network);
    const freshNavigation = async (path, surface) => {
      const realGet = page.waitForResponse((response) => response.request().method() === 'GET' && apiKind(response.url(), state.projectId) === 'project-aggregate').then((response) => ({ response }), (error) => ({ errorType: error.name }));
      let observedRead;
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation, cachePhase: 'preinitialized-shell-http-cache-disabled-full-document-navigation' }, () => page.goto(`${env.webOrigin}${path}`, { waitUntil: 'domcontentloaded' }), async () => {
        observedRead = await realGet;
        check(observedRead.response?.ok(), 'navigation 중 실제 aggregate GET 응답이 없습니다.');
        return surface();
      }, { navigation: true });
      await drainValidation();
      check(validatedReads.has(observedRead.response), '측정 후 실제 navigation GET의 정합성 검증이 누락됐습니다.');
    };
    for (iteration = 1; iteration <= config.iterations; iteration++) {
      operation = 'board.navigation-render';
      await freshNavigation(boardPath, readyBoard);
      const beforeHeap = await heap(cdp);
      operation = 'board.search-fill';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => boardSearch.fill(target.title), () => rendered(page, boardTask));
      await drainValidation();
      operation = 'board.detail-open';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => boardTask.click(), () => rendered(page, dialog));
      await drainValidation();
      operation = 'board.detail-close';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => dialog.getByRole('button', { name: '대화상자 닫기', exact: true }).click(), async () => { await dialog.waitFor({ state: 'hidden' }); return rendered(page, boardTask); });
      await drainValidation();
      await boardSearch.fill('');
      await readyBoard();
      operation = 'board.search-typing';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation, characterCount: target.title.length, keyIntervalMs: config.typingKeyIntervalMs, intentionalKeyDelayLowerBoundMs: Math.max(0, target.title.length - 1) * config.typingKeyIntervalMs }, () => boardSearch.pressSequentially(target.title, { delay: config.typingKeyIntervalMs }), () => rendered(page, boardTask));
      await drainValidation();
      operation = 'handoff.navigation-render';
      await freshNavigation(handoffPath, () => rendered(page, queue));
      operation = 'handoff.search-fill';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => queueSearch.fill(target.title), () => rendered(page, queueTask));
      await drainValidation();
      await queueSearch.fill('');
      await rendered(page, queue);
      operation = 'handoff.search-typing';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation, characterCount: target.title.length, keyIntervalMs: config.typingKeyIntervalMs, intentionalKeyDelayLowerBoundMs: Math.max(0, target.title.length - 1) * config.typingKeyIntervalMs }, () => queueSearch.pressSequentially(target.title, { delay: config.typingKeyIntervalMs }), () => rendered(page, queueTask));
      await drainValidation();
      operation = 'handoff.detail-open';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => queueTask.getByRole('link', { name: '작업 상세·배정', exact: true }).click(), () => rendered(page, dialog));
      await drainValidation();
      operation = 'handoff.detail-close';
      await measure(page, { actorRole: actor.role, profile: profile.id, iteration, operation }, () => dialog.getByRole('button', { name: '대화상자 닫기', exact: true }).click(), async () => { await dialog.waitFor({ state: 'hidden' }); return readyBoard(); });
      await drainValidation();
      if (manuscript) await measureManuscript(page, cdp, env, state, actor, profile, iteration, manuscript, freshNavigation, drainValidation, (value) => { operation = value; });
      const afterHeap = await heap(cdp);
      result.samples.push({ actorRole: actor.role, profile: profile.id, iteration, operation: 'memory-between-iterations', before: { ...beforeHeap, phase: 'board landing before searches' }, after: { ...afterHeap, phase: state.actualInput ? 'after viewer returned from handoff detail' : 'board returned from handoff detail then closed' }, timed: false });
      await drainValidation();
      check(result.forbiddenMutations.length === 0 && result.pageErrors.length === 0 && result.blockedExternalRequests.length === 0, '측정 중 mutation·pageerror·외부 요청이 발생했습니다.');
      gitEvidence(config);
      await save();
    }
  } finally {
    try {
      await drainValidation();
      if (manuscript) { result.manuscripts ??= []; result.manuscripts.push({ actorRole: actor.role, profile: profile.id, ...manuscript.safeEvidence }); }
    } finally { await context.close(); }
  }
}
async function concurrentReads(browser, env, state) {
  if (!env.config.concurrentReads.enabled) return;
  check(Number.isInteger(env.config.concurrentReads.iterations) && env.config.concurrentReads.iterations >= 1, '동시 GET 반복 횟수를 명시하세요.');
  const contexts = [];
  try {
    for (const actor of env.actors) {
      const context = await restoreActorContext(browser, { storageState: actorStorageStates.get(actor.id), webOrigin: env.webOrigin, actorId: actor.id });
      contexts.push({ actor, context });
      result.authentication.push({ actorRole: actor.role, phase: 'concurrent-session-get-verified', passwordLoginRepeated: false });
    }
    for (let iteration = 1; iteration <= env.config.concurrentReads.iterations; iteration++) {
      const roundStart = performance.now();
      const pending = await Promise.all(contexts.map(async ({ actor, context }) => {
        const startedAt = new Date().toISOString();
        const start = performance.now();
        const response = await context.request.get(`${env.webOrigin}/api/production/projects/${state.projectId}`);
        // 모든 GET의 완료 시각을 JSON/count/digest 검증보다 먼저 확정한다.
        return { actor, response, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start };
      }));
      const roundElapsedMs = performance.now() - roundStart;
      const rows = [];
      for (const { actor, response, ...sample } of pending) {
        const responseBodyBytes = await validateRead(response, state, actor.role, { phase: 'concurrent-http-validation', profile: 'host-unthrottled', iteration, operation: 'concurrent-project-get' });
        rows.push({ actorRole: actor.role, iteration, ...sample, responseBodyBytes, status: response.status(), verificationIncludedInElapsed: false });
      }
      result.concurrentReads.push({ iteration, distinctActualActors: contexts.length, roundElapsedMs, rows, transport: 'host APIRequestContext HTTP; CDP CPU/network throttling 미적용; 모든 응답 완료 뒤 검증; UI 동시 편집·다수 팀원 proof 아님' });
      await save();
    }
  } finally { for (const entry of contexts) await entry.context.close(); }
}
function summarize(config, actualInput = null) {
  const groups = new Map();
  for (const sample of result.samples) {
    if (sample.timed === false) continue;
    const key = `${sample.actorRole}/${sample.profile}/${sample.operation}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  const rows = [];
  for (const [key, samples] of groups) {
    check(samples.length === config.iterations, '명시한 반복 횟수보다 원시 표본이 적습니다.');
    const initialized = samples.filter((entry) => entry.cachePhase === 'preinitialized-shell-http-cache-disabled-full-document-navigation');
    rows.push({ key, hostElapsedMs: stats(samples.map((entry) => entry.hostElapsedMs)), browserIntervalMs: stats(samples.map((entry) => entry.browser.durationMs)),
      lastInputToObservedRenderMs: samples.every((entry) => entry.browser.lastInputToObservedRenderMs !== null) ? stats(samples.map((entry) => entry.browser.lastInputToObservedRenderMs)) : null,
      cacheMode: 'HTTP cache disabled by context.route; 실제 AppShell bootstrap 완료 후',
      preinitializedShellNavigation: initialized.length ? stats(initialized.map((entry) => entry.hostElapsedMs)) : null,
      longTaskCount: stats(samples.map((entry) => entry.browser.longTasks.length)),
      longTaskTotalMs: stats(samples.map((entry) => entry.browser.longTasks.reduce((sum, task) => sum + task.duration, 0))),
      longestTaskMs: stats(samples.map((entry) => Math.max(0, ...entry.browser.longTasks.map((task) => task.duration)))),
      qualification: '관측치; C9 전용 repo 예산 없음. fill/typing/driver latency와 INP를 혼동하지 않음.' });
  }
  const expectedGroups = (envOperationCount + (actualInput ? 4 + actualInput.measureOrdinals.length : 0)) * config.actorRoles.length * config.profiles.length;
  check(rows.length === expectedGroups, '필수 operation 표본 그룹이 누락되었습니다.');
  const reads = new Map();
  for (const read of result.apiReads.filter((entry) => entry.phase === 'measurement')) {
    const key = `${read.actorRole}/${read.profile}/${read.kind}`;
    if (!reads.has(key)) reads.set(key, []);
    reads.get(key).push(read);
  }
  const networkByKind = new Map();
  for (const read of result.networkReads.filter((entry) => entry.phase === 'measurement')) {
    const key = `${read.actorRole}/${read.profile}/${read.kind}`;
    if (!networkByKind.has(key)) networkByKind.set(key, []);
    networkByKind.get(key).push(read);
  }
  const concurrentByActor = new Map();
  for (const round of result.concurrentReads) for (const sample of round.rows) {
    if (!concurrentByActor.has(sample.actorRole)) concurrentByActor.set(sample.actorRole, []);
    concurrentByActor.get(sample.actorRole).push(sample);
  }
  for (const samples of concurrentByActor.values()) check(samples.length === config.concurrentReads.iterations, '동시 GET 원시 표본이 누락되었습니다.');
  const memoryGroups = new Map();
  for (const sample of result.samples.filter((entry) => entry.timed === false)) {
    const key = `${sample.actorRole}/${sample.profile}/${sample.operation}`;
    if (!memoryGroups.has(key)) memoryGroups.set(key, []);
    memoryGroups.get(key).push(sample);
  }
  const memory = [...memoryGroups].map(([key, samples]) => {
    check(samples.length === config.iterations, '메모리 원시 표본이 누락되었습니다.');
    return { key, before: { usedJsHeapBytes: stats(samples.map((entry) => entry.before.js.usedSize)), domNodes: stats(samples.map((entry) => entry.before.dom.nodes)), documents: stats(samples.map((entry) => entry.before.dom.documents)), eventListeners: stats(samples.map((entry) => entry.before.dom.jsEventListeners)) },
      after: { usedJsHeapBytes: stats(samples.map((entry) => entry.after.js.usedSize)), domNodes: stats(samples.map((entry) => entry.after.dom.nodes)), documents: stats(samples.map((entry) => entry.after.dom.documents)), eventListeners: stats(samples.map((entry) => entry.after.dom.jsEventListeners)) },
      qualification: '서로 다른 UI 경계의 GC 미강제 snapshot. 누수·RSS·GPU·peak 합격 판정 아님.' };
  });
  return { operations: rows, memory, network: [...networkByKind].map(([key, samples]) => ({ key, cdpReadDurationMs: stats(samples.map((entry) => entry.durationMs)), encodedDataLength: stats(samples.map((entry) => entry.encodedDataLength)), clock: 'CDP monotonic; driver/body copy/검증 시간 제외' })), api: [...reads].map(([key, samples]) => ({ key, readDurationMs: stats(samples.map((entry) => entry.durationMs)), responseBodyBytes: stats(samples.map((entry) => entry.responseBodyBytes)) })), concurrentHttp: [...concurrentByActor].map(([actorRole, samples]) => ({ actorRole, elapsedMs: stats(samples.map((entry) => entry.elapsedMs)), responseBodyBytes: stats(samples.map((entry) => entry.responseBodyBytes)) })) };
}
const envOperationCount = 10;
async function main() {
  check(process.argv.length === 3, '사용법: node browser.mjs <절대 config>');
  const env = await loadConfig(process.argv[2]);
  const { config } = env;
  check(config.browserChannel === undefined || config.browserChannel === 'chrome', '브라우저 채널은 기본 Chromium 또는 설치된 Chrome만 허용합니다.');
  check(Number.isInteger(config.iterations) && config.iterations >= 2, '반복 횟수를 명시하세요(bootstrap 완료 뒤 cache-disabled navigation 최소 2회).');
  check(Number.isFinite(config.typingKeyIntervalMs) && config.typingKeyIntervalMs >= 0 && Number.isInteger(config.actionTimeoutMs) && Number.isInteger(config.navigationTimeoutMs) && config.actionTimeoutMs > 0 && config.navigationTimeoutMs > 0, '키 간격과 기능 대기 timeout을 명시하세요. timeout은 성능 합격 예산이 아닙니다.');
  check(Array.isArray(config.profiles) && config.profiles.length > 0 && new Set(config.profiles.map((profile) => profile.id)).size === config.profiles.length, '고유한 profile이 필요합니다.');
  config.profiles.forEach(validateProfile);
  await mkdir(config.outputDir, { recursive: true, mode: 0o700 });
  resultPath = join(config.outputDir, `result-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await writeFile(resultPath, '{}\n', { mode: 0o600, flag: 'wx' });
  result.startedAt = new Date().toISOString();
  result.source = env.git;
  result.host = hostEvidence();
  result.profile = { runtimeMode: config.runtimeMode, dataProfile: config.dataProfile, iterations: config.iterations, typingKeyIntervalMs: config.typingKeyIntervalMs, actionTimeoutMs: config.actionTimeoutMs, navigationTimeoutMs: config.navigationTimeoutMs, profiles: config.profiles, cpuNetworkSource: 'tests/benchmarks/harness/app-startup-perf.ts:44-68', distinctActualActors: env.actors.length, measurementOrder: 'profile→계정별 actual AppShell bootstrap→strict guard→반복; UI 순차 실행, 선택적 동시 HTTP phase 별도', cacheMode: 'HTTP cache disabled by context.route', shellState: 'preinitialized actual AppShell + successful /api/me/merge', bootstrapTimingIncluded: false };
  stage = 'artifact-provenance';
  result.artifact = await artifactEvidence(env);
  stage = 'seed-state';
  const state = env.actualInput ? actualState(env.actualInput, env) : await readJson(config.seedStatePath);
  if (!env.actualInput) {
  check(state.applied === true && state.schemaVersion === 1 && state.sourceSha === env.git.sourceSha && state.schema === env.actorsConfig.schema && state.productSchema === env.productSchema && state.projectId.startsWith('c9-') && state.workId.startsWith('c9-') && state.dataset === config.dataset && state.dataProfile === config.dataProfile, '적용 완료된 C9 seed state가 일치하지 않습니다.');
  assert.deepEqual(state.counts, COUNTS);
  assert.deepEqual(state.actors.map(({ role, id }) => ({ role, id })), env.actors.map(({ role, id }) => ({ role, id })), 'C9 seed의 실제 계정 ID가 다릅니다.');
  }
  stage = 'mutation-zero-before';
  const before = await snapshotDb(env, state.projectId);
  unchangedDb(state.baseline, before);
  check(before.aggregateSha256 === state.aggregateSha256, '측정 전 실제 aggregate digest가 다릅니다.');
  if (!env.actualInput) check(before.revision === 0 && before.eventCount === 0 && before.mutationReceiptCount === 0, '합성 측정 전 변경 수가 0이 아닙니다.');
  result.db = { before };
  result.dataset = { name: state.dataset, counts: state.counts, sha256: state.aggregateSha256, projectId: state.projectId, workId: state.workId, source: state.fixtureLimit };
  stage = 'local-qa-tls';
  const tls = await prepareLocalQaTls(env);
  const { chromium } = requireAt(config.repoRoot)('playwright');
  const { browser, privacy } = await launchPrivateDntBrowser({ chromium, outputDir: config.outputDir, launchOptions: { headless: true, ...(config.browserChannel === 'chrome' ? { channel: 'chrome' } : {}), ...tls.launchOptions } });
  await runWithOwnedBrowser(browser, async () => {
    try {
      stage = 'record-browser-start';
      result.browser = { engine: 'chromium', channel: config.browserChannel ?? 'chromium', version: browser.version(), headless: true, tls: tls.evidence, privacy: { ...privacy, actorContexts: [], scope: 'native DNT=1의 제어 측정. 분석 수집을 켠 기본 환경의 성능 판정으로 확대하지 않음.' } };
      result.status = 'running';
      await save();
      stage = 'browser-read-render-search-detail';
      for (const profile of config.profiles) for (const actor of env.actors) await actorProfile(browser, env, state, actor, profile);
      stage = 'distinct-account-concurrent-get';
      await concurrentReads(browser, env, state);
      stage = 'sample-completeness';
      result.summary = summarize(config, env.actualInput);
      check(result.forbiddenMutations.length === 0 && result.pageErrors.length === 0 && result.blockedExternalRequests.length === 0, 'mutation·pageerror·외부 요청이 발생했습니다.');
      gitEvidence(config);
      if (config.runtimeMode === 'production-preview') check(result.assets.length > 0 && result.assets.every((entry) => entry.verified === true), '실제 요청된 production 자산의 dist hash 검증이 누락됐습니다.');
    } catch (error) {
      result.originalFailureStage = stage;
      throw error;
    }
  }, async () => {
    stage = 'mutation-zero-after';
    const after = await snapshotDb(env, state.projectId);
    result.db.after = after;
    unchangedDb(before, after);
    result.db.productionMutationDelta = 0;
    result.db.productionEventDelta = 0;
    result.db.productionReceiptDelta = 0;
    await save();
  });
  result.status = 'controlled-measurement-complete';
  stage = 'record-final-result';
  result.finishedAt = new Date().toISOString();
  result.finalP95Verdict = { qualified: false, reasons: [env.actualInput ? '고정 원고의 명시 순번 decode 관측; VRAM·GPU peak·장시간 누수 판정 아님' : '대표 원고·실제 이미지 decode/VRAM 부하 없음', 'C9 전용 승인 p95/메모리 예산 없음', '로컬 단일 호스트 제어 측정; 실제 팀 파일럿 아님'], passBudgetInvented: false };
  await save();
  console.log(JSON.stringify({ status: result.status, sourceSha: env.git.sourceSha, rawSamples: result.samples.length, apiReads: result.apiReads.length, productionMutationDelta: result.db.productionMutationDelta, resultPath, finalP95Qualified: false }));
}
main().catch((error) => reportBrowserFailure({ error, result, stage, resultPath, persist: save,
  report: (summary) => {
    process.exitCode = 1;
    console.error(JSON.stringify(summary));
  },
}));
