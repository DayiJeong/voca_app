// 게임식 테스트 모음
// 각 게임: start(el, ctx) → cleanup 함수 반환
// ctx = { words, pool, answer(wordId, correct), finish({score}), speak(text) }
const Games = (() => {
  const shuffle = (a) => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (t) => String(t).toLowerCase().replace(/[^a-z]/g, '');

  /** 오답 보기 n개: 뜻/단어가 겹치지 않게 */
  function distractors(target, pool, n) {
    const used = new Set([target.meaning.trim(), target.word.trim().toLowerCase()]);
    const out = [];
    for (const w of shuffle(pool)) {
      if (out.length >= n) break;
      if (w.id === target.id || used.has(w.meaning.trim()) || used.has(w.word.trim().toLowerCase())) continue;
      used.add(w.meaning.trim()); used.add(w.word.trim().toLowerCase());
      out.push(w);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // 1. 스피드 퀴즈: 4지선다 + 제한시간 + 콤보
  // ------------------------------------------------------------------
  function speedQuiz(el, ctx) {
    const TIME = 10;
    const qs = shuffle(ctx.words);
    let i = 0, score = 0, combo = 0, raf = 0, tmo = 0, locked = false;

    function next() {
      if (i >= qs.length) return ctx.finish({ score });
      const w = qs[i];
      const enToKo = Math.random() < 0.6;
      const opts = shuffle([w, ...distractors(w, ctx.pool, 3)]);
      locked = false;
      el.innerHTML = `
        <div class="game-head">
          <span class="badge gray">${i + 1} / ${qs.length}</span>
          <span class="combo">${combo >= 2 ? `🔥 ${combo} 콤보` : ''}</span>
          <span class="score">${score}점</span>
        </div>
        <div class="timer"><i></i></div>
        <div class="card quiz-q">
          <div class="muted small">${enToKo ? '알맞은 뜻을 고르세요' : '알맞은 영단어를 고르세요'}</div>
          <div class="q">${esc(enToKo ? w.word : w.meaning)}</div>
          ${enToKo ? '<button class="speak" data-say>🔊 발음</button>' : ''}
        </div>
        <div class="quiz-opts">
          ${opts.map((o) => `<button data-id="${o.id}">${esc(enToKo ? o.meaning : o.word)}</button>`).join('')}
        </div>`;
      el.querySelector('[data-say]')?.addEventListener('click', () => ctx.speak(w.word));
      if (enToKo) ctx.speak(w.word);
      el.querySelectorAll('.quiz-opts button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.id)));

      const bar = el.querySelector('.timer > i');
      const start = performance.now();
      const tick = (now) => {
        const left = TIME - (now - start) / 1000;
        bar.style.width = Math.max(0, (left / TIME) * 100) + '%';
        if (left <= 0) return pick(null);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      function pick(id) {
        if (locked) return;
        locked = true;
        cancelAnimationFrame(raf);
        const left = Math.max(0, TIME - (performance.now() - start) / 1000);
        const ok = id === w.id;
        el.querySelectorAll('.quiz-opts button').forEach((b) => {
          b.disabled = true;
          if (b.dataset.id === w.id) b.classList.add('right');
          else if (b.dataset.id === id) b.classList.add('wrong');
        });
        if (ok) { combo++; score += 100 + Math.round(left * 10) + (combo >= 2 ? combo * 20 : 0); }
        else combo = 0;
        ctx.answer(w.id, ok);
        i++;
        tmo = setTimeout(next, ok ? 650 : 1500);
      }
    }
    next();
    return () => { cancelAnimationFrame(raf); clearTimeout(tmo); };
  }

  // ------------------------------------------------------------------
  // 2. 카드 짝맞추기: 단어 카드와 뜻 카드를 뒤집어 짝 찾기 (라운드당 최대 6쌍)
  // ------------------------------------------------------------------
  function matching(el, ctx) {
    const PER = 6;
    const all = shuffle(ctx.words);
    const rounds = [];
    for (let k = 0; k < all.length; k += PER) rounds.push(all.slice(k, k + PER));
    // 마지막 라운드가 1쌍뿐이면 앞 라운드에 합치기
    if (rounds.length > 1 && rounds[rounds.length - 1].length < 2) rounds[rounds.length - 2].push(...rounds.pop());

    let r = 0, score = 0, timers = [], clock = 0;

    function round() {
      if (r >= rounds.length) return ctx.finish({ score });
      const words = rounds[r];
      const missed = new Set();
      let open = [], matched = 0, moves = 0, busy = false;
      const t0 = Date.now();
      const cards = shuffle(words.flatMap((w) => [
        { id: w.id, text: w.word, ko: false },
        { id: w.id, text: w.meaning, ko: true },
      ]));
      el.innerHTML = `
        <div class="game-head">
          <span class="badge gray">라운드 ${r + 1} / ${rounds.length}</span>
          <span class="muted small" data-clock>0초 · 0회</span>
          <span class="score">${score}점</span>
        </div>
        <p class="muted small center">같은 뜻의 영단어와 우리말 카드를 짝지어 보세요</p>
        <div class="match-grid">
          ${cards.map((c, k) => `<button class="mcard" data-k="${k}">?</button>`).join('')}
        </div>`;
      const btns = [...el.querySelectorAll('.mcard')];
      const clockEl = el.querySelector('[data-clock]');
      clearInterval(clock);
      clock = setInterval(() => { clockEl.textContent = `${Math.floor((Date.now() - t0) / 1000)}초 · ${moves}회`; }, 500);

      btns.forEach((b) => b.addEventListener('click', () => {
        const k = +b.dataset.k, c = cards[k];
        if (busy || c.done || open.includes(k)) return;
        b.classList.add('open'); if (c.ko) b.classList.add('ko');
        b.textContent = c.text;
        if (!c.ko) ctx.speak(c.text);
        open.push(k);
        if (open.length < 2) return;
        moves++;
        const [a, bb] = open.map((x) => cards[x]);
        if (a.id === bb.id) {
          open.forEach((x) => { cards[x].done = true; btns[x].className = 'mcard done'; });
          open = [];
          matched++;
          if (matched === words.length) {
            clearInterval(clock);
            const sec = (Date.now() - t0) / 1000;
            words.forEach((w) => ctx.answer(w.id, !missed.has(w.id)));
            score += Math.max(50, words.length * 100 - Math.round(sec) * 3 - (moves - words.length) * 15);
            r++;
            timers.push(setTimeout(round, 700));
          }
        } else {
          busy = true;
          // 한 번이라도 짝을 잘못 맞춘 단어는 오답 처리
          [a, bb].forEach((x) => missed.add(x.id));
          open.forEach((x) => btns[x].classList.add('miss'));
          timers.push(setTimeout(() => {
            open.forEach((x) => { btns[x].className = 'mcard'; btns[x].textContent = '?'; });
            open = []; busy = false;
          }, 850));
        }
      }));
    }
    round();
    return () => { timers.forEach(clearTimeout); clearInterval(clock); };
  }

  // ------------------------------------------------------------------
  // 3. 단어 비 (타이핑): 떨어지는 뜻을 보고 영단어를 입력해서 터뜨리기
  // ------------------------------------------------------------------
  function rain(el, ctx) {
    const queue = shuffle(ctx.words);
    const total = queue.length;
    let lives = 5, score = 0, drops = [], spawnT = 0, raf = 0, last = 0, done = 0, ended = false;
    el.innerHTML = `
      <div class="game-head">
        <span class="hearts" data-hearts></span>
        <span class="badge gray" data-left></span>
        <span class="score" data-score>0점</span>
      </div>
      <div class="rain-field"><div class="ground"></div></div>
      <input class="rain-input" type="text" placeholder="영단어를 입력하고 Enter" autocomplete="off" autocapitalize="off" spellcheck="false">
      <p class="muted small center" style="margin-top:6px">뜻 아래 힌트: 첫 글자와 글자 수</p>`;
    const field = el.querySelector('.rain-field');
    const input = el.querySelector('.rain-input');
    const hud = () => {
      el.querySelector('[data-hearts]').textContent = '❤️'.repeat(lives) + '🤍'.repeat(5 - lives);
      el.querySelector('[data-left]').textContent = `${done} / ${total}`;
      el.querySelector('[data-score]').textContent = score + '점';
    };
    hud();
    setTimeout(() => input.focus(), 50);

    const hint = (word) => word.split('').map((ch, i) => (i === 0 || ch === ' ' ? ch : '_')).join('');

    function spawn() {
      const w = queue.shift();
      if (!w) return;
      const d = document.createElement('div');
      d.className = 'drop';
      d.innerHTML = `${esc(w.meaning)}<small>${esc(hint(w.word))}</small>`;
      field.appendChild(d);
      const maxX = Math.max(0, field.clientWidth - d.offsetWidth - 6);
      d.style.left = Math.round(Math.random() * maxX) + 'px';
      const speed = 28 + Math.min(40, done * 2); // px/s, 점점 빨라짐
      drops.push({ w, el: d, y: -10, speed });
    }

    function hit(drop, ok) {
      drops = drops.filter((x) => x !== drop);
      done++;
      ctx.answer(drop.w.id, ok);
      if (ok) {
        drop.el.classList.add('pop');
        setTimeout(() => drop.el.remove(), 300);
      } else {
        drop.el.remove();
        lives--;
      }
      hud();
    }

    function loop(now) {
      if (ended) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      spawnT -= dt;
      const interval = Math.max(1.6, 3.2 - done * 0.08);
      if ((spawnT <= 0 && queue.length && drops.length < 4) || (!drops.length && queue.length)) { spawn(); spawnT = interval; }
      const floor = field.clientHeight - 6;
      for (const d of [...drops]) {
        d.y += d.speed * dt;
        d.el.style.transform = `translateY(${d.y}px)`;
        if (d.y + d.el.offsetHeight >= floor) {
          // 놓친 단어: 정답을 잠깐 보여주기
          toastMiss(d.w);
          hit(d, false);
        }
      }
      if (lives <= 0 || (!queue.length && !drops.length)) return end();
      raf = requestAnimationFrame(loop);
    }

    function toastMiss(w) {
      const t = document.createElement('div');
      t.className = 'drop';
      t.style.cssText = `left:50%;transform:translateX(-50%);top:40%;background:var(--bad);color:#fff;z-index:2`;
      t.textContent = `${w.meaning} = ${w.word}`;
      field.appendChild(t);
      setTimeout(() => t.remove(), 1400);
    }

    function end() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      // 하트가 다 떨어져 못 본 단어는 기록하지 않음
      setTimeout(() => ctx.finish({ score, note: lives <= 0 ? `하트가 모두 사라졌어요! (${done}/${total}개 진행)` : '' }), 600);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = clean(input.value);
      input.value = '';
      if (!v) return;
      // 가장 아래에 있는 일치 단어부터
      const target = [...drops].sort((a, b) => b.y - a.y).find((d) => clean(d.w.word) === v);
      if (target) {
        score += 100 + Math.round((field.clientHeight - target.y) / 4);
        ctx.speak(target.w.word);
        hit(target, true);
      } else {
        input.classList.add('shake');
        input.style.borderColor = 'var(--bad)';
        setTimeout(() => (input.style.borderColor = ''), 400);
      }
    });

    raf = requestAnimationFrame(loop);
    return () => { ended = true; cancelAnimationFrame(raf); };
  }

  // ------------------------------------------------------------------
  // 4. 철자 퍼즐: 섞인 알파벳을 순서대로 눌러 단어 완성
  // ------------------------------------------------------------------
  function spelling(el, ctx) {
    const qs = shuffle(ctx.words);
    let i = 0, score = 0, tmo = 0;

    function next() {
      if (i >= qs.length) return ctx.finish({ score });
      const w = qs[i];
      const letters = w.word.replace(/\s+/g, '').split('');
      let tiles = shuffle(letters.map((ch, k) => ({ ch, k })));
      // 섞었는데 그대로면 한 번 더
      if (letters.length > 1 && tiles.every((t, k) => t.k === k)) tiles = tiles.reverse();
      const picked = [];
      let hints = 0, locked = false;

      el.innerHTML = `
        <div class="game-head">
          <span class="badge gray">${i + 1} / ${qs.length}</span>
          <span></span>
          <span class="score">${score}점</span>
        </div>
        <div class="card">
          <div class="spell-mean">${esc(w.meaning)}</div>
          <div class="spell-slots" data-slots></div>
          <div class="tiles" data-tiles>
            ${tiles.map((t, k) => `<button data-k="${k}">${esc(t.ch)}</button>`).join('')}
          </div>
          <div class="row" style="justify-content:center;margin-top:16px">
            <button class="btn ghost sm" data-back>⌫ 지우기</button>
            <button class="btn ghost sm" data-hint>💡 힌트</button>
            <button class="btn ghost sm" data-pass>모르겠어요</button>
          </div>
        </div>`;
      const slots = el.querySelector('[data-slots]');
      const tileBtns = [...el.querySelectorAll('[data-tiles] button')];

      function drawSlots(showAnswer) {
        let n = 0;
        slots.innerHTML = w.word.split('').map((ch) => {
          if (/\s/.test(ch)) return '<span class="gap"></span>';
          const p = picked[n++];
          const txt = showAnswer ? ch : p !== undefined ? tiles[p].ch : '';
          return `<span>${esc(txt)}</span>`;
        }).join('');
      }
      drawSlots(false);

      function check() {
        if (picked.length < letters.length) return;
        const typed = picked.map((p) => tiles[p].ch).join('');
        finishQ(typed.toLowerCase() === letters.join('').toLowerCase());
      }
      function finishQ(ok) {
        locked = true;
        slots.classList.add(ok ? 'right' : 'wrong');
        if (!ok) drawSlots(true);
        ctx.speak(w.word);
        if (ok) score += Math.max(30, 100 + letters.length * 10 - hints * 40);
        ctx.answer(w.id, ok && hints < letters.length - 1);
        i++;
        tmo = setTimeout(next, ok ? 900 : 1800);
      }

      tileBtns.forEach((b) => b.addEventListener('click', () => {
        if (locked) return;
        picked.push(+b.dataset.k);
        b.disabled = true;
        drawSlots(false);
        check();
      }));
      el.querySelector('[data-back]').addEventListener('click', () => {
        if (locked || picked.length <= hints) return;
        const k = picked.pop();
        tileBtns[k].disabled = false;
        drawSlots(false);
      });
      el.querySelector('[data-hint]').addEventListener('click', () => {
        if (locked) return;
        // 힌트: 틀린 입력은 지우고 다음 글자 하나를 채워줌
        while (picked.length > hints) tileBtns[picked.pop()].disabled = false;
        const need = letters[picked.length];
        const k = tiles.findIndex((t, idx) => !tileBtns[idx].disabled && t.ch === need);
        if (k < 0) return;
        picked.push(k); tileBtns[k].disabled = true; hints++;
        drawSlots(false);
        check();
      });
      el.querySelector('[data-pass]').addEventListener('click', () => { if (!locked) finishQ(false); });
    }
    next();
    return () => clearTimeout(tmo);
  }

  const LIST = [
    { id: 'quiz', name: '스피드 퀴즈', emoji: '⚡', desc: '4지선다 · 10초 제한 · 연속 정답 콤보 보너스', min: 2, start: speedQuiz },
    { id: 'match', name: '카드 짝맞추기', emoji: '🃏', desc: '영단어 카드와 뜻 카드를 뒤집어 짝 찾기', min: 2, start: matching },
    { id: 'rain', name: '단어 비 (타이핑)', emoji: '🌧️', desc: '떨어지는 뜻을 보고 영단어를 쳐서 터뜨리기 · 철자 연습', min: 1, start: rain },
    { id: 'spell', name: '철자 퍼즐', emoji: '🧩', desc: '섞인 알파벳을 순서대로 눌러 단어 완성', min: 1, start: spelling },
  ];

  return { LIST, get: (id) => LIST.find((g) => g.id === id), shuffle };
})();
