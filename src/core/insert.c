#include "topic.h"

Topic* insert_init(int topic_id,char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=(Topic*)malloc(sizeof(Topic));
    if(newNode==NULL){
        printf("Memory is full\n");
        return NULL;
    }
    if(topic_id==0){
        newNode->topic_id=next_id;
        next_id++;
    }else{
        newNode->topic_id=topic_id;
    }
    strcpy(newNode->subject, subject);    
    strcpy(newNode->chapter, chapter);
    newNode->priority=priority;
    newNode->is_done=is_done;
    newNode->in_plan=0;
    newNode->completed_on=0;
    return newNode;
}


void insertfront(Topic* node){
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
        
        if(askYN==saveY){
            print_topic(node);
        }
    }

}

void insertback(Topic* node){
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
        
        if(askYN==saveY){
            print_topic(node);
        }
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
    if(askYN==saveY){
        print_topic(node);
    }
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

Topic* insert_prior(int topic_id,char subject[], char chapter[], int priority, int is_done){
    Topic* newNode=insert_init(topic_id,subject,chapter,priority,is_done);
    if (newNode == NULL){
        return NULL;
    }
    insert_node_by_priority(newNode);
    if(askYN==saveY){
        currMode=save_master;
        save_data();
    }

    return newNode;
}