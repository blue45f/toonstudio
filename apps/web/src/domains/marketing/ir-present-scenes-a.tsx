import type { ReactNode } from "react";

import { PipelineWidget } from "./ir-present-pipeline-widget";

/**
 * IR 발표 플레이어 씬 콘텐츠 전반(01–12).
 *
 * IrPresentPage.tsx가 800줄 파일 크기 래칫을 넘어(1,304줄) 씬 정의를 분리했다.
 * 씬 구성·문안은 분리 전과 동일하며, 플레이어 상태·조작 로직은 페이지가 맡는다.
 * 파이프라인 씬(04)이 쓰는 단계 상세와 위젯도 이 전반부에 함께 둔다.
 */

export const SCENE_NODES_A: ReactNode[] = [
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
];
