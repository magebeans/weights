// --- Constants ---
const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const EXERCISES = ['GS', 'PU', 'DR', 'RD', 'PL'];
const EXERCISE_MAP = { GS:'Goblet Squat', PU:'Push-Up', DR:'Deadlift', RD:'Row', PL:'Plank' };
const NUM_SETS = 3;
const SAVE_DEBOUNCE_MS = 1200;
const CSS_CLASSES = {
    HIDDEN: 'hidden',
    FILLED: 'filled',
    DIRTY: 'dirty',
    SAVING: 'saving',
    SAVED: 'saved',
    SHOW: 'show',
    EXERCISE_BLOCK: 'exercise-block',
    EXERCISE_TITLE: 'exercise-title',
    SET_ROW: 'set-row'
};
const DATA_ATTRS = {
    EXERCISE: 'data-exercise',
    SET: 'data-set',
    FIELD: 'data-field'
};

// --- DOM Elements ---
const overlay       = document.getElementById('overlay');
const banner        = document.getElementById('banner');
const authUI        = document.getElementById('auth-ui');
const trackerUI     = document.getElementById('tracker-ui');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const prevDay       = document.getElementById('prev-day');
const nextDay       = document.getElementById('next-day');
const goToTodayBtn  = document.getElementById('go-to-today');
const dayLabel      = document.getElementById('day-label');
const workoutForm   = document.getElementById('workout-form');
const loginForm     = document.getElementById('login-form');
const logoutBtn     = document.getElementById('logout');
const themeToggle   = document.getElementById('theme-toggle');

// --- State ---
let savesInProgress = 0;
let currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const saveTimers = {};
let supabaseClient; // Keep it mutable for init check

// --- Initialization ---
console.log('Starting app');
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!supabaseClient) {
        throw new Error('Supabase client could not be created');
    }
    console.log('Supabase client initialized');
    applyTheme();
    bindListeners();
    initSession();
} catch (e) {
    console.error('Init error:', e);
    showBanner(`Startup error: ${e.message || 'Unknown error'}`);
    // Optionally hide parts of the UI if init fails critically
    if (authUI) authUI.classList.add(CSS_CLASSES.HIDDEN);
    if (trackerUI) trackerUI.classList.add(CSS_CLASSES.HIDDEN);
}

// --- Event Binding ---
function bindListeners() {
    if (!loginForm || !logoutBtn || !prevDay || !nextDay || !goToTodayBtn || !themeToggle) {
        console.error('One or more essential elements not found for binding listeners.');
        showBanner('UI elements missing, app may not function correctly.');
        return;
    }
    loginForm.addEventListener('submit', login);
    logoutBtn.addEventListener('click', logout);
    prevDay.addEventListener('click', () => navigateDays(-1));
    nextDay.addEventListener('click', () => navigateDays(1));
    goToTodayBtn.addEventListener('click', goToToday);
    themeToggle.addEventListener('click', toggleTheme);
}

// --- Authentication & Session ---
async function initSession() {
    showOverlay('Checking session...');
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        hideOverlay();
        if (error) throw error;
        if (!session) {
            showAuthUI();
            return;
        }
        window.user = session.user;
        showTrackerUI();
        renderDay(currentDate);
    } catch (error) {
        hideOverlay();
        showBanner(`Session error: ${error.message}`);
        showAuthUI(); // Fallback to login screen on session error
    }
}

async function login(e) {
    e.preventDefault();
    showOverlay('Logging in...');
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput.value,
            password: passwordInput.value
        });
        hideOverlay();
        if (error) throw error;
        initSession(); // Re-initialize session to load user data and UI
    } catch (error) {
        hideOverlay();
        showBanner(`Login failed: ${error.message}`);
    }
}

async function logout() {
    showOverlay('Logging out...');
    try {
        await supabaseClient.auth.signOut();
        window.user = null;
        currentDate = new Date().toLocaleDateString('en-CA'); // Reset to today on logout
        showAuthUI();
    } catch (error) {
        showBanner(`Logout failed: ${error.message}`);
    } finally {
        hideOverlay();
    }
}

function showAuthUI() {
    if (authUI) authUI.classList.remove(CSS_CLASSES.HIDDEN);
    if (trackerUI) trackerUI.classList.add(CSS_CLASSES.HIDDEN);
    // Clear sensitive fields on showing auth UI
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
}

function showTrackerUI() {
    if (authUI) authUI.classList.add(CSS_CLASSES.HIDDEN);
    if (trackerUI) trackerUI.classList.remove(CSS_CLASSES.HIDDEN);
}

// --- Date Formatting & Display ---
function formatDateLabel(dateStr) {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        // Note: Months are 0-indexed in JS Date constructor
        const localDate = new Date(Date.UTC(y, m - 1, d)); // Use UTC to avoid timezone shifts affecting the date itself
        return localDate.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' // Specify UTC timezone for consistency
        });
    } catch (e) {
        console.error("Error formatting date:", dateStr, e);
        return "Invalid Date"; // Fallback display
    }
}

// --- Workout Rendering ---
async function renderDay(dateStr) {
    console.log('Rendering day: ' + dateStr);
    if (!window.user) {
        showBanner("Cannot render day: User not logged in.");
        showAuthUI();
        return;
    }
    showOverlay('Loading...');
    hideBanner();
    currentDate = dateStr;
    dayLabel.textContent = formatDateLabel(dateStr);
    disableNav(true);

    try {
        const { data, error } = await supabaseClient
            .from('workouts')
            .select('*')
            .eq('user_id', window.user.id)
            .eq('date', dateStr);

        if (error) throw error;

        workoutForm.innerHTML = ''; // Clear previous content

        EXERCISES.forEach(ex => {
            const block = document.createElement('div');
            block.classList.add(CSS_CLASSES.EXERCISE_BLOCK);

            const title = document.createElement('div');
            title.classList.add(CSS_CLASSES.EXERCISE_TITLE);
            title.textContent = EXERCISE_MAP[ex] || ex;
            block.appendChild(title);

            for (let s = 1; s <= NUM_SETS; s++) {
                const rec = data?.find(r => r.exercise_id === ex && r.set_num === s) || {};
                const row = document.createElement('div');
                row.classList.add(CSS_CLASSES.SET_ROW);

                // Define fields for this set row
                const fields = ['reps'];
                if (!['PU', 'PL'].includes(ex)) { // Add weight field if applicable
                    fields.push('weight');
                }
                fields.push('notes');

                fields.forEach(field => {
                    const el = createInputElement(field, ex, s, rec[field]);
                    row.appendChild(el);
                });

                block.appendChild(row);
            }
            workoutForm.appendChild(block);
        });
    } catch (error) {
        console.error("Error rendering day:", error);
        showBanner(`Failed to load workout data: ${error.message}`);
        workoutForm.innerHTML = '<p>Error loading data. Please try again.</p>'; // Show error in form area
    } finally {
        disableNav(false);
        hideOverlay();
    }
}

function createInputElement(field, exerciseId, setNum, value) {
    const isNotes = field === 'notes';
    const el = isNotes ? document.createElement('textarea') : document.createElement('input');

    if (!isNotes) {
        el.type = 'number';
        el.placeholder = field.charAt(0).toUpperCase() + field.slice(1);
    } else {
        el.placeholder = 'Notes';
        el.setAttribute('rows', '1'); // Keep textarea initially small
    }

    el.value = value || '';
    if (el.value) {
        el.classList.add(CSS_CLASSES.FILLED);
    }

    el.setAttribute(DATA_ATTRS.EXERCISE, exerciseId);
    el.setAttribute(DATA_ATTRS.SET, setNum);
    el.setAttribute(DATA_ATTRS.FIELD, field);

    el.addEventListener('input', onInput);

    return el;
}


// --- Navigation ---
async function navigateDays(offset) {
    console.log(`Navigating days with offset: ${offset}`);
    if (!window.user) {
        showBanner("Cannot navigate: User not logged in.");
        return;
    }
    showOverlay('Finding day...');
    disableNav(true);
    hideBanner();

    const isNext = offset > 0;
    const operator = isNext ? 'gt' : 'lt';
    const orderAscending = isNext;

    try {
        const { data, error } = await supabaseClient
            .from('workouts')
            .select('date')
            .eq('user_id', window.user.id)
            .filter('date', operator, currentDate)
            .order('date', { ascending: orderAscending })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            console.log(`Found day: ${data[0].date}`);
            renderDay(data[0].date); // This will hide overlay and enable nav on completion/error
        } else {
            console.log('No other day found with entries.');
            showBanner(`No ${isNext ? 'later' : 'earlier'} days with entries found.`);
            hideOverlay(); // Hide overlay as renderDay wasn't called
            disableNav(false); // Re-enable nav
        }
    } catch (error) {
        console.error('Error finding next/prev day:', error);
        showBanner(`Error finding day: ${error.message}`);
        hideOverlay();
        disableNav(false);
    }
}

function goToToday() {
    const todayDate = new Date().toLocaleDateString('en-CA');
    if (currentDate !== todayDate) {
        console.log('Going to today:', todayDate);
        renderDay(todayDate);
    } else {
        console.log('Already on today.');
    }
}

// --- Input Handling & Saving ---
function onInput(e) {
    const el = e.target;
    if (el.value) {
        el.classList.add(CSS_CLASSES.FILLED);
    } else {
        el.classList.remove(CSS_CLASSES.FILLED);
    }
    markDirty(el);

    const exercise = el.getAttribute(DATA_ATTRS.EXERCISE);
    const set = el.getAttribute(DATA_ATTRS.SET);
    const key = `${exercise}-${set}`;

    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => saveSet(exercise, set), SAVE_DEBOUNCE_MS);
}

async function saveSet(ex, s) {
    if (!window.user) {
        showBanner("Cannot save: User not logged in.");
        markError(ex, s); // Mark fields as dirty/error state
        return;
    }
    savesInProgress++;
    updateSavingState();
    markSaving(ex, s);

    // Helper to get value from a specific input in the set
    const getFieldValue = (field) => {
        const selector = `[${DATA_ATTRS.EXERCISE}="${ex}"][${DATA_ATTRS.SET}="${s}"][${DATA_ATTRS.FIELD}="${field}"]`;
        const element = workoutForm.querySelector(selector);
        return element ? element.value : null;
    };

    const repsVal = getFieldValue('reps');
    const weightVal = getFieldValue('weight'); // Will be null if weight field doesn't exist for this exercise
    const notesVal = getFieldValue('notes');

    const payload = {
        user_id: window.user.id, // Ensure user_id is included
        date: currentDate,
        exercise_id: ex,
        set_num: parseInt(s), // Ensure set_num is integer
        reps: repsVal ? parseInt(repsVal) : null,
        // Only include weight if it's relevant and has a value
        ...(weightVal !== null && { weight: weightVal ? parseFloat(weightVal) : null }),
        notes: notesVal || null
    };

    // Clean payload: remove null weight if not applicable (or handle in DB policy/trigger)
    if (payload.weight === undefined) {
        delete payload.weight;
    }

    console.log('Saving payload:', payload);

    try {
        const { error } = await supabaseClient
            .from('workouts')
            .upsert(payload, { onConflict: 'user_id,date,exercise_id,set_num' }); // Ensure correct onConflict columns

        if (error) throw error;

        console.log(`Saved ${ex} Set ${s}`);
        markSaved(ex, s);
    } catch (error) {
        console.error(`Save failed for ${ex} Set ${s}:`, error);
        showBanner(`Save failed: ${error.message}`);
        markError(ex, s);
    } finally {
        savesInProgress--;
        updateSavingState();
    }
}

function getSetElements(ex, s) {
    return workoutForm.querySelectorAll(`[${DATA_ATTRS.EXERCISE}="${ex}"][${DATA_ATTRS.SET}="${s}"]`);
}

function markDirty(el) {
    el.classList.remove(CSS_CLASSES.SAVING, CSS_CLASSES.SAVED);
    el.classList.add(CSS_CLASSES.DIRTY);
}
function markSaving(ex, s) {
    getSetElements(ex, s).forEach(el => {
        el.classList.remove(CSS_CLASSES.DIRTY, CSS_CLASSES.SAVED);
        el.classList.add(CSS_CLASSES.SAVING);
    });
}
function markSaved(ex, s) {
    getSetElements(ex, s).forEach(el => {
        el.classList.remove(CSS_CLASSES.DIRTY, CSS_CLASSES.SAVING);
        el.classList.add(CSS_CLASSES.SAVED);
    });
}
function markError(ex, s) {
    getSetElements(ex, s).forEach(el => {
        el.classList.remove(CSS_CLASSES.SAVING, CSS_CLASSES.SAVED);
        // Re-add dirty class to indicate save failed, needs attention
        el.classList.add(CSS_CLASSES.DIRTY);
    });
}

// --- UI State & Helpers ---
function updateSavingState() {
    const busy = savesInProgress > 0;
    disableNav(busy);
    // Only hide overlay when *all* saves are complete.
    // Avoids hiding overlay shown by navigation etc. prematurely.
    if (!busy) {
        hideOverlay();
    }
}

function disableNav(val) {
    if (prevDay) prevDay.disabled = val;
    if (nextDay) nextDay.disabled = val;
    if (goToTodayBtn) goToTodayBtn.disabled = val;
}

function showOverlay(msg) {
    if (!overlay) return;
    overlay.textContent = msg;
    overlay.classList.add(CSS_CLASSES.SHOW);
}

function hideOverlay() {
    if (!overlay) return;
    overlay.classList.remove(CSS_CLASSES.SHOW);
}

function showBanner(msg) {
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.add(CSS_CLASSES.SHOW);
    // Optional: Auto-hide banner after some time
    // setTimeout(hideBanner, 5000);
}

function hideBanner() {
    if (!banner) return;
    banner.classList.remove(CSS_CLASSES.SHOW);
}

// --- Theme ---
function applyTheme() {
    const savedTheme = localStorage.getItem('tracker-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaultTheme = prefersDark ? 'dark' : 'light';
    const themeToApply = savedTheme || defaultTheme;
    document.documentElement.setAttribute('data-theme', themeToApply);
    console.log(`Applied theme: ${themeToApply}`);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('tracker-theme', nextTheme);
    applyTheme();
}
