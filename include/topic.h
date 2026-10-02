#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>

typedef struct Topic{
    int topic_id;
    char subject[50];
    char chapter[50];
    int priority;
    int is_done;
    int in_plan;
    int completed_on;
    struct Topic* next;
    struct Topic* prev;

}Topic;

extern Topic* head;
extern Topic* tail;
extern int next_id;

typedef struct QueueNode{
    Topic* topic;
    struct QueueNode* next;
}QueueNode;

extern QueueNode* front;
extern QueueNode* back;

enum SaveMode {save_master, save_queue, save_plan};
extern enum SaveMode currMode;

enum when2save {saveY, saveN};
extern enum when2save askYN;

typedef struct Plan{
    int exists;
    char plan_name[50];
    int start_date;
    int end_date;
    int start_totals;
    int base_pace;

}Plan;

extern Plan plan;


#define case_insensitive CI
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define MIN(a, b) ((a) < (b) ? (a) : (b))

int CI(char *a, char *b);

void clear_line(void);
int read_raw_line(char* buf, int size);
int read_int(void);
int read_choice(int low, int high);
int read_priority(void);
char read_yn(void);
void read_text(char* buf, int size);
int read_date(void);
void pause_screen(void);

Topic* insert_init(int topic_id, char subject[], char chapter[], int priority, int is_done);
Topic* insert_prior(int topic_id, char subject[], char chapter[], int priority, int is_done);
void insertfront(Topic* node);
void insertback(Topic* node);
void insert_any(Topic* node, Topic* temp);
void insert_node_by_priority(Topic* node);

void pop();
void popfront();
void popback();
void popany(Topic* node);
void remove_node(Topic* node);
void save_master_now();

void search_topic();
void searched_action(Topic* node);
void update_priority(Topic* node);
void update_status(Topic* node);
Topic* find_by_id(int id);

void filter_via();
int filter(int* prior, int* stat);
int print_matching(int status, int priority);
void filter_plan();
void filter_plan_via_status(int* n1,int* n2);

void enqueue_ask();
int enqueue(Topic* node);
void display_queue();
void dequeue();
// void data_enqueue(char subject[], char chapter[]);
void remove_from_queue(Topic* node);
int queue_count();

void show_progress();
void show_progress_queue();
void show_progress_plan();
void daily_reports();

int today_ymd(void);
int valid_date(int date);
int start_end(void);
int plan_validity(void);
int day_number(int date);
int month_days(int month, int year);
int leap_year(int year);
char* display_date(int date);

void save_data();
void load_data();

const char* priority_text(int priority);
void print_topic(Topic* node);
void print_topic_row(int no, Topic* node);
void print_table_header();
void print_all();
void print_header(const char* title);
int count_topics();

void creation_plan();
void check_plan();
void status_plan();
void update_plan();
void delete_plan();
void display_plan_details();
void display_plan_topic();
void add_topic_plan();
void remove_topic_plan();
int curr_base_pace();
void cal_start_totals();
void save_master_and_plan();
void fill_queue_from_plan();
int today_target();
