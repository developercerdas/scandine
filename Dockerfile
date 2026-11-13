FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Hugging Face Spaces & Cloud standard web port
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
