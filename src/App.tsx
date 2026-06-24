import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import LoginScreen from "@/components/LoginScreen";
import Overview from "@/pages/Overview";
import Players from "@/pages/Players";
import PlayerDetail from "@/pages/PlayerDetail";
import Matches from "@/pages/Matches";
import MatchDetail from "@/pages/MatchDetail";
import Economy from "@/pages/Economy";
import SystemHealth from "@/pages/SystemHealth";
import Roadmap from "@/pages/Roadmap";
import Insights from "@/pages/Insights";
import { getSession } from "@/services/auth";

export default function App() {
  const [authed, setAuthed] = useState(() => !!getSession());
  const loc = useLocation();
  useEffect(() => {
    const ok = !!getSession();
    if (ok !== authed) setAuthed(ok);
  }, [loc, authed]);

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/economy" element={<Economy />} />
        <Route path="/health" element={<SystemHealth />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Layout>
  );
}
