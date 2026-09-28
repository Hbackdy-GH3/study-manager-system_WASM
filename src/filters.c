#include "topic.h"

/* prints every topic that matches; use -99 for "any" */
static void print_matching(int status, int priority){
    int found=0;
    Topic* temp=head;
    while(temp!=NULL){
        if((status==-99 || temp->is_done==status) &&
           (priority==-99 || temp->priority==priority)){
            print_topic(temp);
            found++;
        }
        temp=temp->next;
    }
    if(found==0){
        printf("No matching topics.\n");
    }
}

void filter_via(){
    int ask;
    printf("1. Show Pending works\n");
    printf("2. Show Completed works\n");
    printf("3. Show specific priority (High/Medium/Low)\n");
    printf("Enter your choice: ");
    while(1){
        ask=read_int();
        switch (ask){
            case 1:
                print_matching(0, -99);
                break;
            case 2:
                print_matching(1, -99);
                break;
            case 3: {
                int choice;
                printf("1 for High\n");
                printf("0 for Medium\n");
                printf("-1 for Low\n");
                printf("Enter your choice: ");
                while(1){
                    choice=read_int();
                    if(choice==1 || choice==0 || choice==-1){
                        break;
                    }
                    printf("Please enter a valid number: 1 0 -1: ");
                }
                print_matching(-99, choice);
                break;
            }
            default:
                printf("Please enter a valid number 1 to 3: ");
                continue;
        }
        break;
    }
}


/*
    Asks status + priority for the study queue.
    Returns how many topics match AND are not already in the queue.
*/
int filter(int* prior, int* stat){
    printf("1. Show Pending works\n");
    printf("2. Show Completed works\n");
    printf("Enter your choice: ");

    int choice_stat;
    while(1){
        choice_stat=read_int();
        if(choice_stat==1 || choice_stat==2){
            break;
        }
        printf("Please enter a valid number 1 or 2: ");
    }
    *stat=(choice_stat==1) ? 0 : 1;

    int n1=0,n2=0,n3=0;
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->is_done==*stat && !queue_contains_topic(temp)){
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

    printf("Total %s works (not already in queue)\n", *stat==0 ? "pending" : "completed");
    printf("High: %d\n",n1);
    printf("Medium: %d\n",n2);
    printf("Low: %d\n",n3);

    printf("Which priority do you want?\n");
    printf("1. High\n");
    printf("0. Medium\n");
    printf("-1. Low\n");

    while(1){
        int choice=read_int();
        switch(choice){
            case 1:
                *prior=1;
                return n1;
            case 0:
                *prior=0;
                return n2;
            case -1:
                *prior=-1;
                return n3;
            default:
                printf("Please enter 1 0 or -1: ");
        }
    }
}
