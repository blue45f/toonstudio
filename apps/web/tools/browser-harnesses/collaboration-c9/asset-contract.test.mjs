import assert from 'node:assert/strict';
import { distAssetPath, verifyAssetBytes } from './asset-contract.mjs';

const { test } = process.env.VITEST ? await import('vitest') : await import('node:test');

test('lazy 자산의 결과 경로에서 query·fragment·signed URL 값을 제거한다', () => {
  assert.equal(distAssetPath('http://127.0.0.1:5199/assets/lazy-board.js?signature=not-a-real-secret#fragment', 'http://127.0.0.1:5199'), 'assets/lazy-board.js');
});

test('다른 origin·자격증명·인코딩된 경로 탈출을 거절한다', () => {
  const withCredentials = new URL('http://127.0.0.1:5199/assets/app.js');
  withCredentials.username = 'fixture-actor';
  withCredentials.password = 'fixture-invalid-value';
  for (const address of ['http://example.invalid/assets/app.js', withCredentials.href, 'http://127.0.0.1:5199/assets/%2e%2e%2foutside.js', 'http://127.0.0.1:5199/assets/%5coutside.js', 'http://127.0.0.1:5199/assets/%00bad.js']) assert.throws(() => distAssetPath(address, 'http://127.0.0.1:5199'));
});

test('같은 bytes의 lazy JS/CSS를 허용하고 같은 길이의 변경도 거절한다', () => {
  for (const text of ['export const lazy = 1;', '.board{color:red}']) {
    const bytes = Buffer.from(text);
    const evidence = verifyAssetBytes(bytes, Buffer.from(text));
    assert.equal(evidence.actualSha256, evidence.expectedSha256);
    assert.equal(evidence.decodedBytes, bytes.length);
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    assert.throws(() => verifyAssetBytes(changed, bytes), { code: 'ERR_ASSERTION' });
  }
});
