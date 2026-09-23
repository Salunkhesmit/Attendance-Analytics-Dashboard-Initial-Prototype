/* ==========================================================
   attendance.js — attendance logic and timetable helpers.
   No HTML. Every number shown in the UI comes from here.
   All lookups are semester-aware: each semester has its own
   students + timetable, so we never mix CO1 / CO3 / CO5.
   ========================================================== */

const STATUS = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', BUNK: 'Bunk', NODATA: 'No Data' };
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Find a student by roll number across all semesters. */
function findStudent(rollNo) {
  if (!rollNo) return null;
  for (const sem of SEMESTERS) {
    const st = studentsOf(sem).find(s => s.rollNo === rollNo);
    if (st) return st;
  }
  return null;
}

/* ---------- Date / slot helpers ---------- */
const weekdayOf    = d => WEEKDAYS[new Date(d + 'T00:00:00').getDay()];
const getDates     = () => [...new Set(RECORDS.map(r => r.date))].sort();
const slotsForDate = (d, sem) => (timetableOf(sem)[weekdayOf(d)] || []);
const slotStart    = s => s.split('-')[0];

/* ---------- Day classification ----------
   • all P         -> Present
   • all A         -> Absent
   • first slot A  -> Late   (present later in the day)
   • otherwise     -> Bunk / Missed
*/
function classifyDay(recs) {
  const missed = recs.filter(r => r.status === 'A').map(r => r.slot);
  if (!recs.length) return { status: STATUS.NODATA, missed: [] };
  if (recs.every(r => r.status === 'P')) return { status: STATUS.PRESENT, missed };
  if (recs.every(r => r.status === 'A')) return { status: STATUS.ABSENT,  missed };
  const sorted = [...recs].sort((a, b) => slotStart(a.slot).localeCompare(slotStart(b.slot)));
  if (sorted[0].status === 'A') return { status: STATUS.LATE, missed };
  return { status: STATUS.BUNK, missed };
}

/* ---------- Aggregators ---------- */
const getDailyRows = (date, sem = null) => {
  const byRoll = {};
  const scopeRolls = sem
    ? new Set(studentsOf(sem).map(s => s.rollNo))
    : new Set(SEMESTERS.flatMap(s => studentsOf(s).map(x => x.rollNo)));

  RECORDS.filter(r => r.date === date && scopeRolls.has(r.rollNo)).forEach(r => {
    (byRoll[r.rollNo] = byRoll[r.rollNo] || []).push(r);
  });
  return Object.entries(byRoll).map(([rollNo, recs]) => {
    const st = findStudent(rollNo) || { rollNo, name: rollNo, semester: null };
    return { rollNo, name: st.name, semester: st.semester, records: recs, ...classifyDay(recs) };
  });
};

const getStudentHistory = roll => {
  const byDate = {};
  RECORDS.filter(r => r.rollNo === roll).forEach(r => {
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });
  return Object.entries(byDate).map(([date, recs]) => ({
    date, records: recs, ...classifyDay(recs)
  })).sort((a, b) => a.date.localeCompare(b.date));
};

/* ---------- Statistics ---------- */
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function countByStatus(rows) {
  const c = { Present: 0, Absent: 0, Late: 0, Bunk: 0, 'No Data': 0 };
  rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

const overallRate = rows => {
  let held = 0, attended = 0;
  rows.forEach(r => r.records.forEach(rec => {
    held++;
    if (rec.status === 'P') attended++;
  }));
  return percent(attended, held);
};

const slotPresentRate = (rows, slot) => {
  const total = rows.length;
  const present = rows.filter(r => {
    const rec = r.records.find(x => x.slot === slot);
    return rec && rec.status === 'P';
  }).length;
  return { present, total, pct: percent(present, total) };
};

/* Overall + subject-wise stats for one student. */
function studentStats(roll) {
  const st = findStudent(roll);
  const tt = st ? timetableOf(st.semester) : DEFAULT_TIMETABLE;
  const recs = RECORDS.filter(r => r.rollNo === roll);
  const held = recs.length;
  const att  = recs.filter(r => r.status === 'P').length;
  const pct  = percent(att, held);

  const bySubj = {};
  recs.forEach(r => {
    const slot = (tt[weekdayOf(r.date)] || []).find(s => s.slot === r.slot);
    if (!slot) return;
    const subj = slot.subject;
    bySubj[subj] = bySubj[subj] || { total: 0, present: 0 };
    bySubj[subj].total++;
    if (r.status === 'P') bySubj[subj].present++;
  });
  const subjects = Object.entries(bySubj).map(([subject, d]) => ({
    subject, ...d, pct: percent(d.present, d.total)
  }));

  return { held, att, pct, subjects };
}