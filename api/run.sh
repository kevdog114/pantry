#!/bin/sh

npx prisma migrate deploy

npm run build

npm run start