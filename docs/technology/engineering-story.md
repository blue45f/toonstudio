# ToonStudio Engineering Story

## Purpose

`/about/technology` is the public hub for how ToonStudio is built. It is not a dependency catalogue. It explains the product problem, engineering boundary, user value, tradeoff and inspectable evidence for each claim.

The same story is reused for:

- public product documentation;
- investor presentations;
- engineering seminars;
- study material;
- Remotion films and transcripts;
- open-source and rights review.

## Routes

| Route | Responsibility |
| --- | --- |
| `/about/technology` | hub: talk path (1 story → 2 playbook → 3 guides → 4 field notes → 5 deck) with a one-line purpose and reading time, architecture map, status counts |
| `/about/technology/story` | why and how it was built: every published chapter (40 at the time of writing, `PUBLISHED_ENGINEERING_CHAPTERS.length`) in eight themes, problem → decision → value → trade-off → evidence |
| `/about/technology/playbook` | reusable design principles and ten architecture decisions, with the benchmarks and AI workbench behind them |
| `/about/technology/guides` | step-by-step adoption: reuse blueprints (`#blueprints`), guides with steps and completion checks |
| `/about/technology/field-notes` | deep notes (workers, PWA, free-first AI/infrastructure, Blender/3D, Open APIs) and incidents and lessons (`#incidents`) |
| `/about/technology/deck` | presenter tool with three tracks: seminar talk (default, 30 minutes, 19 slides), executive brief (about 11 minutes, 11 slides) and deep lecture (about 45 minutes, 30 slides); the 120-minute workshop modules are listed on the same page |
| `/about/technology/videos` | Remotion storyboard, film treatments (`#film-treatments`) and review workflow |
| `/about/technology/references` | used, evaluated and inspiring technology plus reference products (`#reference-products`) |
| `/about/technology/atlas` | technology atlas: per-technology background, diagram, sample code, where it is used in the product and official references |
| `/about/technology/glossary` | plain-language glossary linked to story chapters, guides and references |
| `/about/technology/licenses` | code, asset, provider and AI rights layers |

All routes are public, lazy loaded, bilingual and own a specific document title while retaining the generic `route.about` fallback. The page list, one-line purposes, menu groups (core · present · resources) and reading times live in `engineering-tech-pages.ts`; the hub, the sub-navigation and the next-page pager all render from it.

## Status semantics

Status is part of the product claim and must not be chosen for marketing convenience.

| Status | Meaning |
| --- | --- |
| `live` | runs in the product or a verified delivery pipeline |
| `configured` | code and operating contract exist, but provider or environment setup is required |
| `experimental` | quality or compatibility is being validated and a fallback remains |
| `documented` | policy and decisions are maintained as public documentation |
| `planned` | implementation contracts and verification criteria are defined first |
| `retired` | excluded from current product scope |
| `reference-only` | optional integration that is not a source of truth |

Each chapter must contain at least one evidence path and at least two reuse steps. Evidence paths expose repository locations, never credentials or private endpoints.

## Content ownership

The typed sources of truth are split across several modules in `apps/web/src/domains/legal/technology/`. The published chapters come from four of them plus one aggregate, and the field notes have their own module:

```text
engineering-story-content.ts            # types, status metadata, chapters 1-15, their guides, license families, video format identifiers
engineering-story-deep-dive-content.ts  # chapters 16-25, their guides, ENGINEERING_REFERENCES, the troubleshooting archive
engineering-story-advanced-content.ts   # chapters 26-37 and their guides
engineering-story-followup-content.ts   # chapters 38-40
engineering-story-published-content.ts  # the public aggregate: PUBLISHED_ENGINEERING_CHAPTERS / PUBLISHED_ENGINEERING_GUIDES
engineering-field-notes-content.ts      # field notes, Open API adapters, troubleshooting cases, official references, reference-product adoption boundaries
```

`engineering-story-content.ts` stays the type and status authority; its `ALL_ENGINEERING_CHAPTERS` combines chapters 1-25, and the published aggregate adds chapters 26-40. Surfaces that show chapters or guides (hub, story, guides, deck, glossary links) read `PUBLISHED_ENGINEERING_*`, not the individual modules. Pages render from those records instead of maintaining separate claims.

Supporting sources:

- `engineering-talk-deck.ts` — the 30-minute talk: sections, per-slide seconds (section budgets are sums), speaker notes and the repository evidence behind every number;
- `engineering-seminar-curriculum.ts` — the lesson sequence behind the deep lecture track, and `engineering-playbook-content.ts` — principles, architecture decisions, benchmarks, the AI workbench and the 120-minute workshop modules;
- `engineering-tech-pages.ts` — the page list, one-line purposes, reading times and `ENGINEERING_CHAPTER_COUNT`, a fixed chapter count that lightweight surfaces such as the sitemap use so they do not import the chapter modules (`engineering-tech-pages.test.ts` compares it with `PUBLISHED_ENGINEERING_CHAPTERS.length`);
- `engineering-deck-model.ts` — one slide model for the screen, print/PDF and the offline HTML backup;
- `engineering-story-groups.ts` — the eight reading themes of the story (every chapter belongs to exactly one);
- `engineering-glossary-links.ts` — resolves glossary "read more" ids to story, guide or reference anchors;
- `engineering-deck-state.ts` — the presenter URL contract (`?track=talk#slide-3`; the older `?audience=seminar&duration=30#deck=seminar:9` still opens the same slide).

When adding a chapter:

1. define the user problem before naming technology;
2. state the chosen authority and responsibility boundary;
3. document user value and a real tradeoff;
4. attach code, test, workflow or document evidence;
5. give a reuse sequence that works without ToonStudio-specific secrets;
6. select the least promotional accurate status;
7. update tests if the chapter count or video contract changes: `ENGINEERING_CHAPTER_COUNT` in `engineering-tech-pages.ts` and the count pinned in `engineering-story-content.test.ts` move together, and pages that need a number should derive it from `PUBLISHED_ENGINEERING_CHAPTERS.length` instead of writing it by hand.

## Engineering field notes

`/about/technology/field-notes` captures implementation lessons that are useful beyond ToonStudio but too detailed for the chapter-level public narrative.

It currently covers:

- task-specific Web Worker protocols, transferables, cancellation, poisoned WASM workers and main-thread commit authority;
- PWA installation, request-class cache strategies, precache manifests, controlled activation and reload-loop recovery;
- browser-local ONNX/MediaPipe contracts, exact free-model allowlists, BYOK boundaries, quota ledgers, idempotency receipts and ambiguous AI failure handling;
- static-first and scale-to-zero infrastructure, hard application budgets and manually approved immutable releases;
- an allowlisted Blender MCP facade, headless DCC pipelines and digest-bound asset packages;
- a product-owned Scene3D document with Three WebGPU/WebGL2 as the primary runtime and lazy specialist engines;
- provider-specific Open API schema, rights, provenance, host and failure gates;
- AI-assisted engineering boundaries and real troubleshooting cases written as symptom → root cause → fix → prevention.

Every field note must include:

1. an accurate status;
2. the problem and the chosen reusable pattern;
3. a product-authority boundary;
4. at least four adoption steps;
5. existing repository evidence;
6. official references with a review date.

Open API entries never equate public access with redistribution permission. Reference-product entries distinguish applied workflow patterns, specialist tools, reference-only quality bars, planned evaluations and products deliberately not adopted.

## Authentication wording

The current provider allowlist is Google, Apple, Kakao, Naver and GitHub. Toss is not described as excluded merely because it is paid. Its product scope, review process and security operating model differ from a general web OAuth adapter. Provider policy and pricing must be rechecked at implementation time.

Public examples may contain environment variable names, but never client secrets, API keys, private endpoints, user identifiers or operations credentials.

## Testifly wording

Vitest, Playwright and repository verification scripts remain the source of truth for merge decisions. Testifly may be connected as an optional, human-readable QA catalogue and feedback portal. Until a real project connection and execution record exists, label it `reference-only`, not live.

## Remotion workflow

Remotion is used in two different ways. Do not describe them as one:

- **Pre-rendered files.** The 24-second brand film (`/brand-film`) is rendered offline by the isolated `tools/media/brand-film` package, and the website serves the finished MP4, poster and VTT files. The engineering films (`TechnologyStory*`) come from the same package as manual review artifacts and are not published by the pipeline (see below).
- **Runtime composition.** The 8-minute product tour (`/product-tour`, 504 seconds, nine chapters) is composed live in the browser. The web app depends on `remotion`, `@remotion/player` and the workspace package `@toonstudio/product-tour-film` and plays the shared composition with `<Player>` (`ProductTourPlayer.tsx`, `ProductTourRemotionComposition.tsx`). A compatibility MP4 player (`ProductTourMp4Player.tsx`) remains available through the compatibility-playback button or `?player=mp4`. The same composition is rendered to MP4 by `tools/media/brand-film`.

So the website does import Remotion for the product tour only; it does not import the `tools/media/brand-film` package. Remotion has its own license terms by organization size; the repository does not show whether the operating organization is eligible, so check the official licensing page before relying on either path commercially.

```bash
npm --prefix tools/media/brand-film ci
npm --prefix tools/media/brand-film run typecheck
npm --prefix tools/media/brand-film run studio
npm --prefix tools/media/brand-film run render:technology -- overview
npm --prefix tools/media/brand-film run render:technology -- investor
npm --prefix tools/media/brand-film run render:technology -- portrait
npm --prefix tools/media/brand-film run render:technology -- all
```

The manual `technology-story-film.yml` workflow:

1. checks out a reviewed commit;
2. installs the pinned Remotion toolchain;
3. typechecks every composition;
4. renders only the selected fixed identifier;
5. writes H.264 video, poster, Korean/English VTT, transcripts and a SHA-256 manifest;
6. uploads a 30-day review artifact;
7. never publishes, pushes or mutates `main`.

`technology-film-manifest.json` deliberately contains `reviewed: false` and `publishing: manual-after-human-review`. Distribution happens only after a person verifies captions, rights, product accuracy and output quality.

## License and rights review

Do not infer every right from npm package metadata. Track these separately:

- runtime and development code;
- WASM and static/dynamic linking structure;
- fonts, icons, images, brushes, 3D and sound;
- OAuth, cloud and other external service terms;
- AI model weights and hosted API terms;
- input references and generated output rights;
- trademark and branding conditions.

`pnpm audit:licenses` and the build-generated `THIRD_PARTY_NOTICES.generated.md` automate inventory and notice consistency. Commercial assets, copyleft combinations, external terms and AI rights still require accountable human review before release.

## Verification

The focused checks are:

```bash
pnpm exec vitest run \
  apps/web/src/domains/legal/technology \
  apps/web/src/app/routes/groups/about-routes.test.tsx \
  scripts/technology-story-film.test.mjs

npm --prefix tools/media/brand-film run typecheck
pnpm typecheck
pnpm lint:quick
```

The full repository CI remains authoritative before merge.

## 2026-09-30 변경 기록 — 세미나 대비 정보 구조 정리

- 페이지 목적을 겹치지 않게 다시 나눴습니다: 제작 스토리(왜·어떻게) → 플레이북(원칙·결정) → 적용 가이드(단계별 도입) → 심화 노트(깊은 노트·장애와 교훈) → 발표 모드(30분 슬라이드). 영상 구성안은 영상 페이지, 재사용 청사진은 가이드, 참고 제품은 참고 자료, 장애 기록은 심화 노트로 옮겼습니다.
- 발표 모드 주소는 `?track=talk#slide-3` 형식입니다. 이전 링크(`?audience=seminar&duration=30#deck=seminar:9`)도 같은 위치로 열리고 새 형식으로 바뀝니다. 발표자 창은 `?view=presenter`이며 같은 브라우저의 청중 화면과 슬라이드가 맞춰집니다.
- 단축키: ←/→·Space·PageUp/PageDown·Home/End 이동, 숫자+Enter 번호 이동, F 발표·전체 화면, N/S 노트, O 개요, B/. 블랙아웃, T 타이머, ? 도움말, Esc 닫기.
- 슬라이드의 설정 수치(방당 연결 64, 재개 창 10초, 근접 반경 160/220/200px, 허들 원격 3명, Render free·자동 배포 꺼짐, 앱 간 import 0)는 테스트가 실제 설정 파일과 대조합니다. 저장소 규모 수치(웹 테스트 파일 4,808개·E2E 49개·워크플로 97개)는 2026-09-30 git 집계값이며 자동 검증하지 않습니다.
- 한계: E2E 스펙(`e2e/engineering-seminar.spec.ts`, `e2e/engineering-story.spec.ts`)은 새 주소·단추 이름·페이지 이동에 맞춰 수정이 필요합니다. 운영 배포는 이 변경에 포함되지 않았고 `DEPLOY.md`의 별도 승인 절차를 따릅니다.

## 2026-10-08 변경 기록 — 발표 전 사실 정정

- 챕터 수 표기를 정정했습니다: 문서의 "31"을 현재 공개 챕터 수(40, `PUBLISHED_ENGINEERING_CHAPTERS.length`)로 바꾸고, 숫자가 꼭 필요한 화면은 데이터에서 파생하도록 했습니다. 가벼운 화면(사이트맵)은 `ENGINEERING_CHAPTER_COUNT`를 쓰고 테스트가 공개 챕터 수와 같은지 확인합니다.
- "웹사이트는 Remotion을 import하지 않는다"는 서술은 사실과 달라 고쳤습니다. 8분 제품 투어는 `@remotion/player`로 브라우저에서 실시간 합성하고 호환 MP4 재생을 곁들이며, 24초 브랜드 필름과 기술 영상만 사전 렌더 MP4입니다(위 Remotion workflow 참고).
- 챕터 정본 위치를 모듈 5개 구조(코어·심층·고급·후속·공개 집계)로 다시 적었습니다.
- E2E 스펙 두 개를 현재 UI에 맞췄습니다: 발표 모드는 트랙 3종(세미나 발표 30분·19장, 핵심 요약 11분·11장, 심화 강의 45분·30장)과 `?track=…#slide-N` 주소를 쓰고, 챕터·참고 카드·노트 개수는 화면이 말하는 수와 비교합니다.
