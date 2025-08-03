#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Run the scan
npm run scan

# Run the transform on the latest scan
npm run transform
