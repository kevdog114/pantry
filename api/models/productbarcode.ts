'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export interface ProductBarcodeDataObject {
  id?: number
  ProductId: number | string
  barcode: string
  brand: string
  quantity: number
  description: string
}

export class ProductBarcode extends Model<ProductBarcodeDataObject> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    ProductBarcode.belongsTo(models.Products);
    ProductBarcode.hasOne(models.StockItems);
  }
}

export var ProductBarcodeModelFactory = (sequelize: Sequelize) => {
  ProductBarcode.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    ProductId: DataTypes.INTEGER,
    barcode: DataTypes.STRING,
    brand: DataTypes.STRING,
    quantity: DataTypes.NUMBER,
    description: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ProductBarcode',
  });
  return ProductBarcode;
};