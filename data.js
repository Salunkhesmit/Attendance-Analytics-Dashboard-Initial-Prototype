/* ==========================================================
   data.js — per-semester students, timetables, and records.
   Each semester (1, 3, 5) has its OWN students + timetable,
   so editing CO1 never affects CO3 or CO5.
   Everything the teacher edits is persisted in localStorage.
   ========================================================== */

const IS_PLACEHOLDER_DATA = true;
const ATTENDANCE_THRESHOLD = 75;
const SEMESTERS = [1, 3, 5];

const SEM_META = {
  1: { code: 'CO1', label: 'Semester 1 (CO1)' },
  3: { code: 'CO3', label: 'Semester 3 (CO3)' },
  5: { code: 'CO5', label: 'Semester 5 (CO5)' }
};

/* ---------- Default weekly timetable (same structure for all sems for now) ---------- */
const DEFAULT_TIMETABLE = {
  Monday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'ENDS', type: 'Theory' },
    { slot: '11:30-13:30', subject: 'OSY',  type: 'Lab', batches: { A: 'OSY', B: 'ENDS', C: 'DAN' } },
    { slot: '14:00-15:00', subject: 'OSY',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'DAN',  type: 'Theory' }
  ],
  Tuesday: [
    { slot: '09:15-10:15', subject: 'STE',  type: 'Theory' },
    { slot: '10:15-11:15', subject: 'SPI',  type: 'Theory' },
    { slot: '11:30-13:30', subject: 'DAN',  type: 'Lab', batches: { A: 'DAN', B: 'OSY', C: 'ENDS' } },
    { slot: '14:00-15:00', subject: 'DAN',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'OSY',  type: 'Theory' }
  ],
  Wednesday: [
    { slot: '09:15-11:15', subject: 'STE', type: 'Lab', batches: { A: 'STE', B: 'STE' } },
    { slot: '11:30-12:30', subject: 'LIBRARY HOUR', type: 'Library' },
    { slot: '12:30-13:30', subject: 'OSY', type: 'Theory' },
    { slot: '14:00-15:00', subject: 'DAN', type: 'Theory' },
    { slot: '15:00-16:00', subject: 'STE', type: 'Theory' }
  ],
  Thursday: [
    { slot: '09:15-11:15', subject: 'ENDS', type: 'Lab', batches: { A: 'ENDS', B: 'DAN', C: 'OSY' } },
    { slot: '11:30-12:30', subject: 'OSY',  type: 'Theory' },
    { slot: '12:30-13:30', subject: 'ENDS', type: 'Theory' },
    { slot: '14:00-15:00', subject: 'DAN',  type: 'Theory' },
    { slot: '15:00-16:00', subject: 'STE',  type: 'Theory' }
  ],
  Friday: [
    { slot: '09:15-10:15', subject: 'OSY', type: 'Theory' },
    { slot: '10:15-11:15', subject: 'STE', type: 'Theory' },
    { slot: '11:30-12:30', subject: 'DAN', type: 'Theory' },
    { slot: '12:30-13:30', subject: 'OSY', type: 'Theory' },
    { slot: '14:00-16:00', subject: 'STE', type: 'Lab', batches: { A: 'STE', B: 'STE' } }
  ],
  Saturday: []  // Holiday
};

const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Default students (6 per semester) ---------- */
function defaultStudentsFor(sem) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    out.push({
      rollNo: `TEST-S${sem}-${String(i).padStart(2, '0')}`,
      name: `Test Student ${sem}.${i}`,
      semester: sem,
      batch: null
    });
  }
  return out;
}

/* ---------- Default data: one dataset per semester ---------- */
const DEFAULT_DATA = {
  1: { students: defaultStudentsFor(1), timetable: clone(DEFAULT_TIMETABLE) },
  3: { students: defaultStudentsFor(3), timetable: clone(DEFAULT_TIMETABLE) },
  5: { students: defaultStudentsFor(5), timetable: clone(DEFAULT_TIMETABLE) }
};

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'attendance_system_v2';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const persisted = loadPersisted();
const DATA = persisted && persisted.data ? persisted.data : clone(DEFAULT_DATA);
const RECORDS = persisted && Array.isArray(persisted.records) ? persisted.records : [];

// Ensure any missing semester keys exist (e.g. upgrading storage)
SEMESTERS.forEach(s => {
  if (!DATA[s]) DATA[s] = clone(DEFAULT_DATA[s]);
});

function saveAll() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: DATA, records: RECORDS })); } catch {}
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = clone(DEFAULT_DATA);
  SEMESTERS.forEach(s => { DATA[s] = fresh[s]; });
  RECORDS.length = 0;
  buildPlaceholderRecords();
  saveAll();
}

const studentsOf  = sem => DATA[sem].students;
const timetableOf = sem => DATA[sem].timetable;

/* ---------- Placeholder attendance records ----------
   These are only for demonstration. Real data will come from Excel later.
   Each record: { rollNo, date, slot, status: 'P' | 'A' }
*/
function buildPlaceholderRecords() {
  if (!IS_PLACEHOLDER_DATA) return;
  const wdNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const seedDates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];
  seedDates.forEach((date, di) => {
    const wd = wdNames[new Date(date + 'T00:00:00').getDay()];
    SEMESTERS.forEach(sem => {
      const slots = (DATA[sem].timetable[wd] || []);
      const studs = DATA[sem].students;
      slots.forEach((slot, si) => {
        studs.forEach((st, i) => {
          const status = ((di + si + i) % 4 === 0) ? 'A' : 'P';
          RECORDS.push({ rollNo: st.rollNo, date, slot: slot.slot, status });
        });
      });
    });
  });
}

// Only generate placeholder records on first run (when nothing persisted yet)
if (!persisted) {
  buildPlaceholderRecords();
  saveAll();
}