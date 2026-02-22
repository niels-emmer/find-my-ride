FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_APP_VERSION=dev
ARG VITE_RELEASE_SHA=local
ARG VITE_REPO_URL=https://github.com/niels-emmer/find-my-ride
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_RELEASE_SHA=${VITE_RELEASE_SHA}
ENV VITE_REPO_URL=${VITE_REPO_URL}
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
