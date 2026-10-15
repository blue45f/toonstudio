extends Node
## JS 브리지(JavaScriptBridge) — 명령/이벤트 DTO.
##
## 기존 가상스튜디오 godot-space 브리지(`apps/web/src/domains/creator/virtual-space/studio-godot-host-bridge.ts`,
## `studio-godot-space-embed-support.ts` 의 TsvsHostBridge / TsvsGodotFrameWindow)와 같은 모양을 따른다.
##  - 셸 -> Godot: iframe 창의 전역 함수 `window.__ts3d_command(json)` 하나로 명령을 받는다(기존: `__tsvs_*` 여러 개).
##  - Godot -> 셸: `window.parent.__ts3dHost.onEvent(json)`(기존: `window.__tsvsHost.on*(json)`). 단독 실행이면 parent == window.
##  - 모든 메시지는 JSON 문자열이며 `v`(프로토콜 버전)·`id`/`replyTo`(상관 ID)·`type`/`cmd` 를 가진다.
## 이진 데이터는 기존 계약에 없는 확장이다:
##  - 셸 -> Godot: 호스트가 `window.__ts3dInbox` 에 Uint8Array 뷰를 두면 Godot 가 복사해 간다(js_buffer_to_packed_byte_array). iframe 에서 부모 창의 ArrayBuffer 는 교차 realm 이라 거부된다(host/ts3d-host.js setInbox).
##  - Godot -> 셸: GDScript 에서 JS 로 넘길 수 있는 값은 기본형뿐이라 base64 문자열을 `onBinary(id, name, b64)` 로 보낸다.
##
## 공식 제약(docs.godotengine.org/en/4.4/tutorials/platform/web/javascript_bridge.html, 2026-10-15 확인):
## create_callback 의 반환 참조를 유지해야 하고, 콜백은 정확히 하나의 Array 인자를 받아야 하며,
## 기본형(int/float/String/bool) 외에는 JavaScriptObject 로 보인다. eval() 의 ArrayBuffer 반환은 PackedByteArray 로 변환된다.

signal command_received(command: Dictionary)

const PROTOCOL_VERSION := 1

# 의도적으로 정적 타입을 붙이지 않는다: JavaScriptObject 는 임의 JS 속성/메서드를 동적으로 노출한다.
var _window
var _parent
var _command_callback
var _available := false
var _events_sent := 0
var _event_chars := 0
var _binary_chars := 0

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	_window = JavaScriptBridge.get_interface("window")
	_parent = JavaScriptBridge.get_interface("parent")
	_command_callback = JavaScriptBridge.create_callback(_on_js_command)
	_window.__ts3d_command = _command_callback
	_available = true

func is_available() -> bool:
	return _available

func counters() -> Dictionary:
	return {"eventsSent": _events_sent, "eventChars": _event_chars, "binaryChars": _binary_chars}

func _on_js_command(args: Array) -> void:
	if args.is_empty():
		return
	var text := str(args[0])
	var t0 := Time.get_ticks_usec()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		var command: Dictionary = parsed
		# 진단용: JSON 파싱 비용과 길이를 명령에 덧붙인다(bridge-echo 가 보고한다).
		command["_parseMs"] = float(Time.get_ticks_usec() - t0) / 1000.0
		command["_chars"] = text.length()
		command_received.emit(command)
	else:
		emit_event({"type": "error", "code": "bad-command", "message": "명령은 JSON 객체여야 합니다."})

func _host():
	if not _available:
		return null
	return _parent.__ts3dHost

## GDScript 의 JSON.stringify 는 NaN/Infinity 를 `nan`/`inf` 로 쓰는데 이는 유효한 JSON 이 아니라서 호스트의 JSON.parse 가 실패한다.
## (이 PoC 의 verify-two-point 개발 중 실제로 이벤트가 통째로 사라졌다.) 비유한 실수는 null 로 바꿔 DTO 를 항상 파싱 가능하게 유지한다.
static func sanitize(value: Variant) -> Variant:
	match typeof(value):
		TYPE_FLOAT:
			return value if is_finite(value) else null
		TYPE_DICTIONARY:
			var d := {}
			for k in value:
				d[k] = sanitize(value[k])
			return d
		TYPE_ARRAY:
			var a := []
			for v in value:
				a.append(sanitize(v))
			return a
		_:
			return value

## 이벤트를 호스트로 보낸다. 호스트가 없으면(에디터·네이티브 실행) stdout 에 JSON 한 줄을 남긴다.
func emit_event(event: Dictionary) -> void:
	event["v"] = PROTOCOL_VERSION
	event["engineMs"] = Time.get_ticks_msec()
	var text := JSON.stringify(sanitize(event))
	_events_sent += 1
	_event_chars += text.length()
	var host = _host()
	if host != null:
		host.onEvent(text)
	else:
		print("[ts3d-event] ", text)

## PNG 같은 이진 결과를 base64 문자열로 호스트에 보낸다. 반환값은 인코딩에 걸린 시간(ms).
func emit_binary(id: String, label: String, bytes: PackedByteArray) -> float:
	var t0 := Time.get_ticks_usec()
	var b64 := Marshalls.raw_to_base64(bytes)
	var encode_ms := float(Time.get_ticks_usec() - t0) / 1000.0
	_binary_chars += b64.length()
	var host = _host()
	if host != null:
		host.onBinary(id, label, b64)
	return encode_ms

## 호스트가 window.__ts3dInbox 에 둔 TypedArray(Uint8Array 권장) 또는 같은 realm 의 ArrayBuffer 를 복사해 읽는다(eval 없이 — CSP 의 unsafe-eval 불필요).
func read_inbox_without_eval() -> PackedByteArray:
	if not _available:
		return PackedByteArray()
	var obj = _parent.__ts3dInbox
	if obj is JavaScriptObject and JavaScriptBridge.is_js_buffer(obj):
		return JavaScriptBridge.js_buffer_to_packed_byte_array(obj)
	return PackedByteArray()

## 같은 일을 eval 로 한다(공식 문서: ArrayBuffer/TypedArray/DataView 는 PackedByteArray 로 반환). CSP 에 'unsafe-eval' 이 필요하다.
func read_inbox_with_eval() -> PackedByteArray:
	if not _available:
		return PackedByteArray()
	var value: Variant = JavaScriptBridge.eval("window.parent.__ts3dInbox", true)
	if value is PackedByteArray:
		return value
	return PackedByteArray()
