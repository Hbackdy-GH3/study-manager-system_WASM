#include "topic.h"

static int confirm_delete(Topic* node){
    if(node==NULL){
        return 0;
    }

    print_topic(node);
    printf("\nDo you want to delete the topic?\n1. Yes\n2. No\n");

    while(1){
        int ans=read_int();

        if(ans==1){
            return 1;
        }

        if(ans==2){
            printf("Topic remains same.\n");
            return 0;
        }

        printf("Invalid choice. Enter 1 or 2: ");
    }
}

void pop(void){
    int choice;

    printf("\nAT WHICH NODE DO YOU WANT TO DELETE?\n");
    printf("1. FRONT\n");
    printf("2. BACK\n");
    printf("3. ANYWHERE IN BETWEEN (search by subject + chapter)\n");

    while(1){
        printf("Enter your choice: ");
        choice=read_int();

        switch(choice){
            case 1:
                popfront();
                return;

            case 2:
                popback();
                return;

            case 3:
                search_topic();
                return;

            default:
                printf("Invalid choice. Enter 1, 2 or 3.\n");
        }
    }
}

/*
    Remove a Topic from both structures safely.

    QueueNode stores Topic*, so the queue reference must be removed
    BEFORE the Topic itself is freed.
*/
void delete_node(Topic* node){
    if(node==NULL){
        return;
    }

    queue_remove_topic(node);
    remove_node(node);
    free(node);

    printf("Deleted!\n");

    if(askYN==saveY){
        currMode=save_master;
        save_data();

        currMode=save_queue;
        save_data();

        currMode=save_master;
    }
}

void popfront(void){
    if(head==NULL){
        printf("List is empty.\n");
        return;
    }

    if(confirm_delete(head)){
        delete_node(head);
    }
}

void popback(void){
    if(head==NULL){
        printf("List is empty.\n");
        return;
    }

    if(confirm_delete(tail)){
        delete_node(tail);
    }
}

void popany(Topic* node){
    if(node==NULL){
        return;
    }

    if(confirm_delete(node)){
        delete_node(node);
    }
}

void remove_node(Topic* node){
    if(node==NULL){
        return;
    }

    if(node->prev!=NULL){
        node->prev->next=node->next;
    }
    else{
        head=node->next;
    }

    if(node->next!=NULL){
        node->next->prev=node->prev;
    }
    else{
        tail=node->prev;
    }

    node->next=NULL;
    node->prev=NULL;
}

/* Used by the browser import/reload path. */
void free_all_topics(void){
    clear_queue();

    Topic* temp=head;

    while(temp!=NULL){
        Topic* next=temp->next;
        free(temp);
        temp=next;
    }

    head=NULL;
    tail=NULL;
}
