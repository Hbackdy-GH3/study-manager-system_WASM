#include "topic.h"

void searched_action(Topic* node){
    int ask;
    printf("1. do you want to see details?\n");
    printf("2. do you want to update the priority?\n");
    printf("3. do you want to update the status?\n");
    printf("4. do you want to delete?\n");
    printf("5. do you want to cancel?\n");
    printf("Enter your choice: ");

    while(1){
        ask=read_int();
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
                printf("File remains same!\n");
                break;
            default:
                printf("Please enter a valid number 1 to 5: ");
                continue;
        }
        break;
    }
}


void search_topic(){
    char sub[TEXT_SIZE];
    char ch[TEXT_SIZE];
    printf("Enter subject: ");
    read_text(sub, TEXT_SIZE);
    printf("Enter chapter: ");
    read_text(ch, TEXT_SIZE);

    Topic* temp=head;
    while(temp!=NULL){
        if(CI(temp->subject,sub) && CI(temp->chapter,ch)){
            printf("Found!\n");
            searched_action(temp);
            printf("Done!\n");
            return;
        }
        temp=temp->next;
    }
    printf("Sorry, Data not found!\n");

}
