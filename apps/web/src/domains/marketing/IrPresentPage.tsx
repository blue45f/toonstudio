import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useDocumentTitle } from "@/shared/seo/use-document-title";

import "./ir-present-page.css";

/**
 * IR 발표 플레이어 (/ir/present).
 *
 * 발표용 웹 아티팩트로 먼저 만든 24씬 풀스크린 슬라이드 플레이어를 실제 사이트에 이식한 페이지다.
 * 씬 구성·문안·내레이션·배경음은 아티팩트 검증 완료본 그대로이며, 제품 화면 이미지는
 * 제품 투어가 이미 쓰는 /brand/product-tour/ 자산을 재사용한다(중복 업로드 없음).
 * 내레이션 오디오(n01–n24)와 배경음은 아티팩트 제작 때 생성한 AI 음성·음악 파일로,
 * /brand/ir-present/audio/ 아래에 둔다.
 *
 * 조작은 아티팩트와 같다: ←/→ 이동, Space 자동 발표 재생·정지, F 전체화면, M 소리, C 목차,
 * 터치 스와이프. 자동재생 정책 때문에 소리는 첫 상호작용 뒤에 시작한다.
 * 자동 발표 중에는 씬 내레이션이 끝나면 다음 씬으로 넘어가고, 내레이션이 없으면
 * 씬별 체류 시간(dwell)을 쓴다.
 */

const AUDIO_DIR = "/brand/ir-present/audio";
const BGM_BASE_VOLUME = 0.14;
const BGM_DUCK_VOLUME = 0.045;

interface SceneMeta {
  title: string;
  /** 목차에 함께 보이는 씬의 작은 제목(아티팩트의 .kicker 문구). 없으면 null. */
  kicker: string | null;
  audio: string;
  /** 내레이션을 못 쓸 때의 자동 진행 체류 시간(초). */
  dwell: number;
}

const SCENE_META: SceneMeta[] = [
  { title: "표지", kicker: null, audio: "n01.mp3", dwell: 18 },
  { title: "예비 창업 도전자 소개", kicker: "예비 창업 도전자 — 만든 사람부터 소개할게요", audio: "n02.mp3", dwell: 27 },
  { title: "문제 — 끊기는 제작 흐름", kicker: "Problem", audio: "n03.mp3", dwell: 25 },
  { title: "솔루션 — 이어지는 파이프라인", kicker: "Pipeline", audio: "n04.mp3", dwell: 19 },
  { title: "제품 수치", kicker: "Proof in Numbers", audio: "n05.mp3", dwell: 22 },
  { title: "역할별 UX", kicker: "Roles", audio: "n06.mp3", dwell: 20 },
  { title: "시장 — 국내 웹툰 산업", kicker: "Market", audio: "n07.mp3", dwell: 22 },
  { title: "시장 — 글로벌 전망", kicker: "Global Market", audio: "n08.mp3", dwell: 23 },
  { title: "외산 독과점 실태", kicker: "Foreign Monopoly", audio: "n09.mp3", dwell: 25 },
  { title: "파편화 지도", kicker: "Fragmentation Map", audio: "n10.mp3", dwell: 20 },
  { title: "전환 비용", kicker: "Switching Cost", audio: "n11.mp3", dwell: 27 },
  { title: "공정 커버리지 비교", kicker: "Coverage", audio: "n12.mp3", dwell: 20 },
  { title: "크레코와 비교", kicker: "Versus", audio: "n13.mp3", dwell: 24 },
  { title: "차별화", kicker: "Differentiation", audio: "n14.mp3", dwell: 18 },
  { title: "규모별 커버", kicker: "Scale", audio: "n15.mp3", dwell: 22 },
  { title: "제품 심층 ① 무대와 엔진", kicker: "Product Deep Dive · 1/2", audio: "n16.mp3", dwell: 25 },
  { title: "제품 심층 ② 3D와 협업", kicker: "Product Deep Dive · 2/2", audio: "n17.mp3", dwell: 22 },
  { title: "홍보영상 — 제품 투어", kicker: "Product Tour Film", audio: "n18.mp3", dwell: 19 },
  { title: "기술 구조", kicker: "Technology", audio: "n19.mp3", dwell: 24 },
  { title: "Responsible AI", kicker: "Responsible AI", audio: "n20.mp3", dwell: 21 },
  { title: "비즈니스 모델", kicker: "Business Model", audio: "n21.mp3", dwell: 24 },
  { title: "검증 로드맵", kicker: "Roadmap", audio: "n22.mp3", dwell: 38 },
  { title: "팀 · Ask", kicker: "Team & Ask", audio: "n23.mp3", dwell: 22 },
  { title: "마무리", kicker: null, audio: "n24.mp3", dwell: 32 },
];

const TOTAL = SCENE_META.length;

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

function PipelineWidget() {
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

const SCENE_NODES: ReactNode[] = [
  /* 01 표지 */
  (
    <div className="scene-inner" key="s01">
      <div className="cover-grid">
        <div>
          <span className="hero-eyebrow rv"><span className="dot" />베타 — 정식 오픈 전이지만, 지금 브라우저에서 실제로 돌아가고 있어요</span>
          <h1 className="hero-title rv">Toon<span className="accent">Studio</span></h1>
          <p className="hero-slogan rv">웹툰의 기획부터 연재·운영까지,<br />흩어진 제작 도구와 협업 과정을<br />브라우저 하나로 연결합니다.</p>
          <p className="hero-sub rv">대본·콘티·2D 작화·3D 캐릭터와 배경·소재·파일·일정·협업·검수·연재·운영까지 — 작품 하나가 완성되고 계속 연재되는 데 필요한 과정을 설치 없이, 한 흐름으로 이은 올인원 웹툰 제작 스튜디오예요.</p>
          <div className="hero-actions rv">
            <button className="btn btn-primary js-start" type="button">발표 시작하기
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
            </button>
            <a className="btn btn-ghost" href="/" target="_blank" rel="noopener">실제 서비스 열기
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
            </a>
          </div>
          <div className="hero-meta rv">
            <span><b>WebGPU</b> 자체 렌더링 엔진</span>
            <span><b>14,665</b> 배치 가능 3D 에셋</span>
            <span><b>설치 불필요</b> 브라우저 완결</span>
          </div>
        </div>
        <div className="hero-art rv" aria-hidden="true">
          <div className="bubble float-slow">이번 화, 여기서 끝까지 가자!</div>
          <div className="panel panel-a">
            <div className="halftone" />
            <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice">
              <path d="M0 150 L70 92 L128 132 L196 70 L300 128 L300 200 L0 200 Z" fill="#ff5a2c" opacity=".85" />
              <circle cx="238" cy="46" r="24" fill="#ffb03a" />
              <path d="M18 168 h264 M34 182 h180" stroke="#f7f1e8" strokeWidth="3" strokeLinecap="round" opacity=".5" />
            </svg>
          </div>
          <div className="panel panel-b float-slower">
            <svg viewBox="0 0 260 170" preserveAspectRatio="xMidYMid slice">
              <g stroke="#f7f1e8" strokeWidth="3" strokeLinecap="round" opacity=".9">
                <path d="M28 138 V58 l34-22 v102" /><path d="M86 138 V40 l40 18 v80" /><path d="M150 138 V70 l34-14 v82" /><path d="M204 138 V52 l28 16 v70" />
              </g>
              <g fill="#3ec6b8"><rect x="40" y="76" width="10" height="12" /><rect x="100" y="62" width="10" height="12" /><rect x="162" y="88" width="10" height="12" /><rect x="214" y="74" width="9" height="11" /></g>
              <path d="M14 146 h232" stroke="#ff5a2c" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="panel panel-c">
            <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
              <g stroke="#f7f1e8" strokeWidth="4" strokeLinecap="round">
                <path d="M30 118 C90 60 130 130 176 74 S 252 44 272 60" fill="none" />
              </g>
              <g fill="#f7f1e8"><circle cx="52" cy="34" r="3" /><circle cx="88" cy="22" r="2.4" /><circle cx="238" cy="26" r="3" /><circle cx="266" cy="104" r="2.4" /></g>
              <path d="M196 108 l52-14-10 22-16 12z" fill="#ffb03a" />
            </svg>
          </div>
          <svg className="pen-nib float-slow" width="54" height="54" viewBox="0 0 48 48"><path d="M38 4 L44 10 L20 34 L10 38 L14 28 Z" fill="#f7f1e8" /><path d="M14 28 L20 34 L10 38 Z" fill="#ff5a2c" /><circle cx="21" cy="27" r="2.6" fill="#131010" /></svg>
        </div>
      </div>
      <div className="spectrum rv" style={{ marginTop: 56 }} aria-hidden="true">
        <span style={{ background: "#ff5a2c" }} /><span style={{ background: "#ff8a3c" }} /><span style={{ background: "#ffb03a" }} /><span style={{ background: "#f5d13d" }} /><span style={{ background: "#8fce4e" }} /><span style={{ background: "#3ec6b8" }} /><span style={{ background: "#3d9be9" }} /><span style={{ background: "#7a6ff0" }} /><span style={{ background: "#c65df0" }} /><span style={{ background: "#f05d8a" }} />
      </div>
    </div>
  ),
  /* 02 예비 창업 도전자 소개 */
  (
    <div className="scene-inner" key="s02">
      <p className="kicker rv">예비 창업 도전자 <span className="scene-no">— 만든 사람부터 소개할게요</span></p>
      <div className="founder-head rv">
        <div className="avatar" aria-hidden="true">HJ</div>
        <div>
          <h2 className="founder-name">김희준</h2>
          <p className="founder-role">예비 창업 도전자 · 개발 경력 18년</p>
          <span className="trust-badge"><span className="dot" />모두의 창업 1라운드 선정<small>창업 지원 프로그램</small></span>
        </div>
      </div>
      <p className="lede rv" style={{ marginBottom: 0 }}>대규모 서비스의 프론트엔드 아키텍처를 설계하고 이끌어 온 개발자예요. 지금은 기획·디자인·개발·3D 파이프라인까지, 툰스튜디오 전 영역을 직접 설계하고 구현하고 있습니다.</p>
      <div className="career rv">
        <div className="career-row">
          <span className="co">배달의민족<small>우아한형제들</small></span>
          <p className="c-desc"><b>주문·결제·장바구니 핵심 아키텍처 설계·리드</b> — 국내 최초 애플페이 결제 연동 리드, 레거시→React 전환으로 번들 70% 감소·성능 30% 개선</p>
        </div>
        <div className="career-row">
          <span className="co">스마일게이트 스토브<small>Smilegate STOVE</small></span>
          <p className="c-desc"><b>웹서비스개발팀 팀장</b> — 10명 팀 리딩, STOVE 플랫폼 프론트엔드 총괄</p>
        </div>
        <div className="career-row">
          <span className="co">삼쩜삼<small>자비스앤빌런즈</small></span>
          <p className="c-desc"><b>Tax그룹 FE 챕터 리드</b></p>
        </div>
        <div className="career-row">
          <span className="co">카카오<small>Kakao</small></span>
          <p className="c-desc"><b>메일파트</b> — 다음 메일 프론트엔드 개발</p>
        </div>
        <div className="career-row">
          <span className="co">엔씨소프트<small>NCSOFT</small></span>
          <p className="c-desc"><b>모바일퍼블리싱플랫폼실</b> — 모바일 플랫폼 개발</p>
        </div>
      </div>
      <div className="founder-foot rv">
        <span>공개 소스코드 <b>github.com/blue45f/toonstudio</b></span>
        <span>베타 공개 중 <b>toonstudio.cloud</b></span>
        <span>포트폴리오 <b>heejun.cloud</b></span>
      </div>
    </div>
  ),
  /* 03 문제 */
  (
    <div className="scene-inner" key="s03">
      <p className="kicker rv">Problem</p>
      <h2 className="headline rv">웹툰 만들기, 도구가 없어서<br />힘든 게 <em>아니에요</em></h2>
      <p className="lede rv">기획은 문서 앱에서, 그림은 그림 앱에서, 얘기는 메신저로. 작품 하나 만들 때마다 창작자가 흐름을 알아서 이어 붙여야 해요. 문제는 거기서 생깁니다.</p>
      <div className="problems rv">
        <div className="problem">
          <span className="no">01</span>
          <h3>도구의 파편화</h3>
          <p>기획·대본·콘티·작화가 저마다 다른 프로그램과 파일 형식에 흩어져 있어요. 단계가 바뀔 때마다 내보내고, 변환하고, 다시 올리고 — 그리는 시간보다 파일 챙기는 시간이 늘어납니다.</p>
        </div>
        <div className="problem">
          <span className="no">02</span>
          <h3>협업의 손실</h3>
          <p>글작가와 그림작가, 어시스턴트와 프로듀서가 같은 작품을 보면서도 서로 다른 버전을 봐요. 피드백은 메신저 캡처로 흩어지고, "최종_진짜최종" 파일이 쌓입니다.</p>
        </div>
        <div className="problem">
          <span className="no">03</span>
          <h3>연재의 리스크</h3>
          <p>마감은 매주 돌아오는데 일정·검수·게시 상태는 머릿속에만 있어요. 한 단계만 밀려도 연재 전체가 흔들리고, 결국 휴재와 퀄리티 저하로 이어지거든요.</p>
        </div>
      </div>
      <p className="core-message rv">문제는 <span>기능 부족</span>이 아니에요.<br />흐름이 끊기는 거예요.</p>
    </div>
  ),
  /* 04 파이프라인 */
  (
    <div className="scene-inner top" key="s04">
      <p className="kicker rv">Pipeline</p>
      <h2 className="headline rv">그래서, <em>흐름부터</em> 붙였습니다</h2>
      <p className="lede rv">일곱 단계를 눌러보세요. 앞 단계에서 만든 게 다음 단계 입력으로 그대로 넘어가니까, 파일을 들고 옮길 일이 없어요. 연재가 시작된 뒤의 운영까지 같은 흐름 안에 있습니다.</p>
      <PipelineWidget />
      <figure className="rv" style={{ margin: "22px 0 0" }}>
        <div className="shot-frame">
          <div className="frame-bar"><i /><i /><i /><span className="frame-url">toonstudio.cloud/studio — 실제 제품 화면</span></div>
          <img src="/brand/product-tour/03-draw.png" alt="ToonStudio 드로잉 스튜디오 실제 제품 화면 — 캔버스와 브러시·레이어 패널" width="1440" height="1000" loading="lazy" />
        </div>
        <figcaption className="shot-caption"><b>실제 제품 화면</b> — 드로잉 스튜디오. 파이프라인의 드로잉 단계가 이 화면 그대로 브라우저에서 돌아갑니다.</figcaption>
      </figure>
    </div>
  ),
  /* 05 제품 수치 */
  (
    <div className="scene-inner" key="s05">
      <p className="kicker rv">Proof in Numbers</p>
      <h2 className="headline rv">말로만 그러면 안 되니까,<br /><em>숫자</em>로 보여드릴게요</h2>
      <p className="lede rv">전부 계획이 아니라, 지금 서비스에 실제로 연결돼서 쓸 수 있는 것들이에요.</p>
      <div className="stats rv">
        <div className="stat">
          <div className="num"><span data-count="42">42</span><small>개</small></div>
          <div className="label">bg3d 테마 팩</div>
          <div className="desc">장르·시대·공간별 배경 3D 테마 팩이 스튜디오에 바로 연결돼요.</div>
        </div>
        <div className="stat">
          <div className="num"><span data-count="14665">14,665</span><small>개</small></div>
          <div className="label">배치 가능 3D 에셋</div>
          <div className="desc">배경 씬에 그대로 놓고 구도와 원근을 잡을 수 있는 실제 에셋 수예요.</div>
        </div>
        <div className="stat">
          <div className="num"><span data-count="9">9</span><small>종</small></div>
          <div className="label">배경 프리셋</div>
          <div className="desc">자주 쓰는 배경 구성을 한 번에 불러오는 프리빌트 프리셋이에요.</div>
        </div>
        <div className="stat">
          <div className="num"><span data-count="226">226</span><small>종</small></div>
          <div className="label">브러시 카탈로그</div>
          <div className="desc">기본 G펜부터 질감 브러시까지, 즐겨찾기와 함께 제공되는 드로잉 브러시예요.</div>
        </div>
      </div>
      <p className="stats-note rv">수치는 2026년 10월 21일 실제 서비스 배선 완료 기준입니다. (브러시 카탈로그는 공개 소스코드 기준)</p>
    </div>
  ),
  /* 06 역할별 UX */
  (
    <div className="scene-inner" key="s06">
      <p className="kicker rv">Roles</p>
      <h2 className="headline rv">화면은 역할마다 다르게,<br />작품 정보는 <em>하나로</em></h2>
      <p className="lede rv">같이 일한다고 다 똑같은 화면을 볼 필요는 없어요. 각자 자기 일에만 집중하면 되고, 데이터는 하나로 붙어 있으니까요.</p>
      <div className="roles">
        <article className="role r1 rv">
          <span className="tag">글작가 · 기획자</span>
          <h3>이야기를 구조로 잡는 자리</h3>
          <p>작품 기획서부터 회차 대본까지, 이야기의 뼈대를 작품 안에서 관리해요. 그림 단계에서 대사가 바뀌어도 대본과 컷이 같이 움직입니다.</p>
          <ul>
            <li>Project Brief · 스토리 구조 관리</li>
            <li>대본이 콘티 컷으로 바로 연결</li>
            <li>회차별 진행 상태를 한눈에</li>
          </ul>
        </article>
        <article className="role r2 rv">
          <span className="tag">그림작가 · 어시스턴트</span>
          <h3>그리는 일에만 집중하는 자리</h3>
          <p>WebGPU 드로잉 엔진과 3D 배경 위에서 작화해요. 배경 구도를 3D로 잡고 그 위에 그리면, 반복 배경 작업에 쓰던 시간이 확 줄어듭니다.</p>
          <ul>
            <li>필압 브러시 · 멀티페이지 컷 편집</li>
            <li>3D 배경 배치 후 바로 작화</li>
            <li>말풍선·컷 편집이 원고와 동기화</li>
          </ul>
        </article>
        <article className="role r3 rv">
          <span className="tag">프로듀서</span>
          <h3>연재 전체를 보는 자리</h3>
          <p>작품 단위로 일정·검수·연재 운영 상태를 관리해요. 누가 어느 단계에서 막혀 있는지, 다음 화 게시가 안전한지, 연재가 시작된 뒤에도 작품 안에서 바로 확인합니다.</p>
          <ul>
            <li>역할별 검수와 승인 흐름</li>
            <li>마일스톤·일정 관리</li>
            <li>권리·크레딧·발주 정보까지 한 정본으로</li>
          </ul>
        </article>
      </div>
    </div>
  ),
  /* 07 시장 */
  (
    <div className="scene-inner" key="s07">
      <p className="kicker rv">Market</p>
      <h2 className="headline rv">시장은 이미 커졌어요.<br />도구가 <em>제자리</em>일 뿐</h2>
      <div className="market-hero rv">
        <div>
          <div className="market-big">2조 2,856<small>억 원</small></div>
          <p className="market-caption">국내 웹툰 산업 매출 · 2024년 · 전년 대비 <span>+4.4%</span> 성장</p>
        </div>
        <div className="market-side">
          <div className="market-stat"><span className="v">49.5<small>%</small></span><span className="k"><b>수출 1위 지역 · 일본</b>국내 웹툰 수출에서 일본이 차지하는 비중</span></div>
          <div className="market-stat"><span className="v">21.0<small>%</small></span><span className="k"><b>수출 2위 지역 · 북미</b>글로벌 확장이 계속되는 두 번째 시장</span></div>
        </div>
      </div>
      <p className="lede rv" style={{ marginTop: 30, marginBottom: 0 }}>산업 규모는 이미 증명됐어요. 남은 질문은 딱 하나, 그 작품들을 만드는 현장의 도구입니다. <strong>성장한 산업에 맞는 제작 인프라가 비어 있는 자리</strong> — 툰스튜디오가 거기 들어갑니다.</p>
      <p className="source-line rv">출처: 문화체육관광부 · 한국콘텐츠진흥원 「2025 웹툰산업 실태조사」 (국내 매출 및 수출 지역 비중)</p>
    </div>
  ),
  /* 08 글로벌 시장 */
  (
    <div className="scene-inner" key="s08">
      <p className="kicker rv">Global Market</p>
      <h2 className="headline rv">해외로 보면,<br /><em>성장 속도</em>가 다릅니다</h2>
      <div className="global-grid rv">
        <div className="g-stat">
          <div className="v">약 102<small>억 달러</small></div>
          <div className="k"><b>글로벌 웹툰 시장 · 2024년</b>국내를 넘어 세계 시장 전체로 본 웹툰 산업의 현재 규모예요.</div>
        </div>
        <div className="g-stat">
          <div className="v">약 427억~453<small>억 달러</small></div>
          <div className="k"><b>2030년 전망</b>조사기관별 추정치의 범위로, 6년 사이 네 배 이상 성장이 전망돼요.</div>
        </div>
        <div className="g-stat">
          <div className="v">약 27<small>%</small></div>
          <div className="k"><b>연평균 성장률 (CAGR)</b>콘텐츠 산업에서 보기 드문 속도로 시장 자체가 커지고 있어요.</div>
        </div>
      </div>
      <div className="growth-visual rv" aria-hidden="true" style={{ marginBottom: 34 }}>
        <div className="bar dim" style={{ height: "23%" }}><span>약 102억 달러</span><b>2024년</b></div>
        <div className="bar" style={{ height: "100%" }}><span>약 427억~453억 달러</span><b>2030년 전망</b></div>
      </div>
      <p className="source-line rv">글로벌 전망은 조사기관마다 추정치가 다릅니다 — Research and Markets 약 451.7억 달러, Grand View Research 약 453억 달러, Global Industry Analysts 약 427억 달러 (모두 2030년 전망). 특정 기관의 단일 수치가 아니라 범위로 표기했습니다.</p>
    </div>
  ),
  /* 09 외산 독과점 */
  (
    <div className="scene-inner top" key="s09">
      <p className="kicker rv">Foreign Monopoly</p>
      <h2 className="headline rv">그런데 이 산업의 제작 도구 코어는<br /><em>전부 외산</em>입니다</h2>
      <p className="lede rv">웹툰은 한국이 만든 산업이에요. 그런데 그 작품들을 실제로 그리는 표준 도구는 일본산이, 이미지 편집의 표준은 미국산이 쥐고 있습니다. 대표 사례가 일본 셀시스(Celsys)의 <strong>클립스튜디오 페인트</strong>예요.</p>
      <div className="core-panel rv">
        <p><b>클립스튜디오 페인트</b>는 전 세계 누적 이용 5,000만 부를 넘긴, 사실상 전 세계 만화·웹툰 제작의 표준 도구예요. 구독 전환 이후에는 매달 구독료가 쌓이는 구조가 됐고, 창작자의 브러시 설정·단축키·작업 파일이 그 안에 쌓일수록 다른 도구로 옮기기 어려워지는 <b>구독 잠금(lock-in)</b>이 강해집니다. 포토샵(미국 어도비)도 같은 구조로 이미지 편집 코어를 점유하고 있어요.</p>
        <div className="core-stats">
          <div className="core-stat"><div className="v">5,000만<small>부+</small></div><div className="k">전 세계 누적 이용 (2025년 4월 셀시스 공식 발표)</div></div>
          <div className="core-stat"><div className="v">46억<small>엔+</small></div><div className="k">구독 매출 ARR — 매달 쌓이는 반복 매출 규모</div></div>
          <div className="core-stat"><div className="v">11<small>개 언어</small></div><div className="k">전 세계 동시 서비스 언어 수</div></div>
          <div className="core-stat"><div className="v">80<small>%+</small></div><div className="k">일본 밖 해외 사용자 비중 — 한국 창작자도 이 안에 포함됩니다</div></div>
        </div>
        <p style={{ marginTop: 20 }}>국산 도구가 없는 건 아니에요. 다만 지금까지의 국산 시도는 <b>협업(크레코)</b>·<b>소재(에이콘3D)</b>처럼 제작의 주변 영역에서 나왔고, 기획부터 작화·3D·검수까지 잇는 <b>통합 제작 코어</b>는 비어 있습니다. 툰스튜디오는 바로 그 빈 코어를 국산으로 채우려는 시도예요.</p>
        <div className="estimate-note"><b>구조 산정 표기</b> — 국내 웹툰 제작의 전문 드로잉 코어는 사실상 전량 외산으로, 국산 점유율은 0%에 수렴합니다. 공식 통계가 아니라 구조에서 산정한 값이에요: 현장의 표준 도구인 클립스튜디오(일본)·포토샵(미국)·프로크리에이트(호주)·메디방 페인트·이비스페인트(일본)가 전부 외산이고, 국산 전문 드로잉 도구가 부재합니다. 제작 도구에 대한 공식 점유율 통계는 존재하지 않아, 단일 제품의 점유율 수치는 만들지 않았습니다.</div>
      </div>
      <p className="source-line rv">출처: 셀시스 공식 발표 (2025.04.10, 누적 이용·구독 ARR·언어·해외 비중)</p>
    </div>
  ),
  /* 10 파편화 지도 */
  (
    <div className="scene-inner top" key="s10">
      <p className="kicker rv">Fragmentation Map</p>
      <h2 className="headline rv">현장에서 실제로 오가는<br /><em>도구들</em>을 펼쳐보면</h2>
      <p className="lede rv">과장이 아니라 지금 웹툰 제작 현장의 실제 도구 구성이에요. 카테고리마다 세계적인 강자가 있는데, 문제는 그 강자들이 <strong>서로 연결돼 있지 않다</strong>는 데 있습니다.</p>
      <div className="frag-grid">
        <article className="frag-card rv">
          <div className="f-cat">Drawing</div>
          <h3>전문 드로잉</h3>
          <div className="frag-tools">
            <span>클립스튜디오 페인트<small>일본 셀시스</small></span>
            <span>포토샵<small>미국 어도비</small></span>
            <span>프로크리에이트<small>호주</small></span>
            <span>메디방 페인트<small>일본</small></span>
            <span>이비스페인트<small>일본</small></span>
          </div>
          <p>선화·채색·식자의 본진이에요. 작화 품질은 세계 표준이지만 브러시·소재·작업 파일이 <b>각 앱 안에 갇혀</b> 있어서, 단계가 바뀔 때마다 내보내기가 시작됩니다. 이 카테고리의 표준 도구는 전부 외산이에요.</p>
        </article>
        <article className="frag-card rv">
          <div className="f-cat">3D Background</div>
          <h3>3D 배경 · 소재</h3>
          <div className="frag-tools">
            <span>스케치업<small>미국</small></span>
            <span className="kr">에이콘3D<small>국산 · 카펜스트리트</small></span>
            <span>블렌더<small>오픈소스</small></span>
            <span>클립스튜디오 에셋<small>일본</small></span>
          </div>
          <p>배경 모델을 사거나 직접 만들어 각도를 잡고, <b>이미지로 렌더링한 뒤에야</b> 드로잉 앱으로 가져올 수 있어요. 구도를 바꾸고 싶으면 렌더링부터 다시 해야 합니다.</p>
        </article>
        <article className="frag-card rv">
          <div className="f-cat">Pose · Shaper</div>
          <h3>3D 포즈 · 셰이퍼</h3>
          <div className="frag-tools">
            <span>Design Doll<small>일본</small></span>
            <span>Magic Poser<small>미국</small></span>
            <span>PoseIt<small>이탈리아</small></span>
          </div>
          <p>어려운 포즈와 체형은 별도 앱에서 3D 인형을 돌려 <b>캡처 이미지로</b> 가져와요. 포즈를 고치려면 앱을 오가며 다시 캡처해야 하고, 캡처본은 원고와 연결되지 않습니다.</p>
        </article>
        <article className="frag-card rv">
          <div className="f-cat">Reference</div>
          <h3>레퍼런스</h3>
          <div className="frag-tools">
            <span>PureRef<small>스웨덴</small></span>
            <span>핀터레스트<small>미국</small></span>
          </div>
          <p>참고 이미지는 작품 파일 밖에 따로 떠 있어요. 어떤 컷을 위한 참고였는지, 출처와 라이선스가 뭔지는 <b>창작자의 기억에만</b> 남습니다.</p>
        </article>
        <article className="frag-card rv">
          <div className="f-cat">AI Assist</div>
          <h3>AI 보조</h3>
          <div className="frag-tools">
            <span>이미지 생성 AI</span>
            <span>텍스트 생성 AI</span>
            <span>업스케일 · 보정 AI</span>
          </div>
          <p>생성형 AI는 강력하지만 <b>작품의 문맥 밖에</b> 있어요. 어떤 컷에, 왜, 어떤 프롬프트로 만들었는지 남지 않고, 결과물을 다시 작품 파일로 들고 와야 합니다.</p>
        </article>
        <article className="frag-card rv">
          <div className="f-cat">Collaboration</div>
          <h3>협업 · 관리</h3>
          <div className="frag-tools">
            <span className="kr">크레코 CRECO<small>국산 · 넥스트레벨스튜디오</small></span>
            <span>디스코드</span>
            <span>카카오톡</span>
            <span>구글 드라이브</span>
            <span>노션</span>
            <span>엑셀</span>
          </div>
          <p>피드백은 메신저로, 파일은 드라이브로, 일정은 엑셀로 굴러가요. 작품 자체가 아니라 <b>작품에 대한 이야기만</b> 여러 곳에 흩어지고, 최종본이 뭔지는 매번 다시 확인해야 합니다.</p>
        </article>
      </div>
    </div>
  ),
  /* 11 전환 비용 */
  (
    <div className="scene-inner" key="s11">
      <p className="kicker rv">Switching Cost</p>
      <h2 className="headline rv">한 화 만드는 과정을<br /><em>따라가 볼까요?</em></h2>
      <div className="switch-cost rv">
        <span className="route">기획 문서 → 대본 파일 → 콘티 → 3D 배경 렌더 → 포즈 캡처 → 선화·채색 → AI 보정 → 메신저 피드백 → 드라이브 업로드</span>
        한 회차의 여정이 이래요. 단계마다 앱이 바뀌고, 파일은 내보내기·변환·재업로드를 반복합니다. 이 <b>전환 비용</b>은 한 번이 아니라 매주, 매 회차 돌아와요. 도구가 나빠서가 아니라, 도구가 <b>흩어져 있어서</b> 생기는 비용입니다.
      </div>
      <p className="pos-closing rv">툰스튜디오는 이 아홉 단계를,<br /><span>한 번의 흐름</span>으로 줄이는 일부터 시작했어요.</p>
    </div>
  ),
  /* 12 공정 커버리지 */
  (
    <div className="scene-inner top" key="s12">
      <p className="kicker rv">Coverage</p>
      <h2 className="headline rv">공정별로 나란히 놓으면<br /><em>차이</em>가 확실해요</h2>
      <div className="pos-rows">
        <div className="pos-row me rv">
          <div className="head"><span className="name">ToonStudio</span><span className="desc">기획부터 연재·운영까지 전 공정을 하나의 작업 흐름으로 통합</span></div>
          <div className="coverage"><span className="full">기획</span><span className="full">대본</span><span className="full">콘티</span><span className="full">드로잉</span><span className="full">3D 배경</span><span className="full">협업</span><span className="full">검수</span><span className="full">연재 준비</span><span className="full">운영</span></div>
        </div>
        <div className="pos-row rv">
          <div className="head"><span className="name">클립스튜디오 등 드로잉 특화 앱</span><span className="desc">작화 품질과 브러시·소재 생태계는 세계 표준이에요. 다만 기획·협업·연재 관리는 앱 밖의 일입니다</span></div>
          <div className="coverage"><span>기획</span><span>대본</span><span className="part">콘티</span><span className="full">드로잉</span><span>3D 배경</span><span>협업</span><span>검수</span><span>연재 준비</span><span>운영</span></div>
        </div>
        <div className="pos-row rv">
          <div className="head"><span className="name">크레코(CRECO) · 웹툰 협업 플랫폼</span><span className="desc">다른 도구로 만든 결과물을 모아 버전·피드백·권한을 관리하는 협업 허브예요. 제작 도구 자체는 포함하지 않습니다</span></div>
          <div className="coverage"><span className="part">기획</span><span className="part">대본</span><span className="part">콘티</span><span>드로잉</span><span>3D 배경</span><span className="full">협업</span><span className="full">검수</span><span className="part">연재 준비</span><span className="part">운영</span></div>
        </div>
        <div className="pos-row rv">
          <div className="head"><span className="name">노션 · 드라이브 · 메신저 조합</span><span className="desc">문서와 소통, 파일 보관에는 강해요. 하지만 원고·컷·3D 배경 같은 제작 산출물 자체는 다루지 못합니다</span></div>
          <div className="coverage"><span className="full">기획</span><span>대본</span><span>콘티</span><span>드로잉</span><span>3D 배경</span><span className="full">협업</span><span className="part">검수</span><span>연재 준비</span><span className="part">운영</span></div>
        </div>
        <div className="pos-row rv">
          <div className="head"><span className="name">플랫폼 제공 도구</span><span className="desc">자사 플랫폼 연재 규격에는 최적화돼 있어요. 대신 그 플랫폼 안에서만 쓸 수 있습니다</span></div>
          <div className="coverage"><span>기획</span><span>대본</span><span>콘티</span><span className="part">드로잉</span><span>3D 배경</span><span>협업</span><span className="part">검수</span><span className="full">연재 준비</span><span className="full">운영</span></div>
        </div>
      </div>
      <div className="pos-legend rv">
        <span><i style={{ background: "var(--accent)" }} />공정 안에서 제공</span>
        <span><i style={{ background: "rgba(255,176,58,.5)" }} />부분 제공 · 보조 수준</span>
        <span><i style={{ background: "rgba(255,238,224,.12)" }} />범위 밖 (외부 도구 필요)</span>
      </div>
    </div>
  ),
  /* 13 크레코 비교 */
  (
    <div className="scene-inner" key="s13">
      <p className="kicker rv">Versus</p>
      <h2 className="headline rv">가장 가까운 경쟁자와<br /><em>정면으로</em> 비교하면</h2>
      <p className="lede rv">국내에서 툰스튜디오와 가장 가까운 자리에 있는 제품은 크레코예요. 같은 문제를 보고 있지만, 푸는 위치가 정반대입니다.</p>
      <div className="versus">
        <article className="vs-card rv">
          <div className="v-axis">Collaboration Hub</div>
          <h3>크레코 (CRECO)</h3>
          <p>웹툰 제작사 <b>넥스트레벨스튜디오</b>가 자사 제작 현장에서 3년간 다듬어 <b>2026년 9월 정식 오픈</b>한 협업 플랫폼이에요. 클로즈드 베타에서 국내 대형 제작사들의 검증을 거쳤고, 그 완성도는 저희도 인정합니다.</p>
          <p>강점은 <b>결과물 관리</b>예요. 각자의 앱에서 만든 파일을 프로젝트-에피소드-공정-버전 체계로 모으고, 뷰어 피드백·비교 뷰어·권한·활동 로그로 협업을 정리합니다.</p>
          <ul>
            <li>협업의 위치 — 제작 도구의 <b>바깥</b>, 결과물을 모으는 허브</li>
            <li>그리기·3D 구성 같은 제작 도구 자체는 범위 밖</li>
            <li>대형 스튜디오의 다작품 운영 관리에 검증됨</li>
          </ul>
        </article>
        <article className="vs-card me rv">
          <div className="v-axis">Integrated Production OS</div>
          <h3>ToonStudio</h3>
          <p>협업을 별도 허브에 두지 않고 <b>제작 도구 안에 내장</b>한 통합 제작 OS예요. 기획·대본·콘티·드로잉·3D가 하나의 작품 데이터 위에서 일어나니까, 버전과 피드백이 파일이 아니라 <b>컷과 공정에 직접</b> 붙습니다.</p>
          <p>파일을 모을 필요가 없는 이유는, 파일이 처음부터 밖으로 나가지 않기 때문이에요. 협업은 결과물이 만들어지는 바로 그 자리에서 일어납니다.</p>
          <ul>
            <li>협업의 위치 — 제작 흐름의 <b>안</b>, 도구 자체에 내장</li>
            <li>드로잉 엔진·3D 배경·AI 보조까지 제작 도구 포함</li>
            <li>개인 창작자부터 소규모 팀의 제작 자체를 하나로</li>
          </ul>
        </article>
      </div>
      <p className="source-line rv">크레코 정보 출처: 넥스트레벨스튜디오 공식 발표 및 2026년 9월 정식 오픈 보도 (프로젝트-에피소드-공정-버전 체계, 뷰어 피드백, 비교 모드, 권한·활동 로그, 클로즈드 베타 참여 제작사 검증)</p>
    </div>
  ),
  /* 14 차별화 */
  (
    <div className="scene-inner" key="s14">
      <p className="kicker rv">Differentiation</p>
      <h2 className="headline rv">차별점은 기능 개수가 아니라<br /><em>조합</em>이에요</h2>
      <p className="lede rv">브라우저에서 도는 협업 도구는 많고, 설치해서 쓰는 전문 드로잉 앱도 많아요. 그런데 <strong>브라우저 안에서 전문급 드로잉과 전 공정 통합이 함께 도는 제작 환경</strong>은 비어 있었습니다. 툰스튜디오는 스스로를 "브라우저 기반 통합 제작 OS"로 정의하고, 그 빈 조합을 채워요.</p>
      <div className="diff-grid">
        <article className="diff-card rv">
          <div className="t-label">Browser-Native OS</div>
          <h3>설치 없이, 브라우저가 곧 스튜디오</h3>
          <p>앱을 설치하고 파일을 주고받는 구조가 아니에요. 브라우저 탭 하나로 기획·대본·콘티·드로잉·3D·협업·검수가 열리고, 기기가 바뀌어도 같은 작품이 이어집니다. <b>전문 도구는 설치형, 협업 도구는 브라우저형</b>으로 나뉘어 있던 관성을 하나로 합친 시도예요.</p>
        </article>
        <article className="diff-card rv">
          <div className="t-label">Professional Drawing</div>
          <h3>브러시 226종 + 자체 WebGPU 스트로크 렌더링</h3>
          <p>브라우저라고 얕은 드로잉이 아니에요. G펜부터 질감 브러시까지 <b>226종 브러시 카탈로그</b>와 자체 <b>WebGPU(WGSL) 스트로크 렌더링</b>으로 필압과 스트로크의 질감을 브라우저에서 직접 처리합니다. "웹에서 도는 가벼운 그림판"이 아니라, 전문 작화를 전제로 만든 엔진이에요.</p>
        </article>
        <article className="diff-card rv">
          <div className="t-label">Structured Production</div>
          <h3>프로젝트-회차-공정-담당-승인, 분업의 체계</h3>
          <p>작품은 파일 더미가 아니라 <b>프로젝트 → 회차 → 공정 → 담당 → 승인</b>으로 이어지는 데이터 체계로 관리돼요. 누가 어느 공정을 맡아 어디까지 왔고 누가 승인했는지가 구조 안에 남아서, 분업이 커져도 최종본과 책임 소재가 흐려지지 않습니다.</p>
        </article>
        <article className="diff-card rv">
          <div className="t-label">All-in-One Collaboration</div>
          <h3>만드는 자리에서 바로 일어나는 협업</h3>
          <p>협업이 제작과 분리되지 않아요. <b>실시간 동시 편집(Yjs CRDT)</b>, 컷에 붙는 피드백, 역할별 검수·승인이 그리는 바로 그 자리에서 일어납니다. 결과물을 따로 모아 관리하는 허브가 아니라, 만들어지는 과정 자체가 협업이에요.</p>
        </article>
      </div>
    </div>
  ),
  /* 15 규모별 커버 */
  (
    <div className="scene-inner" key="s15">
      <p className="kicker rv">Scale</p>
      <h2 className="headline rv">1인 제작부터 스튜디오까지 —<br />규모가 달라도 <em>같은 구조</em></h2>
      <p className="lede rv">커버하는 규모는 넓게 잡되, 표기는 정직하게 구분해요. 지금 실제로 쓸 수 있는 범위와, 지원하도록 설계된 범위, 앞으로 검증할 목표는 서로 다르니까요.</p>
      <div className="scale-rows">
        <div className="scale-row rv">
          <span className="s-name">1인 창작자</span>
          <p>기획부터 연재·운영까지 혼자서도 전 공정을 오갈 수 있어요. 도구를 오가는 전환 비용이 사라지는 게 가장 먼저 체감되는 규모입니다.</p>
          <span className="tags"><span className="status-tag now">현재 제공</span></span>
        </div>
        <div className="scale-row rv">
          <span className="s-name">소규모 팀</span>
          <p>글작가·그림작가·어시스턴트가 같은 작품 데이터 위에서 분업해요. 담당 지정과 검수·승인이 공정에 붙어서, 메신저와 파일명으로 조율하던 일이 구조 안으로 들어옵니다.</p>
          <span className="tags"><span className="status-tag now">현재 제공</span></span>
        </div>
        <div className="scale-row rv">
          <span className="s-name">대규모 스튜디오</span>
          <p>다작품·다공정 라인을 굴리는 운영 구조까지 지원하도록 권한·승인 체계를 설계했어요. 다만 대규모 스튜디오 현장에서의 실사용 검증은 아직 마치지 않았습니다 — 그래서 "검증됨"이 아니라 아래처럼 나눠 표기합니다.</p>
          <span className="tags"><span className="status-tag design">지원 설계</span><span className="status-tag goal">실사용 검증은 목표</span></span>
        </div>
      </div>
    </div>
  ),
  /* 16 제품 심층 ① */
  (
    <div className="scene-inner" key="s16">
      <p className="kicker rv">Product Deep Dive · 1/2</p>
      <h2 className="headline rv">소개가 아니라,<br /><em>실제로 구현된 것</em>들입니다</h2>
      <div className="deep-grid">
        <article className="deep-card text-only rv">
          <div className="engine-visual" aria-hidden="true" style={{ alignItems: "stretch", height: 110 }}>
            <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 1 }} /><i style={{ flex: 1.6 }} /></div>
            <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 2.2 }} /><i style={{ flex: 1 }} /></div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /></div>
          </div>
          <div className="body">
            <div className="no">DEEP 01 · VIRTUAL STUDIO</div>
            <h3>가상 스튜디오 — 세계관을 무대로</h3>
            <p>작품의 세계관과 공간을 <b>무대로 구성해 장면을 탐색하는 제작 공간</b>이에요. 클래식 2D 무대 위에 3D 배경(bg3d — 테마 팩 42개 · 배치 가능 에셋 14,665개 · 프리셋 9종)을 올려서, 같은 장소를 여러 각도에서 반복해 쓸 수 있습니다. 배경을 매번 새로 그리는 대신, 무대를 세우고 카메라를 움직이는 거예요.</p>
          </div>
        </article>
        <article className="deep-card text-only rv">
          <div className="engine-visual" aria-hidden="true" style={{ height: 110 }}><i style={{ height: "38%" }} /><i style={{ height: "56%" }} /><i style={{ height: "44%" }} /><i style={{ height: "72%" }} /><i style={{ height: "62%" }} /><i style={{ height: "88%" }} /><i style={{ height: "78%" }} /><i style={{ height: "100%" }} /><i style={{ height: "84%" }} /><i style={{ height: "66%" }} /></div>
          <div className="body">
            <div className="no">DEEP 02 · DRAWING ENGINE</div>
            <h3>자체 WebGPU 드로잉 엔진</h3>
            <p>캔버스를 남의 라이브러리에 맡기지 않았어요. <b>WebGPU(WGSL) 픽셀 엔진 + Vello 벡터 포팅</b>으로 필압 브러시와 대형 원고 합성을 브라우저에서 처리합니다. 바뀐 영역만 GPU에 올리는 부분 업로드로, 큰 원고에서도 펜이 늦지 않게 따라와요.</p>
          </div>
        </article>
      </div>
      <p className="tour-note rv">이 장면들, 영상으로 바로 볼 수 있어요 —
        <a href="/product-tour?t=108#product-tour-video" target="_blank" rel="noopener" style={{ color: "var(--accent)", fontWeight: 700 }}>드로잉 챕터 (1:48)</a> ·
        <a href="/product-tour?t=228#product-tour-video" target="_blank" rel="noopener" style={{ color: "var(--accent)", fontWeight: 700 }}>3D 장면 챕터 (3:48)</a>
        <span style={{ color: "var(--muted)" }}>(새 탭으로 열려서, 발표 화면은 그대로 유지됩니다)</span>
      </p>
    </div>
  ),
  /* 17 제품 심층 ② */
  (
    <div className="scene-inner" key="s17">
      <p className="kicker rv">Product Deep Dive · 2/2</p>
      <h2 className="headline rv">구도는 3D로 잡고,<br />협업은 <em>작품 안에</em> 남겨요</h2>
      <div className="deep-grid">
        <article className="deep-card rv">
          <div className="thumb"><img src="/brand/product-tour/05-3d.png" alt="캐릭터·포즈·3D 장면 실제 제품 화면" loading="lazy" width="1440" height="1000" style={{ objectPosition: "bottom right" }} /></div>
          <div className="body">
            <div className="no">DEEP 03 · CHARACTER · POSE · 3D</div>
            <h3>구도는 3D로 탐색하고, 제작은 2D로</h3>
            <p>어려운 구도는 감으로 그리지 않아요. <b>캐릭터와 포즈, 배경과 카메라를 3D 장면으로 구성</b>해서 구도를 먼저 확정하고, 그 결과를 현재 컷의 2D 제작으로 연결합니다. 캐릭터 셰이퍼의 15개 슬롯 프리셋으로 인물 구성도 빠르게 잡아요.</p>
          </div>
        </article>
        <article className="deep-card rv">
          <div className="thumb"><img src="/brand/product-tour/07-production.png" alt="협업·검토 실제 제품 화면 — 프로젝트와 제작 상태 관리" loading="lazy" width="1440" height="1000" /></div>
          <div className="body">
            <div className="no">DEEP 04 · COLLABORATION</div>
            <h3>실시간 협업, 그리고 남는 승인 이력</h3>
            <p><b>Yjs CRDT</b>로 같은 원고를 동시에 편집하고, 담당자·제작 상태·수정 요청·변경 이력과 <b>역할별 검수·승인</b>이 작업물에 그대로 붙어요. "누가, 언제, 무엇을 승인했는지"가 메신저가 아니라 작품 안에 남습니다.</p>
          </div>
        </article>
      </div>
      <p className="tour-note rv">이어서 실제 제품 영상으로 바로 보여드릴게요 — 다음 씬에서 투어가 열립니다.</p>
    </div>
  ),
  /* 18 홍보영상 — 제품 투어 */
  (
    <div className="scene-inner top" key="s18">
      <p className="kicker rv">Product Tour Film</p>
      <h2 className="headline rv">말로 설명한 다음엔,<br /><em>실제 화면</em>으로 보여드립니다</h2>
      <p className="lede rv" style={{ marginBottom: 26 }}>실제 제품 화면 캡처로 만든 <strong>8분 전체 제품 투어</strong>가 이미 서비스 안에 있어요. 챕터를 누르면 그 장면부터 바로 열립니다. 투어는 새 탭으로 열리니까, 보고 나서 이 발표 화면으로 돌아와 그대로 이어가면 돼요.</p>
      <div className="split wide-right" style={{ alignItems: "start" }}>
        <div className="rv">
          <div className="shot-frame">
            <div className="frame-bar"><i /><i /><i /><span className="frame-url">toonstudio.cloud/product-tour</span></div>
            <a className="tour-feature" href="/product-tour?t=48#product-tour-video" target="_blank" rel="noopener" aria-label="ToonStudio 전체 제품 투어 영상, 기획 챕터부터 열기">
              <img src="/brand/product-tour/01-overview.png" alt="ToonStudio 실제 제품 화면 — 아이디어부터 연재 원고까지 이어지는 웹툰 작업 공간 홈" width="1440" height="1000" />
              <span className="play-overlay">
                <span className="play-circle"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg></span>
                <span className="tour-badge">전체 제품 투어 · 8분<small>실제 제품 화면 캡처 9개 챕터 + 24초 브랜드 필름</small></span>
              </span>
            </a>
          </div>
          <p className="shot-caption"><b>실제 제품 투어</b> — 챕터 이미지는 전부 실제 제품 화면 캡처예요 (CH.4만 기능 구성을 설명하는 개념 도해).</p>
        </div>
        <div className="chapter-list rv">
          <a className="chapter-row" href="/product-tour?t=0#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.1</span><span className="t">툰스튜디오는 무엇인가<small>기획부터 연재·운영까지, 하나의 작품 흐름</small></span><span className="time">0:00</span></a>
          <a className="chapter-row" href="/product-tour?t=48#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.2</span><span className="t">아이디어와 기획<small>세계관·인물·회차와 장면 목적 정리</small></span><span className="time">0:48</span></a>
          <a className="chapter-row" href="/product-tour?t=108#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.3</span><span className="t">드로잉과 브러시<small>캔버스·브러시·레이어·질감·보정</small></span><span className="time">1:48</span></a>
          <a className="chapter-row" href="/product-tour?t=174#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.4</span><span className="t">컷과 말풍선<small>컷 분할·대사·말풍선과 장면 리듬 (개념 도해)</small></span><span className="time">2:54</span></a>
          <a className="chapter-row" href="/product-tour?t=228#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.5</span><span className="t">캐릭터·포즈·3D 장면<small>포즈·배경·카메라 구성 후 2D로 연결</small></span><span className="time">3:48</span></a>
          <a className="chapter-row" href="/product-tour?t=300#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.6</span><span className="t">AI 보조와 반복 작업<small>검토와 최종 선택은 창작자가 유지</small></span><span className="time">5:00</span></a>
          <a className="chapter-row" href="/product-tour?t=354#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.7</span><span className="t">프로젝트·협업·검토<small>담당자·상태·수정 요청·변경 이력</small></span><span className="time">5:54</span></a>
          <a className="chapter-row" href="/product-tour?t=420#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.8</span><span className="t">학습·소재·사운드<small>강좌·레퍼런스·소재 마켓·오디오</small></span><span className="time">7:00</span></a>
          <a className="chapter-row" href="/product-tour?t=468#product-tour-video" target="_blank" rel="noopener"><span className="no">CH.9</span><span className="t">검사·내보내기·게시 준비<small>규격 확인부터 게시 준비까지</small></span><span className="time">7:48</span></a>
        </div>
      </div>
    </div>
  ),
  /* 19 기술 */
  (
    <div className="scene-inner" key="s19">
      <p className="kicker rv">Technology</p>
      <h2 className="headline rv">브라우저를 얕보지 마세요.<br /><em>엔진부터 직접</em> 만들었어요</h2>
      <p className="lede rv">캔버스 라이브러리를 가져다 붙인 게 아니에요. 문서·명령·히스토리·협업은 렌더러에 종속되지 않는 정본 모델이 권위를 갖고, 그 아래 렌더링 엔진들을 역할별로 조합하는 <strong>하이브리드 엔진 구조</strong>입니다.</p>
      <div className="tech-grid">
        <article className="tech-card rv">
          <div className="t-label">Vector Engine</div>
          <h3>자체 WebGPU 벡터 렌더링 엔진</h3>
          <p>드로잉의 픽셀 권위는 <b>Raw WebGPU / WGSL</b>이 쥐어요. 벡터 렌더링은 Rust 기반 <b>Vello를 웹으로 포팅</b>한 provider가 맡고, 엔진들은 문서 모델 아래에서 교체 가능한 단위로 조합됩니다. 지원하지 않는 조합은 조용히 뭉개지 않고 제출 전에 차단(fail-closed)해요.</p>
          <div className="chips"><span className="chip">WebGPU · WGSL</span><span className="chip">Vello Port</span><span className="chip">RGBA16F Tiles</span><span className="chip">Dirty-rect Upload</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Precision Rendering</div>
          <h3>CanvasKit · Skia</h3>
          <p>정밀한 벡터·패스·텍스트와 인쇄 품질 렌더링은 <b>CanvasKit(Skia)</b>이 맡아요. 화면용 엔진과 출판용 기준 엔진을 나눠서, 확대해도 깨지지 않는 선과 정확한 색을 지킵니다.</p>
          <div className="chips"><span className="chip">CanvasKit WASM</span><span className="chip">Vector · Text · PDF</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Local First</div>
          <h3>로컬 우선 저장 — OPFS · IndexedDB</h3>
          <p>원고는 먼저 내 기기에 저장돼요. <b>OPFS와 IndexedDB</b> 기반 원자적 저장·복구로 네트워크가 끊겨도 작업이 날아가지 않고, <b>SHA-256 무결성 검증</b>을 거쳐 기기 간 아카이브로 안전하게 옮길 수 있습니다.</p>
          <div className="chips"><span className="chip">OPFS</span><span className="chip">IndexedDB Atomic Recovery</span><span className="chip">SHA-256</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Realtime Collaboration</div>
          <h3>Yjs 실시간 협업</h3>
          <p>동시 편집의 정합성은 <b>바이너리 CRDT의 CRC 검증</b>과 revision 충돌 방지가 지켜요. 여럿이 동시에 만져도 원고가 손상되지 않게 설계했고, 선택형 P2P 음성 작업실(최대 6인)도 같은 협업 흐름 위에 있습니다.</p>
          <div className="chips"><span className="chip">Yjs · CRDT</span><span className="chip">CRC Verified</span><span className="chip">P2P Voice (opt-in)</span></div>
        </article>
      </div>
    </div>
  ),
  /* 20 Responsible AI */
  (
    <div className="scene-inner" key="s20">
      <p className="kicker rv">Responsible AI</p>
      <div className="ai-card rv">
        <div>
          <div className="t-label">Responsible AI</div>
          <h3>AI는 조수예요.<br />작가는 사람이 결정합니다</h3>
          <p>툰스튜디오의 AI는 반복 업무를 줄이는 보조 역할만 해요. 작품의 방향과 표현, 최종 승인, 그리고 권리는 언제나 창작자에게 있습니다. 특정 AI 서비스에 종속되지 않도록 <b>BYOK(내 키 사용)</b>와 <b>로컬 모델</b>도 선택할 수 있게 했어요.</p>
        </div>
        <ul className="ai-rules">
          <li><span className="mark">1</span><span><b>AI의 자리</b> — 배경 정리, 소재 추천, 반복 편집 같은 보조 업무까지만</span></li>
          <li><span className="mark">2</span><span><b>사람의 결정</b> — 방향·표현·승인·권리는 창작자가 최종 결정</span></li>
          <li><span className="mark">3</span><span><b>선택의 자유</b> — BYOK와 로컬 모델 지원, 기기 안에서 처리하는 기능은 업로드 없이 동작</span></li>
          <li><span className="mark">4</span><span><b>투명한 표기</b> — 소재와 리소스마다 라이선스·출처·AI 사용 여부를 명시</span></li>
        </ul>
      </div>
    </div>
  ),
  /* 21 BM */
  (
    <div className="scene-inner" key="s21">
      <p className="kicker rv">Business Model</p>
      <h2 className="headline rv">무료로 시작해, 팀으로 확장하고,<br />에셋 마켓까지 <em>이어지는</em> 구조</h2>
      <p className="lede rv">요금제는 아직 확정된 게 아니에요. 적어 둔 가격은 <strong>전부 예시(미확정)</strong>이고, 실제 창작자 검증을 거쳐 정합니다. 서비스도 아직 베타라, 쓰면서 다듬어 가는 중이에요.</p>
      <div className="tiers rv">
        <div className="tier">
          <div className="t-name">Free<small>개인 창작자 누구나</small></div>
          <p>기획부터 드로잉·협업의 핵심 흐름을 무료로 제공해요. 먼저 "흐름이 끊기지 않는 경험"을 만드는 게 목표입니다.</p>
          <div className="price">₩0</div>
        </div>
        <div className="tier hot">
          <div className="t-name">Pro<small>본격 연재 창작자</small></div>
          <p>대용량 원고, 고급 브러시·3D 에셋, 버전 관리 등 연재 생산성을 높이는 기능을 묶은 개인 유료 플랜이에요. 회원 1만 명 달성 이후, 유료화 시점에 켭니다.</p>
          <div className="price">월 19,900원<small>유료화 시점 예시 가격 — 미확정</small></div>
        </div>
        <div className="tier">
          <div className="t-name">Team · Education<small>스튜디오 · 학원 · 학교</small></div>
          <p>역할 기반 권한, 검수·승인 흐름, 팀 자산 관리를 묶은 조직용 플랜과 교육기관용 플랜을 준비 중이에요.</p>
          <div className="price">도입 문의</div>
        </div>
        <div className="tier">
          <div className="t-name">Asset Marketplace<small>창작 마켓</small></div>
          <p>브러시·팔레트·템플릿·3D 에셋을 창작자끼리 나누고 거래하는 마켓이에요. 아직 연 게 아니라 향후 계획으로, 리소스마다 라이선스·출처·AI 사용 여부를 명시하는 구조로 준비하고 있습니다.</p>
          <div className="price">향후 계획</div>
        </div>
      </div>
      <div className="money-plan rv">
        <div className="mp-step">
          <span className="mp-tag">지금 ~ 회원 1만 명</span>
          <b>전 기능 무료 운영</b>
          <p>사용자를 모으는 게 먼저예요. 회원 1만 명을 달성할 때까지는 모든 기능을 무료로 엽니다.</p>
        </div>
        <div className="mp-arrow" aria-hidden="true">→</div>
        <div className="mp-step hot">
          <span className="mp-tag">회원 1만 명 달성 이후</span>
          <b>유료화 전환</b>
          <p>그때부터 Pro 같은 유료 플랜을 켜요. 월 19,900원은 그 시점의 예시 가격이고, 아직 확정은 아닙니다.</p>
        </div>
      </div>
    </div>
  ),
  /* 22 검증 로드맵 */
  (
    <div className="scene-inner" key="s22">
      <p className="kicker rv">Roadmap</p>
      <h2 className="headline rv">검증 로드맵 <span className="hypo">전부 목표입니다</span></h2>
      <p className="lede rv">아래 숫자는 성과가 아니라, 앞으로 검증할 계획이에요. 순서대로 가설을 하나씩 확인해 나갑니다.</p>
      <div className="road-steps rv">
        <div className="road-step">
          <div className="when">PHASE 1</div>
          <div className="goal-num">30<small>명</small><span className="goal-tag">목표</span></div>
          <p>무료 베타 창작자 코호트를 모아서, 실제 연재 제작에 툰스튜디오를 끝까지 써 보게 해요.</p>
        </div>
        <div className="road-step">
          <div className="when">PHASE 2</div>
          <div className="goal-num">10<small>명+</small><span className="goal-tag">목표</span></div>
          <p>베타 참여자 심층 인터뷰로 "흐름이 끊기는 지점"이 실제로 사라졌는지 확인하고 우선순위를 다시 잡아요.</p>
        </div>
        <div className="road-step">
          <div className="when">PHASE 3</div>
          <div className="goal-num">3–6<small>개월</small><span className="goal-tag">목표</span></div>
          <p>Pro 예시 가격(월 19,900원 · 미확정)을 실제 결제 의사로 검증하는 유료 검증 기간을 운영해요.</p>
        </div>
      </div>
      <h3 className="sub-head rv" style={{ marginTop: 46 }}>고객 확보 — <em>어떻게 1만 명까지</em> 갈 것인가</h3>
      <p className="sub-lede rv">수익화 단계와 맞물려 있어요. 무료 기간에는 확보에 집중하고, 고객층은 작은 곳에서 큰 곳으로 단계적으로 넓힙니다.</p>
      <div className="road-steps rv">
        <div className="road-step">
          <div className="when">GTM 1 · 확보 엔진</div>
          <div className="gtm-title">온라인 커뮤니티에서 작가 확보</div>
          <p>투자 이후 웹툰·만화 온라인 커뮤니티와 네이버 카페 같은 온라인 채널을 중심으로 홍보해 작가 회원을 모아요. 전 기능 무료 기간이라, 써보는 데 장벽이 없는 것 자체가 확보 엔진입니다.</p>
        </div>
        <div className="road-step">
          <div className="when">GTM 2 · 장기 고객</div>
          <div className="gtm-title">학원 · 교육기관</div>
          <p>학원과 교육기관을 대상으로 도입을 넓혀요. 배우는 단계에서 손에 익은 도구는 현업까지 이어지니까, 길게 함께 가는 고객층이 됩니다.</p>
        </div>
        <div className="road-step">
          <div className="when">GTM 3 · 점진적 확장</div>
          <div className="gtm-title">작은 팀에서 큰 스튜디오로</div>
          <p>소규모 아마추어 팀에서 시작해 사용 검증이 쌓이면 대형 스튜디오로 고객층을 넓혀요. 규모별 지원 구조도 그 순서에 맞춰 짜여 있습니다.</p>
        </div>
      </div>
    </div>
  ),
  /* 23 팀 · Ask */
  (
    <div className="scene-inner" key="s23">
      <p className="kicker rv">Team &amp; Ask</p>
      <h2 className="headline rv">만든 사람이, 끝까지<br /><em>설명할 수 있는</em> 제품이에요</h2>
      <div className="team-grid">
        <article className="founder rv">
          <div className="avatar">HJ</div>
          <h3>김희준</h3>
          <p className="role-line">예비 창업 도전자 · 1인 개발자</p>
          <p>기획·디자인·프론트엔드·백엔드·3D 파이프라인까지, 툰스튜디오의 전 영역을 직접 설계하고 구현해 왔어요. 빠르게 만드는 것보다, 창작자의 실제 제작 흐름을 끝까지 따라가며 검증하는 방식을 택했습니다.</p>
          <div className="facts">
            <span>개발 경험 <b>18년</b></span>
            <span>주요 경력 <b>배달의민족 · 스마일게이트 스토브 · 삼쩜삼 · 카카오 · 엔씨소프트</b></span>
            <span>공개 소스코드 <b>github.com/blue45f/toonstudio</b></span>
            <span>베타 공개 중 <b>toonstudio.cloud</b></span>
          </div>
        </article>
        <div className="ask-card rv">
          <h3>지금 필요한 도움 — Ask</h3>
          <ul className="ask-list">
            <li><span className="n">1</span><div><b>초기 창작자 코호트 연결</b><span>무료 베타 30명 검증에 함께할 웹툰 창작자·스튜디오와의 연결</span></div></li>
            <li><span className="n">2</span><div><b>BM 검증 자문</b><span>Pro 예시 가격과 Team·Education 도입 방식에 대한 검증 피드백</span></div></li>
            <li><span className="n">3</span><div><b>콘텐츠 산업 네트워크</b><span>플랫폼·CP·교육기관 등 웹툰 산업 현장과의 접점</span></div></li>
            <li><span className="n">4</span><div><b>후속 투자 자문</b><span>검증 결과 이후의 투자 유치 전략과 준비에 대한 조언</span></div></li>
          </ul>
          <div className="ask-actions">
            <a className="btn btn-primary" href="/" target="_blank" rel="noopener">제품 직접 보기</a>
            <a className="btn btn-ghost" href="https://github.com/blue45f/toonstudio" target="_blank" rel="noopener">소스코드 확인하기</a>
          </div>
        </div>
      </div>
    </div>
  ),
  /* 24 마무리 */
  (
    <div className="scene-inner closing" key="s24">
      <div className="spectrum rv" style={{ width: "min(520px,80%)", margin: "0 auto" }} aria-hidden="true">
        <span style={{ background: "#ff5a2c" }} /><span style={{ background: "#ff8a3c" }} /><span style={{ background: "#ffb03a" }} /><span style={{ background: "#f5d13d" }} /><span style={{ background: "#8fce4e" }} /><span style={{ background: "#3ec6b8" }} /><span style={{ background: "#3d9be9" }} /><span style={{ background: "#7a6ff0" }} /><span style={{ background: "#c65df0" }} /><span style={{ background: "#f05d8a" }} />
      </div>
      <div className="brand-big rv">Toon<b>Studio</b></div>
      <p className="thanks rv">2조 원대 산업의 빈자리,<br />툰스튜디오가 채우겠습니다.</p>
      <p className="rv">들어주셔서 감사합니다. 질문은 실제 제품 화면으로 바로 보여드리면서 답할게요 — 아래 제품 투어에서 챕터별로 열 수 있습니다.</p>
      <div className="links rv">
        <a className="btn btn-primary" href="/product-tour?t=48#product-tour-video" target="_blank" rel="noopener">제품 투어 영상 열기</a>
        <a className="btn btn-ghost" href="/" target="_blank" rel="noopener">실제 서비스 체험하기</a>
        <a className="btn btn-ghost" href="https://github.com/blue45f/toonstudio" target="_blank" rel="noopener">GitHub 소스코드</a>
      </div>
      <div className="vision rv">
        <div className="v-head"><b>장기 비전 — 웹툰 포털로의 진화</b><span className="v-tag">추진 계획</span></div>
        <p>멀리 보면, <b>네이버·카카오·리디</b> 같은 기존 사업자와의 업무협의를 추진해서 포털·통합 랭킹·자체 연재 플랫폼·교육 정보·커뮤니티를 아우르는 <b>웹툰 포털</b>로 확장하는 그림을 그리고 있어요. 다만 지금 단계의 집중은 끝까지 <b>제작과 협업</b>이고, 제휴는 성사된 게 아니라 추진할 계획으로만 적어 둡니다.</p>
        <div className="v-chips"><span>웹툰 포털</span><span>통합 랭킹</span><span>자체 연재 플랫폼</span><span>교육 정보</span><span>커뮤니티</span></div>
      </div>
      <p className="fineprint rv">이 발표의 제품 수치·기능 설명은 실제 서비스와 공개 소스코드 기준이며, 로드맵 숫자는 전부 검증 목표입니다.</p>
    </div>
  ),
];

export function IrPresentPage() {
  useDocumentTitle("툰스튜디오 IR · 발표 플레이어");

  const [idx, setIdx] = useState(() => {
    const match = (window.location.hash || "").match(/s=(\d+)/);
    if (match) return Math.max(0, Math.min(TOTAL - 1, parseInt(match[1], 10) - 1));
    return 0;
  });
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [soundMode, setSoundMode] = useState<"on" | "narr" | "off">("on");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [toastState, setToastState] = useState<{ id: number; msg: string } | null>(null);
  const [backward, setBackward] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const narrRef = useRef<HTMLAudioElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const idxRef = useRef(idx);
  const playingRef = useRef(false);
  const soundOnRef = useRef(true);
  const unlockedRef = useRef(false);
  const gapTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const narrFailedRef = useRef<Set<number>>(new Set());
  const narrSrcRef = useRef("");
  const countedRef = useRef(new WeakSet<Element>());
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const dwellMs = (i: number) => (SCENE_META[i]?.dwell ?? 15) * 1000;

  const showToast = (msg: string, ms = 2600) => {
    setToastState({ id: Date.now(), msg });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastState(null), ms);
  };

  const duck = (on: boolean) => {
    if (bgmRef.current) bgmRef.current.volume = on ? BGM_DUCK_VOLUME : BGM_BASE_VOLUME;
  };

  const unlockAudio = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    if (soundOnRef.current) {
      const p = bgmRef.current?.play();
      if (p) p.catch(() => {});
    }
  };

  const clearGap = () => {
    if (gapTimerRef.current) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  };

  const scheduleAdvance = (ms: number) => {
    clearGap();
    gapTimerRef.current = window.setTimeout(() => {
      if (!playingRef.current) return;
      if (idxRef.current < TOTAL - 1) {
        setIdx(idxRef.current + 1);
      } else {
        playingRef.current = false;
        setPlaying(false);
        duck(false);
        if (soundOnRef.current) setSoundMode("on");
        showToast("발표가 끝났습니다 — 수고하셨습니다");
      }
    }, ms);
  };

  const playSceneAudio = () => {
    clearGap();
    const i = idxRef.current;
    const narr = narrRef.current;
    if (!soundOnRef.current || !narr || narrFailedRef.current.has(i)) {
      scheduleAdvance(dwellMs(i));
      return;
    }
    const src = `${AUDIO_DIR}/${SCENE_META[i].audio}`;
    if (narrSrcRef.current !== src) {
      narr.src = src;
      narrSrcRef.current = src;
    }
    narr.currentTime = 0;
    const p = narr.play();
    if (p) p.catch(() => { if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current)); });
  };

  const applyPlaying = (on: boolean) => {
    playingRef.current = on;
    setPlaying(on);
    if (on) {
      unlockAudio();
      playSceneAudio();
    } else {
      narrRef.current?.pause();
      clearGap();
      duck(false);
      if (soundOnRef.current) setSoundMode("on");
    }
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(TOTAL - 1, next));
    setBackward(clamped < idxRef.current);
    setIdx(clamped);
  };

  const step = (d: number) => {
    const target = idxRef.current + d;
    if (target < 0 || target >= TOTAL) return;
    goTo(target);
  };

  const applySound = (on: boolean) => {
    soundOnRef.current = on;
    setSoundOn(on);
    if (!on) {
      narrRef.current?.pause();
      bgmRef.current?.pause();
      duck(false);
      setSoundMode("off");
      if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current));
    } else {
      setSoundMode("on");
      if (unlockedRef.current) {
        const p = bgmRef.current?.play();
        if (p) p.catch(() => {});
      }
      if (playingRef.current) playSceneAudio();
    }
  };

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else {
        const p = stageRef.current?.requestFullscreen();
        if (p) p.catch(() => showToast("이 브라우저에서는 전체화면이 제한됩니다"));
      }
    } catch {
      showToast("이 브라우저에서는 전체화면이 제한됩니다");
    }
  };

  /* 씬이 바뀔 때마다: 해시 동기화, 등장 애니메이션·카운터 실행, 오디오 후속 처리(아티팩트 goTo와 동일). */
  useEffect(() => {
    idxRef.current = idx;
    try {
      window.history.replaceState(null, "", `#s=${idx + 1}`);
    } catch {
      /* 해시를 쓸 수 없는 환경에서는 발표를 계속한다. */
    }
    const root = stageRef.current;
    const active = root?.querySelector(".scene.active");
    if (active) {
      active.scrollTop = 0;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timers: number[] = [];
      active.querySelectorAll(".rv").forEach((el, i) => {
        if (el.classList.contains("in")) return;
        if (reduced) {
          el.classList.add("in");
          return;
        }
        timers.push(window.setTimeout(() => el.classList.add("in"), Math.min(i * 70, 840)));
      });
      active.querySelectorAll("[data-count]").forEach((el) => {
        if (countedRef.current.has(el)) return;
        countedRef.current.add(el);
        const target = parseInt(el.getAttribute("data-count") ?? "0", 10);
        const fmt = (n: number) => n.toLocaleString("en-US");
        if (reduced) {
          el.textContent = fmt(target);
          return;
        }
        el.textContent = "0";
        const dur = 1300;
        let t0: number | null = null;
        const tick = (ts: number) => {
          if (!t0) t0 = ts;
          const progress = Math.min((ts - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = fmt(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    return undefined;
  }, [idx]);

  /* 재생 중 씬 이동이면 새 씬 내레이션을 걸고, 아니면 내레이션을 멈춘다. */
  useEffect(() => {
    if (playingRef.current) playSceneAudio();
    else {
      narrRef.current?.pause();
      clearGap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  /* 배경음 초기 볼륨, 본문 스크롤 잠금, 오디오 잠금 해제(첫 상호작용), 시작 안내 토스트. */
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = BGM_BASE_VOLUME;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    const introTimer = window.setTimeout(() => {
      if (!playingRef.current && window.innerWidth > 720) {
        showToast("← → 이동 · Space 자동 발표 · F 전체화면 · M 소리 · C 목차", 4200);
      }
    }, 900);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.clearTimeout(introTimer);
      clearGap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 단축키 — 아티팩트와 같은 키 배치. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = event.key;
      if (k === " " || k === "Spacebar") {
        event.preventDefault();
        if (!chaptersOpen) applyPlaying(!playingRef.current);
      } else if (k === "ArrowRight" || k === "PageDown") {
        event.preventDefault();
        unlockAudio();
        step(1);
      } else if (k === "ArrowLeft" || k === "PageUp") {
        event.preventDefault();
        unlockAudio();
        step(-1);
      } else if (k === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (k === "End") {
        event.preventDefault();
        goTo(TOTAL - 1);
      } else if (k === "f" || k === "F") {
        toggleFullscreen();
      } else if (k === "m" || k === "M") {
        unlockAudio();
        const next = !soundOnRef.current;
        applySound(next);
        showToast(next ? "소리를 켰습니다" : "소리를 껐습니다 (M)");
      } else if (k === "c" || k === "C") {
        setChaptersOpen((open) => !open);
      } else if (k === "Escape" && chaptersOpen) {
        setChaptersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaptersOpen]);

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".js-start")) {
      unlockAudio();
      applyPlaying(true);
      showToast("자동 발표를 시작합니다 — Space로 언제든 멈출 수 있어요");
    }
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchRef.current = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      unlockAudio();
      step(dx < 0 ? 1 : -1);
    }
  };

  const meta = SCENE_META[idx];

  return (
    <div className="ir-present">
      <div className="stage" ref={stageRef} onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="progress-top" aria-hidden="true">
          <div className="segments">
            {SCENE_META.map((sceneMeta, i) => (
              <button
                key={sceneMeta.title}
                type="button"
                aria-label={`${i + 1}번 씬 — ${sceneMeta.title}`}
                className={i < idx ? "done" : i === idx ? "now" : undefined}
                onClick={(event) => { unlockAudio(); goTo(i); event.currentTarget.blur(); }}
              />
            ))}
          </div>
        </div>

        <main className="scenes">
          {SCENE_NODES.map((node, i) => (
            <section key={SCENE_META[i].title} className={i === idx ? `scene active${backward ? " from-left" : ""}` : "scene"}>
              {node}
            </section>
          ))}
        </main>

        <button className="edge-nav edge-prev" type="button" aria-label="이전 씬" disabled={idx === 0} onClick={() => { unlockAudio(); step(-1); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button className="edge-nav edge-next" type="button" aria-label="다음 씬" disabled={idx === TOTAL - 1} onClick={() => { unlockAudio(); step(1); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>

        <div className={toastState ? "toast show" : "toast"} role="status" aria-live="polite">{toastState?.msg ?? ""}</div>

        <footer className="hud">
          <span className="brand">Toon<b>Studio</b></span>
          <button className="hud-btn" type="button" aria-haspopup="dialog" onClick={(event) => { setChaptersOpen((open) => !open); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
            목차
          </button>
          <span className="hud-counter"><b>{idx + 1}</b> / <span>{TOTAL}</span></span>
          <span className="hud-scene">{meta.title}</span>
          <div className="hud-center">
            <button className="hud-btn" type="button" aria-label="이전 씬" disabled={idx === 0} onClick={(event) => { unlockAudio(); step(-1); event.currentTarget.blur(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              이전
            </button>
            <button className="hud-btn primary" type="button" aria-pressed={playing} onClick={(event) => { applyPlaying(!playingRef.current); event.currentTarget.blur(); }}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                {playing ? <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
              </svg>
              <span>{playing ? "정지" : "재생"}</span>
            </button>
            <button className="hud-btn" type="button" aria-label="다음 씬" disabled={idx === TOTAL - 1} onClick={(event) => { unlockAudio(); step(1); event.currentTarget.blur(); }}>
              다음
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <span className={`sound-state ${soundMode}`}><span className="led" /><span className="txt">{soundMode === "narr" ? "내레이션 재생 중" : soundMode === "off" ? "소리 꺼짐" : "소리 켜짐"}</span></span>
          <button className="hud-btn" type="button" aria-pressed={soundOn} aria-label="소리 켜기/끄기 (M)" onClick={(event) => { unlockAudio(); const next = !soundOnRef.current; applySound(next); showToast(next ? "소리를 켰습니다" : "소리를 껐습니다 (M)"); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" /><path className="sw" style={{ display: soundOn ? undefined : "none" }} d="M15.5 8.5a5 5 0 0 1 0 7" /><path className="sw" style={{ display: soundOn ? undefined : "none" }} d="M18 6a8.5 8.5 0 0 1 0 12" /></svg>
            소리
          </button>
          <button className="hud-btn" type="button" aria-label="전체화면 (F)" onClick={(event) => { toggleFullscreen(); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            전체화면
          </button>
          <span className="hud-keys"><b>←</b> <b>→</b> 이동 · <b>Space</b> 재생 · <b>F</b> 전체화면 · <b>M</b> 소리 · <b>C</b> 목차</span>
        </footer>

        <div
          className={chaptersOpen ? "chapters-overlay open" : "chapters-overlay"}
          role="dialog"
          aria-modal="true"
          aria-label="발표 목차"
          onClick={(event) => { if (event.target === event.currentTarget) setChaptersOpen(false); }}
        >
          <div className="chapters-panel">
            <h2>발표 목차</h2>
            <p className="sub">씬을 누르면 바로 그 장면으로 이동합니다. (단축키 C 또는 Esc로 닫기)</p>
            <div className="chapter-grid">
              {SCENE_META.map((sceneMeta, i) => (
                <button
                  key={sceneMeta.title}
                  type="button"
                  className={i === idx ? "chapter-item now" : "chapter-item"}
                  onClick={(event) => { unlockAudio(); setChaptersOpen(false); goTo(i); event.currentTarget.blur(); }}
                >
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="t">{sceneMeta.title}{sceneMeta.kicker ? <small>{sceneMeta.kicker}</small> : null}</span>
                  <span className="dur">약 {sceneMeta.dwell}초</span>
                </button>
              ))}
            </div>
            <div className="chapters-close">
              <button className="btn btn-ghost" type="button" onClick={() => setChaptersOpen(false)}>닫기</button>
            </div>
          </div>
        </div>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Scene narration for the presentation; the same content is shown as on-screen text in every scene. */}
        <audio
          ref={narrRef}
          preload="auto"
          onPlay={() => { duck(true); if (soundOnRef.current) setSoundMode("narr"); }}
          onPause={() => { duck(false); if (soundOnRef.current) setSoundMode("on"); }}
          onEnded={() => {
            duck(false);
            if (soundOnRef.current) setSoundMode("on");
            if (playingRef.current) scheduleAdvance(1700);
          }}
          onError={() => {
            narrFailedRef.current.add(idxRef.current);
            duck(false);
            if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current));
          }}
        />
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Background music only; there is no speech to caption. */}
        <audio ref={bgmRef} src={`${AUDIO_DIR}/bgm.mp3`} loop preload="auto" />
      </div>
    </div>
  );
}
