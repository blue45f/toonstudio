import { ArrowUpRight, Focus, Lightbulb, Shapes } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

const STUDIES = [
  {
    id: "space",
    code: "01 · 원근 구도",
    label: "공간과 구도",
    icon: Focus,
    query: "architecture",
    detail:
      "시선이 들어오고 머무는 곳. 건축 자료에서 원근과 공간의 리듬을 찾아보세요.",
    panTransform: "scale(1.06) translate3d(2%, 0%, 0)",
    vfX: "58%",
    vfY: "42%",
    vfSx: "1",
    vfSy: "1",
  },
  {
    id: "light",
    code: "02 · 명암 온도",
    label: "빛과 색",
    icon: Lightbulb,
    query: "landscape painting",
    detail:
      "빛을 받는 면과 그림자의 온도. 회화 자료에서 장면의 시간과 감정을 읽어보세요.",
    panTransform: "scale(1.1) translate3d(-3%, 3%, 0)",
    vfX: "18%",
    vfY: "20%",
    vfSx: "1.12",
    vfSy: "0.88",
  },
  {
    id: "object",
    code: "03 · 사물 디테일",
    label: "복식과 소품",
    icon: Shapes,
    query: "costume",
    detail:
      "인물이 살아온 흔적을 남기는 옷과 물건. 재료와 쓰임을 확인하고 웹툰 장면에 설득력을 더하세요.",
    panTransform: "scale(1.12) translate3d(-5%, -4%, 0)",
    vfX: "145%",
    vfY: "86%",
    vfSx: "0.94",
    vfSy: "0.94",
  },
] as const;

type ViewfinderStyle = CSSProperties & {
  "--ink-radius"?: string;
  "--vf-x"?: string;
  "--vf-y"?: string;
  "--vf-sx"?: string;
  "--vf-sy"?: string;
};

/** 안내 일러스트이며 실제 자료의 출처 근거는 제공처 검색 결과에서 확인한다. */
export function ResearchSceneStudy() {
  const [selected, setSelected] = useState(0);
  const study = STUDIES[selected]!;

  const artPanelStyle: ViewfinderStyle = { "--ink-radius": "12px" };
  const reticleStyle: ViewfinderStyle = {
    "--vf-x": study.vfX,
    "--vf-y": study.vfY,
    "--vf-sx": study.vfSx,
    "--vf-sy": study.vfSy,
  };

  return (
    <figure className="research-scene-study">
      <div
        className="research-scene-art ink-sheen"
        data-ink-enter="panel"
        style={artPanelStyle}
      >
        <img
          src="/brand/illustrated-20260928/background-city.webp"
          alt=""
          aria-hidden="true"
          width={1536}
          height={1024}
          style={{ transform: study.panTransform }}
          fetchPriority="high"
        />
        <div
          className={`research-viewfinder research-viewfinder--${study.id}`}
          style={reticleStyle}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
          <span />
          <i className="research-viewfinder__cross" />
          <em className="research-viewfinder__tag tabular-nums">{study.code}</em>
        </div>
        <span className="research-art-label">장면 관찰 예시 · 콘셉트 아트</span>
      </div>
      <figcaption>
        <div
          className="research-study-lenses"
          role="group"
          aria-label="장면 관찰 관점"
        >
          {STUDIES.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                <Icon size={14} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        <p aria-live="polite">{study.detail}</p>
        <Link
          className="ink-arrow"
          to={`/research/assets?q=${encodeURIComponent(study.query)}&page=1`}
        >
          {study.label} 레퍼런스 찾기{" "}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </figcaption>
    </figure>
  );
}
