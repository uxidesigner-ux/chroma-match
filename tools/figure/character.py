"""
Build the representative character and write it out as a GLB.

Proportions are in head units — the skull is 2.0 tall from crown to chin and
centred on the origin — so every part has one shared frame and a hairstyle
cannot move the face.

Written in a right-handed frame with y up and z towards the viewer, which is
what the browser uses, and converted to Blender's z-up on the way into the mesh.
The glTF exporter converts back.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402

# Face / body unlocked for the representative sculpt. Previous passes held these
# fixed so hair could be compared in isolation; that constraint is lifted here
# because the hair-to-face ratio and the neck/collar join are part of the same
# judgment as the hair itself.
# Slightly oval clay skull — taller than it is wide, a bit smaller than a
# bowling ball — with ears stuck on. Hair sits up on this skull; it is not
# strapped onto a full sphere. Height stays 2.0 head units (crown to chin).
HEAD_HALF_W = 0.700
HEAD_HALF_D = 0.660
SQUARENESS = 2.06
EYE_Y, EYE_X = 0.022, 0.198
# Flatter eyes — almost discs. Bead highlights come from protrusion + gloss.
EYE_W, EYE_H, EYE_D = 0.084, 0.092, 0.016
NOSE_Y, NOSE_OUT = -0.205, 0.142
NECKLINE_Y = -1.18
SHOULDER_HALF = 1.12
NECK_TOP_Y = -0.98
# Small ear blob stuck into the oval, visible from the front. Pearl on the lobe.
EAR_HALF = (0.058, 0.142, 0.092)
EAR_Y = -0.038
EAR_Z = -0.052
PEARL_R = 0.030


def to_blender(p):
    """(x, up, front) -> Blender (x, -front, up)."""
    return (p[0], -p[2], p[1])


def axes_at(y):
    # Egg, not a bowling ball: widest at the cheek, tapering to crown and chin.
    jaw = lib.smoothstep(-0.10, -1.0, y)
    crown = lib.smoothstep(0.28, 1.0, y)
    cheek = lib.blob(abs(y + 0.04) / 0.40)
    return (
        HEAD_HALF_W * (1 - 0.145 * jaw - 0.110 * crown + 0.065 * cheek),
        HEAD_HALF_D * (1 - 0.110 * jaw - 0.075 * crown + 0.035 * cheek),
    )


def ear_center(side):
    """Stuck-on ear: centre on the oval, blob sticks out to the side."""
    return (side * (axes_at(EAR_Y)[0] + 0.030), EAR_Y, EAR_Z)


def pearl_center(side):
    c = ear_center(side)
    return (c[0] + side * 0.016, c[1] - 0.112, c[2] + 0.018)


def super_radius(d, a, b, c, k):
    s = max(1e-9, (abs(d[0]) / a) ** k + (abs(d[1]) / b) ** k + (abs(d[2]) / c) ** k)
    return s ** (-1 / k)


def head_surface(d):
    a, c = axes_at(d[1])
    r = super_radius(d, a, 1.0, c, SQUARENESS)
    p = [d[0] * r, d[1] * r, d[2] * r]
    front = lib.smoothstep(-0.05, 0.60, d[2])

    # Simple clay head: round cheeks, a short blob nose, no brow ridge.
    cheek = lib.blob(math.hypot((abs(p[0]) - 0.300) / 0.500, (p[1] + 0.160) / 0.380))
    p[2] += cheek * 0.048 * front

    jaw = lib.blob(math.hypot((abs(p[0]) - 0.200) / 0.420, (p[1] + 0.500) / 0.300))
    p[2] += jaw * 0.022 * front

    chin = lib.blob(math.hypot(p[0] / 0.400, (p[1] + 0.780) / 0.320))
    p[2] += chin * 0.048 * front

    dy = p[1] - NOSE_Y
    vy = dy / 0.155 if dy > 0 else dy / 0.110
    nose = lib.blob(math.hypot(p[0] / 0.155, vy))
    p[2] += nose * NOSE_OUT * front
    p[1] -= nose * 0.008

    # Very shallow sockets — eyes should not sit on stilts.
    socket = lib.blob(math.hypot((abs(p[0]) - EYE_X) / 0.195, (p[1] - EYE_Y) / 0.155))
    p[2] -= socket * 0.018 * front

    return p


def body_axes(y):
    # Short neck cylinder into a modest shoulder. The knit sits high.
    neck = 0.355
    to_shoulder = lib.smoothstep(NECK_TOP_Y, -1.55, y)
    to_chest = lib.smoothstep(-1.50, -2.45, y)
    return (
        lib.mix(neck, SHOULDER_HALF, to_shoulder ** 0.90) + 0.05 * to_chest,
        lib.mix(0.330, 0.460, to_shoulder ** 0.92) + 0.040 * to_chest,
    )


def build_head():
    obj = lib.sphere_cage(40, 26, lambda d: to_blender(head_surface((d.x, d.z, -d.y))))
    lib.subsurf(obj, 2)
    lib.relax(obj, 0.35, 1)
    lib.shaded_smooth(obj)
    obj.name = "head"
    obj.data.name = "head"
    return obj


def front_z(obj, x, y):
    """Front-most authoring z on a finished mesh, near authoring (x, y)."""
    best = None
    for vertex in obj.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        if q[2] < 0.2:
            continue
        dist = (q[0] - x) ** 2 + (q[1] - y) ** 2
        if best is None or dist < best[0]:
            best = (dist, q[2])
    return best[1]


def build_body():
    def shape(d):
        t = (d.z + 1) / 2
        # Top of the body meets the chin more closely so neck length is short
        # and the shoulder slope starts under the jaw, not a handspan below it.
        y = lib.mix(-3.05, NECK_TOP_Y + 0.10, t)
        a, c = body_axes(y)
        cap = math.sqrt(max(0.0, 1 - abs(d.z) ** 12))
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.6
        s = max(1e-9, (abs(ux) / a) ** k + (abs(uy) / c) ** k)
        r = s ** (-1 / k)
        return (ux * r * cap, uy * r * cap, y)

    obj = lib.sphere_cage(36, 30, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "body"
    obj.data.name = "body"
    return obj


def build_top():
    """Crew neck that follows the shoulder slope — no triangle of chest skin."""
    hem = -3.15
    cloth = 0.080

    def shape(d):
        t = (d.z + 1) / 2
        v = 1 - t
        y = lib.mix(NECKLINE_Y, hem, v ** 0.94)
        a, c = body_axes(y)
        roll = lib.smoothstep(0.10, 0.0, v)
        grow = cloth * (1 - 0.40 * roll)
        # Opening tracks the neck section closely so skin does not fan out
        # above the collar as a triangle.
        a_open = a + grow * 0.95
        c_open = c + grow * 0.85
        if v < 0.08:
            # Round crew: keep the opening on the neck, not a V of chest skin.
            c_open *= 0.88
            a_open *= 0.96
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.5
        s = max(1e-9, (abs(ux) / a_open) ** k + (abs(uy) / c_open) ** k)
        r = s ** (-1 / k)
        return (ux * r, uy * r, y)

    obj = lib.sphere_cage(48, 32, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "top"
    obj.data.name = "top"
    return obj


def build_face_parts(head, skin, eye_mat, pearl_mat):
    """Eyes, stuck-on ears, and pearl lobes on the finished oval skull."""
    skin_z = front_z(head, EYE_X, EYE_Y)
    eye_front = skin_z + 0.016
    parts = []
    for side, tag in ((-1, "l"), (1, "r")):
        eye = lib.sphere_cage(
            20, 14,
            lambda d: to_blender((d.x * EYE_W, d.z * EYE_H, -d.y * EYE_D)),
        )
        lib.subsurf(eye, 2)
        lib.shaded_smooth(eye)
        eye.name = "eye_" + tag
        eye.data.name = "eye_" + tag
        eye.location = to_blender((side * EYE_X, EYE_Y, eye_front - EYE_D))
        lib.assign(eye, eye_mat)
        parts.append(eye)

        hx, hy, hz = EAR_HALF
        ear = lib.sphere_cage(
            16, 12,
            lambda d, hx=hx, hy=hy, hz=hz: to_blender((d.x * hx, d.z * hy, -d.y * hz)),
        )
        lib.subsurf(ear, 1)
        lib.shaded_smooth(ear)
        ear.name = "ear_" + tag
        ear.data.name = "ear_" + tag
        ear.location = to_blender(ear_center(side))
        lib.assign(ear, skin)
        parts.append(ear)

        pearl = lib.sphere_cage(
            12, 10,
            lambda d, r=PEARL_R: to_blender((d.x * r, d.z * r, -d.y * r)),
        )
        lib.subsurf(pearl, 1)
        lib.shaded_smooth(pearl)
        pearl.name = "pearl_" + tag
        pearl.data.name = "pearl_" + tag
        pearl.location = to_blender(pearl_center(side))
        lib.assign(pearl, pearl_mat)
        parts.append(pearl)
    return parts


def build():
    """Body only. Does not write hair_long_wave.blend or hair_long_wave.glb."""
    lib.reset()
    skin = lib.material("skin", (0.945, 0.710, 0.560), 0.80)
    cloth = lib.material("cloth", (0.085, 0.082, 0.088), 0.96)
    # Soft eye: less specular bead. The reference eyes are simple dark ovals,
    # not glass marbles.
    eye_mat = lib.material("eye", (0.145, 0.118, 0.110), 0.55)
    pearl_mat = lib.material("pearl", (0.93, 0.90, 0.86), 0.28)

    head = build_head()
    lib.assign(head, skin)
    body_obj = build_body()
    lib.assign(body_obj, skin)
    top_obj = build_top()
    lib.assign(top_obj, cloth)

    body = [head, body_obj, top_obj]
    body.extend(build_face_parts(head, skin, eye_mat, pearl_mat))

    from asset_paths import BODY_GLB, CHARACTER_GLB, HAIR_GLB, PUBLIC
    from hair_long_wave import export_objects

    PUBLIC.mkdir(parents=True, exist_ok=True)
    export_objects(body, BODY_GLB)
    print(f"BODY {BODY_GLB} bytes={BODY_GLB.stat().st_size}")

    if HAIR_GLB.exists():
        # Assemble without regenerating hair. Form lives in the .blend.
        lib.reset()
        bpy.ops.import_scene.gltf(filepath=str(BODY_GLB))
        bpy.ops.import_scene.gltf(filepath=str(HAIR_GLB))
        lib.export(str(CHARACTER_GLB))
        print(f"ASSEMBLED {CHARACTER_GLB} bytes={CHARACTER_GLB.stat().st_size}")
    else:
        print("no hair_long_wave.glb yet; body only")


if __name__ == "__main__":
    build()
