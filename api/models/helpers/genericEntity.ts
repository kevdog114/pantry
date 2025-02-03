export interface GenericEntity<TModel, TDataObject> {
    dataValues: TDataObject
  
    update(updates: Partial<TDataObject>): Promise<TModel>
    destroy(): Promise<void>;
  }