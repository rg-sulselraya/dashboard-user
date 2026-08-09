const SHEET_ID = "1IZmTVAEVmTzEUqG_HmaRWpki-orOVjD5SdmLpDuygJg";
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzHL1yp5FpI_6nTSWTuw7SblLPYILKDESNIaQQIP5ba1AJgCan-pmmzAv3hAk4AvjwEIA/exec";

const GRADES = [
  "1 SD",
  "2 SD",
  "3 SD",
  "4 SD",
  "5 SD",
  "6 SD",
  "7 SMP",
  "8 SMP",
  "9 SMP",
  "10 SMA",
  "11 SMA",
  "12 SMA",
];
const LEVELS = ["SD", "SMP", "SMA"];
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function previousYtdLimit(today) {
  return new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() - 1);
}

let TODAY = startOfToday();
let PREVIOUS_YTD_LIMIT = previousYtdLimit(TODAY);

let users2526 = [];
let users2627 = [];
let validationRows = [];
let activeBranch = "Makassar - Hertasning";
let activeView = "branch";
let activeMode = "grade";
let selectedSchool = null;
let gradeChart;
let selectedGradeBreakdown = null;

const byId = (id) => document.getElementById(id);
const formatter = new Intl.NumberFormat("id-ID");
const DASHBOARD_PASSWORD = "rgsulselraya";

function unlockDashboard() {
  document.body.classList.remove("locked");
  sessionStorage.setItem("dashboardUnlocked", "true");
}

function setupPasswordGate() {
  const form = byId("passwordForm");
  const input = byId("passwordInput");
  const error = byId("passwordError");
  if (sessionStorage.getItem("dashboardUnlocked") === "true") {
    unlockDashboard();
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value === DASHBOARD_PASSWORD) {
      unlockDashboard();
      error.hidden = true;
      return;
    }
    error.hidden = false;
    input.value = "";
    input.focus();
  });
}

function sheetUrl(sheetName) {
  const gids = {
    "2526": "1754043770",
    "2627": "0",
    Validasi: "822697872",
  };
  const cacheBust = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${BASE_URL}?gid=${gids[sheetName]}&tq=${encodeURIComponent("select *")}&cacheBust=${cacheBust}`;
}

function tableToRows(table) {
  const fallbackLabels = {
    A: "No",
    B: "Cabang BAC",
    C: "User Serial",
    D: "Tanggal Paid",
    E: "Jenjang",
    F: "Asal Sekolah",
    G: "Kurikulum Di Sekolah",
    H: "Grade",
    I: "Regional",
    L: "Jenjang",
    M: "Asal Sekolah",
    O: "Grade",
    P: "Regional",
  };
  const headers = table.cols.map((col) => clean(col.label) || fallbackLabels[col.id] || col.id);
  const body = table.rows.map((row) =>
    table.cols.map((_, index) => {
      const cell = row.c?.[index];
      if (!cell) return "";
      return cell.f ?? cell.v ?? "";
    }),
  );
  return [headers, ...body];
}

function loadSheetRows(sheetName) {
  return new Promise((resolve, reject) => {
    const callback = `sheetCallback_${sheetName.replace(/\W/g, "")}_${Date.now()}`;
    const script = document.createElement("script");
    const tqx = encodeURIComponent(`out:json;responseHandler:${callback}`);

    window[callback] = (data) => {
      delete window[callback];
      script.remove();
      if (data.status === "error") {
        reject(new Error(data.errors?.[0]?.detailed_message || "Google Sheet tidak bisa dibaca"));
        return;
      }
      resolve(tableToRows(data.table));
    };

    script.onerror = () => {
      delete window[callback];
      script.remove();
      reject(new Error("Gagal mengambil data Google Sheet"));
    };

    script.src = `${sheetUrl(sheetName)}&tqx=${tqx}`;
    document.head.appendChild(script);
  });
}

async function loadSheetRowsWithFallback(sheetName) {
  try {
    return await loadSheetRows(sheetName);
  } catch (error) {
    const csv = window.LOCAL_SHEET_CSV?.[sheetName];
    if (!csv) {
      throw error;
    }
    window.USING_LOCAL_DATA = true;
    return parseCSV(csv);
  }
}

async function loadSheetsFromAppsScript() {
  const url = `${APPS_SCRIPT_URL}?cacheBust=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Apps Script tidak bisa dibaca");
  const payload = await response.json();
  if (!payload.sheets?.["2526"] || !payload.sheets?.["2627"] || !payload.sheets?.Validasi) {
    throw new Error("Format data Apps Script tidak sesuai");
  }
  return payload;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text || text === "-") return 0;
  const withoutPercent = text.replace("%", "");
  const normalized = withoutPercent.includes(",")
    ? withoutPercent.replace(/\./g, "").replace(",", ".")
    : withoutPercent.replace(/\.(?=\d{3}(\D|$))/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberText(value) {
  return formatter.format(Math.round(toNumber(value)));
}

function percentText(value) {
  if (value === null) return "-";
  const percent = toNumber(value) * 100;
  if (!Number.isFinite(percent) || percent <= 0) return "-";
  return `${Math.round(percent)}%`;
}

function achievementText(current, target) {
  const targetValue = toNumber(target);
  if (!targetValue) return "-";
  return `${Math.round((toNumber(current) / targetValue) * 100)}%`;
}

function achievementRatio(current, target) {
  const targetValue = toNumber(target);
  if (!targetValue) return null;
  return toNumber(current) / targetValue;
}

function achievementClass(value) {
  if (value === null) return "achievement empty";
  return "achievement";
}

function achievementStyle(value) {
  if (value === null) return "";
  const percent = Math.max(0, Math.min(100, toNumber(value) * 100));
  const red = [230, 41, 61];
  const white = [255, 255, 255];
  const green = [47, 172, 102];
  const start = percent <= 50 ? red : white;
  const end = percent <= 50 ? white : green;
  const ratio = percent <= 50 ? percent / 50 : (percent - 50) / 50;
  const [r, g, b] = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
  const textColor = percent > 35 && percent < 75 ? "#12222f" : "#ffffff";
  return ` style="--achievement-bg: rgb(${r}, ${g}, ${b}); --achievement-color: ${textColor};"`;
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    Mei: 4,
    May: 4,
    Jun: 5,
    Jul: 6,
    Agu: 7,
    Aug: 7,
    Sep: 8,
    Okt: 9,
    Oct: 9,
    Nov: 10,
    Des: 11,
    Dec: 11,
  };
  const spacedParts = text.split(/\s+/);
  if (spacedParts.length === 3 && Number(spacedParts[0])) {
    const day = Number(spacedParts[0]);
    const month = monthMap[spacedParts[1]];
    const year = Number(spacedParts[2].length === 2 ? `20${spacedParts[2]}` : spacedParts[2]);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parts = text.replace(/\//g, "-").split("-");
  if (parts.length === 3 && Number(parts[0])) {
    const day = Number(parts[0]);
    const month = monthMap[parts[1]] ?? Number(parts[1]) - 1;
    const year = Number(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function columnIndex(headers, candidates, fallback) {
  const normalizedHeaders = headers.map((header) => clean(header).toLowerCase());
  const index = normalizedHeaders.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate)),
  );
  return index >= 0 ? index : fallback;
}

function recordsFromSheet(rows) {
  const headers = rows[0] || [];
  const branchIndex = columnIndex(headers, ["cabang bac"], 1);
  const dateIndex = columnIndex(headers, ["tanggal paid"], 3);
  const levelIndex = columnIndex(headers, ["jenjang"], 11);
  const schoolIndex = columnIndex(headers, ["asal sekolah"], 12);
  const gradeIndex = columnIndex(headers, ["grade"], 14);
  const regionalIndex = columnIndex(headers, ["regional"], 15);

  return rows.slice(1).map((row) => ({
    branch: clean(row[branchIndex]),
    paidDate: parseDate(row[dateIndex]),
    school: clean(row[schoolIndex]),
    level: clean(row[levelIndex]),
    grade: clean(row[gradeIndex]),
    regional: clean(row[regionalIndex]),
  }));
}

function branchList() {
  return validationRows
    .slice(1)
    .map((row) => clean(row[0]))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "id-ID"));
}

function branchRegion(branch) {
  return clean(validationRows.find((row) => clean(row[0]) === branch)?.[2]);
}

function inScope(record, scope) {
  if (scope.type === "branch") return record.branch === scope.value;
  return record.regional === scope.value;
}

function countUsers(records, scope, filter = {}) {
  return records.filter((record) => {
    if (!inScope(record, scope)) return false;
    if (filter.grade && record.grade !== filter.grade) return false;
    if (filter.school && record.school !== filter.school) return false;
    if (filter.limitDate && (!record.paidDate || record.paidDate > filter.limitDate)) return false;
    return true;
  }).length;
}

function targetByGrade(scope, grade) {
  return validationRows.slice(1).reduce((sum, row) => {
    const region = clean(row[16]);
    const branch = clean(row[17]);
    const rowGrade = clean(row[18]);
    if (rowGrade !== grade) return sum;
    if (scope.type === "branch" && branch !== scope.value) return sum;
    if (scope.type === "region" && region !== scope.value) return sum;
    return sum + toNumber(row[19]);
  }, 0);
}

function targetSchools(branch) {
  return validationRows
    .slice(1)
    .filter((row) => clean(row[7]) === branch && clean(row[8]))
    .map((row) => ({
      school: clean(row[8]),
      level: clean(row[9]),
      target: toNumber(row[11]),
    }));
}

function targetSchoolsForScope(scope) {
  const schools = new Map();
  validationRows
    .slice(1)
    .filter((row) => clean(row[8]))
    .forEach((row) => {
      const branch = clean(row[7]);
      const school = clean(row[8]);
      const level = clean(row[9]);
      const target = toNumber(row[11]);
      const matches =
        scope.type === "branch"
          ? branch === scope.value
          : users2526
              .concat(users2627)
              .some((record) => record.regional === scope.value && record.school === school);

      if (!matches) return;
      const item = schools.get(school) || { name: school, level, target: 0 };
      item.target += target;
      if (!item.level && level) item.level = level;
      schools.set(school, item);
    });
  return [...schools.values()];
}

function gradeLevel(grade) {
  if (grade.includes("SD")) return "SD";
  if (grade.includes("SMP")) return "SMP";
  if (grade.includes("SMA")) return "SMA";
  return "-";
}

function growthLabel(previous, current) {
  if (previous === 0 && current === 0) return "→ 0.0";
  if (previous === 0) return "⬆ New";
  const ratio = current / previous;
  const value = ratio.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (current > previous) return `⬆ ${value}`;
  if (current < previous) return `⬇ ${value}`;
  return `→ ${value}`;
}

function trendClass(value) {
  if (clean(value).includes("⬆")) return "trend-up";
  if (clean(value).includes("⬇")) return "trend-down";
  return "trend-flat";
}

function gradeRows(scope) {
  return GRADES.map((grade) => {
    const previousTotal = countUsers(users2526, scope, { grade });
    const previous = countUsers(users2526, scope, { grade, limitDate: PREVIOUS_YTD_LIMIT });
    const current = countUsers(users2627, scope, { grade, limitDate: TODAY });
    const target = targetByGrade(scope, grade);
    return {
      grade,
      level: gradeLevel(grade),
      previousTotal,
      previous,
      current,
      target,
      growth: growthLabel(previous, current),
      achievement: achievementRatio(current, target),
    };
  });
}

function sumRows(rows, level = "all") {
  const filtered = rows.filter((row) => level === "all" || row.level === level);
  const previous = filtered.reduce((sum, row) => sum + row.previous, 0);
  const current = filtered.reduce((sum, row) => sum + row.current, 0);
  const target = filtered.reduce((sum, row) => sum + row.target, 0);
  return {
    previous,
    current,
    target,
    achievement: achievementRatio(current, target),
    growth: growthLabel(previous, current),
  };
}

function schoolRows(branch) {
  return targetSchools(branch).map((target) => {
    const scope = { type: "branch", value: branch };
    const previous = countUsers(users2526, scope, { school: target.school });
    const previousYtd = countUsers(users2526, scope, {
      school: target.school,
      limitDate: PREVIOUS_YTD_LIMIT,
    });
    const currentYtd = countUsers(users2627, scope, {
      school: target.school,
      limitDate: TODAY,
    });
    return {
      school: target.school,
      level: target.level,
      previous,
      target: target.target,
      previousYtd,
      currentYtd,
      growth: growthLabel(previousYtd, currentYtd),
      gap: currentYtd - target.target,
      achievement: target.target ? currentYtd / target.target : 0,
    };
  });
}

function schoolRowsForScope(scope) {
  return targetSchoolsForScope(scope)
    .map((school) => {
      const previousTotal = countUsers(users2526, scope, {
        school: school.name,
      });
      const previous = countUsers(users2526, scope, {
        school: school.name,
        limitDate: PREVIOUS_YTD_LIMIT,
      });
      const current = countUsers(users2627, scope, {
        school: school.name,
        limitDate: TODAY,
      });
      return {
        name: school.name,
        level: school.level,
        previousTotal,
        previous,
        current,
        target: school.target,
        growth: growthLabel(previous, current),
        achievement: achievementRatio(current, school.target),
      };
    })
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name, "id-ID"));
}

function selectedSchoolGradeRows() {
  if (!selectedSchool) return [];
  const scope =
    activeView === "makassar"
      ? { type: "region", value: "Regional - Makassar Raya" }
      : activeView === "sulsel"
        ? { type: "region", value: "Regional - Sulawesi Selatan" }
        : { type: "branch", value: activeBranch };

  return GRADES.map((grade) => {
    const previousTotal = countUsers(users2526, scope, {
      school: selectedSchool,
      grade,
    });
    const previous = countUsers(users2526, scope, {
      school: selectedSchool,
      grade,
      limitDate: PREVIOUS_YTD_LIMIT,
    });
    const current = countUsers(users2627, scope, {
      school: selectedSchool,
      grade,
      limitDate: TODAY,
    });
    return {
      grade,
      level: gradeLevel(grade),
      previousTotal,
      previous,
      current,
    };
  }).filter((row) => row.previousTotal || row.previous || row.current);
}

function schoolGradeDetailRows(schoolName) {
  const previousSchool = selectedSchool;
  selectedSchool = schoolName;
  const rows = selectedSchoolGradeRows();
  selectedSchool = previousSchool;
  return rows;
}

function activeScope() {
  if (activeView === "makassar") return { type: "region", value: "Regional - Makassar Raya" };
  if (activeView === "sulsel") return { type: "region", value: "Regional - Sulawesi Selatan" };
  return { type: "branch", value: activeBranch };
}

function gradeSchoolContributors(grade, metric) {
  const scope = activeScope();
  const records = metric === "current" ? users2627 : users2526;
  const limitDate = metric === "previousTotal" ? null : metric === "previous" ? PREVIOUS_YTD_LIMIT : TODAY;
  const totals = new Map();
  records.forEach((record) => {
    if (!inScope(record, scope)) return;
    if (record.grade !== grade) return;
    if (limitDate && (!record.paidDate || record.paidDate > limitDate)) return;
    const school = record.school || "Tanpa Nama Sekolah";
    totals.set(school, (totals.get(school) || 0) + 1);
  });
  return [...totals.entries()]
    .map(([school, total]) => ({ school, total }))
    .sort((a, b) => b.total - a.total || a.school.localeCompare(b.school, "id-ID"));
}

function breakdownMetricLabel(metric) {
  if (metric === "previousTotal") return "Total User 25/26";
  if (metric === "previous") return "User YTD 25/26";
  return "User YTD 26/27";
}

function renderBranchOptions() {
  const options = branchList();
  byId("branchSelect").innerHTML = options
    .map(
      (branch) =>
        `<option value="${branch}" ${branch === activeBranch ? "selected" : ""}>${branch}</option>`,
    )
    .join("");
}

function renderSummary() {
  const level = byId("levelSelect").value;
  const branchGrades = gradeRows({ type: "branch", value: activeBranch });
  const viewGrades = activeRows();
  const branch = sumRows(branchGrades, level);
  const makassar = sumRows(gradeRows({ type: "region", value: "Regional - Makassar Raya" }), level);
  const sulsel = sumRows(gradeRows({ type: "region", value: "Regional - Sulawesi Selatan" }), level);

  byId("branchLabel").textContent = activeBranch;
  byId("branchUsers").textContent = numberText(branch.current);
  byId("branchMeta").innerHTML = `Target ${numberText(branch.target)} | Achievement ${percentText(branch.achievement)} | Growth <span class="${trendClass(branch.growth)}">${branch.growth}</span>`;
  byId("makassarUsers").textContent = numberText(makassar.current);
  byId("makassarMeta").innerHTML = `Target ${numberText(makassar.target)} | Achievement ${percentText(makassar.achievement)} | Growth <span class="${trendClass(makassar.growth)}">${makassar.growth}</span>`;
  byId("sulselUsers").textContent = numberText(sulsel.current);
  byId("sulselMeta").innerHTML = `Target ${numberText(sulsel.target)} | Achievement ${percentText(sulsel.achievement)} | Growth <span class="${trendClass(sulsel.growth)}">${sulsel.growth}</span>`;
  const sd = sumRows(viewGrades, "SD");
  const smp = sumRows(viewGrades, "SMP");
  const sma = sumRows(viewGrades, "SMA");
  byId("sdUsers").textContent = numberText(sd.current);
  byId("sdMeta").innerHTML = `Target ${numberText(sd.target)} | Achievement ${percentText(sd.achievement)} | Growth <span class="${trendClass(sd.growth)}">${sd.growth}</span>`;
  byId("smpUsers").textContent = numberText(smp.current);
  byId("smpMeta").innerHTML = `Target ${numberText(smp.target)} | Achievement ${percentText(smp.achievement)} | Growth <span class="${trendClass(smp.growth)}">${smp.growth}</span>`;
  byId("smaUsers").textContent = numberText(sma.current);
  byId("smaMeta").innerHTML = `Target ${numberText(sma.target)} | Achievement ${percentText(sma.achievement)} | Growth <span class="${trendClass(sma.growth)}">${sma.growth}</span>`;

  document.querySelectorAll(".summary-card[data-view]").forEach((card) => {
    card.classList.toggle("selected", card.dataset.view === activeView);
  });
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === activeMode);
  });
}

function renderGradeTable(targetId, rows) {
  const level = byId("levelSelect").value;
  const filtered = rows.filter((row) => level === "all" || row.level === level);
  byId(targetId).innerHTML = filtered
    .map(
      (row) => {
        const achievement = achievementRatio(row.current, row.target);
        return `
        <tr>
          <td><strong>${row.grade}</strong></td>
          <td>${numberText(row.previous)}</td>
          <td>${numberText(row.current)}</td>
          <td class="${trendClass(row.growth)}">${row.growth}</td>
          <td>${numberText(row.target)}</td>
          <td><span class="${achievementClass(achievement)}"${achievementStyle(achievement)}>${achievementText(row.current, row.target)}</span></td>
        </tr>
      `;
      },
    )
    .join("");
}

function renderMainTable(rows) {
  const level = byId("levelSelect").value;
  const filtered = rows.filter((row) => level === "all" || row.level === level);
  if (activeMode === "school" && selectedSchool && !filtered.some((row) => row.name === selectedSchool)) {
    selectedSchool = null;
  }
  byId("branchGradeRows").innerHTML = filtered
    .map((row) => {
      const label = activeMode === "school" ? row.name : row.grade;
      const achievement = achievementRatio(row.current, row.target);
      const clickable = activeMode === "school" ? "school-row" : "";
      const selected = activeMode === "school" && row.name === selectedSchool ? "selected-row" : "";
      const dataSchool = activeMode === "school" ? ` data-school="${escapeHtml(row.name)}"` : "";
      const gradeData =
        activeMode === "grade"
          ? ` data-grade="${escapeHtml(row.grade)}" data-previous-total="${row.previousTotal}" data-previous="${row.previous}" data-current="${row.current}"`
          : "";
      const detailRows =
        activeMode === "school" && row.name === selectedSchool
          ? `
            ${schoolGradeDetailRows(row.name)
              .map(
                (gradeRow) => {
                  const gradeGrowth = growthLabel(gradeRow.previous, gradeRow.current);
                  return `
                    <tr class="grade-detail-row">
                      <td>${gradeRow.grade}</td>
                      <td>${numberText(gradeRow.previousTotal)}</td>
                      <td>${numberText(gradeRow.previous)}</td>
                      <td>${numberText(gradeRow.current)}</td>
                      <td class="${trendClass(gradeGrowth)}">${gradeGrowth}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  `;
                },
              )
              .join("")}
          `
          : "";
      return `
        <tr class="${clickable} ${selected}"${dataSchool}${gradeData}>
          <td>${label}</td>
          <td class="${activeMode === "grade" ? "breakdown-trigger" : ""}" data-metric="previousTotal">${numberText(row.previousTotal)}</td>
          <td class="${activeMode === "grade" ? "breakdown-trigger" : ""}" data-metric="previous">${numberText(row.previous)}</td>
          <td class="${activeMode === "grade" ? "breakdown-trigger" : ""}" data-metric="current">${numberText(row.current)}</td>
          <td class="${trendClass(row.growth)}">${row.growth}</td>
          <td>${numberText(row.target)}</td>
          <td><span class="${achievementClass(achievement)}"${achievementStyle(achievement)}>${achievementText(row.current, row.target)}</span></td>
        </tr>
        ${detailRows}
      `;
    })
    .join("");
}

function renderGradeSchoolBreakdown() {
  const panel = byId("gradeSchoolBreakdown");
  if (activeMode !== "grade" || !selectedGradeBreakdown) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const rows = gradeSchoolContributors(selectedGradeBreakdown.grade, selectedGradeBreakdown.metric);
  const metricLabel = breakdownMetricLabel(selectedGradeBreakdown.metric);
  panel.hidden = false;
  panel.innerHTML = `
    <div class="breakdown-head">
      <div>
        <h3>${selectedGradeBreakdown.grade}</h3>
        <p>${metricLabel}</p>
      </div>
      <button id="closeBreakdown" type="button">Tutup</button>
    </div>
    <div class="table-wrap compact">
      <table class="breakdown-table">
        <thead>
          <tr>
            <th>Nama Sekolah</th>
            <th>${metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.school)}</td>
                        <td>${numberText(row.total)}</td>
                      </tr>
                    `,
                  )
                  .join("")
              : `<tr><td colspan="2">Tidak ada data sekolah</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
  byId("closeBreakdown").addEventListener("click", () => {
    selectedGradeBreakdown = null;
    renderGradeSchoolBreakdown();
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    layout: {
      padding: {
        top: 34,
        right: 12,
        bottom: 0,
        left: 0,
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          boxHeight: 8,
          color: "#12222f",
          font: { weight: "700" },
          padding: 18,
        },
      },
      tooltip: {
        backgroundColor: "#12222f",
        titleColor: "#ffffff",
        bodyColor: "#e6f6fa",
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${numberText(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#657585",
          font: { size: 12, weight: "900" },
          maxRotation: 0,
          minRotation: 0,
          autoSkip: false,
          padding: 8,
        },
      },
      y: {
        beginAtZero: true,
        grace: "14%",
        border: { display: false },
        grid: {
          color: "#dceaf0",
          drawTicks: false,
        },
        ticks: {
          color: "#657585",
          padding: 8,
          callback: (value) => numberText(value),
        },
      },
    },
  };
}

function renderCharts() {
  const level = byId("levelSelect").value;
  const allRows = activeMode === "school" ? selectedSchoolGradeRows() : activeRows();
  const rows = allRows.filter((row) => level === "all" || row.level === level);

  if (typeof Chart === "undefined") {
    renderFallbackChart(rows);
    return;
  }

  const chartWrap = document.querySelector(".chart-wrap");
  chartWrap.style.width =
    activeMode === "school" ? `${Math.max(520, rows.length * 96)}px` : "";
  if (!byId("gradeChart")) {
    chartWrap.innerHTML = '<canvas id="gradeChart"></canvas>';
  }

  if (gradeChart) gradeChart.destroy();
  gradeChart = new Chart(byId("gradeChart"), {
    type: "bar",
    data: {
      labels: rows.map((row) => row.grade),
      datasets: [
        {
          label: activeMode === "school" ? "25/26" : "25/26 YTD",
          data: rows.map((row) => (activeMode === "school" ? row.previousTotal : row.previous)),
          backgroundColor: activeMode === "school" ? "#94a3b8" : "#0077a3",
          borderColor: activeMode === "school" ? "#94a3b8" : "#0077a3",
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: activeMode === "school" ? 18 : 26,
          categoryPercentage: activeMode === "school" ? 0.78 : 0.82,
          barPercentage: activeMode === "school" ? 0.9 : 0.86,
          order: 2,
        },
        {
          label: activeMode === "school" ? "25/26 YTD" : "26/27 YTD",
          data: rows.map((row) => (activeMode === "school" ? row.previous : row.current)),
          backgroundColor: activeMode === "school" ? "#0077a3" : "#ff7a1a",
          borderColor: activeMode === "school" ? "#0077a3" : "#ff7a1a",
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: activeMode === "school" ? 18 : 26,
          categoryPercentage: activeMode === "school" ? 0.78 : 0.82,
          barPercentage: activeMode === "school" ? 0.9 : 0.86,
          order: 2,
        },
        {
          label: activeMode === "school" ? "26/27 YTD" : "Target",
          data: rows.map((row) => (activeMode === "school" ? row.current : row.target)),
          backgroundColor: activeMode === "school" ? "#ff7a1a" : "#2fac66",
          borderColor: activeMode === "school" ? "#ff7a1a" : "#2fac66",
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: activeMode === "school" ? 18 : 26,
          categoryPercentage: activeMode === "school" ? 0.78 : 0.82,
          barPercentage: activeMode === "school" ? 0.9 : 0.86,
          order: 2,
        },
      ],
    },
    options: chartOptions(),
  });

}

function renderFallbackChart(rows) {
  if (activeMode === "school") rows = selectedSchoolGradeRows();
  const chartWrap = document.querySelector(".chart-wrap");
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) =>
      activeMode === "school"
        ? [row.previousTotal, row.previous, row.current]
        : [row.previous, row.current, row.target],
    ),
  );

  chartWrap.innerHTML = `
    <div class="fallback-chart">
      <div class="fallback-plot">
        ${rows
          .map(
            (row) => `
              <div class="fallback-group">
                <div class="fallback-bars">
                  <span class="bar previous-total" style="height:${((activeMode === "school" ? row.previousTotal : row.previous) / maxValue) * 100}%"></span>
                  <span class="bar previous" style="height:${((activeMode === "school" ? row.previous : row.current) / maxValue) * 100}%"></span>
                  <span class="bar current" style="height:${((activeMode === "school" ? row.current : row.target) / maxValue) * 100}%"></span>
                </div>
                <strong>${row.grade}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="fallback-legend">
        <span><i class="previous-total"></i>${activeMode === "school" ? "25/26" : "25/26 YTD"}</span>
        <span><i class="previous"></i>${activeMode === "school" ? "25/26 YTD" : "26/27 YTD"}</span>
        <span><i class="current"></i>${activeMode === "school" ? "26/27 YTD" : "Target"}</span>
      </div>
    </div>
  `;
}

function activeRows() {
  const scope =
    activeView === "makassar"
      ? { type: "region", value: "Regional - Makassar Raya" }
      : activeView === "sulsel"
        ? { type: "region", value: "Regional - Sulawesi Selatan" }
        : { type: "branch", value: activeBranch };

  if (activeMode === "school") return schoolRowsForScope(scope);

  if (activeView === "makassar") {
    return gradeRows({ type: "region", value: "Regional - Makassar Raya" });
  }
  if (activeView === "sulsel") {
    return gradeRows({ type: "region", value: "Regional - Sulawesi Selatan" });
  }
  return gradeRows({ type: "branch", value: activeBranch });
}

function activeTitle() {
  if (activeView === "makassar") return "Regional - Makassar Raya";
  if (activeView === "sulsel") return "Regional - Sulawesi Selatan";
  return activeBranch;
}

function render() {
  const mainRows = activeRows();
  const dashboardGrid = document.querySelector(".dashboard-grid");

  byId("subtitle").textContent = `${activeBranch} | ${branchRegion(activeBranch) || "-"}`;
  byId("mainGrowthTitle").textContent = `${activeMode === "school" ? "User per Sekolah" : "User per Grade"} - ${activeTitle()}`;
  byId("mainDimensionHeader").textContent = activeMode === "school" ? "SEKOLAH" : "GRADE";
  byId("branchTableCaption").textContent = activeTitle();
  renderSummary();
  renderMainTable(mainRows);
  renderGradeSchoolBreakdown();
  dashboardGrid.classList.add("full-width");
  document.body.classList.add("school-mode");
  if (gradeChart) {
    gradeChart.destroy();
    gradeChart = null;
  }
}

async function loadSheet() {
  byId("syncText").textContent = "Mengambil data terbaru...";
  byId("syncDot").className = "dot";
  window.USING_LOCAL_DATA = false;
  TODAY = startOfToday();
  PREVIOUS_YTD_LIMIT = previousYtdLimit(TODAY);
  try {
    const payload = await loadSheetsFromAppsScript();
    const [rows2526, rows2627, rowsValidasi] = [
      payload.sheets["2526"],
      payload.sheets["2627"],
      payload.sheets.Validasi,
    ];
    users2526 = recordsFromSheet(rows2526);
    users2627 = recordsFromSheet(rows2627);
    validationRows = rowsValidasi;
    const branches = branchList();
    if (!branches.includes(activeBranch)) activeBranch = branches[0] || activeBranch;
    renderBranchOptions();
    render();
    byId("syncText").textContent = payload.updatedAt
      ? `Live Apps Script: ${new Date(payload.updatedAt).toLocaleString("id-ID")}`
      : "Live Apps Script";
    byId("syncDot").className = "dot ok";
  } catch (error) {
    byId("syncText").textContent = "Gagal membaca Google Sheet";
    byId("syncDot").className = "dot error";
    console.error(error);
  }
}

byId("branchSelect").addEventListener("change", (event) => {
  activeBranch = event.target.value;
  activeView = "branch";
  selectedSchool = null;
  selectedGradeBreakdown = null;
  render();
});
byId("levelSelect").addEventListener("change", () => {
  selectedGradeBreakdown = null;
  render();
});
byId("refreshBtn").addEventListener("click", loadSheet);

document.querySelectorAll(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => {
    activeMode = button.dataset.mode;
    selectedSchool = null;
    selectedGradeBreakdown = null;
    render();
  });
});

byId("branchGradeRows").addEventListener("click", (event) => {
  const cell = event.target.closest(".breakdown-trigger");
  if (activeMode === "grade" && cell) {
    const row = cell.closest("tr");
    selectedGradeBreakdown = {
      grade: row.dataset.grade,
      metric: cell.dataset.metric,
    };
    renderGradeSchoolBreakdown();
    byId("gradeSchoolBreakdown").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const row = event.target.closest(".school-row");
  if (!row) return;
  selectedSchool = selectedSchool === row.dataset.school ? null : row.dataset.school;
  render();
});

document.querySelectorAll(".summary-card[data-view]").forEach((card) => {
  const activate = () => {
    activeView = card.dataset.view;
    selectedSchool = null;
    selectedGradeBreakdown = null;
    render();
  };
  card.addEventListener("click", activate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
});

document.querySelectorAll(".view-tab").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    selectedSchool = null;
    selectedGradeBreakdown = null;
    render();
  });
});

setupPasswordGate();
loadSheet();
