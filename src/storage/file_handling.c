# include "topic.h"

void save_data(){
    FILE* fptr;
    if(currMode==save_master){
        fptr=fopen("data/data.txt", "w");
        if(fptr==NULL){
            printf("Could not save data/data.txt (is the data folder missing?)\n");
            return;
        }
        Topic* temp=head;
        while(temp!=NULL){
            fprintf(fptr, "%d,%s,%s,%d,%d,%d,%d\n",temp->topic_id, temp->subject, temp->chapter, temp->priority, temp->is_done,temp->in_plan,temp->completed_on);
            temp=temp->next;
        }
    } else if(currMode==save_queue){
        fptr=fopen("data/queue_data.txt", "w");
        if(fptr==NULL){
            printf("Could not save data/queue_data.txt\n");
            return;
        }
        QueueNode* temp=front;
        while(temp!=NULL){
            fprintf(fptr, "%d\n", temp->topic->topic_id);
            temp=temp->next;
        }

    }
    else{
        fptr=fopen("data/plan_data.txt", "w");
        if(fptr==NULL){
            printf("Could not save data/plan_data.txt\n");
            return;
        }
        if(plan.exists==1){
            fprintf(fptr, "%d,%d,%d,%d,%s\n", plan.start_date, plan.end_date, plan.start_totals, plan.base_pace,plan.plan_name);
        }
    }

    fclose(fptr);
}

void load_data(){
    FILE* fptr;
    char line[256];
        if(currMode==save_master){
        fptr=fopen("data/data.txt", "r");
        if(fptr==NULL){
            return;
        }
        char subject[50], chapter[50];
        int topic_id,priority, is_done, in_plan, completed_on;

        enum when2save oldAskYN = askYN;
        askYN = saveN;

        while(fgets(line, sizeof(line), fptr)!=NULL){
            int got=sscanf(line, "%d,%49[^,],%49[^,],%d,%d,%d,%d",&topic_id,subject,chapter, &priority, &is_done, &in_plan, &completed_on);
            if(got<7){
                continue;
            }
            Topic* node=insert_prior(topic_id,subject, chapter, priority, is_done);
            if(node!=NULL){
                node->in_plan=in_plan;
                node->completed_on=completed_on;
            }
        }

        int max_id=0;
        Topic* temp=head;
        while(temp!=NULL){
            if(temp->topic_id>max_id){
                max_id=temp->topic_id;
            }
            temp=temp->next;
        }
        next_id=max_id+1;

        askYN = oldAskYN;
    }else  if(currMode==save_queue){
        fptr=fopen("data/queue_data.txt", "r");
        if(fptr==NULL){
            return;
        }
        
        int topic_id;

        while(fgets(line, sizeof(line), fptr)!=NULL){
            if(sscanf(line, "%d", &topic_id)==1){
                Topic* t=find_by_id(topic_id);
                if(t!=NULL){
                    enqueue(t);
                }
            }
        }
    }
    else{
        fptr=fopen("data/plan_data.txt", "r");
        if(fptr==NULL){
            return;
        }
        char plan_name[50];
        int start_date,end_date,start_totals,base_pace;

        if(fscanf(fptr, "%d,%d,%d,%d,%49[^\n]",&start_date,&end_date, &start_totals,&base_pace,plan_name)==5){
            plan.exists=1;
            plan.start_date=start_date;
            plan.end_date=end_date;
            plan.start_totals=start_totals;
            plan.base_pace=base_pace;
            strcpy(plan.plan_name, plan_name);
        }
    }
    fclose(fptr);

}

// void data_enqueue(char subject[], char chapter[]){
//     Topic* temp1=head;
//     while(temp1!=NULL){
//         if (CI(subject,temp1->subject) && CI(chapter,temp1->chapter)){
//             enqueue(temp1);
//         }
//         temp1=temp1->next;
//     }
// }
