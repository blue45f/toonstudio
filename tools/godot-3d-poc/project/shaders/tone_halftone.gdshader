shader_type canvas_item;
// 톤 패스(2D 후처리): ndl 회색 이미지를 45도 격자 스크린톤 점으로 바꾼다. 어두울수록 점이 커진다.
uniform sampler2D ndl_tex : filter_nearest;
uniform vec2 size = vec2(960.0, 540.0);
uniform float cell : hint_range(3.0, 40.0) = 8.0;
uniform float angle = 0.785398;
uniform float lit_threshold : hint_range(0.0, 1.0) = 0.62;
uniform float dark_threshold : hint_range(0.0, 1.0) = 0.12;
uniform vec3 ink : source_color = vec3(0.0);

void fragment() {
	vec4 s = texture(ndl_tex, UV);
	float ndl = clamp((floor(s.r * 255.0 + 0.5) - 64.0) / 191.0, 0.0, 1.0); // pass_common.gdshaderinc 코딩 해제
	float coverage = s.a;
	vec2 p = UV * size;
	float ca = cos(angle);
	float sa = sin(angle);
	vec2 q = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y) / cell;
	float d = length(fract(q) - 0.5);
	float darkness = 1.0 - smoothstep(dark_threshold, lit_threshold, ndl);
	float radius = 0.62 * sqrt(darkness);
	float aa = 1.0 / cell;
	float dot_mask = 1.0 - smoothstep(radius - aa, radius + aa, d);
	COLOR = vec4(ink, dot_mask * coverage * step(0.002, darkness));
}
