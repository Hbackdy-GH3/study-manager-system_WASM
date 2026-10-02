#include "topic.h"

void save_master_now(){
    if(askYN==saveY){
        currMode=save_master;
        save_data();
        if(plan.exists==1){
            cal_start_totals();
            currMode=save_plan;
            save_data();
            currMode=save_master;
        }
    }
}

void pop(){
    printf("\nWhere do you want to delete?\n");
    printf("  1. Front\n");
    printf("  2. Back\n");
    printf("  3. Anywhere in between (search by name)\n");
    printf("Enter your choice: ");
    int choice=read_choice(1, 3);
    switch (choice){
        case 1:
            popfront();
            break;
        case 2:
            popback();
            break;
        case 3:
            search_topic();
            break;
    }
}

void popfront(){
    if(head==NULL){
        printf("The list is empty.\n");
        return;
    }
    print_topic(head);
    printf("Do you want to delete this topic? (Y/N): ");
    if(read_yn()=='N'){
        printf("Topic not deleted.\n");
        return;
    }
    Topic* temp=head;
    remove_from_queue(temp);
    if(head==tail){
        head=NULL;
        tail=NULL;
    } else{
        head=head->next;
        head->prev=NULL;
    }
    free(temp);
    printf("Topic deleted.\n");
    save_master_now();
}

void popback(){
    if(head==NULL){
        printf("The list is empty.\n");
        return;
    }
    print_topic(tail);
    printf("Do you want to delete this topic? (Y/N): ");
    if(read_yn()=='N'){
        printf("Topic not deleted.\n");
        return;
    }
    Topic* temp=tail;
    remove_from_queue(temp);
    if(head==tail){
        head=NULL;
        tail=NULL;
    } else{
        tail=tail->prev;
        tail->next=NULL;
    }
    free(temp);
    printf("Topic deleted.\n");
    save_master_now();
}

void popany(Topic* node){
    if(node->prev==NULL){
        popfront();
        return;
    }
    else if(node->next==NULL){
        popback();
        return;
    }
    remove_from_queue(node);
    Topic* save=node->next;
    save->prev=node->prev;
    node->prev->next=save;
    free(node);
    printf("Topic deleted.\n");
    save_master_now();
}

void remove_node(Topic* node){
    if(node->prev!=NULL){
        node->prev->next=node->next;
    } else{
        head=node->next;
    }

    if(node->next!=NULL){
        node->next->prev=node->prev;
    } else{
        tail=node->prev;
    }

    node->next=NULL;
    node->prev=NULL;
}
