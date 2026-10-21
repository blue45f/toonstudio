import { useState } from "react";
import type { ReactNode } from "react";

/** 파이프라인 씬의 단계별 상세. 아티팩트 플레이어의 단계 설명을 그대로 옮겼다. */
const PIPELINE_STEPS: { name: string; flow: string; body: ReactNode }[] = [
  { name: "기획", flow: "STORY → ART", body: <><b>Project Brief</b>와 작품 구조를 잡는 단계예요. 장르·로그라인·회차 구성 같은 기획 산출물이 작품 안에 남아서, 이후 모든 단계가 같은 기획을 참조합니다. 기획서가 따로 놀지 않아요.</> },
  { name: "대본", flow: "SCRIPT → PANEL", body: <>회차 대본의 대사와 지문이 <b>컷 단위로 콘티에 연결</b>돼요. 대본에서 고친 대사는 콘티의 말풍선에도 반영되니까, 글과 그림이 서로 다른 버전을 보는 일이 없습니다.</> },
  { name: "콘티", flow: "PANEL → DRAW", body: <>컷 배치와 말풍선을 잡는 단계예요. <b>최대 64개 샷 보드</b>와 컷 단위 편집으로 회차의 호흡을 설계하고, 그대로 드로잉 단계의 밑그림이 됩니다.</> },
  { name: "드로잉", flow: "DRAW · 2D + 3D", body: <><b>WebGPU 드로잉 엔진</b>과 226종 브러시로 작화해요. 3D 배경(테마 팩 42개·에셋 14,665개)을 배치해 구도와 원근을 잡고 그 위에 그리면, 반복 배경 작업이 크게 줄어듭니다.</> },
  { name: "검수", flow: "REVIEW → APPROVE", body: <>역할별 검수와 승인 흐름이 작품 안에 있어요. 피드백이 메신저 캡처로 흩어지지 않고 <b>컷과 원고에 직접 붙어서</b>, 수정 이력과 함께 남습니다.</> },
  { name: "연재 준비", flow: "PUBLISH PACKAGE", body: <>검수를 마친 원고는 <b>Publish Package</b>로 묶어 내보내요. 컷별 합성 렌더와 패키징이 제작 흐름 안에서 이어져서, 연재 업로드 직전의 수작업이 줄어듭니다.</> },
  { name: "운영", flow: "OPERATE · ONGOING", body: <>연재가 시작된 뒤의 단계예요. <b>회차 일정과 게시 상태, 다음 화의 제작 진행</b>을 같은 작품 데이터 안에서 관리합니다. 운영이 다시 엑셀과 메신저로 흩어지지 않아요.</> },
];

export function PipelineWidget() {
  const [step, setStep] = useState(0);
  const current = PIPELINE_STEPS[step];
  return (
    <>
      <div className="pipe-steps rv" role="tablist" aria-label="제작 파이프라인 단계">
        {PIPELINE_STEPS.map((item, index) => (
          <button
            key={item.name}
            className={index === step ? "pipe-step active" : "pipe-step"}
            role="tab"
            aria-selected={index === step}
            type="button"
            onClick={() => setStep(index)}
          >
            <span className="idx">STEP {index + 1}</span>
            <span className="name">{item.name}</span>
          </button>
        ))}
      </div>
      <div className="pipe-detail rv" aria-live="polite">
        <h3>
          <span className="flow">{current.flow}</span>
          {current.name}
        </h3>
        <p>{current.body}</p>
      </div>
    </>
  );
}

