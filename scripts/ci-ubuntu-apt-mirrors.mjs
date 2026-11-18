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
const AWS = 'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/';
const AZURE = 'http://azure.archive.ubuntu.com/ubuntu/';
const ARCHIVE = 'https://archive.ubuntu.com/ubuntu/';
const SECURITY = 'https://security.ubuntu.com/ubuntu/';
const ORIGINAL = { [AWS]: 1, [AZURE]: 1, [ARCHIVE]: 2, [SECURITY]: 3 };
const PRIORITIZED = { [AWS]: 3, [ARCHIVE]: 1, [SECURITY]: 2 };

export function prioritizeUbuntuAptMirrors(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 4096) throw new Error('APT_MIRROR_FORMAT');
  const lines = content.split(/(?<=\n)/u);
  const entries = lines.map((line) => {
    const match = /^(https?:\/\/[^\s]+)(\tpriority:)([1-9]\d*)(\r?\n)$/u.exec(line);
    if (!match || !Object.hasOwn(ORIGINAL, match[1])) throw new Error('APT_MIRROR_FORMAT');
    return { uri: match[1], priority: Number(match[3]), separator: match[2], ending: match[4] };
  });
  const ids = new Set(entries.map(({ uri }) => uri));
  if (ids.size !== entries.length || !ids.has(ARCHIVE) || !ids.has(SECURITY)
      || (ids.has(AWS) && ids.has(AZURE)) || entries.length !== (ids.has(AWS) || ids.has(AZURE) ? 3 : 2)) {
    throw new Error('APT_MIRROR_LAYOUT');
  }
  if (ids.has(AWS) && entries.every(({ uri, priority }) => priority === PRIORITIZED[uri])) {
    return { changed: false, reason: 'aws-already-prioritized', content };
  }
  if (!entries.every(({ uri, priority }) => priority === ORIGINAL[uri])) throw new Error('APT_MIRROR_PRIORITY');
  if (!ids.has(AWS)) return { changed: false, reason: ids.has(AZURE) ? 'azure-unmodified' : 'canonical-only-unmodified', content };
  return {
    changed: true,
    reason: 'aws-priorities-updated',
    content: entries.map(({ uri, separator, ending }) => `${uri}${separator}${PRIORITIZED[uri]}${ending}`).join(''),
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
