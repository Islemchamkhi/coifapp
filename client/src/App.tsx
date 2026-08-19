import React from "react";
import { Routes, Route } from "react-router-dom";
import BookingPage from "./pages/BookingPage";
import AdminApp from "./pages/admin/AdminApp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
      <Route path="/admin/*" element={<AdminApp />} />
    </Routes>
  );
}
