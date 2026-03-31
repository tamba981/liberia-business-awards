FROM node:18-alpine

WORKDIR /app

# Clear npm cache
RUN npm cache clean --force

# Copy package files
COPY package*.json ./

# Install dependencies with verbose output
RUN npm install --verbose --no-package-lock

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
