// Send directly to a short-lived, single-object upload URL. This is NOT a
// download URL: the original remains private and never passes through Vercel.
export function transferUpload(file: Blob, uploadUrl: string, mime: string,
  onProgress: (percentage: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const aborted = () => request.abort();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", aborted);
      if (error) reject(error); else { onProgress(100); resolve(); }
    };
    if (signal.aborted) { finish(new Error("Envio cancelado.")); return; }
    request.open("PUT", uploadUrl);
    request.timeout = 180000;
    request.setRequestHeader("Content-Type", mime);
    request.setRequestHeader("Cache-Control", "max-age=0");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round(event.loaded / event.total * 100));
    };
    request.onload = () => {
      // A retry can encounter bytes already stored by the first request. The
      // authenticated finalizer still verifies size, content and immutable key.
      let duplicate = request.status === 409;
      if (request.status === 400) {
        try { duplicate = JSON.parse(request.responseText)?.error === "Duplicate"; }
        catch { duplicate = false; }
      }
      if ((request.status >= 200 && request.status < 300) || duplicate) finish();
      else finish(new Error(request.status === 413 ? "Arquivo acima do limite permitido. PDF: 20 MiB; capa: 5 MiB."
        : "Não foi possível enviar o arquivo. Clique em Enviar novamente; se persistir, atualize a página."));
    };
    request.onerror = request.ontimeout = () => finish(new Error("O envio foi interrompido. Confira sua conexão e clique em Enviar novamente."));
    request.onabort = () => finish(new Error("Envio cancelado."));
    signal.addEventListener("abort", aborted, { once: true });
    request.send(file);
  });
}
