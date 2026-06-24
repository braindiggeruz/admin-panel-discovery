import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import Gate from "@/components/Gate";
import Overview from "@/pages/Overview";
import Players from "@/pages/Players";
import PlayerDetail from "@/pages/PlayerDetail";
import Matches from "@/pages/Matches";
import MatchDetail from "@/pages/MatchDetail";
import Economy from "@/pages/Economy";
import SystemHealth from "@/pages/SystemHealth";
import Roadmap from "@/pages/Roadmap";
import { isUnlocked } from "@/lib/gate";

export default function App() {
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const loc = useLocation();
  useEffect(() => {
    setUnlocked(isUnlocked());
  }, [loc]);

  if (!unlocked) return <Gate onUnlocked={() => setUnlocked(true)} />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/economy" element={<Economy />} />
        <Route path="/health" element={<SystemHealth />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Layout>
  );
}
