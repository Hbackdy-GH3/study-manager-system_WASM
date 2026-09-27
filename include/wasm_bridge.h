#ifndef WASM_BRIDGE_H
#define WASM_BRIDGE_H

void wasm_test(void);

void wasm_init(void);
void wasm_save(void);

void wasm_add_topic(
    char* subject,
    char* chapter,
    int priority,
    int status
);

int wasm_topic_count(void);

const char* wasm_get_topics_json(void);

int wasm_update_topic(
    int index,
    char* subject,
    char* chapter,
    int priority,
    int status
);

int wasm_delete_topic(int index);

int wasm_available_count(int status, int priority);

int wasm_enqueue(int status, int priority, int count);

int wasm_queue_count(void);

const char* wasm_get_queue_json(void);

int wasm_dequeue(void);

void wasm_clear_queue(void);

#endif
