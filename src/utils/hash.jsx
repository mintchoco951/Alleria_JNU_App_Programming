export async function hashBlobSHA256(blob) {
  if (!blob) throw new Error("hashBlobSHA256: blob이 없습니다.");

  if (!window.crypto?.subtle) {
    const text = `${blob.size}:${blob.type}:${Date.now()}`;
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return `fallback-${h.toString(16)}`;
  }

  const buf = await blob.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}