import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSession, profileKey } from "../services/storage";

const ProfileContext = createContext(null);

const DEFAULT_PROFILE = {
  dietType: "NONE",
  allergens: [],
  version: 1,
  updatedAt: null,
};

function readProfile(userId) {
  const raw = localStorage.getItem(profileKey(userId));
  if (!raw) return DEFAULT_PROFILE;
  try { return JSON.parse(raw); } catch { return DEFAULT_PROFILE; }
}

function writeProfile(userId, profile) {
  localStorage.setItem(profileKey(userId), JSON.stringify(profile));
}

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  useEffect(() => {
    const s = getSession();
    if (!s?.userId) return;
    setProfile(readProfile(s.userId));
  }, []);

  const value = useMemo(() => {
    return {
      profile,
      loadForUser: (userId) => setProfile(readProfile(userId)),
      saveForUser: (userId, next) => {
        const updated = {
          ...next,
          version: (next.version || 1) + 1,
          updatedAt: Date.now(),
        };
        writeProfile(userId, updated);
        setProfile(updated);
        return updated;
      },
    };
  }, [profile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile은 ProfileProvider 내부에서 사용해야 합니다.");
  return ctx;
}