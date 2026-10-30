import type { Metadata } from "next";
import { AdminLogin } from "./_components/admin-login";

export const metadata: Metadata = {
  title: "Admin · Sign in",
};

export default function AdminLoginPage() {
  return <AdminLogin />;
}
