import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../store/authContext";
import { getScan } from "../services/scansApi";
import EmptyState from "../components/EmptyState";

const getRiskBadge = (level) => {
  const styles = {
    HIGH: 'badge badge-danger',
    MEDIUM: 'badge badge-warning',
    SAFE: 'badge badge-success',
    UNKNOWN: 'badge',
  };
  return <span className={styles[level] || 'badge'}>{level}</span>;
};

export default function ResultPage() {
  const { id } = useParams();
  const { session } = useAuth();

  const scan = useMemo(() => {
    if (!session?.userId || !id) return null;
    return getScan(session.userId, id);
  }, [session?.userId, id]);

  const analysis = scan?.analysis || scan?.result || null;

  if (!scan) {
    return (
      <div className="glass-panel center" style={{ maxWidth: 500 }}>
        <EmptyState message="결과를 찾을 수 없습니다." />
        <div style={{ marginTop: '20px' }}>
          <Link to="/history" className="btn btn-primary">히스토리로 이동</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="flex-gap" style={{ marginBottom: '24px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 className="title-lg" style={{ margin: 0 }}>분석 결과</h2>
        <div className="flex-gap">
          {getRiskBadge(scan.riskLevel)}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {new Date(scan.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid-2" style={{ gap: '24px', alignItems: 'start' }}>
        {/* 이미지 */}
        <div>
          <p className="section-title">스캔 이미지</p>
          <img 
            src={scan.imageDataUrl} 
            alt="scan" 
            className="image-preview"
            style={{ width: "100%" }} 
          />
        </div>

        {/* 분석 결과 */}
        <div className="flex-col">
          {analysis && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: '12px' }}>OCR 정보</p>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>
                <div>분류: <strong>{analysis.category || "UNKNOWN"}</strong></div>
                <div>상태: {analysis.message || "정상 인식"}</div>
              </div>
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: '12px' }}>판정 결과</p>
            {scan.matches?.length ? (
              <div className="flex-col" style={{ gap: '8px' }}>
                {scan.matches.map((m, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '10px 12px',
                      background: 'var(--danger-bg)',
                      borderRadius: 'var(--border-radius-sm)',
                      fontSize: '0.9rem'
                    }}
                  >
                    <strong>{m.type}</strong>: {m.hit} → {m.reason}
                  </div>
                ))}
              </div>
            ) : (
              <div className="success-msg" style={{ margin: 0 }}>
                위험 성분을 발견하지 못했습니다.
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: '12px' }}>인식된 성분</p>
            <div style={{ 
              maxHeight: '160px', 
              overflow: 'auto',
              fontSize: '0.85rem',
              color: 'var(--text-sub)',
              lineHeight: 1.6
            }}>
              {(scan.parsedIngredients || []).length > 0 ? (
                (scan.parsedIngredients || []).slice(0, 50).join(", ")
              ) : (
                "인식된 성분이 없습니다."
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="flex-gap flex-center">
        <Link to="/scan" className="btn btn-primary">다시 스캔</Link>
        <Link to="/history" className="btn btn-secondary">히스토리</Link>
      </div>
    </div>
  );
}