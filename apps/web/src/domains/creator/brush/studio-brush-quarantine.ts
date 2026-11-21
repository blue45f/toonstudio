/**
 * V17.1 quarantine ledger — picker-exposure removal for presets the owner judged low-quality or
 * de-facto duplicates AFTER an in-group alternative was verified (사용자 지시: 그룹 내 대안이 있는
 * 저품질/중복만 제거하되, 제거가 기존 문서를 깨서는 절대 안 된다).
 *
 * Deliberately a leaf module with ZERO imports. The lazy catalogue boundary
 * (`studio-brush-catalog.ts`) filters its default listing on this set while the governance
 * manifest (`studio-brush-variant-group-manifest.ts`) re-exports it as the `quarantined`
 * lifecycle stage and fail-fasts when an entry loses its catalogue row or runtime contract.
 * Keeping the data here breaks the would-be cycle catalogue → manifest → catalogue.
 *
 * Quarantine removes EXPOSURE only (`USED_PRESET_DATA_PRESERVED`):
 * - persisted strokes keep replaying byte-identically — the id stays in `BRUSH_PRESETS`, keeps
 *   its full runtime contract, and must never converge to the pen safe-fallback (지침 3),
 * - `studioBrushCatalogItemById` keeps resolving the id for saved documents and favorites,
 * - no "숨김 포함" affordance exists today, so quarantined ids simply do not appear in any
 *   picker listing or search until they are delisted here.
 */

/**
 * One-line, owner-auditable reason per quarantined preset id — an entry without a reason is a
 * governance bug, so the id list itself is derived from this record.
 */
export const STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID: Readonly<Record<string, string>> =
  Object.freeze({
    // 2026-08-13/14 wave 3–4 quality/duplicate quarantine (details in git history & manifest test).
    "airbrush--stamp-soft":
      "preview \"soft\"(연속)로 선언됐지만 실측 edgePeriodicityScore 0.85 · period 7px 로 주기적 "
      + "능선이 보이는 품질 미달 — 같은 family 의 통과 대안이 다수 존재(지침 6).",
    "glitter--star-field":
      "선언된 engineVariant(star-dust)가 페인트 시점에 실재하지 않아 기본 glitter 모드로 그려지는 "
      + "사실상 중복 — 실제 star-dust 모드를 가진 star-dust와 기본 glitter가 그룹 내 대안(지침 6).",
    "screentone--sparse-grid":
      "선언된 engineVariant(성긴 격자)로 분기하는 렌더러가 없습니다 — 지름 해시를 빼면 동일 "
      + "기하에서 canonical(screentone)과 바이트 동일합니다. 남는 대안: screentone · crosshatch(지침 6).",
    "gpen--causal-round":
      "causal-ink \"round\" 프로파일 변형을 선언하지만 분기하는 렌더러가 없어 같은 레인의 "
      + "gpen--croquis-capsule 과 같은 그림 — 폭 정규화 픽셀 p95 0.00014. 그룹 내 대안 gpen · "
      + "gpen--croquis-capsule 이 노출 상태(지침 6).",
    "marker--chisel-ribbon":
      "angled-ribbon \"minus-30deg\" 치즐 프로파일 변형을 선언하지만 분기하는 렌더러가 없어 같은 "
      + "폭·투명도(18/0.7)의 canonical brush 와 같은 그림 — exact-id 프로필 SVG 바이트 동일(계약 감사). "
      + "그룹 내 대안 brush 가 노출 상태(지침 6).",

    // 2026-08-21~22 roster reduction wave (mechanical execution-signature / tip-footprint dedupe).

    // ── A. causal-ink:round:round:none:causal-pressure — 한 서명에 11종 ──────────
    // pen·fineliner·marker·marker-bold 가 굵기 2.2→28 을 덮습니다. (2026-08-22 제2차 축소로
    // 중간값 ballpoint·felt-tip 도 아래 A′ 항목으로 delist 됐습니다.)
    // 원래 다섯은 그 사이 값에 끼어 있을 뿐이라 실행 경로가 완전히 같습니다.
    "gel-pen":
      "pen 과 실행 서명이 동일(causal-ink:round:round:none:causal-pressure) — 굵기 3.8/불투명도 1 로 "
      + "fineliner(2.2)와 pen(6) 사이에 끼어 있을 뿐입니다. 대안: pen · fineliner(지침 6).",
    "glass-pen":
      "pen 과 실행 서명이 동일 — 선언된 \"잉크 흐름\"으로 분기하는 렌더러가 없어 굵기 3.1/농도 0.92 "
      + "차이만 남습니다. 대안: fineliner · pen(지침 6).",
    "ruling-pen":
      "pen 과 실행 서명이 동일 — \"잉크 간격\" 변형이 페인트 시점에 실재하지 않아 굵기 4.6 의 pen "
      + "입니다. 대안: pen · fineliner(지침 6).",
    "technical-pen":
      "pen 과 실행 서명이 동일하고 굵기 2.5/불투명도 1 로 fineliner(2.2/1)와 사실상 같은 선. "
      + "대안: fineliner · pen(지침 6).",
    "alcohol-marker":
      "pen 과 실행 서명이 동일 — 알코올 마커의 블리드가 실재하지 않고 굵기 20/농도 0.65 로 "
      + "marker(16/0.6)와 marker-bold(28/0.55) 사이에 끼어 있습니다. 대안: marker · "
      + "marker-bold(지침 6).",

    // ── A′. causal-ink:round — 2026-08-22 제2차 로스터 축소(사용자 지시 재확인) ──
    // 굵기·농도 축의 중간값만 더 정리합니다. 축 대표는 fineliner(2.2/1.0)·pen(6/1.0)·
    // marker(16/0.6)·marker-bold(28/0.55) 가 그대로 유지됩니다.
    "ballpoint":
      "pen 과 실행 서명이 동일(causal-ink:round:round:none:causal-pressure) — 굵기 3.5/농도 0.95 는 "
      + "fineliner(2.2/1.0)와 pen(6/1.0) 사이의 중간값입니다. 대안: pen · fineliner(지침 6).",
    "felt-tip":
      "pen 과 실행 서명이 동일 — 굵기 10/농도 0.85 로 pen(6/1.0)과 marker(16/0.6) 사이에 끼어 있는 "
      + "중간값입니다. 대안: pen · marker · marker-bold(지침 6).",

    // ── B. perfect-outline:gpen-taper — 한 서명에 6종 ────────────────────────────
    // studio-perfect-freehand.ts 는 school-pen/liner/mapping-pen 을 아예 "gpen" 으로 별칭
    // 처리합니다(:229-231). 남길 대표는 굵기 양끝의 gpen(7)과 maru-pen(2.4).
    // 2026-11-21 Wave V2-W2 복귀(DELISTED): school-pen·kaburapen은 @toonstudio/studio-brush-platform
    // 5대 딥펜 스프링-댐퍼 탄성 + 레일로딩 실연동(school-pen · kabura-pen 고유 물리 계수) 완료로 복귀.
    "liner":
      "perfect-outline gpen-taper 서명을 gpen 과 공유하고 perfect-freehand 별칭도 \"gpen\" — 굵기 5 의 "
      + "gpen. 대안: gpen · maru-pen(지침 6).",
    "mapping-pen":
      "perfect-outline gpen-taper 서명을 maru-pen 과 공유하고 perfect-freehand 별칭도 \"gpen\" — 굵기 "
      + "3.2 로 maru-pen(2.4)과 겹칩니다. 대안: maru-pen · gpen(지침 6).",

    // ── C. pencil-path:jitter:grain:procedural-grain:grain-jitter — 한 서명에 5종 ─
    // pencil(2.5) · colored-pencil(4.5) · pencil-6b(6)가 굵기 축을 이미 덮습니다.
    // (pencil--side-shade 는 서명이 달라 이 무리가 아니며, 2026-08-16 오측 철회 건이라 손대지 않음.)
    "soft-pencil":
      "pencil 과 실행 서명이 동일하고 굵기 5/농도 0.7 로 colored-pencil(4.5/0.82)·pencil-6b(6/0.9) "
      + "사이에 끼어 있습니다. 대안: pencil-6b · colored-pencil · pencil(지침 6).",
    "pencil-2b":
      "pencil 과 실행 서명이 동일하고 굵기 3.5/농도 0.88 로 pencil(2.5/0.85)과 같은 결. "
      + "대안: pencil · pencil-6b(지침 6).",

    // ── D. watercolor-dabs:diffuse:soft-diffuse:wet-edge — 한 서명에 7종 ──────────
    // watercolor(수채) · gouache(과슈) · inkwash-white-ink(화이트)만 남깁니다. (2026-08-22
    // 제2차 축소로 코어 ink-wash 도 아래 D′ 항목으로 delist 됐습니다 — 수묵은 전용 레인이 대안.)
    // 2026-09-01 inkwash-pen · inkwash-water-brush 복귀(DELISTED): 격리 사유였던
    // "watercolor 와 실행 서명이 동일한 확산 워시"는 더 이상 참이 아닙니다. 두 id 는
    // 포인터 시작부터 전용 Stam 유체 워시(studio-inkwash-fluid)를 타고, 물붓은 색소를
    // 올리지 않으며 공유 워시에서 미정착 잉크를 움직입니다. 복귀 조건(전용 실행 경로)이
    // 충족됐으므로 피커 노출을 되돌립니다. 같은 서명에 남은 bleed-wash 만 계속 격리합니다.
    "inkwash-bleed-wash":
      "ink-wash 와 실행 서명이 동일하고 농도까지 0.5 로 같아 굵기 36/30 차이만 남습니다. "
      + "대안: watercolor(지침 6).",

    // ── D′. watercolor-dabs:diffuse — 2026-08-22 제2차 로스터 축소 ────────────────
    // 코어 ink-wash 는 watercolor 와 실행 서명·값이 사실상 같고, 수묵 표현은 노출 레인
    // (ink-wash--sumi-core · ink-wash--bleed-halo · ink-wash--fiber-feather◆ ·
    // ink-wash--chroma-halo◆ · ink-wash--living-bake◆)이 전담합니다.
    "ink-wash":
      "watercolor 와 실행 서명이 동일(watercolor-dabs:diffuse:soft-diffuse:wet-edge)하고 굵기 30/농도 "
      + "0.5 는 watercolor(28/0.55)와 같은 결입니다. 수묵이 필요하면 ink-wash--sumi-core 등 수묵 레인이 "
      + "대안(지침 6).",

    // ── E. 수채/수묵 엔진 레인 — (tip, texture) 짝이 겹치는 레인 ──────────────────
    "watercolor--granulating":
      "watercolor--granular 과 tip(sponge)·texture(procedural-grain)가 같아 과립 번짐이라는 같은 결을 "
      + "두 번 파는 레인입니다. 대안: watercolor--granular · watercolor--edge-bloom(지침 6).",
    "watercolor--fluid-feather":
      "watercolor--edge-bloom 과 tip(sponge)·texture(wet-edge)가 같아 같은 번짐 결을 씁니다. "
      + "대안: watercolor--edge-bloom · watercolor--granular(지침 6).",
    "watercolor--dense-core":
      "ink-wash--sumi-core 와 tip(bristle)·texture(wet-edge)가 같은 농밀 코어 — 굵기 26/28 차이뿐. "
      + "대안: ink-wash--sumi-core · ink-wash--living-bake · watercolor(지침 6).",

    // ── F. stamp-dabs:ink:stamp-ink — 한 서명에 8종 ──────────────────────────────
    // ink-brush(8) · mypaint-cc0--kabura(6) · mypaint-cc0--marker-fat(24)로 굵기 축을 덮습니다.
    "gouache--flat-stamp":
      "이름은 과슈지만 ink-brush 와 실행 서명이 동일한 잉크 스탬프이고(선언과 실재 불일치), 굵기 26 은 "
      + "mypaint-cc0--marker-fat(24)와 겹칩니다. 과슈가 필요하면 gouache·gouache--matte-body 가 대안(지침 6).",
    "mypaint-cc0--calligraphy":
      "ink-brush 와 실행 서명이 동일하고 굵기 15 로 mypaint-cc0--marker-fat(24)·kabura(6) 사이에 "
      + "끼어 있습니다. 실제 캘리 촉이 필요하면 calligraphy·fountain-pen 이 대안(지침 6).",
    "mypaint-cc0--marker-small":
      "mypaint-cc0--marker-fat 과 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00001 로 레포 전체에서 가장 "
      + "강한 중복입니다. 대안: mypaint-cc0--marker-fat · ink-brush(지침 6).",
    "mypaint-cc0--slow-ink":
      "ink-brush 와 실행 서명이 동일하고 선언한 \"슬로우\" 속도 응답으로 분기하는 렌더러가 없습니다. "
      + "대안: ink-brush · mypaint-cc0--marker-fat(지침 6).",
    "mypaint-cc0--knife":
      "ink-brush 와 실행 서명이 동일해 나이프 자국이 실재하지 않습니다. 실제 나이프는 "
      + "oil--knife-edge · paint-tube 가 대안(지침 6).",

    // ── G. 나머지 MyPaint CC0 웨이브 중복 (17종 → 7종 샘플러) ─────────────────────
    "mypaint-cc0--spray":
      "mypaint-cc0--splatter 와 실행 서명이 동일하고 굵기 40/42·농도 0.6/0.7 차이뿐입니다. "
      + "대안: mypaint-cc0--splatter · spray · airbrush-fine(지침 6).",
    "mypaint-cc0--watercolor-expressive":
      "mypaint-cc0--watercolor-fringe 와 실행 서명이 동일(stamp-dabs:watercolor) — 굵기 30/34 차이뿐. "
      + "대안: mypaint-cc0--watercolor-fringe · wash-brush(지침 6).",
    "mypaint-cc0--charcoal":
      "charcoal--mypaint-stamp 와 실행 서명이 동일하고 굵기 14/13 로 겹칩니다. "
      + "대안: charcoal--mypaint-stamp · mypaint-cc0--dry-brush · charcoal(지침 6).",
    "mypaint-cc0--charcoal-tanda":
      "charcoal--mypaint-stamp 와 실행 서명이 동일하고 굵기 12/13 로 겹칩니다. "
      + "대안: charcoal--mypaint-stamp · charcoal--vine-soft · charcoal(지침 6).",
    "mypaint-cc0--oil-paint":
      "mypaint-cc0--ink-blot 과 실행 서명이 동일(stamp-dabs:mypaint:stamp-airbrush)이라 유화 몸체가 "
      + "실재하지 않습니다. 실제 유화는 oil · oil--filbert-ribbon · oil-impasto-heavy 가 대안(지침 6).",
    "mypaint-cc0--pastel":
      "pastel--soft-stamp 와 실행 서명이 동일하고 굵기 20/22·농도 0.72 로 같습니다. "
      + "대안: pastel--soft-stamp · pastel · pastel--cake-soft 대신 pastel-paper-soft(지침 6).",

    // ── H·I. 유화 리본 / 압출 레인 ────────────────────────────────────────────────
    "brush--oil-lanes":
      "oil 과 실행 서명이 동일(oil-ribbon:bristle-lanes) — 굵기 16 의 oil 입니다. "
      + "대안: oil · oil--filbert-ribbon(지침 6).",
    "acrylic--stiff-ribbon":
      "oil--flat-ribbon 과 tip(hard)·texture(procedural-bristle)가 같은 경질 평면 리본입니다. "
      + "대안: oil--flat-ribbon · acrylic · oil--impasto-ribbon(지침 6).",
    "oil--tube-extrude":
      "paint-tube 와 실행 서명이 동일(dynamic-dabs:extruded-bead-ribbon) — 굵기 32/30 차이뿐. "
      + "대안: paint-tube · oil--impasto-ribbon(지침 6).",
    "acrylic--polymer-flat":
      "paint-tube 를 캐노니컬로 공유하는 hard 평면 레인이라 oil--knife-edge 와 같은 자국을 남깁니다. "
      + "대안: oil--knife-edge · paint-tube · oil--flat-ribbon(지침 6).",

    // ── H′. oil-ribbon:bristle-lanes — 2026-08-22 제2차 로스터 축소 ───────────────
    // 코어 acrylic 은 oil 과 서명·값이 사실상 같고, 유화 변주는 노출 레인(filbert·flat·
    // impasto·impasto-relief◆·bristle-depletion◆·bristle-physics◆)이 전담합니다.
    "acrylic":
      "oil 과 실행 서명이 동일(oil-ribbon:bristle-lanes)하고 굵기 20/농도 0.95 는 oil(22/0.92)과 같은 "
      + "결입니다. 대안: oil · oil--filbert-ribbon · oil--flat-ribbon(지침 6).",

    // ── J. 에어브러시·스프레이 ────────────────────────────────────────────────────
    "marker--soft-dynamic":
      "soft-brush 와 실행 서명이 동일(dynamic-dabs:soft-brush) — 굵기 20/36 차이뿐이고 마커 특유의 "
      + "균일 도포가 실재하지 않습니다. 대안: soft-brush · airbrush · marker(지침 6).",
    "airbrush--hard-envelope":
      "hard-airbrush 와 실행 서명이 동일 — 굵기 30/28·농도 0.78/0.76 차이뿐입니다. "
      + "대안: hard-airbrush · airbrush(지침 6).",
    "airbrush--klecks-grit":
      "airbrush 와 tip(soft-particle)·texture(custom-alpha-capable)가 같아 같은 입자 확산을 씁니다. "
      + "대안: airbrush · airbrush-fine · spray(지침 6).",
    "spray--equal-area":
      "spray 와 tip(flake)·texture(custom-alpha-capable)가 같은 산란 레인 — 굵기 44/40 차이뿐. "
      + "대안: spray · splatter · ink-particle--scatter-cloud(지침 6).",
    "splatter--burst-cloud":
      "splatter 와 tip(flake)·texture(custom-alpha-capable)가 같은 산란 레인 — 굵기 48/45 차이뿐. "
      + "대안: splatter · spray · ink-particle--scatter-cloud(지침 6).",
    // 2026-11-21 Wave V2-W2 복귀(DELISTED): web-smudge-trail은 고유 web-smudge-trail-ghost 레인 및
    // 플래너 품질 감사(errorCount=0, 지문 충돌 0) 충족으로 노출 복귀.

    // ── K. 서명이 완전히 동일한 레인 별칭 ─────────────────────────────────────────
    "pen--perfect-taper":
      "perfect-ink 와 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00021. 대안: perfect-ink · gpen(지침 6).",
    "calligraphy--perfect-chisel":
      "perfect-marker 와 실행 서명이 동일 — 폭 정규화 픽셀 p95 0.00002. "
      + "대안: perfect-marker · calligraphy(지침 6).",
    "pencil--erodible-wear":
      "erodible-pencil 과 실행 서명이 동일(dynamic-dabs:progressive-wear-ribbon) — 굵기 8/7 차이뿐. "
      + "대안: erodible-pencil · pencil(지침 6).",
    "pencil--stamp-grain":
      "pencil-grain 과 실행 서명이 동일(stamp-dabs:pencil) — 굵기 5/4 차이뿐입니다. "
      + "대안: pencil-grain · mypaint-cc0--2b-pencil · pencil(지침 6).",
    "sparkle-star":
      "glitter 와 실행 서명이 동일(particle-scatter:glitter:spark) — 별 모양으로 분기하는 렌더러가 "
      + "없습니다. 실제 별은 star-dust, 기본 반짝임은 glitter 가 대안(지침 6).",

    // ── L. 건식 재료 레인 ─────────────────────────────────────────────────────────
    "chalk--klecks-powder":
      "chalk 와 tip(sponge)·texture(custom-alpha-capable)가 같아 같은 분필 가루 결입니다. "
      + "대안: chalk · charcoal--vine-soft · pastel(지침 6).",
    "pastel--cake-soft":
      "pastel 과 tip(sponge)·texture(custom-alpha-capable)가 같아 같은 파스텔 결입니다. "
      + "대안: pastel · pastel--soft-stamp · chalk(지침 6).",
    "crayon--wax-scrape":
      "crayon 과 tip(hard)·texture(custom-alpha-capable)가 같아 같은 왁스 결입니다. "
      + "대안: crayon · crayon--klecks-stamp · charcoal--compressed-edge(지침 6).",
    "oil-pastel--waxy-film":
      "oil-pastel 과 tip(bristle)·texture(custom-alpha-capable)가 같아 같은 유성 필름 결입니다. "
      + "대안: oil-pastel · oil-pastel--wgm-mix(지침 6).",

    // ── M. 웻엣지 스탬프 ──────────────────────────────────────────────────────────
    "watercolor--edge-stamp":
      "wash-brush 와 실행 서명이 동일(stamp-dabs:watercolor:stamp-wet-edge) — 굵기 28/26 차이뿐. "
      + "대안: wash-brush · mypaint-cc0--watercolor-fringe · watercolor(지침 6).",

    // ── P. 프로 팩 — 팁 발자국(런타임·모티프·팁 레이어)이 같은 무리 ────────────────
    // 프로 팩의 질감 정체성은 (런타임, 팁 모티프/알파맵, 팁 레이어)가 전부입니다. 발자국이 같은
    // 브러시끼리는 softness·spacing·scatter·roundness·angle·flow·grain·colorDynamics·taper 로만
    // 갈리는데, 그 값은 전부 브러시 동역학 편집기의 슬라이더입니다. 아래는 발자국별로 실제 폭·밀도
    // 범위를 대표하는 소수만 남기고 delist 한 결과이며, 고유 알파맵 모티프를 가진 68종과
    // studio-brush-continuity-audit 가 핀으로 고정한 희소 5종은 전부 그대로 노출됩니다.

    // P1. dry-media|grain (11종) → precision-pencil · pencil-4b-rough · crayon-wax-bold · bumpy-grain
    "powder-sketch":
      "dry-media/grain 발자국을 pencil-4b-rough 와 공유하고 softness 0.355 는 pencil-colored-soft 와 "
      + "동일 — 굵기 7 도 같습니다. 대안: pencil-4b-rough · precision-pencil(지침 6).",
    "chalk-powder":
      "dry-media/grain 발자국을 bumpy-grain 과 공유하고 grain scale 9.4 까지 같아 굵기·농도만 다릅니다. "
      + "대안: crayon-wax-bold · velvet-charcoal · bumpy-grain(지침 6).",
    "rough-grain":
      "dry-media/grain 발자국 무리에서 grain 0.395 를 bumpy-grain 과 공유하고 굵기 20 은 그 사이 값입니다. "
      + "대안: bumpy-grain · rock-texture(지침 6).",
    "sand-texture":
      "dry-media/grain 발자국 무리에서 grain 0.395 를 bumpy-grain 과 공유 — 스캐터 0.27 도 슬라이더 값입니다. "
      + "대안: bumpy-grain · sponge-stipple-dab(지침 6).",
    "pencil-colored-soft":
      "dry-media/grain 발자국·softness 0.355 를 powder-sketch 와 공유하고 굵기 7 도 같습니다. 색연필은 "
      + "코어 colored-pencil 이, 무른 연필 결은 pencil-4b-rough 가 대안(지침 6).",
    "pencil-tilt-shading":
      "dry-media/grain 발자국 무리에서 spacing 0.194·softness 0.135 를 chalk-powder 와 공유합니다. "
      + "대안: pencil-4b-rough · side-graphite-shade(지침 6).",
    "watercolor-dry-granule":
      "이름은 수채지만 dry-media 런타임이라 웻엣지가 실재하지 않고, grain scale 4.8 은 sand-texture 와 "
      + "같습니다. 실제 수채는 코어 watercolor·watercolor--granular 가 대안(지침 6).",

    // P2. ink-particle|hard|chisel-alpha (10종) → horizontal-blade · vertical-blade
    //     · calligraphy-tilt-nib · marker-wide-chisel
    "oval-shading":
      "ink-particle 사선 촉 알파맵을 10종이 공유하는 무리에서 roundness 0.48 은 clean-flat(0.44)과 겹칩니다. "
      + "대안: horizontal-blade · directional-flat(지침 6).",
    "clean-flat":
      "같은 사선 촉 알파맵 무리에서 roundness 0.44·angle -10.5° 로 clean-flat-marker(0.42/-14.5°)와 "
      + "사실상 같은 자국입니다. 대안: horizontal-blade · directional-flat(지침 6).",
    "rhythm-flat":
      "같은 사선 촉 알파맵 무리에서 clean-flat 과 spacing 만 다릅니다(0.369 vs 0.153 — 슬라이더 값). "
      + "대안: horizontal-blade · marker-wide-chisel(지침 6).",
    "clean-flat-marker":
      "같은 사선 촉 알파맵 무리에서 clean-flat 과 roundness·angle 이 겹칩니다. "
      + "대안: marker-wide-chisel · transparent-flat · hard-oval(지침 6).",
    "alcohol-chisel-marker":
      "같은 사선 촉 알파맵 무리에서 angle -23.5° 로 calligraphy-tilt-nib(-33.5°)과 marker-wide-chisel "
      + "(-33.5°) 사이 값입니다. 대안: marker-wide-chisel · calligraphy-tilt-nib(지침 6).",
    "acrylic-stiff-flat":
      "같은 사선 촉 알파맵 무리이고, 두꺼운 아크릴 몸체는 코어 acrylic·oil--flat-ribbon 이 실제 리본으로 "
      + "그립니다. 대안: gouache-grain-flat · directional-flat · acrylic(지침 6).",

    // P3. dry-media|sponge (10종) → velvet-charcoal · compressed-charcoal-edge
    //     · pastel-paper-soft · sponge-stipple-dab · rock-texture
    "chalk-rough":
      "dry-media/sponge 발자국을 compressed-charcoal-edge 와 공유하고 spacing 0.319/0.312 까지 같습니다. "
      + "대안: velvet-charcoal · compressed-charcoal-edge(지침 6).",
    "strong-rough-grain":
      "dry-media/sponge 발자국 무리에서 spacing 0.187·scatter 0.108 을 rock-texture 와 공유합니다. "
      + "대안: rock-texture · velvet-charcoal(지침 6).",
    "heavy-rough-grain":
      "dry-media/sponge 발자국 무리에서 grain 0.505 를 rock-texture 와 공유 — 굵기 36/38 차이뿐. "
      + "대안: rock-texture · sponge-stipple-dab(지침 6).",
    "plaster-texture":
      "dry-media/sponge 발자국 무리에서 chalk-rough·rock-texture 와 축별 최대 차이가 0.16 에 불과합니다. "
      + "대안: rock-texture · velvet-charcoal(지침 6).",
    "pencil-charcoal-stick":
      "dry-media/sponge 발자국 무리에서 spacing 0.190·scatter 0.108 을 rock-texture·plaster 와 공유합니다. "
      + "대안: velvet-charcoal · compressed-charcoal-edge · side-graphite-shade(지침 6).",

    // P4. ink-particle|round (8종) → g-pen-flex · spoon-pen-round · round-shading
    //     · hard-oval · smooth-oval
    "classic-marker":
      "ink-particle/round 발자국 무리에서 roundness 0.96 으로 round-shading(1.0)과 같은 자국이고 굵기 18 도 "
      + "같습니다. 대안: round-shading · hard-oval · 코어 marker(지침 6).",
    "round-paint":
      "ink-particle/round 발자국 무리에서 roundness 0.94 로 round-shading 과 겹치고 굵기만 24/18 다릅니다. "
      + "대안: round-shading · opaque-gouache(지침 6).",
    "watercolor-detail-round":
      "ink-particle/round 발자국 무리에서 softness 0.085 를 round-shading·g-pen-flex 와 공유하고, 이름과 달리 "
      + "웻엣지가 없습니다. 대안: spoon-pen-round · 코어 watercolor(지침 6).",

    // P5. ink-particle|hard (7종) → core-round · technical-needle-ink · maru-pen-fine
    //     · ink-splatter-burst · stage-safe-splatter
    "crisp-ink":
      "ink-particle/hard 발자국 무리에서 core-round 와 축별 최대 차이 0.12 — 팩 전체에서 가장 가까운 쌍입니다. "
      + "대안: core-round · maru-pen-fine(지침 6).",
    "milli-pen-uniform":
      "ink-particle/hard 발자국 무리에서 roundness 1.0 을 core-round 와 공유하고 굵기 4 는 maru-pen-fine(3)과 "
      + "겹칩니다. 대안: core-round · maru-pen-fine · technical-needle-ink(지침 6).",

    // P6. airbrush|soft (7종) → mist-soft · watercolor-wet-bleed · bokeh-scatter
    //     · marker-colorless-blender
    "cloud-soft":
      "airbrush/soft 발자국 무리에서 mist-soft 와 축별 최대 차이 0.18 — 굵기 36/52 차이가 대부분입니다. "
      + "대안: mist-soft · marker-colorless-blender(지침 6).",
    "airbrush-grand-soft":
      "airbrush/soft 발자국 무리에서 spacing 0.09·scatter 0.025 로 mist-soft 와 같고 굵기 64/52 만 다릅니다. "
      + "대안: mist-soft · 코어 airbrush(지침 6).",
    "watercolor-wet-wash":
      "airbrush/soft 발자국 무리에서 watercolor-wet-bleed 와 spacing·scatter·grain amount 가 모두 같습니다 — "
      + "airbrush 런타임이라 웻엣지도 실재하지 않습니다. 대안: watercolor-wet-bleed · 코어 watercolor(지침 6).",

    // P7·P8. dry-media|bristle / dry-media|hard|chisel-alpha
    "fiber-marker":
      "dry-media/bristle 발자국 무리에서 taper-brush-marker 와 spacing 0.149·scatter 0.0686·softness 0.3 이 "
      + "전부 동일합니다. 대안: taper-brush-marker · oil-dry-scumble(지침 6).",
    "fiber-sketch":
      "dry-media/bristle 발자국 무리에서 spacing 0.194·scatter 0.109 를 oil-dry-scumble 계열과 공유합니다. "
      + "대안: oil-dry-scumble · pencil-4b-rough · 코어 charcoal(지침 6).",
    "scattered-flat":
      "dry-media 사선 촉 알파맵 무리에서 directional-flat 과 spacing 0.196/0.192·scatter 0.109 가 같습니다. "
      + "대안: directional-flat · gouache-grain-flat(지침 6).",
    "chalk-compressed":
      "dry-media 사선 촉 알파맵 무리에서 spacing 0.189·scatter 0.085 를 side-graphite-shade 와 공유합니다. "
      + "대안: side-graphite-shade · compressed-charcoal-edge · velvet-charcoal(지침 6).",

    // P9·P10·P11. sumi / sponge 3종 무리
    "paint-ink":
      "ink-particle/sumi 발자국 무리에서 flex-ink 와 축별 최대 차이 0.20 — 굵기 20/9 가 대부분입니다. "
      + "대안: flex-ink · brush-pen-ink(지침 6).",
    "watercolor-edge-stain":
      "airbrush/sponge 발자국 무리에서 bleeding-stain 과 spacing 0.09·scatter 0.0475 가 같고, airbrush "
      + "런타임이라 수채 가장자리가 실재하지 않습니다. 대안: bleeding-stain · 코어 watercolor(지침 6).",
    "broken-nib-ink":
      "dry-media/sumi 발자국 무리에서 rough-ink 와 spacing 0.153/0.149·scatter 0.0888 이 같습니다. "
      + "대안: rough-ink · sumi-wash-fray(지침 6).",

    // P-pairs. 발자국이 같은 2종 쌍 중 실제로 구분되지 않는 것
    "angular-square":
      "정사각 알파맵을 pixel-square 와 공유하고 roundness 1.0 도 같아 굵기 18/8 만 다릅니다. "
      + "대안: pixel-square · line-block · horizontal-blade(지침 6).",
    "watercolor-flat-wash":
      "airbrush 사선 촉 알파맵을 transparent-flat 과 공유하고 축별 최대 차이 0.18 — airbrush 런타임이라 "
      + "수채 워시가 실재하지 않습니다. 대안: transparent-flat · 코어 watercolor(지침 6).",
    "foliage-broad-canopy":
      "잎송이 알파맵과 팁 레이어를 leaf-cluster 와 공유하고 scatter 0.62/0.39 차이만 남습니다. "
      + "대안: leaf-cluster · round-leaf(지침 6).",

    // 2026-08-27 kernel coverage audit (full provenance in studio-brush-variant-group-manifest.test.ts).
    "dry-media":
      "커널 리워크가 재질 자식들만 커널 경로로 옮기고 우산 id 는 제네릭 파이프라인에 남아 실측 "
      + "잉크 에너지가 crayon 의 1/18 인 유령선을 그립니다(릴리스 centroid 12.3px 드리프트 포함) — "
      + "crayon · chalk · charcoal · pastel · oil-pastel 이 그룹 내 대안(지침 6).",
    "charcoal--vine-soft":
      "커널 리워크에서 엔진 레인 id 가 제네릭 파이프라인에 남아 9px 탭의 잉크 에너지가 "
      + "charcoal 의 1/30, 피크 알파 0.066–0.075 로 가시성 임계(≈0.063)에 걸친 유령선을 "
      + "그립니다(프로덕션 브라우저 감사 빠른 단획 게이트 확률적 실패 5회 실측) — "
      + "charcoal · chalk · pastel 이 그룹 내 대안(지침 6).",
    // 2026-11-21 Wave V2-W2 DELISTED: oil-pastel--wgm-mix & mypaint-cc0--watercolor-fringe passed audit.

    // -----------------------------------------------------------------------
    // 2026-09-02 feel-cull (ChatGPT 소스 보고서 + 사용자 지시: 비슷한 느낌 줄이기).
    // Listed uniqueness: execution signature unless a real renderer branch (alias wash/
    // pressure, calligraphy nib, Stam fluid) distinguishes the pair; pro pack tip
    // footprint (runtime + motif/alpha + layers + 45° angle). Keep one representative
    // per colliding group. Experimental mypaint pins resolved first.
    // -----------------------------------------------------------------------

    "fineliner":
      "pen 과 실행 서명이 동일(causal-ink:round) — 직경 스케일 0.48 은 굵기 슬라이더로 "
      + "재현됩니다. 대안: pen(지침 6).",
    "marker-bold":
      "marker 와 실행 서명이 동일하고 거의 평탄한 필압만 더 넓습니다. 대안: marker(지침 6).",
    "pencil-6b":
      "pencil 과 실행 서명이 동일(pencil-path:jitter) — 소프트 에지 패스는 노출 "
      + "soft-pencil 레인과 겹칩니다. 대안: pencil(지침 6).",
    "colored-pencil":
      "pencil 과 실행 서명이 같고 한 패스 코어만 있어 색연필 재료가 실재하지 않습니다. "
      + "대안: pencil(지침 6).",
    "flat-brush":
      "brush 와 실행 서명이 동일(angled-ribbon:minus-30deg) — 굵기 18/10 차이뿐입니다. "
      + "대안: brush(지침 6).",
    "crosshatch":
      "screentone 와 실행 서명이 동일(screentone-dots:global-grid) — 교차 해칭으로 "
      + "분기하는 렌더러가 없습니다. 실제 교차선은 web-cross-hatch-pen, 톤은 screentone"
      + "(지침 6).",
    "mypaint-cc0--kabura":
      "ink-brush 와 실행 서명이 동일(stamp-dabs:ink) — 굵기 6/8 의 같은 잉크 스탬프. "
      + "대안: ink-brush(지침 6).",
    "mypaint-cc0--marker-fat":
      "ink-brush 와 실행 서명이 동일 — 굵기 24 의 같은 잉크 스탬프. 대안: ink-brush(지침 6).",
    "mypaint-cc0--splatter":
      "airbrush-fine 과 실행 서명이 동일(stamp-dabs:airbrush). 대안: airbrush-fine · "
      + "splatter(지침 6).",
    "mypaint-cc0--dry-brush":
      "charcoal--mypaint-stamp 와 실행 서명이 동일(stamp-dabs:charcoal). 대안: "
      + "charcoal--mypaint-stamp · charcoal(지침 6).",
    "mypaint-cc0--2b-pencil":
      "pencil-grain 과 실행 서명이 동일(stamp-dabs:pencil). 대안: pencil-grain · "
      + "pencil(지침 6).",

    "rock-texture":
      "dry-media/sponge 발자국을 velvet-charcoal 과 공유합니다. 대안: velvet-charcoal(지침 6).",
    "compressed-charcoal-edge":
      "dry-media/sponge 발자국을 velvet-charcoal 과 공유합니다. 대안: velvet-charcoal(지침 6).",
    "pastel-paper-soft":
      "dry-media/sponge 발자국을 velvet-charcoal 과 공유합니다. 대안: velvet-charcoal · "
      + "pastel(지침 6).",
    "sponge-stipple-dab":
      "dry-media/sponge 발자국을 velvet-charcoal 과 공유합니다. 대안: velvet-charcoal(지침 6).",
    "technical-needle-ink":
      "ink-particle/hard 발자국을 core-round 와 공유합니다. 대안: core-round(지침 6).",
    "maru-pen-fine":
      "ink-particle/hard 발자국을 core-round 와 공유합니다. 대안: core-round · maru-pen(지침 6).",
    "ink-splatter-burst":
      "ink-particle/hard 발자국을 core-round 와 공유합니다. 대안: core-round · splatter(지침 6).",
    "stage-safe-splatter":
      "ink-particle/hard 발자국을 core-round 와 공유합니다. 대안: core-round · splatter(지침 6).",
    "round-shading":
      "ink-particle/round 발자국을 g-pen-flex 와 공유합니다. 대안: g-pen-flex(지침 6).",
    "hard-oval":
      "ink-particle/round 발자국을 g-pen-flex 와 공유합니다. 대안: g-pen-flex(지침 6).",
    "smooth-oval":
      "ink-particle/round 발자국을 g-pen-flex 와 공유합니다. 대안: g-pen-flex(지침 6).",
    "spoon-pen-round":
      "ink-particle/round 발자국을 g-pen-flex 와 공유합니다. 대안: g-pen-flex · maru-pen(지침 6).",
    "bokeh-scatter":
      "airbrush/soft 발자국을 mist-soft 와 공유합니다. 대안: mist-soft(지침 6).",
    "watercolor-wet-bleed":
      "airbrush/soft 발자국을 mist-soft 와 공유하고 airbrush 런타임이라 웻엣지가 없습니다. "
      + "대안: mist-soft · watercolor(지침 6).",
    "marker-colorless-blender":
      "airbrush/soft 발자국을 mist-soft 와 공유합니다. 대안: mist-soft · marker(지침 6).",
    "bumpy-grain":
      "dry-media/grain 발자국을 precision-pencil 과 공유합니다. 대안: precision-pencil(지침 6).",
    "pencil-4b-rough":
      "dry-media/grain 발자국을 precision-pencil 과 공유합니다. 대안: precision-pencil · "
      + "pencil(지침 6).",
    "crayon-wax-bold":
      "dry-media/grain 발자국을 precision-pencil 과 공유합니다. 대안: precision-pencil · "
      + "crayon(지침 6).",
    "calligraphy-tilt-nib":
      "ink-particle 사선 촉 알파맵을 horizontal-blade 와 공유합니다. 대안: "
      + "horizontal-blade · calligraphy(지침 6).",
    "marker-wide-chisel":
      "ink-particle 사선 촉 알파맵을 horizontal-blade 와 공유합니다. 대안: "
      + "horizontal-blade · marker(지침 6).",
    "taper-brush-marker":
      "dry-media/bristle 발자국을 oil-linen-filbert 와 공유합니다. 대안: "
      + "oil-linen-filbert · marker(지침 6).",
    "oil-dry-scumble":
      "dry-media/bristle 발자국을 oil-linen-filbert 와 공유합니다. 대안: "
      + "oil-linen-filbert · oil(지침 6).",
    "side-graphite-shade":
      "dry-media 사선 촉 알파맵을 directional-flat 과 공유합니다. 대안: "
      + "directional-flat · pencil(지침 6).",
    "gouache-grain-flat":
      "dry-media 사선 촉 알파맵을 directional-flat 과 공유합니다. 대안: "
      + "directional-flat · gouache(지침 6).",
    "dust-mote-depth":
      "airbrush/grain 발자국을 particle-scatter 와 공유합니다. 대안: particle-scatter(지침 6).",
    "cloud-billow-soft":
      "airbrush/sponge 발자국을 bleeding-stain 과 공유합니다. 대안: bleeding-stain(지침 6).",
    "bristle-flat-streak":
      "dry-media 레이크 알파맵을 hatching-contour-rake 와 공유합니다. 대안: "
      + "hatching-contour-rake(지침 6).",
    "wood-knot-rake":
      "dry-media 레이크 레이어 발자국을 dry-rake 와 공유합니다. 대안: dry-rake(지침 6).",
    "sumi-wash-fray":
      "dry-media/sumi 발자국을 rough-ink 와 공유합니다. 대안: rough-ink(지침 6).",
    "bristle-round-loaded":
      "ink-particle/bristle 발자국을 oil-impasto-heavy 와 공유합니다. 대안: "
      + "oil-impasto-heavy · oil(지침 6).",
    "snow-flurry-flake":
      "ink-particle/flake 발자국을 free-stamp 와 공유합니다. 대안: free-stamp(지침 6).",
    "leaf-fall-flurry":
      "잎 레이어 발자국을 long-leaf 와 공유합니다. 대안: round-leaf · leaf-cluster(지침 6).",
    "sparkle-glint-cross":
      "ink-particle/star 발자국을 stardust-star-scatter 와 공유합니다. 대안: "
      + "stardust-star-scatter · glitter(지침 6).",
    "brush-pen-ink":
      "ink-particle/sumi 발자국을 flex-ink 와 공유합니다. 대안: flex-ink · brush-pen(지침 6).",

    // ── 2026-09-03 유사 브러시 축소 웨이브: 마크 거리 계측 ────────────────────────────
    // 노출 중인 절차 브러시 90종의 실제 materialize 결과에서 마크를 만드는 채널만 뽑아
    // 거리를 쟀습니다 — 팁 알파맵 픽셀 평균절대차(0.55) · 간격/산포/플로/부드러움/그레인
    // 스칼라(0.25) · 스탬프 각도(0.20). 시드는 그레인 위치만 옮기고 성격을 바꾸지 않아
    // 제외했습니다. 카테고리 내부 쌍만 후보로 봤습니다(지침: 그룹 내 대안이 있을 것).
    // foliage 는 전체 카탈로그에서 가장 조밀한 군집이었습니다: 0.12 미만 쌍 8개 중 6개가
    // 홑잎 4종(fresh-leaf · long-leaf · round-leaf · leaf-cluster) 사이에서 나왔고,
    // fresh↔long 0.0355 는 90종 전체에서 가장 가까운 쌍입니다. 홑잎 3종은 서로 0.064
    // 안에 들어오는 반면 잎송이는 어느 홑잎과도 0.08 이상 떨어져 있어, 홑잎 대표 하나와
    // 잎뭉치 하나를 남기는 편이 아티스트가 실제로 구분하는 축과 맞습니다.
    "fresh-leaf":
      "홑잎 마크 거리가 long-leaf 와 0.0355(90종 중 최근접) · round-leaf 와 0.0635 로 "
      + "같은 홑잎 도장이 셋 겹칩니다. 대안: round-leaf · leaf-cluster(지침 6).",
    "long-leaf":
      "홑잎 마크 거리가 fresh-leaf 와 0.0355 · round-leaf 와 0.0442 로 round-leaf 가 "
      + "그대로 대신합니다. 대안: round-leaf · leaf-cluster(지침 6).",
    // rake 는 hair/fur 촉이 다섯이고, fur-soft-clumps 가 그 사이에 끼어 양쪽 모두와
    // 가장 가깝습니다(hair-fiber 0.0494 · fine-hair-strands 0.1110). 털 표현은 같은
    // 카테고리의 airbrush 런타임 fur-undercoat-soft 가 다른 발자국으로 남습니다.
    "fur-soft-clumps":
      "머리카락 결과 마크 거리 0.0494 로 rake 카테고리에서 가장 가까운 쌍입니다. "
      + "대안: hair-fiber · fur-undercoat-soft(지침 6).",

    // ── 2026-08-27 web-soft-cloud: 같은 날 격리 후 같은 날 복귀(DELISTED) ────────────────
    // 격리 사유였던 "장경로 520px 획이 화면에 총 8px@delta6"는 web-drawing 키트 브리지의
    // 희소 경로 미보간이 원인이었습니다: 이 레인은 경로 스테이션마다 입자를 뿌리는데 희소
    // 경로에서는 스테이션이 양끝 2개뿐이라 몸통이 비어 있었습니다. densifySparseWebDrawingPathGaps
    // 수리 후 본 레인의 집중 브라우저 재검증(장경로 6/6 · 품질 정책 실패 0)을 거쳐 delist 합니다
    // — 같은 원인의 web-rainbow-flow · web-calligraphy-ribbon 도 같은 날 같은 수리로 복귀.

    // ── 2026-08-27 web-calligraphy-ribbon: 같은 날 격리 후 같은 날 복귀(DELISTED) ─────────
    // 격리 사유였던 "커밋이 리본 몸통을 잃음(양끝 캡만)"은 web-drawing 키트 브리지의 희소
    // 경로 미보간이 원인으로 확정되어 densifySparseWebDrawingPathGaps 로 수리되었습니다
    // (studio-web-drawing-stroke-bridge.ts — 커밋·SVG·라이브가 공유하는 단일 보간 권위).
    // 수리 후 장경로 6/6 재검증을 거쳐 여기서 delist 합니다.
  });

/** Frozen quarantine set consumed by the catalogue listing filter and the lifecycle resolver. */
export const STUDIO_BRUSH_QUARANTINED_PRESET_IDS: readonly string[] = Object.freeze(
  Object.keys(STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID),
);

const QUARANTINED_PRESET_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_BRUSH_QUARANTINED_PRESET_IDS,
);

export function isStudioBrushQuarantinedPresetId(brushId: unknown): boolean {
  return typeof brushId === "string" && QUARANTINED_PRESET_ID_SET.has(brushId);
}
