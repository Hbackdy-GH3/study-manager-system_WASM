#include "topic.h"

void update_priority(Topic* node){
    if(node==NULL){
        return;
    }

    int ask;

    printf("Enter your priority as: \n");
    printf("1 for High \n");
    printf("0 for Medium \n");
    printf("-1 for Low \n");

    while(1){
        ask=read_int();

        if(ask==1 || ask==0 || ask==-1){
            break;
        }

        printf("Please enter 1, 0 or -1: ");
    }

    if(ask==node->priority){
        printf("Priority is already the same.\n");
        return;
    }

    remove_node(node);
    node->priority=ask;
    insert_node_by_priority(node);

    if(askYN==saveY){
        currMode=save_master;
        save_data();

        currMode=save_queue;
        save_data();

        currMode=save_master;
    }
}

void update_status(Topic* node){
    if(node==NULL){
        return;
    }

    int ask;

    printf("Enter your status as: \n");
    printf("1 for Completed \n");
    printf("0 for Pending \n");

    while(1){
        ask=read_int();

        if(ask==0 || ask==1){
            break;
        }

        printf("Please enter 1 or 0: ");
    }

    node->is_done=ask;
    print_topic(node);

    if(askYN==saveY){
        currMode=save_master;
        save_data();

        currMode=save_queue;
        save_data();

        currMode=save_master;
    }
}
