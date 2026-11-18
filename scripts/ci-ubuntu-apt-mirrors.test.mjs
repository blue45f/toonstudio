import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constants } from 'node:fs';
import { MIRROR_PATH, prioritizeUbuntuAptMirrors, runUbuntuAptMirrorSetup } from './ci-ubuntu-apt-mirrors.mjs';

const aws = 'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:1\n';
const canonical = 'https://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';
const original = aws + canonical;
const desired = original.replace('priority:1', 'priority:3').replace('archive.ubuntu.com/ubuntu/\tpriority:2', 'archive.ubuntu.com/ubuntu/\tpriority:1').replace('security.ubuntu.com/ubuntu/\tpriority:3', 'security.ubuntu.com/ubuntu/\tpriority:2');
const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', ImageOS: 'ubuntu24' };

function fakeFs(content = original, overrides = {}) {
  const writes = [];
  const stat = { uid: 0, nlink: 1, mode: 0o100644, size: Buffer.byteLength(content), isFile: () => true, isSymbolicLink: () => false };
  const fs = {
    readFileSync: (path) => path === '/etc/os-release' ? 'ID=ubuntu\nVERSION_ID="24.04"\n' : path === '/etc/apt/sources.list.d/ubuntu.sources' ? 'URIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-security\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' : content,
    lstatSync: (path) => path === MIRROR_PATH ? stat : { isDirectory: () => true, isSymbolicLink: () => false },
    openSync: (path, flags) => { assert.equal(path, MIRROR_PATH); assert.ok(flags & constants.O_NOFOLLOW); assert.ok(flags & constants.O_NONBLOCK); return 42; },
    fstatSync: () => stat,
    writeSync: (fd, buffer, offset, length, position) => { assert.equal(fd, 42); assert.equal(position, offset); writes.push(buffer.subarray(offset, offset + length).toString()); return length; },
    ftruncateSync: () => {}, fsyncSync: () => {}, closeSync: () => {}, ...overrides,
  };
  return { fs, writes };
}
const run = (fs, extra = {}) => runUbuntuAptMirrorSetup({ fs, env, platform: 'linux', arch: 'x64', euid: 0, ...extra });

test('공식 AWS 목록의 priority만 변경하고 재실행은 멱등이다', () => {
  assert.deepEqual(prioritizeUbuntuAptMirrors(original), { changed: true, reason: 'aws-priorities-updated', content: desired });
  assert.equal(prioritizeUbuntuAptMirrors(desired).content, desired);
  assert.equal(prioritizeUbuntuAptMirrors(desired).changed, false);
  assert.equal(prioritizeUbuntuAptMirrors(original.replaceAll('\n', '\r\n')).content, desired.replaceAll('\n', '\r\n'));
});
test('관측하지 않은 Azure 및 공식 canonical-only 경로는 변경하지 않는다', () => {
  for (const content of [original.replace('us-east-2.ec2.archive', 'azure.archive'), canonical]) {
    assert.equal(prioritizeUbuntuAptMirrors(content).content, content);
    assert.equal(prioritizeUbuntuAptMirrors(content).changed, false);
  }
});
test('추가·누락·중복·비공식 URI·혼합 priority·추가 metadata를 거부한다', () => {
  for (const content of [original + aws, aws, original.replace('security.ubuntu.com', 'evil.invalid'), original.replace('priority:2', 'priority:1'), original.replace('priority:1\n', 'priority:1 arch:amd64\n'), original.replace('https://archive', 'http://archive'), original.trimEnd(), original + '# unexpected\n']) {
    assert.throws(() => prioritizeUbuntuAptMirrors(content), /APT_MIRROR_/u);
  }
});
test('고정 파일만 O_NOFOLLOW로 열고 검증된 전체 결과를 쓴다', () => {
  const { fs, writes } = fakeFs();
  assert.deepEqual(run(fs), { changed: true, reason: 'aws-priorities-updated' });
  assert.deepEqual(writes, [desired]);
});
test('플랫폼·호스팅·OS·권한 불일치에서 쓰지 않는다', () => {
  for (const extra of [{ platform: 'darwin' }, { arch: 'arm64' }, { euid: 1000 }, { env: { ...env, RUNNER_ENVIRONMENT: 'self-hosted' } }, { env: { ...env, ImageOS: 'ubuntu22' } }, { env: { ...env, RUNNER_ARCH: 'ARM64' } }]) {
    const { fs, writes } = fakeFs();
    assert.throws(() => run(fs, extra), /APT_MIRROR_RUNNER_UNSUPPORTED/u);
    assert.deepEqual(writes, []);
  }
});
test('symlink·비일반 파일·가변 경로·서식 불일치에서 쓰지 않는다', () => {
  const invalidStats = [
    { isFile: () => false, isSymbolicLink: () => true },
    { uid: 1000, nlink: 1, mode: 0o100644, size: 152, isFile: () => true },
    { uid: 0, nlink: 2, mode: 0o100644, size: 152, isFile: () => true },
    { uid: 0, nlink: 1, mode: 0o100666, size: 152, isFile: () => true },
  ];
  for (const stat of invalidStats) {
    const { fs, writes } = fakeFs(original, { fstatSync: () => stat });
    assert.throws(() => run(fs), /APT_MIRROR_FILE_UNSAFE/u);
    assert.deepEqual(writes, []);
  }
  const { fs, writes } = fakeFs(original + aws);
  assert.throws(() => run(fs), /APT_MIRROR_LAYOUT/u);
  assert.deepEqual(writes, []);
});
test('다른 source 참조와 최종 O_NOFOLLOW 거부를 실패로 전파한다', () => {
  const fixture = fakeFs();
  const read = fixture.fs.readFileSync;
  fixture.fs.readFileSync = (path) => path === '/etc/apt/sources.list.d/ubuntu.sources' ? 'URIs: https://archive.ubuntu.com/ubuntu/\n' : read(path);
  assert.throws(() => run(fixture.fs), /APT_MIRROR_SOURCE_UNEXPECTED/u);
  assert.deepEqual(fixture.writes, []);
  const race = fakeFs(original, { openSync: () => { throw Object.assign(new Error('ELOOP'), { code: 'ELOOP' }); } });
  assert.throws(() => run(race.fs), /ELOOP/u);
  assert.deepEqual(race.writes, []);
});
