# play-godot — /play 미니게임 Godot 에디션 빌드

`/play` 놀이터의 Godot 에디션(게임 12종 단일 허브 빌드)을 다시 만들어
`apps/web/public/play-godot/`에 반영하는 절차다. 웹 임베드는
`apps/web/src/domains/play/PlayGodotEmbed.tsx`가 맡고, 진입은 PlayPage의
`?engine=godot` 대체 진입(허브의 "Godot 에디션으로 플레이" 버튼)이다.
기존 웹판은 그대로 유지된다.

## 구성

- Godot 프로젝트 소스는 repo 밖에 둔다 (가상스튜디오 `godot-space`와 같은 관행).
  - 프로젝트: `~/workspace/godot-minigame-full/project/` (Godot 4.4.1)
  - 엔진 바이너리: `~/workspace/godot-pilot/engine/Godot_v4.4.1-stable_linux.x86_64`
- repo에 커밋되는 것: 웹 익스포트 산출물(`apps/web/public/play-godot/`)과 이 빌드 스크립트.

## 빌드 (build.sh가 아래 전 과정을 수행)

1. **폰트 서브셋** — `project/tools/build_font.py`가 소스(.gd) 전수와 랭킹 JSON
   전수에서 문자집합을 모아 Noto Sans CJK KR(TTC face 1)를 서브셋한다.
   타임스탬프를 고정해 재실행 시 바이트 단위 동일 산출물을 보장한다.
2. **웹 익스포트 (포그라운드)** — 백그라운드 실행 시 pck가 잘린 전례가 있어
   반드시 포그라운드로 돌린다. 익스포트 전 /tmp 여유(tmpfs 512M)를 확인한다.
3. **산출물 복사** — `build/`의 index.* 전부를 `apps/web/public/play-godot/`로 복사.

## 크기 실측 (2026-10-11)

| 파일 | raw | gzip |
| --- | --- | --- |
| index.wasm | 43,699,190 | 9,458,627 |
| index.pck | 386,016 | 297,944 |
| index.js | 317,142 | 80,146 |

엔진은 같은 오리진 정적 자산이라 첫 로드 한 번만 받고, 게임 12종 전환은
엔진 내부에서 일어나 추가 다운로드가 없다 (로컬 서버 로그로 실측:
허브→퀴즈→메모리→룰렛 연속 진입 시 wasm·pck·카탈로그 각 1회 요청).

## 런타임 계약

- 카탈로그: 같은 오리진의 `/data/ranking/popular-webtoon.json`을 읽고
  웹판과 같은 정규화·성인 필터(제목의 19/성인/adult 제외, 상위 120편)를 적용한다.
- 표지: 웹판 PlayCover 정책을 그대로 따른다 — 표지는 `/api/cover` 프록시
  경유로만 받고, 프록시가 막히면(킬스위치) 그라디언트 폴백으로 표시한다.
- 기록: 즐겨찾기·최근·결과 저널과 게임별 드래프트는 Godot `user://`에
  웹판 play-storage와 같은 상한(즐겨찾기 40·최근 6·결과 100)으로 저장한다.
- 준비 신호: 허브가 뜨면 부모 창의 `window.__tsPlayGodotReady()`를 호출해
  셸의 로딩 오버레이를 걷는다.
