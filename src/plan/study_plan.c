#include "topic.h"

void save_master_and_plan(){
    currMode = save_master;
    save_data();

    currMode = save_plan;
    save_data();

    currMode = save_master;
}

void creation_plan(){
    if(plan.exists==0){
        print_header("CREATE STUDY PLAN");
        add_topic_plan();
        cal_start_totals();
        if(plan.start_totals==0){
            printf("\nNo topics selected, plan not created.\n");
            return;
        }

        printf("\nPlan name: ");
        read_text(plan.plan_name, sizeof(plan.plan_name));
        while(1){
            printf("Start date (YYYYMMDD): ");
            plan.start_date = read_date();

            printf("End date   (YYYYMMDD): ");
            plan.end_date = read_date();

            if(start_end()==0){
                cal_start_totals();
                int rem=plan_validity();
                plan.base_pace=(plan.start_totals+rem-1)/rem;
                plan.exists=1;
                break;
            }
            printf("Enter both dates again.\n");
        }
        save_master_and_plan();

        printf("\nPlan \"%s\" created!\n", plan.plan_name);
        display_plan_details();
    } else{
        printf("A plan already exists (\"%s\"). Delete it first (option 14).\n", plan.plan_name);
    }
}

int plan_validity(){
    int today=today_ymd();

    if(plan.end_date<today){
        return -1;
    }
    else if(today<plan.start_date){
        return day_number(plan.end_date)-day_number(plan.start_date)+1;
    }
    else{
        return day_number(plan.end_date)-day_number(today)+1;
    }
}

int start_end(){
    if(plan.end_date<=plan.start_date){
        printf("  End date must be after the start date.\n");
        return 1;
    }
    return 0;
}


void check_plan(){
    if(plan.exists==0){
        printf("You have no plan yet. Create one with option 11.\n");
        return;
    }
    display_plan_details();
    status_plan();
    if(plan.exists==0){
        return;
    }
    show_progress_plan();
    print_header("PLAN TOPICS");
    display_plan_topic();
}

void display_plan_details(){
    if(plan.exists==1){
        print_header("STUDY PLAN");
        printf("  Plan name    : %s\n", plan.plan_name);
        printf("  Start date   : %s\n", display_date(plan.start_date));
        printf("  End date     : %s\n", display_date(plan.end_date));
        printf("  Total topics : %d\n", plan.start_totals);
        printf("  Base pace    : %d topic(s)/day\n", plan.base_pace);
    }else{
        printf("You have no active plan.\n");
    }
}

void display_plan_topic(){
    if(plan.exists==1){
        Topic* temp=head;
        int count=0;
        while(temp!=NULL){
            if(temp->in_plan==1){
                if(count==0){
                    print_table_header();
                }
                count+=1;
                print_topic_row(count, temp);
            }
            temp=temp->next;
        }
        if(count==0){
            printf("  Your plan has no topics.\n");
        }
    } else{
        printf("You have no active plan.\n");
    }
}

void status_plan(){
    if(plan.exists==0){
        return;
    }
    int rem=plan_validity();
    int today=today_ymd();
    int n1=0,n2=0;
    filter_plan_via_status(&n1,&n2);

    if(rem==-1){
        printf("\n  Your plan \"%s\" has ended.\n", plan.plan_name);
        if((n2-n1)==0){
            printf("  Congratulations! You completed every topic in the plan.\n");
        } else{
            printf("  %d topic(s) were left unfinished.\n", (n2-n1));
            printf("  Do you want to extend the plan? (Y/N): ");
            if(read_yn()=='Y'){
                while(1){
                    printf("  New end date (YYYYMMDD): ");
                    int new_end_date = read_date();
                    if(plan.end_date<new_end_date){
                        plan.end_date=new_end_date;
                        currMode=save_plan;
                        save_data();
                        currMode = save_master;
                        printf("  Plan extended till %s.\n", display_date(plan.end_date));
                        return;
                    }
                    printf("  New end date must be after the old end date.\n");
                }
            } else{
                delete_plan();
            }
        }
    }else{
        if(today<plan.start_date){
            printf("\n  Your plan has not started yet.\n");
            printf("  It starts on %s and runs for %d day(s).\n", display_date(plan.start_date), rem);
        }else{
            printf("\n  Days left: %d\n", rem);
            if(rem!=1){
                printf("  Today's target: %d topic(s)\n", today_target());
            }else{
                printf("  Today is the last day! Finish the remaining %d topic(s).\n", (n2-n1));
            }
        }
    }
}

void update_plan(){
    if(plan.exists==0){
        printf("You have no plan yet. Create one with option 11.\n");
        return;
    }
    while(1){
        print_header("UPDATE PLAN");
        printf("  1. Add topics to plan\n");
        printf("  2. Remove topics from plan\n");
        printf("  3. Show plan topics\n");
        printf("  4. Fill today's queue from plan\n");
        printf("  0. Done (save and go back)\n");
        printf("Enter your choice: ");
        int ask = read_choice(0, 4);
        switch (ask){
            case 1:
                add_topic_plan();
                break;
            case 2:
                remove_topic_plan();
                break;
            case 3:
                display_plan_topic();
                break;
            case 4:
                fill_queue_from_plan();
                break;
            case 0:
                cal_start_totals();
                save_master_and_plan();
                printf("Plan saved. It now has %d topic(s).\n", plan.start_totals);
                return;
        }
    }
}

void delete_plan(){
    if(plan.exists==0){
        printf("You have no active plan.\n");
        return;
    }
    display_plan_details();
    printf("\nDo you want to delete this plan? (Y/N): ");
    if(read_yn()=='N'){
        printf("Plan not deleted.\n");
        return;
    }
    Topic* temp=head;
    while(temp!=NULL){
        temp->in_plan = 0;
        temp=temp->next;
    }
    plan.plan_name[0] = '\0';
    plan.base_pace=0;
    plan.start_date=0;
    plan.end_date=0;
    plan.start_totals=0;
    plan.exists=0;

    save_master_and_plan();
    printf("Plan deleted.\n");
}


void fill_queue_from_plan(){
    if(plan.exists==0){
        printf("You have no plan yet. Create one with option 11.\n");
        return;
    }
    Topic* temp=head;
    int target=today_target();
    if(target==0){
        printf("No plan topics for today (plan not started, ended, or all done).\n");
        return;
    }
    int already=0;
    QueueNode* temp1=front;
    while(temp1!=NULL){
        if(temp1->topic->in_plan==1 && temp1->topic->is_done==0){
            already+=1;
        }
        temp1=temp1->next;
    }
    target=target-already;
    if(target<=0){
        printf("Today's plan topics are already in the queue.\n");
        return;
    }
    int count=0;
    while(temp!=NULL && count<target){
        if((temp->in_plan==1) && (temp->is_done==0)){
            if(enqueue(temp)==1){
                count+=1;
                printf("  Added: %s - %s\n", temp->subject, temp->chapter);
            }
        }
        temp=temp->next;
    }
    printf("%d topic(s) added from the plan to today's queue.\n", count);
    currMode=save_queue;
    save_data();
    currMode=save_master;
}

int today_target(){
    int today=today_ymd();
    int n1=0,n2=0;
    int rem=plan_validity();
    if(rem==-1 || today<plan.start_date){
        return 0;
    }
    filter_plan_via_status(&n1,&n2);
    return ((n2-n1) + rem - 1) / rem;
}
