'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';


export var ProductBarcodeModelFactory = (sequelize: Sequelize) => {
  class ProductBarcode extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
      ProductBarcode.belongsTo(models.Products);
    }
  }
  ProductBarcode.init({
    ProductId: DataTypes.INTEGER,
    barcode: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ProductBarcode',
  });
  return ProductBarcode;
};