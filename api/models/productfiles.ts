'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export var ProductFilesModelFactory = (sequelize: Sequelize) => {
  class ProductFiles extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: ModelsType) {
      // define association here
    }
  }
  ProductFiles.init({
    ProductId: {
      allowNull: false,
      type: DataTypes.INTEGER,
    },
    FileId: {
      allowNull: false,
      type: DataTypes.INTEGER,
    },
  }, {
    sequelize,
    modelName: 'ProductFiles',
  });

  return ProductFiles;
};
