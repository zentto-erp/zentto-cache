export interface GridLayoutSnapshot {
  updatedAt?: string;
  [key: string]: unknown;
}

export interface GridLayoutRecord {
  companyId: string;
  gridId: string;
  layout: GridLayoutSnapshot;
  updatedAt: string;
  userKey: string;
}
