"""Consolidate screen pages into section-grouped pages in Nexa.figcraft.

Before: each screen is a separate page ("Login · Auth / Login", "Login · Auth / Login – Error", ...)
After:  one page per group ("Login · Auth") with sections inside ("Login", "Login – Error", ...)

Sections are a new node type ``type: "section"`` — a lightweight container frame
whose children are positioned by their transforms (like a page).  This mirrors
Figma's SectionNode concept while staying within the simplified figcraft schema.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
import zipfile
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "Nexa.figcraft"
V2_BACKUP = ROOT / "Nexa.v2.figcraft"

# Vertical gap between sections within a consolidated page (matches Figma section padding).
Y_GAP = 80

# Page background colour (#f5f5f5), same as Foundations / Components pages.
PAGE_BG = {"r": 0.9607843137254902, "g": 0.9607843137254902, "b": 0.9607843137254902, "a": 1.0}

# Section fill — transparent so the page background shows through.
SECTION_FILL = {"r": 0.9607843137254902, "g": 0.9607843137254902, "b": 0.9607843137254902, "a": 1.0}


# --------------------------------------------------------------------------- IO
def load_figcraft(path: Path) -> tuple[dict, bytes | None]:
    with zipfile.ZipFile(path) as archive:
        document = json.loads(archive.read("document.json"))
        thumbnail = archive.read("thumbnail.png") if "thumbnail.png" in archive.namelist() else None
    return document, thumbnail


def write_figcraft(path: Path, document: dict, thumbnail: bytes | None = None) -> None:
    descriptor, temp_path = tempfile.mkstemp(prefix="Nexa-sections-", suffix=".figcraft", dir=path.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("document.json", json.dumps(document, ensure_ascii=False))
            if thumbnail:
                archive.writestr("thumbnail.png", thumbnail)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


# --------------------------------------------------------------------------- validation
def validate(document: dict) -> list[str]:
    """Validate document integrity: id consistency, parent/child links, pages, sections."""
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

    if len(document["pages"]) != len(set(document["pages"])):
        errors.append("Duplicate page IDs")

    for page_id in document["pages"]:
        if str(page_id) not in nodes:
            errors.append(f"Missing page node: {page_id}")
        elif nodes[str(page_id)].get("type") != "page":
            errors.append(f"Page ID {page_id} is not a page node")

    # Validate sections: each section must be on a page, contain 2 frame children (Light/Dark)
    for node_id, node in nodes.items():
        if node.get("type") == "section":
            if str(node.get("parent")) not in ids:
                errors.append(f"{node_id}: section has missing parent")
            children = node.get("children", [])
            if len(children) != 2:
                errors.append(f"{node_id}: section expected 2 children (Light/Dark), got {len(children)}")
            else:
                for c in children:
                    cn = nodes.get(str(c), {})
                    cname = cn.get("name", "")
                    if " · Light" not in cname and " · Dark" not in cname:
                        errors.append(f"{node_id}: child \"{cname}\" is not a Light/Dark screen frame")

    return errors


# --------------------------------------------------------------------------- core logic
def consolidate(document: dict) -> dict:
    """Reorganise screen pages into consolidated pages with sections.

    Returns a summary dict with statistics.
    """
    nodes = document["nodes"]
    pages = list(document["pages"])

    # 1. Separate screen pages (pattern "Group / Screen") from structural pages.
    screen_pages: list[tuple[int, str]] = []
    keepalive_pages: list[int] = []

    for page_id in pages:
        page = nodes[str(page_id)]
        name = page.get("name", "")
        if page.get("type") == "page" and " / " in name:
            screen_pages.append((page_id, name))
        else:
            keepalive_pages.append(page_id)

    # 2. Group screen pages by category prefix (preserving first-seen order).
    groups: OrderedDict[str, list[tuple[int, str]]] = OrderedDict()
    for page_id, name in screen_pages:
        category, _, screen = name.partition(" / ")
        groups.setdefault(category, []).append((page_id, screen))

    # 3. Find a template page (deep-copied for each consolidated page).
    template_page: dict | None = None
    for v in nodes.values():
        if isinstance(v, dict) and v.get("type") == "page" and v.get("name") == "Foundations":
            template_page = copy.deepcopy(v)
            break

    # 4. Allocate IDs and build sections.
    next_id = max(int(document.get("next_id", 1)), max(int(k) for k in nodes)) + 1

    new_pages: list[int] = list(keepalive_pages)
    screen_count = 0

    for category, screens in groups.items():
        page_id = next_id
        next_id += 1

        new_page = copy.deepcopy(template_page)
        new_page["id"] = page_id
        new_page["name"] = category
        new_page["children"] = []
        new_page["width"] = 0.0
        new_page["height"] = 0.0
        nodes[str(page_id)] = new_page

        section_ids: list[int] = []
        cumulative_y = 0.0
        max_width = 0.0

        for screen_id, screen_name in screens:
            old_page = nodes[str(screen_id)]
            old_children = old_page.get("children", [])

            screen_width = float(old_page.get("width", 0))
            screen_height = float(old_page.get("height", 0))

            # Create the section node.
            section_id = next_id
            next_id += 1

            section = {
                "id": section_id,
                "name": screen_name,
                "type": "section",
                "parent": page_id,
                "children": list(old_children),
                "transform": [1.0, 0.0, 0.0, 1.0, 0.0, cumulative_y],
                "width": screen_width,
                "height": screen_height,
                "fills": [{"type": "solid", "color": dict(SECTION_FILL), "opacity": 1.0, "visible": True, "blend": "normal"}],
                "bound": {},
            }
            nodes[str(section_id)] = section
            section_ids.append(section_id)

            # Re-parent the screen frames to the section.
            for child_id in old_children:
                nodes[str(child_id)]["parent"] = section_id

            cumulative_y += screen_height + Y_GAP
            max_width = max(max_width, screen_width)
            screen_count += 1

            # Remove the old screen page node (children now belong to the section).
            del nodes[str(screen_id)]

        new_page["children"] = section_ids
        new_page["width"] = float(max_width)
        new_page["height"] = float(cumulative_y - Y_GAP) if cumulative_y > Y_GAP else 0.0

        new_pages.append(page_id)

    document["pages"] = new_pages
    document["next_id"] = next_id

    return {
        "old_page_count": len(pages),
        "new_page_count": len(new_pages),
        "screen_count": screen_count,
        "group_count": len(groups),
        "node_count": len(nodes),
        "groups": {k: len(v) for k, v in groups.items()},
    }


def main() -> None:
    import shutil

    document, thumbnail = load_figcraft(DESTINATION)
    errors = validate(document)
    if errors:
        raise SystemExit(f"Pre-consolidation validation errors:\n" + "\n".join(errors[:20]))

    summary = consolidate(document)

    if summary["screen_count"] == 0:
        # Already consolidated — nothing to do.
        print(
            f"Already consolidated: {summary['old_page_count']} pages, "
            f"{summary['group_count']} groups, {summary['node_count']} nodes. "
            f"No changes written."
        )
        return

    errors = validate(document)
    if errors:
        raise SystemExit(f"Post-consolidation validation errors:\n" + "\n".join(errors[:20]))

    print(f"Consolidated {summary['old_page_count']} pages → {summary['new_page_count']} pages")
    print(f"  {summary['screen_count']} screens into {summary['group_count']} groups:")
    for g, n in summary["groups"].items():
        print(f"    \"{g}\" — {n} sections")
    print(f"  {summary['node_count']} total nodes, next_id={document['next_id']}")
    print("Validation: 0 errors")

    # Backup current (pre-consolidation) state before writing.
    shutil.copy2(DESTINATION, V2_BACKUP)
    write_figcraft(DESTINATION, document, thumbnail)
    print(f"Updated {DESTINATION}")
    print(f"Backup saved to {V2_BACKUP}")


if __name__ == "__main__":
    main()
