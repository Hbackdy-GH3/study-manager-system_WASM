#include "topic.h"

Topic* insert_init(char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=(Topic*)malloc(sizeof(Topic));

    if(newNode==NULL){
        printf("Memory is full\n");
        return NULL;
    }

    strncpy(newNode->subject, subject, TEXT_SIZE-1);
    newNode->subject[TEXT_SIZE-1]='\0';

    strncpy(newNode->chapter, chapter, TEXT_SIZE-1);
    newNode->chapter[TEXT_SIZE-1]='\0';

    newNode->priority=priority;
    newNode->is_done=is_done;
    newNode->next=NULL;
    newNode->prev=NULL;

    return newNode;
}

void insertfront(Topic* node){
    if(node==NULL){
        return;
    }

    if(head==NULL){
        node->next=NULL;
        node->prev=NULL;
        head=tail=node;
    }
    else{
        node->next=head;
        node->prev=NULL;
        head->prev=node;
        head=node;
    }

    if(askYN==saveY){   /* don't print every topic while loading */
        print_topic(node);
    }
}

void insertback(Topic* node){
    if(node==NULL){
        return;
    }

    if(head==NULL){
        node->next=NULL;
        node->prev=NULL;
        head=tail=node;
    }
    else{
        node->next=NULL;
        node->prev=tail;
        tail->next=node;
        tail=node;
    }

    if(askYN==saveY){   /* don't print every topic while loading */
        print_topic(node);
    }
}

void insert_any(Topic* node, Topic* temp){
    if(node==NULL || temp==NULL){
        return;
    }

    Topic* save=temp->prev;

    node->prev=save;
    node->next=temp;
    temp->prev=node;

    if(save==NULL){
        head=node;
    }
    else{
        save->next=node;
    }

    if(askYN==saveY){   /* don't print every topic while loading */
        print_topic(node);
    }
}

void insert_node_by_priority(Topic* node){
    if(node==NULL){
        return;
    }

    Topic* temp=head;

    if(head==NULL){
        insertfront(node);
        return;
    }

    /*
        High (1) -> Medium (0) -> Low (-1).
        Equal priority keeps insertion order.
    */
    while(temp!=NULL && node->priority<=temp->priority){
        temp=temp->next;
    }

    if(temp==NULL){
        insertback(node);
    }
    else{
        insert_any(node,temp);
    }
}

/*
    Central save point for insertion.

    insert_node_by_priority() may internally call front/back/anywhere,
    but saving here avoids writing the same logic three times.
*/
void insert_prior(char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=insert_init(subject,chapter,priority,is_done);

    if(newNode==NULL){
        return;
    }

    insert_node_by_priority(newNode);

    if(askYN==saveY){
        currMode=save_master;
        save_data();
    }
}
