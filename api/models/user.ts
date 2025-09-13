import { DataTypes, Model, Sequelize } from "sequelize";
import * as bcrypt from 'bcryptjs';

export interface UserDataObject {
    id?: number;
    username: string;
    password: string;
}

export class User extends Model<UserDataObject> {
    public readonly id!: number;
    public username!: string;
    public password!: string;

    public validPassword(password: string): boolean {
        return bcrypt.compareSync(password, this.password);
    }

    public static associate(models: any) {
    };
}

export const UserModelFactory = (sequelize: Sequelize) => {
    User.init({
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
        sequelize,
        modelName: 'User',
        hooks: {
            beforeCreate: (user: User, options) => {
                if (user.password) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password, salt);
                }
            },
            beforeUpdate: (user: User, options) => {
                if (user.changed('password')) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password as string, salt);
                }
            }
        }
    });

    return User;
}
