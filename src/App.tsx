import { Route, Routes } from 'react-router-dom';
import Welcome from './pages/Welcome';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Legal from './pages/Legal';
import PrivacyNotice from './pages/PrivacyNotice';
import NotFound from './pages/NotFound';
import { ProtectedRoute } from './auth/ProtectedRoute';
import BuyerOrders from './pages/buyer/Orders';
import SupplierJobs from './pages/supplier/Jobs';
import DriverTrips from './pages/driver/Trips';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/legal/terms" element={<Legal page="terms" />} />
      <Route path="/legal/refunds" element={<Legal page="refunds" />} />
      <Route path="/legal/privacy" element={<PrivacyNotice />} />

      <Route
        path="/orders"
        element={
          <ProtectedRoute allow={['buyer']}>
            <BuyerOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/supplier/jobs"
        element={
          <ProtectedRoute allow={['supplier']}>
            <SupplierJobs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver/trips"
        element={
          <ProtectedRoute allow={['driver']}>
            <DriverTrips />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allow={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allow={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
