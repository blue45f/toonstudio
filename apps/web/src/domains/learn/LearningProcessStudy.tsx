import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

const PROCESS_STEPS = [
  {
    title: "구도를 설계하고",
    label: "구상 스케치",
    description:
      "시선과 실루엣, 컷의 호흡. 선을 정리하기 전에 장면이 전하는 이야기를 먼저 잡습니다.",
    href: "/learn/paths/story-direction",
    action: "스토리·연출 과정",
  },
  {
    title: "선의 역할을 고르고",
    label: "선화 설계",
    description:
      "형태를 설명하는 선, 무게를 주는 선. 브러시와 레이어를 다루며 나만의 표현을 찾아갑니다.",
    href: "/learn/paths/studio-quickstart",
    action: "드로잉 도구 실습",
  },
  {
    title: "색으로 완성합니다",
    label: "채색과 조명",
    description:
      "명도와 색의 온도를 나누고 빛을 더합니다. 채색 과정을 익혀 한 장면의 완성도를 높여보세요.",
    href: "/learn/paths/visual-finish",
    action: "그림 완성도 과정",
  },
] as const;

type InkStrokeStyle = CSSProperties & { "--ink-dash"?: number };

export function LearningProcessStudy() {
  const [selected, setSelected] = useState(0);
  const step = PROCESS_STEPS[selected]!;
  const connectorStyle: InkStrokeStyle = { "--ink-dash": 600 };

  return (
    <section
      className="learn-process-study"
      aria-labelledby="learn-process-title"
    >
      <div className="learn-process-heading">
        <div>
          <p className="learn-eyebrow">장면 제작 흐름</p>
          <h2 id="learn-process-title">한 장면이 완성되는 과정</h2>
        </div>
        <p>단계를 선택하고 필요한 실습으로 이어가세요</p>
      </div>
      <figure className="learn-process-art ink-sheen ink-cover">
        <img
          src="/brand/atelier-process.webp"
          alt="같은 장면을 구상 스케치, 선화, 완성 채색으로 펼친 제작 과정 콘셉트 이미지"
          loading="lazy"
          width={1536}
          height={1024}
        />
        <figcaption>제작 과정 콘셉트 아트 · 단계별 표현 비교</figcaption>
      </figure>
      <svg
        className="learn-process-connector"
        viewBox="0 0 640 12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1="6"
          x2="640"
          y2="6"
          className="learn-process-connector__rail"
        />
        <line
          x1="0"
          y1="6"
          x2={selected === 0 ? "214" : selected === 1 ? "427" : "640"}
          y2="6"
          className="learn-process-connector__ink ink-stroke-draw"
          style={connectorStyle}
        />
      </svg>
      <div
        className="learn-process-steps"
        role="group"
        aria-label="제작 과정 살펴보기"
      >
        {PROCESS_STEPS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            <span className="learn-process-count tabular-nums">
              0{index + 1}
            </span>
            <span>
              <small>{item.label}</small>
              <strong>{item.title}</strong>
            </span>
          </button>
        ))}
      </div>
      <div className="learn-process-detail">
        <p aria-live="polite">{step.description}</p>
        <Link className="ink-arrow" to={step.href}>
          {step.action}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
