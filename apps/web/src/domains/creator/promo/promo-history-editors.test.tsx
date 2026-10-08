// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

import { PromoAudioMixer } from "./PromoAudioMixer";
import { PromoDirectorControls } from "./PromoDirectorControls";
import { emptyPromoProject } from "./promo-model";
import { PromoPanelEditor } from "./PromoPanelEditor";
import { PromoVoiceDirector } from "./PromoVoiceDirector";

import type { PromoScene } from "./promo-model";

// 클라우드 음성 상태 조회는 이 계약과 무관하다. 응답을 보류해 렌더 뒤 상태 갱신이 생기지 않게 한다.
vi.mock("../creator-intelligence/studio-creator-intelligence-client", () => ({
  creatorIntelligenceClient: { status: () => new Promise<never>(() => undefined) },
}));

afterEach(cleanup);

/*
 * 실행 취소 병합 계약: 글자·숫자·슬라이더처럼 연속 이벤트를 내는 컨트롤만 필드 키를 넘기고,
 * 버튼·선택 상자·체크박스 같은 이산 조작은 필드 키 없이 넘겨 항상 실행 취소 한 단계가 되게 한다.
 * 각 조작이 핸들러를 정확히 한 번 더 부르는지 함께 확인해, 호출이 없는데 직전 값으로 통과하지 않게 한다.
 */
function fieldAfter(handler: Mock, trigger: () => void): unknown {
  const before = handler.mock.calls.length;
  trigger();
  expect(handler).toHaveBeenCalledTimes(before + 1);
  return handler.mock.lastCall?.[1];
}

function changed(handler: Mock, element: HTMLElement, value: string): unknown {
  return fieldAfter(handler, () => fireEvent.change(element, { target: { value } }));
}

function clicked(handler: Mock, element: HTMLElement): unknown {
  return fieldAfter(handler, () => fireEvent.click(element));
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} 컨트롤을 찾지 못했어요.`);
  return element;
}

const scene: PromoScene = {
  panel: {
    id: "p1",
    src: "data:image/png;base64,",
    description: "",
    caption: "",
    motion: "still",
    fit: "cover",
    weight: 1,
    camera: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 2 }, easing: "smooth" },
  },
  from: 0,
  duration: 120,
};

function renderPanel(onChange: Mock) {
  render(<PromoPanelEditor scene={scene} index={0} count={1} disabled={false} onChange={onChange} onMove={vi.fn()} onRemove={vi.fn()} onSeekFrame={vi.fn()} />);
}

describe("실행 취소 병합 키 · 컷 편집기", () => {
  it("설명·자막·슬라이더·카메라 구도 입력은 컨트롤별 필드 키를 넘긴다", () => {
    const onChange = vi.fn();
    renderPanel(onChange);
    expect(changed(onChange, byId("description-p1"), "밤의 도시")).toBe("description");
    expect(changed(onChange, byId("caption-p1"), "다시 만나는 순간")).toBe("caption");
    expect(changed(onChange, byId("intensity-p1"), "1.5")).toBe("intensity");
    expect(changed(onChange, byId("focus-x-p1"), "0.8")).toBe("focusX");
    expect(changed(onChange, byId("focus-y-p1"), "0.2")).toBe("focusY");
    expect(changed(onChange, byId("camera-from-x-p1"), "0.25")).toBe("camera.from.x");
    expect(onChange.mock.lastCall?.[0]).toEqual({ camera: { ...scene.panel.camera, from: { x: 0.25, y: 0.5, zoom: 1 } } });
    expect(changed(onChange, byId("camera-to-zoom-p1"), "2.5")).toBe("camera.to.zoom");
  });

  it("구도 맞바꾸기·모드 전환·선택 상자는 필드 키 없이 넘겨 직전 슬라이더 입력과 병합하지 않는다", () => {
    const onChange = vi.fn();
    renderPanel(onChange);
    changed(onChange, byId("camera-from-x-p1"), "0.25");
    expect(clicked(onChange, screen.getByRole("button", { name: "시작·끝 구도 맞바꾸기" }))).toBeUndefined();
    expect(onChange.mock.lastCall?.[0]).toEqual({ camera: { from: { x: 0.5, y: 0.5, zoom: 2 }, to: { x: 0.5, y: 0.5, zoom: 1 }, easing: "smooth" } });
    for (const [id, value] of [["camera-easing-p1", "linear"], ["camera-mode-p1", "preset"], ["motion-p1", "pan-left"], ["fit-p1", "contain"], ["weight-p1", "2"], ["transition-p1", "wipe"], ["effect-p1", "rain"]] as const) {
      expect(changed(onChange, byId(id), value)).toBeUndefined();
    }
  });
});

describe("실행 취소 병합 키 · 오디오 믹서와 연출 감독", () => {
  it("믹서 슬라이더는 필드 키를, 기본값 버튼은 키 없이 넘긴다", () => {
    const onChange = vi.fn();
    render(<PromoAudioMixer project={emptyPromoProject()} disabled={false} onChange={onChange} />);
    expect(changed(onChange, byId("promo-master-volume"), "0.5")).toBe("masterVolume");
    expect(changed(onChange, byId("promo-ducking"), "0.5")).toBe("ducking");
    expect(changed(onChange, byId("promo-duck-attack"), "0.5")).toBe("attackSec");
    expect(changed(onChange, byId("promo-duck-release"), "1")).toBe("releaseSec");
    expect(clicked(onChange, screen.getByRole("button", { name: "믹서 기본값" }))).toBeUndefined();
  });

  it("브랜드 문구·강조색은 필드 키로 병합하고 자막 선택·체크박스는 키 없이 넘긴다", () => {
    const onPatch = vi.fn();
    render(<PromoDirectorControls project={emptyPromoProject()} disabled={false} onApply={vi.fn()} onPatch={onPatch} />);
    expect(changed(onPatch, byId("promo-brand-text"), "TOONSTUDIO")).toBe("brandText");
    expect(changed(onPatch, byId("promo-brand-color"), "#123456")).toBe("brandColor");
    expect(changed(onPatch, byId("promo-caption-style"), "boxed")).toBeUndefined();
    expect(changed(onPatch, byId("promo-caption-position"), "top")).toBeUndefined();
    expect(clicked(onPatch, screen.getByRole("checkbox", { name: /저자극 연출/u }))).toBeUndefined();
  });
});

describe("실행 취소 병합 키 · 음성 연출", () => {
  // jsdom에는 navigator.mediaDevices가 없다. 보안 컨텍스트 브라우저처럼 객체만 두고 화면 녹음은 미지원으로 둔다.
  beforeAll(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("화자·대사의 글자·숫자·슬라이더 입력은 항목별 필드 키를, 추가·제거·선택은 키 없이 넘긴다", () => {
    const onChange = vi.fn();
    render(<PromoVoiceDirector project={emptyPromoProject()} disabled={false} onChange={onChange} onGenerate={vi.fn()} onGenerateCloud={vi.fn()} />);
    const speakerName = screen.getByRole("textbox", { name: "이름" });
    const speakerId = speakerName.id.replace("promo-speaker-name-", "");
    expect(changed(onChange, speakerName, "주인공")).toBe(`speaker:${speakerId}:name`);
    expect(changed(onChange, byId(`promo-speaker-rate-${speakerId}`), "1.2")).toBe(`speaker:${speakerId}:rate`);
    expect(changed(onChange, byId(`promo-speaker-volume-${speakerId}`), "0.5")).toBe(`speaker:${speakerId}:volume`);
    expect(changed(onChange, byId("promo-clip-text-voice-ending-cta"), "지금 만나보세요")).toBe("clip:voice-ending-cta:text");
    expect(changed(onChange, byId("promo-clip-start-voice-ending-cta"), "12")).toBe("clip:voice-ending-cta:startSec");
    expect(changed(onChange, byId("promo-clip-duration-voice-ending-cta"), "1.5")).toBe("clip:voice-ending-cta:durationSec");
    expect(changed(onChange, byId("promo-voice-caption-mode"), "voice")).toBeUndefined();
    expect(changed(onChange, byId(`promo-speaker-gender-${speakerId}`), "female")).toBeUndefined();
    for (const name of ["대사 추가", "대사 제거", "화자 추가", "발음 추가", "장면 타이밍 맞춤", "장면에서 대사 다시 만들기"]) {
      expect(clicked(onChange, screen.getByRole("button", { name }))).toBeUndefined();
    }
  });

  it("발음 사전의 원문·읽는 법 입력은 항목별 필드 키를 넘긴다", () => {
    const onChange = vi.fn();
    const project = emptyPromoProject();
    render(<PromoVoiceDirector project={{ ...project, voiceStudio: { version: 1, captionMode: "scene", speakers: [], clips: [], pronunciations: [{ id: "liora", source: "Liora", spoken: "리오라" }] } }} disabled={false} onChange={onChange} onGenerate={vi.fn()} onGenerateCloud={vi.fn()} />);
    expect(changed(onChange, byId("promo-pronunciation-source-liora"), "LIORA")).toBe("pronunciation:liora:source");
    expect(changed(onChange, byId("promo-pronunciation-spoken-liora"), "리오라아")).toBe("pronunciation:liora:spoken");
    expect(clicked(onChange, screen.getByRole("button", { name: "제거" }))).toBeUndefined();
  });
});
