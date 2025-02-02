'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';

export var TagsModelFactory = (sequelize: Sequelize) => {
  class Tags extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models: any) {
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
  return Tags;
};