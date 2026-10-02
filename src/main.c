#include "topic.h"

void print_menu(){
    printf("\n========================================\n");
    printf("        STUDY MANAGEMENT SYSTEM\n");
    printf("========================================\n");

    printf(" Master Topic List\n");
    printf("   1. Add Topic\n");
    printf("   2. Search / Update / Delete a Topic\n");
    printf("   3. Delete Topic (front/back/anywhere)\n");
    printf("   4. Display All Topics\n");
    printf("   5. Filter Topics\n");

    printf(" Today's Study Queue\n");
    printf("   6. Add Topics to Today's Queue\n");
    printf("   7. Show Today's Queue\n");
    printf("   8. Study Next Topic\n");

    printf(" Progress\n");
    printf("   9. Show Progress (Master List)\n");
    printf("  10. Show Progress (Today's Queue)\n");

    printf(" Study Plan\n");
    printf("  11. Create Plan\n");
    printf("  12. Check Plan\n");
    printf("  13. Update Plan\n");
    printf("  14. Delete Plan\n");
    printf("  15. Fill Today's Queue from Plan\n");
    printf("  16. Today's Report\n");

    printf(" Program\n");
    printf("  17. Save & Exit\n");

    printf("========================================\n");
    printf("Enter your choice (1-17): ");
}

int main(){

    currMode = save_master;
    load_data();

    currMode = save_queue;
    load_data();

    currMode = save_plan;
    load_data();

    currMode = save_master;

    if(plan.exists == 0){
        int changed = 0;
        Topic* temp = head;
        while(temp != NULL){
            if(temp->in_plan == 1){
                temp->in_plan = 0;
                changed = 1;
            }
            temp = temp->next;
        }
        if(changed == 1){
            currMode = save_master;
            save_data();
        }
    }

    currMode = save_master;
    save_data();

    print_header("WELCOME BACK");
    printf("  Today        : %s\n", display_date(today_ymd()));
    printf("  Topics       : %d\n", count_topics());
    printf("  In queue     : %d\n", queue_count());
    if(plan.exists == 1){
        printf("  Study plan   : %s\n", plan.plan_name);
        status_plan();
    } else{
        printf("  Study plan   : none (create one with option 11)\n");
    }

    if(head != NULL){
        print_header("YOUR TOPICS");
        print_all();
    }

    char subject[50], chapter[50];
    int priority;

    while(1){

        print_menu();
        int choice = read_int();

        switch(choice){

            /* ================= ADD TOPIC ================= */

            case 1: {
                print_header("ADD TOPIC");
                printf("Where do you want to add the topic?\n");
                printf("  1. At the front\n");
                printf("  2. At the back\n");
                printf("  3. By priority (recommended)\n");
                printf("Enter your choice: ");
                int add_choice = read_choice(1, 3);

                printf("\nSubject: ");
                read_text(subject, sizeof(subject));

                printf("Chapter: ");
                read_text(chapter, sizeof(chapter));

                printf("Priority (1 = High, 0 = Medium, -1 = Low): ");
                priority = read_priority();

                switch(add_choice){

                    case 1: {
                        Topic* node = insert_init(0,subject, chapter, priority, 0);
                        if(node != NULL){
                            insertfront(node);
                            currMode = save_master;
                            save_data();
                        }
                        break;
                    }

                    case 2: {
                        Topic* node = insert_init(0,subject, chapter, priority, 0);
                        if(node != NULL){
                            insertback(node);
                            currMode = save_master;
                            save_data();
                        }
                        break;
                    }

                    case 3:
                        insert_prior(0,subject, chapter, priority, 0);
                        break;
                }

                printf("Topic added.\n");
                break;
            }


            /* ================= SEARCH / UPDATE / DELETE ================= */

            case 2:
                print_header("SEARCH TOPIC");
                if(head == NULL){
                    printf("The list is empty. Nothing to search.\n");
                }
                else{
                    search_topic();
                }
                break;


            /* ================= DELETE ================= */

            case 3:
                print_header("DELETE TOPIC");
                if(head == NULL){
                    printf("The list is empty. Nothing to delete.\n");
                }
                else{
                    pop();
                }
                break;


            /* ================= DISPLAY ================= */

            case 4:
                print_header("ALL TOPICS");
                if(head == NULL){
                    printf("The list is empty. Add topics with option 1.\n");
                }
                else{
                    print_all();
                    printf("\nTotal: %d topic(s)\n", count_topics());
                }
                break;


            /* ================= FILTER ================= */

            case 5:
                print_header("FILTER TOPICS");
                if(head == NULL){
                    printf("The list is empty. Nothing to filter.\n");
                }
                else{
                    filter_via();
                }
                break;


            /* ================= ENQUEUE ================= */

            case 6:
                print_header("ADD TO TODAY'S QUEUE");
                if(head == NULL){
                    printf("The list is empty. Add topics with option 1.\n");
                }
                else{
                    enqueue_ask();
                }
                break;


            /* ================= DISPLAY QUEUE ================= */

            case 7:
                display_queue();
                break;


            /* ================= DEQUEUE ================= */

            case 8:
                print_header("STUDY NEXT TOPIC");
                dequeue();
                break;


            /* ================= MASTER PROGRESS ================= */

            case 9:
                show_progress();
                break;


            /* ================= QUEUE PROGRESS ================= */

            case 10:
                show_progress_queue();
                break;


            /* ================= CREATE PLAN ================= */

            case 11:
                if(head == NULL){
                    printf("\nThe list is empty. Add topics first (option 1).\n");
                }
                else{
                    creation_plan();
                }
                break;


            /* ================= CHECK PLAN ================= */

            case 12:
                check_plan();
                break;


            /* ================= UPDATE PLAN ================= */

            case 13:
                update_plan();
                break;


            /* ================= DELETE PLAN ================= */

            case 14:
                print_header("DELETE PLAN");
                delete_plan();
                break;


            /* ================= FILL QUEUE FROM PLAN ================= */

            case 15:
                print_header("FILL QUEUE FROM PLAN");
                fill_queue_from_plan();
                break;


            /* ================= DAILY REPORT ================= */

            case 16:
                daily_reports();
                break;


            /* ================= SAVE & EXIT ================= */

            case 17:
                currMode = save_master;
                save_data();

                currMode = save_queue;
                save_data();

                currMode = save_plan;
                save_data();

                currMode = save_master;

                printf("\nAll data saved. Goodbye!\n");
                return 0;


            /* ================= INVALID ================= */

            default:
                printf("\nInvalid choice. Enter a number from 1 to 17.\n");
                break;
        }

        pause_screen();
    }

    return 0;
}
