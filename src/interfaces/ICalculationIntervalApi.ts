import { ICalculationInterval } from 'interfaces/ICalculationInterval';

export interface ICalculationIntervalApi {
  get(): Promise<ICalculationInterval>;
  save(intervalMinutes: number): Promise<ICalculationInterval>;
}
