#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#include <emscripten/emscripten.h>

#include "topic.h"
#include "wasm_bridge.h"


/*
=========================================================
EXISTING PROJECT GLOBALS
=========================================================
*/

extern Topic* head;
extern Topic* tail;

extern QueueNode* front;
extern QueueNode* back;


/*
=========================================================
JSON BUFFER
=========================================================
*/

static char* json_buffer = NULL;
static size_t json_capacity = 0;
static size_t json_length = 0;


static int json_reserve(size_t extra)
{
    size_t required = json_length + extra + 1;

    if (required <= json_capacity)
        return 1;

    size_t new_capacity =
        (json_capacity == 0) ? 4096 : json_capacity;

    while (new_capacity < required)
        new_capacity *= 2;

    char* new_buffer =
        (char*)realloc(json_buffer, new_capacity);

    if (new_buffer == NULL)
        return 0;

    json_buffer = new_buffer;
    json_capacity = new_capacity;

    return 1;
}


static void json_reset(void)
{
    json_length = 0;

    if (json_buffer != NULL)
        json_buffer[0] = '\0';
}


static void json_append_raw(const char* text)
{
    if (text == NULL)
        return;

    size_t length = strlen(text);

    if (!json_reserve(length))
        return;

    memcpy(
        json_buffer + json_length,
        text,
        length
    );

    json_length += length;
    json_buffer[json_length] = '\0';
}


static void json_append_format(const char* format, ...)
{
    char temp[512];

    va_list args;
    va_start(args, format);

    int written =
        vsnprintf(
            temp,
            sizeof(temp),
            format,
            args
        );

    va_end(args);

    if (written <= 0)
        return;

    if ((size_t)written >= sizeof(temp))
        return;

    json_append_raw(temp);
}


static void json_append_string(const char* text)
{
    json_append_raw("\"");

    if (text != NULL)
    {
        while (*text != '\0')
        {
            unsigned char c =
                (unsigned char)*text;

            switch (c)
            {
                case '\"':
                    json_append_raw("\\\"");
                    break;

                case '\\':
                    json_append_raw("\\\\");
                    break;

                case '\n':
                    json_append_raw("\\n");
                    break;

                case '\r':
                    json_append_raw("\\r");
                    break;

                case '\t':
                    json_append_raw("\\t");
                    break;

                default:
                    if (c < 32)
                    {
                        json_append_format(
                            "\\u%04x",
                            c
                        );
                    }
                    else
                    {
                        char one[2];

                        one[0] = (char)c;
                        one[1] = '\0';

                        json_append_raw(one);
                    }

                    break;
            }

            text++;
        }
    }

    json_append_raw("\"");
}


/*
=========================================================
HELPERS
=========================================================
*/

static int valid_priority(int priority)
{
    return (
        priority == 1 ||
        priority == 0 ||
        priority == -1
    );
}


static int valid_status(int status)
{
    return (
        status == 0 ||
        status == 1
    );
}


static Topic* topic_at_index(int index)
{
    if (index < 0)
        return NULL;

    Topic* current = head;
    int i = 0;

    while (current != NULL)
    {
        if (i == index)
            return current;

        current = current->next;
        i++;
    }

    return NULL;
}


static int queue_contains_topic(Topic* target)
{
    QueueNode* current = front;

    while (current != NULL)
    {
        if (current->topic == target)
            return 1;

        current = current->next;
    }

    return 0;
}


static void queue_remove_topic(Topic* target)
{
    QueueNode* current = front;
    QueueNode* previous = NULL;

    while (current != NULL)
    {
        QueueNode* next = current->next;

        if (current->topic == target)
        {
            if (previous == NULL)
                front = current->next;
            else
                previous->next = current->next;

            if (current == back)
                back = previous;

            free(current);
        }
        else
        {
            previous = current;
        }

        current = next;
    }

    if (front == NULL)
        back = NULL;
}


static void link_topic_after_removal_free(Topic* node)
{
    if (node == NULL)
        return;

    if (node->prev != NULL)
        node->prev->next = node->next;
    else
        head = node->next;

    if (node->next != NULL)
        node->next->prev = node->prev;
    else
        tail = node->prev;

    node->next = NULL;
    node->prev = NULL;

    free(node);
}


/*
=========================================================
WASM TEST
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_test(void)
{
    printf("WASM is working!\n");
}


/*
=========================================================
INIT / SAVE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_init(void)
{
    /*
        load_data() is called only after the JS side
        has prepared the browser filesystem.
    */
    if (head == NULL)
        load_data();
}


EMSCRIPTEN_KEEPALIVE
void wasm_save(void)
{
    save_data();
}


/*
=========================================================
ADD TOPIC
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_add_topic(
    char* subject,
    char* chapter,
    int priority,
    int status
)
{
    if (subject == NULL || chapter == NULL)
        return;

    if (subject[0] == '\0' || chapter[0] == '\0')
        return;

    if (strlen(subject) >= 50 || strlen(chapter) >= 50)
        return;

    if (!valid_priority(priority))
        return;

    if (!valid_status(status))
        return;

    /*
        Reuse the existing C insertion logic.
        insert_prior() already handles sorted insertion
        and automatic save_data().
    */
    insert_prior(
        subject,
        chapter,
        priority,
        status
    );
}


/*
=========================================================
TOPIC COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_topic_count(void)
{
    int count = 0;

    Topic* current = head;

    while (current != NULL)
    {
        count++;
        current = current->next;
    }

    return count;
}


/*
=========================================================
TOPICS -> JSON
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_topics_json(void)
{
    json_reset();

    json_append_raw("[");

    Topic* current = head;
    int index = 0;
    int first = 1;

    while (current != NULL)
    {
        if (!first)
            json_append_raw(",");

        first = 0;

        json_append_raw("{");

        json_append_format(
            "\"index\":%d",
            index
        );

        json_append_raw(",\"subject\":");
        json_append_string(current->subject);

        json_append_raw(",\"chapter\":");
        json_append_string(current->chapter);

        json_append_format(
            ",\"priority\":%d",
            current->priority
        );

        json_append_format(
            ",\"status\":%d",
            current->is_done
        );

        json_append_raw("}");

        current = current->next;
        index++;
    }

    json_append_raw("]");

    if (json_buffer == NULL)
        return "[]";

    return json_buffer;
}


/*
=========================================================
UPDATE TOPIC
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_update_topic(
    int index,
    char* subject,
    char* chapter,
    int priority,
    int status
)
{
    if (subject == NULL || chapter == NULL)
        return 0;

    if (subject[0] == '\0' || chapter[0] == '\0')
        return 0;

    if (strlen(subject) >= 50 || strlen(chapter) >= 50)
        return 0;

    if (!valid_priority(priority) ||
        !valid_status(status))
        return 0;

    Topic* node =
        topic_at_index(index);

    if (node == NULL)
        return 0;


    /*
        Changing priority requires removing the node
        from the sorted list and inserting it again.
    */
    int priority_changed =
        node->priority != priority;


    strcpy(
        node->subject,
        subject
    );

    strcpy(
        node->chapter,
        chapter
    );

    node->is_done = status;


    if (priority_changed)
    {
        /*
            Reuse the existing detach function.
            remove_node() does NOT free the node.
        */
        remove_node(node);

        node->priority = priority;

        insert_node_by_priority(node);
    }
    else
    {
        node->priority = priority;

        save_data();
    }


    return 1;
}


/*
=========================================================
DELETE TOPIC
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_delete_topic(int index)
{
    Topic* node =
        topic_at_index(index);

    if (node == NULL)
        return 0;


    /*
        The queue stores Topic* pointers.
        Remove every queue reference before freeing
        the Topic to avoid dangling pointers.
    */
    queue_remove_topic(node);


    link_topic_after_removal_free(node);


    save_data();

    return 1;
}


/*
=========================================================
QUEUE: AVAILABLE COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_available_count(
    int status,
    int priority
)
{
    if (!valid_status(status) ||
        !valid_priority(priority))
        return 0;

    int count = 0;

    Topic* current = head;

    while (current != NULL)
    {
        if (
            current->is_done == status &&
            current->priority == priority
        )
        {
            count++;
        }

        current = current->next;
    }

    return count;
}


/*
=========================================================
QUEUE: ENQUEUE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_enqueue(
    int status,
    int priority,
    int count
)
{
    if (!valid_status(status) ||
        !valid_priority(priority))
        return 0;

    if (count <= 0)
        return 0;


    int added = 0;

    Topic* current = head;


    while (
        current != NULL &&
        added < count
    )
    {
        if (
            current->is_done == status &&
            current->priority == priority
        )
        {
            QueueNode* newNode =
                (QueueNode*)malloc(
                    sizeof(QueueNode)
                );

            if (newNode == NULL)
                break;


            newNode->topic = current;
            newNode->next = NULL;


            if (front == NULL)
            {
                front = newNode;
                back = newNode;
            }
            else
            {
                back->next = newNode;
                back = newNode;
            }


            added++;
        }

        current = current->next;
    }


    return added;
}


/*
=========================================================
QUEUE COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_queue_count(void)
{
    int count = 0;

    QueueNode* current = front;

    while (current != NULL)
    {
        count++;
        current = current->next;
    }

    return count;
}


/*
=========================================================
QUEUE -> JSON
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_queue_json(void)
{
    json_reset();

    json_append_raw("[");

    QueueNode* current = front;

    int first = 1;
    int queueIndex = 0;

    while (current != NULL)
    {
        if (!first)
            json_append_raw(",");

        first = 0;

        Topic* topic =
            current->topic;

        json_append_raw("{");

        json_append_format(
            "\"queueIndex\":%d",
            queueIndex
        );

        json_append_raw(",\"subject\":");
        json_append_string(topic->subject);

        json_append_raw(",\"chapter\":");
        json_append_string(topic->chapter);

        json_append_format(
            ",\"priority\":%d",
            topic->priority
        );

        json_append_format(
            ",\"status\":%d",
            topic->is_done
        );

        json_append_raw("}");

        current = current->next;
        queueIndex++;
    }

    json_append_raw("]");

    if (json_buffer == NULL)
        return "[]";

    return json_buffer;
}


/*
=========================================================
QUEUE: DEQUEUE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_dequeue(void)
{
    if (front == NULL)
        return 0;


    QueueNode* old =
        front;


    front =
        front->next;


    if (front == NULL)
        back = NULL;


    free(old);

    return 1;
}


/*
=========================================================
QUEUE: CLEAR
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_clear_queue(void)
{
    QueueNode* current = front;

    while (current != NULL)
    {
        QueueNode* next =
            current->next;

        free(current);

        current = next;
    }

    front = NULL;
    back = NULL;
}
