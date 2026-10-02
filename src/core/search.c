#include "topic.h"


void searched_action(Topic* node){
    printf("\nWhat do you want to do with this topic?\n");
    printf("  1. See details\n");
    printf("  2. Update priority\n");
    printf("  3. Update status\n");
    printf("  4. Delete\n");
    printf("  5. Cancel\n");
    printf("Enter your choice: ");

    int ask=read_choice(1, 5);
    switch (ask){
        case 1:
            print_topic(node);
            break;
        case 2:
            update_priority(node);
            break;
        case 3:
            update_status(node);
            break;
        case 4:
            popany(node);
            break;
        case 5:
            printf("Nothing changed.\n");
            break;
    }
}


void search_topic(){
    char sub[50];
    char ch[50];
    printf("Enter subject: ");
    read_text(sub, sizeof(sub));
    printf("Enter chapter: ");
    read_text(ch, sizeof(ch));

    Topic* temp=head;
    while(temp!=NULL){
        if(CI(temp->subject,sub) && CI(temp->chapter,ch)){
            printf("\nTopic found:\n");
            print_topic(temp);
            searched_action(temp);
            return;
        }
        temp=temp->next;
    }
    printf("Sorry, no topic found with subject \"%s\" and chapter \"%s\".\n", sub, ch);
}

Topic* find_by_id(int id){
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->topic_id==id){
            return temp;
        }
        temp=temp->next;
    }
    return NULL;
}