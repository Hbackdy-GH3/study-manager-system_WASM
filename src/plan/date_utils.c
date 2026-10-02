#include "topic.h"

int today_ymd()
{
    struct tm *t = localtime(&(time_t){time(NULL)});
    return ((t->tm_year + 1900) * 10000 + (t->tm_mon + 1) * 100 + (t->tm_mday));
}

int valid_date(int date)
{   
    if(date < 10000000 || date > 99999999){
        printf("  Date must have 8 digits (YYYYMMDD), like 20261005.\n");
        return 1;
    }
    int today = today_ymd();
    int year  = date / 10000;
    int month = (date / 100) % 100;
    int day   = date % 100;

    if (month < 1 || month > 12)
    {
        printf("  Month must be between 01 and 12.\n");
        return 1;
    }

    int max_day = month_days(month, year);

    if (day < 1 || day > max_day)
    {
        printf("  This month does not have that day.\n");
        return 1;
    }

    if (date < today)
    {
        printf("  This date is already over. Enter today or a future date.\n");
        return 1;
    }

    return 0;
}




int month_days(int month, int year){
    int max_day = 31;
    if (month == 4 || month == 6 || month == 9 || month == 11)
    {
        max_day = 30;
    }
    else if (month == 2)
    {
        if (year % 400 == 0 || (year % 100 != 0 && year % 4 == 0))
        {
            max_day = 29;
        }
        else
        {
            max_day = 28;
        }
    }
    return max_day;
}

int leap_year(int year){
    if (year % 400 == 0 || (year % 100 != 0 && year % 4 == 0))
        {
            return 1;
        }
    return 0;
}

int day_number(int date)
{
    int year  = date / 10000;
    int month = (date / 100) % 100;
    int day   = date % 100;
    int total = 0;

    for (int y = 2000; y < year; y++)
    {
        if (leap_year(y) == 1)
            total += 366;
        else
            total += 365;
    }

    for (int m = 1; m < month; m++)
    {
        total += month_days(m, year);
    }

    total += day;

    return total;
}

char* display_date(int date){
    int year  = date / 10000;
    int month = (date / 100) % 100;
    int day   = date % 100;

    static char date_format[16];

    snprintf(date_format, sizeof(date_format), "%02d/%02d/%04d", day, month, year);

    return date_format;
}