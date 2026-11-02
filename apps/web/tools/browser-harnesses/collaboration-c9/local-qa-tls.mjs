import { createHash, X509Certificate } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';

const QA_ROOT = '/tmp/toon-collaboration-c9-real-qa';
function check(value, message) {
  if (value) return;
  const error = new Error(message);
  error.name = 'C9PreconditionError';
  error.c9SafeMessage = message;
  throw error;
}
function within(root, target) {
  const part = relative(root, target);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith('../');
}
function imageOrigin(value) {
  let url;
  try { url = new URL(value); } catch { check(false, 'QA 이미지 TLS origin의 형식이 다릅니다.'); }
  check(value === url.origin && url.protocol === 'https:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/',
  'QA 이미지 TLS는 명시한 HTTPS loopback origin만 허용합니다.');
  return url;
}

/** 기존 Host 검증기와 같은, 소유 QA leaf 하나의 SPKI 예외만 새 Chromium에 적용한다. */
export async function prepareLocalQaTls(env, { now = Date.now() } = {}) {
  const storage = env.actorsConfig?.storage;
  if (!env.actualInput || storage?.certificatePath === undefined) {
    return { launchOptions: {}, evidence: { mode: 'system-trust' } };
  }
  check(storage.qaOnly === true && env.actualInput, '공개 QA 인증서 예외에는 실제 원고와 QA 전용 storage가 필요합니다.');
  const origin = imageOrigin(storage.baseUrl);
  check(env.actualInput.imageOrigin === origin.origin, '실제 원고와 QA storage의 이미지 origin이 다릅니다.');
  check(typeof env.config?.expectedPgData === 'string' && isAbsolute(env.config.expectedPgData)
    && typeof storage.certificatePath === 'string' && isAbsolute(storage.certificatePath)
    && typeof env.actorsConfig.cleanup?.pgData === 'string'
    && resolve(env.actorsConfig.cleanup?.pgData ?? '') === resolve(env.config.expectedPgData),
  '공개 QA 인증서의 소유 infra 경로가 다릅니다.');
  check(['.crt', '.cer', '.pem'].includes(extname(storage.certificatePath).toLowerCase()), '공개 QA 인증서 파일만 지정하세요.');
  const qaRoot = await realpath(QA_ROOT);
  const infra = await realpath(dirname(env.config.expectedPgData));
  const certificateParent = await realpath(dirname(storage.certificatePath));
  // macOS의 /tmp 별칭도 양쪽 부모를 정규화한 뒤 같은 소유 범위로 비교한다.
  check(within(qaRoot, infra) && (certificateParent === infra || within(infra, certificateParent)),
    '공개 QA 인증서는 이번 infra 안에 있어야 합니다.');
  const info = await lstat(storage.certificatePath);
  check(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 16_384,
    '공개 QA 인증서는 작은 일반 파일이어야 합니다.');
  const certificatePath = await realpath(storage.certificatePath);
  check(within(infra, certificatePath), '공개 QA 인증서가 소유 infra 밖을 가리킵니다.');
  const bytes = await readFile(certificatePath);
  // 키나 여러 인증서가 섞인 PEM 묶음을 SPKI 예외의 입력으로 사용하지 않는다.
  check(bytes.length <= 16_384 && /^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----$/u.test(bytes.toString('utf8').trim()),
    '단일 공개 QA 인증서 PEM이 필요합니다.');
  let certificate;
  try { certificate = new X509Certificate(bytes); } catch { check(false, '공개 QA 인증서를 읽을 수 없습니다.'); }
  const validFrom = Date.parse(certificate.validFrom), validTo = Date.parse(certificate.validTo);
  check(certificate.ca === false && Number.isFinite(now) && Number.isFinite(validFrom) && Number.isFinite(validTo)
    && validFrom <= now && now < validTo, '현재 유효한 QA 서버 leaf 인증서가 필요합니다.');
  const host = origin.hostname.replace(/^\[|\]$/gu, '');
  const matches = isIP(host) ? certificate.checkIP(host)
    : certificate.checkHost(host, { subject: 'never', wildcards: false });
  check(matches === host, '공개 QA 인증서 SAN과 이미지 호스트가 다릅니다.');
  const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  return {
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${spki}`] },
    evidence: { mode: 'qa-loopback-leaf-spki', certificateSha256: createHash('sha256').update(certificate.raw).digest('hex') },
  };
}
