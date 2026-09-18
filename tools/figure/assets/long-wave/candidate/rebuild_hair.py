"""Sculpt the candidate as one long-wave style.

Does not touch the protected original or public GLB.
Long-length checkpoint: git 8fbe93b. Previous sculpt: git 02230ce.

Form this pass must hold at once:
- Bang is a round diagonal pad from part to left temple, not a visor lip.
- Sides keep long length and one large S each; right ear can show.
- Back is two masses with a valley, not a column. Pieces overlap as one style.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path("/workspace/tools/figure")
sys.path.insert(0, str(ROOT))
import character  # noqa: E402
import lib  # noqa: E402

CANDIDATE = ROOT / "assets/long-wave/candidate"
BLEND = CANDIDATE / "hair_long_wave.blend"
Y_TIP = -3.12
R_MAX = 1.30


def _auth(co):
    return Vector((co.x, co.z, -co.y))


def _to_b(p):
    return Vector(character.to_blender((float(p[0]), float(p[1]), float(p[2]))))


def mix(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def on_head(x, y, z, clearance):
    r = math.sqrt(x * x + y * y + z * z) or 1.0
    p = character.head_surface((x / r, y / r, z / r))
    n = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
    return Vector((
        p[0] + p[0] / n * clearance,
        p[1] + p[1] / n * clearance,
        p[2] + p[2] / n * clearance,
    ))


def wrap_az(az):
    a = az % math.tau
    if a > math.pi:
        a -= math.tau
    return a


def finish(obj, sub=1, relax=0.18):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if sub:
        lib.subsurf(obj, sub)
    if relax:
        lib.relax(obj, relax, 3)
    lib.shaded_smooth(obj)
    obj.name = obj.data.name = obj.name
    return obj


def grid_shell(name, sample_outer, sample_inner, nu, nv, wrap_u=False):
    verts = []
    u_den = nu if wrap_u else (nu - 1)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / u_den
            verts.append(_to_b(sample_outer(u, v)))
    inner_off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / u_den
            verts.append(_to_b(sample_inner(u, v)))
    faces = []

    def quad(a, b, c, d):
        faces.append((a, b, c, d))

    u_faces = nu if wrap_u else (nu - 1)
    for j in range(nv - 1):
        for i in range(u_faces):
            i2 = (i + 1) % nu if wrap_u else (i + 1)
            a = j * nu + i
            a2 = j * nu + i2
            quad(a, a + nu, a2 + nu, a2)
            b = inner_off + a
            b2 = inner_off + a2
            quad(b2, b2 + nu, b + nu, b)
    for i in range(u_faces):
        i2 = (i + 1) % nu if wrap_u else (i + 1)
        a, b = i, i2
        quad(a, b, inner_off + b, inner_off + a)
        a = (nv - 1) * nu + i
        b = (nv - 1) * nu + i2
        quad(b, a, inner_off + a, inner_off + b)
    if not wrap_u:
        for j in range(nv - 1):
            a = j * nu
            c = a + nu
            quad(a, inner_off + a, inner_off + c, c)
            a = j * nu + (nu - 1)
            c = a + nu
            quad(a, c, inner_off + c, inner_off + a)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, sub=2, relax=0.16)


def bounds(obj):
    xs, ys, zs = [], [], []
    for v in obj.data.vertices:
        p = _auth(obj.matrix_world @ v.co)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def remove_hair():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("hair"):
            bpy.data.objects.remove(obj, do_unlink=True)


def find_head():
    for name in ("head", "cage"):
        if name in bpy.data.objects:
            obj = bpy.data.objects[name]
            ys = [_auth(obj.matrix_world @ v.co).y for v in obj.data.vertices]
            if ys and max(ys) > 0.4:
                return obj
    raise SystemExit("no head mesh")


def _bang_s(a):
    a0, a1 = 0.36, -1.78
    if a > a0 or a < a1:
        return 0.0
    return (a0 - a) / (a0 - a1)


def _bang_cover(s):
    if s <= 0.0:
        return 0.0
    if s < 0.78:
        return 1.0
    return mix(1.0, 0.58, smooth((s - 0.78) / 0.22))


def _bang_vol(s):
    """Convex pad: high at the part, peak on the left forehead, still present at temple."""
    mid = 0.34
    if s < mid:
        return mix(0.84, 1.0, smooth(s / mid))
    return mix(1.0, 0.46, smooth((s - mid) / (1.0 - mid)))


def _right_pad(a):
    a0, a1 = 0.20, 1.52
    if a < a0 or a > a1:
        return 0.0
    s = (a - a0) / (a1 - a0)
    mid = 0.28
    if s < mid:
        return mix(0.70, 0.92, smooth(s / mid))
    return mix(0.92, 0.0, smooth((s - mid) / (1.0 - mid)))


def build_top(head):
    """Crown and bang are one surface: wide diagonal pad, thin fringe, no visor lip."""

    def sample(u, v, outer):
        az = math.pi + u * math.tau
        a = wrap_az(az)
        backness = 0.5 - 0.5 * math.cos(az)
        s = _bang_s(a)
        cover = _bang_cover(s)
        vol = _bang_vol(s)
        right = _right_pad(a)
        face = max(cover * vol, right)

        # Bang polar covers the forehead as an area, not a rim. Back polar
        # reaches the hang roots so the cap is not a skull lid.
        polar_bang = mix(1.08, 1.56, smooth(s))
        polar_rim = mix(0.62, 1.22, backness)
        polar_rim = mix(polar_rim, polar_bang, cover)
        polar_rim += 0.22 * right
        polar = mix(0.050, polar_rim, v ** (0.50 if cover > 0.04 else 0.78))

        along = math.sin(v * math.pi)
        crown_thick = 0.145
        pad = 0.14 + 0.18 * face * along
        fringe = smooth((v - 0.62) / 0.38) if v > 0.62 else 0.0
        pad = mix(pad, 0.030, fringe * max(cover, right * 0.6))
        thick = mix(crown_thick, pad, face)
        inner = min(thick * 0.38, thick - 0.026)
        inner = max(0.022, inner)
        clr = thick if outer else inner
        # Only the fringe sits on the skull. The pad middle stays a convex volume.
        sit = mix(1.0, 0.18, cover * fringe)
        clr *= sit
        part = math.exp(-(a - 0.30) ** 2 / 0.16) * (1.0 - 0.50 * v)
        clr -= 0.012 * part * (1.0 if outer else 0.30)
        p = on_head(
            math.sin(polar) * math.sin(az),
            math.cos(polar),
            math.sin(polar) * math.cos(az),
            max(0.028, clr),
        )
        drop = cover * v * mix(0.04, 0.12, s)
        wrap = cover * v * s
        p = Vector((
            p.x - 0.10 * wrap,
            p.y - drop,
            p.z - 0.06 * wrap,
        ))
        return p

    return grid_shell(
        "hair_top",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=32,
        nv=18,
        wrap_u=True,
    )


def _hang_sample(u, v, outer, az0, az1, phase, sx, ear_show, valley):
    """One hanging clay mass. u across the mass, v along length."""
    tip = smooth(max(0.0, (v - 0.74) / 0.26))
    uu = mix(u, 0.5, tip * 0.32)
    side_u = abs(uu - 0.5) * 2.0
    mid_u = 1.0 - side_u

    if ear_show:
        # Root stays behind the ear; the hanging length comes forward.
        az_f = mix(az0 + 0.38, az0 - 0.18, smooth(v))
        az_b = az1
    else:
        az_f, az_b = az0, az1
    az_root = mix(az_f, az_b, uu)

    if valley:
        v_leave = mix(0.22, 0.34, mid_u)
        polar0 = mix(0.32, 0.16, mid_u)
        polar1 = mix(1.20, 1.32, side_u)
    else:
        v_leave = mix(0.20, 0.30, uu)
        polar0 = mix(0.88 if ear_show else 1.18, 0.42, uu)
        polar1 = mix(1.22, 1.28, uu)

    thick = mix(0.30, 0.14, smooth(max(0.0, (v - 0.48) / 0.52)))
    if valley:
        thick *= mix(0.72, 1.0, side_u)
    clr = thick if outer else max(0.040, thick * 0.38)

    tv_head = min(1.0, v / max(1e-6, v_leave))
    if v < v_leave and not valley:
        # Side roots sit under the cap so they are not a separate strap.
        clr *= mix(0.50, 1.0, tv_head)
    polar = mix(polar0, polar1, smooth(tv_head))
    head_p = on_head(
        math.sin(polar) * math.sin(az_root),
        math.cos(polar),
        math.sin(polar) * math.cos(az_root),
        clr,
    )
    if v <= v_leave:
        return head_p

    t = (v - v_leave) / (1.0 - v_leave)
    wave = math.sin(t * math.tau * 0.92 + phase)
    depth = math.cos(t * math.tau * 0.92 + phase)
    # Wave out along the side, not across the face.
    az = az_root + (0.16 * sx) * wave * mix(1.0, 0.35, uu)

    y = mix(head_p.y, Y_TIP, t)
    r0 = math.hypot(head_p.x, head_p.z)
    if valley:
        r_side = r0 + 0.03 + 0.10 * wave
        r_mid = mix(r0 * 0.94, 0.84, smooth(min(1.0, t * 1.05)))
        r = mix(r_side, r_mid, mid_u ** 1.05)
    else:
        r = r0 + 0.05 * math.sin(t * math.pi) + 0.14 * wave * mix(1.0, 0.40, uu)
    r = clamp(r, 0.62, R_MAX)
    if not outer:
        r = max(0.38, r - thick)

    x = r * math.sin(az)
    z = r * math.cos(az)
    x += 0.16 * sx * wave * mix(1.0, 0.28, uu if not valley else side_u)
    z += 0.10 * depth * mix(0.45, 1.0, 1.0 - uu if not valley else side_u)
    return Vector((x, y, z))


def build_left():
    """Viewer's left: covers the ear, overlaps the bang, one large S."""

    def sample(u, v, outer):
        return _hang_sample(u, v, outer, -0.78, -2.36, 0.32, -1.0, False, False)

    return grid_shell(
        "hair_left",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=14,
        nv=24,
    )


def build_right():
    """Viewer's right: root behind the ear, large S beside the face."""

    def sample(u, v, outer):
        return _hang_sample(u, v, outer, 0.82, 2.36, 0.28, 1.0, True, False)

    return grid_shell(
        "hair_right",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=14,
        nv=24,
    )


def build_back():
    """Crown-to-length back: valley down the middle, sides join the locks."""

    def sample(u, v, outer):
        az0 = math.pi - 1.32
        az1 = math.pi + 1.32
        return _hang_sample(u, v, outer, az0, az1, 1.05, 1.0, False, True)

    return grid_shell(
        "hair_back",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=16,
        nv=22,
    )


def main():
    head = find_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [build_top(head), build_left(), build_right(), build_back()]
    for obj in pieces:
        lib.assign(obj, hair_mat)
        b = bounds(obj)
        print(
            "piece",
            obj.name,
            "verts",
            len(obj.data.vertices),
            "x",
            f"{b[0]:.2f}:{b[1]:.2f}",
            "y",
            f"{b[2]:.2f}:{b[3]:.2f}",
            "z",
            f"{b[4]:.2f}:{b[5]:.2f}",
        )
    xs, ys, zs = [], [], []
    for obj in pieces:
        b = bounds(obj)
        xs += [b[0], b[1]]
        ys += [b[2], b[3]]
        zs += [b[4], b[5]]
    print(
        "HAIR_AABB",
        "x",
        f"{min(xs):.2f}:{max(xs):.2f}",
        "y",
        f"{min(ys):.2f}:{max(ys):.2f}",
        "z",
        f"{min(zs):.2f}:{max(zs):.2f}",
    )
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND, "pieces", len(pieces))


if __name__ == "__main__":
    main()
