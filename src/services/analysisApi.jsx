// src/services/analysisApi.jsx

// 1) 알레르겐/식이 관련 동의어(영문+한글)
const LEXICON = {
  milk: [
    "milk",
    "whey",
    "casein",
    "lactose",
    "cheese",
    "butter",
    "cream",
    "yogurt",
    "우유",
    "유청",
    "카제인",
    "유당",
    "치즈",
    "버터",
    "크림",
    "요거트",
  ],
  egg: ["egg", "albumen", "ovalbumin", "계란", "난류", "난백", "난황"],
  peanut: ["peanut", "groundnut", "땅콩"],
  soy: ["soy", "soya", "soybean", "lecithin", "대두", "콩", "레시틴"],
  wheat: ["wheat", "gluten", "flour", "밀", "글루텐", "밀가루"],
  buckwheat: ["buckwheat", "메밀"],
  sesame: ["sesame", "참깨", "깨"],
  fish: ["fish", "생선", "어류"],
  shellfish: [
    "shellfish",
    "shrimp",
    "crab",
    "lobster",
    "새우",
    "게",
    "랍스터",
    "조개",
    "갑각류",
  ],
  pork: ["pork", "lard", "돼지고기", "돈육", "라드"],
  beef: ["beef", "쇠고기", "소고기", "우육"],
  chicken: ["chicken", "닭고기", "계육"],
  alcohol: [
    "alcohol",
    "ethanol",
    "wine",
    "beer",
    "소주",
    "맥주",
    "와인",
    "주류",
    "알코올",
    "에탄올",
  ],
};

// 사용자 입력(프로필 allergens)이 영문/한글/혼합이어도 canonical key로 정규화
const CANONICAL_KEYS = Object.keys(LEXICON);
const USER_TERM_ALIAS = (() => {
  const m = new Map();
  for (const key of CANONICAL_KEYS) {
    for (const s of LEXICON[key]) m.set(s.toLowerCase(), key);
    m.set(key.toLowerCase(), key);
  }
  // 흔한 표현 보정
  m.set("우유함유", "milk");
  m.set("땅콩함유", "peanut");
  m.set("소", "beef");
  return m;
})();

// 식이 규칙
const DIET_RULES = {
  NONE: { forbidden: [] },
  VEGAN: {
    forbidden: [
      "milk",
      "egg",
      "honey",
      "gelatin",
      "meat",
      "fish",
      "shellfish",
      "pork",
      "beef",
      "chicken",
    ],
  },
  VEGETARIAN: {
    forbidden: [
      "meat",
      "fish",
      "shellfish",
      "gelatin",
      "pork",
      "beef",
      "chicken",
    ],
  },
  HALAL: { forbidden: ["pork", "alcohol", "lard"] },
};

// 식이에서 사용하는 개념어(고기/젤라틴 등)도 간단 동의어 처리
const DIET_SYNONYMS = {
  meat: ["meat", "육류", "고기", "육", "육가공", "육수"],
  gelatin: ["gelatin", "젤라틴"],
  honey: ["honey", "꿀"],
  // pork/beef/chicken/alcohol는 LEXICON 재사용
};

function normalize(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/[（）()［\]【】]/g, " ")
    .replace(/[·•]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = x.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function textQuality(rawText) {
  const t = String(rawText || "");
  const hangul = (t.match(/[가-힣]/g) || []).length;
  const alpha = (t.match(/[A-Za-z]/g) || []).length;
  const digit = (t.match(/[0-9]/g) || []).length;
  const score = hangul * 2 + alpha + digit;
  return { hangul, alpha, digit, score };
}

function canonicalizeUserAllergen(term) {
  const t = String(term || "")
    .trim()
    .toLowerCase();
  if (!t) return null;
  return USER_TERM_ALIAS.get(t) || t; // 모르면 그대로 사용(사용자 커스텀 키워드)
}

/**
 * 원재료/함유/알레르기 텍스트를 최대한 추출하여 token 리스트로 반환
 * - 분석은 이 리스트 + rawText 전체 스캔을 함께 사용
 */

// 알레르겐 후보에서 제외할 단어들 (영양 항목, 메타 정보 등)
const STOPWORDS = new Set([
  "원재료", "원재료명", "영양", "영양정보", "영양성분", "알레르기", "알레르겐", "함유", "포함",
  "나트륨", "탄수화물", "단백질", "지방", "당류", "열량", "칼로리", "포화지방", "트랜스지방", "콜레스테롤",
  "대한", "대한민국", "한국", "제조", "제조원", "판매원", "고객", "상담", "유통", "보관", "냉장", "냉동",
  "식품유형", "내용량", "중량", "용량", "규격", "원산지", "수입", "수입원", "유통기한", "소비기한",
  "기타", "등", "및", "이상", "이하", "미만", "약", "정도", "함량", "기준", "일일", "권장"
]);

export function parseIngredients(rawText) {
  const t = normalize(rawText);

  const chunks = [];

  // 1) 영문 Ingredients:
  {
    const m = t.match(/ingredients\s*[:：]\s*([^\n]+)/i);
    if (m?.[1]) chunks.push(m[1]);
  }

  // 2) 한글 원재료/원재료명
  {
    const m = t.match(/원\s*재\s*료\s*명?\s*[:：]?\s*([^\n]+)/);
    if (m?.[1]) chunks.push(m[1]);
  }

  // 3) "… 함유/포함" 패턴 (예: "밀, 대두, 돼지고기, 계란, 쇠고기 함유")
  // OCR이 줄바꿈/특수문자를 섞어도 잡히도록 넓게 잡습니다.
  {
    const re = /([가-힣A-Za-z0-9,\s/]+?)\s*(함유|포함)/g;
    let m;
    while ((m = re.exec(t))) {
      const left = (m[1] || "").trim();
      if (left.length >= 2 && left.length <= 120) chunks.push(left);
    }
  }

  // 4) "알레르기/알레르겐/contains" 이후 라인
  {
    const m1 = t.match(/알레르기[^\n:：]*[:：]\s*([^\n]+)/);
    if (m1?.[1]) chunks.push(m1[1]);
    const m2 = t.match(/contains\s*[:：]?\s*([^\n]+)/i);
    if (m2?.[1]) chunks.push(m2[1]);
  }

  // 토큰화
  const tokens = chunks
    .join(",")
    .split(/[,;/\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => s.split(/\s+/g))
    .map((x) => x.replace(/[^0-9A-Za-z가-힣]/g, ""))
    .filter((x) => x.length >= 1 && x.length <= 30);

  // STOPWORDS 제거 + 쓰레기 토큰 제거
  const cleaned = tokens
    .filter((x) => !STOPWORDS.has(x)) // 영양 항목, 메타 정보 제거
    .filter((x) => {
      // 영문 1글자(예: "F") 제거, 숫자/한글 1글자는 유지
      if (x.length !== 1) return true;
      if (/[가-힣0-9]/.test(x)) return true;
      return false;
    });

  return uniq(cleaned).slice(0, 250);
}

function findHitInText(textLower, synonyms) {
  for (const s of synonyms) {
    const q = String(s).toLowerCase();
    if (!q) continue;

    // 영문은 단어 경계 우선, 한글은 includes로 충분
    if (/[a-z]/i.test(q) && !/[가-힣]/.test(q)) {
      const re = new RegExp(
        `\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );
      if (re.test(textLower)) return q;
    } else {
      if (textLower.includes(q)) return q;
    }
  }
  return null;
}

// ===== Fuzzy match helpers (Levenshtein) =====
const FUZZY = {
  // 너무 공격적이면 오탐이 늘어납니다. 보수적으로 시작하세요.
  maxDist: 1,
  hangulMinLen: 2,
  hangulMaxLen: 5,
  alphaMinLen: 3,
};

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    const ca = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const cb = b[j - 1];
      const cost = ca === cb ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[n][m];
}

function isHangulToken(x) {
  return /^[가-힣]+$/.test(x);
}

function isAlphaToken(x) {
  return /^[a-z]+$/.test(x);
}

/**
 * rawText와 ingredients에서 퍼지 매칭 후보 토큰을 뽑습니다.
 * - 너무 긴 텍스트 전체를 대상으로 substring 거리계산을 하지 않기 위해 "토큰"으로 제한합니다.
 */
function buildFuzzyTokens(rawText, ingredients) {
  const t = normalizeLower(rawText || "");
  const ing = normalizeLower((ingredients || []).join(" "));

  const merged = `${t}\n${ing}`;
  const tokens = merged
    .split(/[^0-9a-z가-힣]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const filtered = tokens.filter((x) => {
    if (isHangulToken(x))
      return x.length >= FUZZY.hangulMinLen && x.length <= FUZZY.hangulMaxLen;
    if (isAlphaToken(x)) return x.length >= FUZZY.alphaMinLen;
    return false;
  });

  return uniq(filtered);
}

/**
 * syns(동의어/표기) 목록과 tokens 간 편집거리 기반으로 가장 가까운 hit를 찾습니다.
 * - maxDist 이하만 허용
 * - 길이 차이가 크면 배제(오탐 방지)
 */
function findFuzzyHitInTokens(tokens, syns) {
  const normSyns = (syns || []).map((s) => normalizeLower(String(s)));

  for (const syn of normSyns) {
    if (!syn) continue;

    const synIsHangul = isHangulToken(syn);
    const synIsAlpha = isAlphaToken(syn);

    // 한글/영문 외는 퍼지 제외(오탐 방지)
    if (!synIsHangul && !synIsAlpha) continue;

    // 2글자 한글은 퍼지 매칭 금지: 오탐이 너무 많음 (예: "대한"→"대두")
    if (synIsHangul && syn.length <= 2) continue;

    for (const tok of tokens) {
      if (synIsHangul && !isHangulToken(tok)) continue;
      if (synIsAlpha && !isAlphaToken(tok)) continue;

      // 2글자 한글 토큰도 퍼지 대상에서 제외
      if (synIsHangul && tok.length <= 2) continue;

      // 길이 차이가 크면 아예 제외
      if (Math.abs(tok.length - syn.length) > 1) continue;

      const d = levenshtein(tok, syn);
      if (d <= FUZZY.maxDist) return tok; // 화면에 보여줄 hit는 "실제 인식된 토큰"
    }
  }
  return null;
}

/**
 * 알레르겐 매칭: ingredients + rawText 전체를 함께 봅니다.
 * (OCR이 원재료명을 못 잡아도 '알레르기' 리스트만 잡히면 경고 가능)
 */
function matchAllergens({ rawText, ingredients, selectedAllergens }) {
  const matches = [];
  const textLower = normalizeLower(rawText);
  const ingLower = normalizeLower((ingredients || []).join(" | "));
  const joined = `${textLower} | ${ingLower}`;

  const fuzzyTokens = buildFuzzyTokens(rawText, ingredients);

  const canonicalAllergens = (selectedAllergens || [])
    .map(canonicalizeUserAllergen)
    .filter(Boolean);

  for (const userKey of canonicalAllergens) {
    const syns = LEXICON[userKey] || [userKey];
    let hit = findHitInText(joined, syns);
    if (!hit) {
      hit = findFuzzyHitInTokens(fuzzyTokens, syns);
    }
    if (hit) {
      matches.push({
        type: "ALLERGY",
        term: userKey,
        hit,
        reason: "사용자 알레르기",
      });
    }
  }
  return matches;
}

function matchDiet({ rawText, ingredients, dietType }) {
  const rule = DIET_RULES[dietType] || DIET_RULES.NONE;
  if (!rule.forbidden.length) return [];

  const matches = [];
  const textLower = normalizeLower(rawText);
  const ingLower = normalizeLower((ingredients || []).join(" | "));
  const joined = `${textLower} | ${ingLower}`;

  for (const key of rule.forbidden) {
    const syns = LEXICON[key] || DIET_SYNONYMS[key] || [key];
    const hit = findHitInText(joined, syns);
    if (hit) {
      matches.push({
        type: "DIET",
        term: key,
        hit,
        reason: `식이 규칙(${dietType})`,
      });
    }
  }
  return matches;
}

/**
 * FOOD / NON_FOOD / UNKNOWN 분류 개선(한글 신호 포함)
 */
export function classifyProduct(rawText) {
  const t = normalizeLower(rawText);

  const foodSignals = [
    "ingredients",
    "nutrition",
    "allergen",
    "contains",
    "kcal",
    "calories",
    "serving",
    "원재료",
    "원재료명",
    "영양",
    "영양정보",
    "알레르기",
    "함유",
    "포함",
    "나트륨",
    "탄수화물",
    "단백질",
    "지방",
    "당류",
    "열량",
  ];

  const nonFoodSignals = [
    "wipe",
    "disinfect",
    "external use",
    "do not ingest",
    "keep out of reach",
    "물티슈",
    "세정",
    "소독",
    "살균",
    "외용",
    "먹지",
    "섭취",
    "사용방법",
    "주의사항",
    "화장품",
    "샴푸",
    "바디",
    "세탁",
    "세제",
  ];

  const foodScore = foodSignals.reduce(
    (acc, k) => acc + (t.includes(k) ? 1 : 0),
    0
  );
  const nonFoodScore = nonFoodSignals.reduce(
    (acc, k) => acc + (t.includes(k) ? 1 : 0),
    0
  );

  if (nonFoodScore >= 2 && nonFoodScore > foodScore) return "NON_FOOD";
  if (foodScore >= 2 && foodScore >= nonFoodScore) return "FOOD";
  return "UNKNOWN";
}

/**
 * analyze 결과
 * riskLevel: SAFE / MEDIUM / HIGH / NOT_APPLICABLE / UNKNOWN
 */
export function analyze({ rawText, profile }) {
  const q = textQuality(rawText);
  const category = classifyProduct(rawText);

  // OCR이 거의 안 읽힌 경우: UNKNOWN으로 분리
  if (q.score < 30) {
    return {
      category: "UNKNOWN",
      ingredients: [],
      matches: [],
      riskLevel: "UNKNOWN",
      quality: q,
      message:
        "인식된 글자가 너무 적습니다. 원재료명·함유 부분이 화면 2/3 이상 차지하도록 가까이 촬영하세요.",
    };
  }

  // 비식품이면 적용 제외
  if (category === "NON_FOOD") {
    return {
      category,
      ingredients: [],
      matches: [],
      riskLevel: "NOT_APPLICABLE",
      quality: q,
      message: "비식품으로 판단되어 성분 분석을 수행하지 않았습니다.",
    };
  }

  // 식품이 확실치 않으면 UNKNOWN
  if (category !== "FOOD") {
    return {
      category,
      ingredients: [],
      matches: [],
      riskLevel: "UNKNOWN",
      quality: q,
      message:
        "식품 여부를 확정하기 어렵습니다. 원재료명/영양정보가 선명하게 보이도록 다시 촬영해 주세요.",
    };
  }

  function extractEvidenceLines(rawText) {
    const lines = normalize(rawText)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const keys = [
      "원재료",
      "원재료명",
      "함유",
      "포함",
      "알레르기",
      "알레르겐",
      "ingredients",
      "contains",
      "allergen",
    ];

    const picked = [];
    for (const line of lines) {
      const low = line.toLowerCase();
      if (keys.some((k) => low.includes(k.toLowerCase()))) {
        picked.push(line);
        if (picked.length >= 6) break;
      }
    }

    // 라인이 너무 없으면 알레르기 리스트처럼 쉼표가 많은 줄을 보조로 채택
    if (picked.length < 2) {
      const commaHeavy = lines
        .filter((l) => (l.match(/,/g) || []).length >= 3)
        .slice(0, 2);
      picked.push(...commaHeavy);
    }

    return uniq(picked).slice(0, 6);
  }

  const ingredients = parseIngredients(rawText);
  const evidenceLines = extractEvidenceLines(rawText);

  const allergyMatches = matchAllergens({
    rawText,
    ingredients,
    selectedAllergens: profile?.allergens || [],
  });

  const dietMatches = matchDiet({
    rawText,
    ingredients,
    dietType: profile?.dietType || "NONE",
  });

  const matches = [...allergyMatches, ...dietMatches];

  let riskLevel = "SAFE";
  if (allergyMatches.length > 0) riskLevel = "HIGH";
  else if (dietMatches.length > 0) riskLevel = "MEDIUM";

  return {
    category,
    ingredients,
    matches,
    riskLevel,
    quality: q,
    evidenceLines,
    message: "",
  };
}