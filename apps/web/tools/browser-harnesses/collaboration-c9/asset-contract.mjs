import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// 결과에는 이 상대 경로만 남긴다. query·fragment·자격증명은 보관하지 않는다.
export function distAssetPath(address, webOrigin) {
  const url = new URL(address);
  assert.equal(url.origin, webOrigin, 'dist 자산의 origin이 다릅니다.');
  assert.ok(!url.username && !url.password, '자산 URL에 자격증명이 있습니다.');
  const file = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  assert.ok(file && !file.includes('\0') && !file.includes('\\') && !file.split('/').some((part) => part === '..' || part === '.' || part === ''), 'dist 자산 경로가 유효하지 않습니다.');
  return file;
}

export function verifyAssetBytes(actual, expected) {
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const actualSha256 = digest(actual);
  const expectedSha256 = digest(expected);
  assert.equal(actualSha256, expectedSha256, '실제 응답 자산과 검증한 dist 파일의 hash가 다릅니다.');
  return { actualSha256, expectedSha256, decodedBytes: actual.length, distBytes: expected.length };
}
