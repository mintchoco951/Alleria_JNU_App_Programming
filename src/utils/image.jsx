export async function fileToCompressedDataUrl(file, maxW = 900, maxH = 900, quality = 0.85) {
  const img = await loadImage(URL.createObjectURL(file));
  const { width, height } = fitSize(img.width, img.height, maxW, maxH);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  URL.revokeObjectURL(img.__src);

  // JPEG로 저장(대부분 용량 절약)
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl;
}

function fitSize(w, h, maxW, maxH) {
  const ratio = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.__src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}