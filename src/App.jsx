import React from "react";
import { Layout } from "./Components/Layout";
import { Routes, Route } from "react-router-dom";

import { Dashboard, Messages, Scheduler, Shifts, Settings, Team } from "./Views";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/team" element={<Team />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}