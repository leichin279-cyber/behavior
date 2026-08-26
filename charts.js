/* charts.js — 외부 라이브러리 없이 SVG로 그리는 차트 */
var Charts = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function nice(max) {
    if (max <= 5) return 5;
    var p = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / p) * p;
  }
  function wrap(w, h, inner) {
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + w + ' ' + h + '" role="img" preserveAspectRatio="xMidYMid meet">' + inner + '</svg></div>';
  }

  /* 다중 시계열 선그래프 */
  function line(opt) {
    var labels = opt.labels || [], series = opt.series || [];
    var W = 640, H = opt.height || 230, L = 42, R = 14, T = 16, B = 34;
    if (!labels.length) return emptyBox('표시할 데이터가 없습니다');
    var max = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    max = nice(max || 1);
    var iw = W - L - R, ih = H - T - B;
    var stepX = labels.length > 1 ? iw / (labels.length - 1) : 0;
    var x = function (i) { return L + i * stepX; };
    var y = function (v) { return T + ih - (v / max) * ih; };
    var out = '';
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gy = y(gv);
      out += '<line x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '" stroke="var(--line)" stroke-width="1"/>';
      out += '<text x="' + (L - 7) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">' + (Math.round(gv * 10) / 10) + '</text>';
    }
    var every = Math.ceil(labels.length / 7);
    labels.forEach(function (lb, i) {
      if (i % every !== 0 && i !== labels.length - 1) return;
      out += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="var(--ink-3)">' + esc(lb) + '</text>';
    });
    if (opt.markerIndex != null && opt.markerIndex >= 0) {
      var mx = x(opt.markerIndex);
      out += '<line x1="' + mx + '" y1="' + T + '" x2="' + mx + '" y2="' + (T + ih) + '" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="4 3"/>';
      out += '<text x="' + (mx + 4) + '" y="' + (T + 10) + '" font-size="10" fill="var(--warn)">' + esc(opt.markerLabel || '중재 시작') + '</text>';
    }
    series.forEach(function (s) {
      var d = '', pts = '';
      s.values.forEach(function (v, i) {
        d += (i ? ' L' : 'M') + x(i) + ' ' + y(v);
        pts += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.6" fill="' + s.color + '"/>';
      });
      out += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + pts;
    });
    return wrap(W, H, out);
  }

  /* 가로 막대 */
  function bars(opt) {
    var items = opt.items || [];
    if (!items.length) return emptyBox('표시할 데이터가 없습니다');
    var W = 640, rowH = 30, L = 132, R = 46, T = 8;
    var H = T * 2 + items.length * rowH;
    var max = 0; items.forEach(function (it) { if (it.value > max) max = it.value; });
    max = max || 1;
    var iw = W - L - R, out = '';
    items.forEach(function (it, i) {
      var yy = T + i * rowH, bw = Math.max(2, (it.value / max) * iw);
      out += '<text x="' + (L - 10) + '" y="' + (yy + 18) + '" text-anchor="end" font-size="12" fill="var(--ink-2)">' + esc(it.label) + '</text>';
      out += '<rect x="' + L + '" y="' + (yy + 6) + '" width="' + bw + '" height="17" rx="4" fill="' + (it.color || 'var(--accent)') + '"/>';
      out += '<text x="' + (L + bw + 7) + '" y="' + (yy + 19) + '" font-size="11" fill="var(--ink-3)" font-family="var(--mono)">' + esc(it.display != null ? it.display : it.value) + '</text>';
    });
    return wrap(W, H, out);
  }

  /* 히트맵 (행 = 교시, 열 = 요일) */
  function heatmap(opt) {
    var rows = opt.rows || [], cols = opt.cols || [], grid = opt.grid || [];
    var cw = 74, ch = 34, L = 54, T = 26;
    var W = L + cols.length * cw + 10, H = T + rows.length * ch + 12;
    var max = 0;
    grid.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    var out = '';
    cols.forEach(function (c, j) {
      out += '<text x="' + (L + j * cw + cw / 2) + '" y="' + (T - 9) + '" text-anchor="middle" font-size="11" fill="var(--ink-3)">' + esc(c) + '</text>';
    });
    rows.forEach(function (r, i) {
      out += '<text x="' + (L - 9) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-3)">' + esc(r) + '</text>';
      cols.forEach(function (c, j) {
        var v = (grid[i] && grid[i][j]) || 0;
        var a = max ? 0.08 + 0.82 * (v / max) : 0.06;
        out += '<rect x="' + (L + j * cw + 2) + '" y="' + (T + i * ch + 2) + '" width="' + (cw - 4) + '" height="' + (ch - 4) + '" rx="5" fill="var(--accent)" opacity="' + (v ? a.toFixed(2) : 0.05) + '"/>';
        if (v) out += '<text x="' + (L + j * cw + cw / 2) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="' + (a > 0.55 ? '#fff' : 'var(--ink-2)') + '">' + v + '</text>';
      });
    });
    return wrap(W, H, out);
  }

  function emptyBox(msg) {
    return '<div class="empty small" style="padding:24px">' + esc(msg) + '</div>';
  }

  return { line: line, bars: bars, heatmap: heatmap, empty: emptyBox, esc: esc };
})();
