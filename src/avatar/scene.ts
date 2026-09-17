/**
 * The avatar, as a distance field.
 *
 * This is a real 3D render, not a drawing of one. Every form below is defined
 * as a signed distance function — a formula that answers "how far is the
 * nearest surface from this point" — and the fragment shader walks a ray out
 * from the camera through each pixel until it hits one. That buys the three
 * things a 2D canvas fundamentally cannot fake, no matter how many gradients
 * are stacked on it:
 *
 *   - Self-occlusion. The silhouette is whatever the geometry actually hides.
 *   - Soft shadows. Marched towards the light, so the penumbra widens with
 *     distance exactly as a real one does.
 *   - Ambient occlusion. Sampled from the field itself, so every crease darkens
 *     because the geometry is genuinely enclosed there, not because someone
 *     painted a smudge in.
 *
 * And it keeps everything the drawn version bought: no image assets at all, so
 * a part is still a row in a catalogue, combinations are still free, and an
 * avatar is still a short string rather than an upload.
 *
 * The material is clay: Lambertian with a wrap term, no specular lobe
 * anywhere. A highlight is the one thing that would break it — that is glass,
 * and this game already has glass on the board.
 */

export const VERTEX_SOURCE = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColour;

uniform vec3 uSkin;
uniform vec3 uHair;
uniform vec3 uCloth;
uniform vec3 uBack;
uniform int uStyle;      // hair
uniform int uOutfit;
uniform int uExtra;      // accessory
uniform float uEars;

const int MAT_BACK = 0;
const int MAT_SKIN = 1;
const int MAT_HAIR = 2;
const int MAT_CLOTH = 3;
const int MAT_EYE = 4;
const int MAT_METAL = 5;
const int MAT_LINING = 6;

/* ---- primitives -------------------------------------------------------- */

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}

/* Polynomial smooth minimum: the join that makes separate forms read as one
   piece of clay pressed together rather than as two objects touching. */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 closer(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

/* ---- the figure --------------------------------------------------------
 *
 * Every number below is derived from the frame rather than guessed at. The
 * camera sits at z = 2.90 with a ray spread of 0.276, so the visible half
 * height where the face is works out at 0.80. From that: the skull is 0.68
 * tall so it takes 42% of the frame, its centre sits at y = 0.26 to leave
 * headroom above it, the shoulders start at y = -0.33 and run past the bottom
 * edge, and the neck is whatever is left between them.
 *
 * The first pass at this was eyeballed and every part of it was wrong in the
 * same way: the hair cap was exactly the size of the skull so it barely
 * surfaced, and the nose and eyes were *behind* the front of the face, so
 * neither was ever the nearest thing to the camera. In a distance field a
 * feature that does not stand proud of the form it sits on does not exist.
 */

const float HEAD_Y = 0.26;
const vec3 HEAD_BOX = vec3(0.13, 0.17, 0.12);
const float HEAD_R = 0.17;      // so half extents are (0.30, 0.34, 0.29)
const float FACE_Z = 0.29;      // the front of the face

float headField(vec3 p) {
  vec3 q = p - vec3(0.0, HEAD_Y, 0.0);
  // A soft brick, not an egg: straight-ish temples with the curvature in the
  // jaw, which is what gives these characters their particular squareness.
  float d = sdRoundBox(q, HEAD_BOX, HEAD_R);
  if (uEars > 0.5) {
    vec3 e = vec3(abs(q.x) - 0.285, q.y + 0.02, q.z + 0.01);
    d = smin(d, sdEllipsoid(e, vec3(0.055, 0.085, 0.07)), 0.04);
  }
  // The nose, standing 0.045 proud of the face and merged into it, so the
  // shading runs across the join the way a moulded one would.
  d = smin(d, sdEllipsoid(q - vec3(0.0, -0.07, 0.26), vec3(0.075, 0.062, 0.075)), 0.055);
  return d;
}

float neckField(vec3 p) {
  return sdCapsule(p, vec3(0.0, -0.30, -0.01), vec3(0.0, 0.02, -0.01), 0.135);
}

float bodyField(vec3 p) {
  // Wide enough to run past both edges of the frame: shoulders that stop
  // inside it read as a bust on a plinth rather than as a person.
  float d = sdRoundBox(p - vec3(0.0, -0.64, 0.0), vec3(0.46, 0.13, 0.14), 0.28);
  if (uOutfit == 4) {
    d = smin(d, sdCapsule(p, vec3(0.0, -0.30, -0.01), vec3(0.0, -0.06, -0.01), 0.175), 0.05);
  }
  if (uOutfit == 5) {
    d = smin(d, sdEllipsoid(p - vec3(0.0, -0.28, -0.20), vec3(0.34, 0.17, 0.15)), 0.09);
  }
  return d;
}

float collarField(vec3 p) {
  if (uOutfit == 0 || uOutfit == 4 || uOutfit == 5) return 1e5;
  // Lying on the chest at z = 0.34, which is just proud of the shoulders'
  // front face at 0.42 minus their curvature — so the flaps rest on cloth
  // instead of floating in front of it.
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float flap = sdRoundBox(
    (q - vec3(0.115, -0.33, 0.30)) * mat3(0.93, 0.37, 0.0, -0.37, 0.93, 0.0, 0.0, 0.0, 1.0),
    vec3(0.045, 0.105, 0.012), 0.032);
  if (uOutfit == 3) {
    flap = min(flap, sdRoundBox(
      (q - vec3(0.20, -0.47, 0.26)) * mat3(0.89, 0.46, 0.0, -0.46, 0.89, 0.0, 0.0, 0.0, 1.0),
      vec3(0.055, 0.16, 0.012), 0.036));
  }
  return flap;
}

float tieField(vec3 p) {
  if (uOutfit != 2) return 1e5;
  float knot = sdRoundBox(p - vec3(0.0, -0.33, 0.33), vec3(0.028, 0.032, 0.012), 0.026);
  float blade = sdRoundBox(p - vec3(0.0, -0.62, 0.30), vec3(0.036, 0.19, 0.01), 0.022);
  return smin(knot, blade, 0.028);
}

/** What shows at the neckline: a dark shirt under a blazer. */
float liningField(vec3 p) {
  if (uOutfit != 3) return 1e5;
  return sdRoundBox(p - vec3(0.0, -0.56, 0.31), vec3(0.075, 0.22, 0.012), 0.035);
}

/**
 * Where the hair stops on the face.
 *
 * The first version cut the cap with a flat horizontal plane, which is why
 * every style had a dark patch pasted across the brow: a solid cap that
 * reaches the front of the skull is a cap that covers the eyes, and a plane
 * that clears them at the front leaves the back of the head bald.
 *
 * So the cut is tilted. Through (z = 0.29, y = 0.16) at the brow — comfortably
 * above the eyes at y = 0.045 — and (z = -0.29, y = -0.15) at the back, which
 * is a slope of 0.534 and an intercept of 0.005.
 */
float hairline(vec3 q, float lift) {
  // Curved across the brow, not ruled. A flat plane cut leaves a horizontal
  // line straight across the forehead, which is the one thing a hairline never
  // is; the x-squared term drops it at the temples, where hair really does
  // come down further than it does in the middle.
  // The x-squared term is what drops the line at the temples, and it has a
  // narrow window. At 1.7 it fell so steeply that what was left in the middle
  // stood up as a point — a widow's peak nobody asked for. At 0.7 it barely
  // fell at all and bare skull showed through beside the ear. 1.25 comes from
  // the two places it has to be right: hair down to q.y = 0 at the temple
  // (q.x = 0.28, q.z = 0.15), and down to -0.13 at the side of the head.
  // The intercept sets how much forehead shows. At 0.02 the line sat just
  // above the eyes and every style read as a bowl cut; 0.075 leaves the brow
  // the reference leaves.
  return (0.075 + lift) + 0.534 * q.z - 1.25 * q.x * q.x - q.y;
}

float hairField(vec3 p) {
  if (uStyle == 0) return 1e5;
  vec3 q = p - vec3(0.0, HEAD_Y, 0.0);
  // The cap is the skull's own field inflated by a constant, plus a volume on
  // top of it.
  //
  // Inflating the shape hair actually sits on is the only construction that
  // cannot leave scalp showing: a shell of uniform thickness follows every
  // curve of the head by definition. Two attempts at fitting an ellipsoid over
  // it failed the same way — tuned to cover the crown it exposed the temple,
  // tuned to cover the temple it swallowed the brow — because an ellipsoid and
  // a rounded box simply are not the same shape, and the gap between them
  // moves as you resize either one.
  //
  // The crown on top is where the bulk is. Hair has thickness and most of it
  // is above the head, which is what the first version, a shell 0.04 proud all
  // round, read as a swimming cap for missing.
  float scalp = sdRoundBox(q, HEAD_BOX, HEAD_R + 0.07);
  float crown = sdEllipsoid(q - vec3(0.0, 0.13, -0.02), vec3(0.335, 0.355, 0.325));
  float cap = smin(scalp, crown, 0.09);
  float d;

  if (uStyle == 1) {          // buzz — close to the skull, cut at the brow
    d = max(sdRoundBox(q, HEAD_BOX, HEAD_R + 0.028), hairline(q, -0.06));
  } else if (uStyle == 2) {   // crop — swept across, heavier on one side
    d = max(cap, hairline(q, -0.02));
    d = smin(d, sdEllipsoid(q - vec3(-0.09, 0.23, 0.08), vec3(0.23, 0.12, 0.22)), 0.13);
    d = smin(d, sdEllipsoid(q - vec3(0.14, 0.18, 0.12), vec3(0.17, 0.10, 0.17)), 0.13);
  } else if (uStyle == 3) {   // curls — lumps, which is the entire read
    d = max(cap, hairline(q, 0.02));
    d = smin(d, sdSphere(q - vec3(-0.20, 0.28, 0.05), 0.15), 0.045);
    d = smin(d, sdSphere(q - vec3(0.02, 0.38, 0.01), 0.16), 0.045);
    d = smin(d, sdSphere(q - vec3(0.22, 0.27, 0.06), 0.145), 0.045);
    d = smin(d, sdSphere(q - vec3(-0.28, 0.11, -0.02), 0.13), 0.045);
    d = smin(d, sdSphere(q - vec3(0.29, 0.10, -0.01), 0.125), 0.045);
    d = smin(d, sdSphere(q - vec3(0.0, 0.23, -0.26), 0.16), 0.045);
  } else if (uStyle == 4) {   // bun — tied up and back
    d = max(cap, hairline(q, 0.0));
    d = smin(d, sdEllipsoid(q - vec3(0.0, 0.46, -0.18), vec3(0.16, 0.15, 0.14)), 0.055);
  } else {                    // bob, long, wave — lengths down the sides
    float drop = uStyle == 5 ? -0.40 : (uStyle == 6 ? -0.95 : -0.90);
    d = max(cap, hairline(q, -0.03));
    vec3 s = vec3(abs(q.x) - 0.285, q.y, q.z);
    float side = sdCapsule(s, vec3(0.0, 0.14, -0.05), vec3(0.0, drop, -0.05), 0.132);
    if (uStyle == 7) {
      side = smin(side, sdEllipsoid(s - vec3(0.03, drop * 0.45, -0.03),
                                    vec3(0.13, 0.17, 0.13)), 0.09);
      side = smin(side, sdEllipsoid(s - vec3(-0.02, drop * 0.82, -0.02),
                                    vec3(0.115, 0.15, 0.115)), 0.09);
    }
    // The back of the head, so the lengths are one mass rather than two ropes.
    d = smin(d, sdEllipsoid(q - vec3(0.0, -0.03, -0.16), vec3(0.325, 0.325, 0.27)), 0.07);
    d = smin(d, side, 0.06);
  }
  return d;
}

float eyeField(vec3 p) {
  vec3 q = p - vec3(0.0, HEAD_Y, 0.0);
  // Standing just proud of the face, the way a pressed-on bead of clay would.
  vec3 e = vec3(abs(q.x) - 0.125, q.y - 0.045, q.z - 0.255);
  return sdEllipsoid(e, vec3(0.044, 0.054, 0.05));
}

float extraField(vec3 p) {
  float d = 1e5;
  vec3 q = p - vec3(0.0, HEAD_Y, 0.0);
  if (uExtra == 3 || uExtra == 4) {
    d = min(d, sdSphere(vec3(abs(q.x) - 0.30, q.y - 0.055, q.z + 0.01), 0.028));
  }
  if (uExtra == 1 || uExtra == 2 || uExtra == 4) {
    float rim;
    vec3 lens = vec3(abs(q.x) - 0.125, q.y - 0.045, q.z - 0.30);
    if (uExtra == 1) {
      float outer = sdRoundBox(lens, vec3(0.085, 0.056, 0.008), 0.030);
      float inner = sdRoundBox(lens, vec3(0.076, 0.047, 0.05), 0.026);
      rim = max(outer, -inner);
    } else {
      rim = sdTorus(lens.xzy, vec2(0.102, 0.014));
    }
    rim = min(rim, sdCapsule(q, vec3(-0.042, 0.045, 0.305), vec3(0.042, 0.045, 0.305), 0.012));
    rim = min(rim, sdCapsule(vec3(abs(q.x), q.y, q.z),
                             vec3(0.215, 0.045, 0.285), vec3(0.30, 0.03, 0.02), 0.011));
    d = min(d, rim);
  }
  return d;
}

/** The whole scene: nearest distance, and what was nearest. */
vec2 map(vec3 p) {
  vec2 res = vec2(p.z + 0.72, float(MAT_BACK));
  float skin = smin(headField(p), neckField(p), 0.08);
  res = closer(res, vec2(skin, float(MAT_SKIN)));
  res = closer(res, vec2(bodyField(p), float(MAT_CLOTH)));
  res = closer(res, vec2(collarField(p), float(MAT_CLOTH)));
  res = closer(res, vec2(liningField(p), float(MAT_LINING)));
  res = closer(res, vec2(tieField(p), float(MAT_LINING)));
  res = closer(res, vec2(hairField(p), float(MAT_HAIR)));
  res = closer(res, vec2(eyeField(p), float(MAT_EYE)));
  res = closer(res, vec2(extraField(p), float(MAT_METAL)));
  return res;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    map(p + e.xyy).x - map(p - e.xyy).x,
    map(p + e.yxy).x - map(p - e.yxy).x,
    map(p + e.yyx).x - map(p - e.yyx).x));
}

/**
 * Shadow, marched towards the light.
 *
 * The penumbra widens with distance from the caster because k*h/t grows
 * as the ray travels — which is the actual reason real soft shadows soften,
 * rather than a blur applied afterwards.
 */
float shadow(vec3 origin, vec3 dir) {
  float res = 1.0;
  float t = 0.04;
  // Twenty-four steps and a floor of 0.02, stopping at 2.2. The figure is
  // barely two units across, so a ray still travelling past that has left the
  // scene and every further step is spent confirming it.
  for (int i = 0; i < 24; i++) {
    float h = map(origin + dir * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.24);
    if (res < 0.004 || t > 2.2) break;
  }
  return clamp(res, 0.0, 1.0);
}

/** How enclosed a point is, sampled from the field itself. */
float occlusion(vec3 p, vec3 n) {
  float sum = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 4; i++) {
    float step = 0.020 * float(i);
    sum += weight * (step - map(p + n * step).x);
    weight *= 0.72;
  }
  return clamp(1.0 - 2.0 * sum, 0.0, 1.0);
}

void main() {
  // A portrait lens: far enough back and long enough that the face is not
  // distorted by perspective the way a wide angle would.
  vec3 eye = vec3(0.0, 0.05, 2.90);
  vec3 dir = normalize(vec3(vUv.x * 0.276, vUv.y * 0.276, -1.0));

  // Skip straight to where the figure could possibly be. Everything is inside
  // a sphere of radius 1.25 at the origin, and marching the empty two units in
  // front of it costs the same as marching anything else.
  float t = max(0.0, 2.90 - 1.45);
  vec2 hit = vec2(-1.0);
  for (int i = 0; i < 88; i++) {
    vec3 p = eye + dir * t;
    vec2 m = map(p);
    if (m.x < 0.0008 * t) { hit = vec2(t, m.y); break; }
    t += m.x * 0.92;
    if (t > 6.0) break;
  }
  if (hit.x < 0.0) { outColour = vec4(uBack, 1.0); return; }

  vec3 p = eye + dir * hit.x;
  vec3 n = normalAt(p);
  int mat = int(hit.y + 0.5);

  vec3 albedo =
      mat == MAT_SKIN ? uSkin
    : mat == MAT_HAIR ? uHair
    : mat == MAT_CLOTH ? uCloth
    : mat == MAT_EYE ? vec3(0.13, 0.11, 0.10)
    : mat == MAT_METAL ? (uExtra == 1 ? vec3(0.16, 0.16, 0.18) : vec3(0.68, 0.53, 0.26))
    : mat == MAT_LINING ? uCloth * 0.42
    : uBack;

  vec3 key = normalize(vec3(-0.42, 0.52, 0.74));
  float ao = occlusion(p, n);
  float sh = shadow(p + n * 0.01, key);

  // Wrapped diffuse. Light does not stop dead at the terminator on anything
  // soft, and on skin it carries on past it — which is the cheap stand-in for
  // subsurface scattering, the one thing this is really approximating.
  float wrap = mat == MAT_SKIN ? 0.45 : 0.22;
  float lambert = max(0.0, (dot(n, key) + wrap) / (1.0 + wrap));
  vec3 lit = albedo * lambert * sh * 1.08;

  // Warmth bleeding through the thin parts. On an ear lit from behind this is
  // most of what separates flesh from painted plastic.
  if (mat == MAT_SKIN) {
    float through = pow(clamp(dot(-n, key) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    lit += vec3(0.30, 0.09, 0.05) * through * ao * 0.5;
  }

  // Sky above, bounce from below, and a cool fill from the shadow side, all
  // scaled by how enclosed the point is. No specular term anywhere: a
  // highlight would read as glazed, and this is meant to be unfired clay.
  vec3 ambient = mix(vec3(0.30, 0.31, 0.35), vec3(0.42, 0.38, 0.34), n.y * 0.5 + 0.5);
  lit += albedo * ambient * ao * 0.62;
  lit += albedo * max(0.0, dot(n, vec3(0.5, -0.3, 0.4))) * vec3(0.10, 0.09, 0.11) * ao;

  if (mat == MAT_BACK) {
    // The backdrop is a lit wall, not a flat fill: a soft pool where the key
    // strikes it, falling off towards the corners.
    float pool = 1.0 - 0.42 * length(vUv - vec2(-0.32, 0.30)) ;
    lit = uBack * clamp(pool, 0.45, 1.12) * mix(0.55, 1.0, sh) ;
  }

  outColour = vec4(pow(clamp(lit, 0.0, 1.0), vec3(0.4545)), 1.0);
}
`
