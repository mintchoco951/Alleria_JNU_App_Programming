import { Link } from "react-router-dom";
import { useAuth } from "../store/authContext";

export default function HomePage() {
  const { isAuthed } = useAuth();

  return (
    <div className="glass-panel center">
      <h1 className="title-xl">Alleria</h1>
      
      <p className="text-desc">
        알레르기 및 식이 규칙 기반 성분 경고 프로토타입
      </p>
      
      {isAuthed ? (
        <Link to="/scan" className="btn btn-primary btn-lg">
          스캔 시작
        </Link>
      ) : (
        <div className="flex-gap" style={{ justifyContent: 'center' }}>
          <Link to="/login" className="btn btn-secondary">로그인</Link>
          <Link to="/register" className="btn btn-primary">시작하기</Link>
        </div>
      )}
    </div>
  );
}