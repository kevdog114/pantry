'use strict';

import { Model, ModelStatic, Sequelize } from 'sequelize';
import { ProductModelFactory } from './product';
import { FileModelFactory } from './files';
import { StockItemModelFactory } from './stockitem';
import { ProductBarcodeModelFactory } from './productbarcode';
import { TagsModelFactory } from './tags';
import { UserModelFactory } from './user';

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
  Users: UserModelFactory(sequelize),
  Products: ProductModelFactory(sequelize),
  Files: FileModelFactory(sequelize),
  StockItems: StockItemModelFactory(sequelize),
  ProductBarcodes: ProductBarcodeModelFactory(sequelize),
  Tags: TagsModelFactory(sequelize),
  sequelize: sequelize,
  Sequelize: Sequelize
}

export type ModelsType = {
  [Property in keyof typeof dbTmp]: ModelStatic<Model<any, any>>
};

dbTmp.Users.associate(dbTmp as any);
dbTmp.Products.associate(dbTmp as any);
dbTmp.Files.associate(dbTmp as any);
dbTmp.StockItems.associate(dbTmp as any);
dbTmp.ProductBarcodes.associate(dbTmp as any);
dbTmp.Tags.associate(dbTmp as any);

export const db = dbTmp;
