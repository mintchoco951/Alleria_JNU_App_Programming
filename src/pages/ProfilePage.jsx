import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/authContext";
import { useProfile } from "../store/profileContext";
import Loading from "../components/Loading";

const ALLERGEN_OPTIONS = [
  { key: "milk", label: "우유" },
  { key: "egg", label: "계란" },
  { key: "peanut", label: "땅콩" },
  { key: "soy", label: "대두" },
  { key: "wheat", label: "밀/글루텐" },
  { key: "fish", label: "생선" },
  { key: "shellfish", label: "갑각류" },
];

const DIET_OPTIONS = [
  { key: "NONE", label: "해당 없음" },
  { key: "VEGAN", label: "비건" },
  { key: "VEGETARIAN", label: "베지테리언" },
  { key: "HALAL", label: "할랄" },
];

export default function ProfilePage() {
  const { session } = useAuth();
  const { profile, loadForUser, saveForUser } = useProfile();

  const [dietType, setDietType] = useState("NONE");
  const [allergens, setAllergens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!session?.userId) return;
    loadForUser(session.userId);
  }, [session?.userId, loadForUser]);

  useEffect(() => {
    // 초기 로드 시에만 상태 설정 (이후 사용자 편집 보존)
    if (profile && !initializedRef.current) {
      setDietType(profile.dietType || "NONE");
      setAllergens(profile.allergens || []);
      initializedRef.current = true;
    }
  }, [profile]);

  const toggleAllergen = (key) => {
    setAllergens((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const onSave = async () => {
    if (!session?.userId) return;
    setError("");
    setSaving(true);
    try {
      const next = saveForUser(session.userId, {
        ...profile,
        dietType,
        allergens,
      });
      setSavedAt(next.updatedAt);
    } catch (e) {
      setError(e?.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!session?.userId) return <Loading />;

  return (
    <div className="glass-panel" style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2 className="title-lg" style={{ marginBottom: '8px' }}>프로필 설정</h2>
      <p style={{ color: 'var(--text-sub)', marginBottom: '32px' }}>알레르기 및 식이 정보를 설정하세요</p>

      {/* 식이 규칙 */}
      <section style={{ marginBottom: '24px' }}>
        <p className="section-title">식이 규칙</p>
        <select 
          className="input-field" 
          value={dietType} 
          onChange={(e) => setDietType(e.target.value)}
        >
          {DIET_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </section>

      <div className="divider" />

      {/* 알레르기 */}
      <section style={{ marginBottom: '24px' }}>
        <p className="section-title">알레르기</p>
        <div className="grid-2">
          {ALLERGEN_OPTIONS.map((o) => (
            <label 
              key={o.key} 
              className={`checkbox-wrapper ${allergens.includes(o.key) ? 'checked' : ''}`}
            >
              <input 
                type="checkbox" 
                checked={allergens.includes(o.key)} 
                onChange={() => toggleAllergen(o.key)} 
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="divider" />

      {/* 저장 버튼 */}
      <div className="flex-gap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          className="btn btn-primary" 
          onClick={onSave} 
          disabled={saving}
        >
          {saving ? "저장 중..." : "저장하기"}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {savedAt && `저장됨: ${new Date(savedAt).toLocaleString()}`}
        </span>
      </div>

      {error && <div className="error-msg" style={{ marginTop: '16px' }}>{error}</div>}
    </div>
  );
}