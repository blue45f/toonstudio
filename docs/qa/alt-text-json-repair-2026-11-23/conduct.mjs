import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  altRoot, button, captureArtwork, currentDocument, dismissCoach, fixture,
  openFeature, visible, waitUntil,
} from './helpers.mjs';

const resultA = 'QA-A-복구설명';
const resultB = 'QA-B-새설명';

function compareDocument(baseline, actual) {
  assert.ok(actual, '저장된 편집 문서가 필요합니다.');
  assert.equal(actual.key, baseline.key, '다시 연 문서 식별자');
  assert.equal(actual.drawCount, baseline.drawCount, '그림 개체 수');
  assert.deepEqual(actual.drawIds, baseline.drawIds, '그림 개체 식별자와 순서');
  assert.equal(actual.pageDigest, baseline.pageDigest, '저장된 페이지 내용');
  assert.equal(actual.containsAorB, false, '저장된 페이지에 대체텍스트 결과 없음');
}

function compareArtwork(before, after) {
  assert.ok(before.width > 0 && before.height > 0 && before.rgbaHash, '기준 그림의 크기와 픽셀 지문');
  assert.equal(after.width, before.width, '그림의 가로 픽셀 수');
  assert.equal(after.height, before.height, '그림의 세로 픽셀 수');
  assert.equal(after.rgbaHash, before.rgbaHash, '그림 전체의 RGBA 지문');
}

async function readDialog(dialog) {
  return dialog.evaluate((element) => ({
    body: element.innerText,
    values: Array.from(element.querySelectorAll('input:not([type=file]),textarea'), (input) => input.value),
    images: Array.from(element.querySelectorAll('img'), (image) => image.alt),
  }));
}

async function assertAbsent(dialog, ...markers) {
  const snapshot = await readDialog(dialog);
  for (const marker of markers) {
    assert.ok(!snapshot.body.includes(marker), '결과가 대화상자 본문에 없어야 합니다.');
    assert.ok(snapshot.values.every(value => !value.includes(marker)), '결과가 편집할 수 있는 값에 없어야 합니다.');
    assert.ok(snapshot.images.every(value => !value.includes(marker)), '결과가 미리보기 설명에 없어야 합니다.');
  }
}

async function setFixture(page, dialog, label) {
  const file = await fixture(page, label);
  await dialog.locator('input[type=file]').setInputFiles(file);
  const image = dialog.locator('img');
  const width = label === 'A' ? 96 : 112;
  await waitUntil(async () => (
    await image.evaluate(img => img.complete && img.naturalWidth).catch(() => 0)
  ) === width && await button(dialog, '설명 만들기').isEnabled(), label + ' 이미지 준비');
  return image;
}

async function checkResult(dialog, expected, forbidden) {
  const preview = dialog.getByRole('img', { name: expected, exact: true });
  await preview.waitFor({ state: 'visible' });
  const view = await readDialog(dialog);
  assert.equal(await dialog.getByLabel('한 줄 대체 텍스트', { exact: true }).inputValue(), expected);
  assert.ok(view.values.includes(expected), '짧은 대체텍스트 편집칸에 정확한 결과가 보여야 합니다.');
  assert.ok(view.images.includes(expected), '이미지 대체텍스트에 같은 결과가 반영되어야 합니다.');
  await assertAbsent(dialog, forbidden);
}

async function startMonitor(dialog, cancel) {
  await dialog.evaluate((root, cancelMode) => {
    const findings = { samples: 0, staleA: 0, malformed: 0, firstShort: null };
    function sample() {
      findings.samples++;
      const edits = Array.from(root.querySelectorAll('input:not([type=file]),textarea'), el => el.value);
      const alts = Array.from(root.querySelectorAll('img'), el => el.alt);
      const snapshot = [root.innerText, ...edits, ...alts];
      if (snapshot.some(s => s.includes('QA-TRUNCATED-'))) findings.malformed++;
      if (cancelMode && snapshot.some(s => s.includes('QA-A-복구설명'))) findings.staleA++;
      const field = Array.from(root.querySelectorAll('[data-claude-alt-result] input,[data-claude-alt-result] textarea'))
        .find(el => el.getAttribute('aria-label') === '한 줄 대체 텍스트'
          || Array.from(el.labels || []).some(label => label.textContent.includes('한 줄 대체 텍스트'))
          || (el.getAttribute('aria-labelledby') || '').split(/\s+/).some(id => document.getElementById(id)?.textContent?.includes('한 줄 대체 텍스트')));
      if (field?.value && findings.firstShort === null) findings.firstShort = field.value;
    }
    let frame;
    const paint = () => { sample(); frame = requestAnimationFrame(paint); };
    const observer = new MutationObserver(sample);
    observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
    paint();
    window.__qa4d16RepairMonitorStop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      sample();
      return findings;
    };
  }, cancel);
}

export async function runScenario({ page, mode, mock, record, dir, baseline }) {
  assert.ok(['success', 'cancel'].includes(mode));
  assert.ok(baseline?.drawCount > 0 && baseline.pageDigest && !baseline.containsAorB, '합성 획이 영속 저장된 시작 문서');
  const cancel = mode === 'cancel';
  const expectedCount = cancel ? 3 : 2;
  const expectedShort = cancel ? resultB : resultA;
  const folder = path.join(dir, mode + '-repair-ui');
  await mkdir(folder, { recursive: true });
  const steps = [];
  const log = async (step, detail = {}) => {
    const entry = { step, time: new Date().toISOString(), messagesPosts: mock.calls.length, ...detail };
    steps.push(entry);
    await writeFile(path.join(folder, 'steps.json'), JSON.stringify(steps, null, 2));
    await record(step, entry);
  };
  const count = async (step, expected, detail) => {
    await log(step, { expected, ...detail });
    assert.equal(mock.calls.length, expected, step);
  };
  const shot = name => page.screenshot({ path: path.join(folder, name + '.png'), timeout: 15000 });
  const dialog = altRoot(page);
  const run = button(dialog, '설명 만들기');
  const open = async () => {
    await openFeature(page, 'alt-text');
    await dialog.waitFor({ state: 'visible' });
  };
  const close = async () => {
    await button(dialog, '닫기').click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const cleanReopen = async () => {
    await open();
    assert.equal(await dialog.locator('[data-claude-alt-result],img').count(), 0);
    assert.ok(await run.isDisabled());
    await assertAbsent(dialog, resultA, resultB, 'QA-TRUNCATED-');
  };
  let phase = 'A 선택 전';
  try {
    await open();
    await count('대화상자를 열었을 때', 0);
    const pixelsBefore = await captureArtwork(page, dialog);
    await count('기준 원고 픽셀 읽기', 0, { pixelsBefore, baseline });
    const aPreview = await setFixture(page, dialog, 'A');
    await assertAbsent(dialog, resultA, resultB, 'QA-TRUNCATED-');
    await count('A 선택 및 실행 전', 0, { inputWidth: await aPreview.evaluate(img => img.naturalWidth) });
    await shot('01-A-실행전');
    await startMonitor(dialog, cancel);

    phase = 'A 명시 실행과 형식 복구';
    await run.click();
    await mock.waitForCalls(2);
    assert.deepEqual(mock.calls.map(c => c.kind), ['A-initial','A-repair']);
    await count('A 한 번 클릭 후 첫 요청과 자동 형식 복구', 2, { explicitA: 1, requestKinds: mock.calls.map(c => c.kind) });
    if (cancel) {
      phase = '복구 중단과 B 선택';
      await waitUntil(() => mock.calls[1]?.responseDisposition === 'held', 'A 복구 응답이 보류되지 않음');
      const status = dialog.locator('[data-claude-task-status]');
      const stop = button(dialog, '중단');
      await stop.waitFor({ state: 'visible' });
      assert.ok(await button(dialog, '다른 이미지').isDisabled());
      assert.equal(await dialog.locator('[data-claude-alt-result]').count(), 0);
      await assertAbsent(dialog, resultA, resultB, 'QA-TRUNCATED-');
      await count('복구 응답 대기', 2, { status: await status.innerText(), hold: mock.calls[1].responseDisposition });
      await shot('02-A-복구대기');
      await stop.click();
      await waitUntil(async () => (await status.innerText()).includes('중단'), '중단 상태를 표시하지 않음');
      await count('사용자가 복구 중단', 2, { status: await status.innerText() });
      const bPreview = await setFixture(page, dialog, 'B');
      const bSrc = await bPreview.getAttribute('src');
      await count('B 선택 후 실행 전', 2);
      phase = '늦은 A 복구 응답';
      await mock.releaseRepair();
      await page.waitForTimeout(1500);
      assert.equal(await dialog.locator('[data-claude-alt-result]').count(), 0);
      assert.equal(await bPreview.getAttribute('src'), bSrc);
      assert.equal(await bPreview.getAttribute('alt'), '분석할 이미지 미리보기');
      assert.equal(await bPreview.evaluate(img => img.naturalWidth), 112);
      assert.ok(await run.isEnabled());
      await assertAbsent(dialog, resultA, resultB, 'QA-TRUNCATED-');
      const interim = await currentDocument(page);
      compareDocument(baseline, interim);
      await count('늦은 복구 반환 뒤 B 미실행', 2, { response: mock.calls[1].responseDisposition, durable: interim });
      await shot('03-B-늦은A반환후');
      phase = 'B 명시 실행';
      mock.allowB();
      await run.click();
      await mock.waitForCalls(3);
    }
    phase = '최초로 보인 결과와 요청 수';
    await checkResult(dialog, expectedShort, cancel ? resultA : resultB);
    await button(dialog, '다시 만들기').waitFor({ state: 'visible' });
    await page.waitForTimeout(1500);
    const observed = await page.evaluate(() => {
      const values = window.__qa4d16RepairMonitorStop();
      delete window.__qa4d16RepairMonitorStop;
      return values;
    });
    await count('결과 표시 후 자동 재전송 관찰', expectedCount, { expectedShort, observed });
    assert.equal(observed.firstShort, expectedShort, '첫 결과 편집칸');
    assert.equal(observed.malformed, 0, '형식이 깨진 응답의 순간 노출');
    assert.equal(observed.staleA, 0, '중단한 A 결과의 순간 노출');
    const wire = await mock.assertComplete();
    await log('입력·복구 전송 계약 확인', { wire });
    await shot('04-명시실행결과');
    await close();
    phase = '응답 후 기기 저장·그림';
    const saved = await currentDocument(page);
    compareDocument(baseline, saved);
    await cleanReopen();
    const pixelsAfter = await captureArtwork(page, dialog);
    compareArtwork(pixelsBefore, pixelsAfter);
    await close();
    await count('응답 후 저장·그림 확인', expectedCount, { saved, pixelsAfter });
    phase = '편집기 새로고침 및 복구';
    const originalUrl = page.url();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await visible(page.locator('[data-studio-canvas-viewport="true"]')).waitFor({ state: 'visible', timeout: 90000 });
    assert.equal(page.url(), originalUrl, '동일 원고 주소');
    await dismissCoach(page);
    const resume = visible(page.locator('[data-studio-recovery-notice]').getByRole('button', { name: /이어서 그리기|다시 이어 열기|Resume/i }));
    if (await resume.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) await resume.click();
    const reopened = await currentDocument(page);
    compareDocument(baseline, reopened);
    await cleanReopen();
    const pixelsReopened = await captureArtwork(page, dialog);
    compareArtwork(pixelsBefore, pixelsReopened);
    await shot('05-재열기-원고');
    await close();
    await page.waitForTimeout(750);
    await count('동일 원고 재열기 후 자동 생성', expectedCount, { reopened, pixelsReopened });
    await mock.assertComplete();
    return { mode, steps, expectedCount, observed, baseline, saved, reopened, pixelsBefore, pixelsAfter, pixelsReopened };
  } catch (error) {
    await log('검증 중단', { phase, message: String(error.message).slice(0, 1000), callKinds: mock.calls.map(c => c.kind) });
    await shot('실패').catch(() => {});
    throw error;
  }
}

export { compareDocument, compareArtwork, assertAbsent, setFixture, startMonitor };
