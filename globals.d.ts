export type SweaterVest = {
  version: number;
  counts: {
    tests: number;
    configs: number;
  };
};

declare global {
  interface Window {
    __SWEATER_VEST__: SweaterVest;
  }
}

export {};
