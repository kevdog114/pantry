'use strict';
import { DataTypes, Model, Sequelize } from "sequelize";
import { GenericEntity } from "./helpers/genericEntity";
import { GenericRepo } from "./helpers/genericRepo";
import { ModelsType } from ".";

export interface FileDataObject {
  id: number
  filename: string
}

export interface FileEntity extends GenericEntity<FileEntity, FileDataObject> {

}

export var FileModelFactory = (sequelize: Sequelize): GenericRepo<FileEntity, FileDataObject> => {
  class Files extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: ModelsType) {
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

  return Files as any;
}