FROM ubuntu:latest

RUN apt-get update && apt-get install -y nodejs npm
RUN apt-get install -y python3 python3-setuptools make g++

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]