'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';

export var StockItemModelFactory = (sequelize: Sequelize) => {
  class StockItem extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
      // define association here
      StockItem.belongsTo(models.Products);
    }
  }
  StockItem.init({
    quantity: DataTypes.DECIMAL,
    expiration: DataTypes.DATE,
    ProductId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'StockItem',
  });
  return StockItem;
}
