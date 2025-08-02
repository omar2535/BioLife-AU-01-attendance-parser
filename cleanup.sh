#!/bin/bash

mkdir -p previous_files
mkdir -p previous_output
mkdir -p previous_debug_files

mv *.htm previous_files/
mv *_calculations.txt previous_output/
mv *_debug.json previous_debug_files/
