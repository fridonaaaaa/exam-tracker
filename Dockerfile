FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Expose the port your server.js listens on
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
