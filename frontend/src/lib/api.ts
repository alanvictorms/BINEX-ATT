import axios from 'axios'
import { supabase } from './supabase'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Pega o JWT atual do Supabase em cada request -> a SDK ja cuida de renovar antes do expirar.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Quando o backend rejeita por token vencido, forca refresh via Supabase e tenta de novo.
// Se ainda assim falhar, manda pra tela de login.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session) {
        original.headers.Authorization = `Bearer ${data.session.access_token}`
        return api(original)
      }
      await supabase.auth.signOut()
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
