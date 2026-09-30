FROM node:20-bullseye

RUN apt-get update && apt-get install -y ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN mkdir -p jobs public

EXPOSE 3000

CMD ["node", "server.js"]
