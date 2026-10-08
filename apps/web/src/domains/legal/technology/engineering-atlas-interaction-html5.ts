import { INTERACTION_REVIEWED_AT, t } from "./engineering-atlas-interaction-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** interaction · 브라우저 표준 끌어 놓기(HTML Drag and Drop)를 쓰는 카드: 삽입 허브 → 캔버스, OS 파일 드롭. */

const CREATOR = "apps/web/src/domains/creator";

const HTML5_DND_INSERT_HUB_CANVAS: EngineeringAtlasEntry = {
  id: "html5-dnd-insert-hub-canvas",
  category: "interaction",
  name: "HTML Drag and Drop",
  title: t("삽입 카드를 캔버스에 끌어 놓기", "Dragging an insert card onto the canvas"),
  status: "live",
  tagline: t(
    "삽입 허브의 카드를 손을 놓은 자리에 배치하되, 검증을 통과한 데이터만 받습니다.",
    "Places an insert-hub card exactly where you let go, and accepts only data that passed validation.",
  ),
  background: [
    t(
      "서점에서 책을 집어 계산대 위에 내려놓는 장면을 떠올려 보세요. 끌어 놓기(drag and drop)는 '집는다(dragstart) → 옮긴다(dragover) → 내려놓는다(drop)'를 브라우저가 표준 이벤트로 알려 주는 기능입니다. 삽입 허브에서 말풍선·이미지·3D 오브젝트 카드를 캔버스로 끌어 놓으면, 클릭할 때처럼 한가운데가 아니라 손을 놓은 바로 그 자리에 배치됩니다.",
      "Picture picking up a book in a shop and setting it on the counter. Drag and drop is the browser reporting three steps through standard events: picked up (dragstart), moving (dragover) and set down (drop). When you drag a speech bubble, image or 3D object card from the insert hub onto the canvas, it lands exactly where you let go, not in the middle as a click would place it.",
    ),
    t(
      "카드를 집는 순간 앱은 '무엇을 가져가는지'를 짐(DataTransfer)에 이름표(MIME 형식)를 붙여 싣습니다. 이 서비스는 이미지·SVG(application/json-asset), 텍스트·말풍선(application/json-insert), 3D 오브젝트(application/x-studio-object-insert+json) 세 가지 이름표로 의미를 나눕니다. 끌기를 시작할 때 내용을 해석·검증하고, 하나라도 실패하면 브라우저의 끌기 자체를 취소(preventDefault)합니다. 놓는 곳에서는 짐을 await 이전에 동기로 읽어야 하고, 파서가 모양·크기·위험 요소를 한 번 더 검사합니다.",
      "When you pick up a card, the app loads a parcel (DataTransfer) and sticks a label on it (a MIME type). This service uses three labels to keep meanings apart: images and SVG (application/json-asset), text and speech bubbles (application/json-insert) and 3D objects (application/x-studio-object-insert+json). The content is resolved and validated at dragstart, and if anything fails the browser drag itself is cancelled with preventDefault. On drop the parcel must be read synchronously, before any await, and a parser checks shape, size and risky markup once more.",
    ),
    t(
      "대안은 Pointer Events 로 따라다니는 복제본(고스트)과 충돌 검사를 직접 만드는 방식(칸반 보드가 이 방식)과 외부 라이브러리인데, 이 저장소의 package.json 에는 DnD 라이브러리가 없습니다. 이 기능은 설계 문서의 원칙대로 새 drag MIME 이나 별도 문서 변경 경로를 만들지 않고, 이미 있던 캔버스 drop 처리부에 데이터만 얹었습니다. 그래서 변경 티켓·페이지 고정·검토 잠금 같은 기존 규칙을 우회하지 않습니다.",
      "The alternatives are Pointer Events with a hand-built ghost (a following copy) and hit-testing, which the kanban board uses, or a library; the repository's package.json lists no drag-and-drop library. Following the design note, this feature creates no new drag MIME and no separate document-mutation path: it only puts data on the existing canvas drop handler. So existing rules such as mutation tickets, page pinning and review locks are not bypassed.",
    ),
    t(
      "한계도 분명합니다. 터치 기기의 끌기는 브라우저마다 달라서 억지로 숨기지 않고, 클릭·키보드로 넣는 버튼을 그대로 두었습니다. 끌 수 있는 카드는 코드의 허용 목록(canDragStudioInsertHubEntry)과 안전 검사를 통과한 텍스트·말풍선·내 에셋 이미지·벡터 요소·3D 오브젝트 등이며, 장면 템플릿·AI 생성·기기 업로드 버튼은 끌기 대상이 아닙니다.",
      "The limits are explicit. Touch dragging differs between browsers, so it is not papered over: the click and keyboard buttons stay in place. Only cards that pass the allow-list in code (canDragStudioInsertHubEntry) and the safety checks can be dragged, such as text, speech bubbles, your own images, vector elements and 3D objects. Scene templates, AI generation and device upload are not draggable.",
    ),
  ],
  keyPoints: [
    t("끌기 시작에서 검증하고, 실패하면 끌기를 취소", "Validate at dragstart; cancel the drag on failure"),
    t("dragover 는 형식 이름만, 내용은 drop 에서 동기로 읽기", "dragover shows type names only; read content synchronously on drop"),
    t("기존 drop 처리부를 재사용해 잠금·검토 규칙을 우회하지 않음", "Reuses the existing drop handler, so locks and review rules still apply"),
  ],
  diagram: {
    id: "html5-dnd-insert-hub-canvas-diagram",
    kind: "sequence",
    title: t("카드를 끌어서 놓기까지", "From picking up a card to dropping it"),
    caption: t(
      "끌 때 한 번, 놓을 때 한 번 검증하고, 문서 변경은 기존 drop 처리부 한 길로만 합니다.",
      "Validate once when dragging starts and once on drop; document changes go through the one existing drop path.",
    ),
    alt: t(
      "사용자가 삽입 카드의 핸들을 끌기 시작하면 카드가 내용을 검증해 DataTransfer 에 MIME 형식별로 싣고, 실패하면 끌기를 취소합니다. 캔버스 위에서는 형식 이름만 보고 복사 커서를 보여 주고, 놓는 순간 내용을 동기로 읽어 파서로 다시 검사합니다. 잠금과 대상 페이지를 확인한 뒤 기존 drop 처리부가 놓은 좌표에 요소를 추가합니다.",
      "When the user starts dragging an insert card's handle, the card validates its content and loads it into DataTransfer under a MIME type, or cancels the drag on failure. Over the canvas only type names are visible, so a copy cursor is shown; on drop the content is read synchronously and checked again by a parser. After the lock and target page are rechecked, the existing drop path adds the element at the drop coordinates.",
    ),
    actors: [
      { id: "user", label: t("사용자", "User"), sub: t("마우스·펜", "Mouse or pen"), tone: "neutral" },
      { id: "card", label: t("삽입 허브 카드", "Insert-hub card"), sub: t("핸들 버튼만 draggable", "Only the handle drags"), tone: "local" },
      { id: "dt", label: t("DataTransfer", "DataTransfer"), sub: t("MIME 이름표 + 문자열", "MIME label + string"), tone: "neutral" },
      { id: "canvas", label: t("캔버스", "Canvas"), sub: t("dragover · drop 처리", "dragover and drop"), tone: "local" },
      { id: "doc", label: t("편집 문서", "Document"), sub: t("기존 drop 처리부가 변경", "Changed by the existing path"), tone: "server" },
    ],
    messages: [
      { from: "user", to: "card", label: t("끌기 시작 (dragstart)", "Start dragging (dragstart)"), note: t("전용 핸들 버튼에서만 시작", "Only from the handle button") },
      { from: "card", to: "card", label: t("내용 해석·검증", "Resolve and validate"), note: t("실패하면 끌기 취소(preventDefault)", "On failure, cancel via preventDefault") },
      { from: "card", to: "dt", label: t("setData(MIME, JSON)", "setData(MIME, JSON)"), note: t("이미지·텍스트·3D를 이름표로 구분", "MIME labels tell image, text and 3D apart") },
      { from: "user", to: "canvas", label: t("캔버스 위로 이동 (dragover)", "Move over the canvas (dragover)"), note: t("내용은 숨겨지고 형식 이름만 보임", "Content is hidden; only type names show") },
      { from: "canvas", to: "user", style: "dashed", label: t("복사 커서 + 놓을 자리 표시", "Copy cursor and drop marker"), note: t("형식 이름·Files 여부로만 판정", "Decided from type names and Files only") },
      { from: "user", to: "canvas", label: t("놓기 (drop)", "Release (drop)") },
      { from: "canvas", to: "dt", label: t("getData() 동기 읽기", "Read getData() synchronously"), note: t("await 이전에, 좌표도 함께 붙잡기", "Before any await; capture coordinates too") },
      { from: "canvas", to: "canvas", label: t("파서로 모양·크기·위험 검사", "Parser checks shape, size, risk"), note: t("통과 못 하면 아무것도 추가 안 함", "If it fails, nothing is added") },
      { from: "canvas", to: "canvas", label: t("잠금·대상 페이지 재확인", "Recheck lock and target page"), note: t("isStudioPasteScopeCurrent", "isStudioPasteScopeCurrent") },
      { from: "canvas", to: "doc", label: t("놓은 좌표에 요소 추가", "Add the element at the drop point"), note: t("새 변경 경로를 만들지 않음", "No new mutation path") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 편집기 · 삽입 허브에서 끌기", "Studio editor · dragging from the insert hub"),
      role: t(
        "카드의 전용 핸들 버튼에만 draggable 을 걸고, dragstart 에서 내용을 해석·검증해 DataTransfer 에 씁니다. 실패하면 끌기 자체를 취소하고, 검토 잠금 중에는 draggable 속성도 뺍니다.",
        "Only the card's dedicated handle button is draggable; at dragstart the content is resolved, validated and written to DataTransfer. A failure cancels the drag itself, and during a review lock the draggable attribute is removed.",
      ),
      paths: [
        `${CREATOR}/StudioInsertHubDirectDragBoundary.tsx`,
        `${CREATOR}/studio-insert-hub-drag.ts#writeStudioInsertHubDragPayload`,
        `${CREATOR}/studio-insert-drag-core.ts`,
        `${CREATOR}/studio-object-insert-drag.ts`,
      ],
      route: "/studio",
    },
    {
      feature: t("스튜디오 캔버스 · 놓을 자리 표시(dragover)", "Studio canvas · drop marker (dragover)"),
      role: t(
        "dragover 에서는 내용을 읽을 수 없어 형식 이름과 Files 여부만으로 복사 커서를 판정하고, 놓을 자리를 data 속성과 CSS 변수로 그려 React 렌더 없이 따라가게 합니다.",
        "During dragover the content cannot be read, so the copy cursor is decided from type names and Files only, and the drop marker follows through a data attribute and CSS variables without React re-renders.",
      ),
      paths: [
        `${CREATOR}/studio-asset-transfer.ts#studioTransferCanInsert`,
        `${CREATOR}/canvas/studio-canvas-drop-import.ts#handleStudioCanvasDragOver`,
        `${CREATOR}/canvas/StudioCanvasStickyBanners.tsx`,
      ],
      route: "/studio",
    },
    {
      feature: t("스튜디오 캔버스 · 놓기(drop)", "Studio canvas · dropping"),
      role: t(
        "drop 에서 내용을 동기로 읽고 파서로 검증한 뒤, 대상 페이지와 검토 잠금이 그대로일 때만 놓은 좌표에 요소를 추가합니다. 같은 DataTransfer 는 한 번만 처리합니다.",
        "On drop the content is read synchronously and validated by a parser, and an element is added at the drop point only if the target page and review lock are unchanged. A given DataTransfer is handled only once.",
      ),
      paths: [
        `${CREATOR}/StudioCuttoonEditorHost.tsx#onWrapDrop`,
        `${CREATOR}/studio-shared-asset-drag.ts#parseStudioAssetDragPayload`,
        `${CREATOR}/studio-insert-drag-core.ts#consumeStudioInsertDropTransfer`,
      ],
      route: "/studio",
    },
    {
      feature: t("끌어 놓기 출발점 · 요소·말풍선·마켓 패널", "Drag sources · elements, bubbles and market panels"),
      role: t(
        "요소 패널, 말풍선 라이브러리, 원본 에셋 마켓, 툴벨도 같은 writer 함수로 같은 MIME 을 씁니다. 무거운 삽입 카탈로그는 lazy import 로 초기 번들에 싣지 않습니다.",
        "The elements panel, speech-bubble library, original-asset market and tool belt write the same MIME types through the same writer functions. The heavy insert catalog is lazy-imported so it stays out of the initial bundle.",
      ),
      paths: [
        `${CREATOR}/StudioElementsPanel.tsx`,
        `${CREATOR}/lettering/StudioBubbleLibraryPanel.tsx`,
        `${CREATOR}/studio-insert-drag-writer.ts`,
        `${CREATOR}/studio-unified-asset-lazy-ui.ts`,
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("짐에 싣고(dragstart), 동기로 읽어 검증하기(drop)", "Load the parcel (dragstart), read and validate it (drop)"),
      language: "ts",
      code: `const MIME = "application/x-demo-asset+json";

// dragstart: 짐(DataTransfer)에 이름표(MIME)를 붙여 내용을 싣는다.
export function writeDrag(dt: DataTransfer, payload: { id: string }): void {
  dt.setData(MIME, JSON.stringify(payload));
  dt.effectAllowed = "copy";
}

// drop: 이벤트 안에서 동기로 읽고, 크기·모양을 검사한 뒤에만 쓴다.
export function readDrop(e: DragEvent): { id: string } | null {
  const raw = e.dataTransfer?.getData(MIME) ?? "";
  if (raw.length === 0 || raw.length > 4096) return null; // 크기 상한
  try {
    const id = (JSON.parse(raw) as { id?: unknown } | null)?.id;
    return typeof id === "string" ? { id } : null; // 모양이 틀리면 버린다
  } catch {
    return null;
  }
}`,
      codeEn: `const MIME = "application/x-demo-asset+json";

// dragstart: load the parcel (DataTransfer) and stick a label (MIME) on it.
export function writeDrag(dt: DataTransfer, payload: { id: string }): void {
  dt.setData(MIME, JSON.stringify(payload));
  dt.effectAllowed = "copy";
}

// drop: read synchronously inside the event; use it only after size and shape checks.
export function readDrop(e: DragEvent): { id: string } | null {
  const raw = e.dataTransfer?.getData(MIME) ?? "";
  if (raw.length === 0 || raw.length > 4096) return null; // size limit
  try {
    const id = (JSON.parse(raw) as { id?: unknown } | null)?.id;
    return typeof id === "string" ? { id } : null; // wrong shape is dropped
  } catch {
    return null;
  }
}`,
      explain: t(
        "writeDrag 는 이름표(MIME)를 붙여 내용을 싣고, readDrop 은 drop 이벤트 안에서 동기로 읽습니다. 길이 상한과 모양 검사를 통과하지 못하면 null 을 돌려 아무것도 하지 않습니다(fail-closed).",
        "writeDrag loads the content under a MIME label and readDrop reads it synchronously inside the drop event. If the size limit or shape check fails it returns null and nothing happens (fail-closed).",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("drop 순서: 동기 읽기 → 늦은 파서 → 상황 재확인", "Drop order: sync read, late parser, recheck the situation"),
      language: "ts",
      code: `const consumed = new WeakSet<object>(); // 같은 DataTransfer 를 두 번 처리하지 않는다

export async function onDrop(
  e: DragEvent,
  currentPage: () => string,
  parse: (raw: string) => Promise<{ kind: string } | null>,
  apply: (item: { kind: string }, x: number, y: number) => void,
): Promise<void> {
  const dt = e.dataTransfer;
  if (!dt || consumed.has(dt)) return;
  consumed.add(dt);
  e.preventDefault();
  const raw = dt.getData("application/json-insert"); // await 이전에 동기로 읽는다
  const { clientX: x, clientY: y } = e; // 놓은 좌표도 지금 붙잡는다
  const pageAtDrop = currentPage();
  const item = await parse(raw); // 파서는 늦게 불러와도 된다
  if (item === null || currentPage() !== pageAtDrop) return; // 그 사이 페이지가 바뀌면 버린다
  apply(item, x, y);
}`,
      codeEn: `const consumed = new WeakSet<object>(); // never handle the same DataTransfer twice

export async function onDrop(
  e: DragEvent,
  currentPage: () => string,
  parse: (raw: string) => Promise<{ kind: string } | null>,
  apply: (item: { kind: string }, x: number, y: number) => void,
): Promise<void> {
  const dt = e.dataTransfer;
  if (!dt || consumed.has(dt)) return;
  consumed.add(dt);
  e.preventDefault();
  const raw = dt.getData("application/json-insert"); // read synchronously, before any await
  const { clientX: x, clientY: y } = e; // capture the drop point now as well
  const pageAtDrop = currentPage();
  const item = await parse(raw); // the parser may load late
  if (item === null || currentPage() !== pageAtDrop) return; // drop it if the page changed meanwhile
  apply(item, x, y);
}`,
      explain: t(
        "실제 onWrapDrop 의 핵심만 줄인 것입니다. 브라우저는 이벤트가 끝나면 DataTransfer 내용을 비우므로 getData 와 좌표는 await 앞에서 읽고, 파서가 늦게 도착한 뒤에는 대상 페이지(와 잠금)가 그대로인지 다시 확인합니다.",
        "This trims the real onWrapDrop to its core. The browser clears DataTransfer once the event ends, so getData and the coordinates are read before the await, and after the late-loaded parser the target page (and lock) is checked again.",
      ),
      source: `${CREATOR}/StudioCuttoonEditorHost.tsx`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · HTML Drag and Drop API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API",
      kind: "docs",
      note: t("이벤트 순서와 기본 사용법", "Event order and basic usage"),
    },
    {
      title: "MDN · DataTransfer",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer",
      kind: "docs",
      note: t("setData · getData · types · effectAllowed", "setData, getData, types and effectAllowed"),
    },
    {
      title: "MDN · Working with the drag data store",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_data_store",
      kind: "docs",
      note: t("끌기 데이터 저장소의 구조, setData·getData, 흔한 형식", "Store structure, setData and getData, and common types"),
    },
    {
      title: "WHATWG HTML Standard · Drag and drop",
      url: "https://html.spec.whatwg.org/multipage/dnd.html",
      kind: "spec",
      note: t("보호 모드(읽기 제한)가 정의된 표준", "The standard that defines the protected modes"),
    },
  ],
  chapterIds: ["brush-engine", "quality"],
  talk: {
    pitch: t(
      "삽입 허브의 카드를 캔버스에 끌어 놓으면 손을 놓은 자리에 바로 들어갑니다. 브라우저 표준 끌어 놓기를 쓰고, 끌기를 시작할 때와 놓을 때 두 번 데이터를 검사합니다. 위험하거나 이상한 데이터는 끌기가 시작되지도 않고, 놓은 뒤에도 기존 편집 규칙 그대로 한 번만 반영됩니다. 터치나 키보드 사용자는 같은 카드의 클릭 삽입 버튼을 쓰면 됩니다.",
      "Drag a card from the insert hub onto the canvas and it lands where you let go. It uses the browser's standard drag and drop, and checks the data twice: when the drag starts and when you drop. Suspicious data never starts a drag, and after the drop it is applied once through the existing editing rules. Touch and keyboard users use the same card's click-to-insert button.",
    ),
    analogy: t(
      "택배 상자에 내용물 이름표를 붙여 보내고, 받는 쪽이 이름표와 내용물을 다시 확인한 뒤에야 선반에 올리는 것과 같습니다.",
      "It is like mailing a parcel with a content label: the receiver checks both the label and what is inside before shelving it.",
    ),
    questions: [
      {
        question: t("dnd-kit 같은 라이브러리는 왜 안 쓰나요?", "Why not use a library such as dnd-kit?"),
        answer: t(
          "이 저장소 package.json 에는 DnD 라이브러리가 없고 전부 직접 구현입니다. 이 기능의 목적은 기존 drop 처리부를 재사용하는 것이라 표준 이벤트에 데이터만 얹었습니다. 라이브러리를 비교해서 내린 결정 문서는 찾지 못했습니다.",
          "The repository's package.json has no drag-and-drop library; everything is implemented directly. This feature's goal is to reuse the existing drop handler, so it only puts data on the standard events. I found no decision document that compared libraries.",
        ),
      },
      {
        question: t("악성 SVG 나 초대형 이미지를 놓으면요?", "What if someone drops a malicious SVG or a huge image?"),
        answer: t(
          "끌기를 시작할 때와 놓을 때 같은 파서가 길이, data URL 형식, SVG 위험 요소(script·이벤트 속성·외부 href 등), 픽셀 예산을 검사합니다. 통과하지 못하면 끌기가 취소되거나 아무것도 추가되지 않습니다.",
          "The same parser checks length, data-URL format, risky SVG features (script, event attributes, external href and so on) and the pixel budget both when the drag starts and when you drop. If a check fails, the drag is cancelled or nothing is added.",
        ),
      },
      {
        question: t("모바일·터치에서도 끌 수 있나요?", "Can I drag on mobile or touch devices?"),
        answer: t(
          "터치 끌기는 브라우저마다 달라서 보장하지 않습니다. 같은 카드에 클릭으로 넣는 버튼이 있고 키보드로도 실행됩니다. 끌기는 보조 경로라는 것이 설계 원칙입니다.",
          "Touch dragging varies by browser and is not guaranteed. The same card has a click-to-insert button that also works from the keyboard. The design treats dragging as a secondary path.",
        ),
      },
    ],
    pitfall: t(
      "과장 주의: ① 끌 수 있는 것은 허용 목록의 항목뿐입니다. ② 소재 도감 카드에는 '스튜디오 탭에 놓을 수도 있어요' 힌트와 데이터를 쓰는 코드가 있지만, 그 데이터를 읽어 캔버스에 놓는 코드는 이 저장소에서 찾지 못했습니다(미확인). 시연 기능처럼 말하지 마세요. ③ 실제 브라우저·터치 기기별 동작은 확인하지 못했습니다.",
      "Avoid overstating: (1) only allow-listed items can be dragged. (2) The material atlas cards show a hint that you can drop them on the studio tab and write drag data, but I found no code in this repository that reads that data and places it on the canvas (unconfirmed), so do not present it as a demo feature. (3) Behaviour across real browsers and touch devices was not verified.",
    ),
  },
  technologies: ["HTML Drag and Drop", "DataTransfer", "React"],
  facts: [
    {
      value: "33,554,432",
      label: t("끌기 payload(data URL)의 길이 상한(문자 수, 32 * 1024 * 1024)", "Maximum drag payload (data URL) length in characters (32 * 1024 * 1024)"),
      source: `${CREATOR}/studio-upload-image-safety.ts`,
    },
    {
      value: "16,384 px",
      label: t("끌어 놓는 이미지의 한 변 상한", "Maximum side length of a dropped image"),
      source: `${CREATOR}/studio-shared-asset-drag.ts`,
    },
    {
      value: "2 MiB",
      label: t("끌어 놓는 SVG 의 디코드 크기 상한", "Maximum decoded size of a dropped SVG"),
      source: `${CREATOR}/studio-shared-asset-drag.ts`,
    },
    {
      value: "4,096",
      label: t("3D 오브젝트 payload 길이 상한(문자 수)", "Maximum 3D object payload length in characters"),
      source: `${CREATOR}/studio-object-insert-drag.ts`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

const FILE_DROP_IMPORT_SAFETY: EngineeringAtlasEntry = {
  id: "file-drop-import-safety",
  category: "interaction",
  name: "File drag and drop",
  title: t("바탕화면 파일을 캔버스에 안전하게 놓기", "Dropping desktop files onto the canvas, safely"),
  status: "live",
  tagline: t(
    "캔버스에 놓은 파일을 확장자로 나눠 알맞은 가져오기 길로 보내고, 위험한 입력은 문서에 닿기 전에 막습니다.",
    "Sorts files dropped on the canvas by extension, routes each to the right import path, and stops risky input before it reaches the document.",
  ),
  background: [
    t(
      "우체국 창구에 소포를 내려놓는다고 생각해 보세요. 직원은 상자 겉면(확장자·크기)부터 보고 열어도 되는 물건인지 가립니다. 바탕화면의 파일을 브라우저 창으로 끌어다 놓으면 브라우저는 drop 이벤트와 함께 파일 목록(DataTransfer.files)을 건네줍니다. ToonStudio 는 캔버스에 놓은 이미지·PSD·ORA·CBZ·WILL·브러시 팩을 각각 알맞은 가져오기 경로로 보냅니다.",
      "Imagine setting a parcel on a post-office counter. The clerk looks at the outside of the box (its extension and size) before deciding whether it may be opened. When you drag a desktop file into the browser, the browser fires a drop event with a file list (DataTransfer.files). ToonStudio routes an image, PSD, ORA, CBZ, WILL or brush pack dropped on the canvas to the import path that fits it.",
    ),
    t(
      "끌고 오는 동안(dragover)에는 보안상 파일 이름이 숨겨지고 형식(MIME)만 보입니다. 그래서 이 단계에서는 받아도 될 듯한 형식인지만 보고 복사 커서나 금지 커서를 보여 주며, 놓은 뒤(drop)에 확장자로 길을 나눕니다. 일부 브라우저는 PSD 에 image/* 형식을 붙이기 때문에 형식이 아닌 확장자로 가립니다. 작업 파일은 프로젝트 센터의 파일 선택 창과 같은 가져오기 함수로 넘기고, 읽기·검사·손실 미리보기·확인은 그 함수가 맡습니다.",
      "While you are still dragging (dragover), the browser hides file names for security and shows only the type (MIME). So that step only asks whether the type looks acceptable and shows a copy or forbidden cursor; after the drop (drop), the extension decides the route. Some browsers label PSD files image/*, so the extension is used rather than the type. Work files go to the same import function as the Project Center file picker, which still does the reading, checking, loss preview and confirmation.",
    ),
    t(
      "대안은 <input type=file> 선택 창(키보드·스크린리더에서도 쓰는 기본 경로)과 File System Access API 입니다. 끌어 놓기는 편의 경로라서 파일 선택 버튼과 같은 핸들러를 공유하게 했습니다. JPEG·PNG·WebP 이미지는 원본이 12 MiB 이하인지, 헤더에서 읽은 픽셀 수가 예산 이내인지 확인한 뒤에 디코드합니다. 프로젝트 백업(.json·.toonstudio·.zip)은 문서 전체를 바꾸므로 한 번의 드롭으로 열지 않고, 어디서 여는지만 안내합니다.",
      "The alternatives are the <input type=file> picker, the default path that also works with keyboard and screen readers, and the File System Access API. Dropping is a convenience, so the picker button shares the same handler. For JPEG, PNG and WebP images, the source must be at most 12 MiB and the pixel count read from the header must fit the budget before decoding. Project backups (.json, .toonstudio, .zip) replace the whole document, so a single drop never opens them; the app only says where to open them.",
    ),
    t(
      "한계와 과장 방지: 캔버스 드롭은 여러 장을 놓아도 첫 이미지 1장만 쓰고(여러 장은 삽입 허브의 다중 이미지 프리플라이트), 폴더 드롭은 구현하지 않았습니다(webkitGetAsEntry·getAsFileSystemHandle 사용처 없음). .clip(CLIP STUDIO)·.ai 는 독점 구조라 직접 열지 않는 bridge-only 이므로 'CLIP 호환'이라고 말하면 과장입니다.",
      "Limits and no overstating: a canvas drop uses only the first image even if you drop several (several images go through the insert hub's batch preflight), and folder drop is not implemented (no use of webkitGetAsEntry or getAsFileSystemHandle). .clip (CLIP STUDIO) and .ai are proprietary and are not opened directly (bridge-only), so calling it CLIP compatible would be an overstatement.",
    ),
  ],
  keyPoints: [
    t("끌 때는 형식만 보이고, 확장자는 놓은 뒤에 판정", "While dragging only types show; the extension is judged after the drop"),
    t("작업 파일은 파일 선택과 같은 가져오기 함수로 전달", "Work files go to the same import function as the file picker"),
    t("프로젝트 백업은 열지 않고 안내, .clip·.ai 는 직접 열지 않음", "Backups are not opened by drop; .clip and .ai are not opened directly"),
  ],
  diagram: {
    id: "file-drop-import-safety-diagram",
    kind: "graph",
    title: t("파일 드롭이 문서가 되기까지", "How a dropped file becomes document content"),
    caption: t(
      "놓는 순간 확장자로 길을 나누고, 위험한 입력은 문서에 닿기 전에 걸러냅니다.",
      "The extension picks the route at the moment of the drop, and risky input is filtered before it touches the document.",
    ),
    alt: t(
      "파일을 끌고 오는 동안에는 형식만 보고 커서를 정하고, 놓으면 확장자 분기로 갑니다. PSD·ORA·CBZ·WILL·브러시 팩은 기존 가져오기 함수를 거쳐 검사·미리보기·확인을 받고, 이미지는 첫 한 장만 크기와 픽셀 예산을 검사한 뒤 놓은 자리에 배치됩니다. 프로젝트 백업이나 지원하지 않는 형식은 열지 않고 안내만 합니다.",
      "While a file is dragged, only its type decides the cursor; on drop it reaches an extension branch. PSD, ORA, CBZ, WILL and brush packs pass through the existing import function for checking, preview and confirmation. Only the first image is checked against size and pixel budgets and placed where it was dropped, while project backups and unsupported types are not opened and only produce a notice.",
    ),
    nodes: [
      { id: "over", label: t("끌고 오는 중", "While dragging"), sub: t("형식만 보고 커서 결정", "Cursor set by type only"), tone: "local", at: [0, 1] },
      { id: "split", label: t("확장자 분기", "Extension branch"), sub: t("drop 때 판정", "Judged on drop"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "importer", label: t("기존 가져오기 함수", "Existing importer"), sub: t("파일 선택 창과 같은 함수", "Same one as the file picker"), tone: "local", at: [2, 0] },
      { id: "review", label: t("검사·확인 단계", "Check and confirm"), sub: t("손실을 보여 주고 승인", "Shows loss, then approves"), tone: "warn", at: [3, 0] },
      { id: "image", label: t("첫 이미지 1장", "First image only"), sub: t("여러 장이어도 한 장", "One even if several"), tone: "local", at: [2, 1] },
      { id: "budget", label: t("크기·픽셀 검사", "Size and pixel check"), sub: t("12MiB · 헤더 픽셀 확인", "12 MiB; header pixels"), tone: "warn", at: [3, 1] },
      { id: "place", label: t("놓은 자리에 배치", "Placed where dropped"), sub: t("디코드 뒤 요소로 추가", "Added as an element"), tone: "good", at: [4, 1] },
      { id: "guide", label: t("열지 않고 안내", "Notice, not opened"), sub: t("백업 · 미지원 형식", "Backups, unsupported types"), tone: "warn", at: [2, 2] },
    ],
    edges: [
      { from: "over", to: "split", label: t("놓기", "drop") },
      { from: "split", to: "importer", label: t("작업 파일", "work file") },
      { from: "importer", to: "review" },
      { from: "split", to: "image", label: t("이미지", "image") },
      { from: "image", to: "budget" },
      { from: "budget", to: "place" },
      { from: "split", to: "guide", label: t("백업·미지원", "backup, other") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 캔버스 · 파일 끌어 놓기", "Studio canvas · dropping files"),
      role: t(
        "dragover 에서 형식만 보고 복사/금지 커서를 정하고, drop 에서 확장자로 PSD·ORA·CBZ·WILL·브러시 팩·프로젝트 백업·이미지를 나눕니다. 작업 파일은 한 번에 한 개만 받습니다.",
        "At dragover only the type decides a copy or forbidden cursor; at drop the extension separates PSD, ORA, CBZ, WILL, brush packs, project backups and images. Work files are accepted one at a time.",
      ),
      paths: [
        `${CREATOR}/canvas/studio-canvas-drop-import.ts#planStudioCanvasFileDrop`,
        `${CREATOR}/canvas/studio-canvas-drop-import.ts#handleStudioCanvasDragOver`,
        `${CREATOR}/StudioCuttoonEditorHost.tsx#onWrapDrop`,
      ],
      route: "/studio",
    },
    {
      feature: t("프로젝트 센터와 같은 가져오기 경로", "Same import path as the Project Center"),
      role: t(
        "놓은 파일 하나를 파일 선택 창의 change 이벤트 모양으로 감싸 기존 핸들러에 넘깁니다. 잠금·진행 중이면 이유를 오류 줄로 알려 '놓았는데 무반응'을 없앱니다.",
        "A dropped file is wrapped in the shape of a file-input change event and handed to the existing handler. If a lock or another import is in progress, the reason is shown so a drop never silently does nothing.",
      ),
      paths: [
        `${CREATOR}/studio-cuttoon-editor/studio-synthetic-file-change-event.ts#createStudioFileChangeEvent`,
        `${CREATOR}/canvas/studio-canvas-drop-import.ts#runStudioCanvasDropImport`,
      ],
    },
    {
      feature: t("이미지 안전 검사", "Image safety checks"),
      role: t(
        "원본 12 MiB 이하인지, JPEG·PNG·WebP 헤더에서 읽은 픽셀 수가 예산(데스크톱 16,777,216 · 모바일 8,388,608) 이내인지, 확장 형식과 내용이 맞는지를 디코드 전에 확인합니다.",
        "Before decoding, it checks that the source is at most 12 MiB, that the pixel count read from the JPEG, PNG or WebP header fits the budget (desktop 16,777,216; mobile 8,388,608), and that the declared type matches the content.",
      ),
      paths: [
        `${CREATOR}/studio-upload-image-safety.ts#inspectStudioUploadSourceImage`,
        `${CREATOR}/canvas/studio-canvas-image-io.ts#loadImageFileForCanvas`,
      ],
    },
    {
      feature: t("형식 레지스트리 · 직접 호환 범위", "Format registry · what is opened directly"),
      role: t(
        "형식마다 크기 예산과 가져오기 상태를 선언합니다. PSD 128 MiB, 브러시 .abr 32 MiB·256개이고, .clip·.ai 는 bridge-only 로 직접 열지 않으며 PSD·PNG·SVG 로 우회하라고 안내합니다.",
        "Each format declares a size budget and import status. PSD allows 128 MiB, a .abr brush pack 32 MiB and 256 brushes, and .clip and .ai are bridge-only: not opened directly, with PSD, PNG or SVG suggested instead.",
      ),
      paths: [`${CREATOR}/studio-interchange-capabilities.ts`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("파일 드롭존 만들기", "Building a file drop zone"),
      language: "ts",
      code: `export function bindDropZone(zone: HTMLElement, onFiles: (files: File[]) => void): void {
  const off = () => delete zone.dataset.dropActive;
  zone.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return; // 파일 드래그만 받는다
    e.preventDefault(); // 이것이 없으면 drop 이벤트가 오지 않는다
    zone.dataset.dropActive = "true"; // React state 대신 DOM 속성 + CSS로 표시
  });
  zone.addEventListener("dragleave", (e) => {
    // 자식 요소로 넘어가는 경계에서는 표시를 끄지 않는다.
    if (!(e.relatedTarget instanceof Node && zone.contains(e.relatedTarget))) off();
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    off();
    onFiles(Array.from(e.dataTransfer?.files ?? []));
  });
}`,
      codeEn: `export function bindDropZone(zone: HTMLElement, onFiles: (files: File[]) => void): void {
  const off = () => delete zone.dataset.dropActive;
  zone.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return; // accept file drags only
    e.preventDefault(); // without this, the drop event never fires
    zone.dataset.dropActive = "true"; // show it with a DOM attribute + CSS, not React state
  });
  zone.addEventListener("dragleave", (e) => {
    // do not clear the marker when moving onto a child element
    if (!(e.relatedTarget instanceof Node && zone.contains(e.relatedTarget))) off();
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    off();
    onFiles(Array.from(e.dataTransfer?.files ?? []));
  });
}`,
      explain: t(
        "dragover 에서 preventDefault 를 하지 않으면 drop 이 오지 않습니다. 표시는 React 상태가 아니라 data 속성으로 해서, dragover 가 초당 수십 번 와도 다시 그리지 않습니다.",
        "Without preventDefault in dragover the drop never arrives. The marker uses a data attribute instead of React state, so dozens of dragover events per second cause no re-render.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("확장자로 가져오기 길 정하기", "Choosing the import path by extension"),
      language: "ts",
      code: `type DropPlan =
  | { kind: "import"; target: "psd" | "interchange" | "brush-pack"; file: File }
  | { kind: "guide"; message: string } // 열지 않고 안내만
  | { kind: "none" }; // 이미지 경로가 이어서 판단

const PSD = /\\.psd$/iu;
const EXCHANGE = /\\.(?:ora|cbz|will)$/iu;
const BRUSH = /\\.(?:abr|myb|kpp|sut|sutg|bundle)$/iu;
const BACKUP = /\\.(?:toonstudio|json|zip)$/iu;

// 일부 브라우저가 PSD 에 image/* 를 붙이므로 MIME 이 아니라 확장자로 가른다.
export function planFileDrop(files: readonly File[]): DropPlan {
  for (const file of files) {
    if (PSD.test(file.name)) return { kind: "import", target: "psd", file };
    if (EXCHANGE.test(file.name)) return { kind: "import", target: "interchange", file };
    if (BRUSH.test(file.name)) return { kind: "import", target: "brush-pack", file };
  }
  if (files.some((file) => BACKUP.test(file.name))) {
    return { kind: "guide", message: "백업 파일은 끌어 놓아 열지 않아요." };
  }
  return { kind: "none" };
}`,
      codeEn: `type DropPlan =
  | { kind: "import"; target: "psd" | "interchange" | "brush-pack"; file: File }
  | { kind: "guide"; message: string } // only show a notice
  | { kind: "none" }; // the image path decides next

const PSD = /\\.psd$/iu;
const EXCHANGE = /\\.(?:ora|cbz|will)$/iu;
const BRUSH = /\\.(?:abr|myb|kpp|sut|sutg|bundle)$/iu;
const BACKUP = /\\.(?:toonstudio|json|zip)$/iu;

// Some browsers tag PSD as image/*, so route by extension, not by MIME type.
export function planFileDrop(files: readonly File[]): DropPlan {
  for (const file of files) {
    if (PSD.test(file.name)) return { kind: "import", target: "psd", file };
    if (EXCHANGE.test(file.name)) return { kind: "import", target: "interchange", file };
    if (BRUSH.test(file.name)) return { kind: "import", target: "brush-pack", file };
  }
  if (files.some((file) => BACKUP.test(file.name))) {
    return { kind: "guide", message: "Backups are not opened by dropping." };
  }
  return { kind: "none" };
}`,
      explain: t(
        "실제 planStudioCanvasFileDrop 을 줄인 것입니다. 작업 파일은 이미지와 섞여 있어도 먼저 고르고, 프로젝트 백업은 import 가 아니라 안내(guide)로 돌립니다.",
        "A trimmed version of the real planStudioCanvasFileDrop. Work files are picked first even when mixed with images, and project backups become a notice (guide) rather than an import.",
      ),
      source: `${CREATOR}/canvas/studio-canvas-drop-import.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · File drag and drop",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop",
      kind: "docs",
      note: t("파일 드롭존의 기본 패턴", "The basic pattern for a file drop zone"),
    },
    {
      title: "MDN · DataTransfer.files",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files",
      kind: "docs",
    },
    {
      title: "MDN · File System API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API",
      kind: "docs",
      note: t("파일 선택 창의 대안", "An alternative to the file picker"),
    },
    {
      title: "WHATWG HTML Standard · Drag and drop",
      url: "https://html.spec.whatwg.org/multipage/dnd.html",
      kind: "spec",
    },
  ],
  chapterIds: ["browser-local-compute", "quality"],
  talk: {
    pitch: t(
      "캔버스에 파일을 끌어 놓으면 ToonStudio 가 확장자를 보고 이미지는 그 자리에 배치하고, PSD 같은 작업 파일은 프로젝트 센터와 같은 가져오기 절차로 보냅니다. 크기와 픽셀 수는 열기 전에 헤더로 확인하고, 프로젝트 백업처럼 문서 전체를 바꾸는 파일은 한 번의 드롭으로 열지 않습니다. CLIP STUDIO 의 .clip 은 직접 열지 않고 PSD·PNG·SVG 로 우회하도록 안내합니다.",
      "Drop a file on the canvas and ToonStudio looks at the extension: images are placed at that spot, and work files such as PSD go through the same import procedure as the Project Center. Size and pixel count are checked from the header before opening, and files that replace the whole document, like a project backup, are never opened by a single drop. CLIP STUDIO's .clip is not opened directly; the app suggests PSD, PNG or SVG instead.",
    ),
    analogy: t(
      "우체국 창구에서 상자 겉면을 먼저 보고, 위험하면 열지 않고 돌려보내는 직원과 같습니다.",
      "Like a post-office clerk who inspects the outside of a box first and returns it unopened if it looks unsafe.",
    ),
    questions: [
      {
        question: t("PSD 를 놓으면 레이어가 그대로 열리나요?", "Does dropping a PSD keep all layers intact?"),
        answer: t(
          "아니요. PSD 는 부분 지원이라 텍스트·벡터·스마트 오브젝트·조정 레이어 일부는 래스터화되거나 생략됩니다. 그래서 가져오기 핸들러가 손실 미리보기와 확인 단계를 거칩니다.",
          "No. PSD support is partial: parts of text, vector, smart-object and adjustment layers are rasterized or dropped. That is why the import handler shows a loss preview and asks for confirmation.",
        ),
      },
      {
        question: t("CLIP STUDIO 파일(.clip)도 되나요?", "Does it open CLIP STUDIO files (.clip)?"),
        answer: t(
          "직접 열지 않습니다. 형식 레지스트리가 .clip 을 bridge-only 로 표시하고 '직접 호환을 지원한다고 표시하지 않습니다'라고 적어 두었습니다. PSD·PNG·SVG 로 내보낸 파일을 쓰도록 안내합니다.",
          "Not directly. The format registry marks .clip as bridge-only and states that it does not claim direct compatibility. Users are pointed to PSD, PNG or SVG exports instead.",
        ),
      },
      {
        question: t("파일 여러 개를 한 번에 놓으면요?", "What if I drop several files at once?"),
        answer: t(
          "캔버스 드롭은 작업 파일을 한 번에 한 개, 이미지는 첫 한 장만 씁니다. 여러 장 이미지는 삽입 허브의 다중 이미지 프리플라이트가 받습니다. 폴더 드롭은 아직 없습니다.",
          "A canvas drop takes one work file at a time and only the first image. Several images go through the insert hub's batch preflight. Folder drop does not exist yet.",
        ),
      },
    ],
    pitfall: t(
      "과장 주의: 'CLIP 호환', '모든 이미지 형식 지원', '폴더 통째로 가져오기'라고 말하지 마세요. 3D 모델(GLB·VRM·SKP) 파일의 드롭 지원은 전수 확인하지 못했고, 3D 에셋 라이브러리 패널에는 드롭 처리 없이 파일 선택만 있었습니다. 실제 브라우저별 파일 드롭 동작은 확인하지 못했습니다(미확인).",
      "Avoid overstating: do not say CLIP compatible, every image format, or whole-folder import. I did not audit drop support for 3D model files (GLB, VRM, SKP); the 3D asset library panel has only a file picker and no drop handling. Behaviour of file drops across real browsers was not verified.",
    ),
  },
  technologies: ["DataTransfer.files", "File System Access API", "PSD"],
  facts: [
    {
      value: "12 MiB",
      label: t("이미지 원본 파일 크기 상한", "Maximum source image file size"),
      source: `${CREATOR}/studio-upload-image-safety.ts`,
    },
    {
      value: "16,777,216 / 8,388,608",
      label: t("디코드 픽셀 상한(데스크톱 / 모바일·저메모리)", "Decoded pixel limit (desktop / mobile or low memory)"),
      source: `${CREATOR}/studio-upload-image-safety.ts`,
    },
    {
      value: "128 MiB",
      label: t("PSD 파일 크기 상한", "Maximum PSD file size"),
      source: `${CREATOR}/studio-interchange-capabilities.ts`,
    },
    {
      value: "64 MiB",
      label: t("BMP·TGA·PPM·PAM·QOI·TIFF 열기 크기 상한", "Open limit for BMP, TGA, PPM, PAM, QOI and TIFF files"),
      source: `${CREATOR}/canvas/studio-canvas-image-io.ts`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

export const ENGINEERING_ATLAS_INTERACTION_HTML5: readonly EngineeringAtlasEntry[] = [
  HTML5_DND_INSERT_HUB_CANVAS,
  FILE_DROP_IMPORT_SAFETY,
];
