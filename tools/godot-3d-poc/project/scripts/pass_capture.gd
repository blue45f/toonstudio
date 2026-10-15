extends Node
## 패스 캡처: beauty / depth / normal / line / tone 을 PNG 바이트로 돌려준다.
##
## 구조(전부 GL Compatibility 에서 동작하는 경로만 쓴다 — 공식: docs.godotengine.org/en/4.4/tutorials/rendering/renderers.html 비교표):
##  - 3D 패스(depth/normal/ndl)는 같은 World3D 를 보는 SubViewport 에서 GeometryInstance3D.material_override 로 한 번씩 그린다.
##    Compatibility 는 법선/러프니스 텍스처와 컴퓨트 셰이더가 없으므로(위 비교표) 패스 값은 스패셜 셰이더가 직접 기록한다.
##  - line / tone 은 위 패스의 RGBA8 이미지를 ImageTexture 로 받아 canvas_item 셰이더로 후처리한다(전체화면 쿼드).
##  - 캡처 동안 루트 뷰포트를 비활성화해 화면 깜빡임을 막고, 끝나면 되돌린다.
## 한계: 8비트 RGBA 출력이라 깊이는 24비트 RGB 패킹이다. 반투명·이중면·알파 컷아웃 재질은 패스에서 불투명으로 취급한다.

const PASS_DEPTH: Shader = preload("res://shaders/pass_depth.gdshader")
const PASS_NORMAL: Shader = preload("res://shaders/pass_normal.gdshader")
const PASS_NDL: Shader = preload("res://shaders/pass_ndl.gdshader")
const PASS_FLAT: Shader = preload("res://shaders/pass_flat.gdshader")
const LINE: Shader = preload("res://shaders/line.gdshader")
const TONE: Shader = preload("res://shaders/tone_halftone.gdshader")

const MAX_PIXELS := 4096 * 4096
const ALL_PASSES := ["beauty", "depth", "normal", "line", "tone"]
const CODE_BASE := 64

func _mat(shader: Shader, params: Dictionary = {}) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = shader
	for k in params:
		m.set_shader_parameter(k, params[k])
	return m

func _render_once(vp: SubViewport) -> Image:
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	return vp.get_texture().get_image()

func _set_override(meshes: Array, mat: Material) -> void:
	for m in meshes:
		(m as GeometryInstance3D).material_override = mat

## 2D 후처리: 전체화면 ColorRect 에 canvas_item 셰이더를 입혀 한 번 그린다.
func _run_2d(host: Node, shader: Shader, size: Vector2i, params: Dictionary) -> Image:
	var vp := SubViewport.new()
	vp.size = size
	vp.disable_3d = true
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	var rect := ColorRect.new()
	rect.size = Vector2(size)
	rect.material = _mat(shader, params)
	vp.add_child(rect)
	host.add_child(vp)
	var img := await _render_once(vp)
	vp.queue_free()
	return img

func _to_texture(img: Image) -> ImageTexture:
	return ImageTexture.create_from_image(img)

## 요청한 패스를 그려 PNG 바이트 사전으로 돌려준다.
## meshes: 씬의 MeshInstance3D 목록, rig: OrbitCamera, light: 주광, passes: 패스 이름 배열, size: 출력 픽셀.
func capture(host: Node, meshes: Array, rig: Node3D, light: DirectionalLight3D, passes: Array, size: Vector2i, opts: Dictionary) -> Dictionary:
	var out := {"size": [size.x, size.y], "passes": {}, "timingsMs": {}, "ok": false}
	if size.x < 16 or size.y < 16 or size.x * size.y > MAX_PIXELS:
		out["error"] = "size 는 16x16 이상, 총 픽셀 %d 이하여야 합니다." % MAX_PIXELS
		return out
	var wanted := {}
	for p in passes:
		if not ALL_PASSES.has(str(p)):
			out["error"] = "알 수 없는 패스: %s" % str(p)
			return out
		wanted[str(p)] = true
	var need_depth: bool = wanted.has("depth") or wanted.has("line")
	var need_normal: bool = wanted.has("normal") or wanted.has("line")
	var need_ndl: bool = wanted.has("tone")
	var thickness := float(opts.get("lineThickness", 1.0))
	var t_total := Time.get_ticks_usec()

	var vp := SubViewport.new()
	vp.size = size
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_DISABLED
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	var cam := Camera3D.new()
	vp.add_child(cam)
	host.add_child(vp)
	cam.global_transform = (rig.camera as Camera3D).global_transform
	rig.configure_projection(cam, float(size.x) / float(size.y))
	cam.current = true

	var root_rid := host.get_tree().root.get_viewport_rid()
	var hide_root := not bool(opts.get("keepRootActive", false))
	if hide_root:
		RenderingServer.viewport_set_update_mode(root_rid, RenderingServer.VIEWPORT_UPDATE_DISABLED)

	var images := {}
	var timings: Dictionary = out["timingsMs"]

	if wanted.has("beauty"):
		var t0 := Time.get_ticks_usec()
		_set_override(meshes, null)
		images["beauty"] = await _render_once(vp)
		timings["beauty"] = float(Time.get_ticks_usec() - t0) / 1000.0
	if need_depth:
		var t0 := Time.get_ticks_usec()
		_set_override(meshes, _mat(PASS_DEPTH, {"depth_near": cam.near, "depth_far": cam.far}))
		images["depth"] = await _render_once(vp)
		timings["depth"] = float(Time.get_ticks_usec() - t0) / 1000.0
	if need_normal:
		var t0 := Time.get_ticks_usec()
		_set_override(meshes, _mat(PASS_NORMAL))
		images["normal"] = await _render_once(vp)
		timings["normal"] = float(Time.get_ticks_usec() - t0) / 1000.0
	if need_ndl:
		var t0 := Time.get_ticks_usec()
		var to_light := cam.global_transform.basis.inverse() * light.global_transform.basis.z
		_set_override(meshes, _mat(PASS_NDL, {"to_light_view": to_light}))
		images["ndl"] = await _render_once(vp)
		timings["ndl"] = float(Time.get_ticks_usec() - t0) / 1000.0
	_set_override(meshes, null)
	var near := cam.near
	var far := cam.far
	vp.queue_free()

	if wanted.has("line"):
		var t0 := Time.get_ticks_usec()
		images["line"] = await _run_2d(host, LINE, size, {
			"depth_tex": _to_texture(images["depth"]),
			"normal_tex": _to_texture(images["normal"]),
			"inv_size": Vector2(1.0 / size.x, 1.0 / size.y),
			"thickness": thickness,
			"depth_range": far - near,
			"depth_rel_threshold": float(opts.get("depthThreshold", 0.02)),
			"normal_threshold": float(opts.get("normalThreshold", 0.45)),
		})
		timings["line"] = float(Time.get_ticks_usec() - t0) / 1000.0
	if wanted.has("tone"):
		var t0 := Time.get_ticks_usec()
		images["tone"] = await _run_2d(host, TONE, size, {
			"ndl_tex": _to_texture(images["ndl"]),
			"size": Vector2(size),
			"cell": float(opts.get("toneCell", 8.0)),
		})
		timings["tone"] = float(Time.get_ticks_usec() - t0) / 1000.0

	if hide_root:
		RenderingServer.viewport_set_update_mode(root_rid, RenderingServer.VIEWPORT_UPDATE_ALWAYS)

	var passes_out: Dictionary = out["passes"]
	for pass_name in ALL_PASSES:
		if not wanted.has(pass_name):
			continue
		var img: Image = images[pass_name]
		var t0 := Time.get_ticks_usec()
		var png := img.save_png_to_buffer()
		timings["png_" + pass_name] = float(Time.get_ticks_usec() - t0) / 1000.0
		passes_out[pass_name] = {"png": png, "pngBytes": png.size(), "stats": image_stats(img)}
	timings["total"] = float(Time.get_ticks_usec() - t_total) / 1000.0
	if bool(opts.get("keepImages", false)):
		out["images"] = images
	out["ok"] = true
	return out

## 이미지 통계: 알파>0 픽셀 비율, 고유 색 수(격자 표본), RGB 평균. 패스가 비어 있지 않은지 확인하는 데 쓴다.
func image_stats(img: Image) -> Dictionary:
	var w := img.get_width()
	var h := img.get_height()
	var step := maxi(1, int(sqrt(float(w * h) / 40000.0)))
	var covered := 0
	var total := 0
	var sums := Vector3.ZERO
	var uniq := {}
	var y := 0
	while y < h:
		var x := 0
		while x < w:
			var c := img.get_pixel(x, y)
			total += 1
			if c.a > 0.0:
				covered += 1
				sums += Vector3(c.r, c.g, c.b)
			uniq[c.to_rgba32()] = true
			x += step
		y += step
	var mean := (sums / float(covered)) if covered > 0 else Vector3.ZERO
	return {
		"sampledPixels": total, "coveredRatio": float(covered) / float(maxi(total, 1)),
		"uniqueColorsSampled": uniq.size(), "meanRgb": [mean.x, mean.y, mean.z], "width": w, "height": h,
	}

## 패스 출력이 8비트 값을 그대로 보존하는지 실측한다(3D 경로 + 2D 후처리 경로).
func diag_encoding(host: Node, level_values: Array = [0, 16, 64, 128, 200, 255]) -> Dictionary:
	var out := {"threeD": [], "twoD": []}
	# JSON 으로 들어온 수는 float 이므로 정수로 정규화한다(% 연산 등에서 float 피연산자는 런타임 오류).
	var levels: Array[int] = []
	for v in level_values:
		levels.append(clampi(int(v), 0, 255))
	var vp := SubViewport.new()
	vp.size = Vector2i(16, 16)
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_DISABLED
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 2.0
	cam.position = Vector3(0, 0, 2)
	var quad := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(4, 4)
	quad.mesh = qm
	var mat := _mat(PASS_FLAT)
	quad.material_override = mat
	vp.add_child(cam)
	vp.add_child(quad)
	host.add_child(vp)
	var max_err_coded := 0
	var toe_below := 0
	for lv in levels:
		mat.set_shader_parameter("level", float(lv) / 255.0)
		var img := await _render_once(vp)
		var px := img.get_pixel(8, 8)
		var actual := int(px.r8)
		if absi(actual - lv) > 1:
			toe_below = maxi(toe_below, lv + 1)
		if lv >= int(CODE_BASE):
			max_err_coded = maxi(max_err_coded, absi(actual - lv))
		out["threeD"].append({"expected": lv, "actual": actual})
	vp.queue_free()
	# toeBelow: 이 값 미만의 입력 중 오차가 1을 넘는 구간이 있다. 패스 코딩은 CODE_BASE(64) 이상만 쓰므로 그 구간의 최대 오차를 따로 센다.
	out["toeBelow"] = toe_below
	out["codedRangeMaxError"] = max_err_coded

	# 2D 경로: 알려진 바이트를 ImageTexture 로 올려 canvas_item 에서 그대로 읽어 오는지 확인한다.
	var src := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	var sh := Shader.new()
	sh.code = "shader_type canvas_item;\nuniform sampler2D t : filter_nearest;\nvoid fragment() { COLOR = texture(t, UV); }\n"
	var max_err_2d := 0
	for lv in levels:
		src.fill(Color8(lv, 255 - lv, (lv * 3) % 256, 255))
		var img2 := await _run_2d(host, sh, Vector2i(16, 16), {"t": _to_texture(src)})
		var p2 := img2.get_pixel(8, 8)
		var e := maxi(absi(int(p2.r8) - lv), maxi(absi(int(p2.g8) - (255 - lv)), absi(int(p2.b8) - ((lv * 3) % 256))))
		max_err_2d = maxi(max_err_2d, e)
		out["twoD"].append({"expected": [lv, 255 - lv, (lv * 3) % 256], "actual": [p2.r8, p2.g8, p2.b8]})
	out["twoDMaxError"] = max_err_2d
	return out
