# Study Management System

A console-based study topic manager written in C, built around a **doubly linked list** with **priority-based sorted insertion**, search, filters, a separate study-session priority queue, and file persistence. Created as a learning project to practice core data structure operations beyond textbook basics.

## Features

**Master Topic List (Doubly Linked List)**
- Add topics — front, back, or automatically by priority
- Priority-sorted insertion — new topics are placed in the correct position automatically
- Search topics — case-insensitive lookup by subject and chapter (supports multi-word input)
- Update topics — change priority (auto re-sorts the list) or completion status
- Delete topics — front, back, anywhere in the middle, or directly from a search result
- Filter topics — pending only, completed only, or by specific priority
- Progress summary — total, completed, pending counts and completion percentage

**Today's Study Queue (separate Priority Queue, independent of the master list)**
- Enqueue — filter the master list by status + priority, then pull N matching topics into today's queue (nodes reference the original master-list topics, not copies)
- Dequeue — pop the next topic to study from the front of the queue
- Display — view everything currently queued for today
- Task count — see how many topics remain in today's queue

**Study Plan**
- Create a plan: pick pending topics, give a name, start date and end date (YYYYMMDD, validated)
- Base pace = topics per day needed when the plan starts
- Check plan: details, days left, today's target, progress %, and status (Behind / On track / Ahead)
- Update plan: add or remove topics, fill today's queue from the plan
- Extend an ended plan or delete it
- Fill today's queue from the plan: adds exactly today's target, high priority first, no duplicates

**Daily Report**
- Topics completed today (each topic stores the date it was completed)
- How many of them belong to the plan, today's target and whether it was reached

**Persistence**
- `data/data.txt`, `data/queue_data.txt` and `data/plan_data.txt` are saved after every change and loaded on startup.

**Safe input**
- Typing letters where a number is expected, empty names, or commas in names just asks again instead of breaking the program.

## Architecture

```
Std. management/
├── include/
│   └── topic.h              # structs, enums, extern globals, all prototypes
├── src/
│   ├── main.c               # interactive menu, program entry point
│   ├── globals.c            # definitions of head, tail, front, back, plan, modes
│   ├── core/                # master list (doubly linked list)
│   │   ├── insert.c         # insert_init, insert_prior, insert_node_by_priority, ...
│   │   ├── delete.c         # pop, popfront, popback, popany
│   │   ├── update.c         # update_priority (with re-sort), update_status
│   │   ├── search.c         # case-insensitive search, searched_action
│   │   ├── filters.c        # pending/completed/priority filters
│   │   ├── display.c        # print_topic (box), print_topic_row (table), print_all
│   │   ├── input.c          # safe input: read_int, read_choice, read_yn, read_text, read_date
│   │   └── progress_stat.c  # progress for master list, queue, plan + daily report
│   ├── queue/
│   │   └── temp_session.c   # today's study queue: enqueue, dequeue, display
│   ├── plan/                # study plan feature
│   │   ├── study_plan.c     # create / check / status / update / delete plan
│   │   ├── operations_plan.c# adding topics to the plan
│   │   └── date_utils.c     # today_ymd, valid_date, day_number, display_date
│   └── storage/
│       └── file_handling.c  # save_data, load_data
├── data/                    # data.txt, queue_data.txt, plan_data.txt
├── build/                   # compiled program (not committed)
└── build.bat                # Windows build script
```

## Data structures

```c
typedef struct Topic {
    char subject[50];
    char chapter[50];
    int priority;           // 1 = High, 0 = Medium, -1 = Low
    int is_done;             // 0 = Pending, 1 = Completed
    struct Topic *next;
    struct Topic *prev;
} Topic;

typedef struct QueueNode {
    Topic* topic;             // pointer into the master list — no data duplication
    struct QueueNode *next;
} QueueNode;
```

The master list is a **doubly linked list** so deletion and reinsertion (for priority updates) can be done in O(1) once the position is found. The study queue is a simpler **singly linked list** with front/back pointers, since it only needs enqueue/dequeue, not arbitrary deletion.

## Key design decisions

**Priority-sorted insertion** — `insert_prior()` walks the master list and inserts new topics in the correct position automatically.

**Reposition without reallocating** — `update_priority()` detaches the existing node with `remove_node()` (not freed) and reinserts it via `insert_node_by_priority()`, avoiding a memory leak and an unnecessary allocation.

**Study queue references, not copies** — `QueueNode` stores a `Topic*` pointing back into the master list, so the queue always reflects the latest data without duplicating it.

**Filtered enqueue** — `enqueue_ask()` uses a query-like `filter()` helper (status + priority) to pull a chosen number of matching topics into today's queue, similar to a database `WHERE` clause.

**Multi-word input handling** — subject and chapter fields accept spaces using `scanf(" %49[^\n]", ...)` instead of `%s`.

## Build & Run

Always run from the project root folder (the data files are read from `data/`).

```bash
# Windows
build.bat
.\build\study_manager.exe

# Linux/macOS
gcc -Iinclude src/*.c src/*/*.c -o build/study_manager
./build/study_manager
```

## Web version (WebAssembly)

The same C code runs in the browser. `wasm/wasm_api.c` is a small bridge that the web page calls; `src/main.c` is not used there. Data is saved in the browser (IndexedDB), so it stays after closing the tab.

```bash
# 1. Build (needs emsdk; web/study.js and web/study.wasm are already built in the repo)
build_wasm.bat          # Windows
./build_wasm.sh         # Linux/macOS

# 2. Run (a local server is needed, opening index.html directly will not load the .wasm)
cd web
python -m http.server 8000
# open http://localhost:8000
```

Deploy: on Cloudflare Pages / Netlify / GitHub Pages, set the output folder to `web` with no build command.

Backup: the sidebar has **Export**, which downloads `study-backup-YYYYMMDD.json` with all topics (status, completed date, plan and queue flags) and the plan, but no IDs. **Import** adds the topics from that file to the current list. Each one gets a new ID from the app, topics that already exist (same subject and chapter) are skipped, and the plan is added only if there is no plan yet.

Import also takes a plain `.txt` / `.csv` topic list with **no IDs**, one topic per line:

```
subject,chapter,priority
subject,chapter,priority,is_done,completed_on
```

Example: `DSA,Trees,1` or `Maths,Matrices,0,1,20261002` (priority 1 High, 0 Medium, -1 Low). The app gives every topic its ID.

Files per topic: every topic row has a 📎 button (and **Add notes or files** in the ⋯ menu) to attach PDFs, images or any file up to 50 MB. Files are stored in the browser (IndexedDB), open in a new tab, open from the **Study next** card on Today, are deleted with their topic, and are included in Export / Import.

## Accounts and cloud sync (optional)

The web app works without an account (data stays in the browser). With an account, topics, queue and plan sync to Supabase and topic files go to Cloudflare R2, so the same data opens on any device.

How it works: the C code still reads and writes `data/data.txt`, `data/queue_data.txt` and `data/plan_data.txt`. `web/cloud.js` downloads these three files from Supabase before `wasm_init()` and uploads them after every change (with a check so an older device can't overwrite newer data). Deleting a topic therefore removes it from the database on the next save, and its files are deleted from R2.

Files:
- `web/config.js`: Supabase project URL and publishable key (safe to be public; never put the secret key here)
- `web/cloud.js`: log in / sign up / reset password / use without account, sync, conflicts, offline
- `functions/api/files.js`: Cloudflare Pages Function that stores files in R2 after checking the user's login

Setup:
1. Supabase: create a project, run the SQL below in the SQL Editor, set Authentication → URL Configuration → Site URL to the site address.
2. Cloudflare: create an R2 bucket (`study-files`), then on the Pages project add the R2 binding `FILES` and the variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

```sql
create table if not exists public.study_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data_txt text not null default '',
  queue_txt text not null default '',
  plan_txt text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.study_data enable row level security;
revoke all on public.study_data from anon;
grant select, insert, update, delete on public.study_data to authenticated;
create policy "own row read" on public.study_data for select to authenticated using (auth.uid() = user_id);
create policy "own row add" on public.study_data for insert to authenticated with check (auth.uid() = user_id);
create policy "own row change" on public.study_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row remove" on public.study_data for delete to authenticated using (auth.uid() = user_id);
```

Note: with `python -m http.server` locally, login and sync work but topic files need the Pages Function, so test files on the deployed site (or with `npx wrangler pages dev web`).

Every console menu option works in the web version:

| Console menu | Where in the web app |
|---|---|
| 1. Add topic (front / back / by priority) | **Add topic** button, “Where in the list” |
| 2. Search / update / delete | Search box on Topics, then ⋯ for details, priority, status, delete |
| 3. Delete front / back / anywhere | Topics → **List tools** → Delete first / last, or ⋯ → Delete |
| 4. Display all topics | **Topics** in list order with No. (or grouped by subject) |
| 5. Filter topics | Pending / Done tabs, priority and subject pickers |
| 6. Add topics to today's queue | **List tools → Add several to today's queue** (pending or revision, priority, how many) or “+ Today” on a row |
| 7. Show today's queue | **Today**: Study next + Up next |
| 8. Study next topic | Today: **Mark as done** / **Not today** |
| 9. Progress (master list) | **Progress**: all topics, by priority, by subject |
| 10. Progress (queue) | Progress: today's queue |
| 11–15. Plan create / check / update / delete / fill | **Plan** page |
| 16. Today's report | Progress: daily report |
| 17. Save & exit | Saves on every change |

## Menu

```
 Master Topic List          Study Plan
   1. Add Topic               11. Create Plan
   2. Search/Update/Delete    12. Check Plan
   3. Delete Topic            13. Update Plan
   4. Display All Topics      14. Delete Plan
   5. Filter Topics           15. Fill Today's Queue from Plan
 Today's Study Queue          16. Today's Report
   6. Add Topics to Queue   Program
   7. Show Today's Queue      17. Save & Exit
   8. Study Next Topic
 Progress
   9. Progress (Master)
  10. Progress (Queue)
```

## Data files

| File | Format |
|---|---|
| `data/data.txt` | `topic_id,subject,chapter,priority,is_done,in_plan,completed_on` |
| `data/queue_data.txt` | one `topic_id` per line |
| `data/plan_data.txt` | `start_date,end_date,start_totals,base_pace,plan_name` |

## Roadmap

- [x] Search, update (with auto re-sort), filters
- [x] Interactive master menu
- [x] File-based persistence
- [x] Separate study-session priority queue (enqueue/dequeue/display)
- [x] Progress statistics (master list and queue)
- [x] Study plan with targets, progress and queue filling
- [x] Daily report
- [ ] Subtopic support via a `child` pointer
- [x] Topic IDs (queue saved by ID)
- [x] WebAssembly build with a browser frontend (`web/`)
- [x] Attachments per topic (web)

## Tech

- Language: C
- No external libraries — only `stdio.h`, `stdlib.h`, `string.h`
- Compiled and tested with `gcc` (console) and Emscripten (web)
- Web frontend: plain HTML, CSS and JavaScript