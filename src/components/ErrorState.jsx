export default function ErrorState({ message }) {
  return (
    <div className="error-msg" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span>⚠️</span>
      <span>{message || "오류가 발생했습니다."}</span>
    </div>
  );
}