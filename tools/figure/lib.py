"""
Shared helpers for building the figure in Blender.

Blender is here as a Python module (`pip install bpy`), so there is no window
and no mouse: every asset is scripted. What that buys over building meshes in
the browser is the modifier stack — above all subdivision surface, which is how
character artists actually get organic form. A coarse cage of a few hundred
faces subdivided twice gives a surface with real continuity; displacing a
dense sphere, which is what the browser version did, gives whatever the
displacement function happened to say at each vertex and reads as lumpy.
"""

import math
import bpy
import bmesh
from mathutils import Vector


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def blob(distance: float, radius: float = 1.0) -> float:
    t = min(1.0, max(0.0, distance / radius))
    u = 1 - t * t
    return u * u * u


def shaded_smooth(obj) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def subsurf(obj, levels: int = 2) -> None:
    modifier = obj.modifiers.new("subsurf", "SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def relax(obj, factor: float = 0.5, repeat: int = 2) -> None:
    """Even the surface out. A cage built from a formula has uneven spacing and
    subdivision preserves it; a smoothing pass spreads it before the eye reads
    it as a ripple."""
    modifier = obj.modifiers.new("smooth", "SMOOTH")
    modifier.factor = factor
    modifier.iterations = repeat
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def sphere_cage(segments: int, rings: int, shape) -> "bpy.types.Object":
    """A low sphere whose vertices are moved by `shape`, ready to subdivide."""
    mesh = bpy.data.meshes.new("cage")
    obj = bpy.data.objects.new("cage", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for vertex in bm.verts:
        direction = vertex.co.normalized()
        vertex.co = Vector(shape(direction))
    bm.to_mesh(mesh)
    bm.free()
    return obj


def ribbon(name, path, widths, flatten=0.35, tilt=0.0, resolution: int = 24):
    """
    A lock of hair: a curve swept by a flat section, tapering to a point.

    `flatten` is the section's thickness as a fraction of its width, and it is
    baked into the bevel profile — an ellipse rather than a circle — so it acts
    in the section's own frame.

    The first version swept a circle and then scaled the finished mesh on the
    global Y axis, which in this frame is front-to-back. That did not thin the
    section, it squashed the whole lock towards the head's mid-plane: measured,
    a lock authored to run from 0.10 to 0.42 in front of the head had its mean
    front position pulled from 0.285 to 0.086 when the factor went from 1.0 to
    0.3, while x and height did not move at all. Every length that was meant to
    hang in front of a shoulder was sitting flat against the skull instead.

    `tilt` turns the section about the curve, in radians, so a band can be laid
    flat against the head rather than edge-on to it.
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    spline = curve.splines.new("NURBS")
    spline.points.add(len(path) - 1)
    for i, point in enumerate(path):
        spline.points[i].co = (point[0], point[1], point[2], 1.0)
        spline.points[i].tilt = tilt
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(path))

    profile = bpy.data.curves.new(name + "_profile", "CURVE")
    profile.dimensions = "2D"
    poly = profile.splines.new("POLY")
    corners = 24
    poly.points.add(corners - 1)
    for i in range(corners):
        a = (i / corners) * math.tau
        poly.points[i].co = (
            math.cos(a) * 0.5,
            math.sin(a) * 0.5 * flatten,
            0.0,
            1.0,
        )
    poly.use_cyclic_u = True
    profile_obj = bpy.data.objects.new(name + "_profile", profile)
    bpy.context.scene.collection.objects.link(profile_obj)

    taper = bpy.data.curves.new(name + "_taper", "CURVE")
    taper.dimensions = "3D"
    tspline = taper.splines.new("NURBS")
    tspline.points.add(len(widths) - 1)
    for i, w in enumerate(widths):
        tspline.points[i].co = (i / (len(widths) - 1) * 2.0, w, 0.0, 1.0)
    tspline.use_endpoint_u = True
    taper_obj = bpy.data.objects.new(name + "_taper", taper)
    bpy.context.scene.collection.objects.link(taper_obj)

    curve.bevel_mode = "OBJECT"
    curve.bevel_object = profile_obj
    curve.taper_object = taper_obj
    curve.use_fill_caps = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.select_set(False)
    bpy.data.objects.remove(profile_obj, do_unlink=True)
    bpy.data.objects.remove(taper_obj, do_unlink=True)
    return obj


def material(name: str, colour, roughness: float, metallic: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def assign(obj, mat) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def boolean(obj, cutter, operation: str = "DIFFERENCE"):
    """Cut one solid with another and throw the cutter away.

    The exact solver, not the fast one: the fast one leaves holes where two
    surfaces are nearly parallel, and a hair mass laid over a skull is nearly
    parallel to it everywhere."""
    modifier = obj.modifiers.new("bool", "BOOLEAN")
    modifier.operation = operation
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return obj


def round_box(name: str, centre, half, radius: float, segments: int = 5):
    """A box with the corners taken off, as a cutter."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=centre)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (half[0], half[1], half[2])
    bpy.ops.object.transform_apply(scale=True)
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = radius
    bevel.segments = segments
    bevel.limit_method = "NONE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def join(objects, name: str):
    """Make several objects one object, without changing any geometry."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    merged.select_set(False)
    return merged


def fuse(obj, voxel: float, adaptivity: float = 0.0):
    """Rebuild the surface of overlapping solids as one skin.

    Separate swept bands that pass through each other each keep their own hard
    edge, and those edges are what show as steps in the outline and as slabs
    that never became a mass. A voxel remesh replaces the lot with the surface
    of their union, so where two bands cross there is one surface, and where
    they are genuinely apart there is still a valley between them.

    The voxel size decides what survives: too coarse and the divisions melt into
    a helmet, too fine and there is no fusing to speak of, only a great many
    triangles.
    """
    modifier = obj.modifiers.new("remesh", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel
    modifier.adaptivity = adaptivity
    modifier.use_smooth_shade = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj
