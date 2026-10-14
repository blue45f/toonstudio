# 타로 아트 25장 — 생성 provenance·권리 근거 기록

- 기록일: 2026-10-14. 기준: 레포 main의 파일 실측(바이트·SHA-256·크기·임베드
  메타데이터)과 git 이력. 기계판독용 동일 기록은 옆의 `provenance.json`.
- 배경: 라이선스 감사 REPORT 문제 10 — 소비 코드 주석의 "생성한 래스터 아트"라는
  서술만 있고 생성 도구·경로·권리 근거 문서가 없었다. 이 문서가 그 조치
  ("생성 경로와 권리 근거를 문서 한 장으로 남긴다")의 산출물이다.
- 법률 자문이 아닌 엔지니어링 기록이다. 확정할 수 없는 것은 확정으로 쓰지 않고
  "미기록"으로 명시한다.

## 구성 (25장)

메이저 아르카나 20장(`major-00~11·13·14·16~21`) + 마이너 슈트 대표 4장
(`suit-wands·cups·swords·pentacles`) + 카드 뒷면 1장(`tarot-back.jpg`).
소비 경로는 `apps/web/src/domains/fortune/tarot-art.ts`의 `getTarotArtPath`이며,
뒷면 파일은 이 모듈이 참조하지 않는 독립 에셋이다. 메이저 12·15번은 아트가
없는 것이 설계이며(폴백 벡터 페이스), `tarot-art.test.ts`가 이를 고정한다.

## 생성 경로 — 파일에서 확인되는 것

### WebP 24장 (메이저 20 + 슈트 4)

- 도입 커밋: `64a0f92dad` (2026-10-06) "feat(fortune): 사진풍 타로 카드 아트
  24종을 추가한다" — 프로젝트 소유자가 한 번에 직접 커밋했다. 외부 출처·스톡·
  상용 덱을 가리키는 기록은 레포 어디에도 없다.
- 레포 내 서술: `tarot-art.ts` 머리 주석 "달빛 관측소 무드로 생성한 래스터
  아트" — 프로젝트가 생성한 아트라는 것이 레포가 가진 유일한 생성 서술이다.
- 파일 실측: 전부 640×960, WebP VP8 청크만 있고 EXIF·XMP·C2PA 메타데이터가
  없다(웹 변환 과정에서 메타데이터가 제거된 형태).
- **미기록 사항: 생성 도구·모델·프롬프트·계정이 레포와 파일 어디에도 없다.**
  따라서 이 24장에 대해서는 특정 제공자 약관을 권리 근거로 인용하지 않는다
  (추측으로 도구를 적지 않는다). 소유자가 도구를 확인해 주면, 도구명과
  2026-10-06 당시 약관을 이 절에 append 한다.

### 카드 뒷면 1장 (`tarot-back.jpg`)

- 도입 커밋: `d3ea253303` (2026-06-23) "feat(fortune): add compatibility and
  today's fortune with tarot assets" (이후 `apps/web/` 이동은 경로 변경뿐).
- 파일에 **Google 서명 C2PA 매니페스트가 임베드**돼 있어 생성 제공자가 파일
  자체로 검증된다:
  - instance `urn:c2pa:267ab227-9c16-e2f7-f56c-4f94bc6460bb`, claim 생성기
    "Google C2PA Core Generator Library", 서명자 Google C2PA Media Services
    (Google LLC).
  - action `c2pa.created` — "Created by Google Generative AI",
    `digitalSourceType` = `trainedAlgorithmicMedia`(IPTC).
  - action `c2pa.edited` — 비가시 SynthID 워터마크 적용.
- 단, 매니페스트는 제공자(Google Generative AI)까지만 말하고 구체 제품·모델·
  계정은 밝히지 않는다.

## 권리 근거

- **뒷면(Google 생성분)**: Google 약관의 생성 콘텐츠 조항이 근거다 — Gemini
  API 추가 약관(2026-03-23 시행본, 2026-10-14 확인) "Use of Generated
  Content"와 Google 서비스 약관의 동일 취지 조항은, Google이 자사 서비스로
  생성된 콘텐츠에 대해 소유권을 주장하지 않으며 생성 콘텐츠의 사용 책임은
  사용자에게 있다고 정한다. 이 조항은 상업 사용을 별도로 제한하지 않는다.
- **WebP 24장**: 근거는 위 "프로젝트 소유자의 직접 커밋 + 생성 서술"이라는
  1차 제작 기록이다. 제3자 라이선스가 붙은 에셋이 아니며, 참조한 외부 소스가
  기록돼 있지 않다. 타로의 아르카나 주제·슈트 상징 자체는 전통적(퍼블릭
  도메인) 소재이지만, 그것만으로 개별 그림이 clear 되는 것은 아니므로 이
  기록의 근거는 소재가 아니라 제작 기록 쪽에 둔다.
- 공통 caveat: 순수 AI 생성물의 저작권 성립은 관할마다 다를 수 있고, 제공자가
  타 사용자에게 유사 출력을 낼 수 있다는 점은 약관도 인정한다. 이 기록은
  "기록된 생성 경로에 대한 약관·제작 근거"이지 저작권 등록 증명이 아니다.

## 파일별 실측표

전체 SHA-256은 `provenance.json`에 있다(여기는 앞 16자리).

| 파일 | 그룹 | 크기(px) | 바이트 | SHA-256 (앞 16) | provenance 상태 |
|---|---|---|---|---|---|
| `major-00.webp` | major-arcana | 640x960 | 68,316 | `0c98a48c230a24dd…` | first-party-generated-tool-unrecorded |
| `major-01.webp` | major-arcana | 640x960 | 91,256 | `934f53b9a32f3479…` | first-party-generated-tool-unrecorded |
| `major-02.webp` | major-arcana | 640x960 | 106,922 | `6fe28e38f79809fd…` | first-party-generated-tool-unrecorded |
| `major-03.webp` | major-arcana | 640x960 | 126,288 | `b8a24c931ef0b0a3…` | first-party-generated-tool-unrecorded |
| `major-04.webp` | major-arcana | 640x960 | 111,056 | `66c5754543e3871a…` | first-party-generated-tool-unrecorded |
| `major-05.webp` | major-arcana | 640x960 | 113,936 | `eef9e9b193d85eb7…` | first-party-generated-tool-unrecorded |
| `major-06.webp` | major-arcana | 640x960 | 105,882 | `92d7c9c444797b5c…` | first-party-generated-tool-unrecorded |
| `major-07.webp` | major-arcana | 640x960 | 131,206 | `0ef1b0bec6c5dc20…` | first-party-generated-tool-unrecorded |
| `major-08.webp` | major-arcana | 640x960 | 70,082 | `83ad82f663524705…` | first-party-generated-tool-unrecorded |
| `major-09.webp` | major-arcana | 640x960 | 84,568 | `afe640ad926608d9…` | first-party-generated-tool-unrecorded |
| `major-10.webp` | major-arcana | 640x960 | 149,530 | `d486cc8fc7a709af…` | first-party-generated-tool-unrecorded |
| `major-11.webp` | major-arcana | 640x960 | 94,996 | `3ae3df21044c371c…` | first-party-generated-tool-unrecorded |
| `major-13.webp` | major-arcana | 640x960 | 54,802 | `f6792a2ed3060bb4…` | first-party-generated-tool-unrecorded |
| `major-14.webp` | major-arcana | 640x960 | 100,198 | `6df5fedccf77e93c…` | first-party-generated-tool-unrecorded |
| `major-16.webp` | major-arcana | 640x960 | 88,584 | `432c930b139e2a92…` | first-party-generated-tool-unrecorded |
| `major-17.webp` | major-arcana | 640x960 | 108,150 | `cf1011593dabd7e2…` | first-party-generated-tool-unrecorded |
| `major-18.webp` | major-arcana | 640x960 | 102,558 | `699ef4ed234c9f50…` | first-party-generated-tool-unrecorded |
| `major-19.webp` | major-arcana | 640x960 | 99,236 | `f967d88c86708a3a…` | first-party-generated-tool-unrecorded |
| `major-20.webp` | major-arcana | 640x960 | 87,258 | `f9a7859e337de89d…` | first-party-generated-tool-unrecorded |
| `major-21.webp` | major-arcana | 640x960 | 127,016 | `dabdaab62f83a7f9…` | first-party-generated-tool-unrecorded |
| `suit-cups.webp` | minor-suit-representative | 640x960 | 104,348 | `1b8698d799d59a30…` | first-party-generated-tool-unrecorded |
| `suit-pentacles.webp` | minor-suit-representative | 640x960 | 135,600 | `be7579207be6873e…` | first-party-generated-tool-unrecorded |
| `suit-swords.webp` | minor-suit-representative | 640x960 | 68,114 | `aa06110e109cacbe…` | first-party-generated-tool-unrecorded |
| `suit-wands.webp` | minor-suit-representative | 640x960 | 58,736 | `65a75a16fa514346…` | first-party-generated-tool-unrecorded |
| `tarot-back.jpg` | card-back | 848x1264 | 1,286,465 | `44389080f7142af2…` | provider-evidenced-ai-generated |

## 유지 규칙

- 이 폴더에 아트를 추가·교체하면 같은 커밋에서 이 문서와 `provenance.json`에
  파일 행과 생성 경로(도구·모델·날짜·약관 근거)를 함께 남긴다. 메타데이터가
  있는 원본(C2PA 등)은 웹 변환으로 지우기 전에 그 사실을 먼저 기록한다.
- 파일을 교체하면 SHA-256이 달라지므로 표를 갱신한다 — 해시가 어긋나는
  파일은 이 기록의 근거를 승계하지 않는다.
