import { Navigate } from "react-router-dom";

// Index is the root catch-all; redirect straight to the dashboard.
const Index = () => <Navigate to="/dashboard" replace />;

export default Index;
