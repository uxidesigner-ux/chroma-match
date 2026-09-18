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
# Egg skull measured off the reference front panel (face width = 528 px,
# crown-to-chin ~665 px -> 2.0 head units, so 1 face width = 1.56 units).
# Widest at the cheek, well below the eyes; lower half rounds quickly to a
# broad chin; upper half is a taller ellipse under the hair.
HEAD_HALF_W = 0.76
# Gentle egg: a sphere stretched a little taller, widest just below centre.
# k=2 on every section — k>2 is a rounded square, which is what the last
# pass still read as.
EGG_C = -0.20
EGG_B_LO, EGG_B_HI = 0.80, 1.20
EGG_K_LO, EGG_K_HI = 2.00, 2.00
SECTION_K = 2.00
DEPTH_FRONT, DEPTH_BACK = 0.94, 1.00
# Eyes sit in the upper half of the visible face (sheet front).
EYE_Y, EYE_X = 0.02, 0.205
EYE_W, EYE_H, EYE_D = 0.055, 0.078, 0.014
# Nose: a modest clay ball whose top overlaps the eye. From the front it is
# a bump on the face, not a snowman; from the side the ball still reads.
NOSE_Y = -0.18
NOSE_HALF = (0.115, 0.100, 0.110)
NOSE_PROUD = 0.100
# Neck and shoulders from the sheet: a slim visible neck under the chin,
# then a soft slope into a narrower shoulder, scoop neckline dipping front.
NECK_HALF_W, NECK_HALF_D = 0.290, 0.255
NECKLINE_Y = -1.48
NECKLINE_SIDE_Y = -1.32
SHOULDER_HALF = 1.18
SHOULDER_DEPTH = 0.50
NECK_TOP_Y = -1.02
SHOULDER_START_Y = -1.16
SHOULDER_END_Y = -2.05
# Bust: sheet side view, chest coming forward below the collar. Front half.
CHEST = 0.40
# Ears: small discs at eye-to-nose height, pearls visible from the front.
EAR_HALF = (0.070, 0.155, 0.090)
EAR_Y = -0.05
EAR_Z = -0.02
EAR_PROUD = 0.048
PEARL_R = 0.038


def to_blender(p):
    """(x, up, front) -> Blender (x, -front, up)."""
    return (p[0], -p[2], p[1])


def half_width(y):
    """Skull half-width at height y (egg profile from the reference)."""
    y = max(-1.0, min(1.0, y))
    if y < EGG_C:
        t, k = (EGG_C - y) / EGG_B_LO, EGG_K_LO
    else:
        t, k = (y - EGG_C) / EGG_B_HI, EGG_K_HI
    t = min(1.0, t)
    return HEAD_HALF_W * (1.0 - t ** k) ** (1.0 / k)


def half_depth(y, front=True):
    return half_width(y) * (DEPTH_FRONT if front else DEPTH_BACK)


def axes_at(y):
    return (half_width(y), half_depth(y, True))


def front_surface_z(x, y):
    """Front-most skull z at lateral x, height y (0 at the skull's side)."""
    hw = half_width(y)
    if hw <= 1e-6 or abs(x) >= hw:
        return 0.0
    return half_depth(y, True) * (1.0 - (abs(x) / hw) ** SECTION_K) ** (1.0 / SECTION_K)


def ear_center(side):
    """Stuck-on ear: disc centred just outside the skull at eye-to-nose height."""
    return (side * (half_width(EAR_Y) + EAR_PROUD), EAR_Y, EAR_Z)


def pearl_center(side):
    c = ear_center(side)
    return (c[0] + side * 0.010, c[1] - EAR_HALF[1] - 0.030, c[2] + 0.030)


def nose_center(skin_z):
    return (0.0, NOSE_Y, skin_z - NOSE_HALF[2] + NOSE_PROUD)


def head_surface(d):
    """Egg skull. `d` is a unit direction; its y is used as latitude."""
    y = max(-1.0, min(1.0, d[1]))
    h = math.hypot(d[0], d[2])
    if h < 1e-6:
        return [0.0, y, 0.0]
    ux, uz = d[0] / h, d[2] / h
    hw = half_width(y)
    hz = half_depth(y, uz > 0)
    if hw < 1e-6:
        return [0.0, y, 0.0]
    s = max(1e-9, (abs(ux) / hw) ** SECTION_K + (abs(uz) / hz) ** SECTION_K)
    r = s ** (-1.0 / SECTION_K)
    p = [ux * r, y, uz * r]
    # No local cheek / chin / socket / brow blobs. Those carved a valley
    # under the nose (a punched-mouth shadow) and squared the silhouette.
    # The sheet face is one smooth egg; the nose ball sits on it.
    return p


def body_axes(y):
    # Slim neck cylinder, then a wide, soft shoulder slope into the chest.
    to_shoulder = lib.smoothstep(SHOULDER_START_Y, SHOULDER_END_Y, y)
    to_chest = lib.smoothstep(-1.90, -2.60, y)
    # Trapezius flares early (half-width 0.55 by y=-1.22, 0.75 at the collar),
    # then the shoulder rounds off toward the arm.
    ease = to_shoulder ** 0.95
    return (
        lib.mix(NECK_HALF_W, SHOULDER_HALF, ease) + 0.05 * to_chest,
        lib.mix(NECK_HALF_D, SHOULDER_DEPTH, to_shoulder ** 1.1) + 0.05 * to_chest,
    )


def chest_bulge(y):
    """Extra front depth of the torso at height y (0 above the collar)."""
    return CHEST * lib.smoothstep(-1.55, -2.75, y)


def torso_front_z(x, y):
    """Front surface of the knit at lateral x, height y (authoring coords)."""
    a, c = body_axes(y)
    a += 0.080
    c += 0.080 + chest_bulge(y)
    if abs(x) >= a:
        return 0.0
    k = 2.4
    return c * (1.0 - (abs(x) / a) ** k) ** (1.0 / k)


def neckline_y(front):
    """Scoop neckline height for a horizontal direction; `front` in [-1, 1]."""
    dip = max(0.0, front) ** 1.6
    return lib.mix(NECKLINE_SIDE_Y, NECKLINE_Y, dip)


def build_head():
    obj = lib.sphere_cage(44, 36, lambda d: to_blender(head_surface((d.x, d.z, -d.y))))
    lib.subsurf(obj, 2)
    lib.relax(obj, 0.42, 2)
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
        # The neck runs up into the skull so there is no seam under the chin.
        y = lib.mix(-3.05, NECK_TOP_Y + 0.12, t ** 0.85)
        a, c = body_axes(y)
        cap = math.sqrt(max(0.0, 1 - abs(d.z) ** 12))
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        if uy < 0:
            c += chest_bulge(y)
        k = 2.4
        s = max(1e-9, (abs(ux) / a) ** k + (abs(uy) / c) ** k)
        r = s ** (-1 / k)
        return (ux * r * cap, uy * r * cap, y)

    obj = lib.sphere_cage(40, 40, shape)
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
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        # Blender -y is the front. The opening dips at the front centre.
        top = neckline_y(-uy)
        y = lib.mix(top, hem, v ** 0.94)
        a, c = body_axes(y)
        # Rolled hem at the opening: slightly thicker, always outside the body.
        roll = lib.smoothstep(0.08, 0.0, v)
        grow = cloth * (1 + 0.35 * roll)
        a_open = a + grow
        c_open = c + grow + (chest_bulge(y) if uy < 0 else 0.0)
        k = 2.4
        s = max(1e-9, (abs(ux) / a_open) ** k + (abs(uy) / c_open) ** k)
        r = s ** (-1 / k)
        return (ux * r, uy * r, y)

    obj = lib.sphere_cage(56, 40, shape)
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

    nx, ny, nz = NOSE_HALF
    nose = lib.sphere_cage(
        20, 14,
        lambda d: to_blender((d.x * nx, d.z * ny, -d.y * nz)),
    )
    lib.subsurf(nose, 2)
    lib.shaded_smooth(nose)
    nose.name = "nose"
    nose.data.name = "nose"
    nose.location = to_blender(nose_center(front_z(head, 0.0, NOSE_Y)))
    lib.assign(nose, skin)
    parts.append(nose)

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
