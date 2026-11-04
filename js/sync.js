// 로그인(이메일·Google) + 클라우드 저장 (Supabase)
// 방식: 사용자마다 user_data 테이블의 한 줄에 전체 학습 데이터를 JSON으로 저장.
//      이 기기 localStorage 가 기본 저장소이고, 바뀌면 2초 뒤 클라우드에 올림.
const Sync = (() => {
  const META_KEY = 'danjjang-sync';
  const cfg = window.DANJJANG_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const appUrl = () => location.origin + location.pathname;

  let user = null;
  let ready = false; // 로그인 후 서버와 한 번 맞췄는지
  let status = enabled ? 'off' : 'disabled'; // disabled | off | syncing | ok | offline | error
  let message = '';
  let pushTimer = 0, pushing = false, pushAgain = false, editVer = 0;
  const listeners = new Set();

  // meta: { owner: 이 기기 데이터의 주인 userId, syncedAt: 마지막으로 맞춘 서버 시각, dirty: 안 올린 변경 있음 }
  let meta = loadMeta();
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  }

  function setStatus(st, msg = '') {
    status = st; message = msg;
    listeners.forEach((f) => f());
  }
  function changed() { // 원격 데이터가 반영됨 → 화면 다시 그리기
    window.dispatchEvent(new Event('danjjang:data'));
  }

  const KO_ERR = [
    [/invalid login credentials/i, '이메일 또는 비밀번호가 틀렸어요.'],
    [/email not confirmed/i, '이메일 인증을 먼저 해주세요. 받은편지함(스팸함 포함)을 확인해 주세요.'],
    [/already registered|already exists/i, '이미 가입된 이메일이에요. 로그인해 주세요.'],
    [/password should be at least/i, '비밀번호는 6자 이상이어야 해요.'],
    [/unable to validate email|invalid email/i, '이메일 주소 형식을 확인해 주세요.'],
    [/rate limit|too many/i, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'],
    [/provider is not enabled/i, 'Google 로그인이 아직 설정되지 않았어요 (Supabase 설정 필요).'],
    [/failed to fetch|network/i, '인터넷 연결을 확인해 주세요.'],
  ];
  const ko = (err) => {
    const m = err?.message || String(err);
    return KO_ERR.find(([re]) => re.test(m))?.[1] || m;
  };

  // ---------------- 서버 읽기/쓰기 ----------------
  async function fetchRow(fields = 'data, updated_at') {
    const { data, error } = await sb.from('user_data').select(fields).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data; // null = 아직 저장한 적 없음
  }

  function applyRemote(row) {
    if (row) Store.replace(row.data);
    else Store.clearLocal();
    meta = { owner: user.id, syncedAt: row?.updated_at || null, dirty: false };
    saveMeta();
    changed();
  }

  async function upload() {
    const ver = editVer;
    const { data, error } = await sb.from('user_data')
      .upsert({ user_id: user.id, data: Store.state })
      .select('updated_at').single();
    if (error) throw error;
    meta = { owner: user.id, syncedAt: data.updated_at, dirty: editVer !== ver };
    saveMeta();
  }

  /** 다른 기기에서 바뀐 기록과 이 기기 기록이 둘 다 있을 때 */
  async function resolveConflict(row) {
    const useCloud = confirm(
      '다른 기기에서 바뀐 학습 기록이 있어요.\n\n' +
      '[확인] 클라우드 기록 불러오기 (이 기기의 새 기록은 사라져요)\n' +
      '[취소] 이 기기 기록으로 클라우드 덮어쓰기');
    if (useCloud) applyRemote(row);
    else await upload();
  }

  /** 게스트(로그인 전) 기록을 계정 기록에 합치기: 계정에 없는 단어장만 추가 */
  function mergeGuestInto(remote) {
    const local = Store.state;
    const out = JSON.parse(JSON.stringify(remote));
    out.books ||= []; out.progress ||= {}; out.wrong ||= {}; out.log ||= {};
    const have = new Set(out.books.map((b) => b.id));
    for (const b of local.books) {
      if (have.has(b.id)) continue;
      out.books.push(b);
      for (const w of b.words) {
        if (local.progress[w.id]) out.progress[w.id] = local.progress[w.id];
        if (local.wrong[w.id]) out.wrong[w.id] = local.wrong[w.id];
      }
    }
    for (const [day, l] of Object.entries(local.log || {})) if (!out.log[day]) out.log[day] = l;
    return out;
  }

  // 로그인 직후 / 앱 시작 시
  async function syncOnLogin() {
    ready = false;
    setStatus('syncing');
    try {
      const row = await fetchRow();
      if (meta.owner && meta.owner !== user.id) {
        // 이 기기에 다른 계정의 데이터가 남아 있음 → 섞이지 않게 버리고 내 기록 불러오기
        applyRemote(row);
      } else if (!meta.owner) {
        // 로그인 전에 쓰던 기록
        const hasLocal = Store.books().length > 0;
        if (!row) await upload();
        else if (hasLocal && confirm(`로그인 전에 이 기기에서 만든 단어장 ${Store.books().length}개를 내 계정에 합칠까요?\n\n[취소]를 누르면 이 기기 기록은 지우고 계정 기록을 불러와요.`)) {
          Store.replace(mergeGuestInto(row.data));
          await upload();
          changed();
        } else applyRemote(row);
      } else if (!row) {
        await upload();
      } else if (row.updated_at === meta.syncedAt) {
        if (meta.dirty) await upload();
      } else if (!meta.dirty) {
        applyRemote(row);
      } else {
        await resolveConflict(row);
      }
      ready = true;
      setStatus('ok');
    } catch (e) {
      console.warn(e);
      // 오프라인이어도 이 기기 데이터가 내 것이면 계속 기록하고 나중에 올림
      ready = meta.owner === user.id;
      setStatus(navigator.onLine ? 'error' : 'offline', ko(e));
    }
  }

  async function push() {
    if (!user || !ready) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    setStatus('syncing');
    try {
      // 그 사이 다른 기기에서 바뀌었는지 먼저 확인 (덮어쓰기 방지)
      const row = await fetchRow('updated_at');
      if (row && meta.syncedAt && row.updated_at !== meta.syncedAt) {
        await resolveConflict(await fetchRow());
      } else {
        await upload();
      }
      setStatus('ok');
    } catch (e) {
      console.warn(e);
      setStatus(navigator.onLine ? 'error' : 'offline', ko(e));
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
    }
  }
  function schedulePush(delay = 2000) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay);
  }

  /** 다른 기기에서 바뀐 게 있으면 가져오기 (앱으로 돌아왔을 때) */
  async function pullIfChanged() {
    if (!user || pushing) return;
    if (meta.dirty) return push();
    try {
      const row = await fetchRow('updated_at');
      if (row && row.updated_at !== meta.syncedAt) {
        applyRemote(await fetchRow());
        setStatus('ok');
      }
    } catch { /* 조용히 무시 */ }
  }

  // ---------------- 시작 ----------------
  function init() {
    if (!enabled) return;
    Store.onSave = () => {
      if (!user || !ready) return; // 로그인 직후 맞추는 중에는 올리지 않음
      editVer++;
      meta.dirty = true;
      meta.owner = user.id;
      saveMeta();
      schedulePush();
    };

    sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null;
      // supabase 콜백 안에서 바로 supabase 를 부르면 멈출 수 있어서 setTimeout 사용
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') return askNewPassword();
        if (u && u.id !== user?.id) { user = u; syncOnLogin(); }
        else if (!u && user) { user = null; setStatus('off'); changed(); }
        else if (!u) setStatus('off');
      }, 0);
    });

    document.addEventListener('visibilitychange', () => {
      if (!user) return;
      if (document.visibilityState === 'hidden' && meta.dirty) push();
      if (document.visibilityState === 'visible') pullIfChanged();
    });
    window.addEventListener('online', () => {
      if (!user) return;
      if (!ready) syncOnLogin();
      else if (meta.dirty) push();
    });
  }

  async function askNewPassword() {
    const pw = prompt('새 비밀번호를 입력하세요 (6자 이상)');
    if (!pw) return;
    const { error } = await sb.auth.updateUser({ password: pw });
    alert(error ? '변경 실패: ' + ko(error) : '비밀번호를 바꿨어요.');
  }

  // ---------------- 화면에서 쓰는 함수 ----------------
  return {
    get enabled() { return enabled; },
    get user() { return user; },
    get status() { return status; },
    get message() { return message; },
    get pending() { return !!meta.dirty; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    init,

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(ko(error));
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
      if (error) throw new Error(ko(error));
      return { needConfirm: !data.session };
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
      if (error) throw new Error(ko(error));
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
      if (error) throw new Error(ko(error));
    },
    async signOut() {
      if (meta.dirty) { try { await push(); } catch {} }
      await sb.auth.signOut();
      user = null;
      ready = false;
      // 함께 쓰는 기기에서 다음 사람에게 기록이 보이지 않도록 지움
      Store.clearLocal();
      meta = {}; saveMeta();
      setStatus('off');
      changed();
    },
    syncNow: () => (user ? (ready && meta.dirty ? push() : syncOnLogin()) : Promise.resolve()),
  };
})();
