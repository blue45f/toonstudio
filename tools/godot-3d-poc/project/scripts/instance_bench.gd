extends Node
## MultiMeshInstance3D 대량 인스턴스 벤치.
##
## 공식 근거(2026-10-15 확인): docs.godotengine.org/en/4.4/tutorials/performance/using_multimesh.html
##  - MultiMesh 는 한 번의 드로로 수만~수백만 오브젝트를 그리지만 인스턴스별 컬링은 없다(전부 보이거나 전부 숨김).
##  - MultiMesh.buffer 로 한 번에 채우면 GDScript 반복 호출 비용을 피한다.
## 배치 규약은 measure/three-baseline 의 Three.js InstancedMesh 와 완전히 같다(결정적 격자 + 위치 기반 색).
## 소프트웨어 렌더링(SwiftShader)에서는 절대 FPS 가 대표성이 없고, 같은 조건의 상대 비교와 설정·메모리 비용만 의미가 있다.

const BOX_SIZE := 0.4
const SPACING := 1.0

## 격자 한 변의 개수. 인스턴스 i 의 격자 좌표는 (i % n, (i / n) % n, i / (n * n)).
static func grid_side(count: int) -> int:
	return int(ceil(pow(float(count), 1.0 / 3.0)))

static func instance_position(i: int, n: int) -> Vector3:
	var x := i % n
	var y := (i / n) % n
	var z := i / (n * n)
	var half := float(n - 1) * 0.5
	return Vector3((x - half) * SPACING, (y - half) * SPACING, (z - half) * SPACING)

static func instance_color(i: int, n: int) -> Color:
	var x := i % n
	var y := (i / n) % n
	var z := i / (n * n)
	var d := float(maxi(n - 1, 1))
	return Color(x / d, y / d, z / d, 1.0)

var _last: MultiMeshInstance3D

func clear() -> void:
	if _last != null and is_instance_valid(_last):
		_last.queue_free()
	_last = null

## count 개 인스턴스를 만들고 warmup 프레임 뒤 frames 프레임의 프레임 간격(ms)을 모은다.
## use_buffer=false 면 set_instance_transform 반복 경로를 쓴다(비교용).
func run(host: Node3D, rig: Node3D, count: int, frames: int, warmup: int, use_buffer: bool) -> Dictionary:
	clear()
	var result := {"count": count, "useBuffer": use_buffer}
	var tree := host.get_tree()
	var t0 := Time.get_ticks_usec()
	var mmi := MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3.ONE * BOX_SIZE
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	box.material = mat
	mm.mesh = box
	mm.instance_count = count
	var n := grid_side(count)
	if use_buffer:
		var buf := PackedFloat32Array()
		buf.resize(count * 16)
		var o := 0
		for i in range(count):
			var p := instance_position(i, n)
			var c := instance_color(i, n)
			buf[o] = 1.0
			buf[o + 3] = p.x
			buf[o + 5] = 1.0
			buf[o + 7] = p.y
			buf[o + 10] = 1.0
			buf[o + 11] = p.z
			buf[o + 12] = c.r
			buf[o + 13] = c.g
			buf[o + 14] = c.b
			buf[o + 15] = 1.0
			o += 16
		mm.buffer = buf
	else:
		for i in range(count):
			mm.set_instance_transform(i, Transform3D(Basis(), instance_position(i, n)))
			mm.set_instance_color(i, instance_color(i, n))
	mmi.multimesh = mm
	host.add_child(mmi)
	_last = mmi
	result["setupMs"] = float(Time.get_ticks_usec() - t0) / 1000.0
	result["trianglesPerInstance"] = 12
	result["triangles"] = 12 * count
	result["gridSide"] = n

	# 카메라: 격자 전체가 보이도록 거리를 잡는다(Three 쪽도 같은 값을 쓴다).
	var extent := float(n) * SPACING
	var cam_dto := {
		"yaw": 30.0, "pitch": 20.0, "target": [0.0, 0.0, 0.0], "fovDegrees": 40.0,
		"distance": extent * 1.9, "near": 0.1, "far": extent * 6.0, "twoPoint": false, "lensShift": [0.0, 0.0],
	}
	rig.apply_dto(cam_dto)

	var deltas: Array[float] = []
	var last_us := Time.get_ticks_usec()
	var first_frame_ms := 0.0
	var f_t0 := Time.get_ticks_usec()
	for i in range(warmup + frames):
		await tree.process_frame
		var now := Time.get_ticks_usec()
		if i == 0:
			first_frame_ms = float(now - f_t0) / 1000.0
		if i >= warmup:
			deltas.append(float(now - last_us) / 1000.0)
		last_us = now
	result["firstFrameMs"] = first_frame_ms
	result["frameMs"] = summarize(deltas)
	result["drawCalls"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	result["primitivesInFrame"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	return result

static func summarize(values: Array[float]) -> Dictionary:
	if values.is_empty():
		return {"n": 0}
	var sorted := values.duplicate()
	sorted.sort()
	var total := 0.0
	for v in sorted:
		total += v
	var mid := sorted.size() / 2
	var median: float = sorted[mid] if sorted.size() % 2 == 1 else (sorted[mid - 1] + sorted[mid]) * 0.5
	var p95_index := mini(sorted.size() - 1, int(ceil(0.95 * sorted.size())) - 1)
	return {
		"n": sorted.size(), "min": sorted[0], "max": sorted[sorted.size() - 1],
		"mean": total / sorted.size(), "median": median, "p95": sorted[p95_index],
	}
