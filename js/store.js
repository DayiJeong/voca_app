// 데이터 저장소 (브라우저 localStorage)
const Store = (() => {
  const KEY = 'danjjang-v1';

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function defaults() {
    return {
      version: 1,
      books: [],          // [{id, name, createdAt, words:[{id, word, meaning, unit, example}]}]
      progress: {},       // wordId -> {status:'new'|'learning'|'learned', seen, correct, wrong, last}
      wrong: {},          // wordId -> {count, streak, added, last}  (오답노트)
      daily: {},          // bookId -> {date, ids:[]}  (오늘의 단어)
      log: {},            // 'YYYY-MM-DD' -> {studied, answered, correct}
      best: {},           // gameId -> best score
      currentBookId: null,
      settings: { dailyCount: 10, wrongClearStreak: 2 },
    };
  }

  let s = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) } };
    } catch (e) {
      console.warn('load failed', e);
      return defaults();
    }
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch (e) { alert('저장에 실패했어요: ' + e.message); }
  }
  // 바뀔 때마다 기기에 저장 + 클라우드 동기화 알림(onSave)
  function save() {
    writeLocal();
    try { api.onSave?.(); } catch (e) { console.warn(e); }
  }

  const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function logToday(field, n = 1) {
    const t = today();
    const l = (s.log[t] ||= { studied: 0, answered: 0, correct: 0 });
    l[field] = (l[field] || 0) + n;
  }

  function addWrong(id) {
    const w = (s.wrong[id] ||= { count: 0, streak: 0, added: Date.now() });
    w.count++;
    w.streak = 0;
    w.last = Date.now();
  }

  function prog(id) {
    return (s.progress[id] ||= { status: 'new', seen: 0, correct: 0, wrong: 0 });
  }

  const api = {
    get state() { return s; },
    today, uid, save,

    // ---------- 단어장 ----------
    books: () => s.books,
    book: (id) => s.books.find((b) => b.id === id),
    currentBook() {
      return api.book(s.currentBookId) || s.books[0] || null;
    },
    setCurrentBook(id) { s.currentBookId = id; save(); },

    addBook(name) {
      const b = { id: uid(), name: name.trim() || '새 단어장', createdAt: Date.now(), words: [] };
      s.books.push(b);
      if (!api.book(s.currentBookId)) s.currentBookId = b.id;
      save();
      return b;
    },
    renameBook(id, name) { const b = api.book(id); if (b && name.trim()) { b.name = name.trim(); save(); } },
    deleteBook(id) {
      const b = api.book(id);
      if (!b) return;
      b.words.forEach((w) => { delete s.progress[w.id]; delete s.wrong[w.id]; });
      s.books = s.books.filter((x) => x.id !== id);
      delete s.daily[id];
      if (s.currentBookId === id) s.currentBookId = s.books[0]?.id || null;
      save();
    },

    /** items: [{word, meaning, unit, example}] → 중복(같은 단원+같은 단어)은 건너뜀 */
    addWords(bookId, items) {
      const b = api.book(bookId);
      if (!b) return { added: 0, skipped: items.length };
      const keyOf = (w) => norm(w.unit) + '|' + norm(w.word);
      const seen = new Set(b.words.map(keyOf));
      let added = 0, skipped = 0;
      for (const it of items) {
        const w = {
          id: uid(),
          word: String(it.word || '').trim(),
          meaning: String(it.meaning || '').trim(),
          unit: String(it.unit || '').trim(),
          example: String(it.example || '').trim(),
        };
        if (!w.word || !w.meaning || seen.has(keyOf(w))) { skipped++; continue; }
        seen.add(keyOf(w));
        b.words.push(w);
        added++;
      }
      save();
      return { added, skipped };
    },
    updateWord(bookId, wordId, patch) {
      const w = api.book(bookId)?.words.find((x) => x.id === wordId);
      if (w) { Object.assign(w, patch); save(); }
    },
    deleteWord(bookId, wordId) {
      const b = api.book(bookId);
      if (!b) return;
      b.words = b.words.filter((w) => w.id !== wordId);
      delete s.progress[wordId];
      delete s.wrong[wordId];
      save();
    },

    /** 단원 목록 (입력 순서 유지) */
    units(bookId) {
      const b = api.book(bookId);
      if (!b) return [];
      const map = new Map();
      b.words.forEach((w) => map.set(w.unit, (map.get(w.unit) || 0) + 1));
      return [...map.entries()].map(([name, count]) => ({ name, label: name || '(단원 없음)', count }));
    },
    wordsOfUnit(bookId, unit) {
      return (api.book(bookId)?.words || []).filter((w) => w.unit === unit);
    },

    findWord(id) {
      for (const b of s.books) {
        const w = b.words.find((x) => x.id === id);
        if (w) return { ...w, bookId: b.id, bookName: b.name };
      }
      return null;
    },
    wordsByIds(ids) { return ids.map(api.findWord).filter(Boolean); },
    allWords() { return s.books.flatMap((b) => b.words.map((w) => ({ ...w, bookId: b.id }))); },

    // ---------- 학습 기록 ----------
    status: (id) => s.progress[id]?.status || 'new',

    /** 플래시카드에서 알아요/몰라요 */
    markStudied(id, known) {
      const p = prog(id);
      p.seen++;
      p.last = Date.now();
      if (known) { if (p.status !== 'learned') p.status = 'learned'; }
      else { p.status = 'learning'; addWrong(id); }
      logToday('studied');
      save();
    },

    /** 게임에서 정답/오답 */
    recordAnswer(id, correct) {
      const p = prog(id);
      p.last = Date.now();
      logToday('answered');
      if (correct) {
        p.correct++;
        logToday('correct');
        const w = s.wrong[id];
        if (w) {
          w.streak++;
          if (w.streak >= s.settings.wrongClearStreak) delete s.wrong[id]; // 오답노트 졸업
        }
      } else {
        p.wrong++;
        p.status = 'learning';
        addWrong(id);
      }
      save();
    },

    bookStats(bookId) {
      const b = api.book(bookId);
      const words = b?.words || [];
      let learned = 0, learning = 0, wrong = 0;
      for (const w of words) {
        const st = api.status(w.id);
        if (st === 'learned') learned++;
        else if (st === 'learning') learning++;
        if (s.wrong[w.id]) wrong++;
      }
      return { total: words.length, learned, learning, wrong };
    },

    // ---------- 오늘의 단어 ----------
    /** 오늘 학습할 단어: 아직 외우지 않은 단어를 앞에서부터 N개. 하루 동안 고정. */
    todayPlan(bookId) {
      const b = api.book(bookId);
      if (!b) return { date: today(), ids: [] };
      const d = s.daily[bookId];
      if (d && d.date === today()) {
        d.ids = d.ids.filter((id) => b.words.some((w) => w.id === id));
        return d;
      }
      const ids = b.words.filter((w) => api.status(w.id) !== 'learned')
        .slice(0, s.settings.dailyCount).map((w) => w.id);
      s.daily[bookId] = { date: today(), ids };
      save();
      return s.daily[bookId];
    },
    resetTodayPlan(bookId) { delete s.daily[bookId]; return api.todayPlan(bookId); },

    // ---------- 오답노트 ----------
    wrongList(bookId) {
      return Object.entries(s.wrong)
        .map(([id, info]) => ({ ...api.findWord(id), info }))
        .filter((w) => w.id && (!bookId || w.bookId === bookId))
        .sort((a, b) => b.info.count - a.info.count || b.info.last - a.info.last);
    },
    removeWrong(id) { delete s.wrong[id]; save(); },
    clearWrong(bookId) {
      for (const w of api.wrongList(bookId)) delete s.wrong[w.id];
      save();
    },

    // ---------- 기타 ----------
    streakDays() {
      let n = 0;
      const d = new Date();
      const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      if (!s.log[key(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터 셈
      while (s.log[key(d)]) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    setBest(game, score) {
      if (score > (s.best[game] || 0)) { s.best[game] = score; save(); return true; }
      return false;
    },
    exportJSON: () => JSON.stringify(s, null, 2),
    importJSON(text) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.books)) throw new Error('단어짱 백업 파일이 아니에요.');
      s = { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
      save();
    },
    reset() { s = defaults(); save(); },

    // ---------- 클라우드 동기화용 ----------
    onSave: null,
    /** 클라우드에서 받은 데이터로 교체 (다시 업로드하지 않음) */
    replace(data) {
      const d = defaults();
      s = { ...d, ...(data || {}), settings: { ...d.settings, ...(data?.settings || {}) } };
      writeLocal();
    },
    /** 로그아웃: 이 기기 데이터 지우기 (업로드하지 않음) */
    clearLocal() { s = defaults(); writeLocal(); },
  };
  return api;
})();
