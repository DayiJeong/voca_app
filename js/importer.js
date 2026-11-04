// 단어 파일 가져오기: CSV / TSV / TXT / 엑셀(xlsx, xls) / 붙여넣기 / URL(JSON·CSV)
const Importer = (() => {
  const FIELDS = [
    { key: 'word', label: '영단어' },
    { key: 'meaning', label: '뜻' },
    { key: 'unit', label: '단원' },
    { key: 'example', label: '예문' },
    { key: '', label: '(무시)' },
  ];

  const HEADER_WORDS = {
    word: ['word', 'words', 'english', 'eng', 'voca', 'vocabulary', '영어', '영단어', '단어', '어휘'],
    meaning: ['meaning', 'meanings', 'korean', 'kor', 'definition', '뜻', '의미', '한국어', '해석', '우리말'],
    unit: ['unit', 'lesson', 'chapter', 'day', 'part', '단원', '과', '레슨', '챕터', '회차'],
    example: ['example', 'sentence', 'examples', '예문', '예시', '문장'],
  };

  const HANGUL = /[ㄱ-ㆎ가-힣]/;
  const SECTION = /^\s*(#+\s*|\[.*\]$|<.*>$|(lesson|unit|chapter|day|part|step)\s*\.?\s*\d+|\d+\s*(과|단원|강|일차))/i;

  // ---------- 파일 읽기 ----------
  async function readFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') return readExcel(file);
    if (ext === 'json') return fromJSON(JSON.parse(await decodeText(file)));
    return parseText(await decodeText(file));
  }

  /** UTF-8 우선, 실패하면 EUC-KR(엑셀에서 저장한 한글 CSV) */
  async function decodeText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch { return new TextDecoder('euc-kr').decode(buf); }
  }

  let xlsxLoading = null;
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    xlsxLoading ||= new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = res;
      sc.onerror = () => { xlsxLoading = null; rej(new Error('엑셀 모듈을 불러오지 못했어요. 인터넷 연결을 확인하거나 CSV로 저장해서 올려주세요.')); };
      document.head.appendChild(sc);
    });
    return xlsxLoading;
  }

  async function readExcel(file) {
    await loadSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const multi = wb.SheetNames.length > 1;
    let rows = [];
    for (const name of wb.SheetNames) {
      const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false })
        .map((r) => r.map((c) => String(c ?? '').trim()));
      if (!sheetRows.some((r) => r.some(Boolean))) continue;
      // 시트가 여러 개면 시트 이름을 단원 이름으로 사용
      if (multi) rows.push({ section: name });
      rows = rows.concat(sheetRows);
    }
    return analyze(rows);
  }

  // ---------- 텍스트 파싱 ----------
  function parseCSVLine(line, delim) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
      else if (c === delim) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  /** 줄 하나를 [영단어, 뜻] 으로 나누기 (구분자가 없을 때): "apple 사과", "apple - 사과", "apple: 사과" */
  function splitLoose(line) {
    const m = line.match(/^(.+?)\s*(?:\s-\s|:|=|\|)\s*(.+)$/);
    if (m && !HANGUL.test(m[1])) return [m[1].trim(), m[2].trim()];
    const idx = line.search(HANGUL);
    if (idx > 0) {
      const left = line.slice(0, idx).replace(/[\s\-:=|.,]+$/, '').replace(/^\d+[.)]\s*/, '').trim();
      if (left) return [left, line.slice(idx).trim()];
    }
    return [line.trim()];
  }

  function parseText(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const tabCount = lines.filter((l) => l.includes('\t')).length;
    // "apple,사과" 처럼 한글보다 쉼표가 먼저 나오면 CSV, "save 절약하다, 구하다" 는 CSV 아님
    const csvLike = lines.filter((l) => {
      const c = l.indexOf(','), h = l.search(HANGUL);
      return c >= 0 && (h < 0 || c < h);
    }).length;
    let rows;
    if (tabCount >= lines.length * 0.5) rows = lines.map((l) => parseCSVLine(l, '\t'));
    else if (csvLike >= lines.length * 0.5) rows = lines.map((l) => parseCSVLine(l, ','));
    else rows = lines.map(splitLoose);
    return analyze(rows);
  }

  function fromJSON(data) {
    const arr = Array.isArray(data) ? data : (data.words || data.items || data.data || []);
    if (!Array.isArray(arr) || !arr.length) throw new Error('JSON에서 단어 목록을 찾지 못했어요.');
    if (Array.isArray(arr[0])) return analyze(arr.map((r) => r.map(String)));
    const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
    return analyze([keys, ...arr.map((o) => keys.map((k) => String(o[k] ?? '')))]);
  }

  // ---------- 분석: 머리글/단원줄 인식 + 열 추측 ----------
  function headerField(cell) {
    const c = String(cell).trim().toLowerCase().replace(/[\s_()]/g, '');
    if (!c) return null;
    for (const [field, words] of Object.entries(HEADER_WORDS)) {
      if (words.includes(c)) return field;
    }
    return null;
  }

  function analyze(rawRows) {
    // 1) 단원 표시 줄 분리 ("Lesson 1", "# Unit 2", "[3과]" 처럼 칸이 하나뿐인 줄)
    const rows = [];
    let section = '';
    let header = null;
    for (const r of rawRows) {
      if (r && r.section !== undefined) { section = r.section; rows.push({ section }); continue; }
      const cells = r.map((c) => String(c ?? '').trim());
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (!cells.length) continue;
      const filled = cells.filter(Boolean);
      if (filled.length === 1 && SECTION.test(filled[0])) {
        section = filled[0].replace(/^#+\s*|^\[|\]$|^<|>$/g, '').trim();
        rows.push({ section });
        continue;
      }
      // 2) 머리글 줄 (데이터 시작 전 첫 줄)
      if (!header && !rows.some((x) => x.cells)) {
        const fields = cells.map(headerField);
        if (fields.filter(Boolean).length >= 2) { header = fields; continue; }
      }
      rows.push({ cells, section });
    }

    const dataRows = rows.filter((r) => r.cells);
    const colCount = Math.max(0, ...dataRows.map((r) => r.cells.length));
    const mapping = header ? padMapping(header, colCount) : guessMapping(dataRows, colCount);
    return { rows, colCount, mapping, hasHeader: !!header };
  }

  function padMapping(fields, n) {
    const m = [];
    for (let i = 0; i < n; i++) m.push(fields[i] || '');
    return m;
  }

  function guessMapping(dataRows, n) {
    const sample = dataRows.slice(0, 50);
    const scores = [];
    for (let i = 0; i < n; i++) {
      const vals = sample.map((r) => r.cells[i] || '').filter(Boolean);
      const total = vals.length || 1;
      const hangul = vals.filter((v) => HANGUL.test(v)).length / total;
      const shortEn = vals.filter((v) => /^[a-zA-Z][a-zA-Z\s'’.\-~()/]*$/.test(v) && v.split(/\s+/).length <= 4).length / total;
      const sentence = vals.filter((v) => /^[A-Za-z"'].*\s.*\s.*/.test(v) && !HANGUL.test(v) && v.split(/\s+/).length >= 4).length / total;
      const unitLike = vals.filter((v) => /^(lesson|unit|chapter|day|part)?\s*\d+\s*(과|단원|강)?$/i.test(v)).length / total;
      const distinct = new Set(vals).size / total;
      scores.push({ i, hangul, shortEn, sentence, unitLike, distinct, filled: vals.length });
    }
    const m = new Array(n).fill('');
    const take = (field, scoreFn, min) => {
      let best = null;
      for (const sc of scores) {
        if (m[sc.i] || !sc.filled) continue;
        const v = scoreFn(sc);
        if (v >= min && (!best || v > best.v)) best = { i: sc.i, v };
      }
      if (best) m[best.i] = field;
    };
    take('unit', (s) => (s.unitLike > 0.8 && s.distinct < 0.5 ? s.unitLike : 0), 0.8);
    take('word', (s) => s.shortEn, 0.5);
    take('meaning', (s) => s.hangul, 0.5);
    take('example', (s) => s.sentence, 0.4);
    // 그래도 못 찾았으면 순서대로
    if (!m.includes('word')) { const i = m.indexOf(''); if (i >= 0) m[i] = 'word'; }
    if (!m.includes('meaning')) { const i = m.indexOf(''); if (i >= 0) m[i] = 'meaning'; }
    return m;
  }

  /** 분석 결과 + 열 지정 → 단어 목록 */
  function build(parsed, mapping) {
    const items = [];
    for (const r of parsed.rows) {
      if (!r.cells) continue;
      const it = { word: '', meaning: '', unit: '', example: '' };
      mapping.forEach((field, i) => {
        if (!field) return;
        const v = r.cells[i] || '';
        it[field] = it[field] ? it[field] + ', ' + v : v;
      });
      if (!it.unit) it.unit = r.section || '';
      if (it.word && it.meaning) items.push(it);
    }
    return items;
  }

  // ---------- 외부 연동 ----------
  /**
   * URL에서 단어 가져오기 (CSV/TSV/TXT/JSON).
   * 교재사 API를 연결할 때는 이 함수처럼 "응답 → analyze() 입력 형식" 으로 바꾸는 어댑터를 추가하면 됨.
   * 예) PROVIDERS.push({ id:'publisherX', name:'OO교재', fetch: async (opts) => fromJSON(await (await fetch(...)).json()) })
   * 주의: 브라우저에서 직접 부르면 상대 서버가 CORS를 허용해야 함. 막히면 서버 프록시가 필요.
   */
  async function fromUrl(url) {
    let res;
    try { res = await fetch(url); }
    catch { throw new Error('불러오지 못했어요. 주소가 맞는지, 그 사이트가 외부 접근(CORS)을 허용하는지 확인해 주세요.'); }
    if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (type.includes('json') || /^\s*[[{]/.test(text)) return fromJSON(JSON.parse(text));
    return parseText(text);
  }

  const PROVIDERS = [
    { id: 'url', name: '웹 주소 (CSV/JSON)', ready: true },
    // 교재사 API는 제휴/키 발급 후 추가 예정
  ];

  return { FIELDS, readFile, parseText, fromJSON, fromUrl, build, PROVIDERS };
})();
