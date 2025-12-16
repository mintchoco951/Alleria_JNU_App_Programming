import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import Loading from "../components/Loading";
import { useAuth } from "../store/authContext";
import { useProfile } from "../store/profileContext";
import { hashBlobSHA256 } from "../utils/hash";
import { runOcr } from "../services/ocrApi";
import { analyze } from "../services/analysisApi";
import { saveScan } from "../services/scansApi";
import { uuid } from "../utils/uuid";
import { fileToCompressedDataUrl } from "../utils/image";

export default function ScanPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { profile } = useProfile();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef(null);
  const imageFileRef = useRef(null);

  const [smartRoi, setSmartRoi] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [roiPreview, setRoiPreview] = useState("");
  const [mode, setMode] = useState("UPLOAD"); // UPLOAD | CAMERA
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  // 수동 크롭 관련 상태
  const [manualCrop, setManualCrop] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCamera();
      abortRef.current?.abort?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  // ScanPage.jsx 내부
const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    if (videoRef.current) videoRef.current.srcObject = stream;
    setCameraReady(true);
  } catch (err) {
    console.error("카메라 접근 실패:", err);
    alert("카메라를 사용할 수 없습니다. 업로드 방식을 이용하세요.");
  }
};


  const onSelectFile = (e) => {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setImageFile(f);
    imageFileRef.current = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  // 크롭된 이미지를 File로 변환
  const getCroppedImg = useCallback(async (imageSrc, pixelCrop) => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => { image.onload = resolve; });

    const canvas = document.createElement("canvas");
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: "image/jpeg" });
        resolve(file);
      }, "image/jpeg", 0.95);
    });
  }, []);

  // 수동 크롭 완료 처리
  const onCropComplete = useCallback((croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropConfirm = async () => {
    if (!croppedAreaPixels || !previewUrl) return;
    
    const croppedFile = await getCroppedImg(previewUrl, croppedAreaPixels);
    if (croppedFile) {
      setImageFile(croppedFile);
      imageFileRef.current = croppedFile;
    }
    setManualCrop(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const onCapture = async () => {
    setError("");
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) {
      setError("캡처에 실패했습니다.");
      return;
    }

    // File 생성(브라우저 fallback 포함)
    let f;
    try {
      f = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    } catch {
      blob.name = `capture-${Date.now()}.jpg`;
      f = blob;
    }

    setImageFile(f);
    imageFileRef.current = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onRun = async () => {
    if (!imageFile) {
      setError("이미지를 먼저 선택하거나 캡처하세요.");
      return;
    }
    if (!session?.userId) return;

    setError("");
    setLoading(true);

    // 이전 요청 취소
    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const file = imageFileRef.current || imageFile;
      const imageHash = await hashBlobSHA256(file);
      const profileVersion = profile?.version || 1;
      
      // OCR 파이프라인 버전 (전처리/ROI 로직 변경 시 증가)
      const OCR_PIPELINE_VERSION = "v3";
      const requestKey = `${OCR_PIPELINE_VERSION}:${imageHash}:${profileVersion}`;

      if (!file) {
        setError("이미지를 먼저 선택하거나 캡처하세요.");
        return;
      }

      setOcrProgress(0);
      setRoiPreview("");

      const ocr = await runOcr({
        imageFile: file,
        requestKey,
        signal: controller.signal,
        lang: "kor+eng",
        smartRoi,
        autoRotate,
        onProgress: setOcrProgress,
      });

      if (ocr?.roiPreviewDataUrl) setRoiPreview(ocr.roiPreviewDataUrl);

      const analysis = analyze({ rawText: ocr.rawText, profile });

      const scanId = uuid();
      const imageDataUrl = await fileToCompressedDataUrl(file);

      const scan = {
        id: scanId,
        createdAt: Date.now(),
        imageMeta: {
          name: file.name,
          type: file.type,
          size: file.size,
          hash: imageHash,
        },
        imageDataUrl,
        ocrText: ocr.rawText,
        blocks: ocr.blocks,
        ocrRoi: ocr.roi || null,
        parsedIngredients: analysis.ingredients,
        riskLevel: analysis.riskLevel,
        matches: analysis.matches,
        analysis: {
          category: analysis.category,
          quality: analysis.quality,
          evidenceLines: analysis.evidenceLines,
          message: analysis.message,
        },
        profileSnapshot: {
          dietType: profile?.dietType || "NONE",
          allergens: profile?.allergens || [],
          version: profileVersion,
        },
      };

      saveScan(session.userId, scan);
      nav(`/result/${scanId}`);
    } catch (e) {
      if (e?.name === "AbortError") setError("이전 요청이 취소되었습니다.");
      else setError(e?.message || "처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!session?.userId) return <Loading />;

  return (
    <div className="glass-panel" style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2 className="title-lg">성분 스캔</h2>

      {/* 모드 선택 탭 */}
      <div className="tab-nav" style={{ marginBottom: "24px" }}>
        <button
          onClick={() => {
            setMode("UPLOAD");
            stopCamera();
          }}
          className={`tab-btn ${mode === "UPLOAD" ? "active" : ""}`}
          disabled={loading}
        >
          이미지 업로드
        </button>

        <button
          onClick={async () => {
            setMode("CAMERA");
            await startCamera();
          }}
          className={`tab-btn ${mode === "CAMERA" ? "active" : ""}`}
          disabled={loading}
        >
          카메라 촬영
        </button>
      </div>

      {mode === "UPLOAD" ? (
        <div
          className="card"
          style={{
            border: "2px dashed var(--input-border)",
            textAlign: "center",
            padding: "40px",
            cursor: "pointer",
          }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={onSelectFile}
            disabled={loading}
            id="file-upload"
            style={{ display: "none" }}
          />
          <label
            htmlFor="file-upload"
            style={{ cursor: "pointer", display: "block" }}
          >
            <p style={{ color: "var(--text-sub)", marginBottom: "12px" }}>
              클릭하여 이미지를 선택하세요
            </p>
            <span className="badge">JPG, PNG, WEBP</span>
          </label>
        </div>
      ) : (
        <div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="image-preview"
            style={{
              width: "100%",
              maxWidth: 640,
              margin: "0 auto",
              display: "block",
            }}
          />
          <div className="flex-gap flex-center" style={{ marginTop: "16px" }}>
            <button
              className="btn btn-primary"
              onClick={onCapture}
              disabled={loading || !cameraReady}
            >
              캡처
            </button>
            <button
              className="btn btn-secondary"
              onClick={stopCamera}
              disabled={loading}
            >
              카메라 종료
            </button>
          </div>
        </div>
      )}

      {previewUrl && !manualCrop && (
        <div style={{ marginTop: "24px" }}>
          <p className="section-title">미리보기</p>
          <img
            src={previewUrl}
            alt="preview"
            className="image-preview"
            style={{
              width: "100%",
              maxWidth: 640,
              display: "block",
              margin: "0 auto",
            }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => setManualCrop(true)}
            disabled={loading}
            style={{ marginTop: "12px", width: "100%" }}
          >
            텍스트 영역 직접 선택 (정확도 향상)
          </button>
        </div>
      )}

      {/* 수동 크롭 모드 */}
      {manualCrop && previewUrl && (
        <div style={{ marginTop: "24px" }}>
          <p className="section-title">텍스트 영역을 선택하세요</p>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 400,
              background: "#000",
              borderRadius: "var(--border-radius-sm)",
              overflow: "hidden",
            }}
          >
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              aspect={3 / 2}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="flex-gap" style={{ marginTop: "12px" }}>
            <button
              className="btn btn-primary"
              onClick={handleCropConfirm}
              style={{ flex: 1 }}
            >
              선택 완료
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setManualCrop(false);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
              }}
              style={{ flex: 1 }}
            >
              취소
            </button>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: "100%", marginTop: "12px" }}
          />
          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-sub)" }}>
            확대/축소: {zoom.toFixed(1)}x
          </p>
        </div>
      )}

      <div className="divider" />

      {/* 옵션 */}
      <div className="grid-2" style={{ marginBottom: "20px" }}>
        <label className={`checkbox-wrapper ${smartRoi ? "checked" : ""}`}>
          <input
            type="checkbox"
            checked={smartRoi}
            onChange={(e) => setSmartRoi(e.target.checked)}
            disabled={loading}
          />
          <span>스마트 ROI</span>
        </label>

        <label className={`checkbox-wrapper ${autoRotate ? "checked" : ""}`}>
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(e) => setAutoRotate(e.target.checked)}
            disabled={loading}
          />
          <span>자동 회전 보정</span>
        </label>
      </div>

      <button
        className="btn btn-primary"
        onClick={onRun}
        disabled={loading}
        style={{ width: "100%" }}
      >
        {loading
          ? `분석 중... (${Math.round(ocrProgress * 100)}%)`
          : "분석 실행"}
      </button>

      {loading && (
        <div className="progress-bar" style={{ marginTop: "12px" }}>
          <div
            className="progress-fill"
            style={{ width: `${ocrProgress * 100}%` }}
          />
        </div>
      )}

      {roiPreview && (
        <div style={{ marginTop: "24px" }}>
          <p className="section-title">자동 선택된 OCR 영역</p>
          <img
            src={roiPreview}
            alt="roi"
            className="image-preview"
            style={{
              width: "100%",
              maxWidth: 640,
              display: "block",
              margin: "0 auto",
            }}
          />
        </div>
      )}

      {error && (
        <div className="error-msg" style={{ marginTop: "16px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
