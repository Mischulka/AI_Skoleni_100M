const state = {
  currentStep: 1,
  totalSteps: 3,
  selectedParticipant: null,
  participants: [],
  answers: {},
  overview: []
};

const SUMMARY_RECIPIENTS = ["michaela.lattenberg@100mega.cz", "michal.rampula@100mega.cz"];

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const requiredByStep = {
  1: ["email"],
  2: ["n8nStatus", "googleStatus", "claudeStatus"],
  3: ["vscodeStatus", "internetStatus", "emailAccessStatus", "filesStatus"]
};

const goodWords = ["mám", "funguje", "ověřeno", "aktivní", "nainstalováno", "připraveno", "potvrzuji", "vezmu", "umím", "free", "placená", "firemní"];
const badWords = ["nemám", "není", "nefunguje", "blokováno", "nemohu", "neumím"];

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function getFormData() {
  const form = qs("#prepForm");
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const [key, value] of Object.entries(state.answers)) {
    payload[key] = value;
  }
  if (state.selectedParticipant) {
    payload.email = state.selectedParticipant.email;
  }
  return payload;
}

async function loadParticipants() {
  const res = await fetch("/api/participants");
  const data = await res.json();
  state.participants = [...data.participants].sort((a, b) => a.name.localeCompare(b.name, "cs"));
  renderNameGrid();
}

function renderNameGrid() {
  const grid = qs("#nameGrid");
  grid.innerHTML = "";

  for (const person of state.participants) {
    const button = document.createElement("button");
    button.className = "name-btn";
    button.type = "button";
    button.innerHTML = `${escapeHtml(person.name)}<span class="dept">${escapeHtml(person.email)}</span>`;
    button.addEventListener("click", () => {
      qsa(".name-btn").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      state.selectedParticipant = person;
      state.answers.email = person.email;
      prefillAccountEmails(person.email);
      updateButtons();
      goToStep(2);
    });
    grid.append(button);
  }
}

function prefillAccountEmails(email) {
  const normalized = String(email || "").toLowerCase();
  for (const name of ["n8nEmail", "googleEmail", "claudeEmail", "geminiEmail", "chatgptEmail", "perplexityEmail"]) {
    const input = qs(`[name="${name}"]`);
    if (input && !input.value) {
      input.value = normalized;
    }
  }
}

function setupChoices() {
  qsa(".yn-row").forEach((group) => {
    const name = group.dataset.name;
    group.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        group.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        state.answers[name] = button.dataset.value;
        updateConditionals();
        updateButtons();
      });
    });
  });

  qsa(".options").forEach((group) => {
    const name = group.dataset.name;
    group.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        group.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        state.answers[name] = button.dataset.value;
        updateButtons();
      });
    });
  });

  qsa("input, select, textarea").forEach((input) => {
    input.addEventListener("input", () => {
      normalizeEmailInput(input);
      updateButtons();
    });
    input.addEventListener("change", () => {
      normalizeEmailInput(input);
      updateToolEmails();
      updateButtons();
    });
  });
}

function normalizeEmailInput(input) {
  if (input.type === "email") {
    input.value = input.value.trim().toLowerCase();
  }
}

function updateConditionals() {
  qsa(".conditional").forEach((block) => {
    const value = state.answers[block.dataset.showFor] || "";
    const allowed = String(block.dataset.values || "").split(",");
    block.classList.toggle("show", allowed.includes(value));
  });
  updateToolEmails();
}

function updateToolEmails() {
  qsa("[data-detail-target]").forEach((select) => {
    const input = qs(`[name="${select.dataset.detailTarget}"]`);
    if (!input) {
      return;
    }
    const show = select.value === "Mám účet / funguje";
    input.classList.toggle("show", show);
    if (!show) {
      input.value = "";
    }
  });
}

function goToStep(step) {
  if (step < 1 || step > state.totalSteps) {
    return;
  }
  state.currentStep = step;
  qsa(".step").forEach((section) => {
    section.classList.toggle("active", Number(section.dataset.step) === step);
  });
  updateProgress();
  updateButtons();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateProgress() {
  const pct = Math.round(((state.currentStep - 1) / (state.totalSteps - 1)) * 100);
  qs("#progressFill").style.width = `${pct}%`;
  qs("#stepLabel").textContent = `Krok ${state.currentStep} ze ${state.totalSteps}`;
  qs("#stepPct").textContent = `${pct} %`;
}

function isStepValid(step) {
  const data = getFormData();
  const fields = requiredByStep[step] || [];
  const baseValid = fields.every((field) => String(data[field] || "").trim());
  if (!baseValid) {
    return false;
  }

  if (step === 2) {
    if (["Mám účet", "Registruji"].includes(data.n8nStatus) && !data.n8nEmail) return false;
    if (data.googleStatus === "Mám účet" && !data.googleEmail) return false;
    if (["Mám účet", "Registruji"].includes(data.claudeStatus) && (!data.claudeEmail || !data.claudeLicense)) return false;
  }

  return true;
}

function updateButtons() {
  qs("#prevBtn").style.display = state.currentStep === 1 ? "none" : "inline-flex";
  qs("#nextBtn").style.display = state.currentStep === 1 || state.currentStep === state.totalSteps ? "none" : "inline-flex";
  qs("#submitBtn").style.display = state.currentStep === state.totalSteps ? "inline-flex" : "none";
  qs("#nextBtn").disabled = !isStepValid(state.currentStep);
  qs("#submitBtn").disabled = !isStepValid(state.currentStep);
}

async function submitForm(event) {
  event.preventDefault();
  if (!isStepValid(state.currentStep)) {
    return;
  }

  const payload = getFormData();
  const status = qs("#formStatus");
  status.textContent = "Ukládám odpovědi...";

  const res = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Nepodařilo se uložit odpovědi.";
    return;
  }

  showSuccess(data.response);
  await loadOverview();
}

function showSuccess(response) {
  qs("#formScreen").classList.add("hidden");
  qs("#dashboardScreen").classList.add("hidden");
  qs("#successScreen").classList.remove("hidden");
  qs("#successName").textContent = vocativeName(response.name);
  const summary = buildPersonSummary(response);
  state.lastSummary = summary;
  qs("#summaryBox").innerHTML = summary.rows
    .map(([key, value]) => `<div class="summary-row"><span class="summary-key">${escapeHtml(key)}</span><span class="summary-val">${escapeHtml(value)}</span></div>`)
    .join("");
  qs("#successScreen").scrollIntoView({ behavior: "smooth", block: "start" });
}

function vocativeName(fullName) {
  const first = String(fullName || "").split(" ")[1] || String(fullName || "").split(" ")[0] || "";
  const map = {
    michaela: "Michaelo",
    daria: "Dario",
    martin: "Martine",
    jakub: "Jakube",
    jan: "Jane",
    petr: "Petře",
    david: "Davide",
    tomáš: "Tomáši",
    jiří: "Jiří",
    michal: "Michale",
    ivo: "Ivo",
    jaroslav: "Jaroslave"
  };
  return map[first.toLowerCase()] || first;
}

function buildPersonSummary(response) {
  const rows = [
    ["Jméno", response.name],
    ["E-mail účastníka", response.email],
    ["n8n", compact(response.n8nStatus, response.n8nEmail || response.n8nUrl)],
    ["Google", compact(response.googleStatus, response.googleEmail)],
    ["Claude", compact(response.claudeStatus, response.claudeEmail, response.claudeLicense)],
    ["Gemini", compact(response.geminiStatus, response.geminiEmail)],
    ["ChatGPT", compact(response.chatgptStatus, response.chatgptEmail)],
    ["Perplexity", compact(response.perplexityStatus, response.perplexityEmail)],
    ["Software", compact(response.vscodeStatus, response.editorOther)],
    ["Claude nástroje", compact(response.coworkStatus, response.claudeCodeStatus, response.terminalStatus)],
    ["Technika", compact(response.internetStatus, response.emailAccessStatus, response.filesStatus)],
    ["Virtualizace", compact(response.hypervStatus, response.virtualMachinePlatformStatus)],
    ["Poznámka", response.technicalNote || "Bez poznámky"]
  ];

  const text = [
    `Příprava na školení AI - ${response.name}`,
    "",
    ...rows.map(([key, value]) => `${key}: ${value}`)
  ].join("\n");

  return { rows, text };
}

function compact(...values) {
  return values.filter(Boolean).join(" · ") || "-";
}

function openSummaryEmail() {
  const summary = state.lastSummary;
  if (!summary) {
    return;
  }
  const subject = "AI Adopce - příprava účastníka na školení";
  const href = `mailto:${SUMMARY_RECIPIENTS.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary.text)}`;
  window.location.href = href;
}

async function copySummary() {
  if (!state.lastSummary) {
    return;
  }
  await copyText(state.lastSummary.text, "Shrnutí je zkopírované do schránky.");
}

function buildOverallSummary() {
  const answered = state.overview.filter((item) => item.response);
  const missing = state.overview.filter((item) => !item.response);
  const lines = [
    "AI Adopce - souhrn přípravy na školení",
    "",
    `Vyplněno: ${answered.length}/${state.overview.length}`,
    `Chybí odpověď: ${missing.length}`,
    "",
    "Chybí vyplnit:",
    ...(missing.length ? missing.map((item) => `- ${item.name} (${item.email})`) : ["- nikdo"]),
    "",
    "Odpovědi účastníků:"
  ];

  for (const item of state.overview) {
    const response = item.response;
    lines.push("");
    lines.push(`--- ${item.name} (${item.email}) ---`);
    if (!response) {
      lines.push("Stav: nevyplněno");
      continue;
    }
    lines.push(`Vyplněno: ${new Date(response.createdAt).toLocaleString("cs-CZ")}`);
    lines.push(`n8n: ${response.n8nStatus || "-"} | e-mail: ${response.n8nEmail || response.n8nUrl || "-"}`);
    lines.push(`Google: ${response.googleStatus || "-"} | účet: ${response.googleEmail || "-"}`);
    lines.push(`Claude: ${response.claudeStatus || "-"} | účet: ${response.claudeEmail || "-"} | licence: ${response.claudeLicense || "-"}`);
    lines.push(`Gemini: ${response.geminiStatus || "-"} | účet: ${response.geminiEmail || "-"}`);
    lines.push(`ChatGPT: ${response.chatgptStatus || "-"} | účet: ${response.chatgptEmail || "-"}`);
    lines.push(`Perplexity: ${response.perplexityStatus || "-"} | účet: ${response.perplexityEmail || "-"}`);
    lines.push(`VS Code/editor: ${[response.vscodeStatus, response.editorOther].filter(Boolean).join(" · ") || "-"}`);
    lines.push(`Claude Cowork: ${response.coworkStatus || "-"}`);
    lines.push(`Claude Code: ${response.claudeCodeStatus || "-"}`);
    lines.push(`Terminál/IDE: ${response.terminalStatus || "-"}`);
    lines.push(`Hyper-V: ${response.hypervStatus || "-"}`);
    lines.push(`Platforma pro virtuální počítače: ${response.virtualMachinePlatformStatus || "-"}`);
    lines.push(`Internet / AI weby: ${response.internetStatus || "-"}`);
    lines.push(`Přístup k e-mailu: ${response.emailAccessStatus || "-"}`);
    lines.push(`Soubory: ${response.filesStatus || "-"}`);
    lines.push(`Poznámka k technické přípravě: ${response.technicalNote || "-"}`);
  }

  return lines.join("\n");
}

function openOverallEmail() {
  const subject = "AI Adopce - souhrn přípravy týmu na školení";
  const body = buildOverallSummary();
  window.location.href = `mailto:${SUMMARY_RECIPIENTS.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyOverallSummary() {
  await copyText(buildOverallSummary(), "Souhrn je zkopírovaný do schránky.");
}

async function loadOverview() {
  const res = await fetch("/api/overview");
  const data = await res.json();
  state.overview = data.overview;
  renderMetrics();
  renderRows();
}

function showDashboard() {
  const dashboard = qs("#dashboardScreen");
  const shouldOpen = dashboard.classList.contains("hidden");
  dashboard.classList.toggle("hidden", !shouldOpen);
  qs("#showDashboard").classList.toggle("active", shouldOpen);
  loadOverview();
  if (shouldOpen) {
    dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function showForm() {
  qs("#dashboardScreen").classList.add("hidden");
  qs("#showDashboard").classList.remove("active");
  qs("#showDashboard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function readiness(response) {
  if (!response) return 0;
  const keys = [
    "n8nStatus",
    "googleStatus",
    "claudeStatus",
    "vscodeStatus",
    "coworkStatus",
    "internetStatus",
    "emailAccessStatus",
    "filesStatus"
  ];
  return Math.round((keys.filter((key) => response[key]).length / keys.length) * 100);
}

function renderMetrics() {
  const total = state.overview.length;
  const answered = state.overview.filter((item) => item.response).length;
  const missing = total - answered;
  const notes = state.overview.filter((item) => item.response?.technicalNote).length;

  qs("#metrics").innerHTML = [
    ["Vyplněno", `${answered}/${total}`],
    ["Chybí odpověď", missing],
    ["Má poznámku", notes]
  ].map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderRows() {
  const sorted = [...state.overview].sort((a, b) => {
    if (a.response && !b.response) return -1;
    if (!a.response && b.response) return 1;
    return a.name.localeCompare(b.name, "cs");
  });
  qs("#overviewRows").innerHTML = sorted.map(({ name, email, dept, response }) => {
    if (!response) {
      return `
        <article class="overview-card missing-card collapsed">
          <button class="overview-person" type="button" data-toggle-card>
            <div>
              <div class="person">${escapeHtml(name)}</div>
              <span class="sub">${escapeHtml(email)}</span>
            </div>
            <span class="badge missing">Nevyplněno</span>
          </button>
          <div class="overview-details">
            <p class="empty-note">Čeká se na odpověď.</p>
          </div>
        </article>
      `;
    }

    return `
      <article class="overview-card collapsed">
        <button class="overview-person" type="button" data-toggle-card>
          <div>
            <div class="person">${escapeHtml(response.name)}</div>
            <span class="sub">${escapeHtml(response.email)}</span>
          </div>
          <div class="status-stack">
            ${badge(`${readiness(response)} %`, "ok")}
            <span class="sub">${new Date(response.createdAt).toLocaleString("cs-CZ")}</span>
          </div>
        </button>
        <div class="overview-sections overview-details">
          <section>
            <h3>Účty</h3>
            ${line("n8n", response.n8nStatus, response.n8nEmail || response.n8nUrl)}
            ${line("Google", response.googleStatus, response.googleEmail)}
            ${line("Claude", response.claudeStatus, [response.claudeEmail, response.claudeLicense].filter(Boolean).join(" · "))}
            ${line("Gemini", response.geminiStatus, response.geminiEmail)}
            ${line("ChatGPT", response.chatgptStatus, response.chatgptEmail)}
            ${line("Perplexity", response.perplexityStatus, response.perplexityEmail)}
          </section>
          <section>
            <h3>Software</h3>
            ${line("Editor", response.vscodeStatus, response.editorOther)}
            ${line("Cowork", response.coworkStatus)}
            ${line("Claude Code", response.claudeCodeStatus)}
            ${line("Terminál", response.terminalStatus)}
          </section>
          <section>
            <h3>Technika</h3>
            ${line("Internet", response.internetStatus)}
            ${line("E-mail", response.emailAccessStatus)}
            ${line("Soubory", response.filesStatus)}
            ${line("Hyper-V", response.hypervStatus)}
            ${line("VMP", response.virtualMachinePlatformStatus)}
          </section>
          <section>
            <h3>Poznámka</h3>
            <p class="note-text">${escapeHtml(response.technicalNote || "Bez poznámky")}</p>
          </section>
        </div>
      </article>
    `;
  }).join("");
  qsa("[data-toggle-card]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".overview-card").classList.toggle("collapsed");
    });
  });
}

function line(label, value, detail = "") {
  return `<div><span class="sub">${escapeHtml(label)}</span>${badge(value || "-", classFor(value))}${detail ? `<span class="sub">${escapeHtml(detail)}</span>` : ""}</div>`;
}

function badge(value, css = "warn") {
  return `<span class="badge ${css}">${escapeHtml(value)}</span>`;
}

function classFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (!normalized || normalized === "-") return "warn";
  if (badWords.some((word) => normalized.includes(word))) return "missing";
  if (goodWords.some((word) => normalized.includes(word))) return "ok";
  if (normalized.includes("nevím") || normalized.includes("potřebuji") || normalized.includes("částečně")) return "warn";
  return "warn";
}

function exportCsv() {
  const header = [
    "Jméno",
    "E-mail",
    "Vyplněno",
    "Účty",
    "Webové AI nástroje",
    "Software",
    "Technika",
    "Poznámka"
  ];

  const rows = state.overview.map(({ name, email, response }) => {
    if (!response) {
      return [name, email, "Nevyplněno", "", "", "", "", ""];
    }

    return [
      name,
      email,
      new Date(response.createdAt).toLocaleString("cs-CZ"),
      compact(
        `n8n: ${compact(response.n8nStatus, response.n8nEmail || response.n8nUrl) || "-"}`,
        `Google: ${compact(response.googleStatus, response.googleEmail) || "-"}`,
        `Claude: ${compact(response.claudeStatus, response.claudeEmail, response.claudeLicense) || "-"}`
      ),
      compact(
        `Gemini: ${compact(response.geminiStatus, response.geminiEmail) || "-"}`,
        `ChatGPT: ${compact(response.chatgptStatus, response.chatgptEmail) || "-"}`,
        `Perplexity: ${compact(response.perplexityStatus, response.perplexityEmail) || "-"}`
      ),
      compact(
        `Editor: ${compact(response.vscodeStatus, response.editorOther) || "-"}`,
        `Cowork: ${response.coworkStatus || "-"}`,
        `Claude Code: ${response.claudeCodeStatus || "-"}`,
        `Terminál: ${response.terminalStatus || "-"}`
      ),
      compact(
        `Internet: ${response.internetStatus || "-"}`,
        `E-mail: ${response.emailAccessStatus || "-"}`,
        `Soubory: ${response.filesStatus || "-"}`,
        `Hyper-V: ${response.hypervStatus || "-"}`,
        `Platforma VP: ${response.virtualMachinePlatformStatus || "-"}`
      ),
      response.technicalNote || ""
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ai-adopce-priprava-skoleni.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

qs("#nextBtn").addEventListener("click", () => {
  if (isStepValid(state.currentStep)) {
    goToStep(state.currentStep + 1);
  }
});
qs("#prevBtn").addEventListener("click", () => goToStep(state.currentStep - 1));
qs("#prepForm").addEventListener("submit", submitForm);
qs("#showDashboard").addEventListener("click", showDashboard);
qs("#backToForm").addEventListener("click", showForm);
qs("#exportCsv").addEventListener("click", exportCsv);
qs("#newResponseBtn").addEventListener("click", () => {
  window.location.href = `${window.location.pathname}?novy=${Date.now()}`;
});
qs("#emailSummaryBtn").addEventListener("click", openSummaryEmail);
qs("#copySummaryBtn").addEventListener("click", copySummary);
qs("#emailOverallSummary").addEventListener("click", openOverallEmail);
qs("#copyOverallSummary").addEventListener("click", copyOverallSummary);

function showNotice(message) {
  let notice = qs("#notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "notice";
    notice.className = "notice";
    document.body.append(notice);
  }
  notice.textContent = message;
  notice.classList.add("show");
  window.setTimeout(() => notice.classList.remove("show"), 2200);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showNotice(successMessage);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showNotice(successMessage);
  }
}

setupChoices();
updateProgress();
updateButtons();
updateToolEmails();
loadParticipants().then(loadOverview);
