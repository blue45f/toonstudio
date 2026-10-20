# Creator Bundle 캐릭터 팩 활용 검토 (REVIEW)

- 대상: itch.io Creator Bundle: Volume 1 (EmaceArt · RG Poly, 85팩) 중 캐릭터 팩
- 기준일: 2026-10-20, 전부 팩 페이지 실측 기준 (페이지에서 읽지 못한 항목은 "미확인"으로 표기)
- 데이터 산출: `studio-unity-bundle-characters.ts` (이 폴더, 레포 미러 경로 `apps/web/src/domains/creator/virtual-space/`)
- 전제: 기존 전수 카탈로그(`um-bundle-catalog`)는 캐릭터를 crowd 역할로만 분류했다. 본 검토는 캐릭터 표면 5종으로 판정을 확장한다.

## 1. 조사 범위

캐릭터 전용 팩 5종 + 캐릭터를 내장한 환경 팩 3종 = **8개 소스**를 팩 페이지에서 직접 확인했다.

| 구분 | 팩 | 확인 결과 |
|---|---|---|
| 전용 | Cartoon Characters 1 (RG Poly) | 캐릭터 27종·306변형, 공용 스켈레톤, 애니메이션 40+, **CC0** |
| 전용 | Cartoon Characters 2 (RG Poly) | 캐릭터 21종·886변형, 애니메이션 40, **CC0** |
| 전용 | Slavic Medieval Villagers (EmaceArt) | 모듈러 남녀 2종, 커스텀 리그 63본, 애니메이션 25 |
| 전용 | ART DECO Victorian Citizens (EmaceArt) | 모듈러 시민 3종, 커스텀 리그 60본, 애니메이션 21 |
| 전용 | PHILIPP (EmaceArt) | 모듈러 단일 캐릭터 2원형, 애니메이션 10 |
| 내장 | Cartoon City Massive Pack (RG Poly) | 위 Characters 1과 동일 캐릭터 내장 |
| 내장 | Slavica 메가팩 (EmaceArt) | Villagers와 겹치는 모듈러 남녀 캐릭터 내장 (남 15·여 10 애니메이션) |
| 내장 | Harboria (EmaceArt) | 시민 3종(=Victorian Citizens) + 몬스터 7종, 애니메이션 24 |

캐릭터가 없는 것을 페이지에서 확인한 팩: Army Pack(전차·항공기·벙커만), Viking World(환경·무기만), Cute Dungeon Megapack(던전 소품만), Pirate Island(환경만), Sci-Fi Arena: 1(아레나 소품만). 나머지 환경 팩은 미열람 — 단 EmaceArt 팩은 캐릭터 포함 시 Slavica·Harboria처럼 구성 목록에 명시하는 패턴이라, 잔여 가능성은 NOTES에 남긴다.

## 2. 팩별 스펙 표 (페이지 실측)

| 팩 | 포맷 | 리그 | 애니메이션 | 모듈러 | 폴리곤/체 | 텍스처 | 라이선스 |
|---|---|---|---|---|---|---|---|
| Cartoon Characters 1 | FBX·Godot·Blend (무료판 FBX·glTF) | 공용 스켈레톤, fully rigged. Humanoid 호환 미확인 | 40+ (걷기·뛰기·점프·격투·권총·좀비 세트) | 색상·의상·피부톤 변형 306 | 미표기 | 공용 아틀라스 1024 1장 + 헤어 머티리얼 분리 (City 페이지 기준) | **CC0** |
| Cartoon Characters 2 | Godot·FBX·Unity FBX | 리그 표기 없음 (미확인) | 40 | 색상 변형 886 | 평균 2,468 | 텍스처 2장 1024, 머티리얼 4 | **CC0** |
| Slavic Medieval Villagers | 페이지 미표기 | **커스텀 63본** (손가락·눈·입 포함), Humanoid 네이티브 비호환 명시, 컨버터 변환 가능 명시 | 25 (idle 5·walk 5·sit 3·작업 모션) | 파츠 24 + 작업 소품 8 | 약 1K (소품 포함 4K) | 머티리얼 4·컬러 텍스처 4, 단일 팔레트 | EmaceArt |
| Slavica 내장 캐릭터 | Unity·GLB·FBX | 커스텀, Humanoid 아님 명시, 컨버터 에셋이 변환 담당 표기 | 25 (남 15 + 여 10) | 의상 20·헤어 4·수염 4 | 미표기 | 팩 전체 4K 아틀라스·팔레트 | EmaceArt |
| Victorian Citizens | 페이지 미표기 | **커스텀 60본**, Humanoid 네이티브 비호환 명시, 컨버터 변환 가능 명시 | 21 (idle·walk·sit·leaning) | 파츠 30 + 액세서리 5 | 약 1K (소품 포함 4K) | 머티리얼 6·컬러 텍스처 6, 단일 팔레트 | EmaceArt |
| Harboria 내장 캐릭터 | Unity·FBX | **Generic 리그**, Humanoid 아님 명시, 변환 가이드 동봉 | 24 | 부착물 35 | 시민 약 1K, 몬스터 미표기 | 팩 전체 4K 아틀라스 3장 | EmaceArt |
| PHILIPP | 페이지 미표기 (프리팹 12) | "custom humanoid rig" 표기, 호환 여부는 미확인 | 10 (idle 5·sit 2·walk 2·run 1) | 파츠 20 (의상 10·액세서리 6·추가 4) | 약 1K | 단일 컬러 아틀라스 | EmaceArt |

## 3. 핵심 발견

1. **RG Poly 캐릭터 팩 2종은 CC0다.** 팩 페이지 본문과 itch 메타데이터(Asset license: Creative Commons Zero) 양쪽에 명시돼 있다. 번들 전체에 적용했던 "서비스 내 전용" 제약이 이 2종에는 라이선스상 존재하지 않는다 — 아바타 스킨·VRM·테스트 소재 어느 표면에서도 권리 장벽이 없는 유일한 캐릭터 소스다. (번들 사본의 최종 확인은 다운로드 내 LICENSE 파일로 — NOTES 참조.)
2. **EmaceArt 캐릭터는 전 팩이 커스텀/Generic 리그이고 Humanoid 네이티브 비호환이 명시돼 있다.** 대신 제작자가 모든 팩에서 "애니메이션 컨버터로 Humanoid 변환 가능" 또는 변환 가이드 동봉을 명시한다. 즉 EmaceArt 캐릭터의 활용 경로는 "Generic 애니메이션 그대로 재생" 또는 "오프라인 변환 1회" 둘 중 하나다.
3. **중복이 3쌍 있다.** ① Cartoon City 내장 캐릭터 = Cartoon Characters 1 단독 팩 ② Slavica 내장 캐릭터 ≒ Slavic Medieval Villagers ③ Harboria 시민 3종 = Victorian Citizens 단독 팩. 인제스션은 팩 단위가 아니라 캐릭터 단위로 중복 제거해야 한다.
4. **애니메이션 자산 가치가 크다.** RG Poly 2종 합계 80+ 클립(걷기·뛰기·점프·격투·권총·좀비), EmaceArt는 일상 연기 중심(idle·sit·leaning·작업 모션)이다. 리그 호환과 무관하게 포즈 스틸로 뽑으면 드로잉 레퍼런스가 된다.

## 4. 표면별 활용 판정

범례: 가능 = 현행 파이프라인 전제로 바로 투입 가능 / 조건부 = 명시한 변환·확인 작업 후 가능 / 불가 = 해당 없음 (이번 검토에서 "불가" 판정은 없음)

| 표면 | RG Poly (CC0 2종) | EmaceArt (5소스) | 근거와 필요 작업 |
|---|---|---|---|
| ① 가상스튜디오 아바타 스킨 | **조건부** | **조건부** | 무대 아바타는 skinKey 단위 교체 구조가 이미 있다(임베드 계약). RG Poly는 공용 스켈레톤이라 모델 스왑+색상 교체로 306·886 변형 전개가 가능하나, Humanoid 매핑 성립은 실물 본 확인이 먼저. EmaceArt는 Generic 애니메이션 유지(무대 Animator를 Generic으로 운용) 또는 컨버터 변환이 조건. 모듈러 파츠(의상·헤어·수염 교체)는 스킨 커스터마이즈와 정확히 맞는다. |
| ② 배경 군중·엑스트라 | **가능** | **가능** | 전 팩이 이 용도로 설계된 제품이다. EmaceArt는 체당 약 1K 폴리곤이라 다수 배치가 싸고, 단일 팔레트 리컬러로 변형을 만든다. CC2는 평균 2,468폴리곤이라 대량 배치 시 수량·LOD 관리만 하면 된다. 애니메이션은 idle·walk 루프만으로 충분하다. |
| ③ 마네킹·포즈 레퍼런스 | **가능** | **가능** | 리그 호환이 필요 없는 표면이다. 애니메이션 클립의 키프레임을 오프라인(Blender/Unity)에서 스틸로 렌더해 포즈 라이브러리로 제공하면, 격투·권총·앉기·작업 등 기존 마네킹 포즈로 얻기 어려운 연기 포즈를 채운다. 포즈 데이터 자체를 셰이퍼 마네킹 리그로 옮기는 것은 리타깃 작업이 별도로 필요해 이번 판정에서는 스틸 레퍼런스까지만 "가능"으로 본다. |
| ④ VRM 변환 투입 | **조건부** | **조건부** | VRM은 휴머노이드 본 매핑이 전제다(기존 public/vrm 파이프라인, 손가락 커얼 테스트까지 본 구조 전제). RG Poly는 본 구조 실측 후 매핑 작업만 남고 CC0라 변환본을 서비스 자산으로 쓰는 데 제약이 없다. EmaceArt Villagers는 손가락·눈·입 본을 보유해 표정·손가락 대응 재료는 있으나, 본 이름 매핑+T-pose 정렬+표정 연결의 오프라인 변환이 필요하고, 변환본도 "수정본 공유 금지" 범주로 봐서 서비스 내 전용을 유지해야 한다 (유저에게 VRM 파일 다운로드 제공 금지). PHILIPP는 "custom humanoid rig" 표기라 변환 파일럿 1순위 후보다. |
| ⑤ character-lab 테스트 소재 | **가능** | **조건부** | CC0 2종은 인테이크 QA의 기준 모델(리깅된 로우폴리, 알려진 폴리곤·텍스처 사양)로 자유롭게 쓸 수 있다. EmaceArt는 랩 내부 테스트 소재로만 가능 — 라이선스상 파일을 랩 외부(외부 서비스 업로드 등)로 내보내는 용도는 피해야 한다. |

## 5. 권고 순서

1. **1차 (CC0 RG Poly 2종)**: 군중 투입 + 포즈 스틸 라이브러리 + 아바타 스킨 파일럿. 권리 장벽이 없어 전 표면을 한 번에 검증할 수 있다. 실물 도착 즉시 본 구조를 확인해 Humanoid/VRM 매핑 성립을 확정한다.
2. **2차 (EmaceArt 테마 군중)**: 중세 마을 공간에는 Villagers/Slavica, 빅토리아 공간에는 Citizens/Harboria 시민을 테마 군중으로. 중복 3쌍은 캐릭터 단위로 한쪽만 인제스션한다.
3. **3차 (VRM 파일럿)**: PHILIPP 1체로 변환 파이프라인(본 매핑→UniVRM→기존 finger-curl·표정 검증)을 끝까지 돌려 변환 단가를 확정한 뒤, 대상을 넓힌다.
4. **몬스터 7종(Harboria)** 은 아바타가 아니라 공포 테마 공간의 연출 NPC로 분류한다.

상세 미확인 항목과 라이선스 주의는 NOTES.md 참조.
