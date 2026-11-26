/**
 * 실행: node --import tsx e2e/two-cut-synthetic.live.mts --check | dialogue | S1
 * root가 확인한 단계별 승인서는 /private/tmp/toonstudio-two-cut-<uid>/<phase>.json 에 둔다.
 * 필드와 권한은 two-cut-live-guard.mts 참고. syntheticAccountSha256은 소문자 QA 이메일의 SHA-256.
 * 서버의 실제 송신 제한과 로컬 API 프록시 목적지는 root가 별도로 확인해야 한다.
 * 실행당 새 CDP 컨텍스트를 사용한다. 실패·시간 초과 후 재호출하지 않는다.
 */
import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { isDeepStrictEqual as equal } from 'node:util';

import { chromium, expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { OpenAiScriptToCutsOutputSchema } from '@toonstudio/contracts/studio-openai-assist-result';

import { buildDialogueSuggestPrompt, formatDialogueSuggestionLine, parseDialogueSuggestResponse } from '../apps/web/src/domains/creator/lettering/studio-dialogue-suggest';
import { studioAutosaveKey } from '../apps/web/src/domains/creator/studio-autosave';
import { studioDocumentPersistenceWorkId } from '../apps/web/src/domains/creator/studio-document-persistence-scope';
import { studioProjectFeatureSuiteStorageKey } from '../apps/web/src/domains/creator/studio-project-feature-suite-store';
import { openStudioLayerNavigator, openStudioMainMenu, runStudioClarityAction } from '../scripts/lib/studio-shell-interactions';
import { readDurableStudioAutosaveDocument } from '../scripts/lib/studio-verify-durable-autosave.mjs';

import { restoreIfPrompted } from './helpers/studio-editor-restore-readiness';
import { approvalSchema, check, checkExpiry, consumeApproval, Cutoff, endpoints, origin, project, readApproval, type Approval } from './two-cut-live-guard.mts';

const a = '자료를 한 번 더 확인하고 내일 오전까지 보내도 괜찮을까요?';
const b = '회의실 문은 제가 닫을게요.';
const situation = '신입 편집자 수아가 선배 민재에게 기한 연장을 정중하게 요청한다. 내일 오전까지 보내도 될지 묻는 뜻을 살려 주세요.';
const title = '합성 검수 두 컷';
const draft = '/studio/draft/' + project + '?workspace=draw';
// S1-continuity 고정 입력. UI 실행 시 API DTO와 평가기를 불러오지 않는다.
const s1 = '정확히 4컷으로 나눠 주세요. 비 오는 정류장에 하린과 도윤이 서 있다. 하린은 우산을 들고 있고 도윤은 우산이 없다. 하린이 말없이 우산을 도윤에게 건넨다. 도윤이 ‘넌?’이라고 묻자 하린은 정류장 지붕을 가리킨다. 마지막에는 도윤만 우산을 들고 비 속으로 나가고 하린은 지붕 아래 남는다. 새 대사와 인물은 추가하지 마세요.';
let step = '승인 확인';

async function matchesInput(req: Request, gate: Approval) {
  const body = req.postDataJSON();
  if (gate.phase === 'S1') return equal(body, { mode: 'script-to-cuts', inputText: s1, targetPlatform: 'vertical-webtoon' });
  const { provider, providerOrder, ...prompt } = body;
  return (!provider || provider === 'auto' || provider === gate.provider)
    && (!providerOrder || (Array.isArray(providerOrder) && providerOrder.every(id => ['gemini', 'qwen', 'groq', 'sambanova', 'zai', 'mistral', 'cloudflare', 'openrouter', 'siliconflow'].includes(id))))
    && equal(prompt, { task: 'dialogue', promptVersion: 1, ...buildDialogueSuggestPrompt(situation, a) })
    && Boolean(await req.headerValue('idempotency-key'));
}

async function installBoundary(context: BrowserContext, gate: Approval) {
  const path = endpoints[gate.phase];
  let armed = false, forwarded = 0, violation = false, login = true;
  let dispatched = false;
  const released = Promise.withResolvers<void>();
  let switchedToB = false;
  const page = await context.newPage();
  // Chrome에서 받은 진짜 응답을 B 선택까지 보류한다. 응답 본문과 상태 코드는 그대로 전달한다.
  async function protectTab(tab: Page) {
    const cdp = await context.newCDPSession(tab);
    cdp.on('Fetch.requestPaused', event => {
      void (async () => {
        const url = new URL(event.request.url);
        const location = event.responseHeaders?.find(h => h.name.toLowerCase() === 'location')?.value;
        if (location && (url.pathname.startsWith('/api/') || new URL(location, url).origin !== origin)) {
          violation = true;
          await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
          return;
        }
        if (url.origin === origin && url.pathname === path && event.request.method === 'POST' && gate.phase === 'dialogue') await released.promise;
        await cdp.send('Fetch.continueResponse', { requestId: event.requestId });
      })().catch(() => { if (!tab.isClosed()) violation = true; });
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Response' }] });
  }
  page.on('response', response => {
    if (gate.phase === 'dialogue' && response.url() === origin + path
      && response.request().method() === 'POST' && !switchedToB) violation = true;
  });
  await protectTab(page);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (url.origin !== origin) {
      if (method === 'POST') violation = true;
      return route.abort();
    }
    if (method === 'GET' || method === 'HEAD') return route.continue();
    if (login && method === 'POST' && url.pathname === '/api/auth/login' && !url.search) {
      login = false;
      return route.continue();
    }
    if (method === 'POST' && url.pathname === path && !url.search && armed && !violation && forwarded === 0
        && req.frame() === page.mainFrame() && new URL(page.url()).pathname === (gate.phase === 'dialogue'
          ? '/studio/draft/' + project : '/studio/p/' + project + '/story')) {
      armed = false;
      try {
        check(await matchesInput(req, gate), '합성 입력 계약 불일치');
        await consumeApproval(gate);
        forwarded++;
        await route.continue();
        dispatched = true;
        return;
      } catch { violation = true; return route.abort().catch(() => {}); }
    }
    if (/^\/api\/(?:studio-ai|studio\/ai)\//.test(url.pathname) || url.pathname === path) violation = true;
    return route.abort();
  });
  return { page, protectTab, release: released.resolve, wasDispatched: () => dispatched,
    selectedB() { switchedToB = true; released.resolve(); },
    arm() { check(!violation && forwarded === 0, '요청 경계 위반'); checkExpiry(gate); login = false; armed = true; },
    verify() { check(!violation && forwarded === 1, '단일 요청 경계 위반'); } };
}
type Boundary = Awaited<ReturnType<typeof installBoundary>>;

async function localJson(page: Page, path: string) {
  const response = await page.request.get(origin + path, { maxRedirects: 0, maxRetries: 0 });
  try { check(response.status() === 200, '로컬 사전 확인 실패'); return await response.json(); }
  finally { await response.dispose(); }
}
async function authenticate(page: Page, gate: Approval) {
  await page.goto(origin + '/auth/login', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-auth-form="true"]').waitFor();
  console.log('새 QA 창에서 승인된 합성 계정으로 로그인하세요. 대기 한도는 120초입니다.');
  await page.getByRole('heading', { name: /이미 로그인되어 있어요|already signed in/i }).waitFor({ timeout: 120_000 });
  const session = await localJson(page, '/api/auth/session');
  check(session.authenticated === true && session.user?.role === 'user' && typeof session.user.id === 'string'
    && /^local-qa-[a-z0-9-]+@toonstudio-local\.test$/.test(session.user.email)
    && createHash('sha256').update(session.user.email).digest('hex') === gate.syntheticAccountSha256, '합성 계정 불일치');
  return session.user.id as string;
}
async function preflight(page: Page, gate: Approval) {
  const status = await localJson(page, gate.phase === 'dialogue' ? '/api/studio-ai/status' : endpoints.S1 + '/status');
  check(status.configured === true && status.provider === gate.provider && status.model === gate.model, '승인된 공급 경로·모델 불일치');
  if (gate.phase === 'S1') check(status.storeData === false && status.modelConfigurationError === null, 'OpenAI 경로 사용 불가');
  else {
    const configured = status.providers.filter((p: { configured: boolean }) => p.configured);
    check(status.selection?.fallback === false && configured.length === 1 && configured[0].id === gate.provider, '서버에 단일 공급 경로가 필요합니다.');
  }
}
async function submit(boundary: Boundary, gate: Approval, click: () => Promise<void>, pending?: () => Promise<void>) {
  const { page } = boundary;
  await preflight(page, gate);
  boundary.arm();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + endpoints[gate.phase] && r.request().method() === 'POST', { timeout: 75_000 }),
    (async () => {
      try {
        await click();
        if (pending) {
          await expect.poll(boundary.wasDispatched, { timeout: 10_000 }).toBe(true);
          await pending();
          boundary.selectedB();
        }
      } finally { boundary.release(); }
    })(),
  ]);
  boundary.verify();
  check(response.status() === 200 && !response.fromServiceWorker(), '공급자 성공 응답 없음');
  const reply = await response.json();
  check(reply.provider === gate.provider && reply.model === gate.responseModel && reply.failover == null
    && Number.isSafeInteger(reply.usage?.completionTokens) && reply.usage.completionTokens > 0
    && Number.isSafeInteger(reply.usage.totalTokens) && reply.usage.totalTokens >= reply.usage.completionTokens,
    '승인 모델 또는 실사용량 증거 불일치');
  console.log(JSON.stringify({ phase: gate.phase, provider: gate.provider, model: gate.responseModel, posts: 1, tokens: reply.usage.totalTokens }));
  return reply;
}

type ElementRecord = { id: string; type: string; text?: string };
type Manuscript = { id: string; elements: ElementRecord[] }[];
async function menu(page: Page, group: string, item: string) {
  return (await openStudioMainMenu(page, group)).locator('[data-studio-menu-item-id="' + item + '"]').click();
}
async function archive(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'file', 'export-json')]);
  try {
    const stream = await download.createReadStream();
    check(stream, '원고 내보내기 실패');
    return JSON.parse((await buffer(stream)).toString('utf8'));
  } finally { await download.delete(); }
}
async function elements(page: Page): Promise<Manuscript> {
  return (await archive(page)).payload.data.pagesList.map(({ id, elements }: Manuscript[number]) => ({ id, elements }));
}
async function prepare(page: Page) {
  await page.goto(origin + draft, { waitUntil: 'domcontentloaded' });
  const file = await archive(page);
  const data = file.payload.data;
  data.title = title;
  data.currentPageId = 'qa-A';
  data.pagesList = [a, b].map((text, i) => {
    const id = i === 0 ? 'A' : 'B';
    return { ...data.pagesList[0], name: id, id: 'qa-' + id, canvasH: 800, groups: [], elements: [
      { type: 'frame', id: 'frame-' + id, x: 24, y: 32, width: 640, height: 600, bgColor: '#ffffff', strokeWidth: 1 },
      { type: 'bubble', id: 'balloon-' + id, frameClipId: 'frame-' + id, variant: 'speech', text,
        x: 70, y: 100, width: 240, height: 90, fill: '#ffffff', textFill: '#000000', rotation: 0 },
    ] };
  });
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), menu(page, 'file', 'import-json')]);
  await picker.setFiles({ name: 'qa-two-cuts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByRole('heading', { name: title, exact: true }).first().waitFor();
}
async function selectBalloon(page: Page, id: 'A' | 'B') {
  await openStudioLayerNavigator(page);
  const row = page.locator('#studio-layer-balloon-' + id + ':visible');
  if (!(await row.isVisible())) {
    const select = page.getByRole('button', { name: id + ' 선택', exact: true });
    if (!(await select.isVisible())) await runStudioClarityAction(page, 'pages');
    await select.click();
    await openStudioLayerNavigator(page);
  }
  await row.click({ position: { x: 12, y: 18 } });
  await expect(row).toHaveAttribute('aria-selected', 'true');
}
async function dialoguePanel(page: Page) {
  const hub = page.locator('[data-studio-ai-assist-hub]:visible');
  if (!(await hub.isVisible())) await menu(page, 'ai', 'ai-assist');
  await hub.locator('[role="tab"][id$="-tab-dialogue"]').click();
  return hub.locator('[data-studio-ai-assist-tool-panel]');
}

async function dialogue(boundary: Boundary, gate: Approval, userId: string) {
  const { page } = boundary;
  await prepare(page);
  const before = await elements(page);
  check(before.length === 2 && before.every((p, i) => p.id === (i ? 'qa-B' : 'qa-A') && p.elements.length === 2
    && p.elements[1].id === (i ? 'balloon-B' : 'balloon-A') && p.elements[1].text === (i ? b : a)), '두 컷 초기 상태 불일치');
  const key = studioAutosaveKey({ userId, workId: studioDocumentPersistenceWorkId({ draftId: project, workId: null, remixId: null }) });
  async function saved(expected: Manuscript) {
    await expect.poll(async () => {
      const snapshot = await readDurableStudioAutosaveDocument(page, key);
      return equal(snapshot?.pagesList.map(({ id, elements }) => ({ id, elements })), expected);
    }, { timeout: 45_000 }).toBe(true);
  }
  async function reopen(expected: Manuscript) {
    const reader = await page.context().newPage();
    try {
      await boundary.protectTab(reader);
      await reader.goto(origin + draft, { waitUntil: 'domcontentloaded' });
      await restoreIfPrompted(reader, () => reader.getByRole('heading', { name: title, exact: true }).first().isVisible());
      check(equal(await elements(reader), expected), '다시 연 원고가 저장본과 다릅니다.');
    } finally { await reader.close(); }
  }
  await saved(before);
  // B 선택 경로도 유료 요청 전에 점검한다.
  await selectBalloon(page, 'B');
  await selectBalloon(page, 'A');
  const panel = await dialoguePanel(page);
  await panel.locator('textarea').fill(situation);
  await panel.getByRole('checkbox', { name: '이 페이지에 이미 배치된 대사를 맥락으로 포함' }).check();
  step = 'A 대사 요청 중 B 선택';
  const reply = await submit(boundary, gate, () => panel.getByRole('button', { name: '대사 제안 받기', exact: true }).click(),
    async () => {
      await panel.getByTestId('dialogue-suggest-cancel-btn').waitFor();
      await selectBalloon(page, 'B');
    });
  check(typeof reply.requestId === 'string' && reply.requestId.trim() && typeof reply.content === 'string', '공급자 요청 식별자 또는 대사 없음');
  const candidates = parseDialogueSuggestResponse(reply.content);
  check(candidates.ok, '공급자 후보 해석 실패');
  const index = candidates.data.findIndex(x => x.kind === 'speech' && x.text !== a && x.text !== b);
  check(index >= 0, '비교 가능한 실제 대사 없음');
  step = '후보 적용 전 원고와 대상 확인';
  check(equal(await elements(page), before), '선택하기 전에 원고가 바뀌었습니다.');
  const ready = await dialoguePanel(page);
  await ready.getByTestId('dialogue-suggest-target-lock-banner').waitFor();
  check((await ready.getByTestId('dialogue-suggest-original-box').textContent())?.includes(a), '원본 A 대사 불일치');
  const insert = ready.getByRole('button', { name: '원래 A 말풍선에 삽입', exact: true });
  await expect(insert).toHaveCount(candidates.data.length);
  const chosen = insert.nth(index);
  const line = await chosen.locator('xpath=../..').locator(':scope > p').textContent();
  check(line === formatDialogueSuggestionLine(candidates.data[index]), '화면에 표시한 후보와 공급자 응답 불일치');
  await chosen.click();
  const after = structuredClone(before);
  after[0].elements[1].text = candidates.data[index].text;
  step = '선택한 답변과 첫 저장본·다시 열기';
  check(equal(await elements(page), after), 'A 대사 외에 바뀐 원고 요소가 있습니다.');
  await saved(after);
  await reopen(after);
  step = '실행 취소와 두 번째 저장본·다시 열기';
  await menu(page, 'edit', 'undo');
  check(equal(await elements(page), before), '한 번의 실행 취소로 원본을 복원하지 못했습니다.');
  await saved(before);
  await reopen(before);
  console.log(JSON.stringify({ requestIdSha256: createHash('sha256').update(reply.requestId).digest('hex'),
    candidateIndex: index, originalTarget: 'qa-A/balloon-A', verifiedReopens: 2 }));
}

async function story(boundary: Boundary, gate: Approval) {
  const { page } = boundary;
  await page.goto(origin + '/studio/p/' + project + '/story?view=script&uiMode=full', { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('studio-project-assistant-panel');
  await panel.getByTestId('openai-mode-script-to-cuts').click();
  await panel.getByLabel('요청 내용').fill(s1);
  const beats = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.storyBeats, studioProjectFeatureSuiteStorageKey(project));
  const before = await beats();
  check(Array.isArray(before), '기획 컷 초기 상태 없음');
  step = 'S1 실제 응답과 기획 컷 사본';
  const reply = await submit(boundary, gate, () => panel.getByTestId('openai-assist-submit-btn').click());
  const parsed = OpenAiScriptToCutsOutputSchema.safeParse(reply.result?.data);
  check(reply.result?.mode === 'script-to-cuts' && parsed.success && parsed.data.cuts.length === 4 && reply.privacy?.storeData === false, 'S1 네 컷 응답 불일치');
  const cuts = parsed.data.cuts;
  check(equal(await beats(), before), '추가 전에 기획 컷이 바뀌었습니다.');
  await panel.getByRole('button', { name: '기획 컷 목록에 사본으로 추가', exact: true }).click();
  await panel.getByRole('button', { name: '기획 컷 목록에 추가됨', exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.waitFor();
  const saved = await beats();
  check(saved.length === before.length + 4 && equal(saved.slice(0, before.length), before)
    && cuts.every((cut, i) => {
      const beat = saved[before.length + i];
      return beat.kind === cut.beatKind && beat.dialogue === cut.dialogue
        && beat.summary === '[' + cut.shotType + '] ' + cut.visualAction + ' (' + cut.scrollGapHint + ')';
    }), '재열기 후 기획 컷 사본 불일치');
  await expect(page.getByRole('button', { name: '장면 삭제', exact: true })).toHaveCount(saved.length);
}

async function main() {
  const phase = process.argv[2];
  if (phase === '--check') {
    check(!approvalSchema.safeParse({}).success && !approvalSchema.safeParse({ phase: 'S1' }).success, '불완전한 승인 차단 실패');
    check(Boolean(s1) && buildDialogueSuggestPrompt(situation, a).system.includes(a), '합성 입력 준비 실패');
    console.log('dialogue · S1 입력, 모듈 로딩, 누락·불완전 승인 차단 확인'); return;
  }
  check(process.argv.length === 3 && (phase === 'dialogue' || phase === 'S1'), '단계 하나(dialogue 또는 S1)를 지정하세요.');
  const gate = await readApproval(phase);
  check(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG,
    '요청 본문을 기록할 수 있는 디버그 모드에서는 시작할 수 없습니다.');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 10_000 });
  try {
    const context = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(15_000);
    try {
      const boundary = await installBoundary(context, gate);
      step = '합성 QA 세션 확인';
      const userId = await authenticate(boundary.page, gate);
      step = '합성 프로젝트 준비';
      try {
        if (phase === 'dialogue') await dialogue(boundary, gate, userId);
        else await story(boundary, gate);
        boundary.verify();
      } finally { boundary.release(); }
    } finally { await context.close(); }
  } finally { await browser.close(); }
  console.log(phase === 'dialogue' ? 'PASS · A 적용·저장·재열기·Undo·두 번째 재열기' : 'PASS · S1 기획 컷 네 개 저장·재열기');
}
main().catch(error => {
  console.error('중단 · ' + step + (error instanceof Cutoff ? ' · ' + error.message : ''));
  process.exitCode = 1;
});
