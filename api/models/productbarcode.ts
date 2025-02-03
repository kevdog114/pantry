'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { GenericEntity } from './helpers/genericEntity';
import { GenericRepo } from './helpers/genericRepo';
import { ModelsType } from '.';

export interface ProductBarcodeDataObject {
  id: number
  ProductId: number | string
  barcode: string
  brand: string
  quantity: number
  description: string
}

export interface ProductBarcodeEntity extends GenericEntity<ProductBarcodeEntity, ProductBarcodeDataObject> {
  
}

export var ProductBarcodeModelFactory = (sequelize: Sequelize): GenericRepo<ProductBarcodeEntity, ProductBarcodeDataObject> => {
  class ProductBarcode extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: ModelsType) {
      ProductBarcode.belongsTo(models.Products);
      ProductBarcode.belongsTo(models.ProductBarcodes)
    }
  }
  ProductBarcode.init({
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