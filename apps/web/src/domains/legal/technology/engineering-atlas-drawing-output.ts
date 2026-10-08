import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { commentedCode, t } from "./engineering-atlas-drawing-kit";

/**
 * 기술 도감 · drawing · 출력과 품질 카드.
 * 작품이 파일이 되는 내보내기 엔진, 그리고 드로잉 품질을 숫자로 지키는 게이트를 다룬다.
 */

const LATENCY_POLICY = "scripts/studio-brush-frame-budget-policy.ts";
const BUNDLE_GATE = "scripts/check-studio-bundle.mjs";

export const ENGINEERING_ATLAS_DRAWING_OUTPUT: readonly EngineeringAtlasEntry[] = [
  {
    id: "export-engine-deterministic-pdf",
    category: "drawing",
    name: "Export engine",
    title: t("내보내기 엔진: 라이브러리 없이 손으로 조립하는 PDF·PNG", "Export engine: PDF and PNG assembled by hand, without a library"),
    status: "live",
    tagline: t("PDF 와 PNG 의 뼈대를 직접 조립해, 같은 입력이면 같은 바이트가 나옵니다.", "PDF and PNG skeletons are assembled directly, so the same input gives the same bytes."),
    background: [
      t(
        "내보내기는 작품이 앱 밖으로 나가는 마지막 관문입니다. PDF 는 객체(Catalog, Pages, Page, 이미지)와 '몇 번째 바이트에 무엇이 있는가'를 적은 상호 참조표(xref), 꼬리표(trailer)로 이뤄진 비교적 단순한 구조라 외부 라이브러리 없이 바이트 배열로 직접 쓸 수 있습니다. 모든 위치는 글자 수가 아니라 바이트 길이로 세어야 한글 제목이나 JPEG 이진 데이터가 있어도 xref 가 어긋나지 않습니다.",
        "Export is the last gate before artwork leaves the app. A PDF is a fairly simple structure of objects (Catalog, Pages, Page, image), a cross-reference table (xref) saying which byte holds what, and a trailer, so it can be written directly as a byte array without a library. Every position must be counted in bytes, not characters, so a Korean title or binary JPEG data does not throw the xref off.",
      ),
      t(
        "결정성도 같은 이유로 중요합니다. 생성 시각 같은 메타데이터를 넣지 않아 같은 입력이면 같은 바이트가 나오고, PNG 의 zlib 스트림은 압축하지 않는 저장(stored) 블록과 Adler-32 로 동기·결정적으로 만듭니다(해시 비교와 테스트에 유리). 대가는 파일 크기입니다. 이 방식은 SVG 로 내보낼 때 넣는 브러시 질감 PNG(최대 512px)와 인쇄 PDF 의 CMYK 래스터에 쓰이고, 일반 이미지 PDF 는 JPEG 를 그대로 담습니다.",
        "Determinism matters for the same reason. No timestamps are embedded, so the same input yields the same bytes, and a PNG's zlib stream is built synchronously and deterministically from uncompressed stored blocks plus an Adler-32 checksum (handy for hash comparison and tests). The price is file size. This approach is used for the brush-texture PNGs (up to 512 px) embedded in SVG exports and for the CMYK raster of print PDFs, while an ordinary image PDF embeds the JPEG as it is.",
      ),
      t(
        "인쇄용 PDF 는 재단 여백(도련)·재단선·CMYK 모드·양면 펼침면 배열을 얹습니다. 다만 CMYK 변환은 ICC 프로파일 기반 색관리가 아닌 단순 변환(GCR 100%)이라 인쇄소 변환과 색이 다를 수 있고, PDF/X 같은 규격 적합이 필요하면 별도 적합성 파이프라인을 거친다고 코드 주석이 밝힙니다. 색 교정(soft proof) PNG 는 ICC 프로파일을 iCCP 청크에 넣고 브라우저의 CompressionStream 으로 압축합니다.",
        "Print PDFs add bleed, crop marks, a CMYK mode and spread layout. The CMYK conversion, however, is a simple one (GCR 100%) rather than ICC-based color management, so colors can differ from a print shop's conversion, and code comments say standards conformance such as PDF/X goes through a separate conformance pipeline. A color-proof (soft proof) PNG embeds the ICC profile in an iCCP chunk and compresses with the browser's CompressionStream.",
      ),
      t(
        "PSD 는 ag-psd 로 요소를 개별 래스터 레이어로 쓰고(일반 가로쓰기 텍스트는 텍스트 정보도 함께 기록), 영상은 WebCodecs 로 H.264 를 인코딩해 MP4 로 조립합니다. 한계: 회전·세로쓰기·그라디언트 같은 조합은 텍스트로 쓰지 않고 래스터로 남기며, 손실 사유를 기록합니다.",
        "PSD export writes elements as individual raster layers with ag-psd (plain horizontal text also gets text data), and video is encoded as H.264 with WebCodecs and muxed into MP4. A limit: rotated, vertical or gradient text is not written as text but stays raster, with the reason for the loss recorded.",
      ),
    ],
    keyPoints: [
      t("PDF 1.4 를 외부 라이브러리 없이 바이트로 조립", "PDF 1.4 assembled as bytes, without a library"),
      t("모든 오프셋을 바이트 길이로 세어 xref 가 깨지지 않음", "Offsets counted in bytes so the xref never breaks"),
      t("같은 입력 → 같은 바이트(저장 블록 zlib, 시각 메타 없음)", "Same input, same bytes (stored-block zlib, no timestamps)"),
    ],
    diagram: {
      id: "export-engine-deterministic-pdf-diagram",
      kind: "graph",
      title: t("작품이 파일이 되는 길", "How artwork becomes a file"),
      caption: t("페이지 래스터 하나에서 PDF·PNG·PSD·MP4 쓰기 모듈로 갈라지고, 결정적 모듈은 같은 바이트를 냅니다.", "One page raster fans out to the PDF, PNG, PSD and MP4 writers, and the deterministic ones give identical bytes."),
      alt: t(
        "작품 페이지가 래스터로 구워진 뒤 네 갈래의 쓰기 모듈로 갑니다. PDF 는 객체와 xref 를 직접 조립하고, PNG 는 저장 블록 zlib 이나 iCCP 를 쓰며, PSD 는 레이어를 ag-psd 로 쓰고, MP4 는 WebCodecs 인코더와 muxer 를 씁니다. 모두 파일로 저장됩니다.",
        "The artwork page is baked into a raster and goes to four writers. PDF assembles objects and the xref directly, PNG uses stored-block zlib or iCCP, PSD writes layers with ag-psd, and MP4 uses a WebCodecs encoder and a muxer. All end as saved files.",
      ),
      nodes: [
        { id: "doc", label: t("작품 페이지", "Artwork pages"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "raster", label: t("페이지 래스터", "Page raster"), sub: t("캔버스 → JPEG·RGBA", "Canvas to JPEG or RGBA"), tone: "local", at: [1, 1] },
        { id: "pdf", label: t("PDF 1.4", "PDF 1.4"), sub: t("손으로 조립 · xref", "Hand-built, xref"), tone: "good", at: [2, 0] },
        { id: "png", label: t("PNG", "PNG"), sub: t("저장 블록 zlib · iCCP", "Stored zlib, iCCP"), tone: "good", at: [2, 1] },
        { id: "psd", label: t("PSD", "PSD"), sub: t("레이어별 래스터", "Raster per layer"), tone: "local", at: [2, 2] },
        { id: "mp4", label: t("MP4", "MP4"), sub: t("H.264 + muxer", "H.264 plus muxer"), tone: "local", at: [2, 3] },
        { id: "file", label: t("파일 저장", "Saved file"), sub: t("해시로 비교 가능", "Comparable by hash"), tone: "good", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "doc", to: "raster" },
        { from: "raster", to: "pdf" },
        { from: "raster", to: "png" },
        { from: "raster", to: "psd" },
        { from: "raster", to: "mp4" },
        { from: "pdf", to: "file" },
        { from: "png", to: "file" },
        { from: "psd", to: "file" },
        { from: "mp4", to: "file" },
      ],
    },
    usage: [
      {
        feature: t("내보내기 메뉴 · PDF(일반·인쇄용)", "Export menu · PDF (standard and print)"),
        role: t(
          "페이지를 JPEG 로 굽고 PDF 1.4 객체와 xref 를 직접 조립합니다. 인쇄용은 도련·재단선·CMYK·펼침면 배열 옵션을 얹습니다.",
          "Bakes pages to JPEG and assembles PDF 1.4 objects and the xref directly; the print variant adds bleed, crop marks, CMYK and spread layout options.",
        ),
        paths: [
          "apps/web/src/domains/creator/export/studio-pdf-export.ts#buildPdfFromJpegPages",
          "apps/web/src/domains/creator/export/studio-pdf-print-export.ts",
          "apps/web/src/domains/creator/export/StudioExportMenuPanel.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("SVG 내보내기 · 브러시 질감 PNG", "SVG export · brush-texture PNG"),
        role: t(
          "SVG 에 넣는 질감 PNG 를 저장 블록 zlib 로 만들어 어느 기기에서나 같은 바이트가 나오게 합니다.",
          "Builds the texture PNG embedded in SVG with stored-block zlib so every device produces the same bytes.",
        ),
        paths: ["apps/web/src/domains/creator/export/studio-svg-export-png.ts#svgPngStoredZlib"],
        route: "/studio",
      },
      {
        feature: t("색 교정(soft proof) PNG", "Color-proof (soft proof) PNG"),
        role: t(
          "ICC 프로파일을 iCCP 청크에 넣은 PNG 를 만들어, 인쇄 색을 화면에서 미리 확인하게 합니다.",
          "Builds a PNG with the ICC profile in an iCCP chunk so print colors can be previewed on screen.",
        ),
        paths: [
          "apps/web/src/domains/creator/color/studio-color-proof-png.ts",
          "apps/web/src/domains/creator/color/StudioColorProofDialog.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("PSD·MP4 내보내기", "PSD and MP4 export"),
        role: t(
          "PSD 는 ag-psd 로 레이어를 쓰고, 영상은 WebCodecs 인코더 루프와 MP4 muxer 로 조립합니다.",
          "PSD layers are written with ag-psd, and video is assembled with a WebCodecs encoder loop and an MP4 muxer.",
        ),
        paths: [
          "apps/web/src/domains/creator/export/studio-psd-export.ts",
          "apps/web/src/domains/creator/export/studio-webcodecs-mp4-export.ts",
          "apps/web/src/domains/creator/motion-webtoon/motion-webtoon-export.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("외부 라이브러리 없는 최소 PDF 1.4", "A minimal PDF 1.4 with no library"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "export function minimalPdf(): Uint8Array {",
            "  const enc = new TextEncoder();",
            "  const parts: string[] = [];",
            "  const offsets: number[] = [];",
            "  let len = 0;",
            "  const add = (s: string): void => {",
            "    parts.push(s);",
            "    len += enc.encode(s).length;",
            "  };",
            "  add('%PDF-1.4\\n');",
            "  const bodies = [",
            "    '<< /Type /Catalog /Pages 2 0 R >>',",
            "    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',",
            "    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>',",
            "  ];",
            "  bodies.forEach((body, i) => {",
            "    offsets.push(len); // @1@",
            "    add(String(i + 1) + ' 0 obj\\n' + body + '\\nendobj\\n');",
            "  });",
            "  const xref = len;",
            "  add('xref\\n0 4\\n0000000000 65535 f \\n');",
            "  for (const o of offsets) add(String(o).padStart(10, '0') + ' 00000 n \\n'); // @2@",
            "  add('trailer\\n<< /Size 4 /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF');",
            "  return enc.encode(parts.join(''));",
            "}",
          ].join("\n"),
          [
            "모든 오프셋은 글자 수가 아니라 '바이트 길이'로 센다(한글·바이너리에서도 xref 가 깨지지 않도록).",
            "이 객체가 시작하는 바이트 위치를 기록",
            "xref 항목은 정확히 20바이트",
          ],
          [
            "Count every offset in bytes, not characters, so the xref survives Korean text and binary data.",
            "record the byte position where this object starts",
            "each xref entry is exactly 20 bytes",
          ],
        ),
        explain: t(
          "객체 3개와 xref·trailer 만으로 poppler 의 pdfinfo 가 1쪽 200×100pt 문서로 읽는 PDF 가 됩니다(이 카드에서 실행해 확인). 제품은 여기에 이미지 XObject, 제목, 인쇄용 박스를 더하되 같은 원칙으로 조립합니다.",
          "Three objects plus an xref and trailer are enough for poppler's pdfinfo to read it as a one-page 200 x 100 pt document (checked by running it for this card). The product adds image XObjects, a title and print boxes, assembling by the same principle.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("압축하지 않는 zlib 스트림(저장 블록)", "An uncompressed zlib stream (stored blocks)"),
        language: "ts",
        source: "apps/web/src/domains/creator/export/studio-svg-export-png.ts",
        ...commentedCode(
          [
            "function adler32(bytes: Uint8Array): number {",
            "  let a = 1;",
            "  let b = 0;",
            "  for (const byte of bytes) {",
            "    a = (a + byte) % 65521;",
            "    b = (b + a) % 65521;",
            "  }",
            "  return ((b << 16) | a) >>> 0;",
            "}",
            "// @0@",
            "export function storedZlib(bytes: Uint8Array): Uint8Array {",
            "  const blocks = Math.max(1, Math.ceil(bytes.length / 65535));",
            "  const out = new Uint8Array(2 + blocks * 5 + bytes.length + 4);",
            "  const view = new DataView(out.buffer);",
            "  out.set([0x78, 0x01], 0); // @1@",
            "  let src = 0;",
            "  let dst = 2;",
            "  for (let i = 0; i < blocks; i++) {",
            "    const len = Math.min(65535, bytes.length - src);",
            "    out[dst++] = i === blocks - 1 ? 1 : 0; // @2@",
            "    view.setUint16(dst, len, true);",
            "    view.setUint16(dst + 2, len ^ 0xffff, true);",
            "    dst += 4;",
            "    out.set(bytes.subarray(src, src + len), dst);",
            "    src += len;",
            "    dst += len;",
            "  }",
            "  view.setUint32(dst, adler32(bytes), false); // @3@",
            "  return out;",
            "}",
          ].join("\n"),
          [
            "압축하지 않는 zlib 스트림: 같은 입력은 어디서나 같은 바이트(결정적)",
            "zlib 헤더",
            "마지막 블록 표시 비트 + 저장(무압축) 블록 형식",
            "Adler-32 체크섬",
          ],
          [
            "An uncompressed zlib stream: the same input gives the same bytes everywhere (deterministic)",
            "zlib header",
            "final-block bit plus the stored (uncompressed) block type",
            "Adler-32 checksum",
          ],
        ),
        explain: t(
          "제품의 svgPngStoredZlib 을 줄여 옮긴 것입니다. Node 의 inflate 로 0·1·65,535·65,536·200,000 바이트 입력을 풀어 원본과 같은지 확인했습니다. 저장 블록 하나는 최대 65,535바이트입니다.",
          "A reduced copy of the product's svgPngStoredZlib. Inputs of 0, 1, 65,535, 65,536 and 200,000 bytes were inflated with Node and matched the originals. One stored block holds at most 65,535 bytes.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Adobe · PDF 32000-1:2008 (ISO 32000-1)", url: "https://www.adobe.com/content/dam/acom/en/devnet/pdf/pdfs/PDF32000_2008.pdf", kind: "spec", note: t("PDF 1.7 표준 사본. 객체·xref·trailer 구조의 근거", "A copy of the PDF 1.7 standard, the source of the object, xref and trailer structure") },
      { title: "IETF · RFC 1950 (ZLIB)", url: "https://datatracker.ietf.org/doc/html/rfc1950", kind: "spec" },
      { title: "IETF · RFC 1951 (DEFLATE)", url: "https://datatracker.ietf.org/doc/html/rfc1951", kind: "spec", note: t("저장(무압축) 블록 형식", "The stored (uncompressed) block format") },
      { title: "W3C · Portable Network Graphics (PNG) Specification", url: "https://www.w3.org/TR/png-3/", kind: "spec" },
      { title: "MDN · CompressionStream", url: "https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream", kind: "docs" },
      { title: "W3C · WebCodecs", url: "https://www.w3.org/TR/webcodecs/", kind: "spec" },
    ],
    chapterIds: ["storage", "browser-local-compute"],
    talk: {
      pitch: t(
        "작품을 PDF 와 PNG 로 내보낼 때 외부 라이브러리 없이 파일의 뼈대를 직접 만듭니다. 구조가 단순하고, 같은 입력이면 바이트까지 같아서 해시로 비교하고 테스트할 수 있기 때문입니다. 인쇄용 CMYK 가 단순 변환이라는 한계도 코드에 그대로 적어 두었습니다.",
        "When exporting artwork as PDF or PNG, we build the file skeleton ourselves without a library. The structure is simple, and identical input gives identical bytes, so files can be compared by hash and tested. The limit that print CMYK is a simple conversion is stated plainly in the code.",
      ),
      analogy: t(
        "설계도를 보고 레고를 직접 조립하는 것과 같습니다. 조각 위치가 한 칸만 틀려도 목차(xref)가 어긋나므로 조각 크기를 바이트로 정확히 잽니다.",
        "It is like building Lego from a blueprint: one misplaced piece throws off the table of contents (xref), so every piece is measured exactly in bytes.",
      ),
      questions: [
        {
          question: t("왜 PDF 라이브러리를 안 쓰나요?", "Why not use a PDF library?"),
          answer: t(
            "결정성, 번들 크기, 검증 가능성 때문입니다. 이미지 전용 PDF 는 구조가 단순합니다. 대신 글꼴 포함·태그 PDF 같은 복잡한 기능은 이 라이터가 다루지 않고, 규격 적합(PDF/X)은 별도 파이프라인의 몫입니다.",
            "For determinism, bundle size and verifiability; an image-only PDF is structurally simple. In exchange this writer does not handle complex features such as embedded fonts or tagged PDF, and standards conformance (PDF/X) belongs to a separate pipeline.",
          ),
        },
        {
          question: t("CMYK 인쇄 색은 정확한가요?", "Are CMYK print colors accurate?"),
          answer: t(
            "아닙니다. ICC 기반 색관리가 아닌 단순 변환이라 인쇄소 변환과 다를 수 있다고 코드 주석이 밝힙니다. 정확한 색이 필요하면 적합성 파이프라인을 쓰도록 구분해 둡니다.",
            "No. A code comment states it is a simple conversion rather than ICC-based color management and may differ from a print shop's conversion; when exact color is needed, the conformance pipeline is the separate route.",
          ),
        },
        {
          question: t("압축을 안 하면 파일이 커지지 않나요?", "Doesn't skipping compression make files larger?"),
          answer: t(
            "커집니다. 그래서 저장 블록 방식은 SVG 질감 PNG(최대 512px)와 CMYK 래스터에 한정하고, 일반 PDF 는 JPEG 를 그대로 담습니다.",
            "They do grow, which is why the stored-block method is limited to SVG texture PNGs (up to 512 px) and the CMYK raster, while an ordinary PDF embeds the JPEG as it is.",
          ),
        },
      ],
      pitfall: t(
        "'모든 내보내기가 결정적'이라고 말하지 마세요. 결정성은 PDF 조립부와 저장 블록 PNG 에 대한 설계이고, 브라우저의 canvas.toBlob 이 만드는 JPEG 바이트는 브라우저에 따라 다를 수 있습니다. 같은 문서를 두 번 내보내 해시를 비교하는 시연은 이 카드에서 해 보지 않았습니다.",
        "Do not say every export is deterministic. Determinism is the design of the PDF assembly and the stored-block PNG; the JPEG bytes produced by the browser's canvas.toBlob may differ between browsers. A demo of exporting the same document twice and comparing hashes was not run for this card.",
      ),
    },
    technologies: ["PDF", "PNG", "WebCodecs", "ag-psd"],
    facts: [
      { value: "1 px = 0.75 pt", label: t("PDF 쪽 크기 환산(CSS 96dpi ↔ PDF 72pt/inch)", "PDF page-size conversion (CSS 96 dpi to PDF 72 pt/inch)"), source: "apps/web/src/domains/creator/export/studio-pdf-export.ts" },
      { value: "65,535 B", label: t("저장(무압축) 블록 하나의 최대 크기", "Maximum size of one stored (uncompressed) block"), source: "apps/web/src/domains/creator/export/studio-svg-export-png.ts" },
      { value: "16,777,216", label: t("색 교정 PNG 가 받는 최대 픽셀 수", "Maximum pixels accepted by the color-proof PNG"), source: "apps/web/src/domains/creator/color/studio-color-proof-png.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "drawing-quality-gates",
    category: "drawing",
    name: "Quality gates",
    title: t("그린다는 약속을 숫자로 지키기: 입력 지연 예산·GPU 패리티·번들 래칫", "Keeping the drawing promise in numbers: latency budgets, GPU parity, bundle ratchet"),
    status: "live",
    tagline: t("지연·화면/저장 일치·번들 크기의 합격 기준을 코드로 두고, 밤마다 실제 브라우저에서 잽니다.", "Pass criteria for latency, display/commit match and bundle size live in code and are measured nightly in a real browser."),
    background: [
      t(
        "드로잉 앱의 품질은 '대체로 빠르다'가 아니라 '가끔 끊기지 않는다'로 판가름납니다. 평균이 아니라 꼬리(p95·p99)를 보는 이유는 사용자가 가끔의 끊김을 기억하기 때문입니다. 입력 지연 게이트는 Playwright 로 실제 브라우저에서 획을 그리며 포인터 이벤트부터 픽셀이 바뀔 때까지를 재고, 합격은 '경쟁 예산'이 결정합니다. 포인터 추가 처리 p95 8ms·p99 16.7ms(60Hz 한 프레임), 롱태스크 50ms 미만, 펜을 뗀 뒤 정착 목표 16ms·절대 한도 50ms 입니다.",
        "A drawing app's quality is judged not by being usually fast but by rarely stuttering. Tails (p95, p99) matter rather than averages because users remember the occasional hitch. The input-latency gate draws strokes in a real browser with Playwright and times pointer event to changed pixels, and a competitive budget decides pass or fail: pointer append p95 8 ms and p99 16.7 ms (one 60 Hz frame), long tasks under 50 ms, and settling after pen-up with a 16 ms target and a 50 ms absolute limit.",
      ),
      t(
        "예전의 기기 교차 임계값(첫 픽셀 200ms 치명 등)은 추세 비교용으로만 남겨 합격이나 종료 코드를 결정하지 못하게 코드 주석으로 못 박았습니다. 측정 행렬은 브러시 17종, 입력 샘플 1천·8천·5만 개와 30초 획, 포인터 속도 120·240Hz, 화면 배율 1·2배입니다. 이 카드는 그 '합격 기준'을 소개할 뿐 달성한 측정값을 주장하지 않습니다.",
        "The older cross-machine thresholds (such as a 200 ms fatal first pixel) are kept for trend comparison only, and a code comment bars them from deciding pass or the exit code. The measurement matrix is 17 brushes, 1k, 8k and 50k input samples plus a 30-second stroke, pointer rates of 120 and 240 Hz, and display scales of 1x and 2x. This card presents those pass criteria and claims no achieved measurement.",
      ),
      t(
        "GPU 커밋 패리티 게이트는 같은 획을 '화면에 보이는 경로'와 '확정(커밋) 경로'로 그려 128×96 캡처의 픽셀을 허용오차 안에서 비교합니다. 번들 게이트는 설계 목표 초과를 관찰(telemetry)로만 두고, 마지막으로 수용한 실측(scripts/bundle-baseline.json)보다 바이트 +2%(청크 수는 +2% 또는 최소 2개)를 넘어 나빠질 때만 빌드를 실패시키는 래칫입니다. 줄이는 게이트가 아니라 늘지 않게 잠그는 게이트이고, 엔진 격리 같은 구조 계약은 예전부터 무조건 실패 조건입니다.",
        "The GPU commit-parity gate draws the same stroke through the on-screen path and the commit path and compares the pixels of a 128 x 96 capture within a tolerance. The bundle gate treats exceeding design targets as telemetry only and fails the build only when something gets worse than the last accepted measurement (scripts/bundle-baseline.json) by more than 2% in bytes (chunk counts: 2% or at least 2). It locks growth rather than shrinking, and structural contracts such as engine isolation have always been hard failures.",
      ),
      t(
        "정직한 한계: 이 게이트들은 매일 밤(04:17 KST)과 수동으로 도는 'Studio exhaustive' 워크플로의 레인에 연결돼 있고, 이 카드를 쓰며 실행하지는 않았으므로 최근 통과·실패 이력은 확인하지 못했습니다. 물리 펜과 장시간 실기기 인증은 소프트웨어 검증으로 주장하지 않는 운영 인수 단계로 남습니다.",
        "Honest limits: these gates are wired into lanes of the 'Studio exhaustive' workflow that runs nightly (04:17 KST) and on demand; they were not run while writing this card, so recent pass or fail history was not checked. Certification with a physical pen and long real-device sessions remains an operational acceptance step that software checks do not claim.",
      ),
    ],
    keyPoints: [
      t("합격 기준은 평균이 아니라 p95·p99 꼬리와 롱태스크", "Pass criteria are p95/p99 tails and long tasks, not averages"),
      t("옛 임계값은 추세용, 합격은 경쟁 예산이 결정", "Old thresholds are for trends; the competitive budget decides"),
      t("번들은 줄이는 게 아니라 늘지 않게 잠그는 래칫(+2%)", "The bundle gate is a ratchet (+2%) that locks growth, not a shrink target"),
    ],
    diagram: {
      id: "drawing-quality-gates-diagram",
      kind: "layers",
      title: t("품질을 지키는 네 겹", "Four layers that guard quality"),
      caption: t("위로 갈수록 자주 돌고, 아래로 갈수록 현실에 가깝습니다. 맨 아래는 사람이 확인합니다.", "Higher layers run more often; lower ones are closer to reality. The last is checked by people."),
      alt: t(
        "맨 위는 변경마다 도는 단위·통합 테스트이고, 그 아래는 합격 기준을 파일로 고정한 정책 코드입니다. 세 번째는 Playwright 로 실제 브라우저에서 지연과 패리티를 재는 야간 게이트이고, 맨 아래는 물리 펜과 장시간 인증 같은 실기기 인수로 소프트웨어 검증으로 주장하지 않습니다.",
        "At the top are unit and integration tests that run on every change, below them policy code that fixes pass criteria in files. Third is the nightly gate that measures latency and parity in a real browser with Playwright, and at the bottom is real-device acceptance, such as a physical pen and long sessions, which software checks do not claim.",
      ),
      layers: [
        { id: "unit", label: t("단위·통합 테스트", "Unit and integration tests"), sub: t("불변식·결정성·경계값을 변경마다 검사", "Invariants, determinism and edge values on every change"), tone: "local", chips: ["Vitest"] },
        { id: "policy", label: t("합격 기준을 코드로", "Pass criteria as code"), sub: t("경쟁 예산·번들 기준선이 파일로 고정", "Competitive budgets and bundle baseline fixed in files"), tone: "neutral" },
        { id: "browser", label: t("실제 브라우저 게이트", "Real-browser gates"), sub: t("지연·화면/커밋 패리티·필터 패리티를 야간에 잼", "Latency, display/commit parity and filter parity measured nightly"), tone: "good", chips: ["Playwright", "WebGPU"] },
        { id: "device", label: t("실기기 인수", "Real-device acceptance"), sub: t("물리 펜·장시간 인증은 사람이 확인하는 운영 단계", "Physical pen and long sessions are a human operations step"), tone: "warn" },
      ],
      brackets: [
        { label: t("저장소에서 자동으로 도는 구간", "Runs automatically in the repo"), layerIds: ["unit", "policy", "browser"] },
        { label: t("소프트웨어로 주장하지 않는 구간", "Not claimed by software tests"), layerIds: ["device"] },
      ],
    },
    usage: [
      {
        feature: t("브러시 입력 지연 게이트", "Brush input-latency gate"),
        role: t(
          "실제 브라우저에서 17개 브러시의 획을 그려 포인터에서 픽셀까지의 지연을 재고, 경쟁 예산으로 합격을 판정합니다.",
          "Draws strokes with 17 brushes in a real browser, measures pointer-to-pixel latency and judges pass or fail against the competitive budget.",
        ),
        paths: [
          "scripts/verify-studio-brush-latency.mts",
          `${LATENCY_POLICY}#STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS`,
          "scripts/studio-brush-latency-policy.ts",
        ],
      },
      {
        feature: t("GPU 커밋 패리티·GPU 필터 패리티", "GPU commit parity and GPU filter parity"),
        role: t(
          "화면 경로와 커밋 경로가 같은 픽셀을 내는지, GPU 필터가 CPU 와 맞는지 허용오차 안에서 비교합니다.",
          "Compares within a tolerance whether the display and commit paths give the same pixels and whether GPU filters match the CPU.",
        ),
        paths: ["scripts/verify-studio-gpu-committed-parity.mts", "scripts/verify-studio-gpu-filters.mts"],
      },
      {
        feature: t("번들 크기 래칫", "Bundle-size ratchet"),
        role: t(
          "마지막으로 수용한 실측보다 +2% 넘게 나빠질 때만 빌드를 실패시키고, 기준선은 사람이 명시적으로만 갱신합니다.",
          "Fails the build only when results get worse than the last accepted measurement by more than 2%, and the baseline is updated only explicitly by a person.",
        ),
        paths: [BUNDLE_GATE, "scripts/bundle-baseline.json", "docs/perf/bundle-gate.md"],
      },
      {
        feature: t("야간 전체 QA 워크플로", "Nightly full-QA workflow"),
        role: t(
          "브러시 렌더링 레인(지연, 커밋 패리티, GPU 필터, Hokusai, 역할 원장 검사 등)을 매일 밤과 수동으로 실행합니다.",
          "Runs the brush-rendering lanes (latency, commit parity, GPU filters, Hokusai, ledger check and more) nightly and on demand.",
        ),
        paths: [".github/workflows/main-full-qa-studio.yml"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("평균은 통과, 꼬리는 불합격", "The average passes, the tail fails"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "const pct = (xs: number[], q: number): number =>",
            "  [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * q) - 1)]!;",
            "",
            "// @1@",
            "const BUDGET = { appendP95: 8, appendP99: 16.7, longTask: 50 } as const;",
            "",
            "function appendOk(appendMs: number[], longTasks: number[]): boolean {",
            "  return pct(appendMs, 0.95) <= BUDGET.appendP95",
            "    && pct(appendMs, 0.99) <= BUDGET.appendP99",
            "    && longTasks.every((d) => d < BUDGET.longTask);",
            "}",
            "",
            "const samples = Array.from({ length: 1000 }, (_, i) => (i % 50 === 49 ? 20 : 3)); // @2@",
            "const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;",
            "console.log(avg, pct(samples, 0.95), pct(samples, 0.99), appendOk(samples, [])); // @3@",
          ].join("\n"),
          [
            "퍼센타일: 정렬 후 ceil(n*q)-1 번째 값 (지연 게이트와 같은 정의)",
            "경쟁 예산(ms): 포인터 이벤트 → append 경로 p95/p99, 롱태스크",
            "2%가 20ms",
            "평균 3.34 인데 p99 가 20 이라 false — 평균은 끊김을 숨긴다",
          ],
          [
            "Percentile: the ceil(n*q)-1 th value after sorting (same definition as the latency gate)",
            "Competitive budget (ms): pointer event to append path p95/p99, long tasks",
            "2% are 20 ms",
            "average 3.34 but p99 is 20, so false - an average hides stutter",
          ],
        ),
        explain: t(
          "저장소의 지연 게이트와 같은 퍼센타일 정의와 예산 숫자를 쓴 장난감입니다. 1000개 중 2%만 20ms 여도 평균은 3.34ms 로 멀쩡하지만 p99 가 예산을 넘어 불합격입니다(Node 로 실행해 확인).",
          "A toy using the same percentile definition and budget numbers as the repository's latency gate. Even if only 2% of 1000 samples take 20 ms, the average looks fine at 3.34 ms, yet p99 exceeds the budget and it fails (checked by running it in Node).",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("래칫: 나빠질 때만 막는다", "A ratchet: block only when it gets worse"),
        language: "ts",
        ...commentedCode(
          [
            "interface Metric { baseline: number; current: number }",
            "const TOLERANCE = 0.02; // @0@",
            "",
            "// @1@",
            "function regressed(m: Metric): boolean {",
            "  return m.current > m.baseline * (1 + TOLERANCE);",
            "}",
            "",
            "console.log(regressed({ baseline: 1000, current: 1015 })); // @2@",
            "console.log(regressed({ baseline: 1000, current: 1030 })); // @3@",
          ].join("\n"),
          [
            "바이트 허용오차 +2%: 코드 생성 잡음은 흡수하고 진짜 회귀는 못 흡수한다",
            "기준선보다 나빠진 것만 실패시킨다. 좋아져도 통과하고, 기준선 갱신은 사람이 명시적으로 한다.",
            "false — 1.5% 증가는 허용오차 안",
            "true — 3% 증가는 회귀로 실패",
          ],
          [
            "Byte tolerance +2%: absorbs code-generation noise but not real regressions",
            "Only results worse than the baseline fail. Improvements pass, and updating the baseline is an explicit human act.",
            "false - a 1.5% increase is within tolerance",
            "true - a 3% increase is a regression and fails",
          ],
        ),
        explain: t(
          "저장소 게이트의 허용오차(바이트 +2%)와 같은 생각입니다. 실제 게이트는 새 지표가 기준선에 없을 때와 기준선 파일이 없을 때도 실패시킵니다.",
          "The same idea as the repository gate's tolerance (+2% in bytes). The real gate also fails when a new metric is missing from the baseline or when the baseline file is absent.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Playwright", url: "https://playwright.dev/", kind: "docs", note: t("지연 게이트가 쓰는 브라우저 자동화", "The browser automation behind the latency gate") },
      { title: "MDN · PerformanceLongTaskTiming", url: "https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming", kind: "docs", note: t("롱태스크(50ms 이상)의 표준 정의", "The standard definition of a long task (over 50 ms)") },
      { title: "web.dev · Optimize long tasks", url: "https://web.dev/articles/optimize-long-tasks", kind: "guide" },
    ],
    chapterIds: ["quality", "performance"],
    talk: {
      pitch: t(
        "그리는 느낌은 평균 속도가 아니라 가끔의 끊김이 결정합니다. 그래서 펜 입력이 화면에 반영되는 시간을 p95·p99 꼬리로 재고 합격 기준을 코드에 박았습니다. 화면에 보이는 경로와 저장 경로가 같은 픽셀을 내는지도 비교하고, 번들 크기는 줄이는 게 아니라 늘지 않게 잠급니다.",
        "How drawing feels is decided not by average speed but by occasional stutter. So input-to-screen time is measured at the p95 and p99 tails, with pass criteria written in code. We also compare whether the on-screen and saved paths give the same pixels, and the bundle size is locked from growing rather than shrunk.",
      ),
      analogy: t(
        "자동차 연비를 평균만 보는 대신, 가장 막히는 구간의 속도로 합격을 정하는 것과 같습니다.",
        "It is like passing a car not on its average mileage but on its speed through the worst traffic jam.",
      ),
      questions: [
        {
          question: t("경쟁 예산이 뭔가요?", "What is a competitive budget?"),
          answer: t(
            "경쟁 제품 수준을 목표로 합격 판정에 직접 쓰는 예산입니다. 포인터 추가 p95 8ms·p99 16.7ms, 롱태스크 50ms 미만 같은 값이고, 예전 교차 기기 임계값은 추세용으로만 남겨 두었습니다.",
            "A budget aimed at competing products' level and used directly for the pass decision, such as pointer append p95 8 ms and p99 16.7 ms and long tasks under 50 ms; the older cross-machine thresholds remain only for trends.",
          ),
        },
        {
          question: t("지금 이 게이트들은 통과하나요?", "Do these gates pass right now?"),
          answer: t(
            "이 카드를 쓰며 게이트를 실행하지 않았고 최근 CI 결과도 확인하지 못했습니다. 숫자를 말하려면 측정 날짜·기기·빌드를 함께 확인하세요.",
            "The gates were not run while writing this card and recent CI results were not checked. To quote a number, confirm the measurement date, device and build with it.",
          ),
        },
        {
          question: t("번들이 커지면 배포가 막히나요?", "Does a bigger bundle block release?"),
          answer: t(
            "설계 목표 초과는 관찰만 하고, 마지막으로 수용한 실측보다 2% 넘게 나빠질 때 빌드가 실패합니다. 늘리려면 사람이 기준선을 명시적으로 갱신하고 이유를 남겨야 합니다(docs/perf/bundle-gate.md).",
            "Exceeding a design target is only observed; the build fails when results are worse than the last accepted measurement by more than 2%. To grow, a person must update the baseline explicitly and record why (docs/perf/bundle-gate.md).",
          ),
        },
      ],
      pitfall: t(
        "숫자는 '합격 기준'이지 '달성한 측정값'이 아닙니다. 8ms 가 달성된 지연이라고 말하지 마세요. 게이트는 PR 마다가 아니라 야간·수동 워크플로로 돌고, 지연 게이트가 실제로 어떤 GPU·렌더러로 도는지는 이 카드에서 확인하지 못했습니다. 실험 앱 규칙(ADR-0026)은 소프트웨어 렌더러 결과를 성능 증거로 쓰지 않는다고 정합니다.",
        "The numbers are pass criteria, not achieved measurements; do not say 8 ms is the latency achieved. The gates run in a nightly and on-demand workflow rather than on every pull request, and which GPU or renderer the latency gate really runs on was not verified for this card. The lab-app rule (ADR-0026) says results from a software renderer are not performance evidence.",
      ),
    },
    technologies: ["Playwright", "Vitest", "WebGPU"],
    facts: [
      { value: "8 ms · 16.7 ms", label: t("포인터 추가 처리 p95 · p99 합격 예산", "Pass budget for pointer-append p95 and p99"), source: LATENCY_POLICY },
      { value: "17", label: t("지연 측정 대상 브러시 수", "Number of brushes in the latency measurement"), source: LATENCY_POLICY },
      { value: "+2%", label: t("번들 바이트 래칫 허용오차", "Byte tolerance of the bundle ratchet"), source: BUNDLE_GATE },
    ],
    reviewedAt: "2026-10-07",
  },
];
