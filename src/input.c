#include "topic.h"

/*
    Safe console input helpers.

    scanf("%d") gets stuck in an endless loop when the user types a
    letter, because the bad input stays in the buffer. These helpers
    read one whole line with fgets() and then check it.
*/

int read_int(void){
    char line[64];
    while(1){
        if(fgets(line, sizeof(line), stdin)==NULL){
            /* stdin closed (Ctrl+Z / Ctrl+D): exit cleanly */
            printf("\nInput closed. Exiting.\n");
            exit(0);
        }
        char* end;
        long value=strtol(line, &end, 10);
        while(*end==' ' || *end=='\t' || *end=='\r' || *end=='\n'){
            end++;
        }
        if(end!=line && *end=='\0'){
            return (int)value;
        }
        printf("Please enter a number: ");
    }
}

/*
    Reads a non-empty line (max size-1 characters).
    Commas are not allowed because data.txt uses commas
    to separate the fields.
*/
void read_text(char* buffer, int size){
    char line[256];
    while(1){
        if(fgets(line, sizeof(line), stdin)==NULL){
            printf("\nInput closed. Exiting.\n");
            exit(0);
        }
        line[strcspn(line, "\r\n")]='\0';

        /* trim spaces at start and end */
        char* start=line;
        while(*start==' ' || *start=='\t'){
            start++;
        }
        int len=(int)strlen(start);
        while(len>0 && (start[len-1]==' ' || start[len-1]=='\t')){
            start[--len]='\0';
        }

        if(len==0){
            printf("It cannot be empty. Enter again: ");
        }
        else if(len>=size){
            printf("Too long (max %d characters). Enter again: ", size-1);
        }
        else if(strchr(start, ',')!=NULL){
            printf("Comma (,) is not allowed. Enter again: ");
        }
        else{
            strcpy(buffer, start);
            return;
        }
    }
}
