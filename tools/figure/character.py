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

HEAD_HALF_W = 0.795
HEAD_HALF_D = 0.820
SQUARENESS = 2.45
EYE_Y, EYE_X = 0.010, 0.262
NOSE_Y, NOSE_OUT = -0.235, 0.215
NECKLINE_Y = -1.40
SHOULDER_HALF = 1.16


def to_blender(p):
    """(x, up, front) -> Blender (x, -front, up)."""
    return (p[0], -p[2], p[1])


def axes_at(y):
    jaw = lib.smoothstep(-0.30, -1.0, y)
    crown = lib.smoothstep(0.55, 1.0, y)
    return (
        HEAD_HALF_W * (1 - 0.145 * jaw - 0.060 * crown),
        HEAD_HALF_D * (1 - 0.110 * jaw - 0.040 * crown),
    )


def super_radius(d, a, b, c, k):
    s = max(1e-9, (abs(d[0]) / a) ** k + (abs(d[1]) / b) ** k + (abs(d[2]) / c) ** k)
    return s ** (-1 / k)


def head_surface(d):
    a, c = axes_at(d[1])
    r = super_radius(d, a, 1.0, c, SQUARENESS)
    p = [d[0] * r, d[1] * r, d[2] * r]
    front = lib.smoothstep(-0.05, 0.60, d[2])

    brow = lib.blob(math.hypot(p[0] / 0.62, (p[1] - 0.190) / 0.190))
    p[2] += brow * 0.026 * front

    cheek = lib.blob(math.hypot((abs(p[0]) - 0.300) / 0.420, (p[1] + 0.230) / 0.330))
    p[2] += cheek * 0.030 * front

    chin = lib.blob(math.hypot(p[0] / 0.400, (p[1] + 0.800) / 0.330))
    p[2] += chin * 0.052 * front

    dy = p[1] - NOSE_Y
    vy = dy / 0.250 if dy > 0 else dy / 0.150
    nose = lib.blob(math.hypot(p[0] / 0.196, vy))
    p[2] += nose * NOSE_OUT * front
    p[1] -= nose * 0.022

    # An eye socket. The browser version sat the beads on an unbroken surface
    # and they read as buttons; a shallow dish under each one is what makes an
    # eye look set into a face.
    socket = lib.blob(math.hypot((abs(p[0]) - EYE_X) / 0.230, (p[1] - EYE_Y) / 0.185))
    p[2] -= socket * 0.052 * front

    return p


def body_axes(y):
    to_shoulder = lib.smoothstep(-1.04, -1.80, y)
    to_chest = lib.smoothstep(-1.75, -2.60, y)
    return (
        lib.mix(0.335, SHOULDER_HALF, to_shoulder ** 0.68) + 0.08 * to_chest,
        lib.mix(0.315, 0.520, to_shoulder ** 0.80) + 0.06 * to_chest,
    )


def build_head():
    obj = lib.sphere_cage(40, 26, lambda d: to_blender(head_surface((d.x, d.z, -d.y))))
    lib.subsurf(obj, 2)
    lib.relax(obj, 0.35, 1)
    lib.shaded_smooth(obj)
    obj.name = "head"
    return obj


def build_body():
    def shape(d):
        t = (d.z + 1) / 2
        y = lib.mix(-3.05, -0.62, t)
        a, c = body_axes(y)
        cap = math.sqrt(max(0.0, 1 - abs(d.z) ** 12))
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.6
        # Guarded: at the pole both components are zero and a zero base with a
        # negative exponent is a division by zero, not a large number.
        s = max(1e-9, (abs(ux) / a) ** k + (abs(uy) / c) ** k)
        r = s ** (-1 / k)
        return (ux * r * cap, uy * r * cap, y)

    obj = lib.sphere_cage(36, 30, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "body"
    return obj


def build_top():
    """The jumper. Solidify gives it a real wall, so the neckline and the hem
    are edges with thickness rather than a paper cut through a surface."""
    hem = -3.15
    cloth = 0.070

    def shape(d):
        t = (d.z + 1) / 2
        v = 1 - t
        y = lib.mix(NECKLINE_Y, hem, v ** 0.94)
        a, c = body_axes(y)
        roll = lib.smoothstep(0.055, 0.0, v)
        grow = cloth * (1 - 0.65 * roll)
        horiz = math.hypot(d.x, d.y) or 1e-5
        ux, uy = d.x / horiz, d.y / horiz
        k = 2.6
        s = max(1e-9, (abs(ux) / (a + grow)) ** k + (abs(uy) / (c + grow)) ** k)
        r = s ** (-1 / k)
        return (ux * r, uy * r, y)

    obj = lib.sphere_cage(44, 30, shape)
    lib.subsurf(obj, 2)
    lib.shaded_smooth(obj)
    obj.name = "top"
    return obj


def rim_angle(phi):
    """Polar angle of the hairline for an azimuth. High at the brow, low at the
    temple, and low enough behind that the scalp reaches the lengths — the first
    build stopped short and left bare skin showing at the back of the head."""
    front = math.cos(phi)
    side = abs(math.sin(phi))
    return math.pi * (
        0.455 - 0.115 * front + 0.190 * side * side + 0.260 * lib.smoothstep(0.2, -1, front)
    )


def build_scalp(lift=0.058):
    """A sheet whose rim is placed per direction, grown off the head's own
    surface so it cannot gape at the temple."""
    import bmesh

    mesh = bpy.data.meshes.new("scalp")
    obj = bpy.data.objects.new("scalp", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    u_steps, v_steps = 72, 26
    grid = []
    for j in range(v_steps + 1):
        row = []
        v = j / v_steps
        for i in range(u_steps):
            phi = (i / u_steps) * math.tau
            theta = (v ** 0.92) * rim_angle(phi)
            d = (
                math.sin(theta) * math.sin(phi),
                math.cos(theta),
                math.sin(theta) * math.cos(phi),
            )
            p = head_surface(d)
            thin = 1 - v ** 3.2
            bulk = lift * (
                0.55
                + 0.75 * lib.smoothstep(0.1, 0.9, math.cos(theta))
                + 0.35 * lib.smoothstep(0.3, -0.9, math.cos(phi))
            )
            q = [p[k] + d[k] * bulk * thin for k in range(3)]
            row.append(bm.verts.new(to_blender(q)))
        grid.append(row)
    for j in range(v_steps):
        for i in range(u_steps):
            n = (i + 1) % u_steps
            try:
                bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][n], grid[j][n]))
            except ValueError:
                pass
    bm.to_mesh(mesh)
    bm.free()
    solid = obj.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = 0.045
    solid.offset = -1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    lib.subsurf(obj, 1)
    lib.shaded_smooth(obj)
    obj.name = "scalp"
    return obj


# The long wave, as separate lengths over the scalp.
#
# The thickness numbers matter more than they look. At 0.26 of a unit these
# were thin enough to vanish edge-on and read as knife blades from the side;
# hair is a band, but a band with a body.
#
# A single continuous curtain was tried instead of this — one sheet from the
# parting, over the skull and down to the tips, solidified — on the theory that
# it would give unbroken flow. It gave a hood: the sheet's face opening is set
# by its own parametrisation and there is no way to open it wide enough without
# tearing the flow it was built for. Kept as a note, not as code.
LOCKS = [
    ("sweep_r", [(0.10, 0.92, 0.14), (0.50, 0.70, 0.34), (0.72, 0.14, 0.24), (0.76, -0.50, 0.06)],
     [0.30, 0.46, 0.44, 0.30], 0.62),
    ("sweep_l", [(-0.03, 0.95, 0.12), (-0.44, 0.76, 0.30), (-0.68, 0.22, 0.22), (-0.73, -0.42, 0.08)],
     [0.28, 0.43, 0.41, 0.28], 0.60),
    ("front_r", [(0.70, 0.12, 0.18), (0.86, -0.66, 0.30), (0.74, -1.52, 0.42), (0.88, -2.34, 0.30), (0.70, -3.05, 0.10)],
     [0.36, 0.52, 0.48, 0.30, 0.05], 0.66),
    ("front_l", [(-0.67, 0.16, 0.16), (-0.84, -0.60, 0.28), (-0.71, -1.46, 0.40), (-0.85, -2.28, 0.28), (-0.66, -2.98, 0.08)],
     [0.35, 0.50, 0.46, 0.29, 0.05], 0.64),
    ("side_r", [(0.66, 0.40, -0.28), (0.92, -0.58, -0.34), (1.00, -1.58, -0.24), (0.86, -2.62, -0.06)],
     [0.40, 0.58, 0.44, 0.08], 0.70),
    ("side_l", [(-0.64, 0.44, -0.30), (-0.90, -0.54, -0.36), (-0.98, -1.54, -0.26), (-0.82, -2.58, -0.08)],
     [0.39, 0.56, 0.43, 0.08], 0.68),
    ("back", [(0.0, 0.70, -0.58), (0.0, -0.26, -0.74), (0.06, -1.36, -0.66), (0.0, -2.50, -0.44)],
     [0.58, 0.80, 0.66, 0.24], 0.72),
]


def build():
    lib.reset()
    skin = lib.material("skin", (0.941, 0.722, 0.580), 0.72)
    hair_mat = lib.material("hair", (0.290, 0.220, 0.185), 0.52)
    cloth = lib.material("cloth", (0.135, 0.135, 0.165), 0.95)
    eye_mat = lib.material("eye", (0.168, 0.133, 0.125), 0.28)

    lib.assign(build_head(), skin)
    lib.assign(build_body(), skin)
    lib.assign(build_top(), cloth)
    lib.assign(build_scalp(), hair_mat)
    for name, path, widths, thick in LOCKS:
        obj = lib.ribbon(name, [to_blender(p) for p in path], widths, thick)
        obj.name = name
        lib.shaded_smooth(obj)
        lib.assign(obj, hair_mat)

    # Eyes and ears.
    for side, tag in ((-1, "l"), (1, "r")):
        a, c = axes_at(EYE_Y)
        rest = (abs(EYE_X) / a) ** SQUARENESS + (abs(EYE_Y) / 1.0) ** SQUARENESS
        z = 0.0 if rest >= 1 else c * (1 - rest) ** (1 / SQUARENESS)
        eye = lib.sphere_cage(20, 14, lambda d: to_blender((d.x * 0.098, d.z * 0.118, -d.y * 0.080)))
        lib.subsurf(eye, 2)
        lib.shaded_smooth(eye)
        eye.name = "eye_" + tag
        eye.location = to_blender((side * EYE_X, EYE_Y, z - 0.048))
        lib.assign(eye, eye_mat)

        ear = lib.sphere_cage(16, 12, lambda d: to_blender((d.x * 0.048, d.z * 0.148, -d.y * 0.100)))
        lib.subsurf(ear, 1)
        lib.shaded_smooth(ear)
        ear.name = "ear_" + tag
        ear.location = to_blender((side * (axes_at(0.0)[0] - 0.040), 0.005, -0.135))
        lib.assign(ear, skin)

    out = Path(__file__).resolve().parents[2] / "public" / "figure" / "character.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    lib.export(str(out))
    total = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
    print(f"BUILT {out} verts={total} bytes={out.stat().st_size}")


if __name__ == "__main__":
    build()
