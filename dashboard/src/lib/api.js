import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api' })

// ── Profile ──────────────────────────────────────────────
export const getProfile  = ()     => api.get('/profile').then(r => r.data)
export const saveProfile = (data) => api.post('/profile', data).then(r => r.data)

// ── Workouts ─────────────────────────────────────────────
export const getWorkouts        = (days = 30)        => api.get(`/workouts?days=${days}`).then(r => r.data)
export const logWorkout         = (data)             => api.post('/workouts', data).then(r => r.data)
export const updateWorkout      = (id, data)         => api.patch(`/workouts/${id}`, data).then(r => r.data)
export const deleteWorkout      = (id)               => api.delete(`/workouts/${id}`).then(r => r.data)
export const getExerciseHistory = (name, limit = 20) => api.get(`/workouts/exercise/${encodeURIComponent(name)}?limit=${limit}`).then(r => r.data)

// ── Nutrition ────────────────────────────────────────────
export const getNutrition    = (days = 30) => api.get(`/nutrition?days=${days}`).then(r => r.data)
export const logNutrition    = (data)      => api.post('/nutrition', data).then(r => r.data)
export const updateNutrition = (date, data) => api.patch(`/nutrition/${date}`, data).then(r => r.data)
export const deleteNutrition = (date)      => api.delete(`/nutrition/${date}`).then(r => r.data)

// ── Body metrics ─────────────────────────────────────────
export const getLatestMetrics = ()          => api.get('/metrics').then(r => r.data)
export const getWeightTrend   = (days = 90) => api.get(`/metrics/trend?days=${days}`).then(r => r.data)
export const logMetrics       = (data)      => api.post('/metrics', data).then(r => r.data)

// ── Goals ────────────────────────────────────────────────
export const getGoals    = (status = 'active') => api.get(`/goals?status=${status}`).then(r => r.data)
export const createGoal  = (data)              => api.post('/goals', data).then(r => r.data)
export const updateGoal  = (id, data)          => api.patch(`/goals/${id}`, data).then(r => r.data)
export const deleteGoal  = (id)                => api.delete(`/goals/${id}`).then(r => r.data)
export const abandonGoal = (id)                => api.patch(`/goals/${id}`, { status: 'abandoned' }).then(r => r.data)

// ── Daily summary ─────────────────────────────────────────
export const getSummaries = (days = 60) => api.get(`/summary?days=${days}`).then(r => r.data)
export const getStreak    = ()          => api.get('/summary/streak').then(r => r.data)

// ── Plan ─────────────────────────────────────────────────
export const getPlan = () => api.get('/plan').then(r => r.data)