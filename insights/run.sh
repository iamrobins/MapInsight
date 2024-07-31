#!/bin/bash

# This script runs the application in the specified mode

if [ "$1" = "dev" ]; then
    export ENVIRONMENT=development
    python main.py
elif [ "$1" = "start" ]; then
    export ENVIRONMENT=production
    python main.py
else
    echo "Usage: $0 {dev|start}"
    exit 1
fi
