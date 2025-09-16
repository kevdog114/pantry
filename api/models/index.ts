'use strict';

import { Model, ModelStatic, Sequelize } from 'sequelize';
import { ProductModelFactory } from './product';
import { FileModelFactory } from './files';
import { StockItemModelFactory } from './stockitem';
import { ProductBarcodeModelFactory } from './productbarcode';
import { ProductFilesModelFactory } from './productfiles';
import { TagsModelFactory } from './tags';
import { UserModelFactory } from './user';
import { RecipeModelFactory } from './recipe';
import { RecipeStepModelFactory } from './recipestep';
import { PersonalAccessTokenModelFactory } from './personalaccesstoken';

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
  ProductFiles: ProductFilesModelFactory(sequelize),
  StockItems: StockItemModelFactory(sequelize),
  ProductBarcodes: ProductBarcodeModelFactory(sequelize),
  Tags: TagsModelFactory(sequelize),
  Recipes: RecipeModelFactory(sequelize),
  RecipeSteps: RecipeStepModelFactory(sequelize),
  PersonalAccessTokens: PersonalAccessTokenModelFactory(sequelize),
  sequelize: sequelize,
  Sequelize: Sequelize
}

export type ModelsType = {
  [Property in keyof typeof dbTmp]: ModelStatic<Model<any, any>>
};

dbTmp.Users.hasMany(dbTmp.PersonalAccessTokens, { foreignKey: 'userId', as: 'personalAccessTokens' });
dbTmp.PersonalAccessTokens.belongsTo(dbTmp.Users, { foreignKey: 'userId', as: 'user' });

export const db = dbTmp;
