import { Layout } from "./Components/Layout";
import { ProtectedRoute } from "./Components/ProtectedRoute";
import { HydrationGate } from "./Components/HydrationGate";
import { Routes, Route } from "react-router-dom";

import { Dashboard, Scheduler, History, Settings, Team, Account } from "./Views";
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
            <HydrationGate>
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
                  <Route path="/account" element={<Account />} />
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
            </HydrationGate>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}