'use strict';

import { Sequelize } from 'sequelize';
import { ProductModelFactory } from './product';
import { FileModelFactory } from './files';
import { StockItemModelFactory } from './stockitem';
import { ProductBarcodeModelFactory } from './productbarcode';
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
  Files: FileModelFactory(sequelize),
  StockItems: StockItemModelFactory(sequelize),
  ProductBarcodes: ProductBarcodeModelFactory(sequelize),
  sequelize: sequelize,
  Sequelize: Sequelize
}

dbTmp.Products.associate(dbTmp);
dbTmp.Files.associate(dbTmp);
dbTmp.StockItems.associate(dbTmp);
dbTmp.ProductBarcodes.associate(dbTmp);

export const db = dbTmp;

