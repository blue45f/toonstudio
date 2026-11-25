#!/usr/bin/env node
/**
 * GitHub 호스팅 Ubuntu 24 AWS 러너에서 기존 공식 HTTPS 미러를 우선한다.
 * URI·서명 키·suite는 유지하고 검증한 mirrorlist의 priority만 바꾼다.
 * https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh
 */
import * as nodeFs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const MIRROR_PATH = '/etc/apt/apt-mirrors.txt';
const MIRROR_KINDS = new Map([
  ['http://us-east-1.ec2.archive.ubuntu.com/ubuntu/', 'aws'],
  ['http://us-east-2.ec2.archive.ubuntu.com/ubuntu/', 'aws'],
  ['http://us-west-2.ec2.archive.ubuntu.com/ubuntu/', 'aws'],
  ['http://azure.archive.ubuntu.com/ubuntu/', 'azure'],
  ['https://archive.ubuntu.com/ubuntu/', 'archive'],
  ['https://security.ubuntu.com/ubuntu/', 'security'],
]);
const ORIGINAL = { aws: 1, azure: 1, archive: 2, security: 3 };
const PRIORITIZED = { aws: 3, archive: 1, security: 2 };

export function prioritizeUbuntuAptMirrors(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 4096) throw new Error('APT_MIRROR_FORMAT');
  const lines = content.split(/(?<=\n)/u);
  const entries = lines.map((line) => {
    const match = /^(https?:\/\/[^\s]+)(\tpriority:)([1-9]\d*)(\r?\n)$/u.exec(line);
    if (!match || !MIRROR_KINDS.has(match[1])) throw new Error('APT_MIRROR_FORMAT');
    const [, uri, separator, priority, ending] = match;
    return { uri, kind: MIRROR_KINDS.get(uri), priority: Number(priority), separator, ending };
  });
  const kinds = new Set(entries.map(({ kind }) => kind));
  if (kinds.size !== entries.length || !kinds.has('archive') || !kinds.has('security') || entries.length > 3) {
    throw new Error('APT_MIRROR_LAYOUT');
  }
  if (kinds.has('aws') && entries.every(({ kind, priority }) => priority === PRIORITIZED[kind])) {
    return { changed: false, reason: 'aws-already-prioritized', content };
  }
  if (!entries.every(({ kind, priority }) => priority === ORIGINAL[kind])) throw new Error('APT_MIRROR_PRIORITY');
  if (!kinds.has('aws')) return { changed: false, reason: kinds.has('azure') ? 'azure-unmodified' : 'canonical-only-unmodified', content };
  return {
    changed: true,
    reason: 'aws-priorities-updated',
    content: entries.map(({ uri, kind, separator, ending }) => `${uri}${separator}${PRIORITIZED[kind]}${ending}`).join(''),
  };
}

export function validateHostedUbuntu24({ env, platform, arch, euid, osRelease }) {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted'
      || env.RUNNER_OS !== 'Linux' || env.RUNNER_ARCH !== 'X64' || env.ImageOS !== 'ubuntu24'
      || platform !== 'linux' || arch !== 'x64' || euid !== 0
      || !/^ID=(?:ubuntu|"ubuntu")$/mu.test(osRelease)
      || !/^VERSION_ID=(?:24\.04|"24\.04")$/mu.test(osRelease)) {
    throw new Error('APT_MIRROR_RUNNER_UNSUPPORTED');
  }
}

function verifyFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink?.() || stat.uid !== 0 || stat.nlink !== 1 || (stat.mode & 0o022) !== 0
      || stat.size < 1 || stat.size > 4096) throw new Error('APT_MIRROR_FILE_UNSAFE');
}

export function runUbuntuAptMirrorSetup({
  env = process.env, platform = process.platform, arch = process.arch, euid = process.geteuid?.(), fs = nodeFs,
} = {}) {
  validateHostedUbuntu24({ env, platform, arch, euid, osRelease: fs.readFileSync('/etc/os-release', 'utf8') });
  for (const path of ['/etc', '/etc/apt']) {
    const stat = fs.lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('APT_MIRROR_PARENT_UNSAFE');
  }
  const sources = fs.readFileSync('/etc/apt/sources.list.d/ubuntu.sources', 'utf8');
  if (!/^URIs:[ \t]+mirror\+file:\/etc\/apt\/apt-mirrors\.txt\r?$/mu.test(sources)) {
    throw new Error('APT_MIRROR_SOURCE_UNEXPECTED');
  }
  verifyFile(fs.lstatSync(MIRROR_PATH));
  const fd = fs.openSync(MIRROR_PATH, nodeFs.constants.O_RDWR | nodeFs.constants.O_NOFOLLOW | nodeFs.constants.O_NONBLOCK);
  try {
    verifyFile(fs.fstatSync(fd));
    const result = prioritizeUbuntuAptMirrors(fs.readFileSync(fd, 'utf8'));
    if (result.changed) {
      const output = Buffer.from(result.content);
      let offset = 0;
      while (offset < output.length) {
        const written = fs.writeSync(fd, output, offset, output.length - offset, offset);
        if (!Number.isInteger(written) || written < 1) throw new Error('APT_MIRROR_WRITE_FAILED');
        offset += written;
      }
      fs.ftruncateSync(fd, output.length);
      fs.fsyncSync(fd);
    }
    return { changed: result.changed, reason: result.reason };
  } finally {
    fs.closeSync(fd);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('APT_MIRROR_ARGUMENTS_UNSUPPORTED');
    console.log(JSON.stringify(runUbuntuAptMirrorSetup()));
  } catch (error) {
    console.error(`Ubuntu APT 미러 준비 실패: ${error instanceof Error ? error.message : 'UNKNOWN'}`);
    process.exitCode = 1;
  }
}
