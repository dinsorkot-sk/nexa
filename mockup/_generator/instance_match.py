"""Match an imported source instance to the closest variant of a target component set.

The source mockup (`nexa - Copy.figcraft`) was built on the same Nuxt UI palette as
Nexa's own library, but its component masters were deleted, so an instance cannot be
resolved through its `component` reference.  What survives on every instance is its
rendered appearance: the root fill/stroke, the label colour and font size, the frame
size and the shape of its child tree.  Every variant of a target component set carries
the same kind of appearance, so we pick the variant whose appearance is closest.

Only the component reference is rewritten; the copied children keep the source
appearance so the screens stay pixel-faithful.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Tuple

RGBA = Tuple[float, float, float, float]


def solid_color(paints: Sequence[dict]) -> Optional[RGBA]:
    """First visible solid paint as RGBA, or None for no/unsupported paint."""
    for paint in paints or ():
        if paint.get("type") != "solid" or not paint.get("visible", True):
            continue
        color = paint.get("color") or {}
        if not color:
            continue
        return (
            float(color.get("r", 0.0)),
            float(color.get("g", 0.0)),
            float(color.get("b", 0.0)),
            float(color.get("a", 1.0)) * float(paint.get("opacity", 1.0)),
        )
    return None


def signature(nodes: Dict[str, dict], node: dict) -> dict:
    """Appearance facts shared by source instances and target variants."""
    children = list(node.get("children") or ())
    root_fill = solid_color(node.get("fills") or ())
    root_stroke = solid_color(node.get("strokes") or ())
    facts = {
        "fill": root_fill,
        "stroke": root_stroke,
        # A control can paint itself on the root (Button, Badge) or on its first
        # sub-frame (Switch's Track, Checkbox's Box).  Compare whatever carries the
        # colour on either side.
        "dominant_fill": root_fill if root_fill else _first_child_paint(nodes, children, "fills"),
        "dominant_stroke": root_stroke if root_stroke else _first_child_paint(nodes, children, "strokes"),
        "text_color": None,
        "font": 0.0,
        "texts": 0,
        "ellipses": 0,
        "instances": 0,
        "children": len(children),
        "head": sum(1 for cid in children if _slot(nodes, cid, "head")),
        "footer": sum(1 for cid in children if _slot(nodes, cid, "footer")),
        "width": float(node.get("width") or 0.0),
        "height": float(node.get("height") or 0.0),
    }
    stack = [(cid, 0) for cid in reversed(children)]
    seen = 0
    while stack and seen < 600:
        child_id, _depth = stack.pop()
        seen += 1
        child = nodes.get(str(child_id))
        if child is None:
            continue
        kind = child.get("type")
        if kind == "text":
            facts["texts"] += 1
            font = float((child.get("style") or {}).get("font_size") or 0.0)
            facts["font"] = max(facts["font"], font)
            if facts["text_color"] is None:
                facts["text_color"] = solid_color(child.get("fills") or ())
        elif kind == "ellipse":
            facts["ellipses"] += 1
        elif kind == "instance":
            facts["instances"] += 1
        stack.extend((cid2, 0) for cid2 in reversed(child.get("children") or ()))
    return facts


def _first_child_paint(nodes: Dict[str, dict], children: Iterable[int], key: str) -> Optional[RGBA]:
    """First non-text child that carries a solid fill/stroke of its own."""
    for child_id in children:
        child = nodes.get(str(child_id))
        if child is None or child.get("type") == "text":
            continue
        paint = solid_color(child.get(key) or ())
        if paint:
            return paint
    return None


def _slot(nodes: Dict[str, dict], child_id: int, slot: str) -> bool:
    """Whether a direct child is the named slot (Header/Head, Footer)."""
    child = nodes.get(str(child_id))
    return bool(child and (child.get("name") or "").lower().startswith(slot))


def variant_props(node: dict) -> Dict[str, str]:
    """`Color=Primary, Variant=Solid` -> {'Color': 'Primary', 'Variant': 'Solid'}."""
    props: Dict[str, str] = {}
    for part in (node.get("name") or "").split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            props[key.strip()] = value.strip()
    return props


# Interaction states a static screen does not really express as a variant.
TRANSIENT_STATES = frozenset({"Hover", "Focus", "Loading"})


def _color_distance(a: Optional[RGBA], b: Optional[RGBA]) -> float:
    if a is None and b is None:
        return 0.0
    if a is None or b is None:
        return 0.35
    rgb = max(abs(a[i] - b[i]) for i in range(3))
    return rgb + 0.6 * abs(a[3] - b[3])


def distance(source: dict, target: dict) -> float:
    """How far a source instance's appearance is from a target variant's."""
    score = 0.0
    score += 3.0 * _color_distance(source["dominant_fill"], target["dominant_fill"])
    score += 1.5 * _color_distance(source["dominant_stroke"], target["dominant_stroke"])
    score += 0.8 * _color_distance(source["text_color"], target["text_color"])
    score += 0.25 * abs(source["font"] - target["font"]) / 8.0
    score += 0.40 * abs(source["height"] - target["height"]) / 40.0
    score += 0.15 * abs(source["children"] - target["children"])
    score += 1.00 * abs(source["head"] - target["head"])
    score += 1.00 * abs(source["footer"] - target["footer"])
    score += 0.30 * abs(source["texts"] - target["texts"])
    score += 0.30 * abs(source["ellipses"] - target["ellipses"])
    score += 0.25 * abs(source["instances"] - target["instances"])
    return score


def variant_properties(nodes: Dict[str, dict], set_node: dict) -> Dict[str, List[str]]:
    """Property name -> ordered values, as declared by the component set's variants."""
    props: Dict[str, List[str]] = {}
    for child_id in set_node.get("children") or ():
        variant = nodes.get(str(child_id))
        if variant is None:
            continue
        for part in (variant.get("name") or "").split(","):
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            key, value = key.strip(), value.strip()
            values = props.setdefault(key, [])
            if value not in values:
                values.append(value)
    return props


class VariantIndex:
    """Variant lookup for the component sets of one document."""

    def __init__(self, nodes: Dict[str, dict]) -> None:
        self.nodes = nodes
        self._sets: Dict[str, dict] = {
            node["name"]: node
            for node in nodes.values()
            if node.get("type") == "componentSet"
        }
        self._cache: Dict[str, List[Tuple[int, dict, dict]]] = {}
        self._choices: Dict[str, str] = {}

    def has(self, set_name: str) -> bool:
        return set_name in self._sets

    def properties(self, set_name: str) -> Dict[str, List[str]]:
        return variant_properties(self.nodes, self._sets[set_name])

    def _variants(self, set_name: str) -> List[Tuple[int, dict, dict]]:
        cached = self._cache.get(set_name)
        if cached is None:
            cached = []
            for child_id in self._sets[set_name].get("children") or ():
                variant = self.nodes.get(str(child_id))
                if variant is None:
                    continue
                cached.append((child_id, variant, signature(self.nodes, variant)))
            self._cache[set_name] = cached
        return cached

    def match(self, set_name: str, source: dict, pins: Optional[Dict[str, str]] = None) -> Optional[int]:
        """Component id of the closest variant, or None when nothing matches.

        `pins` restricts the candidates to variants that carry the given properties
        (used to force a resting state after a transient state was inferred).
        """
        variants = self._variants(set_name)
        if not variants:
            return None
        best_id = None
        best_score = None
        for child_id, variant, facts in variants:
            if pins:
                props = variant_props(variant)
                if any(props.get(key) != value for key, value in pins.items()):
                    continue
            score = distance(source, facts)
            if best_score is None or score < best_score:
                best_id, best_score = child_id, score
        return best_id

    def resolve(self, set_name: str, pins: Dict[str, str]) -> Optional[int]:
        """Exact variant carrying every pinned property, or None."""
        for child_id, variant, _facts in self._variants(set_name):
            props = variant_props(variant)
            if all(props.get(key) == value for key, value in pins.items()):
                return child_id
        return None

    def resting(self, set_name: str, component_id: int) -> int:
        """Swap a hover/focus/loading variant for the same variant at rest."""
        variant = self.nodes.get(str(component_id))
        if variant is None:
            return component_id
        props = variant_props(variant)
        if props.get("State") not in TRANSIENT_STATES:
            return component_id
        if "Default" not in self.properties(set_name).get("State", ()):
            return component_id
        pins = dict(props)
        pins["State"] = "Default"
        return self.resolve(set_name, pins) or component_id


def icon_index(nodes: Dict[str, dict], page_name: str = "icon") -> Dict[str, int]:
    """Name -> component id for the icon page's components."""
    page = next(
        (node for node in nodes.values() if node.get("type") == "page" and node.get("name") == page_name),
        None,
    )
    if page is None:
        return {}
    result: Dict[str, int] = {}
    for child_id in page.get("children") or ():
        child = nodes.get(str(child_id))
        if child is not None and child.get("name"):
            result.setdefault(child["name"], child_id)
    return result


def source_icon_names(nodes: Dict[str, dict], page_name: str = "icon") -> Dict[int, str]:
    """Component id -> icon name for the source document's icon page."""
    page = next(
        (node for node in nodes.values() if node.get("type") == "page" and node.get("name") == page_name),
        None,
    )
    if page is None:
        return {}
    return {
        child["id"]: child["name"]
        for child in (nodes.get(str(cid)) for cid in page.get("children") or ())
        if child is not None
    }


def base_name(instance_name: str) -> str:
    """`Button / Import` -> `Button`; `Segment / EN` -> `Segment`."""
    name = (instance_name or "").strip()
    return name.split(" / ", 1)[0].strip() if " / " in name else name
