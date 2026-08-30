import type { MoneyApi } from '../preload/index';

declare global {
  interface Window {
    readonly money: MoneyApi;
  }
}

export {};
