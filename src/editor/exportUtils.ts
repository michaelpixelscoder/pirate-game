// ---------------------------------------------------------------------------
// Export utilities: download JSON files or a ZIP bundle
// ---------------------------------------------------------------------------

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, filename);
}

export async function downloadZip(
  files: Array<{ path: string; data: unknown }>,
  zipName = "pirate-assets.zip",
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const { path, data } of files) {
    zip.file(path, JSON.stringify(data, null, 2));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipName);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
