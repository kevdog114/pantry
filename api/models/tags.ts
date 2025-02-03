'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { GenericEntity } from './helpers/genericEntity';
import { GenericRepo } from './helpers/genericRepo';
import { ModelsType } from '.';

export interface TagsDataObject {
  id: number
  tagname: string
  taggroup: string
}

export interface TagsEntity extends GenericEntity<TagsEntity, TagsDataObject> {

}

export var TagsModelFactory = (sequelize: Sequelize): GenericRepo<TagsEntity, TagsDataObject> => {
  class Tags extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: ModelsType) {
      // define association here
      Tags.belongsToMany(models.Products, { through: "ProductTags" });
    }
  }
  Tags.init({
    tagname: DataTypes.STRING,
    taggroup: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Tags',
  });

  return Tags as any;
};