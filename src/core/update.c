#include "topic.h"

void update_priority(Topic* node){
    printf("\nChoose new priority:\n");
    printf("   1 = High\n");
    printf("   0 = Medium\n");
    printf("  -1 = Low\n");
    printf("Enter priority: ");
    int ask=read_priority();

    remove_node(node);
    node->priority=ask;
    insert_node_by_priority(node);
    printf("Priority updated to %s.\n", priority_text(ask));
    if(askYN==saveY){
        currMode=save_master;
        save_data();
    }
}

void update_status(Topic* node){
    printf("\nChoose new status:\n");
    printf("  1 = Completed\n");
    printf("  0 = Pending\n");
    printf("Enter status: ");
    int ask=read_choice(0, 1);

    if(ask==1){
        node->completed_on=today_ymd();
    } else{
        node->completed_on=0;
    }
    node->is_done=ask;
    print_topic(node);
    if(ask==1){
        printf("Status updated to Completed.\n");
    } else{
        printf("Status updated to Pending.\n");
    }
    if(askYN==saveY){
        currMode=save_master;
        save_data();
    }
}
