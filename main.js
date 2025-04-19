const overlay       = document.getElementById('overlay');
const banner        = document.getElementById('banner');
const authUI        = document.getElementById('auth-ui');
const trackerUI     = document.getElementById('tracker-ui');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const prevDay       = document.getElementById('prev-day');
const nextDay       = document.getElementById('next-day');
const dayLabel      = document.getElementById('day-label');
const workoutForm   = document.getElementById('workout-form');

const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const supabaseClient   = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const exMap = { GS:'Goblet Squat', PU:'Push-Up', DR:'Deadlift', RD:'Row', PL:'Plank' };
let currentDate = new Date().toISOString().slice(0, 10), savesInProgress = 0;
const saveTimers = {};

document.addEventListener('DOMContentLoaded', () => { applyTheme(); bindListeners(); initSession(); });

function bindListeners() {
  document.getElementById('login-form').addEventListener('submit', login);
  document.getElementById('logout').addEventListener('click', logout);
  prevDay.addEventListener('click', () => navigateDays(-1));
  nextDay.addEventListener('click', () => navigateDays(1));
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

async function initSession() {
  showOverlay('Checking session...');
  const { data:{ session }, error } = await supabaseClient.auth.getSession(); hideOverlay();
  if (error) { showBanner(error.message); showAuthUI(); return; }
  if (!session) { showAuthUI(); return; }
  window.user = session.user; showTrackerUI(); renderDay(currentDate);
}

async function login(e) { e.preventDefault(); showOverlay('Logging in...'); const { error } = await supabaseClient.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value }); hideOverlay(); if (error) { showBanner(error.message); return; } initSession(); }
async function logout() { await supabaseClient.auth.signOut(); window.user=null; currentDate = new Date().toISOString().slice(0, 10); showAuthUI(); }
function showAuthUI()    { authUI.classList.remove('hidden'); trackerUI.classList.add('hidden'); }
function showTrackerUI() { authUI.classList.add('hidden'); trackerUI.classList.remove('hidden'); }

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
}

async function renderDay(dateStr) {
  showOverlay('Loading...'); hideBanner();
  currentDate = dateStr;
  dayLabel.textContent = formatDateLabel(dateStr);
  disableNav(true);
  const { data, error } = await supabaseClient.from('workouts').select('*').eq('user_id', window.user.id).eq('date', dateStr);
  if (error) showBanner(error.message);
  workoutForm.innerHTML = '';
  ['GS','PU','DR','RD','PL'].forEach(ex => {
    const block = document.createElement('div'); block.classList.add('exercise-block');
    const title = document.createElement('div'); title.classList.add('exercise-title'); title.textContent = exMap[ex] || ex; block.appendChild(title);
    for (let s = 1; s <= 3; s++) {
      const rec = data?.find(r => r.exercise_id === ex && r.set_num === s) || {};
      const row = document.createElement('div'); row.classList.add('set-row');
      ['reps','notes'].forEach(field => {
        const el = field === 'notes' ? document.createElement('textarea') : document.createElement('input');
        if (field !== 'notes') { el.type = 'number'; el.placeholder = field.charAt(0).toUpperCase() + field.slice(1); }
        else { el.placeholder = 'Notes'; }
        el.value = rec[field] || '';
        if (el.value) el.classList.add('filled');
        el.dataset.exercise = ex; el.dataset.set = s; el.dataset.field = field;
        el.addEventListener('input', onInput);
        row.appendChild(el);
      });
      if (!['PU', 'PL'].includes(ex)) {
        const wtEl = document.createElement('input');
        wtEl.type = 'number';
        wtEl.placeholder = 'Weight';
        wtEl.value = rec['weight'] || '';
        if (wtEl.value) wtEl.classList.add('filled');
        wtEl.dataset.exercise = ex; wtEl.dataset.set = s; wtEl.dataset.field = 'weight';
        wtEl.addEventListener('input', onInput);
        row.insertBefore(wtEl, row.children[1]);
      }
      block.appendChild(row);
    }
    workoutForm.appendChild(block);
  });
  disableNav(false);
  hideOverlay();
}

function navigateDays(offset) {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + offset);
  renderDay(d.toISOString().slice(0, 10));
}

function onInput(e) {
  if (savesInProgress > 0) return;
  const el = e.target;
  if (el.value) el.classList.add('filled'); else el.classList.remove('filled');
  markDirty(el);
  const key = `${el.dataset.exercise}-${el.dataset.set}`;
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => saveSet(el.dataset.exercise, el.dataset.set), 1200);
}

async function saveSet(ex, s) {
  savesInProgress++; updateSavingState();
  const repsEl = document.querySelector(`input[data-exercise="${ex}"][data-set="${s}"][data-field="reps"]`);
  const wtEl = document.querySelector(`input[data-exercise="${ex}"][data-set="${s}"][data-field="weight"]`);
  const notesEl = document.querySelector(`textarea[data-exercise="${ex}"][data-set="${s}"][data-field="notes"]`);
  const payload = {
    date: currentDate,
    exercise_id: ex,
    set_num: s,
    reps: repsEl.value ? parseInt(repsEl.value) : null,
    weight: wtEl ? (wtEl.value ? parseFloat(wtEl.value) : null) : null,
    notes: notesEl.value || null
  };
  markSaving(ex, s);
  const { error } = await supabaseClient.from('workouts').upsert(payload, { onConflict: ['user_id','date','exercise_id','set_num'] });
  if (error) { showBanner(`Save failed: ${error.message}`); markError(ex, s); } else { markSaved(ex, s); }
  savesInProgress--; updateSavingState();
}

function markDirty(el) { el.classList.remove('saving','saved'); el.classList.add('dirty'); }
function markSaving(ex,s) { document.querySelectorAll(`[data-exercise="${ex}"][data-set="${s}"]`).forEach(el=>{ el.classList.remove('dirty','saved'); el.classList.add('saving'); }); }
function markSaved(ex,s) { document.querySelectorAll(`[data-exercise="${ex}"][data-set="${s}"]`).forEach(el=>{ el.classList.remove('dirty','saving'); el.classList.add('saved'); }); }
function markError(ex,s) { document.querySelectorAll(`[data-exercise="${ex}"][data-set="${s}"]`).forEach(el=>{ el.classList.remove('saving','saved'); el.classList.add('dirty'); }); }

function updateSavingState() { const busy = savesInProgress > 0; disableNav(busy); document.querySelectorAll('#workout-form input,#workout-form textarea').forEach(el => el.disabled = busy); if (busy) showOverlay('Saving...'); else hideOverlay(); }
function disableNav(val) { prevDay.disabled = val; nextDay.disabled = val; }
function showOverlay(msg) { overlay.textContent = msg; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }
function showBanner(msg) { banner.textContent = msg; banner.classList.add('show'); }
function hideBanner() { banner.classList.remove('show'); }
function applyTheme() { const saved = localStorage.getItem('tracker-theme'); const sys = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', saved || sys); }
function toggleTheme() { const curr = document.documentElement.getAttribute('data-theme'); const next = curr === 'dark' ? 'light' : 'dark'; localStorage.setItem('tracker-theme', next); applyTheme(); }
