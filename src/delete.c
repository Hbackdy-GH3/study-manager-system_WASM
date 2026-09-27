#include "topic.h"

void pop(){
    int choice;
    printf("AT WHICH NODE , DO YOU WANT TO DELETE ?");
    printf("1. FRONT?");
    printf("2. BACK?");
    printf("3. ANWHERE IN BETWEEN?");
    while (1){
        printf("Enter your choice: ");
        scanf("%d",&choice);
        switch (choice){
            case 1:
                popfront();
                break;
            case 2: 
                popback();
                break;
            case 3:
                // if(head==NULL){
                //     printf("File is empty.\n");
                //     return;
                // }
                // else if(head==tail){
                //     printf("There is only one topic\n");
                //     popfront();
                //     return;
                // }
                // Topic* temp=head;
                // int n=1, choice;
                // while(temp!=NULL){
                //     printf("%d. ",n),print_topic(temp);
                //     temp=temp->next;
                //     n++;
                // }
                // temp=head;
                // printf("Enter you choice: ");
                // scanf("%d",&choice);
                // if(choice==1){
                //     popfront();
                //     return;
                // }
                // else if(choice==n-1){
                //     popback();
                //     return;
                // }
                // else if(choice<n-1 && choice>1){
                //     n=1;
                //     while(n<choice){
                //     temp=temp->next;
                //     n++;
                // }
                search_topic();
                // popany(temp);
                break;

            default:
                printf("Invalid choice. Enter 1 or 2 or 3: ");
                continue;
        }
        if(choice==1 || choice==2 || choice==3 ){
            break;
        }
    }
}

void popfront(){
    if(head==NULL){
        printf("File is empty.");
        return;
    }
    print_topic(head);
    printf("\n do you want to delete the topic?\n1.Yes\n2.No\n");
    int ans;

    while (1) {
        scanf("%d", &ans);
        switch (ans){
            case 1:{
                Topic* temp=head;
                if(head==tail){
                    free(temp);
                    head=NULL;
                    tail=NULL;
                    save_data();
                    return;
                }
                head=head->next;
                head->prev=NULL;
                free(temp);
                printf("Deleted!\n");
                save_data();
                break;
            }
            
            case 2:
                printf("Topic remains same.\n");
                break;
            
            default:
                printf("Invalid choice. Enter 1 or 2: ");
        }
        if(ans==1 || ans==2){
            break;
        }
    }
}

void popback(){
    if(head==NULL){
        printf("File is empty.");
        return;
    }
    print_topic(tail);
    printf("\n do you want to delete the topic?\n1.Yes\n2.No\n");
    int ans;

    while (1) {
        scanf("%d", &ans);
        switch (ans){
            case 1:{
                
                Topic* temp=tail;
                if(head==tail){
                    free(temp);
                    head=NULL;
                    tail=NULL;
                    save_data();
                    return;
                }
                tail=tail->prev;
                tail->next=NULL;
                free(temp);
                printf("Deleted!\n");
                save_data();
                break;
            }
            
            case 2:
                printf("Topic remains same.\n");
                break;
            
            default:
                printf("Invalid choice. Enter 1 or 2: ");
        }
        if(ans==1 || ans==2){
            break;
        }
    }
}

void popany(Topic* node){
    if(node->prev==NULL){
        popfront();
        return;
    }
    else if(node->next==NULL){
        popback();
        return;
    }
    Topic* save=node->next;
    save->prev=node->prev;
    node->prev->next=save;
    free(node);
    printf("Deleted!\n");
    save_data();
}

void remove_node(Topic* node){
    if(node->prev != NULL)
        node->prev->next = node->next;
    else
        head = node->next;

    if(node->next != NULL)
        node->next->prev = node->prev;
    else
        tail = node->prev;

    node->next = NULL;
    node->prev = NULL;
}
