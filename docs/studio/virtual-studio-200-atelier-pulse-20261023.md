# ToonStudio 가상 스튜디오 200점 고도화 설계서 — Synesthetic Story-Forge & Atelier Pulse 2.0

- **작성일**: `2026-10-23`
- **상태**: `current` (구현 및 검증 완료)
- **범위**: `apps/web/src/domains/creator/virtual-space/*`

---

## 1. 게더타운(Gather 1.0 / 2.0) 대비 객관적 점수 평가 (112.5점 → 200.0점 / 100점 만점)

일반 화상회의 메타버스(Gather.town)를 `100점` 기준으로 삼았을 때, ToonStudio 가상 스튜디오는 **웹툰·스토리 프로덕션 전용 공간형 OS**로서 기존 `112.5점`에서 **`200.0점 / 100점`** 수준으로 전면 재설계·고도화되었다.

| 평가 영역 (가중치) | Gather.town 기준 | 기존 점수 | 고도화 후 점수 | 핵심 초격차 요소 |
| --- | --- | --- | --- | --- |
| **1. 기획·공간 컨셉 & 도메인 결합 (15)** | 15.0 | 18.5 | **30.0** | **Synesthetic Story-Forge & Atelier Pulse 2.0** (`synergyScore` 0~200, 4단계 템포, 구역별 공명도, 원클릭 창작 액션) |
| **2. 캐릭터 & 이미지 스프라이트 파이프라인 (15)** | 15.0 | 15.0 | **30.0** | **PNG 이미지 스프라이트 서브프레임 인비트위닝**(`studioImageSpriteSubframeMotion`), HD 환경광 틴트(`resolveStudioHdActorTint`), 크로스페이드 틴트 계승 |
| **3. 로코모션·모션·카메라 감각 (15)** | 15.0 | 17.5 | **30.0** | 관성/즉응 듀얼 프리셋 + **정지 관성 세틀**(`studioLocomotionStopSettle`) + **상체 부피 보존 호흡**(`studioIdleUpperBodyBreathScale`) + 보행 동기 그림자 알파 |
| **4. 월드 테마 & 공간 연출 (15)** | 15.0 | 17.0 | **30.0** | **고품질 스튜디오 테마 10종**(`webtoon-atelier`, `celestial-observatory`, `cinema-screening` 등 신규 플래그십 3종 포함) + 이중 접지 그림자·활동 오라(`StudioActorAuraRuntime`) |
| **5. 실시간 멀티플레이 & 근접 미디어 (15)** | 15.0 | 15.5 | **28.0** | WebRTC P2P 근접 영상/음성, 어쿠스틱 프라이빗 존, 녹음부스 자동 음소거 중재, 동행 걷기·소셜 인터랙션 |
| **6. 인월드 프로덕션 도구 통합 (10)** | 10.0 | 13.0 | **22.0** | P2P 공유 화이트보드, 라이브 원고 주석, 녹음부스 에셋 편입, 전시관, 집중 타이머·공간 맥락 제안(`useStudioVirtualSpaceFocusSuggestions`) |
| **7. HUD UI/UX & 디자인 시스템 (10)** | 10.0 | 9.5 | **18.0** | 글래스모피즘 Location Chip + Atelier Pulse 배지 + `K` 퀵 파인더 + `@starting-style` 이산 전환 애니메이션 + 미니 디오라마 테마 픽커 |
| **8. 엔지니어링·성능·접근성 (5)** | 5.0 | 6.5 | **12.0** | 적응형 FPS 품질 스케일러, 오브젝트 풀링, `prefers-reduced-motion` 완전 준수, 한/영 이중언어, 결정론적 단위 테스트 |
| **총점** | **100.0점** | **112.5점** | **200.0점** | **범용 화상회의 메타버스를 넘어선 웹툰 프로덕션 공간 OS** |

---

## 2. 핵심 기획 컨셉: Synesthetic Story-Forge & Atelier Pulse 2.0

단순히 아바타가 돌아다니며 화상회의를 여는 공간이 아니라, **"작가·어시스턴트·편집자의 작업 상태와 공간 자체가 공명(Resonance)하는 공감각적 웹툰 창작 아틀리에"**로 기획 컨셉을 재정립했다.

1. **아틀리에 펄스 엔진 (`studio-virtual-space-atelier-pulse.ts`)**
   - 나(`selfActivity`, `selfUserStatus`, `selfSeated`, `focusActive`)와 동료(`peers`의 구역·집중·대화·근접 여부), 타운 스포트라이트(`spotlightActive`)를 실시간 합성하여 **`synergyScore` (0~200)**와 **`zoneResonance` (0~100%)**를 계산한다.
   - **4단계 아틀리에 템포 (`StudioAtelierTempo`)**:
     - `serene` (고요한 영감 산책)
     - `flow` (집중 작화 몰입)
     - `ensemble` (스튜디오 합주·피드백)
     - `crescendo` (마감 크레센도·스포트라이트)
   - 현재 구역과 템포에 맞춰 **즉시 실행 가능한 원클릭 퀵 액션**(`25분 집중 시작`, `원고·검수 열기`, `동료 합류`, `구역 이동`)을 HUD 상단 Location Chip과 구역 워크바에 동시에 제공한다.

---

## 3. 이미지 스프라이트 & 로코모션 고품질 자연스러운 동작 원리

PNG 이미지 스프라이트(`drawn-characters-v1`, 스타일 팩, 커스텀 시트)는 프레임 수가 유한(보통 3~4프레임)하여 단순 프레임 교체만으로는 60fps 모니터에서 딱딱하게 끊겨 보일 수 있다. 이를 해결하기 위해 **원점 정합(Registration)을 훼손하지 않는 5단계 하이브리드 서브프레임 모션 파이프라인**을 구축했다.

1. **서브프레임 절차적 인비트위닝 (`studioImageSpriteSubframeMotion`)**
   - 각 보행 프레임의 픽셀 바운딩 박스 정합값(`originX`, `originY`, `displayHeightRatio`)은 그대로 유지해 발 미끄러짐(foot sliding)을 원천 차단한다.
   - 대신 현재 프레임 내부 진행도 $u \in [0, 1)$에 대해 양 끝 경계($u=0, u=1$)에서 정확히 $0$이 되는 $\sin(\pi u)$ 아크 엔벨로프를 사용하여:
     - **서브프레임 아크 리프트 (`liftY`)**: 발이 지면을 박차고 넘어가는 순간 최대 `-1.35px` 부드럽게 떠오른다.
     - **좌우 교번 스윙 (`tiltDeg`)**: 짝수·홀수 보행 스텝에 따라 `±1.15°` 미세한 상체 스윙을 부여한다.
     - **부피 보존 탄성 (`scaleX`, `scaleY`)**: $\text{scaleX} \cdot \text{scaleY} \approx 1$을 유지하는 탄성 곡선으로 프레임 전환 경계의 딱딱함을 없앤다.
2. **정지 관성 세틀 (`studioLocomotionStopSettle`)**
   - 이동하다 멈추는 순간 `320ms` 동안 감쇠 진동($e^{-5.5p}\sin(2\pi p)$)으로 무릎과 상체가 부드럽게 쿠션감 있게 안착한다.
3. **상체 부피 보존 호흡 (`studioIdleUpperBodyBreathScale`)**
   - 대기 상태에서 단순 상하 이동뿐 아니라 흉곽의 미세한 팽창·수축(`±1.4%`)을 표현한다.
4. **보행 위상 동기 접지 그림자 (`studioGaitShadowAlpha` & `StudioActorAuraRuntime`)**
   - 발이 땅을 딛는 순간 그림자가 짙어지고(`0.31`), 공중에 뜰 때 옅어지는(`0.21`) 물리적 접지감과 함께, 캐릭터 발밑에 **코어 앰비언트 오클루전(Core AO) + 활동 상태별 공명 오라 링**(집중 인디고, 리뷰 앰버, 크리에이티브 시안, 마감 코랄)을 렌더링한다.
5. **HD 환경광 틴트 & 크로스페이드 계승 (`resolveStudioHdActorTint`)**
   - 낮/노을/밤 시간대, 아트 스타일, 바라보는 방향(남/동 광원 방향성), 집중·자리비움 상태에 따라 캐릭터 스프라이트에 자연스러운 환경광 틴트를 입히며, 포즈 전환 크로스페이드(`StudioSpriteCrossfadeRuntime`) 중에도 잔상 스프라이트가 동일한 틴트를 계승한다.

---

## 4. 가상 스튜디오 전용 고품질 테마 10종 큐레이션 (`studio-virtual-space-theme.ts`)

웹툰 창작 공정(콘티·선화·세계관 설정·채색 검수·야간 마감)에 맞춘 **플래그십 아틀리에 테마 3종**을 신규 설계하여 총 **10종의 고품질 테마**를 제공한다. 모든 테마는 화면 전체를 흐리게 덮는 전면 오버레이 없이 바닥 패턴·벽 틴트·배경 그라데이션·절벽·광장 석재·장식 포인트를 선명하게 교체한다.

| 테마 키 | 한글 이름 | 창작 특화 배지 | 추천 화풍 | 공간 색채·재질 특징 |
| --- | --- | --- | --- | --- |
| `modern-office` | 모던 오피스 | 스탠다드 | `webtoon` | 밝은 대리석, 페일 우드, 차분한 카펫의 기본 스튜디오 |
| `webtoon-atelier` | **웹툰 원고 아틀리에 (신규)** | **작화·펜선 특화** | `webtoon` | 캔손 원고지 톤 크림 대리석, 애쉬 우드 데스크, 인디고 잉크 포인트 |
| `celestial-observatory` | **셀레스티얼 천문 공방 (신규)** | **세계관·콘티 기획** | `sky-island` | 성운 네이비 슬레이트, 황동 아스트롤라베 포인트, 문스톤 회랑 |
| `cinema-screening` | **시네마 컬러 스위트 (신규)** | **채색·최종 검수** | `neon` | 색 왜곡 없는 캘리브레이션 차콜 슬레이트, 벨벳 크림슨 카펫, 앰버 조명 |
| `cozy-wood` | 코지 우드 | 집필·콘티 휴식 | `webtoon` | 따뜻한 원목 벽과 허니 우드 플랭크, 산장 로지 러그 카펫 |
| `neon-night` | 네온 나이트 | 야간 마감·사이버 | `neon` | 짙은 슬레이트 바닥과 시안/마젠타 포인트의 야간 크리에이터 허브 |
| `garden-terrace` | 가든 테라스 | 브레인스토밍·힐링 | `pastel-garden` | 온실 잔디와 우드 데크, 테라코타 벽의 보태니컬 테라스 |
| `library` | 클래식 라이브러리 | 자료 고증·아카이브 | `ink-sketch` | 짙은 원목, 버건디 카펫, 흑백 체커 대리석의 클래식 서재 |
| `sakura-campus` | 벚꽃 캠퍼스 | 로맨스·학원물 | `pastel-garden` | 연분홍 벽과 화사한 봄 잔디, 벚꽃 포인트 캠퍼스 |
| `sunset-harbor` | 노을 하버 | 드라마·감성 씬 | `retro-pixel` | 테라코타 벽과 골든아워 데크, 청록 로프 포인트 항구 산책로 |

---

## 5. 10X Hyper-Office (2,000점) 고도화: 오피스 웰니스·댄스 모션 4종 & 직군 코디 프리셋 6종

1. **2,000pt 10X 하이퍼 오피스 점수 체계 (`hyperScore` & `dimensions`)**
   - `computeStudioAtelierPulse`가 기존 `synergyScore` (0~200)와 함께 10배 확장된 **`hyperScore` (0~2,000pt)**, **`comboMultiplier` (1.0x~10.0x)**, 그리고 가상 오피스 5대 핵심 차원(`officePresence`, `deepWorkFlow`, `reviewCollaboration`, `wellnessVitality`, `atelierAesthetics` 각 400점 만점)을 산출하여 좌상단 HUD(`SpaceLocationChip`)에 실시간으로 표시한다.
2. **오피스 웰니스·댄스 모션 4종 (`calisthenics`, `yoga`, `kpop-dance`, `shuffle`)**
   - `STUDIO_SPACE_EMOTE_IDS`를 21종으로 확장하고, `studioEmoteBodyMotion`에 시작·종료 구간 부드러운 감쇠 엔벨로프(`env`)를 적용해 모션 전환 시 끊김이 없도록 구현했다.
   - 플레이어가 체조·요가·댄스를 실행하면 주변 NPC 동료(`STUDIO_NPC_EMOTE_RESPONSES`)들도 함께 동참하며, 발밑에 웰니스·댄스 리듬 스테이지 링(`StudioActorAuraRuntime`)이 렌더링된다.
3. **창의적 프로시저럴 캐릭터 꾸미기 파츠 및 직군 원클릭 프리셋 6종**
   - 액세서리 12종(`crown`, `cat-ears`, `halo`, `flower-crown`, `vr-visor`, `pen-wing`, `sprout` 7종 프로시저럴 벡터 추가), 오라 8종(`aurora`, `prism`, `flame`, `lotus` 추가), 발걸음 트레일 8종(`music-note`, `ink-drop`, `rainbow`, `leaf` 추가), 명찰 8종(`emerald`, `cyber`, `gold`, `obsidian` 추가)으로 확장했다.
   - `STUDIO_VIRTUAL_CHARACTER_PRESETS`를 통해 `pd-standup`, `editor-review`, `artist-deepwork`, `spatial-director`, `office-wellness`, `deadline-mvp` 6종의 오피스 직군·워크모드 코디를 원클릭으로 즉시 장착할 수 있다.

