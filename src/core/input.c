#include "topic.h"

void clear_line(void){
    int c;
    while((c=getchar())!='\n' && c!=EOF){
    }
}

int read_raw_line(char* buf, int size){
    if(fgets(buf, size, stdin)==NULL){
        printf("\nInput closed. Exiting.\n");
        exit(0);
    }
    int len=strlen(buf);
    if(len>0 && buf[len-1]=='\n'){
        buf[len-1]='\0';
    } else{
        clear_line();
    }
    return strlen(buf);
}

int read_int(void){
    char line[64];
    int value;
    char extra;
    while(1){
        read_raw_line(line, sizeof(line));
        if(sscanf(line, " %d %c", &value, &extra)==1){
            return value;
        }
        printf("  Please enter a number: ");
    }
}

int read_choice(int low, int high){
    while(1){
        int value=read_int();
        if(value>=low && value<=high){
            return value;
        }
        printf("  Please enter a number from %d to %d: ", low, high);
    }
}

int read_priority(void){
    while(1){
        int value=read_int();
        if(value==1 || value==0 || value==-1){
            return value;
        }
        printf("  Please enter 1 (High), 0 (Medium) or -1 (Low): ");
    }
}

char read_yn(void){
    char line[64];
    while(1){
        read_raw_line(line, sizeof(line));
        char c=' ';
        sscanf(line, " %c", &c);
        if(c=='y' || c=='Y'){
            return 'Y';
        }
        if(c=='n' || c=='N'){
            return 'N';
        }
        printf("  Please enter Y or N: ");
    }
}

void read_text(char* buf, int size){
    while(1){
        read_raw_line(buf, size);
        if(strlen(buf)==0){
            printf("  This cannot be empty, type again: ");
            continue;
        }
        if(strchr(buf, ',')!=NULL){
            printf("  Comma (,) is not allowed, type again: ");
            continue;
        }
        return;
    }
}

int read_date(void){
    while(1){
        int date=read_int();
        if(valid_date(date)==0){
            return date;
        }
        printf("  Enter the date again (YYYYMMDD): ");
    }
}

void pause_screen(void){
    printf("\nPress Enter to continue...");
    clear_line();
}
