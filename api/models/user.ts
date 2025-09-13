import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";
import * as bcrypt from 'bcryptjs';

export interface UserModel extends Model {
    readonly id: number;
    username: string;
    password?: string;

    validPassword(password: string): boolean;
}

export type UserStatic = typeof Model & {
    new(values?: object, options?: BuildOptions): UserModel;
    associate(models: any): void;
}

export const UserModelFactory = (sequelize: Sequelize) => {
    const User = <UserStatic>sequelize.define("User", {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: DataTypes.INTEGER,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    }, {
        hooks: {
            beforeCreate: (user: UserModel, options) => {
                if (user.password) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password, salt);
                }
            },
            beforeUpdate: (user: UserModel, options) => {
                if (user.changed('password')) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password as string, salt);
                }
            }
        }
    });

    User.prototype.validPassword = function(password: string) {
        return bcrypt.compareSync(password, this.password);
    }

    User.associate = (models) => {
    };

    return User;
}
