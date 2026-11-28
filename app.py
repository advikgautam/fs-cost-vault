import csv
import datetime
import io
import json
import os
import re
import shutil
import stat
import subprocess
import uuid
import zipfile
from flask import Flask, Response, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VAULT_DIR = os.path.join(BASE_DIR, "vault")

os.makedirs(VAULT_DIR, exist_ok=True)

MAIN_PARTS = [
    "Body & Aero",
    "Brakes",
    "Suspension",
    "Frame & Chassis",
    "Powertrain",
    "Electrical",
    "Steering",
    "Wheels & Tires",
    "Misc",
]

SUBSYSTEM_META = {
    "Body & Aero": {"prefix": "BA", "description": "Aerodynamic surfaces, bodywork, wings, undertray and fairings."},
    "Brakes": {"prefix": "BR", "description": "Master cylinders, calipers, rotors, brake lines and pedal assembly."},
    "Suspension": {"prefix": "SU", "description": "Uprights, A-arms, pushrods, dampers, springs and anti-roll bars."},
    "Frame & Chassis": {"prefix": "FR", "description": "Tubular spaceframe / monocoque, impact attenuator and mounting tabs."},
    "Powertrain": {"prefix": "PT", "description": "Motor / engine, drivetrain, mounts, cooling and transmission."},
    "Electrical": {"prefix": "EL", "description": "Accumulator, BMS, shutdown circuit, wiring harness and sensors."},
    "Steering": {"prefix": "ST", "description": "Steering wheel, quick release, column, rack and tie rods."},
    "Wheels & Tires": {"prefix": "WT", "description": "Wheel rims, tires, hubs, wheel nuts and valve assemblies."},
    "Misc": {"prefix": "MS", "description": "Safety equipment, fasteners, consumables and miscellaneous items."},
}

DOC_CATEGORIES = [
    "Invoices and Receipts",
]

DOC_STATUSES = ["Pending Review", "Verified", "Needs Attention"]

CLASSIFICATIONS = [
    "Purchased",
    "Manufactured",
    "Modified purchased",
    "Custom fabricated",
    "Standard catalogue component",
]


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def safe_folder(name):
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", (name or "").strip())
    return cleaned or "component"


def subsystem_folder(main_part):
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", (main_part or "Misc").strip()).strip("_")
    return cleaned or "Misc"


def ensure_subsystem_folders():
    os.makedirs(VAULT_DIR, exist_ok=True)
    for part in MAIN_PARTS:
        sdir = os.path.join(VAULT_DIR, subsystem_folder(part))
        os.makedirs(sdir, exist_ok=True)


def find_component_dir(folder, main_part=None):
    folder = safe_folder(folder)
    if main_part:
        candidate = os.path.join(VAULT_DIR, subsystem_folder(main_part), folder)
        if os.path.exists(os.path.join(candidate, "meta.json")):
            return candidate
    for part in MAIN_PARTS:
        candidate = os.path.join(VAULT_DIR, subsystem_folder(part), folder)
        if os.path.exists(os.path.join(candidate, "meta.json")):
            return candidate
    legacy = os.path.join(VAULT_DIR, folder)
    if os.path.exists(os.path.join(legacy, "meta.json")):
        return legacy
    return None


def target_component_dir(folder, main_part):
    return os.path.join(VAULT_DIR, subsystem_folder(main_part), safe_folder(folder))


def _to_float(val, default=0.0):
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _compute_costs(meta):
    qty = max(_to_float(meta.get("quantity"), 1.0), 0.0)
    costs = meta.get("costs") or {}
    cost_entries = meta.get("cost_entries") or []

    cat_totals = {
        "Material": 0.0,
        "Purchased component": 0.0,
        "Manufacturing": 0.0,
        "Labour": 0.0,
        "Additional": 0.0,
    }

    if cost_entries:
        for entry in cost_entries:
            e_qty = _to_float(entry.get("quantity"), 1.0)
            e_rate = _to_float(entry.get("rate"), 0.0)
            is_calc = entry.get("is_calculated", True)
            amt = round(e_qty * e_rate, 2) if is_calc else round(_to_float(entry.get("amount"), 0.0), 2)
            entry["amount"] = amt
            cat = entry.get("category", "Additional")
            if cat in cat_totals:
                cat_totals[cat] = round(cat_totals[cat] + amt, 2)
            else:
                cat_totals["Additional"] = round(cat_totals["Additional"] + amt, 2)
        unit_cost = round(sum(cat_totals.values()), 2)
        unit_cost_is_calculated = True
    else:
        m = _to_float(costs.get("material"), 0.0)
        p = _to_float(costs.get("purchased"), 0.0)
        mfg = _to_float(costs.get("manufacturing"), 0.0)
        lab = _to_float(costs.get("labour"), 0.0)
        add = _to_float(costs.get("additional"), 0.0)
        cat_totals = {
            "Material": round(m, 2),
            "Purchased component": round(p, 2),
            "Manufacturing": round(mfg, 2),
            "Labour": round(lab, 2),
            "Additional": round(add, 2),
        }
        override = costs.get("unit_cost_override")
        if override is not None and override != "":
            unit_cost = round(_to_float(override, 0.0), 2)
            unit_cost_is_calculated = False
        else:
            unit_cost = round(m + p + mfg + lab + add, 2)
            unit_cost_is_calculated = True

    total_cost = round(unit_cost * qty, 2)
    return {
        "unit_cost": unit_cost,
        "total_cost": total_cost,
        "unit_cost_is_calculated": unit_cost_is_calculated,
        "category_totals": cat_totals,
    }


def _compute_doc_summary(meta):
    docs = meta.get("documents") or []
    doc_meta = meta.get("document_meta") or {}
    verified = 0
    pending = 0
    needs_attention = 0
    for d in docs:
        st = (doc_meta.get(d) or {}).get("status", "Pending Review")
        if st == "Verified":
            verified += 1
        elif st == "Needs Attention":
            needs_attention += 1
        else:
            pending += 1

    total = len(docs)
    if needs_attention > 0:
        overall = "Needs Attention"
    elif total == 0:
        overall = "Missing Evidence"
    elif pending > 0:
        overall = "Pending Review"
    else:
        overall = "Verified"

    return {
        "total": total,
        "verified": verified,
        "pending": pending,
        "needs_attention": needs_attention,
        "overall_status": overall,
    }


def normalize_component(meta, folder_name=None):
    if not meta:
        return None
    folder = meta.get("folder") or folder_name or ""
    name_id = (meta.get("name_id") or "").strip()
    component_id = (meta.get("component_id") or "").strip()
    component_name = (meta.get("component_name") or "").strip()

    if not component_id and name_id:
        parts = name_id.split(" ", 1)
        component_id = parts[0]
        if not component_name:
            component_name = parts[1] if len(parts) > 1 else name_id
    if not component_name:
        component_name = name_id or folder
    if not name_id:
        name_id = f"{component_id} {component_name}".strip() if component_id and component_id != component_name else component_name

    docs = list(meta.get("documents") or [])
    photos = list(meta.get("photos") or [])
    doc_meta = dict(meta.get("document_meta") or {})
    comp_dir = find_component_dir(folder, meta.get("main_part")) or target_component_dir(folder, meta.get("main_part") or "Misc")

    for d in docs:
        if d not in doc_meta:
            fpath = os.path.join(comp_dir, d)
            fsize = os.path.getsize(fpath) if os.path.exists(fpath) else 0
            doc_meta[d] = {
                "category": DOC_CATEGORIES[0],
                "size": fsize,
                "uploaded_at": meta.get("updated_at") or meta.get("created_at") or "",
                "uploader": meta.get("updated_by") or "Team Member",
                "status": "Pending Review",
                "reviewer_note": "",
                "linked_to": "",
            }
        else:
            entry = doc_meta[d]
            if entry.get("status") not in DOC_STATUSES:
                entry["status"] = "Pending Review"
            if entry.get("category") not in DOC_CATEGORIES:
                entry["category"] = DOC_CATEGORIES[0]
            if not entry.get("size") and os.path.exists(os.path.join(comp_dir, d)):
                entry["size"] = os.path.getsize(os.path.join(comp_dir, d))

    costs_raw = meta.get("costs") or {}
    normalized = {
        "folder": folder,
        "name_id": name_id,
        "component_id": component_id or folder,
        "component_name": component_name,
        "main_part": meta.get("main_part") or "Misc",
        "description": meta.get("description") or "",
        "quantity": _to_float(meta.get("quantity"), 1.0),
        "unit": meta.get("unit") or "pcs",
        "part_number": meta.get("part_number") or "",
        "manufacturer": meta.get("manufacturer") or "",
        "supplier": meta.get("supplier") or "",
        "classification": meta.get("classification") if meta.get("classification") in CLASSIFICATIONS else "Purchased",
        "costs": {
            "material": _to_float(costs_raw.get("material"), 0.0),
            "manufacturing": _to_float(costs_raw.get("manufacturing"), 0.0),
            "labour": _to_float(costs_raw.get("labour"), 0.0),
            "purchased": _to_float(costs_raw.get("purchased"), 0.0),
            "additional": _to_float(costs_raw.get("additional"), 0.0),
            "unit_cost_override": costs_raw.get("unit_cost_override"),
        },
        "cost_entries": list(meta.get("cost_entries") or []),
        "bom_items": list(meta.get("bom_items") or []),
        "manufacturing_ops": list(meta.get("manufacturing_ops") or []),
        "technical_remarks": meta.get("technical_remarks") or "",
        "manufacturing_notes": meta.get("manufacturing_notes") or "",
        "material_specs": meta.get("material_specs") or "",
        "internal_comments": meta.get("internal_comments") or "",
        "reference_links": meta.get("reference_links") or "",
        "photos": photos,
        "documents": docs,
        "document_meta": doc_meta,
        "history": list(meta.get("history") or []),
        "created_at": meta.get("created_at") or "",
        "updated_at": meta.get("updated_at") or meta.get("created_at") or "",
        "updated_by": meta.get("updated_by") or "Team Member",
    }

    cost_calc = _compute_costs(normalized)
    normalized["unit_cost"] = cost_calc["unit_cost"]
    normalized["total_cost"] = cost_calc["total_cost"]
    normalized["unit_cost_is_calculated"] = cost_calc["unit_cost_is_calculated"]
    normalized["category_totals"] = cost_calc["category_totals"]
    normalized["doc_status_summary"] = _compute_doc_summary(normalized)
    return normalized


def summarize_component(comp):
    return {
        "folder": comp["folder"],
        "name_id": comp["name_id"],
        "component_id": comp["component_id"],
        "component_name": comp["component_name"],
        "main_part": comp["main_part"],
        "classification": comp["classification"],
        "supplier": comp["supplier"],
        "quantity": comp["quantity"],
        "unit": comp["unit"],
        "unit_cost": comp["unit_cost"],
        "total_cost": comp["total_cost"],
        "doc_status_summary": comp["doc_status_summary"],
        "photo_count": len(comp["photos"]),
        "doc_count": len(comp["documents"]),
        "updated_at": comp["updated_at"],
        "updated_by": comp["updated_by"],
    }


def save_component(folder, meta):
    comp_dir = find_component_dir(folder, meta.get("main_part")) or target_component_dir(folder, meta.get("main_part") or "Misc")
    os.makedirs(comp_dir, exist_ok=True)
    with open(os.path.join(comp_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def append_history(meta, action, details, actor="Team Member"):
    history = list(meta.get("history") or [])
    history.insert(0, {
        "id": str(uuid.uuid4())[:8],
        "timestamp": now_iso(),
        "action": action,
        "actor": actor,
        "details": details,
    })
    meta["history"] = history[:200]
    meta["updated_at"] = now_iso()
    meta["updated_by"] = actor


def load_component(folder):
    comp_dir = find_component_dir(folder)
    if not comp_dir:
        return None
    meta_path = os.path.join(comp_dir, "meta.json")
    with open(meta_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return normalize_component(raw, folder)


def load_all_components():
    items = []
    seen = set()
    if not os.path.exists(VAULT_DIR):
        return items
    for entry in os.listdir(VAULT_DIR):
        entry_path = os.path.join(VAULT_DIR, entry)
        if not os.path.isdir(entry_path):
            continue
        if os.path.exists(os.path.join(entry_path, "meta.json")):
            comp = load_component(entry)
            if comp and comp["folder"] not in seen:
                items.append(comp)
                seen.add(comp["folder"])
        else:
            for sub_entry in os.listdir(entry_path):
                sub_path = os.path.join(entry_path, sub_entry)
                if os.path.isdir(sub_path) and os.path.exists(os.path.join(sub_path, "meta.json")):
                    with open(os.path.join(sub_path, "meta.json"), "r", encoding="utf-8") as f:
                        raw = json.load(f)
                    comp = normalize_component(raw, sub_entry)
                    if comp and comp["folder"] not in seen:
                        items.append(comp)
                        seen.add(comp["folder"])
    items.sort(key=lambda x: x["name_id"].lower())
    return items


def run_git(args):
    res = subprocess.run(
        ["git"] + args,
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
    )
    return res.returncode == 0, (res.stdout + "\n" + res.stderr).strip()


@app.route("/")
def index():
    return render_template(
        "index.html",
        main_parts=MAIN_PARTS,
        subsystem_meta=SUBSYSTEM_META,
        classifications=CLASSIFICATIONS,
        doc_categories=DOC_CATEGORIES,
    )


@app.route("/component/<folder>")
def component_detail(folder):
    comp = load_component(folder)
    if not comp:
        return "Component not found", 404
    return render_template(
        "detail.html",
        comp=comp,
        main_parts=MAIN_PARTS,
        classifications=CLASSIFICATIONS,
        doc_categories=DOC_CATEGORIES,
        doc_statuses=DOC_STATUSES,
    )


@app.route("/api/overview", methods=["GET"])
def api_overview():
    comps = load_all_components()
    total_vehicle_cost = round(sum(c["total_cost"] for c in comps), 2)
    docs_uploaded = sum(c["doc_status_summary"]["total"] for c in comps)
    verified_docs = sum(c["doc_status_summary"]["verified"] for c in comps)
    pending_docs = sum(c["doc_status_summary"]["pending"] for c in comps)
    needs_attention_docs = sum(c["doc_status_summary"]["needs_attention"] for c in comps)

    subsystems = []
    for part in MAIN_PARTS:
        sub_comps = [c for c in comps if c["main_part"] == part]
        sub_cost = round(sum(c["total_cost"] for c in sub_comps), 2)
        sub_verified = sum(c["doc_status_summary"]["verified"] for c in sub_comps)
        sub_pending = sum(c["doc_status_summary"]["pending"] for c in sub_comps)
        sub_attention = sum(c["doc_status_summary"]["needs_attention"] for c in sub_comps)
        sub_missing = sum(1 for c in sub_comps if c["doc_status_summary"]["total"] == 0)
        subsystems.append({
            "name": part,
            "prefix": SUBSYSTEM_META[part]["prefix"],
            "description": SUBSYSTEM_META[part]["description"],
            "component_count": len(sub_comps),
            "total_cost": sub_cost,
            "verified_docs": sub_verified,
            "pending_docs": sub_pending,
            "needs_attention_docs": sub_attention,
            "missing_docs_components": sub_missing,
        })

    return jsonify({
        "metrics": {
            "total_components": len(comps),
            "total_vehicle_cost": total_vehicle_cost,
            "documents_uploaded": docs_uploaded,
            "verified_docs": verified_docs,
            "pending_verification": pending_docs + needs_attention_docs,
            "pending_docs": pending_docs,
            "needs_attention_docs": needs_attention_docs,
        },
        "subsystems": subsystems,
    })


@app.route("/api/components", methods=["GET"])
def list_components():
    main_part = request.args.get("main_part", "").strip()
    q = request.args.get("q", "").strip().lower()
    status_filter = request.args.get("status", "").strip()
    class_filter = request.args.get("classification", "").strip()
    sort_by = request.args.get("sort", "name").strip()
    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 100) or 100), 1), 500)

    items = load_all_components()

    if q:
        items = [
            c for c in items
            if q in c["name_id"].lower()
            or q in c["component_id"].lower()
            or q in c["component_name"].lower()
            or q in c["main_part"].lower()
            or q in c["description"].lower()
            or q in c["supplier"].lower()
        ]
    elif main_part:
        items = [c for c in items if c["main_part"] == main_part]

    if status_filter:
        items = [c for c in items if c["doc_status_summary"]["overall_status"] == status_filter]
    if class_filter:
        items = [c for c in items if c["classification"] == class_filter]

    if sort_by == "id":
        items.sort(key=lambda x: x["component_id"].lower())
    elif sort_by == "cost_desc":
        items.sort(key=lambda x: x["total_cost"], reverse=True)
    elif sort_by == "cost_asc":
        items.sort(key=lambda x: x["total_cost"])
    elif sort_by == "updated":
        items.sort(key=lambda x: x["updated_at"], reverse=True)
    else:
        items.sort(key=lambda x: x["component_name"].lower())

    total = len(items)
    start = (page - 1) * per_page
    paged = items[start:start + per_page]

    # Return array directly when no pagination params requested for backward compatibility,
    # or paginated envelope if `paginated=1` is passed.
    summaries = [summarize_component(c) for c in paged]
    if request.args.get("paginated") == "1":
        return jsonify({
            "items": summaries,
            "total": total,
            "page": page,
            "per_page": per_page,
        })
    return jsonify(summaries)


@app.route("/api/components", methods=["POST"])
def add_component():
    if request.is_json:
        data = request.get_json(silent=True) or {}
        component_id = (data.get("component_id") or "").strip()
        component_name = (data.get("component_name") or "").strip()
        name_id = (data.get("name_id") or "").strip()
        main_part = (data.get("main_part") or "").strip()
        description = (data.get("description") or "").strip()
        photos = []
        docs = []
    else:
        data = request.form
        component_id = (data.get("component_id") or "").strip()
        component_name = (data.get("component_name") or "").strip()
        name_id = (data.get("name_id") or "").strip()
        main_part = (data.get("main_part") or "").strip()
        description = (data.get("description") or "").strip()
        photos = request.files.getlist("photos")
        docs = request.files.getlist("documents")

    if not name_id:
        if component_id and component_name:
            name_id = f"{component_id} {component_name}".strip()
        elif component_id or component_name:
            name_id = component_id or component_name

    if not name_id or not main_part:
        return jsonify({"error": "Component ID / Name and Subsystem are required."}), 400

    folder = safe_folder(component_id or name_id)
    if find_component_dir(folder):
        return jsonify({"error": f"Component '{component_id or name_id}' already exists."}), 400

    ensure_subsystem_folders()
    comp_dir = target_component_dir(folder, main_part)
    os.makedirs(comp_dir, exist_ok=True)
    ts = now_iso()
    actor = (data.get("updated_by") or "Team Member").strip() or "Team Member"

    photo_names = []
    for p in photos:
        if p and p.filename:
            pname = "PHOTO_" + secure_filename(p.filename)
            p.save(os.path.join(comp_dir, pname))
            photo_names.append(pname)

    doc_category = data.get("doc_category") if data.get("doc_category") in DOC_CATEGORIES else DOC_CATEGORIES[0]
    doc_names = []
    doc_meta = {}
    for d in docs:
        if d and d.filename:
            fname = secure_filename(d.filename)
            fpath = os.path.join(comp_dir, fname)
            d.save(fpath)
            doc_names.append(fname)
            doc_meta[fname] = {
                "category": doc_category,
                "size": os.path.getsize(fpath),
                "uploaded_at": ts,
                "uploader": actor,
                "status": "Pending Review",
                "reviewer_note": "",
                "linked_to": "",
            }

    unit_override = data.get("unit_cost_override")
    costs = {
        "material": _to_float(data.get("material_cost"), 0.0),
        "manufacturing": _to_float(data.get("manufacturing_cost"), 0.0),
        "labour": _to_float(data.get("labour_cost"), 0.0),
        "purchased": _to_float(data.get("purchased_cost"), 0.0),
        "additional": _to_float(data.get("additional_cost"), 0.0),
        "unit_cost_override": _to_float(unit_override) if unit_override not in (None, "") else None,
    }

    meta = {
        "folder": folder,
        "name_id": name_id,
        "component_id": component_id or name_id.split(" ")[0],
        "component_name": component_name or name_id,
        "main_part": main_part,
        "description": description,
        "quantity": _to_float(data.get("quantity"), 1.0),
        "unit": (data.get("unit") or "pcs").strip() or "pcs",
        "part_number": (data.get("part_number") or "").strip(),
        "manufacturer": (data.get("manufacturer") or "").strip(),
        "supplier": (data.get("supplier") or "").strip(),
        "classification": data.get("classification") if data.get("classification") in CLASSIFICATIONS else "Purchased",
        "costs": costs,
        "cost_entries": [],
        "bom_items": [],
        "manufacturing_ops": [],
        "technical_remarks": (data.get("technical_remarks") or "").strip(),
        "manufacturing_notes": (data.get("manufacturing_notes") or "").strip(),
        "material_specs": (data.get("material_specs") or "").strip(),
        "internal_comments": (data.get("internal_comments") or "").strip(),
        "reference_links": (data.get("reference_links") or "").strip(),
        "photos": photo_names,
        "documents": doc_names,
        "document_meta": doc_meta,
        "history": [{
            "id": str(uuid.uuid4())[:8],
            "timestamp": ts,
            "action": "Created",
            "actor": actor,
            "details": f"Component '{name_id}' created under {main_part}.",
        }],
        "created_at": ts,
        "updated_at": ts,
        "updated_by": actor,
    }
    save_component(folder, meta)
    return jsonify({"status": "created", "folder": folder, "component": summarize_component(normalize_component(meta, folder))}), 201


@app.route("/api/components/<folder>", methods=["GET"])
def get_component_api(folder):
    comp = load_component(safe_folder(folder))
    if not comp:
        return jsonify({"error": "Component not found"}), 404
    return jsonify(comp)


@app.route("/api/components/<folder>", methods=["PUT"])
def update_component(folder):
    folder = safe_folder(folder)
    comp = load_component(folder)
    if not comp:
        return jsonify({"error": "Component not found"}), 404

    data = request.get_json(silent=True) or {}
    actor = (data.get("updated_by") or "Team Member").strip() or "Team Member"

    editable_str_fields = [
        "component_id", "component_name", "name_id", "main_part", "description",
        "unit", "part_number", "manufacturer", "supplier", "classification",
        "technical_remarks", "manufacturing_notes", "material_specs",
        "internal_comments", "reference_links",
    ]
    for field in editable_str_fields:
        if field in data and data[field] is not None:
            comp[field] = str(data[field]).strip()

    if "component_id" in data or "component_name" in data:
        if not data.get("name_id"):
            comp["name_id"] = f"{comp['component_id']} {comp['component_name']}".strip()

    if "quantity" in data:
        comp["quantity"] = max(_to_float(data["quantity"], 1.0), 0.0)

    if "costs" in data and isinstance(data["costs"], dict):
        c = data["costs"]
        comp["costs"] = {
            "material": _to_float(c.get("material"), comp["costs"]["material"]),
            "manufacturing": _to_float(c.get("manufacturing"), comp["costs"]["manufacturing"]),
            "labour": _to_float(c.get("labour"), comp["costs"]["labour"]),
            "purchased": _to_float(c.get("purchased"), comp["costs"]["purchased"]),
            "additional": _to_float(c.get("additional"), comp["costs"]["additional"]),
            "unit_cost_override": _to_float(c["costs_override"]) if c.get("costs_override") not in (None, "") else (
                _to_float(c["unit_cost_override"]) if c.get("unit_cost_override") not in (None, "") else None
            ),
        }

    if "cost_entries" in data and isinstance(data["cost_entries"], list):
        comp["cost_entries"] = data["cost_entries"]
    if "bom_items" in data and isinstance(data["bom_items"], list):
        comp["bom_items"] = data["bom_items"]
    if "manufacturing_ops" in data and isinstance(data["manufacturing_ops"], list):
        comp["manufacturing_ops"] = data["manufacturing_ops"]

    old_dir = find_component_dir(folder, comp.get("main_part"))
    action_label = data.get("_history_action") or "Updated"
    action_details = data.get("_history_details") or "Component details updated."
    append_history(comp, action_label, action_details, actor)
    new_dir = target_component_dir(folder, comp.get("main_part") or "Misc")
    if old_dir and os.path.abspath(old_dir) != os.path.abspath(new_dir):
        os.makedirs(os.path.dirname(new_dir), exist_ok=True)
        shutil.move(old_dir, new_dir)
    save_component(folder, comp)
    return jsonify(normalize_component(comp, folder))


def _remove_readonly(func, path, _):
    os.chmod(path, stat.S_IWRITE)
    func(path)


@app.route("/api/components/<folder>", methods=["DELETE"])
def delete_component(folder):
    comp_dir = find_component_dir(folder)
    if comp_dir and os.path.exists(comp_dir):
        try:
            try:
                shutil.rmtree(comp_dir, onexc=_remove_readonly)
            except TypeError:
                shutil.rmtree(comp_dir, onerror=_remove_readonly)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"status": "deleted"})


@app.route("/api/components/<folder>/documents", methods=["POST"])
def upload_documents(folder):
    folder = safe_folder(folder)
    comp = load_component(folder)
    if not comp:
        return jsonify({"error": "Component not found"}), 404

    files = request.files.getlist("documents")
    category = request.form.get("category", DOC_CATEGORIES[0])
    if category not in DOC_CATEGORIES:
        category = DOC_CATEGORIES[0]
    linked_to = (request.form.get("linked_to") or "").strip()
    actor = (request.form.get("uploader") or "Team Member").strip() or "Team Member"

    if not files:
        return jsonify({"error": "No files selected."}), 400

    comp_dir = find_component_dir(folder, comp.get("main_part")) or target_component_dir(folder, comp.get("main_part") or "Misc")
    os.makedirs(comp_dir, exist_ok=True)
    ts = now_iso()
    uploaded = []

    for f in files:
        if f and f.filename:
            fname = secure_filename(f.filename)
            # Prevent silent overwrite by appending counter if filename already exists
            base, ext = os.path.splitext(fname)
            candidate = fname
            counter = 1
            while os.path.exists(os.path.join(comp_dir, candidate)):
                candidate = f"{base}_{counter}{ext}"
                counter += 1
            fpath = os.path.join(comp_dir, candidate)
            f.save(fpath)
            if candidate not in comp["documents"]:
                comp["documents"].append(candidate)
            comp["document_meta"][candidate] = {
                "category": category,
                "size": os.path.getsize(fpath),
                "uploaded_at": ts,
                "uploader": actor,
                "status": "Pending Review",
                "reviewer_note": "",
                "linked_to": linked_to,
            }
            uploaded.append(candidate)

    if uploaded:
        append_history(comp, "Document Uploaded", f"Uploaded {len(uploaded)} file(s) to {category}: {', '.join(uploaded)}", actor)
        save_component(folder, comp)

    return jsonify(normalize_component(comp, folder)), 201


@app.route("/api/components/<folder>/documents/<path:filename>", methods=["PATCH"])
def update_document_meta(folder, filename):
    folder = safe_folder(folder)
    comp = load_component(folder)
    if not comp:
        return jsonify({"error": "Component not found"}), 404
    if filename not in comp["documents"]:
        return jsonify({"error": "Document not found"}), 404

    data = request.get_json(silent=True) or {}
    actor = (data.get("actor") or "Reviewer").strip() or "Reviewer"
    meta = comp["document_meta"].get(filename, {})

    changes = []
    if "status" in data and data["status"] in DOC_STATUSES:
        old_st = meta.get("status", "Pending Review")
        meta["status"] = data["status"]
        if old_st != data["status"]:
            changes.append(f"status {old_st} → {data['status']}")
    if "category" in data and data["category"] in DOC_CATEGORIES:
        meta["category"] = data["category"]
        changes.append(f"category → {data['category']}")
    if "reviewer_note" in data:
        meta["reviewer_note"] = str(data["reviewer_note"] or "").strip()
        if meta["reviewer_note"]:
            changes.append(f"note: \"{meta['reviewer_note']}\"")
    if "linked_to" in data:
        meta["linked_to"] = str(data["linked_to"] or "").strip()

    comp["document_meta"][filename] = meta
    append_history(comp, "Document Reviewed", f"{filename}: {', '.join(changes) or 'metadata updated'}", actor)
    save_component(folder, comp)
    return jsonify(normalize_component(comp, folder))


@app.route("/api/components/<folder>/documents/<path:filename>", methods=["DELETE"])
def delete_document(folder, filename):
    folder = safe_folder(folder)
    comp = load_component(folder)
    if not comp:
        return jsonify({"error": "Component not found"}), 404

    comp_dir = find_component_dir(folder, comp.get("main_part"))
    fpath = os.path.join(comp_dir, filename) if comp_dir else ""
    if fpath and os.path.exists(fpath):
        os.remove(fpath)

    if filename in comp["documents"]:
        comp["documents"].remove(filename)
        comp["document_meta"].pop(filename, None)
        append_history(comp, "Document Deleted", f"Deleted document '{filename}'.")
    elif filename in comp["photos"]:
        comp["photos"].remove(filename)
        append_history(comp, "Photo Deleted", f"Deleted photo '{filename}'.")

    save_component(folder, comp)
    return jsonify(normalize_component(comp, folder))


@app.route("/api/components/<folder>/photos", methods=["POST"])
def upload_photos(folder):
    folder = safe_folder(folder)
    comp = load_component(folder)
    if not comp:
        return jsonify({"error": "Component not found"}), 404

    photos = request.files.getlist("photos")
    if not photos:
        return jsonify({"error": "No photos selected."}), 400

    comp_dir = find_component_dir(folder, comp.get("main_part")) or target_component_dir(folder, comp.get("main_part") or "Misc")
    os.makedirs(comp_dir, exist_ok=True)
    added = []
    for p in photos:
        if p and p.filename:
            pname = "PHOTO_" + secure_filename(p.filename)
            p.save(os.path.join(comp_dir, pname))
            if pname not in comp["photos"]:
                comp["photos"].append(pname)
            added.append(pname)

    if added:
        append_history(comp, "Photo Uploaded", f"Added {len(added)} photo(s): {', '.join(added)}")
        save_component(folder, comp)
    return jsonify(normalize_component(comp, folder)), 201


@app.route("/api/git/pull", methods=["POST"])
def git_pull():
    ok, msg = run_git(["pull", "--rebase"])
    count = len(load_all_components())
    return jsonify({
        "ok": ok,
        "message": msg or "Up to date.",
        "records": count,
        "timestamp": now_iso(),
    }), (200 if ok else 500)


@app.route("/api/git/push", methods=["POST"])
def git_push():
    run_git(["add", "vault"])
    ok_c, msg_c = run_git(["commit", "-m", "Update cost report components"])
    ok_pull, msg_pull = run_git(["pull", "--rebase"])
    if not ok_pull:
        return jsonify({"ok": False, "message": f"Pull failed:\n{msg_pull}", "timestamp": now_iso()}), 500
    ok_push, msg_push = run_git(["push"])
    if not ok_push:
        return jsonify({"ok": False, "message": f"Push failed:\n{msg_push}", "timestamp": now_iso()}), 500
    count = len(load_all_components())
    return jsonify({
        "ok": True,
        "message": msg_push or "Synced with GitHub!",
        "records": count,
        "timestamp": now_iso(),
    })


@app.route("/vault/<folder>/<path:filename>")
def serve_file(folder, filename):
    comp_dir = find_component_dir(folder)
    if not comp_dir:
        return "Component not found", 404
    return send_from_directory(comp_dir, filename)


@app.route("/export")
def export_csv():
    main_part = request.args.get("main_part", "").strip()
    comps = load_all_components()
    if main_part:
        comps = [c for c in comps if c["main_part"] == main_part]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Main Part", "Component ID", "Component Name", "Classification",
        "Quantity", "Unit", "Unit Cost (INR)", "Total Cost (INR)",
        "Document Status", "Supplier", "Description", "Photos", "Documents",
    ])
    for c in comps:
        writer.writerow([
            c["main_part"],
            c["component_id"],
            c["component_name"],
            c["classification"],
            c["quantity"],
            c["unit"],
            c["unit_cost"],
            c["total_cost"],
            c["doc_status_summary"]["overall_status"],
            c["supplier"],
            c["description"],
            ", ".join(c.get("photos", [])),
            ", ".join(c.get("documents", [])),
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=fs_cost_report.csv"},
    )


def _cat_folder_name(category):
    mapping = {
        "Invoices and Receipts": "Invoices_and_Receipts",
    }
    return mapping.get(category, "Invoices_and_Receipts")


@app.route("/export/package")
def export_package():
    main_part = request.args.get("main_part", "").strip()
    folder_filter = request.args.get("folder", "").strip()
    comps = load_all_components()
    if folder_filter:
        comps = [c for c in comps if c["folder"] == safe_folder(folder_filter)]
    elif main_part:
        comps = [c for c in comps if c["main_part"] == main_part]

    buf = io.BytesIO()
    root_dir = "FORMULA_BHARAT_2027_COST_REPORT"
    manifest = {
        "generated_at": now_iso(),
        "scope": folder_filter or main_part or "Complete Vehicle",
        "component_count": len(comps),
        "components": [],
    }

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for c in comps:
            try:
                sub_idx = MAIN_PARTS.index(c["main_part"]) + 1
            except ValueError:
                sub_idx = 9
            sub_slug = re.sub(r"[^A-Za-z0-9]+", "_", c["main_part"]).strip("_").upper()
            sub_dir = f"{sub_idx:02d}_{sub_slug}"
            comp_slug = safe_folder(f"{c['component_id']}_{c['component_name']}")
            comp_root = f"{root_dir}/{sub_dir}/{comp_slug}"

            # Cost breakdown CSV per component
            cost_csv = io.StringIO()
            cw = csv.writer(cost_csv)
            cw.writerow(["Category", "Description", "Quantity", "Unit", "Rate (INR)", "Amount (INR)", "Reference Document"])
            if c["cost_entries"]:
                for e in c["cost_entries"]:
                    cw.writerow([
                        e.get("category", ""), e.get("description", ""), e.get("quantity", 1),
                        e.get("unit", ""), e.get("rate", 0), e.get("amount", 0), e.get("ref_doc", ""),
                    ])
            else:
                for cat_name, amt in c["category_totals"].items():
                    cw.writerow([cat_name, "Component level", c["quantity"], c["unit"], amt, round(amt * c["quantity"], 2), ""])
            zf.writestr(f"{comp_root}/Cost_Breakdown.csv", cost_csv.getvalue())

            # Component metadata JSON
            zf.writestr(f"{comp_root}/Component_Details.json", json.dumps(c, indent=2))

            # Original supporting documents organized by category
            comp_disk_dir = find_component_dir(c["folder"], c.get("main_part")) or os.path.join(VAULT_DIR, c["folder"])
            doc_records = []
            for d in c["documents"]:
                dmeta = c["document_meta"].get(d, {})
                cat_dir = _cat_folder_name(dmeta.get("category", "Other"))
                disk_path = os.path.join(comp_disk_dir, d)
                arc_path = f"{comp_root}/{cat_dir}/{d}"
                if os.path.exists(disk_path):
                    zf.write(disk_path, arc_path)
                doc_records.append({
                    "filename": d,
                    "category": dmeta.get("category", "Other"),
                    "status": dmeta.get("status", "Pending Review"),
                    "linked_to": dmeta.get("linked_to", ""),
                    "archive_path": arc_path,
                })

            for p in c["photos"]:
                disk_path = os.path.join(comp_disk_dir, p)
                if os.path.exists(disk_path):
                    zf.write(disk_path, f"{comp_root}/Photos/{p}")

            manifest["components"].append({
                "component_id": c["component_id"],
                "component_name": c["component_name"],
                "subsystem": c["main_part"],
                "unit_cost": c["unit_cost"],
                "total_cost": c["total_cost"],
                "documents": doc_records,
            })

        zf.writestr(f"{root_dir}/manifest.json", json.dumps(manifest, indent=2))

    buf.seek(0)
    dl_name = "FB2027_Cost_Report_Package.zip"
    if folder_filter and comps:
        dl_name = f"FB2027_{safe_folder(comps[0]['component_id'])}.zip"
    elif main_part:
        dl_name = f"FB2027_{safe_folder(main_part)}.zip"

    return Response(
        buf.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f"attachment; filename={dl_name}"},
    )


@app.route("/export/summary")
def export_summary():
    comps = load_all_components()
    total_vehicle_cost = round(sum(c["total_cost"] for c in comps), 2)
    return render_template(
        "report_summary.html",
        components=comps,
        main_parts=MAIN_PARTS,
        total_vehicle_cost=total_vehicle_cost,
        generated_at=now_iso(),
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True, use_reloader=False)
