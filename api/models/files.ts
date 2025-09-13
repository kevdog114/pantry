'use strict';
import { DataTypes, Model, Sequelize } from "sequelize";
import { ModelsType } from ".";

export interface FileDataObject {
  id?: number
  filename: string
}

export class File extends Model<FileDataObject> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    // define association here
    File.belongsToMany(models.Products, { through: models.ProductFiles });
  }
}

export var FileModelFactory = (sequelize: Sequelize) => {
  File.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    filename: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Files',
  });

  return File;
}