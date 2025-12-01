import React from "react";
import { Layout } from "./Components/Layout";
import { Routes, Route } from "react-router-dom";
import Team from "./Views/Team";
import Messages from "./Views/Messages";
import Settings from "./Views/Settings";

import { Dashboard } from "./Views/Dashboard";
import { Scheduler } from "./Views/Scheduler";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/team" element={<Team />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}