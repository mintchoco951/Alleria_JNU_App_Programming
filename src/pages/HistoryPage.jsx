import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/authContext";
import { clearScans, listScans } from "../services/scansApi";
import EmptyState from "../components/EmptyState";

const getRiskBadge = (level) => {
  const styles = {
    HIGH: 'badge badge-danger',
    MEDIUM: 'badge badge-warning',
    SAFE: 'badge badge-success',
  };
  return <span className={styles[level] || 'badge'}>{level}</span>;
};

export default function HistoryPage() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);

  const onClearAll = () => {
    const ok = window.confirm("히스토리를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;
    clearScans(session.userId);
    setRefreshKey((k) => k + 1);
  };

  const scans = useMemo(() => {
    if (!session?.userId) return [];
    const all = listScans(session.userId);

    const qq = q.trim().toLowerCase();
    return all.filter((s) => {
      const okRisk = risk === "ALL" ? true : s.riskLevel === risk;
      const okQ =
        !qq ||
        (s.ocrText || "").toLowerCase().includes(qq) ||
        (s.parsedIngredients || []).some((x) => String(x).toLowerCase().includes(qq));
      return okRisk && okQ;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, q, risk, refreshKey]);

  return (
    <div className="glass-panel" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 className="title-lg">스캔 히스토리</h2>

      <div className="flex-gap" style={{ marginBottom: '20px', flexWrap: 'wrap' }}>
        <input 
          className="input-field"
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
          placeholder="검색 (성분/원문)" 
          style={{ flex: 1, minWidth: '180px' }} 
        />
        <select 
          className="input-field"
          value={risk} 
          onChange={(e) => setRisk(e.target.value)}
          style={{ width: 'auto', minWidth: '120px' }}
        >
          <option value="ALL">전체</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="SAFE">SAFE</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={onClearAll}>
          초기화
        </button>
      </div>

      <div>
        {scans.length === 0 ? (
          <EmptyState message="저장된 스캔이 없습니다." />
        ) : (
          <div className="flex-col">
            {scans.map((s) => (
              <div key={s.id} className="card">
                <div className="card-header">
                  <div className="flex-gap">
                    {getRiskBadge(s.riskLevel)}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <Link to={`/result/${s.id}`} className="btn btn-secondary btn-sm">
                    상세 보기
                  </Link>
                </div>
                <p style={{ 
                  color: 'var(--text-sub)', 
                  fontSize: '0.9rem', 
                  lineHeight: 1.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {(s.ocrText || "").slice(0, 180)}...
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      <div style={{ textAlign: 'center' }}>
        <Link to="/scan" className="btn btn-primary">
          새 스캔 시작
        </Link>
      </div>
    </div>
  );
}