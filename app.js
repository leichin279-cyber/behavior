/* app.js — 화면 전환, 기록, 간격기록, 설정 */
(function () {
  var E = Charts.esc, R = Reports;
  var main = document.getElementById('main');
  var railBtns = Array.prototype.slice.call(document.querySelectorAll('.rail-btn'));
  var sheetEl = document.getElementById('sheet');
  var snackEl = document.getElementById('snackbar');
  var toastEl = document.getElementById('toast');
  var sideEl = document.getElementById('side');
  var sideLog = document.getElementById('side-log');

  var S = {
    screen: 'home',
    sessionId: null,
    catId: null,
    reportStudentId: null,
    reportDays: 14,
    setupTab: 'behaviors',
    snack: null,
    snackTimer: null,
    cue: null,
    interval: null,
    lpTimer: null,
    lpFired: false
  };

  /* ================= 유틸 ================= */
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }
  function buzz(ms) {
    if (!DB.settings().vibrate) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms || 18); } catch (e) {} }
  }
  function now() { return Date.now(); }
  function hhmm(ts) { var d = new Date(ts); return R.pad(d.getHours()) + ':' + R.pad(d.getMinutes()); }
  function hhmmss(ts) { var d = new Date(ts); return R.pad(d.getHours()) + ':' + R.pad(d.getMinutes()) + ':' + R.pad(d.getSeconds()); }
  function initials(code) { return (code || '?').trim().slice(0, 2).toUpperCase(); }

  function openSheet(title, body, onMount) {
    sheetEl.innerHTML = '<div class="sheet-panel" role="dialog" aria-modal="true" aria-label="' + E(title) + '">' +
      '<div class="sheet-head"><h2>' + E(title) + '</h2><button class="sheet-close" data-sheet-close aria-label="닫기">✕</button></div>' +
      body + '</div>';
    sheetEl.hidden = false;
    if (onMount) onMount(sheetEl);
    var f = sheetEl.querySelector('input,select,textarea'); if (f && window.innerWidth > 700) f.focus();
  }
  function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ''; }
  sheetEl.addEventListener('click', function (e) {
    if (e.target === sheetEl || e.target.closest('[data-sheet-close]')) closeSheet();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); hideSnack(); } });

  function download(name, text, mime) {
    try {
      var blob = new Blob(['\ufeff' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('내려받았습니다');
    } catch (err) {
      openSheet(name, '<p class="small muted">내려받기가 막힌 환경입니다. 아래 내용을 복사해서 저장하세요.</p>' +
        '<textarea class="field" style="width:100%;min-height:220px;font-family:var(--mono);font-size:.75rem">' + E(text) + '</textarea>');
    }
  }

  /* ================= 내비게이션 ================= */
  function go(screen) {
    S.screen = screen;
    railBtns.forEach(function (b) {
      var on = b.dataset.nav === screen || (screen === 'session' && b.dataset.nav === 'home') || (screen === 'interval' && b.dataset.nav === 'home');
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    render();
    main.scrollTop = 0; window.scrollTo(0, 0);
  }
  railBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.nav === 'home' && S.sessionId) { go('session'); return; }
      go(b.dataset.nav);
    });
  });

  function render() {
    if (S.screen === 'home') main.innerHTML = viewHome();
    else if (S.screen === 'session') main.innerHTML = viewSession();
    else if (S.screen === 'interval') main.innerHTML = viewInterval();
    else if (S.screen === 'report') main.innerHTML = viewReport();
    else if (S.screen === 'setup') main.innerHTML = viewSetup();
    updateSide();
  }

  /* ================= 홈 ================= */
  function viewHome() {
    var studs = DB.students();
    var open = DB.dat().sessions.filter(function (s) { return !s.endedAt; })[0];
    var h = '<div class="page-head"><div class="grow"><div class="eyebrow">행동기록</div><h1>학생을 고르면 바로 시작합니다</h1></div>' +
      '<button class="btn" data-act="add-student">학생 추가</button></div>';

    if (open) {
      var st = DB.student(open.studentId);
      h += '<div class="card" style="border-color:var(--live);margin-bottom:14px"><div class="row">' +
        '<div class="grow"><strong>진행 중인 세션</strong><div class="small muted">' + E(st ? st.code : '?') + ' · ' + hhmm(open.startedAt) + ' 시작</div></div>' +
        '<button class="btn primary" data-act="resume" data-id="' + open.id + '">이어서 기록</button>' +
        '<button class="btn ghost" data-act="end-session" data-id="' + open.id + '">종료</button></div></div>';
    }

    if (!studs.length) {
      h += '<div class="empty"><strong>등록된 학생이 없습니다</strong>학생을 추가하면 기록을 시작할 수 있습니다. 이름 대신 이니셜이나 코드명을 권합니다.</div>';
      return h;
    }

    var since = daysSinceBackup();
    var total = DB.dat().events.filter(function (e) { return !e.deleted; }).length;
    if (total >= 20 && (since == null || since >= 7)) {
      h += '<div class="card" style="border-color:var(--warn);margin-bottom:14px"><div class="row">' +
        '<div class="grow"><strong>백업할 때가 되었습니다</strong><div class="small muted">' +
        (since == null ? '아직 백업한 적이 없습니다' : since + '일 전에 백업했습니다') +
        ' · 기록 ' + total + '건은 이 기기에만 있습니다</div></div>' +
        '<button class="btn" data-act="export-all">지금 백업</button></div></div>';
    }
    studs.forEach(function (s) {
      var n = DB.dat().events.filter(function (e) { return e.studentId === s.id && !e.deleted; }).length;
      h += '<button class="student-row" data-act="pick-student" data-id="' + s.id + '">' +
        '<span class="avatar">' + E(initials(s.code)) + '</span>' +
        '<span class="grow"><span style="display:block;font-weight:600">' + E(s.code) + '</span>' +
        '<span class="small muted">' + (s.note ? E(s.note) + ' · ' : '') + '누적 ' + n + '건</span></span>' +
        '<span class="pill">시작</span></button>';
    });
    return h;
  }

  function sheetStudent(existing) {
    var s = existing || { code: '', note: '' };
    openSheet(existing ? '학생 수정' : '학생 추가',
      '<div class="field"><label for="f-code">코드명</label><input id="f-code" value="' + E(s.code) + '" placeholder="예: 3-1 김OO 또는 A학생" maxlength="24">' +
      '<span class="hint">개인정보 보호를 위해 실명 대신 이니셜·코드명을 권합니다.</span></div>' +
      '<div class="field"><label for="f-note">메모</label><input id="f-note" value="' + E(s.note || '') + '" placeholder="학년·반, 주 표적행동 등" maxlength="60"></div>' +
      '<div class="row"><button class="btn primary grow" data-act="save-student" data-id="' + (existing ? existing.id : '') + '">저장</button>' +
      (existing ? '<button class="btn danger" data-act="del-student" data-id="' + existing.id + '">삭제</button>' : '') + '</div>');
  }

  /* ================= 세션 시작 ================= */
  var PERIODS = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시', '방과후'];
  var SETTINGS_P = ['특수학급', '통합학급', '운동장', '급식실', '복도', '치료실'];
  var ACTS = ['국어', '수학', '자유놀이', '전이', '집단활동', '개별과제'];

  function chipRow(name, list, sel) {
    return '<div class="chips">' + list.map(function (v) {
      return '<button class="chip' + (v === sel ? ' on' : '') + '" data-chip="' + name + '" data-val="' + E(v) + '">' + E(v) + '</button>';
    }).join('') + '</div>';
  }

  function sheetStartSession(studentId) {
    var st = DB.student(studentId);
    openSheet(E(st.code) + ' · 세션 시작',
      '<div class="chip-label">교시</div>' + chipRow('period', PERIODS, '') +
      '<div class="chip-label">장소</div>' + chipRow('setting', SETTINGS_P, '') +
      '<div class="chip-label">활동</div>' + chipRow('activity', ACTS, '') +
      '<div class="divider"></div>' +
      '<div class="row"><button class="btn primary lg grow" data-act="start-session" data-id="' + studentId + '" data-mode="live">실시간 기록 시작</button></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn lg grow" data-act="start-session" data-id="' + studentId + '" data-mode="interval">간격기록 시작</button></div>' +
      '<p class="note">교시·장소·활동은 선택 사항이지만, 입력해 두면 리포트의 시간대별 히트맵이 만들어집니다.</p>',
      function (root) {
        root.addEventListener('click', function (e) {
          var c = e.target.closest('[data-chip]'); if (!c) return;
          var group = root.querySelectorAll('[data-chip="' + c.dataset.chip + '"]');
          var wasOn = c.classList.contains('on');
          group.forEach(function (g) { g.classList.remove('on'); });
          if (!wasOn) c.classList.add('on');
        });
      });
  }

  function readChip(name) {
    var el = sheetEl.querySelector('[data-chip="' + name + '"].on');
    return el ? el.dataset.val : '';
  }

  async function startSession(studentId, mode) {
    var ses = {
      id: DB.uid('s'), studentId: studentId, startedAt: now(), endedAt: null,
      period: readChip('period'), setting: readChip('setting'), activity: readChip('activity'),
      mode: mode
    };
    DB.dat().sessions.push(ses);
    await DB.saveData();
    S.sessionId = ses.id; S.catId = null; S.cue = null;
    closeSheet();
    go(mode === 'interval' ? 'interval' : 'session');
  }

  async function endSession(id) {
    var ses = DB.session(id || S.sessionId); if (!ses) return;
    DB.dat().events.forEach(function (e) {
      if (e.sessionId === ses.id && e.status === 'running') {
        e.durationSec = Math.round((now() - e.ts) / 1000); e.status = 'done';
      }
    });
    ses.endedAt = now();
    await DB.saveData();
    S.sessionId = null; S.catId = null; S.cue = null; S.interval = null;
    hideSnack();
    toast('세션을 종료했습니다');
    go('home');
  }

  /* ================= 실시간 기록 ================= */
  function runningEvents() {
    if (!S.sessionId) return [];
    return DB.dat().events.filter(function (e) { return e.sessionId === S.sessionId && e.status === 'running' && !e.deleted; });
  }
  function countOf(behaviorId) {
    if (!S.sessionId) return 0;
    return DB.dat().events.filter(function (e) { return e.sessionId === S.sessionId && e.behaviorId === behaviorId && !e.deleted; }).length;
  }
  function catCount(catId) {
    var ids = {}; DB.behaviors(catId).forEach(function (b) { ids[b.id] = 1; });
    return DB.dat().events.filter(function (e) { return e.sessionId === S.sessionId && ids[e.behaviorId] && !e.deleted; }).length;
  }
  function hasLatency() {
    return DB.behaviors().some(function (b) { return b.measure === 'lat'; });
  }

  function viewSession() {
    var ses = DB.session(S.sessionId);
    if (!ses) { S.sessionId = null; return viewHome(); }
    var st = DB.student(ses.studentId);
    var ctx = [ses.period, ses.setting, ses.activity].filter(Boolean).join(' · ');

    var h = '<div class="session-bar">' +
      '<span class="avatar" style="width:34px;height:34px;flex:0 0 34px;border-radius:9px;font-size:.8rem">' + E(initials(st ? st.code : '?')) + '</span>' +
      '<span class="grow"><span class="who">' + E(st ? st.code : '?') + '</span>' +
      (ctx ? '<span class="ctx" style="display:block">' + E(ctx) + '</span>' : '') + '</span>' +
      '<span class="clock" id="ses-clock">00:00</span>' +
      '<button class="btn ghost" data-act="end-session">종료</button></div>';

    /* 진행 중 지속시간 */
    runningEvents().forEach(function (e) {
      var b = DB.behavior(e.behaviorId);
      h += '<div class="live-strip"><span class="live-dot"></span><span class="name">' + E(b ? b.label : '?') + '</span>' +
        '<span class="t" data-since="' + e.ts + '">00:00</span>' +
        '<button class="btn danger" data-act="stop-dur" data-id="' + e.id + '">종료</button></div>';
    });

    /* 지시 제시 */
    if (hasLatency()) {
      if (S.cue) {
        h += '<div class="cue-strip active"><span class="grow">지시 제시 후 대기 중 — 착수하면 해당 행동을 누르세요</span>' +
          '<span class="clock" id="cue-clock" data-since="' + S.cue.ts + '">0초</span>' +
          '<button class="btn ghost" data-act="cue-none">무반응</button></div>';
      } else {
        h += '<div class="cue-strip"><span class="grow muted small">지연시간을 재려면 지시를 준 순간에 누르세요</span>' +
          '<button class="btn" data-act="cue">지시 제시</button></div>';
      }
    }

    /* 타일 */
    if (!S.catId) {
      var cats = DB.categories();
      h += '<div class="tile-grid">' + cats.map(function (c) {
        var n = catCount(c.id);
        return '<button class="tile big" style="--cat:' + c.color + '" data-act="cat" data-id="' + c.id + '">' +
          '<span class="tile-label">' + E(c.label) + '</span>' +
          '<span class="tile-foot"><span class="tile-count' + (n ? '' : ' zero') + '">' + n + '</span>' +
          '<span class="tile-sub">' + DB.behaviors(c.id).length + '개</span></span></button>';
      }).join('') + '</div>';
      h += '<p class="note">영역을 누르고 세부행동을 누르면 저장됩니다. 세부행동을 길게 누르면 조작적 정의와 강도를 조정할 수 있습니다.</p>';
    } else {
      var cat = DB.category(S.catId);
      h += '<div class="row" style="margin-bottom:10px"><button class="btn-back" data-act="cat-back">← 영역 전체</button>' +
        '<span class="pill" style="margin-left:auto">' + E(cat.label) + '</span></div>';
      var bs = DB.behaviors(S.catId);
      if (!bs.length) {
        h += '<div class="empty"><strong>이 영역에 세부행동이 없습니다</strong>설정에서 추가하세요.</div>';
      } else {
        h += '<div class="tile-grid">' + bs.map(function (b) {
          var n = countOf(b.id);
          var run = runningEvents().filter(function (e) { return e.behaviorId === b.id; })[0];
          return '<button class="tile big' + (run ? ' running' : '') + '" style="--cat:' + cat.color + '" data-act="beh" data-id="' + b.id + '">' +
            '<span class="tile-label">' + E(b.label) + '</span>' +
            '<span class="tile-foot"><span class="tile-count' + (n ? '' : ' zero') + '">' + n + '</span>' +
            '<span class="tile-sub">' + (run ? '기록 중 · 눌러 종료' : R.measureName(b.measure)) + '</span></span></button>';
        }).join('') + '</div>';
      }
    }

    h += '<div class="divider"></div><h3 style="margin-bottom:8px">최근 기록</h3><div id="log-inline"></div>';
    return h;
  }

  function logHtml(limit) {
    var evs = DB.eventsOf(S.sessionId).slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, limit || 12);
    if (!evs.length) return '<p class="small muted">아직 기록이 없습니다.</p>';
    return evs.map(function (e) {
      var b = DB.behavior(e.behaviorId);
      var val = '';
      if (e.status === 'running') val = '기록 중';
      else if (e.durationSec != null) val = R.fmtDur(e.durationSec);
      else if (e.latencySec != null) val = '착수 ' + R.fmtDur(e.latencySec);
      if (e.intensity && e.intensity !== 2) val += (val ? ' · ' : '') + '강도 ' + e.intensity;
      return '<div class="log-item' + (b && b.isReplacement ? ' rep' : '') + '">' +
        '<span class="ts">' + hhmmss(e.ts) + '</span>' +
        '<span class="nm">' + E(b ? b.label : '삭제된 행동') + '</span>' +
        '<span class="vl">' + E(val) + '</span></div>';
    }).join('');
  }
  function updateLog() {
    var a = document.getElementById('log-inline'); if (a) a.innerHTML = logHtml(12);
    updateSide();
  }
  function updateSide() {
    if (!sideEl) return;
    if (S.screen === 'session' && S.sessionId) { sideEl.hidden = false; sideLog.innerHTML = logHtml(40); }
    else sideEl.hidden = true;
  }

  async function tapBehavior(behaviorId) {
    var b = DB.behavior(behaviorId); if (!b) return;
    var run = runningEvents().filter(function (e) { return e.behaviorId === behaviorId; })[0];
    if (run) { return stopDuration(run.id); }

    if (b.measure === 'dur' && runningEvents().length >= 2) {
      toast('동시에 잴 수 있는 지속시간은 2건까지입니다');
      return;
    }
    var ev = {
      id: DB.uid('e'), sessionId: S.sessionId, studentId: DB.session(S.sessionId).studentId,
      ts: now(), behaviorId: behaviorId, measure: b.measure,
      durationSec: null, latencySec: null,
      intensity: b.useIntensity ? 2 : null,
      antecedentId: null, consequenceId: null, memo: '',
      status: b.measure === 'dur' ? 'running' : 'done', deleted: false
    };
    if (b.measure === 'lat' && S.cue) {
      ev.latencySec = Math.round((now() - S.cue.ts) / 10) / 100;
      var cue = DB.dat().cues.filter(function (c) { return c.id === S.cue.id; })[0];
      if (cue) cue.resolvedEventId = ev.id;
      S.cue = null;
    }
    DB.dat().events.push(ev);
    await DB.saveData();
    buzz(b.measure === 'dur' ? 26 : 14);
    render();
    updateLog();
    if (ev.status !== 'running') showSnack(ev);
  }

  async function stopDuration(eventId) {
    var e = DB.dat().events.filter(function (x) { return x.id === eventId; })[0];
    if (!e) return;
    e.durationSec = Math.max(1, Math.round((now() - e.ts) / 1000));
    e.status = 'done';
    await DB.saveData();
    buzz(26);
    render(); updateLog(); showSnack(e);
  }

  async function pressCue() {
    var ses = DB.session(S.sessionId); if (!ses) return;
    var cue = { id: DB.uid('u'), sessionId: ses.id, studentId: ses.studentId, ts: now(), resolvedEventId: null };
    DB.dat().cues.push(cue);
    S.cue = cue;
    await DB.saveData();
    buzz(14); render();
  }
  async function cueTimeout(manual) {
    if (!S.cue) return;
    S.cue = null;
    await DB.saveData();
    render();
    if (manual) toast('무반응으로 기록했습니다');
  }

  /* ---------- 스낵바 (실행취소 + ABC) ---------- */
  function showSnack(ev) {
    var b = DB.behavior(ev.behaviorId);
    S.snack = ev.id;
    var secs = DB.settings().snackbarSec || 6;
    var val = ev.durationSec != null ? ' · ' + R.fmtDur(ev.durationSec) : (ev.latencySec != null ? ' · 착수 ' + R.fmtDur(ev.latencySec) : '');
    snackEl.innerHTML =
      '<div class="sb-top"><span class="sb-name">' + E(b ? b.label : '?') + E(val) + '</span>' +
      (b && b.useIntensity ? '<button class="chip" data-act="snack-intensity">강도 ' + (ev.intensity || 2) + '</button>' : '') +
      '<button class="sb-undo" data-act="undo">실행취소</button></div>' +
      '<div class="chip-label">선행사건</div>' +
      '<div class="chips">' + DB.antecedents().map(function (a) {
        return '<button class="chip" data-act="ante" data-id="' + a.id + '">' + E(a.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="chip-label">후속결과</div>' +
      '<div class="chips">' + DB.consequences().map(function (c) {
        return '<button class="chip" data-act="cons" data-id="' + c.id + '">' + E(c.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="sb-progress"><i id="sb-bar"></i></div>';
    snackEl.hidden = false;
    var bar = document.getElementById('sb-bar');
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(function () {
      bar.style.transition = 'transform ' + secs + 's linear';
      bar.style.transform = 'scaleX(0)';
    });
    clearTimeout(S.snackTimer);
    S.snackTimer = setTimeout(hideSnack, secs * 1000);
  }
  function hideSnack() { clearTimeout(S.snackTimer); snackEl.hidden = true; S.snack = null; }
  function holdSnack() {
    clearTimeout(S.snackTimer);
    var bar = document.getElementById('sb-bar');
    if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; }
    S.snackTimer = setTimeout(hideSnack, 8000);
  }

  async function undoLast() {
    if (!S.snack) return;
    var e = DB.dat().events.filter(function (x) { return x.id === S.snack; })[0];
    if (e) { e.deleted = true; await DB.saveData(); }
    hideSnack(); render(); updateLog(); toast('기록을 취소했습니다');
  }
  async function setABC(kind, id) {
    if (!S.snack) return;
    var e = DB.dat().events.filter(function (x) { return x.id === S.snack; })[0]; if (!e) return;
    var field = kind === 'ante' ? 'antecedentId' : 'consequenceId';
    e[field] = (e[field] === id) ? null : id;
    await DB.saveData();
    snackEl.querySelectorAll('[data-act="' + kind + '"]').forEach(function (btn) {
      btn.classList.toggle('on', btn.dataset.id === e[field]);
    });
    holdSnack();
    updateLog();
  }

  function sheetIntensity(eventId) {
    var e = DB.dat().events.filter(function (x) { return x.id === eventId; })[0]; if (!e) return;
    var b = DB.behavior(e.behaviorId);
    openSheet('강도 · ' + (b ? b.label : ''),
      '<p class="small muted">기본값은 2입니다. 팀에서 합의한 기준으로 조정하세요.</p>' +
      [['1', '약함 · 흔적이 남지 않고 즉시 진정'], ['2', '보통 · 제지가 필요하나 손상 없음'], ['3', '심함 · 상해·손상 또는 신체 개입 필요']].map(function (o) {
        return '<button class="iv-toggle' + (String(e.intensity) === o[0] ? ' on' : '') + '" data-act="set-intensity" data-id="' + eventId + '" data-val="' + o[0] + '">' +
          '<span>' + o[0] + '</span><span class="state" style="flex:1;text-align:left;margin-left:10px">' + E(o[1]) + '</span></button>';
      }).join(''));
  }

  function sheetDefinition(behaviorId) {
    var b = DB.behavior(behaviorId); if (!b) return;
    var c = DB.category(b.categoryId);
    openSheet(b.label,
      '<div class="row" style="margin-bottom:10px"><span class="pill">' + E(c ? c.label : '') + '</span>' +
      '<span class="badge-measure">' + R.measureName(b.measure) + '</span>' +
      (b.useIntensity ? '<span class="badge-measure">강도 사용</span>' : '') +
      (b.isReplacement ? '<span class="badge-measure">대체행동</span>' : '') + '</div>' +
      '<div class="chip-label">조작적 정의</div>' +
      '<p style="font-size:.9rem;line-height:1.6">' + (b.definition ? E(b.definition) : '<span class="muted">아직 정의가 없습니다. 설정에서 작성하세요. 정의가 없으면 며칠 뒤의 자신과 기준이 달라집니다.</span>') + '</p>');
  }

  /* ================= 간격기록 ================= */
  function viewInterval() {
    var ses = DB.session(S.sessionId);
    if (!ses) { S.sessionId = null; return viewHome(); }
    var st = DB.student(ses.studentId);

    if (!S.interval) {
      var behs = DB.behaviors();
      return '<div class="page-head"><div class="grow"><div class="eyebrow">간격기록</div><h1>' + E(st.code) + '</h1></div>' +
        '<button class="btn ghost" data-act="end-session">종료</button></div>' +
        '<div class="card"><div class="chip-label">관찰할 행동 (최대 3개)</div>' +
        '<div class="chips">' + behs.map(function (b) {
          return '<button class="chip" data-act="iv-pick" data-id="' + b.id + '">' + E(b.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="divider"></div>' +
        '<div class="chip-label">기록 방식</div>' +
        '<div class="chips">' + [['partial', '부분간격'], ['whole', '전체간격'], ['momentary', '순간표집']].map(function (m) {
          return '<button class="chip' + (m[0] === DB.settings().defaultIntervalMethod ? ' on' : '') + '" data-chip="method" data-val="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="chip-label">간격 길이</div>' +
        '<div class="chips">' + [5, 10, 15, 30].map(function (s) {
          return '<button class="chip' + (s === DB.settings().defaultIntervalSec ? ' on' : '') + '" data-chip="ivsec" data-val="' + s + '">' + s + '초</button>';
        }).join('') + '</div>' +
        '<div class="chip-label">총 관찰시간</div>' +
        '<div class="chips">' + [3, 5, 10, 15, 20].map(function (m) {
          return '<button class="chip' + (m === 5 ? ' on' : '') + '" data-chip="ivmin" data-val="' + m + '">' + m + '분</button>';
        }).join('') + '</div>' +
        '<div class="divider"></div>' +
        '<button class="btn primary lg block" data-act="iv-start">시작</button>' +
        '<p class="note">부분간격은 간격 안에 한 번이라도 나오면 발생, 전체간격은 간격 내내 지속되어야 발생, 순간표집은 간격이 끝나는 순간의 상태만 봅니다. 부분간격 10초가 가장 무난한 기본값입니다.</p></div>';
    }

    var iv = S.interval;
    var total = iv.totalIntervals;
    var h = '<div class="page-head"><div class="grow"><div class="eyebrow">' + R.methodName(iv.method) + ' · ' + iv.intervalSec + '초</div>' +
      '<h1>' + E(st.code) + '</h1></div>' +
      '<button class="btn ghost" data-act="iv-abort">중단</button></div>';
    h += '<div class="card"><div class="iv-clock"><div class="iv-count" id="iv-remain">' + iv.intervalSec + '</div>' +
      '<div class="iv-meta"><span id="iv-idx">1</span> / ' + total + ' 간격 · 남은 시간 <span id="iv-left">--:--</span></div></div>' +
      '<div class="iv-bar"><i id="iv-fill"></i></div>' +
      iv.behaviors.map(function (b, i) {
        var beh = DB.behavior(b.id);
        return '<button class="iv-toggle" data-act="iv-toggle" data-idx="' + i + '">' +
          '<span>' + E(beh ? beh.label : '?') + '</span><span class="state">발생 중이면 눌러 두세요</span></button>' +
          '<div class="iv-cells" id="iv-cells-' + i + '"></div>';
      }).join('') +
      '</div>';
    return h;
  }

  function startInterval() {
    var picked = Array.prototype.slice.call(sheetOrMain().querySelectorAll('[data-act="iv-pick"].on')).map(function (b) { return b.dataset.id; });
    if (!picked.length) { toast('행동을 1개 이상 고르세요'); return; }
    var method = pickChip('method') || 'partial';
    var isec = parseInt(pickChip('ivsec') || '10', 10);
    var mins = parseInt(pickChip('ivmin') || '5', 10);
    S.interval = {
      method: method, intervalSec: isec, totalIntervals: Math.round(mins * 60 / isec),
      index: 0, startTs: now(),
      behaviors: picked.map(function (id) { return { id: id, on: false, onTime: 0, lastOn: null, marks: [] }; })
    };
    render();
    renderCells();
  }
  function sheetOrMain() { return main; }
  function pickChip(name) {
    var el = main.querySelector('[data-chip="' + name + '"].on');
    return el ? el.dataset.val : null;
  }
  function renderCells() {
    if (!S.interval) return;
    S.interval.behaviors.forEach(function (b, i) {
      var box = document.getElementById('iv-cells-' + i); if (!box) return;
      var html = '';
      for (var k = 0; k < S.interval.totalIntervals; k++) {
        var cls = 'iv-cell' + (b.marks[k] ? ' hit' : '') + (k === S.interval.index ? ' now' : '');
        html += '<span class="' + cls + '"></span>';
      }
      box.innerHTML = html;
    });
  }
  function ivToggle(idx) {
    var b = S.interval.behaviors[idx]; if (!b) return;
    b.on = !b.on;
    if (b.on) b.lastOn = now();
    else if (b.lastOn) { b.onTime += (now() - b.lastOn) / 1000; b.lastOn = null; }
    var btn = main.querySelectorAll('[data-act="iv-toggle"]')[idx];
    if (btn) {
      btn.classList.toggle('on', b.on);
      btn.querySelector('.state').textContent = b.on ? '발생 중' : '발생 중이면 눌러 두세요';
    }
    buzz(12);
  }
  function ivTick() {
    var iv = S.interval; if (!iv) return;
    var elapsed = (now() - iv.startTs) / 1000;
    var idx = Math.floor(elapsed / iv.intervalSec);
    var inInt = elapsed - idx * iv.intervalSec;
    var remainEl = document.getElementById('iv-remain');
    if (remainEl) remainEl.textContent = Math.max(0, Math.ceil(iv.intervalSec - inInt));
    var leftEl = document.getElementById('iv-left');
    if (leftEl) leftEl.textContent = R.fmtClock(iv.totalIntervals * iv.intervalSec - elapsed);
    var fill = document.getElementById('iv-fill');
    if (fill) fill.style.width = Math.min(100, (elapsed / (iv.totalIntervals * iv.intervalSec)) * 100) + '%';

    if (idx > iv.index) {
      /* 경계 시점의 상태를 먼저 확정 (순간표집) */
      while (iv.index < idx && iv.index < iv.totalIntervals) {
        iv.behaviors.forEach(function (b) {
          if (b.on && b.lastOn) { b.onTime += (now() - b.lastOn) / 1000; b.lastOn = now(); }
          var mark;
          if (iv.method === 'partial') mark = b.onTime > 0.2;
          else if (iv.method === 'whole') mark = b.onTime >= iv.intervalSec * 0.9;
          else mark = b.on;
          b.marks[iv.index] = !!mark;
          b.onTime = 0;
        });
        iv.index++;
      }
      var idxEl = document.getElementById('iv-idx');
      if (idxEl) idxEl.textContent = Math.min(iv.index + 1, iv.totalIntervals);
      renderCells();
      buzz(30);
      if (iv.index >= iv.totalIntervals) finishInterval();
    }
  }
  async function finishInterval() {
    var iv = S.interval; if (!iv) return;
    var ses = DB.session(S.sessionId);
    iv.behaviors.forEach(function (b) {
      DB.dat().intervalRuns.push({
        id: DB.uid('r'), sessionId: ses.id, studentId: ses.studentId, behaviorId: b.id,
        method: iv.method, intervalSec: iv.intervalSec, ts: now(),
        marks: b.marks.slice(0, iv.totalIntervals).map(function (m) { return !!m; })
      });
    });
    var summary = iv.behaviors.map(function (b) {
      var hits = b.marks.filter(Boolean).length;
      var beh = DB.behavior(b.id);
      return '<div class="stat"><div class="k">' + E(beh ? beh.label : '?') + '</div>' +
        '<div class="v">' + Math.round(hits / iv.totalIntervals * 100) + '%</div>' +
        '<div class="d">' + hits + ' / ' + iv.totalIntervals + ' 간격</div></div>';
    }).join('');
    S.interval = null;
    await DB.saveData();
    render();
    openSheet('간격기록 완료', '<div class="stat-row">' + summary + '</div>' +
      '<p class="note">' + R.methodName(iv.method) + ' · ' + iv.intervalSec + '초 간격으로 기록했습니다. 다음에 비교할 때도 같은 방식과 간격을 사용하세요.</p>' +
      '<button class="btn primary block" data-sheet-close style="margin-top:12px">확인</button>');
  }

  /* ================= 리포트 ================= */
  function viewReport() {
    var studs = DB.students();
    if (!studs.length) return '<div class="empty"><strong>학생이 없습니다</strong>홈에서 학생을 추가하세요.</div>';
    if (!S.reportStudentId || !DB.student(S.reportStudentId)) S.reportStudentId = studs[0].id;
    var h = '<div class="page-head"><div class="grow"><div class="eyebrow">리포트</div><h1>기록 분석</h1></div></div>';
    h += '<div class="card" style="margin-bottom:12px"><div class="row">' +
      '<select id="rep-student" data-act="rep-student" style="min-height:44px;padding:8px 12px;border-radius:9px;border:1px solid var(--line-2);background:var(--surface-2)">' +
      studs.map(function (s) { return '<option value="' + s.id + '"' + (s.id === S.reportStudentId ? ' selected' : '') + '>' + E(s.code) + '</option>'; }).join('') +
      '</select>' +
      '<div class="chips">' + [7, 14, 30, 90].map(function (d) {
        return '<button class="chip' + (d === S.reportDays ? ' on' : '') + '" data-act="rep-days" data-val="' + d + '">' + d + '일</button>';
      }).join('') + '</div>' +
      '<span class="spacer"></span>' +
      '<button class="btn" data-act="export-csv">CSV 내려받기</button></div></div>';
    h += R.render(S.reportStudentId, S.reportDays);
    return h;
  }

  /* ================= 설정 ================= */
  function viewSetup() {
    var tabs = [['behaviors', '행동'], ['abc', '선행·후속'], ['students', '학생'], ['data', '데이터']];
    var h = '<div class="page-head"><div class="grow"><div class="eyebrow">설정</div><h1>기록 세트 편집</h1></div></div>';
    h += '<div class="chips" style="margin-bottom:16px">' + tabs.map(function (t) {
      return '<button class="chip' + (t[0] === S.setupTab ? ' on' : '') + '" data-act="setup-tab" data-val="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (S.setupTab === 'behaviors') {
      h += '<div class="row" style="margin-bottom:10px"><button class="btn" data-act="add-cat">영역 추가</button>' +
        '<span class="small muted">영역 9개, 영역당 세부행동 8개를 넘기지 않는 것이 좋습니다.</span></div>';
      DB.categories(true).forEach(function (c) {
        var bs = DB.behaviors(c.id, true);
        h += '<div class="section-title"><span class="swatch" style="background:' + c.color + '"></span>' +
          '<h2' + (c.archived ? ' class="muted"' : '') + '>' + E(c.label) + (c.archived ? ' (보관됨)' : '') + '</h2>' +
          '<button class="icon-btn" data-act="edit-cat" data-id="' + c.id + '" aria-label="영역 수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>' +
          '<button class="btn ghost small" data-act="add-beh" data-id="' + c.id + '">행동 추가</button></div>';
        if (!bs.length) h += '<p class="small muted" style="margin:0 0 8px">세부행동이 없습니다.</p>';
        bs.forEach(function (b) {
          h += '<div class="def-row' + (b.archived ? ' archived' : '') + '">' +
            '<span class="nm">' + E(b.label) + (b.isReplacement ? ' <span class="badge-measure">대체</span>' : '') + '</span>' +
            '<span class="badge-measure">' + R.measureName(b.measure) + '</span>' +
            (b.useIntensity ? '<span class="badge-measure">강도</span>' : '') +
            '<button class="icon-btn" data-act="edit-beh" data-id="' + b.id + '" aria-label="수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>';
        });
      });
    }

    if (S.setupTab === 'abc') {
      h += '<div class="card"><div class="section-title" style="margin-top:0"><h2>선행사건</h2>' +
        '<button class="btn ghost small" data-act="add-ante">추가</button></div>';
      DB.antecedents(true).forEach(function (a) {
        h += '<div class="def-row' + (a.archived ? ' archived' : '') + '"><span class="nm">' + E(a.label) + '</span>' +
          '<button class="icon-btn" data-act="edit-ante" data-id="' + a.id + '" aria-label="수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>';
      });
      h += '<p class="note">기록 직후 3~6초 안에 고를 수 있는 개수는 6개가 한계입니다.</p></div>';
      h += '<div class="card"><div class="section-title" style="margin-top:0"><h2>후속결과</h2>' +
        '<button class="btn ghost small" data-act="add-cons">추가</button></div>';
      DB.consequences(true).forEach(function (c) {
        h += '<div class="def-row' + (c.archived ? ' archived' : '') + '"><span class="nm">' + E(c.label) + '</span>' +
          '<button class="icon-btn" data-act="edit-cons" data-id="' + c.id + '" aria-label="수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>';
      });
      h += '</div>';
    }

    if (S.setupTab === 'students') {
      h += '<div class="row" style="margin-bottom:10px"><button class="btn" data-act="add-student">학생 추가</button></div>';
      DB.cfg().students.forEach(function (s) {
        h += '<div class="def-row' + (s.archived ? ' archived' : '') + '"><span class="nm">' + E(s.code) + '</span>' +
          '<span class="small muted">' + E(s.note || '') + '</span>' +
          '<button class="icon-btn" data-act="edit-student" data-id="' + s.id + '" aria-label="수정"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>';
      });
      if (!DB.cfg().students.length) h += '<div class="empty"><strong>등록된 학생이 없습니다</strong></div>';
    }

    if (S.setupTab === 'data') {
      var st = DB.settings();
      h += '<div class="card"><h2>기록 옵션</h2><div class="divider"></div>' +
        '<div class="grid-2">' +
        '<div class="field"><label for="op-lat">지시 제시 후 무반응 처리 시간(초)</label><input id="op-lat" type="number" min="5" max="300" value="' + st.latencyTimeoutSec + '"></div>' +
        '<div class="field"><label for="op-snack">저장 후 실행취소·ABC 표시 시간(초)</label><input id="op-snack" type="number" min="3" max="20" value="' + st.snackbarSec + '"></div>' +
        '</div>' +
        '<div class="field"><label><input type="checkbox" id="op-vib" style="width:auto;min-height:0;margin-right:8px"' + (st.vibrate ? ' checked' : '') + '>진동 피드백 사용</label></div>' +
        '<button class="btn primary" data-act="save-settings">옵션 저장</button></div>';
      h += '<div class="card"><h2>백업과 공유</h2><div class="divider"></div>' +
        '<p class="small muted">행동 세트를 파일로 내보내면 다른 학생에게 그대로 쓰거나 동료와 나눌 수 있습니다. 기록 데이터까지 포함해 백업할 수도 있습니다.</p>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn" data-act="export-config">행동 세트 내보내기</button>' +
        '<button class="btn" data-act="export-all">전체 백업 내보내기</button>' +
        '<button class="btn" data-act="import">가져오기</button></div></div>';
      var since = daysSinceBackup();
      h += '<div class="card"><h2>저장 상태</h2><div class="divider"></div>';
      h += '<div class="def-row"><span class="nm">저장 위치</span><span class="small muted">' +
        (Store.backend === 'artifact' ? '미리보기 저장소' : '이 브라우저 안') + '</span></div>';
      h += '<div class="def-row"><span class="nm">영구 보존</span><span class="small muted">' +
        (S.persisted === true ? '승인됨 — 저장공간이 부족해도 지워지지 않습니다'
          : S.persisted === false ? '미승인 — 홈 화면에 추가하면 승인될 가능성이 높습니다'
            : '이 브라우저는 확인을 지원하지 않습니다') + '</span></div>';
      h += '<div class="def-row"><span class="nm">홈 화면 설치</span><span class="small muted">' +
        (isStandalone() ? '설치되어 실행 중' : '미설치 — 브라우저 탭에서 실행 중') + '</span></div>';
      h += '<div class="def-row"><span class="nm">마지막 백업</span><span class="small muted">' +
        (since == null ? '없음' : since === 0 ? '오늘' : since + '일 전') + '</span></div>';
      h += '<p class="note">기록은 브라우저를 닫거나 기기를 꺼도 남습니다. 다만 브라우저 데이터를 지우거나, 아이폰 사파리에서 7일 이상 접속하지 않으면 사라질 수 있습니다. ' +
        (isStandalone() ? '홈 화면에 설치된 상태라 이 위험은 크게 줄어듭니다.' : '<strong>공유 → 홈 화면에 추가</strong>로 설치하면 이 위험이 크게 줄어듭니다.') + '</p>';
      h += '<p class="note">기기끼리 자동으로 동기화되지 않습니다. 휴대폰과 PC의 기록은 별개이므로, 옮기려면 백업 파일을 내보내 다른 기기에서 가져오세요.</p>';
      h += '<p class="note">데이터는 서버로 전송되지 않습니다. 같은 주소를 다른 사람이 열어도 빈 앱이 보일 뿐 이 기록은 보이지 않습니다. 다만 <strong>같은 기기의 같은 브라우저를 쓰는 사람에게는 보입니다.</strong> 공용 PC는 피하고, 학생은 실명 대신 코드명으로 등록하세요.</p>';
      h += '<button class="btn danger" data-act="wipe" style="margin-top:6px">모든 기록 삭제</button></div>';
    }
    return h;
  }

  /* ---------- 설정 편집 시트 ---------- */
  function sheetCategory(id) {
    var c = id ? DB.category(id) : { label: '', color: '#5A6B75', archived: false };
    var colors = ['#C0453A', '#A63D6E', '#B8600F', '#8E7008', '#4E6BC4', '#6A5AA8', '#2F7A8C', '#5A6B75', '#3F7D20'];
    openSheet(id ? '영역 수정' : '영역 추가',
      '<div class="field"><label for="f-label">이름</label><input id="f-label" value="' + E(c.label) + '" maxlength="20"></div>' +
      '<div class="chip-label">색</div><div class="chips" style="margin-bottom:14px">' +
      colors.map(function (col) {
        return '<button class="chip' + (col === c.color ? ' on' : '') + '" data-chip="color" data-val="' + col + '" style="background:' + col + ';border-color:' + col + ';color:#fff;width:42px;height:34px"></button>';
      }).join('') + '</div>' +
      (id ? '<div class="field"><label><input type="checkbox" id="f-arch" style="width:auto;min-height:0;margin-right:8px"' + (c.archived ? ' checked' : '') + '>보관 (타일에서 숨기고 지난 기록은 유지)</label></div>' : '') +
      '<button class="btn primary block" data-act="save-cat" data-id="' + (id || '') + '">저장</button>',
      function (root) {
        root.addEventListener('click', function (e) {
          var b = e.target.closest('[data-chip="color"]'); if (!b) return;
          root.querySelectorAll('[data-chip="color"]').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
      });
  }

  function sheetBehavior(id, catId) {
    var b = id ? DB.behavior(id) : { label: '', measure: 'freq', useIntensity: false, isReplacement: false, definition: '', categoryId: catId, archived: false };
    var cats = DB.categories(true);
    openSheet(id ? '행동 수정' : '행동 추가',
      '<div class="field"><label for="f-label">이름</label><input id="f-label" value="' + E(b.label) + '" maxlength="24"></div>' +
      '<div class="field"><label for="f-cat">영역</label><select id="f-cat">' +
      cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === b.categoryId ? ' selected' : '') + '>' + E(c.label) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label for="f-measure">측정방식</label><select id="f-measure">' +
      [['freq', '빈도 — 누르면 바로 저장'], ['dur', '지속시간 — 눌러 시작, 다시 눌러 종료'], ['lat', '지연시간 — 지시 제시 시점부터 계산']].map(function (m) {
        return '<option value="' + m[0] + '"' + (m[0] === b.measure ? ' selected' : '') + '>' + m[1] + '</option>';
      }).join('') + '</select>' +
      (id ? '<span class="hint">이미 기록이 쌓인 행동의 측정방식을 바꾸면 과거 데이터와 단위가 달라집니다. 가급적 새 행동으로 만드세요.</span>' : '') +
      '</div>' +
      '<div class="field"><label><input type="checkbox" id="f-int" style="width:auto;min-height:0;margin-right:8px"' + (b.useIntensity ? ' checked' : '') + '>강도(1~3) 함께 기록</label></div>' +
      '<div class="field"><label><input type="checkbox" id="f-rep" style="width:auto;min-height:0;margin-right:8px"' + (b.isReplacement ? ' checked' : '') + '>대체행동으로 집계</label></div>' +
      '<div class="field"><label for="f-def">조작적 정의</label><textarea id="f-def" placeholder="무엇이 포함되고 무엇이 제외되는지 적으세요.">' + E(b.definition || '') + '</textarea>' +
      '<span class="hint">경계가 되는 상황을 반드시 한 문장 넣으세요. 예: 물건을 던져 사람에게 맞은 경우는 "때리기"로 기록.</span></div>' +
      (id ? '<div class="field"><label><input type="checkbox" id="f-arch" style="width:auto;min-height:0;margin-right:8px"' + (b.archived ? ' checked' : '') + '>보관 (타일에서 숨기고 지난 기록은 유지)</label></div>' : '') +
      '<button class="btn primary block" data-act="save-beh" data-id="' + (id || '') + '">저장</button>');
  }

  function sheetSimple(kind, id) {
    var list = kind === 'ante' ? DB.cfg().antecedents : DB.cfg().consequences;
    var item = id ? list.filter(function (x) { return x.id === id; })[0] : { label: '', archived: false };
    openSheet((kind === 'ante' ? '선행사건' : '후속결과') + (id ? ' 수정' : ' 추가'),
      '<div class="field"><label for="f-label">이름</label><input id="f-label" value="' + E(item.label) + '" maxlength="16"></div>' +
      (id ? '<div class="field"><label><input type="checkbox" id="f-arch" style="width:auto;min-height:0;margin-right:8px"' + (item.archived ? ' checked' : '') + '>보관</label></div>' : '') +
      '<button class="btn primary block" data-act="save-simple" data-kind="' + kind + '" data-id="' + (id || '') + '">저장</button>');
  }

  /* ================= 클릭 라우팅 ================= */
  document.addEventListener('click', async function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act, id = t.dataset.id;

    /* 스낵바 */
    if (act === 'undo') return undoLast();
    if (act === 'ante') return setABC('ante', id);
    if (act === 'cons') return setABC('cons', id);
    if (act === 'snack-intensity') { holdSnack(); return sheetIntensity(S.snack); }
    if (act === 'set-intensity') {
      var e2 = DB.dat().events.filter(function (x) { return x.id === id; })[0];
      if (e2) { e2.intensity = parseInt(t.dataset.val, 10); await DB.saveData(); }
      closeSheet(); updateLog(); toast('강도 ' + t.dataset.val + '로 저장했습니다'); return;
    }

    /* 홈 */
    if (act === 'add-student') return sheetStudent(null);
    if (act === 'edit-student') return sheetStudent(DB.student(id));
    if (act === 'save-student') {
      var code = (document.getElementById('f-code').value || '').trim();
      if (!code) { toast('코드명을 입력하세요'); return; }
      var note = (document.getElementById('f-note').value || '').trim();
      if (id) { var s0 = DB.student(id); s0.code = code; s0.note = note; }
      else DB.cfg().students.push({ id: DB.uid('st'), code: code, note: note, archived: false });
      await DB.saveConfig(); closeSheet(); render(); toast('저장했습니다'); return;
    }
    if (act === 'del-student') {
      var s1 = DB.student(id); if (!s1) return;
      if (!confirm(s1.code + ' 학생을 목록에서 숨깁니다. 기록은 남습니다.')) return;
      s1.archived = true; await DB.saveConfig(); closeSheet(); render(); return;
    }
    if (act === 'pick-student') return sheetStartSession(id);
    if (act === 'start-session') return startSession(id, t.dataset.mode);
    if (act === 'resume') { S.sessionId = id; var rs = DB.session(id); return go(rs && rs.mode === 'interval' ? 'interval' : 'session'); }
    if (act === 'end-session') {
      if (!confirm('세션을 종료할까요? 진행 중인 지속시간은 지금 시각으로 마감됩니다.')) return;
      return endSession(id);
    }

    /* 기록 */
    if (act === 'cat') { S.catId = id; render(); updateLog(); return; }
    if (act === 'cat-back') { S.catId = null; render(); updateLog(); return; }
    if (act === 'beh') { if (S.lpFired) { S.lpFired = false; return; } return tapBehavior(id); }
    if (act === 'stop-dur') return stopDuration(id);
    if (act === 'cue') return pressCue();
    if (act === 'cue-none') return cueTimeout(true);

    /* 간격기록 */
    if (act === 'iv-pick') {
      var on = main.querySelectorAll('[data-act="iv-pick"].on').length;
      if (!t.classList.contains('on') && on >= 3) { toast('최대 3개까지 고를 수 있습니다'); return; }
      t.classList.toggle('on'); return;
    }
    if (act === 'iv-start') return startInterval();
    if (act === 'iv-toggle') return ivToggle(parseInt(t.dataset.idx, 10));
    if (act === 'iv-abort') {
      if (!confirm('진행 중인 간격기록을 버릴까요?')) return;
      S.interval = null; render(); return;
    }

    /* 리포트 */
    if (act === 'rep-days') { S.reportDays = parseInt(t.dataset.val, 10); render(); return; }
    if (act === 'export-csv') {
      var csv = R.csv(S.reportStudentId, S.reportDays);
      var stx = DB.student(S.reportStudentId);
      download('행동기록_' + stx.code + '_' + R.dayKey(now()) + '.csv', csv, 'text/csv');
      return;
    }

    /* 설정 */
    if (act === 'setup-tab') { S.setupTab = t.dataset.val; render(); return; }
    if (act === 'add-cat') return sheetCategory(null);
    if (act === 'edit-cat') return sheetCategory(id);
    if (act === 'save-cat') {
      var lab = (document.getElementById('f-label').value || '').trim();
      if (!lab) { toast('이름을 입력하세요'); return; }
      var colEl = sheetEl.querySelector('[data-chip="color"].on');
      var col = colEl ? colEl.dataset.val : '#5A6B75';
      var arch = document.getElementById('f-arch');
      if (id) { var c1 = DB.category(id); c1.label = lab; c1.color = col; c1.archived = arch ? arch.checked : false; }
      else DB.cfg().categories.push({ id: DB.uid('c'), label: lab, color: col, order: DB.cfg().categories.length, archived: false });
      await DB.saveConfig(); closeSheet(); render(); toast('저장했습니다'); return;
    }
    if (act === 'add-beh') return sheetBehavior(null, id);
    if (act === 'edit-beh') return sheetBehavior(id, null);
    if (act === 'save-beh') {
      var bl = (document.getElementById('f-label').value || '').trim();
      if (!bl) { toast('이름을 입력하세요'); return; }
      var payload = {
        label: bl,
        categoryId: document.getElementById('f-cat').value,
        measure: document.getElementById('f-measure').value,
        useIntensity: document.getElementById('f-int').checked,
        isReplacement: document.getElementById('f-rep').checked,
        definition: (document.getElementById('f-def').value || '').trim()
      };
      var ar = document.getElementById('f-arch');
      if (id) {
        var b1 = DB.behavior(id);
        if (b1.measure !== payload.measure && DB.dat().events.some(function (x) { return x.behaviorId === id && !x.deleted; })) {
          if (!confirm('이미 기록이 있는 행동입니다. 측정방식을 바꾸면 과거 데이터와 단위가 달라집니다. 계속할까요?')) return;
        }
        Object.keys(payload).forEach(function (k) { b1[k] = payload[k]; });
        b1.archived = ar ? ar.checked : false;
      } else {
        payload.id = DB.uid('b'); payload.archived = false;
        payload.order = DB.behaviors(payload.categoryId, true).length;
        DB.cfg().behaviors.push(payload);
      }
      await DB.saveConfig(); closeSheet(); render(); toast('저장했습니다'); return;
    }
    if (act === 'add-ante') return sheetSimple('ante', null);
    if (act === 'edit-ante') return sheetSimple('ante', id);
    if (act === 'add-cons') return sheetSimple('cons', null);
    if (act === 'edit-cons') return sheetSimple('cons', id);
    if (act === 'save-simple') {
      var kind = t.dataset.kind;
      var list = kind === 'ante' ? DB.cfg().antecedents : DB.cfg().consequences;
      var lb = (document.getElementById('f-label').value || '').trim();
      if (!lb) { toast('이름을 입력하세요'); return; }
      var ar2 = document.getElementById('f-arch');
      if (id) { var it = list.filter(function (x) { return x.id === id; })[0]; it.label = lb; it.archived = ar2 ? ar2.checked : false; }
      else list.push({ id: DB.uid(kind === 'ante' ? 'a' : 'q'), label: lb, order: list.length, archived: false });
      await DB.saveConfig(); closeSheet(); render(); toast('저장했습니다'); return;
    }
    if (act === 'save-settings') {
      var st2 = DB.settings();
      st2.latencyTimeoutSec = Math.max(5, parseInt(document.getElementById('op-lat').value, 10) || 30);
      st2.snackbarSec = Math.max(3, parseInt(document.getElementById('op-snack').value, 10) || 6);
      st2.vibrate = document.getElementById('op-vib').checked;
      await DB.saveConfig(); toast('옵션을 저장했습니다'); return;
    }
    if (act === 'export-config') {
      var cfgOnly = JSON.parse(JSON.stringify(DB.cfg())); cfgOnly.students = [];
      download('행동세트_' + R.dayKey(now()) + '.json', JSON.stringify(cfgOnly, null, 2), 'application/json');
      return;
    }
    if (act === 'export-all') {
      download('행동기록_백업_' + R.dayKey(now()) + '.json', JSON.stringify({ config: DB.cfg(), data: DB.dat() }, null, 2), 'application/json');
      DB.settings().lastBackupAt = now();
      await DB.saveConfig();
      if (S.screen === 'setup') render();
      return;
    }
    if (act === 'import') {
      openSheet('가져오기',
        '<p class="small muted">내보낸 JSON 파일을 고르거나 내용을 붙여넣으세요. 행동 세트만 있는 파일은 세트만 교체하고, 전체 백업 파일은 기록까지 복원합니다.</p>' +
        '<div class="field"><input type="file" id="f-file" accept="application/json,.json"></div>' +
        '<div class="field"><textarea id="f-json" placeholder="또는 여기에 붙여넣기" style="font-family:var(--mono);font-size:.75rem"></textarea></div>' +
        '<button class="btn primary block" data-act="do-import">가져오기</button>',
        function (root) {
          root.querySelector('#f-file').addEventListener('change', function (e3) {
            var f = e3.target.files[0]; if (!f) return;
            var rd = new FileReader();
            rd.onload = function () { root.querySelector('#f-json').value = rd.result; };
            rd.readAsText(f);
          });
        });
      return;
    }
    if (act === 'do-import') {
      var raw = document.getElementById('f-json').value.trim();
      if (!raw) { toast('내용이 비어 있습니다'); return; }
      var parsed;
      try { parsed = JSON.parse(raw); } catch (err) { toast('JSON 형식이 아닙니다'); return; }
      if (parsed.config && parsed.data) {
        if (!confirm('전체 백업을 복원하면 현재 기록이 모두 대체됩니다. 계속할까요?')) return;
        await Store.set(DB.KEY_CONFIG, parsed.config);
        await Store.set(DB.KEY_DATA, parsed.data);
      } else if (parsed.categories && parsed.behaviors) {
        if (!confirm('행동 세트를 교체합니다. 학생과 지난 기록은 유지됩니다. 계속할까요?')) return;
        var keep = DB.cfg().students;
        parsed.students = keep;
        await Store.set(DB.KEY_CONFIG, parsed);
      } else { toast('알 수 없는 파일 형식입니다'); return; }
      await DB.load(); closeSheet(); render(); toast('가져왔습니다'); return;
    }
    if (act === 'wipe') {
      if (!confirm('모든 기록과 설정을 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
      if (!confirm('정말 지울까요? 먼저 백업을 내보내는 것을 권합니다.')) return;
      await Store.set(DB.KEY_CONFIG, DB.seedConfig());
      await Store.set(DB.KEY_DATA, { version: 1, sessions: [], events: [], cues: [], intervalRuns: [] });
      await DB.load(); S.sessionId = null; render(); toast('초기화했습니다'); return;
    }
  });

  /* 본문 안의 단일 선택 칩 묶음 */
  main.addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip]');
    if (!c || !main.contains(c)) return;
    main.querySelectorAll('[data-chip="' + c.dataset.chip + '"]').forEach(function (x) { x.classList.remove('on'); });
    c.classList.add('on');
  });

  main.addEventListener('change', function (e) {
    if (e.target.id === 'rep-student') { S.reportStudentId = e.target.value; render(); }
  });

  /* 길게 눌러 정의 보기 */
  main.addEventListener('pointerdown', function (e) {
    var t = e.target.closest('[data-act="beh"]');
    if (!t) return;
    S.lpFired = false;
    clearTimeout(S.lpTimer);
    S.lpTimer = setTimeout(function () { S.lpFired = true; buzz(30); sheetDefinition(t.dataset.id); }, 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
    main.addEventListener(evt, function () { clearTimeout(S.lpTimer); });
  });

  /* 스낵바 위에서 손대면 타이머 연장 */
  snackEl.addEventListener('pointerdown', holdSnack);

  /* ================= 시계 ================= */
  setInterval(function () {
    if (S.screen === 'session' && S.sessionId) {
      var ses = DB.session(S.sessionId);
      var c = document.getElementById('ses-clock');
      if (ses && c) c.textContent = R.fmtClock((now() - ses.startedAt) / 1000);
      document.querySelectorAll('.live-strip .t[data-since]').forEach(function (el) {
        el.textContent = R.fmtClock((now() - parseInt(el.dataset.since, 10)) / 1000);
      });
      var cc = document.getElementById('cue-clock');
      if (cc && S.cue) {
        var sec = Math.round((now() - S.cue.ts) / 1000);
        cc.textContent = sec + '초';
        if (sec >= (DB.settings().latencyTimeoutSec || 30)) cueTimeout(false);
      }
    }
  }, 500);

  setInterval(function () { if (S.interval) ivTick(); }, 200);

  /* ================= 시작 ================= */
  async function checkPersistence() {
    S.persisted = null;
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      var already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (!already) already = await navigator.storage.persist();
      S.persisted = !!already;
    } catch (e) { S.persisted = null; }
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function daysSinceBackup() {
    var t = DB.settings().lastBackupAt;
    if (!t) return null;
    return Math.floor((now() - t) / 86400000);
  }

  (async function boot() {
    await DB.load();
    await checkPersistence();
    var open = DB.dat().sessions.filter(function (s) { return !s.endedAt; })[0];
    if (open) S.sessionId = null;
    go('home');
  })();
})();
