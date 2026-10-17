"""Split the Copy mockup's screen artboards into individual Nexa FigCraft pages."""
from __future__ import annotations

import argparse
import copy
import json
import os
import tempfile
import zipfile
from pathlib import Path


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


def variant_ids(nodes: dict[str, dict]) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for node in nodes.values():
        if node.get("type") != "componentSet":
            continue
        result[node["name"]] = {
            nodes[str(child_id)]["name"]: child_id
            for child_id in children_of(node)
        }
    return result


def make_pages(document: dict, source: dict) -> tuple[dict, int]:
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
    sets = variant_ids(nodes)
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

    def append_master_art(node_id: int, parent_id: int, root_id: int,
                          root_name: str, root_transform: list,
                          root_width: float, root_height: float) -> None:
        master_id = sets["Radio" if source_nodes[str(node_id)]["name"] == "Radio" else "Checkbox"][
            RADIO_VARIANT if source_nodes[str(node_id)]["name"] == "Radio" else CHECKBOX_VARIANT
        ]
        ids = subtree_ids(nodes, master_id)
        remap = {old_id: (root_id if old_id == master_id else allocate()) for old_id in ids}
        for old_id in ids:
            copied = copy.deepcopy(nodes[str(old_id)])
            copied["id"] = remap[old_id]
            copied["parent"] = parent_id if old_id == master_id else remap[copied["parent"]]
            if copied.get("children"):
                copied["children"] = [remap[child_id] for child_id in copied["children"]]
            if old_id == master_id:
                copied["type"] = "frame"
                copied["name"] = root_name
                copied["transform"] = root_transform
                copied["width"] = root_width
                copied["height"] = root_height
                for key in ("component", "description", "props", "source", "overrides"):
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

            node_type = original.get("type")
            if node_type == "instance" and not children_of(original):
                if original["name"] not in ("Radio", "checked"):
                    raise ValueError(f"Cannot recover empty source instance {original['name']!r}")
                original_id = copied["id"]
                nodes[str(original_id)] = copied
                append_master_art(
                    old_id,
                    int(copied["parent"]),
                    original_id,
                    original["name"],
                    copied["transform"],
                    float(original.get("width", 16)),
                    float(original.get("height", 16)),
                )
                continue

            if node_type in ("instance", "component", "componentSet"):
                copied["type"] = "frame"
                for key in ("component", "description", "props", "source", "overrides"):
                    copied.pop(key, None)
            for key in ("annotations", "bound", "prototype", "source", "var_modes", "styles"):
                copied.pop(key, None)
            if isinstance(copied.get("style"), dict):
                copied["style"].pop("style_id", None)
            nodes[str(copied["id"])] = copied
        return remap[screen_id], width, height

    pages_added = 0
    for light_name, dark_name, group in PAGE_GROUPS:
        light_page = source_pages[light_name]
        dark_page = source_pages[dark_name]
        light_screens = screen_frames(light_page)
        dark_screens = screen_frames(dark_page)
        if light_screens.keys() != dark_screens.keys():
            raise ValueError(f"Light/Dark screen sets differ for {group}")

        for screen_name, light_id in light_screens.items():
            dark_id = dark_screens[screen_name]
            page_id = allocate()
            title = f"{group} · {screen_name}"
            new_page = copy.deepcopy(base_page)
            new_page.update({"id": page_id, "name": title, "children": []})
            nodes[str(page_id)] = new_page

            light_node_id, light_width, light_height = append_screen(light_id, page_id, 0, "Light")
            dark_node_id, dark_width, dark_height = append_screen(
                dark_id, page_id, light_width + 80, "Dark"
            )
            new_page["children"] = [light_node_id, dark_node_id]
            new_page["width"] = light_width + 80 + dark_width
            new_page["height"] = max(light_height, dark_height)
            pages_added += 1

    document["pages"].extend(
        int(node_id)
        for node_id, node in nodes.items()
        if node.get("type") == "page"
        and node_id not in {str(page_id) for page_id in document["pages"]}
    )
    document["next_id"] = next_id
    return document, pages_added


def validate(document: dict) -> list[str]:
    nodes = document["nodes"]
    errors: list[str] = []
    ids = set(nodes)
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
        if node.get("type") == "page" and node.get("name", "").startswith(("Login · ", "Admin · ", "User · ")):
            if len(node.get("children", [])) != 2:
                errors.append(f"{node_id}: expected Light and Dark screen frames")
            elif not all(
                " · Light" in nodes[str(child_id)]["name"]
                or " · Dark" in nodes[str(child_id)]["name"]
                for child_id in node["children"]
            ):
                errors.append(f"{node_id}: screen frame labels must identify their theme")
    if len(document["pages"]) != len(set(document["pages"])):
        errors.append("Duplicate page IDs")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Write the new screen pages to Nexa.figcraft")
    args = parser.parse_args()

    with zipfile.ZipFile(DESTINATION) as archive:
        document = json.loads(archive.read("document.json"))
        thumbnail = archive.read("thumbnail.png") if "thumbnail.png" in archive.namelist() else None
    with zipfile.ZipFile(SOURCE) as archive:
        source = json.loads(archive.read("document.json"))

    already_added = [
        document["nodes"][str(page_id)]["name"]
        for page_id in document["pages"]
        if document["nodes"][str(page_id)]["name"].startswith(("Login · ", "Admin · ", "User · "))
    ]
    if already_added:
        raise SystemExit("Screen pages are already present; refusing to duplicate them.")

    document, count = make_pages(document, source)
    errors = validate(document)
    if errors:
        raise SystemExit("\n".join(errors[:20]))
    print(
        f"Validated {count} Light/Dark screen pages; "
        f"{len(document['nodes'])} nodes, {len(document['pages'])} total pages."
    )
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
