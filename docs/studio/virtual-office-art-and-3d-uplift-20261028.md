# 가상 오피스 아트·스프라이트·3D 고도화 기록

- 상태: `current` (현재 작업 브랜치의 구현·관련 범위 검증 기록)
- 기록일: 2026-10-28
- 작업 기준: `40179e94698323384e4804bad4a4ef473abc3794`
- 범위: 기존 미커밋 2D 개선의 검토, REA 공개 번들 재관측, 새 이미지 아트·공간 구조, 꾸미기 연결, 실생성 GLB의 3D 소비
- 이 문서는 `main` 병합 또는 운영 배포의 완료를 의미하지 않는다.

## 1. 현재 분석 범위와 근거

기존 [40종 분석 기록](../design/virtual-office-rea-full-analysis-20261026.md)은 로컬 모델·UI의 참고 목록이다.
이번에는 Gather, WorkAdventure, ZEP, oVice, Kumospace, SoWork, Teamflow의 공개 페이지를 별도 무인 브라우저에서 REA로 다시 관측했다.
938개 스크립트와 digest를 확보했고, [새 증거 원장](../evidence/rea-virtual-office-refresh-20261028.json)에 수집·내보내기·선택 소스 분석 Evidence ID를 기록했다.

- 관측은 공개 클라이언트의 정적 소스에 한정한다. 로그인 이후 기능의 활성화, 서버 계약, 실제 음성 처리나 모든 제품의 동작 동등성은 확인하지 않았다.
- 일부 대형 AST 분석은 소스당 60초 제한에 도달했다. 해당 partial Evidence를 보존하고 Gather·SoWork의 더 작은 모듈 및 oVice의 제한된 semantic graph를 별도로 분석했다. ZEP의 대형 소스 분석은 제한에 도달한 상태다.
- 수집한 경쟁 서비스 JavaScript는 Git ignore된 `.qa/rea-office-upgrade-20261028/`에만 보관한다. 제품 소스나 배포 자산으로 복사하지 않는다.
- 네이티브 바이너리 분석은 필요하지 않았다. Hopper는 사용하지 않았으며 필요한 경우 Ghidra만 사용한다.

설계 해석에는 [Gather의 지정석 안내](https://support.gather.town/articles/3227467030-claim-and-customize-your-desk),
[SoWork의 월드·평면도 전환 안내](https://help.sowork.com/Getting-Started-Guide-21fb2190ba6b81c2aa86f05a57a5d297),
[WorkAdventure의 정숙 구역](https://docs.workadventu.re/map-building/inline-editor/area-editor/silent/),
[Kumospace의 공간·룸 음향](https://www.kumospace.com/help/spatial-and-room-audio)도 참고했다.
ToonStudio에는 기존 manifest·이동·미디어 권위를 재사용해 필요한 패턴을 적용한다.

## 2. 새 아트와 실제 사무실 구조

내장 `image_gen` 도구로 독립 원본 아트 3종을 생성했다. 각각 1536×1024 PNG이며 원본을 프로젝트에 보존한다.
도구가 모델명·버전을 보고하지 않아 특정 모델이나 ImageGen 버전을 추정하지 않는다.
파일·치수·SHA-256은 [아트 manifest](../../apps/web/public/assets/virtual-studio/office-themes-v1/manifest.json)에 기록한다.

| 공간 | 아트와 구조 | 진입 경로 |
| --- | --- | --- |
| 숲의 원형 아틀리에 | 중앙 원형 목조 마루, 서가와 창가 작업석, 식물 사이 통로 | `/studio/space?place=forest-atelier` |
| 궤도 관측 스튜디오 | 초승달 리뷰 라운지, 행성 원탁 기획석, 창가 작화 콘솔 | `/studio/space?place=orbital-observatory` |
| 산호 아르데코 아틀리에 | 긴 공동 원고 테이블의 양쪽 통로, 진주색 창가석과 산호 소파 | `/studio/space?place=tidal-atelier` |

기존 테마 10종에 새 테마 3종을 추가했다. 기존 테마 선택, 장소 카드, 공간 모듈과 시작 템플릿에서 같은 원장을 소비한다.
테마 선택의 스타일 변경과 장소 선택의 실제 월드 구조 변경을 구분한다.
가구의 그림 위치와 collider·좌석·도구·출구 좌표를 같은 픽셀 기준으로 맞췄다.
새 공간의 모든 도구·좌석 접근점·귀환 포털에 도달하는 경로와 가구 내부 점유 금지를 테스트한다.
템플릿 적용은 기존 작업 ID·버전·비공개 음향 영역을 보존한다.

## 3. 캐릭터·꾸미기와 입력

기존 8직군 스프라이트의 이동 거리 기반 보행과 착석·제스처 계약을 유지한다.
캐릭터별로 다른 idle 호흡 위상을 적용하고 reduced motion을 존중한다.
기존 AvatarCustomizer에서 저장하던 액세서리 16종과 강조색을 자기 배우에 연결했다.
보행·착석의 발 위치·기울기·그리기 변환을 공유해 장식이 몸에서 분리되지 않게 한다.

로컬 프로필은 변경·리셋·storage 이벤트로 갱신하며 매 프레임 localStorage를 읽지 않는다.
다른 참가자에게 로컬 꾸밈을 잘못 적용하지 않고 구독을 해제한다.
이 변경은 머리·피부·의상 전체 재색칠, 업로드 시트 대체나 원격 외형 동기화의 완료를 뜻하지 않는다.

고해상도 신규 보행·작업·표정 시트는 8직군 16장, 총 384개 프레임을 생성·검수해 연결했다.
보행은 4방향×9열, 작업은 뒤 착석 4단계·앞 착석 기본/대화/웃음/커피·서 있는 손흔들기/만세/엄지척/생각의 3행×4열 계약을 사용한다.
PNG 원본을 보존하고 alpha 연결성분의 주성분 bbox·발·머리 anchor를 별도 메타데이터로 해석한다. 균일 격자를 넘은 신발과 희미한 행간 픽셀을 구분하며 원본 이미지를 잘라서 재저장하지 않는다.
기존 128×192 논리셀·발 기준 188px·배우 높이 76px과 액세서리 변환을 유지하고 원본 WebP를 덮어쓰지 않는다.

`cwebp -lossless -exact` 런타임 sibling은 PNG와 decoded RGBA가 16장 모두 동일하다.
PNG 34,745,168 bytes에서 WebP 24,687,542 bytes로 약 28.95% 줄었으며 해상도·픽셀은 보존한다.
첫 화면은 기존 보행 시트로 열고 새 시트는 자기 직군부터 후속 로드한다. 새 시트가 없거나 치수·프레임 계약이 다르면 실제 기존 이미지를 선택한다.
초기·후속 제한 시간이 지난 뒤 도착한 원화도 개별 도착 알림으로 바닥 캐시를 다시 그린다.

재현 위치는 저장소 루트이며 Python 3·Pillow·cwebp가 필요하다. 검증은 파일을 변경하지 않는다.

```sh
python3 scripts/build-office2d-atlas-metadata.py --write-runtime
python3 scripts/build-office2d-atlas-metadata.py --check
python3 scripts/build-office2d-atlas-metadata.test.py
```

첫 명령은 PNG를 변경하지 않고 런타임 WebP와 메타데이터를 재생성한다. 나머지 두 명령은 원본·런타임 해시, 픽셀 동일성·프레임 bounds 및 연결성분 회귀를 확인한다.

워크스테이션 전면 창은 Radix Dialog로 포커스 진입·Tab 순환·Escape 닫기·열기 전 요소로의 포커스 복귀를 연결했다.
미니맵 동료 핀의 실제 click→click→double-click 순서가 이동 명령을 중복 전송하지 않도록 고쳤다.
북·남 문이 같은 X좌표를 갖는 방에서도 각 출입구의 안내가 별도로 표시된다.

## 4. 실제 생성 GLB와 3D 권위

로컬 조사에서는 Tripo GLB 44개와 Varco GLB 26개를 확인했다.
일부 Varco 월드빌드 파일은 API 생성 실패 뒤 만들어진 합성 폴백이므로 실생성 모델 목록에서 제외했다.
실생성 Tripo 이젤·기획 책상·서가·아케이드와 Varco 책상·스키닝 idle 캐릭터의 6종을 선별했다.
모델 원본의 크기·SHA-256·codec·스키닝·애니메이션 계약은 source와 테스트로 확인한다.

- GLTFLoader에 Meshopt decoder를 연결하고 PBR 텍스처·스키닝·내장 idle 모션을 보존한다.
- 같은 URL의 전송을 공유하며 장면 종료 때 모션과 GPU 자원을 해제한다. 로드 실패는 화면 상태로 알리고 기존 공간을 유지한다.
- 복제된 스키닝 캐릭터의 Skeleton·bone texture도 각각 한 번만 해제한다.
- 캠퍼스의 기존 건축·디오라마를 보존한다. HQ·새 테마·사용자 월드는 활성 manifest의 방·경계·상호작용·NPC 좌표를 사용한다.
- HQ의 상호작용은 raw 배열 대신 `studioWorldInteractions()` 정본 accessor로 해석한다.
- 키보드·조이스틱은 벽에서 축별로 미끄러지고 클릭·자동 접근은 기존 pathfinder를 따른다. 순간이동 도착점도 이동 가능 여부를 확인한다.
- 새 세 공간에도 기존 비보행 가구 영역 안에 실생성 모델을 배치한다. 스폰·좌석 접근/이탈·도구를 막지 않는 거리를 검증한다.
- 본사와 새 공간에는 기존 테마의 바닥 패턴·벽·accent 재질을 적용한다. 새 원화는 원본 비율을 유지한 북쪽 세로 액자로만 소비하며 궤도 테마는 studio 조명으로 시작한다.
- 새 세 환경의 내부 가구 footprint 21개는 책상·콘솔·서가·소파·식재 구조로 보이게 한다. 북쪽 배경·월드 경계는 제외하고 기존 실생성 GLB와 겹치는 곳은 전시 경계로 표시한다. collider와 모델 비율은 변경하지 않는다.
- 추가한 idle clip은 감소 모션 설정에서 정지하고 설정을 해제하면 재개한다. 초기 0프레임 자세와 원본 clip 값은 유지한다.

## 5. 검증 기록과 한계

초기 기존 변경 범위의 `pnpm harness:verify`는 실제 종료 코드 0으로 통과했다.
저장소 전체 하네스·필수 CI의 최종 결과는 이 변경의 PR 검사 결과와 완료 보고를 기준으로 확인한다. 이 문서의 관련 범위 검증을 저장소 전체 검증 통과로 확대하지 않는다.
이미 실행한 관련 단위 검증에는 미니맵 입력, 모달 키보드 포커스, 신규 공간 경로, 액세서리 합성·구독, 실제 GLB 전체 Meshopt buffer 복호화와 내장 모션이 포함된다.
최종 소스를 동결한 뒤 관련 Vitest 23파일·201테스트를 실행해 종료 코드 0을 확인했다.
Python 연결성분 회귀 3개와 16장·384프레임의 PNG/WebP 해시·decoded RGBA 동일성 검사도 통과했다.

3D 독립 fixture의 실제 Chrome 156 headless에서는 ANGLE Metal / Apple M2 Max, `MAX_TEXTURE_SIZE=16384`, `contextLost=false`를 관측했다.
HQ 46개 모델(실생성 6), 숲 4개(실생성 1), 기존 캠퍼스 81개(실생성 6)의 로드·키보드 이동·자동 이동을 확인했고 페이지 오류·실패 요청은 0이었다.
기존 RGBELoader·PCFSoftShadowMap deprecation 경고는 남아 있다. FPS 성능 벤치마크를 수행한 것은 아니다.

초기 HQ 2D 화면·평면도·공간음·협업 모달은 데스크톱과 모바일 독립 fixture에서 확인했다.
새 세 환경의 2D 화면은 실제 Chrome에서 `ready`, 1536×1024 원본 아트의 실제 그리기, 키보드 이동·유효 좌표와 오류·실패 요청 0을 확인했다.
세 화면의 Canvas 픽셀·스크린샷도 확인했다. 신규 시트 16장과 실제 atlas·액세서리 helper의 384개 프레임도 Chromium에서 합성하고 오류 0과 화면을 확인했다.
독립 fixture 결과를 로그인·전체 셸·다중 참가자·서버 동기화 또는 운영 배포의 완료로 확대하지 않는다.

스프라이트 미리보기는 실제 atlas helper·16개 runtime WebP로 8직군의 4방향 보행과 작업 표정을 녹화한 10초·1536×960 VP9 영상이다.
멀티플레이 또는 FPS 성능 벤치마크를 뜻하지 않는다.

운영 배포·환경변수 변경·DB 변경·새 유료 생성 API 호출은 수행하지 않았다.
