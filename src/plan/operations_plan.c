#include "topic.h"


void add_topic_plan(){
    Topic* temp=head;
    int asked=0;
    printf("\nChoose topics for the plan (only pending topics are shown).\n");
    printf("Type 1 = add to plan, 0 = skip\n\n");
    while(temp!=NULL){
        if(temp->is_done==0){
            if(temp->in_plan==0){
                printf("  %-18s %-22s [%-6s]  Add? (1/0): ", temp->subject, temp->chapter, priority_text(temp->priority));
                temp->in_plan=read_choice(0, 1);
                asked++;
            }
        }
        temp=temp->next;
    }
    if(asked==0){
        printf("  No new pending topics to add.\n");
    }
}


void remove_topic_plan(){
    if(plan.exists==1){
        Topic* temp=head;
        int asked=0;
        printf("\nTopics in your plan.\n");
        printf("Type 1 = keep, 0 = remove from plan\n\n");
        while(temp!=NULL){
            if(temp->in_plan==1){
                if(temp->is_done==1){
                    printf("  %-18s %-22s [Done]  Keep? (1/0): ", temp->subject, temp->chapter);
                } else{
                    printf("  %-18s %-22s [Pending]  Keep? (1/0): ", temp->subject, temp->chapter);
                }
                if(read_choice(0, 1)==0){
                    temp->in_plan=0;
                }
                asked++;
            }
            temp=temp->next;
        }
        if(asked==0){
            printf("  Your plan has no topics.\n");
        }
    }
}


void cal_start_totals(){
    int n1=0,n2=0;
    filter_plan_via_status(&n1,&n2);
    plan.start_totals=n2;
}

int curr_base_pace(){
    int rem=plan_validity();
    if(rem==-1){
        return 0;
    }
    int n1=0,n2=0;
    filter_plan_via_status(&n1,&n2);
    return (((n2-n1)+rem-1)/rem)-plan.base_pace;
}
