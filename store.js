/* store.js — 저장소 어댑터와 데이터 모델
   Claude 아티팩트에서는 window.storage, 그 외(GitHub Pages·로컬)에서는 localStorage를 사용합니다. */

var Store = (function () {
  var useArtifact = (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function');

  async function readRaw(key) {
    if (useArtifact) {
      try { var r = await window.storage.get(key, false); return r ? r.value : null; }
      catch (e) { return null; }
    }
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  async function writeRaw(key, val) {
    if (useArtifact) {
      try { await window.storage.set(key, val, false); return true; } catch (e) { return false; }
    }
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  return {
    backend: useArtifact ? 'artifact' : 'local',
    async get(key) { var s = await readRaw(key); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } },
    async set(key, obj) { return writeRaw(key, JSON.stringify(obj)); }
  };
})();

var DB = (function () {
  var KEY_CONFIG = 'bt.config.v1';
  var KEY_DATA = 'bt.data.v1';
  var db = null;

  function uid(p) { return (p || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 기본 세트 ---------- */
  var SEED_CATS = [
    ['공격 (대인)', '#C0453A'],
    ['자해', '#A63D6E'],
    ['파괴 (대물)', '#B8600F'],
    ['수업방해', '#8E7008'],
    ['상동·자기자극', '#4E6BC4'],
    ['불응·거부', '#6A5AA8'],
    ['이탈', '#2F7A8C'],
    ['내재화·위축', '#5A6B75'],
    ['긍정·대체행동', '#3F7D20']
  ];

  // [라벨, 측정방식, 강도사용, 대체행동, 조작적 정의]
  var SEED_BEHS = [
    [ // 공격
      ['때리기', 'freq', 1, 0, '손·팔 또는 물건으로 타인의 신체에 접촉하되, 소리가 나거나 상대가 물러설 정도의 힘이 가해진 경우. 스치는 접촉은 제외. 물건을 던져 맞힌 경우는 "던지기"로 기록.'],
      ['물기', 'freq', 1, 0, '치아가 타인의 피부나 옷에 닿아 압력이 가해진 경우. 잇자국·발적 여부는 강도 판단에만 사용.'],
      ['밀기', 'freq', 1, 0, '타인의 몸을 손이나 몸으로 밀어 자세가 무너지거나 한 발 이상 이동하게 한 경우.'],
      ['발로 차기', 'freq', 1, 0, '발이나 무릎이 타인의 신체에 닿은 경우.'],
      ['꼬집기', 'freq', 1, 0, '손가락으로 타인의 피부를 집어 압력을 가한 경우.'],
      ['머리채 잡기', 'freq', 1, 0, '타인의 머리카락을 잡아 당긴 경우.'],
      ['침 뱉기', 'freq', 0, 0, '타인 또는 타인의 소지품을 향해 침을 뱉은 경우.']
    ],
    [ // 자해
      ['머리 박기', 'freq', 1, 0, '머리를 벽·바닥·책상 등 단단한 표면이나 자신의 손에 부딪친 경우. 1초 이상 간격이 있으면 별개로 계수.'],
      ['자기 때리기', 'freq', 1, 0, '손이나 물건으로 자신의 신체를 친 경우.'],
      ['손 물어뜯기', 'freq', 1, 0, '자신의 손·팔에 치아를 대고 압력을 가한 경우.'],
      ['피부 뜯기·긁기', 'freq', 1, 0, '손톱으로 자신의 피부를 반복적으로 긁거나 뜯은 경우.'],
      ['눈 누르기', 'freq', 1, 0, '손가락·주먹으로 안구 부위를 압박한 경우.']
    ],
    [ // 파괴
      ['던지기', 'freq', 1, 0, '물건을 손에서 놓아 30cm 이상 날아간 경우. 사람을 향해 던져 맞은 경우는 "때리기"로 기록.'],
      ['부수기', 'freq', 1, 0, '물건에 힘을 가해 형태가 손상되거나 기능을 잃은 경우.'],
      ['찢기', 'freq', 0, 0, '종이·책·옷 등을 손으로 찢은 경우.'],
      ['책상 엎기', 'freq', 1, 0, '책상·의자를 넘어뜨린 경우.']
    ],
    [ // 수업방해
      ['소리 지르기', 'freq', 0, 0, '평소 대화 음량을 크게 넘는 발성이 3초 이상 지속된 경우. 5초 이상 끊기면 별개로 계수.'],
      ['자리 이탈', 'dur', 0, 0, '지정된 자리에서 엉덩이가 떨어져 1m 이상 벗어난 시점부터 자리로 돌아올 때까지.'],
      ['책상 두드리기', 'freq', 0, 0, '손·물건으로 책상을 반복적으로 두드려 소리를 낸 경우.'],
      ['부적절한 발화', 'freq', 0, 0, '수업 맥락과 무관하거나 타인을 불쾌하게 하는 발화.'],
      ['끼어들기', 'freq', 0, 0, '허락 없이 타인의 발화 중간에 말한 경우.']
    ],
    [ // 상동·자기자극
      ['손 흔들기', 'dur', 0, 0, '손·손가락을 반복적으로 흔드는 동작이 시작된 시점부터 3초 이상 멈출 때까지.'],
      ['몸 흔들기', 'dur', 0, 0, '상체를 앞뒤·좌우로 반복적으로 흔드는 동작.'],
      ['반향어', 'freq', 0, 0, '타인의 발화나 매체의 소리를 그대로 반복한 경우.'],
      ['물건 돌리기', 'dur', 0, 0, '물건을 회전시키며 응시하는 행동.']
    ],
    [ // 불응·거부
      ['지시 불이행', 'lat', 0, 0, '교사의 지시 제시 이후 착수까지 걸린 시간. 설정된 시간 안에 착수하지 않으면 무반응으로 마감.'],
      ['과제 거부', 'dur', 0, 0, '과제 자료를 밀어내거나 "안 해"라고 말한 시점부터 다시 착수할 때까지.'],
      ['드러눕기', 'dur', 0, 0, '몸통이 바닥에 닿은 시점부터 일어설 때까지.'],
      ['신체적 저항', 'freq', 1, 0, '신체적 촉진에 대해 팔을 뿌리치거나 몸을 비트는 경우.']
    ],
    [ // 이탈
      ['교실 이탈', 'dur', 0, 0, '교실 출입문을 완전히 벗어난 시점부터 교실로 돌아올 때까지.'],
      ['학교 밖 이탈', 'dur', 0, 0, '교문을 벗어난 시점부터 복귀할 때까지. 발생 즉시 관리자 보고 대상.'],
      ['지정구역 이탈', 'dur', 0, 0, '활동에 지정된 구역을 벗어난 시점부터 복귀할 때까지.']
    ],
    [ // 내재화·위축
      ['울기', 'dur', 0, 0, '눈물 또는 울음 소리가 시작된 시점부터 10초 이상 멈출 때까지.'],
      ['무반응', 'dur', 0, 0, '3회 이상의 호명·지시에 어떤 반응도 보이지 않는 상태가 지속된 시간.'],
      ['회피', 'freq', 0, 0, '고개를 돌리거나 자리를 옮겨 상호작용을 피한 경우.'],
      ['과호흡', 'dur', 0, 0, '호흡이 뚜렷하게 빨라진 시점부터 안정될 때까지.']
    ],
    [ // 긍정·대체행동
      ['도움 요청', 'freq', 0, 1, '말·몸짓·보완대체의사소통으로 도움을 요청한 경우.'],
      ['지시 따르기', 'freq', 0, 1, '교사의 지시를 촉진 없이 수행한 경우.'],
      ['차례 기다리기', 'freq', 0, 1, '요구 없이 자기 차례를 기다린 경우.'],
      ['"쉬고 싶어요" 요구', 'freq', 0, 1, '휴식을 적절한 방법으로 요구한 경우.'],
      ['자기조절', 'freq', 0, 1, '스스로 심호흡·자리 이동 등 진정 전략을 사용한 경우.'],
      ['과제 착수', 'lat', 0, 1, '지시 제시 이후 실제로 과제를 시작하기까지 걸린 시간.']
    ]
  ];

  var SEED_ANTE = ['요구 제시', '선호물 차단', '전이 상황', '관심 부재', '감각 자극', '불명'];
  var SEED_CONS = ['관심 제공', '과제 철회', '물건 제공', '무시', '신체 개입'];

  function seedConfig() {
    var cfg = {
      version: 1,
      students: [],
      categories: [],
      behaviors: [],
      antecedents: [],
      consequences: [],
      settings: { latencyTimeoutSec: 30, snackbarSec: 6, defaultIntervalSec: 10, defaultIntervalMethod: 'partial', vibrate: true }
    };
    SEED_CATS.forEach(function (c, i) {
      var cid = uid('c');
      cfg.categories.push({ id: cid, label: c[0], color: c[1], order: i, archived: false });
      (SEED_BEHS[i] || []).forEach(function (b, j) {
        cfg.behaviors.push({
          id: uid('b'), categoryId: cid, label: b[0], measure: b[1],
          useIntensity: !!b[2], isReplacement: !!b[3], definition: b[4] || '',
          order: j, archived: false
        });
      });
    });
    SEED_ANTE.forEach(function (l, i) { cfg.antecedents.push({ id: uid('a'), label: l, order: i, archived: false }); });
    SEED_CONS.forEach(function (l, i) { cfg.consequences.push({ id: uid('q'), label: l, order: i, archived: false }); });
    return cfg;
  }

  function seedData() { return { version: 1, sessions: [], events: [], cues: [], intervalRuns: [] }; }

  /* ---------- 로드 / 저장 ---------- */
  async function load() {
    var cfg = await Store.get(KEY_CONFIG);
    var dat = await Store.get(KEY_DATA);
    if (!cfg) { cfg = seedConfig(); await Store.set(KEY_CONFIG, cfg); }
    if (!dat) { dat = seedData(); await Store.set(KEY_DATA, dat); }
    if (!cfg.settings) cfg.settings = seedConfig().settings;
    if (!dat.cues) dat.cues = [];
    if (!dat.intervalRuns) dat.intervalRuns = [];
    db = { cfg: cfg, dat: dat };
    return db;
  }
  async function saveConfig() { return Store.set(KEY_CONFIG, db.cfg); }
  async function saveData() { return Store.set(KEY_DATA, db.dat); }

  /* ---------- 조회 ---------- */
  function cfg() { return db.cfg; }
  function dat() { return db.dat; }
  function settings() { return db.cfg.settings; }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }
  function categories(all) { return db.cfg.categories.filter(function (c) { return all || !c.archived; }).sort(byOrder); }
  function behaviors(catId, all) {
    return db.cfg.behaviors.filter(function (b) {
      return (all || !b.archived) && (!catId || b.categoryId === catId);
    }).sort(byOrder);
  }
  function antecedents(all) { return db.cfg.antecedents.filter(function (a) { return all || !a.archived; }).sort(byOrder); }
  function consequences(all) { return db.cfg.consequences.filter(function (c) { return all || !c.archived; }).sort(byOrder); }
  function students() { return db.cfg.students.filter(function (s) { return !s.archived; }); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function behavior(id) { return find(db.cfg.behaviors, id); }
  function category(id) { return find(db.cfg.categories, id); }
  function student(id) { return find(db.cfg.students, id); }
  function session(id) { return find(db.dat.sessions, id); }

  function catColor(behaviorId) {
    var b = behavior(behaviorId); if (!b) return '#5A6B75';
    var c = category(b.categoryId); return c ? c.color : '#5A6B75';
  }

  function eventsOf(sessionId) {
    return db.dat.events.filter(function (e) { return e.sessionId === sessionId && !e.deleted; });
  }
  function eventsFor(studentId, fromTs, toTs) {
    return db.dat.events.filter(function (e) {
      return !e.deleted && e.studentId === studentId &&
        (!fromTs || e.ts >= fromTs) && (!toTs || e.ts <= toTs) && e.status !== 'running';
    }).sort(function (a, b) { return a.ts - b.ts; });
  }

  return {
    uid: uid, load: load, saveConfig: saveConfig, saveData: saveData,
    cfg: cfg, dat: dat, settings: settings,
    categories: categories, behaviors: behaviors, antecedents: antecedents, consequences: consequences,
    students: students, behavior: behavior, category: category, student: student, session: session,
    catColor: catColor, eventsOf: eventsOf, eventsFor: eventsFor,
    seedConfig: seedConfig, KEY_CONFIG: KEY_CONFIG, KEY_DATA: KEY_DATA
  };
})();
