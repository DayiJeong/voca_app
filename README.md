# 단어짱 — 중고등 영어 단어 암기 앱 (초기 버전)

설치 없이 브라우저에서 돌아가는 웹앱입니다. 데이터는 기기 브라우저(localStorage)에 저장됩니다.

## 실행
```
.venv\Scripts\python.exe -m http.server 8765 --directory vocab-app
```
→ http://localhost:8765 접속. (index.html을 바로 더블클릭해도 대부분 동작합니다)

## 기능
- **단어장**: 파일(xlsx/csv/txt/json), 붙여넣기, 웹 주소(URL)로 가져오기 + 개별 입력/수정/삭제, CSV 내보내기
  - 머리글(word/meaning/unit/example, 영단어/뜻/단원/예문) 자동 인식, 없으면 영어·한글 열 자동 추측
  - `Lesson 1`, `# Day 2`, `3과` 같은 한 줄 → 단원 제목, 엑셀 시트 여러 개 → 시트 이름이 단원
  - EUC-KR(엑셀 한글 CSV) 자동 처리
- **학습**: 오늘의 단어(하루 N개, 못 외운 단어부터), 단원별, 전체 — 플래시카드 + 발음(TTS)
- **게임 테스트**: 스피드 퀴즈 / 카드 짝맞추기 / 단어 비(타이핑) / 철자 퍼즐
- **오답노트**: "몰라요"·틀린 단어 자동 저장, 연속 N번 맞히면 졸업, 플래시카드·게임으로 복습
- 백업/복원(JSON)

## 파일 구조
- `js/store.js` 데이터 저장/학습 기록
- `js/importer.js` 파일 파싱 · URL/API 연동 (교재사 API 어댑터 자리)
- `js/games.js` 게임 4종
- `js/app.js` 화면
- `sample/` 가져오기 테스트용 예시 파일
