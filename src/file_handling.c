# include "topic.h"

void save_data(){
    Topic* temp=head;
    FILE* fptr;
    fptr=fopen("data.txt", "w");
    while(temp!=NULL){
        fprintf(fptr, "%s,%s,%d,%d\n", temp->subject, temp->chapter, temp->priority, temp->is_done);
        temp=temp->next;
    }

    fclose(fptr);
    printf("Data saved!");
}

void load_data(){
    
    FILE* fptr;
    fptr=fopen("data.txt", "r");
    if(fptr==NULL){
        printf("Data not found!");
        return;
    }
    char subject[50], chapter[50];
    int priority, is_done;
    while(fscanf(fptr, "%49[^,],%49[^,],%d,%d\n",subject,chapter, &priority, &is_done)==4){
        insert_prior(subject, chapter, priority, is_done);
    }
    fclose(fptr);
    printf("Data load succesfully!");
    
}
