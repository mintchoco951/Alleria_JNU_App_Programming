import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/authContext";
import { useProfile } from "../store/profileContext";

export default function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const { loadForUser } = useProfile();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const s = await login({ email: email.trim(), password });
      loadForUser(s.userId);
      nav("/scan", { replace: true });
    } catch (err) {
      setError(err?.message || "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel center" style={{ maxWidth: "420px" }}>
      <h2 className="title-lg">로그인</h2>
      
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">이메일</label>
          <input
            className="input-field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">비밀번호</label>
          <input
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="비밀번호 입력"
            autoComplete="current-password"
          />
        </div>

        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ width: '100%' }} 
          disabled={submitting}
        >
          {submitting ? "로그인 중..." : "로그인"}
        </button>

        {error && <div className="error-msg">{error}</div>}
      </form>

      <div className="divider" />

      <div style={{ color: 'var(--text-sub)' }}>
        계정이 없나요? <Link to="/register" className="text-link">회원가입</Link>
      </div>
    </div>
  );
}