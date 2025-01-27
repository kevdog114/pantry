#!/bin/sh

node_modules/.bin/sequelize-cli db:migrate

npm run build

npm run start