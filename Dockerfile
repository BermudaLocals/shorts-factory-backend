FROM node:20-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
RUN pip3 install --break-system-packages edge-tts
COPY . .
RUN mkdir -p jobs public
EXPOSE 3000
CMD ["node", "server.js"]