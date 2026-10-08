import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { commentedCode, t } from "./engineering-atlas-drawing-kit";

/**
 * 기술 도감 · drawing · 입력과 획 모델 카드.
 * 펜이 준 점이 어떻게 걸러지고(포인터 계약), 다듬어지고(보정), 저장되고(재계획), 그릴 표면에 배정되는지(라우트)를 다룬다.
 */

const POINTER_INPUT = "apps/web/src/domains/creator/canvas/studio-pointer-input.ts";

export const ENGINEERING_ATLAS_DRAWING_INPUT: readonly EngineeringAtlasEntry[] = [
  {
    id: "pointer-input-contract",
    category: "drawing",
    name: "Pointer Events",
    title: t("펜이 지나간 점과 브라우저가 짐작한 점 나누기", "Telling points the pen touched from points the browser guessed"),
    status: "live",
    tagline: t("하드웨어가 준 샘플만 저장하고, 예측 샘플은 미리보기에만 씁니다.", "Only hardware samples are stored; predicted samples are for preview only."),
    background: [
      t(
        "펜은 1초에 120~240번 위치를 알려 주지만, 브라우저는 화면이 갱신되는 속도(보통 60번)에 맞춰 이 이벤트를 묶어서(coalesce) 한 번에 전달합니다. 묶음만 쓰면 빠르게 그은 곡선이 각져 보입니다. 그래서 ToonStudio 는 묶음을 풀어 중간 점을 모두 되살려 쓰고, 브라우저가 '아마 다음엔 여기'라고 짐작한 점(예측)은 화면에 그리기만 할 뿐 작품에 저장하지 않습니다.",
        "A pen reports its position 120 to 240 times a second, but the browser batches (coalesces) those events to match the screen refresh, usually 60 per second. Using only the batch makes fast curves look angular. ToonStudio unpacks each batch to recover every intermediate point, and points the browser merely guesses (predictions) are drawn on screen but never saved into the artwork.",
      ),
      t(
        "한 번의 pointermove 에서 getCoalescedEvents() 로 하드웨어 샘플을 꺼내 브라우저가 준 순서 그대로 씁니다. 시간순으로 다시 정렬하지 않는 이유는 정밀도가 낮은 타이머에서는 같은 시각이 흔해서, 정렬하면 오히려 선이 꺾이기 때문입니다. 직전 전달분과 겹치는 앞부분은 KMP 문자열 일치 알고리즘으로 걸러 같은 점이 두 번 들어가지 않게 하고, 압력·기울기·회전·접촉 크기는 범위를 검사해 이상한 값은 사유와 함께 거절합니다.",
        "From each pointermove the code takes the hardware samples via getCoalescedEvents() and keeps the browser's delivery order. It does not re-sort by time, because low-precision timers often produce equal timestamps and sorting would kink the line. The prefix that overlaps the previous delivery is removed with the KMP string-matching algorithm so no point enters twice, and pressure, tilt, rotation and contact size are range-checked, with bad values rejected and a reason recorded.",
      ),
      t(
        "대안과 선택: pointerrawupdate(묶기 전 이벤트)는 더 일찍 오지만 처리된 스트림과 주기가 달라 두 경로가 같은 픽셀을 소유하게 될 수 있어 영구 잉크에는 쓰지 않고, 펜이 닿아 있는 동안 커서·가이드·임시 잉크 미리보기 같은 화면 전용 표시에만 씁니다. 예측은 펜에서만, 브라우저가 getPredictedEvents 를 지원하고 '움직임 줄이기' 설정이 꺼져 있을 때만 켭니다(마우스·터치는 손바닥·스크롤 동작을 검증하기 전까지 제외). 예측이 틀려도 영구 표면은 추가만 되므로 이미 확정된 픽셀은 지워지지 않습니다.",
        "Alternatives and choices: pointerrawupdate (events before batching) arrives earlier, but its cadence differs from the processed stream and two paths could end up owning the same pixels, so it is not used for permanent ink; while the pen is in contact it only drives screen-only visuals such as the cursor, the guide and a temporary ink preview. Prediction is enabled only for pens, only when the browser supports getPredictedEvents and the reduced-motion preference is off (mouse and touch are excluded until palm and scroll behavior is verified). If a guess is wrong, the permanent surface only ever grows, so no confirmed pixel is erased.",
      ),
      t(
        "저지연 한 단락: 임시 잉크를 그리는 캔버스는 desynchronized 힌트(브라우저의 일반 합성 절차를 건너뛰고 화면에 더 빨리 올리는 모드)를 요청하고, 요청이 예외를 일으키는 구형 WebView에서는 일반 2D 컨텍스트로 돌아갑니다. 확정된 문서 레이어는 요청하지 않으며, 그 이유(화면 찢김과 읽기 비용)는 아직 제품에 연결되지 않은 정책 모듈(studio-lowlatency-surface-policy.ts)의 주석에 정리돼 있습니다. 요청이 실제로 받아들여졌는지는 브라우저와 기기마다 달라서, 이 카드는 지연 수치를 약속하지 않습니다.",
        "A word on low latency: canvases that draw temporary ink request the desynchronized hint, a mode that skips the browser's usual compositing step to put pixels on screen sooner, and fall back to a plain 2D context in older WebViews where the request throws. Committed document layers do not request it; the reasons (page tearing and readback cost) are written in the comments of a policy module (studio-lowlatency-surface-policy.ts) that is not yet wired into the product. Whether the request is honored differs per browser and device, so this card promises no latency figure.",
      ),
    ],
    keyPoints: [
      t("하드웨어 샘플은 저장, 예측 샘플은 미리보기만", "Hardware samples are saved; predictions only preview"),
      t("겹쳐 전달된 앞부분은 KMP로 걸러 중복을 막음", "KMP removes the overlapping prefix of each delivery"),
      t("예측은 펜 전용, '움직임 줄이기'일 때는 끔", "Prediction is pen-only and off under reduced motion"),
    ],
    diagram: {
      id: "pointer-input-contract-diagram",
      kind: "graph",
      title: t("입력 채널 두 갈래", "Two input channels"),
      caption: t("브라우저가 묶어 준 이벤트에서 '진짜 점'만 문서로, '짐작한 점'은 화면으로만 보냅니다.", "From each batched event, real points go to the document and guessed points go to the screen only."),
      alt: t(
        "펜 입력이 pointermove 이벤트로 도착하면 두 갈래로 나뉩니다. 위쪽은 getCoalescedEvents 로 복원한 하드웨어 샘플이 중복 제거를 거쳐 획에 저장되고, 아래쪽은 getPredictedEvents 의 예측 샘플이 임시 꼬리 표면을 거쳐 화면 미리보기에만 쓰입니다.",
        "Pen input arrives as a pointermove event and splits in two. The upper branch restores hardware samples with getCoalescedEvents, removes duplicates and stores them in the stroke; the lower branch sends predicted samples from getPredictedEvents through a temporary tail surface to the on-screen preview only.",
      ),
      nodes: [
        { id: "pen", label: t("펜·손가락", "Pen or finger"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "move", label: t("pointermove", "pointermove"), sub: t("브라우저가 묶어 준 이벤트", "Batched by the browser"), tone: "local", at: [1, 1] },
        { id: "hw", label: t("하드웨어 샘플", "Hardware samples"), sub: t("getCoalescedEvents()", "getCoalescedEvents()"), tone: "good", at: [2, 0] },
        { id: "guess", label: t("예측 샘플", "Predicted samples"), sub: t("getPredictedEvents()", "getPredictedEvents()"), tone: "warn", at: [2, 2] },
        { id: "dedupe", label: t("중복 제거", "De-duplicate"), sub: t("직전 전달분과 겹침(KMP)", "Overlap with last delivery"), tone: "local", at: [3, 0] },
        { id: "doc", label: t("획에 저장", "Saved in the stroke"), sub: t("압력·기울기·시각 배열", "Pressure, tilt, time arrays"), tone: "local", shape: "cylinder", at: [4, 0] },
        { id: "tail", label: t("임시 꼬리 표면", "Temporary tail"), sub: t("다음 프레임에 통째로 교체", "Replaced every frame"), tone: "warn", at: [3, 2] },
        { id: "view", label: t("화면 미리보기", "Screen preview"), tone: "warn", shape: "pill", at: [4, 2] },
      ],
      edges: [
        { from: "pen", to: "move" },
        { from: "move", to: "hw", label: t("풀어서 복원", "unpack") },
        { from: "move", to: "guess", label: t("짐작", "guess") },
        { from: "hw", to: "dedupe" },
        { from: "dedupe", to: "doc", label: t("저장", "save") },
        { from: "guess", to: "tail", label: t("그리기만", "draw only") },
        { from: "tail", to: "view" },
      ],
    },
    usage: [
      {
        feature: t("캔버스 편집기 · 펜 그리기", "Canvas editor · pen drawing"),
        role: t(
          "pointermove 한 번에 들어온 하드웨어 샘플을 순서대로 복원해 획에 잇고, 예측 샘플은 별도 임시 표면에만 그립니다.",
          "Restores the hardware samples of each pointermove in order and appends them to the stroke; predicted samples go only to a separate temporary surface.",
        ),
        paths: [
          `${POINTER_INPUT}#collectStudioStrokePointerBatch`,
          "apps/web/src/domains/creator/canvas/studio-pointer-prediction-capability.ts",
          "apps/web/src/domains/creator/studio-predicted-ink-tail.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("캔버스 편집기 · 획 저장(압력·기울기)", "Canvas editor · stroke storage (pressure, tilt)"),
        role: t(
          "압력·기울기·회전·접촉 크기·시각을 채널별 배열로 저장하고, 예측 샘플과 기기 식별자는 저장하지 않습니다.",
          "Stores pressure, tilt, rotation, contact size and time as per-channel arrays; predicted samples and device identifiers are never stored.",
        ),
        paths: ["apps/web/src/domains/creator/studio-element-model.ts#DrawEl"],
        route: "/studio",
      },
      {
        feature: t("캔버스 편집기 · 저지연 잉크 표면", "Canvas editor · low-latency ink surface"),
        role: t(
          "임시 라이브 오버레이(잉크·스탬프 등) 캔버스에만 desynchronized 힌트를 요청해 화면 반영을 앞당기고, 실패하면 일반 2D 컨텍스트를 씁니다. 역할별 정책 표(studio-lowlatency-surface-policy.ts)는 시험에서만 쓰이는 미연결 모듈입니다.",
          "Requests the desynchronized hint only for temporary live overlay canvases (ink, stamp and similar) to put pixels on screen sooner, and uses a plain 2D context if that fails. The per-role policy table (studio-lowlatency-surface-policy.ts) is an unwired module used only in tests.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-low-latency-canvas.ts#acquireStudioLowLatencyCanvas2dContext",
          "apps/web/src/domains/creator/live/studio-live-ink-overlay.ts",
          "apps/web/src/domains/creator/live/studio-live-stamp-overlay.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("하드웨어 샘플과 예측 샘플 가르기", "Splitting hardware and predicted samples"),
        language: "ts",
        ...commentedCode(
          [
            "type Sample = { t: number; x: number; y: number };",
            "const same = (a: Sample, b: Sample) => a.t === b.t && a.x === b.x && a.y === b.y;",
            "const toSample = (e: PointerEvent): Sample => ({ t: e.timeStamp, x: e.clientX, y: e.clientY });",
            "",
            "// @0@",
            "function fresh(prev: Sample[], next: Sample[]): Sample[] {",
            "  for (let k = Math.min(prev.length, next.length); k > 0; k--) {",
            "    if (prev.slice(-k).every((s, i) => same(s, next[i]!))) return next.slice(k);",
            "  }",
            "  return next;",
            "}",
            "",
            "export function onMove(e: PointerEvent, prev: Sample[]) {",
            "  const real = (e.getCoalescedEvents?.() ?? [e]).map(toSample); // @1@",
            "  const guess = (e.getPredictedEvents?.() ?? []).map(toSample); // @2@",
            "  return { commit: fresh(prev, real), preview: guess, next: real };",
            "}",
          ].join("\n"),
          [
            "직전 전달분의 꼬리와 겹치는 앞부분은 '재전송'이므로 버리고 새 샘플만 남긴다.",
            "하드웨어 샘플 → 문서에 저장",
            "예측 샘플 → 미리보기 전용(저장 금지)",
          ],
          [
            "A prefix that overlaps the tail of the previous delivery is a re-send: drop it and keep only new samples.",
            "hardware samples -> saved in the document",
            "predicted samples -> preview only (never saved)",
          ],
        ),
        explain: t(
          "한 번의 pointermove 에서 하드웨어 샘플(commit)과 예측 샘플(preview)을 갈라 돌려주고, 직전 전달분의 꼬리와 겹치는 앞부분은 건너뜁니다. 제품 코드는 같은 일을 KMP 로 하며 직전 128샘플까지만 비교합니다.",
          "One pointermove is split into hardware samples (commit) and predicted samples (preview), and the prefix that overlaps the previous delivery is skipped. The product code does the same with KMP and compares at most the last 128 samples.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "W3C · Pointer Events Level 3", url: "https://www.w3.org/TR/pointerevents3/", kind: "spec", note: t("coalesced·predicted 이벤트의 표준 정의", "Standard definition of coalesced and predicted events") },
      { title: "MDN · PointerEvent.getCoalescedEvents()", url: "https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents", kind: "docs" },
      { title: "MDN · PointerEvent.getPredictedEvents()", url: "https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getPredictedEvents", kind: "docs" },
      { title: "Chrome for Developers · Low-latency rendering with the desynchronized hint", url: "https://developer.chrome.com/blog/desynchronized", kind: "article", note: t("desynchronized 캔버스의 장단점", "Pros and cons of desynchronized canvases") },
      { title: "Wikipedia · Knuth–Morris–Pratt algorithm", url: "https://en.wikipedia.org/wiki/Knuth%E2%80%93Morris%E2%80%93Pratt_algorithm", kind: "article" },
    ],
    chapterIds: ["brush-engine"],
    talk: {
      pitch: t(
        "펜은 1초에 백 번 넘게 위치를 알려 주는데 브라우저는 그걸 화면 속도에 맞춰 묶어서 줍니다. 우리는 묶음을 다시 풀어 실제 점을 모두 쓰고, 브라우저가 짐작한 점은 화면에만 그렸다가 지웁니다. 그래서 선이 부드럽고, 짐작이 틀려도 작품에는 남지 않습니다.",
        "A pen reports its position well over a hundred times a second, but the browser bundles those reports to match the screen. We unpack the bundle and use every real point; points the browser only guesses are drawn on screen and then erased. Lines stay smooth, and a wrong guess never reaches the artwork.",
      ),
      analogy: t(
        "택배 상자(묶음 이벤트)를 열어 안의 물건(실제 점)을 모두 꺼내 쓰고, '내일 올 것 같은 물건'의 예고장(예측)은 문 앞에 잠깐 붙여 두기만 하는 것과 같습니다.",
        "It is like opening a parcel (the batched event) and using every item inside (real points), while a note saying 'this may arrive tomorrow' (a prediction) is only taped to the door for a moment.",
      ),
      questions: [
        {
          question: t("예측이 틀리면 선이 이상해지지 않나요?", "Doesn't a wrong prediction distort the line?"),
          answer: t(
            "예측 꼬리는 영구 표면과 물리적으로 다른 임시 표면에만 그려지고 다음 프레임에 통째로 교체됩니다. 영구 표면은 추가만 가능해서, 틀려도 확정된 픽셀은 하나도 바뀌지 않습니다.",
            "The predicted tail is drawn on a physically separate temporary surface and replaced wholesale on the next frame. The permanent surface can only grow, so a wrong guess never changes a confirmed pixel.",
          ),
        },
        {
          question: t("pointerrawupdate 를 쓰면 더 빠르지 않나요?", "Wouldn't pointerrawupdate be faster?"),
          answer: t(
            "처리된 pointermove 와 주기가 달라 같은 픽셀을 두 경로가 소유하게 될 수 있어서, 영구 잉크에는 쓰지 않습니다. 대신 펜이 닿아 있는 동안만 커서·가이드와 임시 잉크 미리보기처럼 화면 전용 표시에 씁니다. 잉크의 권위는 처리된 pointermove(묶음을 푼 샘플) 쪽에만 있습니다.",
            "Its cadence differs from the processed pointermove stream, so two paths could own the same pixels; it is not used for permanent ink. Instead, only while the pen is touching the screen, it drives screen-only visuals such as the cursor, the guide and a temporary ink preview. Ink authority lies solely with the processed pointermove stream (the unpacked batch).",
          ),
        },
        {
          question: t("모든 브라우저에서 예측이 되나요?", "Does prediction work in every browser?"),
          answer: t(
            "코드는 getPredictedEvents 를 기능 감지한 뒤에만 켭니다. 브라우저별 지원 현황은 이 카드에서 확인하지 못했으니 발표 직전에 caniuse 로 확인하세요.",
            "The code enables it only after feature-detecting getPredictedEvents. Per-browser support was not verified for this card, so check caniuse right before presenting.",
          ),
        },
        {
          question: t("기기 식별자 같은 개인정보를 저장하나요?", "Does it store personal data such as device identifiers?"),
          answer: t(
            "pointerId 는 지금 진행 중인 입력 줄기를 가리킬 뿐 기기 식별자가 아닙니다. 계약에 벤더 전용 필드나 영구 기기 ID 가 없다고 코드 주석에 명시돼 있습니다.",
            "pointerId only names the active input stream and is not a device identifier. A code comment states that the contract has no vendor-specific fields or persistent device ID.",
          ),
        },
      ],
      pitfall: t(
        "desynchronized 는 '요청'일 뿐 실제 적용 여부는 브라우저와 기기마다 다릅니다. 지연을 몇 ms 줄였다는 식의 수치는 이 카드에서 확인한 적이 없으니 말하지 마세요.",
        "desynchronized is a request; whether it is honored differs per browser and device. No latency saving in milliseconds was verified for this card, so do not quote one.",
      ),
    },
    technologies: ["Pointer Events", "Canvas2D"],
    facts: [
      { value: "128", label: t("직전 전달분으로 보관하는 샘플 수(중복 비교 창)", "Samples kept from the previous delivery (overlap window)"), source: POINTER_INPUT },
      { value: "2", label: t("예측 시뮬레이션이 참고하는 문맥 샘플 수", "Context samples a prediction simulation may read"), source: "apps/web/src/domains/creator/studio-predicted-ink-tail.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "stroke-smoothing-one-euro",
    category: "drawing",
    name: "Stroke stabilizer",
    title: t("손떨림 보정: 느릴 땐 부드럽게, 빠를 땐 가볍게", "Hand-shake correction: smooth when slow, light when fast"),
    status: "live",
    tagline: t("떨림은 지우되, 펜을 너무 늦게 따라오지는 않게 지연을 숫자로 약속합니다.", "Removes shake without lagging far behind the pen, with latency promised in numbers."),
    background: [
      t(
        "손떨림 보정은 '부드러움'과 '반응 속도'를 맞바꾸는 장치입니다. 점들을 평균 내면 떨림은 줄지만 선이 펜 끝을 늦게 따라오고(고무줄을 단 느낌), 샘플이 불규칙하게 도착하면 같은 보정 값이라도 기기마다 지연이 달라집니다. ToonStudio 는 필터가 샘플 도착 간격과 무관하게 같은 지연을 내도록 시간 기준으로 설계했습니다.",
        "Hand-shake correction trades smoothness against responsiveness. Averaging points removes shake but makes the line trail the pen tip like a rubber band, and when samples arrive irregularly the same setting gives a different lag on each device. ToonStudio designs its filters around time, so the lag stays the same whatever the sample interval.",
      ),
      t(
        "보정 강도(0~10)에는 세 가지 모드가 있습니다. 고정 주기(standard)는 적격 브러시에서 강도가 0보다 크면 5ms 마다 여러 단의 필터를 돌리고(0이면 보정 없이 받습니다), 속도 적응(adaptive, 알 수 없는 값일 때의 기본)은 느린 선은 더 안정시키고 빠른 플릭은 지연을 줄이며, 정밀 추적(precision)은 펜 끝을 가상의 끈이 따라오게 합니다. 시간 상수 8 + 4.8×강도(ms)(강도 10이면 56ms)는 속도 적응 등이 쓰는 시간 정규화 지수평활의 곡선이고, 5ms 캐스케이드는 이 곡선에 가깝게 맞춘 별도 필터입니다. 지수평활은 샘플 사이를 직선으로 보고 1차 저역통과 필터의 해를 정확히 적분해 60·120·240Hz 에서도 같은 지연이 나옵니다.",
        "Correction strength (0 to 10) has three modes. Fixed-rate (standard) runs a multi-stage filter every 5 ms on eligible brushes when strength is above 0 (at 0 input is taken as is); speed-adaptive (adaptive, the default for unknown values) stabilizes slow lines more and cuts lag for fast flicks; precision lets a virtual string trail the pen tip. The time constant 8 + 4.8 x strength ms (56 ms at strength 10) is the curve of the time-normalized exponential smoothing used by speed-adaptive and similar paths, and the 5 ms cascade is a separate filter tuned to track that curve closely. The smoothing treats input between samples as a straight line and integrates the first-order low-pass exactly, giving the same lag at 60, 120 and 240 Hz.",
      ),
      t(
        "가는 펜 목록(코드에 등록된 라이너·테크니컬 펜 등 9종)은 보정 모드가 고정 주기(standard)이고 강도가 0일 때 One Euro 필터를 거칩니다. 천천히 그을 때는 컷오프 주파수를 낮춰 떨림을 없애고, 속도가 붙으면 컷오프를 올려 지연을 없애는 속도 적응 필터입니다. 강도가 0보다 크거나 기본값(속도 적응, 강도 3)이면 이 필터 대신 5ms 캐스케이드나 속도 적응 지수평활이 쓰입니다. 펜을 뗄 때는 출력이 실제 끝 점까지 따라잡도록 끝점을 flush 해서 저장된 획이 펜보다 짧게 끝나지 않게 합니다.",
        "The thin-pen list (nine brush ids registered in code, such as liner and technical pen) goes through a One Euro filter when the mode is fixed-rate (standard) and strength is 0. When you draw slowly it lowers the cutoff frequency to remove shake, and as speed rises it raises the cutoff to remove lag. At strength above 0, or with the default (speed-adaptive, strength 3), a 5 ms cascade or speed-adaptive smoothing is used instead. When the pen lifts, the endpoint is flushed so the output catches up to the real last point and the saved stroke never ends shorter than the pen.",
      ),
      t(
        "이미 내보낸 구간은 새 샘플이 와도 고쳐 쓰지 않는 append-only 구조라 선이 뒤늦게 출렁이지 않습니다. 한계는 분명합니다. 보정이 셀수록 선은 펜을 늦게 따라옵니다. 옛 캐스케이드(20단, 90% 응답 약 535ms)는 '고무줄 느낌'이어서 단계당 응답 하한을 두어 최악 응답을 약 125ms 로 제한했습니다(코드 주석 기준).",
        "Output already emitted is never rewritten when new samples arrive (append-only), so the line does not wobble after the fact. The limit is plain: the stronger the correction, the later the line follows the pen. The old cascade (20 stages, about 535 ms to 90%) felt like a rubber band, so a per-stage floor now caps the slowest response near 125 ms (per code comments).",
      ),
    ],
    keyPoints: [
      t("지수평활 시정수 8+4.8×강도 ms, 주사율이 달라도 같은 지연", "Smoothing time constant 8 + 4.8 x strength ms, same lag at any rate"),
      t("5ms 고정 주기로 필터, 낸 구간은 고쳐 쓰지 않음", "5 ms fixed ticks; emitted output is never rewritten"),
      t("가는 펜 목록은 강도 0에서 One Euro: 느리면 부드럽게, 빠르면 가볍게", "Thin-pen list uses One Euro at strength 0: smooth when slow, light when fast"),
    ],
    diagram: {
      id: "stroke-smoothing-one-euro-diagram",
      kind: "graph",
      title: t("입력에서 저장까지의 보정 경로", "From raw input to the saved stroke"),
      caption: t("브러시와 모드에 따라 필터 하나를 거쳐, 펜을 뗄 때 끝점을 맞추고 저장합니다.", "Brush and mode pick one filter; at pen-up the endpoint is aligned and the stroke saved."),
      alt: t(
        "원시 입력이 필터 선택 지점에서 네 갈래로 나뉩니다. 고정 주기에서 강도가 0이고 가는 펜 목록의 브러시이면 One Euro, 강도가 0보다 크면 5ms 캐스케이드를 거칩니다. 속도 적응은 시간 정규화 지수평활, 정밀 추적은 가상 끈 데드존을 거칩니다. 모두 보정된 점으로 모인 뒤 끝점을 맞추어 저장됩니다.",
        "Raw input reaches a filter selection point that splits four ways. In fixed-rate mode, a brush on the thin-pen list at strength 0 goes through One Euro, and a strength above 0 goes through a 5 ms cascade. Speed-adaptive uses time-normalized smoothing and precision uses a virtual-string dead zone. All merge into the corrected point, whose endpoint is aligned before saving.",
      ),
      nodes: [
        { id: "raw", label: t("원시 입력", "Raw input"), sub: t("pointermove 샘플", "pointermove samples"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "pick", label: t("필터 선택", "Pick filter"), sub: t("브러시·보정 모드", "Brush and mode"), tone: "neutral", shape: "diamond", at: [1, 1] },
        { id: "euro", label: t("One Euro", "One Euro"), sub: t("고정 주기 · 가는 펜 목록", "Fixed rate, thin-pen list"), tone: "local", at: [2, 0] },
        { id: "std", label: t("5ms 캐스케이드", "5 ms cascade"), sub: t("고정 주기 · 강도>0 · 여러 단", "Fixed rate, strength > 0, stages"), tone: "local", at: [2, 1] },
        { id: "ada", label: t("속도 적응", "Speed-adaptive"), sub: t("시정수 8+4.8×강도 ms", "tau = 8 + 4.8 x strength ms"), tone: "local", at: [2, 2] },
        { id: "pre", label: t("정밀 추적", "Precision"), sub: t("가상 끈 데드존", "Virtual-string dead zone"), tone: "local", at: [2, 3] },
        { id: "out", label: t("보정된 점", "Corrected point"), sub: t("주사율과 무관한 지연", "Rate-independent lag"), tone: "good", at: [3, 1] },
        { id: "flush", label: t("끝점 flush", "Endpoint flush"), sub: t("펜 뗄 때 실제 끝까지", "Catch up at pen-up"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "raw", to: "pick" },
        { from: "pick", to: "euro", label: t("강도 0", "strength 0") },
        { from: "pick", to: "std" },
        { from: "pick", to: "ada" },
        { from: "pick", to: "pre" },
        { from: "euro", to: "out" },
        { from: "std", to: "out" },
        { from: "ada", to: "out" },
        { from: "pre", to: "out" },
        { from: "out", to: "flush", label: t("저장", "save") },
      ],
    },
    usage: [
      {
        feature: t("브러시 도구 · 보정(0~10)과 모드", "Brush tool · correction (0-10) and mode"),
        role: t(
          "보정 슬라이더와 세 모드(고정 주기·속도 적응·정밀 추적)를 받아 포인터 샘플마다 보정된 위치를 계산합니다.",
          "Takes the correction slider and the three modes (fixed-rate, speed-adaptive, precision) and computes a corrected position for every pointer sample.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-stroke-stabilizer.ts#stabilizeStudioStrokeSample",
          "apps/web/src/domains/creator/studio-brush.ts#STABILIZER_MAX",
        ],
        route: "/studio",
      },
      {
        feature: t("브러시 도구 · 5ms 고정 주기 필터", "Brush tool · 5 ms fixed-rate filter"),
        role: t(
          "불규칙하게 도착한 샘플을 5ms 논리 시계로 다시 재어 필터를 돌리고, 낸 구간은 고쳐 쓰지 않습니다.",
          "Re-times irregular samples onto a 5 ms logical clock before filtering, and never rewrites output already emitted.",
        ),
        paths: ["apps/web/src/domains/creator/studio-fixed-rate-stroke-filter.ts"],
        route: "/studio",
      },
      {
        feature: t("가는 펜 목록(라이너 등) · One Euro", "Thin-pen list (liner and others) · One Euro"),
        role: t(
          "보정 모드가 고정 주기이고 강도가 0일 때, 코드에 등록된 가는 펜 9종에만 One Euro 필터를 먼저 적용하고 펜을 뗄 때 끝점을 맞춥니다. 그중 7종은 지금 브러시 선택기에서 격리돼 있습니다.",
          "When the mode is fixed-rate and strength is 0, applies a One Euro filter first to only the nine thin-pen brush ids registered in code, and aligns the endpoint at pen-up. Seven of them are currently quarantined out of the brush picker.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-thin-line-ink-input-v1.ts",
          "apps/web/src/domains/creator/brush/studio-stroke-one-euro-v1.ts",
          "apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-freehand.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("브러시 도구 · 정밀 추적(가상 끈)", "Brush tool · precision (virtual string)"),
        role: t(
          "lazy-brush 계열의 가상 끈 데드존으로 긴 선화와 곡선의 흔들림을 잡습니다.",
          "Uses a lazy-brush style virtual-string dead zone to steady long line art and curves.",
        ),
        paths: ["apps/web/src/domains/creator/studio-lazy-brush-stabilizer.ts"],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("주사율과 무관한 지수평활", "Frame-rate independent smoothing"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "function ema(out: number, prevRaw: number, raw: number, dtMs: number, tauMs: number): number {",
            "  const decay = Math.exp(-dtMs / tauMs);",
            "  const ramp = dtMs - tauMs * (1 - decay); // @1@",
            "  const v = (raw - prevRaw) / dtMs;",
            "  return out * decay + prevRaw * (1 - decay) + v * ramp;",
            "}",
            "",
            "const tau = 8 + 4.8 * 10; // @2@",
            "for (const hz of [60, 120, 240]) {",
            "  const dt = 1000 / hz;",
            "  let out = 0;",
            "  let prev = 0;",
            "  for (let n = 1; n * dt <= 500; n++) {",
            "    const t = n * dt; // @3@",
            "    out = ema(out, prev, t, dt, tau);",
            "    prev = t;",
            "  }",
            "  console.log(hz, 'Hz lag(px) =', (prev - out).toFixed(2));",
            "}",
          ].join("\n"),
          [
            "샘플 간격(dt)과 무관한 1차 저역통과: 60/120/240Hz 에서 같은 지연을 낸다.",
            "구간 안에서 입력이 직선으로 움직였다고 보고 적분한 항",
            "보정 강도 10 → 시정수 56ms",
            "입력: 1px/ms 등속 직선 이동",
          ],
          [
            "First-order low-pass independent of the sample interval: same lag at 60, 120 and 240 Hz.",
            "term integrated by assuming the input moved in a straight line within the interval",
            "strength 10 -> time constant 56 ms",
            "input: constant 1 px/ms straight movement",
          ],
        ),
        explain: t(
          "dt 보정 alpha 를 곱하는 흔한 방식은 계단식(zero-order hold)이라 주사율마다 지연이 달라집니다. 구간 입력을 직선으로 적분하면 세 주사율 모두 약 55.99px 로 같은 지연이 나옵니다(Node 로 실행해 확인한 값).",
          "The common alpha-times-dt approach is a staircase (zero-order hold), so lag differs per rate. Integrating the input as a straight line gives the same lag of about 55.99 px at all three rates (checked by running it in Node).",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("One Euro 필터(한 축)", "One Euro filter (one axis)"),
        language: "ts",
        ...commentedCode(
          [
            "const smoothing = (dtSec: number, cutoffHz: number): number => {",
            "  const r = 2 * Math.PI * cutoffHz * dtSec;",
            "  return r / (r + 1);",
            "};",
            "",
            "export function makeOneEuro(minCutoffHz = 0.95, beta = 0.02, dCutoffHz = 1) {",
            "  let prevX: number | null = null;",
            "  let xHat = 0;",
            "  let dxHat = 0;",
            "  return (x: number, dtSec: number): number => {",
            "    if (prevX === null) {",
            "      prevX = xHat = x;",
            "      return x;",
            "    }",
            "    const dx = (x - prevX) / dtSec; // @0@",
            "    dxHat += smoothing(dtSec, dCutoffHz) * (dx - dxHat);",
            "    const cutoff = minCutoffHz + beta * Math.abs(dxHat); // @1@",
            "    xHat += smoothing(dtSec, cutoff) * (x - xHat);",
            "    prevX = x;",
            "    return xHat;",
            "  };",
            "}",
          ].join("\n"),
          ["속도(px/초)", "빠를수록 컷오프를 올려 지연을 줄인다"],
          ["speed in px per second", "faster movement raises the cutoff and cuts lag"],
        ),
        explain: t(
          "느릴 때는 컷오프가 최솟값(0.95Hz)에 머물러 떨림을 강하게 지우고, 빨라지면 beta 만큼 컷오프가 올라 선이 펜을 바로 따라옵니다. 제품은 x·y 가 하나의 속도 컷오프를 공유합니다(축마다 다르면 곡선이 일그러지므로).",
          "When slow the cutoff stays at its minimum (0.95 Hz) and wipes out shake; as speed rises, beta lifts the cutoff so the line follows the pen at once. The product shares one speed-derived cutoff between x and y so curves are not deformed.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "1€ Filter — Géry Casiez", url: "https://gery.casiez.net/1euro/", kind: "article", note: t("One Euro 필터 제안자의 공식 설명 페이지", "The authors' own page for the One Euro filter") },
      { title: "lazy-brush", url: "https://github.com/dulnan/lazy-brush", kind: "repo", note: t("정밀 추적 모드가 쓰는 가상 끈 라이브러리", "Virtual-string library behind the precision mode") },
      { title: "Wikipedia · Exponential smoothing", url: "https://en.wikipedia.org/wiki/Exponential_smoothing", kind: "article" },
      { title: "MDN · Pointer events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events", kind: "docs" },
    ],
    chapterIds: ["brush-engine"],
    talk: {
      pitch: t(
        "손떨림 보정은 부드러움과 반응 속도를 맞바꾸는 거래입니다. 우리는 그 거래를 숫자로 약속합니다. 보정 강도 10의 시간 상수는 56밀리초이고, 모니터가 60Hz 든 240Hz 든 같은 지연이 나오게 만들었습니다. 보정 강도 0에서 가는 펜 목록의 브러시는 느리면 부드럽게, 빠르면 가볍게 따라오는 One Euro 필터를 거칩니다.",
        "Hand-shake correction trades smoothness for responsiveness, and we state the trade in numbers. At strength 10 the time constant is 56 milliseconds, and the lag is the same on a 60 Hz or a 240 Hz display. At strength 0, brushes on the thin-pen list go through a One Euro filter that is smooth when you go slowly and light when you go fast.",
      ),
      analogy: t(
        "펜 끝에 고무줄로 매단 추를 끌고 가는 것과 같습니다. 줄이 길수록 흔들림은 줄지만 추가 늦게 따라옵니다. 그 줄의 길이를 우리는 밀리초로 재어 약속합니다.",
        "It is like dragging a weight tied to the pen tip with elastic. The longer the string, the less the shake and the later the weight follows; we measure that length in milliseconds and commit to it.",
      ),
      questions: [
        {
          question: t("보정을 높이면 선이 늦게 따라오지 않나요?", "Doesn't stronger correction make the line lag?"),
          answer: t(
            "맞습니다. 그래서 속도 적응 모드는 빠른 플릭에서 지연을 줄이고, 공간 지연에 2px + 0.75px×강도의 예산을 둡니다. 설정 화면에는 지연 설명 문구도 함께 보여 줍니다.",
            "Yes. That is why speed-adaptive mode cuts lag on fast flicks and bounds spatial lag with a budget of 2 px + 0.75 px x strength. The settings UI also shows a latency description.",
          ),
        },
        {
          question: t("왜 모드가 세 개나 되나요?", "Why three modes?"),
          answer: t(
            "쓰는 목적이 달라서입니다. 즉시 반응(고정 주기 0), 일반 스케치(속도 적응), 긴 선화(정밀 추적)에 각각 맞춥니다.",
            "The purposes differ: instant response (fixed-rate at 0), general sketching (speed-adaptive) and long line art (precision).",
          ),
        },
        {
          question: t("Google Ink 같은 외부 라이브러리를 쓰나요?", "Does it rely on an external library such as Google Ink?"),
          answer: t(
            "라이브 보정 경로는 자체 구현(위 세 모드와 One Euro)이고, 정밀 추적만 lazy-brush 를 씁니다. Google Ink 계열 WASM(잉크 메시)은 라이브 보정과는 별개의 미리보기 레인입니다.",
            "The live correction path is our own code (the three modes plus One Euro); only precision mode uses lazy-brush. The Google Ink family WASM (ink mesh) is a preview lane separate from live correction.",
          ),
        },
      ],
      pitfall: t(
        "용어집의 'ema/spring 두 모드'는 2D 편집기가 아니라 브러시 플랫폼 패키지의 배치 커널 이야기입니다. 편집기 라이브 경로의 모드는 세 개입니다. 코드의 가는 펜 목록 9종 중 7종(fineliner·ballpoint·liner·gel-pen·glass-pen·technical-pen·mapping-pen)은 브러시 격리 원장에 올라 지금 선택기에 보이지 않고, g-pen·dip-pen 은 현재 프리셋 id 와 일치하지 않습니다(G펜 프리셋의 id 는 gpen). 'G펜에 One Euro 를 쓴다'고 말하지 마세요. 다른 앱과의 지연 비교 수치는 이 카드에서 확인하지 못했습니다.",
        "The glossary's 'ema/spring modes' refer to a batch kernel in the brush-platform package, not the 2D editor; the editor's live path has three modes. Of the nine ids on the code's thin-pen list, seven (fineliner, ballpoint, liner, gel-pen, glass-pen, technical-pen, mapping-pen) are in the brush quarantine ledger and not shown in the picker today, and g-pen and dip-pen match no current preset id (the G-pen preset's id is gpen). Do not say One Euro is used for the G-pen. No latency comparison with other apps was verified for this card.",
      ),
    },
    technologies: ["One Euro filter", "lazy-brush", "Pointer Events"],
    facts: [
      { value: "8 + 4.8 × 강도 ms", label: t("지수평활의 시간 상수(강도 10이면 56ms)", "Exponential-smoothing time constant (56 ms at strength 10)"), source: "apps/web/src/domains/creator/brush/studio-stroke-stabilizer.ts" },
      { value: "5 ms", label: t("고정 주기 필터의 논리 시계 간격", "Logical clock tick of the fixed-rate filter"), source: "apps/web/src/domains/creator/studio-fixed-rate-stroke-filter.ts" },
      { value: "0.95 Hz · 0.02", label: t("가는 펜 One Euro 최소 컷오프 · beta", "Thin-pen One Euro minimum cutoff and beta"), source: "apps/web/src/domains/creator/studio-thin-line-ink-input-v1.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "stroke-replay-deterministic",
    category: "drawing",
    name: "Stroke replay",
    title: t("그림이 아니라 '손의 움직임과 규칙의 버전'을 저장하기", "Storing the hand's movement and the rule version, not the picture"),
    status: "live",
    tagline: t("획은 픽셀이 아니라 입력 샘플과 설정 스냅샷으로 저장하고, 보일 때마다 다시 계획합니다.", "A stroke is stored as input samples and a settings snapshot, then re-planned on every render."),
    background: [
      t(
        "포토샵 같은 래스터 앱은 획을 그리는 순간 픽셀에 '굽습니다'. ToonStudio 는 다릅니다. 문서에는 펜이 지나간 점들(위치·압력·기울기·시각)과 그 순간의 브러시 설정 스냅샷을 저장하고, 화면에 보일 때마다 이 입력에서 붓 자국(dab)과 외곽선을 다시 계획합니다. 은행 장부로 비유하면 '거래 내역(입력)'이 진실이고 '잔액(픽셀)'은 거기서 계산한 값입니다. 이벤트 소싱과 닮은 구조입니다.",
        "Raster apps such as Photoshop bake a stroke into pixels the moment it is drawn. ToonStudio does not. The document keeps the points the pen visited (position, pressure, tilt, time) plus a snapshot of the brush settings at that moment, and re-plans the dabs and outlines from that input every time the stroke is shown. In bank terms, the transaction list (input) is the truth and the balance (pixels) is derived from it, a structure close to event sourcing.",
      ),
      t(
        "그래서 모든 '무작위'(붓 자국의 흩어짐, 연필 질감의 변형)는 Math.random 이 아니라 (획 시드나 자국 번호, salt)로 만든 해시에서 나옵니다. 같은 입력이면 붓 자국 계획(위치·크기·무작위)은 그리는 도중의 미리보기, 저장 후 다시 열기, 협업 상대의 화면, 내보내기에서 같고, 최종 픽셀은 렌더러(Canvas2D·GPU)마다 허용오차 안에서 같습니다. 이미 받아들인 앞부분은 새 샘플이 와도 바뀌지 않게(접두 안정성) 설계돼 있습니다.",
        "So every bit of randomness (dab scatter, pencil texture variants) comes from a hash of (stroke seed or dab index, salt) rather than Math.random. The same input then gives the same dab plan (positions, sizes, randomness) in the live preview, after reopening, on a collaborator's screen and in export, and the final pixels agree within a tolerance on each renderer (Canvas2D, GPU). The already accepted prefix is designed not to change when new samples arrive (prefix stability).",
      ),
      t(
        "대가도 있습니다. 렌더 규칙을 고치면 이미 그린 작품이 소급해서 바뀝니다. 그래서 규칙이 바뀔 때는 키가 있는 새 모델(예: paperModel 의 contact-tooth-v2, stampPipeline 의 causal-walker-v2)을 새 획에만 붙이고, 키가 없는 옛 획은 옛 규칙을 바이트 단위로 유지합니다. 긴 획을 보일 때마다 다시 계획하는 비용, 그리고 부동소수 결과가 렌더러마다 다를 수 있다는 점(결정성은 JS 엔진 단위의 보장)도 한계입니다.",
        "There is a price: changing a render rule would silently repaint finished artwork. So when a rule changes, a keyed new model (for example paperModel contact-tooth-v2 or stampPipeline causal-walker-v2) is attached only to new strokes, while keyless old strokes keep the old rule byte for byte. Re-planning long strokes on every render costs time, and floating-point results may differ across renderers (determinism is guaranteed per JS engine).",
      ),
      t(
        "래스터가 아예 없는 것은 아닙니다. 자연매체 변환이나 필터·마스크 결과처럼 '정착된' 래스터는 이미지로 문서에 들어가고, 원본 벡터 획은 숨겨서 보존합니다. 즉 라이브 문서의 소유자는 샘플 기반 획(DrawEl)이고, 래스터는 그 위에 얹히는 결과물입니다.",
        "Raster does exist: settled results such as natural-media conversion, filters and masks enter the document as images while the original vector stroke is kept hidden. The live document is owned by sample-based strokes (DrawEl), and raster results sit on top of them.",
      ),
    ],
    keyPoints: [
      t("저장하는 것: 점 + 채널 배열 + 설정 스냅샷", "Saved: points, channel arrays and a settings snapshot"),
      t("무작위는 해시로: 같은 입력이면 같은 붓 자국 계획", "Randomness comes from a hash: same input, same dab plan"),
      t("규칙을 바꾸면 새 버전 키를 새 획에만 붙임", "Rule changes ship as version keys on new strokes only"),
    ],
    diagram: {
      id: "stroke-replay-deterministic-diagram",
      kind: "graph",
      title: t("저장은 입력, 픽셀은 파생물", "Input is stored; pixels are derived"),
      caption: t("점과 버전 스냅샷만 저장하고, 해시로 만든 무작위를 더해 보일 때마다 같은 붓 자국 계획을 다시 세웁니다.", "Only points and a version snapshot are stored; hash-based randomness is added and the same dab plan is re-made each time."),
      alt: t(
        "입력 샘플과 버전 스냅샷이 DrawEl 이라는 문서 요소로 저장됩니다. 보일 때마다 DrawEl 에서 붓 자국과 외곽선을 재계획하고, 획 시드와 번호의 해시가 무작위를 공급해 같은 계획이 화면과 내보내기로 이어지며 최종 픽셀은 렌더러마다 허용오차 안에서 같습니다.",
        "Input samples and a version snapshot are stored as a document element called DrawEl. Every time it is shown, dabs and outlines are re-planned from it, a hash of the stroke seed and index supplies the randomness, and the same plan carries through to screen and export, with final pixels agreeing within a tolerance on each renderer.",
      ),
      nodes: [
        { id: "samples", label: t("입력 샘플", "Input samples"), sub: t("점·압력·기울기·시각", "Points, pressure, tilt, time"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "snap", label: t("버전 스냅샷", "Version snapshot"), sub: t("종이·압력·스탬프 모델 키", "Paper, pressure, stamp model keys"), tone: "local", at: [0, 2] },
        { id: "draw", label: t("DrawEl", "DrawEl"), sub: t("문서에 저장되는 획", "Stroke saved in the document"), tone: "local", shape: "cylinder", at: [1, 1] },
        { id: "hash", label: t("시드 해시", "Seed hash"), sub: t("(번호, salt) → 0~1", "(index, salt) -> 0..1"), tone: "neutral", at: [2, 0] },
        { id: "plan", label: t("재계획", "Re-plan"), sub: t("붓 자국·외곽선 계산", "Dabs and outlines"), tone: "local", at: [2, 1] },
        { id: "pixels", label: t("픽셀", "Pixels"), sub: t("미리보기·재열기·협업·내보내기", "Preview, reopen, collab, export"), tone: "good", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "samples", to: "draw", label: t("저장", "save") },
        { from: "snap", to: "draw", label: t("저장", "save") },
        { from: "draw", to: "plan", label: t("읽기", "read") },
        { from: "hash", to: "plan", label: t("무작위", "random") },
        { from: "plan", to: "pixels", label: t("오차 내 일치", "in tolerance") },
      ],
    },
    usage: [
      {
        feature: t("캔버스 편집기 · 펜/브러시 획", "Canvas editor · pen and brush strokes"),
        role: t(
          "획 하나를 입력 샘플 배열과 브러시·종이·압력 모델 스냅샷으로 저장하고, 렌더마다 붓 자국을 다시 계획합니다.",
          "Stores each stroke as input-sample arrays plus brush, paper and pressure model snapshots, and re-plans the dabs on every render.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-element-model.ts#DrawEl",
          "apps/web/src/domains/creator/brush/studio-brush-stamp-engine.ts#stampJitter",
        ],
        route: "/studio",
      },
      {
        feature: t("캔버스 편집기 · 종이 질감과 건식 입자", "Canvas editor · paper texture and dry grain"),
        role: t(
          "종이 모델 키와 접두 안정 입자 커널로, 렌더 규칙을 고쳐도 옛 작품이 바뀌지 않게 합니다.",
          "Uses a paper-model key and a prefix-stable grain kernel so fixing a render rule does not change old artwork.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-paper-substrate-model.ts",
          "apps/web/src/domains/creator/brush/studio-dry-media-anisotropic-grain-v1.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("선택한 획 → 자연매체 변환", "Selected stroke → natural-media conversion"),
        role: t(
          "정착된 래스터는 결과 이미지로 문서에 들어가고 원본 벡터 획은 숨겨서 보존합니다.",
          "The settled raster enters the document as an image while the original vector stroke is kept hidden.",
        ),
        paths: ["apps/web/src/domains/creator/render/studio-hokusai-natural-media-replacement.ts"],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("(번호, salt)로 만드는 결정적 무작위", "Deterministic randomness from (index, salt)"),
        language: "ts",
        source: "apps/web/src/domains/creator/brush/studio-brush-dab-batch.ts",
        ...commentedCode(
          [
            "// @0@",
            "function hash(index: number, salt: number): number {",
            "  let h = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;",
            "  h ^= h >>> 15;",
            "  h = Math.imul(h, 0x2c1b3c5d) >>> 0;",
            "  h ^= h >>> 12;",
            "  return (h >>> 0) / 4294967296; // @1@",
            "}",
            "const jitter = (i: number, seed: number) => (hash(i, seed) - 0.5) * 2; // -1..1",
            "",
            "const live = [0, 1, 2, 3].map((i) => jitter(i, 42)); // @2@",
            "const replay = [3, 2, 1, 0].map((i) => jitter(i, 42)).reverse(); // @3@",
            "console.log(live.every((v, i) => v === replay[i])); // true",
          ].join("\n"),
          [
            "획의 '무작위'는 (번호, salt) 해시로만 만든다 → 그리는 중이든 나중에 재생하든 같은 값",
            "0 이상 1 미만",
            "그리는 도중",
            "나중에 순서와 무관하게 재생",
          ],
          [
            "Stroke randomness comes only from a hash of (index, salt), so live drawing and later replay agree",
            "0 inclusive to 1 exclusive",
            "while drawing",
            "replayed later in any order",
          ],
        ),
        explain: t(
          "이 해시는 studio-brush-dab-batch.ts 의 studioDabBatchHash 와 같은 식이지만 그 모듈은 아직 제품에 연결되지 않았고, 제품 스탬프 엔진이 쓰는 해시는 같은 발상의 stampJitter(다른 상수)입니다. 번호와 salt 만 같으면 언제 어떤 순서로 계산해도 같은 값이 나오므로, 라이브 미리보기와 저장 후 재생이 같은 붓 자국을 만듭니다.",
          "This hash has the same formula as studioDabBatchHash in studio-brush-dab-batch.ts, but that module is not yet wired into the product; the stamp engine uses stampJitter, the same idea with different constants. With the same index and salt the value is identical whenever and in whatever order it is computed, so live preview and replay after saving place the same dabs.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Martin Fowler · Event Sourcing", url: "https://martinfowler.com/eaaDev/EventSourcing.html", kind: "article", note: t("입력(이벤트)이 진실이고 상태는 파생이라는 발상", "The idea that events are truth and state is derived") },
      { title: "PCG · A Family of Better Random Number Generators", url: "https://www.pcg-random.org/", kind: "article", note: t("결정적 난수 설계 참고", "Reference for deterministic random-number design") },
      { title: "MDN · Math.imul()", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul", kind: "docs" },
    ],
    chapterIds: ["brush-engine", "brush-render-authority"],
    talk: {
      pitch: t(
        "우리는 그림을 저장하지 않고 손의 움직임과 규칙의 버전을 저장합니다. 그래서 같은 획의 붓 자국 계획은 미리보기에서도, 저장 후에도, 협업 상대 화면에서도 똑같고, 최종 픽셀은 렌더러마다 허용오차 안에서 같습니다. 렌더 규칙을 고칠 때는 새 버전 키를 새 획에만 붙여서 옛 작품이 바뀌지 않게 합니다.",
        "We do not store the picture; we store the hand's movement and the version of the rules. The dab plan for the same stroke is therefore identical in the preview, after saving and on a collaborator's screen, and the final pixels agree within a tolerance on each renderer. When a render rule changes, a new version key goes on new strokes only, so old artwork never changes.",
      ),
      analogy: t(
        "악보와 연주의 관계입니다. 악보(입력 샘플과 설정)만 있으면 언제든 같은 곡을 다시 연주할 수 있고, 녹음 파일(픽셀)은 그 결과물일 뿐입니다.",
        "It is like sheet music and performance. With the score (input samples and settings) you can replay the same piece any time, and a recording (pixels) is just one result of it.",
      ),
      questions: [
        {
          question: t("긴 획은 매번 다시 계획하면 느리지 않나요?", "Isn't re-planning a long stroke every time slow?"),
          answer: t(
            "비용이 있는 건 사실이라 한도로 막습니다. 예를 들어 스탬프 브러시 한 획의 붓 자국은 10만 개까지만 허용합니다. 실기기에서 긴 획의 프레임 시간을 따로 측정한 값은 이 카드에서 확인하지 못했습니다.",
            "There is a cost, so limits cap it: a single stamp stroke may place at most 100,000 dabs, for instance. Frame times of very long strokes on real devices were not measured for this card.",
          ),
        },
        {
          question: t("렌더 규칙을 고치면 옛 작품은요?", "What happens to old artwork when a render rule is fixed?"),
          answer: t(
            "키가 없는 획은 옛 규칙을 그대로 쓰고, 새 규칙은 키가 붙은 새 획에만 적용합니다. 이 호환 약속이 코드 주석과 테스트에 근거가 있습니다.",
            "Strokes without a key keep the old rule, and the new rule applies only to new keyed strokes. The compatibility promise is backed by code comments and tests.",
          ),
        },
        {
          question: t("래스터 이미지는 아예 없나요?", "Is there no raster at all?"),
          answer: t(
            "있습니다. 자연매체 변환·필터·마스크처럼 정착된 결과는 이미지로 문서에 들어가고, 원본 벡터 획은 숨겨 보존합니다.",
            "There is. Settled results from natural-media conversion, filters and masks enter the document as images, and the original vector strokes are kept hidden.",
          ),
        },
      ],
      pitfall: t(
        "'입력이 합성·타일 커밋 단계로 나뉜다'는 기존 표현은 정확하지 않습니다. 라이브 문서의 소유자는 Konva/DrawEl 이고, 타일 영속은 협업 래스터 표면 한정이며 타일 단위 권위는 vNext 목표입니다. 렌더러 사이의 최종 픽셀을 '비트까지 같다'고 말하지 마세요. Canvas2D 와 GPU 는 품질 게이트의 허용오차 예산 안에서 일치합니다(scripts/verify-studio-gpu-committed-parity.mts).",
        "The older phrasing that input is split into compositing and tile-commit stages is inaccurate. The live document is owned by Konva/DrawEl; tile persistence is limited to the collaborative raster surface, and tile-level authority is a vNext goal. Do not say final pixels are bit-identical across renderers: Canvas2D and the GPU agree within the tolerance budgets of a quality gate (scripts/verify-studio-gpu-committed-parity.mts).",
      ),
    },
    technologies: ["Konva", "Canvas2D", "Math.imul"],
    facts: [
      { value: "100,000", label: t("스탬프 브러시 한 획의 붓 자국(dab) 상한", "Dab cap for one stamp-brush stroke"), source: "apps/web/src/domains/creator/brush/studio-brush-stamp-engine.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "stroke-surface-route-pointerdown",
    category: "drawing",
    name: "Stroke surface route",
    title: t("획은 시작할 때 한 번만 그림판을 고르고 끝까지 바꾸지 않기", "Choose the drawing surface once at pen-down and keep it to the end"),
    status: "live",
    tagline: t("그릴 표면을 pointer-down 에서 하나 정해 고정하고, 실패해도 몰래 갈아타지 않습니다.", "Pins one drawing surface at pointer-down and never silently swaps it, even on failure."),
    background: [
      t(
        "그림 앱에는 GPU 로 그리는 길, 스탬프로 찍는 길, 수채용 길처럼 서로 다른 '그리는 표면'이 여럿 있습니다. 흔한 설계는 GPU 가 실패하면 CPU 로 슬쩍 넘어가는 폴백(대체)인데, 이러면 표면마다 다른 픽셀이 나오고 장치 문제가 다른 엔진의 성공 뒤에 가려집니다. ToonStudio 는 한 획 안에서 표면을 바꾸지 않기로 했습니다(ADR-0018).",
        "A drawing app has several different drawing surfaces: a GPU path, a stamp path, a watercolor path and so on. The common design is a fallback, quietly switching to the CPU when the GPU fails, but that produces different pixels per surface and hides device problems behind another engine's success. ToonStudio decided never to change surfaces inside one stroke (ADR-0018).",
      ),
      t(
        "펜을 내리는 순간(pointer-down) 브러시 종류와 준비 상태로 소유자를 딱 한 번 고릅니다. 우선순위는 living-ink, hokusai, stamp, gpu, live-ink, wet-ink, dynamic, konva 의 8종이고, 결과는 얼린 객체(ownership 'pinned-for-entire-stroke', midStrokePromotion false)로 스냅샷합니다. 이후 append·finish·cancel 은 routeKey 가 일치할 때만 소유권을 얻습니다.",
        "At pen-down the owner is chosen exactly once from the brush kind and readiness. The priority order is living-ink, hokusai, stamp, gpu, live-ink, wet-ink, dynamic and konva, and the result is snapshotted as a frozen object (ownership 'pinned-for-entire-stroke', midStrokePromotion false). Later append, finish and cancel calls gain ownership only when the routeKey matches.",
      ),
      t(
        "획 도중 GPU 장치가 사라지거나 제공자가 실패해도 정책은 같은 경로 유지(retain-pinned-route), 대체 금지(allowProviderSubstitution false), 마지막으로 보인 프레임 보존입니다. 다른 엔진은 다음 pointer-down 에서만 고를 수 있습니다. 선택된 표면이 시작조차 못 하면 획을 시작하지 않고 안내 문구를 보여 줍니다.",
        "If the GPU device is lost or a provider fails mid-stroke, the policy is to keep the pinned route (retain-pinned-route), forbid substitution (allowProviderSubstitution false) and preserve the last presented frame. Another engine can be chosen only at the next pointer-down. If the selected surface cannot even start, the stroke does not begin and a message is shown.",
      ),
      t(
        "금지되는 것은 '사후 폴백'이고, 시작 전에 능력을 감지해 하나를 고르는 '사전 선택'은 허용됩니다. WebGPU 가 처음부터 준비되지 않았다면 일반 펜은 Canvas2D 표면이 소유자로 선택됩니다. 한계: 지원되지 않는 기기에서는 폴백 대신 기능이 꺼지므로 안내 화면이 꼭 필요합니다.",
        "What is forbidden is post-failure fallback; pre-selection, detecting capabilities before the stroke and choosing one surface, is allowed. If WebGPU is not ready from the start, ordinary pens get the Canvas2D surface as owner. The limit: on unsupported devices a feature switches off instead of falling back, so clear messaging is essential.",
      ),
    ],
    keyPoints: [
      t("표면 선택은 pointer-down 에서 단 한 번", "The surface is chosen once, at pointer-down"),
      t("획 도중 장치가 죽어도 다른 엔진으로 갈아타지 않음", "A mid-stroke device loss never swaps the engine"),
      t("마지막 정상 프레임을 지키고 다음 획에서 다시 고름", "Keep the last good frame; re-choose on the next stroke"),
    ],
    diagram: {
      id: "stroke-surface-route-pointerdown-diagram",
      kind: "sequence",
      title: t("한 획 동안 고정되는 표면", "A surface pinned for one stroke"),
      caption: t("표면은 pointer-down 에서 한 번 정해지고, 실패해도 다음 pointer-down 까지 바뀌지 않습니다.", "The surface is fixed once at pointer-down and stays until the next pointer-down even if it fails."),
      alt: t(
        "펜을 내리면 에디터가 표면에 시작을 요청하고, 승인 결과를 라우트로 한 번 스냅샷해 고정합니다. 이동 중에는 같은 routeKey 로만 append 하며, GPU 장치가 손실돼도 다른 엔진으로 넘기지 않고 마지막 정상 프레임을 유지합니다. 다시 고를 수 있는 시점은 다음 pointer-down 뿐입니다.",
        "When the pen goes down, the editor asks a surface to start and snapshots the admission result into a route once. During movement it appends only with the same routeKey; if the GPU device is lost it does not hand over to another engine and keeps the last good frame. The only time to choose again is the next pointer-down.",
      ),
      actors: [
        { id: "pen", label: t("펜", "Pen"), tone: "local" },
        { id: "editor", label: t("에디터 입력 체인", "Editor input chain"), tone: "local" },
        { id: "router", label: t("라우트 스냅샷", "Route snapshot"), sub: t("resolveStudioStrokeSurfaceRoute", "resolveStudioStrokeSurfaceRoute"), tone: "neutral" },
        { id: "surface", label: t("선택된 표면", "Selected surface"), sub: t("예: WebGPU 잉크", "e.g. WebGPU ink"), tone: "good" },
      ],
      messages: [
        { from: "pen", to: "editor", label: t("pointer-down (획 시작)", "pointer-down (stroke starts)") },
        { from: "editor", to: "surface", label: t("begin: 이 표면으로 시작", "begin: start on this surface"), note: t("브러시·준비 상태로 하나만 선택", "Exactly one, from brush and readiness") },
        { from: "surface", to: "editor", label: t("승인 또는 거절", "admit or reject"), style: "dashed", note: t("거절이면 획을 시작하지 않고 안내", "If rejected, no stroke starts; a notice shows") },
        { from: "editor", to: "router", label: t("승인 결과를 한 번 스냅샷", "Snapshot the result once"), note: t("midStrokePromotion: false", "midStrokePromotion: false") },
        { from: "router", to: "editor", label: t("routeKey 고정 (8종 중 1)", "routeKey pinned (1 of 8)"), style: "dashed" },
        { from: "pen", to: "editor", label: t("pointermove × 여러 번", "pointermove x many") },
        { from: "editor", to: "surface", label: t("append (routeKey 일치할 때만)", "append (only if routeKey matches)") },
        { from: "surface", to: "surface", label: t("GPU 장치 손실 발생", "GPU device lost"), note: t("allowProviderSubstitution: false", "allowProviderSubstitution: false") },
        { from: "surface", to: "editor", label: t("마지막 정상 프레임 유지", "Keep last good frame"), style: "dashed" },
        { from: "pen", to: "editor", label: t("다음 pointer-down", "Next pointer-down"), note: t("이때만 다시 고를 수 있음", "Only now may a new surface be chosen") },
      ],
    },
    usage: [
      {
        feature: t("캔버스 편집기 · 획 시작과 표면 배정", "Canvas editor · starting a stroke and assigning a surface"),
        role: t(
          "브러시 종류와 준비 상태로 소유 표면을 한 번 고르고, 라우트 계약으로 얼려 끝까지 유지합니다.",
          "Chooses the owning surface once from the brush kind and readiness, then freezes it in a route contract kept to the end.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-stroke-surface-route.ts#resolveStudioStrokeSurfaceRoute",
          "apps/web/src/domains/creator/live/studio-live-stroke-media-selection.ts#selectStudioLiveStrokeMedia",
          "apps/web/src/domains/creator/studio-cuttoon-editor/studio-live-surface-start.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("캔버스 편집기 · GPU 잉크 선호와 킬스위치", "Canvas editor · GPU ink preference and kill switch"),
        role: t(
          "라이브 잉크의 기본 백엔드는 webgpu 이고, 정확히 'canvas2d' 로 지정할 때만 수동 Canvas2D 입니다. 롤아웃 비율은 기본 100%이며 모두 시작 전에 정해집니다.",
          "The default live-ink backend is webgpu, and only the exact value 'canvas2d' selects manual Canvas2D. The rollout percentage defaults to 100%, and all of it is decided before a stroke starts.",
        ),
        paths: [
          "apps/web/src/domains/creator/live/studio-live-ink-backend.ts",
          "apps/web/src/domains/creator/live/studio-live-ink-rollout.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("입력 지연 게이트의 기대 경로", "Latency gate's expected routes"),
        role: t(
          "측정 하니스는 브러시마다 기대 라우트를 선언합니다(예: pen 은 webgpu-causal-ink, 에어브러시는 canvas2d-stamp, 지우개는 konva-eraser-mask).",
          "The measurement harness declares an expected route per brush (for example pen is webgpu-causal-ink, airbrush is canvas2d-stamp, eraser is konva-eraser-mask).",
        ),
        paths: ["scripts/studio-brush-frame-budget-policy.ts#STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("pointer-down 에서 한 번 고정하는 라우트", "A route pinned once at pointer-down"),
        language: "ts",
        ...commentedCode(
          [
            "type Lane = 'gpu' | 'canvas2d';",
            "interface PinnedRoute {",
            "  readonly lane: Lane;",
            "  readonly strokeId: string;",
            "}",
            "",
            "// @0@",
            "function pinRoute(strokeId: string, gpuAdmitted: boolean): PinnedRoute {",
            "  return Object.freeze({ lane: gpuAdmitted ? 'gpu' : 'canvas2d', strokeId });",
            "}",
            "",
            "// @1@",
            "function onFailure(route: PinnedRoute): PinnedRoute {",
            "  return route;",
            "}",
            "",
            "const route = pinRoute('stroke-1', true);",
            "console.log(onFailure(route).lane); // @2@",
          ].join("\n"),
          [
            "pointer-down 에서 한 번만 결정한다. 획 도중 승격이나 교체는 없다.",
            "장치 손실 같은 실패가 나도 같은 경로를 유지한다(마지막 정상 프레임 보존). 다시 고르는 것은 다음 pointer-down 뿐.",
            "'gpu' 그대로 — canvas2d 로 몰래 갈아타지 않는다",
          ],
          [
            "Decide exactly once at pointer-down. No promotion or swap during the stroke.",
            "On failures such as device loss keep the same route (preserve the last good frame); choosing again happens only at the next pointer-down.",
            "still 'gpu' - it never quietly switches to canvas2d",
          ],
        ),
        explain: t(
          "제품의 studioStrokeSurfaceRouteFailurePolicy 는 같은 생각을 객체로 돌려줍니다. 경로 유지, 대체 금지, 마지막 프레임 보존, 다음 pointer-down 에서만 재선택이라는 네 가지 필드입니다.",
          "The product's studioStrokeSurfaceRouteFailurePolicy returns the same idea as an object with four fields: keep the route, forbid substitution, preserve the last frame, and re-select only at the next pointer-down.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · GPUDevice.lost", url: "https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost", kind: "docs", note: t("장치 손실을 Promise 로 알리는 표준 API", "The standard promise that reports device loss") },
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec" },
      { title: "Architecture Decision Records", url: "https://adr.github.io/", kind: "guide", note: t("ADR-0018 같은 결정 기록 방식 소개", "Introduction to decision records like ADR-0018") },
    ],
    chapterIds: ["brush-render-authority", "brush-engine"],
    talk: {
      pitch: t(
        "펜을 내리는 순간 어느 그림판으로 그릴지 한 번만 정하고, 그 획이 끝날 때까지 바꾸지 않습니다. GPU 가 중간에 죽어도 몰래 다른 엔진으로 넘기지 않고 마지막 정상 화면을 지킵니다. 실패를 숨기지 않는 쪽이 테스트와 사용자 화면이 어긋나지 않는다고 판단했기 때문입니다.",
        "The moment the pen goes down we choose the drawing surface once and keep it until the stroke ends. If the GPU dies midway we do not quietly hand over to another engine; we keep the last good frame. Not hiding failures keeps tests and what the user sees from drifting apart.",
      ),
      analogy: t(
        "릴레이 경기에서 바통을 넘길 구간을 출발 전에 정해 두는 것과 같습니다. 달리는 도중에 주자를 바꾸면 기록이 누구의 것인지 알 수 없게 됩니다.",
        "It is like fixing the relay legs before the race. If runners are swapped mid-run, nobody can say whose time it is.",
      ),
      questions: [
        {
          question: t("GPU 가 없는 기기에서는 그림을 못 그리나요?", "Can't people draw on a device without a GPU?"),
          answer: t(
            "그릴 수 있습니다. 시작 전 능력 탐지에서 WebGPU 가 준비되지 않았다면 처음부터 Canvas2D 소유자가 선택됩니다. 막는 것은 'GPU 로 시작했다가 도중에 몰래 바꾸는' 경우뿐입니다.",
            "They can. If WebGPU is not ready at the pre-start check, Canvas2D is chosen as owner from the beginning. What is blocked is starting on the GPU and then secretly switching midway.",
          ),
        },
        {
          question: t("선택된 표면이 시작을 못 하면 사용자는 어떻게 되나요?", "What does the user see if the selected surface cannot start?"),
          answer: t(
            "획을 시작하지 않고 'OO 엔진을 현재 사용할 수 없어 획을 시작하지 않았습니다'라는 안내를 보여 줍니다. 문서 표시 쪽에는 '같은 GPU 엔진 다시 준비' 버튼이 있고, 다른 엔진으로 자동 전환하지 않았다는 문구를 함께 보여 줍니다.",
            "The stroke does not start and a notice says that engine is currently unavailable so the stroke was not started. The document surface offers a 'prepare the same GPU engine again' button and states that no other engine was switched to automatically.",
          ),
        },
        {
          question: t("성능이 좋은 엔진으로 자동 전환하는 토너먼트는요?", "What about a tournament that switches to the fastest engine?"),
          answer: t(
            "토너먼트는 증거 수집용입니다. 모듈 주석이 실행 권한이 없다고 밝히며, 그 결과를 다른 엔진으로 재시도해도 된다는 허가로 쓰지 않습니다.",
            "The tournament only gathers evidence. Its module comment says it has no execution authority and its result is never permission to retry on another engine.",
          ),
        },
      ],
      pitfall: t(
        "'폴백'이라는 단어를 쓰면 코드와 어긋납니다. '사전 선택(허용)'과 '사후 폴백(금지)'을 구분해 말하세요. 라우트별 실기기 성능 수치는 이 카드에서 확인하지 못했습니다.",
        "Saying 'fallback' contradicts the code. Distinguish pre-selection (allowed) from post-failure fallback (forbidden). Per-route performance on real devices was not verified for this card.",
      ),
    },
    technologies: ["WebGPU", "Canvas2D", "Konva"],
    facts: [
      { value: "8", label: t("획 표면 종류(우선순위 목록 길이)", "Stroke surface kinds in the priority list"), source: "apps/web/src/domains/creator/brush/studio-stroke-surface-route.ts" },
      { value: "100%", label: t("라이브 잉크 롤아웃 기본값", "Default live-ink rollout percentage"), source: "apps/web/src/domains/creator/live/studio-live-ink-rollout.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
];
