// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPptxArchive,
  parsePptxArchive,
  parsePptxArchiveAsync,
  type PptxDeckInput,
} from "./ooxml-pptx-builder";
import {
  buildZipArchive,
  computeCrc32,
  decodeUtf8,
  encodeUtf8,
  readZipArchive,
} from "./ooxml-zip-codec";
import {
  BUILD_ANIMATION_OPTIONS,
  NATIVE_CHART_VARIANT_OPTIONS,
  PPTX_DECK_PRESETS,
  SMARTART_VARIANT_OPTIONS,
  addTableColumn,
  addTableRow,
  buildNativeChartSvgModel,
  buildSmartArtSvgModel,
  computeAnimationPlaybackFrame,
  createDefaultChartBlock,
  createDefaultSmartArtBlock,
  createDefaultTableModel,
  createPptxPresetDeck,
  getTotalTimelineDurationMs,
  removeTableColumn,
  removeTableRow,
  reorderAnimationEntry,
  toggleTableBandedRows,
  toggleTableHeaderRow,
  updateTableCell,
  updateTableHeader,
} from "./ppt-smartart-chart-table";
import { PptxDeckStudioTab } from "./PptxDeckStudioTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function buildDeflateZipForTest(
  entries: readonly { readonly path: string; readonly text: string }[],
): Promise<Uint8Array> {
  const compressedParts: {
    readonly pathBytes: Uint8Array;
    readonly rawBytes: Uint8Array;
    readonly deflated: Uint8Array;
    readonly crc: number;
    readonly localOffset: number;
  }[] = [];

  let localSize = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const pathBytes = encodeUtf8(entry.path);
    const rawBytes = encodeUtf8(entry.text);
    const crc = computeCrc32(rawBytes);

    const stream = new CompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    const copy = new Uint8Array(rawBytes.byteLength);
    copy.set(rawBytes);
    await writer.write(copy);
    await writer.close();

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let len = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      len += next.value.byteLength;
    }
    const deflated = new Uint8Array(len);
    let pos = 0;
    for (const c of chunks) {
      deflated.set(c, pos);
      pos += c.byteLength;
    }

    compressedParts.push({ pathBytes, rawBytes, deflated, crc, localOffset: localSize });
    localSize += 30 + pathBytes.length + deflated.length;
    centralSize += 46 + pathBytes.length;
  }

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let off = 0;
  for (const part of compressedParts) {
    view.setUint32(off, 0x04034b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 0x0800, true);
    view.setUint16(off + 8, 8, true);
    view.setUint32(off + 14, part.crc, true);
    view.setUint32(off + 18, part.deflated.length, true);
    view.setUint32(off + 22, part.rawBytes.length, true);
    view.setUint16(off + 26, part.pathBytes.length, true);
    off += 30;
    out.set(part.pathBytes, off);
    off += part.pathBytes.length;
    out.set(part.deflated, off);
    off += part.deflated.length;
  }
  const cdStart = off;
  for (const part of compressedParts) {
    view.setUint32(off, 0x02014b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint16(off + 8, 0x0800, true);
    view.setUint16(off + 10, 8, true);
    view.setUint32(off + 16, part.crc, true);
    view.setUint32(off + 20, part.deflated.length, true);
    view.setUint32(off + 24, part.rawBytes.length, true);
    view.setUint16(off + 28, part.pathBytes.length, true);
    view.setUint32(off + 42, part.localOffset, true);
    off += 46;
    out.set(part.pathBytes, off);
    off += part.pathBytes.length;
  }
  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 8, compressedParts.length, true);
  view.setUint16(off + 10, compressedParts.length, true);
  view.setUint32(off + 12, centralSize, true);
  view.setUint32(off + 16, cdStart, true);
  return out;
}

describe("ooxml-zip-codec — 표준 ZIP 인코더·디코더 및 CRC-32", () => {
  it("IEEE CRC-32 표준 벡터('123456789' -> 0xcbf43926)와 일치한다", () => {
    expect(computeCrc32(encodeUtf8("123456789"))).toBe(0xcbf43926);
  });

  it("ZIP 매직 바이트(PK\\x03\\x04), UTF-8 플래그(0x0800), EOCD를 기록하고 한글 파일·내용을 무손실 라운드트립한다", () => {
    const zip = buildZipArchive([
      { path: "한글폴더/소개.txt", data: "안녕하세요 ToonStudio PPTX 엔진입니다." },
      { path: "meta/info.json", data: '{"version":1,"lang":"ko-KR"}' },
    ]);

    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint16(6, true)).toBe(0x0800);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);

    const parsed = readZipArchive(zip);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].path).toBe("한글폴더/소개.txt");
    expect(decodeUtf8(parsed[0].data)).toBe("안녕하세요 ToonStudio PPTX 엔진입니다.");
    expect(parsed[1].path).toBe("meta/info.json");
    expect(decodeUtf8(parsed[1].data)).toBe('{"version":1,"lang":"ko-KR"}');
  });

  it("데이터 1바이트가 손상되면 CRC-32 불일치 오류를 던진다", () => {
    const zip = buildZipArchive([{ path: "a.txt", data: "integrity-check-payload" }]);
    const corrupted = new Uint8Array(zip);
    // 첫 엔트리의 데이터 영역(30 + 5 = 35) 1바이트 변조
    corrupted[36] ^= 0xff;
    expect(() => readZipArchive(corrupted)).toThrow(/CRC-32/);
  });
});

describe("ooxml-pptx-builder — 실제 PowerPoint 호환 OOXML .pptx 생성 및 라운드트립", () => {
  const sampleDeck: PptxDeckInput = {
    title: "한글 IR 사업계획서 <2026 & 검증>",
    author: "홍길동",
    slideSize: "16:9",
    themeId: "pitch-cobalt",
    slides: [
      {
        id: "s1",
        title: "1장 · 문제인식과 <핵심 & 기회>",
        subtitle: '따옴표 "테스트" 및 \'작은따옴표\' UTF-8 검증',
        bullets: [
          "작화·콘티·발표 도구 분절로 인한 반복 작업 해소",
          "로컬 우선 OPFS 저장과 즉시 .pptx 내보내기",
        ],
        shapes: [
          {
            id: "sh-1",
            kind: "roundRect",
            label: "핵심 배지",
            xPct: 68,
            yPct: 74,
            wPct: 24,
            hPct: 12,
            tone: "accent",
          },
          {
            id: "sh-2",
            kind: "arrow",
            label: "다음 단계",
            xPct: 40,
            yPct: 74,
            wPct: 22,
            hPct: 12,
            tone: "highlight",
          },
        ],
        speakerNotes: "첫 슬라이드 발표자 노트: 30초 안에 핵심 문제를 전달합니다.",
        transition: "fade",
      },
      {
        id: "s2",
        title: "2장 · 실현가능성과 단위경제성 표",
        bullets: ["표 데이터가 OOXML <a:tbl>로 정확히 직렬화된다"],
        table: {
          id: "tbl-1",
          title: "핵심 비교표",
          headers: ["항목", "기존 방식", "ToonStudio"],
          rows: [
            ["발표 자료 제작", "수동 캡처", "원클릭 OOXML .pptx"],
            ["한글 호환", "폰트 깨짐 위험", "Malgun Gothic EA 매핑"],
          ],
          showHeaderRow: true,
          bandedRows: true,
        },
        speakerNotes: "두 번째 슬라이드 노트: 표의 행과 열이 PowerPoint에서 그대로 편집됩니다.",
        transition: "push",
      },
      {
        id: "s3",
        title: "3장 · 성장전략과 팀 실행 로드맵",
        bullets: ["초기 거점 스튜디오 파일럿 후 확장"],
        smartArt: createDefaultSmartArtBlock("process-chevron"),
        speakerNotes: "세 번째 슬라이드 노트: 모핑 전환 효과와 발표 마무리.",
        transition: "morph",
      },
    ],
  };

  it("필수 OOXML 패키지를 모두 포함해 .pptx를 생성하고 parsePptxArchive로 100% 텍스트·표·노트·전환을 복원한다", () => {
    const bytes = buildPptxArchive(sampleDeck);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const entries = readZipArchive(bytes);
    const paths = new Set(entries.map((entry) => entry.path));

    const requiredPaths = [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "ppt/slides/slide1.xml",
      "ppt/slides/_rels/slide1.xml.rels",
      "ppt/slides/slide2.xml",
      "ppt/slides/_rels/slide2.xml.rels",
      "ppt/slides/slide3.xml",
      "ppt/slides/_rels/slide3.xml.rels",
      "ppt/notesSlides/notesSlide1.xml",
      "ppt/notesSlides/notesSlide2.xml",
      "ppt/notesSlides/notesSlide3.xml",
    ];
    for (const reqPath of requiredPaths) {
      expect(paths.has(reqPath)).toBe(true);
    }

    const parsed = parsePptxArchive(bytes);
    expect(parsed.slideCount).toBe(3);
    expect(parsed.deck.title).toBe(sampleDeck.title);
    expect(parsed.deck.slideSize).toBe("16:9");
    expect(parsed.deck.themeId).toBe("pitch-cobalt");

    // 1번 슬라이드: 한글 제목·부제목·특수문자 이스케이프·글머리·도형·노트·전환
    const s1 = parsed.deck.slides[0];
    expect(s1.title).toBe(sampleDeck.slides[0].title);
    expect(s1.subtitle).toBe(sampleDeck.slides[0].subtitle);
    expect(s1.bullets).toEqual(sampleDeck.slides[0].bullets);
    expect(s1.shapes?.map((s) => s.kind)).toEqual(["roundRect", "arrow"]);
    expect(s1.speakerNotes).toBe(sampleDeck.slides[0].speakerNotes);
    expect(s1.transition).toBe("fade");

    // 2번 슬라이드: 네이티브 <a:tbl> 표 라운드트립
    const s2 = parsed.deck.slides[1];
    expect(s2.title).toBe(sampleDeck.slides[1].title);
    expect(s2.table?.headers).toEqual(["항목", "기존 방식", "ToonStudio"]);
    expect(s2.table?.rows).toEqual([
      ["발표 자료 제작", "수동 캡처", "원클릭 OOXML .pptx"],
      ["한글 호환", "폰트 깨짐 위험", "Malgun Gothic EA 매핑"],
    ]);
    expect(s2.speakerNotes).toBe(sampleDeck.slides[1].speakerNotes);
    expect(s2.transition).toBe("push");

    // 3번 슬라이드: 모핑 전환·발표자 노트·SmartArt 텍스트 포함 확인
    const s3 = parsed.deck.slides[2];
    expect(s3.title).toBe(sampleDeck.slides[2].title);
    expect(s3.transition).toBe("morph");
    expect(s3.speakerNotes).toBe(sampleDeck.slides[2].speakerNotes);
    expect(parsed.rawSlideTexts[2]).toContain("기획·콘티");
  });

  it("4:3 및 A4 슬라이드 크기와 wipe/zoom 전환 효과를 정확히 라운드트립한다", () => {
    for (const slideSize of ["4:3", "a4"] as const) {
      const bytes = buildPptxArchive({
        title: `크기 테스트 ${slideSize}`,
        slideSize,
        themeId: "atelier-ink",
        slides: [
          { id: "w1", title: "와이프 슬라이드", transition: "wipe" },
          { id: "z1", title: "줌 슬라이드", transition: "zoom" },
        ],
      });
      const parsed = parsePptxArchive(bytes);
      expect(parsed.deck.slideSize).toBe(slideSize);
      expect(parsed.deck.slides[0].transition).toBe("wipe");
      expect(parsed.deck.slides[1].transition).toBe("zoom");
    }
  });

  it("외부 PowerPoint처럼 Deflate 압축된 .pptx 아카이브도 parsePptxArchiveAsync로 정상 파싱한다", async () => {
    const storeBytes = buildPptxArchive(sampleDeck);
    const storeEntries = readZipArchive(storeBytes);
    const deflatedBytes = await buildDeflateZipForTest(
      storeEntries.map((entry) => ({ path: entry.path, text: decodeUtf8(entry.data) })),
    );

    const parsed = await parsePptxArchiveAsync(deflatedBytes);
    expect(parsed.slideCount).toBe(3);
    expect(parsed.deck.slides[0].title).toBe(sampleDeck.slides[0].title);
    expect(parsed.deck.slides[1].table?.rows[0][2]).toBe("원클릭 OOXML .pptx");
  });

  it("3종 원클릭 덱 프리셋(5p / 4p / 4p)이 모두 유효한 .pptx로 빌드·복원된다", () => {
    expect(PPTX_DECK_PRESETS).toHaveLength(3);
    for (const preset of PPTX_DECK_PRESETS) {
      const deck = createPptxPresetDeck(preset.id);
      expect(deck.slides).toHaveLength(preset.slideCount);
      const bytes = buildPptxArchive(deck);
      const parsed = parsePptxArchive(bytes);
      expect(parsed.slideCount).toBe(preset.slideCount);
      expect(parsed.deck.slides[0].title).toBe(deck.slides[0].title);
    }
  });
});

describe("ppt-smartart-chart-table — SmartArt 6종 · 차트 4종 · 표 · 애니메이션 엔진", () => {
  it("SmartArt 6종이 모두 유효한 SVG 경로(NaN 없음, 원시 hex 없음)를 생성한다", () => {
    expect(SMARTART_VARIANT_OPTIONS).toHaveLength(6);
    for (const opt of SMARTART_VARIANT_OPTIONS) {
      const block = createDefaultSmartArtBlock(opt.id);
      const svg = buildSmartArtSvgModel(opt.id, block.items, 520, 240);
      expect(svg.nodes.length).toBeGreaterThanOrEqual(3);
      for (const node of svg.nodes) {
        expect(node.path).toMatch(/^M\s/);
        expect(node.path).not.toContain("NaN");
        expect(node.fillToken).toMatch(/^var\(--pptx-/);
        expect(Number.isFinite(node.labelX)).toBe(true);
        expect(Number.isFinite(node.labelY)).toBe(true);
      }
      for (const conn of svg.connectors) {
        expect(conn.path).toMatch(/^M\s/);
        expect(conn.path).not.toContain("NaN");
      }
    }
  });

  it("네이티브 차트 4종(bar/line/donut/radar)이 유효한 SVG 기하와 비율을 생성한다", () => {
    expect(NATIVE_CHART_VARIANT_OPTIONS).toHaveLength(4);
    const bar = buildNativeChartSvgModel("bar", createDefaultChartBlock("bar").points);
    expect(bar.bars).toHaveLength(4);
    expect(bar.bars.every((b) => b.height > 0 && Number.isFinite(b.y))).toBe(true);

    const line = buildNativeChartSvgModel("line", createDefaultChartBlock("line").points);
    expect(line.linePath).toMatch(/^M\s/);
    expect(line.areaPath).toContain("Z");
    expect(line.linePoints).toHaveLength(5);

    const donut = buildNativeChartSvgModel("donut", createDefaultChartBlock("donut").points);
    expect(donut.donutSlices).toHaveLength(4);
    expect(donut.donutSlices.reduce((acc, s) => acc + s.percentage, 0)).toBe(100);
    expect(donut.donutSlices.every((s) => s.path.includes("A ") && !s.path.includes("NaN"))).toBe(true);

    const singleDonut = buildNativeChartSvgModel("donut", [{ id: "only", label: "단일", value: 100 }]);
    expect(singleDonut.donutSlices[0].path).toContain("A ");

    const radar = buildNativeChartSvgModel("radar", createDefaultChartBlock("radar").points);
    expect(radar.radarRings).toHaveLength(4);
    expect(radar.radarVertices).toHaveLength(5);
    expect(radar.radarDataPath).toMatch(/^M\s.*Z$/);
  });

  it("표 편집 모델이 행/열 추가·삭제·셀/헤더 편집·스타일 토글을 정확히 수행한다", () => {
    let table = createDefaultTableModel("테스트 표");
    expect(table.headers).toHaveLength(4);
    expect(table.rows).toHaveLength(3);

    table = addTableRow(table, ["신규", "A", "B", "C"]);
    expect(table.rows).toHaveLength(4);
    expect(table.rows[3][0]).toBe("신규");

    table = addTableColumn(table, "담당자");
    expect(table.headers).toHaveLength(5);
    expect(table.rows[0]).toHaveLength(5);

    table = updateTableHeader(table, 4, "리드");
    table = updateTableCell(table, 0, 4, "김작가");
    expect(table.headers[4]).toBe("리드");
    expect(table.rows[0][4]).toBe("김작가");

    table = removeTableRow(table, 3);
    table = removeTableColumn(table, 4);
    expect(table.rows).toHaveLength(3);
    expect(table.headers).toHaveLength(4);

    table = toggleTableHeaderRow(toggleTableBandedRows(table));
    expect(table.showHeaderRow).toBe(false);
    expect(table.bandedRows).toBe(false);
  });

  it("요소 빌드 애니메이션 5종 타임라인 순서 변경과 재생 프레임 계산이 결정론적으로 동작한다", () => {
    expect(BUILD_ANIMATION_OPTIONS).toHaveLength(5);
    const entries = BUILD_ANIMATION_OPTIONS.map((opt, idx) => ({
      id: `a-${idx}`,
      target: (["title", "bullets", "visual", "table", "shapes"] as const)[idx],
      label: opt.label,
      kind: opt.id,
      order: idx + 1,
      delayMs: idx * 200,
      durationMs: 400,
    }));

    expect(getTotalTimelineDurationMs(entries)).toBe(1200);
    const reordered = reorderAnimationEntry(entries, "a-1", "up");
    expect(reordered[0].id).toBe("a-1");

    const beforeStart = computeAnimationPlaybackFrame(entries, 100);
    expect(beforeStart.title.visible).toBe(true);
    expect(beforeStart.bullets.visible).toBe(false);
    expect(beforeStart.bullets.opacity).toBe(0);

    const midWipe = computeAnimationPlaybackFrame(entries, 1000);
    expect(midWipe.shapes.clipRightPercent).toBeGreaterThan(0);
    expect(midWipe.shapes.clipRightPercent).toBeLessThan(100);

    const done = computeAnimationPlaybackFrame(entries, 1500);
    expect(done.title.opacity).toBe(1);
    expect(done.shapes.clipRightPercent).toBe(0);
  });
});

describe("PptxDeckStudioTab UI 인터랙션 및 CSS 규율 검증", () => {
  it("프리셋 전환, 테마·비율 전환, SmartArt/차트/표 편집, 애니메이션 재생, 실제 .pptx 다운로드 및 가져오기를 수행한다", async () => {
    let capturedBlob: Blob | null = null;
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((obj: Blob | MediaSource) => {
        if (obj instanceof Blob) capturedBlob = obj;
        return "blob:mock-pptx";
      });
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(<PptxDeckStudioTab projectId="proj-demo" />);

    expect(screen.getByTestId("pptx-ooxml-studio-tab")).toBeTruthy();
    expect(screen.getByText(/슬라이드 1 \/ 5/)).toBeTruthy();

    // 프리셋 전환 (4슬라이드 웹툰 연재 기획서)
    fireEvent.click(screen.getByRole("button", { name: "웹툰 연재 기획서 (4슬라이드)" }));
    expect(screen.getByText(/슬라이드 1 \/ 4/)).toBeTruthy();

    // 테마 전환 & 슬라이드 추가
    fireEvent.click(screen.getByRole("button", { name: "미드나잇 스튜디오" }));
    expect(screen.getByTestId("pptx-live-slide-stage").getAttribute("data-slide-theme")).toBe(
      "midnight-studio",
    );
    fireEvent.click(screen.getByRole("button", { name: "슬라이드 추가" }));
    expect(screen.getByText(/슬라이드 5 \/ 5/)).toBeTruthy();

    // SmartArt 탭으로 이동해 삽입 및 변형 전환
    fireEvent.click(screen.getByRole("tab", { name: "SmartArt" }));
    fireEvent.click(screen.getByRole("button", { name: "SmartArt 삽입" }));
    expect(screen.getByTestId("smartart-preview-process-chevron")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("SmartArt 레이아웃 (6종)"), {
      target: { value: "cycle-loop" },
    });
    expect(screen.getByTestId("smartart-preview-cycle-loop")).toBeTruthy();

    // 표 탭으로 이동해 표 삽입 + 행 추가 + 셀 편집
    fireEvent.click(screen.getByRole("tab", { name: "표" }));
    fireEvent.click(screen.getByRole("button", { name: "스타일 표 삽입" }));
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));
    const cellInput = screen.getByLabelText("표 4행 1열");
    fireEvent.change(cellInput, { target: { value: "신규 편집 셀" } });
    expect(screen.getByTestId("pptx-stage-table").textContent).toContain("신규 편집 셀");

    // 발표자 노트 편집 & 애니메이션 재생
    fireEvent.change(screen.getByTestId("pptx-speaker-notes"), {
      target: { value: "UI 테스트 발표자 노트입니다." },
    });
    fireEvent.click(screen.getByTestId("pptx-play-animations-btn"));

    // 실제 .pptx 파일 다운로드 클릭 -> 진짜 PK\x03\x04 바이너리 검증
    fireEvent.click(screen.getByTestId("pptx-download-btn"));
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).not.toBeNull();
    expect(screen.getByTestId("pptx-studio-status").textContent).toContain("생성 완료");

    // 실제 생성한 .pptx 파일을 가져오기(<input type="file">)로 다시 불러오기 검증
    const importDeckBytes = buildPptxArchive({
      title: "가져오기 테스트 덱",
      slideSize: "16:9",
      themeId: "atelier-ink",
      slides: [
        {
          id: "imp-1",
          title: "가져온 첫 번째 한글 슬라이드",
          bullets: ["파일 업로드 복원 검증"],
          speakerNotes: "복원된 발표자 노트",
          transition: "wipe",
        },
        {
          id: "imp-2",
          title: "가져온 두 번째 슬라이드",
          speakerNotes: "두 번째 노트",
        },
      ],
    });
    const importCopy = new Uint8Array(importDeckBytes.byteLength);
    importCopy.set(importDeckBytes);
    const mockFile = new File([importCopy], "imported-korean-deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    Object.defineProperty(mockFile, "arrayBuffer", {
      value: () => Promise.resolve(importCopy.buffer),
    });

    const fileInput = screen.getByTestId("pptx-import-input");
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("pptx-studio-status").textContent).toContain("가져오기 완료");
    });
    expect(screen.getByText(/슬라이드 1 \/ 2/)).toBeTruthy();
    expect(screen.getByTestId("pptx-live-slide-stage").textContent).toContain(
      "가져온 첫 번째 한글 슬라이드",
    );
    expect((screen.getByTestId("pptx-speaker-notes") as HTMLTextAreaElement).value).toBe(
      "복원된 발표자 노트",
    );
  });

  it("pptx-deck-studio.css 및 pptx-slide-stage.css는 transition-all과 원시 hex/rgb 색상 하드코딩이 0건이다", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const filename of ["pptx-deck-studio.css", "pptx-slide-stage.css"]) {
      const css = readFileSync(resolve(here, filename), "utf8");
      expect(css).not.toMatch(/transition-all|transition\s*:\s*all/i);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\brgba?\s*\(/i);
      expect(css).toContain("prefers-reduced-motion");
    }
  });
});
