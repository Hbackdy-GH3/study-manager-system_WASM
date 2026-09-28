#include "topic.h"

/* 1 if this topic is already in today's queue. */
int queue_contains_topic(Topic* target){
    QueueNode* current=front;

    while(current!=NULL){
        if(current->topic==target){
            return 1;
        }

        current=current->next;
    }

    return 0;
}

/*
    Remove every QueueNode pointing to target.
    This MUST happen before the Topic node is freed.
*/
void queue_remove_topic(Topic* target){
    QueueNode* current=front;
    QueueNode* previous=NULL;

    while(current!=NULL){
        QueueNode* next=current->next;

        if(current->topic==target){
            if(previous==NULL){
                front=next;
            }
            else{
                previous->next=next;
            }

            if(current==back){
                back=previous;
            }

            free(current);
        }
        else{
            previous=current;
        }

        current=next;
    }

    if(front==NULL){
        back=NULL;
    }
}

void clear_queue(void){
    QueueNode* current=front;

    while(current!=NULL){
        QueueNode* next=current->next;
        free(current);
        current=next;
    }

    front=NULL;
    back=NULL;
}

int enqueue(Topic* node){
    if(node==NULL){
        return 0;
    }

    if(queue_contains_topic(node)){
        return 0;
    }

    QueueNode* newNode=(QueueNode*)malloc(sizeof(QueueNode));

    if(newNode==NULL){
        printf("Memory is full\n");
        return 0;
    }

    newNode->topic=node;
    newNode->next=NULL;

    if(front==NULL){
        front=back=newNode;
    }
    else{
        back->next=newNode;
        back=newNode;
    }

    return 1;
}

/* Console helper for choosing today's study queue. */
void enqueue_ask(void){
    int n,t,stat,prior;
    Topic* temp=head;

    t=filter(&prior,&stat);

    if(t==0){
        printf("No matching topics left to add.\n");
        return;
    }

    printf("Enter no. of task to study (0 to %d): ", t);

    while(1){
        n=read_int();

        if(n<0 || n>t){
            printf("Sorry, please type between 0 and %d: ", t);
            continue;
        }

        break;
    }

    int i=0;

    while(temp!=NULL && i<n){
        if(
            temp->priority==prior &&
            temp->is_done==stat &&
            !queue_contains_topic(temp)
        ){
            enqueue(temp);
            i++;
        }

        temp=temp->next;
    }

    currMode=save_queue;
    save_data();
    currMode=save_master;

    printf("%d task(s) added in queue.\n", i);
}

void display_queue(void){
    QueueNode* temp=front;

    if(front==NULL){
        printf("Today's study queue is empty.\n");
        return;
    }

    while(temp!=NULL){
        print_topic(temp->topic);
        temp=temp->next;
    }
}

void dequeue(void){
    if(front==NULL){
        printf("Today's study queue is empty.\n");
        return;
    }

    Topic* topic=front->topic;

    printf("Now study this:\n");
    print_topic(topic);

    QueueNode* old=front;
    front=front->next;

    if(front==NULL){
        back=NULL;
    }

    free(old);

    currMode=save_queue;
    save_data();
    currMode=save_master;

    printf("Removed from queue!\n");

    if(topic->is_done==0){
        printf("Did you complete it?\n1. Yes, mark as Completed\n2. No\n");

        while(1){
            int ans=read_int();

            if(ans==1){
                topic->is_done=1;

                currMode=save_master;
                save_data();
                currMode=save_master;

                break;
            }

            if(ans==2){
                break;
            }

            printf("Enter 1 or 2: ");
        }
    }
}
