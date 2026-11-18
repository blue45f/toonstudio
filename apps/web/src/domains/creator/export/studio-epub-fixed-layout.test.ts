import { describe, expect, it } from "vitest";

import { readStudioZipArchive } from "../studio-zip-reader";
import { buildFixedLayoutEpubArchive } from "./studio-epub-fixed-layout";

const utf8Decoder = new TextDecoder();

function fakePng(seed: number): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed & 0xff]);
}

describe("studio-epub-fixed-layout", () => {
  it("OCF 규격 0번 무압축 mimetype(extra=0, offset=38)을 생성하고 studio-zip-reader로 무결성 검증을 통과한다", async () => {
    const built = buildFixedLayoutEpubArchive({
      title: "별빛 연대기 & 외전 <1권>",
      creator: "김작가",
      language: "ko",
      pageProgressionDirection: "rtl",
      renditionSpread: "landscape",
      kdpComicCompatible: true,
      pages: [
        {
          title: "제1화 <시작 & 만남>",
          imageBytes: fakePng(1),
          mediaType: "image/png",
          width: 1200,
          height: 1800,
        },
        {
          title: "제1화 2쪽",
          imageBytes: fakePng(2),
          mediaType: "image/png",
          width: 1200,
          height: 1800,
        },
      ],
    });

    const bytes = built.epubBytes;
    // Local file header magic PK\x03\x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // compression method = 0 (stored), filename length = 8 ("mimetype"), extra length = 0
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(26, true)).toBe(8);
    expect(view.getUint16(28, true)).toBe(0);
    expect(utf8Decoder.decode(bytes.subarray(30, 38))).toBe("mimetype");
    expect(utf8Decoder.decode(bytes.subarray(38, 58))).toBe("application/epub+zip");

    // studio-zip-reader로 실제 파싱 및 CRC-32 검증
    const archive = await readStudioZipArchive(bytes);
    expect(archive.entries[0]?.path).toBe("mimetype");
    expect(archive.entries[0]?.compressionMethod).toBe(0);
    expect(archive.entries[0]?.dataOffset).toBe(38);

    const containerXml = utf8Decoder.decode(await archive.readEntry("META-INF/container.xml"));
    expect(containerXml).toContain('full-path="OEBPS/content.opf"');

    const opfXml = utf8Decoder.decode(await archive.readEntry("OEBPS/content.opf"));
    expect(opfXml).toContain('<meta property="rendition:layout">pre-paginated</meta>');
    expect(opfXml).toContain('page-progression-direction="rtl"');
    expect(opfXml).toContain('properties="cover-image"');
    expect(opfXml).toContain('properties="nav"');
    expect(opfXml).toContain('name="book-type" content="comic"');
    expect(opfXml).toContain("별빛 연대기 &amp; 외전 &lt;1권&gt;");

    const navXml = utf8Decoder.decode(await archive.readEntry("OEBPS/nav.xhtml"));
    expect(navXml).toContain('epub:type="toc"');
    expect(navXml).toContain("제1화 &lt;시작 &amp; 만남&gt;");

    const page1Xml = utf8Decoder.decode(await archive.readEntry("OEBPS/pages/page-001.xhtml"));
    expect(page1Xml).toContain('name="viewport" content="width=1200, height=1800"');
    expect(page1Xml).toContain('href="../images/page-001.png"');
  });

  it("좌철(ltr)과 별도 표지 이미지 설정을 올바르게 반영한다", async () => {
    const built = buildFixedLayoutEpubArchive({
      title: "웹툰 단행본",
      pageProgressionDirection: "ltr",
      kdpComicCompatible: false,
      coverImage: {
        bytes: fakePng(99),
        mediaType: "image/png",
      },
      pages: [
        {
          imageBytes: fakePng(10),
          mediaType: "image/png",
          width: 800,
          height: 1280,
          pageSpread: "center",
        },
      ],
    });

    const archive = await readStudioZipArchive(built.epubBytes);
    const opfXml = utf8Decoder.decode(await archive.readEntry("OEBPS/content.opf"));
    expect(opfXml).toContain('page-progression-direction="ltr"');
    expect(opfXml).toContain('id="cover-img" href="images/cover.png"');
    expect(opfXml).toContain('properties="rendition:page-spread-center"');
    expect(opfXml).not.toContain('name="book-type"');
  });
});
