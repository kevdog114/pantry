import { DataTypes, Model, Sequelize } from "sequelize";
import * as bcrypt from 'bcryptjs';

export class User extends Model {
    declare id: number;
    declare username: string;
    declare password?: string;

    validPassword(password: string): boolean {
        return bcrypt.compareSync(password, this.password as string);
    }

    static associate(models: any) {
        // define association here
    }
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
        tableName: 'Users',
        hooks: {
            beforeCreate: (user: User) => {
                if (user.password) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password, salt);
                }
            },
            beforeUpdate: (user: User) => {
                if (user.changed('password')) {
                    const salt = bcrypt.genSaltSync(10);
                    user.password = bcrypt.hashSync(user.password as string, salt);
                }
            }
        }
    });

    return User;
};
