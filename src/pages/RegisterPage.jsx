import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/authContext";
import { useProfile } from "../store/profileContext";

export default function RegisterPage() {
  const nav = useNavigate();
  const { register } = useAuth();
  const { loadForUser } = useProfile();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setError("이메일 형식이 올바르지 않습니다.");
      return;
    }
    if (password.length < 4) {
      setError("비밀번호는 4자 이상을 권장합니다(데모용).");
      return;
    }

    setSubmitting(true);
    try {
      const s = await register({ email: trimmed, password });
      loadForUser(s.userId);
      nav("/profile", { replace: true });
    } catch (err) {
      setError(err?.message || "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel center" style={{ maxWidth: "420px" }}>
      <h2 className="title-lg">회원가입</h2>
      
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
            autoComplete="new-password"
          />
        </div>
        
        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ width: '100%' }}
          disabled={submitting}
        >
          {submitting ? "가입 중..." : "가입하기"}
        </button>
        
        {error && <div className="error-msg">{error}</div>}
      </form>

      <div className="divider" />

      <div style={{ color: 'var(--text-sub)' }}>
        이미 계정이 있나요? <Link to="/login" className="text-link">로그인</Link>
      </div>
    </div>
  );
}