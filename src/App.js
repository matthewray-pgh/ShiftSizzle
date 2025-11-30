import React from "react";
import { Routes, Route, Link } from "react-router-dom";

import { Layout } from "./Components/Layout";

function Home() {
  return <h1>Welcome to ShiftSizzle SSR React App!</h1>;
}

function Dashboard() {
  return <h1>Dashboard Page</h1>;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Layout>
  );
}