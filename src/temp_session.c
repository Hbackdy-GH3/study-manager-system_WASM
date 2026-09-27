#include "topic.h"

void enqueue(){
    int n,t,stat,prior;
    Topic* temp=head;
    t=filter(&prior,&stat);
    printf("Enter no. of task to study ?");
    while(1){
        scanf("%d", &n);
        if(n < 0 || n > t){
            printf("Sorry please type in between 0 and %d \n", t);
            continue;
        }
        else {
            int i=0;
            while(temp!=NULL && i<n){
                if(temp->priority==prior && temp->is_done==stat){
                    QueueNode* newNode=(QueueNode*)malloc(sizeof(QueueNode));
                    if(newNode==NULL){
                        printf("Today memory session empty");
                        return;
                    }
                    newNode->topic=temp;
                    newNode->next=NULL;
                    if (front==NULL){
                        front=back=newNode;
                    } else{
                        back->next=newNode;
                        back=newNode;
                    }
                    i++;
                }
                temp=temp->next;
            }
        }
        break;
    }
    printf("Tasks added in queue as per your requirement!");
}

void display_queue(){
    QueueNode* temp=front;
    if(front==NULL){
        printf("Today Session topic list is empty!");
        return;
    }
    while(temp!=NULL){
        print_topic(temp->topic);
        temp=temp->next;
    }
}

void dequeue(){
    if(front==NULL){
        printf("Today Session topic list is empty!");
        return;
    }
    printf("Now study this:\n");
    print_topic(front->topic);
    
    if(front->next==NULL){
        print_topic(front->topic);
        free(front);
        front=NULL;
        back=NULL;
        return;
    }
    
    QueueNode* temp=front->next;
    free(front);
    front=temp;
    printf("Removed from queue!\n");
}