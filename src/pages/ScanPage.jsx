import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  };

  const startCamera = async () => {
    setError("");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError(
        "카메라 권한 또는 장치 접근에 실패했습니다. 업로드 모드로 진행하세요."
      );
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
      const requestKey = `${imageHash}:${profileVersion}`;

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
    <div className="glass-panel" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 className="title-lg">성분 스캔</h2>

      {/* 모드 선택 탭 */}
      <div className="tab-nav" style={{ marginBottom: '24px' }}>
        <button
          onClick={() => { setMode("UPLOAD"); stopCamera(); }}
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
        <div className="card" style={{ 
          border: '2px dashed var(--input-border)', 
          textAlign: 'center',
          padding: '40px',
          cursor: 'pointer'
        }}>
          <input
            type="file"
            accept="image/*"
            onChange={onSelectFile}
            disabled={loading}
            id="file-upload"
            style={{ display: 'none' }}
          />
          <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
            <p style={{ color: 'var(--text-sub)', marginBottom: '12px' }}>
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
              margin: '0 auto',
              display: 'block'
            }}
          />
          <div className="flex-gap flex-center" style={{ marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={onCapture} disabled={loading}>
              캡처
            </button>
            <button className="btn btn-secondary" onClick={stopCamera} disabled={loading}>
              카메라 종료
            </button>
          </div>
        </div>
      )}

      {previewUrl && (
        <div style={{ marginTop: '24px' }}>
          <p className="section-title">미리보기</p>
          <img
            src={previewUrl}
            alt="preview"
            className="image-preview"
            style={{
              width: "100%",
              maxWidth: 640,
              display: 'block',
              margin: '0 auto'
            }}
          />
        </div>
      )}

      <div className="divider" />

      {/* 옵션 */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <label className={`checkbox-wrapper ${smartRoi ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={smartRoi}
            onChange={(e) => setSmartRoi(e.target.checked)}
            disabled={loading}
          />
          <span>스마트 ROI</span>
        </label>

        <label className={`checkbox-wrapper ${autoRotate ? 'checked' : ''}`}>
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
        style={{ width: '100%' }}
      >
        {loading ? `분석 중... (${Math.round(ocrProgress * 100)}%)` : "분석 실행"}
      </button>

      {loading && (
        <div className="progress-bar" style={{ marginTop: '12px' }}>
          <div className="progress-fill" style={{ width: `${ocrProgress * 100}%` }} />
        </div>
      )}

      {roiPreview && (
        <div style={{ marginTop: '24px' }}>
          <p className="section-title">자동 선택된 OCR 영역</p>
          <img
            src={roiPreview}
            alt="roi"
            className="image-preview"
            style={{
              width: "100%",
              maxWidth: 640,
              display: 'block',
              margin: '0 auto'
            }}
          />
        </div>
      )}

      {/* 프로필 정보 */}
      <div style={{ 
        marginTop: '24px', 
        padding: '14px', 
        background: 'var(--input-bg)', 
        borderRadius: 'var(--border-radius-sm)',
        fontSize: '0.9rem',
        color: 'var(--text-sub)'
      }}>
        프로필 v{profile?.version || 1} · 식이: {profile?.dietType || "NONE"} · 알레르기: {(profile?.allergens || []).join(", ") || "없음"}
      </div>

      {error && <div className="error-msg" style={{ marginTop: '16px' }}>{error}</div>}
    </div>
  );
}
