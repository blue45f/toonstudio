import type { ReactNode } from "react";
import { GTM_STEPS } from "./ir-pitch-data";
import { IrInteractiveMoatShowcase } from "./IrInteractiveMoatShowcase";
import { IrDefenseQaAccordion, IrSoloLicenseIntegrityCard } from "./IrQaAndLicenseSection";
import { formatProductTourDuration, formatProductTourTime, PRODUCT_TOUR, productTourChapterById, productTourChapterHref } from "./product-tour-content";

export const SCENE_NODES_B: ReactNode[] = [
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
            <li>지망생 이상 전문 창작자부터 소규모 팀의 제작 자체를 하나로</li>
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
          <div className="t-label">Browser-Native OS · Wasm64</div>
          <h3>설치 없이, 브라우저가 곧 1 GiB 3D 스튜디오</h3>
          <p>Wasm64·OPFS 로컬 처리로 단일 3D 모델 <b>최대 1 GiB(일괄 2 GiB)</b>까지 사용자 기기에서 소화합니다. <b>전문 도구는 설치형, 협업 도구는 브라우저형</b>으로 나뉘어 있던 관성을 하나로 합쳤습니다.</p>
        </article>
        <article className="diff-card rv">
          <div className="t-label">Cleanroom 8 Engines · KM7</div>
          <h3>WebGPU 7밴드 KM 분광 안료 · 클린룸 8종 자체 IP</h3>
          <p>비상업 Mixbox 없이 자체 <b>7밴드 분광 Kubelka-Munk WGSL 엔진</b>을 비롯해 Knuth-Plass 말풍선, 벡터 교차점 지우개, 3D 벡터 강약선, PBD 의상 주름 등 <b>8종을 클린룸 자체 구현</b>했습니다.</p>
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
      <p className="lede rv">커버하는 규모는 넓게 잡되, 표기는 정직하게 구분해요. 지금 실제로 쓸 수 있는 범위와, 지원하도록 설계된 범위, 앞으로 검증할 목표는 서로 다르니까요. 대상은 작가 지망생 이상 전문가와 제작팀입니다. 취미 창작자·일반인은 대상이 아니며, 일반인용은 나중에 별도로 만드는 문제입니다.</p>
      <div className="scale-rows">
        <div className="scale-row rv">
          <span className="s-name">1인 전문 창작자</span>
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
        <article className="deep-card rv">
          <div className="engine-visual" aria-hidden="true" style={{ alignItems: "stretch", height: 110 }}>
            <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 1 }} /><i style={{ flex: 1.6 }} /></div>
            <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 2.2 }} /><i style={{ flex: 1 }} /></div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /></div>
          </div>
          <div className="body">
            <div className="no">DEEP 01 · VIRTUAL STUDIO</div>
            <h3>가상 스튜디오 — 세계관을 무대로</h3>
            <p>작품의 세계관과 공간을 <b>무대로 구성해 장면을 탐색하는 제작 공간</b>이에요. 3D 배경과 카메라로 같은 장소의 여러 구도를 탐색합니다. 사용할 소재는 현재 라이브러리의 제공 상태와 이용 조건을 확인해 선택합니다.</p>
          </div>
        </article>
        <article className="deep-card rv">
          <div className="engine-visual" aria-hidden="true" style={{ height: 110 }}><i style={{ height: "38%" }} /><i style={{ height: "56%" }} /><i style={{ height: "44%" }} /><i style={{ height: "72%" }} /><i style={{ height: "62%" }} /><i style={{ height: "88%" }} /><i style={{ height: "78%" }} /><i style={{ height: "100%" }} /><i style={{ height: "84%" }} /><i style={{ height: "66%" }} /></div>
          <div className="body">
            <div className="no">DEEP 02 · DRAWING ENGINE</div>
            <h3>직접 포팅·패치한 WebGPU(Vello) 드로잉 엔진</h3>
            <p>기본 부품은 검증된 오픈소스를 쓰고, 핵심 기술은 직접 개발했습니다. <b>WebGPU(WGSL) 픽셀 처리 + 직접 포팅·패치한 Vello 벡터 렌더링</b>으로 필압 브러시와 대형 원고 합성을 브라우저에서 처리합니다. 바뀐 영역만 GPU에 올리는 부분 업로드로, 큰 원고에서도 펜이 늦지 않게 따라와요.</p>
          </div>
        </article>
      </div>
      <p className="tour-note rv">이 장면들, 영상으로 바로 볼 수 있어요 —
        <a href={productTourChapterHref(productTourChapterById("draw").start)} target="_blank" rel="noopener" style={{ color: "var(--accent)", fontWeight: 700 }}>드로잉 챕터 ({formatProductTourTime(productTourChapterById("draw").start)})</a> ·
        <a href={productTourChapterHref(productTourChapterById("three-d").start)} target="_blank" rel="noopener" style={{ color: "var(--accent)", fontWeight: 700 }}>3D 장면 챕터 ({formatProductTourTime(productTourChapterById("three-d").start)})</a>
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
            <p><b>캐릭터와 포즈, 배경과 카메라를 3D 장면으로 구성</b>해 구도를 탐색하고, 그 결과를 현재 컷의 2D 제작에 활용합니다. 인물은 <b>3D 캐릭터 셰이퍼</b>로 체형과 포즈를 조정하며, 사용할 모델과 프리셋의 준비 상태는 제품에서 확인합니다.</p>
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
      <p className="lede rv" style={{ marginBottom: 26 }}>제작 시점의 제품 화면과 개념 도해를 담은 <strong>{formatProductTourDuration(PRODUCT_TOUR.duration, "ko")} 전체 제품 투어</strong>입니다. 챕터를 누르면 그 장면부터 새 탭으로 열려, 확인 후 발표 화면으로 돌아와 이어갈 수 있어요.</p>
      <div className="split wide-right" style={{ alignItems: "start" }}>
        <div className="rv">
          <div className="shot-frame">
            <div className="frame-bar"><i /><i /><i /><span className="frame-url">toonstudio.cloud/product-tour</span></div>
            <a className="tour-feature" href={productTourChapterHref(productTourChapterById("overview").start)} target="_blank" rel="noopener" aria-label="ToonStudio 전체 제품 투어 영상, 처음부터 열기">
              <img src="/brand/product-tour/01-overview.png" alt="ToonStudio 실제 제품 화면 — 아이디어부터 연재 원고까지 이어지는 웹툰 작업 공간 홈" width="1440" height="1000" />
              <span className="play-overlay">
                <span className="play-circle"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg></span>
                <span className="tour-badge">전체 제품 투어 · {formatProductTourDuration(PRODUCT_TOUR.duration, "ko")}<small>{PRODUCT_TOUR.chapters.length}개 챕터 · 제품 화면과 개념 도해</small></span>
              </span>
            </a>
          </div>
          <p className="shot-caption"><b>제품 투어</b> — 제작 시점의 제품 화면이며, {PRODUCT_TOUR.chapters.flatMap((chapter, index) => chapter.visual === "concept" ? [`CH.${index + 1}`] : []).join("·")}은 기능 구성을 설명하는 개념 도해입니다.</p>
        </div>
        <div className="chapter-list rv">
          {PRODUCT_TOUR.chapters.map((chapter, index) => (
            <a className="chapter-row" key={chapter.id} href={productTourChapterHref(chapter.start)} target="_blank" rel="noopener">
              <span className="no">CH.{index + 1}</span>
              <span className="t">{chapter.ko}<small>{chapter.feature.ko}{chapter.visual === "concept" ? " · 개념 도해" : ""}</small></span>
              <span className="time">{formatProductTourTime(chapter.start)}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  ),
  /* 19 기술 */
  (
    <div className="scene-inner top" key="s19">
      <p className="kicker rv">Technology · Live Proof</p>
      <h2 className="headline rv">브라우저를 얕보지 마세요.<br /><em>핵심 기술은 직접</em> 개발했어요</h2>
      <p className="lede rv">기본 부품은 검증된 오픈소스를 쓰고, 핵심 기술 8종은 클린룸으로 직접 개발했습니다. 아래 분광 안료 슬라이더를 지금 바로 움직여 <strong>7밴드 KM 물리 혼색(₩0 자체 IP)</strong>과 일반 RGB의 차이를 확인해 보세요.</p>
      <div className="tech-grid">
        <article className="tech-card rv">
          <div className="t-label">Vector · Spectral Engine</div>
          <h3>WebGPU(Vello) + 7밴드 KM 분광 안료</h3>
          <p>드로잉 픽셀 권위는 <b>Raw WebGPU / WGSL</b>, 벡터는 Rust 기반 <b>Vello 웹 포팅</b>이 맡습니다. 420~670nm 7밴드 KM 감산 혼색으로 외부 Mixbox 없이 자체 IP를 확보했습니다.</p>
          <div className="chips"><span className="chip">WebGPU · WGSL</span><span className="chip">Vello Port</span><span className="chip">7-Band KM</span><span className="chip">클린룸 8종</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Wasm64 · Local First</div>
          <h3>Wasm64 1 GiB 로컬 3D · OPFS 보관 분리</h3>
          <p>단일 3D 모델 <b>최대 1 GiB(일괄 2 GiB)</b>를 브라우저 로컬에서 처리하고, 서버 HTTP 동기화 상한(12 MiB)과 분리해 GPU 서버비를 없앴습니다. 기기 내 임시 보관과 원본 파일 별도 저장을 명확히 구분합니다.</p>
          <div className="chips"><span className="chip">Wasm64 1 GiB</span><span className="chip">OPFS · IndexedDB</span><span className="chip">서버 GPU ₩0</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Schema · Cross-LLM Ops</div>
          <h3>PostgreSQL 17(0133) · 크로스-LLM 배포 매니페스트</h3>
          <p>저장소 마이그레이션 원장 <b>0001~0133</b>(운영 DB 113/113 체크섬 일치 · 20건 승인 대기)과 <b>DEPLOY_MANIFEST.json</b> 단일 규약으로 모델·도구가 바뀌어도 배포 안정성을 지킵니다.</p>
          <div className="chips"><span className="chip">PG 17 · 0133</span><span className="chip">Cloudflare · onpod ₩0</span><span className="chip">DEPLOY_MANIFEST</span></div>
        </article>
        <article className="tech-card rv">
          <div className="t-label">Commercial License · Collab</div>
          <h3>상용 라이선스 590 감사 통과 · Yjs 실시간 협업</h3>
          <p><b>pnpm audit:licenses 590개 통과</b>·차단 위반 0건(Mixbox·GPL·AGPL·SSPL)·OpenSSF ready를 자동 검증하며, Yjs CRDT 동시 편집과 Rights BOM 출고 검수를 연결했습니다.</p>
          <div className="chips"><span className="chip">590 통과 · 0 차단</span><span className="chip">OpenSSF ready</span><span className="chip">Yjs CRDT</span></div>
        </article>
      </div>
      <div className="rv" style={{ marginTop: 22 }}>
        <IrInteractiveMoatShowcase mode="spectral" surface="present" lang="ko" />
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
          <p>툰스튜디오의 AI는 반복 업무를 줄이는 보조 역할만 해요. 작품의 방향과 표현, 최종 승인, 그리고 권리는 언제나 창작자에게 있습니다. 특정 AI 서비스에 종속되지 않도록 <b>BYOK(내 키 사용)</b>와 <b>로컬 모델</b>도 선택할 수 있게 했어요. 선화에 색을 입히는 <b>AI 자동 채색</b>처럼, 손이 많이 가는 채색 작업도 AI가 돕고 있어요.</p>
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
    <div className="scene-inner top" key="s21">
      <p className="kicker rv">Business Model · Unit Economics</p>
      <h2 className="headline rv">무료로 시작해, 팀으로 확장하고,<br />에셋 마켓까지 <em>이어지는</em> 구조</h2>
      <p className="lede rv">가격 정책은 심플하게, <strong>기본 무료 + AI 크레딧 중심</strong>입니다. 팀 가격은 미정이며 사용 검증 후 정합니다. 적어 둔 유료 가격은 <strong>예시(미확정)</strong>이고, 실제 창작자 검증을 거쳐 정합니다. 서비스도 아직 베타라, 쓰면서 다듬어 가는 중이에요.</p>
      <div className="tiers rv">
        <div className="tier">
          <div className="t-name">Free<small>개인 창작자 누구나</small></div>
          <p>기획부터 드로잉·협업의 핵심 흐름을 무료로 제공해요. AI 기능은 크레딧 범위 안에서 씁니다. 먼저 "흐름이 끊기지 않는 경험"을 만드는 게 목표입니다.</p>
          <div className="price">₩0</div>
        </div>
        <div className="tier hot">
          <div className="t-name">Pro<small>본격 연재 창작자</small></div>
          <p>대용량 원고, 제작 도구와 버전 관리 등 연재 생산성을 높이는 기능을 묶은 개인 유료 플랜을 검토하고 있어요. 유료 전환 시점과 제공 범위는 사용자 검증 후 정합니다.</p>
          <div className="price">월 19,900원<small>유료화 시점 예시 가격 — 미확정, 개인 플랜 예시이며 팀 가격이 아님</small></div>
        </div>
        <div className="tier">
          <div className="t-name">Team · Education<small>스튜디오 · 학원 · 학교</small></div>
          <p>역할 기반 권한, 검수·승인 흐름, 팀 자산 관리를 묶은 조직용 플랜과 교육기관용 플랜을 검토하고 있어요. 팀 가격은 미정이며 사용 검증 후 정합니다.</p>
          <div className="price">미결정<small>팀 가격 미결정 — 사용 검증 후 결정</small></div>
        </div>
        <div className="tier">
          <div className="t-name">Asset Marketplace<small>창작 마켓</small></div>
          <p>브러시·팔레트·템플릿·3D 에셋을 창작자끼리 나누고 거래하는 마켓이에요. 아직 연 게 아니라 향후 계획으로, 리소스마다 라이선스·출처·AI 사용 여부를 명시하는 구조로 준비하고 있습니다.</p>
          <div className="price">향후 계획</div>
        </div>
      </div>
      <div className="money-plan rv">
        <div className="mp-step">
          <span className="mp-tag">베타 검증</span>
          <b>기본 무료 + AI 크레딧</b>
          <p>기본 제작·협업 흐름을 무료로 시작하고, AI는 제공된 크레딧 범위에서 사용합니다. 전문가·제작팀의 실제 사용을 검증합니다.</p>
        </div>
        <div className="mp-arrow" aria-hidden="true">→</div>
        <div className="mp-step hot">
          <span className="mp-tag">사용 검증 이후</span>
          <b>유료 플랜 검토</b>
          <p>개인 Pro 월 19,900원은 예시·미확정이며, 팀 가격은 미정입니다. 유료 전환 시점과 무료 제공 범위는 검증 후 정합니다.</p>
        </div>
      </div>
      <div className="rv" style={{ marginTop: 22 }}>
        <IrInteractiveMoatShowcase mode="economics" surface="present" lang="ko" />
      </div>
    </div>
  ),
  /* 22 검증 로드맵 */
  (
    <div className="scene-inner" key="s22">
      <p className="kicker rv">Roadmap</p>
      <h2 className="headline rv">검증 로드맵 <span className="hypo">전부 목표입니다</span></h2>
      <p className="lede rv">아래 숫자는 성과가 아니라, 앞으로 검증할 계획이에요. 순서대로 가설을 하나씩 확인해 나갑니다. 해외는 번역된 언어 기준으로 심플하게 동시 오픈하는 방향입니다. 걸림돌(국가별 결제·세금·QC·인프라·법규)은 8번 씬의 표를 보고, 유료 기능은 검토가 끝난 언어군부터 엽니다.</p>
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
          <p>Pro 예시 가격(월 19,900원 · 미확정, 개인 플랜 예시이며 팀 가격이 아님)을 실제 결제 의사로 검증하는 유료 검증 기간을 운영해요.</p>
        </div>
      </div>
      <h3 className="sub-head rv" style={{ marginTop: 46 }}>고객 검증 — <em>전문가·제작팀부터</em> 시작합니다</h3>
      <p className="sub-lede rv">실제 제작 흐름과 도입 조건을 확인하고, 사용 근거가 쌓인 뒤 대상과 규모를 넓히는 계획입니다.</p>
      <div className="road-steps rv">
        {GTM_STEPS.map((step, index) => (
          <div className="road-step" key={step.en.title}>
            <div className="when">GTM {index + 1} · 검증 계획</div>
            <div className="gtm-title">{step.ko.title}</div>
            <p>{step.ko.body}</p>
          </div>
        ))}
      </div>
    </div>
  ),
  /* 23 팀 · Ask */
  (
    <div className="scene-inner top" key="s23">
      <p className="kicker rv">Team · Governance &amp; Ask</p>
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
            <span>채용 예정 역할 <b>영업·마케팅 · 고객지원 · 엔지니어 · 도메인 리드 (이름·채용 시기 미확정)</b></span>
          </div>
        </article>
        <div className="ask-card rv">
          <h3>지금 필요한 도움 — Ask</h3>
          <ul className="ask-list">
            <li><span className="n">1</span><div><b>초기 창작자 코호트 연결</b><span>무료 베타 30명 검증에 함께할 웹툰 창작자·스튜디오와의 연결</span></div></li>
            <li><span className="n">2</span><div><b>BM 검증 자문</b><span>Pro 예시 가격과 Team·Education 도입 방식(팀 가격 미결정)에 대한 검증 피드백</span></div></li>
            <li><span className="n">3</span><div><b>콘텐츠 산업 네트워크</b><span>플랫폼·CP·교육기관 등 웹툰 산업 현장과의 접점</span></div></li>
            <li><span className="n">4</span><div><b>후속 투자 자문</b><span>검증 결과 이후의 투자 유치 전략과 준비에 대한 조언</span></div></li>
          </ul>
          <p style={{ marginTop: 16 }}>확정된 투자 제안은 없습니다. 참고용 시드 시나리오 틀(추정치·가정)만 둡니다: 3~5억 원, 배분 개발 40% · 영업·마케팅 30% · AI·인프라 20% · 운영·법무 10%. 이 배분은 사업계획서 시나리오 틀이며, 확정 배분이 아닙니다.</p>
          <div className="ask-actions">
            <a className="btn btn-primary" href="/" target="_blank" rel="noopener">제품 직접 보기</a>
            <a className="btn btn-ghost" href="https://github.com/blue45f/toonstudio" target="_blank" rel="noopener">소스코드 확인하기</a>
          </div>
        </div>
      </div>
      <div className="rv" style={{ marginTop: 20, display: "grid", gap: 16 }}>
        <IrSoloLicenseIntegrityCard surface="present" lang="ko" compact />
        <IrDefenseQaAccordion surface="present" lang="ko" compact />
      </div>
    </div>
  ),
  /* 24 마무리 */
  (
    <div className="scene-inner closing" key="s24">
      <div className="spectrum rv" style={{ width: "min(520px,80%)", margin: "0 auto" }} aria-hidden="true">
        <span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--amber)" }} /><span style={{ background: "var(--amber)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} />
      </div>
      <div className="brand-big rv">Toon<b>Studio</b></div>
      <p className="thanks rv">2조 원대 산업의 빈자리,<br />툰스튜디오가 채우겠습니다.</p>
      <p className="rv">들어주셔서 감사합니다. 질문은 실제 제품 화면으로 바로 보여드리면서 답할게요 — 아래 제품 투어에서 챕터별로 열 수 있습니다.</p>
      <div className="links rv">
        <a className="btn btn-primary" href={productTourChapterHref(productTourChapterById("overview").start)} target="_blank" rel="noopener">제품 투어 영상 열기</a>
        <a className="btn btn-ghost" href="/" target="_blank" rel="noopener">실제 서비스 체험하기</a>
        <a className="btn btn-ghost" href="https://github.com/blue45f/toonstudio" target="_blank" rel="noopener">GitHub 소스코드</a>
      </div>
      <div className="vision rv">
        <div className="v-head"><b>장기 비전 — 웹툰 포털로의 진화</b><span className="v-tag">추진 계획</span></div>
        <p>멀리 보면, <b>네이버·카카오·리디</b> 같은 기존 사업자와의 업무협의를 추진해서 포털·통합 랭킹·자체 연재 플랫폼·교육 정보·커뮤니티를 아우르는 <b>웹툰 포털</b>로 확장하는 그림을 그리고 있어요. 다만 지금 단계의 집중은 끝까지 <b>제작과 협업</b>이고, 제휴는 성사된 게 아니라 추진할 계획으로만 적어 둡니다.</p>
        <div className="v-chips"><span>웹툰 포털</span><span>통합 랭킹</span><span>자체 연재 플랫폼</span><span>교육 정보</span><span>커뮤니티</span></div>
      </div>
      <p className="fineprint rv">기능 설명은 개발 중인 제품의 범위를 안내합니다. 제공 상태·이용 조건은 제품에서 확인하며, 로드맵 숫자는 검증 목표입니다.</p>
    </div>
  ),
];
