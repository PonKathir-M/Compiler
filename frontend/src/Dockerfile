FROM node:18

RUN apt-get update && apt-get install -y openjdk-17-jdk-headless

WORKDIR /app

COPY backend ./backend

WORKDIR /app/backend
RUN npm install

EXPOSE 10000

CMD ["node", "index.js"]