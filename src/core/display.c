#include "topic.h"

const char* priority_text(int priority){
    switch (priority){
        case 1:
            return "High";
        case 0:
            return "Medium";
        case -1:
            return "Low";
        default:
            return "Unknown";
    }
}

void print_topic(Topic* node){
    printf("\n+--------------------------------------+\n");
    printf("|             TOPIC DETAILS            |\n");
    printf("+--------------------------------------+\n");
    printf("| Subject  : %-25s |\n", node->subject);
    printf("| Chapter  : %-25s |\n", node->chapter);
    printf("| Priority : %-25s |\n", priority_text(node->priority));
    printf("| Status   : %-25s |\n", node->is_done ? "Completed" : "Pending");
    if(node->in_plan==1){
        printf("| In plan  : %-25s |\n", "Yes");
    }
    printf("+--------------------------------------+\n");
}

void print_table_header(){
    printf("  %-3s %-18s %-22s %-8s %-10s\n", "No", "Subject", "Chapter", "Priority", "Status");
    printf("  %-3s %-18s %-22s %-8s %-10s\n", "--", "-------", "-------", "--------", "------");
}

void print_topic_row(int no, Topic* node){
    printf("  %-3d %-18.18s %-22.22s %-8s %-10s%s\n", no, node->subject, node->chapter, priority_text(node->priority), node->is_done ? "Completed" : "Pending", node->in_plan ? "  [plan]" : "");
}

void print_all(){
    Topic* temp=head;
    int no=1;
    print_table_header();
    while(temp!=NULL){
        print_topic_row(no, temp);
        no++;
        temp=temp->next;
    }
}

void print_header(const char* title){
    printf("\n==================== %s ====================\n", title);
}

int count_topics(){
    int n=0;
    Topic* temp=head;
    while(temp!=NULL){
        n++;
        temp=temp->next;
    }
    return n;
}
