#include "topic.h"
#define case_insensitive  CI

int CI(char *a, char *b){
    while(*a && *b){
        if(tolower(*a) != tolower(*b)){
            return 0;
        }
        a++;
        b++;
    }
    return (*a == '\0' && *b == '\0');
}

void searched_action(Topic* node){
    int ask;
    printf("1. do you want to see details?\n");
    printf("2. do you want to update the priority?\n");
    printf("3. do you want to update the status?\n");
    printf("4. do you want to delete?\n");
    printf("5. do you want to cancel?\n");
    printf("Enter your choice: \n");
    
    while(1){
        scanf("%d",&ask);
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
                printf("File remains same!");
                break;
            default:
                printf("Please enter valid number. 1 to 4");
                continue;
        }
        break;
    }
}


void search_topic(){
    char sub[50];
    char ch[50];
    printf("Enter subject: ");
    scanf(" %49[^\n]", sub);
    printf("Enter chapter: ");
    scanf(" %49[^\n]", ch);

    Topic* temp=head;
    while(temp!=NULL){
        if(CI(temp->subject,sub) && CI(temp->chapter,ch)){
            printf("Found!");
            searched_action(temp);
            printf("Done!");
            return;
        }
        temp=temp->next;
    }
    printf("Sorry, Data not found!");

}