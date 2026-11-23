import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

const sha = input => createHash('sha256').update(input).digest('hex');
const digest = value => sha(JSON.stringify(value));
const asBlocks = content => typeof content === 'string' ? [{ type: 'text', text: content }] : content;
const knownPath = '/api/studio-ai/messages';

function inspectMessages(messages) {
  const images = [];
  const bytes = [];
  const items = messages.map((message, messageIndex) => {
    assert.ok(['user','assistant'].includes(message.role), 'unexpected role');
    const blocks = asBlocks(message.content).map((block, blockIndex) => {
      if (block.type === 'text') {
        assert.equal(typeof block.text, 'string');
        return { type: 'text', sha256: sha(block.text), length: block.text.length };
      }
      assert.equal(block.type, 'image');
      assert.equal(block.source?.type, 'base64');
      const { media_type: mime, data } = block.source;
      assert.ok(['image/jpeg','image/png','image/webp'].includes(mime), 'non-fixture MIME');
      assert.ok(typeof data === 'string' && data.length > 0 && data.length <= 8_000_000,
        'invalid fixture base64 length');
      const buffer = Buffer.from(data, 'base64');
      assert.ok(buffer.length > 0 && buffer.toString('base64') === data, 'noncanonical image encoding');
      const item = { messageIndex, blockIndex, mime, byteLength: buffer.length,
        base64Length: data.length, sha256: sha(buffer), base64Sha256: sha(data) };
      images.push(item);
      bytes.push(buffer);
      return { type: 'image', ...item };
    });
    return { role: message.role, sha256: digest(message), blocks };
  });
  return { messages: items, images, bytes };
}

function messageEnvelope(text, n) {
  return { message: {
    id: 'msg_local_qa_' + n, type: 'message', role: 'assistant', model: 'qa-loopback',
    content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 9, output_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  }};
}

function validAlt(label) {
  return JSON.stringify({ short: label, long: label + ' 합성 이미지 설명.', panels: [], warnings: [] });
}

export function createRepairMock({ mode, record, page }) {
  assert.ok(['success','cancel','stop'].includes(mode), 'unsupported repair scenario');
  const calls = [];
  const failures = [];
  const marker = 'QA-TRUNCATED-' + randomUUID();
  const truncated = '{"short":"' + marker + '","long":"cut';
  let original;
  let bAllowed = false;
  let repairReleased = false;
  let repairDone;
  let finishRepair;
  let unblock;
  const held = new Promise(resolve => { unblock = resolve; });
  const originAtRequest = () => new URL(page.url()).origin;
  const event = item => {
    if (typeof record === 'function') record(item);
  };
  if (record && typeof record === 'object' && !Array.isArray(record)) record.repairCalls = calls;

  async function handle(route) {
    const req = route.request();
    const n = calls.length + 1;
    const kind = n === 1 ? 'A-initial' : n === 2 ? 'A-repair'
      : n === 3 && mode === 'cancel' && bAllowed ? 'B-explicit' : 'extra';
    const item = { n, mode, kind, responseDisposition: 'received' };
    calls.push(item);
    try {
      const url = new URL(req.url());
      assert.ok(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)
        && url.origin === originAtRequest() && !url.username && !url.password
        && url.pathname === knownPath && !url.search && !url.hash, 'unexpected request origin or path');
      assert.equal(req.method(), 'POST', 'expected Messages POST');
      const body = req.postDataJSON();
      assert.ok(body?.system && body?.output_config?.format?.schema, 'missing system or output schema');
      assert.equal(body.output_config.format.type, 'json_schema');
      assert.ok(Array.isArray(body.messages), 'missing message list');
      const detail = inspectMessages(body.messages);
      const key = req.headers()['idempotency-key'];
      assert.ok(typeof key === 'string' && key.trim().length > 0, 'missing idempotency key');
      const originalCount = original?.messages.length ?? body.messages.length;
      const prefix = body.messages.slice(0, originalCount);
      const echoText = asBlocks(body.messages[originalCount]?.content ?? '').map(b => b.text ?? '').join('');
      const lastText = asBlocks(body.messages.at(-1)?.content ?? '').map(b => b.text ?? '').join('');
      Object.assign(item, {
        roles: body.messages.map(m => m.role), messages: detail.messages, images: detail.images,
        bodySha256: digest(body), systemSha256: digest(body.system),
        schemaSha256: digest(body.output_config.format.schema),
        originalMessagesSha256: digest(prefix), idempotencyKeySha256: sha(key),
        sameSystemAsA: original ? isDeepStrictEqual(body.system, original.system) : null,
        sameSchemaAsA: original ? isDeepStrictEqual(body.output_config.format.schema, original.schema) : null,
        sameOriginalMessagesAsA: original ? isDeepStrictEqual(prefix, original.messages) : null,
        sameImageBytesAsA: original ? detail.bytes.length === original.bytes.length
          && detail.bytes.every((buffer,i) => buffer.equals(original.bytes[i])) : null,
        invalidJsonEchoExact: echoText === truncated,
        containsInvalidMarker: body.messages.some(m => asBlocks(m.content).some(b => b.type === 'text' && b.text.includes(marker))),
        repairInstructionPresent: /JSON/.test(lastText) && /스키마/.test(lastText) && /다시 출력/.test(lastText),
        idempotencyKeyChanged: n === 1 ? null : calls.slice(0,-1).every(prev => prev.idempotencyKeySha256 !== sha(key))
      });
      assert.notEqual(kind, 'extra', 'unexpected or unapproved extra Messages POST');
      assert.equal(item.images.length, 1, 'expected just one source image');
      if (kind === 'A-initial') {
        assert.deepEqual(item.roles, ['user']);
        original = { messages: body.messages, system: body.system, schema: body.output_config.format.schema, bytes: detail.bytes };
      } else if (kind === 'A-repair') {
        assert.deepEqual(item.roles, ['user','assistant','user']);
        for (const fact of ['sameSystemAsA','sameSchemaAsA','sameOriginalMessagesAsA','sameImageBytesAsA',
          'invalidJsonEchoExact','containsInvalidMarker','repairInstructionPresent','idempotencyKeyChanged']) {
          assert.equal(item[fact], true, 'repair contract: ' + fact);
        }
        if (mode !== 'success') {
          repairDone = new Promise(resolve => { finishRepair = resolve; });
          item.responseDisposition = 'held';
          event({ type: 'repair-held', n });
          await held;
        }
      } else {
        assert.equal(repairReleased, true);
        assert.deepEqual(item.roles, ['user']);
        assert.equal(item.sameImageBytesAsA, false);
        assert.equal(item.containsInvalidMarker, false);
        assert.equal(item.idempotencyKeyChanged, true);
      }
      const text = kind === 'A-initial' ? truncated : validAlt(kind === 'A-repair' ? 'QA-A-복구설명' : 'QA-B-새설명');
      item.responseKind = kind === 'A-initial' ? 'valid-envelope-truncated-json' : 'valid-envelope-valid-json';
      item.responseTextSha256 = sha(text);
      try {
        await route.fulfill({ status:200, contentType:'application/json', headers:{ 'Cache-Control':'no-store' },
          body: JSON.stringify(messageEnvelope(text,n)) });
        item.responseDisposition = 'fulfilled';
      } catch (error) {
        const aborted = mode !== 'success' && kind === 'A-repair' && repairReleased && !page.isClosed()
          && /Invalid InterceptionId|No request with given id|Request is already handled|net::ERR_ABORTED/i.test(String(error));
        if (!aborted) throw error;
        item.responseDisposition = 'aborted-before-fulfill';
      }
      event({ type:'repair-response', n, kind, disposition:item.responseDisposition });
    } catch (error) {
      // 오류 메시지에는 assert의 actual/expected나 Playwright 요청 정보를 보관하지 않는다.
      failures.push({ n, check: error.code === 'ERR_ASSERTION' ? 'contract-assertion' : 'unexpected-handler-error' });
      item.responseDisposition = 'blocked';
      await route.abort('blockedbyclient').catch(() => {});
    } finally {
      if (kind === 'A-repair') finishRepair?.();
    }
  }

  function assertHealthy() {
    assert.equal(failures.length, 0, 'mock rejected a request: ' + JSON.stringify(failures));
  }
  async function waitForCalls(n, timeout=20_000) {
    const deadline = Date.now()+timeout;
    while (calls.length < n) {
      assertHealthy();
      assert.ok(Date.now() < deadline, 'timed out waiting for Messages POST ' + n);
      await delay(20);
    }
    assertHealthy();
    return calls[n-1];
  }
  async function releaseRepair() {
    assertHealthy();
    assert.ok(mode !== 'success' && calls[1]?.responseDisposition === 'held' && !repairReleased, 'no held repair to release');
    repairReleased = true;
    unblock();
    await repairDone;
    assertHealthy();
  }
  function allowB() {
    assertHealthy();
    assert.ok(mode === 'cancel' && repairReleased && calls.length === 2 && !bAllowed, 'B must follow cancelled A repair');
    bAllowed = true;
  }
  async function assertComplete() {
    const expected = mode === 'cancel' ? 3 : 2;
    await waitForCalls(expected);
    const deadline = Date.now()+5000;
    while (calls.some(c => ['received','held'].includes(c.responseDisposition))) {
      assertHealthy();
      assert.ok(Date.now() < deadline, 'a mock response never completed');
      await delay(20);
    }
    assertHealthy();
    assert.equal(calls.length, expected);
    assert.equal(calls[0].responseDisposition, 'fulfilled');
    assert.ok(calls[1].responseDisposition === 'fulfilled' || (mode !== 'success'
      && calls[1].responseDisposition === 'aborted-before-fulfill'));
    if (mode === 'cancel') assert.equal(calls[2].responseDisposition, 'fulfilled');
    return { mode, count:calls.length, markerSha256:sha(marker), invalidJsonSha256:sha(truncated), calls };
  }
  return { calls, handle, releaseRepair, allowB, assertComplete, waitForCalls };
}
