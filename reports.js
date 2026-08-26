/* reports.js — 집계와 리포트 화면 렌더링 */
var Reports = (function () {
  var E = Charts.esc;
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayShort(k) { var p = k.split('-'); return p[1] + '/' + p[2]; }
  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + '초';
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + '분' + (s ? ' ' + s + '초' : '');
    return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); }

  function rangeDays(n) {
    var to = new Date(); to.setHours(23, 59, 59, 999);
    var from = new Date(); from.setDate(from.getDate() - (n - 1)); from.setHours(0, 0, 0, 0);
    return { from: from.getTime(), to: to.getTime() };
  }
  function dayList(from, to) {
    var out = [], d = new Date(from); d.setHours(0, 0, 0, 0);
    while (d.getTime() <= to) { out.push(dayKey(d.getTime())); d.setDate(d.getDate() + 1); }
    return out;
  }

  /* ---------- 집계 ---------- */
  function collect(studentId, from, to) {
    var evs = DB.eventsFor(studentId, from, to);
    var sessions = DB.dat().sessions.filter(function (s) { return s.studentId === studentId && s.startedAt >= from && s.startedAt <= to; });
    var cues = DB.dat().cues.filter(function (c) { return c.studentId === studentId && c.ts >= from && c.ts <= to; });
    var runs = DB.dat().intervalRuns.filter(function (r) { return r.studentId === studentId && r.ts >= from && r.ts <= to; });
    return { events: evs, sessions: sessions, cues: cues, runs: runs };
  }

  function dailySeries(evs, days) {
    var prob = {}, rep = {};
    days.forEach(function (d) { prob[d] = 0; rep[d] = 0; });
    evs.forEach(function (e) {
      var b = DB.behavior(e.behaviorId); if (!b) return;
      var k = dayKey(e.ts); if (!(k in prob)) return;
      if (b.isReplacement) rep[k]++; else prob[k]++;
    });
    return {
      problem: days.map(function (d) { return prob[d]; }),
      replacement: days.map(function (d) { return rep[d]; })
    };
  }

  function heatGrid(sessions, evs) {
    var periods = [];
    sessions.forEach(function (s) { if (s.period && periods.indexOf(s.period) < 0) periods.push(s.period); });
    periods.sort(function (a, b) { return String(a).localeCompare(String(b), 'ko', { numeric: true }); });
    if (!periods.length) return null;
    var cols = ['월', '화', '수', '목', '금'];
    var grid = periods.map(function () { return cols.map(function () { return 0; }); });
    var smap = {}; sessions.forEach(function (s) { smap[s.id] = s; });
    evs.forEach(function (e) {
      var b = DB.behavior(e.behaviorId); if (!b || b.isReplacement) return;
      var s = smap[e.sessionId]; if (!s || !s.period) return;
      var wd = WD[new Date(e.ts).getDay()], ci = cols.indexOf(wd), ri = periods.indexOf(s.period);
      if (ci < 0 || ri < 0) return;
      grid[ri][ci]++;
    });
    return { rows: periods, cols: cols, grid: grid };
  }

  function antecedentBars(evs) {
    var counts = {};
    evs.forEach(function (e) { if (e.antecedentId) counts[e.antecedentId] = (counts[e.antecedentId] || 0) + 1; });
    return DB.antecedents(true).map(function (a) { return { label: a.label, value: counts[a.id] || 0 }; })
      .filter(function (i) { return i.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }
  function consequenceBars(evs) {
    var counts = {};
    evs.forEach(function (e) { if (e.consequenceId) counts[e.consequenceId] = (counts[e.consequenceId] || 0) + 1; });
    return DB.consequences(true).map(function (c) { return { label: c.label, value: counts[c.id] || 0, color: 'var(--ink-3)' }; })
      .filter(function (i) { return i.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function byBehavior(evs) {
    var map = {};
    evs.forEach(function (e) { (map[e.behaviorId] = map[e.behaviorId] || []).push(e); });
    return map;
  }

  /* 반응간시간: 직전 동일행동 종료 → 이번 시작 */
  function irtTable(evs) {
    var map = byBehavior(evs), out = [];
    Object.keys(map).forEach(function (bid) {
      var b = DB.behavior(bid); if (!b || b.isReplacement) return;
      var list = map[bid].slice().sort(function (a, b2) { return a.ts - b2.ts; });
      if (list.length < 2) return;
      var gaps = [];
      for (var i = 1; i < list.length; i++) {
        var prevEnd = list[i - 1].ts + (list[i - 1].durationSec || 0) * 1000;
        var g = (list[i].ts - prevEnd) / 1000;
        if (g >= 0) gaps.push(g);
      }
      if (!gaps.length) return;
      var avg = gaps.reduce(function (a, b3) { return a + b3; }, 0) / gaps.length;
      out.push({ label: b.label, n: list.length, avg: avg, min: Math.min.apply(null, gaps) });
    });
    return out.sort(function (a, b) { return a.avg - b.avg; });
  }

  function durationTable(evs) {
    var map = byBehavior(evs), out = [];
    Object.keys(map).forEach(function (bid) {
      var b = DB.behavior(bid); if (!b || b.measure !== 'dur') return;
      var list = map[bid].filter(function (e) { return e.durationSec != null; });
      if (!list.length) return;
      var total = list.reduce(function (a, e) { return a + e.durationSec; }, 0);
      out.push({ label: b.label, n: list.length, total: total, avg: total / list.length });
    });
    return out.sort(function (a, b) { return b.total - a.total; });
  }

  function latencyStats(evs, cues) {
    var lat = evs.filter(function (e) { return e.latencySec != null; });
    var avg = lat.length ? lat.reduce(function (a, e) { return a + e.latencySec; }, 0) / lat.length : null;
    var unresolved = cues.filter(function (c) { return !c.resolvedEventId; }).length;
    return { n: lat.length, avg: avg, cues: cues.length, unresolved: unresolved };
  }

  function intensityDist(evs) {
    var d = [0, 0, 0];
    evs.forEach(function (e) { if (e.intensity >= 1 && e.intensity <= 3) d[e.intensity - 1]++; });
    return d;
  }

  /* ---------- 렌더 ---------- */
  function statCard(k, v, d) {
    return '<div class="stat"><div class="k">' + E(k) + '</div><div class="v">' + E(v) + '</div>' + (d ? '<div class="d">' + E(d) + '</div>' : '') + '</div>';
  }

  function render(studentId, days) {
    var st = DB.student(studentId);
    if (!st) return '<div class="empty">학생을 먼저 선택하세요.</div>';
    var r = rangeDays(days);
    var c = collect(studentId, r.from, r.to);
    var dl = dayList(r.from, r.to);

    if (!c.events.length && !c.runs.length) {
      return '<div class="empty"><strong>이 기간에는 기록이 없습니다</strong>홈에서 세션을 시작하면 여기에 그래프가 쌓입니다.</div>';
    }

    var probCount = 0, repCount = 0;
    c.events.forEach(function (e) { var b = DB.behavior(e.behaviorId); if (!b) return; b.isReplacement ? repCount++ : probCount++; });
    var ser = dailySeries(c.events, dl);
    var lat = latencyStats(c.events, c.cues);
    var inten = intensityDist(c.events);
    var irt = irtTable(c.events);
    var dur = durationTable(c.events);
    var ante = antecedentBars(c.events);
    var cons = consequenceBars(c.events);
    var heat = heatGrid(c.sessions, c.events);

    var h = '';

    h += '<div class="stat-row" style="margin-bottom:14px">';
    h += statCard('문제행동', probCount + '회', dl.length + '일간');
    h += statCard('대체행동', repCount + '회', repCount + probCount ? Math.round(repCount / (repCount + probCount) * 100) + '% 비중' : '');
    h += statCard('세션', c.sessions.length + '회', '');
    h += statCard('총 지속시간', fmtDur(dur.reduce(function (a, d2) { return a + d2.total; }, 0)), '');
    h += '</div>';

    h += '<div class="rep-grid">';

    /* 1. 일별 추이 */
    h += '<div class="card wide"><h3>일별 추이</h3>';
    h += Charts.line({
      labels: dl.map(dayShort),
      series: [
        { name: '문제행동', color: '#C0453A', values: ser.problem },
        { name: '대체행동', color: '#3F7D20', values: ser.replacement }
      ]
    });
    h += '<div class="legend"><span><i style="background:#C0453A"></i>문제행동</span><span><i style="background:#3F7D20"></i>대체행동</span></div>';
    h += '<p class="note">두 선이 벌어지는 방향(문제행동 하강, 대체행동 상승)이 중재 성공의 핵심 지표입니다.</p></div>';

    /* 2. 히트맵 */
    h += '<div class="card"><h3>시간대별 발생</h3>';
    h += heat ? Charts.heatmap(heat) : Charts.empty('세션에 교시를 입력하면 표시됩니다');
    h += '<p class="note">문제행동만 집계합니다. 진한 칸이 반복되면 그 시간대의 과제·환경을 먼저 점검하세요.</p></div>';

    /* 3. 선행사건 */
    h += '<div class="card"><h3>선행사건 분포</h3>';
    h += ante.length ? Charts.bars({ items: ante }) : Charts.empty('선행사건이 기록되지 않았습니다');
    h += '<p class="note">기능 추정의 출발점입니다. 한 항목이 절반을 넘으면 그 상황을 바꾸는 것이 가장 빠른 중재입니다.</p></div>';

    /* 4. 후속결과 */
    if (cons.length) {
      h += '<div class="card"><h3>후속결과 분포</h3>' + Charts.bars({ items: cons });
      h += '<p class="note">의도치 않게 행동을 강화하고 있는 반응이 있는지 확인하세요.</p></div>';
    }

    /* 5. 지속시간 */
    if (dur.length) {
      h += '<div class="card"><h3>지속시간</h3><table class="table"><thead><tr><th>행동</th><th class="n">횟수</th><th class="n">총 시간</th><th class="n">평균</th></tr></thead><tbody>';
      dur.forEach(function (d2) {
        h += '<tr><td>' + E(d2.label) + '</td><td class="n">' + d2.n + '</td><td class="n">' + E(fmtDur(d2.total)) + '</td><td class="n">' + E(fmtDur(d2.avg)) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    /* 6. 반응간시간 */
    h += '<div class="card"><h3>반응간시간</h3>';
    if (irt.length) {
      h += '<table class="table"><thead><tr><th>행동</th><th class="n">발생</th><th class="n">평균 간격</th><th class="n">최단</th></tr></thead><tbody>';
      irt.forEach(function (i) {
        h += '<tr><td>' + E(i.label) + '</td><td class="n">' + i.n + '</td><td class="n">' + E(fmtDur(i.avg)) + '</td><td class="n">' + E(fmtDur(i.min)) + '</td></tr>';
      });
      h += '</tbody></table>';
      h += '<p class="note">타행동 차별강화(DRO) 간격은 평균 간격보다 조금 짧게 잡아야 학생이 강화를 받을 수 있습니다. 간격이 길어지고 있다면 빈도가 그대로여도 중재는 효과가 있는 중입니다.</p>';
    } else { h += Charts.empty('같은 행동이 2회 이상 기록되면 계산됩니다'); }
    h += '</div>';

    /* 7. 지연시간 */
    h += '<div class="card"><h3>지연시간</h3>';
    if (lat.cues) {
      h += '<div class="stat-row">';
      h += statCard('평균 착수', lat.avg != null ? fmtDur(lat.avg) : '—', lat.n + '회 반응');
      h += statCard('지시 제시', lat.cues + '회', '');
      h += statCard('무반응', lat.unresolved + '회', lat.cues ? Math.round(lat.unresolved / lat.cues * 100) + '%' : '');
      h += '</div>';
    } else { h += Charts.empty('세션에서 "지시 제시"를 누르면 집계됩니다'); }
    h += '</div>';

    /* 8. 강도 */
    if (inten[0] + inten[1] + inten[2] > 0) {
      h += '<div class="card"><h3>강도 분포</h3>';
      h += Charts.bars({
        items: [
          { label: '1 · 약함', value: inten[0], color: '#7FA8B5' },
          { label: '2 · 보통', value: inten[1], color: '#B8600F' },
          { label: '3 · 심함', value: inten[2], color: '#C0453A' }
        ]
      });
      h += '<p class="note">빈도가 그대로여도 강도가 낮아지고 있다면 중재는 작동하고 있습니다.</p></div>';
    }

    /* 9. 간격기록 */
    if (c.runs.length) {
      h += '<div class="card wide"><h3>간격기록 결과</h3><table class="table"><thead><tr><th>날짜</th><th>행동</th><th>방식</th><th class="n">간격</th><th class="n">발생 비율</th></tr></thead><tbody>';
      c.runs.slice().reverse().forEach(function (run) {
        var b = DB.behavior(run.behaviorId);
        var hits = run.marks.filter(Boolean).length;
        var pct = run.marks.length ? Math.round(hits / run.marks.length * 100) : 0;
        h += '<tr><td>' + E(dayShort(dayKey(run.ts))) + '</td><td>' + E(b ? b.label : '삭제된 행동') + '</td><td>' + E(methodName(run.method)) + '</td><td class="n">' + run.intervalSec + '초</td><td class="n">' + pct + '% <span class="muted small">(' + hits + '/' + run.marks.length + ')</span></td></tr>';
      });
      h += '</tbody></table>';
      h += '<p class="note">부분간격은 과대추정, 전체간격과 순간표집은 과소추정하는 성질이 있습니다. 비교는 반드시 같은 방식·같은 간격 길이끼리만 하세요.</p></div>';
    }

    h += '</div>';
    return h;
  }

  function methodName(m) {
    return m === 'partial' ? '부분간격' : m === 'whole' ? '전체간격' : '순간표집';
  }

  /* ---------- CSV ---------- */
  function csv(studentId, days) {
    var r = rangeDays(days);
    var c = collect(studentId, r.from, r.to);
    var st = DB.student(studentId);
    var smap = {}; DB.dat().sessions.forEach(function (s) { smap[s.id] = s; });
    var rows = [['학생', '날짜', '시각', '교시', '장소', '활동', '영역', '행동', '측정방식', '지속시간(초)', '지연시간(초)', '강도', '선행사건', '후속결과', '메모']];
    c.events.forEach(function (e) {
      var b = DB.behavior(e.behaviorId), cat = b ? DB.category(b.categoryId) : null, s = smap[e.sessionId] || {};
      var d = new Date(e.ts);
      var a = DB.cfg().antecedents.filter(function (x) { return x.id === e.antecedentId; })[0];
      var q = DB.cfg().consequences.filter(function (x) { return x.id === e.consequenceId; })[0];
      rows.push([
        st.code, dayKey(e.ts), pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
        s.period || '', s.setting || '', s.activity || '',
        cat ? cat.label : '', b ? b.label : '', measureName(e.measure),
        e.durationSec != null ? Math.round(e.durationSec) : '', e.latencySec != null ? Math.round(e.latencySec) : '',
        e.intensity || '', a ? a.label : '', q ? q.label : '', e.memo || ''
      ]);
    });
    return rows.map(function (row) {
      return row.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
  }
  function measureName(m) { return m === 'freq' ? '빈도' : m === 'dur' ? '지속시간' : m === 'lat' ? '지연시간' : m || ''; }

  return {
    render: render, csv: csv, fmtDur: fmtDur, fmtClock: fmtClock,
    dayKey: dayKey, measureName: measureName, methodName: methodName, pad: pad
  };
})();
