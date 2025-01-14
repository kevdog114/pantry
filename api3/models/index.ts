'use strict';

import { Sequelize } from 'sequelize';
import { ProductModelFactory } from './product';
const process = require('process');
const env = "development"; // process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../../config/config.json')[env];

let sequelize: Sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

const dbTmp = {
  Products: ProductModelFactory(sequelize),
  sequelize: sequelize,
  Sequelize: Sequelize
}

dbTmp.Products.associate(dbTmp);

export const db = dbTmp;