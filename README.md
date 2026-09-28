# StudyFlow — Study Management System

A C-based study manager with a browser frontend powered by WebAssembly.

The project keeps the real data structures and application rules in C:

- Doubly linked list for the master topic list
- Priority-sorted insertion
- Search and case-insensitive matching
- Filters
- Topic update and deletion
- Singly linked study queue
- Queue persistence
- Progress statistics
- File handling

The browser UI is a JavaScript/HTML/CSS layer over the C core.

---

## Project structure

```text
StudyManagementSystem-WASM/
│
├── include/
│   ├── topic.h
│   └── wasm_bridge.h
│
├── src/
│   ├── globals.c
│   ├── input.c
│   ├── insert.c
│   ├── delete.c
│   ├── display.c
│   ├── filters.c
│   ├── file_handling.c
│   ├── progress_stat.c
│   ├── search.c
│   ├── temp_session.c
│   ├── update.c
│   └── wasm_bridge.c
│
├── data/
│   ├── data.txt
│   └── queue_data.txt
│
├── web/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── wasm.js
│   └── wasm.wasm
│
├── main.c
├── build_native.bat
├── build_wasm.bat
└── README.md
```

`main.c` is only for the native console build. It is not included in the browser/WASM build.

---

## Core data structures

### Topic

```c
typedef struct Topic{
    char subject[50];
    char chapter[50];
    int priority;
    int is_done;
    struct Topic* next;
    struct Topic* prev;
} Topic;
```

Priority:

```text
 1  = High
 0  = Medium
-1  = Low
```

Status:

```text
0 = Pending
1 = Completed
```

### QueueNode

```c
typedef struct QueueNode{
    Topic* topic;
    struct QueueNode* next;
} QueueNode;
```

The queue stores `Topic*` references instead of copying the full topic.

---

# New persistence design

The project now has two save modes.

```c
enum SaveMode {save_master, save_queue};
extern enum SaveMode currMode;
```

`currMode` tells `save_data()` WHAT to save:

```text
save_master -> data.txt
save_queue  -> queue_data.txt
```

There is a separate enum for WHETHER an operation should save:

```c
enum when2save {saveY, saveN};
extern enum when2save askYN;
```

```text
saveY -> save normally
saveN -> temporarily disable saving while loading data
```

This keeps the two responsibilities separate.

---

# File format

### Master list

`data.txt`

```text
subject,chapter,priority,status
Maths,Fourier series,1,0
Network analysis,graphs,0,0
English,grammar,-1,0
```

### Queue

`queue_data.txt`

The queue file stores:

```text
subject,chapter,priority,status
```

When the queue is loaded, the current `Topic*` is recovered from the master list using:

```text
subject + chapter
```

This means the queue uses the latest priority/status from the master topic after restart.

---

# Browser persistence

The browser mounts:

```text
/data
```

using Emscripten IDBFS.

Both files live in that directory:

```text
/data/data.txt
/data/queue_data.txt
```

The browser therefore persists:

```text
Master topics  -> data.txt
Study queue    -> queue_data.txt
```

The JavaScript layer calls `FS.syncfs()` so the Emscripten filesystem is synchronized with IndexedDB.

Refreshing the page does not remove stored data.

Clearing browser site data / IndexedDB removes it.

---

# Important C flow

## Insert

```text
insert_prior()
      |
      v
insert_node_by_priority()
      |
      +--> insertfront()
      +--> insertback()
      +--> insert_any()
      |
      v
save master
```

The save is intentionally centralized in `insert_prior()` instead of repeating the same save block in three insert functions.

While loading:

```c
askYN = saveN;
```

so `insert_prior()` does not overwrite the file that is currently being read.

---

## Update

Changing priority:

```text
remove_node()
      |
      v
change priority
      |
      v
insert_node_by_priority()
      |
      v
save master + queue
```

Updating subject/chapter/status also saves both files.

The queue file is rewritten after an update so a queued topic remains loadable even when its subject/chapter changes.

---

## Delete

Deleting a topic first removes any queue node that points to it.

```text
queue_remove_topic()
        |
        v
remove_node()
        |
        v
free(topic)
        |
        v
save master + queue
```

This prevents dangling `Topic*` pointers inside the queue.

---

## Queue

Adding to queue:

```text
wasm_enqueue()
      |
      v
enqueue()
      |
      v
save queue
```

Removing from queue:

```text
wasm_dequeue()
      |
      v
save queue
```

Clear queue:

```text
clear_queue()
      |
      v
save queue
```

Study Next:

```text
remove queue front
      |
      v
save queue
      |
      +--> mark completed
              |
              v
          save master
```

---

# Browser frontend

The frontend is designed as a study dashboard.

### Dashboard

- Total topics
- Pending topics
- Completed topics
- Today's queue count
- Up Next card
- Quick actions
- WebAssembly status

### Master Topics

- Search
- Status filter
- Priority filter
- Add topic
- Edit topic
- Delete topic
- Mark completed directly
- Priority/status badges

### Today's Queue

- Select status
- Select priority
- Choose number of tasks
- Show available matching topics
- Add to queue
- Study Next
- Skip
- Clear Queue
- Queue is persistent

### Progress

- Overall completion
- Completed / pending / total
- Queue count
- Progress by priority

### UI

- Responsive layout
- Mobile-friendly topic cards
- Light/dark mode
- Keyboard shortcut:

```text
Ctrl + K
```

focuses topic search.

---

# Build native console version

From the project root:

```powershell
.\build_native.bat
```

Run:

```powershell
.\study_manager.exe
```

The native build loads both:

```text
data/data.txt
data/queue_data.txt
```

---

# Build WebAssembly

Emscripten is required.

From PowerShell:

```powershell
.\build_wasm.bat
```

The script generates:

```text
web/wasm.js
web/wasm.wasm
```

The build script includes:

```text
-lidbfs.js
```

because IDBFS is required for browser persistence.

---

# Run the web version

From the project root:

```powershell
python -m http.server 8000 -d web
```

Open:

```text
http://localhost:8000
```

After C/WASM changes:

```powershell
.\build_wasm.bat
```

Then hard refresh the browser:

```text
Ctrl + Shift + R
```

---

# Native vs Browser

| Part | Native | Browser |
|---|---|---|
| Master storage | `data/data.txt` | IDBFS `/data/data.txt` |
| Queue storage | `data/queue_data.txt` | IDBFS `/data/queue_data.txt` |
| Interface | `main.c` | HTML/CSS/JS |
| C core | Yes | Yes |
| Queue persistence | Yes | Yes |
| File handling | stdio | Emscripten FS |
| UI | Console | Web dashboard |

---

# Recommended verification checklist

## Master list

- Add High / Medium / Low topics
- Confirm priority ordering
- Search subject
- Search chapter
- Update priority
- Confirm re-sorting
- Update status
- Delete first topic
- Delete middle topic
- Delete last topic

## Queue

- Add pending topic
- Add completed topic
- Try duplicate queue insertion
- Dequeue the first topic
- Clear queue
- Refresh browser
- Confirm queue is still present
- Delete a queued master topic
- Confirm it disappears from queue

## Persistence

1. Add topics.
2. Add topics to today's queue.
3. Refresh the browser.
4. Confirm both master list and queue return.
5. Change a queued topic's subject/chapter.
6. Refresh again.
7. Confirm the queue still points to the updated topic.
8. Delete a queued topic.
9. Refresh again.
10. Confirm there is no dangling queue entry.

---

# Important note after source changes

The checked-in `web/wasm.js` and `web/wasm.wasm` are generated artifacts.

After modifying C files, rebuild them with:

```powershell
.\build_wasm.bat
```

Do not edit generated `wasm.js` or `wasm.wasm` manually.

---

## Learning objectives

This project demonstrates:

- Structures
- Pointers
- Dynamic memory allocation
- Doubly linked lists
- Singly linked queues
- Priority-based insertion
- Search
- Filtering
- Update
- Deletion
- File persistence
- Modular C
- JavaScript ↔ C communication
- WebAssembly
- IDBFS / IndexedDB
- Browser application architecture
