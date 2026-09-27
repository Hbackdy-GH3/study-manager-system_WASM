/*
=========================================================
WASM MODULE CONFIG
=========================================================
IMPORTANT:
app.js is loaded BEFORE wasm.js in index.html.
=========================================================
*/

var Module = {
    onRuntimeInitialized: function () {
        startWasmApplication();
    }
};


/*
=========================================================
GLOBAL STATE
=========================================================
*/

let wasmReady = false;
let allTopics = [];
let allQueueItems = [];


/*
=========================================================
DOM HELPERS
=========================================================
*/

function el(id) {
    return document.getElementById(id);
}


/*
=========================================================
WASM STATUS
=========================================================
*/

function setWasmStatus(text) {
    const node = el("wasmStatus");

    if (node)
        node.textContent = text;
}


function setWasmMessage(text) {
    const node = el("wasmMessage");

    if (node)
        node.textContent = text;
}


/*
=========================================================
BROWSER FILESYSTEM / PERSISTENCE
=========================================================
*/

function initializeBrowserStorage(done) {

    try {

        if (
            typeof FS === "undefined" ||
            !FS.filesystems ||
            !FS.filesystems.IDBFS
        ) {
            setWasmMessage(
                "Browser persistence filesystem is unavailable."
            );

            done();
            return;
        }


        const pathExists =
            FS.analyzePath("/data").exists;


        if (!pathExists) {
            FS.mkdir("/data");
        }


        FS.mount(
            FS.filesystems.IDBFS,
            {},
            "/data"
        );


        FS.chdir("/data");


        FS.syncfs(
            true,
            function (error) {

                if (error) {

                    console.error(
                        "IDBFS load failed:",
                        error
                    );

                    setWasmMessage(
                        "Browser storage could not be loaded."
                    );

                    done();
                    return;
                }


                importInitialDataIfNeeded(done);
            }
        );

    }
    catch (error) {

        console.error(
            "Storage initialization failed:",
            error
        );

        done();
    }

}


function importInitialDataIfNeeded(done) {

    const exists =
        FS.analyzePath("/data.txt").exists;


    if (exists) {

        Module.ccall(
            "wasm_init",
            null,
            [],
            []
        );

        done();
        return;
    }


    fetch("data/data.txt")
        .then(response => {

            if (!response.ok) {
                throw new Error("No seed data");
            }

            return response.text();

        })
        .then(text => {

            if (text.trim()) {

                FS.writeFile(
                    "/data.txt",
                    text
                );

                FS.syncfs(
                    false,
                    function (error) {

                        if (error) {
                            console.error(
                                "Seed sync failed:",
                                error
                            );
                        }

                        Module.ccall(
                            "wasm_init",
                            null,
                            [],
                            []
                        );

                        done();

                    }
                );

            }
            else {
                done();
            }

        })
        .catch(() => {
            done();
        });
}


function syncBrowserStorage() {

    if (
        typeof FS === "undefined" ||
        typeof FS.syncfs !== "function"
    ) {
        return;
    }


    FS.syncfs(
        false,
        function (error) {

            if (error) {

                console.error(
                    "Browser save failed:",
                    error
                );

                setWasmMessage(
                    "Save failed."
                );

                return;
            }


            setWasmMessage(
                "Saved successfully."
            );
        }
    );
}


/*
=========================================================
WASM START
=========================================================
*/

function startWasmApplication() {

    wasmReady = true;

    setWasmStatus("WASM: Ready");

    setWasmMessage(
        "WebAssembly loaded successfully."
    );


    initializeBrowserStorage(
        function () {

            refreshAll();

            setWasmMessage(
                "Study system is ready."
            );

        }
    );


    console.log("WASM is ready.");
}


function wasmNotReady() {

    if (wasmReady)
        return false;

    alert(
        "WebAssembly is still loading."
    );

    return true;
}


/*
=========================================================
NAVIGATION
=========================================================
*/

function showSection(name) {

    document
        .querySelectorAll(".page-section")
        .forEach(section => {
            section.classList.remove("active");
        });


    const target =
        el(name + "-section");


    if (target)
        target.classList.add("active");


    document
        .querySelectorAll(".menu-btn")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.section === name
            );

        });

}


function setupNavigation() {

    document
        .querySelectorAll(".menu-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                function () {
                    showSection(
                        button.dataset.section
                    );
                }
            );

        });


    const searchButton =
        el("searchTopicBtn");


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            function () {

                showSection("topics");

                const input =
                    el("topicSearch");

                if (input) {
                    input.focus();
                }

            }
        );

    }


    const queueButton =
        el("queueBtn");


    if (queueButton) {

        queueButton.addEventListener(
            "click",
            function () {
                showSection("queue");
            }
        );

    }


    const progressButton =
        el("progressBtn");


    if (progressButton) {

        progressButton.addEventListener(
            "click",
            function () {
                showSection("progress");
            }
        );

    }

}


/*
=========================================================
MODALS
=========================================================
*/

function openAddModal() {

    const modal =
        el("topicModal");

    if (modal)
        modal.classList.remove("hidden");

}


function closeAddModal() {

    const modal =
        el("topicModal");

    if (modal)
        modal.classList.add("hidden");

}


function openEditModal(index) {

    const topic =
        allTopics.find(
            item =>
                Number(item.index) === Number(index)
        );


    if (!topic)
        return;


    el("editIndex").value =
        topic.index;

    el("editSubject").value =
        topic.subject;

    el("editChapter").value =
        topic.chapter;

    el("editPriority").value =
        String(topic.priority);

    el("editStatus").value =
        String(topic.status);


    el("editModal")
        .classList.remove("hidden");

}


function closeEditModal() {

    el("editModal")
        .classList.add("hidden");

}


function setupModals() {

    el("addTopicBtn")
        ?.addEventListener(
            "click",
            openAddModal
        );


    el("openAddTopic")
        ?.addEventListener(
            "click",
            openAddModal
        );


    el("closeModal")
        ?.addEventListener(
            "click",
            closeAddModal
        );


    el("cancelAddTopic")
        ?.addEventListener(
            "click",
            closeAddModal
        );


    el("closeEditModal")
        ?.addEventListener(
            "click",
            closeEditModal
        );


    el("cancelEdit")
        ?.addEventListener(
            "click",
            closeEditModal
        );


    el("topicModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    el("topicModal")
                ) {
                    closeAddModal();
                }

            }
        );


    el("editModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    el("editModal")
                ) {
                    closeEditModal();
                }

            }
        );


    document.addEventListener(
        "keydown",
        event => {

            if (event.key === "Escape") {

                closeAddModal();
                closeEditModal();

            }

        }
    );

}


/*
=========================================================
ADD TOPIC
=========================================================
*/

function setupAddTopicForm() {

    const form =
        el("topicForm");


    if (!form)
        return;


    form.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            if (wasmNotReady())
                return;


            const subject =
                el("subjectInput")
                    .value
                    .trim();


            const chapter =
                el("chapterInput")
                    .value
                    .trim();


            const priority =
                Number(
                    el("priorityInput").value
                );


            const status =
                Number(
                    el("statusInput").value
                );


            if (!subject || !chapter) {

                alert(
                    "Subject and Chapter are required."
                );

                return;
            }


            try {

                Module.ccall(
                    "wasm_add_topic",
                    null,
                    [
                        "string",
                        "string",
                        "number",
                        "number"
                    ],
                    [
                        subject,
                        chapter,
                        priority,
                        status
                    ]
                );


                syncBrowserStorage();

                form.reset();

                closeAddModal();

                refreshAll();

            }
            catch (error) {

                console.error(
                    "Add topic failed:",
                    error
                );

                alert(
                    "Could not add the topic."
                );

            }

        }
    );

}


/*
=========================================================
EDIT TOPIC
=========================================================
*/

function setupEditForm() {

    const form =
        el("editForm");


    if (!form)
        return;


    form.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            if (wasmNotReady())
                return;


            const index =
                Number(
                    el("editIndex").value
                );


            const subject =
                el("editSubject")
                    .value
                    .trim();


            const chapter =
                el("editChapter")
                    .value
                    .trim();


            const priority =
                Number(
                    el("editPriority").value
                );


            const status =
                Number(
                    el("editStatus").value
                );


            if (!subject || !chapter) {

                alert(
                    "Subject and Chapter are required."
                );

                return;
            }


            const success =
                Module.ccall(
                    "wasm_update_topic",
                    "number",
                    [
                        "number",
                        "string",
                        "string",
                        "number",
                        "number"
                    ],
                    [
                        index,
                        subject,
                        chapter,
                        priority,
                        status
                    ]
                );


            if (!success) {

                alert(
                    "Could not update the topic."
                );

                return;
            }


            syncBrowserStorage();

            closeEditModal();

            refreshAll();

        }
    );

}


/*
=========================================================
DELETE TOPIC
=========================================================
*/

function deleteTopic(index) {

    if (wasmNotReady())
        return;


    const topic =
        allTopics.find(
            item =>
                Number(item.index) === Number(index)
        );


    if (!topic)
        return;


    const confirmed =
        window.confirm(
            `Delete "${topic.subject} - ${topic.chapter}"?`
        );


    if (!confirmed)
        return;


    const success =
        Module.ccall(
            "wasm_delete_topic",
            "number",
            ["number"],
            [Number(index)]
        );


    if (!success) {

        alert(
            "Could not delete the topic."
        );

        return;
    }


    syncBrowserStorage();

    refreshAll();

}


/*
=========================================================
WASM TOPIC JSON
=========================================================
*/

function getTopics() {

    if (!wasmReady)
        return [];


    const raw =
        Module.ccall(
            "wasm_get_topics_json",
            "string",
            [],
            []
        );


    if (!raw)
        return [];


    try {

        const data =
            JSON.parse(raw);

        return Array.isArray(data)
            ? data
            : [];

    }
    catch (error) {

        console.error(
            "Invalid topic JSON:",
            error
        );

        return [];
    }

}


/*
=========================================================
QUEUE JSON
=========================================================
*/

function getQueue() {

    if (!wasmReady)
        return [];


    const raw =
        Module.ccall(
            "wasm_get_queue_json",
            "string",
            [],
            []
        );


    if (!raw)
        return [];


    try {

        const data =
            JSON.parse(raw);

        return Array.isArray(data)
            ? data
            : [];

    }
    catch (error) {

        console.error(
            "Invalid queue JSON:",
            error
        );

        return [];
    }

}


/*
=========================================================
LABEL HELPERS
=========================================================
*/

function priorityLabel(priority) {

    switch (Number(priority)) {

        case 1:
            return "High";

        case 0:
            return "Medium";

        case -1:
            return "Low";

        default:
            return "Unknown";
    }

}


function statusLabel(status) {

    return Number(status) === 1
        ? "Completed"
        : "Pending";

}


function priorityClass(priority) {

    switch (Number(priority)) {

        case 1:
            return "badge-high";

        case 0:
            return "badge-medium";

        case -1:
            return "badge-low";

        default:
            return "";
    }

}


function statusClass(status) {

    return Number(status) === 1
        ? "badge-completed"
        : "badge-pending";

}


function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/*
=========================================================
TOPIC FILTER
=========================================================
*/

function getVisibleTopics() {

    const search =
        el("topicSearch")
            ?.value
            .trim()
            .toLowerCase() || "";


    const status =
        el("statusFilter")
            ?.value || "all";


    const priority =
        el("priorityFilter")
            ?.value || "all";


    return allTopics.filter(topic => {

        const matchesSearch =
            !search ||
            topic.subject
                .toLowerCase()
                .includes(search) ||
            topic.chapter
                .toLowerCase()
                .includes(search);


        const matchesStatus =
            status === "all" ||
            Number(topic.status) === Number(status);


        const matchesPriority =
            priority === "all" ||
            Number(topic.priority) === Number(priority);


        return (
            matchesSearch &&
            matchesStatus &&
            matchesPriority
        );

    });

}


function setupTopicFilters() {

    [
        "topicSearch",
        "statusFilter",
        "priorityFilter"
    ]
        .forEach(id => {

            el(id)?.addEventListener(
                "input",
                renderTopics
            );

            el(id)?.addEventListener(
                "change",
                renderTopics
            );

        });

}


/*
=========================================================
RENDER TOPIC TABLE
=========================================================
*/

function renderTopics() {

    const table =
        el("topicsTableBody");


    if (!table)
        return;


    const topics =
        getVisibleTopics();


    if (topics.length === 0) {

        table.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="empty-state">
                    No matching topics found.
                </td>
            </tr>
        `;

        return;
    }


    table.innerHTML =
        topics.map(topic => {

            const priority =
                priorityLabel(topic.priority);


            const status =
                statusLabel(topic.status);


            return `
                <tr>

                    <td>
                        ${escapeHtml(topic.subject)}
                    </td>

                    <td>
                        ${escapeHtml(topic.chapter)}
                    </td>

                    <td>
                        <span class="badge ${priorityClass(topic.priority)}">
                            ${priority}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${statusClass(topic.status)}">
                            ${status}
                        </span>
                    </td>

                    <td>
                        <div class="table-actions">

                            <button
                                class="secondary-btn small-btn"
                                type="button"
                                data-action="edit"
                                data-index="${topic.index}">
                                Edit
                            </button>

                            <button
                                class="danger-btn small-btn"
                                type="button"
                                data-action="delete"
                                data-index="${topic.index}">
                                Delete
                            </button>

                        </div>
                    </td>

                </tr>
            `;

        }).join("");

}


/*
=========================================================
TABLE ACTIONS
=========================================================
*/

function setupTopicTableActions() {

    el("topicsTableBody")
        ?.addEventListener(
            "click",
            function (event) {

                const button =
                    event.target.closest(
                        "button[data-action]"
                    );


                if (!button)
                    return;


                const index =
                    Number(
                        button.dataset.index
                    );


                if (
                    button.dataset.action ===
                    "edit"
                ) {

                    openEditModal(index);

                }
                else if (
                    button.dataset.action ===
                    "delete"
                ) {

                    deleteTopic(index);

                }

            }
        );

}


/*
=========================================================
DASHBOARD
=========================================================
*/

function updateDashboard() {

    const total =
        allTopics.length;


    const completed =
        allTopics.filter(
            topic =>
                Number(topic.status) === 1
        ).length;


    const pending =
        total - completed;


    el("totalTopics").textContent =
        total;


    el("pendingTopics").textContent =
        pending;


    el("completedTopics").textContent =
        completed;


    el("queueCount").textContent =
        allQueueItems.length;

}


/*
=========================================================
PROGRESS
=========================================================
*/

function updateProgress() {

    const total =
        allTopics.length;


    const completed =
        allTopics.filter(
            topic =>
                Number(topic.status) === 1
        ).length;


    const pending =
        total - completed;


    const percentage =
        total === 0
            ? 0
            : Math.round(
                (completed / total) * 100
            );


    el("progressPercent")
        .textContent =
        percentage + "%";


    el("progressFill")
        .style.width =
        percentage + "%";


    el("progressTotal")
        .textContent =
        total;


    el("progressCompleted")
        .textContent =
        completed;


    el("progressPending")
        .textContent =
        pending;


    el("queueProgressCount")
        .textContent =
        allQueueItems.length;

}


/*
=========================================================
QUEUE
=========================================================
*/

function updateQueueAvailable() {

    if (!wasmReady)
        return;


    const status =
        Number(
            el("queueStatus").value
        );


    const priority =
        Number(
            el("queuePriority").value
        );


    const available =
        Module.ccall(
            "wasm_available_count",
            "number",
            [
                "number",
                "number"
            ],
            [
                status,
                priority
            ]
        );


    el("queueAvailable")
        .textContent =
        available;

}


function renderQueue() {

    const list =
        el("queueList");


    if (!list)
        return;


    allQueueItems =
        getQueue();


    if (allQueueItems.length === 0) {

        list.innerHTML = `
            <div class="empty-state">
                No topics in today's queue.
            </div>
        `;

        return;
    }


    list.innerHTML =
        allQueueItems
            .map((item, index) => {

                const next =
                    index === 0;


                return `
                    <div
                        class="queue-item ${next ? "next" : ""}">

                        <div>

                            ${
                                next
                                    ? `<span class="next-label">Next</span>`
                                    : ""
                            }

                            <h3>
                                ${escapeHtml(item.subject)}
                            </h3>

                            <p>
                                ${escapeHtml(item.chapter)}
                            </p>

                        </div>


                        <div>

                            <span class="badge ${priorityClass(item.priority)}">
                                ${priorityLabel(item.priority)}
                            </span>

                        </div>

                    </div>
                `;

            })
            .join("");

}


function addToQueue() {

    if (wasmNotReady())
        return;


    const status =
        Number(
            el("queueStatus").value
        );


    const priority =
        Number(
            el("queuePriority").value
        );


    const count =
        Number(
            el("queueNumber").value
        );


    if (!Number.isInteger(count) || count <= 0) {

        alert(
            "Enter a valid number of tasks."
        );

        return;
    }


    const available =
        Module.ccall(
            "wasm_available_count",
            "number",
            [
                "number",
                "number"
            ],
            [
                status,
                priority
            ]
        );


    if (available === 0) {

        alert(
            "No matching topics are available."
        );

        return;
    }


    const requested =
        Math.min(
            count,
            available
        );


    const added =
        Module.ccall(
            "wasm_enqueue",
            "number",
            [
                "number",
                "number",
                "number"
            ],
            [
                status,
                priority,
                requested
            ]
        );


    if (added <= 0) {

        alert(
            "No topic was added to the queue."
        );

        return;
    }


    if (added < count) {

        alert(
            `${added} topic(s) added because only ${added} matched.`
        );

    }


    renderQueue();

    updateDashboard();

    updateProgress();

    updateQueueAvailable();

}


function studyNext() {

    if (wasmNotReady())
        return;


    if (allQueueItems.length === 0) {

        alert(
            "Today's queue is empty."
        );

        return;
    }


    const next =
        allQueueItems[0];


    const shouldStudy =
        window.confirm(
            `Study next:\n\n${next.subject} - ${next.chapter}`
        );


    if (!shouldStudy)
        return;


    const success =
        Module.ccall(
            "wasm_dequeue",
            "number",
            [],
            []
        );


    if (!success) {

        alert(
            "Queue is already empty."
        );

        return;
    }


    renderQueue();

    updateDashboard();

    updateProgress();

    updateQueueAvailable();

}


function clearQueue() {

    if (wasmNotReady())
        return;


    if (allQueueItems.length === 0)
        return;


    const confirmed =
        window.confirm(
            "Clear today's entire queue?"
        );


    if (!confirmed)
        return;


    Module.ccall(
        "wasm_clear_queue",
        null,
        [],
        []
    );


    renderQueue();

    updateDashboard();

    updateProgress();

    updateQueueAvailable();

}


function setupQueue() {

    el("queueStatus")
        ?.addEventListener(
            "change",
            updateQueueAvailable
        );


    el("queuePriority")
        ?.addEventListener(
            "change",
            updateQueueAvailable
        );


    el("addToQueueBtn")
        ?.addEventListener(
            "click",
            addToQueue
        );


    el("studyNextBtn")
        ?.addEventListener(
            "click",
            studyNext
        );


    el("clearQueueBtn")
        ?.addEventListener(
            "click",
            clearQueue
        );

}


/*
=========================================================
SAVE BUTTON
=========================================================
*/

function setupSave() {

    el("saveBtn")
        ?.addEventListener(
            "click",
            function () {

                if (wasmNotReady())
                    return;


                Module.ccall(
                    "wasm_save",
                    null,
                    [],
                    []
                );


                syncBrowserStorage();

            }
        );

}


/*
=========================================================
WASM TEST
=========================================================
*/

function setupWasmTest() {

    el("wasmTestBtn")
        ?.addEventListener(
            "click",
            function () {

                if (wasmNotReady())
                    return;


                Module.ccall(
                    "wasm_test",
                    null,
                    [],
                    []
                );

            }
        );

}


/*
=========================================================
FULL REFRESH
=========================================================
*/

function refreshAll() {

    if (!wasmReady)
        return;


    allTopics =
        getTopics();


    allQueueItems =
        getQueue();


    renderTopics();

    renderQueue();

    updateDashboard();

    updateProgress();

    updateQueueAvailable();

}


/*
=========================================================
APP STARTUP
=========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        setupNavigation();

        setupModals();

        setupAddTopicForm();

        setupEditForm();

        setupTopicFilters();

        setupTopicTableActions();

        setupQueue();

        setupSave();

        setupWasmTest();


        console.log(
            "Study Management UI loaded."
        );

    }
);