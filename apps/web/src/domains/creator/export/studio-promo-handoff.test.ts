// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROMO_CUT_IMAGE_MAX_CHARS, PROMO_DOCUMENT_CUTS_KIND, PROMO_DOCUMENT_CUTS_MAX, PROMO_TRANSLATION_DRAFTS_KIND, PROMO_TRANSLATION_DRAFTS_MAX } from "../promo/promo-handoff-contract";
import { buildPromoCutDrafts, parsePromoDocumentCutBundle, promoPanelsFromCutDrafts } from "../promo/promo-document-cuts";
import { promoLocaleCaptionText, resolvePromoLocale, summarizePromoLocale } from "../promo/promo-locale-batch";
import { emptyPromoProject, parsePromoProject, promoDataUrl } from "../promo/promo-model";
import { parsePromoTranslationBundle } from "../promo/promo-translation-drafts";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { drawWatermarkOnSlice } from "./studio-export-presets";
import {
  buildStudioPromoCutBundle,
  buildStudioPromoTranslationFile,
  createStudioPromoCutImageRenderer,
  studioPromoCutsFileName,
  studioPromoTranslationsFileName,
  type StudioPromoCutImageRenderer,
} from "./studio-promo-handoff";
import { listStudioPromoCuts } from "./studio-promo-cuts";
import { listStudioPromoTranslations } from "./studio-promo-translations";

import type { DialogueElementLike } from "../lettering/studio-dialogue-batch";
import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";

vi.mock("./studio-export-presets", () => ({ drawWatermarkOnSlice: vi.fn() }));

const PNG = "data:image/png;base64,aGVsbG8=";
const WEBP = "data:image/webp;base64,aGVsbG8h";
const JPEG = "data:image/jpeg;base64,aGVsbG8i";

const frame = (id: string, x: number, y: number, width: number, height: number): DialogueElementLike => ({ id, type: "frame", x, y, width, height });
const bubble = (id: string, text: string, x: number, y: number, extra: Partial<DialogueElementLike> = {}): DialogueElementLike => ({ id, type: "bubble", text, x, y, width: 60, height: 30, ...extra });

/** 첫 페이지는 두 컷(왼·오른), 둘째 페이지는 한 컷. 번역은 영어·일본어. tweak으로 첫 페이지 요소를 바꾼다. */
function documentPages(tweak: (elements: DialogueElementLike[]) => DialogueElementLike[] = (elements) => elements): DialogueReviewPageLike[] {
  return [
    {
      id: "p1",
      elements: tweak([
        frame("f1", 20, 20, 330, 300), frame("f2", 370, 20, 330, 300),
        bubble("b1", "어서 와", 40, 40), bubble("b2", "오랜만이야", 60, 120), bubble("b3", "어디로?", 400, 60),
        bubble("hidden", "숨김", 400, 100, { hidden: true }),
      ]),
      dialogueI18n: {
        b1: { source: "어서 와", en: "Welcome.", ja: "ようこそ" },
        b2: { source: "오랜만이야", en: "Long time no see." },
        b3: { source: "어디로?", en: "Where to?" },
      },
      dialogueReview: { b1: { en: "approved", ja: "needs-edit" }, b2: { en: "approved" }, b3: { en: "needs-edit" } },
    },
    {
      id: "p2",
      elements: [frame("f3", 20, 20, 680, 400), bubble("b4", "또 만나", 50, 50)],
      dialogueI18n: { b4: { source: "또 만나", en: "See you." } },
      dialogueReview: { b4: { en: "approved" } },
    },
  ];
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fakeRenderer(image = PNG) {
  return vi.fn<StudioPromoCutImageRenderer>(() => Promise.resolve(image));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(drawWatermarkOnSlice).mockClear();
});

describe("컷 이미지 만들기", () => {
  function install(toDataURL: (this: HTMLCanvasElement, type: string) => string, withContext = true) {
    const context = { imageSmoothingEnabled: false, imageSmoothingQuality: "low", fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((id: string) => (withContext && id === "2d" ? context : null)) as HTMLCanvasElement["getContext"]);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement, type?: string) {
      return toDataURL.call(this, type ?? "image/png");
    });
    return context;
  }
  const crop = { sx: 40, sy: 40, sw: 660, sh: 600, width: 660, height: 600 };

  it("캡처에서 컷 영역만 그려 WebP data URL로 만들고 워터마크 설정을 넘긴다", async () => {
    const context = install((type) => (type === "image/webp" ? WEBP : PNG));
    const source = canvasOf(1440, 2000);
    const watermark = { ...DEFAULT_WATERMARK, enabled: true, text: "© 작가" };
    await expect(createStudioPromoCutImageRenderer({ watermark })(source, crop)).resolves.toBe(WEBP);
    expect(context.drawImage).toHaveBeenCalledWith(source, 40, 40, 660, 600, 0, 0, 660, 600);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(drawWatermarkOnSlice).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), watermark);
  });

  it("WebP 인코딩이 없는 브라우저가 돌려주는 PNG도 크기가 맞으면 그대로 쓴다", async () => {
    install(() => PNG);
    await expect(createStudioPromoCutImageRenderer({ watermark: DEFAULT_WATERMARK })(canvasOf(1440, 2000), crop)).resolves.toBe(PNG);
  });

  it("너무 큰 PNG는 투명한 곳이 검어지지 않게 흰 종이 위에서 JPEG로 다시 인코딩한다", async () => {
    const context = install((type) => (type === "image/jpeg" ? JPEG : `data:image/png;base64,${"A".repeat(400)}`));
    const render = createStudioPromoCutImageRenderer({ watermark: DEFAULT_WATERMARK, maxChars: 200 });
    await expect(render(canvasOf(1440, 2000), crop)).resolves.toBe(JPEG);
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledTimes(1);
  });

  it("JPEG도 크면 크기를 줄여 다시 시도한다", async () => {
    const context = install(function (this: HTMLCanvasElement) {
      return this.width <= 500 ? WEBP : `data:image/webp;base64,${"A".repeat(400)}`;
    });
    const render = createStudioPromoCutImageRenderer({ watermark: DEFAULT_WATERMARK, maxChars: 200 });
    await expect(render(canvasOf(1440, 2000), crop)).resolves.toBe(WEBP);
    const sizes = context.drawImage.mock.calls.map((call) => [call[7], call[8]]);
    expect(sizes[0]).toEqual([660, 600]);
    expect(sizes.at(-1)).toEqual([495, 450]);
  });

  it("끝까지 크면 배율이나 페이지 범위를 줄이라고 알린다", async () => {
    install(() => `data:image/webp;base64,${"A".repeat(400)}`);
    const render = createStudioPromoCutImageRenderer({ watermark: DEFAULT_WATERMARK, maxChars: 200 });
    await expect(render(canvasOf(1440, 2000), crop)).rejects.toThrow("내보내기 배율을 낮추거나");
  });

  it("그릴 표면을 얻지 못하면 이유를 알린다", async () => {
    install(() => WEBP, false);
    await expect(createStudioPromoCutImageRenderer({ watermark: DEFAULT_WATERMARK })(canvasOf(1440, 2000), crop)).rejects.toThrow("캔버스를 만들지 못했어요");
  });

  it("이미지 상한은 홍보 프로젝트가 컷 이미지에 허용하는 크기와 같다", () => {
    // base64 본문 길이는 4의 배수여야 해서 상한 바로 아래·위에서 확인한다.
    const prefix = "data:image/png;base64,";
    const under = `${prefix}${"A".repeat(PROMO_CUT_IMAGE_MAX_CHARS - 2 - prefix.length)}`;
    const over = `${prefix}${"A".repeat(PROMO_CUT_IMAGE_MAX_CHARS + 2 - prefix.length)}`;
    expect(promoDataUrl(under, "image")).toBe(under);
    expect(() => promoDataUrl(over, "image")).toThrow("텍스트 길이 또는 형식이 올바르지 않아요");
  });
});

describe("컷 묶음 만들기", () => {
  const listing = () => listStudioPromoCuts(documentPages(), [0, 1]);
  const captures = () => [{ pageIndex: 0, canvas: canvasOf(1440, 2000) }, { pageIndex: 1, canvas: canvasOf(1440, 2000) }];

  it("컷마다 캡처에서 잘라 읽기 순서로 담고 홍보 편집기가 읽는 JSON을 만든다", async () => {
    const render = fakeRenderer();
    const progress = vi.fn();
    const result = await buildStudioPromoCutBundle({ listing: listing(), captures: captures(), canvasWidth: 720, title: "별빛 아래", documentId: "work-1", render, onProgress: progress });
    expect(result.bundle).toMatchObject({ kind: PROMO_DOCUMENT_CUTS_KIND, version: 1, documentId: "work-1", title: "별빛 아래" });
    expect(result.bundle.cuts.map((cut) => [cut.id, cut.pageIndex, cut.order, cut.dialogues.map((value) => value.id)])).toEqual([
      ["p1:f1", 0, 0, ["b1", "b2"]],
      ["p1:f2", 0, 1, ["b3"]],
      ["p2:f3", 1, 2, ["b4"]],
    ]);
    expect(result.bundle.cuts.every((cut) => cut.image === PNG)).toBe(true);
    expect(render.mock.calls.map(([, crop]) => crop)).toEqual([
      { sx: 40, sy: 40, sw: 660, sh: 600, width: 660, height: 600 },
      { sx: 740, sy: 40, sw: 660, sh: 600, width: 660, height: 600 },
      { sx: 40, sy: 40, sw: 1360, sh: 800, width: 1360, height: 800 },
    ]);
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(result.fileName).toBe("별빛 아래-promo-cuts.json");
    expect(result.skippedFrameCount).toBe(0);
    // 저장한 JSON을 다시 읽어도 같다.
    expect(parsePromoDocumentCutBundle(JSON.parse(result.json))).toEqual(result.bundle);
  });

  it("캡처 밖에 있는 컷은 건너뛰고 읽기 순서 번호를 이어 붙인다", async () => {
    const pages = documentPages((elements) => [...elements, frame("far", 20, 5_000, 300, 300)]);
    const result = await buildStudioPromoCutBundle({ listing: listStudioPromoCuts(pages, [0]), captures: [{ pageIndex: 0, canvas: canvasOf(1440, 2000) }], canvasWidth: 720, title: "", documentId: null, render: fakeRenderer() });
    expect(result.skippedFrameCount).toBe(1);
    expect(result.bundle.cuts.map((cut) => cut.order)).toEqual([0, 1]);
    expect(result.bundle.documentId).toBeNull();
    expect(result.fileName).toBe("toonstudio-promo-cuts.json");
  });

  it("컷이 없거나 상한을 넘거나 캡처 안에 하나도 없으면 이유를 알린다", async () => {
    const base = { captures: captures(), canvasWidth: 720, title: "t", documentId: null, render: fakeRenderer() };
    await expect(buildStudioPromoCutBundle({ ...base, listing: listStudioPromoCuts([{ id: "p", elements: [] }], [0]) })).rejects.toThrow("컷(프레임)이 없어요");
    const many: DialogueElementLike[] = Array.from({ length: PROMO_DOCUMENT_CUTS_MAX + 1 }, (_, index) => frame(`f${index}`, 0, index * 100, 700, 90));
    await expect(buildStudioPromoCutBundle({ ...base, listing: listStudioPromoCuts([{ id: "p", elements: many }], [0]) })).rejects.toThrow(`${PROMO_DOCUMENT_CUTS_MAX}컷까지`);
    await expect(buildStudioPromoCutBundle({ ...base, listing: listing(), captures: [{ pageIndex: 0, canvas: canvasOf(10, 10) }, { pageIndex: 1, canvas: canvasOf(10, 10) }] })).rejects.toThrow("캡처 안에 들어오는 컷이 없어요");
    await expect(buildStudioPromoCutBundle({ ...base, listing: listing(), captures: [] })).rejects.toThrow("캡처 안에 들어오는 컷이 없어요");
  });

  it("취소하면 다음 컷을 만들기 전에 AbortError로 멈춘다", async () => {
    const controller = new AbortController();
    const render = vi.fn<StudioPromoCutImageRenderer>(() => {
      controller.abort();
      return Promise.resolve(PNG);
    });
    await expect(buildStudioPromoCutBundle({ listing: listing(), captures: captures(), canvasWidth: 720, title: "t", documentId: null, render, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("긴 제목은 200자까지만 담고 파일 이름은 안전하게 만든다", async () => {
    const result = await buildStudioPromoCutBundle({ listing: listing(), captures: captures(), canvasWidth: 720, title: `제목/${"가".repeat(300)}`, documentId: null, render: fakeRenderer() });
    expect(Array.from(result.bundle.title)).toHaveLength(200);
    expect(studioPromoCutsFileName("a/b:c")).toBe("a-b-c-promo-cuts.json");
  });

  it("만든 묶음에서 샷 초안을 거쳐 parsePromoProject 검증을 통과하는 프로젝트가 나온다", async () => {
    const result = await buildStudioPromoCutBundle({ listing: listing(), captures: captures(), canvasWidth: 720, title: "t", documentId: null, render: fakeRenderer() });
    const drafts = buildPromoCutDrafts(result.bundle, 12);
    expect(drafts.map((draft) => draft.caption)).toEqual(["어서 와", "어디로?", "또 만나"]);
    expect(drafts[0]?.candidates.map((candidate) => candidate.text)).toEqual(["어서 와", "오랜만이야", "어서 와 오랜만이야"]);
    const applied = promoPanelsFromCutDrafts(drafts, emptyPromoProject(), "replace", (() => { let n = 0; return () => `panel-${n++}`; })());
    if (!applied.ok) throw new Error(applied.message);
    const parsed = parsePromoProject(JSON.parse(JSON.stringify({ ...emptyPromoProject(), panels: applied.panels })));
    expect(parsed.panels.map((panel) => panel.caption)).toEqual(["어서 와", "어디로?", "또 만나"]);
  });
});

describe("번역 초안 파일", () => {
  const exportedAt = new Date(Date.UTC(2026, 9, 15, 9, 30));
  const build = (pages = documentPages(), documentId: string | null = "work-1") =>
    buildStudioPromoTranslationFile({ listing: listStudioPromoTranslations(pages, [0, 1]), documentId, title: "별빛 아래", exportedAt });

  it("번역·승인·원문 행을 홍보 편집기가 읽는 형식으로 저장한다", () => {
    const result = build();
    const file: unknown = JSON.parse(result.json);
    expect(file).toMatchObject({ kind: PROMO_TRANSLATION_DRAFTS_KIND, version: 1, documentId: "work-1" });
    const parsed = parsePromoTranslationBundle(file);
    expect(parsed.documentId).toBe("work-1");
    expect(parsed.rows.map((row) => [row.elementId, row.source])).toEqual([["b1", "어서 와"], ["b2", "오랜만이야"], ["b3", "어디로?"], ["b4", "또 만나"]]);
    const byKey = new Map(parsed.drafts.map((draft) => [`${draft.elementId}/${draft.locale}`, draft] as const));
    expect(byKey.get("b1/en")).toMatchObject({ id: "p1:b1:en", pageId: "p1", source: "어서 와", text: "Welcome.", approved: true, updatedAt: exportedAt.toISOString() });
    expect(byKey.get("b1/ja")).toMatchObject({ text: "ようこそ", approved: false });
    expect(byKey.get("b3/en")?.approved).toBe(false);
    expect(result).toMatchObject({ draftCount: 5, rowCount: 4, localeCount: 2, fileName: "별빛 아래-translation-drafts.json" });
    expect(studioPromoTranslationsFileName("")).toBe("toonstudio-translation-drafts.json");
  });

  it("문서 ID가 없으면 필드를 넣지 않는다", () => {
    expect(JSON.parse(build(documentPages(), null).json)).not.toHaveProperty("documentId");
  });

  it("같은 문서는 시각만 같으면 항상 같은 파일이다", () => {
    expect(build().json).toBe(build().json);
  });

  it("번역이 없거나 상한을 넘으면 파일을 만들지 않는다", () => {
    expect(() => build([{ id: "p", elements: [frame("f", 0, 0, 300, 300), bubble("b", "원문만", 10, 10)] }])).toThrow("번역된 대사가 없어요");
    const bubbles = Array.from({ length: PROMO_TRANSLATION_DRAFTS_MAX + 1 }, (_, index) => bubble(`b${index}`, `대사 ${index}`, 0, index));
    const i18n = Object.fromEntries(bubbles.map((value) => [value.id, { source: value.text ?? "", en: `line ${value.id}` }]));
    expect(() => build([{ id: "p", elements: bubbles, dialogueI18n: i18n }])).toThrow(`${PROMO_TRANSLATION_DRAFTS_MAX}건`);
  });
});

describe("Studio에서 홍보 편집기까지 이어지는 자막 연결", () => {
  async function promoProjectFromStudio(pages: DialogueReviewPageLike[], pick: (cutIndex: number, candidateIds: readonly string[]) => string | undefined = () => undefined) {
    const cuts = await buildStudioPromoCutBundle({
      listing: listStudioPromoCuts(pages, [0, 1]),
      captures: [{ pageIndex: 0, canvas: canvasOf(1440, 2000) }, { pageIndex: 1, canvas: canvasOf(1440, 2000) }],
      canvasWidth: 720, title: "t", documentId: null, render: fakeRenderer(),
    });
    let drafts = buildPromoCutDrafts(cuts.bundle, 12);
    drafts = drafts.map((draft, index) => {
      const chosen = pick(index, draft.candidates.map((candidate) => candidate.id));
      const candidate = draft.candidates.find((value) => value.id === chosen);
      return candidate ? { ...draft, caption: candidate.text, candidateId: candidate.id } : draft;
    });
    const applied = promoPanelsFromCutDrafts(drafts, emptyPromoProject(), "replace", (() => { let n = 0; return () => `panel-${n++}`; })());
    if (!applied.ok) throw new Error(applied.message);
    return { ...emptyPromoProject(), panels: applied.panels };
  }
  const bundleOf = (pages: DialogueReviewPageLike[]) => parsePromoTranslationBundle(JSON.parse(buildStudioPromoTranslationFile({ listing: listStudioPromoTranslations(pages, [0, 1]), documentId: null, title: "t", exportedAt: new Date(0) }).json));

  it("컷 자막이 번역 초안의 어느 대사인지 찾아 승인·초안 상태를 판정한다", async () => {
    const pages = documentPages();
    // 첫 컷은 두 말풍선을 이은 자막("어서 와 오랜만이야")을 고른다.
    const project = await promoProjectFromStudio(pages, (index, ids) => (index === 0 ? ids.at(-1) : undefined));
    expect(project.panels.map((panel) => panel.caption)).toEqual(["어서 와 오랜만이야", "어디로?", "또 만나"]);
    const bundle = bundleOf(pages);
    const english = resolvePromoLocale(project, bundle, "en");
    expect(english.map((value) => value.state)).toEqual(["approved", "draft", "approved"]);
    expect(english[0]?.translated).toBe("Welcome. Long time no see.");
    expect(summarizePromoLocale(english, "en").ready).toBe(false);
    // 일본어는 첫 말풍선만 번역돼 있다: 이은 자막은 번역 없음, 나머지도 없음.
    expect(resolvePromoLocale(project, bundle, "ja").map((value) => value.state)).toEqual(["missing", "missing", "missing"]);
    const [, second] = english;
    expect(promoLocaleCaptionText(second, { includeDrafts: false, includeStale: false }).translated).toBe(false);
    expect(promoLocaleCaptionText(second, { includeDrafts: true, includeStale: false }).translated).toBe(true);
  });

  it("번역한 뒤 원문을 고치면 낡은 번역을 오래됨으로 알리고, 켜지 않으면 조용히 쓰지 않는다", async () => {
    // 번역 뒤에 작가가 첫 말풍선 원문을 고쳤다: 화면 텍스트는 바뀌었지만 번역 시점 원문 스냅샷(source)은 그대로다.
    const pages = documentPages((elements) => elements.map((element) => (element.id === "b1" ? { ...element, text: "어서 오세요" } : element)));
    const project = await promoProjectFromStudio(pages);
    expect(project.panels[0]?.caption).toBe("어서 오세요");
    const bundle = bundleOf(pages);
    // 행(현재 원문)은 고친 글, 초안(번역 시점 원문)은 옛 글이라 같은 대사로 이어지면서 오래됨이 된다.
    expect(bundle.rows.find((row) => row.elementId === "b1")?.source).toBe("어서 오세요");
    expect(bundle.drafts.find((draft) => draft.elementId === "b1" && draft.locale === "en")?.source).toBe("어서 와");
    const [first, second] = resolvePromoLocale(project, bundle, "en");
    expect(first.state).toBe("stale");
    expect(summarizePromoLocale(resolvePromoLocale(project, bundle, "en"), "en").counts.stale).toBe(1);
    expect(promoLocaleCaptionText(first, { includeDrafts: true, includeStale: false })).toEqual({ text: "어서 오세요", translated: false });
    expect(promoLocaleCaptionText(first, { includeDrafts: true, includeStale: true })).toEqual({ text: "Welcome.", translated: true });
    // 고치지 않은 대사는 그대로 판정된다.
    expect(second.state).not.toBe("stale");
  });

  it("캔버스가 번역 언어를 보여 주는 채로 내보낸 컷은 번역문 자막이 되어 원문과 이어지지 않는다", async () => {
    const pages = documentPages((elements) => elements.map((element) => (element.id === "b1" ? { ...element, text: "Welcome." } : element)));
    const project = await promoProjectFromStudio(pages);
    expect(project.panels[0]?.caption).toBe("Welcome.");
    const [first] = resolvePromoLocale(project, bundleOf(pages), "en");
    expect(first.state).toBe("unlinked");
    expect(promoLocaleCaptionText(first, { includeDrafts: true, includeStale: true })).toEqual({ text: "Welcome.", translated: false });
  });
});
