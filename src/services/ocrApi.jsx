// src/services/ocrApi.jsx
import { createWorker } from "tesseract.js";
import { getCached, runDeduped, setCached } from "../utils/requestManager";

const OCR_CACHE_TTL = 10 * 60 * 1000;
const DEFAULT_OEM = 1;

let worker = null;
let workerKey = null;

function normalizeLangs(lang) {
  if (!lang) return ["eng"];
  if (Array.isArray(lang)) return lang;
  if (typeof lang === "string" && lang.includes("+")) return lang.split("+").map(s => s.trim()).filter(Boolean);
  return [String(lang).trim()];
}

function keyFrom(langs, oem) {
  return `${langs.join("+")}::${oem}`;
}

async function ensureWorker(langs, oem = DEFAULT_OEM) {
  const key = keyFrom(langs, oem);

  if (!worker) {
    worker = await createWorker(langs, oem, {});
    workerKey = key;
    return worker;
  }

  if (workerKey !== key) {
    await worker.reinitialize(langs, oem);
    workerKey = key;
  }

  return worker;
}

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

async function recognizeWithAbort(w, image, signal) {
  if (!signal) return w.recognize(image);
  if (signal.aborted) throw abortError();

  let onAbort;
  const abortPromise = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([w.recognize(image), abortPromise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("이미지 로드 실패"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

async function loadImageFromFile(file) {
  const dataUrl = await fileToDataUrl(file);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return img;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function preprocessSimple(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  const contrast = 1.3;
  const intercept = 128 * (1 - contrast);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const yc = clamp(y * contrast + intercept, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = yc;
  }

  ctx.putImageData(img, 0, 0);
}

// 기존 preprocessSimple 아래에 전처리 강화 함수 추가
function preprocessEnhanced(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // 단순 그레이스케일
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // 명암 대비 강화 (조명 영향 줄이기)
    const contrasted = Math.min(255, Math.max(0, (gray - 100) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = contrasted;
  }

  ctx.putImageData(img, 0, 0);
}

function blocksFromWords(words = []) {
  return words
    .filter((w) => (w.text || "").trim())
    .slice(0, 300)
    .map((w) => ({
      text: (w.text || "").trim(),
      bbox: [
        w.bbox?.x0 ?? 0,
        w.bbox?.y0 ?? 0,
        (w.bbox?.x1 ?? 0) - (w.bbox?.x0 ?? 0),
        (w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0),
      ],
      confidence: typeof w.confidence === "number" ? w.confidence / 100 : 0,
    }));
}

function scoreText(t = "") {
  const hangul = (t.match(/[가-힣]/g) || []).length;
  const digit = (t.match(/[0-9]/g) || []).length;
  const alpha = (t.match(/[A-Za-z]/g) || []).length;
  return hangul * 3 + digit + alpha * 0.5;
}

function computeRoiFromWords(words, minConf = 55) {
  const good = (words || []).filter((w) => {
    const t = (w.text || "").trim();
    if (t.length < 2) return false;
    if (!/[0-9a-zA-Z가-힣]/.test(t)) return false;
    const c = typeof w.confidence === "number" ? w.confidence : 0;
    return c >= minConf;
  });

  if (good.length < 8) return null;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of good) {
    const b = w.bbox || {};
    x0 = Math.min(x0, b.x0 ?? 0);
    y0 = Math.min(y0, b.y0 ?? 0);
    x1 = Math.max(x1, b.x1 ?? 0);
    y1 = Math.max(y1, b.y1 ?? 0);
  }

  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 120 || rh < 80) return null;

  return { x: x0, y: y0, w: rw, h: rh };
}

function computeKeywordRoiFromWords(words, keywords) {
  const hits = [];
  for (const w of words || []) {
    const text = String(w.text || "").replace(/\s+/g, "");
    if (!text) continue;
    const lower = text.toLowerCase();

    if (keywords.some((k) => lower.includes(k))) {
      const b = w.bbox || {};
      const x0 = b.x0 ?? null, y0 = b.y0 ?? null, x1 = b.x1 ?? null, y1 = b.y1 ?? null;
      if ([x0, y0, x1, y1].every((v) => typeof v === "number")) hits.push({ x0, y0, x1, y1 });
    }
  }

  if (hits.length < 3) return null;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const h of hits) {
    x0 = Math.min(x0, h.x0);
    y0 = Math.min(y0, h.y0);
    x1 = Math.max(x1, h.x1);
    y1 = Math.max(y1, h.y1);
  }

  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 120 || rh < 80) return null;

  return { x: x0, y: y0, w: rw, h: rh };
}

function fallbackRoi(width, height) {
  // 키워드/단어 기반 ROI를 못 찾았을 때는 '전체'로 간다 (안전)
  return { x: 0, y: 0, w: width, h: height };
}

function rotateCanvas(src, deg) {
  const rad = (deg * Math.PI) / 180;
  const w = src.width, h = src.height;
  const dst = (deg % 180 === 0) ? makeCanvas(w, h) : makeCanvas(h, w);
  const ctx = dst.getContext("2d");
  ctx.translate(dst.width / 2, dst.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
  return dst;
}

async function recognizeBestRotation(w, canvas, signal, enable) {
  const r0 = await recognizeWithAbort(w, canvas, signal);
  const t0 = (r0?.data?.text || "").trim();
  let best = { text: t0, data: r0, deg: 0, score: scoreText(t0) };

  if (!enable) return best;

  // 0도 결과가 충분히 좋으면 추가 회전 시도 생략(속도)
  if (best.score >= 120) return best;

  for (const deg of [90, 180, 270]) {
    const c = rotateCanvas(canvas, deg);
    const r = await recognizeWithAbort(w, c, signal);
    const t = (r?.data?.text || "").trim();
    const s = scoreText(t);
    if (s > best.score) best = { text: t, data: r, deg, score: s };
  }
  return best;
}

/**
 * runOcr({ imageFile, requestKey, signal, onProgress, lang, smartRoi, autoRotate })
 */
export async function runOcr({
  imageFile,
  requestKey,
  signal,
  onProgress,
  lang = "kor+eng",
  smartRoi = true,
  autoRotate = true,
}) {
  if (!imageFile) throw new Error("runOcr: imageFile이 필요합니다.");

  const cached = getCached(requestKey);
  if (cached) return cached;

  return runDeduped(requestKey, async () => {
    onProgress?.(0.05);

    const langs = normalizeLangs(lang);
    const w = await ensureWorker(langs, DEFAULT_OEM);

    onProgress?.(0.12);

    const img = await loadImageFromFile(imageFile);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (!origW || !origH) throw new Error("이미지 크기를 읽을 수 없습니다.");

    let roi = null;
    let roiMethod = "FULL";
    let roiPreviewDataUrl = "";

    if (smartRoi) {
      const maxDim = 1100;
      const s1 = Math.min(1, maxDim / Math.max(origW, origH));
      const lowW = Math.max(1, Math.round(origW * s1));
      const lowH = Math.max(1, Math.round(origH * s1));

      const c1 = makeCanvas(lowW, lowH);
      c1.getContext("2d").drawImage(img, 0, 0, lowW, lowH);

      onProgress?.(0.22);

      const r1 = await recognizeWithAbort(w, c1, signal);
      const words1 = r1?.data?.words || [];

      const keywords = [
        "원재료", "원재료명", "함유", "포함", "알레르기", "영양", "영양정보",
        "ingredients", "contains", "allergen", "nutrition",
      ];

      const roiLowK = computeKeywordRoiFromWords(words1, keywords);
      const roiLowD = computeRoiFromWords(words1, 55);
      const roiLow = roiLowK || roiLowD;

      if (roiLow) {
        const inv = 1 / s1;
        let x = roiLow.x * inv;
        let y = roiLow.y * inv;
        let rw = roiLow.w * inv;
        let rh = roiLow.h * inv;

        const padX = Math.max(16, rw * 0.08);
        const padY = Math.max(16, rh * 0.12);

        x = clamp(x - padX, 0, origW - 1);
        y = clamp(y - padY, 0, origH - 1);
        rw = clamp(rw + padX * 2, 1, origW - x);
        rh = clamp(rh + padY * 2, 1, origH - y);

        roi = { x, y, w: rw, h: rh };
        roiMethod = roiLowK ? "KEYWORD" : "DENSITY";
      } else {
        roi = fallbackRoi(origW, origH);
        roiMethod = "FALLBACK";
      }

      onProgress?.(0.38);

      // 2차 OCR: ROI 크롭 + 업스케일
      const targetW = 3000;
      const s2 = clamp(targetW / roi.w, 1, 5);

      const c2 = makeCanvas(Math.round(roi.w * s2), Math.round(roi.h * s2));
      c2.getContext("2d").drawImage(
        img,
        roi.x, roi.y, roi.w, roi.h,
        0, 0, c2.width, c2.height
      );

      preprocessSimple(c2);
      preprocessEnhanced(c2);

      try {
        roiPreviewDataUrl = c2.toDataURL("image/jpeg", 0.85);
      } catch {
        roiPreviewDataUrl = "";
      }

      onProgress?.(0.55);

      const best = await recognizeBestRotation(w, c2, signal, autoRotate);

      onProgress?.(0.95);

      const rawText = best.text;
      const blocks = blocksFromWords(best.data?.data?.words || []);

      const out = {
        rawText,
        blocks,
        roi: { method: roiMethod, rotation: best.deg, ...roi },
        roiPreviewDataUrl,
      };

      setCached(requestKey, out, OCR_CACHE_TTL);
      onProgress?.(1);
      return out;
    }

    // smartRoi false: 전체 OCR
    onProgress?.(0.35);
    const best = await recognizeBestRotation(w, img, signal, autoRotate);
    const rawText = best.text;
    const blocks = blocksFromWords(best.data?.data?.words || []);

    const out = { rawText, blocks, roi: { method: "FULL", rotation: best.deg }, roiPreviewDataUrl: "" };
    setCached(requestKey, out, OCR_CACHE_TTL);

    onProgress?.(1);
    return out;
  });
}