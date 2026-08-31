FROM node:24
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
CMD ["node", "app.js"]
