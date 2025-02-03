import { FindOptions } from "sequelize";
import { ModelsType } from "..";


export interface GenericRepo<TModel, TDataObject> {
    associate(models: ModelsType): void;
    findByPk(pk: number | string, findOptions?: FindOptions<TDataObject> | undefined): Promise<TModel>;
    create(entity: Partial<TDataObject>): Promise<TModel>;
    findAll(findOptions?: FindOptions<TDataObject> | undefined): Promise<TModel[]>;
    findOne(findOptions?: FindOptions<TDataObject> | undefined): Promise<TModel[]>;
    
}
