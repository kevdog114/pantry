'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export interface TagsDataObject {
  id?: number
  tagname: string
  taggroup: string
}

export class Tag extends Model<TagsDataObject> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    // define association here
    Tag.belongsToMany(models.Products, { through: "ProductTags" });
    Tag.belongsToMany(models.ProductBarcodes, { through: "ProductBarcodeTags" });
  }
}

export var TagsModelFactory = (sequelize: Sequelize) => {
  Tag.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tagname: DataTypes.STRING,
    taggroup: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Tags',
  });

  return Tag;
};