#!/usr/bin/env node
/** 격리된 로컬 검수 화면에서 실제 소재 로딩·미리보기·canvas 삽입을 확인한다. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("사용법: node scripts/verify-creator-bundle-renders.mjs --origin http://127.0.0.1:5192 --out /tmp/bundle-runtime-review");
  process.exit(0);
}
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
}
assert(args.every((arg, index) => index % 2 === 1 || ["--origin", "--out"].includes(arg)), "알 수 없는 옵션입니다.");
const origin = new URL(value("--origin", "http://127.0.0.1:5192"));
assert(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && origin.protocol === "http:", "로컬 검수 서버만 사용할 수 있습니다.");
assert(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "origin에는 경로·자격증명·쿼리를 넣을 수 없습니다.");
const output = resolve(value("--out", "/tmp/toonstudio-bundle-runtime-review"));
mkdirSync(output, { recursive: true });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "apps/web/public/assets/studio/bundle-renders-v1/manifest.json"), "utf8"));
const selection = JSON.parse(readFileSync(resolve(root, "config/creator-bundle-render-selection.json"), "utf8"));
const expected = manifest.assets.filter(asset => asset.visualReviewed && asset.rights?.serve === "allow");
const characterPackId = "cbv1-007-cartoon-characters-2";
const selectedCharacters = selection.assets.filter(asset => asset.sourcePreparation);
assert.equal(expected.length, 186, "기존 178종과 신규 캐릭터 8종이 모두 등록돼야 합니다.");
assert.equal(manifest.assets.length, 190, "완성 186종과 기존 초안 4종을 보존해야 합니다.");
assert.equal(selectedCharacters.length, 8, "신규 정규화 선정은 정확히 8개여야 합니다.");
assert(selectedCharacters.every(asset => asset.packId === characterPackId && asset.catalogId === characterPackId), "새 선정은 Characters 2 팩이어야 합니다.");
const models = new Set(selectedCharacters.map(asset => asset.source));
assert.equal(models.size, 4, "신규 캐릭터 원본은 4개여야 합니다.");
for (const model of models) {
  const views = selectedCharacters.filter(asset => asset.source === model);
  assert.equal(views.length, 2, model);
  assert.equal(new Set(views.map(asset => JSON.stringify(asset.cameraDirection))).size, 2, model);
}
const expectedById = new Map(expected.map(asset => [asset.id, asset]));
const characterIds = selectedCharacters.map(asset => asset.id);
assert.equal(new Set(characterIds).size, 8);
assert.deepEqual(expected.filter(asset => asset.derivedFromPack === characterPackId).map(asset => asset.id).sort(), [...characterIds].sort(), "신규 8개 일부만 등록한 상태를 허용하지 않습니다.");
for (const selected of selectedCharacters) {
  const asset = expectedById.get(selected.id);
  assert(asset, selected.id);
  assert.equal(asset.sourceModelSha256, selected.sourcePreparation.expectedSha256, selected.id);
  assert.equal(asset.sourceOriginalModelSha256, selected.sourceModelSha256, selected.id);
  assert.deepEqual(asset.renderInputFingerprint?.cameraDirection, selected.cameraDirection, selected.id);
}
function expectedCredit(asset) {
  return {
    schema: "toonstudio.bundle-source-credit.v1", assetId: asset.id, ledgerPackId: asset.rights.ledgerPackId,
    contentHash: `sha256:${asset.sha256}`, renderPath: `/assets/studio/bundle-renders-v1/${asset.path}`,
    sourceUrl: asset.license.sourceUrl, provider: asset.license.provider,
    licenseId: asset.license.id, licenseUrl: asset.license.url ?? null, licenseName: asset.rights.licenseName,
    serve: asset.rights.serve, status: asset.rights.status,
    commercialUse: asset.rights.commercialUse, attributionRequired: asset.rights.attributionRequired,
  };
}
const browser = await chromium.launch({ headless: true });
const report = {
  expected: expected.length, imageContract: null, insertions: [], errors: [], screenshots: [], layouts: [],
  databasePersistenceVerified: false, persistenceCases: [],
  characters2: { expected: 8, models: models.size, assetIds: characterIds, desktop: [], mobile: [] },
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(`${origin.origin}/tools/browser-harnesses/bundle-renders-runtime.html`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "전체 렌더 무결성 검사", exact: true }).click();
  const integrity = page.locator("[data-bundle-integrity-phase]");
  await page.locator("[data-bundle-integrity-phase='completed']").waitFor({ timeout: 240_000 });
  report.imageContract = await integrity.evaluate(element => ({
    successes: Number(element.getAttribute("data-bundle-integrity-success")),
    failures: Number(element.getAttribute("data-bundle-integrity-failures")),
    text: element.textContent,
  }));
  assert.equal(report.imageContract.successes, expected.length);
  assert.equal(report.imageContract.failures, 0);
  const library = page.locator("[data-studio-bundle-library]");
  const cards = page.locator("[data-bundle-asset-id]");
  const cardFor = id => page.locator(`[data-bundle-asset-id="${id}"]`);
  async function openLibrary() {
    if (!await library.evaluate(element => element.open)) await library.locator("summary").click();
    await cards.first().waitFor();
  }
  async function search(query, count) {
    await openLibrary();
    await page.getByRole("searchbox").fill(query);
    await page.getByText(`검색 결과 ${count}종 · 1/1페이지`, { exact: true }).waitFor();
    assert.equal(await cards.count(), count);
  }
  async function checkOverflow(scope) {
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(layout.scrollWidth <= layout.width, `${scope}: 화면이 가로로 넘칩니다.`);
    report.layouts.push({ scope, ...layout });
  }
  await openLibrary();
  assert.equal(await cards.count(), Math.min(24, expected.length));
  async function useCard(card, scope) {
    const id = await card.getAttribute("data-bundle-asset-id");
    const asset = expectedById.get(id);
    assert(asset, `${id}: 현재 매니페스트에 없는 카드입니다.`);
    await card.getByRole("button", { name: /확대 미리보기$/u }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const decoded = await dialog.locator("img").evaluate(async image => {
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
    assert.deepEqual(decoded, { width: 1536, height: 1536 });
    await checkOverflow(`${scope}:${id}:preview`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await card.getByRole("button", { name: "캔버스에 삽입", exact: true }).click();
    const canvasResult = page.locator("[data-bundle-canvas-status='drawn']");
    await canvasResult.waitFor();
    const inserted = page.locator(`[data-bundle-inserted-id="bundle:${id}"]`);
    await inserted.waitFor();
    const details = await inserted.evaluate(element => Object.fromEntries(
      [...element.querySelectorAll("dt")].map(term => [term.textContent, term.nextElementSibling?.textContent]),
    ));
    const credit = expectedCredit(asset);
    assert.equal(details.ID, `bundle:${id}`);
    assert.equal(details["콘텐츠 해시"], credit.contentHash);
    assert.equal(details["실제 크기"], "1536 × 1536px");
    assert.equal(details["라이선스"], credit.licenseName);
    assert.equal(details["권리 확인"], "확인됨");
    assert.equal(details["출처"], `${credit.provider} — ${credit.sourceUrl}`);
    assert(Number(details["보이는 픽셀"].replaceAll(",", "")) > 0, id);
    assert(Number(details["투명 픽셀"].replaceAll(",", "")) > 0, id);
    // 하니스가 호출하는 실제 전달 포트의 전체 credit과 삽입 UI의 해시·권리를 함께 대조한다.
    const delivered = await page.evaluate(async ({ assetId, moduleUrl }) => {
      const delivery = await import(moduleUrl);
      const entry = (await delivery.loadStudioBundleCatalog()).find(candidate => candidate.id === assetId);
      if (!entry) throw new Error("실제 전달 카탈로그에 신규 소재가 없습니다.");
      const record = await delivery.createStudioBundleImageRecord(entry);
      return { id: record.id, contentHash: record.contentHash, bundleSourceCredit: record.bundleSourceCredit };
    }, { assetId: id, moduleUrl: `${origin.origin}/src/domains/creator/studio-bundle-asset-delivery.ts` });
    assert.deepEqual(delivered, { id: `bundle:${id}`, contentHash: credit.contentHash, bundleSourceCredit: credit });
    assert.deepEqual(await page.locator("canvas").evaluate(canvas => ({ width: canvas.width, height: canvas.height })), decoded);
    await checkOverflow(`${scope}:${id}:inserted`);
    report.insertions.push({ id, scope, decoded, details, bundleSourceCredit: delivered.bundleSourceCredit });
    return id;
  }
  async function saveAndReload(card, scope) {
    const id = await card.getAttribute("data-bundle-asset-id");
    const asset = expectedById.get(id);
    assert(asset, id);
    await card.getByRole("button", { name: "개인 라이브러리에 저장", exact: true }).click();
    await page.locator("[data-bundle-persisted-phase='saved']").waitFor({ timeout: 120_000 });
    await page.reload({ waitUntil: "networkidle", timeout: 120_000 });
    await page.getByRole("button", { name: "저장 영속성 확인", exact: true }).click();
    const persisted = page.locator("[data-bundle-persisted-phase='verified']");
    await persisted.waitFor({ timeout: 120_000 });
    const result = JSON.parse(await persisted.innerText());
    assert.equal(typeof result.id, "string");
    assert.equal(result.contentHash, `sha256:${asset.sha256}`);
    assert.deepEqual(result.bundleSourceCredit, expectedCredit(asset));
    report.persistenceCases.push({ scope, sourceAssetId: id, ...result });
    return result;
  }
  await search("벤치", 2);
  await useCard(cards.first(), "legacy-bench-desktop");
  report.localPersistence = await saveAndReload(cards.first(), "legacy-bench");
  await openLibrary();
  await library.scrollIntoViewIfNeeded();
  const desktop = resolve(output, "desktop-library.png");
  await page.screenshot({ path: desktop });
  report.screenshots.push(desktop);
  await search("물약", 3);
  await useCard(cards.first(), "legacy-potion-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await search("벤치", 2);
  await useCard(cards.first(), "legacy-bench-mobile");
  await page.locator("[data-bundle-canvas-status='drawn']").scrollIntoViewIfNeeded();
  const mobile = resolve(output, "mobile-canvas.png");
  await page.screenshot({ path: mobile });
  report.screenshots.push(mobile);
  for (const [viewport, size] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(size);
    await search("캐릭터2", 8);
    assert.deepEqual((await cards.evaluateAll(elements => elements.map(element => element.getAttribute("data-bundle-asset-id")))).sort(), [...characterIds].sort());
    await checkOverflow(`characters2-${viewport}:cards`);
    for (const id of characterIds) report.characters2[viewport].push(await useCard(cardFor(id), `characters2-${viewport}`));
    await page.locator(viewport === "desktop" ? "[data-studio-bundle-library]" : "[data-bundle-canvas-status='drawn']").scrollIntoViewIfNeeded();
    const screenshot = resolve(output, `characters2-${viewport}.png`);
    await page.screenshot({ path: screenshot });
    report.screenshots.push(screenshot);
  }
  report.characters2Persistence = await saveAndReload(cardFor(characterIds[0]), "characters2");
  report.databasePersistenceVerified = report.persistenceCases.length === 2;
  assert(report.databasePersistenceVerified, "벤치와 신규 캐릭터의 저장 왕복이 모두 필요합니다.");
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ expected: report.expected, imageContract: report.imageContract, insertions: report.insertions.length,
    characters2: { desktop: report.characters2.desktop.length, mobile: report.characters2.mobile.length }, persistenceCases: report.persistenceCases.length, errors: report.errors }));
} finally {
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
