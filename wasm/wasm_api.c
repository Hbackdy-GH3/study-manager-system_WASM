#include "topic.h"

char json_buf[200000];
int json_len=0;

void json_reset(){
    json_len=0;
    json_buf[0]='\0';
}

void json_add(const char* text){
    int n=strlen(text);
    if(json_len+n<(int)sizeof(json_buf)-1){
        strcpy(json_buf+json_len, text);
        json_len+=n;
    }
}

void json_int(const char* key, int value, int comma){
    char tmp[80];
    if(comma==1){
        sprintf(tmp, "\"%s\":%d,", key, value);
    } else{
        sprintf(tmp, "\"%s\":%d", key, value);
    }
    json_add(tmp);
}

void json_text(const char* key, const char* value, int comma){
    char tmp[256];
    int j=0;
    sprintf(tmp, "\"%s\":\"", key);
    json_add(tmp);
    for(int i=0; value[i]!='\0' && j<200; i++){
        char c=value[i];
        if(c=='"' || c=='\\'){
            tmp[j]='\\';
            j++;
            tmp[j]=c;
            j++;
        } else if((unsigned char)c<32){
            tmp[j]=' ';
            j++;
        } else{
            tmp[j]=c;
            j++;
        }
    }
    tmp[j]='\0';
    json_add(tmp);
    if(comma==1){
        json_add("\",");
    } else{
        json_add("\"");
    }
}

int in_queue(Topic* node){
    QueueNode* temp=front;
    while(temp!=NULL){
        if(temp->topic==node){
            return 1;
        }
        temp=temp->next;
    }
    return 0;
}

int today_wday(){
    struct tm *t=localtime(&(time_t){time(NULL)});
    return t->tm_wday;
}

int done_on_day(int day){
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->completed_on!=0 && day_number(temp->completed_on)==day){
            return 1;
        }
        temp=temp->next;
    }
    return 0;
}

int study_streak(){
    int day=day_number(today_ymd());
    int streak=0;
    if(done_on_day(day)==0){
        day--;
    }
    while(done_on_day(day)==1){
        streak++;
        day--;
    }
    return streak;
}

void save_all(){
    currMode=save_master;
    save_data();
    currMode=save_queue;
    save_data();
    currMode=save_plan;
    save_data();
    currMode=save_master;
}

int ids_contains(const char* ids, int id){
    char copy[4000];
    strncpy(copy, ids, sizeof(copy)-1);
    copy[sizeof(copy)-1]='\0';
    char* part=strtok(copy, ",");
    while(part!=NULL){
        if(atoi(part)==id){
            return 1;
        }
        part=strtok(NULL, ",");
    }
    return 0;
}

int text_ok(const char* text){
    if(text==NULL || strlen(text)==0 || strlen(text)>=50){
        return 0;
    }
    if(strchr(text, ',')!=NULL){
        return 0;
    }
    return 1;
}

int wasm_init(){
    askYN=saveN;
    currMode=save_master;
    load_data();
    currMode=save_queue;
    load_data();
    currMode=save_plan;
    load_data();
    currMode=save_master;
    askYN=saveY;

    if(plan.exists==0){
        Topic* temp=head;
        while(temp!=NULL){
            temp->in_plan=0;
            temp=temp->next;
        }
    }
    save_all();
    return count_topics();
}

const char* wasm_get_state(){
    int today=today_ymd();
    json_reset();
    json_add("{");
    json_int("today", today, 1);
    json_text("todayText", display_date(today), 1);

    json_add("\"topics\":[");
    Topic* temp=head;
    int first=1;
    int count1=0,count2=0;
    while(temp!=NULL){
        if(first==0){
            json_add(",");
        }
        first=0;
        json_add("{");
        json_int("id", temp->topic_id, 1);
        json_text("subject", temp->subject, 1);
        json_text("chapter", temp->chapter, 1);
        json_int("priority", temp->priority, 1);
        json_int("done", temp->is_done, 1);
        json_int("inPlan", temp->in_plan, 1);
        json_int("completedOn", temp->completed_on, 1);
        json_int("inQueue", in_queue(temp), 0);
        json_add("}");
        if(temp->completed_on==today){
            count1++;
            if(temp->in_plan==1){
                count2++;
            }
        }
        temp=temp->next;
    }
    json_add("],");

    json_add("\"queue\":[");
    QueueNode* q=front;
    first=1;
    while(q!=NULL){
        char tmp[20];
        if(first==0){
            json_add(",");
        }
        first=0;
        sprintf(tmp, "%d", q->topic->topic_id);
        json_add(tmp);
        q=q->next;
    }
    json_add("],");

    json_add("\"plan\":{");
    json_int("exists", plan.exists, 1);
    if(plan.exists==1){
        int n1=0,n2=0;
        filter_plan_via_status(&n1,&n2);
        int rem=plan_validity();
        json_text("name", plan.plan_name, 1);
        json_int("start", plan.start_date, 1);
        json_int("end", plan.end_date, 1);
        json_text("startText", display_date(plan.start_date), 1);
        json_text("endText", display_date(plan.end_date), 1);
        json_int("totals", n2, 1);
        json_int("done", n1, 1);
        json_int("basePace", plan.base_pace, 1);
        json_int("totalDays", day_number(plan.end_date)-day_number(plan.start_date)+1, 1);
        json_int("daysLeft", rem, 1);
        if(rem==-1){
            json_text("stage", "ended", 1);
            json_int("target", 0, 1);
            json_int("morningTarget", 0, 1);
            json_int("diff", 0, 0);
        } else if(today<plan.start_date){
            json_text("stage", "notstarted", 1);
            json_int("target", 0, 1);
            json_int("morningTarget", 0, 1);
            json_int("diff", 0, 0);
        } else{
            json_text("stage", "active", 1);
            json_int("target", today_target(), 1);
            json_int("morningTarget", ((n2-n1)+count2+rem-1)/rem, 1);
            json_int("diff", curr_base_pace(), 0);
        }
    } else{
        json_int("totals", 0, 0);
    }
    json_add("},");

    json_add("\"report\":{");
    json_int("doneToday", count1, 1);
    json_int("donePlanToday", count2, 0);
    json_add("},");

    json_int("streak", study_streak(), 1);
    json_add("\"week\":[");
    int wday=today_wday();
    int monday=day_number(today)-((wday+6)%7);
    for(int i=0; i<7; i++){
        char tmp[20];
        int state=done_on_day(monday+i);
        if(monday+i>day_number(today)){
            state=-1;
        }
        if(i<6){
            sprintf(tmp, "%d,", state);
        } else{
            sprintf(tmp, "%d", state);
        }
        json_add(tmp);
    }
    json_add("],");
    json_int("todayIndex", (wday+6)%7, 0);
    json_add("}");
    return json_buf;
}

int wasm_add_topic_at(const char* subject, const char* chapter, int priority, int pos){
    if(text_ok(subject)==0 || text_ok(chapter)==0){
        return -1;
    }
    if(priority!=1 && priority!=0 && priority!=-1){
        return -1;
    }
    Topic* temp=head;
    while(temp!=NULL){
        if(CI((char*)subject, temp->subject) && CI((char*)chapter, temp->chapter)){
            return -2;
        }
        temp=temp->next;
    }
    char sub[50], ch[50];
    strcpy(sub, subject);
    strcpy(ch, chapter);
    askYN=saveN;
    Topic* node=insert_init(0, sub, ch, priority, 0);
    if(node==NULL){
        askYN=saveY;
        return -3;
    }
    if(pos==1){
        insertfront(node);
    } else if(pos==2){
        insertback(node);
    } else{
        insert_node_by_priority(node);
    }
    askYN=saveY;
    save_all();
    return node->topic_id;
}

int wasm_add_topic(const char* subject, const char* chapter, int priority){
    return wasm_add_topic_at(subject, chapter, priority, 0);
}

int wasm_delete_topic(int id){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    askYN=saveN;
    remove_from_queue(node);
    askYN=saveY;
    remove_node(node);
    free(node);
    if(plan.exists==1){
        cal_start_totals();
    }
    save_all();
    return 1;
}

int wasm_set_status(int id, int done){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    if(done==1){
        node->is_done=1;
        node->completed_on=today_ymd();
    } else{
        node->is_done=0;
        node->completed_on=0;
    }
    save_all();
    return 1;
}

int wasm_set_priority(int id, int priority){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    if(priority!=1 && priority!=0 && priority!=-1){
        return -2;
    }
    askYN=saveN;
    remove_node(node);
    node->priority=priority;
    insert_node_by_priority(node);
    askYN=saveY;
    save_all();
    return 1;
}

int wasm_enqueue_topic(int id){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    int added=enqueue(node);
    save_all();
    return added;
}

int wasm_finish_queue_topic(int id, int completed){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    if(completed==1){
        node->is_done=1;
        node->completed_on=today_ymd();
    }
    askYN=saveN;
    remove_from_queue(node);
    askYN=saveY;
    save_all();
    return 1;
}

int wasm_fill_queue(){
    if(plan.exists==0){
        return -1;
    }
    if(today_target()==0){
        return -2;
    }
    int before=queue_count();
    fill_queue_from_plan();
    int added=queue_count()-before;
    save_all();
    if(added==0){
        return -3;
    }
    return added;
}

int wasm_create_plan(const char* name, int start, int end, const char* ids){
    if(plan.exists==1){
        return -1;
    }
    if(text_ok(name)==0){
        return -2;
    }
    if(valid_date(start)!=0){
        return -3;
    }
    if(valid_date(end)!=0){
        return -4;
    }
    if(end<=start){
        return -5;
    }
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->is_done==0 && ids_contains(ids, temp->topic_id)==1){
            temp->in_plan=1;
        } else{
            temp->in_plan=0;
        }
        temp=temp->next;
    }
    cal_start_totals();
    if(plan.start_totals==0){
        return -6;
    }
    strcpy(plan.plan_name, name);
    plan.start_date=start;
    plan.end_date=end;
    int rem=plan_validity();
    plan.base_pace=(plan.start_totals+rem-1)/rem;
    plan.exists=1;
    save_all();
    return 1;
}

int wasm_set_plan_topics(const char* ids){
    if(plan.exists==0){
        return -1;
    }
    Topic* temp=head;
    while(temp!=NULL){
        if(ids_contains(ids, temp->topic_id)==1){
            temp->in_plan=1;
        } else{
            temp->in_plan=0;
        }
        temp=temp->next;
    }
    cal_start_totals();
    save_all();
    return plan.start_totals;
}

int wasm_delete_plan(){
    if(plan.exists==0){
        return -1;
    }
    Topic* temp=head;
    while(temp!=NULL){
        temp->in_plan=0;
        temp=temp->next;
    }
    plan.plan_name[0]='\0';
    plan.base_pace=0;
    plan.start_date=0;
    plan.end_date=0;
    plan.start_totals=0;
    plan.exists=0;
    save_all();
    return 1;
}

int wasm_extend_plan(int new_end){
    if(plan.exists==0){
        return -1;
    }
    if(valid_date(new_end)!=0){
        return -2;
    }
    if(new_end<=plan.end_date){
        return -3;
    }
    plan.end_date=new_end;
    save_all();
    return 1;
}

int wasm_import_topic(const char* subject, const char* chapter, int priority, int done, int completed_on, int in_plan){
    if(text_ok(subject)==0 || text_ok(chapter)==0){
        return -1;
    }
    if(priority!=1 && priority!=0 && priority!=-1){
        return -1;
    }
    Topic* temp=head;
    while(temp!=NULL){
        if(CI((char*)subject, temp->subject) && CI((char*)chapter, temp->chapter)){
            return -2;
        }
        temp=temp->next;
    }
    char sub[50], ch[50];
    strcpy(sub, subject);
    strcpy(ch, chapter);
    askYN=saveN;
    Topic* node=insert_prior(0, sub, ch, priority, 0);
    askYN=saveY;
    if(node==NULL){
        return -3;
    }
    if(done==1){
        node->is_done=1;
        node->completed_on=completed_on;
    }
    if(in_plan==1 && plan.exists==0){
        node->in_plan=1;
    }
    return node->topic_id;
}

int wasm_import_queue(int id){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    askYN=saveN;
    int added=enqueue(node);
    askYN=saveY;
    return added;
}

int wasm_import_plan(const char* name, int start, int end, int base_pace){
    if(plan.exists==1){
        return -1;
    }
    if(text_ok(name)==0 || start<=0 || end<=start){
        return -2;
    }
    int n1=0,n2=0;
    filter_plan_via_status(&n1,&n2);
    if(n2==0){
        return -3;
    }
    strcpy(plan.plan_name, name);
    plan.start_date=start;
    plan.end_date=end;
    plan.start_totals=n2;
    plan.base_pace=base_pace;
    plan.exists=1;
    return 1;
}

int wasm_import_done(){
    if(plan.exists==0){
        Topic* temp=head;
        while(temp!=NULL){
            temp->in_plan=0;
            temp=temp->next;
        }
    }
    save_all();
    return count_topics();
}

int wasm_queue_at(int id, int pos){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    if(in_queue(node)==1){
        return 0;
    }
    QueueNode* newNode=(QueueNode*)malloc(sizeof(QueueNode));
    if(newNode==NULL){
        return -3;
    }
    newNode->topic=node;
    newNode->next=NULL;
    if(front==NULL){
        front=back=newNode;
    } else if(pos<=0){
        newNode->next=front;
        front=newNode;
    } else{
        QueueNode* temp=front;
        int i=1;
        while(temp->next!=NULL && i<pos){
            temp=temp->next;
            i++;
        }
        newNode->next=temp->next;
        temp->next=newNode;
        if(newNode->next==NULL){
            back=newNode;
        }
    }
    save_all();
    return 1;
}

int wasm_set_completed(int id, int day){
    Topic* node=find_by_id(id);
    if(node==NULL){
        return -1;
    }
    if(day==0){
        node->is_done=0;
        node->completed_on=0;
    } else{
        node->is_done=1;
        node->completed_on=day;
    }
    save_all();
    return 1;
}

int wasm_delete_first(){
    if(head==NULL){
        return -1;
    }
    int id=head->topic_id;
    wasm_delete_topic(id);
    return id;
}

int wasm_delete_last(){
    if(tail==NULL){
        return -1;
    }
    int id=tail->topic_id;
    wasm_delete_topic(id);
    return id;
}

int wasm_enqueue_filtered(int stat, int prior, int n){
    Topic* temp=head;
    int i=0;
    askYN=saveN;
    while(temp!=NULL && i<n){
        if(temp->priority==prior && temp->is_done==stat){
            if(enqueue(temp)==1){
                i++;
            }
        }
        temp=temp->next;
    }
    askYN=saveY;
    save_all();
    return i;
}
