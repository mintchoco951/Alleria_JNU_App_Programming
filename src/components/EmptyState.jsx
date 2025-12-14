export default function EmptyState({ message, icon = "📭" }) {
  return (
    <div className="empty-state glass-panel">
      <div className="empty-state-icon">{icon}</div>
      <p style={{ color: 'var(--text-sub)', fontSize: '1.1rem' }}>
        {message || "데이터가 없습니다."}
      </p>
    </div>
  );
}