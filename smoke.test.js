const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path').join(__dirname, '..') + '/';

const html = fs.readFileSync(path + 'index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;

// localStorage shim
const mem = {};
window.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
window.confirm = () => true;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

['js/store.js', 'js/charts.js', 'js/reports.js', 'js/app.js'].forEach(f => {
  window.eval(fs.readFileSync(path + f, 'utf8'));
});

const $ = s => window.document.querySelector(s);
const $$ = s => Array.from(window.document.querySelectorAll(s));
const click = el => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  await sleep(120);
  console.log('\n[1] 부팅');
  check('홈 화면이 렌더된다', /학생/.test($('#main').innerHTML));
  check('기본 영역 9개가 만들어진다', window.DB.categories().length === 9, window.DB.categories().length);
  check('기본 세부행동이 채워진다', window.DB.behaviors().length > 30, window.DB.behaviors().length);
  check('선행사건 6개', window.DB.antecedents().length === 6);
  check('후속결과 5개', window.DB.consequences().length === 5);

  console.log('\n[2] 학생 추가');
  click($('[data-act="add-student"]'));
  await sleep(30);
  $('#f-code').value = 'A학생';
  $('#f-note').value = '3학년';
  click($('[data-act="save-student"]'));
  await sleep(60);
  check('학생이 저장된다', window.DB.students().length === 1);
  check('홈에 학생 줄이 보인다', !!$('[data-act="pick-student"]'));

  console.log('\n[3] 세션 시작');
  click($('[data-act="pick-student"]'));
  await sleep(30);
  click($('[data-chip="period"][data-val="3교시"]'));
  click($('[data-chip="setting"][data-val="특수학급"]'));
  click($('[data-act="start-session"][data-mode="live"]'));
  await sleep(80);
  const ses = window.DB.dat().sessions[0];
  check('세션이 생성된다', !!ses);
  check('교시가 저장된다', ses.period === '3교시', ses.period);
  check('영역 타일 9개가 보인다', $$('[data-act="cat"]').length === 9);

  console.log('\n[4] 빈도 기록 — 탭 두 번');
  const 공격 = window.DB.categories()[0];
  click($('[data-act="cat"][data-id="' + 공격.id + '"]'));
  await sleep(40);
  const 때리기 = window.DB.behaviors(공격.id)[0];
  check('세부행동 타일이 보인다', !!$('[data-act="beh"][data-id="' + 때리기.id + '"]'));
  click($('[data-act="beh"][data-id="' + 때리기.id + '"]'));
  await sleep(80);
  check('이벤트가 1건 저장된다', window.DB.eventsOf(ses.id).length === 1);
  check('강도 기본값 2가 붙는다', window.DB.eventsOf(ses.id)[0].intensity === 2);
  check('스낵바가 뜬다', $('#snackbar').hidden === false);
  check('타일 카운트가 1이 된다', /class="tile-count">1</.test($('#main').innerHTML));

  console.log('\n[5] 선행사건 칩 + 실행취소');
  const ante = window.DB.antecedents()[0];
  click($('#snackbar [data-act="ante"][data-id="' + ante.id + '"]'));
  await sleep(60);
  check('선행사건이 붙는다', window.DB.eventsOf(ses.id)[0].antecedentId === ante.id);
  click($('[data-act="beh"][data-id="' + 때리기.id + '"]'));
  await sleep(80);
  check('두 번째 기록', window.DB.eventsOf(ses.id).length === 2);
  click($('#snackbar [data-act="undo"]'));
  await sleep(60);
  check('실행취소로 1건이 된다', window.DB.eventsOf(ses.id).length === 1);
  check('삭제는 물리삭제가 아니다', window.DB.dat().events.length === 2);

  console.log('\n[6] 지속시간 — 시작과 종료');
  click($('[data-act="cat-back"]'));
  await sleep(30);
  const 내재화 = window.DB.categories()[7];
  click($('[data-act="cat"][data-id="' + 내재화.id + '"]'));
  await sleep(40);
  const 울기 = window.DB.behaviors(내재화.id).filter(b => b.label === '울기')[0];
  check('울기는 지속시간으로 배정돼 있다', 울기.measure === 'dur');
  click($('[data-act="beh"][data-id="' + 울기.id + '"]'));
  await sleep(60);
  const running = window.DB.dat().events.filter(e => e.status === 'running');
  check('타이머가 시작된다', running.length === 1);
  check('진행 중 배너가 보인다', !!$('.live-strip'));
  await sleep(1100);
  click($('[data-act="beh"][data-id="' + 울기.id + '"]'));
  await sleep(80);
  const dur = window.DB.dat().events.filter(e => e.behaviorId === 울기.id)[0];
  check('다시 누르면 종료된다', dur.status === 'done');
  check('지속시간이 기록된다', dur.durationSec >= 1, dur.durationSec);

  console.log('\n[7] 지연시간 — 지시 제시 기준');
  click($('[data-act="cat-back"]'));
  await sleep(30);
  check('지시 제시 버튼이 있다', !!$('[data-act="cue"]'));
  click($('[data-act="cue"]'));
  await sleep(60);
  check('cue가 저장된다', window.DB.dat().cues.length === 1);
  await sleep(600);
  const 불응 = window.DB.categories()[5];
  click($('[data-act="cat"][data-id="' + 불응.id + '"]'));
  await sleep(40);
  const 불이행 = window.DB.behaviors(불응.id).filter(b => b.measure === 'lat')[0];
  click($('[data-act="beh"][data-id="' + 불이행.id + '"]'));
  await sleep(80);
  const latEv = window.DB.dat().events.filter(e => e.behaviorId === 불이행.id)[0];
  check('지연시간이 계산된다', latEv.latencySec > 0.3 && latEv.latencySec < 5, latEv.latencySec);
  check('cue가 해소 처리된다', !!window.DB.dat().cues[0].resolvedEventId);

  console.log('\n[8] 리포트');
  click($('[data-nav="report"]'));
  await sleep(120);
  const rep = $('#main').innerHTML;
  check('리포트가 그려진다', /일별 추이/.test(rep));
  check('SVG 차트가 있다', $$('#main svg').length >= 2, $$('#main svg').length);
  check('지연시간 카드가 있다', /지연시간/.test(rep));
  check('히트맵이 그려진다', /시간대별 발생/.test(rep));
  const csv = window.Reports.csv(window.DB.students()[0].id, 14);
  check('CSV 헤더가 만들어진다', csv.split('\n')[0].indexOf('학생,날짜,시각') === 0);
  check('CSV에 기록 줄이 있다', csv.split('\n').length >= 4, csv.split('\n').length);

  console.log('\n[9] 설정 — 행동 추가와 수정');
  click($('[data-nav="setup"]'));
  await sleep(80);
  check('설정 화면', /기록 세트 편집/.test($('#main').innerHTML));
  click($('[data-act="add-beh"][data-id="' + 공격.id + '"]'));
  await sleep(40);
  $('#f-label').value = '침 뱉기(신규)';
  $('#f-measure').value = 'freq';
  $('#f-def').value = '테스트 정의';
  click($('[data-act="save-beh"]'));
  await sleep(80);
  check('행동이 추가된다', window.DB.behaviors(공격.id).some(b => b.label === '침 뱉기(신규)'));

  const target = window.DB.behaviors(공격.id).filter(b => b.label === '침 뱉기(신규)')[0];
  click($('[data-act="edit-beh"][data-id="' + target.id + '"]'));
  await sleep(40);
  $('#f-arch').checked = true;
  click($('[data-act="save-beh"][data-id="' + target.id + '"]'));
  await sleep(80);
  check('보관하면 목록에서 빠진다', !window.DB.behaviors(공격.id).some(b => b.id === target.id));
  check('보관해도 데이터는 남는다', !!window.DB.behavior(target.id));

  console.log('\n[10] 선행사건 편집');
  click($('[data-act="setup-tab"][data-val="abc"]'));
  await sleep(60);
  click($('[data-act="add-ante"]'));
  await sleep(40);
  $('#f-label').value = '또래 자극';
  click($('[data-act="save-simple"]'));
  await sleep(80);
  check('선행사건이 추가된다', window.DB.antecedents().some(a => a.label === '또래 자극'));

  console.log('\n[11] 간격기록');
  click($('[data-nav="home"]'));
  await sleep(60);
  // 진행 중 세션 종료
  if ($('[data-act="end-session"]')) { click($('[data-act="end-session"]')); await sleep(100); }
  click($('[data-act="pick-student"]'));
  await sleep(40);
  click($('[data-act="start-session"][data-mode="interval"]'));
  await sleep(80);
  check('간격기록 설정 화면', /관찰할 행동/.test($('#main').innerHTML));
  const 상동 = window.DB.categories()[4];
  const 손흔들기 = window.DB.behaviors(상동.id)[0];
  click($('[data-act="iv-pick"][data-id="' + 손흔들기.id + '"]'));
  click($('[data-chip="ivsec"][data-val="5"]'));
  click($('[data-chip="ivmin"][data-val="3"]'));
  await sleep(20);
  click($('[data-act="iv-start"]'));
  await sleep(80);
  check('간격기록이 시작된다', !!$('#iv-remain'));
  check('총 간격 수가 계산된다', $('#main').innerHTML.indexOf('/ 36') > -1, $('.iv-meta') && $('.iv-meta').textContent);
  click($('[data-act="iv-toggle"]'));
  await sleep(40);
  check('토글이 켜진다', $('[data-act="iv-toggle"]').className.indexOf('on') > -1);

  console.log('\n[12] 간격 경과 채점 (5초 대기)');
  await sleep(5400);
  check('간격이 넘어간다', $('#iv-idx').textContent === '2', $('#iv-idx').textContent);
  check('부분간격이 발생으로 채점된다', $$('.iv-cell.hit').length === 1, $$('.iv-cell.hit').length);
  click($('[data-act="iv-toggle"]'));   // 2번째 간격 도중 끔 → 부분간격 기준 발생 처리가 맞음
  await sleep(10500);
  check('끈 뒤 지나간 간격은 미발생', $$('.iv-cell.hit').length === 2, $$('.iv-cell.hit').length);
  check('간격이 계속 진행된다', parseInt($('#iv-idx').textContent, 10) >= 4, $('#iv-idx').textContent);
  check('남은 시간이 줄어든다', $('#iv-left').textContent < '03:00', $('#iv-left').textContent);

  console.log('\n[13] 백업 데이터 무결성');
  const backup = JSON.stringify({ config: window.DB.cfg(), data: window.DB.dat() });
  check('백업 JSON이 파싱된다', !!JSON.parse(backup));
  check('저장 백엔드는 로컬', window.Store.backend === 'local');

  console.log('\n' + '─'.repeat(46));
  console.log(`통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
