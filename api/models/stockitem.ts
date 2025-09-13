'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export interface StockItemDataObject {
  id?: number
  quantity: number
  expiration: Date
  ProductId: number
  ProductBarcodeId: number
  isOpened: boolean
  isFrozen: boolean
  expirationExtensionAfterThaw: number
}

export class StockItem extends Model<StockItemDataObject> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    // define association here
    StockItem.belongsTo(models.Products);
    StockItem.belongsTo(models.ProductBarcodes);
  }
}

export var StockItemModelFactory = (sequelize: Sequelize) => {
  StockItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    quantity: DataTypes.DECIMAL,
    expiration: DataTypes.DATE,
    ProductId: DataTypes.INTEGER,
    ProductBarcodeId: DataTypes.INTEGER,
    isOpened: DataTypes.BOOLEAN,
    isFrozen: DataTypes.BOOLEAN,
    expirationExtensionAfterThaw: DataTypes.NUMBER
  }, {
    sequelize,
    modelName: 'StockItem',
  });

  return StockItem;
}
