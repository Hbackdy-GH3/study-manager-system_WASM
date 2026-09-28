#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#include <emscripten/emscripten.h>

#include "topic.h"
#include "wasm_bridge.h"

/*
=========================================================
JSON BUFFER
=========================================================
*/

static char* json_buffer=NULL;
static size_t json_capacity=0;
static size_t json_length=0;

static int json_reserve(size_t extra){
    size_t required=json_length+extra+1;

    if(required<=json_capacity){
        return 1;
    }

    size_t new_capacity=(json_capacity==0) ? 4096 : json_capacity;

    while(new_capacity<required){
        new_capacity*=2;
    }

    char* new_buffer=(char*)realloc(json_buffer,new_capacity);

    if(new_buffer==NULL){
        return 0;
    }

    json_buffer=new_buffer;
    json_capacity=new_capacity;

    return 1;
}

static void json_reset(void){
    json_length=0;

    if(json_buffer!=NULL){
        json_buffer[0]='\0';
    }
}

static void json_append_raw(const char* text){
    if(text==NULL){
        return;
    }

    size_t length=strlen(text);

    if(!json_reserve(length)){
        return;
    }

    memcpy(json_buffer+json_length,text,length);
    json_length+=length;
    json_buffer[json_length]='\0';
}

static void json_append_format(const char* format,...){
    char temp[512];

    va_list args;
    va_start(args,format);

    int written=vsnprintf(
        temp,
        sizeof(temp),
        format,
        args
    );

    va_end(args);

    if(written<=0 || (size_t)written>=sizeof(temp)){
        return;
    }

    json_append_raw(temp);
}

static void json_append_string(const char* text){
    json_append_raw("\"");

    if(text!=NULL){
        while(*text!='\0'){
            unsigned char c=(unsigned char)*text;

            switch(c){
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
                    if(c<32){
                        json_append_format("\\u%04x",c);
                    }
                    else{
                        char one[2];
                        one[0]=(char)c;
                        one[1]='\0';
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
VALIDATION / LOOKUP HELPERS
=========================================================
*/

static int valid_priority(int priority){
    return priority==1 || priority==0 || priority==-1;
}

static int valid_status(int status){
    return status==0 || status==1;
}

static int valid_text(const char* text){
    if(text==NULL || text[0]=='\0'){
        return 0;
    }

    if(strlen(text)>=TEXT_SIZE){
        return 0;
    }

    if(strpbrk(text,",\r\n")!=NULL){
        return 0;
    }

    return 1;
}

static Topic* topic_at_index(int index){
    if(index<0){
        return NULL;
    }

    Topic* current=head;
    int i=0;

    while(current!=NULL){
        if(i==index){
            return current;
        }

        current=current->next;
        i++;
    }

    return NULL;
}

static int index_of_topic(Topic* target){
    Topic* current=head;
    int i=0;

    while(current!=NULL){
        if(current==target){
            return i;
        }

        current=current->next;
        i++;
    }

    return -1;
}

/*
    Central browser-side persistence helper.
    currMode decides which file save_data() writes.
*/
static void save_master_and_queue(void){
    if(askYN!=saveY){
        return;
    }

    currMode=save_master;
    save_data();

    currMode=save_queue;
    save_data();

    currMode=save_master;
}

static void load_master_and_queue(void){
    currMode=save_master;
    load_data();

    currMode=save_queue;
    load_data();

    currMode=save_master;
}

/*
=========================================================
WASM TEST
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_test(void){
    printf("WASM is working!\n");
    return 1;
}

/*
=========================================================
INIT / SAVE / RELOAD
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_init(void){
    if(head!=NULL){
        return;
    }

    load_master_and_queue();
}

EMSCRIPTEN_KEEPALIVE
void wasm_save(void){
    save_master_and_queue();
}

EMSCRIPTEN_KEEPALIVE
int wasm_reload(void){
    /*
        Used by browser Import.
        Importing a new master list intentionally starts with
        an empty persisted study queue.
    */
    free_all_topics();

    if(askYN==saveY){
        currMode=save_queue;
        save_data();
        currMode=save_master;
    }

    load_master_and_queue();

    return wasm_topic_count();
}
EMSCRIPTEN_KEEPALIVE
int wasm_import_topics_append(char* text){
    if(text==NULL || text[0]=='\0'){
        return 0;
    }

    int added=0;

    enum when2save oldAskYN=askYN;
    askYN=saveN;

    char* line=strtok(text, "\n");

    while(line!=NULL){

        char subject[TEXT_SIZE];
        char chapter[TEXT_SIZE];
        int priority;
        int status;

        if(
            sscanf(
                line,
                " %49[^,],%49[^,],%d,%d",
                subject,
                chapter,
                &priority,
                &status
            )==4
        ){
            if(
                valid_text(subject) &&
                valid_text(chapter) &&
                valid_priority(priority) &&
                valid_status(status)
            ){
                int before=wasm_topic_count();

                insert_prior(
                    subject,
                    chapter,
                    priority,
                    status
                );

                if(wasm_topic_count()>before){
                    added++;
                }
            }
        }

        line=strtok(NULL, "\n");
    }

    askYN=oldAskYN;

    /*
        Existing queue ko preserve karna hai.
        Sirf master list ko save karo.
    */
    currMode=save_master;
    save_data();

    return added;
}
/*
=========================================================
TOPIC: ADD
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_add_topic(
    char* subject,
    char* chapter,
    int priority,
    int status
){
    if(!valid_text(subject) || !valid_text(chapter)){
        return 0;
    }

    if(!valid_priority(priority) || !valid_status(status)){
        return 0;
    }

    int before=wasm_topic_count();

    askYN=saveY;
    insert_prior(subject,chapter,priority,status);
    currMode=save_master;

    return wasm_topic_count()>before;
}

/*
=========================================================
TOPIC COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_topic_count(void){
    int count=0;
    Topic* current=head;

    while(current!=NULL){
        count++;
        current=current->next;
    }

    return count;
}

/*
=========================================================
TOPICS -> JSON
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_topics_json(void){
    json_reset();
    json_append_raw("[");

    Topic* current=head;
    int index=0;
    int first=1;

    while(current!=NULL){
        if(!first){
            json_append_raw(",");
        }

        first=0;
        json_append_raw("{");

        json_append_format("\"index\":%d",index);

        json_append_raw(",\"subject\":");
        json_append_string(current->subject);

        json_append_raw(",\"chapter\":");
        json_append_string(current->chapter);

        json_append_format(",\"priority\":%d",current->priority);
        json_append_format(",\"status\":%d",current->is_done);

        json_append_raw("}");

        current=current->next;
        index++;
    }

    json_append_raw("]");

    return json_buffer==NULL ? "[]" : json_buffer;
}

/*
=========================================================
TOPIC: UPDATE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_update_topic(
    int index,
    char* subject,
    char* chapter,
    int priority,
    int status
){
    if(!valid_text(subject) || !valid_text(chapter)){
        return 0;
    }

    if(!valid_priority(priority) || !valid_status(status)){
        return 0;
    }

    Topic* node=topic_at_index(index);

    if(node==NULL){
        return 0;
    }

    int priority_changed=(node->priority!=priority);

    strncpy(node->subject,subject,TEXT_SIZE-1);
    node->subject[TEXT_SIZE-1]='\0';

    strncpy(node->chapter,chapter,TEXT_SIZE-1);
    node->chapter[TEXT_SIZE-1]='\0';

    node->is_done=status;

    if(priority_changed){
        remove_node(node);
        node->priority=priority;
        insert_node_by_priority(node);
    }
    else{
        node->priority=priority;
    }

    askYN=saveY;
    save_master_and_queue();

    return 1;
}

/*
=========================================================
TOPIC: DELETE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_delete_topic(int index){
    Topic* node=topic_at_index(index);

    if(node==NULL){
        return 0;
    }

    askYN=saveY;
    delete_node(node);

    return 1;
}

/*
=========================================================
QUEUE: AVAILABLE COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_available_count(int status,int priority){
    if(!valid_status(status) || !valid_priority(priority)){
        return 0;
    }

    int count=0;
    Topic* current=head;

    while(current!=NULL){
        if(
            current->is_done==status &&
            current->priority==priority &&
            !queue_contains_topic(current)
        ){
            count++;
        }

        current=current->next;
    }

    return count;
}

/*
=========================================================
QUEUE: ENQUEUE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_enqueue(int status,int priority,int count){
    if(
        !valid_status(status) ||
        !valid_priority(priority) ||
        count<=0
    ){
        return 0;
    }

    int added=0;
    Topic* current=head;

    while(current!=NULL && added<count){
        if(
            current->is_done==status &&
            current->priority==priority &&
            !queue_contains_topic(current)
        ){
            if(enqueue(current)){
                added++;
            }
        }

        current=current->next;
    }

    if(added>0){
        askYN=saveY;
        currMode=save_queue;
        save_data();
        currMode=save_master;
    }

    return added;
}

/*
=========================================================
QUEUE COUNT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_queue_count(void){
    int count=0;
    QueueNode* current=front;

    while(current!=NULL){
        count++;
        current=current->next;
    }

    return count;
}

/*
=========================================================
QUEUE -> JSON
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_queue_json(void){
    json_reset();
    json_append_raw("[");

    QueueNode* current=front;
    int first=1;
    int queueIndex=0;

    while(current!=NULL){
        if(!first){
            json_append_raw(",");
        }

        first=0;

        Topic* topic=current->topic;

        json_append_raw("{");

        json_append_format(
            "\"queueIndex\":%d,\"index\":%d",
            queueIndex,
            index_of_topic(topic)
        );

        json_append_raw(",\"subject\":");
        json_append_string(topic->subject);

        json_append_raw(",\"chapter\":");
        json_append_string(topic->chapter);

        json_append_format(",\"priority\":%d",topic->priority);
        json_append_format(",\"status\":%d",topic->is_done);

        json_append_raw("}");

        current=current->next;
        queueIndex++;
    }

    json_append_raw("]");

    return json_buffer==NULL ? "[]" : json_buffer;
}

/*
=========================================================
QUEUE: DEQUEUE
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_dequeue(void){
    if(front==NULL){
        return 0;
    }

    QueueNode* old=front;

    front=front->next;

    if(front==NULL){
        back=NULL;
    }

    free(old);

    askYN=saveY;
    currMode=save_queue;
    save_data();
    currMode=save_master;

    return 1;
}

/*
=========================================================
QUEUE: STUDY NEXT
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
int wasm_study_next(int mark_done){
    if(front==NULL){
        return 0;
    }

    Topic* topic=front->topic;

    if(!wasm_dequeue()){
        return 0;
    }

    if(mark_done && topic->is_done==0){
        topic->is_done=1;

        askYN=saveY;
        currMode=save_master;
        save_data();
        currMode=save_master;
    }

    return 1;
}

/*
=========================================================
QUEUE: CLEAR
=========================================================
*/

EMSCRIPTEN_KEEPALIVE
void wasm_clear_queue(void){
    clear_queue();

    askYN=saveY;
    currMode=save_queue;
    save_data();
    currMode=save_master;
}
