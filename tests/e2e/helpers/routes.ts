// One place for route paths. Routes marked "planned" are the designed paths for screens that
// are still being built on feature branches; fix them here if the final path differs and every
// spec follows.
export const ROUTES = {
  welcome: '/',
  login: '/login',
  signup: '/signup',
  pending: '/pending',
  // existing
  buyerOrders: '/orders',
  supplierJobs: '/supplier/jobs',
  driverTrips: '/driver/trips',
  adminDashboard: '/admin',
  adminUsers: '/admin/users',
  // planned
  buyerNewOrder: '/orders/new',
  buyerPay: (orderId: string) => `/orders/${orderId}/pay`,
} as const;
