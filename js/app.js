// 화면 구성
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');

const App = { route: 'home', params: {}, cleanup: null };
const TAB_OF = { home: 'home', books: 'books', book: 'books', import: 'books', study: 'study', flash: 'study', games: 'games', play: 'games', wrong: 'wrong', settings: '', account: '' };

function go(route, params = {}) {
  if (App.cleanup) { App.cleanup(); App.cleanup = null; }
  window.speechSynthesis?.cancel();
  App.route = route;
  App.params = params;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === TAB_OF[route]));
  view.innerHTML = '';
  (Views[route] || Views.home)(view, params);
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (t && !t.closest('#view')) go(t.dataset.go);
});

function on(root, sel, ev, fn) { $$(sel, root).forEach((el) => el.addEventListener(ev, (e) => fn(e, el))); }

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function statusBadge(id) {
  const st = Store.status(id);
  if (Store.state.wrong[id]) return '<span class="badge bad">오답</span>';
  if (st === 'learned') return '<span class="badge ok">외움</span>';
  if (st === 'learning') return '<span class="badge">학습중</span>';
  return '<span class="badge gray">새 단어</span>';
}

function bookSelect(id, selected) {
  return `<select id="${id}">${Store.books().map((b) =>
    `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${esc(b.name)} (${b.words.length})</option>`).join('')}</select>`;
}

function unitOptions(bookId, selected) {
  return Store.units(bookId).map((u) =>
    `<option value="${esc(u.name)}" ${u.name === selected ? 'selected' : ''}>${esc(u.label)} · ${u.count}개</option>`).join('');
}

function emptyBooks(el) {
  el.innerHTML = `
    <div class="card center stack">
      <div style="font-size:48px">📚</div>
      <h2>아직 단어장이 없어요</h2>
      <p class="muted">교과서·학습지 단어 파일을 가져오거나, 직접 입력하거나,<br>샘플 단어장으로 먼저 체험해 보세요.</p>
      <button class="btn block" data-a="import">📂 파일로 단어장 만들기</button>
      <button class="btn secondary block" data-a="new">✍️ 빈 단어장 만들고 직접 입력</button>
      <button class="btn ghost block" data-a="sample">🧪 샘플 단어장 추가</button>
    </div>`;
  on(el, '[data-a=import]', 'click', () => go('import'));
  on(el, '[data-a=new]', 'click', () => {
    const name = prompt('단어장 이름', '중2 영어 교과서');
    if (name) go('book', { id: Store.addBook(name).id });
  });
  on(el, '[data-a=sample]', 'click', () => { addSample(); go(App.route, App.params); });
}

function addSample() {
  const b = Store.addBook(SAMPLE_BOOK.name);
  Store.addWords(b.id, SAMPLE_BOOK.words);
  Store.setCurrentBook(b.id);
  toast(`샘플 단어 ${SAMPLE_BOOK.words.length}개를 추가했어요`);
}

// =====================================================================
const Views = {};

// ---------------------------------------------------------------- 홈
Views.home = (el) => {
  const book = Store.currentBook();
  if (!book) return emptyBooks(el);
  const st = Store.bookStats(book.id);
  const plan = Store.todayPlan(book.id);
  const planLearned = plan.ids.filter((id) => Store.status(id) === 'learned').length;
  const pct = plan.ids.length ? Math.round((planLearned / plan.ids.length) * 100) : 100;
  const wrongCount = Store.wrongList().length;
  const units = Store.units(book.id);

  el.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <div class="grow">${bookSelect('home-book', book.id)}</div>
    </div>

    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><b>${st.total}</b><span>전체 단어</span></div>
      <div class="stat"><b style="color:var(--ok)">${st.learned}</b><span>외운 단어</span></div>
      <div class="stat"><b style="color:var(--bad)">${wrongCount}</b><span>오답노트</span></div>
      <div class="stat"><b style="color:var(--accent)">${Store.streakDays()}</b><span>연속 학습일</span></div>
    </div>

    <div class="card stack">
      <div class="row between">
        <h2 style="margin:0">📅 오늘의 단어</h2>
        <span class="badge">${plan.ids.length}개</span>
      </div>
      ${plan.ids.length ? `
        <div class="progress ok"><i style="width:${pct}%"></i></div>
        <p class="muted small">${planLearned} / ${plan.ids.length}개 외움 ${pct === 100 ? '· 🎉 오늘 목표 달성!' : ''}</p>
        <div class="grid2">
          <button class="btn big" data-a="study-today">✏️ 학습하기</button>
          <button class="btn accent big" data-a="test-today">🎮 게임 테스트</button>
        </div>` : `
        <p class="muted">이 단어장의 단어를 모두 외웠어요! 🎉 오답노트나 게임으로 복습해 보세요.</p>`}
    </div>

    ${wrongCount ? `
    <div class="card row between clickable" data-a="wrong">
      <div><h3 style="margin:0">❗ 틀린 단어 ${wrongCount}개</h3><p class="muted small" style="margin:0">다시 학습하고 오답노트를 비워 보세요</p></div>
      <span class="btn bad sm">복습</span>
    </div>` : ''}

    ${units.length > 1 ? `
    <div class="card">
      <h2>📖 단원별 진도</h2>
      <ul class="list">
        ${units.map((u) => {
          const ws = Store.wordsOfUnit(book.id, u.name);
          const l = ws.filter((w) => Store.status(w.id) === 'learned').length;
          return `<li class="clickable" data-unit="${esc(u.name)}">
            <div class="grow"><div class="w">${esc(u.label)}</div>
            <div class="progress ok" style="height:6px;margin-top:4px"><i style="width:${(l / ws.length) * 100}%"></i></div></div>
            <span class="muted small">${l}/${ws.length}</span></li>`;
        }).join('')}
      </ul>
    </div>` : ''}`;

  on(el, '#home-book', 'change', (e) => { Store.setCurrentBook(e.target.value); go('home'); });
  on(el, '[data-a=study-today]', 'click', () => go('flash', { ids: plan.ids, title: '오늘의 단어' }));
  on(el, '[data-a=test-today]', 'click', () => go('games', { source: 'today' }));
  on(el, '[data-a=wrong]', 'click', () => go('wrong'));
  on(el, '[data-unit]', 'click', (e, li) => go('study', { mode: 'unit', unit: li.dataset.unit }));
};

// ---------------------------------------------------------------- 단어장 목록
Views.books = (el) => {
  if (!Store.books().length) return emptyBooks(el);
  el.innerHTML = `
    <h1>📚 단어장</h1>
    <div class="grid2" style="margin-bottom:14px">
      <button class="btn" data-a="import">📂 파일/붙여넣기로 가져오기</button>
      <button class="btn secondary" data-a="new">✍️ 새 단어장</button>
    </div>
    ${Store.books().map((b) => {
      const st = Store.bookStats(b.id);
      const units = Store.units(b.id).filter((u) => u.name).length;
      return `<div class="card clickable" data-id="${b.id}">
        <div class="row between"><h2 style="margin:0">${esc(b.name)}</h2>
        ${b.id === Store.currentBook()?.id ? '<span class="badge">학습 중</span>' : ''}</div>
        <p class="muted small" style="margin:4px 0 8px">단어 ${st.total}개 · 단원 ${units}개 · 외움 ${st.learned}개</p>
        <div class="progress ok"><i style="width:${st.total ? (st.learned / st.total) * 100 : 0}%"></i></div>
      </div>`;
    }).join('')}`;
  on(el, '[data-a=import]', 'click', () => go('import'));
  on(el, '[data-a=new]', 'click', () => {
    const name = prompt('단어장 이름', '');
    if (name) go('book', { id: Store.addBook(name).id });
  });
  on(el, '[data-id]', 'click', (e, c) => go('book', { id: c.dataset.id }));
};

// ---------------------------------------------------------------- 단어장 상세 / 개별 입력
Views.book = (el, { id, unit = '__all' }) => {
  const b = Store.book(id);
  if (!b) return go('books');
  const units = Store.units(id);
  const words = unit === '__all' ? b.words : b.words.filter((w) => w.unit === unit);

  el.innerHTML = `
    <div class="row between" style="margin-bottom:8px">
      <button class="btn ghost sm" data-a="back">← 목록</button>
      <div class="row">
        <button class="btn ghost sm" data-a="rename">이름 변경</button>
        <button class="btn ghost sm" data-a="export">CSV 내보내기</button>
        <button class="btn ghost sm" data-a="delete" style="color:var(--bad)">삭제</button>
      </div>
    </div>
    <h1>${esc(b.name)}</h1>

    <div class="card stack">
      <h2>✍️ 단어 직접 추가</h2>
      <div class="grid2">
        <div><label class="field">영단어 *</label><input type="text" id="f-word" placeholder="예: decide" autocapitalize="off"></div>
        <div><label class="field">뜻 *</label><input type="text" id="f-meaning" placeholder="예: 결정하다"></div>
        <div><label class="field">단원</label><input type="text" id="f-unit" list="unit-list" placeholder="예: Lesson 1" value="${esc(unit !== '__all' ? unit : (units[units.length - 1]?.name || ''))}">
          <datalist id="unit-list">${units.map((u) => `<option value="${esc(u.name)}">`).join('')}</datalist></div>
        <div><label class="field">예문 (선택)</label><input type="text" id="f-example" placeholder="예: I decided to go."></div>
      </div>
      <div class="row">
        <button class="btn" data-a="add">추가</button>
        <button class="btn secondary" data-a="import">📂 이 단어장에 파일 가져오기</button>
      </div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:6px">
        <h2 style="margin:0">단어 ${words.length}개</h2>
        <select id="unit-filter" style="width:auto;max-width:60%">
          <option value="__all">전체 단원</option>${unitOptions(id, unit)}
        </select>
      </div>
      ${words.length ? `<ul class="list">
        ${words.map((w) => `<li data-id="${w.id}">
          <button class="speak" style="margin:0" data-say="${esc(w.word)}">🔊</button>
          <div class="grow"><div class="w">${esc(w.word)}</div><div class="m">${esc(w.meaning)}${w.unit && unit === '__all' ? ` · <span class="small">${esc(w.unit)}</span>` : ''}</div></div>
          ${statusBadge(w.id)}
          <button class="btn ghost sm" data-edit>✏️</button>
          <button class="btn ghost sm" data-del>🗑</button>
        </li>`).join('')}</ul>` : '<p class="muted center">단어가 없어요. 위에서 추가해 보세요.</p>'}
    </div>`;

  const addWord = () => {
    const item = { word: $('#f-word').value, meaning: $('#f-meaning').value, unit: $('#f-unit').value, example: $('#f-example').value };
    if (!item.word.trim() || !item.meaning.trim()) return toast('영단어와 뜻을 입력해 주세요');
    const r = Store.addWords(id, [item]);
    if (!r.added) return toast('이미 같은 단원에 있는 단어예요');
    toast(`'${item.word.trim()}' 추가!`);
    go('book', { id, unit });
    $('#f-word').focus();
  };
  on(el, '[data-a=add]', 'click', addWord);
  on(el, '#f-word, #f-meaning, #f-unit, #f-example', 'keydown', (e) => { if (e.key === 'Enter') addWord(); });
  on(el, '[data-a=back]', 'click', () => go('books'));
  on(el, '[data-a=import]', 'click', () => go('import', { bookId: id }));
  on(el, '[data-a=rename]', 'click', () => { const n = prompt('새 이름', b.name); if (n) { Store.renameBook(id, n); go('book', { id, unit }); } });
  on(el, '[data-a=delete]', 'click', () => {
    if (confirm(`'${b.name}' 단어장과 학습 기록을 모두 삭제할까요?`)) { Store.deleteBook(id); go('books'); }
  });
  on(el, '[data-a=export]', 'click', () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿word,meaning,unit,example\n' + b.words.map((w) => [w.word, w.meaning, w.unit, w.example].map(q).join(',')).join('\n');
    download(`${b.name}.csv`, csv, 'text/csv');
  });
  on(el, '#unit-filter', 'change', (e) => go('book', { id, unit: e.target.value }));
  on(el, '[data-say]', 'click', (e, btn) => speak(btn.dataset.say));
  on(el, '[data-del]', 'click', (e, btn) => {
    const wid = btn.closest('li').dataset.id;
    const w = b.words.find((x) => x.id === wid);
    if (confirm(`'${w.word}' 를 삭제할까요?`)) { Store.deleteWord(id, wid); go('book', { id, unit }); }
  });
  on(el, '[data-edit]', 'click', (e, btn) => {
    const wid = btn.closest('li').dataset.id;
    const w = b.words.find((x) => x.id === wid);
    const word = prompt('영단어', w.word); if (word === null) return;
    const meaning = prompt('뜻', w.meaning); if (meaning === null) return;
    const ex = prompt('예문 (선택)', w.example || ''); if (ex === null) return;
    if (word.trim() && meaning.trim()) Store.updateWord(id, wid, { word: word.trim(), meaning: meaning.trim(), example: ex.trim() });
    go('book', { id, unit });
  });
};

// ---------------------------------------------------------------- 가져오기
Views.import = (el, { bookId } = {}) => {
  let parsed = null, fileName = '';
  const target = bookId ? Store.book(bookId) : null;

  el.innerHTML = `
    <div class="row" style="margin-bottom:8px"><button class="btn ghost sm" data-a="back">← 뒤로</button></div>
    <h1>📂 단어 가져오기${target ? ` <span class="muted small">→ ${esc(target.name)}</span>` : ''}</h1>
    <div class="seg" style="margin-bottom:12px">
      <button class="on" data-tab="file">파일</button>
      <button data-tab="paste">붙여넣기</button>
      <button data-tab="url">웹 주소/API</button>
    </div>

    <div class="card stack" data-pane="file">
      <p>엑셀(.xlsx), CSV, TXT 파일을 올려주세요.</p>
      <input type="file" id="imp-file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json">
      <p class="muted small">
        • 첫 줄에 <b>word, meaning, unit, example</b> (또는 영단어, 뜻, 단원, 예문) 머리글이 있으면 자동 인식<br>
        • 머리글이 없어도 영어/한글 칸을 자동으로 찾아요. 아래 미리보기에서 바꿀 수 있어요<br>
        • "Lesson 1", "# Unit 2", "3과" 처럼 한 칸만 있는 줄은 단원 제목으로 인식<br>
        • 엑셀 시트가 여러 개면 시트 이름을 단원으로 사용
      </p>
    </div>

    <div class="card stack hidden" data-pane="paste">
      <p>한 줄에 단어 하나씩 붙여넣으세요.</p>
      <textarea id="imp-text" placeholder="Lesson 1&#10;decide 결정하다&#10;habit - 습관&#10;nervous: 긴장한&#10;&#10;Lesson 2&#10;recycle	재활용하다"></textarea>
      <button class="btn secondary" data-a="parse-text">미리보기</button>
    </div>

    <div class="card stack hidden" data-pane="url">
      <p>CSV·JSON 파일 주소나 학습지 사이트 API 주소를 넣으세요.</p>
      <input type="url" id="imp-url" placeholder="https://.../words.csv">
      <button class="btn secondary" data-a="fetch">불러오기</button>
      <p class="muted small">
        JSON 형식: <code>[{"word":"decide","meaning":"결정하다","unit":"Lesson 1"}]</code><br>
        교재사 전용 API는 제휴·키 발급 후 연결할 수 있도록 자리를 만들어 두었어요 (js/importer.js).
        상대 사이트가 외부 접근(CORS)을 막으면 브라우저에서 바로는 못 불러와요.
      </p>
    </div>

    <div id="imp-preview"></div>`;

  on(el, '[data-a=back]', 'click', () => (bookId ? go('book', { id: bookId }) : go('books')));
  on(el, '[data-tab]', 'click', (e, b) => {
    $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-pane]', el).forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
  });

  const run = async (fn, name) => {
    try {
      parsed = await fn();
      fileName = name;
      if (!parsed.rows.some((r) => r.cells)) throw new Error('단어를 찾지 못했어요. 형식을 확인해 주세요.');
      preview();
    } catch (err) {
      $('#imp-preview').innerHTML = `<div class="card" style="color:var(--bad)">⚠️ ${esc(err.message)}</div>`;
    }
  };
  on(el, '#imp-file', 'change', (e) => {
    const f = e.target.files[0];
    if (f) run(() => Importer.readFile(f), f.name.replace(/\.[^.]+$/, ''));
  });
  on(el, '[data-a=parse-text]', 'click', () => run(async () => Importer.parseText($('#imp-text').value), '붙여넣은 단어'));
  on(el, '[data-a=fetch]', 'click', () => {
    const url = $('#imp-url').value.trim();
    if (url) run(() => Importer.fromUrl(url), '가져온 단어');
  });

  function preview() {
    const mapping = parsed.mapping;
    const box = $('#imp-preview');
    const shown = parsed.rows.slice(0, 30);
    const render = () => {
      const items = Importer.build(parsed, mapping);
      const unitSet = new Set(items.map((i) => i.unit).filter(Boolean));
      box.innerHTML = `
        <div class="card stack">
          <h2>미리보기</h2>
          <p class="muted small">각 열이 무엇인지 맞는지 확인하세요. 단어 <b>${items.length}개</b> · 단원 <b>${unitSet.size}개</b> 인식</p>
          <div class="table-wrap"><table class="preview">
            <tr>${mapping.map((m, i) => `<th><select data-col="${i}">${Importer.FIELDS.map((f) =>
              `<option value="${f.key}" ${f.key === m ? 'selected' : ''}>${f.label}</option>`).join('')}</select></th>`).join('')}</tr>
            ${shown.map((r) => r.cells
              ? `<tr>${mapping.map((_, i) => `<td>${esc(r.cells[i] || '')}</td>`).join('')}</tr>`
              : `<tr><td class="sec" colspan="${mapping.length}">📖 단원: ${esc(r.section)}</td></tr>`).join('')}
          </table></div>
          ${parsed.rows.length > shown.length ? `<p class="muted small">… 외 ${parsed.rows.length - shown.length}줄</p>` : ''}
          ${target ? '' : `
            <label class="field">저장할 단어장</label>
            <select id="imp-target">
              <option value="__new">+ 새 단어장 만들기</option>
              ${Store.books().map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
            </select>
            <input type="text" id="imp-name" value="${esc(fileName)}" placeholder="새 단어장 이름">`}
          <button class="btn big block" data-a="save" ${items.length ? '' : 'disabled'}>✅ ${items.length}개 단어 저장</button>
        </div>`;
      on(box, '[data-col]', 'change', (e, s) => { mapping[+s.dataset.col] = s.value; render(); });
      on(box, '#imp-target', 'change', (e) => $('#imp-name').classList.toggle('hidden', e.target.value !== '__new'));
      on(box, '[data-a=save]', 'click', () => {
        if (!mapping.includes('word') || !mapping.includes('meaning')) return toast('영단어 열과 뜻 열을 지정해 주세요');
        let id = target?.id || $('#imp-target').value;
        if (id === '__new') id = Store.addBook($('#imp-name').value || fileName).id;
        const r = Store.addWords(id, items);
        Store.setCurrentBook(id);
        toast(`${r.added}개 저장${r.skipped ? ` · 중복/빈칸 ${r.skipped}개 제외` : ''}`);
        go('book', { id });
      });
    };
    render();
    box.scrollIntoView({ behavior: 'smooth' });
  }
};

// ---------------------------------------------------------------- 학습 설정
Views.study = (el, { mode = 'today', unit } = {}) => {
  const book = Store.currentBook();
  if (!book) return emptyBooks(el);
  const units = Store.units(book.id);
  const plan = Store.todayPlan(book.id);
  const unitName = unit ?? units[0]?.name ?? '';
  const st = Store.bookStats(book.id);

  el.innerHTML = `
    <h1>✏️ 단어 학습</h1>
    <div class="card stack">
      <label class="field">단어장</label>
      ${bookSelect('st-book', book.id)}
      <div class="seg">
        <button data-mode="today" class="${mode === 'today' ? 'on' : ''}">오늘의 단어</button>
        <button data-mode="unit" class="${mode === 'unit' ? 'on' : ''}">단원별</button>
        <button data-mode="all" class="${mode === 'all' ? 'on' : ''}">전체</button>
      </div>

      <div data-pane="today" class="stack ${mode === 'today' ? '' : 'hidden'}">
        <p>아직 못 외운 단어를 하루 <b>${Store.state.settings.dailyCount}개</b>씩 학습해요.</p>
        <div class="row">
          <label class="muted small">하루 목표</label>
          <input type="number" id="st-count" min="1" max="200" value="${Store.state.settings.dailyCount}" style="width:90px">
          <span class="muted small">개</span>
          <button class="btn ghost sm" data-a="save-count">적용</button>
        </div>
        <p class="muted small">오늘의 단어: ${plan.ids.length}개 · ${plan.ids.map((i) => esc(Store.findWord(i)?.word)).slice(0, 12).join(', ')}${plan.ids.length > 12 ? ' …' : ''}</p>
        <button class="btn big block" data-a="go-today" ${plan.ids.length ? '' : 'disabled'}>학습 시작 (${plan.ids.length}개)</button>
      </div>

      <div data-pane="unit" class="stack ${mode === 'unit' ? '' : 'hidden'}">
        <p>선택한 단원의 단어를 모두 학습해요.</p>
        <select id="st-unit">${unitOptions(book.id, unitName)}</select>
        <label class="row small"><input type="checkbox" id="st-unit-new"> 아직 못 외운 단어만</label>
        <button class="btn big block" data-a="go-unit">단원 학습 시작</button>
      </div>

      <div data-pane="all" class="stack ${mode === 'all' ? '' : 'hidden'}">
        <p>단어장 전체 ${st.total}개 (못 외운 단어 ${st.total - st.learned}개)</p>
        <label class="row small"><input type="checkbox" id="st-all-new" checked> 아직 못 외운 단어만</label>
        <label class="row small"><input type="checkbox" id="st-shuffle" checked> 순서 섞기</label>
        <button class="btn big block" data-a="go-all">전체 학습 시작</button>
      </div>
    </div>
    <p class="muted small center">카드를 눌러 뜻을 확인하고 <b>알아요 / 몰라요</b>를 고르세요. 모르는 단어는 오답노트에 저장돼요.</p>`;

  on(el, '#st-book', 'change', (e) => { Store.setCurrentBook(e.target.value); go('study', { mode }); });
  on(el, '[data-mode]', 'click', (e, b) => go('study', { mode: b.dataset.mode, unit }));
  on(el, '[data-a=save-count]', 'click', () => {
    const n = Math.max(1, Math.min(200, parseInt($('#st-count').value, 10) || 10));
    Store.state.settings.dailyCount = n;
    Store.resetTodayPlan(book.id);
    toast(`하루 ${n}개로 바꿨어요`);
    go('study', { mode: 'today' });
  });
  on(el, '[data-a=go-today]', 'click', () => go('flash', { ids: plan.ids, title: '오늘의 단어' }));
  on(el, '[data-a=go-unit]', 'click', () => {
    const u = $('#st-unit').value;
    let ws = Store.wordsOfUnit(book.id, u);
    if ($('#st-unit-new').checked) ws = ws.filter((w) => Store.status(w.id) !== 'learned');
    if (!ws.length) return toast('학습할 단어가 없어요');
    go('flash', { ids: ws.map((w) => w.id), title: units.find((x) => x.name === u)?.label });
  });
  on(el, '[data-a=go-all]', 'click', () => {
    let ws = book.words;
    if ($('#st-all-new').checked) ws = ws.filter((w) => Store.status(w.id) !== 'learned');
    if ($('#st-shuffle').checked) ws = Games.shuffle(ws);
    if (!ws.length) return toast('학습할 단어가 없어요');
    go('flash', { ids: ws.map((w) => w.id), title: '전체 학습' });
  });
};

// ---------------------------------------------------------------- 플래시카드
Views.flash = (el, { ids, title = '학습', reverse = false }) => {
  const words = Store.wordsByIds(ids);
  let i = 0, flipped = false;
  const known = [], unknown = [];

  function show() {
    if (i >= words.length) return summary();
    const w = words[i];
    flipped = false;
    el.innerHTML = `
      <div class="row between">
        <button class="btn ghost sm" data-a="quit">✕ 그만하기</button>
        <span class="muted small">${esc(title)}</span>
        <label class="row small muted"><input type="checkbox" id="fl-rev" ${reverse ? 'checked' : ''}> 뜻 먼저</label>
      </div>
      <div class="progress" style="margin-top:12px"><i style="width:${(i / words.length) * 100}%"></i></div>
      <p class="muted small center" style="margin-top:6px">${i + 1} / ${words.length}</p>
      <div class="flash-wrap"><div class="flash" id="card">
        <div class="face front">
          ${reverse ? `<div class="big-mean">${esc(w.meaning)}</div>` : `<div class="big-word">${esc(w.word)}</div><button class="speak" data-say>🔊 발음 듣기</button>`}
          ${w.unit ? `<span class="badge gray" style="margin-top:12px">${esc(w.unit)}</span>` : ''}
          <div class="hint">탭해서 뒤집기 (Space)</div>
        </div>
        <div class="face back">
          <div class="big-word" style="font-size:28px">${esc(w.word)}</div>
          <div class="big-mean" style="margin-top:6px">${esc(w.meaning)}</div>
          ${w.example ? `<div class="ex">${esc(w.example)}</div>` : ''}
          <button class="speak" data-say>🔊</button>
        </div>
      </div></div>
      <div class="grid2" style="grid-template-columns:1fr 1fr">
        <button class="btn bad big" data-a="no">😵 몰라요 (←)</button>
        <button class="btn ok big" data-a="yes">😎 알아요 (→)</button>
      </div>`;
    if (!reverse) speak(w.word);
    $('#card').addEventListener('click', (e) => { if (!e.target.closest('[data-say]')) flip(); });
    on(el, '[data-say]', 'click', () => speak(w.word));
    on(el, '[data-a=yes]', 'click', () => answer(true));
    on(el, '[data-a=no]', 'click', () => answer(false));
    on(el, '[data-a=quit]', 'click', () => (known.length + unknown.length ? summary() : go('study')));
    on(el, '#fl-rev', 'change', (e) => { reverse = e.target.checked; show(); });
  }
  function flip() {
    flipped = !flipped;
    $('#card').classList.toggle('flipped', flipped);
    if (flipped && reverse) speak(words[i].word);
  }
  function answer(ok) {
    const w = words[i];
    Store.markStudied(w.id, ok);
    (ok ? known : unknown).push(w);
    i++;
    show();
  }
  function summary() {
    App.cleanup?.(); App.cleanup = null;
    el.innerHTML = `
      <div class="card result-hero">
        <div class="emoji">${unknown.length === 0 ? '🏆' : '💪'}</div>
        <h1 style="margin:6px 0">${esc(title)} 학습 완료!</h1>
        <p class="muted">알아요 <b style="color:var(--ok)">${known.length}</b> · 몰라요 <b style="color:var(--bad)">${unknown.length}</b></p>
      </div>
      ${unknown.length ? `<div class="card"><h2>😵 모르는 단어 (오답노트에 저장됨)</h2>
        <ul class="list">${unknown.map((w) => `<li><div class="grow"><span class="w">${esc(w.word)}</span> <span class="m">${esc(w.meaning)}</span></div></li>`).join('')}</ul></div>` : ''}
      <div class="stack">
        ${unknown.length ? `<button class="btn bad big block" data-a="again">🔁 모르는 단어 다시 보기 (${unknown.length})</button>` : ''}
        <button class="btn accent big block" data-a="test">🎮 방금 학습한 단어로 게임 테스트</button>
        <button class="btn ghost block" data-a="home">홈으로</button>
      </div>`;
    const studied = [...known, ...unknown].map((w) => w.id);
    on(el, '[data-a=again]', 'click', () => go('flash', { ids: unknown.map((w) => w.id), title: '다시 보기', reverse }));
    on(el, '[data-a=test]', 'click', () => go('games', { source: 'ids', ids: studied, label: `방금 학습한 단어 ${studied.length}개` }));
    on(el, '[data-a=home]', 'click', () => go('home'));
  }

  const key = (e) => {
    if (i >= words.length || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') answer(true);
    else if (e.key === 'ArrowLeft') answer(false);
  };
  document.addEventListener('keydown', key);
  App.cleanup = () => document.removeEventListener('keydown', key);
  if (!words.length) return go('study');
  show();
};

// ---------------------------------------------------------------- 게임 선택
Views.games = (el, params = {}) => {
  const book = Store.currentBook();
  if (!book) return emptyBooks(el);
  const units = Store.units(book.id);
  const wrongIds = Store.wrongList().map((w) => w.id);
  let source = params.source || 'today';
  let game = params.game || localStorage.getItem('dj-last-game') || 'quiz';

  const sources = [
    ...(params.source === 'ids' ? [{ id: 'ids', label: params.label }] : []),
    { id: 'today', label: '오늘의 단어' },
    { id: 'unit', label: '단원 선택' },
    { id: 'wrong', label: `오답노트 (${wrongIds.length})` },
    { id: 'random', label: '단어장에서 랜덤' },
  ];

  el.innerHTML = `
    <h1>🎮 게임 테스트</h1>
    <div class="card stack">
      <h2>1. 어떤 단어로?</h2>
      <div class="row" style="gap:6px">${sources.map((s) =>
        `<button class="btn sm ${s.id === source ? '' : 'secondary'}" data-src="${s.id}">${esc(s.label)}</button>`).join('')}</div>
      <div data-src-pane="unit" class="${source === 'unit' ? '' : 'hidden'}"><select id="g-unit">${unitOptions(book.id)}</select></div>
      <div data-src-pane="random" class="row ${source === 'random' ? '' : 'hidden'}">
        <input type="number" id="g-n" value="15" min="2" max="100" style="width:90px"><span class="muted small">개 (${esc(book.name)})</span></div>
      <p class="muted small" id="g-info"></p>
    </div>
    <div class="card stack">
      <h2>2. 어떤 게임?</h2>
      ${Games.LIST.map((g) => `
        <button class="choice-card ${g.id === game ? 'on' : ''}" data-game="${g.id}">
          <div class="row between"><span class="t">${g.emoji} ${g.name}</span>
          ${Store.state.best[g.id] ? `<span class="badge">최고 ${Store.state.best[g.id]}점</span>` : ''}</div>
          <div class="d">${g.desc}</div>
        </button>`).join('')}
    </div>
    <button class="btn accent big block" data-a="start">▶ 게임 시작</button>`;

  function pickWords() {
    if (source === 'ids') return Store.wordsByIds(params.ids);
    if (source === 'today') return Store.wordsByIds(Store.todayPlan(book.id).ids);
    if (source === 'unit') return Store.wordsOfUnit(book.id, $('#g-unit').value);
    if (source === 'wrong') return Store.wordsByIds(wrongIds);
    const n = Math.max(2, parseInt($('#g-n').value, 10) || 15);
    return Games.shuffle(book.words).slice(0, n);
  }
  const info = () => { $('#g-info').textContent = `문제 ${pickWords().length}개`; };
  info();

  on(el, '[data-src]', 'click', (e, b) => {
    source = b.dataset.src;
    $$('[data-src]', el).forEach((x) => x.classList.toggle('secondary', x !== b));
    $$('[data-src-pane]', el).forEach((p) => p.classList.toggle('hidden', p.dataset.srcPane !== source));
    info();
  });
  on(el, '#g-unit, #g-n', 'change', info);
  on(el, '[data-game]', 'click', (e, b) => {
    game = b.dataset.game;
    $$('[data-game]', el).forEach((x) => x.classList.toggle('on', x === b));
  });
  on(el, '[data-a=start]', 'click', () => {
    const words = pickWords();
    const g = Games.get(game);
    if (words.length < g.min) return toast('문제로 낼 단어가 부족해요');
    try { localStorage.setItem('dj-last-game', game); } catch {}
    go('play', { game, ids: words.map((w) => w.id) });
  });
};

// ---------------------------------------------------------------- 게임 진행 + 결과
Views.play = (el, { game, ids }) => {
  const g = Games.get(game);
  const words = Store.wordsByIds(ids);
  // 오답 보기용 단어 풀: 같은 단어장 전체 (부족하면 모든 단어)
  const bookIds = new Set(words.map((w) => w.bookId));
  let pool = Store.allWords().filter((w) => bookIds.has(w.bookId));
  if (pool.length < 8) pool = Store.allWords();

  const results = new Map(); // wordId -> correct (게임 중 한 번이라도 틀리면 false)

  el.innerHTML = `
    <div class="row between" style="margin-bottom:10px">
      <h2 style="margin:0">${g.emoji} ${g.name}</h2>
      <button class="btn ghost sm" data-a="quit">✕ 그만</button>
    </div>
    <div id="stage"></div>`;
  const stage = $('#stage');

  const ctx = {
    words, pool, speak,
    answer(id, ok) {
      Store.recordAnswer(id, ok);
      results.set(id, (results.get(id) ?? true) && ok);
    },
    finish({ score, note }) {
      App.cleanup?.(); App.cleanup = null;
      showResult(score, note);
    },
  };
  on(el, '[data-a=quit]', 'click', () => ctx.finish({ score: 0, note: '중간에 그만뒀어요' }));
  App.cleanup = g.start(stage, ctx);

  function showResult(score, note) {
    const wrong = words.filter((w) => results.get(w.id) === false);
    const right = words.filter((w) => results.get(w.id) === true);
    const total = right.length + wrong.length;
    const rate = total ? Math.round((right.length / total) * 100) : 0;
    const best = score > 0 && Store.setBest(game, score);
    el.innerHTML = `
      <div class="card result-hero">
        <div class="emoji">${rate >= 90 ? '🏆' : rate >= 70 ? '🎉' : rate >= 40 ? '💪' : '📚'}</div>
        <div class="sc">${score}점</div>
        ${best ? '<span class="badge" style="background:#fff2e6;color:var(--accent)">🎊 최고 기록!</span>' : ''}
        <p class="muted" style="margin-top:6px">정답 ${right.length} / ${total} (${rate}%)</p>
        ${note ? `<p class="muted small">${esc(note)}</p>` : ''}
      </div>
      ${wrong.length ? `
      <div class="card"><h2>❌ 틀린 단어 ${wrong.length}개 <span class="muted small">· 오답노트에 저장됨</span></h2>
        <ul class="list">${wrong.map((w) => `<li>
          <button class="speak" style="margin:0" data-say="${esc(w.word)}">🔊</button>
          <div class="grow"><div class="w">${esc(w.word)}</div><div class="m">${esc(w.meaning)}</div></div></li>`).join('')}</ul>
      </div>` : '<div class="card center">모두 맞혔어요! 👏</div>'}
      <div class="stack">
        ${wrong.length ? `
          <button class="btn bad big block" data-a="flash-wrong">📖 틀린 단어 다시 학습</button>
          <button class="btn secondary block" data-a="game-wrong">🎮 틀린 단어로 다시 게임</button>` : ''}
        <button class="btn accent block" data-a="again">🔁 같은 단어로 다시 하기</button>
        <button class="btn ghost block" data-a="list">다른 게임 고르기</button>
      </div>`;
    on(el, '[data-say]', 'click', (e, b) => speak(b.dataset.say));
    on(el, '[data-a=flash-wrong]', 'click', () => go('flash', { ids: wrong.map((w) => w.id), title: '틀린 단어 복습' }));
    on(el, '[data-a=game-wrong]', 'click', () => {
      const wid = wrong.map((w) => w.id);
      go('games', { source: 'ids', ids: wid, label: `방금 틀린 단어 ${wid.length}개`, game });
    });
    on(el, '[data-a=again]', 'click', () => go('play', { game, ids }));
    on(el, '[data-a=list]', 'click', () => go('games'));
  }
};

// ---------------------------------------------------------------- 오답노트
Views.wrong = (el, { bookId = '' } = {}) => {
  const list = Store.wrongList(bookId || undefined);
  const N = Store.state.settings.wrongClearStreak;
  el.innerHTML = `
    <h1>❗ 오답노트</h1>
    <p class="muted small">플래시카드에서 "몰라요" 했거나 게임에서 틀린 단어가 모여요.
      게임에서 <b>${N}번 연속</b> 맞히면 오답노트에서 졸업! 🎓</p>
    ${Store.books().length > 1 ? `<select id="w-book" style="margin-bottom:12px">
      <option value="">모든 단어장</option>
      ${Store.books().map((b) => `<option value="${b.id}" ${b.id === bookId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
    </select>` : ''}
    ${list.length ? `
      <div class="grid2" style="margin-bottom:14px">
        <button class="btn big" data-a="flash">📖 플래시카드 복습</button>
        <button class="btn accent big" data-a="game">🎮 게임으로 복습</button>
      </div>
      <div class="card">
        <div class="row between"><h2 style="margin:0">${list.length}개</h2>
          <button class="btn ghost sm" data-a="clear">모두 비우기</button></div>
        <ul class="list">
          ${list.map((w) => `<li data-id="${w.id}">
            <button class="speak" style="margin:0" data-say="${esc(w.word)}">🔊</button>
            <div class="grow"><div class="w">${esc(w.word)}</div>
              <div class="m">${esc(w.meaning)}${w.unit ? ` · <span class="small">${esc(w.unit)}</span>` : ''}</div></div>
            <div class="center">
              <span class="badge bad">${w.info.count}회 틀림</span><br>
              <span class="dots" title="연속 정답">${Array.from({ length: N }, (_, k) => `<i class="${k < w.info.streak ? 'on' : ''}"></i>`).join('')}</span>
            </div>
            <button class="btn ghost sm" data-rm title="오답노트에서 빼기">✓</button>
          </li>`).join('')}
        </ul>
      </div>` : `
      <div class="card center"><div style="font-size:44px">✨</div><h2>오답노트가 비어 있어요</h2>
        <p class="muted">틀린 단어가 생기면 여기에 모여요.</p></div>`}`;

  const ids = list.map((w) => w.id);
  on(el, '#w-book', 'change', (e) => go('wrong', { bookId: e.target.value }));
  on(el, '[data-a=flash]', 'click', () => go('flash', { ids, title: '오답 복습' }));
  on(el, '[data-a=game]', 'click', () => go('games', { source: 'wrong' }));
  on(el, '[data-a=clear]', 'click', () => { if (confirm('오답노트를 모두 비울까요?')) { Store.clearWrong(bookId || undefined); go('wrong', { bookId }); } });
  on(el, '[data-say]', 'click', (e, b) => speak(b.dataset.say));
  on(el, '[data-rm]', 'click', (e, b) => { Store.removeWrong(b.closest('li').dataset.id); go('wrong', { bookId }); });
};

// ---------------------------------------------------------------- 설정
Views.settings = (el) => {
  const s = Store.state.settings;
  el.innerHTML = `
    <h1>⚙️ 설정</h1>
    <div class="card stack">
      <div><label class="field">하루 학습 단어 수</label><input type="number" id="s-daily" min="1" max="200" value="${s.dailyCount}"></div>
      <div><label class="field">오답노트 졸업 조건 (연속 정답 횟수)</label><input type="number" id="s-streak" min="1" max="10" value="${s.wrongClearStreak}"></div>
      <button class="btn" data-a="save">저장</button>
    </div>
    <div class="card stack">
      <h2>데이터</h2>
      <p class="muted small">${Sync.user
        ? `☁️ ${esc(Sync.user.email)} 계정에 자동 저장 중이에요.`
        : Sync.enabled
          ? '지금은 이 기기에만 저장돼요. <a href="#" data-a="login">로그인</a>하면 클라우드에 저장돼요.'
          : '학습 기록은 이 기기의 브라우저에 저장돼요. 기기를 바꿀 땐 백업 파일을 옮기세요.'}</p>
      <div class="grid2">
        <button class="btn secondary" data-a="backup">💾 백업 내보내기</button>
        <label class="btn secondary">📥 백업 불러오기<input type="file" id="s-restore" accept=".json" hidden></label>
      </div>
      <button class="btn ghost" data-a="sample">🧪 샘플 단어장 추가</button>
      <button class="btn ghost" data-a="reset" style="color:var(--bad)">모든 데이터 초기화</button>
    </div>`;
  on(el, '[data-a=save]', 'click', () => {
    const daily = Math.max(1, Math.min(200, parseInt($('#s-daily').value, 10) || 10));
    s.wrongClearStreak = Math.max(1, Math.min(10, parseInt($('#s-streak').value, 10) || 2));
    if (daily !== s.dailyCount) {
      s.dailyCount = daily;
      Store.books().forEach((b) => Store.resetTodayPlan(b.id));
    }
    Store.save();
    toast('저장했어요');
  });
  on(el, '[data-a=login]', 'click', (e) => { e.preventDefault(); go('account'); });
  on(el, '[data-a=backup]', 'click', () => download(`danjjang-backup-${Store.today()}.json`, Store.exportJSON(), 'application/json'));
  on(el, '#s-restore', 'change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요?')) return;
      Store.importJSON(await f.text());
      toast('복원했어요');
      go('home');
    } catch (err) { toast('복원 실패: ' + err.message); }
  });
  on(el, '[data-a=sample]', 'click', () => { addSample(); go('home'); });
  on(el, '[data-a=reset]', 'click', () => {
    if (confirm('단어장과 학습 기록이 모두 지워져요. 계속할까요?')) { Store.reset(); go('home'); }
  });
};

