import json, zipfile, shutil, os
import figlib
from figlib import DOC


def validate(nodes, pages):
    errs = []
    ids = set(nodes)
    for k, n in nodes.items():
        if str(n['id']) != k:
            errs.append(f'id mismatch {k}')
        for c in n.get('children', []):
            if str(c) not in ids:
                errs.append(f'{k}: missing child {c}')
            elif nodes[str(c)].get('parent') != n['id']:
                errs.append(f'{k}: child {c} parent mismatch {nodes[str(c)].get("parent")}')
        if n['type'] != 'page' and 'parent' in n and str(n['parent']) not in ids:
            errs.append(f'{k}: missing parent')
        if n['type'] == 'instance' and str(n['component']) not in ids:
            errs.append(f'{k}: instance component missing {n["component"]}')
        if 'source' in n and str(n['source']) not in ids:
            errs.append(f'{k}: source missing {n["source"]}')
        for pk, pv in (n.get('props') or {}).items():
            if pv.get('type') == 'instanceSwap' and str(pv['default']) not in ids:
                errs.append(f'{k}: swap default missing')
    for p in pages:
        if str(p) not in ids:
            errs.append(f'page {p} missing')
    return errs


def write(path, pages, current_page, thumbnail_from=None):
    d = DOC
    nodes = {}
    for p in pages:
        nodes.update(figlib.serialize(p, {}, False))
    doc = {'format': 'figcraft', 'version': 1, 'imageIndex': [], 'name': 'Nexa',
           'pages': [p.id for p in pages], 'nodes': nodes, 'next_id': d.next_id, 'styles': d.styles,
           'variables': {'collections': d.collections, 'variables': list(d.vars.values())},
           'current_page': current_page.id, 'document_colors': [], 'comments': []}
    errs = validate(nodes, doc['pages'])
    return doc, errs


def save(doc, path, thumbnail_bytes):
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('document.json', json.dumps(doc, ensure_ascii=False))
        if thumbnail_bytes:
            z.writestr('thumbnail.png', thumbnail_bytes)
    os.replace(tmp, path)
