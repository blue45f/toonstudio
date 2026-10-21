import type { ReactNode } from "react";


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
        <article className="deep-card text-card rv">
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
        <article className="deep-card text-card rv">
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
            <p>어려운 구도는 감으로 그리지 않아요. <b>캐릭터와 포즈, 배경과 카메라를 3D 장면으로 구성</b>해서 구도를 먼저 확정하고, 그 결과를 현재 컷의 2D 제작으로 연결합니다. 인물은 <b>3D 캐릭터 셰이퍼</b>로 체형과 포즈를 직접 조정해 세우고, 15개 슬롯 프리셋으로 구성도 빠르게 잡아요.</p>
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
        <span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--amber)" }} /><span style={{ background: "var(--amber)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--teal)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} /><span style={{ background: "var(--accent)" }} />
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
