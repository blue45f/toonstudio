import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { z } from 'zod';

export const origin = 'http://127.0.0.1:5273';
export const project = 'qa-two-cut-synthetic';
export const endpoints = { dialogue: '/api/studio-ai/chat', S1: '/api/studio-ai/openai-assist' } as const;
export type Phase = keyof typeof endpoints;
const directory = `/private/tmp/toonstudio-two-cut-${process.getuid!()}`;

/** root는 계정 청구 근거와 서버의 단일 송신 제한을 직접 검증한 뒤 해당 단계만 승인한다. */
export const approvalSchema = z.object({
  decision: z.literal('root-verified-billing-confirmed'), phase: z.enum(['dialogue', 'S1']),
  origin: z.literal(origin), project: z.literal(project), syntheticAccountSha256: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), model: z.string().regex(/^[\w./:-]{1,140}$/),
  responseModel: z.string().regex(/^[\w./:-]{1,140}$/), expiresAt: z.iso.datetime(),
  maxUpstreamPosts: z.literal(1), upstreamHardLimitVerified: z.literal(true),
  retries: z.literal(0), fallback: z.literal(false), production: z.literal(false),
}).strict();
export type Approval = z.infer<typeof approvalSchema>;
export function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Cutoff(message);
}
export class Cutoff extends Error {}
export function checkExpiry(gate: Approval) {
  const remaining = Date.parse(gate.expiresAt) - Date.now();
  check(remaining > 0 && remaining <= 15 * 60_000, '승인 유효 시간은 현재부터 최대 15분입니다.');
}
export async function readApproval(phase: Phase) {
  const denied = 'root의 비공개 단계별 청구 확인서가 없어 시작을 차단했습니다.';
  const dir = await lstat(directory).catch(() => null);
  check(dir && dir.isDirectory() && dir.uid === process.getuid!() && (dir.mode & 0o077) === 0, denied);
  const spent = await lstat(directory + '/' + phase + '.spent').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw new Cutoff(denied);
  });
  check(!spent, '이미 소비된 단계입니다.');
  const file = await open(`${directory}/${phase}.json`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
  check(file, denied);
  try {
    const stat = await file.stat();
    check(stat.isFile() && stat.uid === dir.uid && stat.size <= 4096 && (stat.mode & 0o077) === 0, denied);
    const parsed = approvalSchema.safeParse(JSON.parse(await file.readFile('utf8')));
    check(parsed.success && parsed.data.phase === phase, denied);
    check(phase !== 'S1' || parsed.data.provider === 'openai', denied);
    checkExpiry(parsed.data);
    return parsed.data;
  } finally { await file.close(); }
}
export async function consumeApproval(gate: Approval) {
  checkExpiry(gate);
  // 동시 실행·재시작·불명확한 응답에서도 같은 단계의 두 번째 송신을 막는다.
  const marker = await open(`${directory}/${gate.phase}.spent`, 'wx', 0o600).catch(() => null);
  check(marker, '이미 소비했거나 기록할 수 없는 승인입니다.');
  await marker.close();
}
