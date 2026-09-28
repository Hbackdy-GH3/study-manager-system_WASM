#include "topic.h"

void save_data(void){
    FILE* fptr=NULL;

    if(currMode==save_master){
        fptr=fopen(DATA_FILE, "w");
        if(fptr==NULL){
            printf("Could not open %s for saving!\n", DATA_FILE);
            return;
        }

        Topic* temp=head;

        while(temp!=NULL){
            fprintf(
                fptr,
                "%s,%s,%d,%d\n",
                temp->subject,
                temp->chapter,
                temp->priority,
                temp->is_done
            );
            temp=temp->next;
        }
    }
    else{
        fptr=fopen(QUEUE_DATA_FILE, "w");
        if(fptr==NULL){
            printf("Could not open %s for saving!\n", QUEUE_DATA_FILE);
            return;
        }

        QueueNode* temp=front;

        while(temp!=NULL){
            /*
                Subject + chapter are the queue's stable identity.
                Priority/status are written too for readability,
                but queue loading resolves the current Topic* from
                the master list using subject + chapter.
            */
            fprintf(
                fptr,
                "%s,%s,%d,%d\n",
                temp->topic->subject,
                temp->topic->chapter,
                temp->topic->priority,
                temp->topic->is_done
            );
            temp=temp->next;
        }
    }

    fclose(fptr);
    printf("Data saved!\n");
}

void load_data(void){
    FILE* fptr=NULL;

    if(currMode==save_master){
        fptr=fopen(DATA_FILE, "r");

        if(fptr==NULL){
            printf("Master data not found. Starting with an empty list.\n");
            return;
        }

        char subject[TEXT_SIZE];
        char chapter[TEXT_SIZE];
        int priority;
        int is_done;

        /*
            insert_prior() normally saves after inserting.
            During loading, that would reopen the same file in "w"
            mode and destroy the file being read.

            askYN is therefore temporarily disabled.
        */
        enum when2save oldAskYN=askYN;
        askYN=saveN;

        while(
            fscanf(
                fptr,
                " %49[^,],%49[^,],%d,%d",
                subject,
                chapter,
                &priority,
                &is_done
            )==4
        ){
            if(
                priority < -1 ||
                priority > 1 ||
                (is_done != 0 && is_done != 1)
            ){
                continue;
            }

            insert_prior(subject,chapter,priority,is_done);
        }

        askYN=oldAskYN;
        fclose(fptr);

        printf("Master data loaded successfully!\n");
    }
    else{
        fptr=fopen(QUEUE_DATA_FILE, "r");

        if(fptr==NULL){
            printf("Queue data not found. Starting with an empty queue.\n");
            return;
        }

        char subject[TEXT_SIZE];
        char chapter[TEXT_SIZE];
        int saved_priority;
        int saved_status;

        /*
            Queue loading intentionally uses subject + chapter as the
            stable identity, but consumes all four saved fields so the
            next queue record starts on the next line. The stored
            priority/status are ignored because the current master Topic
            is authoritative.
        */
        while(
            fscanf(
                fptr,
                " %49[^,],%49[^,],%d,%d",
                subject,
                chapter,
                &saved_priority,
                &saved_status
            )==4
        ){
            (void)saved_priority;
            (void)saved_status;
            data_enqueue(subject,chapter);
        }

        fclose(fptr);

        printf("Queue data loaded successfully!\n");
    }
}

void data_enqueue(char subject[], char chapter[]){
    Topic* temp1=head;

    while(temp1!=NULL){
        if(
            CI(subject,temp1->subject) &&
            CI(chapter,temp1->chapter) &&
            !queue_contains_topic(temp1)
        ){
            enqueue(temp1);
            return;     /* one queue line = one topic */
        }

        temp1=temp1->next;
    }
}
