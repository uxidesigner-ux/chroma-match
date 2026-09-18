"""Sculpt the candidate from the long-wave turnaround sheet.

Does not touch the protected original or public GLB.

Whole bust: a slightly oval clay skull with ears stuck on, and abundant
hair sitting up on that skull — not extra pieces strapped onto a bowling
ball. Open scalp piles in +Y (not a radial mushroom). Bang drapes on the
forehead. Sides tuck behind the ears, then hang in S. No voxel fuse.
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
Y_TIP = -2.88
PART_X = 0.19


def _auth(co):
    return Vector((co.x, co.z, -co.y))


def mix(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def on_head(x, y, z, clearance):
    r = math.sqrt(x * x + y * y + z * z) or 1.0
    p = character.head_surface((x / r, y / r, z / r))
    n = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
    return Vector((
        p[0] + p[0] / n * clearance,
        p[1] + p[1] / n * clearance,
        p[2] + p[2] / n * clearance,
    ))


def sit(x, y, z, clearance):
    p = on_head(x, y, z, clearance)
    return (p.x, p.y, p.z)


def finish(obj, sub=1, relax=0.16):
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
        lib.relax(obj, relax, 2)
    lib.shaded_smooth(obj)
    obj.name = obj.data.name = obj.name
    return obj


def grid_shell(name, sample_outer, sample_inner, nu, nv):
    verts = []
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(Vector(character.to_blender(tuple(sample_outer(u, v)))))
    inner_off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            u = i / (nu - 1)
            verts.append(Vector(character.to_blender(tuple(sample_inner(u, v)))))
    faces = []

    def quad(a, b, c, d):
        faces.append((a, b, c, d))

    for j in range(nv - 1):
        for i in range(nu - 1):
            a = j * nu + i
            quad(a, a + nu, a + nu + 1, a + 1)
            b = inner_off + a
            quad(b + 1, b + nu + 1, b + nu, b)
    for i in range(nu - 1):
        a, b = i, i + 1
        quad(a, b, inner_off + b, inner_off + a)
        a = (nv - 1) * nu + i
        b = a + 1
        quad(b, a, inner_off + a, inner_off + b)
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


def lock(name, path, widths, flatten=0.58, tilt=0.06, resolution=18):
    obj = lib.ribbon(
        name,
        [character.to_blender(p) for p in path],
        widths,
        flatten=flatten,
        tilt=tilt,
        resolution=resolution,
    )
    obj.name = obj.data.name = name
    lib.relax(obj, 0.18, 2)
    lib.shaded_smooth(obj)
    return obj


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


def replace_head():
    """Put the current oval skull (character.py) into the candidate blend."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    skin = bpy.data.materials.get("skin")
    if skin is None:
        skin = lib.material("skin", (0.945, 0.710, 0.560), 0.80)
    eye_mat = bpy.data.materials.get("eye")
    if eye_mat is None:
        eye_mat = lib.material("eye", (0.145, 0.118, 0.110), 0.55)
    pearl_mat = bpy.data.materials.get("pearl")
    if pearl_mat is None:
        pearl_mat = lib.material("pearl", (0.93, 0.90, 0.86), 0.28)
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        n = obj.name
        if n in ("head", "cage", "nose") or n.startswith(("eye_", "ear_", "pearl_")):
            bpy.data.objects.remove(obj, do_unlink=True)
    head = character.build_head()
    lib.assign(head, skin)
    character.build_face_parts(head, skin, eye_mat, pearl_mat)
    return head


def _smooth_rim(obj, rounds=8, factor=0.55):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for _ in range(rounds):
        boundary = [v for v in bm.verts if v.is_boundary]
        stored = {v: v.co.copy() for v in boundary}
        for vertex in boundary:
            linked = [
                e.other_vert(vertex)
                for e in vertex.link_edges
                if e.other_vert(vertex).is_boundary
            ]
            if not linked:
                continue
            acc = stored[vertex].copy()
            for other in linked:
                acc += stored[other]
            vertex.co = acc / (1 + len(linked))
            vertex.co = vertex.co.lerp(stored[vertex], 1.0 - factor)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


# ---------------------------------------------------------------------------
# Bang lower edge: side part on the crown -> across the forehead -> left ear top.
BANG_EDGE = [(0.19, 0.62), (0.00, 0.14), (-0.42, -0.02), (-0.78, -0.10)]
# Exposed forehead to the right of the part, down to the right ear.
HAIRLINE_R = [(0.19, 0.68), (0.40, 0.48), (0.60, 0.20), (0.78, -0.08), (1.00, -0.32)]


def table(pts, x):
    """Piecewise-linear lookup on (key, value) pairs sorted by key (either way)."""
    if pts[0][0] > pts[-1][0]:
        pts = list(reversed(pts))
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return mix(y0, y1, (x - x0) / (x1 - x0) if x1 > x0 else 0.0)
    return pts[-1][1]


def polyline(pts, t):
    """Point at parameter t in [0,1] along a polyline, equal parameter per segment."""
    n = len(pts) - 1
    s = min(max(t, 0.0), 1.0) * n
    i = min(int(s), n - 1)
    f = s - i
    (x0, y0), (x1, y1) = pts[i], pts[i + 1]
    return (mix(x0, x1, f), mix(y0, y1, f))


def hairline(x):
    if x >= PART_X:
        return table(HAIRLINE_R, x)
    return table(BANG_EDGE, x)


def skull_front(x, y):
    return character.front_surface_z(x, y)


def skull_normal(x, y, z):
    hw = character.half_width(y) or 1e-6
    hz = character.half_depth(y, z > 0) or 1e-6
    n = Vector((x / (hw * hw), 0.0, z / (hz * hz)))
    if n.length < 1e-6:
        return Vector((0.0, 1.0, 0.0))
    return n.normalized()


def tube(name, rows, nu=20):
    """Closed tube: rows of (centre Vector, a, b, ridge_phase). Ends fanned shut."""
    verts, faces = [], []
    for c, a, b, ph in rows:
        for i in range(nu):
            th = i / nu * math.tau
            r = 1.0 + 0.06 * math.cos(3.0 * th + ph)
            p = (c.x + a * r * math.cos(th), c.y, c.z + b * r * math.sin(th))
            verts.append(Vector(character.to_blender(p)))
    nv = len(rows)
    for j in range(nv - 1):
        for i in range(nu):
            a0 = j * nu + i
            a1 = j * nu + (i + 1) % nu
            faces.append((a0, a1, a1 + nu, a0 + nu))
    top = len(verts)
    verts.append(Vector(character.to_blender((rows[0][0].x, rows[0][0].y, rows[0][0].z))))
    bot = len(verts)
    verts.append(Vector(character.to_blender((rows[-1][0].x, rows[-1][0].y, rows[-1][0].z))))
    for i in range(nu):
        faces.append((top, (i + 1) % nu, i))
        base = (nv - 1) * nu
        faces.append((bot, base + i, base + (i + 1) % nu))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, sub=1, relax=0.22)


def cap_shell(name, outer, inner, nu, nv):
    """Closed shell over the top of the head: rings wrap in u, top fanned shut,
    bottom rim joins outer to inner. `outer/inner(u, v)` return authoring points."""
    verts, faces = [], []
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            verts.append(Vector(character.to_blender(tuple(outer(i / nu, v)))))
    off = len(verts)
    for j in range(nv):
        v = j / (nv - 1)
        for i in range(nu):
            verts.append(Vector(character.to_blender(tuple(inner(i / nu, v)))))
    top_o = len(verts)
    verts.append(Vector(character.to_blender(tuple(outer(0.0, -1.0)))))
    top_i = len(verts)
    verts.append(Vector(character.to_blender(tuple(inner(0.0, -1.0)))))
    for j in range(nv - 1):
        for i in range(nu):
            a0 = j * nu + i
            a1 = j * nu + (i + 1) % nu
            faces.append((a0, a1, a1 + nu, a0 + nu))
            b0, b1 = off + a0, off + a1
            faces.append((b0 + nu, b1 + nu, b1, b0))
    for i in range(nu):
        faces.append((top_o, (i + 1) % nu, i))
        faces.append((top_i, off + i, off + (i + 1) % nu))
        a0 = (nv - 1) * nu + i
        a1 = (nv - 1) * nu + (i + 1) % nu
        faces.append((a1, a0, off + a0, off + a1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, sub=2, relax=0.18)


DOME_C = Vector((0.0, 0.10, -0.12))
DOME_AX, DOME_AY, DOME_AZ = 1.08, 1.32, 1.42


def cap_point(da):
    """Cap outer surface for an authoring direction. One clay mass: the crown
    dome (hair top at y=1.24 like the sheet), a swell running from the part
    diagonally across the forehead to the left ear top (the bang), extra depth
    at the upper back, and lobes converging on a whorl at the part."""
    p = character.head_surface(da)
    r = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
    up = max(0.0, p[1])
    wrap = 0.10
    pile = 0.28 * smooth(up)
    horiz = math.hypot(p[0], p[2])
    spread = 0.22 * (up ** 1.6)
    if horiz > 0.08:
        ox, oz = p[0] / horiz, p[2] / horiz
        sx = ox * spread
        sz = oz * spread * 0.5
    else:
        ox, oz = da[0], da[2]
        sx = da[0] * spread * 2.0
        sz = da[2] * spread * 1.1
    part = math.exp(-((p[0] - PART_X) ** 2) / 0.10) * (up ** 1.2)
    pile -= 0.04 * part * max(0.0, p[2] + 0.2)

    # Lobes radiating from the whorl at the part (sheet top view).
    ang = math.atan2(p[2] - 0.12, p[0] - PART_X)
    dist = math.hypot(p[2] - 0.12, p[0] - PART_X)
    lobes = math.cos(ang * 7.0) * 0.5 + 0.5
    lobe_amp = 0.034 * smooth(up / 0.5) * smooth(dist / 0.25)
    pile += lobe_amp * lobes

    # Upper-back depth: the sheet's side view has the mass standing well
    # behind the skull at crown height.
    back_swell = 0.14 * smooth(-p[2] / 0.55) * smooth((p[1] + 0.25) / 0.85) * (1.0 - smooth((p[1] - 0.75) / 0.3))
    sx += ox * back_swell * 0.6
    sz += oz * back_swell

    # Bang swell: left of the part, on the front, thickest mid-way between the
    # hairline edge and the crown, thinning to a clay lip at the edge.
    bang = 0.0
    if p[0] < PART_X + 0.10 and p[2] > -0.15:
        edge = hairline(min(p[0], PART_X - 0.001))
        d = p[1] - edge
        if 0.0 <= d <= 1.0:
            prof = math.sin(math.pi * min(1.0, d / 1.0)) ** 0.9
            fade_part = smooth((PART_X + 0.10 - p[0]) / 0.25)
            fade_front = smooth((p[2] + 0.15) / 0.35)
            bang = 0.24 * prof * fade_part * fade_front
    n = skull_normal(p[0], p[1], p[2])
    q = Vector((
        p[0] + p[0] / r * wrap + sx + n.x * bang,
        p[1] + p[1] / r * wrap + pile + n.y * bang,
        p[2] + p[2] / r * wrap * 0.6 + sz + n.z * bang,
    ))
    # Crown + upper-back volume measured off the sheet's side view: the hair
    # top sits ~1.42 up and the mass stands ~1.5 units behind the skull centre
    # at ear height. Anything inside that egg is pushed out to it (back and
    # top only; the bang and hairline keep their own shape).
    rel = q - DOME_C
    f = math.sqrt((rel.x / DOME_AX) ** 2 + (rel.y / DOME_AY) ** 2 + (rel.z / DOME_AZ) ** 2)
    if f < 1.0:
        w = smooth((0.45 - p[2]) / 0.60) * smooth((p[1] + 0.45) / 0.50)
        target = DOME_C + rel / f
        q = q.lerp(target, w)
        q += rel.normalized() * (lobe_amp * lobes * w)
    return (q.x, q.y, q.z)


def _dir(az, y):
    y = max(-0.985, min(0.985, y))
    hh = math.sqrt(max(0.0, 1.0 - y * y))
    return (math.sin(az) * hh, y, math.cos(az) * hh)


def cap_boundary(az):
    """Lower latitude of the cap at azimuth az (0 = front). Front follows the
    measured hairline (raised under the bang); sides and back stop at y=-0.30."""
    wrapped = (az + math.pi) % math.tau - math.pi
    y = 0.4
    for _ in range(8):
        p = character.head_surface(_dir(wrapped, y))
        # Left of the part the rim is the bang's lower edge itself: crown and
        # bang are one piece of clay.
        lim = hairline(p[0])
        y = 0.5 * y + 0.5 * lim
    back = smooth((abs(wrapped) - 1.35) / 0.55)
    return mix(y, -0.30, back)


def build_scalp():
    """Cap on the egg skull whose front rim is the measured hairline."""

    def outer(u, v):
        az = u * math.tau
        if v < 0:
            return cap_point((0.0, 1.0, 0.0))
        y = mix(0.985, cap_boundary(az), v ** 0.9)
        return cap_point(_dir(az, y))

    def inner(u, v):
        az = u * math.tau
        if v < 0:
            p = character.head_surface((0.0, 1.0, 0.0))
            return (p[0], p[1] + 0.01, p[2])
        y = mix(0.985, cap_boundary(az), v ** 0.9)
        p = character.head_surface(_dir(az, y))
        r = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
        return (p[0] + p[0] / r * 0.01, p[1] + p[1] / r * 0.01, p[2] + p[2] / r * 0.01)

    return cap_shell("hair_scalp", outer, inner, nu=56, nv=18)


# Side + back mass measured off the sheet's back and side panels (84.6 px per
# head unit): x half-width A, z half-depth B, and section centre CZ by height.
CURTAIN = [
    #   y      A      B      CZ
    (1.00, 0.60, 1.10, -0.10),
    (0.60, 0.92, 1.22, -0.16),
    (0.10, 1.16, 1.30, -0.28),
    (-0.50, 1.40, 1.12, -0.45),
    (-1.00, 1.32, 1.05, -0.58),
    (-1.50, 1.46, 0.96, -0.55),
    (-2.00, 1.64, 0.90, -0.45),
    (-2.50, 1.62, 0.82, -0.36),
    (-2.95, 1.25, 0.55, -0.30),
]


def curtain_at(y):
    A = table([(r[0], r[1]) for r in CURTAIN], y)
    B = table([(r[0], r[2]) for r in CURTAIN], y)
    CZ = table([(r[0], r[3]) for r in CURTAIN], y)
    return A, B, CZ


def build_curtain():
    """옆/뒤머리 as one clay curtain: a partial ring around the head and neck
    from behind one ear, around the back, to behind the other ear. Ridges run
    down it in phase (the sheet's S-waves) and separate into tapered lock
    ends at the bottom. Top is buried under the cap."""
    y_top, y_tip = 1.00, -2.95
    n_ridge = 11.0          # ~6 ridges across the back half
    period = 1.15           # S-wave wavelength in head units (sheet: ~3 waves over the length)
    z_front_ear = -0.24     # front edge stays behind the ear at ear height

    def front_angle(y, B, CZ):
        # Forward wrap: behind the ear at head height, over the shoulder below.
        z_front = table([(0.4, -0.34), (-0.4, -0.32), (-1.0, -0.30), (-1.45, -0.28), (-1.85, 0.06), (-2.4, 0.22), (-2.95, 0.30)], y)
        s = max(-0.95, min(0.95, (z_front - CZ) / B))
        return math.pi / 2 + math.asin(s)

    def wave(y):
        return math.sin(math.tau * (y + 0.40) / period) * smooth((0.30 - y) / 0.80)

    def sway(y):
        # Ridge lines drift about a third of a ridge spacing: long smooth S
        # curves, not chevrons.
        return 0.10 * wave(y)

    def sample(u, v, outer):
        y0 = mix(y_top, y_tip, v ** 0.95)
        A, B, CZ = curtain_at(y0)
        az_max = front_angle(y0, B, CZ)
        az = mix(-az_max, az_max, u)
        side_full = 1.0 + 0.04 * (-math.copysign(1.0, az) if abs(az) > 1e-6 else 0.0)
        A *= side_full
        ph = n_ridge * (az - sway(y0))
        ridge = math.cos(ph)
        tip = smooth((y0 - y_tip) / 0.70)          # 0 at the tip, 1 above
        amp = mix(0.10, 0.035, tip)
        # Lock ends: between ridges the tip is higher (scalloped hem) and
        # every lock thins to a point.
        scallop = (0.5 - 0.5 * ridge) * 0.30 * (1.0 - tip)
        y = y0 + scallop
        taper = mix(0.25, 1.0, smooth((y0 - y_tip) / 0.55))
        top_fade = mix(0.55, 1.0, smooth((y_top - y0) / 0.40))
        base_scale = taper * top_fade
        thick = mix(0.06, mix(0.28, 0.40, smooth((0.5 - y0) / 1.2)), tip) * taper
        r_out = 1.0 + amp * ridge
        rx, rz = A * r_out * base_scale, B * r_out * base_scale
        if not outer:
            rx = max(0.05, rx - thick)
            rz = max(0.05, rz - thick)
        x = rx * math.sin(az) + 0.10 * wave(y0)
        z = CZ - rz * math.cos(az)
        pt = Vector((x, y, z))
        # Near the top the curtain lies flush on the cap so the crown dome
        # flows into the ridges instead of sitting on them as a helmet rim.
        merge = smooth((y0 - 0.05) / 0.75)
        if merge > 0.0:
            lat = max(-0.30, min(0.98, y0))
            cap = cap_point(_dir(math.pi - az, lat))
            if outer:
                cap_pt = Vector((cap[0], cap[1], cap[2]))
                n = Vector((cap[0], 0.0, cap[2]))
                if n.length > 1e-6:
                    cap_pt += n.normalized() * 0.012
            else:
                sk = character.head_surface(_dir(math.pi - az, lat))
                cap_pt = Vector((sk[0] * 1.02, sk[1], sk[2] * 1.02))
            pt = pt.lerp(cap_pt, merge)
            if outer:
                # Keep the ridges running up over the dome to the crown
                # (sheet back view: locks flow from the whorl, no shelf).
                n = Vector((pt.x, 0.0, pt.z - CZ))
                if n.length > 1e-6:
                    pt += n.normalized() * (0.045 * merge * ridge * smooth((1.05 - y0) / 0.25))
        return pt

    return grid_shell(
        "hair_curtain",
        lambda u, v: sample(u, v, True),
        lambda u, v: sample(u, v, False),
        nu=64,
        nv=34,
    )


def build_front_lock(side):
    """Sheet "front layer": a thin, flat strand that leaves the bundle behind
    the ear, runs down beside the jaw in front of the shoulder, and tapers
    over the chest. Same wave phase as the bundle so the two read as one."""
    s = -1 if side < 0 else 1
    name = "hair_front_l" if s < 0 else "hair_front_r"
    rows = []
    nv = 30
    y_top, y_tip = -1.55, -2.55
    for j in range(nv):
        v = j / (nv - 1)
        y = mix(y_top, y_tip, v)
        skull = character.half_width(y) if y > -0.95 else 0.0
        cx = table([(-1.55, 0.95), (-1.90, 1.00), (-2.55, 1.10)], y)
        cz = table([(-1.55, 0.08), (-1.90, 0.20), (-2.55, 0.28)], y)
        a = table([(-1.55, 0.20), (-2.20, 0.16), (-2.55, 0.04)], y)
        b = table([(-1.55, 0.26), (-2.20, 0.22), (-2.55, 0.04)], y)
        top = smooth((y_top - y) / 0.30)
        a *= mix(0.4, 1.0, top)
        amp = 0.08 * smooth((-0.6 - y) / 0.6)
        ph = math.tau * (y + 0.40) / 0.85
        # Below the collar the strand lies on the knit over the chest, its back
        # half sunk into the cloth so it reads as resting, not hovering.
        rest = smooth((-1.55 - y) / 0.30)
        if rest > 0.0:
            b_here = table([(-1.55, 0.26), (-2.20, 0.22), (-2.55, 0.04)], y)
            cz = mix(cz, character.torso_front_z(cx, y) + 0.35 * b_here, rest)
        rows.append((Vector((s * (cx + amp * math.sin(ph)), y, cz + 0.5 * amp * math.cos(ph))), a, b, 1.5 * y))
    return tube(name, rows, nu=18)


def main():
    replace_head()
    remove_hair()
    hair_mat = bpy.data.materials.get("hair")
    if hair_mat is None:
        hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    pieces = [build_scalp(), build_curtain(), build_front_lock(-1), build_front_lock(1)]
    for obj in pieces:
        lib.assign(obj, hair_mat)
        b = bounds(obj)
        print(
            "piece", obj.name, "verts", len(obj.data.vertices),
            "x", f"{b[0]:.2f}:{b[1]:.2f}", "y", f"{b[2]:.2f}:{b[3]:.2f}", "z", f"{b[4]:.2f}:{b[5]:.2f}",
        )
    xs, ys, zs = [], [], []
    for obj in pieces:
        b = bounds(obj)
        xs += [b[0], b[1]]
        ys += [b[2], b[3]]
        zs += [b[4], b[5]]
    print(
        "HAIR_AABB", "x", f"{min(xs):.2f}:{max(xs):.2f}",
        "y", f"{min(ys):.2f}:{max(ys):.2f}", "z", f"{min(zs):.2f}:{max(zs):.2f}",
        "pieces", len(pieces),
    )
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SAVED", BLEND, "pieces", len(pieces))


if __name__ == "__main__":
    main()
