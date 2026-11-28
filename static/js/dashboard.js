(() => {
  const { escapeHtml, formatCurrency, formatDate, statusBadge, subsystemIcon, toast, confirmDialog } = window.VaultUI;
  const { request } = window.VaultAPI;

  const state = {
    mode: "subsystem", // "overview" | "subsystem" | "search"
    currentSubsystem: window.INITIAL_SUBSYSTEM || "Body & Aero",
    searchQuery: "",
    statusFilter: "",
    classFilter: "",
    sortBy: "name",
    page: 1,
    perPage: 25,
    overview: null,
    searchAbort: null,
  };

  // DOM refs
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const searchInput = document.getElementById("search-input");
  const workspaceEl = document.getElementById("workspace-content");
  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");

  function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.add("open");
    mobileMenuBtn.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("open");
    mobileMenuBtn.setAttribute("aria-expanded", "false");
  }

  mobileMenuBtn?.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  sidebarBackdrop?.addEventListener("click", closeSidebar);

  // Keyboard shortcut Ctrl+K for search
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput?.focus();
    }
    if (e.key === "Escape") {
      exportMenu?.classList.remove("open");
      closeSidebar();
      closeAddModal();
    }
  });

  // Export dropdown toggle
  exportBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("open");
  });
  document.addEventListener("click", () => exportMenu?.classList.remove("open"));

  async function refreshOverview() {
    try {
      const data = await request("/api/overview");
      state.overview = data;
      renderSidebarCounts(data);
      if (state.mode === "overview") {
        renderOverview(data);
      }
    } catch (err) {
      toast("Failed to load overview summary: " + err.message, "error");
    }
  }

  function renderSidebarCounts(overview) {
    if (!overview) return;
    const totalEl = document.getElementById("nav-count-overview");
    if (totalEl) totalEl.textContent = overview.metrics.total_components;

    overview.subsystems.forEach((s) => {
      const badge = document.querySelector(`[data-sub-count="${CSS.escape(s.name)}"]`);
      if (badge) badge.textContent = s.component_count;
    });
  }

  function setActiveNav(key) {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.navKey === key);
    });
  }

  window.selectOverview = async () => {
    state.mode = "overview";
    state.searchQuery = "";
    if (searchInput) searchInput.value = "";
    setActiveNav("overview");
    closeSidebar();
    if (!state.overview) {
      workspaceEl.innerHTML = renderSkeleton();
      await refreshOverview();
    } else {
      renderOverview(state.overview);
    }
  };

  window.selectSubsystem = async (name) => {
    state.mode = "subsystem";
    state.currentSubsystem = name;
    state.searchQuery = "";
    state.page = 1;
    if (searchInput) searchInput.value = "";
    setActiveNav(name);
    closeSidebar();
    await loadComponents();
  };

  function renderSkeleton() {
    return `
      <div class="panel panel-padded">
        <div class="skeleton" style="height:24px;width:240px;margin-bottom:12px;"></div>
        <div class="skeleton" style="height:14px;width:360px;margin-bottom:20px;"></div>
        <div class="skeleton" style="height:160px;width:100%;"></div>
      </div>
    `;
  }

  function renderOverview(data) {
    const m = data.metrics;
    const maxCost = Math.max(...data.subsystems.map((s) => s.total_cost), 1);

    workspaceEl.innerHTML = `
      <div class="workspace-header">
        <div>
          <div class="workspace-title-row">
            <h2 class="workspace-title">Vehicle Cost Report Overview</h2>
            <span class="count-pill">Formula Bharat 2027</span>
          </div>
          <p class="workspace-desc">Vehicle-wide cost summary, internal documentation progress and subsystem readiness.</p>
        </div>
        <button type="button" class="btn btn-primary" onclick="openAddModal()">+ Add Component</button>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Components</div>
          <div class="metric-value">${m.total_components}</div>
          <div class="metric-sub">Across 9 vehicle subsystems</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Vehicle Cost</div>
          <div class="metric-value">${formatCurrency(m.total_vehicle_cost)}</div>
          <div class="metric-sub">Sum of registered component costs</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Documents Uploaded</div>
          <div class="metric-value">${m.documents_uploaded}</div>
          <div class="metric-sub">Invoices, receipts &amp; evidence</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Active Subsystems</div>
          <div class="metric-value">${data.subsystems.filter((s) => s.component_count > 0).length} / 9</div>
          <div class="metric-sub">Subsystems with registered parts</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Subsystem</th>
              <th>Components</th>
              <th>Total Cost</th>
              <th>Cost Share</th>
              <th>Missing Docs</th>
            </tr>
          </thead>
          <tbody>
            ${data.subsystems.map((s) => {
              const pct = maxCost > 0 ? Math.round((s.total_cost / maxCost) * 100) : 0;
              return `
                <tr style="cursor:pointer;" onclick="selectSubsystem('${escapeHtml(s.name)}')">
                  <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="color:var(--text-secondary);display:flex;">${subsystemIcon(s.name)}</span>
                      <div>
                        <div style="font-weight:600;">${escapeHtml(s.name)}</div>
                        <div style="font-size:11.5px;color:var(--text-secondary);">Prefix: ${escapeHtml(s.prefix)}</div>
                      </div>
                    </div>
                  </td>
                  <td class="mono">${s.component_count}</td>
                  <td class="mono">${formatCurrency(s.total_cost)}</td>
                  <td style="min-width:120px;">
                    <div class="dist-bar-track" title="${pct}% of highest subsystem">
                      <div class="dist-bar-fill" style="width:${pct}%"></div>
                    </div>
                  </td>
                  <td class="mono" style="color:${s.missing_docs_components > 0 ? "var(--status-attention-text)" : "var(--text-secondary)"};">
                    ${s.missing_docs_components} part(s)
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadComponents() {
    workspaceEl.innerHTML = renderSkeleton();
    const params = new URLSearchParams({
      paginated: "1",
      page: String(state.page),
      per_page: String(state.perPage),
      sort: state.sortBy,
    });
    if (state.mode === "search" && state.searchQuery) {
      params.set("q", state.searchQuery);
    } else {
      params.set("main_part", state.currentSubsystem);
    }
    if (state.statusFilter) params.set("status", state.statusFilter);
    if (state.classFilter) params.set("classification", state.classFilter);

    if (state.searchAbort) state.searchAbort.abort();
    state.searchAbort = new AbortController();

    try {
      const data = await request(`/api/components?${params.toString()}`, {
        signal: state.searchAbort.signal,
      });
      renderSubsystemWorkspace(data.items, data.total);
    } catch (err) {
      if (err.name === "AbortError") return;
      workspaceEl.innerHTML = `
        <div class="empty-state">
          <h3>Could Not Load Components</h3>
          <p>${escapeHtml(err.message)}</p>
          <button type="button" class="btn btn-primary" onclick="selectSubsystem('${escapeHtml(state.currentSubsystem)}')">Retry</button>
        </div>
      `;
    }
  }

  function renderSubsystemWorkspace(items, total) {
    const isSearch = state.mode === "search";
    const subInfo = (window.SUBSYSTEM_META || {})[state.currentSubsystem] || {};
    const title = isSearch ? `Search Results for "${state.searchQuery}"` : state.currentSubsystem;
    const desc = isSearch
      ? "Matching components across all nine Formula Bharat 2027 subsystems."
      : (subInfo.description || `Components, cost breakdowns and supporting documents for ${state.currentSubsystem}.`);

    const totalPages = Math.max(1, Math.ceil(total / state.perPage));

    workspaceEl.innerHTML = `
      <div class="workspace-header">
        <div>
          <div class="workspace-title-row">
            <h2 class="workspace-title">${escapeHtml(title)}</h2>
            <span class="count-pill">${total} Component${total === 1 ? "" : "s"}</span>
          </div>
          <p class="workspace-desc">${escapeHtml(desc)}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${!isSearch ? `<a class="btn btn-sm" href="/export/package?main_part=${encodeURIComponent(state.currentSubsystem)}">Export Subsystem ZIP</a>` : ""}
          <button type="button" class="btn btn-primary btn-sm" onclick="openAddModal()">+ Add Component</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-group">
          <label class="sr-only" for="filter-class">Filter by classification</label>
          <select id="filter-class" class="select-control">
            <option value="">All Classifications</option>
            ${(window.CLASSIFICATIONS || []).map((c) => `<option value="${escapeHtml(c)}" ${state.classFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>

        <div class="filter-group">
          <label for="sort-select" style="font-size:12px;color:var(--text-secondary);">Sort:</label>
          <select id="sort-select" class="select-control">
            <option value="name" ${state.sortBy === "name" ? "selected" : ""}>Name (A–Z)</option>
            <option value="id" ${state.sortBy === "id" ? "selected" : ""}>Component ID</option>
            <option value="cost_desc" ${state.sortBy === "cost_desc" ? "selected" : ""}>Total Cost (High–Low)</option>
            <option value="cost_asc" ${state.sortBy === "cost_asc" ? "selected" : ""}>Total Cost (Low–High)</option>
            <option value="updated" ${state.sortBy === "updated" ? "selected" : ""}>Last Updated</option>
          </select>
        </div>
      </div>

      ${items.length === 0 ? renderEmptyState(isSearch) : renderComponentList(items, total, totalPages)}
    `;

    document.getElementById("filter-status")?.addEventListener("change", (e) => {
      state.statusFilter = e.target.value;
      state.page = 1;
      loadComponents();
    });
    document.getElementById("filter-class")?.addEventListener("change", (e) => {
      state.classFilter = e.target.value;
      state.page = 1;
      loadComponents();
    });
    document.getElementById("sort-select")?.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      state.page = 1;
      loadComponents();
    });
  }

  function renderEmptyState(isSearch) {
    if (isSearch || state.statusFilter || state.classFilter) {
      return `
        <div class="empty-state">
          <h3>No Matching Components</h3>
          <p>Try clearing your search query or filters to see components in this subsystem.</p>
          <button type="button" class="btn" onclick="resetFilters()">Reset Filters</button>
        </div>
      `;
    }
    return `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--racing-red)" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="var(--border)"/>
          <path d="M7 9h10M7 13h6M7 17h4" stroke="var(--text-secondary)" stroke-linecap="round"/>
          <circle cx="17" cy="15" r="3" fill="var(--bg-main)" stroke="var(--racing-red)"/>
        </svg>
        <h3>No Components Added Yet</h3>
        <p>Add a component to attach cost data, BOM / CCBOM information and supporting documents for the ${escapeHtml(state.currentSubsystem)} subsystem.</p>
        <button type="button" class="btn btn-primary" onclick="openAddModal()">+ Add Component</button>
        <div class="feature-cues">
          <span class="feature-cue">Cost Breakup</span>
          <span class="feature-cue">BOM / CCBOM</span>
          <span class="feature-cue">Supporting Docs (PDF / Drawings)</span>
          <span class="feature-cue">Manufacturing Evidence</span>
        </div>
      </div>
    `;
  }

  window.resetFilters = () => {
    state.statusFilter = "";
    state.classFilter = "";
    state.searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (state.mode === "search") state.mode = "subsystem";
    loadComponents();
  };

  function renderComponentList(items, total, totalPages) {
    const desktopTable = `
      <div class="table-container desktop-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Component ID</th>
              <th>Component Name</th>
              <th>Qty / Unit</th>
              <th>Unit Cost</th>
              <th>Total Cost</th>
              <th>Files</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((c) => `
              <tr>
                <td class="mono" style="font-weight:600;">${escapeHtml(c.component_id)}</td>
                <td>
                  <a class="comp-link" href="/component/${encodeURIComponent(c.folder)}">${escapeHtml(c.component_name)}</a>
                  <div style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(c.classification)}${c.main_part && state.mode === "search" ? " • " + escapeHtml(c.main_part) : ""}</div>
                </td>
                <td class="mono">${c.quantity} ${escapeHtml(c.unit)}</td>
                <td class="mono">${formatCurrency(c.unit_cost)}</td>
                <td class="mono" style="font-weight:600;">${formatCurrency(c.total_cost)}</td>
                <td style="font-size:12px;color:var(--text-secondary);">${c.doc_count} doc(s), ${c.photo_count} photo(s)</td>
                <td style="font-size:12px;color:var(--text-secondary);">${formatDate(c.updated_at)}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <a class="btn btn-sm" href="/component/${encodeURIComponent(c.folder)}">View</a>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deleteComponentFromList('${escapeHtml(c.folder)}', '${escapeHtml(c.name_id)}')">Delete</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    const mobileCards = `
      <div class="mobile-cards">
        ${items.map((c) => `
          <div class="comp-mobile-card">
            <div class="comp-mobile-top">
              <div>
                <div class="mono" style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(c.component_id)}</div>
                <a class="comp-link" href="/component/${encodeURIComponent(c.folder)}" style="font-size:15px;">${escapeHtml(c.component_name)}</a>
              </div>
              <span class="count-pill">${c.doc_count} doc(s)</span>
            </div>
            <div class="comp-mobile-meta">
              <div>Qty: <strong class="mono">${c.quantity} ${escapeHtml(c.unit)}</strong></div>
              <div>Total: <strong class="mono">${formatCurrency(c.total_cost)}</strong></div>
              <div>Docs: <strong>${c.doc_count}</strong> • Photos: <strong>${c.photo_count}</strong></div>
              <div>Updated: ${formatDate(c.updated_at)}</div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <a class="btn btn-sm" href="/component/${encodeURIComponent(c.folder)}">Open Details</a>
              <button type="button" class="btn btn-sm btn-danger" onclick="deleteComponentFromList('${escapeHtml(c.folder)}', '${escapeHtml(c.name_id)}')">Delete</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    const pagination = totalPages > 1 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap;gap:10px;">
        <span style="font-size:12.5px;color:var(--text-secondary);">Page ${state.page} of ${totalPages} (${total} total)</span>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-sm" ${state.page <= 1 ? "disabled" : ""} onclick="changePage(${state.page - 1})">Previous</button>
          <button type="button" class="btn btn-sm" ${state.page >= totalPages ? "disabled" : ""} onclick="changePage(${state.page + 1})">Next</button>
        </div>
      </div>
    ` : "";

    return desktopTable + mobileCards + pagination;
  }

  window.changePage = (p) => {
    state.page = p;
    loadComponents();
  };

  window.deleteComponentFromList = async (folder, label) => {
    const ok = await confirmDialog({
      title: "Delete Component",
      message: `Are you sure you want to permanently delete "${label}" and all its uploaded documents and photos?`,
      confirmLabel: "Delete Component",
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/components/${encodeURIComponent(folder)}`, { method: "DELETE" });
      toast(`Deleted "${label}".`, "success");
      await refreshOverview();
      await loadComponents();
    } catch (err) {
      toast("Delete failed: " + err.message, "error");
    }
  };

  // Debounced search (300ms)
  let searchTimer = null;
  searchInput?.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (!q) {
        state.mode = "subsystem";
        state.searchQuery = "";
        setActiveNav(state.currentSubsystem);
        loadComponents();
        return;
      }
      state.mode = "search";
      state.searchQuery = q;
      state.page = 1;
      setActiveNav("");
      loadComponents();
    }, 300);
  });

  // Add Component Modal
  const addModal = document.getElementById("add-modal");
  const addForm = document.getElementById("add-form");
  const docsInput = document.getElementById("f-docs");
  const photosInput = document.getElementById("f-photos");
  let queuedDocs = [];
  let queuedPhotos = [];

  function renderQueuedFiles(listEl, files, kind) {
    if (!listEl) return;
    if (!files.length) {
      listEl.innerHTML = "";
      return;
    }
    listEl.innerHTML = files.map((f, idx) => `
      <div class="queued-file-item">
        <span class="queued-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span style="display:flex;align-items:center;gap:6px;">
          <span class="queued-file-meta">${window.VaultUI.formatBytes(f.size)}</span>
          <button type="button" class="btn btn-sm btn-icon" style="min-width:22px;min-height:22px;font-size:11px;" aria-label="Remove ${escapeHtml(f.name)}" onclick="removeQueuedFile('${kind}', ${idx})">✕</button>
        </span>
      </div>
    `).join("");
  }

  window.removeQueuedFile = (kind, idx) => {
    if (kind === "docs") {
      queuedDocs.splice(idx, 1);
      renderQueuedFiles(document.getElementById("queued-docs-list"), queuedDocs, "docs");
    } else {
      queuedPhotos.splice(idx, 1);
      renderQueuedFiles(document.getElementById("queued-photos-list"), queuedPhotos, "photos");
    }
  };

  docsInput?.addEventListener("change", (e) => {
    for (const f of e.target.files) {
      if (!queuedDocs.some((x) => x.name === f.name && x.size === f.size)) {
        queuedDocs.push(f);
      }
    }
    e.target.value = "";
    renderQueuedFiles(document.getElementById("queued-docs-list"), queuedDocs, "docs");
  });

  photosInput?.addEventListener("change", (e) => {
    for (const f of e.target.files) {
      if (!queuedPhotos.some((x) => x.name === f.name && x.size === f.size)) {
        queuedPhotos.push(f);
      }
    }
    e.target.value = "";
    renderQueuedFiles(document.getElementById("queued-photos-list"), queuedPhotos, "photos");
  });

  function updateModalCostPreview() {
    if (!addForm) return;
    const qty = Math.max(parseFloat(addForm.quantity.value) || 1, 0);
    const mat = parseFloat(addForm.material_cost.value) || 0;
    const mfg = parseFloat(addForm.manufacturing_cost.value) || 0;
    const lab = parseFloat(addForm.labour_cost.value) || 0;
    const pur = parseFloat(addForm.purchased_cost.value) || 0;
    const add = parseFloat(addForm.additional_cost.value) || 0;
    const overrideRaw = addForm.unit_cost_override.value.trim();
    const unitCost = overrideRaw !== "" ? (parseFloat(overrideRaw) || 0) : (mat + mfg + lab + pur + add);
    const totalCost = unitCost * qty;

    const unitEl = document.getElementById("calc-unit-cost");
    const totalEl = document.getElementById("calc-total-cost");
    const modeEl = document.getElementById("calc-unit-mode");
    if (unitEl) unitEl.textContent = formatCurrency(unitCost);
    if (totalEl) totalEl.textContent = formatCurrency(totalCost);
    if (modeEl) modeEl.textContent = overrideRaw !== "" ? "User-entered override" : "System-calculated";
  }

  addForm?.addEventListener("input", updateModalCostPreview);

  window.openAddModal = () => {
    if (!addModal) return;
    addForm.reset();
    queuedDocs = [];
    queuedPhotos = [];
    renderQueuedFiles(document.getElementById("queued-docs-list"), queuedDocs, "docs");
    renderQueuedFiles(document.getElementById("queued-photos-list"), queuedPhotos, "photos");
    if (state.currentSubsystem && addForm.main_part) {
      addForm.main_part.value = state.currentSubsystem;
    }
    const errEl = document.getElementById("add-form-error");
    if (errEl) errEl.textContent = "";
    updateModalCostPreview();
    addModal.classList.add("open");
    addForm.component_id?.focus();
  };

  window.closeAddModal = () => {
    addModal?.classList.remove("open");
  };

  addForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("add-form-error");
    const submitBtn = addForm.querySelector('button[type="submit"]');
    if (errEl) errEl.textContent = "";

    const cid = addForm.component_id.value.trim();
    const cname = addForm.component_name.value.trim();
    if (!cid || !cname) {
      if (errEl) errEl.textContent = "Component ID and Component Name are both required.";
      return;
    }

    const formData = new FormData(addForm);
    formData.delete("documents");
    formData.delete("photos");
    queuedDocs.forEach((f) => formData.append("documents", f));
    queuedPhotos.forEach((f) => formData.append("photos", f));
    formData.set("name_id", `${cid} ${cname}`.trim());

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const res = await request("/api/components", { method: "POST", body: formData });
      toast(`Created component "${cid} ${cname}".`, "success");
      closeAddModal();
      state.currentSubsystem = addForm.main_part.value;
      state.mode = "subsystem";
      setActiveNav(state.currentSubsystem);
      await refreshOverview();
      await loadComponents();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
      toast("Could not save component: " + err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Component";
    }
  });

  // Git Pull & Push with confirmation and progress
  window.gitAction = async (action) => {
    const isPull = action === "pull";
    const ok = await confirmDialog({
      title: isPull ? "Pull Latest Vault Updates" : "Push Local Changes to GitHub",
      message: isPull
        ? "This will fetch and rebase the latest component records from the configured Git repository. Any conflicting local changes may require resolution."
        : "This will stage changes in vault/, commit them, pull any remote updates, and push to GitHub.",
      confirmLabel: isPull ? "Pull Now" : "Push Now",
    });
    if (!ok) return;

    const btn = document.getElementById(isPull ? "btn-pull" : "btn-push");
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = isPull ? "Pulling..." : "Pushing...";
    try {
      const data = await request(`/api/git/${action}`, { method: "POST" });
      toast(`${isPull ? "Pull" : "Push"} succeeded (${data.records ?? 0} records). ${data.message}`, "success", 6000);
      await refreshOverview();
      if (state.mode === "subsystem" || state.mode === "search") {
        await loadComponents();
      }
    } catch (err) {
      toast(`${isPull ? "Pull" : "Push"} failed: ${err.message}`, "error", 7000);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  };

  // Initial boot: render shell immediately, load overview counts + initial subsystem
  refreshOverview();
  selectSubsystem(state.currentSubsystem);
})();
