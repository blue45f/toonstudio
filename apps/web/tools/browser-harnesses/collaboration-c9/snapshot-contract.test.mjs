import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSnapshot } from './snapshot-contract.mjs';
import { unchangedDb } from './shared.mjs';

function raw() {
  return { projectId: 'c9-pure-test-project', workId: 'c9-pure-test-work', revision: 0, aggregateSha256: 'unchanged', eventCount: 0, mutationReceiptCount: 0,
    work: { id: 'c9-pure-test-work', revision: 1, updatedAt: new Date('2026-10-29T01:02:03.456Z') },
    memberships: [{ userId: 'pure-viewer', role: 'viewer', status: 'active' }], checkedAt: 'first-check' };
}

test('PG Date snapshot을 ISO로 쓰면 JSON roundtrip 뒤 동일 데이터가 무변경 비교를 통과한다', () => {
  const original = raw();
  const snapshot = normalizeSnapshot(original);
  const persisted = JSON.parse(JSON.stringify(snapshot));
  const requery = normalizeSnapshot({ ...raw(), checkedAt: 'second-check' });
  unchangedDb(persisted, requery);
  assert.equal(snapshot.work.updatedAt, '2026-10-29T01:02:03.456Z');
  assert.ok(original.work.updatedAt instanceof Date);
  assert.notEqual(snapshot.work, original.work);
});

test('중첩 배열의 Date와 UTC offset도 ISO로 통일하고 무효 날짜는 거절한다', () => {
  assert.deepEqual(normalizeSnapshot({ entries: [{ at: new Date('2026-10-29T10:02:03.456+09:00') }, null] }), { entries: [{ at: '2026-10-29T01:02:03.456Z' }, null] });
  assert.throws(() => normalizeSnapshot({ at: new Date('invalid') }), RangeError);
});

for (const [name, change] of [
  ['원고 timestamp', (value) => { value.work.updatedAt = '2026-10-29T01:02:03.457Z'; }],
  ['원고 revision', (value) => { value.work.revision++; }],
  ['aggregate digest', (value) => { value.aggregateSha256 = 'changed'; }],
  ['production revision', (value) => { value.revision++; }],
  ['event count', (value) => { value.eventCount++; }],
  ['receipt count', (value) => { value.mutationReceiptCount++; }],
  ['membership 권한', (value) => { value.memberships[0].role = 'editor'; }],
  ['membership 회수', (value) => { value.memberships[0].status = 'revoked'; }],
]) test(`${name}의 실제 변경은 JSON roundtrip 뒤에도 거절한다`, () => {
  const before = JSON.parse(JSON.stringify(normalizeSnapshot(raw())));
  const after = normalizeSnapshot(raw());
  change(after);
  assert.throws(() => unchangedDb(before, after), { code: 'ERR_ASSERTION' });
});
