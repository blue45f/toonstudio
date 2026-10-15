shader_type spatial;
// 뒤집힌 껍질(inverted hull) 외곽선: 정점을 화면 공간에서 법선 방향으로 밀어 일정한 픽셀 폭을 만든다.
// 토온 머티리얼의 next_pass 로 연결한다. 매끈한 법선이 없는 메시에서는 틈이 생기는 한계가 있다.
render_mode unshaded, cull_front, depth_draw_opaque;

uniform vec4 line_color : source_color = vec4(0.04, 0.04, 0.07, 1.0);
uniform float outline_px : hint_range(0.0, 12.0) = 2.0;

void vertex() {
	vec4 clip = PROJECTION_MATRIX * (MODELVIEW_MATRIX * vec4(VERTEX, 1.0));
	vec3 n_view = normalize(mat3(MODELVIEW_MATRIX) * NORMAL);
	vec2 dir = (PROJECTION_MATRIX * vec4(n_view, 0.0)).xy;
	float len = length(dir);
	dir = len > 1e-6 ? dir / len : vec2(0.0);
	clip.xy += dir * (outline_px * 2.0 / VIEWPORT_SIZE) * clip.w;
	POSITION = clip;
}

void fragment() {
	ALBEDO = line_color.rgb;
}
