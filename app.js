(() => {
  'use strict';

  const KEY = 'pd-training-log-v1';
  const DAY = 86400000;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const fromKey = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const shiftDate = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12);
  const today = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12);
  const dateFormat = (date, options = { weekday: 'long', month: 'long', day: 'numeric' }) => date.toLocaleDateString(undefined, options);
  const idFor = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `exercise-${Math.random().toString(36).slice(2, 8)}`;

  function cleanRoutine(raw, allowEmpty = false) {
    if (!raw || !Array.isArray(raw.workouts) || (!allowEmpty && !raw.workouts.length)) throw new Error('Your routine needs a non-empty workouts list.');
    const workouts = raw.workouts.map((w, wi) => {
      if (!w || !String(w.name || '').trim()) throw new Error(`Workout ${wi + 1} needs a name.`);
      const id = idFor(w.id || w.name);
      const exercises = (Array.isArray(w.exercises) ? w.exercises : []).map((e, ei) => {
        if (!e || !String(e.name || '').trim()) throw new Error(`An exercise in ${w.name} needs a name.`);
        return { id: idFor(e.id || `${id}-${e.name}-${ei}`), name: String(e.name).trim(), sets: Math.max(1, Math.min(20, Number.parseInt(e.sets, 10) || 3)), reps: String(e.reps || '8–12'), rest: String(e.rest || '') };
      });
      return { id, name: String(w.name).trim(), focus: String(w.focus || ''), exercises };
    });
    const ids = new Set(workouts.map(w => w.id));
    const schedule = {};
    for (let d = 0; d < 7; d++) {
      const value = raw.schedule?.[d] ?? raw.schedule?.[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d]] ?? 'rest';
      schedule[d] = value === 'rest' || value === null || value === '' ? 'rest' : idFor(value);
      if (schedule[d] !== 'rest' && !ids.has(schedule[d])) throw new Error(`Schedule day ${d} points to “${value}”, which is not a workout id.`);
    }
    return { name: String(raw.name || 'My training plan'), schedule, workouts };
  }

  function freshState() { return { version: 1, routine: { name: 'No routine loaded', schedule: { 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' }, workouts: [] }, entries: {}, settings: { unit: 'lb', hasImportedRoutine: false }, exerciseSettings: {} }; }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved?.version === 1 && saved.entries && saved.routine) return { ...freshState(), ...saved, routine: cleanRoutine(saved.routine, true), settings: { unit: 'lb', hasImportedRoutine: false, ...(saved.settings || {}) }, exerciseSettings: saved.exerciseSettings || {} };
    } catch (err) { console.warn('Could not load workout data:', err); }
    return freshState();
  }

  let state = loadState();
  let selectedDate = today();
  let modalQueue = [];
  let toastTimer;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save. Device storage may be full.', true); } };
  const entryAt = key => state.entries[key] || null;
  const workoutFor = date => { const override = entryAt(dateKey(date))?.workoutId; const id = override || state.routine.schedule[date.getDay()]; return id && id !== 'rest' ? state.routine.workouts.find(w => w.id === id) || null : null; };
  const exerciseConfig = exercise => state.exerciseSettings[exercise.id] || { sets: exercise.sets, reps: exercise.reps };
  const entryFor = (date, workout) => {
    const key = dateKey(date);
    if (!state.entries[key]) state.entries[key] = { date: key, workoutId: workout?.id || null, name: workout?.name || 'Training', status: 'inprogress', exercises: {} };
    return state.entries[key];
  };
  const isCounted = entry => entry && ['done', 'sick'].includes(entry.status);
  function streakCount() {
    let cursor = today();
    if (!isCounted(entryAt(dateKey(cursor)))) cursor = shiftDate(cursor, -1);
    let count = 0;
    while (isCounted(entryAt(dateKey(cursor)))) { count++; cursor = shiftDate(cursor, -1); }
    return count;
  }
  function recentDays() { const t = today(); return Array.from({ length: 27 }, (_, i) => shiftDate(t, i - 26)); }
  function metrics() {
    const days = recentDays(); const done = days.filter(d => entryAt(dateKey(d))?.status === 'done').length;
    return { done, percent: Math.round(done / 27 * 100), sick: days.filter(d => entryAt(dateKey(d))?.status === 'sick').length };
  }
  function toast(message, warn = false) {
    const el = $('#toast'); el.textContent = message; el.classList.toggle('warning', warn); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function showPage(name) {
    $$('.page').forEach(p => p.classList.toggle('active', p.id === `${name}Page`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    if (name === 'workout') renderWorkout();
    if (name === 'progress') renderProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderDayGrid(container, large = false) {
    const t = today();
    container.innerHTML = recentDays().map(d => {
      const e = entryAt(dateKey(d)); const status = e?.status === 'done' ? 'done' : e?.status === 'sick' ? 'sick' : '';
      const label = `${dateFormat(d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${status === 'done' ? 'Workout completed' : status === 'sick' ? 'Sick day' : 'No workout logged'}`;
      return `<div class="day-cell ${status} ${dateKey(d) === dateKey(t) ? 'today' : ''}" data-tip="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></div>`;
    }).join('');
    container.classList.toggle('large-grid', large);
  }
  function renderHome() {
    const t = today(), workout = workoutFor(t), m = metrics();
    $('#todayDate').textContent = dateFormat(t, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    $('#todayWeekday').textContent = dateFormat(t, { weekday: 'long' }).toUpperCase();
    $('#streakCount').textContent = streakCount();
    const noPlan = state.routine.workouts.length === 0;
    $('#todayWorkoutName').textContent = workout?.name || (noPlan ? 'No workout loaded' : 'Rest day');
    $('#todayWorkoutMeta').textContent = workout ? `${workout.focus || `${workout.exercises.length} exercises`} · ${workout.exercises.length} exercises` : noPlan ? 'Import your plan to see what you’re training today.' : 'A little recovery goes a long way.';
    $('#todayLetter').textContent = workout ? workout.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2) : '✳';
    $('#startTodayButton').innerHTML = noPlan ? 'Import a workout plan <span aria-hidden="true">↗</span>' : workout ? 'View today’s workout <span aria-hidden="true">↗</span>' : 'See your workout plan <span aria-hidden="true">↗</span>';
    $('#daysCount').textContent = m.done; $('#consistencyPercent').textContent = `${m.percent}%`;
    $('#consistencyNote').textContent = m.done ? `${m.sick ? `${m.sick} sick day${m.sick === 1 ? '' : 's'} · ` : ''}keep building on it.` : 'Every day is a fresh start.';
    renderDayGrid($('#homeDayGrid'));
    const rows = Object.values(state.entries).filter(e => ['done', 'sick'].includes(e.status)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    $('#recentSessions').innerHTML = rows.length ? rows.map(sessionMarkup).join('') : '<div class="empty-state">Your first session is waiting for you.</div>';
    $('#setupCallout').style.display = state.settings.hasImportedRoutine ? 'none' : 'flex';
  }
  function sessionMarkup(e) {
    const sick = e.status === 'sick';
    return `<div class="session-row"><div class="session-mark">${sick ? '＋' : '↗'}</div><div class="session-info"><strong>${escapeHtml(sick ? 'Sick day' : e.name)}</strong><span>${sick ? 'Recovery counts too' : `${Object.keys(e.exercises || {}).length} exercises logged`}</span></div><div class="session-date"><span class="session-status ${sick ? 'sick-text' : ''}">${sick ? 'REST' : 'COMPLETE'}</span><br>${escapeHtml(dateFormat(fromKey(e.date), { month: 'short', day: 'numeric' }))}</div></div>`;
  }
  function renderWorkout() {
    const d = selectedDate, key = dateKey(d), workout = workoutFor(d), e = entryAt(key);
    $('#workoutDateLabel').textContent = dateFormat(d, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#workoutDateButton').innerHTML = key === dateKey(today()) ? 'Today <span>⌄</span>' : `${escapeHtml(dateFormat(d, { month: 'short', day: 'numeric' }))} <span>⌄</span>`;
    const sickButton = $('#sickButton'); sickButton.textContent = e?.status === 'sick' ? 'Undo sick day' : 'Mark sick'; $('#workoutPage .sick-card').classList.toggle('marked', e?.status === 'sick');
    if (!workout) {
      const plan = state.routine.workouts.map(w => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join('');
      $('#workoutContent').innerHTML = `<div class="no-workout"><strong>${e?.status === 'sick' ? 'Rest and feel better.' : state.routine.workouts.length ? 'A recovery day.' : 'No workout plan loaded yet.'}</strong>${e?.status === 'sick' ? 'You marked this day sick, so your streak stays intact.' : state.routine.workouts.length ? 'Your schedule has no workout assigned for this day.' : 'Import your gym routine to add workouts and a weekly schedule.'}${state.routine.workouts.length ? `<div style="margin-top:14px"><label class="form-label" for="assignWorkout">Start a different workout today</label><select class="form-select" id="assignWorkout"><option value="">Choose a workout</option>${plan}</select></div>` : '<div style="margin-top:14px"><button class="button button-outline button-small" id="emptyRoutineImport">＋ Import routine JSON</button></div>'}</div>`;
      $('#emptyRoutineImport')?.addEventListener('click', () => $('#routineFile').click());
      $('#assignWorkout')?.addEventListener('change', ev => { if (!ev.target.value) return; const w = state.routine.workouts.find(x => x.id === ev.target.value); state.entries[key] = { date: key, workoutId: w.id, name: w.name, status: 'inprogress', exercises: {} }; save(); renderWorkout(); toast(`${w.name} ready for ${dateFormat(d, { weekday: 'long' })}.`); });
      return;
    }
    const entry = e || { status: 'inprogress', exercises: {} };
    const totalSets = workout.exercises.reduce((sum, ex) => sum + Number(exerciseConfig(ex).sets), 0);
    const doneSets = workout.exercises.reduce((sum, ex) => sum + (entry.exercises?.[ex.id]?.setsDone || []).filter(Boolean).length, 0);
    const doneExercises = workout.exercises.filter(ex => entry.exercises?.[ex.id]?.completed).length;
    $('#workoutContent').innerHTML = `<div class="workout-hero"><div><p class="eyebrow">${escapeHtml(dateFormat(d, { weekday: 'long' }).toUpperCase())} · ${workout.exercises.length} EXERCISES</p><h2>${escapeHtml(workout.name)}</h2><p>${escapeHtml(workout.focus || 'One set at a time.')}</p></div><div class="workout-progress"><strong>${doneSets}<span style="font-size:13px;color:#8c8f97">/${totalSets}</span></strong><span>SETS DONE</span></div></div><div class="progress-track"><span style="width:${totalSets ? Math.round(doneSets / totalSets * 100) : 0}%"></span></div><div class="exercise-list" style="margin-top:15px">${workout.exercises.map((ex, i) => exerciseMarkup(ex, i, entry)).join('')}</div><div class="workout-footer"><span class="workout-footer-note">${doneExercises} of ${workout.exercises.length} exercises completed</span><button class="button button-light complete-workout" id="completeWorkoutButton" ${entry.status === 'done' ? 'disabled' : ''}>${entry.status === 'done' ? 'Workout complete ✓' : 'Complete workout'} <span>↗</span></button></div>`;
    $$('.set-chip', $('#workoutContent')).forEach(btn => btn.addEventListener('click', () => toggleSet(btn.dataset.exercise, Number(btn.dataset.set))));
    $$('.exercise-complete', $('#workoutContent')).forEach(btn => btn.addEventListener('click', () => completeExercise(btn.dataset.exercise)));
    $$('.edit-exercise', $('#workoutContent')).forEach(btn => btn.addEventListener('click', () => openExerciseModal(btn.dataset.exercise, false)));
    $$('.log-weight', $('#workoutContent')).forEach(btn => btn.addEventListener('click', () => openExerciseModal(btn.dataset.exercise, true)));
    $('#completeWorkoutButton')?.addEventListener('click', completeWorkout);
  }
  function exerciseMarkup(ex, index, entry) {
    const cfg = exerciseConfig(ex), info = entry.exercises?.[ex.id] || {}, done = info.completed;
    const n = Math.max(1, Number(cfg.sets) || 1), checks = info.setsDone || [];
    return `<article class="exercise-card ${done ? 'exercise-done' : ''}"><div class="exercise-top"><div class="exercise-icon">${String(index + 1).padStart(2, '0')}</div><div class="exercise-name"><strong>${escapeHtml(ex.name)}</strong><span>${n} sets · ${escapeHtml(cfg.reps)} reps${ex.rest ? ` · ${escapeHtml(ex.rest)} rest` : ''}${info.weight != null ? ` · ${escapeHtml(info.weight)} ${escapeHtml(state.settings.unit)}` : ''}</span></div><button class="exercise-complete ${done ? 'checked' : ''}" data-exercise="${escapeHtml(ex.id)}" aria-label="${done ? 'Edit' : 'Complete'} ${escapeHtml(ex.name)}">✓</button></div><div class="set-row"><span class="set-label">SETS</span>${Array.from({ length: n }, (_, i) => `<button class="set-chip ${checks[i] ? 'checked' : ''}" data-exercise="${escapeHtml(ex.id)}" data-set="${i}" aria-label="Set ${i + 1}, ${checks[i] ? 'completed' : 'not completed'}"><span>${checks[i] ? '✓' : pad(i + 1)}</span>${escapeHtml(cfg.reps)} reps</button>`).join('')}</div><div class="exercise-actions">${info.weight != null ? `<button class="log-weight weight-logged" data-exercise="${escapeHtml(ex.id)}">Logged ${escapeHtml(info.weight)} ${escapeHtml(state.settings.unit)} · edit</button>` : `<button class="log-weight" data-exercise="${escapeHtml(ex.id)}">＋ Log weight</button>`}<button class="edit-exercise" data-exercise="${escapeHtml(ex.id)}">Adjust sets / reps</button></div></article>`;
  }
  function toggleSet(exerciseId, index) {
    const workout = workoutFor(selectedDate); if (!workout) return;
    const ex = workout.exercises.find(x => x.id === exerciseId); if (!ex) return;
    const entry = entryFor(selectedDate, workout); if (entry.status === 'done') entry.status = 'inprogress';
    const item = entry.exercises[exerciseId] ||= { setsDone: [], completed: false };
    item.setsDone ||= []; item.setsDone[index] = !item.setsDone[index];
    const count = Number(exerciseConfig(ex).sets);
    if (item.setsDone.slice(0, count).filter(Boolean).length === count && !item.completed) {
      item.completed = true; save(); renderWorkout(); openExerciseModal(exerciseId, true, true); return;
    }
    save(); renderWorkout();
  }
  function completeExercise(exerciseId) {
    const workout = workoutFor(selectedDate); if (!workout) return;
    const ex = workout.exercises.find(x => x.id === exerciseId); const entry = entryFor(selectedDate, workout);
    if (entry.status === 'done') entry.status = 'inprogress';
    const item = entry.exercises[exerciseId] ||= { setsDone: [], completed: false };
    item.completed = true;
    const n = Number(exerciseConfig(ex).sets); item.setsDone = Array.from({ length: n }, (_, i) => item.setsDone?.[i] || true);
    save(); renderWorkout(); openExerciseModal(exerciseId, true, true);
  }
  function openExerciseModal(exerciseId, weightFirst = true, fromComplete = false, onSave = null) {
    const workout = workoutFor(selectedDate), ex = workout?.exercises.find(x => x.id === exerciseId); if (!ex) return;
    const entry = entryAt(dateKey(selectedDate)); const info = entry?.exercises?.[exerciseId] || {};
    const cfg = exerciseConfig(ex), heading = weightFirst ? `Log ${ex.name}` : `Adjust ${ex.name}`;
    openModal(`<p class="eyebrow">${escapeHtml(workout.name.toUpperCase())}</p><h2 id="modalTitle">${escapeHtml(heading)}</h2><p class="modal-description">Record what you lifted and update the plan if you need to.</p><label class="form-label" for="weightInput">WEIGHT USED (${escapeHtml(state.settings.unit.toUpperCase())})</label><input id="weightInput" class="form-input" type="number" min="0" step="0.5" placeholder="e.g. 25" value="${info.weight == null ? '' : escapeHtml(info.weight)}"><div class="form-row"><div><label class="form-label" for="setsInput">SETS</label><input id="setsInput" class="form-input" type="number" min="1" max="20" value="${escapeHtml(cfg.sets)}"></div><div><label class="form-label" for="repsInput">REPS</label><input id="repsInput" class="form-input" type="text" maxlength="20" value="${escapeHtml(cfg.reps)}"></div></div><p class="modal-note">Your set checkoffs stay with this session. Changes update future workouts too.</p><div class="modal-actions"><button class="button button-outline" id="exerciseCancel">${fromComplete ? 'Skip for now' : 'Cancel'}</button><button class="button button-light" id="exerciseSave">Save exercise</button></div>`);
    $('#exerciseCancel').onclick = () => { closeModal(); if (onSave) onSave(null); };
    $('#exerciseSave').onclick = () => {
      const weightRaw = $('#weightInput').value.trim(), weight = weightRaw === '' ? null : Number(weightRaw), sets = Math.max(1, Math.min(20, Number.parseInt($('#setsInput').value, 10) || cfg.sets)), reps = $('#repsInput').value.trim() || cfg.reps;
      if (weight !== null && (!Number.isFinite(weight) || weight < 0)) { toast('Enter a valid weight.', true); return; }
      state.exerciseSettings[ex.id] = { sets, reps };
      const item = entryFor(selectedDate, workout).exercises[ex.id] ||= { setsDone: [], completed: false };
      if (weight !== null) item.weight = weight;
      item.setsDone = Array.from({ length: sets }, (_, i) => item.setsDone?.[i] || (item.completed ? true : false));
      item.completed = item.completed || fromComplete;
      save(); closeModal(); renderWorkout(); if (onSave) onSave({ weight, sets, reps });
    };
    $('#weightInput').focus();
  }
  function completeWorkout() {
    const workout = workoutFor(selectedDate); if (!workout) return;
    const entry = entryFor(selectedDate, workout);
    const pending = workout.exercises.filter(ex => entry.exercises?.[ex.id]?.weight == null);
    if (!pending.length) { entry.status = 'done'; save(); renderAll(); toast('Workout complete. Nice work.'); return; }
    modalQueue = pending.slice();
    const next = () => {
      if (!modalQueue.length) { const current = entryAt(dateKey(selectedDate)); current.status = 'done'; save(); renderAll(); toast('Workout complete. Nice work.'); return; }
      const ex = modalQueue.shift(); entry.exercises[ex.id] ||= { setsDone: [], completed: true };
      entry.exercises[ex.id].completed = true;
      const n = Number(exerciseConfig(ex).sets); entry.exercises[ex.id].setsDone = Array.from({ length: n }, () => true);
      openExerciseModal(ex.id, true, true, next);
    };
    next();
  }
  function markSick() {
    const key = dateKey(selectedDate), existing = entryAt(key);
    if (existing?.status === 'sick') { if (existing.statusBeforeSick) { existing.status = existing.statusBeforeSick; delete existing.statusBeforeSick; } else delete state.entries[key]; save(); renderAll(); toast('Sick day removed.'); return; }
    const workout = workoutFor(selectedDate);
    state.entries[key] = { date: key, workoutId: workout?.id || null, name: workout?.name || 'Recovery', status: 'sick', statusBeforeSick: existing?.status || null, exercises: existing?.exercises || {} };
    save(); renderAll(); toast('Rest up. Your streak is safe.');
  }
  function allLoggedExercises() {
    const names = new Map();
    for (const e of Object.values(state.entries)) for (const [id, x] of Object.entries(e.exercises || {})) if (x.weight != null) {
      const exercise = state.routine.workouts.flatMap(w => w.exercises).find(ex => ex.id === id);
      if (exercise) names.set(id, exercise.name);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function renderChart() {
    const select = $('#exerciseSelect'), options = allLoggedExercises(), previous = select.value;
    select.innerHTML = options.length ? options.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('') : '<option value="">No weight history yet</option>';
    if (options.some(([id]) => id === previous)) select.value = previous;
    const id = select.value, records = id ? Object.values(state.entries).map(entry => ({ date: entry.date, weight: entry.exercises?.[id]?.weight })).filter(r => r.weight != null).sort((a, b) => a.date.localeCompare(b.date)) : [];
    const canvas = $('#weightChart'), empty = $('#chartEmpty'), ctx = canvas.getContext('2d'), rect = canvas.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width, height = rect.height; ctx.clearRect(0, 0, width, height);
    if (!records.length) { empty.classList.add('visible'); $('#chartSummary').textContent = ''; return; }
    empty.classList.remove('visible'); const padL = 35, padR = 12, padT = 18, padB = 28;
    const vals = records.map(r => Number(r.weight)), min = Math.min(...vals), max = Math.max(...vals), span = max - min || Math.max(1, max * .15), low = Math.max(0, min - span * .22), high = max + span * .22;
    const x = i => records.length === 1 ? (width - padL - padR) / 2 + padL : padL + i * (width - padL - padR) / (records.length - 1);
    const y = val => padT + (high - val) / (high - low) * (height - padT - padB);
    ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) { const val = high - i * (high - low) / 3, yy = y(val); ctx.strokeStyle = '#282a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(width - padR, yy); ctx.stroke(); ctx.fillStyle = '#777b83'; ctx.fillText(Number.isInteger(val) ? val : val.toFixed(1), padL - 7, yy); }
    const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, '#c9a7ff'); gradient.addColorStop(1, '#79d9ee');
    if (records.length > 1) { ctx.beginPath(); records.forEach((r, i) => i ? ctx.lineTo(x(i), y(Number(r.weight))) : ctx.moveTo(x(i), y(Number(r.weight)))); ctx.strokeStyle = gradient; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
    records.forEach((r, i) => { ctx.beginPath(); ctx.arc(x(i), y(Number(r.weight)), 3.3, 0, Math.PI * 2); ctx.fillStyle = '#141519'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = i === records.length - 1 ? '#8ce0e9' : '#c4acfa'; ctx.stroke(); });
    [0, records.length - 1].filter((v, i, a) => a.indexOf(v) === i).forEach(i => { ctx.fillStyle = '#858991'; ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.textBaseline = 'top'; ctx.fillText(dateFormat(fromKey(records[i].date), { month: 'short', day: 'numeric' }), x(i), height - padB + 11); });
    const change = Number(records.at(-1).weight) - Number(records[0].weight), sign = change > 0 ? '+' : '';
    $('#chartSummary').innerHTML = `<strong>${escapeHtml(records.at(-1).weight)} ${escapeHtml(state.settings.unit)}</strong><br>${records.length} entries · ${sign}${change} ${escapeHtml(state.settings.unit)} overall`;
  }
  function renderProgress() {
    const m = metrics(); $('#progressStreak').textContent = streakCount(); $('#progressDaysCount').textContent = m.done; $('#progressConsistency').textContent = `${m.percent}%`;
    renderDayGrid($('#progressDayGrid'), true); renderChart();
    const rows = Object.values(state.entries).filter(e => ['done', 'sick'].includes(e.status)).sort((a, b) => b.date.localeCompare(a.date));
    $('#sessionHistory').innerHTML = rows.length ? rows.map(sessionMarkup).join('') : '<div class="empty-state">No sessions yet. Your progress will show up here.</div>';
  }
  function renderAll() { renderHome(); if ($('#workoutPage').classList.contains('active')) renderWorkout(); if ($('#progressPage').classList.contains('active')) renderProgress(); }
  function openModal(html) { $('#modalContent').innerHTML = html; $('#modalBackdrop').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { $('#modalBackdrop').hidden = true; document.body.style.overflow = ''; }
  function openDateModal() {
    openModal(`<p class="eyebrow">CHOOSE A DATE</p><h2 id="modalTitle">Browse your training days</h2><p class="modal-description">Look back at past workouts or jump to today.</p><div class="date-nav"><button id="datePrevious" aria-label="Previous day">←</button><strong id="dateNavLabel">${escapeHtml(dateFormat(selectedDate))}</strong><button id="dateNext" aria-label="Next day" ${dateKey(selectedDate) >= dateKey(today()) ? 'disabled' : ''}>→</button><button id="dateToday">Today</button></div><div class="modal-actions"><button class="button button-light" id="dateDone">Done</button></div>`);
    const update = () => { $('#dateNavLabel').textContent = dateFormat(selectedDate); $('#dateNext').disabled = dateKey(selectedDate) >= dateKey(today()); };
    $('#datePrevious').onclick = () => { selectedDate = shiftDate(selectedDate, -1); update(); renderWorkout(); };
    $('#dateNext').onclick = () => { if (dateKey(selectedDate) < dateKey(today())) selectedDate = shiftDate(selectedDate, 1); update(); renderWorkout(); };
    $('#dateToday').onclick = () => { selectedDate = today(); update(); renderWorkout(); };
    $('#dateDone').onclick = closeModal;
  }
  function openSettings() {
    openModal(`<p class="eyebrow">YOUR TRAINING LOG</p><h2 id="modalTitle">Settings</h2><p class="modal-description">Your workout data lives in this browser on this device.</p><div class="setting-item"><span>Routine</span><span>${escapeHtml(state.routine.name)}</span></div><div class="setting-item"><span>Weight unit</span><select id="unitSelect" class="form-select" style="width:80px;padding:6px"><option value="lb" ${state.settings.unit === 'lb' ? 'selected' : ''}>lb</option><option value="kg" ${state.settings.unit === 'kg' ? 'selected' : ''}>kg</option></select></div><div class="modal-section"><button class="button button-outline" id="settingsExport">↓ Export backup</button> <button class="button button-outline" id="settingsRoutine">＋ Import routine</button></div><div class="modal-section"><button class="text-button" id="resetDataButton" style="color:#d99b9b">Reset workout data</button></div>`);
    $('#unitSelect').onchange = ev => { state.settings.unit = ev.target.value; save(); renderAll(); toast(`Weight unit set to ${ev.target.value}.`); };
    $('#settingsExport').onclick = exportBackup; $('#settingsRoutine').onclick = () => $('#routineFile').click();
    $('#resetDataButton').onclick = () => { if (confirm('Delete all workout history and restore the starter plan? This cannot be undone.')) { state = freshState(); save(); closeModal(); renderAll(); toast('Workout data reset.'); } };
  }
  function exportBackup() {
    const backup = { ...state, exportedAt: new Date().toISOString(), app: 'pD Training Log' };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `pd-training-backup-${dateKey(today())}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast('Backup exported to your device.');
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text()), raw = data.state || data;
      if (!raw || !raw.entries || !raw.routine) throw new Error('This file does not look like a pD backup.');
      const routine = cleanRoutine(raw.routine, true), entries = {};
      for (const [key, value] of Object.entries(raw.entries)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || !['done', 'sick', 'inprogress'].includes(value.status)) continue;
        entries[key] = { date: key, workoutId: value.workoutId || null, name: String(value.name || 'Training'), status: value.status, exercises: value.exercises && typeof value.exercises === 'object' ? value.exercises : {} };
      }
      const replacement = { version: 1, routine, entries, settings: { unit: raw.settings?.unit === 'kg' ? 'kg' : 'lb', hasImportedRoutine: Boolean(raw.settings?.hasImportedRoutine) }, exerciseSettings: raw.exerciseSettings || {} };
      if (!confirm(`Import this backup and replace the current log? It contains ${Object.keys(entries).length} saved days.`)) return;
      state = replacement; save(); renderAll(); toast('Backup imported. Your log is restored.');
    } catch (err) { toast(err.message || 'Could not read this backup.', true); }
  }
  async function importRoutine(file) {
    try {
      const data = JSON.parse(await file.text()); const raw = data.routine || data; const routine = cleanRoutine(raw);
      if (!confirm(`Replace your current routine with “${routine.name}”? Your workout history will be kept.`)) return;
      state.routine = routine; state.exerciseSettings = {}; state.settings.hasImportedRoutine = true; save(); closeModal(); renderAll(); toast('Routine imported.');
    } catch (err) { toast(err.message || 'Could not read this routine.', true); }
  }

  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  $$('[data-nav="progress"]').forEach(btn => btn.addEventListener('click', () => showPage('progress')));
  $('#startTodayButton').addEventListener('click', () => { selectedDate = today(); showPage('workout'); });
  $('#sickButton').addEventListener('click', markSick);
  $('#workoutDateButton').addEventListener('click', openDateModal);
  $('#settingsButton').addEventListener('click', openSettings);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', ev => { if (ev.target === $('#modalBackdrop')) closeModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal(); });
  $('#exerciseSelect').addEventListener('change', renderChart);
  $('#exportButton').addEventListener('click', exportBackup);
  $('#importButton').addEventListener('click', () => $('#backupFile').click());
  $('#routineImportButton').addEventListener('click', () => $('#routineFile').click());
  $('#setupImportButton').addEventListener('click', () => $('#routineFile').click());
  $('#backupFile').addEventListener('change', async ev => { if (ev.target.files[0]) await importBackup(ev.target.files[0]); ev.target.value = ''; });
  $('#routineFile').addEventListener('change', async ev => { if (ev.target.files[0]) await importRoutine(ev.target.files[0]); ev.target.value = ''; });
  window.addEventListener('resize', () => { if ($('#progressPage').classList.contains('active')) renderChart(); });
  renderAll();
})();
