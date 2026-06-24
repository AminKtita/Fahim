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
export const getNutrition     = (days = 30) => api.get(`/nutrition?days=${days}`).then(r => r.data)
export const logNutrition     = (data)      => api.post('/nutrition', data).then(r => r.data)
export const updateNutrition  = (date, data) => api.patch(`/nutrition/${date}`, data).then(r => r.data)
export const deleteNutrition  = (date)      => api.delete(`/nutrition/${date}`).then(r => r.data)

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

// ── Exercise library ─────────────────────────────────────
export const getExerciseLibrary = (q = '') =>
  api.get(`/exercises${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.data)
export const getExercise       = (exerciseId)        => api.get(`/exercises/${exerciseId}`).then(r => r.data)
export const createExercise    = (data)               => api.post('/exercises', data).then(r => r.data)
export const updateExercise    = (exerciseId, data)   => api.patch(`/exercises/${exerciseId}`, data).then(r => r.data)
export const deleteExercise    = (exerciseId)          => api.delete(`/exercises/${exerciseId}`).then(r => r.data)

// ── Exercise images (multi-frame "flicker" animation) ────
const API_ORIGIN = 'http://localhost:8000' // base origin without /api, for /media/* static files

export const getExerciseImages = (exerciseId) =>
  api.get(`/exercises/${exerciseId}/images`).then(r => r.data)

export const uploadExerciseImage = (exerciseId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/exercises/${exerciseId}/images/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const addExerciseImageUrl = (exerciseId, url) =>
  api.post(`/exercises/${exerciseId}/images/url`, { url }).then(r => r.data)

export const reorderExerciseImages = (exerciseId, imageIds) =>
  api.put(`/exercises/${exerciseId}/images/order`, { image_ids: imageIds }).then(r => r.data)

export const deleteExerciseImage = (exerciseId, imageId) =>
  api.delete(`/exercises/${exerciseId}/images/${imageId}`).then(r => r.data)

/**
 * Resolves one exercise_images row (or legacy thumbnail value) into a
 * displayable <img src> value.
 *
 * Input shapes handled:
 *   - null / undefined                               → null
 *   - { source: 'upload', path_or_url: 'file.png' } → full /media/ URL
 *   - { source: 'url',    path_or_url: 'https://…' }→ used as-is
 *   - 'https://…'  (plain string, full URL)          → used as-is
 *   - 'file.png'   (plain string, bare filename)     → prefixed with /media/
 *
 * The plain-string cases arise when old code passed only path_or_url
 * without source; now that both fields are included in all library/plan
 * queries the object form is the norm, but the string fallback is kept
 * for safety.
 */
export const resolveImageSrc = (image) => {
  if (!image) return null
  // object form — the standard shape from exercise_images rows
  if (typeof image === 'object') {
    if (image.source === 'upload') {
      return `${API_ORIGIN}/media/exercise_images/${image.path_or_url}`
    }
    return image.path_or_url ?? null
  }
  // plain string — distinguish a full URL from a bare uploaded filename
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/')) {
    return image
  }
  // bare filename (e.g. 'bench_press_abc123.png') — treat as uploaded file
  return `${API_ORIGIN}/media/exercise_images/${image}`
}
// ── Ingredients ──────────────────────────────────────────
export const getIngredients          = (category) =>
  api.get('/ingredients', { params: category ? { category } : {} }).then(r => r.data)

export const getIngredientCategories = () =>
  api.get('/ingredients/categories').then(r => r.data)

export const createIngredient        = (data) =>
  api.post('/ingredients', data).then(r => r.data)

export const updateIngredient        = (id, data) =>
  api.patch(`/ingredients/${id}`, data).then(r => r.data)

export const deleteIngredient        = (id) =>
  api.delete(`/ingredients/${id}`).then(r => r.data)

// ── Recipes ──────────────────────────────────────────────
export const getRecipes          = (category) =>
  api.get('/recipes', { params: category ? { category } : {} }).then(r => r.data)

export const getRecipeCategories = () =>
  api.get('/recipes/categories').then(r => r.data)

export const getRecipe           = (id) =>
  api.get(`/recipes/${id}`).then(r => r.data)

export const createRecipe        = (data) =>
  api.post('/recipes', data).then(r => r.data)

export const updateRecipe        = (id, data) =>
  api.patch(`/recipes/${id}`, data).then(r => r.data)

export const deleteRecipe        = (id) =>
  api.delete(`/recipes/${id}`).then(r => r.data)

// ── Meal Logs ────────────────────────────────────────────
export const getMeals      = (date) =>
  api.get('/meals', { params: { date } }).then(r => r.data)

export const getMealTotals = (date) =>
  api.get('/meals/totals', { params: { date } }).then(r => r.data)

export const logMeal       = (data) =>
  api.post('/meals', data).then(r => r.data)

export const deleteMeal    = (id, date) =>
  api.delete(`/meals/${id}`, { params: { date } }).then(r => r.data)