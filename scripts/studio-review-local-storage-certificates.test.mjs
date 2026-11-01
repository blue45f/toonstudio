import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const helperUrl = new URL("./studio-review-local-storage-runtime.mjs", import.meta.url).href;

test("점이 포함된 TMPDIR에서도 실제 QA 인증서와 serial을 소유 폴더 안에만 생성한다", { timeout: 30_000 }, async () => {
  // 기본 serial 경로가 잘못 계산되어도 저장소나 다른 임시 자료를 건드리지 않는다.
  const owned = await mkdtemp("/tmp/toonstudio-qa-certificates-");
  const temporary = path.join(owned, "cache.with.dots");
  const cwd = path.join(owned, "working");
  await mkdir(temporary, { mode: 0o700 });
  await mkdir(cwd, { mode: 0o700 });
  const script = `
    import assert from 'node:assert/strict';
    import { createPrivateKey, X509Certificate } from 'node:crypto';
    import { readFile, readdir, stat } from 'node:fs/promises';
    import path from 'node:path';
    import { createStudioReviewQaCertificates } from ${JSON.stringify(helperUrl)};
    const directory = await createStudioReviewQaCertificates();
    assert.equal(path.dirname(directory), process.env.TMPDIR);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    const serial = (await readFile(path.join(directory, 'ca.srl'), 'utf8')).trim();
    assert.match(serial, /^[a-f0-9]+$/iu);
    const ca = new X509Certificate(await readFile(path.join(directory, 'ca.crt')));
    const leaf = new X509Certificate(await readFile(path.join(directory, 'public.crt')));
    assert.equal(ca.ca, true);
    assert.equal(leaf.checkIssued(ca), true);
    assert.equal(leaf.verify(ca.publicKey), true);
    assert.equal(leaf.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(leaf.checkHost('localhost'), 'localhost');
    assert.equal(leaf.checkPrivateKey(createPrivateKey(await readFile(path.join(directory, 'private.key')))), true);
    for (const file of ['ca.key', 'private.key']) {
      assert.equal((await stat(path.join(directory, file))).mode & 0o777, 0o600);
    }
    assert.deepEqual((await readdir(process.cwd())).sort(), []);
    console.log(JSON.stringify({ certificateVerified: true, privateKeyModesVerified: true }));
  `;
  try {
    const result = await run(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      env: { PATH: process.env.PATH, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      timeout: 25_000,
      maxBuffer: 64 * 1024,
    });
    assert.deepEqual(JSON.parse(result.stdout), { certificateVerified: true, privateKeyModesVerified: true });
    assert.deepEqual((await readdir(owned)).sort(), ["cache.with.dots", "working"]);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});
