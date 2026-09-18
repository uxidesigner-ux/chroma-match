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
    """Polar angle of the crown patch for an azimuth. This is no longer a
    hairline — the bands carry the hairline now — it only has to reach far
    enough to close the gaps between them at the top."""
    front = math.cos(phi)
    side = abs(math.sin(phi))
    # Stops well above the temple. It used to reach the hairline, which put its
    # rim within a voxel or two of the seated inner face of every side band —
    # two nearly-coincident surfaces, which a voxel remesh resolves as a row of
    # jagged ridges rather than as one skin. Widening the gap made it worse and
    # coarsening the grid made it worse again; removing one of the two surfaces
    # is what actually fixes it. The bands cover the sides anyway.
    return math.pi * (0.250 - 0.045 * front + 0.075 * side * side + 0.130 * lib.smoothstep(0.2, -1, front))


def build_crown(lift=0.175):
    """A small patch over the crown, to close between the bands.

    Not a scalp. The previous one was a full cap cut at a hairline, and a cap is
    what read as a swimming hat; this only exists where bands cross each other
    at the top and would otherwise show skin between them."""
    import bmesh

    mesh = bpy.data.meshes.new("crown")
    obj = bpy.data.objects.new("crown", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    u_steps, v_steps = 64, 20
    grid = []
    for j in range(v_steps + 1):
        row = []
        v = j / v_steps
        for i in range(u_steps):
            phi = (i / u_steps) * math.tau
            theta = (v ** 0.92) * rim_angle(phi)
            d = (math.sin(theta) * math.sin(phi), math.cos(theta), math.sin(theta) * math.cos(phi))
            p = head_surface(d)
            # Full lift at the apex, thinning to nothing at the rim. The
            # bands arc above the skull near the parting, so a patch that only
            # skims it leaves a wedge of scalp showing between the two — the
            # notch at the top of the head.
            thin = (1 - v ** 2.2) ** 0.75
            q = [p[k] + d[k] * lift * thin for k in range(3)]
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
    # Thick enough to survive a voxel remesh. A sheet that feathers to nothing
    # at its rim has no volume for the voxels to find, and what comes back is a
    # ragged edge — which showed as a row of jagged bumps along the temple.
    solid = obj.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = 0.085
    solid.offset = -1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    lib.subsurf(obj, 1)
    lib.shaded_smooth(obj)
    obj.name = "crown"
    return obj


# The bands, one per designed flow.
#
# The paths are the flows measured and designed in flows.py; the numbers added
# here are half width down the length, how flat the section is, and how the
# section is rolled about the curve so the band lies against the head rather
# than edge-on to it.
#
# Widths are chosen against the measurement: the reference is 3.14 head units
# across at its widest, the flows reach about x = +-1.30, so a band half width
# near 0.30 puts the outline where the reference has it.
# The taper value multiplies a profile of radius 0.5, so the band's half width
# is half the number written here. The first set was authored as if the number
# were the half width and every band came out at half the intended size: seven
# straps with skull showing between them instead of one mass.
BANDS = [
    ("band_sweep",   "sweep_across",   [0.40, 0.80, 0.92, 0.84, 0.62, 0.30], 0.40, 1.57),
    ("band_sweep_2", "sweep_across_2", [0.44, 0.84, 0.96, 0.86, 0.64, 0.30], 0.40, 1.57),
    ("band_short",   "sweep_short",    [0.36, 0.72, 0.84, 0.76, 0.56, 0.28], 0.40, 1.57),
    ("band_short_2", "sweep_short_2",  [0.40, 0.76, 0.88, 0.80, 0.58, 0.28], 0.40, 1.57),
    ("band_bk_l",    "back_left",      [0.60, 1.02, 1.12, 0.98, 0.70, 0.22], 0.46, 1.57),
    ("band_bk_r",    "back_right",     [0.60, 1.02, 1.12, 0.98, 0.70, 0.22], 0.46, 1.57),
    # The centre of the back carries the widest band: the nape is where three
    # flows have to meet, and a narrow one there leaves a wedge of neck showing
    # between the other two.
    ("band_bk_c",    "back_centre",    [0.84, 1.34, 1.44, 1.24, 0.86, 0.26], 0.50, 1.57),
    ("band_side_l",  "side_left",      [0.66, 1.10, 1.20, 1.04, 0.74, 0.30], 0.48, 1.57),
    ("band_side_r",  "side_right",     [0.66, 1.10, 1.20, 1.04, 0.74, 0.30], 0.48, 1.57),
]


def seat_on_skull(obj, clearance=0.045, hold=0.62, fade=0.20):
    """Push every vertex near the head out onto the skull's own surface.

    The bands are swept along curves, and a swept section has no idea the head
    is there: near the parting the section is wide enough that half of it ends
    up inside the skull and the other half arcs off it, which is the gap that
    made the crown read as a separate cap sitting under floating straps. This
    is not a matter of moving the curve — the curve is a centre line and the
    problem is at the edges of the section.

    So the roots are seated. For a vertex, take its direction from the head
    centre, ask the head where its surface is in that direction, and if the
    vertex is inside that surface plus a clearance, move it out to it. It only
    applies where the band is still on the head: full effect within `hold` of
    the head centre, fading out over `fade` so the lengths hang free.
    """
    from mathutils import Vector

    for vertex in obj.data.vertices:
        p = vertex.co
        # Back to the authoring frame: Blender (x, -front, up) -> (x, up, front)
        q = (p.x, p.z, -p.y)
        radius = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)
        if radius < 1e-6:
            continue
        near = 1.0 - lib.smoothstep(hold, hold + fade, radius)
        if near <= 0.0:
            continue
        d = (q[0] / radius, q[1] / radius, q[2] / radius)
        surface = head_surface(d)
        reach = math.sqrt(surface[0] ** 2 + surface[1] ** 2 + surface[2] ** 2) + clearance
        if radius >= reach:
            continue
        scale = 1.0 + near * (reach / radius - 1.0)
        vertex.co = Vector((p.x * scale, p.y * scale, p.z * scale))
    obj.data.update()
    return obj


def build_bands():
    """The bands, seated on the skull and then fused into one surface.

    They are authored as separate swept solids because that is how a flow is
    described, but they must not stay separate. Two solids that pass through
    each other keep both their edges, and those edges are exactly the three
    faults left over: lengths that read as slabs rather than one mass, a step
    in the outline wherever two bands cross, and a gap at the crown that looks
    like damage rather than a parting.

    So they are joined and remeshed. What comes back is the surface of their
    union: one skin where they overlap, and a real valley where they are
    actually apart — which is what keeps the parting and the divisions between
    the masses. The crown patch goes in too, so the scalp is part of the same
    skin instead of a separate cap under it.
    """
    from flows import FLOWS

    paths = {name: path for name, _certain, path in FLOWS}
    pieces = [build_crown()]
    for i, (name, flow, widths, flatten, tilt) in enumerate(BANDS):
        obj = lib.ribbon(name, [to_blender(p) for p in paths[flow]], widths,
                         flatten=flatten, tilt=tilt)
        obj.name = name
        # A different height for each band. Seating them all at one clearance
        # stacks their inner faces exactly on top of each other over the
        # temple, and a voxel grid cannot resolve coincident surfaces: it
        # returns a row of jagged ridges. Widening the single gap made that
        # worse, coarsening the grid made it worse again, and removing the
        # crown patch from the temple barely touched it — because the pair that
        # coincides is two bands, not a band and the patch. Staggering them by
        # more than a voxel each is what separates the pair.
        seat_on_skull(obj, clearance=0.030 + 0.026 * (i % 4))
        pieces.append(obj)

    merged = lib.join(pieces, "hair")
    lib.fuse(merged, voxel=0.022)
    lib.relax(merged, 0.42, 4)
    lib.shaded_smooth(merged)
    return [merged]


def build():
    lib.reset()
    skin = lib.material("skin", (0.941, 0.722, 0.580), 0.72)
    hair_mat = lib.material("hair", (0.290, 0.220, 0.185), 0.52)
    cloth = lib.material("cloth", (0.135, 0.135, 0.165), 0.95)
    eye_mat = lib.material("eye", (0.168, 0.133, 0.125), 0.28)

    lib.assign(build_head(), skin)
    lib.assign(build_body(), skin)
    lib.assign(build_top(), cloth)
    for obj in build_bands():
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
