#include "topic.h"

int print_matching(int status, int priority){
    Topic* temp=head;
    int no=0;
    while(temp!=NULL){
        if((status==-1 || temp->is_done==status) && (priority==2 || temp->priority==priority)){
            if(no==0){
                print_table_header();
            }
            no++;
            print_topic_row(no, temp);
        }
        temp=temp->next;
    }
    if(no==0){
        printf("No topics found.\n");
    } else{
        printf("\nTotal: %d topic(s)\n", no);
    }
    return no;
}

void filter_via(){
    printf("\nChoose the filter:\n");
    printf("  1. Pending topics\n");
    printf("  2. Completed topics\n");
    printf("  3. Topics of one priority (High/Medium/Low)\n");
    printf("Enter your choice: ");
    int ask=read_choice(1, 3);

    switch (ask){
        case 1:
            print_header("PENDING TOPICS");
            print_matching(0, 2);
            break;
        case 2:
            print_header("COMPLETED TOPICS");
            print_matching(1, 2);
            break;
        case 3: {
            printf("\nChoose priority:\n");
            printf("   1 = High\n");
            printf("   0 = Medium\n");
            printf("  -1 = Low\n");
            printf("Enter priority: ");
            int choice=read_priority();
            if(choice==1){
                print_header("HIGH PRIORITY TOPICS");
            } else if(choice==0){
                print_header("MEDIUM PRIORITY TOPICS");
            } else{
                print_header("LOW PRIORITY TOPICS");
            }
            print_matching(-1, choice);
            break;
        }
    }
}


int filter(int* prior, int* stat){
    printf("\nWhich topics do you want to add?\n");
    printf("  1. Pending topics\n");
    printf("  2. Completed topics (for revision)\n");
    printf("Enter your choice: ");
    int s=read_choice(1, 2);
    if(s==1){
        *stat=0;
    } else{
        *stat=1;
    }

    int n1=0,n2=0,n3=0;
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->is_done==*stat){
            if(temp->priority==1){
                n1++;
            }
            else if(temp->priority==0){
                n2++;
            }
            else if(temp->priority==-1){
                n3++;
            }
        }
        temp=temp->next;
    }

    if(*stat==0){
        printf("\nPending topics available:\n");
    } else{
        printf("\nCompleted topics available:\n");
    }
    printf("  High   : %d\n", n1);
    printf("  Medium : %d\n", n2);
    printf("  Low    : %d\n", n3);

    printf("\nWhich priority do you want?\n");
    printf("   1 = High\n");
    printf("   0 = Medium\n");
    printf("  -1 = Low\n");
    printf("Enter priority: ");
    *prior=read_priority();

    if(*prior==1){
        return n1;
    }
    if(*prior==0){
        return n2;
    }
    return n3;
}

void filter_plan(){
    display_plan_topic();
}

void filter_plan_via_status(int* n1,int* n2){
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->in_plan == 1){
            if(temp->is_done==1){
                (*n1)+=1;
            }
            (*n2)+=1;
        }
        temp=temp->next;
    }
}
