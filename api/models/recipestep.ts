'use strict';
import { DataTypes, Model, Sequelize } from 'sequelize';
import { ModelsType } from '.';

export interface RecipeStepDataObject {
  id?: number;
  recipeId: number;
  stepNumber: number;
  description: string;
}

export class RecipeStep extends Model<RecipeStepDataObject> {
  static associate(models: ModelsType) {
    RecipeStep.belongsTo(models.Recipes, {
      foreignKey: 'recipeId',
      as: 'recipe'
    });
  }
}

export var RecipeStepModelFactory = (sequelize: Sequelize) => {
  RecipeStep.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    recipeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Recipes',
        key: 'id'
      }
    },
    stepNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'RecipeStep',
  });
  return RecipeStep;
};
