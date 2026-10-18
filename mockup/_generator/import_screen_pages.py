"""Split the Copy mockup's screen artboards into section-grouped Nexa FigCraft pages.

Each source page group (Login, Admin, User) becomes one Nexa page per subcategory
(named "<Group> · <Subcategory>") holding one section per screen, with the Light and
Dark frames side by side.

Instances are re-linked to the component sets that already exist in Nexa.figcraft
instead of being flattened into frames:

* the base name of the instance picks the component set (`BASE_TO_SET`), and
  `instance_match` chooses the variant whose own appearance is closest to the
  instance's fill, stroke, label colour, size and child tree;
* instances whose (deleted) source master is an icon are re-linked by icon name
  through the icon page;
* source instances that carry no children at all cannot be drawn from themselves, so
  their art is rebuilt from the matched target variant (or icon, or a documented
  fallback variant), and the copy becomes a real instance of it;
* anything that matches nothing is left as a frame, and the script reports it.

The script is repeatable: the pages it produced on an earlier run are removed first.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import tempfile
import zipfile
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import instance_match as im  # noqa: E402  (local helper, kept beside this script)

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "Nexa.figcraft"
SOURCE = ROOT / "nexa - Copy.figcraft"
PAGE_GROUPS = (
    ("Login", "Login – Dark", "Login"),
    ("Admin", "Admin – Dark", "Admin"),
    ("User", "User – Dark", "User"),
)
RADIO_VARIANT = "Checked=Unchecked, State=Default, Size=md, Label=No"
CHECKBOX_VARIANT = "Checked=Checked, State=Default, Size=md, Label=No"
IMPORTED_PREFIXES = ("Login · ", "Admin · ", "User · ")

# Component mapping from source instance base names to target component sets.
BASE_TO_SET = {
    "Alert": "Alert",
    "Avatar": "Avatar",
    "Badge": "Badge",
    "Button": "Button",
    "Card": "Card",
    "Checkbox": "Checkbox",
    "IconButton": "IconButton",
    "Input": "Input",
    "Kbd": "Kbd",
    "Logo": "Logo",
    "Modal": "Modal",
    "Nav": "NavItem",
    "Radio": "Radio",
    "Search": "Input",
    "Segment": "Segment",
    "Select": "Select",
    "Switch": "Switch",
    "Toast": "Toast",
    # The Builder screens draw their variant tags with a local pill whose master was
    # deleted; the library's Badge covers the same role.
    "variant": "Badge",
    "checked": "Checkbox",
}
# Empty source instances whose set cannot be matched fall back to this variant's art.
FALLBACK_MASTERS = {
    "Radio": ("Radio", RADIO_VARIANT),
    "checked": ("Checkbox", CHECKBOX_VARIANT),
}
# Keys that describe the source document, not the target one; they would dangle here.
SOURCE_ONLY_KEYS = (
    "annotations",
    "bound",
    "componentSetId",
    "prototype",
    "source",
    "styles",
    "var_modes",
)
# Vertical gap between sections stacked on a consolidated page.
PAGE_GAP = 80
# Section background fill — matches the page background.
SECTION_FILL = {"r": 0.9607843137254902, "g": 0.9607843137254902, "b": 0.9607843137254902, "a": 1.0}


def children_of(node: dict) -> list[int]:
    return node.get("children", [])


def subtree_ids(nodes: dict[str, dict], root_id: int) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()

    def visit(node_id: int) -> None:
        if node_id in seen:
            raise ValueError(f"Shared or cyclic screen node {node_id}")
        seen.add(node_id)
        ordered.append(node_id)
        node = nodes[str(node_id)]
        for child_id in children_of(node):
            visit(child_id)

    visit(root_id)
    return ordered


def named_variant(nodes: dict[str, dict], set_name: str, variant_name: str) -> int | None:
    """Component id of a named variant inside a component set."""
    for node in nodes.values():
        if node.get("type") != "componentSet" or node.get("name") != set_name:
            continue
        for child_id in children_of(node):
            child = nodes.get(str(child_id))
            if child is not None and child.get("name") == variant_name:
                return child_id
    return None


def strip_imported(document: dict) -> tuple[int, int]:
    """Remove the pages an earlier run produced, so importing twice is harmless."""
    nodes = document["nodes"]
    page_ids = [
        page_id
        for page_id in document["pages"]
        if nodes[str(page_id)]["name"].startswith(IMPORTED_PREFIXES)
    ]
    removed = 0
    for page_id in page_ids:
        for node_id in subtree_ids(nodes, page_id):
            if str(node_id) in nodes:
                del nodes[str(node_id)]
                removed += 1
    dropped = set(page_ids)
    document["pages"] = [page_id for page_id in document["pages"] if page_id not in dropped]
    return len(page_ids), removed


def make_pages(document: dict, source: dict, stats: dict[str, Counter]) -> tuple[dict, int]:
    nodes = document["nodes"]
    source_nodes = source["nodes"]
    source_pages = {
        source_nodes[str(page_id)]["name"]: source_nodes[str(page_id)]
        for page_id in source["pages"]
    }
    base_page = next(
        copy.deepcopy(node)
        for node in nodes.values()
        if node.get("type") == "page" and node.get("name") == "Foundations"
    )
    variants = im.VariantIndex(nodes)
    target_icons = im.icon_index(nodes)
    source_icons = im.source_icon_names(source_nodes)
    next_id = max(int(document.get("next_id", 1)), max(map(int, nodes)) + 1)

    def allocate() -> int:
        nonlocal next_id
        value = next_id
        next_id += 1
        return value

    def screen_frames(page: dict) -> dict[str, int]:
        result = {}
        for child_id in children_of(page):
            child = source_nodes[str(child_id)]
            if child.get("type") == "frame":
                if child["name"] in result:
                    raise ValueError(f"Duplicate screen name {child['name']!r} on {page['name']}")
                result[child["name"]] = child_id
        return result

    def matched_variant(original: dict) -> int | None:
        """Variant of the mapped component set that best matches the source instance."""
        set_name = BASE_TO_SET.get(im.base_name(original.get("name", "")))
        if set_name is None or not variants.has(set_name):
            return None
        picked = variants.match(set_name, im.signature(source_nodes, original))
        return None if picked is None else variants.resting(set_name, picked)

    def relink(copied: dict, master_id: int) -> None:
        copied["component"] = master_id
        copied["props"] = {}
        copied["overrides"] = []
        for key in SOURCE_ONLY_KEYS:
            copied.pop(key, None)

    def build_master_art(master_id: int, parent_id: int, root_id: int, root_name: str,
                         root_transform: list, root_width: float, root_height: float) -> None:
        """Rebuild an empty source instance from a target master's own art.

        The source instance has no children to copy, so its look can only come from the
        target; the copy stays an instance of that master.
        """
        ids = subtree_ids(nodes, master_id)
        remap = {old_id: (root_id if old_id == master_id else allocate()) for old_id in ids}
        for old_id in ids:
            copied = copy.deepcopy(nodes[str(old_id)])
            copied["id"] = remap[old_id]
            copied["parent"] = parent_id if old_id == master_id else remap[copied["parent"]]
            if copied.get("children"):
                copied["children"] = [remap[child_id] for child_id in copied["children"]]
            if old_id == master_id:
                copied["type"] = "instance"
                copied["name"] = root_name
                copied["component"] = master_id
                copied["transform"] = root_transform
                copied["width"] = root_width
                copied["height"] = root_height
                copied["props"] = {}
                copied["overrides"] = []
                copied.pop("description", None)
                for key in SOURCE_ONLY_KEYS:
                    copied.pop(key, None)
            nodes[str(copied["id"])] = copied

    def append_screen(screen_id: int, parent_id: int, x: float, suffix: str) -> tuple[int, float, float]:
        screen = source_nodes[str(screen_id)]
        old_ids = subtree_ids(source_nodes, screen_id)
        remap = {old_id: allocate() for old_id in old_ids}
        width = float(screen.get("width", 0))
        height = float(screen.get("height", 0))
        for old_id in old_ids:
            original = source_nodes[str(old_id)]
            copied = copy.deepcopy(original)
            copied["id"] = remap[old_id]
            copied["parent"] = parent_id if old_id == screen_id else remap[original["parent"]]
            if copied.get("children"):
                copied["children"] = [remap[child_id] for child_id in copied["children"]]
            if old_id == screen_id:
                copied["name"] = f"{screen['name']} · {suffix}"
                copied["transform"] = [1.0, 0.0, 0.0, 1.0, x, 0.0]

            if original.get("type") == "instance":
                base = im.base_name(original.get("name", ""))
                icon_name = source_icons.get(original.get("component"))
                icon_id = target_icons.get(icon_name) if icon_name else None
                if children_of(original):
                    master_id = matched_variant(original)
                    if master_id is not None:
                        relink(copied, master_id)
                        nodes[str(copied["id"])] = copied
                        stats["set"][BASE_TO_SET[base]] += 1
                        continue
                    if icon_id is not None:
                        relink(copied, icon_id)
                        nodes[str(copied["id"])] = copied
                        stats["icon"][base] += 1
                        continue
                else:
                    art_id = matched_variant(original) or icon_id
                    if art_id is None:
                        fallback = FALLBACK_MASTERS.get(base)
                        if fallback is not None:
                            art_id = named_variant(nodes, *fallback)
                    if art_id is not None:
                        build_master_art(
                            art_id,
                            int(copied["parent"]),
                            int(copied["id"]),
                            original["name"],
                            copied["transform"],
                            float(original.get("width", 16)),
                            float(original.get("height", 16)),
                        )
                        stats["art"][base] += 1
                        continue

                stats["frame"][base] += 1
                copied["type"] = "frame"
            elif original.get("type") in ("component", "componentSet"):
                copied["type"] = "frame"
                copied.pop("description", None)

            for key in SOURCE_ONLY_KEYS:
                copied.pop(key, None)
            for key in ("component", "props", "overrides"):
                copied.pop(key, None)
            if isinstance(copied.get("style"), dict):
                copied["style"].pop("style_id", None)
            nodes[str(copied["id"])] = copied
        return remap[screen_id], width, height

    # Collect screens grouped by category prefix.
    # screen_name like "Auth / Login" → category "Login · Auth", screen "Login"
    groups: OrderedDict[str, list[tuple[str, int, int]]] = OrderedDict()
    for light_name, dark_name, group in PAGE_GROUPS:
        light_page = source_pages[light_name]
        dark_page = source_pages[dark_name]
        light_screens = screen_frames(light_page)
        dark_screens = screen_frames(dark_page)
        if light_screens.keys() != dark_screens.keys():
            raise ValueError(f"Light/Dark screen sets differ for {group}")

        for screen_name, light_id in light_screens.items():
            dark_id = dark_screens[screen_name]
            if " / " in screen_name:
                subcategory, _, screen_short = screen_name.partition(" / ")
            else:
                subcategory = screen_name
                screen_short = screen_name
            category = f"{group} · {subcategory}"
            groups.setdefault(category, []).append((screen_short, light_id, dark_id))

    # Create one page per category, with a section per screen.
    screen_count = 0
    for category, screens in groups.items():
        page_id = allocate()
        new_page = copy.deepcopy(base_page)
        new_page["id"] = page_id
        new_page["name"] = category
        new_page["children"] = []
        new_page["width"] = 0.0
        new_page["height"] = 0.0
        nodes[str(page_id)] = new_page

        section_ids: list[int] = []
        cumulative_y = 0.0
        max_width = 0.0

        for screen_short, light_id, dark_id in screens:
            section_id = allocate()
            section: dict = {
                "id": section_id,
                "name": screen_short,
                "type": "section",
                "parent": page_id,
                "children": [],
                "transform": [1.0, 0.0, 0.0, 1.0, 0.0, cumulative_y],
                "width": 0.0,
                "height": 0.0,
                "fills": [{"type": "solid", "color": dict(SECTION_FILL), "opacity": 1.0, "visible": True, "blend": "normal"}],
                "bound": {},
            }
            nodes[str(section_id)] = section
            section_ids.append(section_id)

            light_node_id, light_width, light_height = append_screen(light_id, section_id, 0, "Light")
            dark_node_id, dark_width, dark_height = append_screen(
                dark_id, section_id, light_width + 80, "Dark"
            )
            section["children"] = [light_node_id, dark_node_id]
            section["width"] = float(light_width + 80 + dark_width)
            section["height"] = float(max(light_height, dark_height))

            cumulative_y += section["height"] + PAGE_GAP
            max_width = max(max_width, section["width"])
            screen_count += 1

        new_page["children"] = section_ids
        new_page["width"] = float(max_width)
        new_page["height"] = float(cumulative_y - PAGE_GAP) if cumulative_y > PAGE_GAP else 0.0

    document["pages"].extend(
        int(node_id)
        for node_id, node in nodes.items()
        if node.get("type") == "page"
        and node_id not in {str(page_id) for page_id in document["pages"]}
    )
    document["next_id"] = next_id
    return document, screen_count


def imported_node_ids(nodes: dict[str, dict], document: dict) -> set[str]:
    result: set[str] = set()
    for page_id in document["pages"]:
        page = nodes[str(page_id)]
        if page.get("name", "").startswith(IMPORTED_PREFIXES):
            result.update(str(node_id) for node_id in subtree_ids(nodes, page_id))
    return result


def validate(document: dict) -> list[str]:
    nodes = document["nodes"]
    errors: list[str] = []
    ids = set(nodes)
    variable_ids = {
        variable["id"]
        for variable in (document.get("variables") or {}).get("variables", [])
    }
    for node_id, node in nodes.items():
        if str(node["id"]) != node_id:
            errors.append(f"Node key/id mismatch: {node_id}")
        for child_id in node.get("children", []):
            child = nodes.get(str(child_id))
            if child is None:
                errors.append(f"{node_id}: missing child {child_id}")
            elif child.get("parent") != node["id"]:
                errors.append(f"{node_id}: parent mismatch for child {child_id}")
        if node.get("type") != "page" and "parent" in node and str(node["parent"]) not in ids:
            errors.append(f"{node_id}: missing parent")
        if node.get("type") == "instance" and str(node.get("component")) not in ids:
            errors.append(f"{node_id}: missing component {node.get('component')}")
        if node.get("type") == "page" and node.get("name", "").startswith(IMPORTED_PREFIXES):
            page_children = node.get("children", [])
            child_types = {nodes.get(str(c), {}).get("type") for c in page_children}
            if "section" in child_types:
                # Consolidated page: children are sections, each containing Light/Dark frames.
                for section_id in page_children:
                    section = nodes.get(str(section_id), {})
                    section_children = section.get("children", [])
                    if len(section_children) != 2:
                        errors.append(f"{section_id}: section expected 2 children (Light/Dark), got {len(section_children)}")
                    elif not all(
                        " · Light" in nodes[str(c)]["name"] or " · Dark" in nodes[str(c)]["name"]
                        for c in section_children
                    ):
                        errors.append(f"{section_id}: section screen frames must identify their theme")
            elif len(page_children) != 2:
                errors.append(f"{node_id}: expected Light and Dark screen frames")
            elif not all(
                " · Light" in nodes[str(child_id)]["name"]
                or " · Dark" in nodes[str(child_id)]["name"]
                for child_id in page_children
            ):
                errors.append(f"{node_id}: screen frame labels must identify their theme")
    for node_id in imported_node_ids(nodes, document):
        node = nodes[node_id]
        for key, value in (node.get("bound") or {}).items():
            if value not in variable_ids:
                errors.append(f"{node_id}: bound {key}={value!r} is not a variable of this document")
        if node.get("type") == "instance" and "componentSetId" in node:
            errors.append(f"{node_id}: imported instances must not carry componentSetId")
    if len(document["pages"]) != len(set(document["pages"])):
        errors.append("Duplicate page IDs")
    return errors


def report(stats: dict[str, Counter], screen_count: int, pages: int, node_count: int) -> None:
    mapped = sum(stats["set"].values())
    icons = sum(stats["icon"].values())
    art = sum(stats["art"].values())
    frames = sum(stats["frame"].values())
    total = mapped + icons + art + frames
    linked = total - frames
    share = f" ({linked / total:.1%})" if total else ""
    print(
        f"Validated {screen_count} screen sections across {pages} pages; "
        f"{node_count} nodes, {pages} total pages."
    )
    print(
        f"Instances re-linked: {linked}/{total}{share} — "
        f"{mapped} to component sets, {icons} to icons, {art} rebuilt from target art"
    )
    for set_name, count in stats["set"].most_common():
        print(f"   set    {count:5d}  {set_name}")
    for base, count in stats["icon"].most_common(10):
        print(f"   icon   {count:5d}  {base!r}")
    for base, count in stats["art"].most_common(10):
        print(f"   art    {count:5d}  {base!r}")
    if frames:
        print(f"Left as frames: {frames}")
        for base, count in stats["frame"].most_common(20):
            print(f"   frame  {count:5d}  {base!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Write the new section-grouped pages to Nexa.figcraft")
    args = parser.parse_args()

    with zipfile.ZipFile(DESTINATION) as archive:
        document = json.loads(archive.read("document.json"))
        thumbnail = archive.read("thumbnail.png") if "thumbnail.png" in archive.namelist() else None
    with zipfile.ZipFile(SOURCE) as archive:
        source = json.loads(archive.read("document.json"))

    dropped_pages, dropped_nodes = strip_imported(document)
    if dropped_pages:
        print(f"Replaced {dropped_pages} previously imported pages ({dropped_nodes} nodes removed).")

    stats: dict[str, Counter] = {
        "set": Counter(),
        "icon": Counter(),
        "art": Counter(),
        "frame": Counter(),
    }
    document, count = make_pages(document, source, stats)
    errors = validate(document)
    if errors:
        raise SystemExit("\n".join(errors[:20]))
    report(stats, count, len(document["pages"]), len(document["nodes"]))
    if not args.write:
        print("Dry run only. Pass --write to update Nexa.figcraft.")
        return

    descriptor, temporary_path = tempfile.mkstemp(
        prefix="Nexa-screens-", suffix=".figcraft", dir=DESTINATION.parent
    )
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("document.json", json.dumps(document, ensure_ascii=False))
            if thumbnail:
                archive.writestr("thumbnail.png", thumbnail)
        os.replace(temporary_path, DESTINATION)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
    print(f"Updated {DESTINATION}")


if __name__ == "__main__":
    main()
