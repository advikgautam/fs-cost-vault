(() => {
  const { escapeHtml, formatCurrency, formatBytes, formatDate, statusBadge, toast, confirmDialog } = window.VaultUI;
  const { request, uploadWithProgress } = window.VaultAPI;

  let comp = window.INITIAL_COMP;
  const folder = comp.folder;
  let activeTab = "overview";

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${activeTab}`));
    });
  });

  function renderHeader() {
    document.getElementById("hdr-name").textContent = comp.component_name;
    document.getElementById("hdr-id").textContent = comp.component_id;
    document.getElementById("hdr-subsystem").textContent = comp.main_part;
    document.getElementById("hdr-class").textContent = comp.classification;
    document.getElementById("hdr-qty").textContent = `${comp.quantity} ${comp.unit}`;
    document.getElementById("hdr-total-cost").textContent = formatCurrency(comp.total_cost);
    document.getElementById("bc-subsystem").textContent = comp.main_part;
    document.getElementById("bc-name").textContent = comp.component_name;
  }

  function docOptionsHtml(selectedVal) {
    const docs = comp.documents || [];
    return `<option value="">— None —</option>` + docs.map((d) =>
      `<option value="${escapeHtml(d)}" ${d === selectedVal ? "selected" : ""}>${escapeHtml(d)}</option>`
    ).join("");
  }

  function renderOverview() {
    const el = document.getElementById("tab-overview");
    const photos = comp.photos || [];
    el.innerHTML = `
      <div class="form-grid-2" style="gap:18px;align-items:start;">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="panel panel-padded">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <h3 style="margin:0;font-size:15px;">Component Identity &amp; Supplier</h3>
              <button type="button" class="btn btn-sm" id="open-edit-meta-btn">Edit Details</button>
            </div>
            <div class="form-grid-2" style="font-size:13px;gap:10px;">
              <div><span style="color:var(--text-secondary);">Component ID:</span><br><strong class="mono">${escapeHtml(comp.component_id)}</strong></div>
              <div><span style="color:var(--text-secondary);">Subsystem:</span><br><strong>${escapeHtml(comp.main_part)}</strong></div>
              <div><span style="color:var(--text-secondary);">Classification:</span><br><strong>${escapeHtml(comp.classification)}</strong></div>
              <div><span style="color:var(--text-secondary);">Quantity:</span><br><strong class="mono">${comp.quantity} ${escapeHtml(comp.unit)}</strong></div>
              <div><span style="color:var(--text-secondary);">Part Number:</span><br><strong>${escapeHtml(comp.part_number || "—")}</strong></div>
              <div><span style="color:var(--text-secondary);">Manufacturer:</span><br><strong>${escapeHtml(comp.manufacturer || "—")}</strong></div>
              <div><span style="color:var(--text-secondary);">Supplier / Vendor:</span><br><strong>${escapeHtml(comp.supplier || "—")}</strong></div>
              <div><span style="color:var(--text-secondary);">Last Updated:</span><br><strong>${formatDate(comp.updated_at)} (${escapeHtml(comp.updated_by || "Team")})</strong></div>
            </div>
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle);">
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Description</div>
              <div style="white-space:pre-wrap;font-size:13.5px;">${escapeHtml(comp.description || "No description added.")}</div>
            </div>
            ${(comp.technical_remarks || comp.material_specs || comp.manufacturing_notes) ? `
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle);font-size:13px;display:flex;flex-direction:column;gap:6px;">
                ${comp.material_specs ? `<div><span style="color:var(--text-secondary);">Material Specs:</span> ${escapeHtml(comp.material_specs)}</div>` : ""}
                ${comp.manufacturing_notes ? `<div><span style="color:var(--text-secondary);">Manufacturing Notes:</span> ${escapeHtml(comp.manufacturing_notes)}</div>` : ""}
                ${comp.technical_remarks ? `<div><span style="color:var(--text-secondary);">Technical Remarks:</span> ${escapeHtml(comp.technical_remarks)}</div>` : ""}
              </div>
            ` : ""}
          </div>

          <div class="panel panel-padded">
            <h3 style="margin:0 0 12px;font-size:15px;">Cost &amp; Evidence Summary</h3>
            <div class="form-grid-2" style="gap:10px;font-size:13px;">
              <div><span style="color:var(--text-secondary);">Unit Cost:</span><br><strong class="mono" style="font-size:16px;">${formatCurrency(comp.unit_cost)}</strong> <span class="calc-tag">${comp.unit_cost_is_calculated ? "Calculated" : "Manual"}</span></div>
              <div><span style="color:var(--text-secondary);">Total Cost:</span><br><strong class="mono" style="font-size:16px;color:var(--racing-red);">${formatCurrency(comp.total_cost)}</strong></div>
              <div><span style="color:var(--text-secondary);">Supporting Docs:</span><br><strong>${comp.doc_status_summary.total} file(s)</strong></div>
              <div><span style="color:var(--text-secondary);">Photos Uploaded:</span><br><strong>${(comp.photos || []).length} photo(s)</strong></div>
            </div>
          </div>
        </div>

        <div class="panel panel-padded">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="margin:0;font-size:15px;">Component Photos (${photos.length})</h3>
            <label class="btn btn-sm" style="cursor:pointer;">
              + Upload Photos
              <input type="file" id="photo-upload-input" accept="image/*" multiple style="display:none;" />
            </label>
          </div>
          <div class="photo-viewer" id="photo-viewer">
            ${photos.length ? `<img id="main-photo" src="/vault/${encodeURIComponent(folder)}/${encodeURIComponent(photos[0])}" alt="${escapeHtml(comp.component_name)}" />` : `<span style="color:var(--text-secondary);">No photos uploaded yet</span>`}
          </div>
          ${photos.length ? `
            <div class="thumb-strip">
              ${photos.map((p, idx) => `
                <div style="position:relative;flex-shrink:0;">
                  <img class="thumb-item ${idx === 0 ? "active" : ""}" src="/vault/${encodeURIComponent(folder)}/${encodeURIComponent(p)}" alt="Photo ${idx + 1}" data-photo="${escapeHtml(p)}" />
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `;

    document.getElementById("open-edit-meta-btn")?.addEventListener("click", openEditMetaModal);
    document.getElementById("photo-upload-input")?.addEventListener("change", async (e) => {
      if (!e.target.files.length) return;
      const fd = new FormData();
      for (const f of e.target.files) fd.append("photos", f);
      try {
        comp = await request(`/api/components/${encodeURIComponent(folder)}/photos`, { method: "POST", body: fd });
        toast("Photos uploaded.", "success");
        renderAll();
      } catch (err) {
        toast("Photo upload failed: " + err.message, "error");
      }
    });

    el.querySelectorAll(".thumb-item").forEach((img) => {
      img.addEventListener("click", () => {
        document.getElementById("main-photo").src = img.src;
        el.querySelectorAll(".thumb-item").forEach((t) => t.classList.remove("active"));
        img.classList.add("active");
      });
    });
  }

  function renderCostBreakdown() {
    const el = document.getElementById("tab-cost");
    const entries = comp.cost_entries || [];
    const cats = ["Material", "Purchased component", "Manufacturing", "Labour", "Additional"];

    el.innerHTML = `
      <div class="panel panel-padded" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:15px;">Detailed Cost Entries</h3>
            <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-secondary);">Link each cost line to supporting quotations, invoices, or calculation sheets. Amounts are system-calculated as Quantity × Rate.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="add-cost-entry-btn">+ Add Cost Line</button>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Qty / Unit</th>
                <th>Rate (₹)</th>
                <th>Amount (₹)</th>
                <th>Reference Document</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${entries.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:20px;">No itemized cost entries yet. Component-level totals are currently used (${formatCurrency(comp.unit_cost)} / unit).</td></tr>` : entries.map((entry, idx) => `
                <tr>
                  <td><strong>${escapeHtml(entry.category)}</strong></td>
                  <td>${escapeHtml(entry.description || "—")}</td>
                  <td class="mono">${entry.quantity} ${escapeHtml(entry.unit || "pcs")}</td>
                  <td class="mono">${formatCurrency(entry.rate)}</td>
                  <td class="mono" style="font-weight:600;">${formatCurrency(entry.amount)} <span class="calc-tag">Calc</span></td>
                  <td>${entry.ref_doc ? `<button type="button" class="btn btn-sm" onclick="DocPreview.open('${escapeHtml(folder)}','${escapeHtml(entry.ref_doc)}')">${escapeHtml(entry.ref_doc)}</button>` : `<span style="color:var(--text-muted);">None</span>`}</td>
                  <td><button type="button" class="btn btn-sm btn-danger" onclick="removeCostEntry(${idx})">Remove</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel panel-padded">
        <h3 style="margin:0 0 12px;font-size:15px;">Component Cost Summary</h3>
        <div class="form-grid-3" style="gap:10px;">
          ${cats.map((c) => `
            <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px;">
              <div style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(c)}</div>
              <div class="mono" style="font-size:15px;font-weight:700;margin-top:4px;">${formatCurrency(comp.category_totals[c] || 0)}</div>
            </div>
          `).join("")}
          <div style="background:var(--bg-surface);border:1px solid var(--racing-red);border-radius:6px;padding:10px 12px;">
            <div style="font-size:11.5px;color:var(--text-secondary);">Grand Total (${comp.quantity} ${escapeHtml(comp.unit)})</div>
            <div class="mono" style="font-size:16px;font-weight:700;margin-top:4px;color:var(--racing-red);">${formatCurrency(comp.total_cost)}</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("add-cost-entry-btn")?.addEventListener("click", openAddCostEntryModal);
  }

  window.removeCostEntry = async (idx) => {
    const next = [...(comp.cost_entries || [])];
    next.splice(idx, 1);
    await savePatch({ cost_entries: next, _history_action: "Cost Updated", _history_details: "Removed a cost breakdown line." });
  };

  function openAddCostEntryModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Add Cost Entry</h2><button type="button" class="btn btn-sm btn-icon" data-close>✕</button></div>
        <form id="cost-entry-form">
          <div class="modal-body">
            <div class="field"><label>Cost Category</label>
              <select name="category" required>
                <option value="Material">Material</option>
                <option value="Purchased component">Purchased component</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Labour">Labour</option>
                <option value="Additional">Additional</option>
              </select>
            </div>
            <div class="field"><label>Description</label><input name="description" placeholder="e.g. 7075-T6 Billet Stock" required /></div>
            <div class="form-grid-3">
              <div class="field"><label>Quantity</label><input type="number" step="any" min="0" name="quantity" value="1" required /></div>
              <div class="field"><label>Unit</label><input name="unit" value="pcs" /></div>
              <div class="field"><label>Rate (₹)</label><input type="number" step="0.01" min="0" name="rate" value="0" required /></div>
            </div>
            <div class="field"><label>Linked Reference Document</label><select name="ref_doc">${docOptionsHtml("")}</select></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Add Cost Line</button>
          </div>
        </form>
      </div>
    `;
    backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => backdrop.remove()));
    backdrop.querySelector("#cost-entry-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const qty = parseFloat(fd.get("quantity")) || 1;
      const rate = parseFloat(fd.get("rate")) || 0;
      const entry = {
        id: Date.now().toString(36),
        category: fd.get("category"),
        description: fd.get("description"),
        quantity: qty,
        unit: fd.get("unit") || "pcs",
        rate,
        amount: Math.round(qty * rate * 100) / 100,
        is_calculated: true,
        ref_doc: fd.get("ref_doc") || "",
      };
      const next = [...(comp.cost_entries || []), entry];
      backdrop.remove();
      await savePatch({ cost_entries: next, _history_action: "Cost Updated", _history_details: `Added cost line: ${entry.category} — ${entry.description}` });
    };
    document.body.appendChild(backdrop);
  }

  function renderBom() {
    const el = document.getElementById("tab-bom");
    const items = comp.bom_items || [];
    const bomTotal = items.reduce((acc, i) => acc + (Number(i.total_cost) || 0), 0);

    el.innerHTML = `
      <div class="panel panel-padded">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:15px;">Bill of Materials (BOM / CCBOM)</h3>
            <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-secondary);">Subcomponents, materials, parent-child assemblies and aggregate BOM subtotal: <strong class="mono">${formatCurrency(bomTotal)}</strong></p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="add-bom-btn">+ Add BOM Line</button>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Parent / Assembly</th>
                <th>Part / Material</th>
                <th>Specification</th>
                <th>Qty / Unit</th>
                <th>Supplier</th>
                <th>Unit Cost (₹)</th>
                <th>Subtotal (₹)</th>
                <th>Evidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.length === 0 ? `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:20px;">No BOM / CCBOM entries added yet.</td></tr>` : items.map((b, idx) => `
                <tr>
                  <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(b.parent_id || comp.component_id)}</td>
                  <td><strong>${escapeHtml(b.description)}</strong></td>
                  <td style="font-size:12px;">${escapeHtml(b.spec || "—")}</td>
                  <td class="mono">${b.quantity} ${escapeHtml(b.unit || "pcs")}</td>
                  <td>${escapeHtml(b.supplier || "—")}</td>
                  <td class="mono">${formatCurrency(b.unit_cost)}</td>
                  <td class="mono" style="font-weight:600;">${formatCurrency(b.total_cost)}</td>
                  <td>${b.ref_doc ? `<button type="button" class="btn btn-sm" onclick="DocPreview.open('${escapeHtml(folder)}','${escapeHtml(b.ref_doc)}')">${escapeHtml(b.ref_doc)}</button>` : "—"}</td>
                  <td><button type="button" class="btn btn-sm btn-danger" onclick="removeBomItem(${idx})">Remove</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById("add-bom-btn")?.addEventListener("click", openAddBomModal);
  }

  window.removeBomItem = async (idx) => {
    const next = [...(comp.bom_items || [])];
    next.splice(idx, 1);
    await savePatch({ bom_items: next, _history_action: "BOM Updated", _history_details: "Removed a BOM entry." });
  };

  function openAddBomModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Add BOM / CCBOM Entry</h2><button type="button" class="btn btn-sm btn-icon" data-close>✕</button></div>
        <form id="bom-form">
          <div class="modal-body">
            <div class="field"><label>Parent Assembly ID</label><input name="parent_id" value="${escapeHtml(comp.component_id)}" /></div>
            <div class="field"><label>Material / Part Description</label><input name="description" required /></div>
            <div class="field"><label>Specification / Grade</label><input name="spec" placeholder="e.g. Al 6061-T6 / M8x1.25 Gr 10.9" /></div>
            <div class="form-grid-3">
              <div class="field"><label>Qty</label><input type="number" step="any" min="0" name="quantity" value="1" required /></div>
              <div class="field"><label>Unit</label><input name="unit" value="pcs" /></div>
              <div class="field"><label>Unit Cost (₹)</label><input type="number" step="0.01" min="0" name="unit_cost" value="0" required /></div>
            </div>
            <div class="field"><label>Supplier</label><input name="supplier" /></div>
            <div class="field"><label>Linked Evidence Document</label><select name="ref_doc">${docOptionsHtml("")}</select></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Add BOM Line</button>
          </div>
        </form>
      </div>
    `;
    backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => backdrop.remove()));
    backdrop.querySelector("#bom-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const qty = parseFloat(fd.get("quantity")) || 1;
      const uc = parseFloat(fd.get("unit_cost")) || 0;
      const item = {
        id: Date.now().toString(36),
        parent_id: fd.get("parent_id"),
        description: fd.get("description"),
        spec: fd.get("spec"),
        quantity: qty,
        unit: fd.get("unit") || "pcs",
        supplier: fd.get("supplier"),
        unit_cost: uc,
        total_cost: Math.round(qty * uc * 100) / 100,
        ref_doc: fd.get("ref_doc") || "",
      };
      const next = [...(comp.bom_items || []), item];
      backdrop.remove();
      await savePatch({ bom_items: next, _history_action: "BOM Updated", _history_details: `Added BOM item: ${item.description}` });
    };
    document.body.appendChild(backdrop);
  }

  function renderDocuments() {
    const el = document.getElementById("tab-docs");
    const categories = window.DOC_CATEGORIES || ["Invoices and Receipts"];
    const docs = comp.documents || [];
    const dmeta = comp.document_meta || {};

    el.innerHTML = `
      <div class="panel panel-padded" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <h3 style="margin:0;font-size:15px;">Supporting Documents Repository</h3>
            <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-secondary);">Upload and manage invoices, receipts, and supporting evidence for this component.</p>
          </div>
          <div id="upload-progress-wrap" style="display:none;min-width:180px;font-size:12px;color:var(--text-secondary);"></div>
        </div>
      </div>

      ${categories.map((cat) => {
        const catDocs = docs.filter((d) => (dmeta[d]?.category || categories[0]) === cat);
        return `
          <div class="doc-category-card">
            <div class="doc-category-header">
              <div style="display:flex;align-items:center;gap:10px;">
                <strong style="font-size:14px;">${escapeHtml(cat)}</strong>
                <span class="count-pill">${catDocs.length}</span>
              </div>
              <label class="btn btn-sm" style="cursor:pointer;">
                + Upload to ${escapeHtml(cat)}
                <input type="file" class="cat-upload-input" data-category="${escapeHtml(cat)}" multiple style="display:none;" />
              </label>
            </div>
            <div>
              ${catDocs.length === 0 ? `<div style="padding:12px 16px;font-size:12.5px;color:var(--text-muted);">No documents uploaded in this category.</div>` : catDocs.map((d) => {
                const m = dmeta[d] || {};
                const canPreview = window.DocPreview.isPreviewable(d);
                const ext = (d.split(".").pop() || "").toUpperCase();
                return `
                  <div class="doc-row">
                    <div class="doc-row-main">
                      <div class="doc-row-name">${escapeHtml(d)}</div>
                      <div class="doc-row-meta">
                        ${escapeHtml(ext)} • ${formatBytes(m.size)} • Uploaded ${formatDate(m.uploaded_at)} by ${escapeHtml(m.uploader || "Team")}
                      </div>
                    </div>
                    <div class="doc-row-actions">
                      ${canPreview ? `<button type="button" class="btn btn-sm" onclick="DocPreview.open('${escapeHtml(folder)}','${escapeHtml(d)}')">Preview</button>` : ""}
                      <a class="btn btn-sm" href="/vault/${encodeURIComponent(folder)}/${encodeURIComponent(d)}" download="${escapeHtml(d)}">Download</a>
                      <button type="button" class="btn btn-sm btn-danger" onclick="deleteDoc('${escapeHtml(d)}')">Delete</button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    `;

    el.querySelectorAll(".cat-upload-input").forEach((inp) => {
      inp.addEventListener("change", async (e) => {
        if (!e.target.files.length) return;
        const fd = new FormData();
        fd.append("category", inp.dataset.category);
        for (const f of e.target.files) fd.append("documents", f);
        const prog = document.getElementById("upload-progress-wrap");
        prog.style.display = "block";
        prog.textContent = "Uploading 0%...";
        try {
          comp = await uploadWithProgress(`/api/components/${encodeURIComponent(folder)}/documents`, fd, (pct) => {
            prog.textContent = `Uploading ${pct}%...`;
          });
          toast(`Uploaded to ${inp.dataset.category}.`, "success");
          renderAll();
        } catch (err) {
          toast("Upload failed: " + err.message, "error");
        } finally {
          prog.style.display = "none";
        }
      });
    });
  }

  window.openReviewDocModal = (filename) => {
    const m = (comp.document_meta || {})[filename] || {};
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Internal Document Review</h2><button type="button" class="btn btn-sm btn-icon" data-close>✕</button></div>
        <form id="review-doc-form">
          <div class="modal-body">
            <p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">File: <strong style="color:var(--text-main);">${escapeHtml(filename)}</strong></p>
            <div class="field"><label>Internal Verification Status</label>
              <select name="status">
                <option value="Pending Review" ${m.status === "Pending Review" ? "selected" : ""}>Pending Review</option>
                <option value="Verified" ${m.status === "Verified" ? "selected" : ""}>Verified (Internally Reviewed)</option>
                <option value="Needs Attention" ${m.status === "Needs Attention" ? "selected" : ""}>Needs Attention</option>
              </select>
            </div>
            <div class="field"><label>Category</label>
              <select name="category">
                ${(window.DOC_CATEGORIES || []).map((c) => `<option value="${escapeHtml(c)}" ${m.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label>Reviewer Note (recommended if Needs Attention)</label>
              <textarea name="reviewer_note" rows="3" placeholder="Explain what is verified or what needs replacement...">${escapeHtml(m.reviewer_note || "")}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Review</button>
          </div>
        </form>
      </div>
    `;
    backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => backdrop.remove()));
    backdrop.querySelector("#review-doc-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        comp = await request(`/api/components/${encodeURIComponent(folder)}/documents/${encodeURIComponent(filename)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: fd.get("status"),
            category: fd.get("category"),
            reviewer_note: fd.get("reviewer_note"),
          }),
        });
        backdrop.remove();
        toast("Document review saved.", "success");
        renderAll();
      } catch (err) {
        toast("Failed to update document: " + err.message, "error");
      }
    };
    document.body.appendChild(backdrop);
  };

  window.deleteDoc = async (filename) => {
    const ok = await confirmDialog({
      title: "Delete Document",
      message: `Permanently delete "${filename}" from this component?`,
      confirmLabel: "Delete File",
      danger: true,
    });
    if (!ok) return;
    try {
      comp = await request(`/api/components/${encodeURIComponent(folder)}/documents/${encodeURIComponent(filename)}`, { method: "DELETE" });
      toast(`Deleted "${filename}".`, "success");
      renderAll();
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  };

  function renderManufacturing() {
    const el = document.getElementById("tab-mfg");
    const ops = comp.manufacturing_ops || [];

    el.innerHTML = `
      <div class="panel panel-padded">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:15px;">Manufacturing Operations &amp; Process Justification</h3>
            <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-secondary);">Record process steps, setup/run times, machine &amp; labour rates, and supporting process evidence.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="add-mfg-btn">+ Add Process Step</button>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Material / Machine</th>
                <th>Time (Setup + Run)</th>
                <th>Rates (Machine / Labour)</th>
                <th>Calculated Cost</th>
                <th>Evidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${ops.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:20px;">No manufacturing operations recorded.</td></tr>` : ops.map((op, idx) => {
                const hrs = ((Number(op.setup_time_min) || 0) + (Number(op.run_time_min) || 0)) / 60;
                return `
                  <tr>
                    <td><strong>${escapeHtml(op.process_name)}</strong></td>
                    <td style="font-size:12px;">${escapeHtml(op.material || "—")} ${op.material_grade ? `(${escapeHtml(op.material_grade)})` : ""}<br><span style="color:var(--text-secondary);">${escapeHtml(op.machine || "—")}</span></td>
                    <td class="mono">${op.setup_time_min}m + ${op.run_time_min}m<br><span style="font-size:11px;color:var(--text-secondary);">(${hrs.toFixed(2)} hr)</span></td>
                    <td class="mono">${formatCurrency(op.machine_rate)}/hr<br>${formatCurrency(op.labour_rate)}/hr</td>
                    <td class="mono" style="font-weight:600;">${formatCurrency(op.calculated_cost)}<br><span style="font-size:11px;color:var(--text-secondary);">+${formatCurrency(op.additional_cost)} add.</span></td>
                    <td>${op.ref_doc ? `<button type="button" class="btn btn-sm" onclick="DocPreview.open('${escapeHtml(folder)}','${escapeHtml(op.ref_doc)}')">${escapeHtml(op.ref_doc)}</button>` : "—"}</td>
                    <td><button type="button" class="btn btn-sm btn-danger" onclick="removeMfgOp(${idx})">Remove</button></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById("add-mfg-btn")?.addEventListener("click", openAddMfgModal);
  }

  window.removeMfgOp = async (idx) => {
    const next = [...(comp.manufacturing_ops || [])];
    next.splice(idx, 1);
    await savePatch({ manufacturing_ops: next, _history_action: "Manufacturing Updated", _history_details: "Removed a manufacturing process step." });
  };

  function openAddMfgModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header"><h2>Add Manufacturing Operation</h2><button type="button" class="btn btn-sm btn-icon" data-close>✕</button></div>
        <form id="mfg-form">
          <div class="modal-body">
            <div class="form-grid-2">
              <div class="field"><label>Process Name</label><input name="process_name" placeholder="e.g. 3-Axis CNC Milling" required /></div>
              <div class="field"><label>Machine</label><input name="machine" placeholder="e.g. Haas VF-2" /></div>
              <div class="field"><label>Material</label><input name="material" placeholder="e.g. Aluminium" /></div>
              <div class="field"><label>Material Grade</label><input name="material_grade" placeholder="e.g. 7075-T6" /></div>
            </div>
            <div class="form-grid-3">
              <div class="field"><label>Setup Time (min)</label><input type="number" step="any" min="0" name="setup_time_min" value="15" /></div>
              <div class="field"><label>Run Time (min)</label><input type="number" step="any" min="0" name="run_time_min" value="45" /></div>
              <div class="field"><label>Additional Cost (₹)</label><input type="number" step="0.01" min="0" name="additional_cost" value="0" /></div>
              <div class="field"><label>Machine Rate (₹/hr)</label><input type="number" step="0.01" min="0" name="machine_rate" value="800" /></div>
              <div class="field"><label>Labour Rate (₹/hr)</label><input type="number" step="0.01" min="0" name="labour_rate" value="250" /></div>
            </div>
            <div class="field"><label>Supporting Evidence Document</label><select name="ref_doc">${docOptionsHtml("")}</select></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Add Operation</button>
          </div>
        </form>
      </div>
    `;
    backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => backdrop.remove()));
    backdrop.querySelector("#mfg-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const setup = parseFloat(fd.get("setup_time_min")) || 0;
      const run = parseFloat(fd.get("run_time_min")) || 0;
      const mRate = parseFloat(fd.get("machine_rate")) || 0;
      const lRate = parseFloat(fd.get("labour_rate")) || 0;
      const addCost = parseFloat(fd.get("additional_cost")) || 0;
      const calcCost = Math.round((((setup + run) / 60) * (mRate + lRate) + addCost) * 100) / 100;
      const op = {
        id: Date.now().toString(36),
        process_name: fd.get("process_name"),
        material: fd.get("material"),
        material_grade: fd.get("material_grade"),
        machine: fd.get("machine"),
        setup_time_min: setup,
        run_time_min: run,
        machine_rate: mRate,
        labour_rate: lRate,
        additional_cost: addCost,
        calculated_cost: calcCost,
        ref_doc: fd.get("ref_doc") || "",
      };
      const next = [...(comp.manufacturing_ops || []), op];
      backdrop.remove();
      await savePatch({ manufacturing_ops: next, _history_action: "Manufacturing Updated", _history_details: `Added operation: ${op.process_name}` });
    };
    document.body.appendChild(backdrop);
  }

  function renderHistory() {
    const el = document.getElementById("tab-history");
    const hist = comp.history || [];
    el.innerHTML = `
      <div class="panel panel-padded">
        <h3 style="margin:0 0 12px;font-size:15px;">Record Audit History</h3>
        ${hist.length === 0 ? `<p style="color:var(--text-secondary);">No history events recorded yet.</p>` : `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
              <tbody>
                ${hist.map((h) => `
                  <tr>
                    <td class="mono" style="font-size:12px;white-space:nowrap;">${formatDate(h.timestamp)}</td>
                    <td><strong>${escapeHtml(h.action)}</strong></td>
                    <td>${escapeHtml(h.actor || "Team Member")}</td>
                    <td>${escapeHtml(h.details)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  function openEditMetaModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header"><h2>Edit Component Details</h2><button type="button" class="btn btn-sm btn-icon" data-close>✕</button></div>
        <form id="edit-meta-form">
          <div class="modal-body">
            <div class="form-grid-2">
              <div class="field"><label>Component Name</label><input name="component_name" value="${escapeHtml(comp.component_name)}" required /></div>
              <div class="field"><label>Subsystem</label>
                <select name="main_part">
                  ${(window.MAIN_PARTS || []).map((p) => `<option value="${escapeHtml(p)}" ${comp.main_part === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
                </select>
              </div>
              <div class="field"><label>Classification</label>
                <select name="classification">
                  ${(window.CLASSIFICATIONS || []).map((c) => `<option value="${escapeHtml(c)}" ${comp.classification === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>
              <div class="form-grid-2">
                <div class="field"><label>Quantity</label><input type="number" step="any" min="0" name="quantity" value="${comp.quantity}" /></div>
                <div class="field"><label>Unit</label><input name="unit" value="${escapeHtml(comp.unit)}" /></div>
              </div>
              <div class="field"><label>Part Number</label><input name="part_number" value="${escapeHtml(comp.part_number)}" /></div>
              <div class="field"><label>Supplier / Vendor</label><input name="supplier" value="${escapeHtml(comp.supplier)}" /></div>
              <div class="field"><label>Manufacturer</label><input name="manufacturer" value="${escapeHtml(comp.manufacturer)}" /></div>
              <div class="field"><label>Material Specifications</label><input name="material_specs" value="${escapeHtml(comp.material_specs)}" /></div>
            </div>
            <div class="field"><label>Description</label><textarea name="description" rows="3">${escapeHtml(comp.description)}</textarea></div>
            <div class="field"><label>Manufacturing Notes</label><textarea name="manufacturing_notes" rows="2">${escapeHtml(comp.manufacturing_notes)}</textarea></div>
            <div class="field"><label>Technical Remarks</label><textarea name="technical_remarks" rows="2">${escapeHtml(comp.technical_remarks)}</textarea></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => backdrop.remove()));
    backdrop.querySelector("#edit-meta-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      payload.quantity = parseFloat(payload.quantity) || 1;
      payload._history_action = "Metadata Edited";
      payload._history_details = "Updated component details and specifications.";
      backdrop.remove();
      await savePatch(payload);
    };
    document.body.appendChild(backdrop);
  }

  async function savePatch(payload) {
    try {
      comp = await request(`/api/components/${encodeURIComponent(folder)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Saved changes.", "success");
      renderAll();
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    }
  }

  document.getElementById("delete-comp-btn")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete Component",
      message: `Permanently delete "${comp.name_id}" and all associated files from the vault?`,
      confirmLabel: "Delete Component",
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/components/${encodeURIComponent(folder)}`, { method: "DELETE" });
      window.location.href = "/";
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  });

  function renderAll() {
    renderHeader();
    renderOverview();
    renderCostBreakdown();
    renderBom();
    renderDocuments();
    renderManufacturing();
    renderHistory();
  }

  renderAll();
})();
