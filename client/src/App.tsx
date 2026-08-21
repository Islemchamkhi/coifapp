import React from "react";
import { Routes, Route } from "react-router-dom";
import BookingPage from "./pages/BookingPage";
import AdminApp from "./pages/admin/AdminApp";
import ClientAuthPage from "./pages/ClientAuthPage";
import ClientAccountPage from "./pages/ClientAccountPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
      <Route path="/auth" element={<ClientAuthPage />} />
      <Route path="/account" element={<ClientAccountPage />} />
      <Route path="/admin/*" element={<AdminApp />} />
    </Routes>
  );
}
