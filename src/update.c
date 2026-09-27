#include "topic.h"

void update_priority(Topic* node){
    int ask;
    printf("Enter your priority as: \n");
    printf("1 for High \n");
    printf("0 for Medium \n");
    printf("-1 for Low \n");
    scanf("%d",&ask);
    remove_node(node);
    node->priority=ask;
    insert_node_by_priority(node);
    save_data();
}

void update_status(Topic* node){
    int ask;
    printf("Enter your status as: \n");
    printf("1 for Completed \n");
    printf("0 for Pending \n");
    scanf("%d",&ask);
    node->is_done=ask;
    print_topic(node);
    save_data();
}