/* ==========================================================
   app.js — pages, filters, charts, dashboard management.
   Plain JavaScript, no framework.
   ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate  = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const toMin    = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

const DATES = getDates();
const state = {
  tab: 'dashboard',
  date: DATES.length ? DATES[DATES.length - 1] : null,
  semester: 'all',
  status: 'all',
  search: '',
  roll: null,
  analysisView: 'semesters',
  analysisSem: null,
  theme: localStorage.getItem('theme') || 'light',
  // Manage modal state
  manageSem: 5,
  manageTab: 'students',
  manageDay: 'Monday'
};
let charts = [];

// ---------- Small HTML helpers ----------
const NAV = [
  ['dashboard', 'grid-1x2-fill', 'Dashboard'],
  ['daily', 'calendar-check-fill', 'Daily Attendance'],
  ['timetable', 'calendar3-week-fill', 'Timetable'],
  ['analysis', 'person-badge-fill', 'Student Analysis'],
  ['import', 'cloud-arrow-up-fill', 'Data Import']
];
const navHTML = () => NAV.map(([id, icon, label]) =>
  `<a href="#${id}" class="sidebar-link ${state.tab === id ? 'active' : ''}"><i class="bi bi-${icon}"></i> ${label}</a>`).join('');

const optionsHTML = (items, selected) => items.map(([v, l]) =>
  `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const dateOptions = () => optionsHTML(DATES.map(d => [d, fmtDate(d)]), state.date);
const semOptions  = () => optionsHTML([['all', 'All Semesters'], ...SEMESTERS.map(s => [s, SEM_META[s].code])], state.semester);
const statusOptions = () => optionsHTML(
  [['all','All Statuses'], ['Present','Present'], ['Absent','Absent'], ['Late','Late'], ['Bunk','Bunk / Missed']],
  state.status
);

const refSemester = () => state.semester === 'all' ? 5 : +state.semester;
const filterSem   = rows => state.semester === 'all' ? rows : rows.filter(r => r.semester === +state.semester);

const STATUS_UI = {
  Present: ['present', 'check2-circle', 'Present'],
  Absent:  ['absent',  'x-circle',      'Absent'],
  Late:    ['late',    'clock-history', 'Late'],
  Bunk:    ['bunk',    'exclamation-octagon', 'Bunk / Missed'],
  'No Data': ['secondary', 'dash-circle', 'No Data']
};
const statusBadge = s => {
  const [cls, icon, label] = STATUS_UI[s] || STATUS_UI['No Data'];
  return `<span class="badge badge-${cls} px-2 py-1"><i class="bi bi-${icon} me-1"></i>${label}</span>`;
};
const slotPill = v => v === 'P'
  ? `<span class="badge badge-present px-2"><i class="bi bi-check-circle-fill"></i> P</span>`
  : `<span class="badge badge-absent px-2"><i class="bi bi-x-circle-fill"></i> A</span>`;

const banner = () => IS_PLACEHOLDER_DATA
  ? `<div class="alert alert-warning small py-2 no-print"><i class="bi bi-exclamation-triangle-fill me-1"></i> Placeholder data loaded. Use <strong>Manage</strong> on the dashboard to edit.</div>`
  : '';
const emptyBox = msg => `<div class="text-center py-5 text-muted"><i class="bi bi-search fs-2 d-block mb-2 text-secondary"></i>${msg}</div>`;

function statCard(label, value, tone, icon, sub) {
  return `<div class="col-12 col-sm-6 col-xl-2"><div class="stat-card">
    <div class="d-flex align-items-center justify-content-between">
      <div><span class="text-muted small fw-medium">${label}</span>
        <h3 class="fw-bold text-${tone} mt-1 mb-0">${value}</h3></div>
      <div class="stat-icon bg-${tone}-subtle text-${tone}"><i class="bi bi-${icon}"></i></div>
    </div>
    <div class="mt-2 small text-muted">${sub}</div>
  </div></div>`;
}

function chartColors() {
  const dark = state.theme === 'dark';
  return { text: dark ? '#94a3b8' : '#64748b', grid: dark ? '#1e293b' : '#f1f5f9' };
}

function slotAttendanceSlidesHTML() {
  return SEMESTERS.map(sem => {
    const slots = slotsForDate(state.date, sem);
    const rows  = getDailyRows(state.date, sem);
    return `<div class="slot-slide">
      <h6 class="fw-bold mb-3"><i class="bi bi-clock-history text-primary me-2"></i>Slot Attendance — ${SEM_META[sem].code} — ${fmtShort(state.date)}</h6>
      <div class="d-flex flex-column gap-3">
        ${slots.length ? slots.map(s => {
          const r = slotPresentRate(rows, s.slot);
          return `<div class="p-3 rounded border">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-semibold">${esc(s.subject)} <span class="text-muted small">· ${s.slot}</span></span>
              <span class="badge bg-primary">${r.pct}%</span>
            </div>
            <div class="progress my-2" style="height:6px"><div class="progress-bar" style="width:${r.pct}%"></div></div>
            <div class="text-muted small">${r.present} of ${r.total} present • ${r.total - r.present} absent</div>
          </div>`;
        }).join('') : `<p class="text-muted small mb-0">Holiday / no scheduled slots.</p>`}
      </div>
    </div>`;
  }).join('');
}

/* ==========================================================
   DASHBOARD
   ========================================================== */
function renderDashboard() {
  if (!state.date) { $('#view').innerHTML = banner() + emptyBox('No attendance data loaded yet.'); return; }
  const rows = filterSem(getDailyRows(state.date));
  const c = countByStatus(rows);
  const scope = state.semester === 'all' ? 'All semesters' : SEM_META[state.semester].code;
  const refSem = refSemester();
  const refRows = rows.filter(r => r.semester === refSem);
  const daySlots = slotsForDate(state.date, refSem);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 gap-3">
      <div>
        <h4 class="fw-bold mb-1">Attendance Overview</h4>
        <p class="text-muted small mb-0">${fmtDate(state.date)} • ${weekdayOf(state.date)}</p>
      </div>
      <div class="d-flex gap-2">
        <select id="f-date" class="form-select form-select-sm">${dateOptions()}</select>
        <select id="f-sem" class="form-select form-select-sm">${semOptions()}</select>
        <button id="btn-manage" class="btn btn-primary btn-sm text-nowrap">
          <i class="bi bi-gear-fill me-1"></i>Manage
        </button>
      </div>
    </div>
    ${banner()}
    <div class="row g-3 mb-4">
      ${statCard('Total Students', rows.length, 'primary', 'people-fill', scope)}
      ${statCard('Present', c.Present, 'success', 'check-circle-fill', 'Present in all slots')}
      ${statCard('Absent',  c.Absent,  'danger',  'x-circle-fill',    'Absent all day')}
      ${statCard('Late',    c.Late,    'warning', 'clock-history',    'Missed first slot')}
      ${statCard('Bunk',    c.Bunk,    'bunk',    'exclamation-triangle-fill', 'Missed mid-day slot(s)')}
      ${statCard('Attendance Rate', overallRate(rows) + '%', 'info', 'pie-chart-fill', 'Slots attended ÷ slots held')}
    </div>
    <div class="row g-4 mb-4">
      <div class="col-12 col-lg-8"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-graph-up text-primary me-2"></i>Daily Attendance Trend</h6>
          <span class="badge bg-secondary-subtle text-secondary">${DATES.length} day(s)</span>
        </div>
        <div style="height:280px;position:relative"><canvas id="c-trend"></canvas></div>
      </div></div>
      <div class="col-12 col-lg-4"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-pie-chart text-info me-2"></i>Status Breakdown</h6>
          <span class="badge bg-secondary-subtle text-secondary">${fmtShort(state.date)}</span>
        </div>
        <div style="height:280px;position:relative"><canvas id="c-dist"></canvas></div>
      </div></div>
    </div>
    <div class="row g-4">
      <div class="col-12 col-lg-6"><div class="content-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-bar-chart-line text-success me-2"></i>Semester-wise Comparison</h6>
          <span class="badge bg-secondary-subtle text-secondary">CO1 vs CO3 vs CO5</span>
        </div>
        <div style="height:250px;position:relative"><canvas id="c-sem"></canvas></div>
      </div></div>
      <div class="col-12 col-lg-6"><div class="content-card h-100">
        <div class="slot-att-track-wrap" id="slot-att-wrap">
          <div class="slot-att-track" id="slot-att-track">
            ${slotAttendanceSlidesHTML()}
          </div>
        </div>
        <div class="d-flex justify-content-center align-items-center gap-3 mt-3">
          <button class="btn btn-sm btn-outline-secondary" id="slot-att-prev" aria-label="Previous"><i class="bi bi-chevron-left"></i></button>
          <div class="d-flex gap-2" id="slot-att-dots"></div>
          <button class="btn btn-sm btn-outline-secondary" id="slot-att-next" aria-label="Next"><i class="bi bi-chevron-right"></i></button>
        </div>
      </div></div>
    </div>`;

  $('#f-date').onchange = e => { state.date = e.target.value; render(); };
  $('#f-sem').onchange  = e => { state.semester = e.target.value; render(); };
  $('#btn-manage').onclick = openManageModal;
    // ---- Slot Attendance slider (CO1 / CO3 / CO5) ----
  let slotIdx = 0;
  const total = SEMESTERS.length;
  const track = $('#slot-att-track');
  const dots  = $('#slot-att-dots');
  const wrap  = $('#slot-att-wrap');

  const paint = () => {
    track.style.transform = `translateX(-${slotIdx * 100}%)`;
    dots.innerHTML = SEMESTERS.map((_, i) =>
      `<span class="slot-dot ${i === slotIdx ? 'active' : ''}"></span>`).join('');
  };
  $('#slot-att-prev').onclick = () => { slotIdx = (slotIdx - 1 + total) % total; paint(); };
  $('#slot-att-next').onclick = () => { slotIdx = (slotIdx + 1) % total; paint(); };
  paint();

  let startX = null;
  const go = dx => {
    if (Math.abs(dx) < 40) return;
    slotIdx = dx < 0 ? (slotIdx + 1) % total : (slotIdx - 1 + total) % total;
    paint();
  };
  wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend',   e => { if (startX !== null) go(e.changedTouches[0].clientX - startX); startX = null; });
  wrap.addEventListener('mousedown',  e => { startX = e.clientX; });
  wrap.addEventListener('mouseup',    e => { if (startX !== null) go(e.clientX - startX); startX = null; });
  wrap.addEventListener('mouseleave', () => { startX = null; });

  drawDashboardCharts(c);
}

function drawDashboardCharts(c) {
  const { text, grid } = chartColors();
  const base = { responsive: true, maintainAspectRatio: false };
  const perDate = DATES.map(d => filterSem(getDailyRows(d)));

  charts.push(new Chart($('#c-trend'), {
    type: 'line',
    data: {
      labels: DATES.map(fmtShort),
      datasets: [{ label: 'Attendance %', data: perDate.map(overallRate),
        borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true, tension: 0.35, pointRadius: 5 }]
    },
    options: { ...base,
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: text } },
        y: { min: 0, max: 100, grid: { color: grid }, ticks: { color: text } }
      }
    }
  }));

  charts.push(new Chart($('#c-dist'), {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent', 'Late', 'Bunk'],
      datasets: [{ data: [c.Present, c.Absent, c.Late, c.Bunk],
        backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#f97316'], borderWidth: 0 }]
    },
    options: { ...base, cutout: '70%',
      plugins: { legend: { position: 'bottom', labels: { color: text } } } }
  }));

  charts.push(new Chart($('#c-sem'), {
    type: 'bar',
    data: {
      labels: SEMESTERS.map(s => SEM_META[s].code),
      datasets: [{
        label: 'Attendance %',
        data: SEMESTERS.map(s => overallRate(getDailyRows(state.date, s))),
        backgroundColor: ['#60a5fa', '#34d399', '#a78bfa'], borderRadius: 6
      }]
    },
    options: { ...base,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text } },
        y: { min: 0, max: 100, grid: { color: grid }, ticks: { color: text } }
      }
    }
  }));
}

/* ==========================================================
   DAILY ATTENDANCE
   ========================================================== */
function getFilteredDaily() {
  const sem = state.semester === 'all' ? null : +state.semester;
  const q = state.search.trim().toLowerCase();
  return getDailyRows(state.date, sem).filter(r =>
    (state.status === 'all' || r.status === state.status) &&
    (!q || r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q)));
}

function renderDaily() {
  if (!state.date) { $('#view').innerHTML = banner() + emptyBox('No attendance data loaded yet.'); return; }
  const refSem = refSemester();
  const daySlots = slotsForDate(state.date, refSem);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
      <div>
        <h4 class="fw-bold mb-1">Daily Attendance</h4>
        <p class="text-muted small mb-0">${weekdayOf(state.date)} • ${daySlots.length} scheduled slot(s) — ${SEM_META[refSem].code}</p>
      </div>
      <div class="d-flex gap-2 no-print">
        <button id="btn-csv" class="btn btn-outline-secondary btn-sm"><i class="bi bi-filetype-csv me-1"></i> Export CSV</button>
        <button id="btn-print" class="btn btn-outline-secondary btn-sm"><i class="bi bi-printer me-1"></i> Print</button>
      </div>
    </div>
    ${banner()}
    <div class="content-card mb-4 no-print"><div class="row g-3">
      <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Date</label>
        <select id="f-date" class="form-select">${dateOptions()}</select></div>
      <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Semester</label>
        <select id="f-sem" class="form-select">${semOptions()}</select></div>
      <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Status</label>
        <select id="f-status" class="form-select">${statusOptions()}</select></div>
      <div class="col-12 col-md-3"><label class="form-label small fw-semibold text-muted">Search</label>
        <div class="input-group"><span class="input-group-text"><i class="bi bi-search"></i></span>
        <input id="f-search" type="text" class="form-control" placeholder="Roll No or Name..." value="${esc(state.search)}"></div></div>
    </div></div>
    <div class="content-card">
      <div class="mb-3"><span class="text-muted small" id="daily-count"></span></div>
      <div class="table-responsive"><table class="table table-hover align-middle">
        <thead><tr>
          <th>Roll No.</th><th>Name</th><th>Sem</th>
          ${daySlots.map(s => `<th class="text-center small">${esc(s.subject)}<br><span class="text-muted fw-normal">${s.slot}</span></th>`).join('')}
          <th>Status</th><th>Missed</th><th class="text-end no-print">Actions</th>
        </tr></thead>
        <tbody id="daily-body"></tbody>
      </table></div>
    </div>`;

  $('#f-date').onchange   = e => { state.date = e.target.value; renderDaily(); };
  $('#f-sem').onchange    = e => { state.semester = e.target.value; renderDaily(); };
  $('#f-status').onchange = e => { state.status = e.target.value; updateDaily(); };
  $('#f-search').oninput  = e => { state.search = e.target.value; updateDaily(); };
  $('#btn-print').onclick = () => window.print();
  $('#btn-csv').onclick   = () => exportDailyCSV(getFilteredDaily(), daySlots);
  $('#daily-body').onclick = e => {
    const btn = e.target.closest('[data-roll]');
    if (!btn) return;
    const st = findStudent(btn.dataset.roll);
    state.roll = btn.dataset.roll;
    state.analysisSem = st ? st.semester : null;
    state.analysisView = 'detail';
    location.hash = '#analysis';
  };
  updateDaily();
}

function updateDaily() {
  const refSem = refSemester();
  const daySlots = slotsForDate(state.date, refSem);
  const rows = getFilteredDaily();
  const allRows = getDailyRows(state.date, state.semester === 'all' ? null : +state.semester);
  $('#daily-count').innerHTML = `Showing <strong>${rows.length}</strong> of ${allRows.length} students`;

  if (!rows.length) {
    $('#daily-body').innerHTML = `<tr><td colspan="${5 + daySlots.length}">${emptyBox('No student records match the filters.')}</td></tr>`;
    return;
  }

  $('#daily-body').innerHTML = rows.map(r => {
    const missedNames = r.missed.map(sl => {
      const s = daySlots.find(x => x.slot === sl);
      return s ? s.subject : sl;
    });
    return `<tr>
      <td><span class="fw-semibold text-primary">${esc(r.rollNo)}</span></td>
      <td class="fw-medium">${esc(r.name)}</td>
      <td><span class="badge bg-secondary-subtle text-secondary-emphasis border">S${r.semester}</span></td>
      ${daySlots.map(s => {
        const rec = r.records.find(x => x.slot === s.slot);
        return `<td class="text-center">${rec ? slotPill(rec.status) : '<span class="text-muted">—</span>'}</td>`;
      }).join('')}
      <td>${statusBadge(r.status)}</td>
      <td class="text-muted small">${missedNames.length ? esc(missedNames.join(', ')) : '—'}</td>
      <td class="text-end no-print"><button class="btn btn-sm btn-outline-primary" data-roll="${esc(r.rollNo)}"><i class="bi bi-person-lines-fill me-1"></i> Analysis</button></td>
    </tr>`;
  }).join('');
}

function exportDailyCSV(rows, daySlots) {
  const head = ['Roll No','Name','Semester','Date',
                ...daySlots.map(s => `${s.subject} (${s.slot})`),
                'Status','Missed Slots'];
  const body = rows.map(r => {
    const cells = daySlots.map(s => {
      const rec = r.records.find(x => x.slot === s.slot);
      return rec ? rec.status : '';
    });
    return [r.rollNo, r.name, r.semester, state.date, ...cells, r.status, r.missed.join(' / ')];
  });
  const csv = [head, ...body].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `attendance_${state.date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ==========================================================
   TIMETABLE — Weekly view (per-semester)
   ========================================================== */
const TT_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TT_TIME_LABELS = ['09:15–10:15','10:15–11:15','11:30–12:30','12:30–13:30','14:00–15:00','15:00–16:00'];
const TT_START_ROW = { '09:15': 0, '10:15': 1, '11:30': 2, '12:30': 3, '14:00': 4, '15:00': 5 };

function renderTimetable() {
  const sem = refSemester();
  const tt  = timetableOf(sem);

  const occ = {};
  TT_DAYS.forEach(d => {
    occ[d] = {};
    (tt[d] || []).forEach(e => {
      const [start, end] = e.slot.split('-');
      const span = (toMin(end) - toMin(start)) >= 90 ? 2 : 1;
      const row = TT_START_ROW[start];
      if (row === undefined) return;
      occ[d][row] = { entry: e, span };
      for (let k = 1; k < span; k++) occ[d][row + k] = '_';
    });
  });

  const head = `<tr><th style="width:130px">Time</th>${TT_DAYS.map(d => `<th class="text-center">${d}</th>`).join('')}</tr>`;
  let body = '';
  const rowHTML = row => {
    let out = '<tr>';
    out += `<td class="small text-muted">${TT_TIME_LABELS[row]}</td>`;
    TT_DAYS.forEach(d => {
      const c = occ[d][row];
      if (c === '_') return;
      if (!c) { out += `<td class="tt-cell" data-day="${d}" data-row="${row}"></td>`; return; }
      const e = c.entry;
      const cls = e.type === 'Lab' ? 'bg-info-subtle'
                : e.type === 'Library' ? 'bg-secondary-subtle'
                : 'bg-primary-subtle';
      out += `<td class="tt-cell ${cls}" rowspan="${c.span}" data-day="${d}" data-row="${row}">
        <div class="fw-semibold small">${esc(e.subject)}</div>
        <div class="text-muted" style="font-size:.68rem">${esc(e.type)}${e.type === 'Lab' ? ' · 2u' : e.type === 'Theory' ? ' · 1u' : ''}</div>
      </td>`;
    });
    out += '</tr>';
    return out;
  };

  body += rowHTML(0) + rowHTML(1);
  body += `<tr><td class="small text-muted">11:15–11:30</td><td colspan="${TT_DAYS.length}" class="text-center small text-muted">Short Break</td></tr>`;
  body += rowHTML(2) + rowHTML(3);
  body += `<tr><td class="small text-muted">13:30–14:00</td><td colspan="${TT_DAYS.length}" class="text-center small text-muted">Lunch Break</td></tr>`;
  body += rowHTML(4) + rowHTML(5);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 gap-3">
      <div>
        <h4 class="fw-bold mb-1">${SEM_META[sem].label} — Weekly Timetable</h4>
        <p class="text-muted small mb-0">Click a cell to change the subject. Use <strong>Manage</strong> on the Dashboard for full control.</p>
      </div>
      <div class="d-flex gap-2">
        <select id="f-sem" class="form-select form-select-sm">${optionsHTML(SEMESTERS.map(s => [s, SEM_META[s].code]), sem)}</select>
        <button id="btn-manage" class="btn btn-primary btn-sm text-nowrap"><i class="bi bi-gear-fill me-1"></i>Manage</button>
      </div>
    </div>
    ${banner()}
    <div class="content-card">
      <div class="table-responsive" id="tt-container">
        <table class="table table-bordered align-middle mb-0">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="text-muted small mt-3 mb-0">
        <i class="bi bi-info-circle me-1"></i>
        Labs occupy 2-hour windows: 9:15–11:15, 11:30–1:30, 2:00–4:00. Breaks and Library Hour are not attendance units.
      </p>
    </div>`;

  $('#f-sem').onchange = e => { state.semester = e.target.value; renderTimetable(); };
  $('#btn-manage').onclick = openManageModal;

  $('#tt-container').onclick = e => {
    const td = e.target.closest('.tt-cell');
    if (!td) return;
    const day = td.dataset.day;
    const row = +td.dataset.row;
    const tt2 = timetableOf(refSemester());
    const dayList = tt2[day] || (tt2[day] = []);

    const startLabel = TT_TIME_LABELS[row].replace('–', '-').split('-')[0];
    const found = dayList.find(x => x.slot.split('-')[0] === startLabel);

    const cur = found ? found.subject : '';
    const newSubj = prompt(`Subject for ${day} ${TT_TIME_LABELS[row]}${found ? '' : ' (empty = clear)'}:`, cur);
    if (newSubj === null) return;

    if (newSubj.trim() === '') {
      if (found) dayList.splice(dayList.indexOf(found), 1);
    } else if (found) {
      found.subject = newSubj.trim();
    } else {
      dayList.push({ slot: TT_TIME_LABELS[row].replace('–', '-'), subject: newSubj.trim(), type: 'Theory' });
    }
    saveAll();
    renderTimetable();
  };
}

/* ==========================================================
   STUDENT ANALYSIS (semesters → students → detail)
   ========================================================== */
function renderAnalysis() {
  if (state.analysisView === 'detail' && state.roll) return renderStudentDetail();
  if (state.analysisView === 'students' && state.analysisSem) return renderStudentList();
  return renderSemesterPicker();
}

function renderSemesterPicker() {
  $('#view').innerHTML = `
    <div class="mb-4">
      <h4 class="fw-bold mb-1">Student Analysis</h4>
      <p class="text-muted small mb-0">Pick a semester to view its students.</p>
    </div>
    ${banner()}
    <div class="row g-4">
      ${SEMESTERS.map(sem => {
        const count = studentsOf(sem).length;
        return `<div class="col-12 col-md-6 col-lg-4">
          <div class="content-card sem-card" data-sem="${sem}">
            <div class="d-flex align-items-center justify-content-between">
              <div>
                <h5 class="fw-bold mb-1">${SEM_META[sem].label}</h5>
                <p class="text-muted small mb-0">${count} student(s)</p>
              </div>
              <div class="stat-icon bg-primary-subtle text-primary"><i class="bi bi-mortarboard-fill"></i></div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  $('#view').querySelectorAll('.sem-card').forEach(el => {
    el.onclick = () => {
      state.analysisSem = +el.dataset.sem;
      state.analysisView = 'students';
      renderAnalysis();
    };
  });
}

function renderStudentList() {
  const sem = state.analysisSem;
  const students = studentsOf(sem).slice()
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
      <div>
        <h4 class="fw-bold mb-1">${SEM_META[sem].label} — Students</h4>
        <p class="text-muted small mb-0">${students.length} student(s), ordered by roll number</p>
      </div>
      <button id="back-btn" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left me-1"></i> Back</button>
    </div>
    ${banner()}
    <div class="content-card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Roll No.</th><th>Name</th><th>Batch</th><th class="text-center">Attendance %</th><th class="text-end">Action</th></tr></thead>
          <tbody>
            ${students.length ? students.map(st => {
              const stats = studentStats(st.rollNo);
              const tone = stats.pct >= ATTENDANCE_THRESHOLD ? 'success' : 'danger';
              return `<tr>
                <td class="fw-semibold text-primary">${esc(st.rollNo)}</td>
                <td>${esc(st.name)}</td>
                <td class="text-muted small">${esc(st.batch || '—')}</td>
                <td class="text-center"><span class="badge bg-${tone}">${stats.pct}%</span></td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-roll="${esc(st.rollNo)}">View</button></td>
              </tr>`;
            }).join('') : `<tr><td colspan="5" class="text-center text-muted py-4">No students in this semester.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $('#back-btn').onclick = () => { state.analysisView = 'semesters'; state.analysisSem = null; renderAnalysis(); };
  $('#view').querySelectorAll('[data-roll]').forEach(b => {
    b.onclick = () => {
      state.roll = b.dataset.roll;
      state.analysisView = 'detail';
      renderAnalysis();
    };
  });
}

function renderStudentDetail() {
  const st = findStudent(state.roll);
  if (!st) { $('#view').innerHTML = emptyBox('Student not found.'); return; }

  const stats = studentStats(st.rollNo);
  const hist = getStudentHistory(st.rollNo);
  const ok = stats.pct >= ATTENDANCE_THRESHOLD;
  const tone = ok ? 'success' : 'danger';
  const initials = st.name.split(' ').map(n => n[0]).join('').slice(0, 3);

  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
      <div>
        <h4 class="fw-bold mb-1">Student Attendance</h4>
        <p class="text-muted small mb-0">${esc(st.name)} · ${esc(st.rollNo)}</p>
      </div>
      <button id="back-btn" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left me-1"></i> Back</button>
    </div>
    ${banner()}
    <div class="row g-4">
      <div class="col-12 col-lg-4"><div class="content-card h-100">
        <div class="text-center pb-3 border-bottom">
          <div class="rounded-circle bg-primary-subtle text-primary d-inline-flex align-items-center justify-content-center mb-3" style="width:80px;height:80px;font-size:1.6rem">${esc(initials)}</div>
          <h5 class="fw-bold mb-1">${esc(st.name)}</h5>
          <span class="badge bg-primary mb-2">${esc(st.rollNo)}</span>
          <div class="text-muted small">Computer Engineering • ${SEM_META[st.semester].label}</div>
          ${st.batch ? `<div class="text-muted small">Batch: ${esc(st.batch)}</div>` : ''}
        </div>
        <div class="pt-3">
          <h6 class="fw-bold small text-muted text-uppercase mb-3">Threshold</h6>
          <div class="p-3 rounded bg-${tone}-subtle">
            <div class="d-flex justify-content-between align-items-center">
              <span class="fw-semibold">${ATTENDANCE_THRESHOLD}% required</span>
              <span class="badge bg-${tone}">${ok ? 'OK' : 'Below'}</span>
            </div>
          </div>
        </div>
      </div></div>
      <div class="col-lg-8 col-12">
        <div class="content-card mb-4">
          <h6 class="fw-bold mb-3"><i class="bi bi-speedometer2 text-primary me-2"></i>Overall Attendance</h6>
          <div class="row g-3 text-center">
            <div class="col-4"><div class="p-3 border rounded">
              <span class="text-muted small d-block">Attendance %</span>
              <h3 class="fw-bold mt-1 text-${tone}">${stats.pct}%</h3>
              <div class="progress mt-2" style="height:6px"><div class="progress-bar bg-${tone}" style="width:${stats.pct}%"></div></div>
            </div></div>
            <div class="col-4"><div class="p-3 border rounded">
              <span class="text-muted small d-block">Attended</span>
              <h3 class="fw-bold mt-1 text-primary">${stats.att}</h3>
              <span class="text-muted small">of ${stats.held} slots</span>
            </div></div>
            <div class="col-4"><div class="p-3 border rounded">
              <span class="text-muted small d-block">Missed</span>
              <h3 class="fw-bold mt-1 text-danger">${stats.held - stats.att}</h3>
              <span class="text-muted small">slot(s)</span>
            </div></div>
          </div>
        </div>
        <div class="content-card mb-4">
          <h6 class="fw-bold mb-3"><i class="bi bi-book text-info me-2"></i>Subject-wise</h6>
          ${stats.subjects.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle mb-0">
              <thead><tr><th>Subject</th><th class="text-center">Attended</th><th class="text-center">%</th></tr></thead>
              <tbody>${stats.subjects.map(s => `<tr>
                <td>${esc(s.subject)}</td>
                <td class="text-center">${s.present} / ${s.total}</td>
                <td class="text-center"><span class="badge bg-${s.pct >= ATTENDANCE_THRESHOLD ? 'success' : 'danger'}">${s.pct}%</span></td>
              </tr>`).join('')}</tbody>
            </table></div>
          ` : `<p class="text-muted small mb-0">No subject data yet.</p>`}
        </div>
        <div class="content-card">
          <h6 class="fw-bold mb-3"><i class="bi bi-calendar-check text-success me-2"></i>Day-by-day History</h6>
          <div class="table-responsive"><table class="table align-middle">
            <thead><tr><th>Date</th><th>Day</th><th class="text-center">Slots (P/A)</th><th>Status</th><th>Missed</th></tr></thead>
            <tbody>${hist.length ? hist.map(r => {
              const codes = r.records.map(rec => rec.status).join('');
              return `<tr>
                <td>${fmtDate(r.date)}</td>
                <td class="text-muted small">${weekdayOf(r.date)}</td>
                <td class="text-center"><code>${codes}</code></td>
                <td>${statusBadge(r.status)}</td>
                <td class="text-muted small">${r.missed.length ? esc(r.missed.join(', ')) : '—'}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="5">${emptyBox('No attendance records for this student.')}</td></tr>`}</tbody>
          </table></div>
        </div>
      </div>
    </div>`;

  $('#back-btn').onclick = () => {
    state.analysisView = state.analysisSem ? 'students' : 'semesters';
    state.roll = null;
    renderAnalysis();
  };
}

/* ==========================================================
   DATA IMPORT (placeholder)
   ========================================================== */
function renderImport() {
  $('#view').innerHTML = `
    <div class="mb-4">
      <h4 class="fw-bold mb-1">Data Import</h4>
      <p class="text-muted small mb-0">Smart Excel Intelligence — Coming Soon</p>
    </div>
    <div class="row g-4">
      <div class="col-12 col-lg-7"><div class="content-card">
        <h6 class="fw-bold mb-3"><i class="bi bi-cloud-arrow-up text-primary me-2"></i>Upload File</h6>
        <div class="upload-box p-5 text-center text-muted">
          <i class="bi bi-file-earmark-spreadsheet fs-1 d-block mb-2"></i>
          Excel / CSV import is not yet available.<br>Data currently loads from <code>data.js</code>.
        </div>
        <button class="btn btn-primary btn-sm mt-3" disabled><i class="bi bi-upload me-1"></i> Choose file</button>
      </div></div>
      <div class="col-12 col-lg-5"><div class="content-card h-100">
        <h6 class="fw-bold mb-3"><i class="bi bi-info-circle text-info me-2"></i>Planned features</h6>
        <ul class="text-muted small mb-0 ps-3">
          <li>Read the faculty's real attendance Excel format</li>
          <li>Map roll numbers to the student master list</li>
          <li>Convert each day's data into timetable-slot records</li>
          <li>Automatically classify Present / Absent / Late / Bunk</li>
        </ul>
      </div></div>
    </div>`;
}

/* ==========================================================
   MANAGE / CONFIGURE modal
   ========================================================== */
function openManageModal() {
  state.manageSem = state.manageSem || 5;
  state.manageTab = state.manageTab || 'students';
  state.manageDay = state.manageDay || 'Monday';
  renderManageBody();
  const modal = bootstrap.Modal.getOrCreateInstance($('#manageModal'));
  modal.show();
}

function renderManageBody() {
  const sem = state.manageSem;
  const tab = state.manageTab;

  $('#manage-body').innerHTML = `
    <ul class="nav nav-pills mb-3 gap-2">
      ${SEMESTERS.map(s => `
        <li class="nav-item">
          <button type="button" class="nav-link ${s === sem ? 'active' : ''}" data-msem="${s}">
            <i class="bi bi-mortarboard me-1"></i>${SEM_META[s].code}
          </button>
        </li>`).join('')}
    </ul>
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button type="button" class="nav-link ${tab === 'students' ? 'active' : ''}" data-mtab="students"><i class="bi bi-people-fill me-1"></i>Students</button></li>
      <li class="nav-item"><button type="button" class="nav-link ${tab === 'timetable' ? 'active' : ''}" data-mtab="timetable"><i class="bi bi-calendar3 me-1"></i>Timetable</button></li>
    </ul>
    <div id="manage-tab-content">
      ${tab === 'students' ? manageStudentsHTML(sem) : manageTimetableHTML(sem)}
    </div>`;
}

function manageStudentsHTML(sem) {
  const studs = studentsOf(sem).slice()
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
  return `
    <div class="table-responsive mb-3">
      <table class="table table-sm align-middle">
        <thead><tr><th>Roll No.</th><th>Name</th><th>Batch</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${studs.length ? studs.map(st => `
            <tr data-roll="${esc(st.rollNo)}">
              <td class="fw-semibold">${esc(st.rollNo)}</td>
              <td>${esc(st.name)}</td>
              <td class="text-muted small">${esc(st.batch || '—')}</td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit-student">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-student">Delete</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted py-3">No students in ${SEM_META[sem].code}. Add one below.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="manage-form p-3">
      <h6 class="fw-bold mb-2 small text-uppercase text-muted">Add student to ${SEM_META[sem].code}</h6>
      <div class="row g-2">
        <div class="col-md-3"><input id="ms-roll"  class="form-control form-control-sm" placeholder="Roll No."></div>
        <div class="col-md-5"><input id="ms-name"  class="form-control form-control-sm" placeholder="Student Name"></div>
        <div class="col-md-2"><input id="ms-batch" class="form-control form-control-sm" placeholder="Batch (opt)"></div>
        <div class="col-md-2"><button type="button" id="ms-add" class="btn btn-sm btn-primary w-100">Add</button></div>
      </div>
    </div>`;
}

function manageTimetableHTML(sem) {
  const tt = timetableOf(sem);
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const activeDay = state.manageDay;
  const slots = (tt[activeDay] || []).slice().sort((a, b) => a.slot.localeCompare(b.slot));

  return `
    <ul class="nav nav-pills mb-3 gap-2 flex-wrap">
      ${days.map(d => `<li class="nav-item"><button type="button" class="nav-link ${d === activeDay ? 'active' : ''}" data-mday="${d}">${d.slice(0,3)}</button></li>`).join('')}
    </ul>
    <div class="table-responsive mb-3">
      <table class="table table-sm align-middle">
        <thead><tr><th>Time</th><th>Subject</th><th>Type</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${slots.length ? slots.map(s => `
            <tr data-slot="${esc(s.slot)}">
              <td>${esc(s.slot)}</td>
              <td>${esc(s.subject)}</td>
              <td><span class="badge bg-secondary">${esc(s.type)}</span></td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit-slot">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="del-slot">Delete</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="4" class="text-center text-muted py-3">No slots for ${activeDay}.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="manage-form p-3">
      <h6 class="fw-bold mb-2 small text-uppercase text-muted">Add slot to ${activeDay} — ${SEM_META[sem].code}</h6>
      <div class="row g-2">
        <div class="col-md-3">
          <select id="mt-slot" class="form-select form-select-sm">
            <optgroup label="Theory (1 hr)">
              <option value="09:15-10:15">09:15–10:15</option>
              <option value="10:15-11:15">10:15–11:15</option>
              <option value="11:30-12:30">11:30–12:30</option>
              <option value="12:30-13:30">12:30–13:30</option>
              <option value="14:00-15:00">14:00–15:00</option>
              <option value="15:00-16:00">15:00–16:00</option>
            </optgroup>
            <optgroup label="Lab (2 hrs)">
              <option value="09:15-11:15">09:15–11:15</option>
              <option value="11:30-13:30">11:30–13:30</option>
              <option value="14:00-16:00">14:00–16:00</option>
            </optgroup>
          </select>
        </div>
        <div class="col-md-4"><input id="mt-subject" class="form-control form-control-sm" placeholder="Subject"></div>
        <div class="col-md-3">
          <select id="mt-type" class="form-select form-select-sm">
            <option>Theory</option><option>Lab</option><option>Library</option>
          </select>
        </div>
        <div class="col-md-2"><button type="button" id="mt-add" class="btn btn-sm btn-primary w-100">Add</button></div>
      </div>
      <p class="small text-muted mt-2 mb-0">Breaks are automatic and are not editable slots.</p>
    </div>`;
}

/* ---------- Manage body: delegated actions ---------- */
function handleManageAction(btn) {
  const action = btn.dataset.action;
  const sem = state.manageSem;
  const studs = studentsOf(sem);
  const tt = timetableOf(sem);

  if (action === 'edit-student' || action === 'del-student') {
    const roll = btn.closest('tr').dataset.roll;
    const idx = studs.findIndex(s => s.rollNo === roll);
    if (idx < 0) return;
    const st = studs[idx];

    if (action === 'edit-student') {
      const newRoll  = prompt('Roll Number:', st.rollNo);            if (newRoll  === null) return;
      const newName  = prompt('Name:', st.name);                     if (newName  === null) return;
      const newBatch = prompt('Batch (optional):', st.batch || '');  if (newBatch === null) return;

      const cleanRoll = newRoll.trim();
      if (cleanRoll && cleanRoll !== st.rollNo) {
        const clash = findStudent(cleanRoll);
        if (clash) { alert('That roll number already exists.'); return; }
        RECORDS.forEach(r => { if (r.rollNo === st.rollNo) r.rollNo = cleanRoll; });
        st.rollNo = cleanRoll;
      }
      st.name  = newName.trim() || st.name;
      st.batch = newBatch.trim() || null;
    } else {
      if (!confirm(`Delete ${st.name}? This also removes their attendance records.`)) return;
      for (let i = RECORDS.length - 1; i >= 0; i--) {
        if (RECORDS[i].rollNo === st.rollNo) RECORDS.splice(i, 1);
      }
      studs.splice(idx, 1);
    }
  } else if (action === 'edit-slot' || action === 'del-slot') {
    const slotKey = btn.closest('tr').dataset.slot;
    const day = state.manageDay;
    const list = tt[day] || [];
    const idx = list.findIndex(s => s.slot === slotKey);
    if (idx < 0) return;
    const slot = list[idx];

    if (action === 'edit-slot') {
      const newTime = prompt('Time (e.g. 09:15-10:15 or 11:30-13:30):', slot.slot); if (newTime === null) return;
      const newSubj = prompt('Subject:', slot.subject);                              if (newSubj === null) return;
      const newType = prompt('Type (Theory / Lab / Library):', slot.type);           if (newType === null) return;

      const cleanTime = newTime.trim();
      if (cleanTime && cleanTime !== slot.slot) {
        // Drop batch info if the slot's duration no longer matches lab
        slot.slot = cleanTime;
        const [s0, e0] = cleanTime.split('-');
        if ((toMin(e0) - toMin(s0)) < 90) delete slot.batches;
      }
      slot.subject = newSubj.trim() || slot.subject;
      const t = newType.trim();
      if (['Theory','Lab','Library'].includes(t)) slot.type = t;
    } else {
      if (!confirm(`Delete slot ${slot.slot} (${slot.subject})?`)) return;
      list.splice(idx, 1);
    }
  }

  saveAll();
  renderManageBody();
  render();
}

function handleManageAdd(btn) {
  const sem = state.manageSem;
  const tt = timetableOf(sem);
  const studs = studentsOf(sem);

  if (btn.id === 'ms-add') {
    const roll  = $('#ms-roll').value.trim();
    const name  = $('#ms-name').value.trim();
    const batch = $('#ms-batch').value.trim() || null;
    if (!roll || !name) { alert('Roll number and name are required.'); return; }
    if (findStudent(roll)) { alert('Roll number already exists.'); return; }
    studs.push({ rollNo: roll, name, semester: sem, batch });
  } else if (btn.id === 'mt-add') {
    const slotVal = $('#mt-slot').value;
    const subject = $('#mt-subject').value.trim();
    const type    = $('#mt-type').value;
    if (!subject) { alert('Subject is required.'); return; }
    const day = state.manageDay;
    const list = tt[day] || (tt[day] = []);
    if (list.some(s => s.slot === slotVal)) { alert('That time slot already exists on this day.'); return; }
    list.push({ slot: slotVal, subject, type });
  }

  saveAll();
  renderManageBody();
  render();
}

/* ==========================================================
   Theme + routing
   ========================================================== */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-bs-theme', state.theme);
  $('#theme-btn').innerHTML = state.theme === 'light'
    ? `<i class="bi bi-moon-stars-fill text-primary"></i><span class="small d-none d-md-inline">Dark Mode</span>`
    : `<i class="bi bi-sun-fill text-warning"></i><span class="small d-none d-md-inline">Light Mode</span>`;
}

$('#theme-btn').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', state.theme);
  applyTheme();
  render();
};

function render() {
  charts.forEach(c => c.destroy());
  charts = [];
  $('#nav-desktop').innerHTML = $('#nav-mobile').innerHTML = navHTML();
  ({
    dashboard: renderDashboard,
    daily:     renderDaily,
    timetable: renderTimetable,
    analysis:  renderAnalysis,
    import:    renderImport
  })[state.tab]();
}

function route() {
  const id = location.hash.slice(1);
  state.tab = NAV.some(n => n[0] === id) ? id : 'dashboard';
  const menu = document.getElementById('mobileNav');
  const oc = window.bootstrap && bootstrap.Offcanvas.getInstance(menu);
  if (oc) oc.hide();
  render();
  window.scrollTo(0, 0);
}

/* Manage modal: one-time global wiring */
$('#manage-body').addEventListener('click', e => {
  const semBtn = e.target.closest('[data-msem]');
  if (semBtn) { state.manageSem = +semBtn.dataset.msem; renderManageBody(); return; }
  const tabBtn = e.target.closest('[data-mtab]');
  if (tabBtn) { state.manageTab = tabBtn.dataset.mtab; renderManageBody(); return; }
  const dayBtn = e.target.closest('[data-mday]');
  if (dayBtn) { state.manageDay = dayBtn.dataset.mday; renderManageBody(); return; }
  const actBtn = e.target.closest('[data-action]');
  if (actBtn) { handleManageAction(actBtn); return; }
  const addBtn = e.target.closest('#ms-add, #mt-add');
  if (addBtn) { handleManageAdd(addBtn); }
});

$('#manage-reset').addEventListener('click', () => {
  if (!confirm('Reset ALL data (students, timetables, attendance) to defaults?')) return;
  resetAll();
  renderManageBody();
  render();
});

window.addEventListener('hashchange', route);
applyTheme();
route();