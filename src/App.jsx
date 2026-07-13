import { Layout } from "./Components/Layout";
import { Routes, Route } from "react-router-dom";

import { Dashboard, Scheduler, History, Settings, Team } from "./Views";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<History />} />
        <Route path="/schedule/build" element={<Scheduler />} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}