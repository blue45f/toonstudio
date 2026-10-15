import { describe, expect, it } from "vitest";

import { applyPromoShortPreset, changePromoSeconds, promoSecondsOptions } from "./promo-duration";
import {
  directPromo,
  emptyPromoProject,
  isPromoSeconds,
  localPromoPlan,
  parsePromoAiPlan,
  parsePromoProject,
  PROMO_DIRECTOR_TEMPLATES,
  PROMO_DURATIONS,
  PROMO_ENDING_SECONDS,
  PROMO_FPS,
  PROMO_MAX_PANELS,
  PROMO_MIN_SCENE_FRAMES,
  PROMO_SHORT_MAX_PANELS,
  promoAiPrompt,
  promoCaptionEntries,
  promoFrameCount,
  promoMaxPanels,
  promoShortFormWeights,
  promoShotList,
  promoSrt,
  promoTimeline,
  promoVtt,
} from "./promo-model";
import { promoPreflight } from "./promo-preflight";
import { promoRemotionFiles } from "./promo-remotion";
import { createPromoVoiceStudio } from "./promo-voice-studio";

import type { PromoPanel, PromoProject, PromoSeconds } from "./promo-model";

const image = "data:image/png;base64,aGVsbG8=";

function panels(count: number, caption = (index: number) => `자막 ${index + 1}`): PromoPanel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `cut-${index}`,
    src: image,
    description: `장면 ${index + 1}`,
    caption: caption(index),
    motion: "push-in",
    fit: "contain",
    weight: 1,
  }));
}
function project(count: number, seconds: PromoSeconds = 10, caption?: (index: number) => string): PromoProject {
  return { ...emptyPromoProject(), seconds, panels: panels(count, caption) };
}
const sceneSeconds = (value: PromoProject) => promoTimeline(value).map((scene) => scene.duration / PROMO_FPS);

describe("10초 숏폼 길이 계약", () => {
  it("지원 길이에 10초를 더하되 기존 15·30·60초와 기본값은 그대로다", () => {
    expect([...PROMO_DURATIONS]).toEqual([10, 15, 30, 60]);
    expect(emptyPromoProject().seconds).toBe(15);
    for (const value of [10, 15, 30, 60]) expect(isPromoSeconds(value)).toBe(true);
    for (const value of [0, 5, 9, 11, 20, 45, 61, Number.NaN, "10", null, undefined]) expect(isPromoSeconds(value)).toBe(false);
  });

  it("컷 수 상한은 10초만 6컷이고 15·30·60초는 기존 12컷을 유지한다", () => {
    expect(promoMaxPanels(10)).toBe(PROMO_SHORT_MAX_PANELS);
    expect(PROMO_SHORT_MAX_PANELS).toBe(6);
    for (const seconds of [15, 30, 60]) expect(promoMaxPanels(seconds)).toBe(PROMO_MAX_PANELS);
    expect(PROMO_MAX_PANELS).toBe(12);
  });

  for (const count of [1, 2, 3, 4, 5, 6]) {
    it(`10초 / ${count}컷은 종료 카드 2초를 포함하고 틈 없이 컷마다 0.5초 이상이다`, () => {
      const value = project(count);
      const timeline = promoTimeline(value);
      expect(timeline).toHaveLength(count);
      expect(timeline[0]?.from).toBe(0);
      timeline.forEach((scene, index) => {
        expect(Number.isInteger(scene.duration)).toBe(true);
        expect(scene.duration).toBeGreaterThanOrEqual(PROMO_MIN_SCENE_FRAMES);
        if (index) expect(scene.from).toBe((timeline[index - 1]?.from ?? 0) + (timeline[index - 1]?.duration ?? 0));
      });
      const contentFrames = timeline.reduce((sum, scene) => sum + scene.duration, 0);
      expect(contentFrames).toBe(8 * PROMO_FPS);
      expect(contentFrames + PROMO_ENDING_SECONDS * PROMO_FPS).toBe(promoFrameCount(value));
      expect(promoFrameCount(value)).toBe(300);
    });
  }

  it("가중치가 극단이어도(0.5배와 3배) 컷마다 최소 길이를 지킨다", () => {
    const value = project(6);
    value.panels = value.panels.map((panel, index) => ({ ...panel, weight: index === 0 ? 3 : 0.5 }));
    for (const scene of promoTimeline(value)) expect(scene.duration).toBeGreaterThanOrEqual(PROMO_MIN_SCENE_FRAMES);
  });

  it("10초에 7컷 이상은 타임라인·가져오기 모두 거절한다", () => {
    expect(() => promoTimeline(project(7))).toThrow(RangeError);
    expect(() => promoTimeline(project(12))).toThrow(RangeError);
    expect(() => parsePromoProject(project(7))).toThrow("6개까지");
    expect(() => parsePromoProject(project(12))).toThrow();
    expect(parsePromoProject(project(6))).toEqual(project(6));
  });

  it("15·30·60초는 12컷까지 그대로 허용하고 13컷은 여전히 거절한다", () => {
    for (const seconds of [15, 30, 60] as const) {
      const value = project(12, seconds);
      expect(promoTimeline(value)).toHaveLength(12);
      expect(parsePromoProject(JSON.parse(JSON.stringify(value)))).toEqual(value);
      expect(() => parsePromoProject(project(13, seconds))).toThrow();
    }
  });
});

describe("저장된 초안·가져오기 역호환", () => {
  const legacyJson = JSON.stringify({
    version: 1, title: "예전 저장본", synopsis: "", cta: "지금 첫 화를 만나보세요", ratio: "9:16", seconds: 15, style: "cinematic",
    panels: [{ id: "legacy-1", src: image, description: "", caption: "예전 자막", motion: "push-in", fit: "contain", weight: 1 }],
    audio: null,
  });

  it("10초 지원 이전에 저장한 15초 프로젝트 JSON은 값 변화 없이 그대로 읽힌다", () => {
    const parsed = parsePromoProject(JSON.parse(legacyJson));
    expect(parsed.seconds).toBe(15);
    expect(parsed.panels).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(legacyJson));
    expect(promoFrameCount(parsed)).toBe(450);
  });

  it("알려지지 않은 길이와 잘못된 형식은 여전히 거절한다", () => {
    const base = JSON.parse(legacyJson) as Record<string, unknown>;
    for (const seconds of [0, 5, 9, 11, 14, 20, 45, 59, 61, 90, Number.NaN, Number.POSITIVE_INFINITY, "10", "15", null, undefined, [], {}]) {
      expect(() => parsePromoProject({ ...base, seconds })).toThrow();
    }
  });

  it("10초 프로젝트도 직렬화 후 다시 읽으면 같고, 음성 스튜디오 클립은 10초 안에서만 허용한다", () => {
    const value = project(3);
    expect(parsePromoProject(JSON.parse(JSON.stringify(value)))).toEqual(value);
    const withVoice: PromoProject = { ...value, voiceStudio: createPromoVoiceStudio(value) };
    expect(parsePromoProject(JSON.parse(JSON.stringify(withVoice)))).toEqual(withVoice);
    const late: PromoProject = {
      ...withVoice,
      voiceStudio: { ...createPromoVoiceStudio(value), clips: [{ id: "late", speakerId: "speaker-narrator", text: "늦은 대사", startSec: 9, durationSec: 2 }] },
    };
    expect(() => parsePromoProject(late)).toThrow();
  });

  it("가져오기에서 10초 프로젝트는 컷 미디어 검증 전에 컷 수 상한으로 거절된다", () => {
    const hostile = { ...project(6), panels: [...project(6).panels, { id: "x", src: "https://example.invalid/a.png" }] };
    expect(() => parsePromoProject(hostile)).toThrow("6개까지");
  });
});

describe("10초 숏폼 가중치", () => {
  it("빈 입력은 빈 배열이고 결과는 결정적이며 계약 범위(0.5~3) 안이다", () => {
    expect(promoShortFormWeights([])).toEqual([]);
    const texts = ["", "짧게", "조금 더 긴 자막이에요", "아주 아주 길어서 읽는 데 시간이 한참 걸리는 자막입니다 정말로 길어요 끝", "마지막"];
    const weights = promoShortFormWeights(texts);
    expect(weights).toEqual(promoShortFormWeights(texts));
    expect(weights).toHaveLength(texts.length);
    for (const weight of weights) {
      expect(weight).toBeGreaterThanOrEqual(0.5);
      expect(weight).toBeLessThanOrEqual(3);
    }
  });

  it("긴 자막일수록 상대 길이가 길고 마지막 컷은 여운만큼 더 길다", () => {
    const [short, long, last] = promoShortFormWeights(["가나", "가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사", "가나"]);
    expect(long).toBeGreaterThan(short ?? 0);
    expect(last).toBeGreaterThan(short ?? 0);
  });

  it("숏폼 가중치로 만든 장면 길이는 읽기 시간 순서를 따르고 모두 0.5초 이상이다", () => {
    const captions = ["네!", "그때 우리가 만났던 비 오는 골목에서 모든 이야기가 시작됐어요", "응", "마지막 인사"];
    const value = project(4, 10, (index) => captions[index] ?? "");
    const planned = { ...value, panels: localPromoPlan(value) };
    const seconds = sceneSeconds(planned);
    expect(seconds.reduce((sum, item) => sum + item, 0)).toBeCloseTo(8, 5);
    expect(seconds[1]).toBe(Math.max(...seconds));
    expect(Math.min(...seconds)).toBeGreaterThanOrEqual(0.5);
    // 같은 자막을 15초에 쓰면 기존 글자 수 규칙이 그대로 적용된다(숏폼 규칙이 새지 않는다).
    const legacy = localPromoPlan({ ...value, seconds: 15 });
    expect(legacy.map((panel) => panel.weight)).toEqual(captions.map((caption, index) => Math.min(3, Math.round((0.8 + Array.from(caption).length / 80 + (index === captions.length - 1 ? 0.25 : 0)) * 100) / 100)));
  });

  it("10초 로컬 연출은 원본 컷 순서·이미지·자막을 보존하고 결과가 다시 읽힌다", () => {
    const value = project(5);
    const planned = { ...value, panels: localPromoPlan(value) };
    expect(planned.panels.map((panel) => panel.id)).toEqual(value.panels.map((panel) => panel.id));
    expect(planned.panels.map((panel) => panel.caption)).toEqual(value.panels.map((panel) => panel.caption));
    expect(parsePromoProject(JSON.parse(JSON.stringify(planned)))).toEqual(planned);
    expect(value.panels.every((panel) => panel.weight === 1)).toBe(true);
  });

  it("offset을 주면 모션 순환만 이어지고 나머지 계산은 같다", () => {
    const value = project(3, 15);
    const plain = localPromoPlan(value);
    const shifted = localPromoPlan(value, 2);
    expect(shifted.map((panel) => panel.weight)).toEqual(plain.map((panel) => panel.weight));
    expect(shifted[0]?.motion).toBe(plain[2]?.motion);
  });
});

describe("10초 쇼츠 트레일러 템플릿", () => {
  const template = PROMO_DIRECTOR_TEMPLATES.find((item) => item.id === "short10");

  it("이름과 안내 문구에 10초·틱톡·쇼츠·6컷이 드러난다", () => {
    expect(template?.label).toBe("10초 쇼츠 트레일러");
    expect(template?.description).toContain("틱톡·쇼츠");
    expect(template?.description).toContain("6컷");
    expect(PROMO_DIRECTOR_TEMPLATES.map((item) => item.id)).toEqual(["anime", "trailer", "romance", "mystery", "launch", "recap", "short10"]);
  });

  it("결정적이고 포터블하며 자막·이미지·순서를 바꾸지 않는다", () => {
    const value = project(4, 10, (index) => ["도입", "전개", "", "끝"][index] ?? "");
    const result = directPromo(value, "short10");
    expect(result).toEqual(directPromo(value, "short10"));
    expect(parsePromoProject(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(result.panels.map(({ id, src }) => ({ id, src }))).toEqual(value.panels.map(({ id, src }) => ({ id, src })));
    expect(result.panels.map((panel) => panel.transition)).toEqual(["cut", "cut", "cut", "cut"]);
    expect(result.panels.map((panel) => panel.effect)).toEqual(["speedlines", "none", "none", "speedlines"]);
    expect(result.presentation?.captionStyle).toBe("boxed");
    expect(result.style).toBe("action");
    expect(value.panels.every((panel) => panel.weight === 1 && panel.transition === undefined)).toBe(true);
  });

  it("10초에서는 숏폼 가중치를, 15초에서는 기존 글자 수 규칙을 쓴다", () => {
    const captions = ["네", "그때 우리가 만났던 골목에서 이야기가 시작됐어요 정말로요", "응", "끝"];
    const ten = directPromo(project(4, 10, (index) => captions[index] ?? ""), "short10");
    expect(ten.panels.map((panel) => panel.weight)).toEqual(promoShortFormWeights(captions));
    const fifteen = directPromo(project(4, 15, (index) => captions[index] ?? ""), "short10");
    expect(fifteen.panels.map((panel) => panel.weight)).toEqual(captions.map((caption, index) => Math.max(0.5, Math.min(3, Math.round((0.6 + Array.from(caption).length / 35 + (index === 3 ? 0.5 : 0)) * 2) / 2))));
  });

  it("기존 여섯 템플릿의 15초 결과는 그대로다", () => {
    const value = project(3, 15, () => "한글 대사와 영어 Hello");
    const expected = value.panels.map((panel, index) => Math.max(0.5, Math.min(3, Math.round((0.6 + Array.from(panel.caption).length / 35 + (index === 2 ? 0.5 : 0)) * 2) / 2)));
    for (const id of ["anime", "trailer", "romance", "mystery", "launch", "recap"] as const) {
      expect(directPromo(value, id).panels.map((panel) => panel.weight)).toEqual(expected);
    }
    expect(directPromo(value, "launch").presentation?.captionStyle).toBe("boxed");
    expect(directPromo(value, "anime").presentation?.captionStyle).toBe("classic");
  });
});

describe("길이 변경과 10초 프리셋 적용", () => {
  it("선택지는 지금 컷 수로 고를 수 없는 길이와 이유를 알려 준다", () => {
    expect(promoSecondsOptions(3).every((option) => option.allowed && option.reason === null)).toBe(true);
    const crowded = promoSecondsOptions(8);
    expect(crowded.find((option) => option.seconds === 10)).toMatchObject({ allowed: false, maxPanels: 6 });
    expect(crowded.find((option) => option.seconds === 10)?.reason).toContain("컷은 지우지 않았어요");
    expect(crowded.filter((option) => option.allowed).map((option) => option.seconds)).toEqual([15, 30, 60]);
  });

  it("컷이 많으면 10초로 바꾸지 않고 프로젝트도 건드리지 않는다", () => {
    const value = project(8, 15);
    const result = changePromoSeconds(value, 10);
    expect(result.ok).toBe(false);
    expect(value.seconds).toBe(15);
    expect(value.panels).toHaveLength(8);
    expect(applyPromoShortPreset(value).ok).toBe(false);
  });

  it("같은 길이로 바꾸면 같은 프로젝트를 돌려준다", () => {
    const value = project(2, 15);
    const result = changePromoSeconds(value, 15);
    expect(result.ok && result.project).toBe(value);
  });

  it("음성 스튜디오 대사를 새 길이 안으로 다시 맞추고 결과가 저장 가능하다", () => {
    const base = project(3, 30, (index) => ["하나", "둘", "셋"][index] ?? "");
    const studio = createPromoVoiceStudio(base);
    const long: PromoProject = {
      ...base,
      voiceStudio: { ...studio, clips: [...studio.clips, { id: "tail", speakerId: "speaker-narrator", text: "뒤쪽 자유 대사", startSec: 25, durationSec: 3 }] },
    };
    const result = changePromoSeconds(long, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.seconds).toBe(10);
    expect(result.project.voiceStudio?.clips.some((clip) => clip.id === "tail")).toBe(false);
    for (const clip of result.project.voiceStudio?.clips ?? []) expect(clip.startSec + clip.durationSec).toBeLessThanOrEqual(10.001);
    expect(() => parsePromoProject(JSON.parse(JSON.stringify(result.project)))).not.toThrow();
  });

  it("프리셋은 10초·세로 9:16·쇼츠 연출을 한 번에 적용하되 컷 순서와 자막을 보존한다", () => {
    const base: PromoProject = { ...project(4, 30, (index) => ["도입 컷", "전개 컷", "반전 컷", "마무리 컷"][index] ?? ""), ratio: "16:9" };
    const result = applyPromoShortPreset(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).toMatchObject({ seconds: 10, ratio: "9:16", style: "action" });
    expect(result.project.panels.map((panel) => panel.caption)).toEqual(["도입 컷", "전개 컷", "반전 컷", "마무리 컷"]);
    expect(result.project.panels.every((panel) => panel.transition === "cut")).toBe(true);
    expect(promoFrameCount(result.project)).toBe(300);
    expect(base.seconds).toBe(30);
    expect(base.ratio).toBe("16:9");
  });

  it("컷이 없어도 프리셋은 길이와 비율을 맞춘다", () => {
    const result = applyPromoShortPreset({ ...emptyPromoProject(), seconds: 60, ratio: "1:1" });
    expect(result.ok && result.project).toMatchObject({ seconds: 10, ratio: "9:16", panels: [] });
  });
});

describe("미리보기·내보내기 일관성", () => {
  it("SRT·VTT·샷 리스트가 같은 8초+2초 구간을 쓴다", () => {
    const value = project(2, 10, (index) => ["첫 장면", "둘째 장면"][index] ?? "");
    value.cta = "지금 만나보세요";
    const timeline = promoTimeline(value);
    const entries = promoCaptionEntries(value);
    expect(entries.at(-1)).toMatchObject({ from: 240, end: 300, caption: "지금 만나보세요" });
    expect(entries[0]?.from).toBe(0);
    expect(entries[1]?.end).toBe((timeline[1]?.from ?? 0) + (timeline[1]?.duration ?? 0));
    expect(promoSrt(value)).toContain("00:00:08,000 --> 00:00:10,000\n지금 만나보세요");
    expect(promoVtt(value)).toContain("00:00:08.000 --> 00:00:10.000\n지금 만나보세요");
    const shots = JSON.parse(promoShotList(value)) as { seconds: number; ending: { startFrame: number; durationFrames: number }; scenes: { durationFrames: number }[] };
    expect(shots.seconds).toBe(10);
    expect(shots.ending).toMatchObject({ startFrame: 240, durationFrames: 60 });
    expect(shots.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0)).toBe(240);
  });

  it("Remotion 킷은 같은 프로젝트·300프레임·같은 상한을 담는다", () => {
    const value = project(3, 10);
    const files = promoRemotionFiles(value, { model: "shared-model", canvas: "shared-canvas", voiceStudioModel: "shared-voice-model" });
    const saved = JSON.parse(String(files["project.json"])) as PromoProject;
    expect(saved.seconds).toBe(10);
    expect(String(files["README.md"])).toContain("10 seconds (300 frames at 30 fps)");
    expect(String(files["README.md"])).toContain("at most 6 cuts");
    expect(String(files["captions.srt"])).toContain("00:00:08,000 --> 00:00:10,000");
    expect(String(files["src/Root.tsx"])).toContain("durationInFrames={promoFrameCount(project)}");
    // 15초 킷의 안내는 12컷 상한과 450프레임이다.
    const fifteen = promoRemotionFiles(project(3, 15), { model: "m", canvas: "c", voiceStudioModel: "v" });
    expect(String(fifteen["README.md"])).toContain("15 seconds (450 frames at 30 fps)");
    expect(String(fifteen["README.md"])).toContain("at most 12 cuts");
  });

  it("점검은 10초에서 1초보다 짧은 컷만 숏폼 경고로 알리고 15초에서는 알리지 않는다", () => {
    const skewed = project(6);
    skewed.panels = skewed.panels.map((panel, index) => ({ ...panel, weight: index === 0 ? 3 : 0.5 }));
    expect(promoTimeline(skewed).some((scene) => scene.duration < PROMO_FPS)).toBe(true);
    expect(promoPreflight(skewed).some((issue) => issue.id.startsWith("short-pace-"))).toBe(true);
    expect(promoPreflight({ ...skewed, seconds: 15 }).some((issue) => issue.id.startsWith("short-pace-"))).toBe(false);
    expect(promoPreflight(project(3)).some((issue) => issue.id.startsWith("short-pace-"))).toBe(false);
  });

  it("AI 안내는 10초에만 짧은 자막 힌트를 더하고 응답 검증은 그대로다", () => {
    const ten = promoAiPrompt(project(2, 10));
    const fifteen = promoAiPrompt(project(2, 15));
    expect(ten.system).toContain("10-second short-form trailer");
    expect(fifteen.system).not.toContain("short-form");
    expect(ten.system.startsWith(fifteen.system.slice(0, 200))).toBe(true);
    const value = project(2, 10);
    const content = JSON.stringify({ scenes: value.panels.map((panel) => ({ id: panel.id, caption: "새 자막", motion: "still", weight: 1 })) });
    expect(parsePromoAiPlan(content, value)).toHaveLength(2);
  });
});
