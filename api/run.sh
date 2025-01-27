#!/bin/sh

npx sequelize-cli db:migrate

npm run build

npm run start