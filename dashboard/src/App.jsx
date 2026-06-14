import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StatusProvider } from './lib/StatusContext'
import { ChatProvider } from './lib/ChatContext'
import Layout       from './components/ui/Layout'
import FloatingChat from './components/ui/FloatingChat'
import Overview  from './pages/Overview'
import Schedule  from './pages/Schedule'
import Workouts  from './pages/Workouts'
import Nutrition from './pages/Nutrition'
import Progress  from './pages/Progress'
import Goals     from './pages/Goals'

export default function App() {
  return (
    <BrowserRouter>
      <StatusProvider>
        <ChatProvider>
          <Layout>
            <Routes>
              <Route path="/"          element={<Overview />}  />
              <Route path="/schedule"  element={<Schedule />}  />
              <Route path="/workouts"  element={<Workouts />}  />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/progress"  element={<Progress />}  />
              <Route path="/goals"     element={<Goals />}     />
            </Routes>
          </Layout>
          <FloatingChat />
        </ChatProvider>
      </StatusProvider>
    </BrowserRouter>
  )
}