// 계정 화면 (로그인 / 회원가입 / 비밀번호 찾기) + 앱 시작
const SYNC_LABEL = {
  disabled: '', off: '👤 로그인', syncing: '☁️ 저장 중…', ok: '☁️ 저장됨', offline: '📴 오프라인', error: '⚠️ 동기화 오류',
};

function updateAcctBtn() {
  const b = $('#acct-btn');
  b.classList.toggle('hidden', !Sync.enabled);
  b.textContent = SYNC_LABEL[Sync.status] || '';
  if (Sync.status === 'ok' && Sync.pending) b.textContent = '☁️ 저장 대기';
}

const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

Views.account = (el) => {
  if (!Sync.enabled) {
    el.innerHTML = `<h1>👤 계정</h1><div class="card"><p>클라우드 저장이 아직 설정되지 않았어요.</p>
      <p class="muted small">js/config.js 에 Supabase 주소와 키를 넣으면 로그인 기능이 켜져요. 지금은 이 기기에만 저장돼요.</p></div>`;
    return;
  }

  // ---------- 로그인 된 상태 ----------
  const u = Sync.user;
  if (u) {
    const provider = u.app_metadata?.provider === 'google' ? 'Google' : '이메일';
    el.innerHTML = `
      <h1>👤 내 계정</h1>
      <div class="card stack">
        <div><div class="muted small">${provider} 계정</div><div class="w" style="font-size:18px">${esc(u.email)}</div></div>
        <div class="row between">
          <span>${SYNC_LABEL[Sync.status] || ''} ${Sync.message ? `<span class="muted small">· ${esc(Sync.message)}</span>` : ''}</span>
          <button class="btn secondary sm" data-a="sync">지금 동기화</button>
        </div>
        <p class="muted small">단어장, 진도, 오답노트가 자동으로 클라우드에 저장돼요. 다른 기기에서 같은 계정으로 로그인하면 이어서 할 수 있어요.</p>
        <button class="btn ghost" data-a="logout">로그아웃</button>
        <p class="muted small">로그아웃하면 이 기기에 있던 기록은 지워져요 (클라우드에는 남아 있어요).</p>
      </div>`;
    on(el, '[data-a=sync]', 'click', async () => {
      await Sync.syncNow();
      toast(Sync.status === 'ok' ? '동기화했어요' : Sync.message || '동기화 실패');
      go('account');
    });
    on(el, '[data-a=logout]', 'click', async () => {
      if (!confirm('로그아웃할까요?')) return;
      await Sync.signOut();
      toast('로그아웃했어요');
      go('home');
    });
    return;
  }

  // ---------- 로그인 / 회원가입 / 비밀번호 찾기 ----------
  let mode = 'login';
  const TITLE = { login: '로그인', signup: '회원가입', reset: '비밀번호 찾기' };
  const SUBMIT = { login: '로그인', signup: '가입하기', reset: '재설정 메일 보내기' };

  const draw = () => {
    el.innerHTML = `
      <h1>👤 ${TITLE[mode]}</h1>
      <div class="card stack">
        <p class="muted small">로그인하면 학습 기록이 클라우드에 저장돼서 기기를 바꿔도 이어서 할 수 있어요.</p>
        ${mode !== 'reset' && Sync.providers?.google ? `
          <button class="btn google-btn big block" data-a="google">${GOOGLE_ICON} Google로 계속하기</button>
          <div class="divider">또는 이메일</div>` : ''}
        <input type="email" id="a-email" placeholder="이메일" autocomplete="email">
        ${mode !== 'reset' ? `<input type="password" id="a-pw" placeholder="비밀번호 (6자 이상)" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">` : ''}
        ${mode === 'signup' ? '<input type="password" id="a-pw2" placeholder="비밀번호 확인" autocomplete="new-password">' : ''}
        <button class="btn big block" data-a="submit">${SUBMIT[mode]}</button>
        <p id="a-msg" class="small"></p>
        <div class="row between small">
          ${mode === 'login'
            ? '<a href="#" data-m="signup">회원가입</a><a href="#" data-m="reset">비밀번호를 잊었어요</a>'
            : '<a href="#" data-m="login">← 로그인으로</a>'}
        </div>
      </div>
      <p class="muted small center">로그인하지 않아도 이 기기에서는 계속 쓸 수 있어요.</p>`;

    const msg = (t, ok) => { const m = $('#a-msg'); m.textContent = t; m.style.color = ok ? 'var(--ok)' : 'var(--bad)'; };
    on(el, '[data-m]', 'click', (e, a) => { e.preventDefault(); mode = a.dataset.m; draw(); });
    on(el, '[data-a=google]', 'click', async () => {
      try { await Sync.signInWithGoogle(); } catch (err) { msg(err.message); }
    });

    const submit = async () => {
      const email = $('#a-email').value.trim();
      const pw = $('#a-pw')?.value || '';
      if (!email) return msg('이메일을 입력해 주세요.');
      const btn = $('[data-a=submit]', el);
      btn.disabled = true;
      try {
        if (mode === 'reset') {
          await Sync.resetPassword(email);
          msg('비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러주세요.', true);
        } else if (mode === 'signup') {
          if (pw.length < 6) throw new Error('비밀번호는 6자 이상이어야 해요.');
          if (pw !== $('#a-pw2').value) throw new Error('비밀번호 확인이 달라요.');
          const r = await Sync.signUp(email, pw);
          if (r.needConfirm) msg(`${email} 로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.`, true);
        } else {
          if (!pw) throw new Error('비밀번호를 입력해 주세요.');
          await Sync.signIn(email, pw);
        }
      } catch (err) { msg(err.message); }
      btn.disabled = false;
    };
    on(el, '[data-a=submit]', 'click', submit);
    on(el, 'input', 'keydown', (e) => { if (e.key === 'Enter') submit(); });
  };
  draw();
};

// ---------- 시작 ----------
let lastUserId = null;
let providersShown = false;
Sync.subscribe(() => {
  updateAcctBtn();
  // 로그인 방식 정보가 처음 도착하면 로그인 화면을 한 번 다시 그림 (Google 버튼 표시 여부)
  if (Sync.providers && !providersShown) {
    providersShown = true;
    if (App.route === 'account' && !Sync.user) go('account');
  }
  const uid = Sync.user?.id || null;
  if (uid !== lastUserId) {
    lastUserId = uid;
    if (uid && App.route === 'account') go('home'); // 로그인 성공
  }
});
// 클라우드에서 데이터를 받아오면 (게임·학습·가져오기 중이 아닐 때) 화면 새로 그리기
window.addEventListener('danjjang:data', () => {
  if (!['play', 'flash', 'import'].includes(App.route)) go(App.route, App.params);
});

Sync.init();
updateAcctBtn();
go('home');
