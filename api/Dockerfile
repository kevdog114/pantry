FROM node:22-alpine

RUN apk add --no-cache python3 py3-setuptools make g++ git

RUN mkdir /app
RUN mkdir /app/data
RUN mkdir /app/data/upload
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci

COPY api/. .

RUN git log --merges -n 10 --pretty=format:'"%H","%s","%an","%ar"' > /app/merges.txt
RUN sed -i '1s/^/\[/' /app/merges.txt
RUN sed -i 's/$/,/' /app/merges.txt
RUN sed -i '$s/,//' /app/merges.txt
RUN sed -i '$a\]' /app/merges.txt
RUN sed -i ':a;N;$!ba;s/,\n/],[/g' /app/merges.txt
RUN sed -i 's/"\[/"/g' /app/merges.txt
RUN sed -i 's/\]"/\]/g' /app/merges.txt
RUN echo "{\"latest_commit\": \"$(git rev-parse HEAD)\", \"merges\": $(cat /app/merges.txt)}" > /app/git-info.json

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]