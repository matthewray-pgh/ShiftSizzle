import { Layout } from "./Components/Layout";
import { ProtectedRoute } from "./Components/ProtectedRoute";
import { Routes, Route } from "react-router-dom";

import { Dashboard, Scheduler, History, Settings, Team } from "./Views";
import { SignIn, SignUp, AcceptInvite } from "./Views/Auth";

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/schedule" element={<History />} />
                <Route
                  path="/schedule/build"
                  element={
                    <ProtectedRoute allow={["owner", "manager"]}>
                      <Scheduler />
                    </ProtectedRoute>
                  }
                />
                <Route path="/team" element={<Team />} />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute allow={["owner", "manager"]}>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}