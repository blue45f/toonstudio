import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "@playwright/test";
import { decode } from "image-js";

import type { BrowserContext, Locator, Page } from "playwright";

const channels = ["baseColor", "roughness", "metalness", "emissive", "opacity"] as const;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** 번들에 포함된 재배포 허용 PBR 모델을 일반 파일 업로드로 연다. 모델 라이브러리와 팀 저장소를 모두 검증한다. */
export async function paintStudioVrmCut(page: Page, poser: Locator, file: string, output: string) {
  await poser.locator("#vrm-tab-character").click();
  await poser.locator("#vrm-character-subtab-library").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), poser.getByRole("button", { name: "VRM 업로드", exact: true }).click()]);
  await chooser.setFiles(file);
  return editStudioVrmCutChannels(poser, output, "owner");
}

export async function editStudioVrmCutChannels(poser: Locator, output: string, actor: "owner" | "teammate") {
  const receiver = actor === "teammate";
  const expected: Record<string, number[]> = {};
  if (!receiver) await poser.locator("#vrm-character-subtab-surface").click();
  const material = poser.getByRole("combobox", { name: "표면 페인트 재질" });
  const body = material.locator("option").filter({ hasText: /mat_orion_body/iu });
  await expect(body).toHaveCount(1, { timeout: 90_000 });
  await material.selectOption((await body.getAttribute("value"))!);
  await poser.getByRole("button", { name: "선택 재질만 보기" }).click();
  const control = poser.getByRole("combobox", { name: "표면 페인트 채널" });
  const paint = poser.locator("#vrm-character-section-surface");
  const viewport = poser.getByRole("group", { name: "3D 캐릭터 표면 페인트 뷰포트" }).locator("canvas");
  await expect(viewport).toBeVisible();
  await viewport.screenshot({ path: path.join(output, `${actor}-model-before-paint.png`) });
  await paint.getByRole("button", { name: "ColorDrop", exact: true }).click();
  await paint.getByRole("button", { name: "텍스처 전체", exact: true }).click();
  await paint.getByRole("slider", {name: "ColorDrop 색상 허용치"}).press("End");
  for (const [index, channel] of channels.entries()) {
    await control.selectOption(channel);
    await expect(control).toHaveValue(channel);
    if (channel === "baseColor" || channel === "emissive") {
      const hex = paint.getByRole("textbox", { name: "표면 페인트 HEX 색상" });
      await hex.fill(channel === "baseColor" ? (receiver ? "#F5D996" : "#64B1D0") : (receiver ? "#125628" : "#54210B"));
      await hex.press("Enter");
      expected[channel] = (await hex.inputValue()).slice(1).match(/../gu)!.map(value => Number.parseInt(value, 16));
    } else {
      const scalar = paint.getByRole("slider", { name: /^표면 .* 값$/u });
      await scalar.press("Home");
      const tenths = (receiver ? { roughness: 8, metalness: 3, opacity: 9 } : { roughness: 2, metalness: 5, opacity: 7 })[channel];
      for (let step = 0; step < tenths; step++) await scalar.press("PageUp");
      expected[channel] = Array(3).fill(Number(await scalar.inputValue()));
    }
    const total = paint.getByLabel(`편집 중인 텍스처 ${receiver ? channels.length : index + 1}개`, {exact: true});
    const box = await viewport.boundingBox();
    assert(box);
    // 중앙 몸통을 우선 누른다. 회복 중인 첫 프레임이나 자세별 여백은 주변 몸통 위치에서 다시 찾는다.
    for (const [x, y] of [[0.47, 0.32], [0.53, 0.32], [0.47, 0.4], [0.53, 0.4], [0.46, 0.69]] as const) {
      await viewport.click({position: {x: box.width * x, y: box.height * y}});
      await expect(control).toBeEnabled();
      if (await total.waitFor({timeout: 5_000}).then(() => true, () => false)) break;
    }
    await expect(total).toBeVisible();
    await viewport.screenshot({ path: path.join(output, `${actor}-${channel}.png`) });
    console.log(`포저 표면의 ${channel} 채널을 칠했습니다.`);
  }
  await poser.getByRole("button", { name: "선택 재질만 보기" }).click();
  return expected;
}

export async function confirmStudioVrmCutRights(page: Page) {
  const dialog = page.getByRole("dialog", { name: "작품 팀에 공유할 VRM 이용 조건" });
  await dialog.locator('input[value="other"]').check();
  const absent = dialog.locator('input[value="absent"]');
  await expect(absent).toHaveCount(4);
  for (const option of await absent.all()) await option.check();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "확인하고 팀에 저장", exact: true }).click();
}

interface Paint { textureSlot: string; materialLocator: string; hash: string; byteSize: number }
interface Asset { assetId: string; sha256: string; byteSize: number; elementType: "image" | "vrm" }

export async function verifyStudioVrmCutBytes(context: BrowserContext, base: string, file: string, textures: Paint[], assets: Asset[], expected: Record<string, number[]>) {
  assert.deepEqual(textures.filter(t => t.materialLocator === "gltf-material:0").map(t => t.textureSlot).sort(), [...channels].sort());
  assert.deepEqual([...new Set(textures.map(t => t.textureSlot))].sort(), [...channels].sort());
  const modelHash = digest(await readFile(file));
  assert(assets.some(a => a.elementType === "vrm" && a.sha256 === modelHash));
  const raw: Record<string, {sha256: string; elementType: Asset["elementType"]}> = {};
  for (const asset of assets) {
    const response = await context.request.get(`${base}/assets/${encodeURIComponent(asset.assetId)}/content?elementType=${asset.elementType}`);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, asset.byteSize);
    assert.equal(digest(bytes), asset.sha256);
    if (asset.elementType === "image") {
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      const texture = textures.find(t => t.hash === `sha256:${asset.sha256}` && t.byteSize === asset.byteSize);
      assert(texture);
      const decoded = decode(bytes);
      assert.equal(decoded.components, 3);
      // 텍스처 전체 채우기로 입력한 실제 값이 PNG 중앙과 네 모서리에 보존되어야 한다.
      for (const i of [0, decoded.width - 1, Math.floor(decoded.height / 2) * decoded.width + Math.floor(decoded.width / 2), decoded.size - decoded.width, decoded.size - 1]) {
        const rgb = [0, 1, 2].map(component => decoded.getValueByIndex(i, component));
        assert.deepEqual(rgb, expected[texture.textureSlot], texture.textureSlot);
        if (decoded.alpha) assert.equal(decoded.getValueByIndex(i, decoded.components), decoded.maxValue);
      }
    }
    raw[asset.assetId] = {sha256: asset.sha256, elementType: asset.elementType};
  }
  for (const texture of textures) assert(assets.some(a => a.sha256 === texture.hash.slice(7)));
  return raw;
}
