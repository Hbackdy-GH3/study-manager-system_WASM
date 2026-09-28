#include "topic.h"

Topic* head=NULL;
Topic* tail=NULL;

QueueNode* front=NULL;
QueueNode* back=NULL;

enum SaveMode currMode=save_master;
enum when2save askYN=saveY;

int CI(char *a, char *b){
    while(*a && *b){
        if(tolower((unsigned char)*a) != tolower((unsigned char)*b)){
            return 0;
        }
        a++;
        b++;
    }

    return (*a == '\0' && *b == '\0');
}
