# ToonStudio 기술 도감과 기술 지도

기준일: 2026-10-08. 이 문서는 `/about/technology/atlas`(기술 도감·기술 지도)의 구조와 작성·검증 규칙을 설명한다.
사실의 우선순위는 `AGENTS.md`를 따른다(소스·테스트 → 승인된 ADR → 아키텍처 문서 → OpenWiki). 이 문서와 코드가 다르면 코드가 맞다.

## 1. 무엇을 위한 것인가

기술 제작 스토리(40개 챕터)는 "왜 그렇게 만들었나"를 이야기로 설명한다. 도감과 지도는 같은 내용을 **발표자가 질문을 받았을 때 한 장에서 답을 찾는 형태**로 다시 묶는다.

| 구분 | 단위 | 질문 | 규모(2026-10-08) |
| --- | --- | --- | --- |
| 기술 도감 | 기술 하나 = 카드 한 장 | 이 기술은 무엇이고, 서비스의 어느 기능에서, 어떻게 쓰였고, 어디까지 확인됐나? | 10개 분야, 카드 154장 이상 |
| 기술 지도 | 같은 종류의 대상 = 표 한 장 | 무료로 세운 서비스·오픈소스·Open API·경쟁/참고 제품·AI 개발 도구는 무엇무엇인가? | 5장, 행 수는 화면의 표 머리말과 코드(요약 모듈)가 정본(경쟁·참고 제품만 292행) |
| 용어집 | 용어 하나 | 이 말은 쉬운 말로 무슨 뜻이고 서비스에서는 어디에 나오나? | 10개 분야, 168개 |

수치는 콘텐츠가 늘면 바뀌며 테스트가 고정하지 않는다(테스트는 최소 개수와 계약만 강제한다).

## 2. 경로와 연결

| 경로 | 설명 |
| --- | --- |
| `/about/technology/atlas` | 도감 + 지도 한 페이지. 분야·상태 필터와 검색은 쿼리 `category`·`status`·`q`로 주소에 남는다. |
| `/about/technology/atlas#<카드 id>` | 카드 앵커. 앵커로 들어오면 해당 카드를 연다. |
| `/about/technology/atlas#map-<지도 id>` | 지도 구역. 행은 `#map-<지도 id>-<행 id>`. |
| `/about/technology/deck?track=atlas` | 발표 모드의 "도감 부록" 트랙. 카드마다 도식 → 코드 → 쓰인 곳 슬라이드(시간 배정 없음). |

도감 카드의 `chapterIds`가 제작 스토리 챕터를 가리키고, 챕터 화면은 이 역참조로 관련 카드를 보여 준다(`useAtlasCardsByChapter`). 용어집 항목의 `atlasIds`는 용어에서 카드로 가는 칩이 된다.

## 3. 파일 지도

기준 폴더: `apps/web/src/domains/legal/technology/`.

| 역할 | 파일 |
| --- | --- |
| 카드 계약 | `engineering-atlas-types.ts` |
| 카드 집계 | `engineering-atlas-content.ts` — 분야별 모듈을 모아 분야 순서로 정렬한다. 카드 내용은 두지 않는다. |
| 카드 원본 | `engineering-atlas-<분야>.ts` + 주제별 보조 파일(`-<분야>-*.ts`). 한 파일은 1,000줄 미만이다(줄 수 래칫). |
| 지도 계약·메타 | `engineering-map-types.ts`(`ENGINEERING_MAP_META`는 허브 타일처럼 가벼운 곳이 행 데이터를 불러오지 않고 쓰는 요약) |
| 지도 원본 | `engineering-map-<id>.ts`(본체·열·도식), 행은 `engineering-map-<id>-rows*.ts` |
| 도식 | `engineering-diagram-types.ts`(계약·한도), `engineering-diagram-layout.ts`(배치 엔진), `engineering-diagram-validate.ts`(검증기), `EngineeringDiagramView.tsx`(SVG 렌더러), `EngineeringDiagramFrame.tsx`("크게 보기" 대화상자) |
| 코드 블록 | `EngineeringCodeBlock.tsx`, `engineering-code-highlight.ts` |
| 샘플 코드 검증 | `engineering-atlas-verify.ts` (TypeScript 컴파일러 API) |
| 화면 | `EngineeringAtlasPage.tsx`(카드·필터·지연 렌더), `EngineeringMapSection.tsx`(지도 표/카드 목록) |
| 계약 테스트 | `engineering-atlas-content.test.ts`, `engineering-atlas-samples.test.ts`, `engineering-diagram.test.ts`, `engineering-map-content.test.ts`, `EngineeringAtlasPage.test.tsx` |

## 4. 도감 카드 계약

한 장의 카드는 같은 순서로 ① 한 줄 정의 → ② 배경 지식 → ③ 서비스에서 쓰인 곳 → ④ 샘플 코드 → ⑤ 참고 링크 → ⑥ 발표 보조를 담는다. 아래는 테스트(`problemsOfAtlasEntry`)가 실제로 강제하는 규칙이다.

- `id`는 소문자 kebab-case이며 앵커로도 쓴다. 분야는 `drawing · local-first · realtime · virtual-space · three-d · ai · interaction · web-platform · open-data · platform-ops` 10개 중 하나.
- 모든 사용자 노출 문구는 `{ ko, en }` 쌍이다. 영어 칸에 한글이 섞이면 실패한다. 한 줄 정의(`tagline`)는 90자 이하, 핵심 요점(`keyPoints`)은 2~4개(각 64자 이하).
- 배경 지식은 2~4문단(문단당 40~520자). 서비스에서 쓰인 곳(`usage`)은 1~4개이며 근거 경로(`paths`)가 모두 저장소에 존재해야 한다(`경로#심볼` 힌트 가능).
- 샘플 코드는 1~2개, 3~30줄, `verify: "types" | "syntax" | "none"`. 영어 화면용 `codeEn`은 `code`와 줄 수가 같아야 한다. 단순화한 예제(`simplified`)는 원본 경로 `source`가 있어야 한다. 비밀값처럼 보이는 문자열이 있으면 실패한다.
- 참고 링크는 2~6개, https만, `example.com`·`localhost` 같은 자리표시 주소와 중복 URL을 금지한다.
- 연결된 제작 스토리 챕터(`chapterIds`)는 1개 이상이며 실제로 존재해야 한다. `technologies` 칩과 예상 질문(`talk.questions`)도 1개 이상.
- `facts`의 값은 문자열 그대로 적고 확인한 소스 경로를 단다. `reviewedAt`은 `YYYY-MM-DD`.
- 도식(`diagram`)은 필수이며 `validateEngineeringDiagram`이 빈 배열을 돌려줘야 한다(다음 절).

### 상태(`status`)의 뜻

상태는 제품 주장의 일부라 마케팅 편의로 고르지 않는다.

| 상태 | 뜻 |
| --- | --- |
| `live` | 제품 또는 검증된 배포 파이프라인에서 실제로 돈다. |
| `configured` ("설정 필요") | 코드는 있으나 운영 설정·연결이 남아 있다. 설정만 바꾸면 켜진다는 뜻이 **아니다**. |
| `experimental` | 실험·시험 단계이거나 제품 경로에 연결되지 않았다. |
| `documented` | 문서·계약으로만 존재한다. |

코드로 확인하지 못한 운영 상태(키 등록, 대시보드 설정, 실브라우저 효과)는 카드의 `pitfall`·한계 문장에 "미확인"으로 남긴다.

## 5. 도식 선언

도식은 손으로 그린 SVG가 아니라 선언(`graph` / `sequence` / `layers`)이며 한 렌더러가 그린다. 같은 선언이 도감 카드, 발표 슬라이드, 인쇄본에서 쓰인다.

- 글자 한도는 글자 수가 아니라 화면 폭(em)으로 잰다: 노드 `label` 13em·`sub` 25em·간선 라벨 10em, 시퀀스 메시지 27em, 계층 `label` 22em·`sub` 44em. 한국어와 영어 두 화면 모두에서 말줄임표로 잘리면 검증기가 오류로 알려 준다.
- `graph`는 최대 6열×5행·노드 12개 이하, 판단 노드(`diamond`)는 육각형으로 그려진다. `sequence`는 참여자 5명·메시지 12개 이하, `layers`는 7계층 이하.
- 간선 라벨은 노드의 글 영역과 다른 라벨을 피해 놓이며, 자리를 찾지 못하면 작성 오류로 처리한다. 간선이 다른 노드를 가로지르는 것도 오류다.
- 좁은 화면(컨테이너 폭 560px 미만)에서는 같은 내용을 목록으로 바꿔 보여 주고, 넓은 화면에서는 "크게 보기" 버튼으로 네이티브 `dialog`에 확대해 연다.

## 6. 샘플 코드 검증

샘플은 "교육용으로 줄인 코드"지만 틀린 코드가 되면 안 되므로 TypeScript 컴파일러 API(`engineering-atlas-verify.ts`)로 검증한다.

- `types`: 저장소 TS 설정으로 타입까지 검사한다(설치된 패키지와 웹 표준 API만 사용 가능).
- `syntax`: 구문만 검사한다. `none`: 검사하지 않는다(bash·python·rust 등).
- 샘플 속 심볼 힌트(`경로#심볼`)는 테스트가 `#` 뒤를 검사하지 않으므로 작성자가 직접 확인한다.

## 7. 기술 지도 계약

지도는 같은 종류의 대상을 한 표로 비교한다. 5장: `free-tier`(무료로 세운 서비스), `open-source`, `open-api`, `competitors`(경쟁·참고 제품), `ai-dev`(AI 개발 도구).

- 열은 3~7개, 모든 행은 모든 열을 채운다(해당 없으면 `—`). 표 칸은 한국어 220자 이하.
- 모든 행에 근거 경로(`evidence`)가 있고 저장소에 존재해야 한다. 링크는 https 공식 주소만.
- 무료 한도·가격 같은 **외부 수치는 저장소에 기록된 값만** 쓰고 `asOf` 날짜를 붙인다(`free-tier`는 모든 행에 필수). 공급자가 바꿀 수 있는 값이다.
- 경쟁·참고 제품은 저장소 문서에 기록된 관찰만 쓴다. 가격·점유율·최신 버전·기능 우열과 "대체·동등·우위"는 쓰지 않는다. 문서에 없는 것은 "문서에 없음·미확인".
- 법률 판단(라이선스 적합 여부)은 하지 않고 저장소가 기록한 라벨과 처리 방식만 적는다.
- 지도별 최소 행 수가 있다(`MIN_ROWS`). 허브용 메타(`ENGINEERING_MAP_META`)가 실제 지도 id 목록과 같은지도 테스트가 확인한다.

## 8. 성능 설계

카드 100여 장과 지도 5장을 한 페이지에 모두 펼치면 DOM이 12만 개를 넘어 느려졌다. 현재 설계:

- 카드는 머리(한 줄 정의·핵심 요점·도식·기술 칩)만 먼저 그리고 본문(배경·쓰인 곳·샘플 코드·링크·발표 보조)은 처음 열릴 때 그린다. "모두 펼치기", 주소 앵커, 인쇄(`flushSync`로 본문을 먼저 그림)도 같은 경로를 쓴다. 화면 밖 카드는 `content-visibility: auto`로 그리기를 미룬다.
- 지도는 표(뷰포트 1024px 이상)와 카드 목록(미만) 중 현재 화면에 맞는 하나만 그린다.
- 개발 서버 측정에서 DOM 요소 수는 약 12.6만 → 약 3.2만으로 줄었다. 개발 서버의 JS 힙 수치는 HMR·소스맵 때문에 운영과 다르므로 운영 번들로 다시 재야 한다(재지 않았다).

## 9. 새 카드·행을 추가하는 방법

1. 분야에 맞는 보조 파일(또는 새 보조 파일)에 `EngineeringAtlasEntry`를 추가하고 분야 모듈의 배열에 잇는다. 새 파일은 1,000줄을 넘기지 않는다.
2. 코드를 직접 열어 사실을 확인한다. 확인하지 못한 것은 `pitfall`에 "미확인"으로 적고 상태를 낮춘다.
3. 도식을 먼저 짜고(`validateEngineeringDiagram`) 샘플을 `verify: "types"`로 쓴다.
4. 링크는 응답을 확인한 공식 주소만 쓴다.
5. 지도 행은 `row()`/`openApiRow()` 같은 해당 지도의 도우미를 쓰고 `evidence`와 `asOf`를 단다.
6. 아래 검증을 모두 실행한다.

## 10. 검증

```bash
# 도감·지도·도식·샘플·화면 계약
pnpm exec vitest run \
  apps/web/src/domains/legal/technology/engineering-atlas-content.test.ts \
  apps/web/src/domains/legal/technology/engineering-atlas-samples.test.ts \
  apps/web/src/domains/legal/technology/engineering-diagram.test.ts \
  apps/web/src/domains/legal/technology/engineering-map-content.test.ts \
  apps/web/src/domains/legal/technology/EngineeringAtlasPage.test.tsx
# 파일 줄 수 래칫
pnpm exec vitest run apps/web/src/shared/lib/__tests__/file-size-ratchet.test.ts
```

저장소 전체 게이트는 `pnpm harness:verify`(영향 영역 테스트 포함)와 `pnpm validate:architecture`다.
이 컨테이너 같은 16GB·스왑 없는 환경에서는 `vitest`·`tsc`를 동시에 여러 개 돌리지 않는다.

## 11. 알려진 한계

- 카드와 지도의 사실은 2026-10-07/08의 코드·문서 읽기와 일부 실행으로 확인했다. 운영 환경의 키 등록·대시보드 설정·실브라우저 효과·부하 시험 결과는 저장소로 확인할 수 없어 카드마다 "미확인"으로 표시했다.
- 공급자 무료 한도는 기록일(`asOf`) 기준이며 오래되면 틀린다.
- 코드 샘플은 단순화한 예제라 그대로 복사해 쓰는 용도가 아니다. 줄 수가 많은 샘플은 발표 슬라이드에서 글자가 작아진다(24줄 이하 권장).
- 일부 외부 문서(GitHub, Adobe, Phaser 등)는 이 환경의 프록시가 403으로 막아 링크 응답을 확인하지 못했다.
- 크롤링 정책(공개 정책 문구)과 수집 스크립트의 인증 모드가 서로 다른 점, DEPLOY.md의 Neon 서술 같은 **저장소 문서끼리의 불일치**는 이 자료가 고치지 않고 사용자 결정 사항으로 남겼다.
