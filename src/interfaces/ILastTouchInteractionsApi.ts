import { ILastTouchInteractionsQuery, ILastTouchInteractionsResponse } from 'interfaces/ILastTouchInteractions';

export interface ILastTouchInteractionsApi {
  list(query: ILastTouchInteractionsQuery): Promise<ILastTouchInteractionsResponse>;
}
