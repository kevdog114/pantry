'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { GenericEntity } from './helpers/genericEntity';
import { GenericRepo } from './helpers/genericRepo';
import { ModelsType } from '.';

export interface StockItemDataObject {
  id: number
  quantity: number
  expiration: Date
  ProductId: number
  ProductBarcodeId: number
  isOpened: boolean
  isFrozen: boolean
  expirationExtensionAfterThaw: number
}

export interface StockItemEntity extends GenericEntity<StockItemEntity, StockItemDataObject> {
}

export var StockItemModelFactory = (sequelize: Sequelize): GenericRepo<StockItemEntity, StockItemDataObject> => {
  class StockItem extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: ModelsType) {
      // define association here
      StockItem.belongsTo(models.Products);
    }
  }
  StockItem.init({
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

  return StockItem as any;
}
