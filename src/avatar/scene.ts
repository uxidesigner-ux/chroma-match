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
uniform vec3 uCloth;      // the top
uniform vec3 uBottomCol;
uniform vec3 uOuterCol;
uniform vec3 uShoeCol;
uniform vec3 uBack;
uniform int uStyle;      // hair
uniform int uOutfit;     // top
uniform int uBottom;
uniform int uOuter;
uniform int uShoes;
uniform int uExtra;      // accessory
uniform float uEars;
/** 0 shows the head and shoulders, 1 shows the whole figure. */
uniform float uFull;
/** How heavy the build is: 0 slim, 0.5 average, 1 broad. */
uniform float uBuild;
/** Image height over image width; 1 is square. */
uniform float uAspect;

const int MAT_BACK = 0;
const int MAT_SKIN = 1;
const int MAT_HAIR = 2;
const int MAT_CLOTH = 3;
const int MAT_EYE = 4;
const int MAT_METAL = 5;
const int MAT_LINING = 6;
const int MAT_BOTTOM = 7;
const int MAT_OUTER = 8;
const int MAT_SHOE = 9;

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

/* The same, with the radius running from one end to the other. Hair that ends
   on its full thickness is a rope with a ball on it; a real length comes to a
   point, and a plane cut cannot produce that — it takes a taper along the
   length itself.

   Scaled down at the end, and that is not decoration. The formula measures to
   the axis and subtracts the interpolated radius, which *overestimates* the
   true distance wherever the radius is changing — and a distance field that
   claims to be further away than it is lets a ray step straight through the
   surface. On the lit side that is invisible; on the shadow ray, which takes
   long steps by design, it came out as bands of stripes across the figure.
   The factor is the worst-case slope over the shapes here, and costs a few
   extra steps in exchange for the field telling the truth. */
float sdTaperCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float slope = abs(rb - ra) / max(1e-4, length(ba));
  return (length(pa - ba * h) - mix(ra, rb, h)) / sqrt(1.0 + slope * slope);
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
// A rounded box is a box with the corners filed off, and how much of it reads
// as a box rather than as a ball is the ratio of these two. At a radius of 0.17
// against half extents of 0.30 the flat faces were more than half the height of
// the skull, so the head had flat temples, a flat crown and visible corners —
// square, which is not what these characters are. Almost all of the size is in
// the radius now and the box is just enough to keep the skull taller than it is
// wide. The half extents are unchanged at (0.30, 0.34, 0.29), which is what
// every other feature is measured against: the eyes, the nose, the ears, the
// glasses and the hair all sit where they sat.
const vec3 HEAD_BOX = vec3(0.055, 0.095, 0.045);
const float HEAD_R = 0.245;     // so half extents are (0.30, 0.34, 0.29)
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

/**
 * The neck, and the slope it sits in.
 *
 * A capsule dropped into a torso meets it at a right angle, which is a post in
 * a socket rather than a neck on a body — and it is exactly what a stylised
 * character has *most* of, because the trapezius is the line that carries the
 * head into the shoulders. So there is a wedge either side of the neck,
 * widening as it goes down and blended into both, and the shoulder line runs
 * from the ear rather than starting at the armpit.
 */
/**
 * Half the shoulder width, and the thickness of every limb, by build.
 *
 * The head is 0.60 across. The first pass put the shoulders at 0.80 to 1.04,
 * which on a figure this short read as a poncho rather than as a body — a
 * chibi's shoulders are barely wider than its head, and everything hung on
 * them inherits whatever they are.
 */
float shoulderHalf() { return mix(0.250, 0.340, uBuild); }
float limbScale()    { return mix(0.88, 1.15, uBuild); }
float hipHalf()      { return mix(0.225, 0.300, uBuild); }

float neckField(vec3 p) {
  float neck = sdCapsule(p, vec3(0.0, -0.30, -0.01), vec3(0.0, 0.02, -0.01), 0.142);
  float w = shoulderHalf();
  float trap = sdTaperCapsule(p, vec3(0.0, -0.16, -0.02), vec3(0.0, -0.36, -0.02),
                              0.145, w * 0.74);
  return smin(neck, trap, 0.10);
}

/* ---- the figure below the neck -----------------------------------------
 *
 * Everything here is new, and it exists because a wardrobe needs a body to
 * hang on. The portrait framing only ever showed a head and a pair of
 * shoulders, so "outfit" could be a collar and a tie and nothing else had to
 * exist. Trousers and shoes need legs.
 *
 * Proportions are the ones the head already implies: the skull is 0.68 tall,
 * and the figure is a little over three heads, which is where these characters
 * live — tall enough to wear clothes that read, short enough to stay a toy.
 *
 * Every group is wrapped in a bounding test. map() is evaluated about a
 * hundred and sixteen times per pixel — eighty-eight marching, twenty-four for
 * the shadow, four for occlusion — so a ray up at the head must not pay for
 * the shoes. The test returns the distance to the bounding box rather than a
 * constant, because a distance field that lies about being far away marches
 * straight through a surface; a bound is a lower bound, so it is safe to
 * return.
 */

// Proportion, which is most of what a stylised figure is.
//
// The first pass made the torso 0.44 tall and up to 0.80 wide — wider than it
// was tall — on legs half a head long, and the result read as a toddler in a
// sack whatever it was wearing. The head stays the size it is, because the
// head is what a profile card shows and it is already right; everything below
// it gets longer and narrower. Four heads rather than three and a bit, which
// is where a stylised adult sits without losing the toy.
const float HIP_Y = -0.92;
const float FOOT_Y = -1.86;

/** Cheap conservative test: outside the box, its distance will do. */
float boundOf(vec3 p, vec3 centre, vec3 ext) {
  vec3 q = abs(p - centre) - ext;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}


/**
 * The torso: a chest that carries the shoulders and a pelvis that carries the
 * legs, blended. One capsule from neck to hip gives a tube, and a tube wears
 * every garment the same way — the waist is what makes a coat read as a coat
 * rather than as a coloured cylinder.
 */
float torsoField(vec3 p) {
  float w = shoulderHalf();
  // The chest, dropped so it no longer sets the shoulder line.
  float chest = sdRoundBox(p - vec3(0.0, -0.52, 0.0), vec3(w - 0.15, 0.12, 0.02), 0.15);
  // The shoulder line itself: a bar from the base of the neck out to the arm,
  // thick and high in the middle and thinner and lower at the end. A round box
  // was doing this job before and a box has a flat top — the top edge of the
  // shirt ran dead level from one arm to the other, which is a coat hanger,
  // not a pair of shoulders. Everything about the slope is in the difference
  // between the two ends of this taper.
  float shoulders = sdTaperCapsule(vec3(abs(p.x), p.y, p.z),
                                   vec3(0.0, -0.250, 0.0), vec3(w - 0.125, -0.365, 0.0),
                                   0.152, 0.124);
  float waist = sdRoundBox(p - vec3(0.0, HIP_Y + 0.08, 0.0),
                           vec3(hipHalf() - 0.15, 0.10, 0.015), 0.15);
  return smin(smin(chest, shoulders, 0.10), waist, 0.15);
}

/**
 * Upper arm to hand, mirrored.
 *
 * Ending at the hip, not below it. The first pass ran them to y = -1.16, which
 * on a figure whose hips are at -0.74 is an arm reaching past the knee; what it
 * actually looked like was a pale sausage hanging beside the shirt.
 */
float armsField(vec3 p) {
  float w = shoulderHalf();
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float r = 0.072 * limbScale();
  // Set outboard, with daylight between the arm and the ribs. Tucked against
  // the body they were inside the torso's own silhouette, which meant the
  // figure read as a sack with a head on it and a sleeve could not be seen at
  // all — a short sleeve and a long one ended at the same outline.
  // Starting a little lower than it did, on the sloped end of the shoulder
  // rather than level with the collarbone, so the seam lands where a sleeve
  // seam lands instead of across the top of the deltoid.
  float arm = sdTaperCapsule(q, vec3(w - 0.015, -0.355, 0.0), vec3(w + 0.11, -0.95, 0.005),
                             r, r * 0.82);
  float hand = sdEllipsoid(q - vec3(w + 0.125, -1.02, 0.005), vec3(0.068, 0.078, 0.058));
  return smin(arm, hand, 0.045);
}

/** Thigh, calf and foot. The feet point at the camera, not out to the sides. */
float legsField(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float r = 0.092 * limbScale();
  float gap = hipHalf() * 0.48;
  float leg = sdTaperCapsule(q, vec3(gap, HIP_Y + 0.02, 0.0), vec3(gap, FOOT_Y + 0.09, 0.0),
                             r, r * 0.72);
  float foot = sdRoundBox(q - vec3(gap, FOOT_Y + 0.035, 0.055),
                          vec3(0.015, 0.004, 0.055), 0.060);
  return smin(leg, foot, 0.045);
}

/* ---- what the figure is wearing ----------------------------------------
 *
 * Designed for the size it is actually seen at. The whole figure is about two
 * hundred pixels tall in the wardrobe and a hundred and twenty on a profile
 * card, which puts the torso at sixty pixels and a neckline at three. The
 * first pass carved necklines, plackets and collars into everything and the
 * result was a row of identical shirts with a dark smudge at the throat.
 *
 * So the three things a garment gets to say are the three that survive being
 * small: where its silhouette ends, how wide it is, and what colour it is. A
 * tee and a long sleeve differ at the wrist. A crop and a shirt differ at the
 * hem. A coat differs at the knee. Nothing here differs at the collar.
 */

/**
 * Every garment is the body part it covers, offset outwards and cut to length.
 *
 * Not a shape fitted over that body. A fitted shape gapes, and on a phone a
 * gape is skin coming through a sleeve. The sleeve used to be its own tapered
 * capsule built from the same numbers as the arm plus a thickness, which
 * sounds equivalent and is not: the arm is smoothed into the hand and the
 * chest is smoothed into the pelvis, and a smooth minimum *bulges* at the
 * join. The garment, rebuilt from the unsmoothed parts, had no such bulge — so
 * the body came through it at exactly the two places the eye goes, the
 * shoulder and the hip.
 *
 * A surface offset from a field by a constant is outside that field
 * everywhere, by that constant. There is nothing left to tune wrong.
 */
float garment(float part, vec3 p, float thick, float hem) {
  return max(part - thick, hem - p.y);
}

float topField(vec3 p, float torso, float arms) {
  if (uOutfit == 6) return 1e5;                          // a vest: no top drawn
  // A sweatshirt is a long sleeve with bulk, and bulk is the only thing that
  // tells them apart at this size. Fabric weight is a silhouette, not a
  // texture — which is lucky, because a texture would be one pixel.
  float thick = uOutfit == 5 ? 0.058 : 0.028;
  // Where it ends is the read. A crop stops at the ribs, everything else
  // covers the hip.
  // At the waist rather than over the hips. A top that covers the hip leaves
  // the figure in two colours — garment and legs — and a waist is what turns
  // that into a person wearing two things.
  float d = garment(torso, p, thick, HIP_Y + 0.02);
  // Where the sleeve ends is the read that survives the full-length framing.
  float cuff = uOutfit == 0 || uOutfit == 3 ? -0.46 : -0.94;
  d = smin(d, garment(arms, p, thick, cuff), 0.035);

  // And these two are the read that survives the *portrait* framing, which is
  // where a profile card and a leaderboard row actually see a top. A collar and
  // a placket are three pixels on a full-length figure and a third of the
  // visible garment on a bust, so they earn their place on one screen and cost
  // nothing on the other.
  if (uOutfit == 2 || uOutfit == 3) {
    vec3 q = vec3(abs(p.x), p.y, p.z);
    // Lying on the chest rather than standing off it: a flap held proud
    // shadows itself into a pair of black marks, which is not what a collar
    // looks like at any size.
    float flap = sdRoundBox(
      (q - vec3(0.098, -0.29, 0.212)) * mat3(0.93, 0.37, 0.0, -0.37, 0.93, 0.0, 0.0, 0.0, 1.0),
      vec3(0.042, 0.080, 0.008), 0.024);
    d = smin(d, flap, 0.02);
  }
  if (uOutfit == 4) {
    // A turtleneck's collar: a band of garment colour where there was skin.
    d = smin(d, sdCapsule(p, vec3(0.0, -0.30, -0.01), vec3(0.0, -0.10, -0.01), 0.150), 0.04);
  }
  return d;
}

/** Trousers, shorts or a skirt, over the hips and down the legs. */
float bottomField(vec3 p, float torso, float legs) {
  float thick = 0.034;

  if (uBottom == 3) {                                     // a skirt: one flare
    float skirt = sdTaperCapsule(p, vec3(0.0, HIP_Y + 0.16, 0.0), vec3(0.0, HIP_Y - 0.38, 0.0),
                                 hipHalf() * 0.95, hipHalf() * 1.45);
    // Hung on the pelvis rather than standing beside it, so the hip cannot
    // come through the waistband.
    skirt = smin(skirt, garment(torso, p, thick, HIP_Y - 0.10), 0.06);
    return max(skirt, HIP_Y - 0.38 - p.y);
  }

  float cut = uBottom == 1 ? HIP_Y - 0.34 : FOOT_Y + 0.15;
  // The seat is the pelvis offset outwards and the legs are the legs offset
  // outwards. Wide-leg trousers add flare on top of that rather than replacing
  // it, so the garment is never narrower than what is inside it.
  float d = smin(garment(torso, p, thick, HIP_Y - 0.14), legs - thick, 0.05);
  if (uBottom == 2) {
    vec3 q = vec3(abs(p.x), p.y, p.z);
    float gap = hipHalf() * 0.48;
    float r = 0.092 * limbScale() + thick;
    d = min(d, sdTaperCapsule(q, vec3(gap, HIP_Y, 0.0), vec3(gap, cut, 0.0), r, r * 1.70));
  }
  return max(d, cut - p.y);
}

/**
 * A jacket, hoodie or coat worn over the top.
 *
 * Thicker than the shirt and open down the middle, and the opening has to be
 * wide enough to be an opening — at three pixels it reads as a dark stripe
 * painted on a jacket rather than as the shirt showing through one.
 */
/**
 * What is worn over the top.
 *
 * Eight of them, and they are told apart by the four things that survive being
 * sixty pixels tall: how thick the garment is, where its hem falls, how wide
 * its opening is, and whether it has sleeves at all. A gilet has no sleeves so
 * the shirt underneath shows at the arm; a puffer is twice the thickness of a
 * cardigan and stops at the hip; a coat goes to the knee. None of them is told
 * apart by a button.
 */
float outerField(vec3 p, float torso, float arms) {
  if (uOuter == 0) return 1e5;

  // 1 jacket, 2 hoodie, 3 coat, 4 cardigan, 5 puffer, 6 blazer, 7 gilet
  float thick =
      uOuter == 5 ? 0.125                                  // a puffer has bulk
    : uOuter == 4 ? 0.050                                  // a cardigan drapes
    : uOuter == 6 ? 0.070
    : uOuter == 7 ? 0.092                                  // a gilet is padded
    : 0.068;
  float hem =
      uOuter == 3 ? HIP_Y - 0.34                           // a coat, to the knee
    : uOuter == 4 ? HIP_Y - 0.22                           // a long cardigan
    : uOuter == 5 ? HIP_Y + 0.04                           // a puffer, cropped
    : uOuter == 6 ? HIP_Y - 0.12
    : HIP_Y - 0.02;
  float d = garment(torso, p, thick, hem);

  // A gilet is the one with no sleeves, which is the whole of what makes it a
  // gilet at this size: the arm below the shoulder is the top's colour.
  if (uOuter != 7) {
    float cuff = uOuter == 5 ? -0.78 : -0.86;              // a puffer is shorter
    // A wide smooth join here fills the armpit and the whole coat reads as a
    // cape with the arms inside it. Keep the seam tight so there is still a
    // gap of background between arm and body.
    d = smin(d, garment(arms, p, thick, cuff), 0.012);
  } else {
    // No sleeve at all. A stub of sleeve cut off at the shoulder read as a
    // short-sleeved jacket, not as a gilet; what says gilet is bare arm right
    // up to the shoulder seam. So the armhole is cut out of the shell instead:
    // a cylinder along the arm, subtracted, leaving a hole with a rim.
    vec3 q = vec3(abs(p.x), p.y, p.z);
    float hole = sdCapsule(q, vec3(shoulderHalf() * 0.96, -0.34, -0.01),
                              vec3(shoulderHalf() * 1.34, -0.54, -0.01), 0.092);
    d = max(d, -hole);
  }

  // The front, carved from the neck to the hem. A carve that starts and stops
  // in open cloth reads as a pocket with something in it; an opening has to
  // reach both ends of the garment.
  float mouth = uOuter == 4 ? 0.075 : (uOuter == 5 ? 0.040 : 0.052);
  float slotMid = (hem - 0.16) * 0.5;
  d = max(d, -sdRoundBox(p - vec3(0.0, slotMid, 0.30),
                         vec3(mouth, (-0.16 - hem) * 0.5, 0.15), 0.028));

  if (uOuter == 2) {
    // Sitting up behind the neck and spilling over the shoulders, not tucked
    // flat against the back. A hood the same width as the head is a hood the
    // head hides, and every one of these is seen from the front.
    float hood = sdEllipsoid(p - vec3(0.0, -0.11, -0.13), vec3(0.36, 0.23, 0.19));
    hood = max(hood, -sdEllipsoid(p - vec3(0.0, -0.12, -0.04), vec3(0.28, 0.17, 0.16)));
    d = smin(d, hood, 0.05);
  }

  if (uOuter == 6) {
    // Lapels. A blazer is a jacket with a collar folded back, and that fold is
    // a wedge either side of the opening big enough to read.
    vec3 q = vec3(abs(p.x), p.y, p.z);
    float lapel = sdRoundBox(
      (q - vec3(0.105, -0.44, 0.285)) * mat3(0.90, 0.44, 0.0, -0.44, 0.90, 0.0, 0.0, 0.0, 1.0),
      vec3(0.042, 0.115, 0.010), 0.028);
    d = smin(d, lapel, 0.025);
  }

  if (uOuter == 5) {
    // A puffer's panels. Three soft bands across the chest, which is the one
    // piece of surface detail here that is not lost at this size — it changes
    // the silhouette at the edge, not just the shading.
    // A triangle wave here (abs(fract(y) - 0.5)) has a crease at every peak
    // and trough, and a crease in a distance field is a crease in the
    // silhouette: the edge came out visibly ragged. A sine has no such corner.
    float band = sin((p.y + 0.06) * 22.6) * 0.5 + 0.5;
    d -= band * 0.017;
  }
  return d;
}

/** Shoes. A block of colour at the foot, taller for a boot. */
float shoeField(vec3 p, float legs) {
  if (uShoes == 0) return 1e5;
  // The foot offset outwards and cut off at the ankle, so a toe cannot come
  // through a trainer either. A boot is the same shell cut higher and made
  // thicker, which is also what lets it come up over a trouser cuff rather
  // than disappear under one.
  // Comfortably outside the trouser shell, which is the body offset by 0.034.
  // At 0.036 a trainer cleared it by two thousandths, and two thousandths is
  // the width of the band where two surfaces fight over a pixel.
  float thick = uShoes == 2 ? 0.072 : 0.050;
  float top = uShoes == 2 ? FOOT_Y + 0.44 : FOOT_Y + 0.13;
  return max(legs - thick, p.y - top);
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
 *
 * Positive means below the line, on the skin side, where hair is cut away.
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
  // Raised from 0.075. With the tubes laid over the top the mass grew forward
  // as well as up and the forehead disappeared under it; in the reference there
  // is always a clear band of brow between the eyes and the hair. The x-squared
  // term is steeper to match, so the temple still keeps its point.
  return (0.118 + lift) + 0.534 * q.z - 1.55 * q.x * q.x - q.y;
}

/**
 * The cap: a shell over the skull whose thickness varies with position.
 *
 * A shell of one constant thickness is a beanie, and that is exactly what
 * every style read as. Hair is not uniformly thick — it has bulk on the crown
 * and at the back, it thins to nothing at the temple, and above all it thins
 * to nothing *at its own edge*, because hair ends in a taper and not in a
 * three-millimetre wall. A constant-thickness cap cut by a plane produces that
 * wall all the way round the head, and a hard edge of even thickness running
 * from the brow past the ear is the single strongest hat cue there is.
 *
 * So thickness here falls off towards the hairline, and the profile carries
 * the volume where a head of hair actually carries it: up and back.
 */
float capField(vec3 q, float lift, float bulk) {
  float hl = hairline(q, lift);
  // 1 well inside the hair, falling to 0 at the cut. Squared, so the taper is
  // concave — a blade edge rather than a chamfer.
  float edge = clamp(-hl / 0.14, 0.0, 1.0);
  // Thicker than it was, across the board. In the reference the hair mass is
  // plainly bigger than the skull it sits on — a good third again at the crown
  // — and a cap that merely skims the head leaves the rolls below looking like
  // decoration stuck onto a bald man.
  // Thin. The cap used to carry the volume, and a shell thick enough to do
  // that fills the valleys between the tubes laid over it — every groove the
  // tubes cut was smoothed straight back out. It closes gaps now, nothing more.
  float thick =
      0.022
    + 0.034 * smoothstep(-0.04, 0.26, q.y)      // bulk on the crown
    + 0.040 * smoothstep(0.12, -0.22, q.z);     // and at the back of the head
  thick *= bulk * mix(0.18, 1.0, edge * edge);
  return max(sdRoundBox(q, HEAD_BOX, HEAD_R + thick), hl);
}

/**
 * One lock of hair: a tube that bends.
 *
 * This is the whole difference between the hair here and the hair in a
 * reference render. A reference style is not a smooth shell with lumps on it,
 * it is six or seven fat strokes laid over each other — a fringe swept across
 * the brow, a length curving off a shoulder — and each stroke catches the
 * light along its own axis, which is what makes hair look combed rather than
 * moulded.
 *
 * A quadratic curve through three points, marched as a handful of segments.
 * Exact enough at this size and far cheaper than solving the cubic: the error
 * is a fraction of the lock's own radius, and a lock is not a surface anybody
 * measures.
 */
float lockField(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1) {
  // Four segments, not five. map() runs about a hundred and sixteen times per
  // pixel and a style is five of these curves, so a segment costs real time;
  // the chord error at four is under a hundredth of a unit on curves this
  // gentle, which is a seventh of the thinnest lock's own radius.
  float d = 1e5;
  vec3 prev = a;
  for (int i = 1; i <= 4; i++) {
    float t = float(i) * 0.25;
    float u = 1.0 - t;
    vec3 at = u * u * a + 2.0 * u * t * b + t * t * c;
    d = min(d, sdTaperCapsule(p, prev, at,
                              mix(r0, r1, (float(i) - 1.0) * 0.25), mix(r0, r1, t)));
    prev = at;
  }
  return d;
}

/** The same, mirrored onto both sides of the head. */
float pairLock(vec3 q, vec3 a, vec3 b, vec3 c, float r0, float r1) {
  return lockField(vec3(abs(q.x), q.y, q.z), a, b, c, r0, r1);
}

/**
 * A parting, pressed in with a soft subtraction.
 *
 * This is most of what separates a hairstyle from a helmet. Every style here
 * was perfectly symmetrical and perfectly smooth over the crown, and a head of
 * hair is neither: it is divided somewhere and it falls away from that line.
 * One crease running back from the brow, off centre, and the whole thing stops
 * reading as a moulded shape and starts reading as hair that was combed.
 */
float partedBy(float d, vec3 q, float x, float depth) {
  // A trough lying along z, so the crease runs front to back over the crown and
  // fades out before the back of the head. Wide and shallow: the first attempt
  // was a thin deep groove and it read as damage rather than as a parting —
  // hair falls away from the line over a centimetre or so on each side, it is
  // not slit with a blade.
  // Riding on top of the hair mass, not inside it. When the rolls were added
  // the mass grew about a tenth taller and this line stayed where it was, so
  // it was subtracting from the thin cap in the valley between two rolls and
  // punching a hole clean through the crown.
  float groove = sdTaperCapsule(q, vec3(x, 0.545, 0.24), vec3(x * 0.4, 0.530, -0.18),
                                0.028, 0.044);
  // Soft subtraction: -smin(-a, b) is a max with the same rounded join smin
  // gives a min, so the crease has walls instead of a cut.
  return -smin(-d, groove - depth, 0.075);
}

/**
 * The roll over the brow.
 *
 * This is the thing the reference has and every style here did not. Look at
 * any of these characters and the hair is not a cap with a fringe: it is one
 * fat tube that starts low at one temple, climbs across the forehead, and
 * sweeps back down the other side, with everything else tucked under it. The
 * tube is thick — a fifth of the width of the head — so it throws a hard
 * shadow onto whatever is behind it, and that shadow is what reads as hair
 * rather than as a moulded shell.
 *
 * sweep runs -1 to 1 for which side it is combed towards. fat scales the
 * whole thing, because a short crop and a full head of long hair carry the
 * same roll at different sizes.
 */
/**
 * One tube of the sweep, the k-th back from the brow.
 *
 * Three tubes on nearly the same path with a radius wider than the gap between
 * them is one tube, which is what the first two attempts built: a smooth dome
 * with a seam. A groove only survives a smooth minimum if the centres are
 * further apart than the radii, so these are thinner than they look like they
 * should be and stacked front to back across the crown, k = 0 at the brow.
 * From the front you are looking along their length, and each one silhouettes
 * against the next — which is exactly where the reference gets its lines.
 */
float sweepLock(vec3 q, float sweep, float fat, float k) {
  vec3 a = vec3( 0.115 * sweep, 0.395 - 0.020 * k, 0.12 - 0.155 * k);
  vec3 b = vec3( 0.005 * sweep, 0.430 - 0.030 * k, 0.34 - 0.185 * k);
  vec3 c = vec3(-0.300 * sweep, 0.130 + 0.050 * k, 0.14 - 0.200 * k);
  return lockField(q, a, b, c, 0.092 * fat, 0.064 * fat);
}

/** The short side of the parting: one tube, the other way. */
float sideRoll(vec3 q, float sweep, float fat) {
  vec3 a = vec3(0.055 * sweep, 0.405, 0.06);
  vec3 b = vec3(0.245 * sweep, 0.365, 0.22);
  vec3 c = vec3(0.305 * sweep, 0.135, 0.05);
  return lockField(q, a, b, c, 0.098 * fat, 0.072 * fat);
}

/** One tube of the sweep on its own, for styles whose hull already has the
 *  volume and only need the parting to show. */
float sweepOne(vec3 q, float sweep, float fat) {
  return smin(sweepLock(q, sweep, fat, 0.0), sideRoll(q, sweep, fat * 0.9), 0.018);
}

/** The whole sweep: three tubes, and a fourth over the short side. */
float sweptTop(vec3 q, float sweep, float fat) {
  // Bounding this group in a box measured no faster: the head already has a
  // bounding box around it and inside that box almost every sample is near the
  // crown anyway, so the test never rejects anything and every ray pays for it.
  // The saving is in the count of curves and segments instead.
  float d = sweepLock(q, sweep, fat, 0.0);
  d = smin(d, sweepLock(q, sweep, fat, 1.35), 0.016);
  d = smin(d, sweepLock(q, sweep, fat * 0.94, 2.7), 0.016);
  return smin(d, sideRoll(q, sweep, fat), 0.016);
}

/**
 * The wedge of hair in front of the ear.
 *
 * Small, and it does a job out of proportion to its size: it is the only thing
 * that makes the hairline look cut rather than drawn. Without it the hair
 * stops in mid air beside the temple.
 */
float templeWedge(vec3 q, float drop) {
  vec3 sv = vec3(abs(q.x), q.y, q.z);
  return sdTaperCapsule(sv, vec3(0.278, 0.14, 0.09), vec3(0.278, drop, 0.04),
                        0.062, 0.016);
}

/**
 * How wide a head of hair is at a given height, as a fraction of its widest.
 *
 * This one function is the whole point of the rewrite. Every style here used
 * to get its outline as a by-product of unioning a cap, some tubes and some
 * ropes, and a union of parts gives a piecewise outline: it has a step wherever
 * one part takes over from the next. Measured against a reference render the
 * damage was specific and large. The reference gains 23% of its width over its
 * lower half and keeps opening the whole way down; the built-up version gained
 * 4% and then fell straight, and it reached 84% of its full width within the
 * first quarter of its height — a near-vertical jump just under the crown,
 * which is the step where the tubes took over from the cap. That step is what
 * read as a beret sitting on a curtain.
 *
 * h runs 0 at the top of the mass to 1 at the ends. The curve is a rise that
 * never quite finishes against a fall that starts late, so it climbs all the
 * way to about two thirds down and then eases off. It has no steps in it
 * because it is one expression rather than a seam between two shapes.
 */
float hairProfile(float h) {
  float t = clamp(h, 0.0, 1.0);
  // A sum of overlapping smoothsteps through measured control points. Each
  // term is smooth and they overlap, so the result has a continuous slope
  // everywhere — the steps this rewrite is about came from unioning solid
  // parts, not from writing a curve in pieces.
  //
  // It starts well above zero rather than at nothing. The very fast opening
  // right under the crown in the reference is the crown itself curving over,
  // and the hull already rounds its top rim; asking the profile to do that job
  // as well needs a slope steep enough to make the field non-conservative, and
  // that is the bug that comes back as stripes across the figure.
  float f = 0.34;
  f += 0.34 * smoothstep(0.00, 0.16, t);
  f += 0.22 * smoothstep(0.12, 0.34, t);
  f += 0.10 * smoothstep(0.30, 0.50, t);
  f -= 0.14 * smoothstep(0.60, 1.00, t);
  return f;
}

/**
 * The mass of hair: an upright elliptical column whose half width is that
 * profile, closed top and bottom with a rounded rim.
 *
 * Because the radius changes with height the plain distance to the axis
 * overestimates the true distance — the same non-conservative field that let
 * shadow rays step through the tapered capsules and come out as stripes. The
 * divisor is the worst slope the profile reaches, near the crown.
 */
float hairHull(vec3 q, float yTop, float yBot, float wMax, float deep, float rim) {
  float h = (yTop - q.y) / max(1e-3, yTop - yBot);
  float w = wMax * hairProfile(h);
  // Set back a little. Hair wraps round a head from behind; a column centred
  // on the skull reaches as far forward as it does sideways and swallows the
  // face whole.
  float radial = length(vec2(q.x, (q.z + 0.07) / deep)) - w;
  float mid = 0.5 * (yTop + yBot);
  // Not named half: that is a reserved word in GLSL and this is the third
  // time it has silently failed the whole shader.
  float reach = 0.5 * (yTop - yBot) - rim;
  vec2 e = vec2(radial, abs(q.y - mid) - reach);
  float d = min(max(e.x, e.y), 0.0) + length(max(e, 0.0)) - rim;
  return d / 1.25;
}

/**
 * The opening the face and the front of the body come through.
 *
 * The hull is solid, so without this it is a helmet with a body inside it. The
 * cut is the part of a slab in front of the head that also lies below the
 * hairline, which gives the opening a brow edge that follows the hairline the
 * way every other style does and straight sides past the cheeks.
 */
float faceOpening(vec3 q, float lift, float wide) {
  float slab = sdRoundBox(q - vec3(0.0, -0.55, 0.44), vec3(wide, 1.05, 0.34), 0.06);
  // hairline() is positive on the skin side, so the region to remove is where
  // the slab is inside AND the hairline is positive — hence the minus.
  return max(slab, -hairline(q, lift));
}

float hairField(vec3 p) {
  if (uStyle == 0) return 1e5;
  vec3 q = p - vec3(0.0, HEAD_Y, 0.0);
  float d;

  if (uStyle == 1) {          // buzz — close to the skull, cut at the brow
    d = capField(q, -0.06, 0.42);
  } else if (uStyle == 2) {   // crop — the swept roll, stacked
    d = capField(q, -0.02, 0.95);
    // Three tubes of decreasing size laid over each other, all going the same
    // way. Joined at 0.024, which is tight enough that each one still casts a
    // groove into the one behind it: the grooves are the style.
    d = smin(d, sweptTop(q, 1.0, 1.05), 0.020);
    d = smin(d, templeWedge(q, -0.10), 0.030);
    d = partedBy(d, q, 0.075, 0.020);
  } else if (uStyle == 3) {   // curls — coils, each one its own turn
    d = capField(q, 0.02, 0.85);
    d = smin(d, sdSphere(q - vec3(-0.21, 0.30, 0.06), 0.145), 0.030);
    d = smin(d, sdSphere(q - vec3(0.03, 0.40, 0.02), 0.150), 0.030);
    d = smin(d, sdSphere(q - vec3(0.24, 0.29, 0.07), 0.140), 0.030);
    d = smin(d, sdSphere(q - vec3(-0.31, 0.12, -0.01), 0.130), 0.030);
    d = smin(d, sdSphere(q - vec3(0.32, 0.11, 0.00), 0.125), 0.030);
    d = smin(d, sdSphere(q - vec3(-0.13, 0.22, 0.22), 0.115), 0.030);
    d = smin(d, sdSphere(q - vec3(0.17, 0.40, -0.14), 0.130), 0.030);
    d = smin(d, sdSphere(q - vec3(0.0, 0.22, -0.28), 0.150), 0.030);
  } else if (uStyle == 4) {   // bun — gathered up, with the gather showing
    d = capField(q, 0.0, 0.85);
    // The strokes that do the gathering, sweeping back from the temple to the
    // knot. Without them a bun is a ball glued to a smooth head.
    d = smin(d, sweptTop(q, 1.0, 0.88), 0.020);
    d = smin(d, pairLock(q, vec3(0.28, 0.14, 0.14), vec3(0.265, 0.40, -0.06),
                         vec3(0.05, 0.36, -0.22), 0.105, 0.080), 0.026);
    d = smin(d, sdEllipsoid(q - vec3(0.0, 0.30, -0.16), vec3(0.20, 0.14, 0.17)), 0.09);
    d = smin(d, sdEllipsoid(q - vec3(0.0, 0.47, -0.21), vec3(0.155, 0.145, 0.135)), 0.05);
    d = partedBy(d, q, 0.0, 0.012);
  } else if (uStyle == 8) {   // afro — one big mass, and the mass is the point
    d = capField(q, 0.01, 0.5);
    float ball = sdEllipsoid(q - vec3(0.0, 0.075, -0.115), vec3(0.480, 0.460, 0.360));
    ball = smin(ball, sdSphere(q - vec3(-0.32, 0.25, -0.06), 0.180), 0.12);
    ball = smin(ball, sdSphere(q - vec3(0.33, 0.21, -0.12), 0.175), 0.12);
    ball = smin(ball, sdSphere(q - vec3(0.04, 0.40, -0.16), 0.185), 0.12);
    ball = smin(ball, sdSphere(q - vec3(-0.19, -0.11, -0.13), 0.160), 0.12);
    ball = smin(ball, sdSphere(q - vec3(0.21, -0.13, -0.12), 0.155), 0.12);
    d = smin(d, ball, 0.06);
    d = max(d, -sdEllipsoid(q - vec3(0.0, -0.06, 0.30), vec3(0.225, 0.250, 0.230)));
  } else if (uStyle == 9) {   // volume — long, and full rather than flat
    d = hairHull(q, 0.50, -1.34, 0.480, 0.92, 0.16);
    d = smin(d, sweepOne(q, -1.0, 1.00), 0.020);
    // After the sweep, not before. Cutting the hull first and then unioning
    // the sweep puts the tubes back over the brow and the forehead disappears
    // again; the opening has to be the last word on where the hair stops.
    d = max(d, -faceOpening(q, 0.060, 0.255));
    d = partedBy(d, q, -0.085, 0.020);
  } else if (uStyle == 10) {  // twin tails — the volume is out to the sides
    d = capField(q, -0.01, 0.95);
    vec3 sv = vec3(abs(q.x), q.y, q.z);
    float tie = sdEllipsoid(sv - vec3(0.300, 0.17, -0.05), vec3(0.095, 0.090, 0.090));
    float tail = lockField(sv, vec3(0.305, 0.11, -0.05), vec3(0.395, -0.34, -0.06),
                           vec3(0.345, -0.78, -0.04), 0.105, 0.165);
    tail = smin(tail, sdEllipsoid(sv - vec3(0.355, -0.84, -0.03),
                                  vec3(0.140, 0.155, 0.130)), 0.09);
    d = smin(d, smin(tie, tail, 0.06), 0.05);
    d = partedBy(d, q, 0.0, 0.020);
  } else {                    // bob, long, wave — lengths down the sides
    // One mass with the profile above, rather than a cap with ropes hung off
    // it. Length, width and how deep it sits are the only things that differ
    // between the three, which is what a length of hair really is.
    // Width as well as length. Four styles that differed only in where they
    // stopped were four of the same haircut, because the mass is wide enough
    // now that the outline is what you read, not the hem.
    float yBot = uStyle == 5 ? -0.60 : (uStyle == 6 ? -1.26 : -1.14);
    float wMax = uStyle == 5 ? 0.350 : (uStyle == 6 ? 0.395 : 0.450);
    d = hairHull(q, 0.49, yBot, wMax, 0.90, 0.16);
    d = smin(d, sweepOne(q, -1.0, uStyle == 5 ? 0.95 : 1.00), 0.020);
    d = max(d, -faceOpening(q, 0.060, 0.255));
    if (uStyle == 7) {
      // The wave: one rope a side riding on the outside of the mass, which is
      // what puts a bend in an outline the profile alone keeps smooth.
      d = smin(d, pairLock(q, vec3(0.300, 0.02, -0.06),
                           vec3(0.520, -0.46, -0.04),
                           vec3(0.330, -0.98, -0.06), 0.115, 0.140), 0.030);
    }
    d = smin(d, templeWedge(q, uStyle == 5 ? -0.16 : -0.20), 0.030);
    d = partedBy(d, q, -0.085, 0.020);
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
/**
 * The whole scene: nearest distance, and what was nearest.
 *
 * Grouped by region and guarded by a bounding test each. Without the guards a
 * ray passing the top of the head evaluates the shoes, the trousers and both
 * arms on every one of its steps, and there are about a hundred and sixteen
 * steps per pixel. With them a head-height ray pays for the head.
 *
 * Each guard returns the distance to its bounding box when the point is
 * outside it. That is a lower bound on the distance to anything inside, which
 * is exactly what a sphere-tracing march needs; returning a large constant
 * instead would let the ray step straight through a leg.
 */
/**
 * Everything except the wall behind it.
 *
 * Split out because the wall must not cast a shadow, and it was. A shadow ray
 * leaves a point on the backdrop travelling towards the light, and the
 * backdrop's own field is a long stretch of nearly-zero distance right where
 * that ray starts: the march crawls along it, spends its twenty-four steps at
 * a slightly different place for every pixel, and returns whatever it had
 * reached. That is the rippled, stair-stepped shadow on the wall. A wall is
 * not an occluder, so leaving it out is both correct and cheaper.
 */
vec2 mapFigure(vec3 p) {
  vec2 res = vec2(1e5, float(MAT_BACK));


  // Head, hair, eyes and glasses: everything above the collarbone.
  float headBound = boundOf(p, vec3(0.0, 0.30, 0.0), vec3(0.62, 0.52, 0.52));
  if (headBound > 0.05) {
    res = closer(res, vec2(headBound, float(MAT_SKIN)));
  } else {
    res = closer(res, vec2(smin(headField(p), neckField(p), 0.08), float(MAT_SKIN)));
    res = closer(res, vec2(hairField(p), float(MAT_HAIR)));
    res = closer(res, vec2(eyeField(p), float(MAT_EYE)));
    res = closer(res, vec2(extraField(p), float(MAT_METAL)));
  }

  // The torso and what is worn on it. Always evaluated, because the portrait
  // framing shows the shoulders and nothing below them.
  float chestBound = boundOf(p, vec3(0.0, -0.62, 0.0), vec3(0.72, 0.72, 0.40));
  if (chestBound > 0.05) {
    res = closer(res, vec2(chestBound, float(MAT_CLOTH)));
  } else {
    // Worked out once and handed to the garments, which are built from them.
    float torso = torsoField(p);
    float arms = armsField(p);
    res = closer(res, vec2(torso, float(MAT_SKIN)));
    res = closer(res, vec2(arms, float(MAT_SKIN)));
    res = closer(res, vec2(topField(p, torso, arms), float(MAT_CLOTH)));
    res = closer(res, vec2(outerField(p, torso, arms), float(MAT_OUTER)));
  }

  // Legs, trousers and shoes. Only ever reached in the full-body framing, but
  // guarded by geometry rather than by the frame so that a portrait of a tall
  // hat and a full body of the same avatar are the same distance field.
  float legBound = boundOf(p, vec3(0.0, -1.40, 0.02), vec3(0.44, 0.62, 0.32));
  if (legBound > 0.05) {
    res = closer(res, vec2(legBound, float(MAT_SKIN)));
  } else {
    float legs = legsField(p);
    res = closer(res, vec2(legs, float(MAT_SKIN)));
    // Recomputed rather than hoisted above both groups. Hoisting looks like
    // the saving and measures like the opposite: it makes every ray that the
    // bounding boxes would have rejected — most of them — pay for a torso it
    // never needed.
    res = closer(res, vec2(bottomField(p, torsoField(p), legs), float(MAT_BOTTOM)));
    res = closer(res, vec2(shoeField(p, legs), float(MAT_SHOE)));
  }
  return res;
}

/**
 * The wall behind the figure, and — in the full-length framing — the floor it
 * stands on.
 *
 * Without a floor a standing figure hangs in the middle of a card. The drop
 * shadow behind it says "lit from the front left" and nothing at all says
 * "resting on something", so the whole thing reads as floating, which is what
 * it was doing. The floor meets the wall just under the feet; the corner
 * between them is what the eye reads as ground.
 */
float groundY() {
  return FOOT_Y - 0.115;
}

vec2 map(vec3 p) {
  vec2 res = vec2(p.z + 0.72, float(MAT_BACK));
  if (uFull > 0.5) res = closer(res, vec2(p.y - groundY(), float(MAT_BACK)));
  return closer(res, mapFigure(p));
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
  // Twenty-four steps and a floor of 0.02. The figure is under three units
  // tall, so a ray still travelling past that has left the scene and every
  // further step is spent confirming it.
  for (int i = 0; i < 24; i++) {
    float h = mapFigure(origin + dir * t).x;
    // 10.0, not lower. A softer penumbra sounds like the fix for the faint
    // rings the march leaves on the wall, and it is the opposite: at 5.5 the
    // same quantised steps spread across the *figure* as contour bands over
    // the whole body. A tight penumbra keeps them below one shade.
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.24);
    if (res < 0.004 || t > 3.0) break;
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
  // Two framings from one scene. The portrait is what a leaderboard row and a
  // profile card want; the full figure is what the wardrobe wants, since a
  // pair of shoes you cannot see is a pair of shoes nobody buys. Same geometry,
  // same lens, different crop — so the face on the small card is the same face
  // as the one on the big one rather than a second drawing of it.
  // A touch wider in the portrait than it was. The hair grew about a tenth of
  // a head taller when it became tubes rather than a cap, and at 0.276 the
  // crown of the fuller styles was touching the top of the frame.
  float aim = mix(0.035, -0.560, uFull);
  float spread = mix(0.298, 0.556, uFull);
  vec3 eye = vec3(0.0, aim, 2.90);
  // The vertical spread is the one that frames the figure; the horizontal one
  // is divided by the aspect so a taller image shows more height rather than
  // the same height stretched.
  vec3 dir = normalize(vec3(vUv.x * spread / uAspect, vUv.y * spread, -1.0));

  // Skip straight to where the figure could possibly be, rather than marching
  // the two empty units in front of it.
  float t = max(0.0, 2.90 - mix(1.45, 2.45, uFull));
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
    : mat == MAT_BOTTOM ? uBottomCol
    : mat == MAT_OUTER ? uOuterCol
    : mat == MAT_SHOE ? uShoeCol
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

  // The one place a highlight belongs. Everything here is unfired clay and a
  // specular lobe would read as glaze — but hair is the exception even in clay
  // renders, because a head of it is thousands of near-parallel fibres and
  // they catch the key as one broad band across the crown. Tinted with the
  // hair's own colour rather than white, and spread over a wide exponent, so
  // it stays a sheen and never becomes a hotspot.
  if (mat == MAT_HAIR) {
    // Two lobes, not one. The broad one is the sheen a head of hair has all
    // over; the tight one is the band that runs along a single lock, and it is
    // what separates one stroke from the next when they are the same colour.
    // Both are tinted with the hair's own colour and lifted towards white only
    // at the tight end, because a pure white highlight on clay reads as glaze
    // and a pure hair-coloured one does not read at all.
    vec3 hv = normalize(key + normalize(eye - p));
    float lobe = max(0.0, dot(n, hv));
    lit += uHair * pow(lobe, 3.5) * 0.30 * sh * mix(0.55, 1.0, ao);
    // The tight lobe is a band across the strands, not a dot. A round Blinn
    // highlight is what a billiard ball has; hair has a ring, because every
    // strand reflects into a cone about its own axis and the cones line up.
    // Kajiya-Kay: the falloff runs on the sine of the angle to the strand, so
    // the bright band lies perpendicular to it. Strands fall vertically down
    // the sides and run front to back over the crown, which is all the tangent
    // this needs — there is no combing to follow at this size.
    // The tangent has to lie in the surface, not be a fixed world direction.
    // A constant tangent makes the sine constant too, and the band covers the
    // whole head in flat grey — which is exactly what the first attempt did.
    // Projecting the flow direction onto the tangent plane makes it turn with
    // the surface, and the band falls where the surface turns through it.
    vec3 flow = mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0),
                    smoothstep(0.30, 0.92, n.y));
    vec3 tangent = normalize(flow - n * dot(n, flow) + 1e-5);
    float dTH = dot(tangent, hv);
    float sinTH = sqrt(max(0.0, 1.0 - dTH * dTH));
    lit += mix(uHair, vec3(1.0), 0.30) * pow(sinTH, 165.0) * 0.42 * sh * mix(0.6, 1.0, ao);
  }

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
    float pool = 1.0 - 0.42 * length(vUv - vec2(-0.32, 0.30));
    lit = uBack * clamp(pool, 0.45, 1.12) * mix(0.55, 1.0, sh);
    // The floor takes the same paint a shade darker, because it faces up into
    // a dimmer part of the sky than the wall faces out of — and then a contact
    // shadow is pooled where the feet meet it. That pool is what actually says
    // the figure is standing: a shadow on the wall behind says only that
    // something is lit, while a shadow *under* something says it is resting on
    // the thing it is over.
    if (uFull > 0.5 && n.y > 0.5) {
      float toFeet = length(vec2(p.x, (p.z - 0.02) * 1.35));
      float contact = smoothstep(0.02, 0.46, toFeet);
      lit = uBack * clamp(pool, 0.45, 1.12) * mix(0.30, 0.88, contact) * 0.92;
    }
  }

  outColour = vec4(pow(clamp(lit, 0.0, 1.0), vec3(0.4545)), 1.0);
}
`
