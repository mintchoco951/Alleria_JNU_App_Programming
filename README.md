# Alleria (알레리아)

Alleria는 식품 성분표 이미지를 분석하여 사용자의 알레르기 유발 성분 및 식이 규칙(비건, 할랄 등)에 따른 섭취 안전 여부를 판별해 주는 웹 애플리케이션입니다.

## 프로젝트 소개

현대 사회에서 식품 알레르기나 특정 신념(비건 등)으로 인해 성분표를 확인해야 하는 사람들이 늘어나고 있습니다. 하지만 깨알 같은 글씨와 어려운 화학 용어로 인해 성분을 확인하는 과정은 매우 번거롭습니다.

이 프로젝트는 이러한 문제를 해결하기 위해 시작되었습니다. 사용자가 성분표 이미지를 업로드하면, Tesseract.js 기반의 OCR 기술이 텍스트를 추출하고, 자체 알고리즘을 통해 사용자의 프로필과 대조하여 위험 성분을 시각적으로 알려줍니다.

별도의 백엔드 서버 없이 브라우저 환경에서 동작하도록 설계된 프로토타입입니다.

## 개발 환경 및 기술 스택

* **Frontend Library**: React (v18)
* **Routing**: React Router DOM
* **State Management**: Context API (AuthContext, ProfileContext)
* **OCR Engine**: Tesseract.js (Browser-based OCR)
* **Data Storage**: Web LocalStorage API
* **Styling**: Plain CSS (Glassmorphism 디자인 적용)

## 주요 기능

1.  **사용자 맞춤형 프로필 설정**
    * 알레르기 유발 항원(계란, 우유, 땅콩, 대두 등) 선택 기능
    * 식이 규칙(비건, 베지테리언, 할랄) 설정 지원
    * Context API를 활용하여 앱 전역에서 사용자 설정 상태 관리

2.  **이미지 텍스트 추출 (OCR)**
    * 파일 업로드 및 웹캠 촬영 지원
    * Tesseract.js를 활용하여 클라이언트 측에서 이미지 텍스트 추출
    * 스마트 영역 추출(Smart ROI) 및 자동 회전 보정 기능을 구현하여 인식률 개선

3.  **성분 분석 및 위험도 판정**
    * 추출된 텍스트와 사용자 프로필 데이터를 대조 분석
    * Levenshtein Distance(편집 거리) 알고리즘을 적용하여 OCR 인식 과정에서 발생한 오타 보정 및 유사 단어 매칭 수행
    * 분석 결과에 따라 SAFE, MEDIUM, HIGH 3단계로 위험도 시각화

4.  **히스토리 관리**
    * 분석된 결과 데이터를 로컬 스토리지에 저장
    * 과거 분석 이력 조회 및 검색 기능 제공

## 프로젝트 구조
src/

├── app/                # 레이아웃 및 라우터 설정

├── components/         # 재사용 가능한 UI 컴포넌트 (NavBar, Loading 등)

├── pages/              # 주요 페이지 (Home, Scan, Result, History 등)

├── services/           # 비즈니스 로직
    
│    ├── ocrApi.jsx      # OCR 처리 및 Worker 관리
    
│    ├── analysisApi.jsx # 성분 분석 및 퍼지 매칭 알고리즘
    
│    └── storage.jsx     # 로컬 스토리지 관리
    
├── store/              # Context API 상태 관리

└── utils/              # 유틸리티 함수 (해시 생성, 요청 관리 등)

## 기술적 특이사항

* **중복 요청 방지 및 캐싱**: `requestManager.jsx`를 구현하여 동일한 이미지 해시값에 대해 불필요한 OCR 재연산을 방지했습니다.
* **알고리즘 구현**: 단순 문자열 포함 여부만 체크할 경우 오탐률이 높아, 동적 계획법(Dynamic Programming) 기반의 편집 거리 알고리즘을 직접 구현하여 분석 정확도를 높였습니다.
* **서버리스 아키텍처**: 프로토타입의 특성상 배포와 실행의 편의성을 위해 LocalStorage를 DB 대용으로 사용하여, 별도의 DB 구축 없이도 데이터 지속성을 확보했습니다.

## 설치 및 실행 방법

이 프로젝트는 Node.js 환경이 필요합니다.

1. 저장소 클론
   git clone https://github.com/mintchoco951/Alleria_JNU_App_Programming
   cd Alleria_JNU_App_Programming

2. 패키지 설치
   npm install

3. 개발 서버 실행
   npm start

브라우저 주소창에 http://localhost:3000 을 입력하여 접속합니다.

## 참고 사항

* 본 프로젝트는 Tesseract.js를 사용하여 브라우저 내에서 OCR을 수행하므로, 고화질 이미지일수록 분석 시간이 소요될 수 있습니다.
* 현재 모바일 반응형보다는 PC 웹 환경에 최적화되어 있습니다.
