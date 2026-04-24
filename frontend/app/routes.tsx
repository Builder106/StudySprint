import { createBrowserRouter, Navigate, useParams } from "react-router";
import { Landing } from "./components/Landing";
import { Register } from "./components/Register";
import { Dashboard } from "./components/Dashboard";
import { GoalDetailWithPanel } from "./components/GoalDetailWithPanel";
import { NewGoal } from "./components/NewGoal";
import { Analytics } from "./components/Analytics";
import { ProtectedRoute } from "./components/shared/ProtectedRoute";

function RedirectToGoal() {
  const { id } = useParams();
  return <Navigate to={`/goal/${id}`} replace />;
}

export const router = createBrowserRouter([
  { path: "/", Component: Landing },
  { path: "/register", Component: Register },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/goals/new",
    element: (
      <ProtectedRoute>
        <NewGoal />
      </ProtectedRoute>
    ),
  },
  {
    path: "/goal/:id",
    element: (
      <ProtectedRoute>
        <GoalDetailWithPanel />
      </ProtectedRoute>
    ),
  },
  { path: "/goal/:id/details", element: <RedirectToGoal /> },
  {
    path: "/analytics",
    element: (
      <ProtectedRoute>
        <Analytics />
      </ProtectedRoute>
    ),
  },
]);
