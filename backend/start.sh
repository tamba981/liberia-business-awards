#!/bin/bash
echo "Starting server..."
echo "PORT: $PORT"
echo "NODE_ENV: $NODE_ENV"
echo "MONGODB_URI set: ${MONGODB_URI:+Yes}"

# Try to run server with error logging
node server.js 2>&1
