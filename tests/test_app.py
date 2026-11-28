import html as html_lib
import io
import json
import os
import zipfile
import pytest

import app as cost_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    vault_dir = tmp_path / "vault"
    vault_dir.mkdir()
    monkeypatch.setattr(cost_app, "VAULT_DIR", str(vault_dir))
    cost_app.app.config["TESTING"] = True
    with cost_app.app.test_client() as c:
        yield c


def test_dashboard_and_overview(client):
    res = client.get("/")
    assert res.status_code == 200
    html = html_lib.unescape(res.get_data(as_text=True))
    assert "Cost Report Supporting Documents Interface" in html
    assert "Formula Bharat 2027" in html
    assert "amrita-racing-logo.png" in html
    assert "formula-bharat-logo.png" in html
    for part in cost_app.MAIN_PARTS:
        assert part in html

    ov = client.get("/api/overview").get_json()
    assert ov["metrics"]["total_components"] == 0
    assert len(ov["subsystems"]) == 9


def test_component_lifecycle_costs_docs_and_exports(client):
    # Create component with initial document
    res = client.post(
        "/api/components",
        data={
            "component_id": "PT-01",
            "component_name": "Motor Mount",
            "main_part": "Powertrain",
            "quantity": "2",
            "unit": "pcs",
            "classification": "Manufactured",
            "material_cost": "500",
            "manufacturing_cost": "300",
            "documents": (io.BytesIO(b"quote pdf bytes"), "vendor_quote.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 201
    folder = res.get_json()["folder"]
    # Verify component is stored under its subsystem folder
    assert os.path.exists(os.path.join(cost_app.VAULT_DIR, "Powertrain", folder, "meta.json"))
    assert os.path.exists(os.path.join(cost_app.VAULT_DIR, "Powertrain", folder, "vendor_quote.pdf"))

    # Duplicate ID is rejected
    dup = client.post(
        "/api/components",
        json={"component_id": "PT-01", "component_name": "Motor Mount", "main_part": "Powertrain"},
    )
    assert dup.status_code == 400

    # List endpoint returns concise payload with calculated totals
    listed = client.get("/api/components?main_part=Powertrain").get_json()
    assert len(listed) == 1
    assert listed[0]["unit_cost"] == 800.0
    assert listed[0]["total_cost"] == 1600.0
    # Uploaded doc must default to Pending Review, never Verified
    assert listed[0]["doc_status_summary"]["overall_status"] == "Pending Review"

    # Detail page renders 200
    detail_html = client.get(f"/component/{folder}").get_data(as_text=True)
    assert "Motor Mount" in detail_html
    assert "Cost Breakdown" in detail_html
    assert "BOM / CCBOM" in detail_html

    # Update document metadata
    patch_res = client.patch(
        f"/api/components/{folder}/documents/vendor_quote.pdf",
        json={"category": "Invoices and Receipts"},
    )
    assert patch_res.status_code == 200
    comp_data = patch_res.get_json()
    assert comp_data["document_meta"]["vendor_quote.pdf"]["category"] == "Invoices and Receipts"

    # Update cost entries & BOM
    put_res = client.put(
        f"/api/components/{folder}",
        json={
            "cost_entries": [
                {"category": "Material", "description": "Al 7075", "quantity": 2, "unit": "kg", "rate": 450, "is_calculated": True}
            ],
            "bom_items": [
                {"description": "7075 Billet", "quantity": 2, "unit": "kg", "unit_cost": 450, "total_cost": 900}
            ],
        },
    )
    assert put_res.status_code == 200
    updated = put_res.get_json()
    assert updated["unit_cost"] == 900.0
    assert updated["total_cost"] == 1800.0

    # Exports
    csv_res = client.get("/export")
    assert csv_res.status_code == 200
    assert "PT-01" in csv_res.get_data(as_text=True)

    sum_res = client.get("/export/summary")
    assert sum_res.status_code == 200
    assert "Motor Mount" in sum_res.get_data(as_text=True)

    zip_res = client.get("/export/package")
    assert zip_res.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(zip_res.data))
    names = zf.namelist()
    assert "FORMULA_BHARAT_2027_COST_REPORT/manifest.json" in names
    assert any("Invoices_and_Receipts/vendor_quote.pdf" in n for n in names)

    # Delete component
    del_res = client.delete(f"/api/components/{folder}")
    assert del_res.status_code == 200
    assert client.get(f"/api/components/{folder}").status_code == 404
