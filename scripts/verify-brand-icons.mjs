import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(root, "apps/web/public");
const legacyBrandRoot = "brand/spectrum-ribbon-v2";
const brandRoot = "brand/jewel-atelier-v1";
const pngSizes = new Map([
  ["favicon-32.png", 32], ["favicon-96.png", 96],
  ["apple-touch-icon.png", 180], ["icon-192.png", 192],
  ["icon-512.png", 512], ["icon-maskable-192.png", 192],
  ["icon-maskable-512.png", 512],
]);
const read = (name) => readFileSync(resolve(publicRoot, name));
const readVersioned = (name) => readFileSync(resolve(publicRoot, brandRoot, name));
// 디자인 원본 ab638abb31d92cfaf3c7caae8a11064547d23967과 팔레트 최적화
// 8652808aa4284d219e3d8e1be41b2993877beec2의 승인된 Git blob을 그대로 보존한다.
const jewelReleaseFiles = [
  ["apple-touch-icon.png", 8135, "aac942081834c903b9fd87fba412eda6293f271f"],
  ["favicon-32.png", 1230, "4f9c8c6b823c8bc3c733fcc8900e49d9c7ce1059"],
  ["favicon-96.png", 3988, "d72c49f963cffcf5bd724107a58b923088a652a8"],
  ["favicon.ico", 9547, "3d976437f12acfdb8fe20eb3d12cebbbf0fc9b9c"],
  ["favicon.svg", 1445, "295b5843bf8a9c6ea02c4ab626bfac1ff0850d48"],
  ["icon-192.png", 9667, "6b1115e4dfa6398aa73bc363077195b95d08e0fc"],
  ["icon-512.png", 38932, "ea48193756c1f01e1f1125a04f24c37f96dd6f2c"],
  ["icon-maskable-192.png", 8987, "290fcb817236a9a297ea5ef92125ea68696542c6"],
  ["icon-maskable-512.png", 35231, "c84dbe4ef5f435218704e5411578e8af7525b9f1"],
  ["icon-maskable.svg", 1319, "4ddfec23dcd6ffe7bf613bbdcdf080d48b091959"],
  ["safari-pinned-tab.svg", 314, "202020239520b123be66b6f7990b2669ed102aa5"],
];
// SHA-1은 보안 토큰이 아니라 Git의 원본 객체 식별자를 재계산하는 용도다.
const gitBlobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const readLegacyVersioned = (name) => readFileSync(resolve(publicRoot, legacyBrandRoot, name));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 기본 팔레트 PNG 계약을 유지하며 ICO의 RGBA 프레임만 명시적으로 허용한다. */
export function decodeBrandPng(bytes, size, colorType = 3) {
  assert.ok(colorType === 3 || colorType === 6, "팔레트 또는 RGBA PNG만 검사할 수 있습니다");
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let palette;
  let alpha = Buffer.alloc(256, 255);
  let header;
  let ended = false;
  const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= bytes.length, "Truncated PNG chunk");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, end - 4);
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), `CRC: ${type}`);
    if (offset === 8) assert.equal(type, "IHDR");
    if (type === "IHDR") header = chunk;
    if (type === "PLTE") palette = chunk;
    if (type === "tRNS") alpha = chunk;
    if (type === "IDAT") data.push(chunk);
    offset = end;
    if (type === "IEND") { ended = true; break; }
  }
  assert.ok(ended && offset === bytes.length, "PNG must end at IEND");
  assert.ok(header && data.length > 0, "PNG requires image data");
  if (colorType === 3) assert.ok(palette, "PNG requires palette");
  assert.equal(header.readUInt32BE(0), size);
  assert.equal(header.readUInt32BE(4), size);
  assert.deepEqual([...header.subarray(8)], [8, colorType, 0, 0, 0]);
  const channels = colorType === 6 ? 4 : 1;
  const stride = size * channels;
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * size });
  assert.equal(raw.length, (stride + 1) * size);
  const decoded = Buffer.alloc(stride * size);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, "Invalid PNG filter");
    for (let x = 0; x < stride; x += 1) {
      const i = y * stride + x;
      const a = x >= channels ? decoded[i - channels] : 0;
      const b = y > 0 ? decoded[i - stride] : 0;
      const c = x >= channels && y > 0 ? decoded[i - stride - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
      decoded[i] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
      if (colorType === 3) {
        const color = decoded[i];
        assert.ok(color * 3 + 2 < palette.length, "Invalid palette index");
        rgba.set(palette.subarray(color * 3, color * 3 + 3), i * 4);
        rgba[i * 4 + 3] = alpha[color] ?? 255;
      }
    }
  }
  return colorType === 6 ? decoded : rgba;
}

export const brandIconChecks = [];
for (const [name, size] of pngSizes) {
  brandIconChecks.push([`${name}: valid, correctly sized, bounded PNG`, () => {
    const bytes = read(name);
    assert.ok(bytes.length < 12_000, "Oversized brand PNG");
    const rgba = decodeBrandPng(bytes, size);
    let light = 0, chromatic = 0, navy = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const [red, green, blue, alpha] = rgba.subarray(i, i + 4);
      if (red > 220 && green > 210 && blue > 190 && alpha >= 250) light += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 38 && alpha >= 250) chromatic += 1;
      if (red < 38 && green < 48 && blue > 35 && blue < 72 && alpha >= 250) navy += 1;
    }
    assert.ok(light > size * size * 0.01, "Missing bright nib and sparkle details");
    assert.ok(chromatic > size * size * 0.12, "Missing Spectrum Ribbon colour range");
    assert.ok(navy > size * size * 0.18, "Missing stable navy silhouette background");
  }]);
}
for (const [name, size] of pngSizes) {
  if (!name.includes("maskable") && name !== "apple-touch-icon.png") continue;
  brandIconChecks.push([`${name}: opaque with artwork inside the circular mask-safe zone`, () => {
    const rgba = decodeBrandPng(read(name), size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      assert.equal(rgba[i + 3], 255, "Install icon must be opaque");
      if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) {
        assert.ok(Math.abs(rgba[i] - 16) <= 2 && Math.abs(rgba[i + 1] - 24) <= 2 && Math.abs(rgba[i + 2] - 45) <= 2, "Artwork outside the safe circle");
      }
    }
  }]);
}
for (const name of ["favicon.svg", "icon-maskable.svg", "safari-pinned-tab.svg"]) {
  brandIconChecks.push([`${name}: small, self-contained, static vector`, () => {
    const svg = read(name).toString("utf8");
    assert.ok(Buffer.byteLength(svg) < 4096);
    assert.match(svg, /viewBox="0 0 64 64"/u);
    assert.doesNotMatch(svg, /<(?:image|script|style|filter|animate|foreignObject)\b|(?:href|onload)=|data:|ToonSpectrum/iu);
    assert.match(svg, /<path\b/u);
    if (name !== "safari-pinned-tab.svg") assert.match(svg, /ToonStudio/u);
    else assert.doesNotMatch(svg, /<rect\b|linearGradient|#66e7ef|#d879f2/iu);
  }]);
}
brandIconChecks.push(["ICO: 16/32/48 frames with independently decoded image data", () => {
  const ico = read("favicon.ico");
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
  let expectedOffset = 54;
  for (const [i, size] of [16, 32, 48].entries()) {
    const start = 6 + i * 16;
    assert.equal(ico[start], size);
    assert.equal(ico[start + 1], size);
    assert.equal(ico.readUInt16LE(start + 4), 1);
    assert.equal(ico.readUInt16LE(start + 6), 32);
    const length = ico.readUInt32LE(start + 8);
    const offset = ico.readUInt32LE(start + 12);
    assert.equal(offset, expectedOffset);
    const frame = ico.subarray(offset, offset + length);
    decodeBrandPng(frame, size);
    if (size === 32) assert.deepEqual(frame, read("favicon-32.png"));
    expectedOffset += length;
  }
  assert.equal(expectedOffset, ico.length);
}]);
brandIconChecks.push(["Spectrum 호환 자산: 기존 픽셀과 버전별 manifest 보존", () => {
  for (const name of [...pngSizes.keys(), "favicon.svg", "favicon.ico", "icon-maskable.svg", "safari-pinned-tab.svg"]) {
    assert.deepEqual(readLegacyVersioned(name), read(name), name);
  }
  const legacyManifest = readLegacyVersioned("manifest.webmanifest");
  assert.equal(legacyManifest.length, 3852);
  assert.equal(gitBlobSha(legacyManifest), "ccb61cdee629fa0a53f993adb951cddd133315ad");
}]);
brandIconChecks.push(["Jewel 자산: 승인 원본의 정확한 크기·Git 객체와 PNG/SVG 구조", () => {
  for (const [name, bytes, blob] of jewelReleaseFiles) {
    const actual = readVersioned(name);
    assert.equal(actual.length, bytes, `${name}: 승인 원본 크기`);
    assert.equal(gitBlobSha(actual), blob, `${name}: 승인 원본 Git 객체`);
    if (pngSizes.has(name)) decodeBrandPng(actual, pngSizes.get(name));
    if (!name.endsWith(".svg")) continue;
    const svg = actual.toString("utf8");
    assert.ok(Buffer.byteLength(svg) < 4096);
    assert.match(svg, /viewBox="0 0 64 64"/u);
    assert.doesNotMatch(svg, /<(?:image|script|style|filter|animate|foreignObject)\b|(?:href|onload)=|data:|ToonSpectrum/iu);
    assert.match(svg, /<path\b/u);
    if (name !== "safari-pinned-tab.svg") assert.match(svg, /ToonStudio.*Jewel Atelier/u);
    else assert.doesNotMatch(svg, /<rect\b|linearGradient|#66e7ef|#d879f2/iu);
  }
  assert.deepEqual(readVersioned("manifest.webmanifest"), read("manifest.webmanifest"));
}]);
brandIconChecks.push(["Jewel ICO: 승인된 16/32/48 RGBA 프레임을 독립 디코드", () => {
  const ico = readVersioned("favicon.ico");
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
  let expectedOffset = 54;
  for (const [i, size] of [16, 32, 48].entries()) {
    const start = 6 + i * 16;
    assert.equal(ico[start], size);
    assert.equal(ico[start + 1], size);
    assert.equal(ico.readUInt16LE(start + 4), 0);
    assert.equal(ico.readUInt16LE(start + 6), 32);
    const length = ico.readUInt32LE(start + 8);
    const offset = ico.readUInt32LE(start + 12);
    assert.equal(offset, expectedOffset);
    assert.ok(offset + length <= ico.length);
    decodeBrandPng(ico.subarray(offset, offset + length), size, 6);
    expectedOffset += length;
  }
  assert.equal(expectedOffset, ico.length);
}]);
brandIconChecks.push(["HTML: cache-rotated static icon paths and SVG after fallbacks", () => {
  const html = readFileSync(resolve(root, "apps/web/index.html"), "utf8");
  const links = [...html.matchAll(/<link\b[^>]*>/gu)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, value])));
  const icons = links.filter((link) => ["icon", "mask-icon", "apple-touch-icon"].includes(link.rel));
  assert.equal(icons.length, 6);
  for (const icon of icons) {
    const url = new URL(icon.href, "https://www.toonstudio.cloud");
    assert.equal(url.origin, "https://www.toonstudio.cloud");
    assert.equal(url.search, "");
    assert.ok(url.pathname.startsWith(`/${brandRoot}/`));
    assert.ok(read(url.pathname.slice(1)).length > 0);
  }
  assert.equal(icons.filter((icon) => icon.rel === "icon").at(-1)?.type, "image/svg+xml");
  assert.equal(icons.find((icon) => icon.rel === "apple-touch-icon")?.sizes, "180x180");
  assert.equal(links.find((link) => link.rel === "manifest")?.href, `/${brandRoot}/manifest.webmanifest`);
}]);
brandIconChecks.push(["Manifest: cache-rotated paths, real dimensions and separate roles", () => {
  const manifest = JSON.parse(read("manifest.webmanifest").toString("utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/studio");
  assert.equal(manifest.theme_color, "#10182d");
  assert.equal(manifest.background_color, "#10182d");
  assert.equal(manifest.icons.length, 5);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, "https://www.toonstudio.cloud");
    const name = url.pathname.split("/").at(-1);
    assert.equal(url.origin, "https://www.toonstudio.cloud");
    assert.equal(url.search, "");
    assert.ok(url.pathname.startsWith(`/${brandRoot}/`));
    assert.equal(icon.purpose, name.includes("maskable") ? "maskable" : "any");
    if (icon.type === "image/png") {
      const size = pngSizes.get(name);
      assert.ok(size);
      assert.equal(icon.sizes, `${size}x${size}`);
      decodeBrandPng(read(url.pathname.slice(1)), size);
    } else {
      assert.equal(name, "favicon.svg");
      assert.equal(icon.sizes, "any");
      assert.equal(icon.type, "image/svg+xml");
    }
  }
}]);

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const [name, check] of brandIconChecks) { check(); console.log(`PASS ${name}`); }
  console.log(`${brandIconChecks.length} brand icon checks passed.`);
}
