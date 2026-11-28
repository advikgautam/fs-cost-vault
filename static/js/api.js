window.VaultAPI = (() => {
  async function request(url, options = {}) {
    const res = await fetch(url, options);
    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || res.statusText || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && typeof onProgress === "function") {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error((data && (data.error || data.message)) || xhr.statusText || "Upload failed"));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.send(formData);
    });
  }

  return { request, uploadWithProgress };
})();
