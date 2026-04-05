import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import DemoPage from "@/pages/DemoPage";
import AdminPage from "@/pages/AdminPage";
import PrivacyPage from "@/pages/PrivacyPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
