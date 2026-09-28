#include "topic.h"

void print_topic(Topic* node)
{
    int Priority=node->priority;
    const char* priority_text="Unknown";
    switch (Priority){

        case 1:
            priority_text="High";
            break;

        case 0:
            priority_text="Medium";
            break;

        case -1:
            priority_text="Low";
            break;

        default:
            break;
    }

    printf("\n+--------------------------------------+\n");
    printf("|             TOPIC DETAILS            |\n");
    printf("+--------------------------------------+\n");

    printf("| Subject  : %-25s |\n", node->subject);
    printf("| Chapter  : %-25s |\n", node->chapter);
    printf("| Priority : %-25s |\n", priority_text);
    printf("| Status   : %-25s |\n", node->is_done ? "Completed" : "Pending");

    printf("+--------------------------------------+\n");
}

void print_all(){
    Topic* temp=head;
    while(temp!=NULL){
        print_topic(temp);
        temp=temp->next;
    }
}
