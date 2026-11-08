import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConnectionPill, useOnline } from './online.tsx';
import { useStudyTimer } from './hooks.ts';
import { TodayPage } from './pages/TodayPage.tsx';
import { PlanPage } from './pages/PlanPage.tsx';
import { CoursePage } from './pages/CoursePage.tsx';
import { ModulePage } from './pages/ModulePage.tsx';
import { LessonsPage } from './pages/LessonsPage.tsx';
import { LessonPage } from './lesson/LessonPage.tsx';
import { ReviewsPage } from './pages/ReviewsPage.tsx';
import { ProgressPage } from './pages/ProgressPage.tsx';
import { VisualizationsPage } from './pages/VisualizationsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TestOutPage } from './pages/TestOutPage.tsx';

const NAV = [
  ['/today', 'Today'],
  ['/course', 'Course'],
  ['/lessons', 'All lessons'],
  ['/plan', 'Study plan'],
  ['/reviews', 'Reviews'],
  ['/progress', 'Progress'],
  ['/visualizations', 'Visualizations'],
  ['/settings', 'Settings'],
] as const;

export function App() {
  const location = useLocation();
  const { online } = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const lessonId = location.pathname.match(/^\/lessons\/([^/]+)/)?.[1] ?? null;
  useStudyTimer(lessonId);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <header className="sidebar">
        <div className="brand-row">
          <NavLink to="/today" className="brand">
            Groundwork
          </NavLink>
          <ConnectionPill />
          <button className="menu-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            Menu
          </button>
        </div>
        <nav className={menuOpen ? 'open' : ''} aria-label="Main">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/lessons"}>
              {label}
            </NavLink>
          ))}
        </nav>
        {online === false && (
          <p className="side-note">
            You're offline. Lessons, quizzes, Python, SQL and local labs all still work.
          </p>
        )}
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/course" element={<CoursePage />} />
          <Route path="/course/:moduleId" element={<ModulePage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/lessons/:id" element={<LessonPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/visualizations" element={<VisualizationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/test-out" element={<TestOutPage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </div>
  );
}
