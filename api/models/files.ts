'use strict';
import { DataTypes, Model, Sequelize } from "sequelize";

export interface FileEntityEditable {
  filename: string;
}

export interface FileEntity extends FileEntityEditable {
  id: number;
}


export var FileModelFactory = (sequelize: Sequelize) => {
  class Files extends Model<FileEntity, FileEntityEditable> {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
      // define association here
      Files.belongsToMany(models.Products, { through: "ProductFiles" });
    }
  }
  Files.init({
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
  return Files;
}