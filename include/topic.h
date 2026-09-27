#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

typedef struct Topic{
    char subject[50];
    char chapter[50];
    int priority;
    int is_done;
    struct Topic* next;
    struct Topic* prev;

}Topic;

extern Topic* head;
extern Topic* tail;

typedef struct QueueNode{
    Topic* topic;
    struct QueueNode* next;
}QueueNode;

extern QueueNode* front;
extern QueueNode* back;

Topic* insert_init(char subject[], char chapter[], int priority, int is_done);
void insert_prior(char subject[], char chapter[], int priority, int is_done);
void insertfront(Topic* node);
void insertback(Topic* node);
void insert_any(Topic* node, Topic* temp);
void insert_node_by_priority(Topic* node);

void pop();
void popfront();
void popback();
void popany(Topic* node);
void remove_node(Topic* node);

void search_topic();
void searched_action(Topic* node);
void update_priority(Topic* node);
void update_status(Topic* node);

void filter_via();
int filter(int* prior, int* stat);

void enqueue();
void display_queue();
void dequeue();

void show_progress();
void show_progress_queue();

void save_data();
void load_data();

void print_topic(Topic* node);
void print_all();