import glob
import os
import re
import json
from datetime import datetime
from bs4 import BeautifulSoup

# SET THIS BEFORE USING PROGRAM!
starting_hours_for_overtime = 8


def main():
    print("Starting program")

    # collect files
    os.chdir('.')
    for attendance_sheet in glob.glob('*.htm*'):
        print(f"*** Starting to parse {attendance_sheet} ***")
        file_name = attendance_sheet

        # open file for reading and parse with bs4
        html = open(file_name, 'rb').read()
        html = BeautifulSoup(html, features="html5lib")

        # First 3 <p> tags parse:
        # <p> Title </p>
        # <p> Company name </p>
        # <p> Date </p>
        all_p_elements = html.findAll('p')
        title = all_p_elements[0].string.replace(u'\xa0', u' ')
        company_name = all_p_elements[1].string.replace(u'\xa0', u' ')
        date_range = all_p_elements[2].string.replace(u'\xa0', u' ')

        # Define output file name
        output_file_name = get_output_filename(date_range)

        # Actual parsing begin
        tables = html.findAll('table')
        employees = []

        # parse table
        for table in tables:
            employees.append(parse_employee_tables(table))

        # Actual calculations begin!
        for employee in employees:
            calculate_hours(employee, starting_hours_for_overtime)

        # Write to output files
        write_to_file(f"{output_file_name}_calculations", employees)
        write_debug_file(f"{output_file_name}_debug", employees)
    print("End program")


# returns employee object
# employee object: {
#   "name": "omar",
#   "attendance": {'11-01': ['10:05', '16:46'], '11-02': ['10:05', '19:08']}
# }
def parse_employee_tables(table):
    employee = {}
    dates_array = []
    times_array = []
    # Parse name
    name = table.findAll('p')[1].string.replace(u'\xa0', u' ').split()[1].split(':')[1]
    employee['name'] = name
    employee['attendance'] = {}
    employee['stats'] = {}

    time_tables = table.findAll('tr')[1:]
    if(len(time_tables) % 2 != 0):
        raise "time table is broken. Check dataset. Non-matching table rows"
        return False
    else:
        for i in range(int(len(time_tables)/2)):
            # dates as an array
            dates = [*map(lambda ele: ele.string,
                          time_tables[2*i].findAll('td')[1:])]
            dates_array += dates
            check_in_times = time_tables[2*i+1].findAll('td')[1:]
            for times in check_in_times:
                times_contents = times.contents
                # apply filters on \xa0 being represented for spaces, \n on all the last times, and all white spaces
                times_contents = [times for times in times_contents if (
                    isinstance(times, str) and times != '\xa0')]
                times_contents = [
                    *map(lambda time: time.replace('\n', '').strip(), times_contents)]
                times_array.append(times_contents)
        if(len(times_array) != len(dates_array)):
            raise "dates and times do not match! (is there an extra day or extra time?"
            return False
        for date_index in range(len(dates_array)):
            employee['attendance'][dates_array[date_index]
                                   ] = times_array[date_index]
        return employee

# employee and hours until counts of overtime, defaults at 8
# ASSUMES EMPLOYEES CLOCK IN AND OUT ON THE SAME DATE


def calculate_hours(employee, overtime_hours_min=8):
    attendance = employee['attendance']
    attendance = attendance.items()
    review = {}
    num_hours_worked_total = 0
    num_overtime_hours_worked = 0
    num_regular_hours_worked = 0
    for day in attendance:
        date = day[0]
        log = day[1]
        # error handling if didn't work or forgot to sign in/out
        if(len(log) == 0):
            continue
        if(len(log) == 1 and log[0] == ''):
            continue
        elif(len(log) == 1):
            print(f"{employee['name']} forgot to sign-in or out on {date}")
            review[date] = log
            continue

        # Get the first time and the last time of the log
        start_log = log[0]
        end_log = log[len(log) - 1]

        # Start calculating logs
        start_time = datetime.strptime(start_log, '%H:%M')
        end_time = datetime.strptime(end_log, '%H:%M')
        hours_worked = (end_time - start_time).total_seconds() / 3600
        overtime_hours_worked = 0
        if(hours_worked - overtime_hours_min > 0):
            overtime_hours_worked = hours_worked - overtime_hours_min
            regular_hours_worked = overtime_hours_min
        else:
            regular_hours_worked = hours_worked

        # Store for visibility purposes
        # breakpoint()
        employee['stats'][date] = {}
        employee['stats'][date]['hours_worked'] = hours_worked
        employee['stats'][date]['regular_hours_worked'] = regular_hours_worked
        employee['stats'][date]['overtime_hours_worked'] = overtime_hours_worked
        employee['stats'][date]['overtime_minutes_worked'] = overtime_hours_worked * 60

        # Calculate running total
        num_hours_worked_total += hours_worked
        num_overtime_hours_worked += overtime_hours_worked
        num_regular_hours_worked += regular_hours_worked
    employee["review"] = review
    employee["num_hours_worked_total"] = num_hours_worked_total
    employee["num_overtime_hours_worked"] = num_overtime_hours_worked
    employee["num_regular_hours_worked"] = num_regular_hours_worked


def write_to_file(file_name, employees):
    file = open(f"./{file_name}.txt", "w", encoding="utf-8")
    for employee in employees:
        file.write(f"Employee name: {employee['name']}\n")
        file.write(
            f"Total hours worked: {employee['num_hours_worked_total']}\n")
        file.write(
            f"Overtime hours worked: {employee['num_overtime_hours_worked']}\n")
        file.write(
            f"Regular hours worked: {employee['num_regular_hours_worked']}\n")
        if(len(employee["review"].items()) > 0):
          file.write(f"---------REQUIRES REVIEW!---------\n")
          for review in employee["review"].items():
              file.write(f"Date: {review[0]}, Time: {review[1]}\n")
          file.write(f"---------REQUIRES REVIEW!---------\n")
        file.write(f"\n\n")
    print(f"COMPLETE: {file_name}.txt")


def write_debug_file(output_file_name, employees):
    with open(f"{output_file_name}.json", 'w') as fout:
        json.dump(employees , fout, ensure_ascii=False)


# Assumes this script is always running after the month being parsed has passed
def get_output_filename(date_range):
    month_string = re.sub("[^0-9\-]", "", date_range)[0:2]
    if int(month_string) == 12:
        file_name = f"{str(datetime.now().year)-1}-{month_string}"
    else:
        file_name = f"{str(datetime.now().year)}-{month_string}"
    return file_name


# run main if this is called by itself
if __name__ == "__main__":
    main()
