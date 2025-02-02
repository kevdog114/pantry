'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';

export interface ProductEditableEntity {
  title: string;
}

export interface ProductEntity extends ProductEditableEntity {
  id: number
}

export class ProductModelImpl extends Model<ProductEditableEntity> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: any) {
    // define association here

    ProductModelImpl.belongsToMany(models.Files, { through: "ProductFiles" });
    ProductModelImpl.belongsToMany(models.Tags, { through: "ProductTags" });
    ProductModelImpl.hasMany(models.StockItems);
    ProductModelImpl.hasMany(models.ProductBarcodes);
  }
}

export interface ProductRepo
{
  setFiles(files: any[]): Promise<any>
  removeFiles(): Promise<any>
  countFiles(): Promise<number>
  getProductBarcodes(): Promise<any>
  getStockItems(): Promise<any[]>
}

export var ProductModelFactory = (sequelize: Sequelize) : typeof ProductModelImpl => {

  ProductModelImpl.init({
    title: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Product',
  });
  
  return <any>ProductModelImpl;
};
