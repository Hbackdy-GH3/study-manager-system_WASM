#include "topic.h"

void show_progress(){
    if(head==NULL){
        printf("No topics yet. Add some topics first.\n");
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

    print_header("PROGRESS SUMMARY");
    printf("  Total topics : %d\n", total);
    printf("  Completed    : %d\n", completed);
    printf("  Pending      : %d\n", pending);
    printf("  Progress     : %.1f%%\n", percentage);
}

void show_progress_queue(){
    int total=queue_count();
    print_header("TODAY'S QUEUE");
    if(total==0){
        printf("  Today's queue is empty.\n");
        return;
    }
    printf("  Topics left in today's queue: %d\n", total);
}

void show_progress_plan(){
    int n1=0,n2=0;
    int today=today_ymd();
    int rem=plan_validity();
    filter_plan_via_status(&n1,&n2);
    int total_days=day_number(plan.end_date)-day_number(plan.start_date)+1;
    int rem_days=day_number(plan.end_date)-day_number(today)+1;

    print_header("PLAN PROGRESS");
    printf("  Total topics : %d\n", n2);
    printf("  Completed    : %d\n", n1);
    printf("  Pending      : %d\n", n2-n1);
    if(n2>0){
        printf("  Progress     : %d%%\n", (n1*100)/n2);
    }
    printf("  Total days   : %d\n", total_days);

    if(rem==-1){
        printf("  Status       : Plan ended\n");
        return;
    }
    if(today<plan.start_date){
        printf("  Status       : Not started yet\n");
        return;
    }

    printf("  Days left    : %d\n", rem_days);

    int diff=curr_base_pace();
    if(diff>0){
        printf("  Status       : Behind - %d more topic(s)/day than planned\n", diff);
    } else if(diff<0){
        printf("  Status       : Ahead by %d topic(s)/day\n", -diff);
    } else{
        printf("  Status       : On track\n");
    }
}


void daily_reports(){
    int today=today_ymd();
    Topic* temp=head;
    int count1=0,count2=0;
    while(temp!=NULL){
        if(today==temp->completed_on){
            if(temp->in_plan==1){
                count2+=1;
            }
            count1+=1;
        }
        temp=temp->next;
    }

    char title[40];
    snprintf(title, sizeof(title), "DAILY REPORT %s", display_date(today));
    print_header(title);

    printf("  Completed today: %d\n", count1);
    if(count1==0){
        printf("  No topics completed yet today.\n");
    }
    temp=head;
    while(temp!=NULL){
        if(today==temp->completed_on){
            if(temp->in_plan==1){
                printf("    - %s : %s  [plan]\n", temp->subject, temp->chapter);
            } else{
                printf("    - %s : %s\n", temp->subject, temp->chapter);
            }
        }
        temp=temp->next;
    }

    if(plan.exists==1){
        int n1=0,n2=0;
        filter_plan_via_status(&n1,&n2);
        int rem=plan_validity();
        printf("\n  --- Plan: %s ---\n", plan.plan_name);
        if(rem==-1){
            printf("  Plan has ended.\n");
            printf("  From plan today : %d\n", count2);
            if(0<n2){
                printf("  Plan progress   : %d%%\n", (n1*100)/n2);
            }
        }else if (today < plan.start_date){
            printf("  Plan starts on  : %s\n", display_date(plan.start_date));
        }
        else{
            printf("  From plan today : %d\n", count2);
            int target=((n2-n1)+count2+rem-1)/rem;
            printf("  Today's target  : %d\n", target);
            if(target==count2){
                printf("  Result          : Target done!\n");
            } else if(target<count2){
                printf("  Result          : Target done, %d topic(s) ahead!\n", count2-target);
            } else{
                printf("  Result          : %d more topic(s) to go today\n", target-count2);
            }
            if(0<n2){
                printf("  Plan progress   : %d%%\n", (n1*100)/n2);
            }
        }
    }

    printf("\n  Topics left in today's queue: %d\n", queue_count());
}
