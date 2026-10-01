import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./components/HomePage";
import { ProPage } from "./components/ProPage";
import { OnboardingPage } from "./components/OnboardingPage";
import { GlobalPreloader } from "./components/GlobalPreloader";
import { SearchResultsPage } from "./components/SearchResultsPage";
import { ProProfilePage } from "./components/ProProfilePage";
import { MyRequestsPage } from "./components/MyRequestsPage";
import { ClientProfilePage } from "./components/ClientProfilePage";
import { VerifyEmail } from "./pages/VerifyEmail";
import { PaymentSuccess } from "./pages/PaymentSuccess";
import { PaymentFailed } from "./pages/PaymentFailed";
import { RouteGuard } from "@/shared/components/RouteGuard";
import { UserRole } from "@/domain/types";

// Dashboard Imports
import { ProDashboardLayout } from "./components/dashboard/ProDashboardLayout";
import { DashboardHome } from "./components/dashboard/DashboardHome";
import { ExploreJobs } from "./components/dashboard/ExploreJobs";
import { MyContacts } from "./components/dashboard/MyContacts";
import { WalletBilling } from "./components/dashboard/WalletBilling";
import { ProProfileSettings } from "./components/dashboard/ProProfileSettings";
import { AdminPanel } from "./components/admin/AdminPanel";
import { AdminClaim } from "./components/admin/AdminClaim";
import { TransferPaymentPage } from "./components/dashboard/TransferPayment";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminDemo } from "./components/admin/AdminDemo";
import { isAdminHost } from './adminHost';

const publicRoutes = [
  {
    element: (
      <>
        <GlobalPreloader />
        <ScrollRestoration />
        <Outlet />
      </>
    ),
    children: [
      {
        path: "/",
        Component: Layout,
        children: [
          { index: true, Component: HomePage },
          { path: "pro", Component: ProPage },
          { path: "search", Component: SearchResultsPage },
          { path: "profile/:id", Component: ProProfilePage },
          {
            path: "mis-solicitudes",
            element: (
              <RouteGuard allowedRoles={[UserRole.CLIENT, UserRole.PROFESSIONAL]}>
                <MyRequestsPage />
              </RouteGuard>
            ),
          },
          {
            path: "mi-perfil",
            element: (
              <RouteGuard allowedRoles={[UserRole.CLIENT, UserRole.PROFESSIONAL]}>
                <ClientProfilePage />
              </RouteGuard>
            ),
          },
        ],
      },
      {
        path: "/onboarding",
        element: (
          <RouteGuard allowedRoles={[UserRole.CLIENT, UserRole.PROFESSIONAL, UserRole.GUEST]}>
            <OnboardingPage />
          </RouteGuard>
        ),
      },
      {
        path: "/verify",
        Component: VerifyEmail,
      },
      {
        path: "/dashboard",
        element: (
          <RouteGuard allowedRoles={[UserRole.PROFESSIONAL]}>
            <ProDashboardLayout />
          </RouteGuard>
        ),
        children: [
          { index: true, Component: DashboardHome },
          { path: "jobs", Component: ExploreJobs },
          { path: "contacts", Component: MyContacts },
          { path: "wallet", Component: WalletBilling },
          { path: "profile", Component: ProProfileSettings },
          { path: "payment-success", Component: PaymentSuccess },
          { path: "payment-failed", Component: PaymentFailed },
          { path: "transfer/:requestId", Component: TransferPaymentPage },
        ]
      },
    ]
  }
];

const adminRoutes = [
  { path: '/claim', Component: AdminClaim },
  { path: '/login', Component: AdminLogin },
  { path: '/demo', Component: AdminDemo },
  { path: '/*', Component: AdminPanel },
];

export const router = createBrowserRouter(isAdminHost() ? adminRoutes : publicRoutes);
