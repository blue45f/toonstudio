# Studio 편집기와 전문 화면 재구성 · 2026-11-13

- 상태: **migration** — 2차 후보 구현과 로컬 검증 기록이다. main 병합·hosted CI·배포 완료와 구분한다.
- 연결: [전문 108경로 소스 판정](./studio-specialist-source-review-20261113.md), [전수 경로 검사](./sitewide-ux-route-audit-20261113.md), [공개 서비스 REA 관찰](./mobile-ux-rea-20261113.md).
- 설계 기준: 캔버스에서 자주 쓰는 도구는 직접 보이고, 전체 목록·전문 설정은 목적을 고른 뒤 연다. 기존 document/command/history/ACL/GPU/persistence authority는 그대로 사용한다.

## 현재 구현과 이번 변경의 구분

| 화면 | 기존에 이미 있던 구조 | 이번 재구성 |
| --- | --- | --- |
| 기본 드로잉 | PC 핵심 도구와 모바일 펜·지우개·색·레이어, 실제 저장 상태·선택 화면 | 더보기의 10~11명령을 원고/그리기/출력/화면 4목적→해당 명령으로 나눔 |
| 전체 도구 | 35도구와 사용/핀 명령, 검색·권한 사유 | 첫 화면은 8분류, 선택한 분류만 표시. 검색은 기존처럼 전체 범위이며 핀과 실행을 구분 |
| 브러시 랩 | 기본/전문 깊이와 재료·입력·패턴 편집 | `brushTask=presets/edit/engine/texture`의 4 URL 화면. 안내·진단은 접고, 모바일 실제 필기 패드를 조절 목록보다 먼저 배치 |
| BG3D | 기본 4단계 간편 assistant와 별도 정밀 workspace | 정밀 workspace의 6평면 탭을 장면/구도·작화/레이어 3목적으로 정리. 기본 간편 화면을 새 구현으로 주장하지 않음 |
| 캐릭터 | PC·모바일 실제 정문의 6카테고리·세부 부위 탭 | 이 구조는 유지. tablet 분기의 15슬롯 rail을 3분류와 7/5/3슬롯으로 정리 |
| 포저 | 진입 즉시 전체 화면 mannequin viewport | 기존 캔버스 우선 구조 유지. 실제 가려진 뒷면 benchmark 바를 접는 시도는 철회 |
| 모션·PDF·앵커·분기 | 본래 작업 편집면 앞에 전문 프리셋 동시 노출 | 실제 작업을 먼저 보이고 전문 scroll/depth, 인쇄/색상, 비교, 분기 검증을 명시적 disclosure로 이동 |
| 공간 허브 | 기기·제작 흐름·키트·리더·XR 등 7구간 동시 노출 | 3목적 정문과 5 hash 화면으로 나눔. 실제 runtime·파일 선택 인스턴스는 숨길 때도 유지 |
| 작가 지원 | 지원 영역·영상·브리프·보조 경로 동시 노출 | 지원 영역 뒤 영상/브리프/보조 안내를 별도 disclosure로 열며 미저장 입력 유지 |
| 도구체인 | `/toolchain`, `/engines`, `/jobs`별 별도 mode | 별도 본문은 유지하고 개요의 전문 실행 트랙·영수증 안내를 접어 실제 3단계를 우선 |
| IR | 소개 9본문과 투자자 질문 동시 노출 | 3목적 목차→`brief`의 9 단일본문. 발표·자료 링크는 직접 표시 |

## 실제 소비 경계

| 변경 부품 | 소비 연결 | 조건과 제외 |
| --- | --- | --- |
| `StudioAllToolsCatalog` | `StudioLeftToolRail`→비동기 catalog slot→통합 편집기 workspace | 기본 canvas/comic뿐 아니라 통합 편집 경로의 해당 도구막대를 열 때 적용한다. 전문 modal 전체를 새로 만든다는 뜻이 아님 |
| `StudioDrawingClarityTaskActions` | PC/mobile clarity bar→More→기존 native task dialog | 기존 canvas/comic·all/draw/color eligibility를 유지. 저장한 전문 toolbar·native 예외를 강제로 덮지 않음 |
| `StudioBrushLabPage` | 정본 new/edit와 work/remix brush-lab | 이전 `/brush-lab`, `/studio/brush-lab`은 기존 정문 redirect. 일반 설정 query는 문맥을 분리 |
| `StudioBrushIntegratedWorkbench` | 위 브러시 페이지→기존 V6 workbench | UI 작업 이동은 recipe를 다시 적용하지 않고, 명시적 같은 recipe 재선택은 기존대로 초기화 |
| `StudioBg3dTaskNavigation` | BG3D modal→정밀 professional workspace→sidebar | 기본 간편 assistant는 다른 소비 경로. 물리/몰입 잠금과 원래 탭 ID·명령을 유지 |
| `CharacterShaperSlotRail` | CharacterShaperDialog의 tablet 분기 | PC/mobile은 CategoryRail/SubslotTabs. 실제 정문 소비와 legacy 분기를 구분 |
| `IrBriefLayout`/`IrBriefSection` | `/ir` 본문과 발표 overlay | `/ir/present` 24씬 플레이어는 별도 기존 소유자 |

443 정본 소비지도에서 담당 108 URL·43 page source를 [별도 판정표](./studio-specialist-source-review-20261113.md)에 모두 남겼다. 시안의 editor 51분류를 실제 구현 적용 숫자로 사용하지 않는다. 기존 단일 목적·순차 작업·상호배타 탭이 적합한 화면은 새 UI로 재구현했다고 주장하지 않는다.

## 상태·주소·접근성 보존

- 브러시 `brushTask`만 lifecycle key에서 제외한다. project/work/remix/brushId 및 다른 검색 조건은 계속 분리한다. query/hash·뒤로·포커스와 미저장 Workbench를 함께 확인했다.
- 전체 도구 분류와 더보기 목적의 뒤로 이동은 실행 명령을 만들지 않는다. 도구 사용/핀, disabled 사유, native dialog 종료·기존 실행 callback을 유지한다.
- tablet 슬롯은 분류를 넘어 이동하는 기존 방향키·숫자 키와 roving tabindex를 유지하고 새 슬롯에 포커스를 보낸다. 분류 선택은 recipe commit을 만들지 않는다.
- Immersive는 기존 `#spatial-reader`, `#xr-webtoon-studio`, `#immersive-*-title` 주소로 해당 화면을 고른다. query 기반 Studio subtree remount를 추가하지 않는다.
- IR은 기존 `#ir-*-title`을 해당 본문으로 연결한다. query 문맥·뒤로·본문 포커스, `?present=1`, 발표 방향키·Escape·실행 버튼 포커스, PPTX/PDF 링크를 보존한다.
- 작가 지원은 접고 다시 열어도 입력을 유지한다. 기존 브라우저 초안 저장·JSON 내보내기와 저장 실패 상태를 유지하며 상담 접수/전송으로 바꾸지 않는다.

## 실행한 검증

- 관련 22파일 **333개 단위 검사 통과**. Workbench 최종 모바일 배치·disclosure 변경 뒤 V6 **29개 추가 검사 통과**. 기존 recipe 재선택·원본 보존·저장 실패/이주·키보드 회귀를 삭제하거나 완화하지 않았다.
- 변경 영역 ESLint 경고 0, `pnpm harness:check`, `pnpm check:source-file-size`, `pnpm check:studio-eager-graph`, `git diff --check` 통과. `harness:verify`·전체 타입·빌드·CI는 root 통합 게이트 결과와 별도로 보고한다.
- 실제 Chromium 390×900·1440×900: `/create` 실제 생성 버튼→펜·지우개→목적·전체 도구→화면 이동 사용→레이어 lazy 본문 로드→저장 선택 화면까지 확인했다. 내보낸 파일 저장 완료로 주장하지 않는다.
- 같은 두 폭에서 브러시 4 URL·이름/DOM 인스턴스·포커스·query/hash 보존, 기존 캐릭터 6카테고리, BG3D 정밀 3목적을 확인했다. BG3D의 WebGPU 미지원 환경은 실제 제공되는 `WebGL2로 계속`을 선택했으며 WebGPU 성공으로 쓰지 않는다.
- 최종 브러시 배치에서 실제 입력 필기 패드에 마우스 획을 입력하고 픽셀 서명 변화를 양폭에서 확인했다. 실제 펜 하드웨어의 필압·기울기 검증과 구분한다.
- 추가 7화면×2폭: 공간 5 hash 화면·뒤로, 지원 브리프 접기/재열기 입력 보존, 도구체인 전문 트랙, 모션/PDF/앵커/분기의 기본 접기→실제 선택→접기를 확인했다. page error 0이다.
- IR 두 폭에서 9본문 단일 표시·가로 넘침 0, 목차/뒤로/query/focus, legacy hash, PDF/PPTX HEAD 200, 실제 발표 overlay·방향키·Escape·`present=1`을 확인했다. page error 0이다.

## 증거와 한계

원본은 `.qa/studio-ux-phase2/`이며 대표 PNG·실행 조건·검증 결과 JSON은 worktree 밖 stable `studio-wave2/`에 복사한다. 게스트 auth/session 200과 나머지 API 503 fixture, service worker 차단, 로컬 Vite 소스다. 로그인 계정·운영 API·실제 공급자·외부 DB·모든 GPU/펜/터치 기기·운영 번들의 성공을 이 결과로 대신하지 않는다.
