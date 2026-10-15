extends Node3D
## ToonStudio Godot 3D PoC 진입점. 실험용이며 운영 앱과 연결되어 있지 않다(../../README.md).
##
## 명령 DTO(셸 -> Godot, `window.__ts3d_command(json)`):
##   ping | get-stats | load-glb | clear-model | set-camera | set-toon | capture | diag-encode |
##   verify-two-point | bench-instances | bridge-echo | bridge-binary-in | bridge-binary-out
## 모든 명령은 `id` 를 받아 같은 값을 `replyTo` 로 돌려주는 `<cmd>:result` 이벤트로 응답한다.

const BridgeScript = preload("res://scripts/bridge.gd")
const GlbLoaderScript = preload("res://scripts/glb_loader.gd")
const OrbitCameraScript = preload("res://scripts/orbit_camera.gd")
const PassCaptureScript = preload("res://scripts/pass_capture.gd")
const InstanceBenchScript = preload("res://scripts/instance_bench.gd")

const COMMANDS := [
	"ping", "wait-frames", "get-stats", "load-glb", "clear-model", "set-camera", "set-toon", "capture", "diag-encode",
	"verify-two-point", "bench-instances", "bridge-echo", "bridge-binary-in", "bridge-binary-out",
]
const HEAVY := ["load-glb", "capture", "diag-encode", "verify-two-point", "bench-instances"]

var bridge: Node
var loader = GlbLoaderScript.new()
var rig: Node3D
var passes: Node
var bench: Node
var key_light: DirectionalLight3D
var model_holder: Node3D
var model_root: Node3D

var _http: HTTPRequest
var _last_http_code := 0
var _busy := false
var _encoding_checked := false
var _frame_ms: Array[float] = []
var _boot_msec := 0

func _ready() -> void:
	_boot_msec = Time.get_ticks_msec()
	_build_world()
	bridge = BridgeScript.new()
	bridge.name = "Bridge"
	add_child(bridge)
	bridge.command_received.connect(_on_command)
	RenderingServer.frame_post_draw.connect(_on_first_frame, CONNECT_ONE_SHOT)
	bridge.emit_event({"type": "ready", "bridgeAvailable": bridge.is_available(), "commands": COMMANDS, "passes": PassCaptureScript.ALL_PASSES, "engine": _engine_info()})

func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1, 1, 1)
	env.ambient_light_energy = 0.0
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	key_light = DirectionalLight3D.new()
	key_light.name = "KeyLight"
	key_light.rotation_degrees = Vector3(-45.0, -35.0, 0.0)
	key_light.light_energy = 1.0
	key_light.shadow_enabled = false
	add_child(key_light)
	model_holder = Node3D.new()
	model_holder.name = "ModelHolder"
	add_child(model_holder)
	rig = OrbitCameraScript.new()
	rig.name = "OrbitRig"
	add_child(rig)
	passes = PassCaptureScript.new()
	passes.name = "Passes"
	add_child(passes)
	bench = InstanceBenchScript.new()
	bench.name = "Bench"
	add_child(bench)

func _process(delta: float) -> void:
	_frame_ms.append(delta * 1000.0)
	if _frame_ms.size() > 240:
		_frame_ms.pop_front()

func _on_first_frame() -> void:
	bridge.emit_event({"type": "first-frame", "framesDrawn": Engine.get_frames_drawn(), "sinceBootMs": Time.get_ticks_msec() - _boot_msec})

func _engine_info() -> Dictionary:
	var v := Engine.get_version_info()
	return {
		"version": str(v.get("string", "")), "hash": str(v.get("hash", "")),
		"renderer": str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "")),
		"currentRenderingMethod": RenderingServer.get_current_rendering_method(),
		"adapter": RenderingServer.get_video_adapter_name(), "vendor": RenderingServer.get_video_adapter_vendor(),
		"web": OS.has_feature("web"), "threads": OS.has_feature("threads"), "os": OS.get_name(),
		"gltfExtensions": GLTFDocument.get_supported_gltf_extensions(),
	}

func _stats() -> Dictionary:
	var sorted := _frame_ms.duplicate()
	sorted.sort()
	var median := 0.0
	if not sorted.is_empty():
		median = sorted[sorted.size() / 2]
	var out := {
		"engine": _engine_info(),
		"framesDrawn": Engine.get_frames_drawn(),
		"frameMsMedian": median, "frameSamples": sorted.size(),
		"textureMemBytes": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED),
		"bufferMemBytes": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_BUFFER_MEM_USED),
		"videoMemBytes": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED),
		"objectCount": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"nodeCount": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"viewportPx": [get_viewport().get_visible_rect().size.x, get_viewport().get_visible_rect().size.y],
		"camera": rig.to_dto(), "bridge": bridge.counters(),
		"modelLoaded": model_root != null,
	}
	if model_root != null:
		out["model"] = loader.scene_stats(model_root)
	return out

func _on_command(cmd: Dictionary) -> void:
	_dispatch(cmd)

func _dispatch(cmd: Dictionary) -> void:
	var id := str(cmd.get("id", ""))
	var cmd_name := str(cmd.get("cmd", ""))
	var reply := {"type": cmd_name + ":result", "replyTo": id, "cmd": cmd_name, "ok": true}
	var t0 := Time.get_ticks_usec()
	if HEAVY.has(cmd_name):
		if _busy:
			reply["ok"] = false
			reply["error"] = "busy"
			bridge.emit_event(reply)
			return
		_busy = true
	match cmd_name:
		"ping":
			reply["pongEngineMs"] = Time.get_ticks_msec()
		"wait-frames":
			# n 프레임이 실제로 그려질 때까지 기다린 뒤 응답한다(모델이 처음 화면에 그려진 시점 측정용).
			for _i in range(clampi(int(cmd.get("n", 1)), 1, 600)):
				await RenderingServer.frame_post_draw
			reply["framesDrawn"] = Engine.get_frames_drawn()
		"get-stats":
			reply.merge(_stats())
		"load-glb":
			await _cmd_load_glb(cmd, reply)
		"clear-model":
			_clear_model()
		"set-camera":
			reply["camera"] = rig.apply_dto(cmd)
		"set-toon":
			var n := 0
			if model_root != null:
				n = loader.update_toon(model_root, int(cmd.get("bands", 3)), float(cmd.get("softness", 0.02)), float(cmd.get("outlinePx", 2.0)), bool(cmd.get("outline", true)))
			reply["updatedSurfaces"] = n
		"capture":
			await _cmd_capture(cmd, reply)
		"diag-encode":
			await _ensure_encoding_checked(reply, true, cmd.get("levels", [0, 16, 64, 128, 200, 255]))
		"verify-two-point":
			await _cmd_verify_two_point(cmd, reply)
		"bench-instances":
			await _cmd_bench(cmd, reply)
		"bridge-echo":
			reply["payloadChars"] = int(cmd.get("_chars", 0))
			reply["parseMs"] = float(cmd.get("_parseMs", 0.0))
		"bridge-binary-in":
			_cmd_binary_in(cmd, reply)
		"bridge-binary-out":
			_cmd_binary_out(cmd, reply)
		_:
			reply["ok"] = false
			reply["error"] = "unknown-command"
	if HEAVY.has(cmd_name):
		_busy = false
	reply["handlerMs"] = float(Time.get_ticks_usec() - t0) / 1000.0
	bridge.emit_event(reply)

# ── load-glb ────────────────────────────────────────────────────────────────

func _clear_model() -> void:
	if model_root != null and is_instance_valid(model_root):
		model_root.queue_free()
	model_root = null

## HTTPRequest 는 스킴이 없는 URL('/fixtures/a.glb')을 거절한다("Error parsing URL", 이 PoC 가 실측).
## 기존 godot-space 도 같은 이유로 절대 URL 을 받는다(studio-godot-space.ts 의 resolveGodotBackgroundForStage).
func _absolute_url(url: String) -> String:
	if url.begins_with("/") and OS.has_feature("web"):
		var location = JavaScriptBridge.get_interface("location")
		return str(location.origin) + url
	return url

## HTTPRequest 는 웹에서 프레임당 한 청크(기본 64 KiB)만 진행한다(웹 export 문서: "Cannot progress more than once per frame").
## chunk_bytes 로 청크를 키우면 프레임 수에 묶인 다운로드 상한이 풀린다. 기본값(65536)과 큰 값을 둘 다 측정한다.
func _fetch(url: String, chunk_bytes: int) -> PackedByteArray:
	if _http == null:
		_http = HTTPRequest.new()
		add_child(_http)
	_http.download_chunk_size = clampi(chunk_bytes, 4096, 16 * 1024 * 1024)
	var err := _http.request(_absolute_url(url))
	if err != OK:
		_last_http_code = -int(err)
		return PackedByteArray()
	var res: Array = await _http.request_completed
	_last_http_code = int(res[1])
	if int(res[0]) != HTTPRequest.RESULT_SUCCESS or int(res[1]) != 200:
		return PackedByteArray()
	return res[3]

func _cmd_load_glb(cmd: Dictionary, reply: Dictionary) -> void:
	var src: Dictionary = cmd.get("source", {})
	var kind := str(src.get("kind", "url"))
	var t_acquire := Time.get_ticks_usec()
	var bytes := PackedByteArray()
	match kind:
		"url":
			var chunk_bytes := int(src.get("chunkBytes", 65536))
			bytes = await _fetch(str(src.get("url", "")), chunk_bytes)
			reply["httpCode"] = _last_http_code
			reply["chunkBytes"] = chunk_bytes
		"inbox":
			bytes = bridge.read_inbox_without_eval()
		"inbox-eval":
			bytes = bridge.read_inbox_with_eval()
		_:
			reply["ok"] = false
			reply["error"] = "unknown-source-kind"
			return
	reply["acquireKind"] = kind
	reply["acquireMs"] = float(Time.get_ticks_usec() - t_acquire) / 1000.0
	reply["inputBytes"] = bytes.size()
	if bytes.is_empty():
		reply["ok"] = false
		reply["error"] = "empty-input"
		return
	_clear_model()
	var res: Dictionary = loader.load_bytes(bytes, bool(cmd.get("toon", true)))
	for k in ["parseMs", "generateMs", "toonMs", "toonSurfaces", "extensionsUsed", "extensionsRequired", "error", "errorCode"]:
		if res.has(k):
			reply[k] = res[k]
	if not bool(res["ok"]):
		reply["ok"] = false
		return
	model_root = res["root"]
	model_holder.add_child(model_root)
	var t_stats := Time.get_ticks_usec()
	reply["model"] = loader.scene_stats(model_root)
	reply["statsMs"] = float(Time.get_ticks_usec() - t_stats) / 1000.0
	if bool(cmd.get("fit", true)):
		reply["camera"] = rig.frame_aabb(loader.world_aabb(model_root))

# ── capture ─────────────────────────────────────────────────────────────────

func _ensure_encoding_checked(reply: Dictionary, force: bool, levels: Array = [0, 16, 64, 128, 200, 255]) -> void:
	if _encoding_checked and not force:
		return
	# 3D 패스 출력의 8비트 전달 함수를 실측해 보고한다. 패스는 항상 [64,255] 오프셋 코딩을 쓰므로 그 구간의 오차(codedRangeMaxError)가 핵심이다.
	reply["diag"] = await passes.diag_encoding(self, levels)
	_encoding_checked = true

func _cmd_capture(cmd: Dictionary, reply: Dictionary) -> void:
	var size_arr: Array = cmd.get("size", [960, 540])
	var size := Vector2i(int(size_arr[0]), int(size_arr[1]))
	var pass_list: Array = cmd.get("passes", ["beauty", "line", "tone", "depth", "normal"])
	var opts: Dictionary = cmd.get("options", {})
	var meshes: Array = loader.collect_mesh_instances(model_holder)
	if meshes.is_empty():
		reply["ok"] = false
		reply["error"] = "no-model"
		return
	await _ensure_encoding_checked(reply, false)
	var res: Dictionary = await passes.capture(self, meshes, rig, key_light, pass_list, size, opts)
	if not bool(res["ok"]):
		reply["ok"] = false
		reply["error"] = res.get("error", "capture-failed")
		return
	var out_passes := {}
	var binary_ms := 0.0
	for pass_name in res["passes"]:
		var p: Dictionary = res["passes"][pass_name]
		var enc_ms: float = bridge.emit_binary(str(reply["replyTo"]), str(pass_name), p["png"])
		binary_ms += enc_ms
		out_passes[pass_name] = {"pngBytes": p["pngBytes"], "stats": p["stats"], "base64EncodeMs": enc_ms}
	reply["passes"] = out_passes
	reply["size"] = res["size"]
	reply["timingsMs"] = res["timingsMs"]
	reply["base64EncodeMsTotal"] = binary_ms

# ── 2점 투시 수치 검증 ──────────────────────────────────────────────────────

## 세로 모서리 하나의 위/아래 점을 화면에 투영해 x 차이(px)를 잰다. 수직 보정이 맞으면 0 에 가깝다.
func _edge_dx_px(cam: Camera3D, base: Vector3, height: float) -> float:
	var bottom := cam.unproject_position(base)
	var top := cam.unproject_position(base + Vector3(0.0, height, 0.0))
	return absf(top.x - bottom.x)

func _cmd_verify_two_point(cmd: Dictionary, reply: Dictionary) -> void:
	var cases: Array = cmd.get("cases", [
		{"yaw": 0.0, "pitch": 20.0, "distance": 10.0, "fovDegrees": 40.0},
		{"yaw": 25.0, "pitch": 12.0, "distance": 8.0, "fovDegrees": 50.0},
		{"yaw": -40.0, "pitch": 30.0, "distance": 14.0, "fovDegrees": 35.0},
		{"yaw": 70.0, "pitch": -15.0, "distance": 9.0, "fovDegrees": 60.0},
	])
	var saved: Dictionary = rig.to_dto()
	var results := []
	var viewport_size := get_viewport().get_visible_rect().size
	for c in cases:
		var dto: Dictionary = c.duplicate()
		dto["target"] = [0.0, 1.5, 0.0]
		dto["near"] = 0.1
		dto["far"] = 100.0
		dto["lensShift"] = [0.0, 0.0]
		dto["twoPoint"] = false
		var pitched: Dictionary = rig.apply_dto(dto)
		var cam: Camera3D = rig.camera
		var edges := [Vector3(2.5, 0.0, 0.0), Vector3(-2.5, 0.0, 0.0), Vector3(0.0, 0.0, 2.5), Vector3(1.2, 0.0, -1.2)]
		var pitched_dx := 0.0
		for e in edges:
			pitched_dx = maxf(pitched_dx, _edge_dx_px(cam, e, 3.0))
		var rig_target: Vector3 = rig.target
		var pitched_target := cam.unproject_position(rig_target)
		dto["twoPoint"] = true
		var two_point_state: Dictionary = rig.apply_dto(dto)
		var two_dx := 0.0
		for e in edges:
			two_dx = maxf(two_dx, _edge_dx_px(cam, e, 3.0))
		rig_target = rig.target
		var target_px := cam.unproject_position(rig_target)
		var tan_pitch := tan(deg_to_rad(float(dto["pitch"])))
		var tan_half := tan(deg_to_rad(float(dto["fovDegrees"])) * 0.5)
		# 저장소 공식(studio-bg3d-lens.ts): lensShiftY = -tanPitch / (2 * tanHalfFov). 단 target.y != position.y 라서
		# 실제 tanPitch 는 (target.y - eye.y) / 수평거리 이다.
		var eye: Vector3 = rig.eye_position()
		var horizontal := Vector2(rig_target.x - eye.x, rig_target.z - eye.z).length()
		var raw_formula_shift_y: float = -((rig_target.y - eye.y) / horizontal) / (2.0 * tan_half)
		# 저장소 SceneDocument 는 lensShift 를 [-2, 2] 로 제한한다(studio-bg3d-lens.ts 의 클램프). 한도를 넘는 구도는 완전히 되돌리지 못한다.
		var formula_shift_y: float = clampf(raw_formula_shift_y, -2.0, 2.0)
		var engine_shift_y := 0.0
		if cam.projection == Camera3D.PROJECTION_FRUSTUM:
			engine_shift_y = -cam.frustum_offset.y / cam.size
		results.append({
			"case": c,
			"pitchedMaxVerticalEdgeDxPx": pitched_dx,
			"twoPointMaxVerticalEdgeDxPx": two_dx,
			"pitchedTargetErrPx": (pitched_target - viewport_size * 0.5).length(),
			"twoPointTargetErrPx": (target_px - viewport_size * 0.5).length(),
			"formulaLensShiftY": formula_shift_y,
			"formulaLensShiftYUnclamped": raw_formula_shift_y,
			"clampedByDocumentLimit": absf(raw_formula_shift_y) > 2.0,
			"engineLensShiftY": engine_shift_y,
			"projection": pitched["projection"] + "->" + two_point_state["projection"],
		})
	# 지각(렌더) 검증: 기둥 3개를 실제로 그려 알파 마스크의 세로 모서리가 수직인지 픽셀로 잰다.
	if bool(cmd.get("render", true)):
		reply["render"] = await _verify_two_point_render()
	rig.apply_dto(saved)
	reply["cases"] = results
	reply["viewportPx"] = [viewport_size.x, viewport_size.y]

func _centroid_x(img: Image, y: int, x_center: int, half_window: int) -> float:
	var sum := 0.0
	var count := 0
	var x0 := maxi(0, x_center - half_window)
	var x1 := mini(img.get_width() - 1, x_center + half_window)
	for x in range(x0, x1 + 1):
		if img.get_pixel(x, y).a > 0.5:
			sum += float(x)
			count += 1
	return sum / float(count) if count > 0 else NAN

func _verify_two_point_render() -> Dictionary:
	var holder := Node3D.new()
	add_child(holder)
	var pillar_mat := StandardMaterial3D.new()
	var meshes: Array = []
	for px in [-2.5, 0.0, 2.5]:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.3, 6.0, 0.3)
		mi.mesh = bm
		mi.material_override = pillar_mat
		mi.position = Vector3(px, 3.0, 0.0)
		holder.add_child(mi)
		meshes.append(mi)
	var saved: Dictionary = rig.to_dto()
	model_holder.visible = false
	await _ensure_encoding_checked({}, false)
	var out := {}
	for mode in ["pitched", "twoPoint"]:
		rig.apply_dto({"yaw": 0.0, "pitch": 20.0, "distance": 10.0, "fovDegrees": 40.0, "target": [0.0, 3.0, 0.0], "near": 0.1, "far": 60.0, "lensShift": [0.0, 0.0], "twoPoint": mode == "twoPoint"})
		var res: Dictionary = await passes.capture(self, meshes, rig, key_light, ["depth"], Vector2i(960, 540), {"keepImages": true})
		var img: Image = res["images"]["depth"]
		var cam: Camera3D = rig.camera
		# 오른쪽 기둥(x=+2.5)의 축 위 두 높이를 화면 좌표로 옮겨 그 행의 알파 무게중심 x 를 잰다.
		var rows := []
		for h in [1.2, 4.8]:
			var sp := cam.unproject_position(Vector3(2.5, h, 0.0))
			var cx := _centroid_x(img, int(round(sp.y)), int(round(sp.x)), 24)
			rows.append({"height": h, "expectedX": sp.x, "centroidX": cx, "y": sp.y})
		out[mode] = {"rows": rows, "dxPx": absf(float(rows[1]["centroidX"]) - float(rows[0]["centroidX"]))}
	rig.apply_dto(saved)
	model_holder.visible = true
	holder.queue_free()
	return out

# ── MultiMesh 벤치 ──────────────────────────────────────────────────────────

func _cmd_bench(cmd: Dictionary, reply: Dictionary) -> void:
	var saved: Dictionary = rig.to_dto()
	model_holder.visible = false
	var res: Dictionary = await bench.run(self, rig, int(cmd.get("count", 1000)), int(cmd.get("frames", 8)), int(cmd.get("warmup", 2)), bool(cmd.get("useBuffer", true)))
	res["videoMemBytes"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)
	reply["bench"] = res
	bench.clear()
	model_holder.visible = true
	rig.apply_dto(saved)

# ── 브리지 비용 측정 ────────────────────────────────────────────────────────

func _sha256_hex(bytes: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(bytes)
	return ctx.finish().hex_encode()

func _cmd_binary_in(cmd: Dictionary, reply: Dictionary) -> void:
	var via := str(cmd.get("via", "no-eval"))
	var t0 := Time.get_ticks_usec()
	var bytes := PackedByteArray()
	if via == "eval":
		bytes = bridge.read_inbox_with_eval()
	else:
		bytes = bridge.read_inbox_without_eval()
	reply["via"] = via
	reply["copyMs"] = float(Time.get_ticks_usec() - t0) / 1000.0
	reply["bytes"] = bytes.size()
	var t1 := Time.get_ticks_usec()
	reply["sha256"] = _sha256_hex(bytes)
	reply["hashMs"] = float(Time.get_ticks_usec() - t1) / 1000.0

func _cmd_binary_out(cmd: Dictionary, reply: Dictionary) -> void:
	var n := clampi(int(cmd.get("bytes", 1024)), 1, 64 * 1024 * 1024)
	var bytes := PackedByteArray()
	var base := PackedByteArray()
	base.resize(251)
	for i in range(251):
		base[i] = i
	while bytes.size() < n:
		bytes.append_array(base)
	bytes.resize(n)
	reply["bytes"] = n
	reply["sha256"] = _sha256_hex(bytes)
	reply["base64EncodeMs"] = bridge.emit_binary(str(reply["replyTo"]), "blob", bytes)
