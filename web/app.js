/**
 * app.js
 * UI orchestration for the attendance parser front-end.
 * Handles: file upload → parse → review (with inline editing) → generate results.
 */

import { parseAttendanceFile } from './parser.js';
import { calculateEmployeeHours } from './calculator.js';

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {{ title: string, companyName: string, dateRange: string, employees: any[] } | null} */
let parsedData = null;
let originalHtml = null;
let originalFileName = 'attendance_fixed.htm';

// ─── DOM References ───────────────────────────────────────────────────────────

const uploadSection   = document.getElementById('upload-section');
const reviewSection   = document.getElementById('review-section');
const resultsSection  = document.getElementById('results-section');
const fileInput       = document.getElementById('file-input');
const dropZone        = document.getElementById('drop-zone');
const overtimeInput   = document.getElementById('overtime-threshold');
const duplicateInput  = document.getElementById('duplicate-threshold');
const reviewContainer = document.getElementById('review-container');
const reviewMeta      = document.getElementById('review-meta');
const issueBanner     = document.getElementById('issue-banner');
const generateBtn     = document.getElementById('generate-btn');
const resultsTable    = document.getElementById('results-table');
const resultsBody     = document.getElementById('results-body');
const backBtn         = document.getElementById('back-btn');
const changeFileBtn   = document.getElementById('change-file-btn');
const newFileBtn      = document.getElementById('new-file-btn');

// ─── Upload Handling ──────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

/**
 * Reads and parses the selected file, then shows the review screen.
 * @param {File} file
 */
async function processFile(file) {
  originalFileName = file.name;
  const buffer = await file.arrayBuffer();
  const dupThreshold = parseFloat(duplicateInput.value) || 10;
  try {
    originalHtml = new TextDecoder('big5').decode(buffer);
    parsedData = parseAttendanceFile(buffer, dupThreshold);
    renderReview(parsedData);
    showSection(reviewSection);
  } catch (err) {
    alert(`Failed to parse file: ${err.message ?? err}`);
  }
}

// ─── Review Rendering ─────────────────────────────────────────────────────────

/**
 * Renders the review screen for the parsed data.
 * @param {{ title: string, companyName: string, dateRange: string, employees: any[] }} data
 */
function renderReview(data) {
  reviewMeta.innerHTML = `
    <span class="meta-item"><strong>${escHtml(data.title)}</strong></span>
    <span class="meta-item">${escHtml(data.companyName)}</span>
    <span class="meta-item">${escHtml(data.dateRange)}</span>
  `;

  reviewContainer.innerHTML = '';
  let totalIssues = 0;

  data.employees.forEach((employee, empIdx) => {
    const issues = countIssues(employee.attendance);
    totalIssues += issues;

    const card = document.createElement('div');
    card.className = 'employee-card';
    card.innerHTML = `
      <div class="employee-header">
        <span class="employee-name">${escHtml(employee.name)}</span>
        ${issues > 0
          ? `<span class="issue-badge">${issues} issue${issues > 1 ? 's' : ''}</span>`
          : '<span class="ok-badge">✓ OK</span>'}
      </div>
      <div class="attendance-grid" id="grid-${empIdx}"></div>
    `;
    reviewContainer.appendChild(card);
    renderAttendanceGrid(card.querySelector(`#grid-${empIdx}`), employee.attendance, empIdx);
  });

  if (totalIssues > 0) {
    issueBanner.textContent = `⚠ ${totalIssues} issue${totalIssues > 1 ? 's' : ''} found — please review highlighted entries before generating.`;
    issueBanner.className = 'banner banner-warning';
  } else {
    issueBanner.textContent = '✓ No issues found. Ready to generate.';
    issueBanner.className = 'banner banner-ok';
  }
}

/**
 * Renders the date/time grid for one employee.
 * @param {HTMLElement} container
 * @param {Object.<string, {times: string[], status: string}>} attendance
 * @param {number} empIdx
 */
function renderAttendanceGrid(container, attendance, empIdx) {
  const dates = Object.keys(attendance);

  dates.forEach(date => {
    const entry = attendance[date];
    const cell = document.createElement('div');
    cell.className = `day-cell status-${entry.status}`;
    cell.dataset.empIdx = empIdx;
    cell.dataset.date = date;

    const label = document.createElement('div');
    label.className = 'day-label';
    label.textContent = date;

    const timesContainer = document.createElement('div');
    timesContainer.className = 'day-times';

    if (entry.originallyEmpty && entry.times.length === 0) {
      timesContainer.innerHTML = '<span class="no-data">—</span>';
      const addBtn = document.createElement('button');
      addBtn.className = 'add-entry-btn';
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', () => {
        entry.originallyEmpty = false;
        cell.className = `day-cell status-empty`;
        renderTimeInputs(timesContainer, entry, empIdx, date);
      });
      timesContainer.appendChild(addBtn);
    } else {
      renderTimeInputs(timesContainer, entry, empIdx, date);
    }

    cell.appendChild(label);
    cell.appendChild(timesContainer);
    container.appendChild(cell);
  });
}

/**
 * Renders editable time inputs for a day cell.
 * @param {HTMLElement} container
 * @param {{ times: string[], status: string }} entry
 * @param {number} empIdx
 * @param {string} date
 */
function renderTimeInputs(container, entry, empIdx, date) {
  container.innerHTML = '';

  if (entry.times.length <= 1) {
    // 0 or 1 time present: always show labeled In/Out pair
    if (entry.times.length === 1) {
      const hint = document.createElement('div');
      hint.className = 'missing-hint';
      hint.textContent = '⚠ Missing punch';
      container.appendChild(hint);
    }

    ['Clock-in', 'Clock-out'].forEach((label, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'time-row';

      const lbl = document.createElement('span');
      lbl.className = 'time-label';
      lbl.textContent = label + ':';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'time-input';
      input.placeholder = 'HH:MM';
      input.value = idx === 0 ? (entry.times[0] || '') : '';
      input.dataset.empIdx = empIdx;
      input.dataset.date = date;
      input.dataset.timeIdx = idx;
      input.addEventListener('change', onTimeChange);

      wrapper.appendChild(lbl);
      wrapper.appendChild(input);
      container.appendChild(wrapper);
    });
  } else {
    // 2+ times: normal or duplicate
    if (entry.status === 'duplicate') {
      const dupHint = document.createElement('div');
      dupHint.className = 'duplicate-hint';
      dupHint.textContent = `⚠ ${entry.times.length} punches — first used as clock-in, last as clock-out`;
      container.appendChild(dupHint);
    }

    entry.times.forEach((time, idx) => {
      container.appendChild(makeTimeRow(time, idx, idx === 0, idx === entry.times.length - 1, empIdx, date, entry));
    });
  }
}

/**
 * Creates a single time input row with a delete button (for duplicate entries).
 */
function makeTimeRow(value, idx, isFirst, isLast, empIdx, date, entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'time-row';

  const roleLabel = document.createElement('span');
  roleLabel.className = 'time-label';
  if (isFirst) roleLabel.textContent = 'In:';
  else if (isLast) roleLabel.textContent = 'Out:';
  else roleLabel.textContent = `[${idx}]:`;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'time-input';
  input.value = value;
  input.placeholder = 'HH:MM';
  input.dataset.empIdx = empIdx;
  input.dataset.date = date;
  input.dataset.timeIdx = idx;
  input.addEventListener('change', onTimeChange);

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(input);

  // Allow removing extra (non-first, non-last) duplicate entries
  if (entry.status === 'duplicate' && !isFirst && !isLast) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = 'Remove this entry';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      entry.times.splice(idx, 1);
      entry.status = classifyTimesFromCount(entry.times.length);
      // Re-render the cell
      const cell = document.querySelector(
        `.day-cell[data-emp-idx="${empIdx}"][data-date="${date}"]`
      );
      if (cell) {
        cell.className = `day-cell status-${entry.status}`;
        renderTimeInputs(cell.querySelector('.day-times'), entry, empIdx, date);
      }
      refreshIssueBanner();
    });
    wrapper.appendChild(removeBtn);
  }

  return wrapper;
}

/** Classify status from the count of times (mirrors parser.js logic). */
function classifyTimesFromCount(count) {
  if (count === 0) return 'empty';
  if (count === 1) return 'missing';
  if (count > 2) return 'duplicate';
  return 'normal';
}

/** Handles changes to a time input, updating the in-memory parsedData. */
function onTimeChange(e) {
  const { empIdx, date, timeIdx } = e.target.dataset;
  const entry = parsedData.employees[Number(empIdx)].attendance[date];
  const val = e.target.value.trim();

  if (entry.times.length <= 1) {
    // Rebuild times array from the two inputs in this cell
    const cell = document.querySelector(
      `.day-cell[data-emp-idx="${empIdx}"][data-date="${date}"]`
    );
    if (cell) {
      const inputs = cell.querySelectorAll('.time-input');
      const newTimes = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
      entry.times = newTimes;
      entry.status = classifyTimesFromCount(newTimes.length);
      cell.className = `day-cell status-${entry.status}`;
      const timesContainer = cell.querySelector('.day-times');
      if (timesContainer) renderTimeInputs(timesContainer, entry, Number(empIdx), date);
    }
  } else {
    entry.times[Number(timeIdx)] = val;
    entry.status = classifyTimesFromCount(entry.times.filter(Boolean).length);
    const cell = document.querySelector(
      `.day-cell[data-emp-idx="${empIdx}"][data-date="${date}"]`
    );
    if (cell) cell.className = `day-cell status-${entry.status}`;
  }

  refreshIssueBanner();
}

/** Recounts issues across all employees and updates the banner + badge. */
function refreshIssueBanner() {
  let totalIssues = 0;
  parsedData.employees.forEach((emp, idx) => {
    const issues = countIssues(emp.attendance);
    totalIssues += issues;
    const card = reviewContainer.children[idx];
    if (!card) return;
    const badge = card.querySelector('.issue-badge, .ok-badge');
    if (badge) {
      if (issues > 0) {
        badge.className = 'issue-badge';
        badge.textContent = `${issues} issue${issues > 1 ? 's' : ''}`;
      } else {
        badge.className = 'ok-badge';
        badge.textContent = '✓ OK';
      }
    }
  });

  if (totalIssues > 0) {
    issueBanner.textContent = `⚠ ${totalIssues} issue${totalIssues > 1 ? 's' : ''} remaining — please review before generating.`;
    issueBanner.className = 'banner banner-warning';
  } else {
    issueBanner.textContent = '✓ All issues resolved. Ready to generate.';
    issueBanner.className = 'banner banner-ok';
  }
}

/** Counts days with missing or duplicate status. */
function countIssues(attendance) {
  return Object.values(attendance).filter(e => e.status === 'missing' || e.status === 'duplicate').length;
}

// ─── Generate Results ─────────────────────────────────────────────────────────

generateBtn.addEventListener('click', () => {
  const threshold = parseFloat(overtimeInput.value) || 8;
  const results = parsedData.employees.map(emp =>
    calculateEmployeeHours(emp.name, emp.attendance, threshold)
  );
  renderResults(results);
  showSection(resultsSection);
});

/**
 * Renders the results summary table.
 * @param {import('./calculator.js').EmployeeResult[]} results
 */
function renderResults(results) {
  resultsBody.innerHTML = '';
  const textLines = [];

  results.forEach(r => {
    const skippedDays = Object.values(r.dayStats).filter(d => d.skipped && d.skipReason === 'missing_punch');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(r.name)}</td>
      <td>${fmt(r.totalHours)}</td>
      <td>${fmt(r.regularHours)}</td>
      <td>${fmt(r.overtimeHours)}</td>
      <td>${skippedDays.length > 0
        ? `<span class="warn-text">${skippedDays.length} day(s) skipped (missing punch)</span>`
        : '—'}</td>
    `;
    resultsBody.appendChild(tr);

    textLines.push(
      `Employee name: ${r.name}\n` +
      `Total hours worked: ${r.totalHours}\n` +
      `Overtime hours worked: ${r.overtimeHours}\n` +
      `Regular hours worked: ${r.regularHours}`
    );
  });

  const copyOutput = document.getElementById('copy-output');
  if (copyOutput) copyOutput.value = textLines.join('\n\n\n');
}

/** Formats a fractional hours number as "Xh Ym". */
function fmt(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

backBtn.addEventListener('click', () => showSection(reviewSection));
changeFileBtn.addEventListener('click', () => {
  parsedData = null;
  fileInput.value = '';
  showSection(uploadSection);
});
newFileBtn.addEventListener('click', () => {
  parsedData = null;
  fileInput.value = '';
  showSection(uploadSection);
});

function showSection(section) {
  [uploadSection, reviewSection, resultsSection].forEach(s => s.hidden = true);
  section.hidden = false;
  window.scrollTo(0, 0);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Copy & Download ──────────────────────────────────────────────────────────

document.getElementById('copy-text-btn')?.addEventListener('click', () => {
  const ta = document.getElementById('copy-output');
  if (!ta) return;
  ta.select();
  const btn = document.getElementById('copy-text-btn');
  navigator.clipboard.writeText(ta.value).then(() => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    document.execCommand('copy');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

document.getElementById('download-htm-btn')?.addEventListener('click', () => {
  if (!originalHtml || !parsedData) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(originalHtml, 'text/html');
  const tables = doc.querySelectorAll('table');

  parsedData.employees.forEach((emp, empIdx) => {
    const table = tables[empIdx];
    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const dateRow = rows[i];
      const timeRow = rows[i + 1];
      if (!dateRow || !timeRow) continue;

      const dateCells = Array.from(dateRow.querySelectorAll('td')).slice(1);
      const timeCells = Array.from(timeRow.querySelectorAll('td')).slice(1);

      dateCells.forEach((dateCell, idx) => {
        const dateStr = dateCell.textContent.replace(/\u00a0/g, ' ').trim();
        if (!dateStr) return;

        const entry = emp.attendance[dateStr];
        if (!entry) return;

        const timeCell = timeCells[idx];
        if (!timeCell) return;

        timeCell.innerHTML = entry.times.map(t => escHtml(t)).join('<br>');
      });
    }
  });

  const fixedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  const blob = new Blob([fixedHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFileName.replace(/\.[^.]+$/, '') + '_fixed.htm';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
