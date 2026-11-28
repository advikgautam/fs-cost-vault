window.VaultUI = (() => {
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(val) {
    const num = Number(val) || 0;
    return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
    return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function statusBadge(status) {
    const s = status || "Pending Review";
    if (s === "Verified") {
      return `<span class="status-badge status-verified" aria-label="Status: Verified (internally reviewed)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.3 4.3L6.5 11.1 3.2 7.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Verified
      </span>`;
    }
    if (s === "Needs Attention") {
      return `<span class="status-badge status-attention" aria-label="Status: Needs Attention">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 5v4m0 3h.01M7.1 2.5L1.6 12a1 1 0 00.9 1.5h11a1 1 0 00.9-1.5L8.9 2.5a1 1 0 00-1.8 0z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Needs Attention
      </span>`;
    }
    if (s === "Missing Evidence" || s === "No Documents") {
      return `<span class="status-badge status-missing" aria-label="Status: Missing Evidence">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 8h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        Missing Evidence
      </span>`;
    }
    return `<span class="status-badge status-pending" aria-label="Status: Pending Review">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      Pending Review
    </span>`;
  }

  function subsystemIcon(name) {
    const icons = {
      "Body & Aero": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16c5-1 10-4 18-10-2 6-6 10-12 12l-6-2z"/><path d="M12 15v5"/></svg>`,
      "Brakes": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/></svg>`,
      "Suspension": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4m0 12v4M8 6h8l-6 3 6 3-6 3 6 3H8"/></svg>`,
      "Frame & Chassis": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17L9 7h6l5 10H4z"/><path d="M9 7l3 10 3-10"/></svg>`,
      "Powertrain": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="14" height="10" rx="2"/><path d="M18 10h3v4h-3M8 7V4h4v3"/></svg>`,
      "Electrical": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2"/></svg>`,
      "Steering": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M4.5 9.5l5.5 2M19.5 9.5l-5.5 2"/></svg>`,
      "Wheels & Tires": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 8v8M8 12h8"/></svg>`,
      "Misc": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>`,
    };
    return icons[name] || icons["Misc"];
  }

  function toast(message, type = "info", timeoutMs = 4200) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <div style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</div>
      <button type="button" class="btn btn-sm btn-icon" aria-label="Dismiss notification" style="border:none;background:transparent;">✕</button>
    `;
    el.querySelector("button").onclick = () => el.remove();
    container.appendChild(el);
    if (timeoutMs > 0) {
      setTimeout(() => el.remove(), timeoutMs);
    }
  }

  function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop open";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.innerHTML = `
        <div class="modal modal-sm">
          <div class="modal-header">
            <h2>${escapeHtml(title)}</h2>
            <button type="button" class="btn btn-sm btn-icon" data-close aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            <p style="margin:0; color: var(--text-secondary); white-space: pre-wrap;">${escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      const cleanup = (val) => {
        backdrop.remove();
        resolve(val);
      };
      backdrop.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => cleanup(false)));
      backdrop.querySelector("[data-confirm]").onclick = () => cleanup(true);
      backdrop.addEventListener("keydown", (e) => {
        if (e.key === "Escape") cleanup(false);
      });
      document.body.appendChild(backdrop);
      backdrop.querySelector("[data-confirm]").focus();
    });
  }

  return {
    escapeHtml,
    formatCurrency,
    formatBytes,
    formatDate,
    statusBadge,
    subsystemIcon,
    toast,
    confirmDialog,
  };
})();
