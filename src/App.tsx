import { Route, Routes } from 'react-router-dom';
import Welcome from './pages/Welcome';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Legal from './pages/Legal';
import PrivacyNotice from './pages/PrivacyNotice';
import NotFound from './pages/NotFound';
import { buyerRoutes } from './routes/buyerRoutes';
import { supplierRoutes } from './routes/supplierRoutes';
import { driverRoutes } from './routes/driverRoutes';
import { adminRoutes } from './routes/adminRoutes';

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

      {buyerRoutes}
      {supplierRoutes}
      {driverRoutes}
      {adminRoutes}

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
