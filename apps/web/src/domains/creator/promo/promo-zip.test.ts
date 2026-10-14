import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { PROMO_ZIP_MAX_FILES, promoCrc32, promoUnzip, promoZip } from "./promo-zip";

describe("promo zip (fflate)", () => {
  it("keeps the standard CRC32 check value", () => {
    expect(promoCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips text and binary entries through promoUnzip", () => {
    const files = { "src/a.ts": "한글 소스", "public/a.png": new Uint8Array([1, 2, 3, 250]) };
    const unzipped = promoUnzip(promoZip(files));
    expect(new TextDecoder().decode(unzipped["src/a.ts"])).toBe("한글 소스");
    expect(unzipped["public/a.png"]).toEqual(new Uint8Array([1, 2, 3, 250]));
  });

  it("is deterministic and emits a standard EOCD record", () => {
    const files = { "src/a.ts": "한글", "public/a.png": new Uint8Array([1, 2, 3]) };
    const zip = promoZip(files);
    expect(zip).toEqual(promoZip(files));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 12, true)).toBe(2);
  });

  it("compresses repetitive text well below its raw size", () => {
    const source = "export const line = 'toonstudio';\n".repeat(4_000);
    const zip = promoZip({ "src/big.ts": source });
    expect(zip.byteLength).toBeLessThan(new TextEncoder().encode(source).byteLength / 10);
    expect(new TextDecoder().decode(promoUnzip(zip)["src/big.ts"])).toBe(source);
  });

  it("allows more than the old 100-file ceiling", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 250; index += 1) files[`src/file-${index}.ts`] = `// ${index}`;
    const unzipped = promoUnzip(promoZip(files));
    expect(Object.keys(unzipped)).toHaveLength(250);
  });

  it("rejects more than PROMO_ZIP_MAX_FILES entries", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index <= PROMO_ZIP_MAX_FILES; index += 1) files[`f-${index}.txt`] = "x";
    expect(() => promoZip(files)).toThrow();
  });

  it("exports payloads larger than the old 100MB ceiling", () => {
    const payload = new Uint8Array(120_000_000);
    const zip = promoZip({ "public/panel.raw": payload });
    expect(zip.byteLength).toBeLessThan(payload.byteLength);
    expect(promoUnzip(zip)["public/panel.raw"]?.byteLength).toBe(payload.byteLength);
  });

  it("rejects unsafe paths on write and read", () => {
    expect(() => promoZip({ "../secret": "x" })).toThrow();
    expect(() => promoZip({ "/absolute": "x" })).toThrow();
    const hostile = zipSync({ "../secret": new TextEncoder().encode("x") });
    expect(() => promoUnzip(hostile)).toThrow();
  });
});
