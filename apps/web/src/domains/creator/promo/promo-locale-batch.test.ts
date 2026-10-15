import { describe, expect, it } from "vitest";

import { EMPTY_CREATOR_ECOSYSTEM_STATE, setDialogueTranslation, upsertDialogueSource } from "../ecosystem/creator-ecosystem-model";
import canvasSource from "./promo-canvas.ts?raw";
import {
  buildPromoLocaleBatch,
  buildPromoLocaleFiles,
  localizePromoProject,
  planPromoLocale,
  PROMO_CAPTION_MAX_LINES,
  PROMO_LOCALE_DEFAULT_POLICY,
  promoCaptionBox,
  promoLocaleCaptionText,
  promoLocaleLabel,
  resolvePromoLocale,
  summarizePromoLocale,
  type PromoLocaleRequest,
} from "./promo-locale-batch";
import { emptyPromoProject, parsePromoProject, promoSrt, promoTimeline } from "./promo-model";
import { promoTranslationBundleFromEcosystem } from "./promo-translation-drafts";
import { createPromoVoiceStudio } from "./promo-voice-studio";
import { promoUnzip, promoZip } from "./promo-zip";

import type { PromoPanel, PromoProject } from "./promo-model";
import type { PromoTranslationBundle, PromoTranslationDraft, PromoTranslationRow } from "./promo-translation-drafts";

import type { BubbleTextMeasurer } from "../lettering/studio-bubble-text-fit";

/** 글자 하나를 글자 크기의 0.6배로 재는 결정적 측정기 — 줄바꿈 결과가 환경(폰트)에 흔들리지 않는다. */
const measurer: BubbleTextMeasurer = { measureWidth: (text, fontPx) => Array.from(text).length * fontPx * 0.6 };
const image = "data:image/png;base64,aGVsbG8=";
const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 9, minute)).toISOString();

const rows: PromoTranslationRow[] = [
  { pageId: "p1", elementId: "e1", source: "어서 와" },
  { pageId: "p1", elementId: "e2", source: "오랜만이야" },
  { pageId: "p1", elementId: "e3", source: "이번엔 진짜야" },
  { pageId: "p2", elementId: "e1", source: "그때 우리가 만났던 골목" },
  { pageId: "p2", elementId: "e2", source: "응" },
];
function draft(row: PromoTranslationRow, text: string, extra: Partial<PromoTranslationDraft> = {}): PromoTranslationDraft {
  return { id: `${row.pageId}-${row.elementId}-${extra.locale ?? "en"}`, pageId: row.pageId, elementId: row.elementId, source: row.source, locale: "en", text, approved: true, updatedAt: at(0), ...extra };
}
function bundleOf(drafts: PromoTranslationDraft[], withRows = true): PromoTranslationBundle {
  return { documentId: "doc-1", revision: 7, drafts, rows: withRows ? rows : [] };
}
function panel(id: string, caption: string, extra: Partial<PromoPanel> = {}): PromoPanel {
  return { id, src: image, description: "", caption, motion: "push-in", fit: "contain", weight: 1, ...extra };
}
function projectOf(captions: string[], extra: Partial<PromoProject> = {}): PromoProject {
  return { ...emptyPromoProject(), title: "별빛 아래", cta: "지금 첫 화를 만나보세요", panels: captions.map((caption, index) => panel(`cut-${index}`, caption)), ...extra };
}
const request = (locale: string, extra: Partial<PromoLocaleRequest> = {}): PromoLocaleRequest => ({ locale, title: "", cta: "", policy: PROMO_LOCALE_DEFAULT_POLICY, ...extra });

const [r1, r2, r3, r4, r5] = rows as [PromoTranslationRow, PromoTranslationRow, PromoTranslationRow, PromoTranslationRow, PromoTranslationRow];
const messy = projectOf(["어서 와", "오랜만이야 이번엔 진짜야", "그때 우리가 만났던 골목", "", "편집한 자막", "응"]);
const messyDrafts = [
  draft(r1, "Welcome."),
  draft(r2, "Long time no see."),
  draft(r3, "This time it is real.", { approved: false }),
  draft(r4, "The alley where we met.", { source: "그때 우리가 만난 골목" }),
];

describe("컷 ↔ 문서 대사 ↔ 번역 초안 짝짓기", () => {
  const states = (project: PromoProject, bundle: PromoTranslationBundle, locale = "en") => resolvePromoLocale(project, bundle, locale).map((value) => value.state);

  it("승인·초안·오래됨·번역 없음·연결 안 됨·빈 자막을 구분한다", () => {
    expect(states(messy, bundleOf(messyDrafts))).toEqual(["approved", "draft", "stale", "empty", "unlinked", "missing"]);
  });

  it("말풍선을 이은 자막은 연속한 대사의 번역을 이어서 돌려주고 가장 나쁜 상태를 따른다", () => {
    const [, composite] = resolvePromoLocale(messy, bundleOf(messyDrafts), "en");
    expect(composite).toMatchObject({ state: "draft", translated: "Long time no see. This time it is real." });
    const approved = resolvePromoLocale(messy, bundleOf([draft(r1, "Welcome."), draft(r2, "Long time no see."), draft(r3, "This time it is real.")]), "en");
    expect(approved[1]).toMatchObject({ state: "approved", translated: "Long time no see. This time it is real." });
    const partial = resolvePromoLocale(messy, bundleOf([draft(r2, "Long time no see.")]), "en");
    expect(partial[1]).toMatchObject({ state: "missing", translated: null });
  });

  it("오래된 번역도 번역문은 돌려주되 상태로 구분한다", () => {
    const [, , stale] = resolvePromoLocale(messy, bundleOf(messyDrafts), "en");
    expect(stale).toMatchObject({ state: "stale", translated: "The alley where we met." });
  });

  it("같은 문구가 문서에 여러 번 나와도 읽기 순서대로 앞선 컷의 다음 자리부터 짝짓는다", () => {
    const twice: PromoTranslationRow[] = [
      { pageId: "p1", elementId: "a", source: "응" },
      { pageId: "p1", elementId: "b", source: "그래" },
      { pageId: "p2", elementId: "a", source: "응" },
    ];
    const bundle: PromoTranslationBundle = {
      documentId: null, revision: null, rows: twice,
      drafts: [draft(twice[0]!, "Yes (first)"), draft(twice[1]!, "Okay"), draft(twice[2]!, "Yes (second)")],
    };
    const result = resolvePromoLocale(projectOf(["응", "그래", "응"]), bundle, "en");
    expect(result.map((value) => value.translated)).toEqual(["Yes (first)", "Okay", "Yes (second)"]);
  });

  it("공백·줄바꿈만 다른 자막도 같은 대사로 본다", () => {
    const result = resolvePromoLocale(projectOf(["  어서\n와  "]), bundleOf([draft(r1, "Welcome.")]), "en");
    expect(result[0]).toMatchObject({ state: "approved", source: "어서 와" });
  });

  it("번역문이 비어 있는 초안은 번역 없음으로 본다", () => {
    expect(states(projectOf(["어서 와"]), bundleOf([draft(r1, "   ")]))).toEqual(["missing"]);
  });

  it("다른 로케일의 초안은 섞이지 않는다", () => {
    const bundle = bundleOf([draft(r1, "Welcome."), draft(r1, "ようこそ", { locale: "ja", approved: false })]);
    expect(states(projectOf(["어서 와"]), bundle, "en")).toEqual(["approved"]);
    expect(states(projectOf(["어서 와"]), bundle, "ja")).toEqual(["draft"]);
    expect(states(projectOf(["어서 와"]), bundle, "fr")).toEqual(["missing"]);
  });

  it("문서 원문(rows)이 없으면 초안이 번역한 원문을 현재 원문으로 보아 오래됨을 판정하지 않는다", () => {
    const withoutRows = bundleOf(messyDrafts, false);
    // 초안이 번역한 원문만 알 수 있으니 번역 없음(missing)과 연결 안 됨(unlinked)을 구분하지 못하고, 어느 쪽이든 원문 자막으로 되돌린다.
    expect(states(messy, withoutRows)).toEqual(["approved", "draft", "unlinked", "empty", "unlinked", "unlinked"]);
    // 초안의 source("그때 우리가 만난 골목")와 같은 자막이면 그 초안을 현재 것으로 보아 오래됨이 아니다.
    expect(states(projectOf(["그때 우리가 만난 골목"]), withoutRows)).toEqual(["approved"]);
    expect(states(projectOf(["그때 우리가 만났던 골목"]), withoutRows)).toEqual(["unlinked"]);
  });

  it("요약은 상태별 개수와 모든 자막이 승인됐는지(ready)를 알려 준다", () => {
    const summary = summarizePromoLocale(resolvePromoLocale(messy, bundleOf(messyDrafts), "en"), "en");
    expect(summary).toMatchObject({ locale: "en", captioned: 5, empty: 1, ready: false, counts: { approved: 1, draft: 1, stale: 1, missing: 1, unlinked: 1 } });
    const clean = projectOf(["어서 와", "응"]);
    const ready = summarizePromoLocale(resolvePromoLocale(clean, bundleOf([draft(r1, "Welcome."), draft(r5, "Yes.")]), "en"), "en");
    expect(ready).toMatchObject({ captioned: 2, ready: true });
    expect(summarizePromoLocale(resolvePromoLocale(projectOf([""]), bundleOf([]), "en"), "en").ready).toBe(false);
  });
});

describe("번역 사용 정책", () => {
  const resolutions = resolvePromoLocale(messy, bundleOf(messyDrafts), "en");
  const use = (index: number, policy = PROMO_LOCALE_DEFAULT_POLICY) => promoLocaleCaptionText(resolutions[index]!, policy);

  it("기본은 승인된 번역만 쓰고 나머지는 원문 자막으로 되돌린다", () => {
    expect(use(0)).toEqual({ text: "Welcome.", translated: true });
    expect(use(1)).toEqual({ text: "오랜만이야 이번엔 진짜야", translated: false });
    expect(use(2)).toEqual({ text: "그때 우리가 만났던 골목", translated: false });
    expect(use(3)).toEqual({ text: "", translated: false });
    expect(use(4)).toEqual({ text: "편집한 자막", translated: false });
    expect(use(5)).toEqual({ text: "응", translated: false });
  });

  it("승인 전 초안·오래된 번역은 각각 켜야만 쓴다", () => {
    expect(use(1, { includeDrafts: true, includeStale: false }).translated).toBe(true);
    expect(use(2, { includeDrafts: true, includeStale: false }).translated).toBe(false);
    expect(use(2, { includeDrafts: false, includeStale: true })).toEqual({ text: "The alley where we met.", translated: true });
    expect(use(1, { includeDrafts: false, includeStale: true }).translated).toBe(false);
  });
});

describe("계획과 경고", () => {
  const plan = (policy = PROMO_LOCALE_DEFAULT_POLICY, project = messy, bundle = bundleOf(messyDrafts), extra: Partial<PromoLocaleRequest> = {}) =>
    planPromoLocale(project, bundle, request("en", { policy, ...extra }), measurer);
  const codes = (value: ReturnType<typeof plan>) => value.warnings.map((warning) => `${warning.code}:${warning.index ?? "-"}`);

  it("기본 정책에서는 승인 전 초안·오래됨·번역 없음·연결 안 됨을 컷 번호와 함께 경고한다", () => {
    const value = plan();
    expect(codes(value)).toEqual(expect.arrayContaining(["draft:1", "stale:2", "unlinked:4", "missing:5", "title-source:-", "cta-source:-"]));
    const stale = value.warnings.find((warning) => warning.code === "stale");
    expect(stale?.severity).toBe("warning");
    expect(stale?.message).toContain("컷 3");
    expect(stale?.message).toContain("오래");
    expect(stale?.message).toContain("한국어 원문 자막을 썼어요");
    expect(value.warnings.find((warning) => warning.code === "draft")?.severity).toBe("info");
  });

  it("오래된 번역을 켜서 써도 경고는 남고, 쓴다고 알린다", () => {
    const value = plan({ includeDrafts: true, includeStale: true });
    const stale = value.warnings.find((warning) => warning.code === "stale");
    expect(stale?.message).toContain("그대로 썼으니");
    expect(value.warnings.find((warning) => warning.code === "draft")?.severity).toBe("warning");
    expect(value.captions.map((caption) => caption.translated)).toEqual([true, true, true, false, false, false]);
  });

  it("제목·안내 문구를 입력하면 원문 안내 경고가 사라진다", () => {
    const value = plan(PROMO_LOCALE_DEFAULT_POLICY, messy, bundleOf(messyDrafts), { title: "Under the Stars", cta: "Read chapter 1" });
    expect(codes(value)).not.toContain("title-source:-");
    expect(codes(value)).not.toContain("cta-source:-");
  });

  it("자막 모드가 장면 자막이 아니면 로케일 자막은 장면 자막 기준이라고 알린다", () => {
    const project = projectOf(["어서 와"]);
    const voiced: PromoProject = { ...project, voiceStudio: { ...createPromoVoiceStudio(project), captionMode: "karaoke" } };
    expect(plan(PROMO_LOCALE_DEFAULT_POLICY, voiced, bundleOf([draft(r1, "Welcome.")])).warnings.some((warning) => warning.code === "caption-mode")).toBe(true);
    expect(plan(PROMO_LOCALE_DEFAULT_POLICY, project, bundleOf([draft(r1, "Welcome.")])).warnings.some((warning) => warning.code === "caption-mode")).toBe(false);
  });

  it("번역 자막이 3줄 영역을 넘으면 넘침 게이트로 경고하고, 짧은 자막은 경고하지 않는다", () => {
    const project = projectOf(["어서 와", "오랜만이야"]);
    const long = "It has been such a long time since we last met each other here in this old quiet alley, and I really missed you all along";
    const value = plan(PROMO_LOCALE_DEFAULT_POLICY, project, bundleOf([draft(r1, "Welcome."), draft(r2, long)]));
    const overflow = value.warnings.filter((warning) => warning.code === "overflow");
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ index: 1, severity: "warning" });
    expect(overflow[0]?.message).toContain("컷 2");
    expect(overflow[0]?.message).toContain("3줄");
    expect(overflow[0]?.message).toContain("SRT·VTT에는 전체가 들어가요");
  });

  it("승인하지 않아 쓰지 않는 번역은 넘침을 따지지 않는다", () => {
    const long = "It has been such a long time since we last met each other here in this old quiet alley, and I really missed you all along";
    const value = plan(PROMO_LOCALE_DEFAULT_POLICY, projectOf(["어서 와"]), bundleOf([draft(r1, long, { approved: false })]));
    expect(value.warnings.some((warning) => warning.code === "overflow")).toBe(false);
  });

  it("120자를 넘는 번역은 프로젝트 JSON에 120자까지만 담는다고 경고한다", () => {
    const text = `${"word ".repeat(40)}end`;
    const value = plan(PROMO_LOCALE_DEFAULT_POLICY, projectOf(["어서 와"]), bundleOf([draft(r1, text)]));
    expect(value.warnings.some((warning) => warning.code === "json-truncated" && warning.index === 0)).toBe(true);
  });

  it("자막 영역 상수는 렌더러(promo-canvas)와 같다", () => {
    // 렌더러가 글자 크기·폭·줄 수·줄 간격을 바꾸면 이 테스트가 깨져서 넘침 게이트의 영역도 함께 고치게 한다.
    expect(canvasSource).toContain("const fontSize = unit * 0.051;");
    expect(canvasSource).toContain("const textWidth = width * (safe ? 0.7 : 0.8);");
    expect(canvasSource).toContain("drawText(ctx, caption, textX, textY, textWidth, fontSize, 3);");
    expect(canvasSource).toContain("fontSize * 1.4");
    expect(PROMO_CAPTION_MAX_LINES).toBe(3);
    const wide = promoCaptionBox({ ratio: "16:9", presentation: undefined }, measurer);
    const tall = promoCaptionBox({ ratio: "9:16", presentation: undefined }, measurer);
    const unsafe = promoCaptionBox({ ratio: "9:16", presentation: { captionStyle: "classic", captionPosition: "bottom", safeArea: false, reducedMotion: false, brandColor: "#94b8ff", brandText: "" } }, measurer);
    expect(tall.fontSize).toBeCloseTo(1080 * 0.051, 5);
    expect(wide.fontSize).toBeCloseTo(tall.fontSize, 5);
    expect(wide.boxWidth).toBeGreaterThan(unsafe.boxWidth);
    expect(unsafe.boxWidth).toBeGreaterThan(tall.boxWidth);
    expect(tall.lineHeight).toBe(1.4);
  });
});

describe("로케일 프로젝트와 파일", () => {
  const bundle = bundleOf([draft(r1, "Welcome."), draft(r5, "Yes."), draft(r2, "Long time no see.", { approved: false })]);
  const project: PromoProject = {
    ...projectOf(["어서 와", "오랜만이야", "응"]),
    audio: { src: "data:audio/wav;base64,aGVsbG8=", volume: 0.3 },
    voiceover: { src: "data:audio/wav;base64,aGVsbG8=", volume: 0.9, startSec: 1, durationSec: 2 },
    mixer: { masterVolume: 0.8, ducking: 0.5, attackSec: 0.2, releaseSec: 0.3 },
  };
  const withVoice: PromoProject = { ...project, voiceStudio: { ...createPromoVoiceStudio(project), captionMode: "voice" } };

  it("자막·제목·안내 문구만 바꾸고 한국어 음성은 빼며 입력 프로젝트는 건드리지 않는다", () => {
    const plan = planPromoLocale(withVoice, bundle, request("en", { title: "Under the Stars", cta: "Read chapter 1" }), measurer);
    const { full, forJson } = localizePromoProject(withVoice, plan);
    expect(full.panels.map((value) => value.caption)).toEqual(["Welcome.", "오랜만이야", "Yes."]);
    expect(full).toMatchObject({ title: "Under the Stars", cta: "Read chapter 1", voiceover: null, voiceStudio: undefined });
    expect(forJson.panels.map((value) => value.caption)).toEqual(full.panels.map((value) => value.caption));
    expect(full.audio).toEqual(withVoice.audio);
    expect(full.mixer).toEqual(withVoice.mixer);
    expect(full.panels.map((value) => value.id)).toEqual(withVoice.panels.map((value) => value.id));
    expect(withVoice.panels[0]?.caption).toBe("어서 와");
    expect(withVoice.voiceover).not.toBeNull();
    expect(withVoice.voiceStudio?.captionMode).toBe("voice");
  });

  it("SRT·VTT는 번역 자막과 안내 문구를 컷 시간표대로 담고, 대사 클립 자막 모드여도 한국어가 섞이지 않는다", () => {
    const files = buildPromoLocaleFiles(withVoice, planPromoLocale(withVoice, bundle, request("en", { cta: "Read chapter 1" }), measurer));
    const srt = files["en/captions.srt"] ?? "";
    expect(srt).toContain("Welcome.");
    expect(srt).toContain("Yes.");
    expect(srt).toContain("00:00:13,000 --> 00:00:15,000\nRead chapter 1");
    expect(srt).not.toContain("지금 첫 화를");
    expect(srt).not.toContain("어서 와");
    const timeline = promoTimeline(withVoice);
    expect(srt).toContain(`00:00:00,000 --> `);
    expect(timeline[0]?.from).toBe(0);
    expect(files["en/captions.vtt"]).toMatch(/^WEBVTT\n\n/u);
    expect(files["en/captions.vtt"]).toContain("00:00:13.000 --> 00:00:15.000\nRead chapter 1");
  });

  it("프로젝트 JSON은 다시 읽히고 승인되지 않은 번역은 원문으로 남는다", () => {
    const files = buildPromoLocaleFiles(project, planPromoLocale(project, bundle, request("en"), measurer));
    const parsed = parsePromoProject(JSON.parse(files["en/project.json"] ?? "null"));
    expect(parsed.panels.map((value) => value.caption)).toEqual(["Welcome.", "오랜만이야", "Yes."]);
    expect(parsed.voiceover).toBeNull();
    expect(parsed.voiceStudio).toBeUndefined();
    expect(parsed.audio?.volume).toBe(0.3);
    // 로케일 SRT도 같은 프로젝트에서 나오므로 JSON을 다시 열어 SRT를 만들어도 같다.
    expect(promoSrt(parsed)).toBe(files["en/captions.srt"]);
  });

  it("120자를 넘는 번역은 JSON에서만 120자로 줄이고 SRT에는 전체를 남긴다", () => {
    const text = `${"word ".repeat(40)}end`;
    const single = projectOf(["어서 와"]);
    const files = buildPromoLocaleFiles(single, planPromoLocale(single, bundleOf([draft(r1, text)]), request("en"), measurer));
    expect(files["en/captions.srt"]).toContain(text.replace(/\s+/gu, " ").trim());
    const parsed = parsePromoProject(JSON.parse(files["en/project.json"] ?? "null"));
    expect(Array.from(parsed.panels[0]?.caption ?? "").length).toBeLessThanOrEqual(120);
    expect(Array.from(parsed.panels[0]?.caption ?? "").length).toBeGreaterThan(100);
    expect(parsed.panels[0]?.caption.endsWith("…")).toBe(true);
  });
});

describe("로케일 묶음(ZIP)", () => {
  const bundle = bundleOf([
    draft(r1, "Welcome."), draft(r5, "Yes."),
    draft(r1, "ようこそ", { locale: "ja" }), draft(r5, "うん", { locale: "ja" }),
  ]);
  const project = projectOf(["어서 와", "응"]);
  const build = (requests = [request("ja"), request("en")]) => buildPromoLocaleBatch({ project, bundle, requests, measurer });

  it("로케일마다 SRT·VTT·프로젝트 JSON과 manifest·README를 만든다", () => {
    const result = build();
    expect(Object.keys(result.files).sort()).toEqual([
      "README.txt", "en/captions.srt", "en/captions.vtt", "en/project.json", "ja/captions.srt", "ja/captions.vtt", "ja/project.json", "manifest.json",
    ]);
    expect(result.plans.map((plan) => plan.request.locale)).toEqual(["ja", "en"]);
    expect(result.files["ja/captions.srt"]).toContain("ようこそ");
    expect(result.files["en/captions.srt"]).toContain("Welcome.");
  });

  it("manifest에는 원본 개정·정책·상태별 개수·경고가 있고 시각이 없어 결과가 결정적이다", () => {
    const first = build();
    const second = build();
    expect(second.files).toEqual(first.files);
    const manifest = JSON.parse(first.files["manifest.json"] ?? "null");
    expect(manifest).toMatchObject({
      format: "toonstudio-promo-locales", version: 1,
      project: { seconds: 15, ratio: "9:16", panelCount: 2 },
      source: { documentId: "doc-1", revision: 7, draftCount: 4, documentRows: 5 },
    });
    expect(manifest.locales[0]).toMatchObject({ locale: "ja", captions: { captioned: 2, approved: 2, translatedUsed: 2 }, policy: { includeDrafts: false, includeStale: false } });
    expect(JSON.stringify(manifest)).not.toMatch(/\d{4}-\d{2}-\d{2}T/u);
    expect(first.files["README.txt"]).toContain("오디오는 만들지 않았");
    expect(first.warningCount).toBe(0);
  });

  it("ZIP으로 묶어 풀면 같은 파일이 나오고 경로가 안전하다", () => {
    const result = build();
    const unzipped = promoUnzip(promoZip(result.files));
    expect(Object.keys(unzipped).sort()).toEqual(Object.keys(result.files).sort());
    expect(new TextDecoder().decode(unzipped["ja/captions.vtt"])).toBe(result.files["ja/captions.vtt"]);
  });

  it("경고 개수는 경고 단계만 센다", () => {
    const partial = buildPromoLocaleBatch({ project, bundle: bundleOf([draft(r1, "Welcome.")]), requests: [request("en")], measurer });
    expect(partial.warningCount).toBe(1);
    expect(partial.plans[0]?.warnings.some((warning) => warning.code === "missing")).toBe(true);
  });

  it.each([
    ["로케일 없음", []],
    ["형식이 잘못된 로케일", [request("EN")]],
    ["경로 문자가 든 로케일", [request("../en")]],
    ["중복 로케일", [request("en"), request("en")]],
    ["너무 긴 제목", [request("en", { title: "a".repeat(81) })]],
    ["너무 긴 안내 문구", [request("en", { cta: "a".repeat(81) })]],
  ])("거절한다: %s", (_label, requests) => {
    expect(() => build(requests)).toThrow();
  });

  it("컷이 없으면 만들지 않는다", () => {
    expect(() => buildPromoLocaleBatch({ project: projectOf([]), bundle, requests: [request("en")], measurer })).toThrow("컷이 없어");
  });

  it("로케일 표시 이름은 한국어로 알려진 코드만 풀고 모르는 코드는 그대로 둔다", () => {
    expect(promoLocaleLabel("en")).toBe("영어");
    expect(promoLocaleLabel("ja")).toBe("일본어");
    expect(promoLocaleLabel("not a locale")).toBe("not a locale");
  });
});

describe("창작 생태계 대사(원문 개정에 묶인 번역)", () => {
  /** 작업대 화면과 같은 함수로 만든다: 1번은 승인, 2번은 승인 전 초안, 3번은 승인한 뒤 원문을 고쳐 오래된 번역. */
  function ecosystemBundle(): PromoTranslationBundle {
    let state = structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
    state = upsertDialogueSource(state, "line-1", "어서 와");
    state = setDialogueTranslation(state, "line-1", "en", "Welcome.", true);
    state = upsertDialogueSource(state, "line-2", "오랜만이야");
    state = setDialogueTranslation(state, "line-2", "en", "Long time no see.", false);
    state = upsertDialogueSource(state, "line-3", "또 보자");
    state = setDialogueTranslation(state, "line-3", "en", "See you.", true);
    state = upsertDialogueSource(state, "line-3", "또 만나");
    return promoTranslationBundleFromEcosystem(state);
  }
  const project = projectOf(["어서 와", "오랜만이야", "또 만나"]);
  const build = (requests: PromoLocaleRequest[]) => buildPromoLocaleBatch({ project, bundle: ecosystemBundle(), requests, measurer });

  it("개정이 다른 번역을 오래됨으로 판정한다", () => {
    const resolutions = resolvePromoLocale(project, ecosystemBundle(), "en");
    expect(resolutions.map((value) => value.state)).toEqual(["approved", "draft", "stale"]);
    expect(summarizePromoLocale(resolutions, "en")).toMatchObject({ captioned: 3, ready: false, counts: { approved: 1, draft: 1, stale: 1, missing: 0, unlinked: 0 } });
  });

  it("기본 정책은 승인된 번역만 치환하고, 오래됨·승인 전은 원문 자막으로 남겨 경고한다", () => {
    const result = build([request("en")]);
    const srt = result.files["en/captions.srt"] ?? "";
    expect(srt).toContain("Welcome.");
    expect(srt).not.toContain("Long time no see.");
    expect(srt).not.toContain("See you.");
    expect(srt).toContain("오랜만이야");
    expect(srt).toContain("또 만나");
    const warnings = result.plans[0]?.warnings ?? [];
    expect(warnings.find((warning) => warning.code === "stale")).toMatchObject({ severity: "warning", index: 2 });
    expect(warnings.find((warning) => warning.code === "draft")).toMatchObject({ severity: "info", index: 1 });
  });

  it("사용 기준을 켜면 오래된 번역과 초안을 쓰고 경고는 남는다", () => {
    const result = build([request("en", { policy: { includeDrafts: true, includeStale: true } })]);
    const srt = result.files["en/captions.srt"] ?? "";
    expect(srt).toContain("Long time no see.");
    expect(srt).toContain("See you.");
    const warnings = result.plans[0]?.warnings ?? [];
    expect(warnings.find((warning) => warning.code === "stale")?.message).toContain("그대로 썼으니");
    expect(warnings.find((warning) => warning.code === "draft")).toMatchObject({ severity: "warning" });
  });

  it("manifest는 작업대 기록에서 왔음을(문서·개정 없음, 대사 3개) 밝히고 프로젝트 JSON은 다시 읽힌다", () => {
    const result = build([request("en")]);
    const manifest = JSON.parse(result.files["manifest.json"] ?? "null");
    expect(manifest.source).toEqual({ documentId: null, revision: null, draftCount: 3, documentRows: 3 });
    expect(manifest.locales[0].captions).toMatchObject({ captioned: 3, approved: 1, draft: 1, stale: 1, translatedUsed: 1 });
    expect(() => parsePromoProject(JSON.parse(result.files["en/project.json"] ?? "null"))).not.toThrow();
  });
});
