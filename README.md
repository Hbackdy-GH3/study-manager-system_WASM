# Study Management System

A study topic management application written in C, built around a doubly linked list with priority-based sorted insertion, search, filtering, topic updates, progress tracking, a separate study-session queue, and file persistence.

The project started as a console-based C application and has been extended with a WebAssembly (WASM) browser interface while keeping the existing C data structures and core logic.

This project is mainly designed as a learning project to practice:
- Data structures
- Pointers
- Dynamic memory allocation
- Linked lists
- Queues
- Searching
- Filtering
- File handling
- Modular C programming
- C and JavaScript integration through WebAssembly

FEATURES
--------

MASTER TOPIC LIST
-----------------
The main topic collection uses a doubly linked list.

Features:
- Add topics
- Insert topics according to priority
- Priority-based sorted insertion
- Search topics by subject and chapter
- Multi-word subject and chapter support
- Update topic details
- Update priority with automatic re-sorting
- Update completion status
- Delete topics
- Display all topics
- Filter topics by status
- Filter topics by priority
- Progress statistics

Priority values:
    1  = High
    0  = Medium
   -1  = Low

Status values:
    0  = Pending
    1  = Completed


TODAY'S STUDY QUEUE
-------------------
The study queue is maintained separately from the master topic list.

Features:
- Select topics using status + priority
- Add a chosen number of matching topics
- Display today's queue
- Show the number of remaining tasks
- Study the next topic
- Dequeue the next task
- Clear the current queue

The queue stores a pointer to the original Topic node instead of copying the complete topic data.

This keeps the queue lightweight and prevents unnecessary duplication.

The queue is intentionally session-only and is not persisted.


PERSISTENCE
-----------

The project has two persistence mechanisms depending on which version is being used.

NATIVE C CONSOLE VERSION
------------------------
The master topic list is saved to:

    data/data.txt

The program saves the master list after operations such as:
- Insert
- Update
- Delete

When the program starts again, the saved data is loaded from data/data.txt.

The study queue is intentionally not saved because it represents the current study session.


BROWSER / WEBASSEMBLY VERSION
-----------------------------
The browser version uses the Emscripten persistent filesystem through IDBFS, which stores the application data in the browser's persistent storage.

Conceptually:

    Browser UI
        |
        v
    JavaScript
        |
        v
    WebAssembly
        |
        v
    C application
        |
        v
    file_handling.c
        |
        v
    data file in the WASM filesystem
        |
        v
    IDBFS / IndexedDB

The Python HTTP server is only used to serve the website files.

It is NOT the database server.

When a topic is saved:

    Add / Update / Delete
            |
            v
    C data changes
            |
            v
    save_data()
            |
            v
    Browser filesystem sync
            |
            v
    IndexedDB / IDBFS

If the server is stopped:
- Saved browser data remains in the browser's persistent storage.
- Stopping the Python server does not delete the saved browser data.

When the server starts again:

    python -m http.server 8000 -d web

Open:

    http://localhost:8000

The application initializes WebAssembly and loads the previously stored browser data.

Browser persistence limitations:
- Refreshing the page does not delete the data.
- Closing the browser does not delete the data.
- Stopping the local server does not delete the data.
- Restarting the local server allows the same browser/site storage to be loaded.
- Clearing site data / IndexedDB deletes the stored browser data.
- Another browser does not automatically have the same data.
- Another computer does not automatically have the same data.


DATA STRUCTURES
---------------

TOPIC

    typedef struct Topic {
        char subject[50];
        char chapter[50];

        int priority;
        /* 1 = High, 0 = Medium, -1 = Low */

        int is_done;
        /* 0 = Pending, 1 = Completed */

        struct Topic *next;
        struct Topic *prev;
    } Topic;

The master collection is a doubly linked list.

The next pointer allows forward traversal and the prev pointer allows backward traversal.


QUEUENODE

    typedef struct QueueNode {
        Topic *topic;
        struct QueueNode *next;
    } QueueNode;

The study queue is a singly linked list with front and back pointers.

Each queue node stores a pointer to a Topic already present in the master list.


ARCHITECTURE
------------

    StudyManagementSystem-WASM/
    |
    +-- include/
    |   +-- topic.h
    |   +-- wasm_bridge.h
    |
    +-- src/
    |   +-- globals.c
    |   +-- insert.c
    |   +-- delete.c
    |   +-- display.c
    |   +-- search.c
    |   +-- update.c
    |   +-- filters.c
    |   +-- progress_stat.c
    |   +-- temp_session.c
    |   +-- file_handling.c
    |   +-- wasm_bridge.c
    |
    +-- data/
    |   +-- data.txt
    |
    +-- web/
    |   +-- index.html
    |   +-- style.css
    |   +-- app.js
    |   +-- wasm.js
    |   +-- wasm.wasm
    |
    +-- main.c
    +-- README.md
    +-- build_wasm.bat
    +-- study_manager.exe


FILE RESPONSIBILITIES
---------------------

main.c
------
Contains the native console menu and program flow.

It is used for the normal C application.

main.c is not compiled into the browser/WASM build because the browser uses HTML and JavaScript instead of scanf()/printf() based interaction.


include/topic.h
---------------
Contains:
- Topic structure
- QueueNode structure
- Function prototypes
- External declarations used by the C project


include/wasm_bridge.h
---------------------
Contains the function declarations exposed to the browser through WebAssembly.

Examples:
- wasm_add_topic()
- wasm_get_topics_json()
- wasm_update_topic()
- wasm_delete_topic()
- wasm_enqueue()
- wasm_dequeue()
- wasm_save()


src/globals.c
-------------
Contains the actual definitions of:
- head
- tail
- front
- back


src/insert.c
------------
Contains topic insertion and linked-list manipulation logic.

This includes priority-based insertion and node repositioning.


src/delete.c
------------
Contains topic deletion operations.


src/search.c
------------
Contains topic search logic.


src/update.c
------------
Contains topic update functionality such as:
- Priority update
- Completion status update


src/filters.c
-------------
Contains filtering logic for:
- Pending topics
- Completed topics
- Priority-based filtering


src/progress_stat.c
-------------------
Contains progress calculations for:
- Total topics
- Completed topics
- Pending topics
- Completion percentage
- Queue progress


src/temp_session.c
------------------
Contains the current study-session queue logic.


src/file_handling.c
-------------------
Contains:
- Saving topic data
- Loading topic data

For the native application, this uses the project's data file.

For the browser build, it works with the WebAssembly filesystem.


src/display.c
-------------
Contains console-oriented display functions.


src/wasm_bridge.c
-----------------
Acts as the connection between JavaScript and the existing C project.

The bridge exposes browser-safe functions without rewriting the existing linked-list and queue algorithms.

Examples:
- wasm_add_topic()
- wasm_topic_count()
- wasm_get_topics_json()
- wasm_update_topic()
- wasm_delete_topic()
- wasm_available_count()
- wasm_enqueue()
- wasm_queue_count()
- wasm_get_queue_json()
- wasm_dequeue()
- wasm_clear_queue()
- wasm_save()


DESIGN DECISIONS
----------------

Priority-Sorted Insertion
-------------------------
Topics are maintained in priority order:

    High
    Medium
    Low

The C program automatically places a new topic into the correct location.


Repositioning Existing Nodes
----------------------------
When a topic's priority is changed, the existing node can be detached from its current position and inserted again at its correct priority position.

This avoids creating an unnecessary second node.


Queue Stores References
-----------------------
The queue stores:

    Topic *topic;

instead of copying the topic data into every queue node.

This keeps the queue lightweight and means the queue refers directly to the original master topic.


Separate Master List and Queue
------------------------------
The master list represents the complete study syllabus.

The queue represents the topics selected for the current study session.

The two structures therefore have different responsibilities.


CONSOLE VERSION
---------------

Compile - Linux / macOS:

    gcc *.c -o study_manager

Run:

    ./study_manager


Compile - Windows PowerShell:

    gcc *.c -o study_manager.exe

Run:

    .\study_manager.exe


CONSOLE MENU
------------

    --- Master Topic List ---

    1. Add Topic
    2. Search / Update / Delete a Topic
    3. Delete Topic
    4. Display All Topics
    5. Filter Topics

    --- Today's Study Queue ---

    6. Add Topics to Today's Queue
    7. Show Today's Queue
    8. Study Next Topic

    --- Progress ---

    9. Show Progress (Master List)
    10. Show Progress (Today's Queue)

    --- Program ---

    11. Save & Exit


WEBASSEMBLY VERSION
-------------------

The browser version keeps the existing C data structures and core logic while replacing the console interface with a web interface.

The browser communicates with C through the WebAssembly bridge.

Architecture:

    HTML
      |
      v
    JavaScript
      |
      v
    WASM Bridge
      |
      v
    Existing C Logic
      |
      +-- Linked List
      +-- Queue
      +-- Search
      +-- Filters
      +-- Update
      +-- Delete
      +-- Progress
      +-- File Handling


BUILD WEBASSEMBLY
-----------------

Emscripten must be installed and available.

The project includes:

    build_wasm.bat

in the project root.

From PowerShell, in the project root:

    .\build_wasm.bat

The script compiles the required C source files and generates:

    web/wasm.js
    web/wasm.wasm


RUN THE WEB VERSION
-------------------

Start the local HTTP server from the project root:

    python -m http.server 8000 -d web

Then open:

    http://localhost:8000

After making frontend or WASM changes, refresh the browser with:

    Ctrl + Shift + R


RECOMMENDED DEVELOPMENT WORKFLOW
---------------------------------

Whenever C/WASM code changes:

    1. Modify C / bridge code
    2. Run .\build_wasm.bat
    3. Start the HTTP server if it is not running
    4. Open http://localhost:8000
    5. Hard refresh with Ctrl + Shift + R

For frontend-only changes:

    1. Modify HTML / CSS / JS
    2. Save
    3. Refresh the browser


BROWSER FEATURES
----------------

The browser interface provides:
- Dashboard
- Total topic count
- Pending topic count
- Completed topic count
- Queue count
- Add Topic
- Edit Topic
- Delete Topic
- Topic search
- Status filtering
- Priority filtering
- Priority badges
- Status badges
- Today's Study Queue
- Queue selection by status and priority
- Queue task count
- Study Next
- Clear Queue
- Master progress
- Queue progress
- Save
- WASM status
- Browser persistence


BROWSER TOPIC FLOW
------------------

When a topic is added:

    Subject
    Chapter
    Priority
    Status
        |
        v
    JavaScript
        |
        v
    wasm_add_topic()
        |
        v
    insert_prior()
        |
        v
    Master Doubly Linked List
        |
        v
    save_data()
        |
        v
    Browser Storage
        |
        v
    JavaScript refresh
        |
        v
    Master Topics Table


BROWSER QUEUE FLOW
------------------

    Status
    Priority
    Number of Tasks
            |
            v
        JavaScript
            |
            v
    wasm_available_count()
            |
            v
        wasm_enqueue()
            |
            v
        QueueNode
            |
            v
      Today's Queue

Studying the next topic:

    Study Next
        |
        v
    wasm_dequeue()
        |
        v
    front moves to next queue node


STORAGE DIFFERENCE
------------------

The native version and browser version use different storage environments.

    Version          Storage
    -----------------------------------------------
    Native C         data/data.txt
    Browser WASM     Browser persistent storage
    Study Queue      Session-only
    Master Topics    Persistent

The browser version does not automatically synchronize its local browser data back to the physical data/data.txt file on your Windows system.


ROADMAP
-------

- [x] Doubly linked master topic list
- [x] Priority-based sorted insertion
- [x] Search
- [x] Update
- [x] Delete
- [x] Filters
- [x] Progress statistics
- [x] Separate study-session queue
- [x] Queue enqueue/dequeue
- [x] File-based persistence
- [x] WebAssembly build
- [x] Browser frontend
- [x] WASM <-> JavaScript bridge
- [x] Browser persistence
- [ ] Subtopic support using a child pointer
- [ ] Advanced analytics
- [ ] Multi-user support
- [ ] Authentication
- [ ] Cloud database synchronization
- [ ] Online deployment


SANITY TEST
-----------

Before considering the project stable, test the following.

Master Topics:
- Add multiple topics
- Add High, Medium and Low priority topics
- Confirm priority ordering
- Search by subject
- Search by chapter
- Test multi-word input
- Update a topic
- Change priority
- Confirm automatic re-sorting
- Change status
- Delete the first topic
- Delete a middle topic
- Delete the last topic

Filters:
- Pending
- Completed
- High
- Medium
- Low

Study Queue:
- Add matching topics
- Try different status values
- Try different priorities
- Add multiple tasks
- Check queue count
- View queue
- Study the next topic
- Clear the queue

Progress:
- Total
- Completed
- Pending
- Percentage

Persistence - Native:
1. Add topics.
2. Save and exit.
3. Start the program again.
4. Confirm the topics are loaded from data/data.txt.

Persistence - Browser:
1. Add topics.
2. Refresh the page.
3. Confirm the topics remain.
4. Stop the local server.
5. Start the server again.
6. Open the application again.
7. Confirm the browser-stored topics are still available.


TECHNOLOGIES
------------

Native Application:
- C
- GCC
- stdio.h
- stdlib.h
- string.h
- Dynamic memory allocation
- Doubly linked list
- Singly linked queue
- File handling

Browser Application:
- HTML
- CSS
- JavaScript
- WebAssembly
- Emscripten
- Emscripten virtual filesystem
- IDBFS / IndexedDB


LEARNING OBJECTIVES
-------------------

This project demonstrates practical use of:
- Structures
- Pointers
- Dynamic memory
- Doubly linked lists
- Singly linked queues
- Sorted insertion
- Searching
- Filtering
- Deletion
- Node re-insertion
- File handling
- Modular C
- WebAssembly
- JavaScript-to-C communication
- Browser persistence


PROJECT STATUS
--------------

The project contains two interfaces over the same core C data structures:

                 +-------------------------+
                 |       Core C Logic      |
                 |                         |
                 | Linked List             |
                 | Queue                   |
                 | Search                  |
                 | Filters                 |
                 | Update                  |
                 | Delete                  |
                 | Progress                |
                 | File Handling           |
                 +------------+------------+
                              |
                   +----------+----------+
                   |                     |
                   v                     v
          Console Interface       WebAssembly Bridge
                   |                     |
                   v                     v
                main.c           JavaScript / HTML / CSS

The core purpose is to keep the data structures and application rules in C, while allowing both a terminal interface and a browser interface to use them.
