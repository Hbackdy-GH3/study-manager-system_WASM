#ifndef TOPIC_H
#define TOPIC_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/*
    Where files are stored.

    Native build:
        data/data.txt
        data/queue_data.txt

    WASM build:
        /data/data.txt
        /data/queue_data.txt

    The browser mounts /data with IDBFS, so both files are persistent.
*/
#ifdef __EMSCRIPTEN__
#define DATA_FILE "/data/data.txt"
#define QUEUE_DATA_FILE "/data/queue_data.txt"
#else
#define DATA_FILE "data/data.txt"
#define QUEUE_DATA_FILE "data/queue_data.txt"
#endif

#define TEXT_SIZE 50

typedef struct Topic{
    char subject[TEXT_SIZE];
    char chapter[TEXT_SIZE];
    int priority;      /* 1 = High, 0 = Medium, -1 = Low */
    int is_done;       /* 0 = Pending, 1 = Completed */
    struct Topic* next;
    struct Topic* prev;
} Topic;

extern Topic* head;
extern Topic* tail;

typedef struct QueueNode{
    Topic* topic;
    struct QueueNode* next;
} QueueNode;

extern QueueNode* front;
extern QueueNode* back;

/*
    WHAT should save_data() write?
        save_master -> data.txt
        save_queue  -> queue_data.txt
*/
enum SaveMode {save_master, save_queue};
extern enum SaveMode currMode;

/*
    SHOULD an operation save?
        saveY -> normal operation
        saveN -> used while loading data from disk
*/
enum when2save {saveY, saveN};
extern enum when2save askYN;

#define case_insensitive CI
int CI(char *a, char *b);

/* input.c (console only) */
int read_int(void);
void read_text(char* buffer, int size);

/* insertion */
Topic* insert_init(char subject[], char chapter[], int priority, int is_done);
void insert_prior(char subject[], char chapter[], int priority, int is_done);
void insertfront(Topic* node);
void insertback(Topic* node);
void insert_any(Topic* node, Topic* temp);
void insert_node_by_priority(Topic* node);

/* deletion */
void pop(void);
void popfront(void);
void popback(void);
void popany(Topic* node);
void remove_node(Topic* node);
void delete_node(Topic* node);
void free_all_topics(void);

/* search / update */
void search_topic(void);
void searched_action(Topic* node);
void update_priority(Topic* node);
void update_status(Topic* node);

/* filters */
void filter_via(void);
int filter(int* prior, int* stat);

/* study queue */
void enqueue_ask(void);
int enqueue(Topic* node);
void display_queue(void);
void dequeue(void);
void data_enqueue(char subject[], char chapter[]);
int queue_contains_topic(Topic* target);
void queue_remove_topic(Topic* target);
void clear_queue(void);

/* progress / display */
void show_progress(void);
void show_progress_queue(void);
void print_topic(Topic* node);
void print_all(void);

/* persistence */
void save_data(void);
void load_data(void);

#endif