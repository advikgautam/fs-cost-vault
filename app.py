import csv
import stat
import io
import json
import os
import re
import shutil
import subprocess
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


def safe_folder(name):
    return re.sub(r"[^A-Za-z0-9_-]", "_", name.strip())


def load_component(folder):
    meta_path = os.path.join(VAULT_DIR, folder, "meta.json")
    if not os.path.exists(meta_path):
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_components():
    items = []
    if not os.path.exists(VAULT_DIR):
        return items
    for entry in os.listdir(VAULT_DIR):
        comp = load_component(entry)
        if comp:
            items.append(comp)
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
    return render_template("index.html", main_parts=MAIN_PARTS)


@app.route("/component/<folder>")
def component_detail(folder):
    comp = load_component(folder)
    if not comp:
        return "Component not found", 404
    return render_template("detail.html", comp=comp)


@app.route("/api/components", methods=["GET"])
def list_components():
    main_part = request.args.get("main_part", "").strip()
    q = request.args.get("q", "").strip().lower()
    items = load_all_components()

    if q:
        items = [c for c in items if q in c["name_id"].lower() or q in c["main_part"].lower()]
    elif main_part:
        items = [c for c in items if c["main_part"] == main_part]

    return jsonify(items)


@app.route("/api/components", methods=["POST"])
def add_component():
    name_id = request.form.get("name_id", "").strip()
    main_part = request.form.get("main_part", "").strip()
    description = request.form.get("description", "").strip()
    photos = request.files.getlist("photos")
    docs = request.files.getlist("documents")

    if not name_id or not main_part:
        return jsonify({"error": "Name/ID and Main Part are required."}), 400

    folder = safe_folder(name_id)
    comp_dir = os.path.join(VAULT_DIR, folder)
    if os.path.exists(os.path.join(comp_dir, "meta.json")):
        return jsonify({"error": f"Component '{name_id}' already exists."}), 400

    os.makedirs(comp_dir, exist_ok=True)

    photo_names = []
    for p in photos:
        if p and p.filename:
            pname = "PHOTO_" + secure_filename(p.filename)
            p.save(os.path.join(comp_dir, pname))
            photo_names.append(pname)

    doc_names = []
    for d in docs:
        if d and d.filename:
            fname = secure_filename(d.filename)
            d.save(os.path.join(comp_dir, fname))
            doc_names.append(fname)

    meta = {
        "folder": folder,
        "name_id": name_id,
        "main_part": main_part,
        "description": description,
        "photos": photo_names,
        "documents": doc_names,
    }
    with open(os.path.join(comp_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return jsonify({"status": "created", "folder": folder}), 201


def _remove_readonly(func, path, _):
    os.chmod(path, stat.S_IWRITE)
    func(path)


@app.route("/api/components/<folder>", methods=["DELETE"])
def delete_component(folder):
    comp_dir = os.path.join(VAULT_DIR, safe_folder(folder))
    if os.path.exists(comp_dir):
        try:
            shutil.rmtree(comp_dir, onexc=_remove_readonly)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"status": "deleted"})


@app.route("/api/git/pull", methods=["POST"])
def git_pull():
    ok, msg = run_git(["pull", "--rebase"])
    return jsonify({"ok": ok, "message": msg or "Up to date."}), (200 if ok else 500)


@app.route("/api/git/push", methods=["POST"])
def git_push():
    run_git(["add", "vault"])
    ok_c, msg_c = run_git(["commit", "-m", "Update cost report components"])
    ok_pull, msg_pull = run_git(["pull", "--rebase"])
    if not ok_pull:
        return jsonify({"ok": False, "message": f"Pull failed:\n{msg_pull}"}), 500
    ok_push, msg_push = run_git(["push"])
    if not ok_push:
        return jsonify({"ok": False, "message": f"Push failed:\n{msg_push}"}), 500
    return jsonify({"ok": True, "message": msg_push or "Synced with GitHub!"})


@app.route("/vault/<folder>/<path:filename>")
def serve_file(folder, filename):
    return send_from_directory(os.path.join(VAULT_DIR, safe_folder(folder)), filename)


@app.route("/export")
def export_csv():
    comps = load_all_components()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Main Part", "Component Name / ID", "Description", "Photos", "Documents"])
    for c in comps:
        writer.writerow([
            c["main_part"],
            c["name_id"],
            c["description"],
            ", ".join(c.get("photos", [])),
            ", ".join(c.get("documents", [])),
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=fs_cost_report.csv"},
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True, use_reloader=False)