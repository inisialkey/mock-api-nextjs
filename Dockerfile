FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Seed database
RUN npx tsx scripts/seed.ts

# Build
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
