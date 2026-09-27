#include "topic.h"

Topic* insert_init(char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=(Topic*)malloc(sizeof(Topic));
    if(newNode==NULL){
        printf("Memory is full\n");
        return NULL;
    } 
    strcpy(newNode->subject, subject);    
    strcpy(newNode->chapter, chapter);
    newNode->priority=priority;
    newNode->is_done=is_done;
    return newNode;
}


void insertfront(Topic* node){
    // Topic* newNode=insert_init(subject,chapter,priority,is_done);

    if (node!=NULL){
        if(head==NULL){
            node->next=NULL;
            node->prev=NULL;
            head=tail=node;
            
        } else{
            node->next=head;
            head->prev=node;
            head=node;
            head->prev=NULL;
        }
        
        print_topic(node);
        save_data();
    }

}

void insertback(Topic* node){
    // Topic* newNode=insert_init(subject,chapter,priority,is_done);

    if(node!=NULL){
        if(head==NULL){
            node->next=NULL;
            node->prev=NULL;
            head=tail=node;
            
        } else{
            node->next=NULL;
            node->prev=tail;
            tail->next=node;
            tail=node;
            
        }
        
        print_topic(node);
        save_data();
    }
}

void insert_any(Topic* node, Topic* temp){
    Topic* save=temp->prev;
    
    node->prev=save;
    node->next=temp;
    temp->prev=node;
    if(save==NULL){
        head=node;
    }else{
        save->next=node;
    }
    print_topic(node);
    save_data();

}

void insert_node_by_priority(Topic* node){
    Topic* temp = head;

    if(head == NULL){
        insertfront(node);
        return;
    }

    while(temp != NULL && node->priority <= temp->priority){
        temp = temp->next;
    }

    if(temp == NULL){
        insertback(node);
    } else {
        insert_any(node, temp);
    }
}

void insert_prior(char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=insert_init(subject,chapter,priority,is_done);
    insert_node_by_priority(newNode);

}