#include "topic.h"

void filter_via(){
    int ask;
    printf("1. Show Pending works");
    printf("2. Show Completed works");
    printf("3. Show specific priority (High/Medium/Low)");
    printf("Enter your choice: \n");
    scanf("%d", &ask);
    while(1){
        switch (ask){
            case 1: {
                Topic* temp=head;
                while(temp!=NULL){
                    if(temp->is_done==0){
                        print_topic(temp);
                    }
                    temp=temp->next;
                }
            }
                break;
            case 2: {
                Topic* temp=head;
                while(temp!=NULL){
                    if(temp->is_done==1){
                        print_topic(temp);
                    }
                    temp=temp->next;
                }
            }
                break;
            case 3: {
                int choice;
                printf("1 for High\n");
                printf("0 for Medium\n");
                printf("-1 for Low\n");
                printf("Enter you choice: \n");
                while(1){
                    scanf("%d", &choice);
                    switch (choice){
                        case 1: {
                            Topic* temp=head;
                            while(temp!=NULL){
                                if(temp->priority==1){
                                    print_topic(temp);
                                }
                                temp=temp->next;
                            }
                        }
                            break;
                        case 0: {
                            Topic* temp=head;
                            while(temp!=NULL){
                                if(temp->priority==0){
                                    print_topic(temp);
                                }
                                temp=temp->next;
                            }
                        }
                            break;
                        case -1: {
                            Topic* temp=head;
                            while(temp!=NULL){
                                if(temp->priority==-1){
                                    print_topic(temp);
                                }
                                temp=temp->next;
                            }
                        }
                            break;
                        default:
                            printf("Please Enter valid number: 1 0 -1");
                            continue;
                    }
                    break;
                }
            }
            break;
            default:
                printf("Please Enter valid number: 1 to 3");
                continue;
        }
        break;
    }
}


int filter(int* prior, int* stat){
    printf("1. Show Pending works\n");
    printf("2. Show Completed works\n");
    printf("Enter your choice: \n");

    while(1){
        scanf("%d", stat);

        switch (*stat){

            case 1: {
                int n1=0,n2=0,n3=0;
                int choice;
                Topic* temp=head;

                while(temp!=NULL){
                    if(temp->is_done==0){
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

                printf("Total pending works\n");
                printf("High: %d\n",n1);
                printf("Medium: %d\n",n2);
                printf("Low: %d\n",n3);

                printf("Which priority do you want?\n");
                printf("1. High\n");
                printf("0. Medium\n");
                printf("-1. Low\n");

                while(1){
                    scanf("%d",&choice);

                    switch(choice){
                        case 1:
                            *prior=1;
                            *stat=0;
                            return n1;

                        case 0:
                            *prior=0;
                            *stat=0;
                            return n2;

                        case -1:
                            *prior=-1;
                            *stat=0;
                            return n3;

                        default:
                            printf("Please enter 1 0 or -1: ");
                    }
                }
            }

            case 2: {
                int n1=0,n2=0,n3=0;
                int choice;
                Topic* temp=head;

                while(temp!=NULL){
                    if(temp->is_done==1){
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

                printf("Total completed works\n");
                printf("High: %d\n",n1);
                printf("Medium: %d\n",n2);
                printf("Low: %d\n",n3);

                printf("Which priority do you want?\n");
                printf("1. High\n");
                printf("0. Medium\n");
                printf("-1. Low\n");

                while(1){
                    scanf("%d",&choice);

                    switch(choice){
                        case 1:
                            *prior=1;
                            *stat=1;
                            return n1;

                        case 0:
                            *prior=0;
                            *stat=1;
                            return n2;

                        case -1:
                            *prior=-1;
                            *stat=1;
                            return n3;

                        default:
                            printf("Please enter 1 0 or -1: ");
                    }
                }
            }

            default:
                printf("Please Enter valid number: 1 or 2\n");
        }
    }
}