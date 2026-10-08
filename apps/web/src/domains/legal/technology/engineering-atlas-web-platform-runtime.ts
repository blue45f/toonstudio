import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 기술 도감 · web-platform · 런타임 네 장(워커 봉투, 메인 스레드 양보, 압축 스트림, WebCodecs). 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_WEB_PLATFORM_RUNTIME: readonly EngineeringAtlasEntry[] = [
  {
    id: "worker-envelope-64-workers",
    category: "web-platform",
    name: "Dedicated Worker",
    title: t("워커 64개가 따르는 공통 봉투 규약", "One envelope contract for 64 Workers"),
    status: "live",
    tagline: t(
      "요청 번호·취소·소유권 이전·제한 시간, 워커 일감마다 같은 네 가지 약속을 둡니다.",
      "Request id, abort, ownership transfer and timeouts: the same four promises for every Worker job.",
    ),
    background: [
      t(
        "화면을 그리고 입력을 받는 메인 스레드는 한 줄로만 일합니다. 필터 적용, PNG 인코딩, ZIP 검산 같은 무거운 일을 여기서 하면 화면이 멈춥니다. 그래서 일꾼(Web Worker)에게 맡기는데, 일꾼은 다른 방에 있어 메시지로만 대화합니다. 이 저장소에는 워커 스크립트(*.worker.ts)가 64개 있고 packages 안에는 없습니다. 비테스트 코드가 이름을 참조하는 것은 63개이고, 저장 워커 하나는 아직 호출처가 없습니다.",
        "The main thread, which draws the screen and takes input, works in a single line. Heavy jobs such as applying filters, encoding PNG or checking ZIP sums would freeze the screen there, so they go to Web Workers, which live in another room and talk only by messages. The repository has 64 Worker scripts (*.worker.ts) and none inside packages. Non-test code references 63 of them by name, and one storage Worker still has no caller.",
      ),
      t(
        "일감마다 같은 네 가지 약속을 지킵니다. 첫째, 요청마다 번호(requestId)를 붙이고 같은 번호의 응답만 받아 늦게 온 옛 응답을 버립니다. 둘째, 취소(AbortSignal)가 오면 워커를 통째로 끝냅니다. 데이터 소유권이 이미 넘어갔을 수 있어 일감만 멈추면 버퍼 상태를 알 수 없기 때문입니다. 셋째, 준비와 실행에 제한 시간을 둡니다(ZIP 검산은 3초와 30초). 넷째, 큰 바이트는 복사하지 않고 소유권을 넘기되(Transferable) 버퍼 전체를 쓰는 뷰일 때만 넘기고 아니면 복사합니다.",
        "Every job keeps the same four promises. First, each request carries a number (requestId) and only the response with the same number is accepted, so a stale answer is dropped. Second, when an abort arrives the whole Worker is ended, because ownership may already have moved and stopping only the job would leave the buffer state unknown. Third, preparation and running have time limits (3 s and 30 s for the ZIP checksum). Fourth, big bytes are handed over instead of copied (Transferable), but only when the view covers the whole buffer; otherwise they are copied.",
      ),
      t(
        "Comlink 같은 RPC 라이브러리나 고정 개수의 워커 풀은 쓰지 않고, 기능마다 타입이 있는 메시지 규약을 직접 정의합니다. SharedWorker 와 transferControlToOffscreen 도 쓰지 않습니다. 대신 네 가지 약속이 모든 워커에서 같아 어느 파일을 열어도 같은 방식으로 읽힙니다. 또 실행 모드를 시작 전에 고정해, 워커가 실패했다고 같은 일을 메인 스레드에서 몰래 다시 하지 않습니다. 결과가 두 번 만들어지는 사고를 막기 위해서입니다.",
        "It uses no RPC library such as Comlink and no fixed-size Worker pool; each feature defines its own typed message protocol. SharedWorker and transferControlToOffscreen are not used either. Because the four promises are identical in every Worker, any file reads the same way. The execution mode is also fixed before the session starts, so a failed Worker never causes the same job to be quietly redone on the main thread, which prevents results from being produced twice.",
      ),
      t(
        "한계도 있습니다. 기능별 워커가 많지만 동시에 몇 개가 뜰지 상한을 두는 풀은 아직 없습니다. SharedArrayBuffer 링 버퍼로 펜 입력을 흘리는 엔진 워커는 구현과 테스트만 있고 제품에 연결되지 않았습니다(메타 카드 참고).",
        "There are limits too. Feature Workers are many, but no pool caps how many run at once. The engine Worker that streams pen input through a SharedArrayBuffer ring has code and tests but is not connected to the product (see the meta card).",
      ),
    ],
    keyPoints: [
      t("요청 번호로 짝을 맞추고 늦은 응답은 버린다", "Match by request id; drop stale answers"),
      t("취소하면 워커째 끝낸다(소유권 때문)", "Abort ends the whole Worker (ownership)"),
      t("큰 바이트는 복사 대신 소유권 이전", "Big bytes move by ownership transfer"),
      t("실패해도 메인 스레드로 몰래 재실행하지 않는다", "No silent rerun on the main thread after failure"),
    ],
    diagram: {
      id: "worker-envelope-64-workers-diagram",
      kind: "sequence",
      title: t("워커 일감의 한 사이클", "One cycle of a Worker job"),
      caption: t(
        "번호로 짝을 맞추고, 바이트는 소유권으로 넘기고, 취소는 워커째 끝냅니다.",
        "Pair by number, move bytes by ownership, and end the whole Worker on abort.",
      ),
      alt: t(
        "메인 스레드가 워커 클라이언트에 일감과 취소 신호를 넘기면 클라이언트가 요청 번호와 타이머를 붙여 바이트의 소유권을 워커로 넘깁니다. 워커는 같은 번호로 결과와 바이트를 돌려주고, 사용자가 취소하면 클라이언트가 워커를 종료하고 AbortError 를 알립니다.",
        "The main thread passes a job and an abort signal to the Worker client, which attaches a request number and timers and moves ownership of the bytes to the Worker. The Worker answers with the same number and returns the bytes; if the user cancels, the client terminates the Worker and reports AbortError.",
      ),
      actors: [
        { id: "ui", label: t("메인 스레드", "Main thread"), sub: t("화면 · 입력", "UI and input"), tone: "local" },
        { id: "client", label: t("워커 클라이언트", "Worker client"), sub: t("요청 번호 · 타이머", "request id, timers"), tone: "local" },
        { id: "worker", label: t("Dedicated Worker", "Dedicated Worker"), sub: t("예: ZIP 검산", "e.g. ZIP checksum"), tone: "good" },
      ],
      messages: [
        {
          from: "ui",
          to: "client",
          label: t("run(바이트, signal)", "run(bytes, signal)"),
          note: t("큰 바이트와 취소 신호를 넘긴다", "Pass the bytes and an abort signal"),
        },
        {
          from: "client",
          to: "client",
          label: t("요청 번호·타이머 시작", "Assign id, start timers"),
          note: t("준비 3초 · 실행 30초", "3 s ready, 30 s run"),
        },
        {
          from: "client",
          to: "worker",
          label: t("postMessage + 소유권 이전", "postMessage + transfer"),
          note: t("복사 없이 넘기는 버퍼(Transferable)", "Buffer moves without copying"),
        },
        {
          from: "worker",
          to: "client",
          label: t("success(번호, 바이트)", "success(id, bytes)"),
          style: "dashed",
          note: t("같은 번호의 응답만 받아들인다", "Only the matching id is accepted"),
        },
        { from: "client", to: "ui", label: t("결과 + 돌려받은 바이트", "Result + returned bytes"), style: "dashed" },
        { from: "ui", to: "client", label: t("abort()", "abort()"), note: t("사용자가 취소", "The user cancels") },
        {
          from: "client",
          to: "worker",
          label: t("terminate()", "terminate()"),
          note: t("소유권이 넘어갔을 수 있어 워커째 종료", "Ownership may have moved, so end the Worker"),
        },
        {
          from: "client",
          to: "ui",
          label: t("AbortError", "AbortError"),
          style: "dashed",
          note: t("늦은 응답은 번호로 걸러 버린다", "Late answers are dropped by id"),
        },
      ],
    },
    usage: [
      {
        feature: t("ZIP·OpenRaster 내보내기 · 항목 검산", "ZIP and OpenRaster export · entry checksums"),
        role: t(
          "요청 번호, 준비 3초·실행 30초 제한, 취소 시 워커 종료, 결과 버퍼 검증을 한 세션 안에서 처리합니다.",
          "A single session handles request ids, 3 s and 30 s limits, Worker termination on abort and result-buffer validation.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-crc32-worker-client.ts",
          "apps/web/src/domains/creator/studio-crc32-worker-protocol.ts",
          "apps/web/src/domains/creator/studio-crc32.worker.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("이미지 필터 적용", "Applying image filters"),
        role: t(
          "버퍼 전체를 쓰는 뷰일 때만 소유권을 넘기고, 아니면 복사합니다. SharedArrayBuffer 는 넘길 수 없어 전용 버퍼로 복사합니다.",
          "Ownership moves only when the view covers the whole buffer; otherwise it is copied. A SharedArrayBuffer cannot be transferred, so it is copied into a dedicated buffer.",
        ),
        paths: ["apps/web/src/domains/creator/studio-image-filter-worker-client.ts"],
      },
      {
        feature: t("로컬 데이터베이스 (SQLite 전담 워커)", "Local database (dedicated SQLite Worker)"),
        role: t(
          "SQLite 는 전용 워커 하나가 맡고 탭 사이 소유권은 Web Locks 로 정합니다(자세한 내용은 로컬 우선 카드).",
          "One dedicated Worker owns SQLite and tabs settle ownership with Web Locks (see the local-first cards).",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-local-database.worker.ts",
          "apps/web/src/domains/creator/studio-local-database-worker-lock.ts",
        ],
      },
      {
        feature: t("빌드 설정 (모듈 워커)", "Build setup (module Workers)"),
        role: t(
          "모든 워커를 ES 모듈 워커로 만들어, 워커 안의 지연 불러오기와 코드 분할이 그대로 유지됩니다.",
          "All Workers are built as ES module Workers, so lazy imports and code splitting inside them keep working.",
        ),
        paths: ["apps/web/vite.config.ts#worker"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("번호·취소·소유권을 갖춘 워커 호출", "A Worker call with id, abort and ownership"),
        language: "ts",
        ...sampleSource([
          ["let nextId = 0;"],
          [""],
          ["export function runInWorker(worker: Worker, bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal) {"],
          ["  signal.throwIfAborted();"],
          ["  const id = ++nextId;"],
          ["  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;"],
          ["  const data = whole ? bytes : bytes.slice();", "버퍼 전체일 때만 넘기고, 아니면 복사해 형제 뷰를 지킨다", "move only a whole buffer; otherwise copy to protect sibling views"],
          ["  return new Promise<number>((resolve, reject) => {"],
          ["    const done = () => {"],
          ['      worker.removeEventListener("message", onMessage);'],
          ['      signal.removeEventListener("abort", onAbort);'],
          ["    };"],
          ["    const onMessage = (event: MessageEvent<{ id: number; crc: number }>) => {"],
          ["      if (event.data.id !== id) return;", "늦은 응답이나 남의 응답은 무시한다", "ignore late or foreign answers"],
          ["      done();"],
          ["      resolve(event.data.crc);"],
          ["    };"],
          ["    const onAbort = () => {"],
          ["      done();"],
          ["      worker.terminate();", "소유권이 넘어갔을 수 있어 워커째 끝낸다", "ownership may have moved, so end the Worker itself"],
          ['      reject(new DOMException("aborted", "AbortError"));'],
          ["    };"],
          ['    worker.addEventListener("message", onMessage);'],
          ['    signal.addEventListener("abort", onAbort, { once: true });'],
          ["    worker.postMessage({ id, data }, [data.buffer]);", "바이트는 복사 없이 소유권을 넘긴다", "the bytes move by ownership, not by copy"],
          ["  });"],
          ["}"],
        ]),
        explain: t(
          "실제 구현(studio-crc32-worker-client.ts)을 줄인 교육용 예제입니다. 제한 시간 타이머와 결과 버퍼 검증은 생략했습니다. 핵심은 번호 대조, 취소 시 워커 종료, 소유권 이전의 세 가지입니다.",
          "A teaching sample reduced from the real implementation (studio-crc32-worker-client.ts), leaving out the timers and result-buffer validation. The three essentials are id matching, Worker termination on abort and ownership transfer.",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("실행 모드를 시작 전에 고정하기", "Fixing the execution mode before the session"),
        language: "ts",
        ...sampleSource([
          ['type Mode = "worker" | "direct";'],
          [""],
          ["export function createSession(mode: Mode, makeWorker: () => Worker | null) {"],
          ['  const worker = mode === "worker" ? makeWorker() : null;'],
          ['  if (mode === "worker" && worker === null) {'],
          ['    throw new Error("worker-unavailable");', "직접 실행으로 몰래 바꾸지 않고 오류로 닫는다", "close with an error instead of quietly running directly"],
          ["  }"],
          ["  return {"],
          ["    mode,", "세션이 끝날 때까지 바뀌지 않는다", "does not change until the session ends"],
          ["    dispose: () => worker?.terminate(),"],
          ["  };"],
          ["}"],
        ]),
        explain: t(
          "실행 모드(워커/직접)는 세션을 만들 때 한 번만 정합니다. 워커를 못 만들면 호출부가 오류를 보고 대응을 고르며, 같은 일을 두 곳에서 실행하는 일은 없습니다.",
          "The execution mode (Worker or direct) is chosen once when the session is created. If no Worker can be made, the caller sees the error and decides; the same job never runs in two places.",
        ),
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Using Web Workers",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers",
        kind: "docs",
        note: t("워커의 기본 사용법과 제약", "Basics and constraints of Workers"),
      },
      {
        title: "MDN · Transferable objects",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects",
        kind: "docs",
        note: t("복사 대신 소유권을 넘기는 방법", "Moving ownership instead of copying"),
      },
      {
        title: "MDN · AbortSignal",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal",
        kind: "docs",
      },
      {
        title: "MDN · Worker() constructor",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker",
        kind: "docs",
        note: t("type: 'module' 옵션", "The type: 'module' option"),
      },
      {
        title: "WHATWG HTML · Web workers",
        url: "https://html.spec.whatwg.org/multipage/workers.html",
        kind: "spec",
      },
    ],
    chapterIds: ["worker-architecture", "browser-local-compute"],
    talk: {
      pitch: t(
        "무거운 일은 일꾼(워커)에게 맡기고, 일꾼과 주고받는 방식을 네 가지 약속으로 통일했습니다. 요청에 번호를 붙여 늦은 응답을 버리고, 취소하면 일꾼을 통째로 끝내며, 큰 데이터는 복사 대신 소유권을 넘기고, 제한 시간을 둡니다. 워커 스크립트는 64개지만 어느 것을 열어도 같은 방식으로 읽힙니다.",
        "Heavy work goes to Workers, and the way we talk to them is unified into four promises: number each request and drop stale answers, end the whole Worker on cancel, move big data by ownership instead of copying, and set time limits. There are 64 Worker scripts, yet any of them reads the same way.",
      ),
      analogy: t(
        "택배 송장 번호와 같습니다. 번호가 같은 상자만 받고, 취소하면 물류센터를 통째로 멈추고, 상자는 복사하지 않고 주인이 바뀝니다.",
        "It works like a parcel tracking number: only the box with the same number is accepted, cancel stops the whole depot, and the box is not copied, it simply changes owner.",
      ),
      questions: [
        {
          question: t("Comlink 나 워커 풀을 쓰나요?", "Do you use Comlink or a Worker pool?"),
          answer: t(
            "아니요. 기능마다 타입이 있는 메시지를 직접 정의합니다. 풀은 도입 후보로만 검토 중입니다.",
            "No. Each feature defines its own typed messages. A pool is only a candidate under consideration.",
          ),
        },
        {
          question: t("취소하면 왜 워커를 통째로 끝내나요?", "Why does a cancel end the whole Worker?"),
          answer: t(
            "데이터 소유권이 이미 워커로 넘어갔을 수 있어, 일감만 멈추면 버퍼가 누구 것인지 알 수 없기 때문입니다.",
            "Ownership of the data may already have moved to the Worker, so stopping only the job would leave it unclear who owns the buffer.",
          ),
        },
        {
          question: t("워커를 못 만드는 환경은요?", "What if a Worker cannot be created?"),
          answer: t(
            "팩토리가 null 을 돌려주고 호출부가 오류로 닫습니다. 실행 모드는 시작 전에 정해 두며, 실패했다고 몰래 메인 스레드에서 다시 계산하지 않습니다.",
            "The factory returns null and the caller closes with an error. The mode is fixed before start and a failure never triggers a silent recompute on the main thread.",
          ),
        },
      ],
      pitfall: t(
        "SharedWorker, Comlink, transferControlToOffscreen 은 코드에 없습니다. 이름에 SharedWorker 가 붙은 타입이 있어도 SharedWorker API 가 아닙니다. 64개는 파일 수이지 동시에 도는 수가 아니며, SharedArrayBuffer 링 버퍼를 쓰는 엔진 워커는 제품에 연결되지 않았습니다.",
        "SharedWorker, Comlink and transferControlToOffscreen are absent from the code. A type with SharedWorker in its name is not the SharedWorker API. 64 is a file count, not a count of Workers running at once, and the engine Worker that uses a SharedArrayBuffer ring is not connected to the product.",
      ),
    },
    technologies: ["Dedicated Worker", "Transferable", "AbortController", "Web Workers", "Vite"],
    facts: [
      {
        value: "64",
        label: t("apps/web/src 의 *.worker.ts 파일 수(packages 는 0)", "*.worker.ts files in apps/web/src (0 in packages)"),
        source: "apps/web/src",
      },
      {
        value: "3초 · 30초",
        label: t("ZIP 검산 워커의 준비 · 실행 제한 시간", "Ready and run time limits of the ZIP checksum Worker"),
        source: "apps/web/src/domains/creator/studio-crc32-worker-client.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "main-thread-yielding",
    category: "web-platform",
    name: "scheduler.yield()",
    title: t("긴 작업을 쪼개 입력에 길을 내주기", "Splitting long tasks so input can cut in"),
    status: "live",
    tagline: t(
      "긴 계산 사이에 잠깐 비켜 서서 터치·펜 입력이 끼어들게 합니다.",
      "Between slices of long work, step aside so touch and pen input can cut in.",
    ),
    background: [
      t(
        "브라우저의 메인 스레드는 화면 그리기, 터치·펜 입력, 자바스크립트가 한 줄로 서서 차례를 기다립니다. 한 작업이 길어지면(대략 50ms를 넘으면) 뒤의 입력이 밀려 그림이 끊기는 것처럼 느껴집니다. 일꾼(워커)에게 보내기엔 작거나 캔버스를 직접 만져야 하는 일은 어떻게 할까요? 일을 잘게 쪼개고 사이사이에 '먼저 하세요' 하고 비켜 서면 됩니다.",
        "On the browser's main thread, drawing, touch and pen input, and JavaScript wait in one line. When one task runs long (roughly past 50 ms), later input is pushed back and drawing feels choppy. What about work too small to send to a Worker, or work that must touch the canvas directly? Cut it into small pieces and step aside between them with a polite after you.",
      ),
      t(
        "방법은 세 가지가 겹쳐 있습니다. 첫째, scheduler.yield() 로 양보하면 대기 중인 입력을 먼저 처리해 주고, 지원하지 않으면 다음 화면 갱신(requestAnimationFrame), 그것도 없으면 setTimeout(0)으로 물러납니다. 둘째, navigator.scheduling.isInputPending() 으로 지금 기다리는 입력이 있는지 물어, 있으면 선택적인 작업(미리보기 캡처)을 건너뜁니다. 셋째, requestIdleCallback 은 한가한 때에 부가 작업을 맡기는 데 쓰고, 없는 브라우저에는 setTimeout 1ms 폴리필을 둡니다.",
        "Three methods overlap. First, yielding with scheduler.yield() lets waiting input run first; without it the code retreats to the next frame (requestAnimationFrame) and then to setTimeout(0). Second, navigator.scheduling.isInputPending() asks whether input is waiting and, if so, skips optional work such as a preview capture. Third, requestIdleCallback hands side work to idle moments, with a 1 ms setTimeout polyfill where it is missing.",
      ),
      t(
        "대안은 전부 워커로 옮기는 것이지만, 캔버스 접근이 필요하거나 일이 작으면 오히려 복사 비용이 큽니다. 그래서 워커로 보낼 일은 워커로(워커 카드 참고), 메인에 남을 일은 쪼갭니다. 페인트 통은 영역 찾기와 색 칠하기 사이, 그리고 64,000픽셀마다 양보하고, PNG 인코딩은 동기 toDataURL 대신 비동기 toBlob 을 씁니다.",
        "The alternative is to move everything to Workers, but when canvas access is needed or the job is small, the copying costs more. So Worker-worthy jobs go to Workers (see the Worker card) and the rest are sliced on the main thread. The paint bucket yields between finding the region and painting it, and every 64,000 pixels, and PNG encoding uses asynchronous toBlob instead of synchronous toDataURL.",
      ),
      t(
        "한계: scheduler.yield() 와 isInputPending() 은 Chromium 쪽에서 먼저 지원된 것으로 알려져 있어, 다른 브라우저에서는 폴백 경로가 일상 경로일 수 있습니다(MDN 호환성 표로 확인). scheduler.postTask 는 쓰지 않습니다. 양보는 입력 반응을 좋게 할 뿐 전체 작업 시간을 줄이지는 않습니다.",
        "Limits: scheduler.yield() and isInputPending() are known to have shipped in Chromium first, so elsewhere the fallback path may be the everyday path (check the MDN compatibility tables). scheduler.postTask is not used. Yielding improves responsiveness but does not shorten the total work time.",
      ),
    ],
    keyPoints: [
      t("긴 작업을 쪼개고 사이에 양보한다", "Slice long work and yield in between"),
      t("yield → rAF → setTimeout 순으로 물러난다", "Fall back from yield to rAF to setTimeout"),
      t("입력이 대기 중이면 선택 작업은 건너뛴다", "Skip optional work when input is waiting"),
      t("양보는 반응성을 높일 뿐 총 시간은 그대로", "Yielding helps responsiveness, not total time"),
    ],
    diagram: {
      id: "main-thread-yielding-diagram",
      kind: "graph",
      title: t("양보 사다리", "The yielding ladder"),
      caption: t(
        "scheduler.yield() 가 없으면 한 단계씩 단순한 방법으로 물러납니다.",
        "Without scheduler.yield(), the code steps down to simpler methods one by one.",
      ),
      alt: t(
        "작업 한 조각이 끝나면 scheduler.yield() 가 있는지 확인합니다. 있으면 대기 중인 입력을 먼저 처리하고, 없으면 다음 화면 갱신 때 재개하며, 그것도 없으면 setTimeout(0) 으로 물러납니다. 세 갈래 모두 다음 조각으로 이어집니다.",
        "When a slice of work ends, the code checks whether scheduler.yield() exists. If so, waiting input runs first; if not, work resumes on the next frame, and failing that it steps back with setTimeout(0). All three paths lead to the next slice.",
      ),
      nodes: [
        { id: "slice", label: t("작업 한 조각 끝", "One slice done"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "has", label: t("yield 지원?", "yield supported?"), tone: "neutral", shape: "diamond", at: [1, 0] },
        {
          id: "yield",
          label: t("scheduler.yield()", "scheduler.yield()"),
          sub: t("대기 입력을 먼저 처리", "waiting input runs first"),
          tone: "good",
          at: [2, 0],
        },
        {
          id: "raf",
          label: t("rAF 양보", "Yield via rAF"),
          sub: t("다음 화면 갱신 때 재개", "resume on the next frame"),
          tone: "local",
          at: [1, 1],
        },
        {
          id: "timeout",
          label: t("setTimeout(0)", "setTimeout(0)"),
          sub: t("마지막 폴백", "last resort"),
          tone: "warn",
          at: [1, 2],
        },
        { id: "next", label: t("다음 조각", "Next slice"), tone: "good", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "slice", to: "has" },
        { from: "has", to: "yield", label: t("있음", "yes") },
        { from: "yield", to: "next" },
        { from: "has", to: "raf", label: t("없음", "no") },
        { from: "raf", to: "next" },
        { from: "raf", to: "timeout", label: t("rAF 도 없으면", "no rAF either"), style: "dashed" },
        { from: "timeout", to: "next" },
      ],
    },
    usage: [
      {
        feature: t("페인트 통 · 영역 채색", "Paint bucket · region fill"),
        role: t(
          "영역 찾기, 색 칠하기, PNG 인코딩 사이에 양보하고, 칠하는 동안에도 64,000픽셀마다 양보합니다.",
          "Yields between finding the region, painting and PNG encoding, and every 64,000 pixels while painting.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-flood-fill.ts",
          "apps/web/src/domains/creator/studio-pixel-edit-async.ts#yieldStudioMainThread",
        ],
        route: "/studio",
      },
      {
        feature: t("선택 영역 편집 (변형·채우기·자르기)", "Selection edits (transform, fill, crop)"),
        role: t(
          "래스터화 → 적용 → 인코딩 단계 사이에 양보하고, PNG 는 비동기 toBlob 으로 만들어 화면 멈춤을 줄입니다.",
          "Yields between rasterize, apply and encode, and builds the PNG with asynchronous toBlob to cut freezes.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-pixel-edit-async.ts#runStudioPixelEditBakePipeline",
          "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
        ],
      },
      {
        feature: t("ZIP 검산 · 직접 계산 모드", "ZIP checksum · direct mode"),
        role: t(
          "워커 없이 메인에서 계산하는 모드에서는 1MiB 조각마다 이벤트 루프에 양보합니다.",
          "In the mode that computes on the main thread without a Worker, it yields to the event loop after every 1 MiB slice.",
        ),
        paths: ["apps/web/src/domains/creator/studio-crc32-worker-client.ts#yieldToEventLoop"],
      },
      {
        feature: t("컴패니언 검수 미리보기 캡처", "Companion review preview capture"),
        role: t(
          "한가해질 때까지(최대 80ms) 기다린 뒤 입력이 대기 중이면 캡처를 건너뜁니다.",
          "Waits for idle time (up to 80 ms) and skips the capture when input is waiting.",
        ),
        paths: ["apps/web/src/domains/creator/studio-companion-review-projection.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("예산 안에서 쪼개고 양보하기", "Slice within a budget and yield"),
        language: "ts",
        ...sampleSource([
          ["export function yieldToMain(): Promise<void> {"],
          ["  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;"],
          ['  if (typeof s?.yield === "function") return s.yield();', "대기 중인 입력을 먼저 처리해 준다", "waiting input runs first"],
          ["  return new Promise((done) => {"],
          ['    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => done());', "다음 화면 갱신 때 재개", "resume on the next frame"],
          ["    else setTimeout(done, 0);", "마지막 폴백", "last resort"],
          ["  });"],
          ["}"],
          [""],
          ["export async function inSlices<T>(items: readonly T[], work: (item: T) => void, budgetMs = 8): Promise<void> {"],
          ["  let start = performance.now();"],
          ["  for (const item of items) {"],
          ["    work(item);"],
          ["    if (performance.now() - start > budgetMs) {", "한 조각이 예산을 넘으면", "once a slice exceeds the budget"],
          ["      await yieldToMain();"],
          ["      start = performance.now();"],
          ["    }"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "yieldStudioMainThread 의 폴백 순서(yield → rAF → setTimeout)를 그대로 따랐고, 조각 길이를 시간 예산으로 정하는 부분은 설명용으로 더했습니다. 실제 코드는 단계 사이와 픽셀 개수 간격에서 양보합니다.",
          "This follows the fallback order of yieldStudioMainThread (yield, rAF, setTimeout) and adds the time-budget slicing for illustration. The real code yields between stages and at pixel-count intervals.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("한가해질 때까지 기다리고, 입력이 있으면 건너뛰기", "Wait for idle and skip when input is pending"),
        language: "ts",
        ...sampleSource([
          ["type SchedulingNavigator = Navigator & { scheduling?: { isInputPending?: () => boolean } };"],
          [""],
          ["export async function captureWhenIdle(capture: () => void): Promise<boolean> {"],
          ["  await new Promise<void>((resolve) => {"],
          ['    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 80 });'],
          ["    else setTimeout(resolve, 16);", "rIC 가 없으면 한 프레임 뒤", "without rIC, one frame later"],
          ["  });"],
          ["  const scheduling = (navigator as SchedulingNavigator).scheduling;"],
          ["  if (scheduling?.isInputPending?.()) return false;", "입력이 기다리는 중이면 양보한다", "input is waiting, so step aside"],
          ["  capture();"],
          ["  return true;"],
          ["}"],
        ]),
        explain: t(
          "선택 작업(미리보기 캡처)이 사용자의 입력을 방해하지 않게 하는 두 겹의 확인입니다. 필수 작업에는 이렇게 건너뛰기를 쓰지 않습니다.",
          "A two-layer check that keeps an optional job (a preview capture) from getting in the way of user input. Required work is never skipped like this.",
        ),
        source: "apps/web/src/domains/creator/studio-companion-review-projection.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Scheduler.yield()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield",
        kind: "docs",
        note: t("브라우저별 지원은 호환성 표 확인", "Check the compatibility table for support"),
      },
      {
        title: "MDN · Scheduling.isInputPending()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Scheduling/isInputPending",
        kind: "docs",
      },
      {
        title: "web.dev · Optimize long tasks",
        url: "https://web.dev/articles/optimize-long-tasks",
        kind: "guide",
        note: t("긴 작업을 쪼개야 하는 이유와 방법", "Why and how to break up long tasks"),
      },
      {
        title: "MDN · Window.requestIdleCallback()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback",
        kind: "docs",
      },
    ],
    chapterIds: ["performance", "browser-local-compute"],
    talk: {
      pitch: t(
        "화면이 끊기는 가장 흔한 이유는 한 작업이 너무 오래 입력을 막는 것입니다. 일꾼에게 보낼 수 없는 일은 잘게 쪼개고, 조각 사이마다 대기 중인 입력을 먼저 처리하도록 양보합니다. 최신 기능이 있으면 쓰고, 없으면 한 단계씩 단순한 방법으로 물러납니다.",
        "The most common reason a screen stutters is one task blocking input for too long. Work that cannot go to a Worker is cut into small pieces, and between pieces it yields so waiting input runs first. It uses the newest feature when present and steps down to simpler methods when not.",
      ),
      analogy: t(
        "계산대에서 한 손님이 물건 100개를 계산한다면, 20개마다 뒤에 선 손님 한 명을 먼저 보내 주는 것과 같습니다.",
        "At a checkout where one customer has 100 items, it is like letting one person from the back go ahead after every 20 items.",
      ),
      questions: [
        {
          question: t("scheduler.yield 가 없는 브라우저는요?", "What about browsers without scheduler.yield?"),
          answer: t(
            "requestAnimationFrame, 그것도 없으면 setTimeout(0)으로 물러납니다. 양보하는 시점은 같고 정교함만 다릅니다.",
            "It steps back to requestAnimationFrame, and without that to setTimeout(0). The yield points are the same; only the finesse differs.",
          ),
        },
        {
          question: t("이렇게 하면 더 빨라지나요?", "Does this make it faster?"),
          answer: t(
            "아니요. 총 시간은 같거나 조금 늘고, 대신 입력 반응이 좋아집니다.",
            "No. Total time stays the same or grows slightly, but input responsiveness improves.",
          ),
        },
        {
          question: t("왜 전부 워커로 보내지 않나요?", "Why not send everything to Workers?"),
          answer: t(
            "캔버스 접근이 필요하거나 일이 작으면 복사 비용이 더 큽니다. 워커로 보낼 일은 워커로 보냅니다.",
            "When canvas access is needed or the job is small, copying costs more. Jobs worth a Worker do go to one.",
          ),
        },
      ],
      pitfall: t(
        "이 카드에는 측정한 응답 시간(ms) 수치가 없습니다. scheduler.yield 와 isInputPending 의 브라우저별 지원은 코드로 확인되지 않으니 MDN 호환성 표를 인용하세요. scheduler.postTask 는 쓰지 않습니다.",
        "This card has no measured response times in milliseconds. Per-browser support for scheduler.yield and isInputPending cannot be confirmed from code, so cite the MDN compatibility tables. scheduler.postTask is not used.",
      ),
    },
    technologies: ["scheduler.yield()", "isInputPending", "requestIdleCallback", "Web Workers"],
    facts: [
      {
        value: "64,000",
        label: t("페인트 통이 양보하는 픽셀 간격", "Pixel interval at which the paint bucket yields"),
        source: "apps/web/src/domains/creator/studio-flood-fill.ts",
      },
      {
        value: "80 ms",
        label: t("컴패니언 캡처가 한가해지길 기다리는 최대 시간", "Longest idle wait of the companion capture"),
        source: "apps/web/src/domains/creator/studio-companion-review-projection.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "compression-streams-zip-bomb-guard",
    category: "web-platform",
    name: "Compression Streams",
    title: t("브라우저 내장 압축과 ZIP 폭탄 방어", "Built-in compression and a ZIP-bomb guard"),
    status: "live",
    tagline: t(
      "형식별 지원을 실제로 시험하고, 풀리는 크기가 선언을 넘으면 즉시 끊습니다.",
      "It tests each format for real and cuts the stream when output passes the declared size.",
    ),
    background: [
      t(
        "압축 파일을 다루려면 보통 압축 라이브러리를 번들에 넣어야 합니다. 요즘 브라우저는 CompressionStream·DecompressionStream 이라는 내장 압축기를 제공해, 추가 코드 없이 gzip 이나 deflate 로 바이트를 스트림으로 줄이고 풀 수 있습니다. ToonStudio 는 이를 두 곳에 씁니다. 자동 저장 같은 상시 저장 데이터의 압축, 그리고 불러온 ZIP(프로젝트·OpenRaster 등)의 해제입니다.",
        "Handling compressed files usually means shipping a compression library in the bundle. Modern browsers provide built-in compressors, CompressionStream and DecompressionStream, that shrink and expand bytes as streams in gzip or deflate with no extra code. ToonStudio uses them in two places: compressing always-on stored data such as autosave, and expanding imported ZIP files (projects, OpenRaster and so on).",
      ),
      t(
        "주의가 두 가지 있습니다. 첫째, CompressionStream 이 있다는 것이 모든 형식을 지원한다는 뜻은 아닙니다. 코드 주석에 따르면 구형 Safari 는 객체가 있으면서 deflate-raw 만 거부했다고 하며, 그래서 형식마다 실제로 만들어 보고 지원 여부를 정합니다. 둘째, 압축하면 항상 작아지지 않습니다. 이미 압축된 파일(PNG·WOFF2·GLB 등), 1KiB 미만, 결과가 원본의 90% 이하로 줄지 않는 경우에는 압축하지 않고 원본을 담습니다.",
        "There are two cautions. First, having CompressionStream does not mean every format works; a code comment says old Safari had the object but rejected only deflate-raw, so each format is actually constructed to decide support. Second, compressing does not always shrink data. Already-compressed files (PNG, WOFF2, GLB and so on), payloads under 1 KiB, and results not at or below 90% of the original are stored uncompressed.",
      ),
      t(
        "신뢰할 수 없는 ZIP 은 아주 작은 파일이 수 GB 로 풀리는 '폭탄'일 수 있습니다. 그래서 열기 전에 중앙 디렉터리에서 항목 크기(256MB)와 압축률(100배)을 검사하고, 풀면서 누적 크기가 선언한 크기를 넘는 순간 스트림을 취소하고 ZIP_BOMB 오류를 냅니다. 다 풀린 뒤에는 실제 크기와 CRC32 도 선언과 대조합니다. 해제기는 직접 만든 코드이고, 내장 해제기가 없는 환경을 위한 어댑터를 주입할 수도 있습니다.",
        "An untrusted ZIP can be a bomb: a tiny file that expands to gigabytes. So before opening, the central directory is checked for entry size (256 MB) and compression ratio (100x); while expanding, the stream is cancelled and ZIP_BOMB raised the moment cumulative output passes the declared size. After expansion the real size and CRC32 are compared with the declaration too. The reader is in-house code, and an adapter can be injected for environments without the built-in decompressor.",
      ),
    ],
    keyPoints: [
      t("형식마다 실제로 만들어 보고 지원을 판단한다", "Construct each format to judge support"),
      t("이미 압축된 파일·1KiB 미만·이득 10% 미만은 그대로", "Skip precompressed, tiny or low-gain data"),
      t("크기·압축률 상한을 열기 전에 검사한다", "Check size and ratio caps before opening"),
      t("풀리는 크기가 선언을 넘으면 즉시 중단", "Cancel the moment output exceeds the declaration"),
    ],
    diagram: {
      id: "compression-streams-zip-bomb-guard-diagram",
      kind: "graph",
      title: t("ZIP을 여는 방어선", "Defense lines when opening a ZIP"),
      caption: t(
        "열기 전에 목록을 보고, 풀면서 크기를 세고, 다 풀리면 CRC32 로 확인합니다.",
        "Read the directory first, count while expanding, and confirm with CRC32 at the end.",
      ),
      alt: t(
        "ZIP 파일의 중앙 디렉터리에서 항목 크기와 압축률을 검사하고, 스트림으로 풀면서 누적 크기가 선언 크기를 넘는지 계속 확인합니다. 넘으면 스트림을 취소하고 ZIP_BOMB 오류로 끝내고, 넘지 않으면 CRC32 를 대조한 뒤 항목을 씁니다.",
        "The central directory of the ZIP is checked for entry size and ratio, then the entry is expanded as a stream while the running size is compared with the declared size. If it is exceeded the stream is cancelled with a ZIP_BOMB error; otherwise CRC32 is compared and the entry is used.",
      ),
      nodes: [
        { id: "zip", label: t("ZIP 파일", "ZIP file"), tone: "local", shape: "pill", at: [0, 0] },
        {
          id: "dir",
          label: t("목록 먼저 검사", "Check the list first"),
          sub: t("항목 256MB · 압축률 100배", "entry 256 MB, ratio 100x"),
          tone: "local",
          at: [1, 0],
        },
        {
          id: "inflate",
          label: t("스트림으로 풀기", "Expand as a stream"),
          sub: t("DecompressionStream", "DecompressionStream"),
          tone: "local",
          at: [2, 0],
        },
        { id: "over", label: t("선언 크기 초과?", "Over declared size?"), tone: "neutral", shape: "diamond", at: [3, 0] },
        { id: "crc", label: t("CRC32 대조", "Compare CRC32"), tone: "local", at: [4, 0] },
        { id: "use", label: t("항목 사용", "Use the entry"), tone: "good", shape: "pill", at: [5, 0] },
        {
          id: "bomb",
          label: t("취소 + ZIP_BOMB", "Cancel + ZIP_BOMB"),
          sub: t("메모리 폭주 차단", "stops memory blowup"),
          tone: "warn",
          at: [3, 1],
        },
      ],
      edges: [
        { from: "zip", to: "dir" },
        { from: "dir", to: "inflate" },
        { from: "inflate", to: "over" },
        { from: "over", to: "crc", label: t("아니오", "no") },
        { from: "crc", to: "use" },
        { from: "over", to: "bomb", label: t("예: 즉시 중단", "yes: stop at once"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("자동 저장 · 에셋 보관", "Autosave and asset storage"),
        role: t(
          "저장 데이터를 gzip(없으면 deflate-raw)으로 압축하되, 이미 압축된 형식·1KiB 미만·이득 10% 미만은 원본 그대로 담습니다.",
          "Stored data is compressed with gzip (or deflate-raw) unless it is already compressed, under 1 KiB, or gains less than 10%, in which case it is stored as is.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-opfs-compression.ts",
          "apps/web/src/domains/creator/studio-opfs-asset-store.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("프로젝트·OpenRaster·CBZ 불러오기", "Importing projects, OpenRaster and CBZ"),
        role: t(
          "목록 예산 검사 → 스트림 해제 → 선언 크기 초과 시 취소 → 실제 크기와 CRC32 대조 순서로 신뢰할 수 없는 ZIP 을 엽니다.",
          "Untrusted ZIPs are opened as: budget check on the list, stream expansion, cancel if the declared size is exceeded, then real-size and CRC32 comparison.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-zip-reader.ts",
          "apps/web/src/domains/creator/studio-openraster-interchange.ts",
          "apps/web/src/domains/creator/studio-cbz-interchange.ts",
        ],
      },
      {
        feature: t("브러시·형식 가져오기 게이트웨이", "Brush and format import gateway"),
        role: t(
          "형식 변환 패키지에도 같은 방식의 제한 해제기를 둡니다.",
          "The format-conversion package carries a bounded expander built the same way.",
        ),
        paths: ["packages/studio-format-gateway/src/bounded-zip.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("형식별 지원 시험과 크기 상한 해제", "Per-format support test and capped expansion"),
        language: "ts",
        ...sampleSource([
          ['export function supports(format: "gzip" | "deflate-raw"): boolean {'],
          ["  try {"],
          ["    new CompressionStream(format);", "있는지가 아니라 그 형식으로 만들어지는지를 본다", "test that the format can be built, not just that the class exists"],
          ["    new DecompressionStream(format);"],
          ["    return true;"],
          ["  } catch {"],
          ["    return false;"],
          ["  }"],
          ["}"],
          [""],
          ["export async function inflateCapped(bytes: Uint8Array<ArrayBuffer>, declared: number): Promise<Blob> {"],
          ['  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));'],
          ["  const reader = stream.getReader();"],
          ["  const parts: Uint8Array<ArrayBuffer>[] = [];"],
          ["  for (let size = 0; ; ) {"],
          ["    const { done, value } = await reader.read();"],
          ["    if (done) return new Blob(parts);"],
          ["    size += value.byteLength;"],
          ["    if (size > declared) {", "선언한 크기를 넘으면", "once output passes the declared size"],
          ["      await reader.cancel();", "스트림을 즉시 끊는다", "cut the stream at once"],
          ['      throw new Error("ZIP bomb");'],
          ["    }"],
          ["    parts.push(value);"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "실제 해제기(studio-zip-reader.ts)는 여기에 항목 개수·압축률 검사, 취소 신호, 실제 크기와 CRC32 대조를 더합니다. 핵심은 '선언은 믿지 않고 센다'입니다.",
          "The real reader (studio-zip-reader.ts) adds entry-count and ratio checks, an abort signal, and real-size and CRC32 comparison. The essence is to count rather than trust the declaration.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("압축할 가치가 있을 때만 압축하기", "Compress only when it is worth it"),
        language: "ts",
        ...sampleSource([
          ['const PRECOMPRESSED = ["image/png", "image/jpeg", "image/webp", "font/woff2", "model/gltf-binary", "application/zip"];'],
          [""],
          ["export async function maybeGzip(bytes: Uint8Array<ArrayBuffer>, mime: string) {"],
          ["  const skip = bytes.byteLength < 1024 || PRECOMPRESSED.some((prefix) => mime.startsWith(prefix));", "작거나 이미 압축된 파일은 건너뛴다", "skip tiny or already-compressed files"],
          ["  if (skip) return { codec: \"identity\" as const, bytes };"],
          ['  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));'],
          ["  const packed = new Uint8Array(await new Response(stream).arrayBuffer());"],
          ["  if (packed.byteLength > bytes.byteLength * 0.9) return { codec: \"identity\" as const, bytes };", "10% 이상 줄지 않으면 원본을 담는다", "if it does not shrink by 10%, keep the original"],
          ["  return { codec: \"gzip\" as const, bytes: packed };"],
          ["}"],
        ]),
        explain: t(
          "MIME 으로 먼저 거르고, 압축해 보고, 이득이 작으면 되돌립니다. 실제 코드는 gzip 지원 여부를 먼저 시험하고(없으면 deflate-raw), 압축 실패도 저장 실패로 만들지 않습니다.",
          "Filter by MIME first, try compressing, and revert if the gain is small. The real code tests gzip support first (falling back to deflate-raw) and never turns a compression failure into a save failure.",
        ),
        source: "apps/web/src/domains/creator/studio-opfs-compression.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Compression Streams API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API",
        kind: "docs",
        note: t("지원 형식(gzip, deflate, deflate-raw)과 호환성 표", "Supported formats and the compatibility table"),
      },
      {
        title: "MDN · DecompressionStream",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream",
        kind: "docs",
      },
      {
        title: "WHATWG · Compression Standard",
        url: "https://compression.spec.whatwg.org/",
        kind: "spec",
      },
      {
        title: "MDN · Streams API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Streams_API",
        kind: "docs",
      },
    ],
    chapterIds: ["storage", "browser-local-compute"],
    talk: {
      pitch: t(
        "압축 라이브러리를 따로 싣지 않고 브라우저에 들어 있는 압축기를 씁니다. 다만 압축기가 있다는 것과 그 형식이 된다는 것은 다르기 때문에 형식마다 실제로 만들어 봅니다. 그리고 남이 준 ZIP 은 열기 전에 크기와 압축률을 보고, 풀면서도 선언한 크기를 넘는 순간 끊습니다.",
        "Instead of shipping a compression library, it uses the compressor already inside the browser. Having a compressor is not the same as supporting a format, so each format is actually constructed. A ZIP from outside is checked for size and ratio before opening, and cut the moment expansion passes the declared size.",
      ),
      analogy: t(
        "택배를 열기 전에 송장의 무게(선언 크기)를 보고, 열면서 실제 무게가 송장보다 커지면 바로 멈추는 검수대와 같습니다.",
        "It is an inspection desk that reads the declared weight on the waybill before opening a parcel and stops at once if the real weight exceeds it.",
      ),
      questions: [
        {
          question: t("압축하면 항상 작아지나요?", "Does compressing always make it smaller?"),
          answer: t(
            "아니요. PNG·WOFF2·GLB 는 이미 압축돼 있어 이득이 없으므로 MIME 으로 먼저 거르고, 결과가 10% 이상 줄지 않으면 원본을 담습니다.",
            "No. PNG, WOFF2 and GLB are already compressed, so they are filtered by MIME first, and if the result is not at least 10% smaller the original is stored.",
          ),
        },
        {
          question: t("ZIP 폭탄이 뭔가요?", "What is a ZIP bomb?"),
          answer: t(
            "작은 파일이 풀리면 수 GB 가 되도록 만든 악성 압축 파일입니다. 크기·압축률 상한과 스트림 중단으로 메모리 폭주를 막습니다.",
            "A malicious archive built so a small file expands to gigabytes. Size and ratio caps plus stream cancellation prevent a memory blowup.",
          ),
        },
        {
          question: t("내장 해제기가 없는 브라우저는요?", "What about a browser without the built-in decompressor?"),
          answer: t(
            "해제기가 없다는 오류(DECOMPRESSION_UNAVAILABLE)로 알리거나, 호출부가 대체 해제기(어댑터)를 주입할 수 있습니다.",
            "It reports a DECOMPRESSION_UNAVAILABLE error, or the caller can inject a substitute decompressor (adapter).",
          ),
        },
      ],
      pitfall: t(
        "구형 Safari 가 deflate-raw 만 거부했다는 설명은 코드 주석의 주장이며 이 카드에서 검증하지 않았습니다. 브라우저별 지원은 MDN 호환성 표를 보세요. 코드 주석의 압축률(예: 112KB → 19.7KB)은 브라우저가 아니라 node zlib 로 잰 값입니다.",
        "The claim that old Safari rejected only deflate-raw comes from a code comment and was not verified for this card; see the MDN compatibility table. The ratios in the code comment (for example 112 KB to 19.7 KB) were measured with node zlib, not in a browser.",
      ),
    },
    technologies: ["Compression Streams", "Streams API", "ZIP", "deflate-raw"],
    facts: [
      {
        value: "100배 · 256MB",
        label: t("ZIP 항목의 압축률 · 해제 크기 상한", "ZIP entry compression-ratio and expanded-size caps"),
        source: "apps/web/src/domains/creator/studio-zip-reader.ts",
      },
      {
        value: "1 KiB · 90%",
        label: t("이보다 작거나 결과가 원본의 90% 이하로 안 줄면 압축하지 않음", "No compression below 1 KiB or when the result is not at or under 90%"),
        source: "apps/web/src/domains/creator/studio-opfs-compression.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "webcodecs-selected-pipeline",
    category: "web-platform",
    name: "WebCodecs",
    title: t("프레임 정확한 영상 인코딩, 코덱은 직접 물어서", "Frame-exact video encoding, asking the browser for the codec"),
    status: "live",
    tagline: t(
      "프레임을 인코더에 직접 넘겨 재생 시간만큼 기다리지 않고 같은 결과를 만듭니다.",
      "Frames go straight to the encoder, so export neither waits for playback time nor varies.",
    ),
    background: [
      t(
        "영상을 내보내는 기존 방법은 화면을 실시간으로 녹화하는 것(MediaRecorder)이었습니다. 코드 주석이 지적한 문제는 두 가지입니다. 60초 영상이면 내보내기도 60초가 걸렸고, 느린 기기에서는 프레임이 빠져 같은 문서인데도 매번 다른 파일이 나왔습니다. WebCodecs 는 브라우저의 영상 인코더에 프레임과 시각을 직접 넘기는 도구라서, 재생 시간만큼 기다리지 않고 장치가 허락하는 속도로 같은 결과를 만들 수 있습니다.",
        "The older way to export video was to record the screen in real time (MediaRecorder). A code comment names two problems: a 60-second video took 60 seconds to export, and on slow devices frames dropped, so the same document gave a different file each time. WebCodecs hands frames and timestamps directly to the browser's video encoder, so export need not wait for playback time and can give the same result at the speed the device allows.",
      ),
      t(
        "동작은 이렇습니다. 내보내기 전에 VideoEncoder.isConfigSupported() 로 이 해상도·fps 로 이 코덱을 지금 인코딩할 수 있는지 브라우저에 직접 묻습니다(MIME 문자열 추측보다 정확하다고 코드가 설명합니다). 하드웨어 가속이 되는 코덱을 먼저 찾고, 소프트웨어뿐이면 VP9 → VP8 → AV1 순입니다. 프레임 시각은 벽시계가 아니라 순수 계산으로 정하고, 인코더가 내놓은 조각은 직접 만든 WebM·MP4 포장기(muxer)로 감쌉니다.",
        "It works like this. Before exporting, VideoEncoder.isConfigSupported() asks the browser directly whether this codec can be encoded now at this resolution and fps (the code explains this beats guessing from MIME strings). Codecs with hardware acceleration are tried first, and if everything is software the order is VP9, VP8, AV1. Frame times come from pure calculation, not a wall clock, and the chunks the encoder emits are wrapped by in-house WebM and MP4 muxers.",
      ),
      t(
        "'선택 고정'이 이 설계의 원칙입니다. 모션 웹툰 내보내기는 포맷을 시작 전에 계획으로 한 번 정하고, 폴백이 걸리면 이유를 사용자에게 문장으로 보여 줍니다(예: H.264 인코더가 없어 WebM 으로 대신 만들어요). MP4 는 H.264 가 필요한데 WebM 컨테이너에는 H.264 를 넣을 수 없어 별도 포장기를 만들었고, 마지막 수단인 GIF 는 어디서나 만들 수 있습니다.",
        "Fixing the choice is the principle. Motion-webtoon export decides the format once, as a plan, before starting, and when a fallback applies it tells the user why in plain words (for example, no H.264 encoder, so WebM is used instead). MP4 needs H.264, which cannot go into a WebM container, so a separate muxer was written; GIF, the last resort, works everywhere.",
      ),
      t(
        "한계: prefer-hardware 설정이 수락됐다는 것은 하드웨어를 실제로 쓴다는 영수증이 아닙니다. 코덱 지원은 브라우저마다 달라 코드 주석은 Safari 를 H.264 만 인코딩하는 환경으로 다룹니다(최신 현황은 MDN 에서 확인). 더 엄격한 '자동 전환 없음' 계약(studio-webcodecs-plan)은 구현과 테스트만 있고 호출처가 없으며, 타임랩스 등 다른 영상 내보내기는 아직 MediaRecorder 를 씁니다.",
        "Limits: an accepted prefer-hardware setting is not a receipt that hardware is really used. Codec support differs by browser, and a code comment treats Safari as an environment that encodes only H.264 (check MDN for the latest). The stricter no-automatic-switch contract (studio-webcodecs-plan) has code and tests but no caller, and other video exports such as the timelapse still use MediaRecorder.",
      ),
    ],
    keyPoints: [
      t("프레임을 직접 넘겨 재생 시간만큼 기다리지 않는다", "Frames go straight in; no waiting for playback"),
      t("코덱 지원은 isConfigSupported 로 직접 묻는다", "Ask isConfigSupported instead of guessing"),
      t("포맷은 시작 전 계획으로 고정, 폴백은 사유와 함께", "Format fixed up front; fallbacks come with a reason"),
      t("WebM·MP4 포장기는 순수 TypeScript 로 직접 구현", "WebM and MP4 muxers are in-house TypeScript"),
    ],
    diagram: {
      id: "webcodecs-selected-pipeline-diagram",
      kind: "graph",
      title: t("영상 내보내기 파이프라인", "The video export pipeline"),
      caption: t(
        "계획을 먼저 고정하고, 프레임은 인코더에 직접 넣고, 포장은 직접 만든 코드가 합니다.",
        "Fix the plan first, feed frames straight to the encoder, and wrap them with in-house code.",
      ),
      alt: t(
        "회차의 프레임 계획을 순수 계산으로 만들고, 브라우저에 코덱 지원을 직접 물은 뒤 내보낼 포맷을 하나로 고정합니다. 이후 VideoEncoder 가 프레임을 인코딩하고 순수 TypeScript 포장기가 WebM 이나 MP4 로 감싸 영상 파일이 됩니다. 코덱이 없으면 GIF 인코더가 마지막 수단입니다.",
        "A frame plan for the episode is computed purely, the browser is asked directly which codecs it supports, and one export format is fixed. VideoEncoder then encodes the frames and an in-house TypeScript muxer wraps them as WebM or MP4 into a video file. Without a usable codec, the GIF encoder is the last resort.",
      ),
      nodes: [
        {
          id: "plan",
          label: t("프레임 계획", "Frame plan"),
          sub: t("순수 계산, 벽시계 없음", "pure math, no wall clock"),
          tone: "local",
          shape: "pill",
          at: [0, 0],
        },
        {
          id: "ask",
          label: t("코덱 직접 묻기", "Ask the browser"),
          sub: t("isConfigSupported", "isConfigSupported"),
          tone: "local",
          at: [1, 0],
        },
        {
          id: "fix",
          label: t("포맷 계획 고정", "Fix the format"),
          sub: t("MP4 → WebM → GIF", "MP4, WebM, then GIF"),
          tone: "warn",
          at: [2, 0],
        },
        {
          id: "enc",
          label: t("VideoEncoder", "VideoEncoder"),
          sub: t("장치가 허락하는 속도", "as fast as the device allows"),
          tone: "local",
          at: [3, 0],
        },
        {
          id: "mux",
          label: t("순수 TS 포장기", "In-house muxer"),
          sub: t("WebM · MP4", "WebM and MP4"),
          tone: "local",
          at: [4, 0],
        },
        { id: "file", label: t("영상 파일", "Video file"), tone: "good", shape: "pill", at: [5, 0] },
        {
          id: "gif",
          label: t("GIF 인코더", "GIF encoder"),
          sub: t("코덱이 없을 때 마지막 수단", "last resort without a codec"),
          tone: "warn",
          at: [2, 1],
        },
      ],
      edges: [
        { from: "plan", to: "ask" },
        { from: "ask", to: "fix" },
        { from: "fix", to: "enc" },
        { from: "enc", to: "mux" },
        { from: "mux", to: "file" },
        { from: "fix", to: "gif", label: t("코덱 없음", "no codec"), style: "dashed" },
        { from: "gif", to: "file", style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("모션 웹툰 내보내기 (MP4 · WebM · GIF)", "Motion-webtoon export (MP4, WebM, GIF)"),
        role: t(
          "회차를 프레임으로 다시 그려 VideoEncoder 로 인코딩하고, 형식 폴백은 시작 전에 계획으로 정해 사유와 함께 보여 줍니다.",
          "Redraws the episode as frames and encodes them with VideoEncoder; any format fallback is planned before the start and shown with its reason.",
        ),
        paths: [
          "apps/web/src/domains/creator/motion-webtoon/motion-webtoon-export.ts",
          "apps/web/src/domains/creator/export/studio-webcodecs-video-export.ts",
          "apps/web/src/domains/creator/export/studio-webcodecs-mp4-export.ts",
          "apps/web/src/domains/creator/motion-webtoon/MotionWebtoonExportPanel.tsx",
        ],
        route: "/studio/motion-webtoon",
      },
      {
        feature: t("순수 TypeScript 포장기", "In-house TypeScript muxers"),
        role: t(
          "WebM(EBML)과 MP4(ISO-BMFF) 컨테이너를 외부 라이브러리 없이 조립하며, 같은 입력이면 같은 바이트가 나옵니다.",
          "Assembles WebM (EBML) and MP4 (ISO-BMFF) containers without outside libraries, and the same input yields the same bytes.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-webcodecs-webm.ts",
          "apps/web/src/domains/creator/studio-webcodecs-mp4.ts",
          "apps/web/src/domains/creator/studio-webcodecs-timeline.ts",
        ],
      },
      {
        feature: t("애니메이션 이미지 가져오기 (GIF·APNG·WebP·AVIF)", "Importing animated images (GIF, APNG, WebP, AVIF)"),
        role: t(
          "ImageDecoder 가 있으면 프레임별로 풀어 편집 가능한 프레임 애니메이션(최대 60장)으로 가져오고, 없으면 기존 이미지 가져오기로 물러납니다.",
          "With ImageDecoder, animated images are decoded frame by frame into an editable frame animation (up to 60 frames); without it the older import path is used.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-webcodecs-image-decode.ts",
          "apps/web/src/domains/creator/canvas/studio-canvas-image-io.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("지원되는 인코더 설정을 직접 묻기", "Asking which encoder config is supported"),
        language: "ts",
        ...sampleSource([
          ["export async function pickEncoderConfig(width: number, height: number, framerate: number) {"],
          ['  if (typeof VideoEncoder === "undefined") return null;', "미지원이면 호출부가 미리 고른 다른 경로를 쓴다", "unsupported: the caller uses a route chosen beforehand"],
          ['  for (const codec of ["vp09.00.40.08", "vp8", "av01.0.08M.08"]) {'],
          ["    const config: VideoEncoderConfig = {"],
          ['      codec, width, height, framerate, bitrate: 4_000_000, hardwareAcceleration: "prefer-hardware",'],
          ["    };"],
          ["    const { supported } = await VideoEncoder.isConfigSupported(config);"],
          ["    if (supported) return config;", "MIME 문자열 추측 대신 브라우저에 직접 묻는다", "ask the browser instead of guessing from MIME strings"],
          ["  }"],
          ["  return null;"],
          ["}"],
        ]),
        explain: t(
          "코덱 문자열의 수준(level) 계산, 하드웨어/소프트웨어 순위, 비트레이트 권장값은 실제 코드(studio-webcodecs-capability.ts)가 맡습니다. 여기서는 isConfigSupported 로 묻는 핵심만 남겼습니다.",
          "Codec level calculation, hardware and software ranking and bitrate advice live in the real code (studio-webcodecs-capability.ts). This keeps only the core idea of asking with isConfigSupported.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("시작 전에 포맷을 한 번 정하는 순수 함수", "A pure function that fixes the format before starting"),
        language: "ts",
        ...sampleSource([
          ['export type Format = "mp4" | "webm" | "gif";'],
          ["export interface Caps { avc: boolean; vp: boolean }"],
          [""],
          ["export function planExport(requested: Format, caps: Caps) {"],
          ["  const pick = (format: Format, reason: string) => ({ format, fellBack: format !== requested, reason });"],
          ['  if (requested === "gif") return pick("gif", "gif-everywhere");'],
          ['  const first = requested === "mp4" ? caps.avc : caps.vp;'],
          ['  if (first) return pick(requested, "as-requested");'],
          ['  const second = requested === "mp4" ? caps.vp : caps.avc;'],
          ['  if (second) return pick(requested === "mp4" ? "webm" : "mp4", "other-video-format");', "요청한 코덱이 없으면 다른 영상 형식", "no requested codec: the other video format"],
          ['  return pick("gif", "gif-last-resort");', "마지막 수단은 어디서나 되는 GIF", "last resort is GIF, which works everywhere"],
          ["}"],
        ]),
        explain: t(
          "입력(요청 형식, 탐지 결과)이 같으면 항상 같은 계획이 나오는 순수 함수이고, reason 값이 사용자에게 보여 줄 문장의 열쇠가 됩니다. 실제 resolveMotionExportPlan 은 사유를 한국어·영어 문장으로 함께 돌려줍니다.",
          "A pure function: the same input (requested format, detected capabilities) always gives the same plan, and the reason value keys the sentence shown to the user. The real resolveMotionExportPlan returns the reason as Korean and English sentences.",
        ),
        source: "apps/web/src/domains/creator/motion-webtoon/motion-webtoon-export.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · WebCodecs API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API",
        kind: "docs",
        note: t("개념과 브라우저 호환성 표", "Concepts and the browser compatibility table"),
      },
      {
        title: "W3C · WebCodecs",
        url: "https://www.w3.org/TR/webcodecs/",
        kind: "spec",
      },
      {
        title: "MDN · VideoEncoder.isConfigSupported()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static",
        kind: "docs",
      },
      {
        title: "MDN · ImageDecoder",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder",
        kind: "docs",
        note: t("애니메이션 이미지를 프레임으로 푸는 API", "The API that decodes animated images into frames"),
      },
      {
        title: "MDN · MediaRecorder",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder",
        kind: "docs",
        note: t("실시간 녹화 방식의 비교 대상", "The real-time recording approach for comparison"),
      },
    ],
    chapterIds: ["browser-local-compute", "performance"],
    talk: {
      pitch: t(
        "영상을 내보낼 때 화면을 실시간으로 녹화하지 않고, 프레임을 하나씩 브라우저의 인코더에 직접 넘깁니다. 60초 영상을 60초 걸려 녹화하던 방식과 달리 장치가 허락하는 속도로, 같은 문서면 같은 결과를 만듭니다. 어떤 코덱이 되는지는 추측하지 않고 브라우저에 직접 묻고, 안 되면 시작 전에 정한 순서대로 다른 형식으로 안내합니다.",
        "When exporting video, it does not record the screen in real time; it feeds frames one by one straight to the browser's encoder. Unlike the old way of taking 60 seconds to record a 60-second video, it runs as fast as the device allows and the same document gives the same result. It asks the browser which codecs work instead of guessing, and if one does not, it follows an order fixed before starting and explains the switch.",
      ),
      analogy: t(
        "공연을 보면서 손으로 받아 적는 것(실시간 녹화)과, 대본을 인쇄소에 넘겨 바로 책으로 찍는 것(프레임을 인코더에 직접 전달)의 차이입니다.",
        "It is the difference between copying a performance by hand as it plays (real-time recording) and sending the script to a print shop to be bound at once (frames to the encoder).",
      ),
      questions: [
        {
          question: t("모든 브라우저에서 MP4 가 되나요?", "Does MP4 work in every browser?"),
          answer: t(
            "아닙니다. H.264 인코더가 없으면 WebM, 그것도 없으면 GIF 로 대신 만들고 그 이유를 화면에 보여 줍니다. 지원 현황은 MDN 호환성 표로 확인하세요.",
            "No. Without an H.264 encoder it makes WebM, and without that GIF, and it shows the reason on screen. Check the MDN compatibility table for support.",
          ),
        },
        {
          question: t("왜 포장기를 직접 만들었나요?", "Why write the muxers in-house?"),
          answer: t(
            "인코더는 조각(chunk)만 내놓고 파일로 묶는 일은 따로 해야 합니다. 직접 만든 포장기는 같은 입력이면 같은 바이트를 내고 외부 의존이 없어 바이트 단위로 테스트할 수 있습니다.",
            "The encoder only emits chunks; wrapping them into a file is a separate job. In-house muxers give the same bytes for the same input, have no outside dependency, and can be tested byte by byte.",
          ),
        },
        {
          question: t("하드웨어 가속을 쓰나요?", "Does it use hardware acceleration?"),
          answer: t(
            "가능한 코덱에서는 prefer-hardware 를 먼저 시도합니다. 다만 그 설정이 수락됐다는 것이지 하드웨어를 실제로 썼다는 보증은 아닙니다.",
            "Where possible it tries prefer-hardware first, but acceptance of that setting is not a guarantee that hardware was actually used.",
          ),
        },
      ],
      pitfall: t(
        "'모든 영상 내보내기가 WebCodecs'는 사실이 아닙니다. 모션 웹툰 내보내기가 WebCodecs 를 쓰고, 타임랩스 등은 아직 MediaRecorder 입니다. 더 엄격한 '자동 전환 없음' 계약(studio-webcodecs-plan)은 호출처가 없습니다. 이 카드는 실제 브라우저에서 인코딩 속도를 측정하지 않았습니다.",
        "It is not true that every video export uses WebCodecs: motion-webtoon export does, while the timelapse and others still use MediaRecorder. The stricter no-automatic-switch contract (studio-webcodecs-plan) has no caller. No encoding speed was measured in a real browser for this card.",
      ),
    },
    technologies: ["WebCodecs", "VideoEncoder", "ImageDecoder", "MediaRecorder", "WebM", "MP4"],
    facts: [
      {
        value: "avc1.640033 → 42001f",
        label: t("MP4(H.264) 후보를 높은 수준부터 시험하는 순서", "Order in which MP4 (H.264) candidates are tried, highest level first"),
        source: "apps/web/src/domains/creator/export/studio-webcodecs-mp4-export.ts",
      },
      {
        value: "60",
        label: t("애니메이션 이미지를 가져올 때 프레임 상한", "Frame cap when importing an animated image"),
        source: "apps/web/src/domains/creator/studio-frame-animation.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
