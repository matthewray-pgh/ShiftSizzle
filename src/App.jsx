import { Layout } from "./Components/Layout";
import { Routes, Route } from "react-router-dom";

import { Dashboard, Scheduler, History, Settings, Team } from "./Views";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/history" element={<History />} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}