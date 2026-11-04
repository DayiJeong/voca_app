# 배포 & 클라우드 저장 설정 가이드

아래 `<프로젝트ID>` 는 본인 Supabase 프로젝트 것으로 바꿔 읽으세요.
최종 앱 주소: `https://dayijeong.github.io/voca_app/`

---

## 1. GitHub Pages 에 올리기

1. github.com 로그인 → 오른쪽 위 **+** → **New repository**
   - Repository name: `voca_app` · **Public** (완료)
2. (Claude가 코드를 올림 — 첫 push 때 브라우저에서 GitHub 로그인 창이 뜨면 로그인)
3. 저장소 → **Settings → Pages**
   - Source: **Deploy from a branch** · Branch: **main** / **(root)** → Save
4. 1~2분 뒤 `https://dayijeong.github.io/voca_app/` 접속 확인

이후 코드를 고치고 push 하면 자동으로 반영돼요.

---

## 2. Supabase (데이터베이스 + 로그인)

### 2-1. 프로젝트 만들기
1. supabase.com 가입 → **New project**
   - 이름: `danjjang` · DB 비밀번호: 아무거나 안전하게(따로 보관) · Region: **Northeast Asia (Seoul)**
2. 만들어지면 **Project Settings → API** (또는 Data API / API Keys) 에서 두 값 복사
   - **Project URL** (`https://<프로젝트ID>.supabase.co`)
   - **anon / public** 키 (또는 publishable 키)
   - ⚠️ `service_role` / secret 키는 앱에 넣으면 안 돼요
3. 두 값을 `js/config.js` 에 넣기 (Claude에게 알려주면 넣어드려요)

### 2-2. 테이블 만들기
**SQL Editor → New query** → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**

### 2-3. 주소 설정 (로그인 후 앱으로 돌아오게)
**Authentication → URL Configuration**
- Site URL: `https://dayijeong.github.io/voca_app/`
- Redirect URLs 에 추가:
  - `https://dayijeong.github.io/voca_app/`
  - `http://localhost:8765/` (내 컴퓨터에서 테스트용)

### 2-4. 이메일 로그인
기본으로 켜져 있어요. 가입하면 인증 메일이 가고, 링크를 눌러야 로그인돼요.
- 무료 플랜의 기본 메일 발송은 **시간당 몇 통**으로 제한돼요. 반 전체가 한꺼번에 가입하면 막힐 수 있어요.
  → 해결: Google 로그인을 주로 쓰거나, Authentication → Emails 에서 SMTP(예: Resend, Gmail)를 연결

### 2-5. Google 로그인 (약 15분)
1. console.cloud.google.com → 새 프로젝트 만들기 (`danjjang`)
2. **APIs & Services → OAuth consent screen** (Google Auth Platform)
   - User type: **External** · 앱 이름 `단어짱` · 지원 이메일 입력 → 저장
   - **Publish app** (게시) 해야 학생 누구나 로그인 가능 (테스트 상태면 등록한 계정만 가능)
3. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://dayijeong.github.io`
   - Authorized redirect URIs: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
   - 만들기 → **Client ID**, **Client secret** 복사
4. Supabase → **Authentication → Sign In / Providers → Google** → Enable
   - Client ID, Client secret 붙여넣기 → Save
   - (Client secret 은 Supabase 에만 넣고 앱 코드나 채팅에는 넣지 마세요)

---

## 동작 방식
- 로그인 안 해도 이 기기에서 그대로 사용 가능
- 로그인하면 단어장·진도·오답노트를 2초마다 자동으로 클라우드에 저장 (상단 `☁️ 저장됨`)
- 다른 기기에서 로그인하면 이어서 학습. 두 기기에서 동시에 바꾼 경우엔 어느 쪽을 남길지 물어봄
- 로그인 전에 쓰던 단어장은 로그인할 때 계정에 합칠 수 있음
- 로그아웃하면 그 기기의 기록은 지워짐 (학교 공용 PC 대비) — 클라우드엔 남아 있음
