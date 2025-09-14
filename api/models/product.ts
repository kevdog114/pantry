'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';
import { StockItem } from './stockitem';
import { Tag } from './tags';
import { File } from './files';
import { ProductBarcode } from './productbarcode';

export interface ProductDataObject {
  id?: number
  title: string
  
  /**@description How long a product is good if frozen */
  freezerLifespanDays?: number | null,
  refrigeratorLifespanDays?: number | null,
  openedLifespanDays?: number | null
}

export class Product extends Model<ProductDataObject> {
  public StockItems!: StockItem[];
  public setFiles!: (files: File[]) => Promise<any>;
  public removeFiles!: () => Promise<any>;
  public countFiles!: () => Promise<number>;
  public getProductBarcodes!: () => Promise<ProductBarcode[]>;
  public getStockItems!: () => Promise<StockItem[]>;
  public getTags!: () => Promise<Tag[]>;
  public setTags!: (tags: Tag[]) => Promise<any>;
  public removeTags!: () => Promise<any>;
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    // define association here

    Product.belongsToMany(models.Files, { through: models.ProductFiles });
    Product.belongsToMany(models.Tags, { through: "ProductTags" });
    Product.hasMany(models.StockItems, { foreignKey: 'ProductId' });
    Product.hasMany(models.ProductBarcodes);
  }
}

export var ProductModelFactory = (sequelize: Sequelize) => {

  Product.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: DataTypes.STRING,
    freezerLifespanDays:      { type: DataTypes.NUMBER, allowNull: true },
    refrigeratorLifespanDays: { type: DataTypes.NUMBER, allowNull: true },
    openedLifespanDays:       { type: DataTypes.NUMBER, allowNull: true }
  }, {
    sequelize,
    modelName: 'Product',
  });

  return Product;
};
