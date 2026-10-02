#include "topic.h"

void enqueue_ask(){
    int t,stat,prior;
    Topic* temp=head;
    t=filter(&prior,&stat);
    if(t==0){
        printf("\nNo topics match this choice.\n");
        return;
    }
    printf("\nHow many topics do you want to study? (0 to %d): ", t);
    int n=read_choice(0, t);

    int i=0;
    while(temp!=NULL && i<n){
        if(temp->priority==prior && temp->is_done==stat){
            if(enqueue(temp)==1){
                i++;
                printf("  Added: %s - %s\n", temp->subject, temp->chapter);
            }
        }
        temp=temp->next;
    }
    currMode=save_queue;
    save_data();
    currMode=save_master;
    printf("%d topic(s) added to today's queue.\n", i);
}

int enqueue(Topic* node){
    QueueNode* temp=front;
    while(temp!=NULL){
        if(temp->topic==node){
            printf("  Already in queue: %s - %s\n", node->subject, node->chapter);
            return 0;
        }
        temp=temp->next;
    }

    QueueNode* newNode=(QueueNode*)malloc(sizeof(QueueNode));
    if(newNode==NULL){
        printf("Memory is full, could not add to queue.\n");
        return 0;
    }
    newNode->topic=node;
    newNode->next=NULL;
    if(front==NULL){
        front=back=newNode;
    } else{
        back->next=newNode;
        back=newNode;
    }
    return 1;
}

int queue_count(){
    int count=0;
    QueueNode* temp=front;
    while(temp!=NULL){
        count++;
        temp=temp->next;
    }
    return count;
}

void remove_from_queue(Topic* node){
    QueueNode* temp=front;
    QueueNode* prev=NULL;
    while(temp!=NULL){
        if(temp->topic==node){
            QueueNode* del=temp;
            if(prev==NULL){
                front=temp->next;
            } else{
                prev->next=temp->next;
            }
            if(back==del){
                back=prev;
            }
            temp=temp->next;
            free(del);
            currMode=save_queue;
            save_data();
            currMode=save_master;
            continue;
        }
        prev=temp;
        temp=temp->next;
    }
}


void display_queue(){
    QueueNode* temp=front;
    print_header("TODAY'S QUEUE");
    if(front==NULL){
        printf("  Today's queue is empty.\n");
        return;
    }
    int no=1;
    print_table_header();
    while(temp!=NULL){
        print_topic_row(no, temp->topic);
        no++;
        temp=temp->next;
    }
}

void dequeue(){
    if(front==NULL){
        printf("Today's queue is empty. Add topics with option 6 or 15.\n");
        return;
    }
    printf("\nStudy this topic now:\n");
    print_topic(front->topic);
    printf("Have you completed it? (Y/N): ");

    if(read_yn()=='Y'){
        front->topic->is_done=1;
        front->topic->completed_on=today_ymd();
        currMode=save_master;
        save_data();
        printf("Great! Marked as completed.\n");
    } else{
        printf("Okay, it stays pending.\n");
    }

    QueueNode* temp=front;
    front=front->next;
    if(front==NULL){
        back=NULL;
    }
    free(temp);
    currMode=save_queue;
    save_data();
    currMode=save_master;
    printf("Removed from today's queue. %d topic(s) left.\n", queue_count());
}
