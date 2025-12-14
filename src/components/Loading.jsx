export default function Loading({ text = "Loading..." }) {
  return (
    <div className="empty-state">
      <div className="loading-spinner" style={{ margin: '0 auto' }} />
      <p className="loading-text">{text}</p>
    </div>
  );
}