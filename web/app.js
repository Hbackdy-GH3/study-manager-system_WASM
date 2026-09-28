/*
=========================================================
Study Management System - browser UI
=========================================================
All real data lives in C (linked list + queue).
This file only:
  1. prepares browser storage (IDBFS) for the C file functions
  2. calls the C functions through Module.ccall()
  3. draws the result as HTML

IMPORTANT: app.js is loaded BEFORE wasm.js (it defines Module).
=========================================================
*/

"use strict";

const DATA_DIR = "/data";
const DATA_PATH = DATA_DIR + "/data.txt";
const QUEUE_DATA_PATH = DATA_DIR + "/queue_data.txt";
const MAX_TEXT_BYTES = 49;                  // char[50] in C, minus '\0'

var Module = {
    onRuntimeInitialized: function () {
        startWasmApplication();
    },
    print: function (text) {
        console.log("[C]", text);
    },
    printErr: function (text) {
        console.warn("[C]", text);
    }
};


/*
=========================================================
STATE
=========================================================
*/

let wasmReady = false;
let storageAvailable = false;
let allTopics = [];
let allQueueItems = [];


/*
=========================================================
SMALL HELPERS
=========================================================
*/

function el(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function byteLength(text) {
    return new TextEncoder().encode(text).length;
}

const PRIORITY = {
    "1": { label: "High", css: "badge-high" },
    "0": { label: "Medium", css: "badge-medium" },
    "-1": { label: "Low", css: "badge-low" }
};

function priorityBadge(priority) {
    const p = PRIORITY[String(priority)] || { label: "Unknown", css: "" };
    return `<span class="badge ${p.css}">${p.label}</span>`;
}

function statusBadge(status) {
    return Number(status) === 1
        ? `<span class="badge badge-completed">Completed</span>`
        : `<span class="badge badge-pending">Pending</span>`;
}


/*
=========================================================
C CALLS (one place, so every call is wrapped the same way)
=========================================================
*/

const C = {
    init: () => Module.ccall("wasm_init", null, [], []),
    save: () => Module.ccall("wasm_save", null, [], []),
    reload: () => Module.ccall("wasm_reload", "number", [], []),
    importAppend: (text) =>
        Module.ccall("wasm_import_topics_append", "number", ["string"], [text]),
    test: () => Module.ccall("wasm_test", "number", [], []),

    addTopic: (subject, chapter, priority, status) =>
        Module.ccall("wasm_add_topic", "number",
            ["string", "string", "number", "number"],
            [subject, chapter, priority, status]),

    updateTopic: (index, subject, chapter, priority, status) =>
        Module.ccall("wasm_update_topic", "number",
            ["number", "string", "string", "number", "number"],
            [index, subject, chapter, priority, status]),

    deleteTopic: (index) =>
        Module.ccall("wasm_delete_topic", "number", ["number"], [index]),

    topicsJson: () => Module.ccall("wasm_get_topics_json", "string", [], []),
    queueJson: () => Module.ccall("wasm_get_queue_json", "string", [], []),

    available: (status, priority) =>
        Module.ccall("wasm_available_count", "number",
            ["number", "number"], [status, priority]),

    enqueue: (status, priority, count) =>
        Module.ccall("wasm_enqueue", "number",
            ["number", "number", "number"], [status, priority, count]),

    studyNext: (markDone) =>
        Module.ccall("wasm_study_next", "number", ["number"], [markDone ? 1 : 0]),

    clearQueue: () => Module.ccall("wasm_clear_queue", null, [], [])
};

function parseJsonArray(raw, what) {
    if (!raw)
        return [];
    try {
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    }
    catch (error) {
        console.error("Invalid " + what + " JSON:", error, raw);
        return [];
    }
}


/*
=========================================================
TOASTS + CONFIRM DIALOG (instead of alert / confirm)
=========================================================
*/

function toast(message, type = "info") {
    const area = el("toastArea");
    const node = document.createElement("div");
    node.className = "toast toast-" + type;
    node.textContent = message;
    area.appendChild(node);

    setTimeout(() => node.classList.add("hide"), 3200);
    setTimeout(() => node.remove(), 3600);
}

/*
    Shows the confirm dialog and resolves AFTER the dialog's "close" event.
    (Resolving earlier let a late "close" event from one dialog instantly
    close the next dialog - that made "Replace" impossible to click.)

    Returns "ok", "alt" or "cancel".
*/
function askChoice(title, message, okText = "Delete", altText = "") {
    return new Promise(resolve => {
        const dialog = el("confirmDialog");
        const ok = el("confirmOk");
        const alt = el("confirmAlt");
        const cancel = el("confirmCancel");
        let result = "cancel";

        el("confirmTitle").textContent = title;
        el("confirmMessage").textContent = message;
        ok.textContent = okText;
        alt.textContent = altText;
        alt.hidden = !altText;

        function onOk() { result = "ok"; dialog.close(); }
        function onAlt() { result = "alt"; dialog.close(); }
        function onCancel() { result = "cancel"; dialog.close(); }

        ok.addEventListener("click", onOk);
        alt.addEventListener("click", onAlt);
        cancel.addEventListener("click", onCancel);

        // fires for buttons AND the Esc key
        dialog.addEventListener("close", () => {
            ok.removeEventListener("click", onOk);
            alt.removeEventListener("click", onAlt);
            cancel.removeEventListener("click", onCancel);
            resolve(result);
        }, { once: true });

        dialog.showModal();
        cancel.focus();
    });
}

async function askConfirm(title, message, okText = "Delete") {
    return (await askChoice(title, message, okText)) === "ok";
}


/*
=========================================================
SAVE STATE PILL
=========================================================
*/

function setSaveState(state, text) {
    const node = el("saveState");
    node.dataset.state = state;
    node.textContent = text;
}

function setWasmMessage(text) {
    el("wasmMessage").textContent = text;
}


/*
=========================================================
THEME
=========================================================
*/

function applyTheme(theme) {
    if (theme === "dark" || theme === "light") {
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem("studyflow-theme", theme); } catch (e) { /* storage blocked */ }
    }
    else {
        delete document.documentElement.dataset.theme;
        try { localStorage.removeItem("studyflow-theme"); } catch (e) { /* storage blocked */ }
    }

    const button = el("themeToggle");
    if (!button)
        return;

    const activeTheme = document.documentElement.dataset.theme;
    button.textContent = activeTheme === "dark" ? "☀" : "◐";
    button.title = activeTheme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";
}

function setupTheme() {
    let saved = null;
    try { saved = localStorage.getItem("studyflow-theme"); } catch (e) { /* storage blocked */ }
    if (saved === "dark" || saved === "light")
        applyTheme(saved);
    else
        applyTheme();

    el("themeToggle").addEventListener("click", () => {
        const current = document.documentElement.dataset.theme;
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
    });
}


/*
=========================================================
BROWSER STORAGE (IDBFS)
=========================================================
C writes DATA_PATH with fopen()/fprintf(). That file lives in
memory. FS.syncfs(false) copies it into IndexedDB so it survives
a refresh; FS.syncfs(true) copies it back on start.
=========================================================
*/

function initializeBrowserStorage() {
    return new Promise(resolve => {

        if (!FS.analyzePath(DATA_DIR).exists)
            FS.mkdir(DATA_DIR);

        if (!FS.filesystems || !FS.filesystems.IDBFS) {
            // Old build without -lidbfs.js: works, but nothing is kept.
            console.warn("IDBFS missing - rebuild with build_wasm.bat (-lidbfs.js).");
            resolve(false);
            return;
        }

        try {
            FS.mount(FS.filesystems.IDBFS, {}, DATA_DIR);
        }
        catch (error) {
            console.error("IDBFS mount failed:", error);
            resolve(false);
            return;
        }

        FS.syncfs(true, error => {
            if (error) {
                console.error("IDBFS load failed:", error);
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
}


/*
    syncfs must not run twice at the same time.
    If a save is requested while one is running,
    one more save is done right after it.
*/
let syncRunning = false;
let syncAgain = false;

function persist() {
    if (!storageAvailable) {
        setSaveState("warn", "Not saved (no storage)");
        return;
    }
    if (syncRunning) {
        syncAgain = true;
        return;
    }

    syncRunning = true;
    setSaveState("saving", "Saving…");

    FS.syncfs(false, error => {
        syncRunning = false;

        if (error) {
            console.error("Browser save failed:", error);
            setSaveState("error", "Save failed");
            toast("Could not save to browser storage.", "error");
            return;
        }

        if (syncAgain) {
            syncAgain = false;
            persist();
            return;
        }

        setSaveState("saved", "All changes saved");
    });
}


/*
=========================================================
START
=========================================================
*/

async function startWasmApplication() {
    setWasmMessage("WebAssembly loaded. Opening browser storage…");

    storageAvailable = await initializeBrowserStorage();

    // load_data() in C reads DATA_PATH (if it exists)
    C.init();

    wasmReady = true;
    document.body.classList.remove("is-loading");

    if (storageAvailable) {
        setSaveState("saved", "All changes saved");
        setWasmMessage("Ready. Data is stored in this browser (IndexedDB) and survives refresh.");
    }
    else {
        setSaveState("warn", "Not saved (no storage)");
        setWasmMessage("Ready, but browser storage is unavailable – changes will be lost on refresh. Use Export to keep a copy.");
        toast("Browser storage unavailable – use Export to keep your data.", "error");
    }

    refreshAll();
}

function wasmNotReady() {
    if (wasmReady)
        return false;
    toast("WebAssembly is still loading…");
    return true;
}


/*
=========================================================
NAVIGATION
=========================================================
*/

function showSection(name) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.toggle("active", section.id === name + "-section");
    });

    document.querySelectorAll(".menu-btn").forEach(button => {
        const active = button.dataset.section === name;
        button.classList.toggle("active", active);
        if (active)
            button.setAttribute("aria-current", "page");
        else
            button.removeAttribute("aria-current");
    });
}

function setupNavigation() {
    document.querySelectorAll(".menu-btn").forEach(button => {
        button.addEventListener("click", () => showSection(button.dataset.section));
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            showSection(button.dataset.go);
            if (button.dataset.focus)
                el(button.dataset.focus)?.focus();
        });
    });
}


/*
=========================================================
ADD / EDIT DIALOG (one dialog for both)
=========================================================
*/

function openTopicDialog(index = -1) {
    if (wasmNotReady())
        return;

    const form = el("topicForm");
    form.reset();
    showFormError("");

    const editing = index >= 0;
    el("editIndex").value = String(index);
    el("topicDialogTitle").textContent = editing ? "Edit Topic" : "Add Topic";
    el("topicSubmitBtn").textContent = editing ? "Save Changes" : "Add Topic";

    if (editing) {
        const topic = allTopics.find(t => t.index === index);
        if (!topic)
            return;
        el("subjectInput").value = topic.subject;
        el("chapterInput").value = topic.chapter;
        el("priorityInput").value = String(topic.priority);
        el("statusInput").value = String(topic.status);
    }

    el("topicDialog").showModal();
    el("subjectInput").focus();
}

function showFormError(message) {
    const node = el("topicFormError");
    node.textContent = message;
    node.hidden = !message;
}

// Same rules as valid_text() in wasm_bridge.c
function validateText(name, value) {
    if (!value)
        return name + " is required.";
    if (value.includes(","))
        return name + " cannot contain a comma (,).";
    if (byteLength(value) > MAX_TEXT_BYTES)
        return name + " is too long (max " + MAX_TEXT_BYTES + " bytes; non-English letters use 2–3 bytes each).";
    return "";
}

function setupTopicDialog() {
    const dialog = el("topicDialog");

    dialog.querySelectorAll("[data-close]").forEach(button => {
        button.addEventListener("click", () => dialog.close());
    });

    // click on the dark backdrop closes the dialog
    dialog.addEventListener("click", event => {
        if (event.target === dialog)
            dialog.close();
    });

    document.querySelectorAll("[data-action='add']").forEach(button => {
        button.addEventListener("click", () => openTopicDialog(-1));
    });

    el("topicForm").addEventListener("submit", event => {
        event.preventDefault();
        if (wasmNotReady())
            return;

        const index = Number(el("editIndex").value);
        const subject = el("subjectInput").value.trim();
        const chapter = el("chapterInput").value.trim();
        const priority = Number(el("priorityInput").value);
        const status = Number(el("statusInput").value);

        const error = validateText("Subject", subject) || validateText("Chapter", chapter);
        if (error) {
            showFormError(error);
            return;
        }

        const editing = index >= 0;

        const duplicate = allTopics.some(t =>
            t.index !== index &&
            t.subject.toLowerCase() === subject.toLowerCase() &&
            t.chapter.toLowerCase() === chapter.toLowerCase());
        if (duplicate) {
            showFormError("This subject + chapter already exists.");
            return;
        }

        const ok = editing
            ? C.updateTopic(index, subject, chapter, priority, status)
            : C.addTopic(subject, chapter, priority, status);

        if (!ok) {
            showFormError("C rejected this topic. Check length and characters.");
            return;
        }

        dialog.close();
        persist();
        refreshAll();
        toast(editing ? "Topic updated." : "Topic added.", "success");
    });
}


/*
=========================================================
TOPICS TABLE
=========================================================
*/

function getVisibleTopics() {
    const search = el("topicSearch").value.trim().toLowerCase();
    const status = el("statusFilter").value;
    const priority = el("priorityFilter").value;

    return allTopics.filter(topic =>
        (!search ||
            topic.subject.toLowerCase().includes(search) ||
            topic.chapter.toLowerCase().includes(search)) &&
        (status === "all" || topic.status === Number(status)) &&
        (priority === "all" || topic.priority === Number(priority)));
}

function renderTopics() {
    const body = el("topicsTableBody");
    const topics = getVisibleTopics();

    el("resultCount").textContent = allTopics.length
        ? `Showing ${topics.length} of ${allTopics.length}`
        : "";

    if (allTopics.length === 0) {
        body.innerHTML = `
            <tr><td colspan="6" class="empty-state">
                No topics yet. Click <strong>+ Add Topic</strong> to add your first one.
            </td></tr>`;
        return;
    }

    if (topics.length === 0) {
        body.innerHTML = `
            <tr><td colspan="6" class="empty-state">No matching topics found.</td></tr>`;
        return;
    }

    body.innerHTML = topics.map(topic => `
        <tr class="${topic.status === 1 ? "is-done" : ""}">
            <td class="col-done" data-label="Done">
                <input type="checkbox" class="done-check" data-index="${topic.index}"
                       ${topic.status === 1 ? "checked" : ""}
                       aria-label="Mark ${escapeHtml(topic.subject)} – ${escapeHtml(topic.chapter)} as completed">
            </td>
            <td data-label="Subject" class="cell-subject">${escapeHtml(topic.subject)}</td>
            <td data-label="Chapter">${escapeHtml(topic.chapter)}</td>
            <td data-label="Priority">${priorityBadge(topic.priority)}</td>
            <td data-label="Status">${statusBadge(topic.status)}</td>
            <td class="col-actions">
                <div class="table-actions">
                    <button class="secondary-btn small-btn" type="button"
                            data-action="edit" data-index="${topic.index}">Edit</button>
                    <button class="danger-btn small-btn" type="button"
                            data-action="delete" data-index="${topic.index}">Delete</button>
                </div>
            </td>
        </tr>`).join("");
}

function toggleDone(index, done) {
    const topic = allTopics.find(t => t.index === index);
    if (!topic)
        return;

    const ok = C.updateTopic(index, topic.subject, topic.chapter, topic.priority, done ? 1 : 0);
    if (!ok) {
        toast("Could not update the topic.", "error");
    }
    else {
        persist();
    }
    refreshAll();

    // the table was redrawn - keep keyboard focus on the same checkbox
    document.querySelector(`.done-check[data-index="${index}"]`)?.focus();
}

async function deleteTopic(index) {
    const topic = allTopics.find(t => t.index === index);
    if (!topic)
        return;

    const inQueue = allQueueItems.some(item => item.index === index);
    const confirmed = await askConfirm(
        "Delete topic?",
        `"${topic.subject} – ${topic.chapter}" will be removed` +
        (inQueue ? " from the master list and from today's queue." : "."));

    if (!confirmed)
        return;

    if (!C.deleteTopic(index)) {
        toast("Could not delete the topic.", "error");
        return;
    }

    persist();
    refreshAll();
    toast("Topic deleted.", "success");
}

function setupTopics() {
    ["topicSearch", "statusFilter", "priorityFilter"].forEach(id => {
        el(id).addEventListener("input", renderTopics);
    });

    const body = el("topicsTableBody");

    body.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button || wasmNotReady())
            return;

        const index = Number(button.dataset.index);
        if (button.dataset.action === "edit")
            openTopicDialog(index);
        else if (button.dataset.action === "delete")
            deleteTopic(index);
    });

    body.addEventListener("change", event => {
        if (!event.target.classList.contains("done-check") || wasmNotReady())
            return;
        toggleDone(Number(event.target.dataset.index), event.target.checked);
    });
}


/*
=========================================================
QUEUE
=========================================================
*/

function queueItemHtml(item, isNext, onDashboard = false) {
    return `
        <div class="queue-item ${isNext ? "next" : ""} ${onDashboard ? "flat" : ""}">
            <div class="queue-text">
                ${isNext && !onDashboard ? `<span class="next-label">Up next</span>` : ""}
                <h3>${escapeHtml(item.subject)}</h3>
                <p>${escapeHtml(item.chapter)}</p>
            </div>
            <div class="queue-meta">
                ${priorityBadge(item.priority)}
                ${item.status === 1 ? statusBadge(1) : ""}
            </div>
            ${isNext ? `
            <div class="queue-buttons">
                <button class="primary-btn small-btn" type="button" data-study="done">
                    ${item.status === 1 ? "Done" : "Done ✓ Mark completed"}
                </button>
                <button class="secondary-btn small-btn" type="button" data-study="skip">Skip</button>
            </div>` : ""}
        </div>`;
}

function renderQueue() {
    const list = el("queueList");

    if (allQueueItems.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                No topics in today's queue. Choose status + priority above and click <strong>Add to Queue</strong>.
            </div>`;
    }
    else {
        list.innerHTML = allQueueItems
            .map((item, i) => queueItemHtml(item, i === 0))
            .join("");
    }

    renderUpNext();
}

function renderUpNext() {
    const card = el("upNextCard");
    const next = allQueueItems[0];

    if (!next) {
        const pending = allTopics.filter(t => t.status === 0).length;
        card.innerHTML = `
            <div class="up-next-empty">
                <div>
                    <h3>Nothing queued for today</h3>
                    <p>${pending
                        ? `You have ${pending} pending topic${pending === 1 ? "" : "s"}. Build today's queue to start.`
                        : allTopics.length ? "All topics are completed. 🎉" : "Add some topics to get started."}</p>
                </div>
                <button class="secondary-btn" type="button" data-open-queue>Plan today</button>
            </div>`;
        return;
    }

    card.innerHTML = `
        <span class="next-label">Up next · ${allQueueItems.length} in queue</span>
        ${queueItemHtml(next, true, true)}`;
}

function updateQueueAvailable() {
    if (!wasmReady)
        return;

    const available = C.available(
        Number(el("queueStatus").value),
        Number(el("queuePriority").value));

    el("queueAvailable").textContent = available;

    const input = el("queueNumber");
    input.max = Math.max(available, 1);
    if (Number(input.value) > available && available > 0)
        input.value = available;

    el("addToQueueBtn").disabled = available === 0;
}

function addToQueue(event) {
    event.preventDefault();
    if (wasmNotReady())
        return;

    const status = Number(el("queueStatus").value);
    const priority = Number(el("queuePriority").value);
    const count = Number(el("queueNumber").value);

    if (!Number.isInteger(count) || count <= 0) {
        toast("Enter a valid number of tasks.", "error");
        return;
    }

    const available = C.available(status, priority);
    if (available === 0) {
        toast("No matching topics left (already queued or none exist).", "error");
        return;
    }

    const added = C.enqueue(status, priority, Math.min(count, available));

    if (added < count)
        toast(`${added} topic(s) added – only ${added} matched.`);
    else
        toast(`${added} topic(s) added to today's queue.`, "success");

    if (added > 0)
        persist();

    refreshAll();
}

function studyNext(markDone) {
    if (wasmNotReady() || allQueueItems.length === 0)
        return;

    const next = allQueueItems[0];
    const wasPending = next.status === 0;

    if (!C.studyNext(markDone)) {
        toast("Queue is already empty.", "error");
        refreshAll();
        return;
    }

    persist();

    if (markDone && wasPending)
        toast(`"${next.chapter}" marked completed.`, "success");
    else
        toast(markDone ? "Done." : `Skipped "${next.chapter}".`);

    refreshAll();
}

async function clearQueue() {
    if (wasmNotReady() || allQueueItems.length === 0)
        return;

    const confirmed = await askConfirm(
        "Clear today's queue?",
        "Topics stay in your master list – only today's queue is emptied.",
        "Clear queue");

    if (!confirmed)
        return;

    C.clearQueue();
    persist();
    refreshAll();
}

function setupQueue() {
    el("queueStatus").addEventListener("change", updateQueueAvailable);
    el("queuePriority").addEventListener("change", updateQueueAvailable);
    el("queueForm").addEventListener("submit", addToQueue);
    el("clearQueueBtn").addEventListener("click", clearQueue);

    // Done / Skip buttons (queue page + dashboard card)
    document.addEventListener("click", event => {
        const study = event.target.closest("[data-study]");
        if (study)
            studyNext(study.dataset.study === "done");

        if (event.target.closest("[data-open-queue]"))
            showSection("queue");
    });
}


/*
=========================================================
DASHBOARD + PROGRESS
=========================================================
*/

function updateStats() {
    const total = allTopics.length;
    const completed = allTopics.filter(t => t.status === 1).length;
    const pending = total - completed;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    el("totalTopics").textContent = total;
    el("pendingTopics").textContent = pending;
    el("completedTopics").textContent = completed;
    el("queueCount").textContent = allQueueItems.length;

    const menuCount = el("menuQueueCount");
    menuCount.textContent = allQueueItems.length;
    menuCount.hidden = allQueueItems.length === 0;

    el("progressPercent").textContent = percentage + "%";
    el("progressFill").style.width = percentage + "%";
    el("progressBar").setAttribute("aria-valuenow", String(percentage));
    el("progressTotal").textContent = total;
    el("progressCompleted").textContent = completed;
    el("progressPending").textContent = pending;
    el("queueProgressCount").textContent = allQueueItems.length;

    el("priorityProgress").innerHTML = [1, 0, -1].map(p => {
        const group = allTopics.filter(t => t.priority === p);
        const done = group.filter(t => t.status === 1).length;
        const pct = group.length ? Math.round((done / group.length) * 100) : 0;
        return `
            <div class="priority-row">
                <div class="progress-row">
                    <span>${priorityBadge(p)}</span>
                    <span class="muted">${done} / ${group.length} done</span>
                </div>
                <div class="progress-bar small"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>`;
    }).join("");
}


/*
=========================================================
SAVE / EXPORT / IMPORT
=========================================================
*/

function setupDataButtons() {
    el("saveBtn").addEventListener("click", () => {
        if (wasmNotReady())
            return;
        C.save();
        persist();
        if (storageAvailable)
            toast("Saved to browser storage.", "success");
    });

    // Download data.txt - same format as the C console version
    el("exportBtn").addEventListener("click", () => {
        if (wasmNotReady())
            return;

        C.save();   // make sure the file exists and is up to date
        let text = "";
        try {
            text = FS.readFile(DATA_PATH, { encoding: "utf8" });
        }
        catch (error) {
            console.error(error);
        }

        const blob = new Blob([text], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "data.txt";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        toast(`Exported ${allTopics.length} topic(s) as data.txt.`, "success");
    });

    el("importBtn").addEventListener("click", () => {
        if (wasmNotReady())
            return;
        el("importFile").click();
    });

    el("importFile").addEventListener("change", async event => {
        const file = event.target.files[0];
        event.target.value = "";   // allow picking the same file again
        if (!file)
            return;

        let text;
        try {
            text = await file.text();
        }
        catch (error) {
            console.error("Could not read import file:", error);
            toast("Could not read the selected file.", "error");
            return;
        }

        const lineRule = /^[^,\r\n]{1,49},[^,\r\n]{1,49},-?[01],[01]\s*$/;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const valid = lines.filter(line => lineRule.test(line));

        if (valid.length === 0) {
            toast(
                "No valid topics found. Expected lines like: Maths,Fourier series,1,0",
                "error"
            );
            return;
        }

        /*
         * Remove duplicates before append.
         * The application treats subject + chapter as the unique topic key.
         */
        const existingKeys = new Set(
            allTopics.map(topic =>
                `${topic.subject.trim().toLowerCase()}\u0000${topic.chapter.trim().toLowerCase()}`
            )
        );

        const appendLines = [];
        let duplicateCount = 0;

        for (const line of valid) {
            const parts = line.trim().split(",");
            if (parts.length !== 4)
                continue;

            const subject = parts[0].trim();
            const chapter = parts[1].trim();
            const key = `${subject.toLowerCase()}\u0000${chapter.toLowerCase()}`;

            if (existingKeys.has(key)) {
                duplicateCount++;
                continue;
            }

            existingKeys.add(key);
            appendLines.push(line.trim());
        }

        const skipped = lines.length - valid.length;

        // same subject + chapter twice inside the file -> keep the first one
        const fileKeys = new Set();
        const uniqueValid = valid.filter(line => {
            const [subject, chapter] = line.split(",");
            const key = `${subject.trim().toLowerCase()}\u0000${chapter.trim().toLowerCase()}`;
            if (fileKeys.has(key))
                return false;
            fileKeys.add(key);
            return true;
        });

        // One dialog, three outcomes: Add / Replace / Cancel
        const choice = await askChoice(
            "Import topics",
            `"${file.name}" has ${uniqueValid.length} topic(s).` +
            ` Add: keeps your ${allTopics.length} topic(s) and today's queue, adds ${appendLines.length} new` +
            (duplicateCount ? ` (${duplicateCount} already exist)` : "") + "." +
            ` Replace: deletes your current topics and clears the queue.` +
            (skipped ? ` ${skipped} invalid line(s) will be skipped.` : ""),
            "Add new",
            "Replace all"
        );

        if (choice === "ok") {
            if (appendLines.length === 0) {
                toast("Nothing new to add. All valid topics are already present.");
                return;
            }

            /*
                ccall copies strings onto the small WASM stack,
                so a big file is sent in chunks of 100 lines.
            */
            let count = 0;
            for (let i = 0; i < appendLines.length; i += 100)
                count += C.importAppend(appendLines.slice(i, i + 100).join("\n"));

            if (count <= 0) {
                toast("No topics were imported.", "error");
                return;
            }

            C.save();
            persist();
            refreshAll();
            toast(
                `Added ${count} new topic(s) to your existing list.` +
                (duplicateCount ? ` ${duplicateCount} duplicate(s) skipped.` : ""),
                "success"
            );
            return;
        }

        if (choice !== "alt")
            return;

        FS.writeFile(DATA_PATH, uniqueValid.join("\n") + "\n");

        const count = C.reload();   // C frees the old list and runs load_data()
        C.save();                   // rewrite in the list's sorted order
        persist();
        refreshAll();

        toast(`Imported ${count} topic(s) and replaced the current list.`, "success");
    });

    el("wasmTestBtn").addEventListener("click", () => {
        if (wasmNotReady())
            return;
        const ok = C.test();
        toast(ok ? "C replied: WASM is working!" : "No reply from C.", ok ? "success" : "error");
    });
}


/*
=========================================================
REFRESH EVERYTHING FROM C
=========================================================
*/

function refreshAll() {
    if (!wasmReady)
        return;

    allTopics = parseJsonArray(C.topicsJson(), "topic");
    allQueueItems = parseJsonArray(C.queueJson(), "queue");

    renderTopics();
    renderQueue();
    updateStats();
    updateQueueAvailable();
}


/*
=========================================================
KEYBOARD SHORTCUTS
=========================================================
*/

function setupShortcuts() {
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            showSection("topics");
            el("topicSearch").focus();
        }

        if (event.key === "Escape") {
            document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
        }
    });
}


/*
=========================================================
STARTUP
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    setupNavigation();
    setupShortcuts();
    setupTopicDialog();
    setupTopics();
    setupQueue();
    setupDataButtons();
});
