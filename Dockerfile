FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your backend code
COPY . .

# Build the frontend
WORKDIR /app/my-project
COPY my-project/package*.json ./
RUN npm install
RUN npm run build

# Go back to app root
WORKDIR /app

EXPOSE 3000

CMD ["node", "server.js"]
