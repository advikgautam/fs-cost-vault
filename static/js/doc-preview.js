window.DocPreview = (() => {
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
  const TEXT_EXTS = new Set(["csv", "txt", "json", "md"]);
  const PDF_EXTS = new Set(["pdf"]);

  function getExt(filename) {
    const parts = String(filename || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function isPreviewable(filename) {
    const ext = getExt(filename);
    return IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || TEXT_EXTS.has(ext);
  }

  async function open(folder, filename) {
    const ext = getExt(filename);
    const fileUrl = `/vault/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop open";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <div style="min-width:0;">
            <h2 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${VaultUI.escapeHtml(filename)}</h2>
            <div style="font-size:11.5px;color:var(--text-secondary);">Document Preview</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <a class="btn btn-sm" href="${fileUrl}" download="${VaultUI.escapeHtml(filename)}">Download</a>
            <button type="button" class="btn btn-sm btn-icon" data-close aria-label="Close preview">✕</button>
          </div>
        </div>
        <div class="modal-body" id="preview-body" style="min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="color:var(--text-secondary);">Loading preview...</div>
        </div>
      </div>
    `;

    const close = () => backdrop.remove();
    backdrop.querySelector("[data-close]").onclick = close;
    backdrop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    document.body.appendChild(backdrop);

    const body = backdrop.querySelector("#preview-body");

    if (!isPreviewable(filename)) {
      body.innerHTML = `
        <div class="empty-state" style="width:100%;border-style:solid;">
          <h3>Preview Not Available for .${VaultUI.escapeHtml(ext || "file")}</h3>
          <p>In-browser preview is not supported for this engineering or office format. Download the original file to inspect it locally.</p>
          <a class="btn btn-primary" href="${fileUrl}" download="${VaultUI.escapeHtml(filename)}">Download Original File</a>
        </div>
      `;
      return;
    }

    if (IMAGE_EXTS.has(ext)) {
      let zoomed = false;
      body.innerHTML = `
        <div style="width:100%;display:flex;justify-content:flex-end;margin-bottom:8px;">
          <button type="button" class="btn btn-sm" id="img-zoom-btn">Zoom In</button>
        </div>
        <div style="width:100%;overflow:auto;text-align:center;">
          <img id="preview-img" src="${fileUrl}" alt="${VaultUI.escapeHtml(filename)}" style="max-width:100%;max-height:68vh;object-fit:contain;border-radius:6px;" />
        </div>
      `;
      const img = body.querySelector("#preview-img");
      const zoomBtn = body.querySelector("#img-zoom-btn");
      zoomBtn.onclick = () => {
        zoomed = !zoomed;
        img.style.maxWidth = zoomed ? "none" : "100%";
        img.style.maxHeight = zoomed ? "none" : "68vh";
        zoomBtn.textContent = zoomed ? "Fit to Screen" : "Zoom In";
      };
      img.onerror = () => {
        body.innerHTML = `<div style="color:var(--status-attention-text);">Failed to load image preview. <a href="${fileUrl}" download>Download file</a></div>`;
      };
      return;
    }

    if (PDF_EXTS.has(ext)) {
      body.style.padding = "0";
      body.innerHTML = `
        <iframe src="${fileUrl}#view=FitH" title="${VaultUI.escapeHtml(filename)}" style="width:100%;height:72vh;border:none;background:#1a1d24;"></iframe>
      `;
      return;
    }

    if (TEXT_EXTS.has(ext)) {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("Failed to fetch text file");
        const txt = await res.text();
        body.style.alignItems = "stretch";
        body.style.justifyContent = "flex-start";
        body.innerHTML = `<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12.5px;background:var(--bg-main);padding:14px;border-radius:6px;border:1px solid var(--border);width:100%;max-height:65vh;overflow:auto;">${VaultUI.escapeHtml(txt.slice(0, 120000))}</pre>`;
      } catch (err) {
        body.innerHTML = `<div style="color:var(--status-attention-text);">Could not load file preview: ${VaultUI.escapeHtml(err.message)}</div>`;
      }
    }
  }

  return { isPreviewable, open };
})();
