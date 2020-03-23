# Attendance parser for an old version of fingerprint scanning clock in systems

To get it running, make sure to have the following python packages:
- bs4
- docx
- html5lib

```sh
python3.7 -m pip install python-docx
python3.7 -m pip install bs4
python3.7 -m pip install html5lib
```

## Example usage:

### Word file

Place docx file inside same directory as script, then run

```sh
python3.7 attendance_docx_parser.py
```

### HTML file

Place htm file inside sasme directory as script, then run

```sh
python3.7 attendance_htm_parser.py
```

## Building the project

Building the project to the respective operating systems

### Exe files:
Be sure to have auto-py-to-exe installed and also have the modules installed on the windows machine

```sh
auto-py-to-exe
```

Executable files will be stored in the `output` directory

### Linux binary:
Be sure to first have `pyinstaller` installed before trying to build the project
Check out the pyinstaller docs for more info [Pyinstaller docs](https://pyinstaller.readthedocs.io/en/stable/)
```sh
sudo pyinstaller --onefile ./attendance_<file_type>_parser.py
```

Binary files will be stored in the `dist` directory