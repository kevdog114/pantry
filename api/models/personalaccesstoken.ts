import { DataTypes, Model, Sequelize } from "sequelize";
import { User } from "./user";

export interface PersonalAccessTokenDataObject {
    id?: number;
    name: string;
    token: string;
    userId: number;
}

export class PersonalAccessToken extends Model<PersonalAccessTokenDataObject> {
    declare id: number;
    declare name: string;
    declare token: string;
    declare userId: number;

    public static associate(models: any) {
    };
}

export const PersonalAccessTokenModelFactory = (sequelize: Sequelize) => {
    PersonalAccessToken.init({
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: DataTypes.INTEGER,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        }
    }, {
        sequelize,
        modelName: 'PersonalAccessToken',
    });

    return PersonalAccessToken;
}
