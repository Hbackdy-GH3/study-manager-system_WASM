#include "topic.h"

void show_progress(){
    if(head==NULL){
        printf("Data not available!\n");
        return;
    }
    int total=0, completed=0, pending=0;
    Topic* temp=head;
    while(temp!=NULL){
        if(temp->is_done==1){
            completed++;
        } else{
            pending++;
        }
        temp=temp->next;
        total++;
    }
    float percentage = (completed * 100.0) / total;

    printf("\n===== PROGRESS SUMMARY =====\n");
    printf("Total Topics    : %d\n", total);
    printf("Completed       : %d\n", completed);
    printf("Pending         : %d\n", pending);
    printf("Progress        : %.1f%%\n", percentage);
    printf("=============================\n");
}

void show_progress_queue(){
    if(front==NULL){
        printf("Data not available for today session!\n");
        return;
    }
    QueueNode* temp=front;
    int total=0;
    while(temp!=NULL){
        temp=temp->next;
        total++;
    }
    printf("Your total task is in queue: %d\n",total);

}
