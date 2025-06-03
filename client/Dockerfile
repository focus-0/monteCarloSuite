FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install

ARG REACT_APP_API_URL=https://montecarlosuite.onrender.com
ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]