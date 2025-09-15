'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export interface RecipeDataObject {
  id?: number;
  title: string;
  description: string;
  prepTime?: number | null;
  cookTime?: number | null;
  totalTime?: number | null;
  yield?: string | null;
}

export class Recipe extends Model<RecipeDataObject> {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models: ModelsType) {
    Recipe.hasMany(models.RecipeSteps, {
      foreignKey: 'recipeId',
      as: 'steps',
      onDelete: 'CASCADE'
    });
  }
}

export var RecipeModelFactory = (sequelize: Sequelize) => {

  Recipe.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT,
    prepTime: { type: DataTypes.INTEGER, allowNull: true },
    cookTime: { type: DataTypes.INTEGER, allowNull: true },
    totalTime: { type: DataTypes.INTEGER, allowNull: true },
    yield: { type: DataTypes.STRING, allowNull: true },
  }, {
    sequelize,
    modelName: 'Recipe',
  });

  return Recipe;
};
