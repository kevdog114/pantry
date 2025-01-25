'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';

export interface ProductEntity {
  title: string;
}

export var ProductModelFactory = (sequelize: Sequelize) => {
  class Product extends Model<ProductEntity> {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
      // define association here

      Product.belongsToMany(models.Files, { through: "ProductFiles" });
      Product.hasMany(models.StockItems);
      Product.hasMany(models.ProductBarcodes);
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