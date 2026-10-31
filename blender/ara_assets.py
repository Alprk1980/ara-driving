# ARA Driving - vehicle asset factory for Blender.
#
# Run headless from the repo root:
#   blender --background --python blender/ara_assets.py
# or a subset (players | fleet | cars):
#   blender --background --python blender/ara_assets.py -- players cars
#
# It reads the game's own validated content - nothing here is invented:
#   src/data/carprofiles.json   the six player bodies (schemas/carprofiles.ts checks them)
#   src/data/fleet.json         the service vehicles' side elevations (schemas/fleet.ts checks them)
#   src/data/towncars.json      the town's traffic shapes (schemas/towncars.ts checks them)
# and writes glTF binaries that match them:
#   public/models/players/<id>.glb   public/models/fleet/<id>.glb   public/models/cars/<id>.glb
#
# Convention: the game builds cars with x across, y up, z forward (carmesh.ts). The glTF exporter maps
# Blender (x, y, z) to glTF (x, z, -y), so every game point (x, y, z) is placed at Blender P(x, y, z)
# = (x, -z, y): the nose points Blender -Y and lands on glTF +Z, up on +Y, exactly as the engine has it.
# Origins sit at the middle of the wheelbase on the ground, so a loaded GLB drops straight onto the road.
#
# Real-world numbers are the repo's, with the sources schemas/fleet.ts already carries:
#   Enviro200 10.8 m long, 2.47 wide, 2.86 tall; Enviro400 10.5-11.5 m, 2.55 wide, 4.2-4.3 tall;
#   fire pumps 7.7-8.5 m long, 3.3-3.4 tall (Royal Berkshire / South Yorkshire appliance lists);
#   Battenburg paint colours from the Police Scientific Development Branch pattern (LIVERY);
#   player car metres from src/sim/economy.ts (real class sizes, 3.5-4.8 m).
# The wheel-arch gap and glass offsets are copied from src/view/voxels.ts and streetlife.ts so the
# GLB reads the same as the in-game mesh; streetlife.ts marks its taper values as judged by eye, not a
# standard, and they stay judged here.
#
# Deliberate departures from the game mesh (it's a friendly toy town):
#   - no Battenburg blocks or tail chevrons yet (the game paints those live);
#   - one glass shell per greenhouse instead of separate panes with painted pillars (player cars);
#   - town car panels export white: the game tints the paint material live.

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- repo paths

_here = Path(__file__).resolve().parent if "__file__" in dir() else Path.cwd()
ROOT = next(p for p in (_here, _here.parent, Path.cwd()) if (p / "package.json").exists())
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "models"

# Player car metres: length, height, width, straight from src/sim/economy.ts (lines 91-96).
PLAYER_SIZES = {
    "hatchback": (3.8, 1.5, 1.8),
    "compact": (3.5, 1.5, 1.7),
    "pickup": (4.8, 1.8, 1.95),
    "taxi": (4.4, 1.5, 1.85),
    "coupe": (4.3, 1.3, 1.9),
    "supercar": (4.5, 1.15, 2.0),
}

# Service wheel radii (m) from FLEET_RULES, and paint colours from LIVERY, both in schemas/fleet.ts.
FLEET_WHEEL = {"bus_single": 0.48, "bus_double": 0.48, "police_car": 0.33, "police_van": 0.35,
               "ambulance": 0.36, "fire_engine": 0.5, "recovery_truck": 0.42}
FLEET_PAINT = {"police_car": "#f2f3f5", "police_van": "#f2f3f5", "ambulance": "#f5e94a",
               "fire_engine": "#c8201e", "recovery_truck": "#f0a81e"}

# Game-mesh constants, copied so the export matches what players already see.
ARCH_GAP_M = 0.08          # tyre-to-arch gap: carprofiles.ts demands panel >= 2r + 0.08; streetlife.ts ARCH_GAP
GLASS_IN_M = 0.012         # glass set proud of the flank: fleet.ts / streetlife.ts
WHEEL_VERTS = 20           # low-poly, like the game's 14-16-sided wheels
RIM_FRAC = 0.55            # steelie about 0.55 of the tyre radius: voxels.ts wheel; a 195/65 R15 sits near it
PAINT = "#e8483f"          # DEFAULT_PAINT in carmesh.ts - the garage repaints the material live anyway
GLASS_HEX, GLASS_A = "#8fd0ea", 0.32          # glass material in carmesh.ts
TIRE_HEX, RIM_HEX = "#1b1b1f", "#c8c8cc"      # TIRE / RIM in voxels.ts
HEAD_HEX, TAIL_HEX, TRIM_HEX = "#fff2c0", "#c8322a", "#3a3a40"  # voxels.ts
FLEET_GLASS, FLEET_RUBBER, FLEET_SILVER = "#2b3b4a", "#1f2228", "#c4c7cd"  # fleet.ts
TOWN_GLASS, TOWN_RUBBER = "#5f7f96", "#25282e"  # streetlife.ts
TOWN_WHEEL_R = 0.33        # WHEEL_R in streetlife.ts
WAIST_M, WAIST_DRAWN = 0.62, 0.28  # sides draw in above the waist: across() in streetlife.ts
NOSE_TAPER_M, NOSE_WIDE, TAIL_TAPER_M, TAIL_WIDE = 0.9, 0.84, 0.7, 0.9  # plan() in streetlife.ts, judged by eye

# ---------------------------------------------------------------- small maths

def line_at(keys, z):
    """Interpolate a profile line, exactly as lineAt in voxels.ts does."""
    lo, hi = keys[0], keys[-1]
    for i in range(len(keys) - 1):
        if keys[i]["z"] <= z <= keys[i + 1]["z"]:
            lo, hi = keys[i], keys[i + 1]
            break
    t = 0.0 if hi["z"] == lo["z"] else (z - lo["z"]) / (hi["z"] - lo["z"])
    return lo["v"] + (hi["v"] - lo["v"]) * t


def P(x, y, z):
    """Game metres (x across, y up, z forward) -> Blender for a glTF that ends up +Z forward, +Y up."""
    return (x, -z, y)


def hex_rgb(h):
    """sRGB hex -> Blender linear base colour."""
    def ch(b):
        c = b / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    n = int(h.lstrip("#"), 16)
    return (ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255), 1.0)


# ---------------------------------------------------------------- the schema, ported

def check_profile(p, size):
    """The parts of schemas/carprofiles.ts that matter before sculpting: bad data must stop the export."""
    errs, (ln, tall, wide) = [], size
    sill, w, c, b = p["sill"], p["wheels"], p["cabin"], p.get("bed")
    if not 0.15 <= sill <= 0.5: errs.append(f"sill {sill} outside 0.15-0.5 m")
    if not 0.24 <= w["radius"] <= 0.45: errs.append(f"wheels.radius {w['radius']} outside 0.24-0.45 m")
    if not 0.14 <= w["width"] <= 0.3: errs.append(f"wheels.width {w['width']} outside 0.14-0.3 m")
    if not 0.58 <= w["front"] <= 0.88 or not 0.12 <= w["rear"] <= 0.42: errs.append("axle z fraction off")
    if w["front"] - w["rear"] < 0.25: errs.append("no real wheelbase")
    if not 0.7 <= w["track"] <= 0.95: errs.append("track fraction off")
    if 2 * w["radius"] > 0.62 * tall: errs.append("wheels too tall for this body")
    if any(k["v"] * tall < sill + 0.05 for k in p["panel"]): errs.append("panel dips under the sill")
    if any(k["v"] > c["belt"] + 0.04 for k in p["panel"]): errs.append("panel buries the windows")
    if c["height"] * tall < sill + 0.74: errs.append("too low to seat the driver")
    for z in (w["rear"], w["front"]):  # the arch cutter must not break through the panel
        if 2 * w["radius"] + ARCH_GAP_M > line_at(p["panel"], z) * tall:
            errs.append(f"arch at z {z} would break the panel")
    if b and b["floor"] * tall < sill + 0.1: errs.append("bed floor under the sill")
    if errs: raise ValueError(f"{p['id']}: " + "; ".join(errs))


def check_fleet(v):
    """The fleet.ts checks that matter here: wheels inside the body on a real wheelbase."""
    zs = [q[0] for q in v["body"]]
    tail, nose, r = min(zs), max(zs), FLEET_WHEEL[v["id"]]
    errs = []
    if v["axles"][0] < tail + r + 0.1 or v["axles"][1] > nose - r - 0.1: errs.append("wheels outside the body")
    if v["axles"][1] - v["axles"][0] < (nose - tail) * 0.45: errs.append("wheelbase under 45% of length")
    if errs: raise ValueError(f"{v['id']}: " + "; ".join(errs))


def check_town(c):
    zs = [q[0] for q in c["body"]]
    tail, nose, top = min(zs), max(zs), c["cabin"]["top"]
    errs = []
    if not 3.6 <= nose - tail <= 5.4: errs.append(f"{nose - tail:.2f} m long, town cars are 3.6-5.4 m")
    if not 1.35 <= top <= 2.2: errs.append(f"top {top} outside 1.35-2.2 m")
    if errs: raise ValueError(f"{c['id']}: " + "; ".join(errs))


# ---------------------------------------------------------------- materials

MATS = {}


def mat(key, hexcol, rough=0.55, alpha=1.0):
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(f"ara.{key}")
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hex_rgb(hexcol)
    b.inputs["Roughness"].default_value = rough
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try: m.blend_method = "BLEND"
        except TypeError: pass
    MATS[key] = m
    return m


# ---------------------------------------------------------------- building blocks

def link(name, me, matl, parent):
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(matl)
    bpy.context.collection.objects.link(o)
    if parent is not None: o.parent = parent
    return o


def box(name, parent, matl, w, h, l, cx, cy, cz):
    """A game-sized box: w across, h up, l along, centred at game metres (cx, cy, cz)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = (v.co.x * w + cx, -(v.co.y * l) + -cz, v.co.z * h + cy)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me, matl, parent)


def loft(name, parent, matl, stations):
    """Bridge loops along z: each station is (z_game, a ring of (y, x) corners), rings equal in count."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = [[bm.verts.new(P(x, y, z)) for (y, x) in ring] for (z, ring) in stations]
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me, matl, parent)


def extrude(name, parent, matl, poly, xfn):
    """Extrude a closed (y, z) side outline across the car; xfn(z, y) is the half-width at that point."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    a = [bm.verts.new(P(-xfn(z, y), y, z)) for (y, z) in poly]
    b = [bm.verts.new(P(xfn(z, y), y, z)) for (y, z) in poly]
    bm.faces.new(list(reversed(a))); bm.faces.new(b)
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me, matl, parent)


def disc(name, parent, matl, r, depth, cx, cy, cz, verts=WHEEL_VERTS):
    """A wheel-shaped disc: axis across the car, hub at game metres (cx, cy, cz)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=depth)
    bmesh.ops.rotate(bm, verts=ret["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(cx, -cz, cy))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me, matl, parent)


def boolean_cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"; mod.object = cutter
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def wheelset(tag, parent, r, width, x, z, tire_hex, rim_hex, rim_frac):
    disc(f"wheel_{tag}_tyre", parent, mat("tire", tire_hex, 0.8), r, width, x, r, z)
    # rim sits inside the tread face, so a wheel never makes the body wider than spec
    disc(f"wheel_{tag}_rim", parent, mat("rim", rim_hex, 0.35), r * rim_frac, width - 0.02, x, r, z)


def glass_quad(name, parent, matl, quad):
    """A flat pane (game-coord corners). One face is enough: glTF materials are double-sided by default,
    and bmesh refuses the mirrored twin (same vertex set). Degenerate panes are dropped."""
    if len({tuple(round(c, 6) for c in q) for q in quad}) < 4: return None
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(P(*q)) for q in quad]
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me, matl, parent)


# ---------------------------------------------------------------- player cars (carprofiles.json)

def build_player(p, parent):
    ln, tall, wide = PLAYER_SIZES[p["id"]]
    check_profile(p, (ln, tall, wide))
    w, c, bed = p["wheels"], p["cabin"], p.get("bed")
    sill = p["sill"]
    half_at = lambda zf: line_at(p["width"], zf) * wide / 2
    paint = mat("paint", PAINT)

    # the lower body, lofted from the profile's panel and width lines, sampled smooth
    zset = {k["z"] for k in p["panel"]} | {k["z"] for k in p["width"]} | {c["back"], c["front"]}
    z = 0.0
    while z <= 1.0001:
        zset.add(round(min(z, 1.0), 3)); z += 0.04
    stations = []
    for zf in sorted(zset):
        top, hw = line_at(p["panel"], zf) * tall, half_at(zf)
        zm = (zf - 0.5) * ln
        stations.append((zm, [(sill, -hw), (sill, hw), (top, hw), (top, -hw)]))
    body = loft("body", parent, paint, stations)

    # wheel arches: cut as deep as the wheel sits, the way the voxel sculpt keeps its wells
    xtrack = w["track"] * wide / 2
    wellin = xtrack - w["width"] / 2 - 0.1  # about vs * 1.5 in voxels.ts
    hmax = max(half_at(w["rear"]), half_at(w["front"])) + 0.02
    for az in (w["rear"], w["front"]):
        for s in (1, -1):
            me = bpy.data.meshes.new("arch"); bm = bmesh.new()
            ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=WHEEL_VERTS,
                                        radius1=w["radius"] + ARCH_GAP_M, radius2=w["radius"] + ARCH_GAP_M,
                                        depth=hmax - wellin)
            bmesh.ops.rotate(bm, verts=ret["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
            bmesh.ops.translate(bm, verts=bm.verts, vec=(s * (hmax + wellin) / 2, -(az - 0.5) * ln, w["radius"]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(me); bm.free()
            boolean_cut(body, link("arch", me, paint, None))

    # the pickup's open tray: subtracted to leave walls and a tailgate, as the sculpt does
    if bed:
        zb1 = bed["front"] * ln - ln / 2
        zb2 = -ln / 2 + 0.09
        inner = min(half_at((z + ln / 2) / ln) - 0.08 for z in (zb1, zb2))
        me = bpy.data.meshes.new("tray"); bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = (v.co.x * 2 * inner,
                    -(v.co.y * (zb1 - zb2) + (zb1 + zb2) / 2),
                    v.co.z * (tall + 1) + bed["floor"] * tall + 0.02 + (tall + 1) / 2)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        boolean_cut(body, link("tray", me, paint, None))
        box("bed_floor", parent, mat("trim", TRIM_HEX), 2 * inner, 0.03, zb1 - zb2,
            0, bed["floor"] * tall + 0.015, (zb1 + zb2) / 2)

    # the greenhouse: a raked glass shell from just under the belt, a steel roof, pillars a side
    belt, roof = c["belt"] * tall, c["height"] * tall
    cabh = c["width"] * wide / 2
    f, bk = (c["front"] - 0.5) * ln, (c["back"] - 0.5) * ln
    fr, br = f - c["rakeF"] * ln, bk + c["rakeR"] * ln
    extrude("cabin_glass", parent, mat("glass", GLASS_HEX, 0.15, GLASS_A),
            [(belt - 0.06, bk), (belt - 0.06, f), (roof, fr), (roof, br)], lambda z, y: cabh)
    box("cabin_roof", parent, paint, 2 * cabh, 0.04, fr - br, 0, roof + 0.01, (br + fr) / 2)
    for pz, ptag in ((fr, "front"), ((br + fr) / 2, "mid"), (br, "rear")):
        for s in (1, -1):
            box(f"pillar_{ptag}_{'R' if s > 0 else 'L'}", parent, paint, 0.07, roof - belt, 0.09,
                s * (cabh - 0.04), (belt + roof) / 2, pz)

    # lamps at the corners on the panel-line band, faces flush so the body keeps its spec length
    for s in (1, -1):
        side = "R" if s > 0 else "L"
        box(f"head_{side}", parent, mat("head", HEAD_HEX, 0.4), 0.3, 0.14, 0.05,
            s * wide / 3, sill + (line_at(p["panel"], 1.0) * tall - sill) * 0.715, ln / 2 - 0.013)
        box(f"tail_{side}", parent, mat("tail", TAIL_HEX, 0.4), 0.34, 0.12, 0.05,
            s * wide / 3, sill + (line_at(p["panel"], 0.0) * tall - sill) * 0.715, -ln / 2 + 0.013)

    zf_, zr_ = (w["front"] - 0.5) * ln, (w["rear"] - 0.5) * ln
    wheelset("FL", parent, w["radius"], w["width"], xtrack, zf_, TIRE_HEX, RIM_HEX, RIM_FRAC)
    wheelset("FR", parent, w["radius"], w["width"], -xtrack, zf_, TIRE_HEX, RIM_HEX, RIM_FRAC)
    wheelset("RL", parent, w["radius"], w["width"], xtrack, zr_, TIRE_HEX, RIM_HEX, RIM_FRAC)
    wheelset("RR", parent, w["radius"], w["width"], -xtrack, zr_, TIRE_HEX, RIM_HEX, RIM_FRAC)
    # the mesh's widest line: the width profile's max fraction times spec width, or the tyre outer face
    maxw = max(line_at(p["width"], zf) for zf in zset) * wide
    return ln, max(maxw, xtrack * 2 + w["width"])


# ---------------------------------------------------------------- service vehicles (fleet.json)

def build_fleet(v, parent):
    check_fleet(v)
    half, r = v["half"], FLEET_WHEEL[v["id"]]
    paint = mat(f"paint_{v['id']}", v.get("paint") or FLEET_PAINT[v["id"]])
    body = extrude("body", parent, paint, [(y, z) for (z, y) in v["body"]], lambda z, y: half)

    glass = mat("fleet_glass", FLEET_GLASS, 0.15)
    for wnd in v["windows"]:
        for s in (1, -1):
            glass_quad("glass_side", parent, glass,
                       [(s * (half + GLASS_IN_M), wnd["y0"], wnd["z0"]), (s * (half + GLASS_IN_M), wnd["y0"], wnd["z1"]),
                        (s * (half + GLASS_IN_M), wnd["y1"], wnd["z1"]), (s * (half + GLASS_IN_M), wnd["y1"], wnd["z0"])])
    zs = [q[0] for q in v["body"]]
    nose, floor = max(zs), min(v["body"][0][1], v["body"][-1][1])

    def nose_at(y):
        pts = v["body"]
        for i in range(len(pts) - 1, 0, -1):
            (z0, y0), (z1, y1) = pts[i - 1], pts[i]
            if min(y0, y1) <= y <= max(y0, y1) and y0 != y1:
                return z0 + (y - y0) / (y1 - y0) * (z1 - z0)
        return nose

    # the windscreen sits proud of the nose face, however it slopes (a shallow straight, like fleet.ts)
    s0, s1 = v["screen"]["y0"], v["screen"]["y1"]
    glass_quad("glass_screen", parent, glass,
               [(-(half - 0.1), s0, nose_at(s0) + 0.015), (half - 0.1, s0, nose_at(s0) + 0.015),
                (half - 0.1, s1, nose_at(s1) + 0.015), (-(half - 0.1), s1, nose_at(s1) + 0.015)])

    rubber = mat("fleet_rubber", FLEET_RUBBER, 0.8)
    box("bumper_tail", parent, rubber, 2 * half - 0.06, 0.22, 0.12, 0, floor + 0.1, min(zs) + 0.06)
    box("bumper_nose", parent, rubber, 2 * half - 0.06, 0.22, 0.12, 0, floor + 0.1, nose - 0.06)
    for s in (1, -1):
        side = "R" if s > 0 else "L"
        box(f"head_{side}", parent, mat("head", "#f5ecc8", 0.4), 0.34, 0.2, 0.05,
            s * (half - 0.28), floor + 0.5, nose_at(floor + 0.5) - 0.01)
        box(f"tail_{side}", parent, mat("tail", "#a12a26", 0.4), 0.2, 0.36, 0.05,
            s * (half - 0.2), floor + 0.5, min(zs) + 0.03)
        box(f"mirror_{side}", parent, rubber, 0.22, 0.1, 0.12, s * (half + 0.1),
            min(s1, max(y for (_, y) in v["body"]) - 0.3), nose_at(min(s1, max(y for (_, y) in v["body"]) - 0.3)) - 0.3)
    top = max(y for (_, y) in v["body"])
    if v["id"].split("_")[0] in ("police", "ambulance", "fire", "recovery"):  # the blue-light bar of fleet.ts
        roof_z = max(z for (z, y) in v["body"] if y > top - 0.02)
        box("beacon_bar", parent, mat("bar", "#2a2d33", 0.5), 2 * half * 0.8 + 0.1, 0.08, 0.3,
            0, top + 0.03, roof_z - 0.25)
    for k, az in enumerate(v["axles"]):
        for s in (1, -1):
            wheelset(f"{k}_{'R' if s > 0 else 'L'}", parent, r, 0.26, s * (half - 0.1), az,
                     FLEET_RUBBER, FLEET_SILVER, 0.55)
    # body length vs body width; mirrors stick out (real sheets quote the two widths separately),
    # so the widest line to check against is mirror-to-mirror
    return nose - min(zs), 2 * half + 0.42


# ---------------------------------------------------------------- traffic cars (towncars.json)

def build_town(car, parent):
    check_town(car)
    half, c = car["half"], car["cabin"]
    zs = [q[0] for q in car["body"]]
    tail, nose = min(zs), max(zs)
    r = car.get("wheel") or TOWN_WHEEL_R

    def plan(z):  # the nose/tail taper streetlife.ts carries (judged by eye, not a standard)
        n = max(0.0, 1 - (nose - z) / NOSE_TAPER_M)
        t = max(0.0, 1 - (z - tail) / TAIL_TAPER_M)
        return 1 - (1 - NOSE_WIDE) * n * n - (1 - TAIL_WIDE) * t * t

    def across(y, z):  # sides draw in above the waist, then follow the taper
        return (half - max(0.0, y - WAIST_M) * WAIST_DRAWN) * plan(z)

    white = mat(f"paint_{car['id']}", "#ffffff")  # the game tints the paint material live
    body = extrude("body", parent, white, [(y, z) for (z, y) in car["body"]], lambda z, y: across(y, z))

    low = across(c["base"], (c["rear"] + c["front"]) / 2) - 0.03
    high = low - 0.17
    me = bpy.data.meshes.new("cabin"); bm = bmesh.new()
    ring = ((c["base"], c["rear"], low), (c["base"], c["front"], low),
            (c["top"], c["frontTop"], high), (c["top"], c["rearTop"], high))
    vb = [bm.verts.new(P(-xx, yy, zz)) for (yy, zz, xx) in ring]
    vt = [bm.verts.new(P(xx, yy, zz)) for (yy, zz, xx) in ring]
    bm.faces.new(vb[::-1]); bm.faces.new(vt)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    link("cabin", me, white, parent)

    # glass panes inset on the greenhouse, like the panes in streetlife.ts; vans keep the rear shut
    glass = mat("town_glass", TOWN_GLASS, 0.15)

    def bilinear(q, u, v):
        lo = [q[0][k] + (q[1][k] - q[0][k]) * u for k in range(3)]
        hi = [q[3][k] + (q[2][k] - q[3][k]) * u for k in range(3)]
        return [lo[k] + (hi[k] - lo[k]) * v for k in range(3)]

    for s in (1, -1):
        side_q = [(s * low, c["base"], c["rear"]), (s * low, c["base"], c["front"]),
                  (s * high, c["top"], c["frontTop"]), (s * high, c["top"], c["rearTop"])]
        panes = [(0.56, 0.9)] if car.get("van") else [(0.1, 0.5), (0.54, 0.9)]
        for k, (u0, u1) in enumerate(panes):
            q4 = [bilinear(side_q, u, v) for (u, v) in
                  ((u0, 0.12), (u1, 0.12), (u1, 0.88), (u0, 0.88))]
            glass_quad(f"glass_side_{k}_{'R' if s > 0 else 'L'}", parent, glass,
                       [(a[0] + s * 0.2 * GLASS_IN_M, a[1] + 0.2 * GLASS_IN_M, a[2]) for a in q4])
    screen_q = [(-low, c["base"], c["front"]), (low, c["base"], c["front"]),
                (high, c["top"], c["frontTop"]), (-high, c["top"], c["frontTop"])]
    sq = [bilinear(screen_q, u, v) for (u, v) in ((0.07, 0.08), (0.93, 0.08), (0.93, 0.9), (0.07, 0.9))]
    glass_quad("glass_screen", parent, glass, [(a[0], a[1] + 0.6 * GLASS_IN_M, a[2] + 0.8 * GLASS_IN_M) for a in sq])
    if not car.get("van"):
        back_q = [(low, c["base"], c["rear"]), (-low, c["base"], c["rear"]),
                  (-high, c["top"], c["rearTop"]), (high, c["top"], c["rearTop"])]
        bq = [bilinear(back_q, u, v) for (u, v) in
              ((0.1, 0.12), (0.9, 0.12), (0.9, 0.88), (0.1, 0.88))]
        glass_quad("glass_back", parent, glass, [(a[0], a[1] + 0.6 * GLASS_IN_M, a[2] - 0.8 * GLASS_IN_M) for a in bq])

    wheelz = car.get("axles") or [tail + 0.8, nose - 0.72]  # the fallback in streetlife.ts
    for k, az in enumerate(wheelz):
        for s in (1, -1):
            wheelset(f"{k}_{'R' if s > 0 else 'L'}", parent, r, 0.22, s * (half * plan(az) - 0.09), az,
                     TOWN_RUBBER, FLEET_SILVER, 0.62)
    rubber = mat("town_rubber", TOWN_RUBBER, 0.8)
    sill = car["body"][0][1]
    for zedge, tag in ((tail + 0.05, "tail"), (nose - 0.05, "nose")):
        box(f"bumper_{tag}", parent, rubber, 2 * half * plan(zedge) - 0.08, 0.2, 0.1, 0, sill + 0.1, zedge)
    for s in (1, -1):
        side = "R" if s > 0 else "L"
        box(f"head_{side}", parent, mat("head", "#f5ecc8", 0.4), 0.36, 0.12, 0.05,
            s * (half * NOSE_WIDE - 0.28), 0.56, nose - 0.013)
        box(f"tail_{side}", parent, mat("tail", "#a12a26", 0.4), 0.38, 0.14, 0.05,
            s * (half * TAIL_WIDE - 0.28), 0.7, tail + 0.013)
    return nose - tail, 2 * half


# ---------------------------------------------------------------- export + size tests

def world_bbox(objs):
    mins, maxs = [1e9] * 3, [-1e9] * 3
    for o in objs:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for k in range(3):
                mins[k] = min(mins[k], w[k]); maxs[k] = max(maxs[k], w[k])
    return [b - a for a, b in zip(mins, maxs)]


def export_glb(empty, path, want_length, want_across):
    meshes = [o for o in empty.children_recursive if o.type == "MESH"]
    for o in meshes:
        for pl in o.data.polygons: pl.use_smooth = False
    dims = world_bbox(meshes)  # Blender x=across, y=length, z=height
    across, length, tall = dims[0], dims[1], dims[2]
    ok = abs(length - want_length) < 0.03 and abs(across - want_across) < 0.08
    bpy.ops.object.select_all(action="DESELECT")
    empty.select_set(True)
    for o in empty.children_recursive: o.select_set(True)
    bpy.context.view_layer.objects.active = empty
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), use_selection=True, export_format="GLB", export_apply=True)
    faces = sum(len(o.data.polygons) for o in meshes)
    print(f"{'PASS' if ok else 'FAIL'}  {path.name:<22} {faces:>5} faces   "
          f"{length:.2f} long x {across:.2f} wide x {tall:.2f} tall   spec {want_length:.2f} x {want_across:.2f}")
    for o in [empty] + empty.children_recursive:
        bpy.data.objects.remove(o, do_unlink=True)
    return ok


# ---------------------------------------------------------------- main

def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    groups = set(args) or {"players", "fleet", "cars"}
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    fails = []
    if "players" in groups:
        for p in json.loads((DATA / "carprofiles.json").read_text(encoding="utf-8")):
            empty = bpy.data.objects.new(f"car_{p['id']}", None)
            bpy.context.collection.objects.link(empty)
            ln, across = build_player(p, empty)
            if not export_glb(empty, OUT / "players" / f"{p['id']}.glb", ln, across): fails.append(p["id"])
    if "fleet" in groups:
        for v in json.loads((DATA / "fleet.json").read_text(encoding="utf-8")):
            empty = bpy.data.objects.new(f"fleet_{v['id']}", None)
            bpy.context.collection.objects.link(empty)
            ln, across = build_fleet(v, empty)
            if not export_glb(empty, OUT / "fleet" / f"{v['id']}.glb", ln, across): fails.append(v["id"])
    if "cars" in groups:
        for car in json.loads((DATA / "towncars.json").read_text(encoding="utf-8")):
            empty = bpy.data.objects.new(f"town_{car['id']}", None)
            bpy.context.collection.objects.link(empty)
            ln, across = build_town(car, empty)
            if not export_glb(empty, OUT / "cars" / f"{car['id']}.glb", ln, across): fails.append(car["id"])

    print(f"done: {OUT} ({'all size checks passed' if not fails else 'FAILED: ' + ', '.join(fails)})")
    if fails: sys.exit(1)


main()
