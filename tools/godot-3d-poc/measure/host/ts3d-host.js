/**
 * 셸(React 앱)쪽 호스트 브리지 참조 구현 — Godot 3D PoC 의 DTO 계약.
 *
 * 기존 가상스튜디오 임베드(`StudioGodotSpaceEmbed.tsx`)와 같은 구조다:
 *  - 부모 창이 `window.__ts3dHost` 를 iframe 로드보다 먼저 등록한다(Godot 가 `parent.__ts3dHost` 로 호출).
 *  - 부모 -> Godot 은 iframe 창의 `__ts3d_command(json)` 하나를 JSON 문자열로 호출한다.
 *  - 모든 명령은 `id` 를 가지며 Godot 는 `replyTo` 가 같은 `<cmd>:result` 이벤트로 답한다.
 * 이진 확장(기존 계약에 없음): 부모가 자기 창의 `__ts3dInbox` 에 Uint8Array 뷰를 두고(setInbox) `source.kind = "inbox"` 로 알린다.
 * (ArrayBuffer 를 그대로 두면 iframe 안의 엔진이 교차 realm 이라 거부한다 — setInbox 주석 참고)
 * Godot -> 호스트 이진은 base64 문자열(`onBinary`)이며 이 도우미가 Uint8Array 로 복원한다.
 */
export function createTs3dHost(frameOrWindow) {
  const hostWindow = window;
  const target = frameOrWindow ?? window;
  const pending = new Map();
  const events = [];
  const binaries = new Map();
  let seq = 0;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  hostWindow.__ts3dHost = {
    onEvent(json) {
      const event = JSON.parse(json);
      event.hostReceivedAt = performance.now();
      events.push(event);
      if (event.type === "ready") readyResolve(event);
      const waiter = event.replyTo ? pending.get(event.replyTo) : undefined;
      if (waiter) {
        pending.delete(event.replyTo);
        waiter(event);
      }
    },
    onBinary(id, name, base64) {
      const t0 = performance.now();
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      const list = binaries.get(id) ?? [];
      list.push({ name, bytes, base64Length: base64.length, decodeMs: performance.now() - t0 });
      binaries.set(id, list);
    },
  };

  function commandWindow() {
    return target.contentWindow ?? target;
  }

  return {
    ready,
    events,
    binaries,
    /** 명령을 보내고 같은 id 의 결과 이벤트를 기다린다. */
    send(command, timeoutMs = 240000) {
      seq += 1;
      const id = `c${seq}`;
      const sentAt = performance.now();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`명령 응답 시간 초과: ${command.cmd}`));
        }, timeoutMs);
        pending.set(id, (event) => {
          clearTimeout(timer);
          resolve({ event, id, sentAt, roundTripMs: event.hostReceivedAt - sentAt });
        });
        commandWindow().__ts3d_command(JSON.stringify({ ...command, id }));
      });
    },
    /**
     * 이진 입력: 호스트(부모) 창의 __ts3dInbox 에 둔다. Godot 는 parent.__ts3dInbox 에서 복사해 간다(단독 실행이면 parent == window).
     *
     * iframe 임베드에서는 반드시 Uint8Array 뷰로 넘긴다(기본값). 4.4.1 엔진 JS 의 검사는
     * `obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)`(GodotJSWrapper.isBuffer)인데, 부모 창이 만든 ArrayBuffer 는
     * iframe 창의 ArrayBuffer 생성자와 달라(교차 realm) instanceof 가 false 이고 JavaScriptBridge.is_js_buffer 도 false 가 되어
     * 빈 입력으로 처리된다. ArrayBuffer.isView 는 realm 과 무관하게 true 이므로 뷰는 통과한다(bridge 스위트의 `arraybuffer` 대조군이 실측).
     * as: "arraybuffer" 는 그 실패를 재현하는 대조군 전용이다.
     */
    setInbox(data, { as = "view" } = {}) {
      const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data);
      hostWindow.__ts3dInbox = as === "arraybuffer" ? view.buffer : view;
    },
    takeBinaries(id) {
      const list = binaries.get(id) ?? [];
      binaries.delete(id);
      return list;
    },
  };
}
