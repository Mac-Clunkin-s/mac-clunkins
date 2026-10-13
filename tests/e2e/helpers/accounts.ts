// Accounts seeded by supabase/seed.sql (see README "Test accounts"). Test-only credentials for a
// local or staging stack; production never has these rows.
export type Role = 'admin' | 'buyer' | 'supplier' | 'driver';

export interface Account {
  email: string;
  password: string;
  role: Role;
  status: 'active' | 'pending';
}

export const ACCOUNTS = {
  admin: { email: 'admin@mccluckins.test', password: 'McCluckins!Admin1', role: 'admin', status: 'active' },
  buyer: { email: 'buyer@mccluckins.test', password: 'McCluckins!Buyer1', role: 'buyer', status: 'active' },
  otherBuyer: { email: 'buyer2@mccluckins.test', password: 'McCluckins!Buyer2', role: 'buyer', status: 'active' },
  supplier: { email: 'supplier@mccluckins.test', password: 'McCluckins!Supp1', role: 'supplier', status: 'active' },
  driver: { email: 'driver@mccluckins.test', password: 'McCluckins!Driver1', role: 'driver', status: 'active' },
  pendingSupplier: {
    email: 'pending-supplier@mccluckins.test',
    password: 'McCluckins!Supp2',
    role: 'supplier',
    status: 'pending',
  },
  pendingDriver: {
    email: 'pending-driver@mccluckins.test',
    password: 'McCluckins!Driver2',
    role: 'driver',
    status: 'pending',
  },
} as const satisfies Record<string, Account>;
