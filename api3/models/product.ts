'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';

export var ProductModelFactory = (sequelize: Sequelize) => {
  class Product extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
      // define association here
    }
  }
  Product.init({
    title: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Product',
  });
  return Product;
};