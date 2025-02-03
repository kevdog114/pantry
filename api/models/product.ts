'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { StockItemEntity } from './stockitem';
import { TagsEntity } from './tags';
import { FileEntity } from './files';
import { GenericEntity } from './helpers/genericEntity';
import { GenericRepo } from './helpers/genericRepo';
import { ModelsType } from '.';

export interface ProductDataObject {
  id: number
  title: string
  
  /**@description How long a product is good if frozen */
  freezerLifespanDays?: number | null,
  refrigeratorLifespanDays?: number | null,
  openedLifespanDays?: number | null
}

export interface ProductEntity extends GenericEntity<ProductEntity, ProductDataObject> {
  StockItems: Array<StockItemEntity>

  setFiles(files: FileEntity[]): Promise<any>
  removeFiles(): Promise<any>
  countFiles(): Promise<number>
  getProductBarcodes(): Promise<any>
  getStockItems(): Promise<StockItemEntity[]>
  getTags(): Promise<TagsEntity[]>
  setTags(tags: TagsEntity[]): Promise<any>
  removeTags(): Promise<any>
}

export class ProductModelImpl extends Model {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    // define association here

    ProductModelImpl.belongsToMany(models.Files, { through: "ProductFiles" });
    ProductModelImpl.belongsToMany(models.Tags, { through: "ProductTags" });
    ProductModelImpl.hasMany(models.StockItems);
    ProductModelImpl.hasMany(models.ProductBarcodes);
  }
}

export var ProductModelFactory = (sequelize: Sequelize): GenericRepo<ProductEntity, ProductDataObject> => {

  ProductModelImpl.init({
    title: DataTypes.STRING,
    freezerLifespanDays:      { type: DataTypes.NUMBER, allowNull: true },
    refrigeratorLifespanDays: { type: DataTypes.NUMBER, allowNull: true },
    openedLifespanDays:       { type: DataTypes.NUMBER, allowNull: true }
  }, {
    sequelize,
    modelName: 'Product',
  });

  return ProductModelImpl as any;
};
